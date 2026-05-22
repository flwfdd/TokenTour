#!/usr/bin/env node
/**
 * Download HuggingFace tokenizer files into `public/tokenizers/<hfId>/` so the
 * browser app can load them with zero network at runtime — useful when end
 * users sit behind a firewall that blocks huggingface.co.
 *
 * Usage:
 *   pnpm fetch-tokenizers                   # uses hf-mirror.com (CN-friendly)
 *   HF_ENDPOINT=https://huggingface.co \
 *     pnpm fetch-tokenizers                 # direct HF
 *   HF_ENDPOINT=https://your.mirror/ \
 *     pnpm fetch-tokenizers                 # custom mirror
 *
 * Only run this once (or after editing HF_TOKENIZER_SPECS in
 * `src/lib/tokenizer.ts`). Total payload is ~25 MB.
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const OUT_DIR = join(ROOT, "public", "tokenizers");
const ENDPOINT = (process.env.HF_ENDPOINT || "https://hf-mirror.com").replace(/\/$/, "");

// Mirror of HF_TOKENIZER_SPECS in src/lib/tokenizer.ts — kept in sync manually
// because importing the TS module from a plain Node script is messy.
const SPECS = [
  { key: "qwen3", hfId: "Qwen/Qwen3-0.6B" },
  { key: "deepseek_v3", hfId: "deepseek-ai/DeepSeek-V3" },
];

// Minimal set transformers.js needs when `tokenizer.json` is the fast tokenizer.
// We skip legacy SentencePiece (tokenizer.model) + BPE artifacts (vocab.json /
// merges.txt) since they would be redundant — keeps the bundle ~half the size.
const CANDIDATE_FILES = [
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "config.json",
];

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function humanBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

async function fetchOne(hfId, file, outDir) {
  const url = `${ENDPOINT}/${hfId}/resolve/main/${file}`;
  const outPath = join(outDir, file);
  if (await fileExists(outPath)) {
    return { file, status: "cached" };
  }
  const r = await fetch(url, { redirect: "follow" });
  if (r.status === 404) return { file, status: "missing" };
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  return { file, status: "downloaded", bytes: buf.length };
}

async function main() {
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Output:   ${OUT_DIR}\n`);
  let totalBytes = 0;
  for (const spec of SPECS) {
    const outDir = join(OUT_DIR, spec.hfId);
    process.stdout.write(`[${spec.key}] ${spec.hfId}\n`);
    for (const f of CANDIDATE_FILES) {
      try {
        const r = await fetchOne(spec.hfId, f, outDir);
        if (r.status === "downloaded") {
          totalBytes += r.bytes;
          process.stdout.write(`  ✓ ${f}  ${humanBytes(r.bytes)}\n`);
        } else if (r.status === "cached") {
          process.stdout.write(`  · ${f}  (cached)\n`);
        }
        // skip "missing" silently — many repos don't have all files
      } catch (e) {
        process.stdout.write(`  ✗ ${f}  ${e.message}\n`);
      }
    }
  }
  console.log(`\nTotal downloaded this run: ${humanBytes(totalBytes)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
