import { nanoid } from "nanoid";
import type { Message, ToolSpec, TimelineStep, ModelArch } from "./types";
import type { ChatProvider } from "./providers";
import { findTool } from "./tools";
import { renderChatTemplate } from "./template";
import { computeSpans } from "./spans";
import { tokenize, countTokens } from "./tokenizer";
import { snapshotKv, diffPrefix } from "./kvSim";

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
  } = args;

  const family = templateFamily;

  let workingMessages = [...args.messages];
  let prevTokens: ReturnType<typeof tokenize>["tokens"] | undefined;
  let turn = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    turn++;
    const composeStep: TimelineStep = {
      id: nanoid(8),
      kind: "compose",
      turn,
      label: `Turn ${turn}: 拼装 messages`,
      messagesSnapshot: workingMessages,
      createdAt: Date.now(),
    };
    onStep(composeStep);

    const rendered = renderChatTemplate({
      messages: workingMessages,
      tools,
      family,
      addGenerationPrompt: true,
    });
    const { cleanedText, spans } = computeSpans({
      messages: workingMessages,
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

    onStep({
      id: nanoid(8),
      kind: "template",
      turn,
      label: `Turn ${turn}: 应用 chat template`,
      messagesSnapshot: workingMessages,
      templateText: text,
      createdAt: Date.now(),
    });

    const reusedPrefix = diffPrefix(prevTokens, tokens);
    onStep({
      id: nanoid(8),
      kind: "tokenize",
      turn,
      label: `Turn ${turn}: 分词 (${tokens.length} tokens)`,
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
      label: `Turn ${turn}: prefill (${tokens.length - reusedPrefix} new, ${reusedPrefix} reused)`,
      messagesSnapshot: workingMessages,
      templateText: text,
      tokens,
      reusedPrefix,
      createdAt: Date.now(),
      meta: { snapshot: snapshotKv({ arch, prevTokens, currTokens: tokens, decodeAppended: 0 }) },
    });

    let decodeAppended = 0;
    let assistantContent = "";
    const { content, toolCalls, finishReason } = await provider.stream(
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
            label: `Turn ${turn}: decode +${decodeAppended} tokens`,
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
          label: `Turn ${turn}: tool_call → ${tc.name}`,
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
          label: `Turn ${turn}: tool_result ← ${tc.name}`,
          messagesSnapshot: workingMessages,
          toolCall: tc,
          toolResult: result,
          createdAt: Date.now(),
        });
      }
      continue;
    }

    // Re-render + re-tokenize the post-turn state so the chat template /
    // tokens panels reflect the conversation *including* the just-arrived
    // assistant reply. Without this, both panels would stay pinned to the
    // pre-decode prefill snapshot (selectedStepId points at this final
    // step, whose `tokens` is empty → useLensView walks back to the last
    // decode step, whose messagesSnapshot still doesn't have the assistant).
    const postRendered = renderChatTemplate({
      messages: workingMessages,
      tools,
      family,
      addGenerationPrompt: false,
    });
    const { cleanedText: postClean, spans: postSpans } = computeSpans({
      messages: workingMessages,
      tools,
      family,
      addGenerationPrompt: false,
    });
    const postText = postClean.length > 0 ? postClean : postRendered.text;
    const { tokens: postTokens } = tokenize(postText, {
      bundle: postRendered.bundle,
      family,
      spans: postSpans,
      tokenizerKey,
    });
    const postReused = diffPrefix(prevTokens, postTokens);

    onStep({
      id: nanoid(8),
      kind: "final",
      turn,
      label: `Turn ${turn}: 完成 (${finishReason ?? "stop"})`,
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
