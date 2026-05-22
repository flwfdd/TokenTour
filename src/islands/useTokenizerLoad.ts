import { useEffect, useState } from "react";
import {
  HF_TOKENIZER_SPECS,
  defaultTokenizerKey,
  hfTokenizerStatus,
  loadHfTokenizer,
  onTokenizerLoadEvent,
} from "~/lib/tokenizer";

/**
 * Subscribe to HF tokenizer load events so React can re-render lenses once
 * the real (async-fetched) tokenizer is available. Returns a monotonically
 * increasing version number that bumps every time a tokenizer finishes
 * loading or fails.
 *
 * Also kicks off the load if either:
 *   - `tokenizerKey` is an HF spec, OR
 *   - `tokenizerKey` is null and the current chat-template `family`'s
 *     auto-default points at an HF spec (e.g. family=qwen → "qwen3").
 */
export function useTokenizerLoadedVersion(
  tokenizerKey: string | null,
  family?: string,
): number {
  const [v, setV] = useState(0);

  useEffect(() => {
    return onTokenizerLoadEvent(() => setV((x) => x + 1));
  }, []);

  useEffect(() => {
    const resolved =
      tokenizerKey ?? (family ? defaultTokenizerKey(family) : null);
    if (resolved && resolved in HF_TOKENIZER_SPECS) {
      const status = hfTokenizerStatus(resolved);
      if (status === "idle" || status === "error") {
        // Fire-and-forget; emitLoadEvent inside loadHfTokenizer will trigger
        // the listener above and bump `v`.
        void loadHfTokenizer(resolved);
      }
    }
  }, [tokenizerKey, family]);

  return v;
}
