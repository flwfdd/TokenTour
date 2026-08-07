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
import {
  encode as encodeCl100k,
  decode as decodeCl100k,
  default as cl100kDefault,
} from "gpt-tokenizer/encoding/cl100k_base";
import {
  encode as encodeHarmonyRaw,
  decode as decodeHarmony,
  default as harmonyDefault,
} from "gpt-tokenizer/encoding/o200k_harmony";

import type { TokenInfo, TokenSegment, Role } from "./types";
import { getTemplateBundle } from "./chatTemplates";

export interface TokenizerEntry {
  key: string;
  label: string;
  /** Approximate vocab size for stat tiles; not used for actual encoding. */
  vocabSize: number;
  encode: (text: string) => number[];
  decode: (ids: number[]) => string;
  /**
   * Raw UTF-8 bytes for a single token id, or `null` if unknown. Lets the
   * tokenizer be walked at the byte level so multi-token characters (emoji /
   * rare CJK split across several byte-level tokens) render each fragment
   * faithfully instead of collapsing into one glyph + an empty placeholder. */
  tokenBytes?: (id: number) => Uint8Array | null;
}

const TEXT_ENCODER = new TextEncoder();

/** `\xF0\x9F` byte-escape rendering for token fragments that aren't valid UTF-8 on their own. */
function bytesToEscapes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += "\\x" + b.toString(16).toUpperCase().padStart(2, "0");
  return s;
}

/**
 * Per-token bytes for a `gpt-tokenizer` encoding. Its core processor maps every
 * id to either a decoded string (text tokens) or a raw byte array (partial
 * UTF-8 fragments); special ids live in a separate id→literal map.
 */
function makeGptTokenBytes(core: any): ((id: number) => Uint8Array | null) | undefined {
  const dec = core?.bytePairRankDecoder;
  const specials = core?.specialTokensDecoder;
  if (!Array.isArray(dec)) return undefined;
  return (id: number) => {
    const v = dec[id];
    if (v != null) {
      if (typeof v === "string") return TEXT_ENCODER.encode(v);
      if (v instanceof Uint8Array) return v;
      if (Array.isArray(v)) return Uint8Array.from(v);
    }
    const s = specials?.get?.(id);
    if (typeof s === "string") return TEXT_ENCODER.encode(s);
    return null;
  };
}

// GPT-2 `bytes_to_unicode`, inverted (unicode char → byte). Byte-level BPE
// tokenizers (Qwen / DeepSeek / Llama …) store token strings in this alphabet;
// inverting it recovers each token's raw bytes.
const UNICODE_TO_BYTES: Record<string, number> = (() => {
  const bs: number[] = [];
  for (let i = 0x21; i <= 0x7e; i++) bs.push(i);
  for (let i = 0xa1; i <= 0xac; i++) bs.push(i);
  for (let i = 0xae; i <= 0xff; i++) bs.push(i);
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n);
      n++;
    }
  }
  const map: Record<string, number> = {};
  for (let i = 0; i < bs.length; i++) map[String.fromCodePoint(cs[i])] = bs[i];
  return map;
})();

/**
 * Per-token bytes for a transformers.js tokenizer. The internal pieces
 * (`model.vocab`, the byte-level `decoder.byte_decoder`, `added_tokens_map`)
 * live on the wrapped `_tokenizer`. Regular tokens are stored in the byte-level
 * alphabet (mapped back to bytes via the decoder's own table); added/special
 * tokens and SentencePiece `<0xXX>` byte-fallback tokens are handled directly.
 */
function makeHfTokenBytes(tok: any): (id: number) => Uint8Array | null {
  const inner = tok?._tokenizer ?? tok;
  const vocab = inner?.model?.vocab;
  const addedMap = inner?.added_tokens_map;
  // The decoder's byte_decoder maps each byte-alphabet char → byte (values may
  // be strings — object keys — so coerce with Number). Fall back to the
  // standard GPT-2 table if the decoder doesn't expose one.
  const byteDecoder: Record<string, number | string> | undefined =
    inner?.decoder?.byte_decoder;
  const map: Record<string, number | string> = byteDecoder ?? UNICODE_TO_BYTES;
  if (!vocab) return () => null;
  const byteFallbackRe = /^<0x([0-9A-Fa-f]{2})>$/;
  return (id: number) => {
    const raw = vocab[id];
    if (typeof raw !== "string") return null;
    // Added/special tokens are stored as their literal string.
    if (addedMap?.has?.(raw)) return TEXT_ENCODER.encode(raw);
    // SentencePiece-style byte-fallback token: `<0xF0>` → one raw byte.
    const bf = byteFallbackRe.exec(raw);
    if (bf) return Uint8Array.from([parseInt(bf[1], 16)]);
    // Byte-level alphabet (GPT-2 / Qwen / DeepSeek): map each char → byte.
    const bytes: number[] = [];
    for (const ch of raw) {
      const b = map[ch];
      if (b === undefined) return TEXT_ENCODER.encode(raw); // not byte-level → literal
      bytes.push(Number(b));
    }
    return Uint8Array.from(bytes);
  };
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
    tokenBytes: makeGptTokenBytes((harmonyDefault as any)?.bytePairEncodingCoreProcessor),
  },
  cl100k: {
    key: "cl100k",
    label: "GPT-4",
    vocabSize: 100277,
    encode: (t) => encodeCl100k(t, ALLOW_ALL_AS_BPE),
    decode: (ids) => decodeCl100k(ids),
    tokenBytes: makeGptTokenBytes((cl100kDefault as any)?.bytePairEncodingCoreProcessor),
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

/** True when `key` names an HF tokenizer that hasn't finished loading. */
export function isHfPending(key: string | null | undefined): boolean {
  return !!key && key in HF_TOKENIZER_SPECS && hfTokenizerStatus(key) !== "ready";
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
      tokenBytes: makeHfTokenBytes(tok),
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
 * Default tokenizer for a chat-template family when the user picks "auto".
 * Lives on the template bundle so adding a family only touches one file.
 * Callers should also trigger the HF load via `useTokenizerLoadedVersion`
 * so the UI re-renders once the real tokenizer arrives — until then
 * `resolveTokenizer` falls back to harmony as a proxy.
 */
export function defaultTokenizerKey(family: string): string {
  return getTemplateBundle(family).defaultTokenizerKey;
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
  return { segment: "system" };
}

/**
 * Attribute a token spanning `[start, end)` to the segment it MOSTLY covers,
 * rather than the one its first character happens to land in.
 *
 * Why: when the active tokenizer doesn't recognise a template's special
 * markers (e.g. the harmony fallback meeting DeepSeek's full-width `<｜User｜>`),
 * BPE can glue a marker's leading `<` onto the trailing text of the *previous*
 * segment into a single token. Start-offset attribution then paints that
 * whole token — including the `<` that opens the new message — with the
 * previous segment's color (the reported "user's first `<` shows up as
 * system / tool"). Majority overlap fixes the common case; ties resolve to the
 * LATER span (spans are sorted ascending), so an opening marker wins over the
 * tail of the segment it follows.
 */
function segmentForRange(
  start: number,
  end: number,
  spans: SegmentSpan[],
): { segment: TokenSegment; role?: Role; messageId?: string } {
  if (end <= start) return segmentForOffset(start, spans);
  let best: SegmentSpan | null = null;
  let bestOverlap = 0;
  for (const s of spans) {
    const lo = start > s.start ? start : s.start;
    const hi = end < s.end ? end : s.end;
    const overlap = hi - lo;
    if (overlap <= 0) continue;
    if (overlap >= bestOverlap) {
      bestOverlap = overlap;
      best = s;
    }
  }
  if (!best) return { segment: "system" };
  return { segment: best.segment, role: best.role, messageId: best.messageId };
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
  const entry = resolveTokenizer(family, tokenizerKey ?? null);
  const ids = entry.encode(text);

  // Preferred: walk the source at the BYTE level. This faithfully renders
  // multi-token characters — each fragment shows its own bytes (`\xHH`) with a
  // correct byte count — instead of collapsing into one glyph + empty token.
  if (entry.tokenBytes) {
    const byteResult = tokenizeByBytes(text, ids, entry.tokenBytes, spans);
    if (byteResult) return byteResult;
  }
  // Fallback: char-level anchoring (tokenizers without byte access, or when
  // token bytes don't reconstruct the source losslessly).
  return tokenizeByChars(text, ids, entry.decode, spans);
}

/**
 * Byte-accurate tokenization. Concatenated token bytes are expected to equal
 * the source bytes exactly (true for lossless byte-level BPE); if they drift we
 * return `null` so the caller falls back to char anchoring.
 */
function tokenizeByBytes(
  text: string,
  ids: number[],
  tokenBytes: (id: number) => Uint8Array | null,
  spans: SegmentSpan[] | undefined,
): TokenizeResult | null {
  const srcBytes = TEXT_ENCODER.encode(text);
  // byte offset → UTF-16 code-unit offset at the start of the codepoint that
  // contains that byte. Lets us turn a token's byte range into a char range.
  const byteToChar = new Int32Array(srcBytes.length + 1);
  {
    let bi = 0;
    let ci = 0;
    for (const ch of text) {
      const nb = TEXT_ENCODER.encode(ch).length;
      for (let k = 0; k < nb; k++) byteToChar[bi + k] = ci;
      bi += nb;
      ci += ch.length;
    }
    byteToChar[srcBytes.length] = text.length;
  }

  const decoder = new TextDecoder("utf-8");
  const tokens: TokenInfo[] = [];
  let bytePos = 0;
  let position = 0;

  for (const id of ids) {
    const tb = tokenBytes(id);
    if (!tb || tb.length === 0) return null;
    const start = bytePos;
    const end = start + tb.length;
    if (end > srcBytes.length) return null;
    for (let k = 0; k < tb.length; k++) {
      if (srcBytes[start + k] !== tb[k]) return null; // not lossless → bail
    }
    const charStart = byteToChar[start];
    const charEnd = byteToChar[end];
    // `text` is the readable SOURCE substring this token covers (so the
    // chat-template pane reconstructs correctly — a multi-token char's glyph
    // lands on the fragment that closes it, the others get ""). When the
    // token's OWN bytes aren't valid UTF-8 (a fragment), also record a
    // `\xHH` byte view for the Tokens pane so the split is visible.
    const sourceText = text.slice(charStart, charEnd);
    const own = decoder.decode(tb);
    const isFragment = own.includes("\uFFFD");
    const seg = spans
      ? segmentForRange(charStart, charEnd, spans)
      : { segment: "system" as TokenSegment };
    tokens.push({
      id,
      text: sourceText,
      position: position++,
      segment: seg.segment,
      isSpecial: looksLikeSpecial(sourceText),
      role: seg.role,
      messageId: seg.messageId,
      charStart,
      charLen: charEnd - charStart,
      byteLen: tb.length,
      byteText: isFragment ? bytesToEscapes(tb) : undefined,
    });
    bytePos = end;
  }
  if (bytePos !== srcBytes.length) return null;
  return { tokens, totalCount: tokens.length };
}

/**
 * Fallback path: locate each decoded token in the source by `indexOf`. Handles
 * tokenizers that don't expose per-token bytes. Multi-token characters are
 * buffered until the group decodes cleanly, then attributed to the final
 * fragment (mirroring tiktoken's empty-piece + completing-piece behaviour).
 */
function tokenizeByChars(
  text: string,
  ids: number[],
  decode: (ids: number[]) => string,
  spans: SegmentSpan[] | undefined,
): TokenizeResult {
  const tokens: TokenInfo[] = [];
  let cursor = 0;
  let position = 0;

  const pushToken = (id: number, t: string, charStart: number, charLen: number) => {
    const seg = spans
      ? segmentForRange(charStart, charStart + charLen, spans)
      : { segment: "system" as TokenSegment };
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
      byteLen: TEXT_ENCODER.encode(t).length,
    });
  };

  const anchor = (s: string): number => {
    if (s.length === 0) return cursor;
    if (s.includes("\uFFFD")) return -1;
    const found = text.indexOf(s, cursor);
    return found >= 0 && found - cursor <= 8 ? found : -1;
  };

  let pending: number[] = [];

  for (const id of ids) {
    if (pending.length > 0) {
      pending.push(id);
      const groupText = decode(pending);
      if (groupText.includes("\uFFFD")) continue;
      const found = anchor(groupText);
      if (found >= 0 && groupText.length > 0) {
        const last = pending.length - 1;
        pending.forEach((pid, i) => {
          if (i < last) pushToken(pid, "", found, 0);
          else pushToken(pid, groupText, found, groupText.length);
        });
        cursor = found + groupText.length;
      } else {
        for (const pid of pending) pushToken(pid, "", cursor, 0);
      }
      pending = [];
      continue;
    }

    const t = decode([id]);
    if (t.length === 0) {
      pushToken(id, "", cursor, 0);
      continue;
    }
    const found = anchor(t);
    if (found >= 0) {
      pushToken(id, t, found, t.length);
      cursor = found + t.length;
    } else if (t.includes("\uFFFD")) {
      pending = [id];
    } else {
      pushToken(id, "", cursor, 0);
    }
  }

  for (const pid of pending) pushToken(pid, "", cursor, 0);

  return { tokens, totalCount: tokens.length };
}

/** Cheap token-count estimate without span tracking. */
export function countTokens(text: string, family: string, tokenizerKey?: string | null): number {
  const { encode } = resolveTokenizer(family, tokenizerKey);
  return encode(text).length;
}
