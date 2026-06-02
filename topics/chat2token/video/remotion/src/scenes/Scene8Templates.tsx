import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { Frame } from "../components/Frame";
import { TemplateText } from "../components/TemplateText";
import { color, font, type Segment } from "../lib/theme";
import { useAuthorFrame, useAuthorSpring } from "../lib/fps";
import {
  TEMPLATES,
  FAMILY_LABEL,
  segmentTemplate,
  charCount,
  type Family,
  type TSpan,
} from "../data/chatTemplates";

/**
 * Scene 8 · 三家模板，天差地别
 *
 * 三栏并排：DeepSeek-V3 / Qwen3 / GPT-OSS。每栏顶部只有 `{模型} · {N} 字符`，
 * 没有家族 badge、没有一句话浮标。随旁白高亮：先聚焦 DeepSeek（最简洁）→ 聚焦
 * GPT-OSS（最复杂，点亮 You are ChatGPT / Knowledge cutoff / Reasoning: medium
 * 等额外信息行）→ 三栏一起描边强调「不能混用」。文本块真实高度直观对比臃肿度。
 */

const TAIL = 45;
const ANIM = 780;
export const SCENE8_DURATION = ANIM + TAIL;

const CODE_BG = "oklch(0.99 0 0)";
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SOFT = Easing.out(Easing.cubic);
const bump = (f: number, c: number, w = 60) => {
  const x = interpolate(f, [c - w, c, c + w], [0, 1, 0], CLAMP);
  return x * x * (3 - 2 * x);
};
const useJelly = (f: number, delay: number) =>
  useAuthorSpring(f - delay, { damping: 12, stiffness: 140, mass: 0.85 });

const LEFT_W = 780;
const RIGHT_W = 840;
const GAP = 60;
const FS = 18;
const LH = 1.5;

const SPANS: Record<Family, TSpan[]> = {
  deepseek: segmentTemplate(TEMPLATES.deepseek, "deepseek"),
  qwen: segmentTemplate(TEMPLATES.qwen, "qwen"),
  gptoss: segmentTemplate(TEMPLATES.gptoss, "gptoss"),
};

// per-column opacity windows (narration-driven spotlight)
const OPACITY: Record<Family, [number[], number[]]> = {
  // DeepSeek bright during its own focus, dim during GPT focus, back for mix
  deepseek: [[430, 470, 640, 680], [1, 0.4, 0.4, 1]],
  // Qwen (适中) dims for both focuses, returns at mix
  qwen: [[260, 300, 640, 680], [1, 0.4, 0.4, 1]],
  // GPT-OSS dims during DeepSeek focus, bright for its own focus + mix
  gptoss: [[260, 300, 430, 470], [1, 0.4, 0.4, 1]],
};

const Header: React.FC<{ fam: Family }> = ({ fam }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
    <span style={{ fontFamily: font.display, fontSize: 34, letterSpacing: "0.04em", color: color.ink }}>
      {FAMILY_LABEL[fam]}
    </span>
    <span style={{ fontFamily: font.mono, fontSize: 23, color: color.muted }}>
      · {charCount(TEMPLATES[fam]).toLocaleString()} 字符
    </span>
  </div>
);

const Column: React.FC<{ f: number; fam: Family; delay: number; width: number }> = ({ f, fam, delay, width }) => {
  const j = useJelly(f, delay);
  const [xs, ys] = OPACITY[fam];
  const op = interpolate(f, xs, ys, CLAMP);
  const extraPulse = fam === "gptoss" ? bump(f, 520) : 0;
  const hotOf = (s: TSpan) => (s.tag === "extra" ? extraPulse : 0);
  return (
    <div
      style={{
        width,
        opacity: Math.min(op, Math.max(0, j)),
        transform: `translateY(${interpolate(j, [0, 1], [26, 0])}px)`,
      }}
    >
      <Header fam={fam} />
      <div
        style={{
          padding: "26px 32px",
          borderRadius: 18,
          background: CODE_BG,
          boxShadow: `0 14px 40px rgba(0,0,0,0.06)`,
        }}
      >
        <TemplateText spans={SPANS[fam]} fontSize={FS} lineHeight={LH} hotOf={hotOf} />
      </div>
    </div>
  );
};

const Scene8Body: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "flex-start", padding: "30px 50px 0" }}>
    <div style={{ display: "flex", alignItems: "flex-start", gap: GAP, width: "100%", justifyContent: "center" }}>
      {/* 左：内容少的 DeepSeek / Qwen 上下排列 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
        <Column f={f} fam="deepseek" delay={0} width={LEFT_W} />
        <Column f={f} fam="qwen" delay={14} width={LEFT_W} />
      </div>
      {/* 右：最臃肿的 GPT-OSS */}
      <Column f={f} fam="gptoss" delay={28} width={RIGHT_W} />
    </div>
  </AbsoluteFill>
);

export const Scene8Templates: React.FC = () => {
  const f = useAuthorFrame(ANIM - 1);
  return (
    <Frame>
      <Scene8Body f={f} />
    </Frame>
  );
};
