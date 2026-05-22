import type { ModelArch } from "./types";

/**
 * Curated model architectures used by KV-cache estimations and the chat
 * template family lookup. All numbers are taken directly from each model's
 * upstream `config.json` (vocab_size / hidden_size / num_hidden_layers /
 * num_attention_heads / num_key_value_heads / head_dim /
 * max_position_embeddings). No estimated / community-guess entries.
 *
 * Sources (verified 2026-05-22 via https://hf-mirror.com):
 *   - Qwen3 dense:  Qwen/Qwen3-{0.6B,8B,32B}/config.json
 *   - Qwen3 MoE:    Qwen/Qwen3-{30B-A3B,235B-A22B}/config.json
 *   - DeepSeek-V3:  deepseek-ai/DeepSeek-V3/config.json
 *   - GPT-OSS:      openai/gpt-oss-{20b,120b}/config.json
 *
 * Note on MLA (DeepSeek-V3): config.json reports MHA-style
 * `num_key_value_heads`, but the actual KV cache is much smaller because of
 * Multi-head Latent Attention. We show the MHA upper bound here; real
 * deployments will be a few× to ~10× smaller depending on kv_lora_rank.
 */
export const MODEL_REGISTRY: Record<string, ModelArch> = {
  // ---- Qwen3 dense family ----
  "qwen3-0.6b": {
    key: "qwen3-0.6b",
    label: "Qwen3-0.6B",
    family: "qwen",
    paramsB: 0.6,
    hiddenSize: 1024,
    numLayers: 28,
    numHeads: 16,
    numKvHeads: 8,
    headDim: 128,
    vocabSize: 151936,
    maxContext: 40960,
    dtypeBytes: 2,
    tokenizerRepo: "Qwen/Qwen3-0.6B",
    notes: "GQA 2:1, tiny ChatML model — handy for client-side demos",
  },
  "qwen3-8b": {
    key: "qwen3-8b",
    label: "Qwen3-8B",
    family: "qwen",
    paramsB: 8,
    hiddenSize: 4096,
    numLayers: 36,
    numHeads: 32,
    numKvHeads: 8,
    headDim: 128,
    vocabSize: 151936,
    maxContext: 40960,
    dtypeBytes: 2,
    tokenizerRepo: "Qwen/Qwen3-8B",
    notes: "Canonical Qwen3 chat-template source",
  },
  "qwen3-32b": {
    key: "qwen3-32b",
    label: "Qwen3-32B",
    family: "qwen",
    paramsB: 32,
    hiddenSize: 5120,
    numLayers: 64,
    numHeads: 64,
    numKvHeads: 8,
    headDim: 128,
    vocabSize: 151936,
    maxContext: 40960,
    dtypeBytes: 2,
    tokenizerRepo: "Qwen/Qwen3-32B",
  },

  // ---- Qwen3 MoE family ----
  "qwen3-30b-a3b": {
    key: "qwen3-30b-a3b",
    label: "Qwen3-30B-A3B",
    family: "qwen",
    paramsB: 30,
    hiddenSize: 2048,
    numLayers: 48,
    numHeads: 32,
    numKvHeads: 4,
    headDim: 128,
    vocabSize: 151936,
    maxContext: 40960,
    dtypeBytes: 2,
    tokenizerRepo: "Qwen/Qwen3-30B-A3B",
    notes: "MoE: 128 experts, 8 active per token; ~3 B active params",
  },
  "qwen3-235b-a22b": {
    key: "qwen3-235b-a22b",
    label: "Qwen3-235B-A22B",
    family: "qwen",
    paramsB: 235,
    hiddenSize: 4096,
    numLayers: 94,
    numHeads: 64,
    numKvHeads: 4,
    headDim: 128,
    vocabSize: 151936,
    maxContext: 40960,
    dtypeBytes: 2,
    tokenizerRepo: "Qwen/Qwen3-235B-A22B",
    notes: "MoE: 128 experts, 8 active per token; ~22 B active params",
  },

  // ---- GPT-OSS (OpenAI open-source) ----
  "gpt-oss-20b": {
    key: "gpt-oss-20b",
    label: "GPT-OSS-20B",
    family: "gpt_oss",
    paramsB: 20,
    hiddenSize: 2880,
    numLayers: 24,
    numHeads: 64,
    numKvHeads: 8,
    headDim: 64,
    vocabSize: 201088,
    maxContext: 131072,
    dtypeBytes: 2,
    tokenizerRepo: "openai/gpt-oss-20b",
    notes: "Harmony chat format; MoE: 32 experts, 4 active per token",
  },
  "gpt-oss-120b": {
    key: "gpt-oss-120b",
    label: "GPT-OSS-120B",
    family: "gpt_oss",
    paramsB: 120,
    hiddenSize: 2880,
    numLayers: 36,
    numHeads: 64,
    numKvHeads: 8,
    headDim: 64,
    vocabSize: 201088,
    maxContext: 131072,
    dtypeBytes: 2,
    tokenizerRepo: "openai/gpt-oss-120b",
    notes: "Harmony chat format; MoE: 128 experts, 4 active per token",
  },

  // ---- DeepSeek-V3 ----
  "deepseek-v3": {
    key: "deepseek-v3",
    label: "DeepSeek-V3",
    family: "deepseek",
    paramsB: 671,
    hiddenSize: 7168,
    numLayers: 61,
    numHeads: 128,
    numKvHeads: 128,
    headDim: 56,
    vocabSize: 129280,
    maxContext: 163840,
    dtypeBytes: 2,
    tokenizerRepo: "deepseek-ai/DeepSeek-V3",
    notes: "Uses MLA; numbers shown are the MHA upper bound. Real KV cache ~5–10× smaller.",
  },

};

export const DEFAULT_MODEL_KEY = "qwen3-8b";

export function getModel(key: string): ModelArch {
  return MODEL_REGISTRY[key] ?? MODEL_REGISTRY[DEFAULT_MODEL_KEY]!;
}

export function listModels(): ModelArch[] {
  return Object.values(MODEL_REGISTRY);
}

export function perTokenKvBytes(arch: ModelArch): number {
  return 2 * arch.numLayers * arch.numKvHeads * arch.headDim * arch.dtypeBytes;
}

export function kvBytes(arch: ModelArch, seqLen: number): number {
  return perTokenKvBytes(arch) * seqLen;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
