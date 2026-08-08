import { useEffect, useState } from "react";
import { useConversation } from "./store";
import { PROVIDER_PRESETS } from "./lib/providers";
import { useLang } from "./i18n";
import { providerPresetLabel } from "./locale";

interface Props {
  open: boolean;
  onClose: () => void;
}

const settingsCopy = {
  en: {
    title: "Settings · BYOK",
    close: "Close",
    note:
      "API keys are stored only in browser localStorage and are never uploaded. OpenAI and Anthropic support direct browser calls; if CORS blocks a provider, enable proxy mode (the key is still attached by the frontend and is not persisted server-side).",
    staticNote:
      "Static mirror mode: API keys stay in browser localStorage, and provider calls are made directly from the browser. /api/proxy is not available on GitHub Pages.",
    provider: "Provider",
    baseUrl: "Base URL",
    apiKey: "API Key",
    modelName: "Model name",
    routing: "Routing",
    proxy: "Route through /api/proxy (helps with CORS)",
    temperature: "Temperature",
    maxTokens: "Max tokens",
    hint:
      "Tip: the imaginary architecture selector only affects the KV Cache visualization (shape, memory, and reuse). It is decoupled from the model you actually call.",
    imaginaryArch: "imaginary architecture",
  },
  zh: {
    title: "设置 · BYOK",
    close: "关闭",
    note:
      "API key 仅保存在浏览器 localStorage，从不上报。OpenAI 与 Anthropic 支持浏览器直连；如遇 CORS 阻塞可切换到代理模式（key 仍由前端附带，服务端不持久化）。",
    staticNote:
      "静态镜像模式：API key 仅保存在浏览器 localStorage，Provider 请求由浏览器直连；GitHub Pages 不提供 /api/proxy。",
    provider: "Provider",
    baseUrl: "Base URL",
    apiKey: "API Key",
    modelName: "模型名称",
    routing: "转发",
    proxy: "使用 /api/proxy 转发（解决 CORS）",
    temperature: "Temperature",
    maxTokens: "最大 tokens",
    hint: "提示：假想架构选择只影响 KV Cache 可视化（形状/内存/复用），与实际调用的模型解耦。",
    imaginaryArch: "假想架构",
  },
} as const;

export default function SettingsDrawer({ open, onClose }: Props) {
  const state = useConversation();
  const lang = useLang();
  const copy = settingsCopy[lang];
  const [presetId, setPresetId] = useState(state.provider.id);
  const isStaticMirror = import.meta.env.PUBLIC_TOKENTOUR_STATIC === "1";

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
          <div className="text-base font-semibold">{copy.title}</div>
          <button onClick={onClose} className="btn">
            {copy.close}
          </button>
        </div>
        <p className="mt-1 text-xs text-(--color-muted)">
          {isStaticMirror ? copy.staticNote : copy.note}
        </p>

        <div className="mt-4 space-y-3">
          <Row label={copy.provider}>
            <select value={presetId} onChange={(e) => handlePreset(e.target.value)} className="w-full">
              {PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {providerPresetLabel(p.id, p.label, lang)}
                </option>
              ))}
            </select>
          </Row>

          <Row label={copy.baseUrl}>
            <input
              type="text"
              value={state.provider.baseUrl}
              onChange={(e) => state.setProvider({ baseUrl: e.target.value })}
              className="w-full font-mono text-xs"
            />
          </Row>

          <Row label={copy.apiKey}>
            <input
              type="password"
              autoComplete="off"
              placeholder="sk-..."
              value={state.provider.apiKey}
              onChange={(e) => state.setProvider({ apiKey: e.target.value })}
              className="w-full font-mono text-xs"
            />
          </Row>

          <Row label={copy.modelName}>
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

          {!isStaticMirror && (
            <Row label={copy.routing}>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={state.provider.useProxy}
                  onChange={(e) => state.setProvider({ useProxy: e.target.checked })}
                />
                {copy.proxy}
              </label>
            </Row>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Row label={`${copy.temperature} · ${state.provider.temperature.toFixed(2)}`}>
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
            <Row label={copy.maxTokens}>
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
            {lang === "zh" ? (
              <>
                提示：<span className="kbd">{copy.imaginaryArch}</span> 选择只影响 KV Cache 可视化（形状/内存/复用），与实际调用的模型解耦。
              </>
            ) : (
              <>
                Tip: the <span className="kbd">{copy.imaginaryArch}</span> selector only affects the KV Cache visualization (shape, memory, and reuse). It is decoupled from the model you actually call.
              </>
            )}
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
