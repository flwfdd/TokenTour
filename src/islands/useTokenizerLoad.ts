import { useEffect, useState } from "react";
import {
  HF_TOKENIZER_SPECS,
  defaultTokenizerKey,
  hfTokenizerStatus,
  loadHfTokenizer,
  onTokenizerLoadEvent,
} from "~/lib/tokenizer";

/**
 * Subscribe to HF tokenizer load events so React can re-render lenses
 * once the real async-fetched tokenizer arrives. Returns a monotonically
 * increasing version number that bumps every time *any* tokenizer
 * finishes loading or fails (cheap — a single event source feeds every
 * subscriber).
 *
 * Also kicks off the load for each requested key, plus the family's
 * auto-default when its entry is `null` — so the very common
 * "tokenizerKey=null, family=qwen → qwen3" case still triggers the HF
 * fetch on first render.
 */
export function useTokenizerLoadedVersions(keys: (string | null | undefined)[], family?: string): number {
  const [v, setV] = useState(0);

  useEffect(() => onTokenizerLoadEvent(() => setV((x) => x + 1)), []);

  // Eagerly resolve each requested key (or the family auto-default) to an
  // HF spec and kick off the load. Stable string for memo deps avoids
  // re-firing the effect when keys are equal but the array identity isn't.
  const depKey = keys.map((k) => k ?? "").join("|") + "::" + (family ?? "");
  useEffect(() => {
    for (const k of keys) {
      const resolved = k ?? (family ? defaultTokenizerKey(family) : null);
      if (resolved && resolved in HF_TOKENIZER_SPECS) {
        const status = hfTokenizerStatus(resolved);
        if (status === "idle" || status === "error") void loadHfTokenizer(resolved);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  return v;
}

/** Single-key convenience wrapper kept for `lensHooks.ts` where the deps
 *  list already varies per the chosen tokenizer. */
export function useTokenizerLoadedVersion(key: string | null, family?: string): number {
  return useTokenizerLoadedVersions([key], family);
}
