import type { ChatProvider, ChatRequest, DeltaEvent } from "./types";
import type { ToolCall } from "../types";
import { nanoid } from "nanoid";
import { chatFetch } from "./proxyFetch";
import { buildOpenAiRequestBody } from "./serialize";

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
    const body = buildOpenAiRequestBody({
      model: req.model,
      messages: req.messages,
      tools: req.tools,
      temperature: req.temperature,
      maxTokens: req.maxTokens,
      stream: true,
    });

    const resp = await chatFetch(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${req.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: req.signal,
      },
      !!req.routeThroughProxy,
    );
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
    let reasoning = "";
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
        // Reasoning models stream their thinking trace on a separate field:
        // DeepSeek uses `reasoning_content`, OpenRouter/others use `reasoning`.
        const reasoningChunk =
          typeof delta.reasoning_content === "string"
            ? delta.reasoning_content
            : typeof delta.reasoning === "string"
              ? delta.reasoning
              : "";
        if (reasoningChunk.length > 0) {
          reasoning += reasoningChunk;
          onDelta({ reasoningDelta: reasoningChunk });
        }
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

    return { content, reasoning: reasoning || undefined, toolCalls, finishReason: finish };
  },
};
