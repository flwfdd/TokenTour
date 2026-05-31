import type { ChatProvider, ChatRequest, DeltaEvent } from "./types";
import type { ToolCall, Message } from "../types";
import { nanoid } from "nanoid";
import { chatFetch } from "./proxyFetch";

interface AccBlock {
  type: "text" | "tool_use" | "thinking";
  text?: string;
  id?: string;
  name?: string;
  inputJson?: string;
}

function convertMessages(messages: Message[]): { system?: string; messages: any[] } {
  let system: string | undefined;
  const out: any[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      system = (system ? system + "\n\n" : "") + (m.content ?? "");
      continue;
    }
    if (m.role === "user") {
      out.push({ role: "user", content: [{ type: "text", text: m.content ?? "" }] });
    } else if (m.role === "assistant") {
      const blocks: any[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
        }
      }
      out.push({ role: "assistant", content: blocks });
    } else if (m.role === "tool") {
      out.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: m.content }],
      });
    }
  }
  return { system, messages: out };
}

export const anthropicProvider: ChatProvider = {
  id: "anthropic",
  name: "Anthropic",

  async stream(req: ChatRequest, onDelta) {
    const url = `${req.baseUrl.replace(/\/$/, "")}/messages`;
    const { system, messages } = convertMessages(req.messages);
    const body = {
      model: req.model,
      stream: true,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0.2,
      ...(system ? { system } : {}),
      messages,
      ...(req.tools && req.tools.length > 0
        ? {
            tools: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters,
            })),
          }
        : {}),
    };

    const resp = await chatFetch(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": req.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
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
    const blocks: Record<number, AccBlock> = {};
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
        if (!payload || payload === "[DONE]") continue;
        let evt: any;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }
        const type = evt.type;
        if (type === "content_block_start") {
          const idx = evt.index;
          const b = evt.content_block;
          if (b.type === "text") {
            blocks[idx] = { type: "text", text: "" };
          } else if (b.type === "tool_use") {
            blocks[idx] = { type: "tool_use", id: b.id, name: b.name, inputJson: "" };
          } else if (b.type === "thinking") {
            blocks[idx] = { type: "thinking", text: "" };
          }
        } else if (type === "content_block_delta") {
          const idx = evt.index;
          const block = blocks[idx];
          if (!block) continue;
          const d = evt.delta;
          if (d.type === "text_delta" && block.type === "text") {
            block.text = (block.text ?? "") + d.text;
            content += d.text;
            onDelta({ contentDelta: d.text });
          } else if (d.type === "thinking_delta" && block.type === "thinking") {
            block.text = (block.text ?? "") + d.thinking;
            reasoning += d.thinking;
            onDelta({ reasoningDelta: d.thinking });
          } else if (d.type === "input_json_delta" && block.type === "tool_use") {
            block.inputJson = (block.inputJson ?? "") + d.partial_json;
            onDelta({
              toolCallDelta: {
                index: idx,
                id: block.id,
                name: block.name,
                argumentsDelta: d.partial_json,
              },
            });
          }
        } else if (type === "message_delta") {
          if (evt.delta?.stop_reason === "tool_use") finish = "tool_calls";
          else if (evt.delta?.stop_reason === "end_turn") finish = "stop";
          else if (evt.delta?.stop_reason === "max_tokens") finish = "length";
        }
      }
    }

    const toolCalls: ToolCall[] = Object.values(blocks)
      .filter((b) => b.type === "tool_use")
      .map((b) => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = b.inputJson ? JSON.parse(b.inputJson) : {};
        } catch {
          parsed = { _raw: b.inputJson };
        }
        return { id: b.id ?? nanoid(8), name: b.name ?? "", arguments: parsed };
      });

    if (toolCalls.length > 0 && !finish) finish = "tool_calls";
    if (!finish) finish = "stop";
    return { content, reasoning: reasoning || undefined, toolCalls, finishReason: finish };
  },
};
