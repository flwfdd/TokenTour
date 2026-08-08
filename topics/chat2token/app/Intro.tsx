import { useEffect } from "react";
import { useLang } from "./i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * 帮助 / 简介 弹窗。完全受控 —— 由 Header 上的「帮助」按钮显式打开，不再
 * 在首次访问时自动弹出（沿用历史命名时曾用 `llmvis-intro-seen` 这个
 * localStorage key 控制自动弹出，现已弃用）。
 */
export default function Intro({ open, onClose }: Props) {
  const lang = useLang();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isZh = lang === "zh";

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass max-w-2xl rounded-xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h1 className="text-lg font-semibold">TokenTour</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          {isZh
            ? "一句话发给模型之前，其实还要经过好几步：先被套进 chat template，再切成 token，最后占用 KV cache。这里把这几步同时摆出来，方便你看清。"
            : "Before a single sentence reaches the model, it goes through several layers: it is wrapped by a chat template, split into tokens, and then stored in KV cache. This playground puts those layers side by side so you can see them working."}
        </p>

        <div className="mt-4 text-xs font-semibold text-(--color-muted)">
          {isZh ? "四个面板" : "Four panels"}
        </div>
        <ul className="mt-1.5 space-y-1 text-sm">
          <li>
            {isZh ? (
              <>
                <b>对话</b>（左）— 改 system prompt、开关工具、增删改消息。
              </>
            ) : (
              <>
                <b>Chat</b> (left) — edit the system prompt, toggle tools, and add/edit/delete messages.
              </>
            )}
          </li>
          <li>
            {isZh ? (
              <>
                <b>Chat Template</b>（中上）— 这些消息按所选模型的模板拼成的最终文本；可并排对比不同模型。
              </>
            ) : (
              <>
                <b>Chat Template</b> (top middle) — the final plain text produced from the messages by the selected model template; compare model families side by side.
              </>
            )}
          </li>
          <li>
            {isZh ? (
              <>
                <b>Tokens</b>（中右）— 上面那段文本被真实分词器切出来的 token；可以换分词器。
              </>
            ) : (
              <>
                <b>Tokens</b> (top right) — the template text split by real tokenizers; switch tokenizers to compare.
              </>
            )}
          </li>
          <li>
            {isZh ? (
              <>
                <b>Context × KV Cache</b>（下）— 各角色各占多少、哪些 token 命中了缓存、以及大致的显存开销。
              </>
            ) : (
              <>
                <b>Context × KV Cache</b> (bottom) — role distribution, cache hits, and rough KV memory cost.
              </>
            )}
          </li>
        </ul>

        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          <div className="card p-3">
            <div className="text-xs font-semibold">{isZh ? "怎么开始" : "How to start"}</div>
            <ul className="mt-1.5 space-y-1 text-[12px] text-(--color-muted)">
              <li>
                {isZh ? (
                  <>
                    没 key 也能玩：点 <span className="kbd">演示</span> 用一段示例对话把面板填满。
                  </>
                ) : (
                  <>
                    No key needed: click <span className="kbd">Demo</span> to load an example conversation.
                  </>
                )}
              </li>
              <li>
                {isZh ? (
                  <>
                    想跑真实模型：右上角 <span className="kbd">设置 / BYOK</span> 填好 key，再发送。
                  </>
                ) : (
                  <>
                    To run a real model: open <span className="kbd">Settings / BYOK</span>, add a key, then send.
                  </>
                )}
              </li>
            </ul>
          </div>
          <div className="card p-3">
            <div className="text-xs font-semibold">{isZh ? "几个值得一试的" : "Worth trying"}</div>
            <ul className="mt-1.5 space-y-1 text-[12px] text-(--color-muted)">
              {isZh ? (
                <>
                  <li>改一改靠前的消息，看「缓存命中」先缩短、再随新前缀恢复——这就是 KV cache 复用。</li>
                  <li>右下角换个模型规模，比同一段对话的 KV 显存差几个量级。</li>
                  <li>把鼠标停在某个 token 上，其它面板会滚到对应位置。</li>
                </>
              ) : (
                <>
                  <li>Edit an early message and watch cache hits shrink, then recover when the prefix matches again.</li>
                  <li>Switch the imaginary model size in the lower-right controls and compare KV memory by orders of magnitude.</li>
                  <li>Hover a token and the other panels scroll to the corresponding location.</li>
                </>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          <span className="text-[11px] text-(--color-muted)">
            {isZh ? "按 ESC 关闭" : "Press ESC to close"}
          </span>
          <button className="btn btn-primary" onClick={onClose}>
            {isZh ? "知道了" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
