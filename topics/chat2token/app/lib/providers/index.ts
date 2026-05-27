import { openAiProvider } from "./openai";
import { anthropicProvider } from "./anthropic";
import type { ChatProvider } from "./types";

export const PROVIDERS: Record<string, ChatProvider> = {
  "openai-compat": openAiProvider,
  anthropic: anthropicProvider,
};

export interface ProviderPreset {
  id: string;
  label: string;
  providerId: string;
  baseUrl: string;
  exampleModels: string[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    providerId: "openai-compat",
    baseUrl: "https://api.openai.com/v1",
    exampleModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    providerId: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    exampleModels: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    providerId: "openai-compat",
    baseUrl: "https://api.deepseek.com/v1",
    exampleModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    providerId: "openai-compat",
    baseUrl: "https://api.siliconflow.cn/v1",
    exampleModels: ["Qwen/Qwen2.5-7B-Instruct", "deepseek-ai/DeepSeek-V3"],
  },
  {
    id: "qwen-dashscope",
    label: "通义 DashScope (兼容)",
    providerId: "openai-compat",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    exampleModels: ["qwen-plus", "qwen-max"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    providerId: "openai-compat",
    baseUrl: "https://openrouter.ai/api/v1",
    exampleModels: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet"],
  },
  {
    id: "custom",
    label: "Custom (OpenAI 兼容)",
    providerId: "openai-compat",
    baseUrl: "http://localhost:11434/v1",
    exampleModels: ["llama3.1:8b", "qwen2.5:7b"],
  },
];

export type { ChatProvider, ChatRequest, DeltaEvent } from "./types";
