import { nanoid } from "nanoid";
import type { Message, ToolSpec, TimelineStep, ModelArch, ToolCall } from "./types";
import type { ChatProvider, ChatRequest, DeltaEvent } from "./providers";
import { runAgentLoop } from "./agentLoop";
import { stripSystemSentinel } from "./messageUtils";

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
  /** Chat-template family to render with (decoupled from `arch.family`). */
  templateFamily: string;
  onStep: (s: TimelineStep) => void;
  onMessages: (m: Message[]) => void;
  onAssistantDelta?: (d: string) => void;
  delayMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const chunkText = (s: string, n: number) =>
  Array.from({ length: Math.ceil(s.length / n) }, (_, i) => s.slice(i * n, (i + 1) * n));

/**
 * `ChatProvider` that replays a recorded transcript turn-by-turn instead
 * of hitting a real backend. Letting `runDemo` plug this into the same
 * `runAgentLoop` as live runs means there is exactly one render →
 * tokenize → KV-snapshot pipeline to maintain.
 */
function createMockProvider(turns: DemoTurn[], delayMs: number): ChatProvider {
  let cursor = 0;
  return {
    id: "demo-mock",
    name: "Demo (recorded)",
    async stream(_req: ChatRequest, onDelta) {
      const turn = turns[cursor++];
      if (!turn) return { content: "", toolCalls: [], finishReason: "stop" };

      // Pause so the surrounding compose/template/tokenize/prefill steps
      // (emitted synchronously by `runAgentLoop` before this stream call)
      // have time to animate before content starts arriving.
      await sleep(delayMs);

      let content = "";
      if (turn.assistantContent) {
        for (const ch of chunkText(turn.assistantContent, 8)) {
          content += ch;
          onDelta({ contentDelta: ch });
          await sleep(delayMs / 2);
        }
      }
      const toolCalls: ToolCall[] = (turn.toolCalls ?? []).map((tc) => ({
        id: nanoid(8),
        name: tc.name,
        arguments: tc.arguments,
      }));
      const finishReason: DeltaEvent["finishReason"] =
        toolCalls.length > 0 ? "tool_calls" : "stop";
      return { content, toolCalls, finishReason };
    },
  };
}

export async function runDemo(args: DemoArgs): Promise<void> {
  const {
    arch,
    initialMessages,
    tools,
    tokenizerKey = null,
    templateFamily,
    onStep,
    onMessages,
    onAssistantDelta,
    delayMs = 250,
  } = args;

  // The first transcript entry is purely the user prompt — seed it into
  // the message list (so the chat panel shows it before prefill starts),
  // then let `runAgentLoop` drive the remaining assistant turns through
  // the mock provider.
  const seedUser = DEMO_TRANSCRIPT[0]?.user;
  const startingMessages: Message[] = seedUser
    ? [...initialMessages, { id: nanoid(8), role: "user", content: seedUser }]
    : [...initialMessages];
  onMessages(stripSystemSentinel(startingMessages));

  const assistantTurns = DEMO_TRANSCRIPT.slice(1);
  const provider = createMockProvider(assistantTurns, delayMs);

  await runAgentLoop({
    provider,
    baseUrl: "",
    apiKey: "",
    model: "demo",
    arch,
    messages: startingMessages,
    tools,
    templateFamily,
    tokenizerKey,
    maxIterations: assistantTurns.length,
    onStep,
    onMessages: (m) => onMessages(stripSystemSentinel(m)),
    onAssistantDelta,
  });
}
