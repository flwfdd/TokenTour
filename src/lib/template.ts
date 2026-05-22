import { Template } from "@huggingface/jinja";
import type { Message, ToolSpec } from "./types";
import { getTemplateBundle, type TemplateBundle } from "./chatTemplates";

const templateCache = new Map<string, Template>();

function getCompiled(bundle: TemplateBundle): Template {
  let t = templateCache.get(bundle.template);
  if (!t) {
    t = new Template(bundle.template);
    templateCache.set(bundle.template, t);
  }
  return t;
}

export interface RenderInput {
  messages: Message[];
  tools?: ToolSpec[];
  family: string;
  addGenerationPrompt?: boolean;
}

export interface RenderResult {
  text: string;
  bundle: TemplateBundle;
}

export function renderChatTemplate(input: RenderInput): RenderResult {
  const bundle = getTemplateBundle(input.family);
  const compiled = getCompiled(bundle);

  // We store `tool_call.arguments` as a parsed object. Different templates
  // expect different shapes:
  //   - Qwen / GPT-OSS: pipe through `|tojson` → want the raw object.
  //   - DeepSeek: concatenates `arguments` directly into a ```json``` block
  //     and the `+` operator in Jinja on a plain object yields literal
  //     `"[object Map]"`. So for DeepSeek we have to pre-stringify.
  const encodeToolArgs = (args: Record<string, unknown>): unknown => {
    if (input.family === "deepseek") return JSON.stringify(args);
    return args;
  };

  // DeepSeek gates its tool-call rendering branch on
  // `message['content'] is none` — if we always pass `""`, that branch is
  // silently skipped and the assistant collapses to a degenerate
  // `<｜Assistant｜><｜end▁of▁sentence｜>`. So for DeepSeek we pass `null` when
  // the message is tool_calls-only. GPT-OSS, on the other hand, has a
  // `"<|channel|>…" in message.content` guard that crashes on null, so for
  // it we keep `""`. Qwen is robust either way.
  const emptyContentValue: string | null = input.family === "deepseek" ? null : "";

  const messagesPayload = input.messages.map((m) => {
    const hasToolCalls = !!(m.tool_calls && m.tool_calls.length > 0);
    const hasRealContent = typeof m.content === "string" && m.content.length > 0;
    return {
      role: m.role,
      content: hasToolCalls && !hasRealContent ? emptyContentValue : (m.content ?? ""),
      ...(m.tool_calls
        ? {
            tool_calls: m.tool_calls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: encodeToolArgs(tc.arguments) },
            })),
          }
        : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      ...(m.name ? { name: m.name } : {}),
    };
  });

  const toolsPayload = input.tools?.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  try {
    const text = compiled.render({
      messages: messagesPayload,
      tools: toolsPayload,
      bos_token: bundle.bosToken ?? "",
      eos_token: bundle.eosToken ?? "",
      add_generation_prompt: input.addGenerationPrompt ?? true,
    });
    return { text, bundle };
  } catch (err) {
    const text = `[template render error: ${(err as Error).message}]`;
    return { text, bundle };
  }
}

export interface TemplateSegment {
  text: string;
  kind: "special" | "control_token" | "plain";
}

export function segmentTemplate(text: string, bundle: TemplateBundle): TemplateSegment[] {
  const tokens = [...bundle.specialTokens].sort((a, b) => b.length - a.length);
  if (tokens.length === 0) return [{ text, kind: "plain" }];

  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "g");

  const out: TemplateSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ text: text.slice(last, m.index), kind: "plain" });
    }
    out.push({ text: m[1]!, kind: "special" });
    last = m.index + m[1]!.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: "plain" });
  return out;
}
