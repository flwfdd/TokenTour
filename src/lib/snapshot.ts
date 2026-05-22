import type { Message } from "./types";

export interface SharedSnapshot {
  systemPrompt: string;
  messages: Message[];
  enabledTools: string[];
  modelKey: string;
  version: 1;
}

function utf8ToB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToUtf8(b: string): string {
  const padded = b.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeSnapshot(s: SharedSnapshot): string {
  return utf8ToB64Url(JSON.stringify(s));
}

export function decodeSnapshot(token: string): SharedSnapshot | null {
  try {
    const obj = JSON.parse(b64UrlToUtf8(token));
    if (obj && obj.version === 1) return obj as SharedSnapshot;
  } catch {
    /* fallthrough */
  }
  return null;
}

export function snapshotToUrl(s: SharedSnapshot): string {
  const token = encodeSnapshot(s);
  const url = new URL(window.location.href);
  url.hash = `s=${token}`;
  return url.toString();
}

export function readSnapshotFromUrl(): SharedSnapshot | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash;
  if (!h.startsWith("#s=")) return null;
  return decodeSnapshot(h.slice(3));
}
