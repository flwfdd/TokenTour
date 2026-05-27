#!/usr/bin/env node
/**
 * Re-pull canonical chat templates from upstream and overwrite the
 * corresponding files in `topics/chat2token/app/lib/chatTemplates/*.jinja`.
 *
 * Run:
 *   node scripts/sync-chat-templates.mjs            # default endpoints
 *   HF_ENDPOINT=https://huggingface.co node scripts/sync-chat-templates.mjs
 *
 * Verifies byte-for-byte equality after writing.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

const HF = process.env.HF_ENDPOINT ?? "https://hf-mirror.com";

const SOURCES = [
  {
    family: "qwen",
    file: "topics/chat2token/app/lib/chatTemplates/qwen3.jinja",
    url: `${HF}/Qwen/Qwen3-8B/raw/main/tokenizer_config.json`,
    extract: "chat_template",
    note: "Qwen/Qwen3-8B chat_template (tokenizer_config.json)",
  },
  {
    family: "deepseek",
    file: "topics/chat2token/app/lib/chatTemplates/deepseek_v3.jinja",
    url: "https://raw.githubusercontent.com/vllm-project/vllm/main/examples/tool_chat_template_deepseekv3.jinja",
    extract: null, // raw jinja file
    note: "vLLM tool_chat_template_deepseekv3.jinja",
  },
  {
    family: "gpt_oss",
    file: "topics/chat2token/app/lib/chatTemplates/gpt_oss.jinja",
    url: `${HF}/openai/gpt-oss-20b/raw/main/chat_template.jinja`,
    extract: null,
    note: "openai/gpt-oss-20b chat_template.jinja (Harmony format)",
  },
];

async function fetchTemplate(src) {
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`${src.url} → HTTP ${res.status}`);
  const body = await res.text();
  if (!src.extract) return body;
  const j = JSON.parse(body);
  const v = j[src.extract];
  if (Array.isArray(v)) return v[0].template;
  return v ?? "";
}

async function main() {
  for (const src of SOURCES) {
    process.stdout.write(`sync ${src.family} <- ${src.url} … `);
    const raw = await fetchTemplate(src);
    await fs.writeFile(path.resolve(src.file), raw);
    console.log(`${raw.length} chars OK`);
  }

  // Verify equality
  for (const src of SOURCES) {
    const upstream = await fetchTemplate(src);
    const local = await fs.readFile(path.resolve(src.file), "utf8");
    if (local !== upstream) {
      console.error(`✗ ${src.family} drift: local=${local.length} upstream=${upstream.length}`);
      process.exitCode = 1;
    } else {
      console.log(`✓ ${src.family}: byte-identical to upstream (${local.length} chars)`);
    }
  }
}

main().catch((err) => {
  console.error("sync failed:", err);
  process.exitCode = 1;
});
