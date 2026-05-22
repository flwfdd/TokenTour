import type { Message, ToolCall, ToolSpec } from "../types";

export interface ChatRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Message[];
  tools?: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface DeltaEvent {
  contentDelta?: string;
  toolCallDelta?: Partial<ToolCall> & { index?: number; argumentsDelta?: string };
  finishReason?: "stop" | "tool_calls" | "length" | "error";
  errorMessage?: string;
  raw?: unknown;
}

export interface ChatProvider {
  id: string;
  name: string;
  stream(req: ChatRequest, onDelta: (d: DeltaEvent) => void): Promise<{
    content: string;
    toolCalls: ToolCall[];
    finishReason: DeltaEvent["finishReason"];
  }>;
}
