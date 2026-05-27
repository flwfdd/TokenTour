import { useEffect, useState } from "react";
import { useConversation } from "./store";
import { PROVIDER_PRESETS } from "./lib/providers";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsDrawer({ open, onClose }: Props) {
  const state = useConversation();
  const [presetId, setPresetId] = useState(state.provider.id);

  useEffect(() => {
    if (open) setPresetId(state.provider.id);
  }, [open, state.provider.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const preset = PROVIDER_PRESETS.find((p) => p.id === presetId) ?? PROVIDER_PRESETS[0]!;

  const handlePreset = (id: string) => {
    setPresetId(id);
    const p = PROVIDER_PRESETS.find((x) => x.id === id);
    if (!p) return;
    state.setProvider({
      id: p.id,
      name: p.label,
      baseUrl: p.baseUrl,
      model: p.exampleModels[0] ?? state.provider.model,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass flex h-full w-full max-w-md flex-col p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">设置 · BYOK</div>
          <button onClick={onClose} className="btn">
            关闭
          </button>
        </div>
        <p className="mt-1 text-xs text-(--color-muted)">
          API key 仅保存在浏览器 localStorage，从不上报。OpenAI 与 Anthropic 支持浏览器直连；如遇 CORS 阻塞可切换到代理模式（key 仍由前端附带，服务端不持久化）。
        </p>

        <div className="mt-4 space-y-3">
          <Row label="Provider">
            <select value={presetId} onChange={(e) => handlePreset(e.target.value)} className="w-full">
              {PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Row>

          <Row label="Base URL">
            <input
              type="text"
              value={state.provider.baseUrl}
              onChange={(e) => state.setProvider({ baseUrl: e.target.value })}
              className="w-full font-mono text-xs"
            />
          </Row>

          <Row label="API Key">
            <input
              type="password"
              autoComplete="off"
              placeholder="sk-..."
              value={state.provider.apiKey}
              onChange={(e) => state.setProvider({ apiKey: e.target.value })}
              className="w-full font-mono text-xs"
            />
          </Row>

          <Row label="Model name">
            <input
              type="text"
              value={state.provider.model}
              onChange={(e) => state.setProvider({ model: e.target.value })}
              className="w-full font-mono text-xs"
              list="model-suggestions"
            />
            <datalist id="model-suggestions">
              {preset.exampleModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Row>

          <Row label="Routing">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={state.provider.useProxy}
                onChange={(e) => state.setProvider({ useProxy: e.target.checked })}
              />
              使用 /api/proxy 转发（解决 CORS）
            </label>
          </Row>

          <div className="grid grid-cols-2 gap-3">
            <Row label={`Temperature · ${state.provider.temperature.toFixed(2)}`}>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={state.provider.temperature}
                onChange={(e) =>
                  state.setProvider({ temperature: Number(e.target.value) })
                }
                className="w-full"
              />
            </Row>
            <Row label="Max tokens">
              <input
                type="number"
                min={1}
                max={32768}
                value={state.provider.maxTokens}
                onChange={(e) =>
                  state.setProvider({ maxTokens: Math.max(1, Number(e.target.value) || 1024) })
                }
                className="w-full text-xs"
              />
            </Row>
          </div>
        </div>

        <div className="mt-auto text-[11px] text-(--color-muted)">
          <div>
            提示：<span className="kbd">假想架构</span> 选择只影响 KV Cache 可视化（形状/内存/复用），与实际调用的模型解耦。
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wider text-(--color-muted)">{label}</div>
      {children}
    </div>
  );
}
