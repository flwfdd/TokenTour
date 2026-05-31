export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  /**
   * Reasoning / "thinking" trace from reasoning models (DeepSeek-R1's
   * `reasoning_content`, OpenRouter's `reasoning`, Anthropic `thinking`
   * blocks, …). Display-only: it is never sent back upstream (providers
   * strip it) and never injected into the chat template — chat templates
   * that don't model thinking simply ignore it. */
  reasoning?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolParamSpec {
  type: string;
  description?: string;
  enum?: string[];
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParamSpec>;
    required?: string[];
  };
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  modelKey: string;
  useProxy: boolean;
  temperature: number;
  maxTokens: number;
}

export interface ModelArch {
  key: string;
  label: string;
  family: "qwen" | "deepseek" | "gpt_oss";
  paramsB: number;
  hiddenSize: number;
  numLayers: number;
  numHeads: number;
  numKvHeads: number;
  headDim: number;
  vocabSize: number;
  maxContext: number;
  dtypeBytes: number;
  tokenizerRepo?: string;
  chatTemplate?: string;
  notes?: string;
}

export type StepKind =
  | "compose"
  | "template"
  | "tokenize"
  | "prefill"
  | "decode"
  | "tool_call"
  | "tool_result"
  | "final";

export interface TimelineStep {
  id: string;
  kind: StepKind;
  turn: number;
  label: string;
  messagesSnapshot: Message[];
  templateText?: string;
  tokens?: TokenInfo[];
  newTokens?: number;
  reusedPrefix?: number;
  toolCall?: ToolCall;
  toolResult?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
}

export interface TokenInfo {
  id: number;
  text: string;
  position: number;
  segment: TokenSegment;
  isSpecial: boolean;
  isControl?: boolean;
  role?: Role;
  /** char start offset within the cleaned template text */
  charStart: number;
  /** char length in the cleaned template text */
  charLen: number;
  /**
   * Raw UTF-8 byte length of this token. For multi-token characters (an emoji
   * split across several byte-level tokens) the source substring lands on a
   * single fragment, so the byte count can't be derived from `text` — it's
   * recorded here. */
  byteLen?: number;
  /**
   * Byte-escape rendering (`\xF0\x9F`) for tokens whose own bytes are NOT valid
   * UTF-8 on their own (one fragment of a multi-token character). The Tokens
   * pane shows this so every split token is visible; the chat-template pane
   * keeps using `text` (the readable source substring) for reconstruction. */
  byteText?: string;
  /** message id this token belongs to; undefined for tools_schema / generation-prompt tokens */
  messageId?: string;
}

export type TokenSegment =
  | "system"
  | "tools_schema"
  | "user"
  | "assistant"
  | "tool";

export interface ContextBreakdown {
  system: number;
  toolsSchema: number;
  user: number;
  assistant: number;
  tool: number;
  total: number;
}
