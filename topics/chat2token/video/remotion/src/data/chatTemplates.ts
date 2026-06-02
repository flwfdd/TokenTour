/**
 * Frozen chat-template exemplars, copied verbatim from the article
 * (`topics/chat2token/blog/zh/index.astro` → tmplBasic* / qwen*), so the video
 * reads identically to the blog + playground. Do NOT paraphrase these strings.
 *
 * `segmentTemplate` paints each chunk with the playground's role colours and
 * bolds the structural "special" tokens, mirroring LensChatTemplate.
 */
import type { Segment } from "../lib/theme";

export type Family = "qwen" | "deepseek" | "gptoss";

// ── Frozen strings (verbatim from blog/zh/index.astro) ──────────────────
export const TMPL_BASIC_DEEPSEEK = `<｜begin▁of▁sentence｜>
你是一只哈基米<｜User｜>你是谁？<｜Assistant｜>            我是哈基米，喵～<｜end▁of▁sentence｜>`;

export const TMPL_BASIC_QWEN = `<|im_start|>system
你是一只哈基米<|im_end|>
<|im_start|>user
你是谁？<|im_end|>
<|im_start|>assistant
<think>
我想哈用户，但还是忍一下吧。
</think>

我是哈基米，喵～<|im_end|>`;

export const TMPL_BASIC_GPTOSS = `<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-06
Current date: 2026-05-30

Reasoning: medium

# Valid channels: analysis, commentary, final. Channel must be included for every message.<|end|><|start|>developer<|message|># Instructions

你是一只哈基米

<|end|><|start|>user<|message|>你是谁？<|end|><|start|>assistant<|channel|>analysis<|message|>我想哈用户，但还是忍一下吧。<|end|><|start|>assistant<|channel|>final<|message|>我是哈基米，喵～<|return|>`;

// Qwen3 fragments for Scene 9 (special tokens & thinking switch).
export const QWEN_INPUT_ONLY = `<|im_start|>system
你是一只哈基米<|im_end|>
<|im_start|>user
你是谁？<|im_end|>
<|im_start|>assistant
<think>`;

export const QWEN_MODEL_OUTPUT = `
我想哈用户，但还是忍一下吧。
</think>

我是哈基米，喵～<|im_end|>`;

export const QWEN_CONTINUE = `
<|im_start|>user`;

export const QWEN_THINK_CLOSED = `<|im_start|>assistant
<think>

</think>`;

export const FAMILY_LABEL: Record<Family, string> = {
  qwen: "Qwen3",
  deepseek: "DeepSeek-V3",
  gptoss: "GPT-OSS",
};

export const TEMPLATES: Record<Family, string> = {
  qwen: TMPL_BASIC_QWEN,
  deepseek: TMPL_BASIC_DEEPSEEK,
  gptoss: TMPL_BASIC_GPTOSS,
};

// ── Segmenter ───────────────────────────────────────────────────────────
export interface TSpan {
  t: string;
  seg: Segment;
  /** structural / special token → bold + role-hued text (playground isSpecial) */
  sp?: boolean;
  /** optional tag for targeted highlight (e.g. "im_end", "extra") */
  tag?: string;
}

const SPECIALS: Record<Family, string> = {
  qwen: "<\\|im_start\\|>|<\\|im_end\\|>",
  deepseek:
    "<｜begin▁of▁sentence｜>|<｜end▁of▁sentence｜>|<｜User｜>|<｜Assistant｜>",
  gptoss:
    "<\\|start\\|>|<\\|message\\|>|<\\|channel\\|>|<\\|end\\|>|<\\|return\\|>|<\\|call\\|>",
};

/** GPT-OSS "乱七八糟的额外信息" lines that Scene 8 lights up. */
const GPTOSS_EXTRA = [
  "You are ChatGPT",
  "Knowledge cutoff",
  "Current date",
  "Reasoning: medium",
  "# Valid channels",
];

/**
 * Split a frozen template into role-coloured spans, bolding structural tokens.
 * `<think>` / `</think>` are coloured as the assistant turn (not bold), exactly
 * like the playground.
 */
export function segmentTemplate(raw: string, family: Family): TSpan[] {
  const re = new RegExp(SPECIALS[family], "g");
  const out: TSpan[] = [];
  let cur: Segment = "system";
  let last = 0;

  const pushPlain = (text: string) => {
    if (!text) return;
    const tag = GPTOSS_EXTRA.some((k) => text.includes(k)) ? "extra" : undefined;
    out.push({ t: text, seg: cur, tag });
  };

  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    pushPlain(raw.slice(last, m.index));
    const tok = m[0];
    if (family === "deepseek") {
      if (tok.includes("begin▁of▁sentence")) cur = "system";
      else if (tok.includes("User")) cur = "user";
      else if (tok.includes("Assistant")) cur = "assistant";
    } else if (tok === "<|im_start|>" || tok === "<|start|>") {
      // 开标记按**接下来的角色**着色（与 playground 一致）：<|im_start|>assistant 属于 assistant
      const rm = raw.slice(re.lastIndex).match(/^(system|developer|user|assistant|tool|functions)/);
      if (rm) {
        const w = rm[1];
        cur = w === "developer" ? "system" : w === "tool" || w === "functions" ? "tool" : (w as Segment);
      }
    }
    const tag = tok.includes("im_end") || tok.includes("end▁of") ? "im_end" : undefined;
    out.push({ t: tok, seg: cur, sp: true, tag });
    last = re.lastIndex;
  }
  pushPlain(raw.slice(last));

  // 把 <think>/</think> 拆成独立（非 special）span，便于按「模型输入 / 模型输出」分段
  const split: TSpan[] = [];
  for (const s of out) {
    if (s.sp) {
      split.push(s);
      continue;
    }
    for (const p of s.t.split(/(<\/?think>)/)) {
      if (p !== "") split.push({ t: p, seg: s.seg, tag: s.tag });
    }
  }
  return split;
}

/** `<think>` / `</think>` are coloured assistant but not special — already
 * handled because they fall inside the assistant turn as plain text. */

export const charCount = (s: string) => s.length;
