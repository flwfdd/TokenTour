import { useEffect, useState } from "react";
import AgentChat from "./AgentChat";
import LensChatTemplate from "./LensChatTemplate";
import LensTokens from "./LensTokens";
import LensContextKv from "./LensContextKv";
import SettingsDrawer from "./SettingsDrawer";
import Intro from "./Intro";
import MessagesJsonModal from "./MessagesJsonModal";
import { useConversation } from "~/store";
import { readSnapshotFromUrl, snapshotToUrl } from "~/lib/snapshot";

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
      <div className="grid h-screen place-items-center text-(--color-muted)">
        Loading TokenTour...
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="hairline border-l-0 border-r-0 border-t-0 flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-sm bg-(--color-accent)" />
          <div className="text-sm font-semibold">TokenTour</div>
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
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-[380px] shrink-0 hairline border-l-0 border-t-0 border-b-0">
          <AgentChat />
        </aside>
        <main className="grid flex-1 min-h-0 min-w-0 grid-cols-2 grid-rows-[1.35fr_1fr]">
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
