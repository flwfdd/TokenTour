import { forwardRef, useMemo, useRef, useState } from "react";
import Pane from "./Pane";
import { useLensView } from "./lensHooks";
import { useScrollMatchIntoView } from "./useScrollMatch";
import { useConversation } from "./store";
import {
  resolveTokenizer,
  isHfPending,
  listTokenizers,
  listHfTokenizers,
  defaultTokenizerKey,
  tokenize,
} from "./lib/tokenizer";
import { useTokenizerLoadedVersions } from "./useTokenizerLoad";
import type { TokenInfo } from "./lib/types";
import { SEG_LABEL, SEG_ROLE_VAR, matchesHover, withinMessageFraction, roleSurfaceStyle } from "./visual";

const TOK_LABEL_SHORT: Record<string, string> = {
  cl100k: "GPT-4",
  harmony: "GPT-OSS",
  qwen3: "Qwen3",
  deepseek_v3: "DeepSeek-V3",
};

type SubPane = "primary" | "compare" | null;

const BADGE_SM: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  padding: "0.05rem 0.4rem",
  letterSpacing: 0,
};

export default function LensTokens() {
  const view = useLensView();
  const hoverTokenIndex = useConversation((s) => s.hoverTokenIndex);
  const hoverRole = useConversation((s) => s.hoverRole);
  const hoverMessageId = useConversation((s) => s.hoverMessageId);
  const tokenizerKey = useConversation((s) => s.tokenizerKey);
  const setTokenizerKey = useConversation((s) => s.setTokenizerKey);
  const setHoverFromToken = useConversation((s) => s.setHoverFromToken);
  const primaryRef = useRef<HTMLDivElement | null>(null);
  const compareRef = useRef<HTMLDivElement | null>(null);

  // Per-pane comparison tokenizer (purely local; never persisted).
  const [compareKey, setCompareKey] = useState<string | null>(null);

  // Tracks which sub-pane the cursor is currently inside; the OTHER sub-pane
  // is the one that should passively scroll to follow the hover.
  const [activeSub, setActiveSub] = useState<SubPane>(null);
  // Local hover positions. Primary's local overrides the global hoverTokenIndex
  // for its own visual highlight; compare needs a *local* index because its
  // token positions don't align with the global one (different tokenizer).
  const [primaryLocal, setPrimaryLocal] = useState<number | null>(null);
  const [compareLocal, setCompareLocal] = useState<number | null>(null);

  // Subscribe once for both the active and compare tokenizer so the pane
  // re-renders when either arrives. Passing `view.family` ensures the
  // auto option also kicks off the HF load when tokenizerKey is null.
  useTokenizerLoadedVersions([tokenizerKey, compareKey], view.family);

  const activeTokenizer = resolveTokenizer(view.family, tokenizerKey);
  // For "auto" (tokenizerKey === null), the resolved tokenizer can be either
  // o200k (immediate) or the family's matched HF (pending while loading).
  // Show the spinner whenever the *intended* tokenizer is HF and not ready.
  const tokIsHfPending = isHfPending(
    tokenizerKey ?? defaultTokenizerKey(view.family),
  );

  // Re-tokenize the same template text with the comparison tokenizer.
  // We reuse the primary's already-computed text + spans (same family) so
  // only the BPE encoder differs — that's the whole point of the compare.
  const compareTokens = useMemo<TokenInfo[] | null>(() => {
    if (!compareKey) return null;
    return tokenize(view.templateText, {
      family: view.family,
      spans: view.spans,
      tokenizerKey: compareKey,
    }).tokens;
  }, [compareKey, view.templateText, view.family, view.spans]);
  const compareTokenizer = compareKey ? resolveTokenizer(view.family, compareKey) : null;
  const compareIsHfPending = isHfPending(compareKey);

  // PRIMARY scroll: only when hover is NOT in the primary sub-pane.
  // When `activeSub` is null (cursor not in either sub-pane) we fall back to
  // the standard paneId check; otherwise we bypass paneId so the OTHER
  // sub-pane can drive primary's scroll even though hoverSource === "tokens".
  useScrollMatchIntoView({
    containerRef: primaryRef,
    paneId: activeSub == null ? "tokens" : undefined,
    enabled: activeSub !== "primary",
    hoverTokenIndex,
    hoverMessageId,
    hoverRole,
  });

  // COMPARE scroll: symmetric. Compare tokens don't have aligned positions vs
  // primary, so token-index hover is ignored — message/role hover still maps
  // 1:1 via `data-msgid` / `data-seg`.
  useScrollMatchIntoView({
    containerRef: compareRef,
    paneId: activeSub == null ? "tokens" : undefined,
    enabled: !!compareTokens && activeSub !== "compare",
    hoverTokenIndex: null,
    hoverMessageId,
    hoverRole,
  });

  return (
    <Pane
      title="Tokens"
      paneId="tokens"
      controls={
        <>
          <TokenizerSelect
            value={tokenizerKey ?? ""}
            onChange={(k) => setTokenizerKey(k)}
            defaultLabel={`auto · ${TOK_LABEL_SHORT[defaultTokenizerKey(view.family)] ?? defaultTokenizerKey(view.family)}`}
            title="决定如何把 chat template 切成 token。auto 自动匹配当前模板家族；内置 tiktoken 是通用近似；HF 选项从 /public/tokenizers/ 优先读本地，缺失时回退 hf-mirror.com。"
          />
          <TokenizerSelect
            value={compareKey ?? ""}
            onChange={setCompareKey}
            defaultLabel="对比…"
            title="选一个对比用的 tokenizer，把同一份 chat template 文本并排切出来"
          />
        </>
      }
      footer={(() => {
        // Show details for the currently-hovered token, regardless of which
        // sub-pane it came from. Compare takes precedence (it's the more
        // unusual thing the user is looking at right now).
        const t =
          (compareLocal != null && compareTokens?.[compareLocal]) ||
          (primaryLocal != null && view.tokens[primaryLocal]) ||
          (hoverTokenIndex != null && view.tokens[hoverTokenIndex]) ||
          null;
        return t ? (
          <div className="flex min-h-[2rem] items-center px-3 font-mono">
            <TokenDetail t={t} />
          </div>
        ) : (
          <div className="flex min-h-[2rem] items-center px-3 text-[10px] text-(--color-muted)">
            悬停一个 token 查看 id / 字节数等信息
          </div>
        );
      })()}
    >
      <div
        className={
          compareTokens
            ? "grid h-full min-h-0 grid-cols-2 gap-0"
            : "h-full min-h-0"
        }
        onMouseLeave={() => {
          setHoverFromToken(null);
          setActiveSub(null);
          setPrimaryLocal(null);
          setCompareLocal(null);
        }}
      >
        <TokenList
          ref={primaryRef}
          tokens={view.tokens}
          label={TOK_LABEL_SHORT[activeTokenizer.key] ?? activeTokenizer.key}
          highlightIdx={primaryLocal ?? hoverTokenIndex}
          hoverRole={hoverRole}
          hoverMessageId={hoverMessageId}
          onHover={(t) => {
            setPrimaryLocal(t.position);
            setHoverFromToken(t, {
              fraction: withinMessageFraction(view.tokens, t),
            });
          }}
          onLeaveTokens={() => setPrimaryLocal(null)}
          onSubEnter={() => setActiveSub("primary")}
          vocabSize={activeTokenizer.vocabSize}
          pending={tokIsHfPending}
          dividerRight={!!compareTokens}
          empty={!compareTokens && view.tokens.length === 0}
        />
        {compareTokens && (
          <TokenList
            ref={compareRef}
            tokens={compareTokens}
            label={TOK_LABEL_SHORT[compareTokenizer!.key] ?? compareTokenizer!.key}
            highlightIdx={compareLocal}
            hoverRole={hoverRole}
            hoverMessageId={hoverMessageId}
            onHover={(t) => {
              setCompareLocal(t.position);
              setHoverFromToken(t, {
                aligned: false,
                fraction: withinMessageFraction(compareTokens, t),
              });
            }}
            onLeaveTokens={() => setCompareLocal(null)}
            onSubEnter={() => setActiveSub("compare")}
            vocabSize={compareTokenizer!.vocabSize}
            pending={compareIsHfPending}
          />
        )}
      </div>
    </Pane>
  );
}

function TokenizerSelect({
  value,
  onChange,
  defaultLabel,
  title,
}: {
  value: string;
  onChange: (v: string | null) => void;
  defaultLabel: string;
  title?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value || null)}
      className="text-[11px] py-0.5 px-1.5 max-w-[16ch] truncate"
      title={title}
    >
      <option value="">{defaultLabel}</option>
      <optgroup label="tiktoken (内置)">
        {listTokenizers().map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="HF · 本地优先 / hf-mirror 回退">
        {listHfTokenizers().map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

const TokenList = forwardRef<HTMLDivElement, {
  tokens: TokenInfo[];
  label: string;
  highlightIdx: number | null;
  hoverRole: string | null;
  hoverMessageId: string | null;
  onHover: (t: TokenInfo) => void;
  onLeaveTokens: () => void;
  onSubEnter: () => void;
  vocabSize?: number;
  pending?: boolean;
  dividerRight?: boolean;
  empty?: boolean;
}>(function TokenList(
  {
    tokens,
    label,
    highlightIdx,
    hoverRole,
    hoverMessageId,
    onHover,
    onLeaveTokens,
    onSubEnter,
    vocabSize,
    pending,
    dividerRight,
    empty,
  },
  ref,
) {
  return (
    <div
      onMouseEnter={onSubEnter}
      onMouseMove={onSubEnter}
      onMouseLeave={onLeaveTokens}
      className={
        "flex h-full min-h-0 flex-col " +
        (dividerRight ? "border-r border-(--pg-desk)" : "")
      }
    >
      <div className="flex-none px-3 py-1 text-[11px] text-(--color-ink-soft)">
        {label} · {tokens.length.toLocaleString()} tok · 词表{" "}
        {vocabSize?.toLocaleString() ?? "—"}
        {pending ? " · 加载中…" : ""}
      </div>
      <div ref={ref} className="flex-1 min-h-0 overflow-auto p-3 leading-[1.6rem]">
        {empty ? (
        <div className="grid h-full place-items-center text-xs text-(--color-muted)">
          还没有 token。在左侧输入消息并发送，或点 Demo 按钮。
        </div>
      ) : (
        tokens.map((t) => (
          <TokenChip
            key={t.position}
            t={t}
            hovered={highlightIdx === t.position}
            dim={!matchesHover(t, hoverRole, hoverMessageId)}
            onHover={() => onHover(t)}
          />
        ))
      )}
      </div>
    </div>
  );
});

function TokenChip({
  t,
  hovered,
  dim,
  onHover,
}: {
  t: TokenInfo;
  hovered: boolean;
  dim: boolean;
  onHover: () => void;
}) {
  const display = t.text
    .replace(/ /g, "·")
    .replace(/\n/g, "↵")
    .replace(/\t/g, "→")
    .replace(/\r/g, "↩");

  const style: React.CSSProperties = roleSurfaceStyle(t.segment, {
    hovered,
    dim,
    special: t.isSpecial,
    instant: true,
  });

  return (
    <span
      data-pos={t.position}
      data-seg={t.segment}
      data-msgid={t.messageId ?? ""}
      onMouseEnter={onHover}
      style={style}
      className={
        "mr-0.5 mb-px inline-block cursor-default rounded-md px-1.5 py-px font-mono text-[11px] " +
        (t.isSpecial ? "font-bold" : "")
      }
    >
      {display || "·"}
    </span>
  );
}

function TokenDetail({ t }: { t: TokenInfo }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="badge" style={BADGE_SM}>id={t.id}</span>
      <span className="badge" style={BADGE_SM}>pos={t.position}</span>
      <span
        className="badge"
        style={{ ...BADGE_SM, ...roleSurfaceStyle(t.segment, { border: true }), color: `var(${SEG_ROLE_VAR[t.segment]})` }}
      >
        {SEG_LABEL[t.segment]}
      </span>
      {t.isSpecial && <span className="badge" style={BADGE_SM}>special</span>}
      <span className="text-[10px] text-(--color-muted)">
        {new TextEncoder().encode(t.text).length} 字节 · {t.text.length} 字符
      </span>
    </div>
  );
}

