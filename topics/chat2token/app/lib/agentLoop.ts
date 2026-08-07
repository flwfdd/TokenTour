import { nanoid } from "nanoid";
import type { Message, ToolSpec, TimelineStep, ModelArch, TokenInfo } from "./types";
import type { ChatProvider } from "./providers";
import { findTool } from "./tools";
import { renderAndTokenize } from "./pipeline";
import { countTokens } from "./tokenizer";
import { snapshotKv, diffPrefix } from "./kvSim";
import type { Lang } from "../locale";

export interface RunLoopArgs {
  provider: ChatProvider;
  baseUrl: string;
  /** Forwarded to providers; routes the upstream request through `/api/proxy`. */
  routeThroughProxy?: boolean;
  apiKey: string;
  model: string;
  arch: ModelArch;
  messages: Message[];
  tools: ToolSpec[];
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
  tokenizerKey?: string | null;
  /**
   * Chat template family to render with. Required — decoupled from
   * `arch.family` because chat template selection is its own knob now.
   */
  templateFamily: string;
  lang?: Lang;
  onStep: (step: TimelineStep) => void;
  onAssistantDelta?: (delta: string) => void;
  onMessages: (messages: Message[]) => void;
  signal?: AbortSignal;
}

export async function runAgentLoop(args: RunLoopArgs): Promise<Message[]> {
  const {
    provider,
    baseUrl,
    routeThroughProxy,
    apiKey,
    model,
    arch,
    tools,
    onStep,
    onAssistantDelta,
    onMessages,
    signal,
    maxIterations = 6,
    temperature = 0.2,
    maxTokens = 1024,
    tokenizerKey = null,
    templateFamily,
    lang = "en",
  } = args;

  const family = templateFamily;

  let workingMessages = [...args.messages];
  let prevTokens: TokenInfo[] | undefined;
  let turn = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    turn++;
    const composeStep: TimelineStep = {
      id: nanoid(8),
      kind: "compose",
      turn,
      label: stepLabel(lang, turn, "compose"),
      messagesSnapshot: workingMessages,
      createdAt: Date.now(),
    };
    onStep(composeStep);

    const { text, tokens } = renderAndTokenize({
      messages: workingMessages,
      tools,
      family,
      addGenerationPrompt: true,
      tokenizerKey,
    });

    onStep({
      id: nanoid(8),
      kind: "template",
      turn,
      label: stepLabel(lang, turn, "template"),
      messagesSnapshot: workingMessages,
      templateText: text,
      createdAt: Date.now(),
    });

    const reusedPrefix = diffPrefix(prevTokens, tokens);
    onStep({
      id: nanoid(8),
      kind: "tokenize",
      turn,
      label: stepLabel(lang, turn, "tokenize", { tokens: tokens.length }),
      messagesSnapshot: workingMessages,
      templateText: text,
      tokens,
      reusedPrefix,
      createdAt: Date.now(),
      meta: { snapshot: snapshotKv({ arch, prevTokens, currTokens: tokens, decodeAppended: 0 }) },
    });

    onStep({
      id: nanoid(8),
      kind: "prefill",
      turn,
      label: stepLabel(lang, turn, "prefill", {
        fresh: tokens.length - reusedPrefix,
        reused: reusedPrefix,
      }),
      messagesSnapshot: workingMessages,
      templateText: text,
      tokens,
      reusedPrefix,
      createdAt: Date.now(),
      meta: { snapshot: snapshotKv({ arch, prevTokens, currTokens: tokens, decodeAppended: 0 }) },
    });

    let decodeAppended = 0;
    let assistantContent = "";
    const { content, reasoning, toolCalls, finishReason } = await provider.stream(
      {
        baseUrl,
        routeThroughProxy,
        apiKey,
        model,
        messages: workingMessages,
        tools,
        temperature,
        maxTokens,
        signal,
      },
      (d) => {
        if (d.contentDelta) {
          assistantContent += d.contentDelta;
          decodeAppended = countTokens(assistantContent, family, tokenizerKey);
          onAssistantDelta?.(d.contentDelta);
          onStep({
            id: nanoid(8),
            kind: "decode",
            turn,
            label: stepLabel(lang, turn, "decode", { tokens: decodeAppended }),
            messagesSnapshot: workingMessages,
            templateText: text,
            tokens,
            reusedPrefix,
            createdAt: Date.now(),
            meta: {
              snapshot: snapshotKv({ arch, prevTokens, currTokens: tokens, decodeAppended }),
              decoded: assistantContent,
            },
          });
        }
      },
    );

    const assistantMsg: Message = {
      id: nanoid(8),
      role: "assistant",
      content: content || assistantContent,
      ...(reasoning ? { reasoning } : {}),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    };
    workingMessages = [...workingMessages, assistantMsg];
    onMessages(workingMessages);

    prevTokens = tokens;

    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        onStep({
          id: nanoid(8),
          kind: "tool_call",
          turn,
          label: stepLabel(lang, turn, "tool_call", { name: tc.name }),
          messagesSnapshot: workingMessages,
          toolCall: tc,
          createdAt: Date.now(),
        });

        const tool = findTool(tc.name);
        let result: string;
        if (!tool) {
          result = `error: unknown tool '${tc.name}'`;
        } else {
          try {
            result = await tool.run(tc.arguments);
          } catch (e) {
            result = `error: ${(e as Error).message}`;
          }
        }

        const toolMsg: Message = {
          id: nanoid(8),
          role: "tool",
          content: result,
          tool_call_id: tc.id,
          name: tc.name,
        };
        workingMessages = [...workingMessages, toolMsg];
        onMessages(workingMessages);

        onStep({
          id: nanoid(8),
          kind: "tool_result",
          turn,
          label: stepLabel(lang, turn, "tool_result", { name: tc.name }),
          messagesSnapshot: workingMessages,
          toolCall: tc,
          toolResult: result,
          createdAt: Date.now(),
        });
      }
      continue;
    }

    // Re-render the post-turn state so the chat template / tokens panels
    // reflect the conversation *including* the just-arrived assistant
    // reply. Without this, both panels would stay pinned to the pre-decode
    // prefill snapshot (selectedStepId points at this final step, whose
    // `tokens` would be empty otherwise → useLensView walks back to the
    // last decode step, whose messagesSnapshot still lacks the assistant).
    const { text: postText, tokens: postTokens } = renderAndTokenize({
      messages: workingMessages,
      tools,
      family,
      addGenerationPrompt: false,
      tokenizerKey,
    });
    const postReused = diffPrefix(prevTokens, postTokens);

    onStep({
      id: nanoid(8),
      kind: "final",
      turn,
      label: stepLabel(lang, turn, "final", { reason: finishReason ?? "stop" }),
      messagesSnapshot: workingMessages,
      templateText: postText,
      tokens: postTokens,
      reusedPrefix: postReused,
      createdAt: Date.now(),
      meta: {
        snapshot: snapshotKv({
          arch,
          prevTokens,
          currTokens: postTokens,
          decodeAppended: 0,
        }),
      },
    });
    break;
  }

  return workingMessages;
}

function stepLabel(
  lang: Lang,
  turn: number,
  kind: "compose" | "template" | "tokenize" | "prefill" | "decode" | "tool_call" | "tool_result" | "final",
  data: { tokens?: number; fresh?: number; reused?: number; name?: string; reason?: string } = {},
): string {
  if (lang === "zh") {
    switch (kind) {
      case "compose":
        return `Turn ${turn}: 拼装 messages`;
      case "template":
        return `Turn ${turn}: 应用 chat template`;
      case "tokenize":
        return `Turn ${turn}: 分词 (${data.tokens} tokens)`;
      case "prefill":
        return `Turn ${turn}: prefill (${data.fresh} new, ${data.reused} reused)`;
      case "decode":
        return `Turn ${turn}: decode +${data.tokens} tokens`;
      case "tool_call":
        return `Turn ${turn}: tool_call → ${data.name}`;
      case "tool_result":
        return `Turn ${turn}: tool_result ← ${data.name}`;
      case "final":
        return `Turn ${turn}: 完成 (${data.reason})`;
    }
  }
  switch (kind) {
    case "compose":
      return `Turn ${turn}: compose messages`;
    case "template":
      return `Turn ${turn}: apply chat template`;
    case "tokenize":
      return `Turn ${turn}: tokenize (${data.tokens} tokens)`;
    case "prefill":
      return `Turn ${turn}: prefill (${data.fresh} new, ${data.reused} reused)`;
    case "decode":
      return `Turn ${turn}: decode +${data.tokens} tokens`;
    case "tool_call":
      return `Turn ${turn}: tool call → ${data.name}`;
    case "tool_result":
      return `Turn ${turn}: tool result ← ${data.name}`;
    case "final":
      return `Turn ${turn}: finished (${data.reason})`;
  }
}
