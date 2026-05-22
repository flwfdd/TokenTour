import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";

import type { Message, ToolSpec, TimelineStep, ProviderConfig, TokenInfo } from "~/lib/types";
import { DEFAULT_MODEL_KEY, MODEL_REGISTRY, getModel } from "~/lib/modelRegistry";
import { TEMPLATE_BUNDLES } from "~/lib/chatTemplates";
import { BUILTIN_TOOLS } from "~/lib/tools";
import { PROVIDER_PRESETS } from "~/lib/providers";

export interface ConversationState {
  systemPrompt: string;
  messages: Message[];
  enabledTools: string[];
  modelKey: string;

  steps: TimelineStep[];
  selectedStepId: string | null;
  isRunning: boolean;
  hoverRole: string | null;
  hoverTokenIndex: number | null;
  hoverMessageId: string | null;
  /**
   * Position of the hovered token within its enclosing message, as a
   * fraction in [0, 1]. Lets cross-tokenizer / cross-family compare panes
   * scroll to *approximately the same spot* in the same message even when
   * absolute token indices don't line up. `null` ⇒ no fractional hint
   * (fall back to scroll-to-first-match).
   */
  hoverMessageFraction: number | null;
  /** Identifier of the pane that currently owns the hover (mouse is over it).
   *  Used to suppress self-scrolling so a pane never auto-scrolls under the
   *  cursor — only sibling panes react. */
  hoverSource: string | null;
  contextLimitOverride: number;
  /** Tokenizer override; `null` means use the model family's default. */
  tokenizerKey: string | null;
  /**
   * Chat-template family in use. Decoupled from `modelKey` — the
   * architecture only drives KV-cache estimation; this field decides what
   * Jinja template the messages get rendered through. Defaults to the
   * family of the initial `modelKey` and is user-controllable from the
   * Chat Template pane.
   */
  templateFamily: string;
  messagesModalOpen: boolean;

  /**
   * Frozen "what the KV cache server already has for us" baseline. Set once
   * on initial mount (representing the seeded conversation as if the server
   * already cached it) and updated only on real commit events — generation
   * completion or explicit reset. NOT touched when the user edits a message,
   * which is precisely what makes `reusedPrefix` shrink as their edits
   * diverge from the baseline and snap back when they restore it.
   *
   * Kept in memory only (not persisted): on every page reload we re-derive
   * it from whatever messages are currently loaded, treating that as the
   * new "cached" state. The persisted `messages` survive the reload either
   * way; the baseline just re-seeds against them.
   */
  baselineTokens: TokenInfo[] | null;
  baselineSnapshot: {
    reusedPrefix: number;
    prefillNew: number;
    decodeAppended: number;
    totalLen: number;
  } | null;

  provider: ProviderConfig;

  setSystemPrompt(p: string): void;
  setMessages(m: Message[]): void;
  pushMessage(m: Message): void;
  updateMessage(id: string, patch: Partial<Message>): void;
  removeMessage(id: string): void;
  clearConversation(): void;
  setEnabledTools(names: string[]): void;
  toggleTool(name: string): void;
  setModelKey(key: string): void;
  setContextLimitOverride(n: number): void;
  setTokenizerKey(key: string | null): void;
  setTemplateFamily(family: string): void;

  appendStep(s: TimelineStep): void;
  clearSteps(): void;
  selectStep(id: string | null): void;
  setRunning(b: boolean): void;
  /** Seed the cache baseline only if it hasn't been set yet (idempotent). */
  seedBaseline(b: { tokens: TokenInfo[]; reusedPrefix: number; prefillNew: number; decodeAppended: number; totalLen: number }): void;
  /** Overwrite the baseline unconditionally (called after a real turn commits). */
  commitBaseline(b: { tokens: TokenInfo[]; reusedPrefix: number; prefillNew: number; decodeAppended: number; totalLen: number }): void;
  /** Forget the baseline so the next render re-derives from current messages. */
  resetBaseline(): void;
  setHoverRole(role: string | null): void;
  setHoverToken(index: number | null): void;
  setHoverMessage(id: string | null): void;
  setHoverSource(source: string | null): void;
  /**
   * Unified hover entry-point for token-shaped things. Sets `hoverTokenIndex`
   * plus derives `hoverMessageId` / `hoverRole` from the token so every panel
   * (chat, template, tokens, KV grid) can react with the right granularity.
   *
   * Pass `{ aligned: false }` from comparison sub-panes (different tokenizer
   * / different chat-template family) where `t.position` does NOT correspond
   * to other panes' indexing — that suppresses the global `hoverTokenIndex`
   * write so primary panes don't highlight an unrelated chip.
   */
  setHoverFromToken(
    t: { position: number; segment?: string; messageId?: string } | null,
    opts?: { aligned?: boolean; fraction?: number },
  ): void;
  setMessagesModalOpen(open: boolean): void;

  setProvider(p: Partial<ProviderConfig>): void;
}

const defaultProvider: ProviderConfig = {
  id: "openai",
  name: PROVIDER_PRESETS[0]!.label,
  baseUrl: PROVIDER_PRESETS[0]!.baseUrl,
  apiKey: "",
  model: PROVIDER_PRESETS[0]!.exampleModels[0]!,
  modelKey: DEFAULT_MODEL_KEY,
  useProxy: false,
  temperature: 0.2,
  maxTokens: 1024,
};

const defaultSystemPrompt =
  "You are a concise, friendly assistant. When asked computations or facts, prefer calling the available tools instead of guessing.";

const seedMessage: Message = {
  id: nanoid(8),
  role: "user",
  content: "12 * (3 + 4) 等于多少？再告诉我现在 UTC 时间。",
};

export const useConversation = create<ConversationState>()(
  persist(
    (set) => ({
      systemPrompt: defaultSystemPrompt,
      messages: [seedMessage],
      enabledTools: BUILTIN_TOOLS.map((t) => t.spec.name),
      modelKey: DEFAULT_MODEL_KEY,

      steps: [],
      selectedStepId: null,
      isRunning: false,
      hoverRole: null,
      hoverTokenIndex: null,
      hoverMessageId: null,
      hoverMessageFraction: null,
      hoverSource: null,
      contextLimitOverride: 4096,
      tokenizerKey: null,
      templateFamily: getModel(DEFAULT_MODEL_KEY).family,
      messagesModalOpen: false,
      baselineTokens: null,
      baselineSnapshot: null,

      provider: defaultProvider,

      setSystemPrompt: (p) => set({ systemPrompt: p, selectedStepId: null }),
      setMessages: (m) => set({ messages: m }),
      pushMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      updateMessage: (id, patch) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
          selectedStepId: null,
        })),
      removeMessage: (id) =>
        set((s) => ({
          messages: s.messages.filter((m) => m.id !== id),
          selectedStepId: null,
        })),
      clearConversation: () =>
        set({
          messages: [],
          steps: [],
          selectedStepId: null,
          baselineTokens: null,
          baselineSnapshot: null,
        }),
      setEnabledTools: (names) => set({ enabledTools: names }),
      toggleTool: (name) =>
        set((s) => ({
          enabledTools: s.enabledTools.includes(name)
            ? s.enabledTools.filter((n) => n !== name)
            : [...s.enabledTools, name],
        })),
      setModelKey: (key) =>
        set((s) => ({
          modelKey: MODEL_REGISTRY[key] ? key : s.modelKey,
        })),
      setContextLimitOverride: (n) =>
        set({ contextLimitOverride: Math.max(64, Math.floor(n) || 4096) }),
      setTokenizerKey: (key) =>
        set({ tokenizerKey: key, baselineTokens: null, baselineSnapshot: null }),
      setTemplateFamily: (family) =>
        set({
          templateFamily: TEMPLATE_BUNDLES[family]
            ? family
            : getModel(DEFAULT_MODEL_KEY).family,
          selectedStepId: null,
          // Different template ⇒ totally different rendered tokens; the old
          // baseline can no longer be diffed meaningfully. Force re-seed.
          baselineTokens: null,
          baselineSnapshot: null,
        }),

      appendStep: (st) =>
        set((s) => ({
          steps: [...s.steps, st],
          selectedStepId: st.id,
        })),
      clearSteps: () =>
        // Wiping the timeline ⇒ we're back to a "fresh" view of whatever
        // messages currently live in the store; let the next render re-seed
        // baseline against that state rather than carrying over a stale one.
        set({ steps: [], selectedStepId: null, baselineTokens: null, baselineSnapshot: null }),
      selectStep: (id) => set({ selectedStepId: id }),
      setRunning: (b) => set({ isRunning: b }),
      seedBaseline: (b) =>
        set((s) =>
          s.baselineTokens
            ? s
            : {
                baselineTokens: b.tokens,
                baselineSnapshot: {
                  reusedPrefix: b.reusedPrefix,
                  prefillNew: b.prefillNew,
                  decodeAppended: b.decodeAppended,
                  totalLen: b.totalLen,
                },
              },
        ),
      commitBaseline: (b) =>
        set({
          baselineTokens: b.tokens,
          baselineSnapshot: {
            reusedPrefix: b.reusedPrefix,
            prefillNew: b.prefillNew,
            decodeAppended: b.decodeAppended,
            totalLen: b.totalLen,
          },
        }),
      resetBaseline: () => set({ baselineTokens: null, baselineSnapshot: null }),
      setHoverRole: (role) => set({ hoverRole: role }),
      setHoverToken: (index) => set({ hoverTokenIndex: index }),
      setHoverMessage: (id) => set({ hoverMessageId: id }),
      setHoverSource: (source) =>
        set((s) => (s.hoverSource === source ? s : { hoverSource: source })),
      setHoverFromToken: (t, opts) => {
        if (!t) {
          set({
            hoverTokenIndex: null,
            hoverMessageId: null,
            hoverRole: null,
            hoverMessageFraction: null,
          });
          return;
        }
        const tokenIndex = opts?.aligned === false ? null : t.position;
        const fraction =
          typeof opts?.fraction === "number"
            ? Math.min(1, Math.max(0, opts.fraction))
            : null;
        // Message-bound tokens hover-light their *specific* message; tokens
        // without a message (control / generation / tools_schema) fall back to
        // segment-wide hover so legends and the schema area still respond.
        if (t.messageId) {
          set({
            hoverTokenIndex: tokenIndex,
            hoverMessageId: t.messageId,
            hoverRole: null,
            hoverMessageFraction: fraction,
          });
        } else {
          set({
            hoverTokenIndex: tokenIndex,
            hoverMessageId: null,
            hoverRole: t.segment ?? null,
            hoverMessageFraction: fraction,
          });
        }
      },
      setMessagesModalOpen: (open) => set({ messagesModalOpen: open }),

      setProvider: (p) => set((s) => ({ provider: { ...s.provider, ...p } })),
    }),
    {
      name: "llmvis-conversation",
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        systemPrompt: s.systemPrompt,
        messages: s.messages,
        enabledTools: s.enabledTools,
        modelKey: s.modelKey,
        provider: s.provider,
        contextLimitOverride: s.contextLimitOverride,
        tokenizerKey: s.tokenizerKey,
        templateFamily: s.templateFamily,
      }),
      migrate: (persisted: any, fromVersion) => {
        if (fromVersion < 2 && persisted && typeof persisted === "object") {
          // v1 stored `templateFamilyOverride: string | null`. Collapse the
          // nullable override into a concrete family, defaulting to the
          // current modelKey's arch family.
          const modelKey =
            typeof persisted.modelKey === "string"
              ? persisted.modelKey
              : DEFAULT_MODEL_KEY;
          const family =
            (persisted.templateFamilyOverride as string | null | undefined) ??
            getModel(modelKey).family;
          delete persisted.templateFamilyOverride;
          persisted.templateFamily = TEMPLATE_BUNDLES[family]
            ? family
            : getModel(DEFAULT_MODEL_KEY).family;
        }
        if (fromVersion < 3 && persisted && typeof persisted === "object") {
          // The built-in tokenizer registry was trimmed (o200k → harmony,
          // labels updated to GPT-4 / GPT-OSS). Any stale persisted key that
          // no longer exists in the registry would silently fall back; reset
          // to `null` (= auto) so users get the matching HF tokenizer for
          // their template family by default.
          const validBuiltins = new Set(["cl100k", "harmony"]);
          const validHf = new Set(["qwen3", "deepseek_v3"]);
          const k = persisted.tokenizerKey;
          if (typeof k === "string" && !validBuiltins.has(k) && !validHf.has(k)) {
            persisted.tokenizerKey = null;
          }
        }
        return persisted;
      },
    },
  ),
);

export function getActiveTools(): ToolSpec[] {
  const enabled = useConversation.getState().enabledTools;
  return BUILTIN_TOOLS.filter((t) => enabled.includes(t.spec.name)).map((t) => t.spec);
}

export function buildOutgoingMessages(state: ConversationState): Message[] {
  const sys: Message = {
    id: "sys",
    role: "system",
    content: state.systemPrompt,
  };
  return [sys, ...state.messages];
}
