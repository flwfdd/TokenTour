import { useMemo, useState } from "react";
import Pane from "./Pane";
import { useKvSnapshot, useLensView } from "./lensHooks";
import { useConversation } from "./store";
import { formatBytes, listModels } from "./lib/modelRegistry";
import type { CellState } from "./lib/kvSim";
import { cellStateAt } from "./lib/kvSim";
import type { TokenInfo, TokenSegment } from "./lib/types";
import { SEG_ROLE_VAR, deriveHoverRole, matchesHover, tintSurfaceStyle } from "./visual";
import RoleLegend, { countBySegment } from "./RoleLegend";
import { useLang } from "./i18n";
import { segmentLabel, type Lang } from "./locale";

const STATE_COLOR_VAR: Record<CellState, string> = {
  reused: "--color-kv-reused",
  prefill: "--color-kv-prefill",
  decode: "--color-kv-decode",
  pending: "--color-border",
};

const STATE_LABEL: Record<Lang, Record<CellState, string>> = {
  en: {
    reused: "cached input",
    prefill: "uncached input",
    decode: "output",
    pending: "unused",
  },
  zh: {
    reused: "缓存命中输入",
    prefill: "缓存未命中输入",
    decode: "输出",
    pending: "未占用",
  },
};

const kvCopy = {
  en: {
    modelTitle:
      "Choose the imaginary architecture. It affects KV cache layer/head/headDim/dtype estimates and the template family tied to this model description. It is decoupled from the API model you actually call.",
    ctxTitle: "Demo context window size. Affects percentages and the capacity bar; capped by the model's real maxContext.",
    roleLabel: "Roles:",
    kvState: "KV cache state",
    eachCell: "each cell =",
    cells: "cells",
    totalTokens: "total tokens",
    kvMemory: "KV memory",
    fullWindow: "full window",
    perTokenKv: "per-token KV",
    contextUsage: "context window usage",
    noTokens: "No tokens",
    noKv: "No KV cache",
  },
  zh: {
    modelTitle:
      "选择“假想架构”。会同时影响：① KV cache 的层数/头数/headDim/dtype 估算；② chat template 家族（因为 family 字段绑在同一份模型描述里）。和实际调用的 API 模型解耦。",
    ctxTitle: "演示用的总上下文窗口大小（影响百分比和容量条），与模型真实 maxContext 取最小",
    roleLabel: "角色:",
    kvState: "KV cache 状态",
    eachCell: "每方格 =",
    cells: "格",
    totalTokens: "总 tokens",
    kvMemory: "KV 内存",
    fullWindow: "满窗口",
    perTokenKv: "每 token KV",
    contextUsage: "上下文窗口占用",
    noTokens: "无 tokens",
    noKv: "无 KV cache",
  },
} as const;

/** Above ~ this many tokens, the KV cell grid switches from per-token to bucketed cells. */
const MAX_KV_CELLS = 512;

interface RoleSegment {
  /** start token index (inclusive) */
  start: number;
  /** end token index (exclusive) */
  end: number;
  segment: TokenSegment;
  messageId?: string;
  /** set of KV states the tokens in this role-run fall into */
  states: Set<CellState>;
}

interface KvCell {
  /** start token index (inclusive) */
  start: number;
  /** end token index (exclusive) */
  end: number;
  /** dominant state in this cell */
  state: CellState;
  /** dominant segment (for hover dim-match) */
  segment: TokenSegment;
  /** dominant message id (if any) */
  messageId?: string;
}

export default function LensContextKv() {
  const lang = useLang();
  const copy = kvCopy[lang];
  const view = useLensView();
  const snapshot = useKvSnapshot();
  const hoverTokenIndex = useConversation((s) => s.hoverTokenIndex);
  const hoverRole = useConversation((s) => s.hoverRole);
  const hoverMessageId = useConversation((s) => s.hoverMessageId);
  const setHoverFromToken = useConversation((s) => s.setHoverFromToken);
  const setHoverRole = useConversation((s) => s.setHoverRole);
  const setHoverMessage = useConversation((s) => s.setHoverMessage);
  const contextLimitOverride = useConversation((s) => s.contextLimitOverride);
  const setContextLimitOverride = useConversation((s) => s.setContextLimitOverride);
  const modelKey = useConversation((s) => s.modelKey);
  const setModelKey = useConversation((s) => s.setModelKey);
  const [hoverState, setHoverState] = useState<CellState | null>(null);

  const total = snapshot.totalLen;
  const realToken = view.tokens.length;
  const limit = Math.min(contextLimitOverride, view.arch.maxContext);
  const perTok = snapshot.perTokenBytes;
  const totalBytes = snapshot.totalBytes;
  const limitBytes = perTok * limit;
  const ctxPct = limit > 0 ? Math.min(100, (total / limit) * 100) : 0;

  const segCounts = useMemo(() => countBySegment(view.tokens), [view.tokens]);

  // Top bar: contiguous same-(segment, messageId) groups.
  const roleSegments = useMemo<RoleSegment[]>(
    () => buildRoleSegments(view.tokens, total, snapshot),
    [view.tokens, total, snapshot],
  );

  // Bottom strip: one rectangular cell per token (or per small bucket when total is huge).
  const kvCells = useMemo<KvCell[]>(
    () => buildKvCells(view.tokens, snapshot, realToken),
    [view.tokens, snapshot, realToken],
  );

  // When something else (template / tokens / messages / KV grid) hovers a
  // specific token, derive the set of "active" KV states and the role chip
  // from it so every Context-panel surface lights up consistently. Rules:
  //
  //   * Explicit `hoverState` (clicking a legend state chip) wins → set = {it}.
  //   * Specific token hover → set = {cellStateAt(token)}.
  //   * Role/message hover (no token) → set = every state that has at least
  //     one token of that role/message. This makes the KV-state tiles and
  //     chips light up when the user hovers e.g. "user" in the role bar,
  //     showing that user tokens span both `reused` and `prefill` (or
  //     whatever combination actually applies).
  const activeStates: Set<CellState> = useMemo(() => {
    if (hoverState != null) return new Set([hoverState]);
    if (hoverTokenIndex != null && hoverTokenIndex < view.tokens.length) {
      return new Set([cellStateAt(snapshot, hoverTokenIndex)]);
    }
    if (hoverMessageId != null) {
      const out = new Set<CellState>();
      view.tokens.forEach((t, i) => {
        if (t.messageId === hoverMessageId) out.add(cellStateAt(snapshot, i));
      });
      return out;
    }
    if (hoverRole != null) {
      const out = new Set<CellState>();
      view.tokens.forEach((t, i) => {
        if (t.segment === hoverRole) out.add(cellStateAt(snapshot, i));
      });
      return out;
    }
    return new Set();
  }, [hoverState, hoverTokenIndex, hoverRole, hoverMessageId, snapshot, view.tokens]);

  // Effective hover role for legend / role-strip highlighting; see
  // `deriveHoverRole` for the precedence rules.
  const derivedHoverRole: string | null = useMemo(
    () =>
      deriveHoverRole({
        hoverRole,
        hoverTokenIndex,
        hoverMessageId,
        tokens: view.tokens,
        messages: view.messages,
      }),
    [hoverRole, hoverTokenIndex, hoverMessageId, view.tokens, view.messages],
  );

  return (
    <Pane
      title="Context × KV Cache"
      paneId="kv"
      subtitle={
        <span>
          {total.toLocaleString()} tok ·{" "}
          {lang === "zh"
            ? `${ctxPct.toFixed(1)}% / ${limit.toLocaleString()}`
            : `${ctxPct.toFixed(1)}% of ${limit.toLocaleString()}`}{" "}
          ·{" "}
          {formatBytes(totalBytes)} KV
        </span>
      }
      controls={
        <>
          <select
            value={modelKey}
            onChange={(e) => setModelKey(e.target.value)}
            className="text-[11px] py-0.5 px-1.5 max-w-[24ch] truncate"
            title={copy.modelTitle}
          >
            {listModels().map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <label
            className="text-[11px] text-(--color-muted) flex items-center gap-1"
            title={copy.ctxTitle}
          >
            ctx
            <input
              type="number"
              min={64}
              step={64}
              value={contextLimitOverride}
              onChange={(e) => setContextLimitOverride(Number(e.target.value))}
              className="w-20 text-[11px] py-0.5 px-1"
            />
          </label>
        </>
      }
      className="col-span-2"
    >
      <div className="flex h-full min-h-0 flex-col gap-2 px-3 py-2.5">
        <StatRow
          snapshot={snapshot}
          ctxPct={ctxPct}
          limitBytes={limitBytes}
          arch={view.arch}
          activeStates={activeStates}
          lang={lang}
          onHoverState={(s) => {
            setHoverState(s);
            if (s != null) setHoverRole(null);
          }}
        />

        <ContextTrack ctxPct={ctxPct} lang={lang} />

        <div className="flex flex-col gap-1.5">
          <RoleLegend
            counts={segCounts}
            hoverRole={derivedHoverRole}
            onHoverChange={(seg) => {
              setHoverRole(seg);
              setHoverMessage(null);
              if (seg != null) setHoverState(null);
            }}
            label={copy.roleLabel}
            lang={lang}
          />
          <RoleStackedBar
            segments={roleSegments}
            total={total}
            hoverRole={derivedHoverRole}
            hoverMessageId={hoverMessageId}
            activeStates={activeStates}
            lang={lang}
            onHoverRole={(r) => {
              setHoverRole(r);
              setHoverMessage(null);
            }}
            onHoverMessage={(id) => {
              setHoverMessage(id);
              setHoverRole(null);
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] text-(--color-muted)">
            <span>
              {copy.kvState}（{copy.eachCell}{" "}
              {kvCells[0] && kvCells[0].end - kvCells[0].start > 1
                ? `~${kvCells[0].end - kvCells[0].start} tokens`
                : "1 token"}
              ）
            </span>
            <span className="font-mono">{total.toLocaleString()} {copy.cells}</span>
          </div>
          <KvCellGrid
            cells={kvCells}
            tokens={view.tokens}
            hoverTokenIndex={hoverTokenIndex}
            hoverRole={derivedHoverRole}
            hoverMessageId={hoverMessageId}
            activeStates={activeStates}
            lang={lang}
            onHover={setHoverFromToken}
          />
          <PositionAxis total={total} />
        </div>
      </div>
    </Pane>
  );
}

function StatRow({
  snapshot,
  ctxPct,
  limitBytes,
  arch,
  activeStates,
  lang,
  onHoverState,
}: {
  snapshot: ReturnType<typeof useKvSnapshot>;
  ctxPct: number;
  limitBytes: number;
  arch: ReturnType<typeof useLensView>["arch"];
  activeStates: Set<CellState>;
  lang: Lang;
  onHoverState: (s: CellState | null) => void;
}) {
  const copy = kvCopy[lang];
  const stateLabel = STATE_LABEL[lang];
  const perTok = snapshot.perTokenBytes;
  return (
    <div
      className="grid grid-cols-6 gap-2 text-[11px]"
      onMouseLeave={() => onHoverState(null)}
    >
      <Tile
        label={copy.totalTokens}
        value={snapshot.totalLen.toLocaleString()}
        hint={lang === "zh" ? `${ctxPct.toFixed(1)}% 窗口` : `${ctxPct.toFixed(1)}% of window`}
      />
      <Tile
        label={stateLabel.reused}
        value={snapshot.reusedPrefix.toLocaleString()}
        hint={formatBytes(perTok * snapshot.reusedPrefix)}
        colorVar={STATE_COLOR_VAR.reused}
        active={activeStates.has("reused")}
        state="reused"
        onHoverState={onHoverState}
      />
      <Tile
        label={stateLabel.prefill}
        value={snapshot.prefillNew.toLocaleString()}
        hint={formatBytes(perTok * snapshot.prefillNew)}
        colorVar={STATE_COLOR_VAR.prefill}
        active={activeStates.has("prefill")}
        state="prefill"
        onHoverState={onHoverState}
      />
      <Tile
        label={stateLabel.decode}
        value={snapshot.decodeAppended.toLocaleString()}
        hint={formatBytes(perTok * snapshot.decodeAppended)}
        colorVar={STATE_COLOR_VAR.decode}
        active={activeStates.has("decode")}
        state="decode"
        onHoverState={onHoverState}
      />
      <Tile
        label={copy.kvMemory}
        value={formatBytes(snapshot.totalBytes)}
        hint={`/ ${formatBytes(limitBytes)} ${copy.fullWindow}`}
      />
      <Tile
        label={copy.perTokenKv}
        value={formatBytes(perTok)}
        hint={`L=${arch.numLayers} · KV_H=${arch.numKvHeads}`}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  colorVar,
  active,
  state,
  onHoverState,
}: {
  label: string;
  value: string;
  hint?: string;
  colorVar?: string;
  active?: boolean;
  state?: CellState;
  onHoverState?: (s: CellState | null) => void;
}) {
  const interactive = !!colorVar && !!state && !!onHoverState;
  return (
    <div
      className="rounded-[0.6rem] px-2.5 py-1.5"
      onMouseEnter={interactive ? () => onHoverState!(state!) : undefined}
      style={
        active && colorVar
          ? { ...tintSurfaceStyle(colorVar, { hovered: true }), boxShadow: "var(--pg-shadow)" }
          : { backgroundColor: "var(--pg-tile)", boxShadow: "var(--pg-shadow)" }
      }
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-(--color-ink-soft)">
        {colorVar && (
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-sm"
            style={{ backgroundColor: `var(${colorVar})` }}
          />
        )}
        <span className="truncate">{label}</span>
      </div>
      <div className="font-mono text-[13px]">{value}</div>
      {hint && <div className="text-[10px] text-(--color-muted)">{hint}</div>}
    </div>
  );
}

function ContextTrack({ ctxPct, lang }: { ctxPct: number; lang: Lang }) {
  const copy = kvCopy[lang];
  const color =
    ctxPct >= 100
      ? "var(--color-danger)"
      : ctxPct >= 80
        ? "var(--color-warn)"
        : "var(--color-accent)";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-(--color-muted)">
        <span>{copy.contextUsage}</span>
        <span className="font-mono">{ctxPct.toFixed(2)}%</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-(--pg-desk)">
        <div
          className="absolute inset-y-0 left-0 transition-all"
          style={{ width: `${ctxPct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function RoleStackedBar({
  segments,
  total,
  hoverRole,
  hoverMessageId,
  activeStates,
  lang,
  onHoverRole,
  onHoverMessage,
}: {
  segments: RoleSegment[];
  total: number;
  hoverRole: string | null;
  hoverMessageId: string | null;
  activeStates: Set<CellState>;
  lang: Lang;
  onHoverRole: (r: string | null) => void;
  onHoverMessage: (id: string | null) => void;
}) {
  const copy = kvCopy[lang];
  if (segments.length === 0 || total === 0) {
    return (
      <div className="grid h-6 place-items-center rounded-md bg-(--color-surface-2) text-[10px] text-(--color-muted)">
        {copy.noTokens}
      </div>
    );
  }
  return (
    <div
      className="flex h-6 w-full overflow-hidden rounded-md bg-(--color-surface-2)"
      onMouseLeave={() => {
        onHoverRole(null);
        onHoverMessage(null);
      }}
    >
      {segments.map((s, i) => {
        const w = ((s.end - s.start) / total) * 100;
        const match = matchesHover(
          { segment: s.segment, messageId: s.messageId },
          hoverRole,
          hoverMessageId,
        );
        // When a KV state is active (e.g. hovering a state tile), light up only
        // the role runs that actually contain a token in that state.
        const stateMatch =
          activeStates.size === 0 || [...s.states].some((st) => activeStates.has(st));
        const dim =
          ((hoverRole != null || hoverMessageId != null) && !match) ||
          (activeStates.size > 0 && !stateMatch);
        const onEnter = () => {
          if (s.messageId) onHoverMessage(s.messageId);
          else onHoverRole(s.segment);
        };
        return (
          <div
            key={i}
            onMouseEnter={onEnter}
            className="cursor-pointer transition-opacity"
            style={{
              width: `${w}%`,
              minWidth: 2,
              // Same hue, lifted in lightness + slightly softened chroma so the
              // strip reads light but still clearly colored.
              backgroundColor: `oklch(from var(${SEG_ROLE_VAR[s.segment]}) 0.82 calc(c * 0.72) h)`,
              opacity: dim ? 0.25 : 1,
              borderRight:
                i < segments.length - 1
                  ? "1px solid color-mix(in oklch, var(--color-bg) 50%, transparent)"
                  : undefined,
            }}
            title={`${segmentLabel(lang, s.segment)} · pos ${s.start}-${s.end - 1} · ${s.end - s.start} tok`}
          />
        );
      })}
    </div>
  );
}

function KvCellGrid({
  cells,
  tokens,
  hoverTokenIndex,
  hoverRole,
  hoverMessageId,
  activeStates,
  lang,
  onHover,
}: {
  cells: KvCell[];
  tokens: TokenInfo[];
  hoverTokenIndex: number | null;
  hoverRole: string | null;
  hoverMessageId: string | null;
  activeStates: Set<CellState>;
  lang: Lang;
  onHover: (
    t: { position: number; segment?: string; messageId?: string } | null,
  ) => void;
}) {
  const copy = kvCopy[lang];
  const stateLabel = STATE_LABEL[lang];
  if (cells.length === 0) {
    return (
      <div className="grid h-7 place-items-center rounded-md bg-(--color-surface-2) text-[10px] text-(--color-muted)">
        {copy.noKv}
      </div>
    );
  }
  const total = cells[cells.length - 1]!.end;
  return (
    <div
      // Same wrapper styling as RoleStackedBar so percentages align 1:1.
      className="flex h-7 w-full overflow-hidden rounded-md bg-(--color-surface-2)"
      onMouseLeave={() => onHover(null)}
    >
      {cells.map((c, i) => {
        const w = ((c.end - c.start) / total) * 100;
        const isHovered =
          hoverTokenIndex != null &&
          hoverTokenIndex >= c.start &&
          hoverTokenIndex < c.end;
        const matchSeg = matchesHover(
          { segment: c.segment, messageId: c.messageId },
          hoverRole,
          hoverMessageId,
        );
        const matchState = activeStates.size === 0 || activeStates.has(c.state);
        const anyHover = hoverRole != null || hoverMessageId != null || activeStates.size > 0;
        const dim = anyHover && (!matchSeg || !matchState);
        const startTok = tokens[c.start];
        return (
          <div
            key={c.start}
            data-pos={c.start}
            data-seg={c.segment}
            data-msgid={c.messageId ?? ""}
            onMouseEnter={() =>
              onHover(
                startTok ?? {
                  position: c.start,
                  segment: c.segment,
                  messageId: c.messageId,
                },
              )
            }
            className="cursor-crosshair"
            style={{
              width: `${w}%`,
              minWidth: 1,
              // Same hue, lifted lightness + slightly softened chroma; `pending` keeps its edge.
              backgroundColor:
                c.state === "pending"
                  ? "var(--color-border)"
                  : `oklch(from var(${STATE_COLOR_VAR[c.state]}) 0.82 calc(c * 0.72) h)`,
              opacity: dim && !isHovered ? 0.2 : 1,
              boxShadow: isHovered
                ? "inset 0 0 0 2px color-mix(in oklch, var(--color-ink) 55%, transparent)"
                : undefined,
              borderRight:
                i < cells.length - 1
                  ? "1px solid color-mix(in oklch, var(--color-bg) 50%, transparent)"
                  : undefined,
            }}
            title={`pos ${c.start}${c.end - c.start > 1 ? `-${c.end - 1}` : ""} · ${stateLabel[c.state]}`}
          />
        );
      })}
    </div>
  );
}

function PositionAxis({ total }: { total: number }) {
  if (total === 0) return null;
  const ticks = 5;
  const marks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((i * (total - 1)) / ticks));
  return (
    <div className="flex justify-between font-mono text-[9px] text-(--color-muted)">
      {marks.map((m, i) => (
        <span key={i}>{m}</span>
      ))}
    </div>
  );
}

function buildRoleSegments(
  tokens: TokenInfo[],
  total: number,
  snapshot: ReturnType<typeof useKvSnapshot>,
): RoleSegment[] {
  if (total === 0) return [];
  const realLen = tokens.length;
  // Positions beyond the tokenized template represent decode-appended output,
  // which conceptually belongs to the assistant role even though we never
  // re-tokenized that streamed text.
  const segOf = (i: number): TokenSegment =>
    i < realLen ? (tokens[i]!.segment as TokenSegment) : "assistant";
  const idOf = (i: number): string | undefined =>
    i < realLen ? tokens[i]!.messageId : undefined;

  const segs: RoleSegment[] = [];
  let start = 0;
  let curSeg: TokenSegment = segOf(0);
  let curId: string | undefined = idOf(0);
  let curStates = new Set<CellState>([cellStateAt(snapshot, 0)]);
  for (let i = 1; i < total; i++) {
    const seg = segOf(i);
    const id = idOf(i);
    if (seg !== curSeg || id !== curId) {
      segs.push({ start, end: i, segment: curSeg, messageId: curId, states: curStates });
      start = i;
      curSeg = seg;
      curId = id;
      curStates = new Set();
    }
    curStates.add(cellStateAt(snapshot, i));
  }
  segs.push({ start, end: total, segment: curSeg, messageId: curId, states: curStates });
  return segs;
}

function buildKvCells(
  tokens: TokenInfo[],
  snapshot: ReturnType<typeof useKvSnapshot>,
  realLen: number,
): KvCell[] {
  const total = snapshot.totalLen;
  if (total === 0) return [];
  const bucketSize = total > MAX_KV_CELLS ? Math.ceil(total / MAX_KV_CELLS) : 1;
  const cells: KvCell[] = [];

  for (let i = 0; i < total; i += bucketSize) {
    const end = Math.min(i + bucketSize, total);
    const segCounts = new Map<TokenSegment, number>();
    const stateCounts = new Map<CellState, number>();
    const idCounts = new Map<string, number>();
    for (let j = i; j < end; j++) {
      const tok = j < realLen ? tokens[j] : undefined;
      const seg: TokenSegment = tok?.segment ?? "assistant";
      const st = cellStateAt(snapshot, j);
      segCounts.set(seg, (segCounts.get(seg) ?? 0) + 1);
      stateCounts.set(st, (stateCounts.get(st) ?? 0) + 1);
      if (tok?.messageId) idCounts.set(tok.messageId, (idCounts.get(tok.messageId) ?? 0) + 1);
    }
    cells.push({
      start: i,
      end,
      segment: topKey(segCounts, "assistant" as TokenSegment),
      state: topKey(stateCounts, "pending" as CellState),
      messageId: idCounts.size ? topKey(idCounts, "") : undefined,
    });
  }
  return cells;
}

function topKey<K>(counts: Map<K, number>, fallback: K): K {
  let best: K = fallback;
  let bestN = -1;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}
