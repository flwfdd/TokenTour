import { forwardRef, useMemo, useRef, useState } from "react";
import Pane from "./Pane";
import { useLensView } from "./lensHooks";
import { useScrollMatchIntoView } from "./useScrollMatch";
import { useConversation, getActiveTools } from "~/store";
import { renderChatTemplate } from "~/lib/template";
import { computeSpans } from "~/lib/spans";
import { tokenize } from "~/lib/tokenizer";
import { TEMPLATE_BUNDLES } from "~/lib/chatTemplates";
import { SEG_ROLE_VAR, SEG_LABEL, matchesHover, withinMessageFraction } from "./visual";
import type { TokenInfo } from "~/lib/types";

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

  const families = useMemo(() => Object.keys(TEMPLATE_BUNDLES), []);

  const compareTokens = useMemo<TokenInfo[] | null>(() => {
    if (!compareFamily) return null;
    const tools = getActiveTools();
    const rendered = renderChatTemplate({
      messages: view.messages,
      tools,
      family: compareFamily,
      addGenerationPrompt: true,
    });
    const { cleanedText, spans } = computeSpans({
      messages: view.messages,
      tools,
      family: compareFamily,
      addGenerationPrompt: true,
    });
    const text = cleanedText.length > 0 ? cleanedText : rendered.text;
    const { tokens } = tokenize(text, {
      bundle: rendered.bundle,
      family: compareFamily,
      spans,
      tokenizerKey,
    });
    return tokens;
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
      subtitle={
        <span>
          {view.templateText.length.toLocaleString()} 字符
          {compareTokens && (
            <>
              {" "}vs{" "}
              <span style={{ color: "var(--color-accent)" }}>
                {FAMILY_LABEL[compareFamily!] ?? compareFamily}
              </span>
            </>
          )}
        </span>
      }
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
      legend={<TemplateLegend />}
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
          showLabel={!!compareTokens}
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
        />
        {compareTokens && (
          <TokenRenderedPre
            ref={compareRef}
            tokens={compareTokens}
            highlightIdx={compareLocal}
            hoverRole={hoverRole}
            hoverMessageId={hoverMessageId}
            showLabel
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
          />
        )}
      </div>
    </Pane>
  );
}

function TemplateLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-(--color-muted)">
      <span>背景色 = 该 token 所属角色</span>
      <span>·</span>
      <span>粗体 = 特殊 token</span>
      <span>·</span>
      <span>hover 一段会同步高亮到其他面板</span>
    </div>
  );
}

const TokenRenderedPre = forwardRef<HTMLPreElement, {
  tokens: TokenInfo[];
  highlightIdx: number | null;
  hoverRole: string | null;
  hoverMessageId: string | null;
  onHoverToken: (t: TokenInfo) => void;
  onLeaveTokens: () => void;
  onSubEnter: () => void;
  showLabel?: boolean;
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
    showLabel,
    label,
    dividerRight,
  },
  ref,
) {
  return (
    <div
      className={
        "relative h-full overflow-hidden flex flex-col " +
        (dividerRight ? "border-r border-(--color-border)" : "")
      }
      onMouseEnter={onSubEnter}
      onMouseMove={onSubEnter}
    >
      {showLabel && label && (
        <div className="hairline border-l-0 border-r-0 border-t-0 px-3 py-1 text-[11px] text-(--color-muted)">
          {label} · {tokens.length.toLocaleString()} tok
        </div>
      )}
      <pre
        ref={ref}
        className="flex-1 min-h-0 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-5"
        onMouseLeave={onLeaveTokens}
      >
        {tokens.map((t) => {
          const isHovered = t.position === highlightIdx;
          const dim = !matchesHover(t, hoverRole, hoverMessageId);
          const bgVar = SEG_ROLE_VAR[t.segment];
          // Empty-text tokens come from BPE byte tokens that are a *partial*
          // UTF-8 sequence — the visible character lives in a subsequent
          // token. We must NOT substitute a literal space here (that visibly
          // shifts text like "昆明呢" into "昆明 呢"); instead render an
          // invisible inline-block as a hover target.
          const isEmpty = t.text === "";
          const style: React.CSSProperties = {
            backgroundColor: isHovered
              ? `color-mix(in oklch, var(${bgVar}) 55%, transparent)`
              : `color-mix(in oklch, var(${bgVar}) 16%, transparent)`,
            opacity: dim ? 0.28 : 1,
            borderRadius: 2,
            transition: "background-color 0.08s, opacity 0.15s",
            fontWeight: t.isSpecial ? 700 : 400,
            color: t.isSpecial ? `var(${bgVar})` : undefined,
            cursor: "default",
            boxShadow: isHovered ? `inset 0 0 0 1px var(--color-accent)` : undefined,
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
