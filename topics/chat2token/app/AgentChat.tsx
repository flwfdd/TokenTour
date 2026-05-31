import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { Pencil, Trash2, Check, ChevronDown, ChevronUp, Brain } from "lucide-react";

import { useConversation, getActiveTools, buildOutgoingMessages } from "./store";
import { getModel } from "./lib/modelRegistry";
import { PROVIDERS } from "./lib/providers";
import { runAgentLoop } from "./lib/agentLoop";
import { BUILTIN_TOOLS } from "./lib/tools";
import { buildDemoMessages, DEMO_SYSTEM_PROMPT } from "./lib/demo";
import { stripSystemSentinel } from "./lib/messageUtils";
import { useScrollMatchIntoView } from "./useScrollMatch";
import { SEG_ROLE_VAR, roleSurfaceStyle } from "./visual";
import type { Message, Role, TokenSegment } from "./lib/types";

export default function AgentChat() {
  const state = useConversation();
  const [input, setInput] = useState("");
  // Tracks a just-created message so its card opens straight into the editor.
  const [newMsgId, setNewMsgId] = useState<string | null>(null);
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

  // Append a blank message of a given role and drop it straight into edit mode.
  // Clearing the selected step makes the new (live) message show in every lens.
  const addMessage = (role: Role) => {
    if (state.isRunning) return;
    const msg: Message = { id: nanoid(8), role, content: "" };
    if (role === "tool") {
      msg.tool_call_id = "";
      msg.name = "";
    }
    state.pushMessage(msg);
    state.selectStep(null);
    setNewMsgId(msg.id);
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const handleDemo = async () => {
    if (state.isRunning) return;
    // No playback — just initialize the conversation to a representative
    // example (incl. a reasoning trace) so every panel has something to show.
    state.clearSteps();
    state.setSystemPrompt(DEMO_SYSTEM_PROMPT);
    const msgs = await buildDemoMessages();
    state.setMessages(msgs);
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

      <div className="flex items-center justify-between gap-2 px-3 pt-1.5 pb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-(--color-muted)">
            Messages · {state.messages.length}
          </span>
          <span className="text-[11px] text-(--color-muted)">·</span>
          {(["user", "assistant", "tool"] as const).map((r) => (
            <button
              key={r}
              onClick={() => addMessage(r)}
              disabled={state.isRunning}
              title={`新建 ${r} 消息`}
              onMouseEnter={() => state.setHoverRole(r)}
              onMouseLeave={() => state.setHoverRole(null)}
              className="rounded-md px-1.5 py-0.5 text-[10px] disabled:opacity-40"
              style={{
                ...roleSurfaceStyle(r, { hovered: true, border: true }),
                color: `var(${SEG_ROLE_VAR[r]})`,
              }}
            >
              + {r}
            </button>
          ))}
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
              autoEdit={m.id === newMsgId}
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

/**
 * A textarea tinted by a role/segment hue (border + chunky drop + focus ring),
 * mirroring the system-prompt box so every editor field's color matches the
 * message type it belongs to.
 */
function RoleTextarea({
  seg,
  className,
  taRef,
  ...rest
}: {
  seg: TokenSegment;
  className?: string;
  taRef?: React.RefObject<HTMLTextAreaElement | null>;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false);
  const c = `var(${SEG_ROLE_VAR[seg]})`;
  return (
    <textarea
      ref={taRef}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      className={"w-full resize-y font-mono " + (className ?? "")}
      style={{
        borderColor: focused ? c : `color-mix(in oklch, ${c} 45%, transparent)`,
        boxShadow: focused
          ? `0 2px 0 0 ${c}, 0 0 0 3px color-mix(in oklch, ${c} 22%, transparent)`
          : `0 2px 0 0 color-mix(in oklch, ${c} 35%, transparent)`,
      }}
    />
  );
}

/** Single-line sibling of {@link RoleTextarea} for short tool fields. */
function RoleInput({
  seg,
  className,
  ...rest
}: {
  seg: TokenSegment;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  const c = `var(${SEG_ROLE_VAR[seg]})`;
  return (
    <input
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      className={"w-full font-mono " + (className ?? "")}
      style={{
        borderColor: focused ? c : `color-mix(in oklch, ${c} 45%, transparent)`,
        boxShadow: focused
          ? `0 2px 0 0 ${c}, 0 0 0 3px color-mix(in oklch, ${c} 22%, transparent)`
          : `0 2px 0 0 color-mix(in oklch, ${c} 35%, transparent)`,
      }}
    />
  );
}

function MessageCard({
  m,
  disabled,
  highlighted,
  autoEdit,
  onChange,
  onDelete,
  onHoverEnter,
  onHoverLeave,
}: {
  m: Message;
  disabled: boolean;
  highlighted: boolean;
  autoEdit?: boolean;
  onChange: (patch: Partial<Message>) => void;
  onDelete: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
}) {
  const seg = (m.role as TokenSegment) in SEG_ROLE_VAR ? (m.role as TokenSegment) : "system";
  const content = m.content ?? "";
  const isLong =
    content.length > LONG_CHARS || (content.match(/\n/g)?.length ?? 0) >= LONG_LINES;
  const [expanded, setExpanded] = useState(false);
  const collapsed = isLong && !expanded;

  const isAssistant = m.role === "assistant";
  const isTool = m.role === "tool";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  // Assistant messages also carry a reasoning trace and tool_calls; both are
  // editable. tool_calls are edited as raw JSON (an array of {name, arguments}).
  const [draftReasoning, setDraftReasoning] = useState(m.reasoning ?? "");
  const [draftToolCalls, setDraftToolCalls] = useState("");
  // Tool messages carry the function name + the id of the call they answer.
  const [draftName, setDraftName] = useState(m.name ?? "");
  const [draftToolCallId, setDraftToolCallId] = useState(m.tool_call_id ?? "");
  const [toolCallsError, setToolCallsError] = useState<string | null>(null);
  // Reasoning ("thinking") trace is collapsed by default — it's supporting
  // detail, not the answer.
  const [reasoningOpen, setReasoningOpen] = useState(false);
  // Two-step delete: first click arms (icon → check), second click confirms.
  const [armedDelete, setArmedDelete] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(m.content ?? "");
      setDraftReasoning(m.reasoning ?? "");
      setToolCallsError(null);
    }
  }, [m.content, m.reasoning, editing]);

  useEffect(() => {
    if (editing && taRef.current) {
      const el = taRef.current;
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    }
  }, [editing]);

  const beginEdit = () => {
    setDraft(m.content ?? "");
    setDraftReasoning(m.reasoning ?? "");
    setDraftToolCalls(
      m.tool_calls && m.tool_calls.length > 0
        ? JSON.stringify(
            m.tool_calls.map((tc) => ({ name: tc.name, arguments: tc.arguments })),
            null,
            2,
          )
        : "",
    );
    setDraftName(m.name ?? "");
    setDraftToolCallId(m.tool_call_id ?? "");
    setToolCallsError(null);
    setEditing(true);
  };

  // Freshly created messages open straight into the editor.
  const didAutoEdit = useRef(false);
  useEffect(() => {
    if (autoEdit && !didAutoEdit.current) {
      didAutoEdit.current = true;
      beginEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit]);

  const save = () => {
    const patch: Partial<Message> = { content: draft };
    if (isAssistant) {
      patch.reasoning = draftReasoning.trim() ? draftReasoning : undefined;
      const raw = draftToolCalls.trim();
      if (!raw) {
        patch.tool_calls = undefined;
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          setToolCallsError(`JSON 解析失败：${(e as Error).message}`);
          return;
        }
        if (!Array.isArray(parsed)) {
          setToolCallsError("tool_calls 必须是一个数组");
          return;
        }
        try {
          patch.tool_calls = parsed.map((tc: any, i) => {
            if (!tc || typeof tc.name !== "string") {
              throw new Error(`第 ${i + 1} 项缺少字符串 name`);
            }
            const args =
              tc.arguments == null
                ? {}
                : typeof tc.arguments === "object"
                  ? tc.arguments
                  : (() => {
                      throw new Error(`第 ${i + 1} 项 arguments 必须是对象`);
                    })();
            return { id: typeof tc.id === "string" && tc.id ? tc.id : nanoid(8), name: tc.name, arguments: args };
          });
        } catch (e) {
          setToolCallsError((e as Error).message);
          return;
        }
      }
    }
    if (isTool) {
      patch.name = draftName.trim() || undefined;
      patch.tool_call_id = draftToolCallId.trim() || undefined;
    }
    setEditing(false);
    setToolCallsError(null);
    onChange(patch);
  };
  const cancel = () => {
    setEditing(false);
    setToolCallsError(null);
    setDraft(m.content ?? "");
    setDraftReasoning(m.reasoning ?? "");
    setDraftName(m.name ?? "");
    setDraftToolCallId(m.tool_call_id ?? "");
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
            <IconButton onClick={beginEdit} title="编辑">
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
        <div className="space-y-1.5">
          {isAssistant && (
            <label className="block">
              <span className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-(--color-muted)">
                <Brain size={11} strokeWidth={2} /> Thinking
              </span>
              <RoleTextarea
                seg={seg}
                value={draftReasoning}
                onChange={(e) => setDraftReasoning(e.target.value)}
                rows={Math.min(10, Math.max(2, (draftReasoning.match(/\n/g)?.length ?? 0) + 2))}
                placeholder="（无思考，可留空）"
                className="text-[12px]"
              />
            </label>
          )}
          {isTool && (
            <div className="flex gap-1.5">
              <label className="block flex-1">
                <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-(--color-muted)">
                  name
                </span>
                <RoleInput
                  seg={seg}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="工具名"
                  className="text-[12px]"
                />
              </label>
              <label className="block flex-1">
                <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-(--color-muted)">
                  tool_call_id
                </span>
                <RoleInput
                  seg={seg}
                  value={draftToolCallId}
                  onChange={(e) => setDraftToolCallId(e.target.value)}
                  placeholder="对应的 call id"
                  className="text-[12px]"
                />
              </label>
            </div>
          )}
          <label className="block">
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-(--color-muted)">
              内容
            </span>
            <RoleTextarea
              seg={seg}
              taRef={taRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(12, Math.max(2, (draft.match(/\n/g)?.length ?? 0) + 2))}
              placeholder={isAssistant ? "（仅工具调用时可留空）" : ""}
              className="text-[13px]"
            />
          </label>
          {isAssistant && (
            <label className="block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-(--color-muted)">
                tool_calls (JSON)
              </span>
              <RoleTextarea
                seg={seg}
                value={draftToolCalls}
                onChange={(e) => {
                  setDraftToolCalls(e.target.value);
                  if (toolCallsError) setToolCallsError(null);
                }}
                rows={Math.min(14, Math.max(2, (draftToolCalls.match(/\n/g)?.length ?? 0) + 1))}
                placeholder={'（无工具调用，可留空）\n[\n  { "name": "calculator", "arguments": { "expression": "1+1" } }\n]'}
                className="text-[12px]"
              />
            </label>
          )}
          {toolCallsError && (
            <div className="text-[11px] text-(--color-danger)">{toolCallsError}</div>
          )}
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
          {m.reasoning && (
            <div className="mb-1.5 rounded-md bg-white/55 px-2 py-1">
              <button
                onClick={() => setReasoningOpen((o) => !o)}
                className="flex w-full items-center gap-1 text-[10px] uppercase tracking-wider text-(--color-muted) hover:text-(--color-fg)"
              >
                <Brain size={12} strokeWidth={2} />
                Thinking
                {reasoningOpen ? (
                  <ChevronUp size={12} strokeWidth={2} className="ml-auto" />
                ) : (
                  <ChevronDown size={12} strokeWidth={2} className="ml-auto" />
                )}
              </button>
              {reasoningOpen && (
                <div className="mt-1 whitespace-pre-wrap break-words text-[12px] italic text-(--color-ink-soft)">
                  {m.reasoning}
                </div>
              )}
            </div>
          )}
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
          {content === "" && !m.tool_calls?.length && !m.reasoning && (
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
