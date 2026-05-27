import { useMemo, useState } from "react";
import Pane from "./Pane";
import { useKvSnapshot, useLensView } from "./lensHooks";
import { useConversation } from "./store";
import { formatBytes, listModels } from "./lib/modelRegistry";
import type { CellState } from "./lib/kvSim";
import { cellStateAt } from "./lib/kvSim";
import type { TokenInfo, TokenSegment } from "./lib/types";
import { SEG_LABEL, SEG_ROLE_VAR, deriveHoverRole, matchesHover } from "./visual";
import RoleLegend, { countBySegment } from "./RoleLegend";

const STATE_COLOR_VAR: Record<CellState, string> = {
  reused: "--color-kv-reused",
  prefill: "--color-kv-prefill",
  decode: "--color-kv-decode",
  pending: "--color-border",
};

const STATE_LABEL: Record<CellState, string> = {
  reused: "缓存命中输入",
  prefill: "缓存未命中输入",
  decode: "输出",
  pending: "未占用",
};

/** Above ~ this many tokens, the KV cell grid switches from per-token to bucketed cells. */
const MAX_KV_CELLS = 512;

interface RoleSegment {
  /** start token index (inclusive) */
  start: number;
  /** end token index (exclusive) */
  end: number;
  segment: TokenSegment;
  messageId?: string;
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
    () => buildRoleSegments(view.tokens, total),
    [view.tokens, total],
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
          {total.toLocaleString()} tok · {ctxPct.toFixed(1)}% of {limit.toLocaleString()} ·{" "}
          {formatBytes(totalBytes)} KV
        </span>
      }
      controls={
        <>
          <select
            value={modelKey}
            onChange={(e) => setModelKey(e.target.value)}
            className="text-[11px] py-0.5 px-1.5 max-w-[24ch] truncate"
            title="选择'假想架构'。会同时影响：① KV cache 的层数/头数/headDim/dtype 估算；② chat template 家族（因为 family 字段绑在同一份模型描述里）。和实际调用的 API 模型解耦。"
          >
            {listModels().map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <label
            className="text-[11px] text-(--color-muted) flex items-center gap-1"
            title="演示用的总上下文窗口大小（影响百分比和容量条），与模型真实 maxContext 取最小"
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
      <div className="flex h-full min-h-0 flex-col gap-2 p-3">
        <StatRow
          snapshot={snapshot}
          ctxPct={ctxPct}
          limitBytes={limitBytes}
          arch={view.arch}
          activeStates={activeStates}
        />

        <ContextTrack ctxPct={ctxPct} />

        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] text-(--color-muted)">
            角色分布（按序列顺序聚合相邻同源 tokens）
          </div>
          <RoleStackedBar
            segments={roleSegments}
            total={total}
            hoverRole={derivedHoverRole}
            hoverMessageId={hoverMessageId}
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
              KV cache 状态（每方格 ={" "}
              {kvCells[0] && kvCells[0].end - kvCells[0].start > 1
                ? `~${kvCells[0].end - kvCells[0].start} tokens`
                : "1 token"}
              ）
            </span>
            <span className="font-mono">{total.toLocaleString()} 格</span>
          </div>
          <KvCellGrid
            cells={kvCells}
            tokens={view.tokens}
            hoverTokenIndex={hoverTokenIndex}
            hoverRole={derivedHoverRole}
            hoverMessageId={hoverMessageId}
            activeStates={activeStates}
            onHover={setHoverFromToken}
          />
          <PositionAxis total={total} />
        </div>

        <DualLegend
          snapshot={snapshot}
          segCounts={segCounts}
          decodeAppended={view.decodeAppended}
          hoverRole={derivedHoverRole}
          activeStates={activeStates}
          pinnedState={hoverState}
          setHoverRole={(r) => {
            setHoverRole(r);
            setHoverMessage(null);
          }}
          setHoverState={setHoverState}
        />
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
}: {
  snapshot: ReturnType<typeof useKvSnapshot>;
  ctxPct: number;
  limitBytes: number;
  arch: ReturnType<typeof useLensView>["arch"];
  activeStates: Set<CellState>;
}) {
  const perTok = snapshot.perTokenBytes;
  return (
    <div className="grid grid-cols-6 gap-2 text-[11px]">
      <Tile
        label="总 tokens"
        value={snapshot.totalLen.toLocaleString()}
        hint={`${ctxPct.toFixed(1)}% of window`}
      />
      <Tile
        label={STATE_LABEL.reused}
        value={snapshot.reusedPrefix.toLocaleString()}
        hint={formatBytes(perTok * snapshot.reusedPrefix)}
        colorVar={STATE_COLOR_VAR.reused}
        active={activeStates.has("reused")}
      />
      <Tile
        label={STATE_LABEL.prefill}
        value={snapshot.prefillNew.toLocaleString()}
        hint={formatBytes(perTok * snapshot.prefillNew)}
        colorVar={STATE_COLOR_VAR.prefill}
        active={activeStates.has("prefill")}
      />
      <Tile
        label={STATE_LABEL.decode}
        value={snapshot.decodeAppended.toLocaleString()}
        hint={formatBytes(perTok * snapshot.decodeAppended)}
        colorVar={STATE_COLOR_VAR.decode}
        active={activeStates.has("decode")}
      />
      <Tile
        label="KV 内存"
        value={formatBytes(snapshot.totalBytes)}
        hint={`/ ${formatBytes(limitBytes)} 满窗口`}
      />
      <Tile
        label="每 token KV"
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
}: {
  label: string;
  value: string;
  hint?: string;
  colorVar?: string;
  active?: boolean;
}) {
  return (
    <div
      className="rounded-md border px-2 py-1 transition-colors"
      style={{
        borderColor:
          active && colorVar ? `var(${colorVar})` : "var(--color-border)",
        backgroundColor:
          active && colorVar
            ? `color-mix(in oklch, var(${colorVar}) 18%, transparent)`
            : "color-mix(in oklch, var(--color-bg) 30%, transparent)",
        borderLeftWidth: colorVar ? 3 : 1,
        borderLeftColor: colorVar ? `var(${colorVar})` : "var(--color-border)",
      }}
    >
      <div className="text-[10px] uppercase tracking-wider text-(--color-muted)">{label}</div>
      <div className="font-mono text-[13px]">{value}</div>
      {hint && <div className="text-[10px] text-(--color-muted)">{hint}</div>}
    </div>
  );
}

function ContextTrack({ ctxPct }: { ctxPct: number }) {
  const color =
    ctxPct >= 100
      ? "var(--color-danger)"
      : ctxPct >= 80
        ? "var(--color-warn)"
        : "var(--color-accent)";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-(--color-muted)">
        <span>上下文窗口占用</span>
        <span className="font-mono">{ctxPct.toFixed(2)}%</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-(--color-surface-2)">
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
  onHoverRole,
  onHoverMessage,
}: {
  segments: RoleSegment[];
  total: number;
  hoverRole: string | null;
  hoverMessageId: string | null;
  onHoverRole: (r: string | null) => void;
  onHoverMessage: (id: string | null) => void;
}) {
  if (segments.length === 0 || total === 0) {
    return (
      <div className="grid h-6 place-items-center rounded-md border border-(--color-border) text-[10px] text-(--color-muted)">
        无 tokens
      </div>
    );
  }
  return (
    <div
      className="flex h-6 w-full overflow-hidden rounded-md border border-(--color-border) bg-(--color-bg)/30"
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
        const dim = (hoverRole != null || hoverMessageId != null) && !match;
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
              backgroundColor: `var(${SEG_ROLE_VAR[s.segment]})`,
              opacity: dim ? 0.25 : 1,
              borderRight:
                i < segments.length - 1
                  ? "1px solid color-mix(in oklch, var(--color-bg) 50%, transparent)"
                  : undefined,
            }}
            title={`${SEG_LABEL[s.segment]} · pos ${s.start}-${s.end - 1} · ${s.end - s.start} tok`}
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
  onHover,
}: {
  cells: KvCell[];
  tokens: TokenInfo[];
  hoverTokenIndex: number | null;
  hoverRole: string | null;
  hoverMessageId: string | null;
  activeStates: Set<CellState>;
  onHover: (
    t: { position: number; segment?: string; messageId?: string } | null,
  ) => void;
}) {
  if (cells.length === 0) {
    return (
      <div className="grid h-7 place-items-center rounded-md border border-(--color-border) text-[10px] text-(--color-muted)">
        无 KV cache
      </div>
    );
  }
  const total = cells[cells.length - 1]!.end;
  return (
    <div
      // Same wrapper styling as RoleStackedBar so percentages align 1:1.
      className="flex h-7 w-full overflow-hidden rounded-md border border-(--color-border) bg-(--color-bg)/30"
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
            className="cursor-crosshair transition-opacity"
            style={{
              width: `${w}%`,
              minWidth: 1,
              backgroundColor: `var(${STATE_COLOR_VAR[c.state]})`,
              opacity: dim && !isHovered ? 0.2 : 1,
              boxShadow: isHovered ? "inset 0 0 0 1.5px var(--color-accent)" : undefined,
              borderRight:
                i < cells.length - 1
                  ? "1px solid color-mix(in oklch, var(--color-bg) 50%, transparent)"
                  : undefined,
            }}
            title={`pos ${c.start}${c.end - c.start > 1 ? `-${c.end - 1}` : ""} · ${STATE_LABEL[c.state]}`}
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

function DualLegend({
  snapshot,
  segCounts,
  decodeAppended,
  hoverRole,
  activeStates,
  pinnedState,
  setHoverRole,
  setHoverState,
}: {
  snapshot: ReturnType<typeof useKvSnapshot>;
  segCounts: Record<TokenSegment, number>;
  decodeAppended: number;
  hoverRole: string | null;
  activeStates: Set<CellState>;
  pinnedState: CellState | null;
  setHoverRole: (r: string | null) => void;
  setHoverState: (s: CellState | null) => void;
}) {
  const stateChips: { id: CellState; count: number }[] = [
    { id: "reused", count: snapshot.reusedPrefix },
    { id: "prefill", count: snapshot.prefillNew },
    { id: "decode", count: decodeAppended || snapshot.decodeAppended },
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]"
      onMouseLeave={() => {
        setHoverState(null);
        setHoverRole(null);
      }}
    >
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-(--color-muted)">KV 状态:</span>
        {stateChips.map((c) => {
          const active = activeStates.has(c.id);
          return (
            <button
              key={c.id}
              onMouseEnter={() => {
                setHoverState(c.id);
                setHoverRole(null);
              }}
              onClick={() => setHoverState(pinnedState === c.id ? null : c.id)}
              className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 transition"
              style={{
                borderColor: active
                  ? `var(${STATE_COLOR_VAR[c.id]})`
                  : "var(--color-border)",
                backgroundColor: active
                  ? `color-mix(in oklch, var(${STATE_COLOR_VAR[c.id]}) 22%, transparent)`
                  : undefined,
              }}
            >
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: `var(${STATE_COLOR_VAR[c.id]})` }}
              />
              {STATE_LABEL[c.id]} · {c.count}
            </button>
          );
        })}
      </div>
      <span className="text-(--color-border)">│</span>
      <RoleLegend
        counts={segCounts}
        hoverRole={hoverRole}
        onHoverChange={(seg) => {
          setHoverRole(seg);
          if (seg != null) setHoverState(null);
        }}
        label="角色:"
      />
    </div>
  );
}


function buildRoleSegments(tokens: TokenInfo[], total: number): RoleSegment[] {
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
  for (let i = 1; i < total; i++) {
    const seg = segOf(i);
    const id = idOf(i);
    if (seg !== curSeg || id !== curId) {
      segs.push({ start, end: i, segment: curSeg, messageId: curId });
      start = i;
      curSeg = seg;
      curId = id;
    }
  }
  segs.push({ start, end: total, segment: curSeg, messageId: curId });
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
      segment: topKey(segCounts, "control" as TokenSegment),
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
