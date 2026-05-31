import { useEffect } from "react";

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

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
          一句话发给模型之前，其实还要经过好几步：先被套进 chat template，
          再切成 token，最后占用 KV cache。这里把这几步同时摆出来，方便你看清。
        </p>

        <div className="mt-4 text-xs font-semibold text-(--color-muted)">四个面板</div>
        <ul className="mt-1.5 space-y-1 text-sm">
          <li>
            <b>对话</b>（左）— 改 system prompt、开关工具、增删改消息。
          </li>
          <li>
            <b>Chat Template</b>（中上）— 这些消息按所选模型的模板拼成的最终文本；可并排对比不同模型。
          </li>
          <li>
            <b>Tokens</b>（中右）— 上面那段文本被真实分词器切出来的 token；可以换分词器。
          </li>
          <li>
            <b>Context × KV</b>（下）— 各角色各占多少、哪些 token 命中了缓存、以及大致的显存开销。
          </li>
        </ul>

        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          <div className="card p-3">
            <div className="text-xs font-semibold">怎么开始</div>
            <ul className="mt-1.5 space-y-1 text-[12px] text-(--color-muted)">
              <li>
                没 key 也能玩：点 <span className="kbd">Demo</span> 用一段示例对话把面板填满。
              </li>
              <li>
                想跑真实模型：右上角 <span className="kbd">设置 / BYOK</span> 填好 key，再发送。
              </li>
            </ul>
          </div>
          <div className="card p-3">
            <div className="text-xs font-semibold">几个值得一试的</div>
            <ul className="mt-1.5 space-y-1 text-[12px] text-(--color-muted)">
              <li>改一改靠前的消息，看「缓存命中」先缩短、再随新前缀恢复——这就是 KV cache 复用。</li>
              <li>右下角换个模型规模，比同一段对话的 KV 显存差几个量级。</li>
              <li>把鼠标停在某个 token 上，其它面板会滚到对应位置。</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          <span className="text-[11px] text-(--color-muted)">按 ESC 关闭</span>
          <button className="btn btn-primary" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
