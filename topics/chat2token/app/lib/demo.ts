import { nanoid } from "nanoid";
import type { Message } from "./types";
import { findTool } from "./tools";

/** System prompt that ships with the demo so it's a self-contained example
 * (the conversation below leans on tool-calling, which this prompt encourages). */
export const DEMO_SYSTEM_PROMPT =
  "You are a concise, friendly assistant. When asked computations or facts, prefer calling the available tools instead of guessing.";

/**
 * Build a fresh demo conversation — no playback, no streaming, no timeline
 * steps; the "Demo" button just initializes the conversation state to a
 * representative example so the four panels have something to visualize.
 *
 * The question — "今天的年月日相乘是多少？" — depends on the *current* date, so
 * the example is generated dynamically: the agent first calls `current_time`
 * to learn today's date, then `calculator` to multiply 年 × 月 × 日, then states
 * the answer. All three assistant turns carry a reasoning trace, and the tools
 * are executed for real so the tool results (and the final number) are always
 * internally consistent.
 */
export async function buildDemoMessages(): Promise<Message[]> {
  const timeTool = findTool("current_time");
  const calc = findTool("calculator");

  const isoNow = timeTool ? await timeTool.run({}) : new Date().toString();
  // Pull Y/M/D straight from the (local) ISO the tool returned so the numbers
  // we reason about match the tool result exactly. Numeric (not zero-padded)
  // so the calculator expression has no octal-literal pitfalls (e.g. `05`).
  const now = new Date();
  const md = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoNow);
  const year = md ? Number(md[1]) : now.getFullYear();
  const month = md ? Number(md[2]) : now.getMonth() + 1;
  const day = md ? Number(md[3]) : now.getDate();
  const expression = `${year} * ${month} * ${day}`;
  const dateLabel = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const timeCallId = nanoid(8);
  const calcCallId = nanoid(8);
  const product = calc ? await calc.run({ expression }) : String(year * month * day);

  return [
    {
      id: nanoid(8),
      role: "user",
      content: "今天的年月日相乘是多少？",
    },
    {
      id: nanoid(8),
      role: "assistant",
      content: "",
      reasoning:
        "用户要「年 × 月 × 日」的乘积，但我并不知道今天是几号——日期没法靠推理得到，必须先查。" +
        "先调用 current_time 拿到当前 UTC 日期，下一步再做乘法。",
      tool_calls: [{ id: timeCallId, name: "current_time", arguments: {} }],
    },
    {
      id: nanoid(8),
      role: "tool",
      content: isoNow,
      tool_call_id: timeCallId,
      name: "current_time",
    },
    {
      id: nanoid(8),
      role: "assistant",
      content: "",
      reasoning:
        `current_time 返回 ${isoNow}，所以今天是 ${year} 年 ${month} 月 ${day} 日，` +
        `年月日相乘就是 ${expression}。乘法我能心算，但为了演示工具调用、也避免手滑算错，交给 calculator 更稳妥。`,
      tool_calls: [{ id: calcCallId, name: "calculator", arguments: { expression } }],
    },
    {
      id: nanoid(8),
      role: "tool",
      content: product,
      tool_call_id: calcCallId,
      name: "calculator",
    },
    {
      id: nanoid(8),
      role: "assistant",
      content: `今天是 ${dateLabel}，年 × 月 × 日 = ${expression} = ${product}。`,
      reasoning:
        `calculator 返回 ${product}，与预期一致。把它整理成一句自然语言回答，` +
        `并带上今天的日期作为依据即可。`,
    },
  ];
}
