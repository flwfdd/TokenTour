import type { Message } from "./types";

/**
 * Whether the chat template should append the assistant generation prompt
 * (e.g. `<|im_start|>assistant\n`) given the current conversation state.
 *
 * - Empty conversation: no prompt (nothing to generate from yet).
 * - Last message is user/system/tool: yes, the assistant is expected to reply.
 * - Last message is assistant with pending tool_calls and no content: no, the
 *   loop is waiting for tool results, not another assistant turn.
 * - Last message is a finished assistant reply: no, the conversation is done.
 */
export function shouldAddGenerationPrompt(messages: Message[]): boolean {
  const last = messages[messages.length - 1];
  if (!last) return false;
  if (last.role === "user" || last.role === "system" || last.role === "tool") return true;
  // assistant
  if (last.tool_calls && last.tool_calls.length > 0 && !last.content) return false;
  return false;
}
