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

/**
 * Render the messages list through the family's Jinja chat template.
 * Returns the produced text; the caller looks up the bundle separately if
 * it needs metadata.
 *
 * Family-specific quirks (empty-content sentinel, `tool_call.arguments`
 * shape) are declared on the `TemplateBundle` itself so this function is
 * purely mechanical.
 */
export function renderChatTemplate(input: RenderInput): string {
  const bundle = getTemplateBundle(input.family);
  const compiled = getCompiled(bundle);

  const encodeToolArgs = bundle.encodeToolArgs ?? ((args) => args);
  const emptyContent = bundle.emptyContentValue ?? "";

  const messagesPayload = input.messages.map((m) => {
    const hasToolCalls = !!(m.tool_calls && m.tool_calls.length > 0);
    const hasRealContent = typeof m.content === "string" && m.content.length > 0;
    return {
      role: m.role,
      content: hasToolCalls && !hasRealContent ? emptyContent : (m.content ?? ""),
      // Expose the reasoning trace under BOTH field names real templates use:
      // Qwen reads `reasoning_content`, GPT-OSS (harmony) reads `thinking`.
      // DeepSeek's template references neither, so it transparently ignores it
      // — exactly the upstream behavior (templates that don't model thinking
      // just drop it; ones that do decide themselves whether to keep it, e.g.
      // only on the latest turn).
      ...(m.reasoning ? { reasoning_content: m.reasoning, thinking: m.reasoning } : {}),
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
    return compiled.render({
      messages: messagesPayload,
      tools: toolsPayload,
      bos_token: bundle.bosToken ?? "",
      eos_token: bundle.eosToken ?? "",
      add_generation_prompt: input.addGenerationPrompt ?? true,
    });
  } catch (err) {
    return `[template render error: ${(err as Error).message}]`;
  }
}
