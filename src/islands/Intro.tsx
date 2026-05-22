import { useEffect, useState } from "react";

const KEY = "llmvis-intro-seen";

export default function Intro() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(KEY)) setShow(true);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    window.localStorage.setItem(KEY, "1");
    setShow(false);
  };

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/60 backdrop-blur-sm"
      onClick={dismiss}
    >
      <div
        className="glass max-w-2xl rounded-xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h1 className="text-lg font-semibold">LLMVis · 把 Agent 拆开给你看</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          这是一个交互式可视化教程，把「你跟 Agent 说的一句话」一路拆解到 GPU 上的 KV Cache：
        </p>
        <ol className="mt-3 list-inside list-decimal space-y-1 text-sm">
          <li>
            <b>Messages</b> · 角色化的消息列表，Agent 看到的最原始输入
          </li>
          <li>
            <b>Chat Template</b> · Jinja 把它拍平成带特殊 token 的长字符串
          </li>
          <li>
            <b>Tokens</b> · BPE 切成整数序列，每个 token 都有自己的 ID
          </li>
          <li>
            <b>Context 分布</b> · 上下文窗口里谁占了多少、剩多少
          </li>
          <li>
            <b>KV Cache</b> · 每层每个 token 一份 K/V，prefix 复用 vs 重新 prefill
          </li>
        </ol>
        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          <div className="card p-3">
            <div className="text-xs font-semibold">三种使用方式</div>
            <ul className="mt-1 list-inside list-disc text-[12px] text-(--color-muted)">
              <li>
                点 <span className="kbd">Demo</span> 跑一段录制对话（无需 key）
              </li>
              <li>
                填 BYOK 后跑真实的 Agent loop
              </li>
              <li>顶部切换 5 个 Lens，时间线步进观察每个阶段</li>
            </ul>
          </div>
          <div className="card p-3">
            <div className="text-xs font-semibold">玩法建议</div>
            <ul className="mt-1 list-inside list-disc text-[12px] text-(--color-muted)">
              <li>切换「假想架构」看 KV cache 大小怎么变</li>
              <li>Chat Template Lens 里对比不同模型家族的模板</li>
              <li>KV Cache Lens 切到 FP8 / INT4 看量化省多少</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] text-(--color-muted)">
            随时点右上角「设置 / BYOK」配置 provider · 任意时刻按 ESC 关闭
          </span>
          <button className="btn btn-primary" onClick={dismiss}>
            开始探索
          </button>
        </div>
      </div>
    </div>
  );
}
