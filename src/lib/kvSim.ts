import type { ModelArch, TokenInfo } from "./types";
import { perTokenKvBytes, formatBytes } from "./modelRegistry";

export type CellState = "reused" | "prefill" | "decode" | "pending";

export interface KvSnapshot {
  totalLen: number;
  reusedPrefix: number;
  prefillNew: number;
  decodeAppended: number;
  tokens: TokenInfo[];
  perTokenBytes: number;
  totalBytes: number;
  contextLimit: number;
}

export function diffPrefix(prev: TokenInfo[] | undefined, curr: TokenInfo[]): number {
  if (!prev || prev.length === 0) return 0;
  const max = Math.min(prev.length, curr.length);
  let i = 0;
  while (i < max && prev[i]!.id === curr[i]!.id && prev[i]!.text === curr[i]!.text) i++;
  return i;
}

export function snapshotKv(args: {
  arch: ModelArch;
  prevTokens?: TokenInfo[];
  currTokens: TokenInfo[];
  decodeAppended?: number;
}): KvSnapshot {
  const { arch, prevTokens, currTokens, decodeAppended = 0 } = args;
  const reused = diffPrefix(prevTokens, currTokens);
  const total = currTokens.length + decodeAppended;
  const prefillNew = currTokens.length - reused;
  const perTok = perTokenKvBytes(arch);
  return {
    totalLen: total,
    reusedPrefix: reused,
    prefillNew,
    decodeAppended,
    tokens: currTokens,
    perTokenBytes: perTok,
    totalBytes: perTok * total,
    contextLimit: arch.maxContext,
  };
}

/**
 * Build a KvSnapshot from already-computed counts. Used by the "between
 * turns" synthesis path in `useLensView`, where the chat-template / tokens
 * panels render the FULL conversation (including the just-generated
 * assistant) but the KV breakdown wants to label that assistant's content
 * as `decode` rather than `prefill`.
 *
 * Caller passes the full token array (for display) and the three counts
 * directly; total = reused + prefill + decode.
 */
export function makeSnapshot(args: {
  arch: ModelArch;
  tokens: TokenInfo[];
  reusedPrefix: number;
  prefillNew: number;
  decodeAppended: number;
}): KvSnapshot {
  const { arch, tokens, reusedPrefix, prefillNew, decodeAppended } = args;
  const total = reusedPrefix + prefillNew + decodeAppended;
  const perTok = perTokenKvBytes(arch);
  return {
    totalLen: total,
    reusedPrefix,
    prefillNew,
    decodeAppended,
    tokens,
    perTokenBytes: perTok,
    totalBytes: perTok * total,
    contextLimit: arch.maxContext,
  };
}

export function cellStateAt(snapshot: KvSnapshot, position: number): CellState {
  if (position < snapshot.reusedPrefix) return "reused";
  if (position < snapshot.reusedPrefix + snapshot.prefillNew) return "prefill";
  if (position < snapshot.totalLen) return "decode";
  return "pending";
}

export function describeMemory(arch: ModelArch, seqLen: number): {
  total: string;
  perToken: string;
  per1kTokens: string;
} {
  const perTok = perTokenKvBytes(arch);
  return {
    total: formatBytes(perTok * seqLen),
    perToken: formatBytes(perTok),
    per1kTokens: formatBytes(perTok * 1000),
  };
}
