import { useEffect, useMemo } from "react";
import { useConversation, buildOutgoingMessages, getActiveTools } from "~/store";
import type { TimelineStep, Message, TokenInfo } from "~/lib/types";
import { renderChatTemplate } from "~/lib/template";
import { computeSpans } from "~/lib/spans";
import {
  tokenize,
  resolveTokenizer,
  defaultTokenizerKey,
  type SegmentSpan,
} from "~/lib/tokenizer";
import { getModel } from "~/lib/modelRegistry";
import { snapshotKv, makeSnapshot, diffPrefix } from "~/lib/kvSim";
import type { KvSnapshot } from "~/lib/kvSim";
import { shouldAddGenerationPrompt } from "~/lib/messageUtils";
import { useTokenizerLoadedVersion } from "./useTokenizerLoad";

export interface LensView {
  messages: Message[];
  templateText: string;
  tokens: TokenInfo[];
  arch: ReturnType<typeof getModel>;
  family: string;
  reusedPrefix: number;
  decodeAppended: number;
  selectedStep: TimelineStep | null;
  prevTokens?: TokenInfo[];
  addGenerationPrompt: boolean;
  /** Char spans for the rendered template; used by compare tokenizer panes. */
  spans: SegmentSpan[];
  /**
   * Pre-computed snapshot used for the "between turns" synthesis (when the
   * loaded conversation ends with an assistant message and there is no real
   * step history yet). The snapshot models that last assistant as JUST
   * GENERATED: tokens before it count as `reused`, the gen-prompt header
   * counts as `prefillNew`, the assistant's content counts as
   * `decodeAppended`. When unset, `useKvSnapshot` falls back to the normal
   * `snapshotKv(prev, curr, decode)` math.
   */
  precomputedSnapshot?: KvSnapshot;
}

/** A snapshot seed produced by the synthesis branch on first render. Picked
 *  up by `useEffect` below and committed to the store as the cache baseline,
 *  so subsequent edits diff against it (= reusedPrefix shrinks) while leaving
 *  the original Case-A split in place when nothing has changed. */
interface BaselineSeed {
  tokens: TokenInfo[];
  reusedPrefix: number;
  prefillNew: number;
  decodeAppended: number;
  totalLen: number;
}

interface LensViewInternal extends LensView {
  /** Non-null only when synthesis is active AND no baseline exists yet. */
  __baselineSeed: BaselineSeed | null;
}

function tokensEqual(a: TokenInfo[], b: TokenInfo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.text !== b[i]!.text) return false;
  }
  return true;
}

export function useLensView(): LensView {
  const state = useConversation();
  const arch = getModel(state.modelKey);
  const tokLoadedV = useTokenizerLoadedVersion(state.tokenizerKey, state.templateFamily);
  const seedBaseline = useConversation((s) => s.seedBaseline);

  const view = useMemo<LensViewInternal>(() => {
    // Only an *explicitly* selected step pins us to a historical snapshot.
    // When nothing is selected, we still want to **preserve the last
    // completed turn's KV state** (prefill + decode counts) until the user
    // either edits a message (which sets `selectedStepId: null`) or starts
    // a new turn. So the rule is:
    //   - If `selectedStepId` is non-null → show that step.
    //   - Otherwise, fall back to the most recent step that carries tokens
    //     (i.e. tokenize / prefill / decode); marker steps like
    //     `compose / template / tool_call / tool_result / final` have no
    //     tokens of their own and would otherwise blank out decode counts.
    let selected: TimelineStep | null = state.selectedStepId
      ? state.steps.find((s) => s.id === state.selectedStepId) ?? null
      : null;
    if (selected && (!selected.tokens || selected.tokens.length === 0)) {
      const idx = state.steps.findIndex((s) => s.id === selected!.id);
      for (let i = idx; i >= 0; i--) {
        const s = state.steps[i]!;
        if (s.tokens && s.tokens.length > 0) {
          selected = s;
          break;
        }
      }
    }

    const tools = getActiveTools();
    // Template family is decoupled from the model architecture: arch only
    // drives KV-cache estimation; this controls render+tokenization.
    const family = state.templateFamily;

    let messages: Message[];
    let templateText = "";
    let tokens: TokenInfo[] = [];
    let reusedPrefix = 0;
    let decodeAppended = 0;
    let prevTokens: TokenInfo[] | undefined;
    let addGenerationPrompt = true;
    let spans: SegmentSpan[] = [];

    if (selected) {
      messages = selected.messagesSnapshot;
      templateText = selected.templateText ?? "";
      tokens = selected.tokens ?? [];
      reusedPrefix = selected.reusedPrefix ?? 0;

      const meta: any = selected.meta;
      if (meta?.snapshot) {
        decodeAppended = meta.snapshot.decodeAppended ?? 0;
        reusedPrefix = meta.snapshot.reusedPrefix ?? reusedPrefix;
      }
      const selectedIdx = state.steps.findIndex((s) => s.id === selected!.id);
      for (let i = selectedIdx - 1; i >= 0; i--) {
        const s = state.steps[i]!;
        if (s.tokens && s.turn < selected!.turn) {
          prevTokens = s.tokens;
          break;
        }
      }
    } else {
      messages = buildOutgoingMessages(state);
      // Live baseline: most recent step that carried tokens; this is what the
      // model "already saw" last time we prefilled. Editing a message and then
      // reverting it should restore reuse vs. that baseline.
      for (let i = state.steps.length - 1; i >= 0; i--) {
        const s = state.steps[i]!;
        if (s.tokens && s.tokens.length > 0) {
          prevTokens = s.tokens;
          break;
        }
      }
      addGenerationPrompt = shouldAddGenerationPrompt(messages);
    }

    // ── Helper: tokenize a message list with given add-gen-prompt setting.
    const tokenizeMsgs = (msgs: Message[], addGen: boolean): TokenInfo[] => {
      const r = renderChatTemplate({ messages: msgs, tools, family, addGenerationPrompt: addGen });
      const { cleanedText, spans: sp } = computeSpans({
        messages: msgs,
        tools,
        family,
        addGenerationPrompt: addGen,
      });
      const text = cleanedText.length > 0 ? cleanedText : r.text;
      const { tokens: toks } = tokenize(text, {
        bundle: r.bundle,
        family,
        spans: sp,
        tokenizerKey: state.tokenizerKey,
      });
      return toks;
    };

    let synthSnapshot: KvSnapshot | undefined;
    let baselineSeed: BaselineSeed | null = null;
    const synthesisActive = !selected && !prevTokens;

    // Synthesize "what the server already has cached for us" plus, when
    // applicable, "what was generated this turn" for the live baseline. The
    // baseline lives in the zustand store and persists across edits — that's
    // what lets `reusedPrefix` shrink as the user edits a prefix message and
    // snap back when they restore it.
    //
    // Decision flow:
    //   1. If a baseline EXISTS in the store → use those tokens as `prev`
    //      for the diff.
    //        * If current tokens equal baseline tokens → no edits since
    //          baseline was frozen. Restore the original snapshot numbers
    //          verbatim (preserves the Case-A reused / prefill / decode
    //          split).
    //        * Otherwise → edit detected. Reused = longest matching token
    //          prefix; prefill = the rest (re-prefill is needed for the
    //          diverged tail); decode = 0 because nothing was generated for
    //          this edited state yet.
    //   2. If NO baseline exists → derive one from the current messages
    //      using the three sub-cases below, render+snapshot accordingly,
    //      and stash the derivation in `baselineSeed` for the effect to
    //      commit after this render.
    //
    // Sub-cases for deriving a fresh baseline:
    //   A. Last message IS assistant → treat that assistant as JUST
    //      DECODED. Reused = tokens before it; prefillNew = the gen-prompt
    //      header that triggered it (e.g. `<|im_start|>assistant\n` for
    //      Qwen, ~0 tokens for the vLLM DeepSeek template since the user
    //      block already glues `<｜Assistant｜>` on the end); decodeAppended
    //      = the assistant's own content + closing tokens.
    //   B. There IS an assistant but it isn't the last message → through
    //      the last assistant is "cached", anything after is "this turn's
    //      prefill" (decode = 0).
    //   C. No assistant → treat the entire loaded context as already
    //      cached.
    if (!prevTokens) {
      if (state.baselineTokens && state.baselineSnapshot) {
        // Use the frozen baseline as `prev` for the diff.
        prevTokens = state.baselineTokens;
      } else {
        // First time: derive Case-A/B/C numbers now; commit them to the
        // store after render via `useEffect`.
        let lastAsstIdx = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i]!.role === "assistant") {
            lastAsstIdx = i;
            break;
          }
        }

        if (lastAsstIdx >= 0 && lastAsstIdx === messages.length - 1) {
          // Case A
          const preAsst = messages.slice(0, lastAsstIdx);
          const preTokens = tokenizeMsgs(preAsst, false);
          const preGenTokens = tokenizeMsgs(preAsst, true);
          prevTokens = preTokens;
          synthSnapshot = makeSnapshot({
            arch,
            tokens: [],
            reusedPrefix: preTokens.length,
            prefillNew: preGenTokens.length - preTokens.length,
            decodeAppended: 0,
          });
          (synthSnapshot as any).__preGenLen = preGenTokens.length;
        } else if (lastAsstIdx >= 0) {
          // Case B
          const baselineMsgs = messages.slice(0, lastAsstIdx + 1);
          prevTokens = tokenizeMsgs(baselineMsgs, false);
        } else {
          // Case C
          prevTokens = tokenizeMsgs(messages, false);
        }
      }
    }

    if (!templateText || tokens.length === 0) {
      const rendered = renderChatTemplate({
        messages,
        tools,
        family,
        addGenerationPrompt,
      });
      const { cleanedText, spans: sp } = computeSpans({
        messages,
        tools,
        family,
        addGenerationPrompt,
      });
      const text = cleanedText.length > 0 ? cleanedText : rendered.text;
      const { tokens: toks } = tokenize(text, {
        bundle: rendered.bundle,
        family,
        spans: sp,
        tokenizerKey: state.tokenizerKey,
      });
      templateText = text;
      tokens = toks;
      spans = sp;
      reusedPrefix = diffPrefix(prevTokens, tokens);
    } else {
      const sp = computeSpans({
        messages,
        tools,
        family,
        addGenerationPrompt,
      }).spans;
      spans = sp;
    }

    // Synthesis active AND baseline already exists in the store: decide
    // whether we're in the "no edits" or "edit detected" branch.
    if (synthesisActive && state.baselineTokens && state.baselineSnapshot) {
      if (tokensEqual(tokens, state.baselineTokens)) {
        // No edits: restore the frozen Case-A split verbatim.
        synthSnapshot = makeSnapshot({
          arch,
          tokens,
          reusedPrefix: state.baselineSnapshot.reusedPrefix,
          prefillNew: state.baselineSnapshot.prefillNew,
          decodeAppended: state.baselineSnapshot.decodeAppended,
        });
        reusedPrefix = state.baselineSnapshot.reusedPrefix;
        decodeAppended = state.baselineSnapshot.decodeAppended;
      } else {
        // Edit detected: reused shrinks to the matching prefix, rest is
        // re-prefill, decode = 0 (no real generation yet for this state).
        const reused = diffPrefix(state.baselineTokens, tokens);
        synthSnapshot = makeSnapshot({
          arch,
          tokens,
          reusedPrefix: reused,
          prefillNew: tokens.length - reused,
          decodeAppended: 0,
        });
        reusedPrefix = reused;
        decodeAppended = 0;
      }
    } else if (synthSnapshot) {
      // First-time synthesis path: finalize the derived Case-A snapshot now
      // that we know full `tokens`, and remember the seed so the effect
      // below can freeze it as the baseline.
      const preGenLen = (synthSnapshot as any).__preGenLen as number;
      const decode = Math.max(0, tokens.length - preGenLen);
      const reused = synthSnapshot.reusedPrefix;
      const prefill = synthSnapshot.prefillNew;
      synthSnapshot = makeSnapshot({
        arch,
        tokens,
        reusedPrefix: reused,
        prefillNew: prefill,
        decodeAppended: decode,
      });
      reusedPrefix = reused;
      decodeAppended = decode;
      baselineSeed = {
        tokens,
        reusedPrefix: reused,
        prefillNew: prefill,
        decodeAppended: decode,
        totalLen: reused + prefill + decode,
      };
    } else if (synthesisActive) {
      // Case B / C: no separate Case-A snapshot was built; the standard
      // diff-against-prev path already produced the right numbers. Still
      // seed baseline so future renders honor the same prev.
      const prefill = tokens.length - reusedPrefix;
      baselineSeed = {
        tokens,
        reusedPrefix,
        prefillNew: prefill,
        decodeAppended: 0,
        totalLen: tokens.length,
      };
    }

    // Defer baseline seeding while the *requested* tokenizer hasn't
    // resolved yet. `resolveTokenizer` falls back to harmony when an HF
    // tokenizer is missing/loading; seeding with those fallback tokens
    // would make `reusedPrefix` flash to 0 the moment the real HF
    // tokenizer arrives (the diff against the brand-new HF tokens finds
    // no matching prefix). Wait until the resolved key actually matches
    // what the user asked for.
    const requestedTokKey = state.tokenizerKey ?? defaultTokenizerKey(family);
    const resolvedTokKey = resolveTokenizer(family, state.tokenizerKey).key;
    const tokMismatch = resolvedTokKey !== requestedTokKey;
    const seedToCommit = tokMismatch ? null : baselineSeed;

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
      addGenerationPrompt,
      spans,
      precomputedSnapshot: synthSnapshot,
      __baselineSeed: seedToCommit,
    };
  }, [
    state.steps,
    state.selectedStepId,
    state.messages,
    state.systemPrompt,
    state.enabledTools,
    state.modelKey,
    state.tokenizerKey,
    state.templateFamily,
    state.baselineTokens,
    state.baselineSnapshot,
    tokLoadedV,
    arch,
  ]);

  // After first render in the synthesis branch, freeze the derived snapshot
  // as the cache baseline. `seedBaseline` is a no-op when a baseline is
  // already present, so this is safe to run on every render.
  useEffect(() => {
    const seed = view.__baselineSeed;
    if (seed) seedBaseline(seed);
  }, [view.__baselineSeed, seedBaseline]);

  return view;
}

export function useKvSnapshot() {
  const view = useLensView();
  return useMemo(
    () =>
      view.precomputedSnapshot ??
      snapshotKv({
        arch: view.arch,
        prevTokens: view.prevTokens,
        currTokens: view.tokens,
        decodeAppended: view.decodeAppended,
      }),
    [view],
  );
}
