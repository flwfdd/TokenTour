import { useEffect, useMemo, useState } from "react";
import { useConversation, getActiveTools, buildOutgoingMessages } from "./store";
import { buildOpenAiRequestBody } from "./lib/providers/serialize";

export default function MessagesJsonModal() {
  const state = useConversation();
  const open = state.messagesModalOpen;
  const [copied, setCopied] = useState(false);
  const [includeSystem, setIncludeSystem] = useState(true);
  const [includeTools, setIncludeTools] = useState(true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") state.setMessagesModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const payload = useMemo(
    () =>
      buildOpenAiRequestBody({
        model: state.provider.model,
        messages: includeSystem ? buildOutgoingMessages(state) : state.messages,
        tools: includeTools ? getActiveTools() : undefined,
        temperature: state.provider.temperature,
        maxTokens: state.provider.maxTokens,
        stream: true,
      }),
    [open, includeSystem, includeTools, state.messages, state.systemPrompt, state.enabledTools, state.provider],
  );

  const json = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6 backdrop-blur-sm"
      onClick={() => state.setMessagesModalOpen(false)}
    >
      <div
        className="glass flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hairline border-l-0 border-r-0 border-t-0 flex items-center justify-between gap-2 px-4 py-2">
          <div>
            <div className="text-sm font-semibold">Outgoing Request JSON</div>
            <div className="text-[11px] text-(--color-muted)">
              这就是 Agent 真正发给 provider 的 payload —— 包括 messages、tools、采样参数
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="chip cursor-pointer">
              <input
                type="checkbox"
                checked={includeSystem}
                onChange={(e) => setIncludeSystem(e.target.checked)}
                className="h-3 w-3"
              />
              system
            </label>
            <label className="chip cursor-pointer">
              <input
                type="checkbox"
                checked={includeTools}
                onChange={(e) => setIncludeTools(e.target.checked)}
                className="h-3 w-3"
              />
              tools
            </label>
            <button className="btn" onClick={copy}>
              {copied ? "已复制 ✓" : "复制 JSON"}
            </button>
            <button className="btn" onClick={() => state.setMessagesModalOpen(false)}>
              关闭
            </button>
          </div>
        </header>
        <pre className="flex-1 min-h-0 overflow-auto p-4 font-mono text-[12px] leading-5">
          {json}
        </pre>
      </div>
    </div>
  );
}
