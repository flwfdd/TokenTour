import type { Message } from "./lib/types";
import type { Lang } from "./locale";

export const DEFAULT_SYSTEM_PROMPT: Record<Lang, string> = {
  en: "You are a concise, friendly assistant. When asked computations or facts, prefer calling the available tools instead of guessing.",
  zh: "你是一个简洁、友好的助手。遇到计算或事实查询时，优先调用可用工具，而不是凭空猜测。",
};

const seedToolCallId = "get_weather:seed";

const seedMessagesEn: Message[] = [
  {
    id: "seed_u1",
    role: "user",
    content: "What's the weather in San Francisco today?",
  },
  {
    id: "seed_a1",
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: seedToolCallId,
        name: "get_weather",
        arguments: { city: "San Francisco" },
      },
    ],
  },
  {
    id: "seed_t1",
    role: "tool",
    content: JSON.stringify({
      city: "San Francisco",
      condition: "partly cloudy",
      temperature: 18,
      unit: "celsius",
      source: "mock",
    }),
    tool_call_id: seedToolCallId,
    name: "get_weather",
  },
  {
    id: "seed_a2",
    role: "assistant",
    content: "San Francisco is **partly cloudy** today, around 18°C (from the mock tool). Want Fahrenheit or another city?",
  },
];

const seedMessagesZh: Message[] = [
  {
    id: "seed_u1",
    role: "user",
    content: "今天上海天气怎么样？",
  },
  {
    id: "seed_a1",
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: seedToolCallId,
        name: "get_weather",
        arguments: { city: "Shanghai" },
      },
    ],
  },
  {
    id: "seed_t1",
    role: "tool",
    content: JSON.stringify({
      city: "Shanghai",
      condition: "cloudy",
      temperature: 24,
      unit: "celsius",
      source: "mock",
    }),
    tool_call_id: seedToolCallId,
    name: "get_weather",
  },
  {
    id: "seed_a2",
    role: "assistant",
    content: "上海今天**多云**，气温约 24°C（来自 mock 工具）。需要我换成华氏度或查别的城市吗？",
  },
];

export function seedMessagesFor(lang: Lang): Message[] {
  return JSON.parse(JSON.stringify(lang === "zh" ? seedMessagesZh : seedMessagesEn)) as Message[];
}

function stableJson(v: unknown): string {
  return JSON.stringify(v);
}

export function isKnownSeedState(systemPrompt: string, messages: Message[]): boolean {
  const messagesJson = stableJson(messages);
  const isKnownPrompt =
    systemPrompt === DEFAULT_SYSTEM_PROMPT.en || systemPrompt === DEFAULT_SYSTEM_PROMPT.zh;
  const isKnownMessages =
    messagesJson === stableJson(seedMessagesEn) || messagesJson === stableJson(seedMessagesZh);
  return isKnownPrompt && isKnownMessages;
}
