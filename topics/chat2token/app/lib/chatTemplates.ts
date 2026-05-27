/**
 * Per-family chat template bundles.
 *
 * The Jinja source for each family lives in its own file under
 * `./chatTemplates/*.jinja` (next to this file) and is loaded verbatim via Vite's `?raw`
 * suffix. Do NOT hand-edit those files — run `pnpm sync-chat-templates`
 * to re-pull them from upstream. Sources:
 *
 *   - qwen     ← Qwen/Qwen3-8B `tokenizer_config.json` (chat_template)
 *               https://hf-mirror.com/Qwen/Qwen3-8B
 *   - deepseek ← vLLM's `examples/tool_chat_template_deepseekv3.jinja`
 *               https://github.com/vllm-project/vllm/blob/main/examples/tool_chat_template_deepseekv3.jinja
 *               (The official `tokenizer_config.json` chat_template does NOT
 *                render the tools schema and has a sticky-flag bug around
 *                multi-turn tool calls; vLLM ships a patched version that
 *                upstream operators use in production.)
 *   - gpt_oss  ← openai/gpt-oss-20b `chat_template.jinja`
 *               https://hf-mirror.com/openai/gpt-oss-20b
 */

import QWEN3_TEMPLATE from "./chatTemplates/qwen3.jinja?raw";
import DEEPSEEK_V3_TEMPLATE from "./chatTemplates/deepseek_v3.jinja?raw";
import GPT_OSS_TEMPLATE from "./chatTemplates/gpt_oss.jinja?raw";

export interface TemplateBundle {
  template: string;
  bosToken?: string;
  eosToken?: string;
  specialTokens: string[];
  /**
   * Tokenizer key (registry or HF) to pick when the user leaves the
   * Tokens-pane selector on "auto". Keeps the family-specific defaults
   * co-located with the rest of the bundle so adding a family only touches
   * this file.
   */
  defaultTokenizerKey: string;
  /**
   * Value substituted for `message.content` when a message has only
   * tool_calls and no real text. DeepSeek's Jinja gates rendering on
   * `content is none`, so we must pass `null`; GPT-OSS crashes on `null`
   * inside its `"<|channel|>…" in content` check, so it needs `""`; Qwen
   * accepts either. Defaults to `""`.
   */
  emptyContentValue?: string | null;
  /**
   * Transform `tool_call.arguments` (always stored as a parsed object)
   * before handing it to Jinja. DeepSeek concatenates `arguments` directly
   * into a fenced block via `+`, which on plain objects yields literal
   * `"[object Map]"`; for it we pre-stringify. Qwen / GPT-OSS pipe through
   * `|tojson` and want the raw object. Defaults to identity.
   */
  encodeToolArgs?: (args: Record<string, unknown>) => unknown;
  /**
   * Regex source matching the OPENING marker of any message's wrapper.
   * Used by `computeSpans` to attribute opening tags (e.g. `<|im_start|>user`)
   * to the message they open rather than to the message they follow.
   */
  openingPattern?: string;
  /**
   * Given a message and its index, return a regex source that uniquely
   * identifies the start of THIS message's rendered block inside the
   * already-rendered template text. Returning `null` means "no opening
   * marker for this message" (e.g. DeepSeek's system content is concatenated
   * to the BOS without any leading tag).
   *
   * This is used by `computeSpans` to position span boundaries even when the
   * message's `content` is not directly emitted (e.g. GPT-OSS assistant
   * tool-call messages only emit `tool_call.arguments`) or when the content
   * is passed through `|tojson` (which escapes our sentinel markers into
   * literal text).
   */
  messageOpening?: (msg: import("./types").Message, msgIndex: number, messages: import("./types").Message[]) => string | null;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const TEMPLATE_BUNDLES: Record<string, TemplateBundle> = {
  qwen: {
    template: QWEN3_TEMPLATE,
    bosToken: "",
    eosToken: "<|im_end|>",
    defaultTokenizerKey: "qwen3",
    specialTokens: [
      "<|im_start|>",
      "<|im_end|>",
      "<tools>",
      "</tools>",
      "<tool_call>",
      "</tool_call>",
      "<tool_response>",
      "</tool_response>",
      "<think>",
      "</think>",
    ],
    openingPattern: "<\\|im_start\\|>",
    // Qwen wraps any run of consecutive tool messages in a single
    // `<|im_start|>user … <|im_end|>` block. Only the FIRST tool in the
    // run carries the `<|im_start|>user` prefix; subsequent tools just
    // start with `\n<tool_response>`.
    messageOpening: (msg, msgIndex, messages) => {
      if (msg.role === "system") return "<\\|im_start\\|>system\\n";
      if (msg.role === "user") return "<\\|im_start\\|>user\\n";
      if (msg.role === "assistant") return "<\\|im_start\\|>assistant\\n";
      if (msg.role === "tool") {
        const prev = messages[msgIndex - 1];
        if (prev?.role === "tool") return "\\n<tool_response>";
        return "<\\|im_start\\|>user\\n<tool_response>";
      }
      return null;
    },
  },
  deepseek: {
    template: DEEPSEEK_V3_TEMPLATE,
    bosToken: "<｜begin▁of▁sentence｜>",
    eosToken: "<｜end▁of▁sentence｜>",
    defaultTokenizerKey: "deepseek_v3",
    emptyContentValue: null,
    encodeToolArgs: (args) => JSON.stringify(args),
    specialTokens: [
      "<｜begin▁of▁sentence｜>",
      "<｜end▁of▁sentence｜>",
      "<｜User｜>",
      "<｜Assistant｜>",
      "<｜tool▁calls▁begin｜>",
      "<｜tool▁calls▁end｜>",
      "<｜tool▁call▁begin｜>",
      "<｜tool▁call▁end｜>",
      "<｜tool▁sep｜>",
      "<｜tool▁outputs▁begin｜>",
      "<｜tool▁outputs▁end｜>",
      "<｜tool▁output▁begin｜>",
      "<｜tool▁output▁end｜>",
    ],
    openingPattern: "<｜(?:User|Assistant|tool▁output▁begin|tool▁outputs▁begin)｜>",
    // vLLM's `tool_chat_template_deepseekv3.jinja` differs from the official
    // `tokenizer_config.json` chat_template in two important ways:
    //   1. It renders the tools schema (`# Tools\n\n…`) inline so we don't
    //      have to inject it from `template.ts`.
    //   2. It glues the assistant trigger onto each user message:
    //      `<｜User｜>{content}<｜Assistant｜>`. So an assistant message
    //      immediately after a user starts with that already-rendered
    //      `<｜Assistant｜>` — we attribute that opener to the ASSISTANT
    //      span (it's a header, not part of user content). Likewise the
    //      `<｜tool▁outputs▁end｜>` that the template emits before an
    //      assistant-after-tool body is the CLOSER of the previous tool
    //      outputs block, so we attribute it to the last TOOL span.
    //
    // Opening signatures (boundary is inclusive of the matched signature
    // unless the pattern is a zero-width lookbehind):
    //
    //   system        → no opener (concatenated after BOS).
    //   user          → `<｜User｜>` (content + appended `<｜Assistant｜>`
    //                   are *not* part of user; the assistant span below
    //                   carves the `<｜Assistant｜>` out as its opener).
    //   assistant, prev=user
    //                 → `<｜Assistant｜>` (the trigger glued onto user).
    //   assistant, prev=tool
    //                 → `(?<=<｜tool▁outputs▁end｜>)` — zero-width
    //                   lookbehind so the `<｜tool▁outputs▁end｜>` itself
    //                   stays inside the preceding tool span (it's the
    //                   closer of tool outputs), while the assistant span
    //                   starts at the position immediately after it.
    //   assistant, otherwise (e.g. first message) → null fallback.
    //   tool, FIRST in a sequence
    //                 → `<｜tool▁outputs▁begin｜><｜tool▁output▁begin｜>`.
    //   tool, subsequent
    //                 → `<｜tool▁output▁begin｜>`.
    messageOpening: (msg, msgIndex, messages) => {
      if (msg.role === "system") return null;
      const prev = messages[msgIndex - 1];
      if (msg.role === "user") return "<｜User｜>";
      if (msg.role === "assistant") {
        if (prev?.role === "tool") return "(?<=<｜tool▁outputs▁end｜>)";
        if (prev?.role === "user") return "<｜Assistant｜>";
        return null;
      }
      if (msg.role === "tool") {
        if (prev?.role === "tool") return "<｜tool▁output▁begin｜>";
        return "<｜tool▁outputs▁begin｜><｜tool▁output▁begin｜>";
      }
      return null;
    },
  },
  gpt_oss: {
    template: GPT_OSS_TEMPLATE,
    bosToken: "",
    eosToken: "<|end|>",
    defaultTokenizerKey: "harmony",
    specialTokens: [
      "<|start|>",
      "<|end|>",
      "<|message|>",
      "<|channel|>",
      "<|return|>",
      "<|call|>",
      "<|final|>",
    ],
    openingPattern: "<\\|start\\|>",
    // GPT-OSS auto-injects `<|start|>system<|message|>…<|end|><|start|>developer<|message|>…<|end|>`
    // at the very top regardless of whether the user provided a system message
    // (system message content is folded into the auto system block). It also
    // emits tools as a `developer` block (handled separately by tools-schema
    // overlay), and assistant tool-calls render via a dedicated
    // `<|start|>assistant to=functions.{name}` header rather than the regular
    // final-channel header.
    messageOpening: (msg, msgIndex, messages) => {
      if (msg.role === "user") return "<\\|start\\|>user<\\|message\\|>";
      if (msg.role === "system") return "<\\|start\\|>system<\\|message\\|>";
      if (msg.role === "assistant") {
        const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
        if (hasToolCalls) {
          const name = msg.tool_calls![0]!.name;
          // If the assistant also carries content/thinking we render
          // `<|start|>assistant<|channel|>analysis<|message|>…<|end|>` before
          // the actual `<|start|>assistant to=functions.…` block. Either one
          // marks the message's start; the analysis block has priority.
          if (msg.content) {
            return (
              "<\\|start\\|>assistant<\\|channel\\|>analysis<\\|message\\|>" +
              "|<\\|start\\|>assistant to=functions\\." +
              escapeRegex(name)
            );
          }
          return "<\\|start\\|>assistant to=functions\\." + escapeRegex(name);
        }
        return "<\\|start\\|>assistant<\\|channel\\|>final<\\|message\\|>";
      }
      if (msg.role === "tool") {
        // GPT-OSS template assumes max 1 tool_call per assistant message
        // and stamps every subsequent tool message with
        // `<|start|>functions.{last_tool_call.name}` — where
        // `last_tool_call.name` is the most recent assistant's
        // `tool_calls[0].name`. So we look back, not at `msg.name`.
        let lastName: string | null = null;
        for (let i = msgIndex - 1; i >= 0; i--) {
          const m = messages[i]!;
          if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
            lastName = m.tool_calls[0]!.name;
            break;
          }
          if (m.role === "assistant") break; // an assistant w/o tool_calls resets last_tool_call.name
        }
        if (lastName) return "<\\|start\\|>functions\\." + escapeRegex(lastName) + " to=assistant";
        return "<\\|start\\|>functions\\.[^<\\s]+ to=assistant";
      }
      return null;
    },
  },
};

export function getTemplateBundle(family: string): TemplateBundle {
  return TEMPLATE_BUNDLES[family] ?? TEMPLATE_BUNDLES.qwen!;
}
