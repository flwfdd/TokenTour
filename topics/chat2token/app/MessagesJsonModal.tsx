import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { useConversation, getActiveTools, buildOutgoingMessages } from "./store";
import { buildOpenAiRequestBody } from "./lib/providers/serialize";
import CodeBlock from "./CodeBlock";
import { useLang } from "./i18n";

const modalCopy = {
  en: {
    title: "Request body sent to the provider",
    subtitle: "The payload the agent actually POSTs to the provider: messages, tools, and sampling parameters",
    close: "Close",
    closeTitle: "Close (Esc)",
    lines: (n: number) => `${n} lines`,
  },
  zh: {
    title: "发送给 Provider 的请求体",
    subtitle: "Agent 真正 POST 给 provider 的 payload —— messages、tools 与采样参数",
    close: "关闭",
    closeTitle: "关闭 (Esc)",
    lines: (n: number) => `${n} 行`,
  },
} as const;

export default function MessagesJsonModal() {
  const state = useConversation();
  const lang = useLang();
  const copy = modalCopy[lang];
  const open = state.messagesModalOpen;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") state.setMessagesModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const json = useMemo(
    () =>
      JSON.stringify(
        buildOpenAiRequestBody({
          model: state.provider.model,
          messages: buildOutgoingMessages(state),
          tools: getActiveTools(),
          temperature: state.provider.temperature,
          maxTokens: state.provider.maxTokens,
          stream: true,
        }),
        null,
        2,
      ),
    [open, state.messages, state.systemPrompt, state.enabledTools, state.provider],
  );
  const lineCount = useMemo(() => json.split("\n").length, [json]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6 backdrop-blur-sm"
      onClick={() => state.setMessagesModalOpen(false)}
    >
      <div
        className="glass flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{copy.title}</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-(--color-muted)">
              {copy.subtitle}
            </div>
          </div>
          <button
            className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-(--color-muted) hover:bg-(--color-bg) hover:text-(--color-fg)"
            onClick={() => state.setMessagesModalOpen(false)}
            aria-label={copy.close}
            title={copy.closeTitle}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">
          <CodeBlock
            code={json}
            lang="json"
            title={`POST /chat/completions · ${copy.lines(lineCount)}`}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  );
}
