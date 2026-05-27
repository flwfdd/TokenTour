import type { Message, ToolSpec, TokenInfo } from "./types";
import { computeSpans } from "./spans";
import { tokenize, type SegmentSpan } from "./tokenizer";

export interface PipelineResult {
  /** Final rendered template text, ready for display / persistence. */
  text: string;
  /** Tokens with offsets + segment attribution against `text`. */
  tokens: TokenInfo[];
  /** Char-range spans used to drive cross-pane highlighting. */
  spans: SegmentSpan[];
}

/**
 * One-shot "messages → text → tokens + spans" pipeline. Centralises the
 * 4-line dance that used to be copy-pasted across the agent loop, demo,
 * lens hooks, and chat-template compare pane.
 *
 * Note we don't call `renderChatTemplate` separately — `computeSpans`
 * already renders it once to discover boundaries; we reuse that text
 * verbatim (saves one Jinja render per pipeline invocation).
 */
export function renderAndTokenize(args: {
  messages: Message[];
  tools?: ToolSpec[];
  family: string;
  addGenerationPrompt?: boolean;
  tokenizerKey?: string | null;
}): PipelineResult {
  const { messages, tools, family, addGenerationPrompt = true, tokenizerKey = null } = args;
  const { cleanedText, spans } = computeSpans({
    messages,
    tools,
    family,
    addGenerationPrompt,
  });
  const { tokens } = tokenize(cleanedText, { family, spans, tokenizerKey });
  return { text: cleanedText, tokens, spans };
}
