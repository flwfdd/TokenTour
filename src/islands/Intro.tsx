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
        <h1 className="text-lg font-semibold">TokenTour · 把 Agent 拆开给你看</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          交互式可视化「你跟 Agent 说的一句话」→ chat template → tokens →
          KV cache 这条链路。
        </p>
        <ol className="mt-3 list-inside list-decimal space-y-1 text-sm">
          <li>
            <b>对话面板</b>（左侧）· system prompt、tools、可编辑的消息列表
          </li>
          <li>
            <b>Chat Template</b>（中上）· Jinja 渲染后的完整文本，可并排两家家族对比
          </li>
          <li>
            <b>Tokens</b>（中右）· 真实 BPE 分词结果，可换分词器
          </li>
          <li>
            <b>Context × KV</b>（下方）· 角色分布、KV 状态条、内存估算
          </li>
        </ol>
        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          <div className="card p-3">
            <div className="text-xs font-semibold">三种用法</div>
            <ul className="mt-1 list-inside list-disc text-[12px] text-(--color-muted)">
              <li>
                直接点 <span className="kbd">Demo</span> 跑预录对话（无需 key）
              </li>
              <li>右上角填 BYOK 后点 <span className="kbd">发送</span> 调真实 provider</li>
              <li>
                修改任意前缀消息，看 <b>缓存命中输入</b> 实时缩短再恢复
              </li>
            </ul>
          </div>
          <div className="card p-3">
            <div className="text-xs font-semibold">玩法建议</div>
            <ul className="mt-1 list-inside list-disc text-[12px] text-(--color-muted)">
              <li>右下 <b>假想架构</b> 切 Qwen3-0.6B / 32B 看 KV 内存量级差距</li>
              <li>Chat Template 面板 <b>+ 对比</b> 看同样 messages 在 DeepSeek / GPT-OSS 下多多少 token</li>
              <li>Hover 任意面板，其它面板自动滚动到同一位置</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] text-(--color-muted)">
            完整用法见 <code>docs/GUIDE.md</code> · ESC 关闭
          </span>
          <button className="btn btn-primary" onClick={onClose}>
            开始探索
          </button>
        </div>
      </div>
    </div>
  );
}
