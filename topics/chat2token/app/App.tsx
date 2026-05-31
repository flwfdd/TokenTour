import { useEffect, useState } from "react";
import "./theme.css";
import AgentChat from "./AgentChat";
import LensChatTemplate from "./LensChatTemplate";
import LensTokens from "./LensTokens";
import LensContextKv from "./LensContextKv";
import SettingsDrawer from "./SettingsDrawer";
import Intro from "./Intro";
import MessagesJsonModal from "./MessagesJsonModal";
import { useConversation } from "./store";
import { readSnapshotFromUrl, snapshotToUrl } from "./lib/snapshot";

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const snap = readSnapshotFromUrl();
    if (snap) {
      const s = useConversation.getState();
      s.setSystemPrompt(snap.systemPrompt);
      s.setMessages(snap.messages);
      s.setEnabledTools(snap.enabledTools);
      s.setModelKey(snap.modelKey);
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const handleShare = () => {
    const s = useConversation.getState();
    const url = snapshotToUrl({
      version: 1,
      systemPrompt: s.systemPrompt,
      messages: s.messages,
      enabledTools: s.enabledTools,
      modelKey: s.modelKey,
    });
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => prompt("复制下面的分享链接：", url));
  };

  if (!hydrated) {
    return (
      <div className="pg-root grid h-screen place-items-center text-(--color-muted)">
        Loading TokenTour...
      </div>
    );
  }

  return (
    <div className="pg-root flex h-screen flex-col gap-px bg-(--pg-desk)">
      <header className="pg-chrome flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">TokenTour - Chat2Token</div>
          <div className="hidden text-xs text-(--color-muted) md:block">
            从 Agentic Context 到 KV Cache · 交互式可视化教程
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn"
            onClick={() => setHelpOpen(true)}
            title="面板说明 + 玩法建议"
          >
            帮助
          </button>
          <button
            className="btn"
            onClick={handleShare}
            title="把当前消息+设置编码到 URL 复制到剪贴板"
          >
            {copied ? "已复制 ✓" : "分享"}
          </button>
          <button className="btn" onClick={() => setSettingsOpen(true)}>
            设置 / BYOK
          </button>
          <a
            className="btn btn-primary grid place-items-center"
            href="https://github.com/flwfdd/TokenTour"
            target="_blank"
            rel="noopener noreferrer"
            title="在 GitHub 上查看源码"
            aria-label="GitHub"
          >
            <svg viewBox="0 0 24 24" width={19} height={19} fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.21 11.19.6.11.82-.25.82-.56 0-.28-.01-1.02-.02-2-3.34.71-4.04-1.58-4.04-1.58-.55-1.37-1.34-1.74-1.34-1.74-1.09-.73.08-.72.08-.72 1.2.08 1.84 1.21 1.84 1.21 1.07 1.79 2.81 1.27 3.5.97.11-.76.42-1.27.76-1.56-2.67-.3-5.47-1.31-5.47-5.83 0-1.29.47-2.34 1.24-3.17-.12-.3-.54-1.52.12-3.16 0 0 1.01-.32 3.3 1.21.96-.26 1.98-.39 3-.4 1.02.01 2.04.14 3 .4 2.29-1.53 3.3-1.21 3.3-1.21.66 1.64.24 2.86.12 3.16.77.83 1.24 1.88 1.24 3.17 0 4.53-2.81 5.53-5.49 5.82.43.36.81 1.08.81 2.18 0 1.58-.01 2.85-.01 3.24 0 .31.21.68.83.56C20.56 21.91 24 17.5 24 12.29 24 5.78 18.63.5 12 .5z" />
            </svg>
          </a>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 gap-px bg-(--pg-desk)">
        <aside className="pg-panel w-[380px] shrink-0">
          <AgentChat />
        </aside>
        <main className="grid flex-1 min-h-0 min-w-0 grid-cols-2 grid-rows-[1.6fr_1fr] gap-px bg-(--pg-desk)">
          <LensChatTemplate />
          <LensTokens />
          <LensContextKv />
        </main>
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <MessagesJsonModal />
      <Intro open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
