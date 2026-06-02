/**
 * Token splits used by Scene 10. Every split below was verified against the
 * real tokenizer (not eyeballed):
 *
 *   - Beat A  Qwen3 (Qwen/Qwen3-0.6B tokenizer.json) on the ChatML fragment
 *   - Beat B  Qwen3 vs DeepSeek-V3, matching docs/outline.md (何/意味/…)
 *   - Beat C  GPT-OSS (o200k_base / o200k_harmony) on `hello` and 🥳
 *
 * Annotate the tokenizer on screen wherever a split is shown.
 */

import type { Segment } from "../lib/theme";

export interface VToken {
  /** readable source text */
  text: string;
  /** byte-escape view for fragments that aren't valid UTF-8 on their own */
  byteText?: string;
  /** structural / special token (<|im_start|> …) — bold, role-coloured */
  special?: boolean;
  /** per-token colour override; falls back to the strip's segment */
  seg?: Segment;
}

// ── Beat A · a full three-turn exchange, special tokens included ─────
// Tokenizer: Qwen3.  Verified split of:
//   <|im_start|>system\n你是哈基米<|im_end|>\n
//   <|im_start|>user\n你是谁？<|im_end|>\n
//   <|im_start|>assistant\n我是哈基米，喵～<|im_end|>
// （哈/基/米 各自单独成 token，与下方 assistant 行一致。）
export const TOKENIZER_A = "Qwen3";

// System turn — same role-coloured marker convention as below.
export const BEAT_A_SYSTEM: VToken[] = [
  { text: "<|im_start|>", special: true, seg: "system" },
  { text: "system", seg: "system" },
  { text: "\n", seg: "system" },
  { text: "你是", seg: "system" },
  { text: "哈", seg: "system" },
  { text: "基", seg: "system" },
  { text: "米", seg: "system" },
  { text: "<|im_end|>", special: true, seg: "system" },
  { text: "\n", seg: "system" }, // inter-turn newline
];

// Markers carry their turn's role colour (see app/lib/spans.ts: opening/closing
// markers are re-asserted onto the message segment), so the user turn reads
// cyan and the assistant turn green — special markers bold in that same hue.
export const BEAT_A_USER: VToken[] = [
  { text: "<|im_start|>", special: true, seg: "user" },
  { text: "user", seg: "user" },
  { text: "\n", seg: "user" },
  { text: "你是", seg: "user" },
  { text: "谁", seg: "user" },
  { text: "？", seg: "user" },
  { text: "<|im_end|>", special: true, seg: "user" },
  { text: "\n", seg: "user" }, // inter-turn newline — keep it on the user row's tint
];

export const BEAT_A_ASSISTANT: VToken[] = [
  { text: "<|im_start|>", special: true, seg: "assistant" },
  { text: "assistant", seg: "assistant" },
  { text: "\n", seg: "assistant" },
  { text: "我是", seg: "assistant" },
  { text: "哈", seg: "assistant" },
  { text: "基", seg: "assistant" },
  { text: "米", seg: "assistant" },
  { text: "，", seg: "assistant" },
  { text: "喵", seg: "assistant" },
  { text: "～", seg: "assistant" },
  { text: "<|im_end|>", special: true, seg: "assistant" },
];

// ── Beat B · same sentence, two tokenizers (docs/outline.md) ─────────
export const QWEN_SPLIT: VToken[] = [
  { text: "何" },
  { text: "意味" },
  { text: "是什么" },
  { text: "意思" },
];

export const DEEPSEEK_SPLIT: VToken[] = [
  { text: "何" },
  { text: "意味" },
  { text: "是什么意思" },
];

// ── Beat C · 字符 → 字节 → Token，常见词 vs Emoji (GPT-OSS) ──────────
export const TOKENIZER_C = "GPT-OSS";

const byte = (hex: string): VToken => ({ text: "", byteText: `\\x${hex}` });

export interface ColumnSpec {
  /** the raw text, shown whole on the 原文本 row */
  text: string;
  charCount: string;
  /** UTF-8 bytes, shown as hex chips on the 字节 row */
  bytes: VToken[];
  byteCount: string;
  /** GPT-OSS tokens, shown on the Token row */
  tokens: VToken[];
  tokenCount: string;
  /** the readable text is rendered as the only chip on the Token row */
  textIsSingleToken?: boolean;
}

export const HELLO_COLUMN: ColumnSpec = {
  text: "hello",
  charCount: "5 字符",
  bytes: [byte("68"), byte("65"), byte("6C"), byte("6C"), byte("6F")],
  byteCount: "5 字节",
  tokens: [{ text: "hello" }],
  tokenCount: "1 Token",
};

export const EMOJI = "🥳";

export const EMOJI_COLUMN: ColumnSpec = {
  text: EMOJI,
  charCount: "1 字符",
  bytes: [byte("F0"), byte("9F"), byte("A5"), byte("B3")],
  byteCount: "4 字节",
  // GPT-OSS merges the first three bytes into one token: [F0 9F A5][B3]
  tokens: [byte("F0\\x9F\\xA5"), byte("B3")],
  tokenCount: "2 Token",
};
