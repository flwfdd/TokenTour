import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { Pencil, Trash2, Check, ChevronDown, ChevronUp } from "lucide-react";

import { useConversation, getActiveTools, buildOutgoingMessages } from "./store";
import { getModel } from "./lib/modelRegistry";
import { PROVIDERS } from "./lib/providers";
import { runAgentLoop } from "./lib/agentLoop";
import { BUILTIN_TOOLS } from "./lib/tools";
import { runDemo } from "./lib/demo";
import { stripSystemSentinel } from "./lib/messageUtils";
import { useScrollMatchIntoView } from "./useScrollMatch";
import { SEG_ROLE_VAR, roleSurfaceStyle } from "./visual";
import type { Message, TokenSegment } from "./lib/types";

export default function AgentChat() {
  const state = useConversation();
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const tools = useMemo(() => getActiveTools(), [state.enabledTools]);
  const arch = getModel(state.modelKey);

  useScrollMatchIntoView({
    containerRef: listRef,
    paneId: "chat",
    hoverTokenIndex: null,
    hoverMessageId: state.hoverMessageId === "sys" ? null : state.hoverMessageId,
    hoverRole: null,
  });

  // While the agent is generating, keep the messages list pinned to the
  // bottom so new tool calls / assistant deltas / tool results stay visible
  // without manual scrolling. We trigger on `messages.length` (new message
  // appended) and on every step (so streamed decode updates also nudge it).
  useEffect(() => {
    if (!state.isRunning) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [state.isRunning, state.messages.length, state.steps.length]);

  const handleSend = async () => {
    if (state.isRunning || !input.trim()) return;
    const userMsg: Message = { id: nanoid(8), role: "user", content: input.trim() };
    state.pushMessage(userMsg);
    setInput("");
    await runLoop([...state.messages, userMsg]);
  };

  const handleDemo = async () => {
    if (state.isRunning) return;
    state.setRunning(true);
    state.clearSteps();
    state.setMessages([]);
    try {
      const initial = buildOutgoingMessages({ ...state, messages: [] });
      await runDemo({
        arch,
        initialMessages: initial,
        tools,
        tokenizerKey: state.tokenizerKey,
        templateFamily: state.templateFamily,
        onStep: (s) => state.appendStep(s),
        onMessages: (m) => state.setMessages(m),
        delayMs: 220,
      });
    } finally {
      state.setRunning(false);
    }
  };

  const runLoop = async (msgs: Message[]) => {
    if (!state.provider.apiKey && !state.provider.useProxy) {
      alert("请在「设置 / BYOK」里填入 API key，或切换到代理模式。");
      return;
    }
    state.setRunning(true);
    state.clearSteps();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const provider =
        PROVIDERS[
          state.provider.id === "anthropic" ? "anthropic" : "openai-compat"
        ]!;
      const outgoing = buildOutgoingMessages({ ...state, messages: msgs });
      const apiKey = state.provider.apiKey;
      await runAgentLoop({
        provider,
        baseUrl: state.provider.baseUrl,
        routeThroughProxy: state.provider.useProxy,
        apiKey,
        model: state.provider.model,
        arch,
        messages: outgoing,
        tools,
        temperature: state.provider.temperature,
        maxTokens: state.provider.maxTokens,
        tokenizerKey: state.tokenizerKey,
        templateFamily: state.templateFamily,
        onStep: (s) => state.appendStep(s),
        onMessages: (m) => state.setMessages(stripSystemSentinel(m)),
        signal: ctrl.signal,
      });
    } catch (e) {
      alert(`Agent loop error: ${(e as Error).message}`);
    } finally {
      state.setRunning(false);
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    state.setRunning(false);
  };

  return (
    <div
      className="flex h-full flex-col"
      onMouseEnter={() => state.setHoverSource("chat")}
      onMouseMove={() => state.setHoverSource("chat")}
      onMouseLeave={() => {
        state.setHoverSource(null);
        state.setHoverMessage(null);
      }}
    >
      <div className="px-3 pt-2.5 pb-2">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-(--color-muted)">
          System prompt
        </div>
        <textarea
          value={state.systemPrompt}
          onChange={(e) => state.setSystemPrompt(e.target.value)}
          onMouseEnter={() => state.setHoverMessage("sys")}
          onMouseLeave={() => state.setHoverMessage(null)}
          onFocus={() => state.setHoverMessage("sys")}
          onBlur={() => state.setHoverMessage(null)}
          rows={2}
          className="w-full resize-y font-mono text-xs"
          style={{
            borderColor:
              state.hoverMessageId === "sys"
                ? `var(${SEG_ROLE_VAR.system})`
                : `color-mix(in oklch, var(${SEG_ROLE_VAR.system}) 45%, transparent)`,
            boxShadow:
              state.hoverMessageId === "sys"
                ? `0 2px 0 0 var(${SEG_ROLE_VAR.system}), 0 0 0 3px color-mix(in oklch, var(${SEG_ROLE_VAR.system}) 24%, transparent)`
                : `0 2px 0 0 color-mix(in oklch, var(${SEG_ROLE_VAR.system}) 35%, transparent)`,
          }}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-(--color-muted)">Tools:</span>
          {BUILTIN_TOOLS.map((t) => {
            const on = state.enabledTools.includes(t.spec.name);
            return (
              <button
                key={t.spec.name}
                onClick={() => state.toggleTool(t.spec.name)}
                onMouseEnter={() => state.setHoverRole("tools_schema")}
                onMouseLeave={() => state.setHoverRole(null)}
                title={t.spec.description}
                className="rounded-lg px-2 py-0.5 text-[11px]"
                style={
                  on
                    ? { ...roleSurfaceStyle("tools_schema", { hovered: true, border: true }), color: "var(--color-role-schema)" }
                    : { backgroundColor: "var(--color-surface-2)", border: "1px solid transparent", color: "var(--color-muted)" }
                }
              >
                {t.spec.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between px-3 pt-1.5 pb-1">
        <div className="text-[11px] uppercase tracking-wider text-(--color-muted)">
          Messages · {state.messages.length}
        </div>
        <button
          onClick={() => state.setMessagesModalOpen(true)}
          className="text-[11px] text-(--color-accent) hover:underline underline-offset-2"
          title="查看真正发给 provider 的 messages JSON"
        >
          查看 JSON
        </button>
      </div>

      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-auto px-2.5 py-2 space-y-1.5"
        onMouseLeave={() => state.setHoverMessage(null)}
      >
        {state.messages.length === 0 ? (
          <div className="grid h-full place-items-center text-xs text-(--color-muted)">
            还没有消息。
          </div>
        ) : (
          state.messages.map((m) => (
            <MessageCard
              key={m.id}
              m={m}
              disabled={state.isRunning}
              highlighted={state.hoverMessageId === m.id}
              onChange={(patch) => state.updateMessage(m.id, patch)}
              onDelete={() => state.removeMessage(m.id)}
              onHoverEnter={() => state.setHoverMessage(m.id)}
              onHoverLeave={() => state.setHoverMessage(null)}
            />
          ))
        )}
      </div>

      <div className="px-2 pb-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="对 Agent 说点什么... (⌘/Ctrl+Enter 发送)"
          rows={3}
          className="w-full resize-y text-sm"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="text-[11px] text-(--color-muted)">
            {state.provider.id} · {state.provider.model || "no model"}
          </div>
          <div className="flex items-center gap-2">
            {state.isRunning ? (
              <button className="btn" onClick={cancel}>
                取消
              </button>
            ) : (
              <button className="btn" onClick={handleDemo} title="无需 API key，跑一段录制好的对话">
                Demo
              </button>
            )}
            <button className="btn btn-primary" onClick={handleSend} disabled={state.isRunning}>
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Content longer than this (chars, or wrapped lines) starts collapsed so the
// message list stays scannable; the user expands on demand.
const LONG_CHARS = 240;
const LONG_LINES = 6;

function IconButton({
  onClick,
  title,
  children,
  style,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={style}
      className="grid h-5 w-5 place-items-center text-(--color-muted) hover:text-(--color-fg)"
    >
      {children}
    </button>
  );
}

function MessageCard({
  m,
  disabled,
  highlighted,
  onChange,
  onDelete,
  onHoverEnter,
  onHoverLeave,
}: {
  m: Message;
  disabled: boolean;
  highlighted: boolean;
  onChange: (patch: Partial<Message>) => void;
  onDelete: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
}) {
  const seg = (m.role as TokenSegment) in SEG_ROLE_VAR ? (m.role as TokenSegment) : "control";
  const content = m.content ?? "";
  const isLong =
    content.length > LONG_CHARS || (content.match(/\n/g)?.length ?? 0) >= LONG_LINES;
  const [expanded, setExpanded] = useState(false);
  const collapsed = isLong && !expanded;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  // Two-step delete: first click arms (icon → check), second click confirms.
  const [armedDelete, setArmedDelete] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(m.content ?? "");
  }, [m.content, editing]);

  useEffect(() => {
    if (editing && taRef.current) {
      const el = taRef.current;
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    }
  }, [editing]);

  const save = () => {
    setEditing(false);
    if (draft !== (m.content ?? "")) onChange({ content: draft });
  };
  const cancel = () => {
    setEditing(false);
    setDraft(m.content ?? "");
  };

  return (
    <div
      onMouseEnter={onHoverEnter}
      onMouseLeave={() => {
        onHoverLeave();
        setArmedDelete(false);
      }}
      data-msgid={m.id}
      className="rounded-xl p-2 text-sm"
      style={{
        ...roleSurfaceStyle(seg, { hovered: highlighted, border: true, instant: true }),
        // A clearer hover: role-hued ring + soft lift so the active card pops.
        ...(highlighted
          ? {
              boxShadow: `0 0 0 1px color-mix(in oklch, var(${SEG_ROLE_VAR[seg]}) 60%, transparent), 0 4px 12px -4px color-mix(in oklch, var(${SEG_ROLE_VAR[seg]}) 40%, transparent)`,
            }
          : null),
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-(--color-muted)">
          {m.role}
          {m.name ? ` · ${m.name}` : ""}
        </div>
        {!disabled && !editing && (
          <div className="flex items-center gap-0.5">
            <IconButton onClick={() => setEditing(true)} title="编辑">
              <Pencil size={13} strokeWidth={2} />
            </IconButton>
            <IconButton
              onClick={() => {
                if (armedDelete) onDelete();
                else setArmedDelete(true);
              }}
              title={armedDelete ? "再次点击确认删除" : "删除"}
              style={armedDelete ? { color: "var(--color-danger)" } : undefined}
            >
              {armedDelete ? (
                <Check size={13} strokeWidth={2.5} />
              ) : (
                <Trash2 size={13} strokeWidth={2} />
              )}
            </IconButton>
          </div>
        )}
      </div>

      {editing ? (
        <div>
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(12, Math.max(2, (draft.match(/\n/g)?.length ?? 0) + 2))}
            className="w-full resize-y text-[13px] font-mono"
          />
          <div className="mt-1 flex items-center justify-end gap-1">
            <button className="btn" onClick={cancel}>
              取消
            </button>
            <button className="btn btn-primary" onClick={save}>
              保存
            </button>
          </div>
        </div>
      ) : (
        <>
          {content !== "" && (
            <div
              className={
                "whitespace-pre-wrap break-words text-[13px] " +
                (collapsed ? "line-clamp-3" : "")
              }
            >
              {content}
            </div>
          )}
          {content === "" && !m.tool_calls?.length && (
            <div className="text-[12px] italic text-(--color-muted)">（空内容）</div>
          )}
          {isLong && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="mt-1 flex w-full items-center justify-center gap-1 text-[10px] text-(--color-muted) hover:text-(--color-fg)"
            >
              {expanded ? (
                <>
                  <ChevronUp size={12} strokeWidth={2} /> 收起
                </>
              ) : (
                <>
                  <ChevronDown size={12} strokeWidth={2} /> 展开全部
                </>
              )}
            </button>
          )}

          {m.tool_calls?.map((tc) => (
            <div
              key={tc.id}
              className="mt-1.5 rounded-md bg-white/55 p-1.5 font-mono text-[10px]"
            >
              <div className="text-(--color-role-tool)">→ {tc.name}</div>
              <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(tc.arguments, null, 2)}
              </pre>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
