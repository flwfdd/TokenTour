import type { Message } from "./types";

/**
 * The synthetic system message we inject as id `"sys"` ahead of every
 * outgoing payload (see `buildOutgoingMessages`). The chat panel needs to
 * round-trip via `onMessages` without showing that sentinel back to the
 * user, so any caller that receives a `Message[]` from the agent loop
 * should pipe it through this helper before mutating the store.
 */
export function stripSystemSentinel(messages: Message[]): Message[] {
  return messages.filter((m) => m.role !== "system" || m.id !== "sys");
}

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
