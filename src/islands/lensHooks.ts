import { useEffect, useMemo } from "react";
import { useConversation } from "~/store";
import { getModel } from "~/lib/modelRegistry";
import { snapshotKv } from "~/lib/kvSim";
import { deriveLensView, type LensView } from "./lensSynthesis";
import { useTokenizerLoadedVersion } from "./useTokenizerLoad";

export type { LensView } from "./lensSynthesis";

/**
 * Subscribes to the conversation store, runs the pure synthesis function
 * to produce a `LensView`, and commits the derived baseline (if any) so
 * future renders take the frozen-baseline path.
 */
export function useLensView(): LensView {
  const state = useConversation();
  const arch = getModel(state.modelKey);
  // Bumps a version every time an HF tokenizer finishes loading; included
  // in the memo deps below so the view re-derives with the real tokenizer.
  const tokLoadedV = useTokenizerLoadedVersion(state.tokenizerKey, state.templateFamily);
  const seedBaseline = useConversation((s) => s.seedBaseline);

  const view = useMemo(
    () => deriveLensView({ state, arch }),
    [
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
    ],
  );

  useEffect(() => {
    if (view.__baselineSeed) seedBaseline(view.__baselineSeed);
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
