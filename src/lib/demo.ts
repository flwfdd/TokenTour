import { nanoid } from "nanoid";
import type { Message, ToolSpec, TimelineStep, ModelArch } from "./types";
import { renderChatTemplate } from "./template";
import { computeSpans } from "./spans";
import { tokenize, countTokens } from "./tokenizer";
import { snapshotKv, diffPrefix } from "./kvSim";
import { findTool } from "./tools";

export interface DemoTurn {
  user?: string;
  assistantContent?: string;
  toolCalls?: { name: string; arguments: Record<string, unknown> }[];
}

export const DEMO_TRANSCRIPT: DemoTurn[] = [
  {
    user: "12 * (3 + 4) 等于多少？再告诉我现在 UTC 时间。",
  },
  {
    assistantContent: "",
    toolCalls: [
      { name: "calculator", arguments: { expression: "12 * (3 + 4)" } },
      { name: "current_time", arguments: {} },
    ],
  },
  {
    assistantContent:
      "结果是 84。当前 UTC 时间见上面的工具返回。需要我把它换成本地时区吗？",
  },
];

export interface DemoArgs {
  arch: ModelArch;
  initialMessages: Message[];
  tools: ToolSpec[];
  tokenizerKey?: string | null;
  /**
   * Chat template family to render with. Required — decoupled from
   * `arch.family` because chat template selection is its own knob now.
   */
  templateFamily: string;
  onStep: (s: TimelineStep) => void;
  onMessages: (m: Message[]) => void;
  onAssistantDelta?: (d: string) => void;
  delayMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runDemo(args: DemoArgs): Promise<void> {
  const {
    arch,
    tools,
    onStep,
    onMessages,
    onAssistantDelta,
    delayMs = 250,
    tokenizerKey = null,
    templateFamily,
  } = args;
  const family = templateFamily;
  let messages = [...args.initialMessages];
  let prevTokens: ReturnType<typeof tokenize>["tokens"] | undefined;
  let turn = 0;

  for (let ti = 0; ti < DEMO_TRANSCRIPT.length; ti++) {
    const t = DEMO_TRANSCRIPT[ti]!;
    turn++;
    if (t.user) {
      messages = [...messages, { id: nanoid(8), role: "user", content: t.user }];
      onMessages(messages.filter((m) => m.role !== "system" || m.id !== "sys"));
    }

    const rendered = renderChatTemplate({
      messages,
      tools,
      family,
      addGenerationPrompt: true,
    });
    const { cleanedText, spans } = computeSpans({
      messages,
      tools,
      family,
      addGenerationPrompt: true,
    });
    const text = cleanedText.length > 0 ? cleanedText : rendered.text;
    const { tokens } = tokenize(text, {
      bundle: rendered.bundle,
      family,
      spans,
      tokenizerKey,
    });
    const reusedPrefix = diffPrefix(prevTokens, tokens);

    onStep({
      id: nanoid(8),
      kind: "compose",
      turn,
      label: `Turn ${turn}: 拼装 messages`,
      messagesSnapshot: messages,
      createdAt: Date.now(),
    });
    await sleep(delayMs);
    onStep({
      id: nanoid(8),
      kind: "template",
      turn,
      label: `Turn ${turn}: 应用 chat template`,
      messagesSnapshot: messages,
      templateText: text,
      createdAt: Date.now(),
    });
    await sleep(delayMs);
    onStep({
      id: nanoid(8),
      kind: "tokenize",
      turn,
      label: `Turn ${turn}: 分词 (${tokens.length} tokens)`,
      messagesSnapshot: messages,
      templateText: text,
      tokens,
      reusedPrefix,
      createdAt: Date.now(),
      meta: { snapshot: snapshotKv({ arch, prevTokens, currTokens: tokens, decodeAppended: 0 }) },
    });
    await sleep(delayMs);
    onStep({
      id: nanoid(8),
      kind: "prefill",
      turn,
      label: `Turn ${turn}: prefill (${tokens.length - reusedPrefix} new, ${reusedPrefix} reused)`,
      messagesSnapshot: messages,
      templateText: text,
      tokens,
      reusedPrefix,
      createdAt: Date.now(),
      meta: { snapshot: snapshotKv({ arch, prevTokens, currTokens: tokens, decodeAppended: 0 }) },
    });
    await sleep(delayMs);

    if (t.assistantContent !== undefined) {
      let decoded = "";
      let decodeAppended = 0;
      const chunks = chunkText(t.assistantContent, 8);
      for (const ch of chunks) {
        decoded += ch;
        decodeAppended = countTokens(decoded, family, tokenizerKey);
        onAssistantDelta?.(ch);
        onStep({
          id: nanoid(8),
          kind: "decode",
          turn,
          label: `Turn ${turn}: decode +${decodeAppended} tokens`,
          messagesSnapshot: messages,
          templateText: text,
          tokens,
          reusedPrefix,
          createdAt: Date.now(),
          meta: {
            snapshot: snapshotKv({ arch, prevTokens, currTokens: tokens, decodeAppended }),
            decoded,
          },
        });
        await sleep(delayMs / 2);
      }
      const am: Message = {
        id: nanoid(8),
        role: "assistant",
        content: decoded,
        ...(t.toolCalls
          ? {
              tool_calls: t.toolCalls.map((tc) => ({
                id: nanoid(8),
                name: tc.name,
                arguments: tc.arguments,
              })),
            }
          : {}),
      };
      messages = [...messages, am];
      onMessages(messages.filter((m) => m.role !== "system" || m.id !== "sys"));
    } else if (t.toolCalls) {
      const am: Message = {
        id: nanoid(8),
        role: "assistant",
        content: "",
        tool_calls: t.toolCalls.map((tc) => ({
          id: nanoid(8),
          name: tc.name,
          arguments: tc.arguments,
        })),
      };
      messages = [...messages, am];
      onMessages(messages.filter((m) => m.role !== "system" || m.id !== "sys"));
    }

    prevTokens = tokens;

    const lastAssistant = messages[messages.length - 1];
    if (lastAssistant?.role === "assistant" && lastAssistant.tool_calls) {
      for (const tc of lastAssistant.tool_calls) {
        onStep({
          id: nanoid(8),
          kind: "tool_call",
          turn,
          label: `Turn ${turn}: tool_call → ${tc.name}`,
          messagesSnapshot: messages,
          toolCall: tc,
          createdAt: Date.now(),
        });
        await sleep(delayMs);
        const tool = findTool(tc.name);
        let res: string;
        try {
          res = tool ? await tool.run(tc.arguments) : `error: unknown tool ${tc.name}`;
        } catch (e) {
          res = `error: ${(e as Error).message}`;
        }
        const tmsg: Message = {
          id: nanoid(8),
          role: "tool",
          content: res,
          tool_call_id: tc.id,
          name: tc.name,
        };
        messages = [...messages, tmsg];
        onMessages(messages.filter((m) => m.role !== "system" || m.id !== "sys"));
        onStep({
          id: nanoid(8),
          kind: "tool_result",
          turn,
          label: `Turn ${turn}: tool_result ← ${tc.name}`,
          messagesSnapshot: messages,
          toolCall: tc,
          toolResult: res,
          createdAt: Date.now(),
        });
        await sleep(delayMs);
      }
    }
  }

  // Same re-tokenize-post-state trick as agentLoop, so the demo's "completed"
  // final step also surfaces the full conversation (with last assistant /
  // tool messages) to the chat-template + tokens panels.
  const finalRendered = renderChatTemplate({
    messages,
    tools,
    family,
    addGenerationPrompt: false,
  });
  const { cleanedText: finalClean, spans: finalSpans } = computeSpans({
    messages,
    tools,
    family,
    addGenerationPrompt: false,
  });
  const finalText = finalClean.length > 0 ? finalClean : finalRendered.text;
  const { tokens: finalTokens } = tokenize(finalText, {
    bundle: finalRendered.bundle,
    family,
    spans: finalSpans,
    tokenizerKey,
  });
  const finalReused = diffPrefix(prevTokens, finalTokens);

  onStep({
    id: nanoid(8),
    kind: "final",
    turn,
    label: `Turn ${turn}: 演示完成`,
    messagesSnapshot: messages,
    templateText: finalText,
    tokens: finalTokens,
    reusedPrefix: finalReused,
    createdAt: Date.now(),
    meta: {
      snapshot: snapshotKv({
        arch,
        prevTokens,
        currTokens: finalTokens,
        decodeAppended: 0,
      }),
    },
  });
}

function chunkText(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}
