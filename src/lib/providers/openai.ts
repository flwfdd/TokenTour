import type { ChatProvider, ChatRequest, DeltaEvent } from "./types";
import type { ToolCall } from "../types";
import { nanoid } from "nanoid";

interface AccTool {
  id: string;
  name: string;
  argumentsRaw: string;
}

export const openAiProvider: ChatProvider = {
  id: "openai-compat",
  name: "OpenAI-Compatible",

  async stream(req: ChatRequest, onDelta) {
    const url = `${req.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const body = {
      model: req.model,
      stream: true,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 1024,
      messages: req.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls
          ? {
              tool_calls: m.tool_calls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
              })),
            }
          : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.name ? { name: m.name } : {}),
      })),
      ...(req.tools && req.tools.length > 0
        ? {
            tools: req.tools.map((t) => ({
              type: "function",
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
            tool_choice: "auto",
          }
        : {}),
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });
    if (!resp.ok || !resp.body) {
      const txt = await resp.text().catch(() => "");
      const msg = `HTTP ${resp.status}: ${txt.slice(0, 400)}`;
      onDelta({ finishReason: "error", errorMessage: msg });
      throw new Error(msg);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    const toolsAcc: Record<number, AccTool> = {};
    let finish: DeltaEvent["finishReason"];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          finish = finish ?? "stop";
          continue;
        }
        let json: any;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const choice = json.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (typeof delta.content === "string" && delta.content.length > 0) {
          content += delta.content;
          onDelta({ contentDelta: delta.content });
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const acc = (toolsAcc[idx] ??= { id: "", name: "", argumentsRaw: "" });
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name += tc.function.name;
            if (typeof tc.function?.arguments === "string") {
              acc.argumentsRaw += tc.function.arguments;
            }
            onDelta({
              toolCallDelta: {
                index: idx,
                id: acc.id,
                name: tc.function?.name,
                argumentsDelta: tc.function?.arguments,
              },
            });
          }
        }
        if (choice.finish_reason) {
          finish = choice.finish_reason as DeltaEvent["finishReason"];
          onDelta({ finishReason: finish });
        }
      }
    }

    const toolCalls: ToolCall[] = Object.values(toolsAcc).map((t) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = t.argumentsRaw ? JSON.parse(t.argumentsRaw) : {};
      } catch {
        parsed = { _raw: t.argumentsRaw };
      }
      return { id: t.id || nanoid(8), name: t.name, arguments: parsed };
    });

    return { content, toolCalls, finishReason: finish };
  },
};
