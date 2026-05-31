import type { ToolSpec } from "../types";

export interface BuiltinTool {
  spec: ToolSpec;
  run(args: Record<string, unknown>): Promise<string>;
}

const calculatorTool: BuiltinTool = {
  spec: {
    name: "calculator",
    description:
      "Evaluate a basic arithmetic expression. Supports + - * / ( ) and decimal numbers. Returns the numeric result as a string.",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "A pure arithmetic expression, e.g. '12 * (3 + 4) / 2'",
        },
      },
      required: ["expression"],
    },
  },
  async run(args) {
    const expr = String(args.expression ?? "").trim();
    if (!/^[\d+\-*/().\s]+$/.test(expr)) {
      return `error: only digits and + - * / ( ) . are allowed, got: ${expr}`;
    }
    try {
      const fn = new Function(`"use strict"; return (${expr});`);
      const v = fn();
      if (typeof v !== "number" || !isFinite(v)) return `error: not a finite number (${v})`;
      return String(v);
    } catch (e) {
      return `error: ${(e as Error).message}`;
    }
  },
};

const weatherTool: BuiltinTool = {
  spec: {
    name: "get_weather",
    description: "Get the (mock) current weather for a city.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name in English or pinyin" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"], description: "Temperature unit" },
      },
      required: ["city"],
    },
  },
  async run(args) {
    const city = String(args.city ?? "unknown");
    const unit = (args.unit as string) ?? "celsius";
    const conditions = ["sunny", "cloudy", "partly cloudy", "light rain", "thunderstorm", "snow"];
    let h = 0;
    for (const c of city.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) | 0;
    const cond = conditions[Math.abs(h) % conditions.length];
    const tC = 8 + (Math.abs(h) % 25);
    const t = unit === "fahrenheit" ? Math.round((tC * 9) / 5 + 32) : tC;
    return JSON.stringify({ city, condition: cond, temperature: t, unit, source: "mock" });
  },
};

const searchTool: BuiltinTool = {
  spec: {
    name: "web_search",
    description: "Search the web for a short factual answer (mock — returns plausible canned text).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  async run(args) {
    const q = String(args.query ?? "").trim();
    if (!q) return "error: empty query";
    return JSON.stringify({
      query: q,
      results: [
        {
          title: `(mock) Top result for: ${q}`,
          snippet:
            "This is a placeholder search result so the agent loop can be exercised without any external network call. Replace `web_search` with a real provider for production use.",
          url: "https://example.com/result",
        },
      ],
    });
  },
};

const timeTool: BuiltinTool = {
  spec: {
    name: "current_time",
    description: "Get the current local date and time in ISO 8601 (with timezone offset).",
    parameters: { type: "object", properties: {}, required: [] },
  },
  async run() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    // Local time with an explicit offset, e.g. "2026-05-30T17:17:05+08:00".
    const offMin = -d.getTimezoneOffset();
    const sign = offMin >= 0 ? "+" : "-";
    const abs = Math.abs(offMin);
    const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset}`
    );
  },
};

export const BUILTIN_TOOLS: BuiltinTool[] = [calculatorTool, weatherTool, searchTool, timeTool];

export function findTool(name: string): BuiltinTool | undefined {
  return BUILTIN_TOOLS.find((t) => t.spec.name === name);
}
