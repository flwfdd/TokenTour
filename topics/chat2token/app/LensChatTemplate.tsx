import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import Pane from "./Pane";
import { useLensView } from "./lensHooks";
import { useScrollMatchIntoView } from "./useScrollMatch";
import { useConversation, getActiveTools } from "./store";
import { renderAndTokenize } from "./lib/pipeline";
import { TEMPLATE_BUNDLES } from "./lib/chatTemplates";
import { SEG_LABEL, matchesHover, withinMessageFraction, roleSurfaceStyle } from "./visual";
import type { TokenInfo } from "./lib/types";

const FAMILY_LABEL: Record<string, string> = {
  qwen: "Qwen3",
  deepseek: "DeepSeek-V3",
  gpt_oss: "GPT-OSS",
};

type SubPane = "primary" | "compare" | null;

export default function LensChatTemplate() {
  const view = useLensView();
  const hoverTokenIndex = useConversation((s) => s.hoverTokenIndex);
  const hoverRole = useConversation((s) => s.hoverRole);
  const hoverMessageId = useConversation((s) => s.hoverMessageId);
  const setHoverFromToken = useConversation((s) => s.setHoverFromToken);
  const tokenizerKey = useConversation((s) => s.tokenizerKey);
  const templateFamily = useConversation((s) => s.templateFamily);
  const setTemplateFamily = useConversation((s) => s.setTemplateFamily);

  const [compareFamily, setCompareFamily] = useState<string | null>(null);
  // Comparing a family against itself shows two identical panes — pointless.
  // If the primary is switched to match the current compare target, drop the
  // comparison automatically.
  useEffect(() => {
    if (compareFamily && compareFamily === templateFamily) setCompareFamily(null);
  }, [compareFamily, templateFamily]);
  // Which sub-pane the cursor currently lives in. Drives self-scroll
  // suppression so the active side never yanks itself.
  const [activeSub, setActiveSub] = useState<SubPane>(null);
  // Local hover positions; primary tracks its own so it doesn't have to
  // round-trip through the global store, and compare needs a *local* index
  // because its token positions don't align with the global one.
  const [primaryLocal, setPrimaryLocal] = useState<number | null>(null);
  const [compareLocal, setCompareLocal] = useState<number | null>(null);

  const primaryRef = useRef<HTMLPreElement | null>(null);
  const compareRef = useRef<HTMLPreElement | null>(null);

  // Per-message proportional linked scrolling. A naive overall-ratio sync
  // (scrollTop/scrollHeight) breaks badly when the two families inject very
  // different amounts of boilerplate: the same message starts at a different
  // overall fraction in each pane, so scrolling to a long message's body in
  // one side leaves the other stranded at that message's start (the exact
  // regression reported). Instead we anchor on the message at the TOP of the
  // source viewport and place the SAME message — at the same within-message
  // fraction — at the top of the destination.
  // No bounce guard needed: `onScroll` only calls this when `src` is the pane
  // the cursor is in, so the programmatic `dst.scrollTop` write below fires the
  // passive pane's (gated, no-op) handler and stops there.
  const linkScroll = (src: HTMLPreElement | null, dst: HTMLPreElement | null) => {
    if (!src || !dst) return;
    const next = proportionalScrollTop(src, dst);
    if (next == null || Math.abs(next - dst.scrollTop) < 0.5) return;
    dst.scrollTop = next;
  };

  const families = useMemo(() => Object.keys(TEMPLATE_BUNDLES), []);

  const compareTokens = useMemo<TokenInfo[] | null>(() => {
    if (!compareFamily) return null;
    return renderAndTokenize({
      messages: view.messages,
      tools: getActiveTools(),
      family: compareFamily,
      addGenerationPrompt: true,
      tokenizerKey,
    }).tokens;
  }, [compareFamily, view.messages, tokenizerKey]);

  // PRIMARY scroll: skip when the cursor is inside primary itself.
  // When activeSub is null (cursor not in either sub-pane), fall back to
  // the standard `paneId === hoverSource` guard.
  useScrollMatchIntoView({
    containerRef: primaryRef,
    paneId: activeSub == null ? "template" : undefined,
    enabled: activeSub !== "primary",
    hoverTokenIndex,
    hoverMessageId,
    hoverRole,
  });

  // COMPARE scroll: symmetric. Compare's tokenization belongs to a different
  // family, so token-index hover is meaningless here; we sync on msg/role.
  useScrollMatchIntoView({
    containerRef: compareRef,
    paneId: activeSub == null ? "template" : undefined,
    enabled: !!compareTokens && activeSub !== "compare",
    hoverTokenIndex: null,
    hoverMessageId,
    hoverRole,
  });

  // Primary's visible highlight: local hover wins; fall back to globally
  // synced hoverTokenIndex (e.g. when Tokens / KV grid drives the hover).
  const primaryHighlightIdx = primaryLocal ?? hoverTokenIndex;

  return (
    <Pane
      title="Chat Template"
      paneId="template"
      controls={
        <>
          <select
            value={templateFamily}
            onChange={(e) => setTemplateFamily(e.target.value)}
            className="text-[11px] py-0.5 px-1.5"
            title="选择 chat template。和'假想架构'解耦：架构只影响 KV Cache 估算，这里只影响渲染/分词。"
          >
            {families.map((f) => (
              <option key={f} value={f}>
                {FAMILY_LABEL[f] ?? f}
              </option>
            ))}
          </select>
          <select
            value={compareFamily ?? ""}
            onChange={(e) => setCompareFamily(e.target.value || null)}
            className="text-[11px] py-0.5 px-1.5"
            title="并排对比另一个家族的模板。hover 任一侧会高亮当前 token，并按消息位置大致同步另一侧。"
          >
            <option value="">对比…</option>
            {families
              .filter((f) => f !== view.family)
              .map((f) => (
                <option key={f} value={f}>
                  {FAMILY_LABEL[f] ?? f}
                </option>
              ))}
          </select>
        </>
      }
    >
      <div
        className={compareTokens ? "grid h-full min-h-0 grid-cols-2 gap-0" : "h-full min-h-0"}
        onMouseLeave={() => {
          setActiveSub(null);
          setPrimaryLocal(null);
          setCompareLocal(null);
          setHoverFromToken(null);
        }}
      >
        <TokenRenderedPre
          ref={primaryRef}
          tokens={view.tokens}
          highlightIdx={primaryHighlightIdx}
          hoverRole={hoverRole}
          hoverMessageId={hoverMessageId}
          label={FAMILY_LABEL[view.family] ?? view.family}
          dividerRight={!!compareTokens}
          onHoverToken={(t) => {
            setPrimaryLocal(t.position);
            setHoverFromToken(t, {
              fraction: withinMessageFraction(view.tokens, t),
            });
          }}
          onLeaveTokens={() => setPrimaryLocal(null)}
          onSubEnter={() => setActiveSub("primary")}
          onScroll={
            compareTokens
              ? () => {
                  // Only the pane the cursor lives in may drive the other. This
                  // stops the *programmatic* scroll that hover-sync performs on
                  // the passive pane from bouncing back and yanking the pane the
                  // user is currently reading.
                  if (activeSub === "primary") linkScroll(primaryRef.current, compareRef.current);
                }
              : undefined
          }
        />
        {compareTokens && (
          <TokenRenderedPre
            ref={compareRef}
            tokens={compareTokens}
            highlightIdx={compareLocal}
            hoverRole={hoverRole}
            hoverMessageId={hoverMessageId}
            label={FAMILY_LABEL[compareFamily!] ?? compareFamily!}
            onHoverToken={(t) => {
              setCompareLocal(t.position);
              setHoverFromToken(t, {
                aligned: false,
                fraction: withinMessageFraction(compareTokens, t),
              });
            }}
            onLeaveTokens={() => setCompareLocal(null)}
            onSubEnter={() => setActiveSub("compare")}
            onScroll={() => {
              if (activeSub === "compare") linkScroll(compareRef.current, primaryRef.current);
            }}
          />
        )}
      </div>
    </Pane>
  );
}

function cssEsc(s: string): string {
  if (typeof CSS !== "undefined" && (CSS as any).escape) return (CSS as any).escape(s);
  return s.replace(/["\\]/g, (m) => `\\${m}`);
}

/**
 * Compute the scrollTop that lines `dst` up with `src` by message rather than
 * by raw scroll ratio. Returns `null` when there's nothing useful to do (the
 * caller should leave `dst` untouched). Falls back to overall ratio only when
 * the anchored message can't be located in `dst`.
 */
function proportionalScrollTop(src: HTMLPreElement, dst: HTMLPreElement): number | null {
  const kids = src.children;
  if (kids.length === 0) return null;
  const srcTop = src.getBoundingClientRect().top;

  // Binary-search the first token whose bottom edge is at/below the viewport
  // top — i.e. the topmost (partially) visible token. Children flow top→down
  // so their vertical positions are monotonic.
  let lo = 0;
  let hi = kids.length - 1;
  let idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = (kids[mid] as HTMLElement).getBoundingClientRect();
    if (r.bottom <= srcTop) lo = mid + 1;
    else {
      idx = mid;
      hi = mid - 1;
    }
  }
  const anchor = kids[idx] as HTMLElement;
  const msgid = anchor.getAttribute("data-msgid") ?? "";
  // Message tokens key off their messageId; the segments that carry NO
  // messageId (tools_schema / generation prompt) must key
  // off their `data-seg` instead — otherwise every empty-msgid token gets
  // lumped into one bucket and the within-block ratio is garbage (the janky
  // tools-schema scrolling).
  const sel = msgid
    ? `[data-msgid="${cssEsc(msgid)}"]`
    : `[data-seg="${cssEsc(anchor.getAttribute("data-seg") ?? "")}"][data-msgid=""]`;

  const srcMsg = Array.from(src.querySelectorAll(sel)) as HTMLElement[];
  const dstMsg = Array.from(dst.querySelectorAll(sel)) as HTMLElement[];

  if (dstMsg.length === 0) {
    const srcMax = src.scrollHeight - src.clientHeight;
    const dstMax = dst.scrollHeight - dst.clientHeight;
    if (srcMax <= 0 || dstMax <= 0) return null;
    return (src.scrollTop / srcMax) * dstMax;
  }

  let frac = 0;
  if (srcMsg.length > 1) {
    const pos = srcMsg.indexOf(anchor);
    frac = pos < 0 ? 0 : pos / (srcMsg.length - 1);
  }
  const di = Math.min(dstMsg.length - 1, Math.max(0, Math.round(frac * (dstMsg.length - 1))));
  const dstTop = dst.getBoundingClientRect().top;
  // Shift dst so the matched token sits at the same viewport-top position.
  return dst.scrollTop + (dstMsg[di]!.getBoundingClientRect().top - dstTop);
}

const TokenRenderedPre = forwardRef<HTMLPreElement, {
  tokens: TokenInfo[];
  highlightIdx: number | null;
  hoverRole: string | null;
  hoverMessageId: string | null;
  onHoverToken: (t: TokenInfo) => void;
  onLeaveTokens: () => void;
  onSubEnter: () => void;
  onScroll?: React.UIEventHandler<HTMLPreElement>;
  label?: string;
  dividerRight?: boolean;
}>(function TokenRenderedPre(
  {
    tokens,
    highlightIdx,
    hoverRole,
    hoverMessageId,
    onHoverToken,
    onLeaveTokens,
    onSubEnter,
    onScroll,
    label,
    dividerRight,
  },
  ref,
) {
  const charCount = tokens.reduce((a, t) => a + t.text.length, 0);
  return (
    <div
      className={
        "relative h-full overflow-hidden flex flex-col " +
        (dividerRight ? "border-r border-(--pg-desk)" : "")
      }
      onMouseEnter={onSubEnter}
      onMouseMove={onSubEnter}
    >
      {label && (
        <div className="px-3 py-1 text-[11px] text-(--color-ink-soft)">
          {label} · {tokens.length.toLocaleString()} tok · {charCount.toLocaleString()} 字符
        </div>
      )}
      <pre
        ref={ref}
        className="flex-1 min-h-0 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-5"
        onMouseLeave={onLeaveTokens}
        onScroll={onScroll}
      >
        {tokens.map((t) => {
          const isHovered = t.position === highlightIdx;
          const dim = !matchesHover(t, hoverRole, hoverMessageId);
          // Empty-text tokens come from BPE byte tokens that are a *partial*
          // UTF-8 sequence — the visible character lives in a subsequent
          // token. We must NOT substitute a literal space here (that visibly
          // shifts text like "昆明呢" into "昆明 呢"); instead render an
          // invisible inline-block as a hover target.
          const isEmpty = t.text === "";
          const style: React.CSSProperties = {
            ...roleSurfaceStyle(t.segment, { hovered: isHovered, dim, special: t.isSpecial, instant: true }),
            borderRadius: 2,
            fontWeight: t.isSpecial ? 700 : 400,
            cursor: "default",
            ...(isEmpty
              ? {
                  display: "inline-block",
                  width: 3,
                  height: "1em",
                  verticalAlign: "middle",
                }
              : null),
          };
          return (
            <span
              key={t.position}
              data-pos={t.position}
              data-seg={t.segment}
              data-msgid={t.messageId ?? ""}
              style={style}
              onMouseEnter={() => onHoverToken(t)}
              title={`pos=${t.position} · id=${t.id} · ${SEG_LABEL[t.segment]}${isEmpty ? " · (partial-byte token)" : ""}`}
            >
              {t.text}
            </span>
          );
        })}
      </pre>
    </div>
  );
});
