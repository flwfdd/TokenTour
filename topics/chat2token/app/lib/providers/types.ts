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
  /**
   * When true, providers route the request through `/api/proxy` (our
   * server-side fetch forwarder) instead of hitting the upstream URL
   * directly. Useful for CORS-restricted providers in a browser.
   */
  routeThroughProxy?: boolean;
}

export interface DeltaEvent {
  contentDelta?: string;
  /** Streamed reasoning/thinking chunk (reasoning models only). */
  reasoningDelta?: string;
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
    /** Full reasoning trace, if the model emitted one. */
    reasoning?: string;
    toolCalls: ToolCall[];
    finishReason: DeltaEvent["finishReason"];
  }>;
}
