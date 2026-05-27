/**
 * Pure derivation of the lens view from a snapshot of conversation state.
 *
 * Split out from `useLensView` so it can be tested without a React render
 * and so the three modes ("a step is selected", "between turns with a
 * frozen baseline", "first-ever render — derive baseline") read top-to-
 * bottom instead of being a giant ladder of mutated locals.
 */
import type { TimelineStep, Message, TokenInfo, ModelArch, ToolSpec } from "./lib/types";
import type { ConversationState } from "./store";
import { buildOutgoingMessages, getActiveTools } from "./store";
import { renderAndTokenize } from "./lib/pipeline";
import { computeSpans } from "./lib/spans";
import { defaultTokenizerKey, resolveTokenizer, type SegmentSpan } from "./lib/tokenizer";
import { snapshotKv, makeSnapshot, diffPrefix, type KvSnapshot } from "./lib/kvSim";
import { shouldAddGenerationPrompt } from "./lib/messageUtils";

export interface LensView {
  messages: Message[];
  templateText: string;
  tokens: TokenInfo[];
  arch: ModelArch;
  family: string;
  reusedPrefix: number;
  decodeAppended: number;
  selectedStep: TimelineStep | null;
  prevTokens?: TokenInfo[];
  addGenerationPrompt: boolean;
  /** Char-range spans for the rendered template; used by compare panes. */
  spans: SegmentSpan[];
  /**
   * Pre-computed KV snapshot used for the "between turns" synthesis path
   * (loaded conversation ends with an assistant message and there is no
   * real step history yet). When unset, the caller falls back to the
   * normal `snapshotKv(prev, curr, decode)` math.
   */
  precomputedSnapshot?: KvSnapshot;
}

/** A snapshot seed produced by the synthesis branch on first render; the
 *  caller commits it to the store as the frozen baseline so subsequent
 *  edits diff against it (= `reusedPrefix` shrinks) and reverting restores
 *  the original Case-A split. */
export interface BaselineSeed {
  tokens: TokenInfo[];
  reusedPrefix: number;
  prefillNew: number;
  decodeAppended: number;
  totalLen: number;
}

export interface LensViewInternal extends LensView {
  /** Non-null only when synthesis derived a fresh baseline this render. */
  __baselineSeed: BaselineSeed | null;
}

export function deriveLensView(args: { state: ConversationState; arch: ModelArch }): LensViewInternal {
  const { state, arch } = args;
  const tools = getActiveTools();
  const family = state.templateFamily;

  const selected = resolveSelectedStep(state.steps, state.selectedStepId);

  if (selected) return fromSelectedStep({ selected, state, arch, family, tools });
  return fromLiveSynthesis({ state, arch, family, tools, tokKey: state.tokenizerKey });
}

// ── Selected-step branch ──────────────────────────────────────────────────
function fromSelectedStep(args: {
  selected: TimelineStep;
  state: ConversationState;
  arch: ModelArch;
  family: string;
  tools: ToolSpec[];
}): LensViewInternal {
  const { selected, state, arch, family, tools } = args;
  const messages = selected.messagesSnapshot;
  const templateText = selected.templateText ?? "";
  const tokens = selected.tokens ?? [];

  let reusedPrefix = selected.reusedPrefix ?? 0;
  let decodeAppended = 0;
  const meta: any = selected.meta;
  if (meta?.snapshot) {
    decodeAppended = meta.snapshot.decodeAppended ?? 0;
    reusedPrefix = meta.snapshot.reusedPrefix ?? reusedPrefix;
  }

  // "Prev" for a selected step is the most recent token-bearing step from
  // an earlier turn — that was the cache state when this step prefilled.
  const selectedIdx = state.steps.findIndex((s) => s.id === selected.id);
  const prevTokens = mostRecentTokensBefore(state.steps, selectedIdx, selected.turn);

  // Spans needed by the chat-template pane for hover-anchor maths.
  const spans = computeSpans({ messages, tools, family, addGenerationPrompt: true }).spans;

  return {
    messages,
    templateText,
    tokens,
    arch,
    family,
    reusedPrefix,
    decodeAppended,
    selectedStep: selected,
    prevTokens,
    addGenerationPrompt: true,
    spans,
    __baselineSeed: null,
  };
}

// ── Live / between-turn synthesis branch ─────────────────────────────────
function fromLiveSynthesis(args: {
  state: ConversationState;
  arch: ModelArch;
  family: string;
  tools: ToolSpec[];
  tokKey: string | null;
}): LensViewInternal {
  const { state, arch, family, tools, tokKey } = args;
  const messages = buildOutgoingMessages(state);
  const addGenerationPrompt = shouldAddGenerationPrompt(messages);

  const { text: templateText, tokens, spans } = renderAndTokenize({
    messages, tools, family, addGenerationPrompt, tokenizerKey: tokKey,
  });

  // Three mutually-exclusive sources for `prev` (= what the cache holds):
  //   1. Last completed step's tokens — fresh after a real turn.
  //   2. The frozen baseline in the store — set on first render and after
  //      every committed turn; insulates `reusedPrefix` from spurious
  //      shrink/restore cycles when the user edits a prefix message.
  //   3. Nothing yet — derive Case A/B/C from current messages and emit a
  //      `BaselineSeed` for the effect to commit.
  let prevTokens = mostRecentTokens(state.steps);
  let reusedPrefix = 0;
  let decodeAppended = 0;
  let snapshot: KvSnapshot | undefined;
  let baselineSeed: BaselineSeed | null = null;

  if (prevTokens) {
    reusedPrefix = diffPrefix(prevTokens, tokens);
  } else if (state.baselineTokens && state.baselineSnapshot) {
    prevTokens = state.baselineTokens;
    ({ snapshot, reusedPrefix, decodeAppended } = applyBaselineDiff(
      arch,
      tokens,
      state.baselineTokens,
      state.baselineSnapshot,
    ));
  } else {
    const d = deriveFreshBaseline({ messages, arch, family, tools, tokenizerKey: tokKey, currentTokens: tokens });
    prevTokens = d.prevTokens;
    snapshot = d.snapshot;
    reusedPrefix = d.reusedPrefix;
    decodeAppended = d.decodeAppended;
    baselineSeed = d.seed;
  }

  // Defer baseline seeding while the *requested* tokenizer hasn't resolved
  // yet. `resolveTokenizer` falls back to harmony when an HF tokenizer is
  // loading; seeding with those fallback tokens would make `reusedPrefix`
  // flash to 0 the moment the real HF tokenizer arrives (the diff against
  // brand-new HF tokens finds no matching prefix).
  const requested = tokKey ?? defaultTokenizerKey(family);
  const resolved = resolveTokenizer(family, tokKey).key;
  const seedToCommit = resolved === requested ? baselineSeed : null;

  return {
    messages,
    templateText,
    tokens,
    arch,
    family,
    reusedPrefix,
    decodeAppended,
    selectedStep: null,
    prevTokens,
    addGenerationPrompt,
    spans,
    precomputedSnapshot: snapshot,
    __baselineSeed: seedToCommit,
  };
}

/**
 * "Frozen baseline" diff: if current tokens match the baseline verbatim,
 * restore its counts; otherwise the divergent tail counts as re-prefill
 * and decode goes to zero (the edited state has never been generated).
 */
function applyBaselineDiff(
  arch: ModelArch,
  tokens: TokenInfo[],
  baselineTokens: TokenInfo[],
  baselineSnap: NonNullable<ConversationState["baselineSnapshot"]>,
): { snapshot: KvSnapshot; reusedPrefix: number; decodeAppended: number } {
  if (tokensEqual(tokens, baselineTokens)) {
    return {
      snapshot: makeSnapshot({
        arch,
        tokens,
        reusedPrefix: baselineSnap.reusedPrefix,
        prefillNew: baselineSnap.prefillNew,
        decodeAppended: baselineSnap.decodeAppended,
      }),
      reusedPrefix: baselineSnap.reusedPrefix,
      decodeAppended: baselineSnap.decodeAppended,
    };
  }
  const reused = diffPrefix(baselineTokens, tokens);
  return {
    snapshot: makeSnapshot({
      arch,
      tokens,
      reusedPrefix: reused,
      prefillNew: tokens.length - reused,
      decodeAppended: 0,
    }),
    reusedPrefix: reused,
    decodeAppended: 0,
  };
}

/**
 * Case A/B/C — derive a snapshot from the current message list when there
 * is no prior step history AND no frozen baseline yet.
 *
 *   A. Last msg IS assistant → treat that assistant as JUST DECODED.
 *      reused = tokens before it; prefillNew = the gen-prompt header that
 *      triggered it (e.g. `<|im_start|>assistant\n` for Qwen, ~0 tokens
 *      for the vLLM DeepSeek template since the user block already glues
 *      `<｜Assistant｜>` on the end); decodeAppended = the assistant's
 *      own content + closing tokens.
 *   B. There IS an assistant but it isn't the last message →
 *      through-last-assistant is "cached", anything after is re-prefill
 *      (decode = 0).
 *   C. No assistant → treat the entire context as already cached.
 */
function deriveFreshBaseline(args: {
  messages: Message[];
  arch: ModelArch;
  family: string;
  tools: ToolSpec[];
  tokenizerKey: string | null;
  currentTokens: TokenInfo[];
}): {
  prevTokens: TokenInfo[];
  snapshot: KvSnapshot;
  reusedPrefix: number;
  decodeAppended: number;
  seed: BaselineSeed;
} {
  const { messages, arch, family, tools, tokenizerKey, currentTokens } = args;
  const tokenizeMsgs = (msgs: Message[], addGen: boolean) =>
    renderAndTokenize({ messages: msgs, tools, family, addGenerationPrompt: addGen, tokenizerKey }).tokens;

  const lastAsstIdx = findLastAssistant(messages);
  const finalize = (reused: number, prefill: number, decode: number, prev: TokenInfo[]) => {
    const snap = makeSnapshot({ arch, tokens: currentTokens, reusedPrefix: reused, prefillNew: prefill, decodeAppended: decode });
    return {
      prevTokens: prev,
      snapshot: snap,
      reusedPrefix: reused,
      decodeAppended: decode,
      seed: {
        tokens: currentTokens,
        reusedPrefix: reused,
        prefillNew: prefill,
        decodeAppended: decode,
        totalLen: reused + prefill + decode,
      },
    };
  };

  if (lastAsstIdx === messages.length - 1 && lastAsstIdx >= 0) {
    // Case A
    const preAsst = messages.slice(0, lastAsstIdx);
    const preTokens = tokenizeMsgs(preAsst, false);
    const preGenLen = tokenizeMsgs(preAsst, true).length;
    const reused = preTokens.length;
    const prefill = preGenLen - reused;
    const decode = Math.max(0, currentTokens.length - preGenLen);
    return finalize(reused, prefill, decode, preTokens);
  }

  // Case B / C share the same shape: tokenize the baseline message slice
  // (everything through the last assistant, or all messages), diff against
  // current tokens, decode = 0.
  const baselineMsgs = lastAsstIdx >= 0 ? messages.slice(0, lastAsstIdx + 1) : messages;
  const prevTokens = tokenizeMsgs(baselineMsgs, false);
  const reused = diffPrefix(prevTokens, currentTokens);
  return finalize(reused, currentTokens.length - reused, 0, prevTokens);
}

// ── small helpers ────────────────────────────────────────────────────────
function resolveSelectedStep(steps: TimelineStep[], id: string | null): TimelineStep | null {
  if (!id) return null;
  const idx = steps.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  // Walk back to the most recent token-bearing step. `final / tool_call /
  // tool_result / compose / template` carry no tokens; selecting one of
  // them should still surface the conversation's last real snapshot.
  for (let i = idx; i >= 0; i--) {
    const s = steps[i]!;
    if (s.tokens && s.tokens.length > 0) return s;
  }
  return steps[idx] ?? null;
}

function mostRecentTokens(steps: TimelineStep[]): TokenInfo[] | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]!;
    if (s.tokens && s.tokens.length > 0) return s.tokens;
  }
  return undefined;
}

function mostRecentTokensBefore(steps: TimelineStep[], idx: number, beforeTurn: number): TokenInfo[] | undefined {
  for (let i = idx - 1; i >= 0; i--) {
    const s = steps[i]!;
    if (s.tokens && s.turn < beforeTurn) return s.tokens;
  }
  return undefined;
}

function findLastAssistant(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "assistant") return i;
  }
  return -1;
}

function tokensEqual(a: TokenInfo[], b: TokenInfo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i]!.text !== b[i]!.text) return false;
  return true;
}
