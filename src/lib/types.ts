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
  | "user_input"
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
  /** message id this token belongs to; undefined for tools_schema / control / generation */
  messageId?: string;
}

export type TokenSegment =
  | "system"
  | "tools_schema"
  | "user"
  | "assistant"
  | "tool"
  | "control"
  | "generation";

export interface ContextBreakdown {
  system: number;
  toolsSchema: number;
  user: number;
  assistant: number;
  tool: number;
  control: number;
  generation: number;
  total: number;
}
