/**
 * Lightweight tokenizer wrapper.
 *
 * Design rule: be **honest**. We do not pre-segment the input on declared
 * special tokens before handing it to the tokenizer. Each tokenizer is asked
 * to encode the *raw* chat-template text and we display whatever it produces:
 *
 *   - `cl100k_base` (GPT-4): doesn't know any chat-template specials → splits
 *     `<|im_start|>` into BPE pieces (`<`, `|`, `im`, `_start`, `|`, `>`).
 *     Faithful for non-OpenAI text but glues `><` across message boundaries.
 *   - `o200k_harmony` (GPT-OSS): the production tokenizer that ships with
 *     gpt-oss; recognises Harmony-format specials (`<|start|>`, `<|end|>`,
 *     `<|message|>`, `<|channel|>`, `<|return|>`, `<|call|>`, `<|constrain|>`,
 *     plus ChatML's `<|im_start|>` / `<|im_end|>`) as single special ids.
 *   - HF AutoTokenizer (Qwen3 / DeepSeek-V3): each model's own tokenizer;
 *     recognises *its own* specials as single ids natively.
 *
 * The `isSpecial` flag on a token is computed post-hoc by matching the
 * decoded text against a `<|name|>` / `<｜name｜>` pattern — purely cosmetic.
 */
import { encode as encodeCl100k, decode as decodeCl100k } from "gpt-tokenizer/encoding/cl100k_base";
import {
  encode as encodeHarmonyRaw,
  decode as decodeHarmony,
  default as harmonyDefault,
} from "gpt-tokenizer/encoding/o200k_harmony";

import type { TokenInfo, TokenSegment, Role } from "./types";
import type { TemplateBundle } from "./chatTemplates";

export interface TokenizerEntry {
  key: string;
  label: string;
  /** Approximate vocab size for stat tiles; not used for actual encoding. */
  vocabSize: number;
  encode: (text: string) => number[];
  decode: (ids: number[]) => string;
}

// `gpt-tokenizer`'s default for `disallowedSpecial` is "all" — it throws if
// the input contains any registered special literal. For BPE-style tokenizers
// (cl100k) we want the input encoded as ordinary text (no specials), so we
// pass an empty `disallowedSpecial` set.
const ALLOW_ALL_AS_BPE = { disallowedSpecial: new Set<string>() } as const;

// gpt-tokenizer 3.4 has a bug where `encode(text, { allowedSpecial: "all" })`
// only recognises a special token at offset 0 (sticky regex never advances).
// Harmony's *production* behaviour, however, is to recognise EVERY registered
// special as a single id (that's what gpt-oss sees during inference). So we
// pre-split on the harmony special-token list, look up each match's real id
// from the encoder's internal map, and BPE-encode the runs in between. This
// is still honest: it produces the same token sequence the model gets.
const HARMONY_SPECIALS_ENCODER: Map<string, number> = (() => {
  const core = (harmonyDefault as any)?.bytePairEncodingCoreProcessor;
  const map = core?.specialTokensEncoder;
  if (map instanceof Map) return map;
  return new Map();
})();
// Only honour named specials (skip the ~1000 `<|reserved_XXXX|>` entries).
const HARMONY_NAMED_SPECIALS: string[] = [...HARMONY_SPECIALS_ENCODER.keys()]
  .filter((k) => !k.startsWith("<|reserved_"))
  .sort((a, b) => b.length - a.length);
const HARMONY_SPECIAL_RE = HARMONY_NAMED_SPECIALS.length
  ? new RegExp(
      HARMONY_NAMED_SPECIALS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
      "g",
    )
  : null;

function encodeHarmony(text: string): number[] {
  if (!HARMONY_SPECIAL_RE) return encodeHarmonyRaw(text, ALLOW_ALL_AS_BPE);
  const out: number[] = [];
  let cursor = 0;
  HARMONY_SPECIAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HARMONY_SPECIAL_RE.exec(text)) !== null) {
    if (m.index > cursor) {
      const chunk = text.slice(cursor, m.index);
      out.push(...encodeHarmonyRaw(chunk, ALLOW_ALL_AS_BPE));
    }
    out.push(HARMONY_SPECIALS_ENCODER.get(m[0])!);
    cursor = m.index + m[0].length;
    if (m.index === HARMONY_SPECIAL_RE.lastIndex) HARMONY_SPECIAL_RE.lastIndex++;
  }
  if (cursor < text.length) {
    out.push(...encodeHarmonyRaw(text.slice(cursor), ALLOW_ALL_AS_BPE));
  }
  return out;
}

export const TOKENIZER_REGISTRY: Record<string, TokenizerEntry> = {
  harmony: {
    key: "harmony",
    label: "GPT-OSS",
    vocabSize: 201088,
    encode: encodeHarmony,
    decode: (ids) => decodeHarmony(ids),
  },
  cl100k: {
    key: "cl100k",
    label: "GPT-4",
    vocabSize: 100277,
    encode: (t) => encodeCl100k(t, ALLOW_ALL_AS_BPE),
    decode: (ids) => decodeCl100k(ids),
  },
};

export function listTokenizers(): TokenizerEntry[] {
  return Object.values(TOKENIZER_REGISTRY);
}

const SPECIAL_TOKEN_RE = /^(<\|[^|<>\s]+\|>|<｜[^｜<>\s]+｜>|<\/?s>|\[(?:INST|\/INST|SYSTEM_PROMPT|\/SYSTEM_PROMPT|TOOL_CALLS|TOOL_RESULTS|\/TOOL_RESULTS|gMASK)\])$/;

/** Heuristic check on a *decoded* token's text — cosmetic only. */
export function looksLikeSpecial(text: string): boolean {
  if (text.length < 3 || text.length > 64) return false;
  return SPECIAL_TOKEN_RE.test(text);
}

/**
 * Lazy-loaded "real" tokenizers downloaded from HuggingFace via
 * `@huggingface/transformers`. We list each family's most representative open
 * checkpoint (most are tokenizer-only mirrors so they're small to fetch).
 */
export interface HfTokenizerSpec {
  key: string;
  label: string;
  hfId: string;
  family: string;
}

export const HF_TOKENIZER_SPECS: Record<string, HfTokenizerSpec> = {
  qwen3: {
    key: "qwen3",
    label: "Qwen3",
    hfId: "Qwen/Qwen3-0.6B",
    family: "qwen",
  },
  deepseek_v3: {
    key: "deepseek_v3",
    label: "DeepSeek-V3",
    hfId: "deepseek-ai/DeepSeek-V3",
    family: "deepseek",
  },
};

export function listHfTokenizers(): HfTokenizerSpec[] {
  return Object.values(HF_TOKENIZER_SPECS);
}

const hfCache = new Map<string, TokenizerEntry>();
const hfPending = new Map<string, Promise<TokenizerEntry>>();
const hfErrors = new Map<string, string>();
type LoadListener = () => void;
const loadListeners = new Set<LoadListener>();

/**
 * Subscribe to "an HF tokenizer finished loading (or failed)" events. Returns
 * an unsubscribe function. Used by React hooks to trigger re-renders so the
 * lenses re-tokenize once the real tokenizer arrives.
 */
export function onTokenizerLoadEvent(cb: LoadListener): () => void {
  loadListeners.add(cb);
  return () => loadListeners.delete(cb);
}

function emitLoadEvent() {
  for (const cb of loadListeners) cb();
}

export function hfTokenizerStatus(key: string | null | undefined): "ready" | "loading" | "error" | "idle" {
  if (!key) return "idle";
  if (hfErrors.has(key)) return "error";
  if (hfCache.has(key)) return "ready";
  if (hfPending.has(key)) return "loading";
  return "idle";
}

export function hfTokenizerError(key: string): string | undefined {
  return hfErrors.get(key);
}

/**
 * Configure transformers.js to be friendly to CN users:
 *   1. If `public/tokenizers/<hfId>/tokenizer.json` exists (bundled via
 *      `pnpm fetch-tokenizers`), load it locally — zero network.
 *   2. Otherwise fall back to a configurable mirror; default is the popular
 *      community mirror `https://hf-mirror.com/` which proxies HuggingFace and
 *      is generally reachable inside China.
 *   3. Operators can override the mirror with `PUBLIC_HF_MIRROR` at build time.
 */
function configureTransformersEnv(env: any) {
  // Local first (served from /public/tokenizers/ via Astro static handling).
  env.allowLocalModels = true;
  // In-browser, transformers.js fetches `${localModelPath}${modelId}/...`.
  env.localModelPath = "/tokenizers/";
  // Remote fallback.
  env.allowRemoteModels = true;
  const mirror =
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.PUBLIC_HF_MIRROR) ||
    "https://hf-mirror.com/";
  env.remoteHost = mirror;
  env.remotePathTemplate = "{model}/resolve/{revision}/{file}";
}

/** Kick off HF tokenizer load if not already cached/in-flight. Idempotent. */
export function loadHfTokenizer(key: string): Promise<TokenizerEntry> {
  const cached = hfCache.get(key);
  if (cached) return Promise.resolve(cached);
  const inFlight = hfPending.get(key);
  if (inFlight) return inFlight;
  const spec = HF_TOKENIZER_SPECS[key];
  if (!spec) return Promise.reject(new Error(`unknown HF tokenizer: ${key}`));

  hfErrors.delete(key);
  const promise = (async () => {
    const mod = await import("@huggingface/transformers");
    const { AutoTokenizer, env } = mod;
    configureTransformersEnv(env);
    const tok = await AutoTokenizer.from_pretrained(spec.hfId);
    // transformers.js exposes `get_vocab()` returning a token→id Map.
    let vocabSize = 0;
    const getVocab = (tok as any).get_vocab;
    if (typeof getVocab === "function") {
      const v = getVocab.call(tok);
      vocabSize = v?.size ?? (typeof v === "object" ? Object.keys(v).length : 0);
    }
    // `add_special_tokens: false` here means "don't auto-prepend BOS / append
    // EOS". Special tokens that appear *inside* the input (e.g. `<|im_start|>`)
    // are still recognised as their single special ids from the vocab's
    // added_tokens — that's the honest, default tokenizer behaviour we want.
    const entry: TokenizerEntry = {
      key,
      label: spec.label,
      vocabSize,
      encode: (text: string) =>
        (tok as any).encode(text, { add_special_tokens: false }) as number[],
      decode: (ids: number[]) =>
        (tok as any).decode(ids, { skip_special_tokens: false }) as string,
    };
    hfCache.set(key, entry);
    return entry;
  })();
  hfPending.set(key, promise);
  promise
    .catch((e: Error) => {
      hfErrors.set(key, e.message);
    })
    .finally(() => {
      hfPending.delete(key);
      emitLoadEvent();
    });
  return promise;
}

/**
 * Default tokenizer for a chat-template family when the user hasn't picked
 * one explicitly. Each family points to the HF tokenizer that *matches* it,
 * with a built-in tiktoken as fallback for families that don't have one
 * bundled (e.g. gpt-oss → harmony). Callers should also trigger the HF load via
 * `useTokenizerLoadedVersion` so the UI re-renders once the real tokenizer
 * arrives — until then `resolveTokenizer` falls back to o200k as a proxy.
 */
const FAMILY_DEFAULT_TOKENIZER: Record<string, string> = {
  qwen: "qwen3",
  deepseek: "deepseek_v3",
  gpt_oss: "harmony",
};

export function defaultTokenizerKey(family: string): string {
  return FAMILY_DEFAULT_TOKENIZER[family] ?? "harmony";
}

export function resolveTokenizer(family: string, override?: string | null): TokenizerEntry {
  const key = override ?? defaultTokenizerKey(family);
  if (TOKENIZER_REGISTRY[key]) return TOKENIZER_REGISTRY[key];
  const hf = hfCache.get(key);
  if (hf) return hf;
  // HF tokenizer requested but not yet loaded → fall back to harmony as a
  // proxy. harmony is a superset of o200k_base plus harmony specials, so it
  // doubles as a reasonable BPE fallback for non-OpenAI templates while
  // recognising any ChatML / Harmony specials that happen to appear.
  return TOKENIZER_REGISTRY.harmony!;
}

export interface SegmentSpan {
  start: number;
  end: number;
  segment: TokenSegment;
  role?: Role;
  messageId?: string;
}

export interface TokenizeOptions {
  /** Kept for API compatibility — no longer consulted. */
  bundle?: TemplateBundle;
  family: string;
  spans?: SegmentSpan[];
  /** Override the default family→tokenizer mapping. Key from `TOKENIZER_REGISTRY`. */
  tokenizerKey?: string | null;
}

function segmentForOffset(
  offset: number,
  spans: SegmentSpan[],
): { segment: TokenSegment; role?: Role; messageId?: string } {
  for (const s of spans) {
    if (offset >= s.start && offset < s.end) {
      return { segment: s.segment, role: s.role, messageId: s.messageId };
    }
  }
  return { segment: "control" };
}

export interface TokenizeResult {
  tokens: TokenInfo[];
  totalCount: number;
}

/**
 * Encode the entire chat-template text in one shot — no pre-splitting on
 * declared special tokens. This honestly reflects what each tokenizer does:
 * tiktoken will fragment `<|im_start|>` into multiple BPE tokens; HF
 * AutoTokenizer will collapse it into a single special id from
 * `added_tokens_decoder`. Either is shown as-is.
 *
 * The `isSpecial` flag is a *cosmetic* post-hoc check (regex on the decoded
 * text) used by the UI for bolding.
 */
export function tokenize(text: string, opts: TokenizeOptions): TokenizeResult {
  const { family, spans, tokenizerKey } = opts;
  const { encode, decode } = resolveTokenizer(family, tokenizerKey);

  const ids = encode(text);
  const tokens: TokenInfo[] = [];
  let cursor = 0;
  let position = 0;

  for (const id of ids) {
    let t = decode([id]);
    // Locate `t` starting at `cursor`. Most of the time the tokenizer's
    // decoded text agrees byte-for-byte with the source at this offset, but
    // some BPE pieces are partial-byte UTF-8 fragments — gpt-tokenizer
    // returns "" for those while HF tokenizers return the U+FFFD replacement
    // character (or a fragment containing it). Either way we cannot locate
    // them in the source; treat them as zero-width and DO NOT advance
    // `cursor`. The next id whose decode produces a real substring will
    // re-anchor us via `indexOf`. (Advancing on a missed match was the
    // root cause of cascading drift across multi-byte CJK runs.)
    let charStart = cursor;
    let charLen = 0;
    if (t.length > 0) {
      const found = text.indexOf(t, cursor);
      if (found >= 0 && found - cursor <= 8) {
        // Tolerate small drift (some HF tokenizers strip leading whitespace
        // in `decode([id])`).
        charStart = found;
        charLen = t.length;
        cursor = found + t.length;
      } else {
        // Couldn't anchor — surface as an empty/partial-byte token so the UI
        // renders an invisible-but-hoverable placeholder at the right offset.
        t = "";
      }
    }
    const seg = spans
      ? segmentForOffset(charStart, spans)
      : { segment: "control" as TokenSegment };
    tokens.push({
      id,
      text: t,
      position: position++,
      segment: seg.segment,
      isSpecial: looksLikeSpecial(t),
      role: seg.role,
      messageId: seg.messageId,
      charStart,
      charLen,
    });
  }

  return { tokens, totalCount: tokens.length };
}

/** Cheap token-count estimate without span tracking. */
export function countTokens(text: string, family: string, tokenizerKey?: string | null): number {
  const { encode } = resolveTokenizer(family, tokenizerKey);
  return encode(text).length;
}
