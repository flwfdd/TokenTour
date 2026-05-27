import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";

import { useConversation, getActiveTools, buildOutgoingMessages } from "~/store";
import { getModel } from "~/lib/modelRegistry";
import { PROVIDERS } from "~/lib/providers";
import { runAgentLoop } from "~/lib/agentLoop";
import { BUILTIN_TOOLS } from "~/lib/tools";
import { runDemo } from "~/lib/demo";
import { stripSystemSentinel } from "~/lib/messageUtils";
import { useScrollMatchIntoView } from "./useScrollMatch";
import { SEG_ROLE_VAR, roleColorVar } from "./visual";
import type { Message } from "~/lib/types";

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
      <div className="hairline border-l-0 border-r-0 border-t-0 p-3">
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
          className="w-full resize-y font-mono text-xs transition-shadow"
          style={{
            borderLeftWidth: 3,
            borderLeftColor: `var(${SEG_ROLE_VAR.system})`,
            boxShadow:
              state.hoverMessageId === "sys"
                ? `0 0 0 2px color-mix(in oklch, var(${SEG_ROLE_VAR.system}) 60%, transparent)`
                : undefined,
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-1">
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
                className={
                  "rounded-md border px-2 py-0.5 text-[11px] " +
                  (on
                    ? "border-(--color-accent)/60 bg-(--color-accent)/15 text-(--color-fg)"
                    : "border-(--color-border) bg-(--color-surface) text-(--color-muted)")
                }
              >
                {t.spec.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="hairline border-l-0 border-r-0 border-t-0 flex items-center justify-between px-3 py-1.5">
        <div className="text-[11px] uppercase tracking-wider text-(--color-muted)">
          Messages · {state.messages.length}
        </div>
        <button
          onClick={() => state.setMessagesModalOpen(true)}
          className="text-[11px] text-(--color-muted) hover:text-(--color-fg) underline-offset-2 hover:underline"
          title="查看真正发给 provider 的 messages JSON"
        >
          查看 JSON
        </button>
      </div>

      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-auto p-3 space-y-2"
        onMouseLeave={() => state.setHoverMessage(null)}
      >
        {state.messages.length === 0 ? (
          <div className="grid h-full place-items-center text-xs text-(--color-muted)">
            还没有消息。
          </div>
        ) : (
          state.messages.map((m) => (
            <EditableMessageCard
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

      <div className="hairline border-b-0 border-l-0 border-r-0 p-2">
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

function EditableMessageCard({
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
  const v = roleColorVar(m.role);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content ?? "");
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // keep draft in sync if upstream messages change (e.g. another edit, demo)
  useEffect(() => {
    if (!editing) setDraft(m.content ?? "");
  }, [m.content, editing]);

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      // place caret at end
      const el = taRef.current;
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
      onMouseLeave={onHoverLeave}
      data-msgid={m.id}
      className="rounded-lg border p-2 text-sm transition-shadow transition-colors"
      style={{
        backgroundColor: highlighted
          ? `color-mix(in oklch, var(${v}) 28%, transparent)`
          : `color-mix(in oklch, var(${v}) 14%, transparent)`,
        borderColor: highlighted
          ? `var(${v})`
          : `color-mix(in oklch, var(${v}) 40%, transparent)`,
        borderLeftWidth: 3,
        borderLeftColor: `var(${v})`,
        boxShadow: highlighted
          ? `0 0 0 2px color-mix(in oklch, var(${v}) 50%, transparent)`
          : undefined,
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-(--color-muted)">
          {m.role}
          {m.name ? ` · ${m.name}` : ""}
        </div>
        <div className="flex items-center gap-2">
          {!editing && !disabled && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              className="text-[10px] text-(--color-muted) hover:text-(--color-fg)"
              title="编辑消息内容，下游视图会实时更新"
            >
              编辑
            </button>
          )}
          {!disabled && (
            <button
              onClick={onDelete}
              className="text-[10px] text-(--color-muted) hover:text-(--color-fg)"
            >
              删除
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div>
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                save();
              }
            }}
            onBlur={save}
            rows={Math.min(10, Math.max(2, (draft.match(/\n/g)?.length ?? 0) + 2))}
            className="w-full resize-y text-[13px] font-mono"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-(--color-muted)">
            <span>⌘/Ctrl+Enter 保存 · Esc 取消</span>
            <div className="flex gap-1">
              <button className="btn" onClick={cancel}>
                取消
              </button>
              <button className="btn btn-primary" onClick={save}>
                保存
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {m.content !== undefined && m.content !== "" && (
            <div
              onClick={() => !disabled && setEditing(true)}
              className={
                "whitespace-pre-wrap break-words text-[13px] " +
                (!disabled
                  ? "cursor-text rounded px-0.5 -mx-0.5 hover:bg-(--color-bg)/40"
                  : "")
              }
              title={!disabled ? "点击编辑" : undefined}
            >
              {m.content}
            </div>
          )}
          {(m.content === undefined || m.content === "") && !m.tool_calls?.length && (
            <div
              onClick={() => !disabled && setEditing(true)}
              className={
                "text-[12px] italic text-(--color-muted) " +
                (!disabled ? "cursor-text" : "")
              }
            >
              （空内容，点击编辑）
            </div>
          )}
          {m.tool_calls?.map((tc) => (
            <div
              key={tc.id}
              className="mt-1.5 rounded-md border border-(--color-border) bg-(--color-bg)/40 p-1.5 font-mono text-[10px]"
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
