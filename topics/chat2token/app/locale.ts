import type { TokenSegment } from "./lib/types";

export type Lang = "en" | "zh";

export function langFromPath(pathname: string): Lang {
  return pathname.replace(/\/+$/, "").endsWith("/zh") ? "zh" : "en";
}

export function isZh(lang: Lang): boolean {
  return lang === "zh";
}

const SEGMENT_LABELS: Record<Lang, Record<TokenSegment, string>> = {
  en: {
    system: "system",
    tools_schema: "tools schema",
    user: "user",
    assistant: "assistant",
    tool: "tool result",
  },
  zh: {
    system: "system",
    tools_schema: "工具 schema",
    user: "user",
    assistant: "assistant",
    tool: "工具结果",
  },
};

export function segmentLabel(lang: Lang, seg: TokenSegment): string {
  return SEGMENT_LABELS[lang][seg];
}

export function providerPresetLabel(id: string, fallback: string, lang: Lang): string {
  if (lang === "en") {
    if (id === "qwen-dashscope") return "Qwen DashScope (compatible)";
    if (id === "custom") return "Custom (OpenAI-compatible)";
  }
  return fallback;
}
