/**
 * Shared OpenAI-shape message / request serialization used by:
 *
 *   - `openai.ts` to build the streaming `/chat/completions` body.
 *   - `MessagesJsonModal.tsx` to render the exact JSON the agent would
 *     post (so users can copy it and replay outside the app).
 *
 * Kept here so any drift between "what we render" and "what we send" is
 * impossible by construction.
 */
import type { Message, ToolSpec } from "../types";

/** Single message → OpenAI chat-completions shape. */
export function toOpenAiMessage(m: Message): Record<string, unknown> {
  return {
    role: m.role,
    content: m.content,
    // Reasoning models surface the thinking trace as `reasoning_content`
    // (DeepSeek / OpenAI-compatible). Shown here so "查看 JSON" reflects it;
    // upstreams that don't model it simply ignore the extra field.
    ...(m.reasoning ? { reasoning_content: m.reasoning } : {}),
    ...(m.tool_calls
      ? {
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        }
      : {}),
    ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    ...(m.name ? { name: m.name } : {}),
  };
}

export function toOpenAiTools(tools: ToolSpec[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** Build a full chat-completions request body. */
export function buildOpenAiRequestBody(args: {
  model: string;
  messages: Message[];
  tools?: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}): Record<string, unknown> {
  const { model, messages, tools, temperature = 0.2, maxTokens = 1024, stream = true } = args;
  return {
    model,
    stream,
    temperature,
    max_tokens: maxTokens,
    messages: messages.map(toOpenAiMessage),
    ...(tools && tools.length > 0
      ? { tools: toOpenAiTools(tools), tool_choice: "auto" }
      : {}),
  };
}
