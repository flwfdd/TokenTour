import { computeSpans } from "../topics/chat2token/app/lib/spans";
import { renderChatTemplate } from "../topics/chat2token/app/lib/template";

const messages = [
  { id: "sys", role: "system" as const, content: "You are concise." },
  { id: "u1", role: "user" as const, content: "今天上海天气怎么样" },
  {
    id: "a1", role: "assistant" as const, content: "",
    tool_calls: [{ id: "g1", name: "get_weather", arguments: { city: "Shanghai" } }],
  },
  {
    id: "t1", role: "tool" as const,
    content: '{"city":"Shanghai","condition":"snow"}',
    tool_call_id: "g1", name: "get_weather",
  },
  {
    id: "a2", role: "assistant" as const,
    content: "上海今天下雪。",
  },
];
const tools = [
  { name: "get_weather", description: "Get weather", parameters: { type: "object" as const, properties: { city: { type: "string" as const, description: "x" } }, required: ["city"] } },
];

for (const family of ["qwen", "gpt_oss", "deepseek"] as const) {
  console.log(`\n========== ${family} ==========`);
  const { cleanedText, spans } = computeSpans({ messages, tools, family, addGenerationPrompt: false });
  for (const s of spans) {
    const snip = cleanedText.slice(s.start, s.end);
    const shown = snip.length > 80 ? snip.slice(0, 40) + "…" + snip.slice(-30) : snip;
    console.log(`  [${s.start.toString().padStart(4)},${s.end.toString().padStart(4)}) ${s.segment.padEnd(13)} ${(s.role ?? '-').padEnd(10)} ${(s.messageId ?? '-').padEnd(5)}: ${JSON.stringify(shown)}`);
  }
}
