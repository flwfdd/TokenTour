import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { color, font, weight, tint, segmentColor, type Segment } from "../lib/theme";

/**
 * B站封面 · 1320×825
 *
 * 缩略图很小 → 不放真实文字。左侧是**抽象的频道风格对话卡**（角色卡 + 思考 + 工具调用，
 * 用骨架条 + 图标表意）；右侧是**放大、清晰的 token 大色块**（人话被切成词元）。
 * 正中 `TokenTour / Token 之旅`（片头排版 + design 品牌色）。整体「人话 ↔ token」对照。
 */

export const COVER_W = 1320;
export const COVER_H = 825;

// 左右两张卡等大对齐（高度需容下左侧全部消息，避免裁切）
const CARD_W = 452;
const CARD_H = 552;

// ── 彩色雾背景（沿用 Scene0 的游动色斑，封面取一个好看的静止相位） ──────────
const FogBackground: React.FC<{ t: number }> = ({ t }) => {
  const blob = (hue: number, l: number, c: number, a: number, bx: number, by: number, rad: number, sp: number, ph: number) => {
    const cx = bx + rad * Math.cos(t * sp + ph);
    const cy = by + rad * Math.sin(t * sp * 0.8 + ph * 1.3);
    return `radial-gradient(42% 46% at ${cx}% ${cy}%, oklch(${l} ${c} ${hue} / ${a}), transparent 72%)`;
  };
  const bg = [
    blob(218, 0.93, 0.11, 0.6, 24, 30, 16, 0.5, 0),
    blob(55, 0.94, 0.1, 0.58, 78, 28, 14, 0.42, 1.7),
    blob(300, 0.93, 0.1, 0.5, 30, 74, 15, 0.46, 3.1),
    blob(145, 0.94, 0.09, 0.46, 74, 76, 17, 0.38, 4.6),
    blob(195, 0.95, 0.08, 0.4, 50, 50, 13, 0.55, 2.2),
  ].join(",");
  return (
    <>
      <AbsoluteFill style={{ background: color.paper }} />
      <AbsoluteFill style={{ background: bg, filter: "blur(70px)", transform: "scale(1.25)" }} />
    </>
  );
};

// ── 图标（lucide 简化路径，stroke 描线） ────────────────────────────────────
const Icon: React.FC<{ d: string; c: string; size?: number }> = ({ d, c, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const WRENCH = "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z";
const SPARK = "M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6.3 6.3l2.1 2.1 M15.6 15.6l2.1 2.1 M17.7 6.3l-2.1 2.1 M8.4 15.6l-2.1 2.1";

// ── 抽象骨架条 ──────────────────────────────────────────────────────────────
const Bar: React.FC<{ w: number | string; c?: string; h?: number }> = ({ w, c = color.rule, h = 13 }) => (
  <div style={{ width: w, height: h, borderRadius: 999, background: c }} />
);

// 角色卡：左侧色条 + 角色色点 + 内容（抽象条 / 思考 / 工具调用）
const RoleCard: React.FC<{ role: Segment; h: number; children: React.ReactNode }> = ({ role, h, children }) => {
  const c = segmentColor[role];
  return (
    <div style={{ position: "relative", minHeight: h, boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center", gap: 11, padding: "0 22px", borderRadius: 18, background: tint(c, 15) }}>
      <span style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 5, borderRadius: 999, background: c, opacity: 0.5 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 12, height: 12, borderRadius: 999, background: c }} />
        <Bar w={74} c={tint(c, 50)} h={11} />
      </div>
      {children}
    </div>
  );
};

const ChatCard: React.FC = () => (
  <div style={{ width: CARD_W, height: CARD_H, boxSizing: "border-box", background: "oklch(0.99 0 0)", borderRadius: 26, padding: "26px 24px", boxShadow: "0 28px 74px rgba(0,0,0,0.14)", display: "flex", flexDirection: "column", justifyContent: "center", gap: 15 }}>
    {/* system */}
    <RoleCard role="system" h={68}>
      <Bar w="78%" />
    </RoleCard>
    {/* user */}
    <RoleCard role="user" h={68}>
      <Bar w="60%" />
    </RoleCard>
    {/* assistant · 思考 + 工具调用 */}
    <RoleCard role="assistant" h={132}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Icon d={SPARK} c={color.muted} size={19} />
        <Bar w="64%" c={tint(color.muted, 40)} h={11} />
      </div>
      <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 12, background: tint(color.accent, 16), border: `1.5px solid ${tint(color.accent, 32)}` }}>
        <Icon d={WRENCH} c={color.accent} size={20} />
        <Bar w={120} c={tint(color.accent, 55)} h={12} />
      </div>
    </RoleCard>
    {/* tool result（等宽块感） */}
    <RoleCard role="tool" h={72}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "6px 0" }}>
        <Bar w="46%" c={tint(color.accent, 42)} h={11} />
      </div>
    </RoleCard>
    {/* assistant 终答 */}
    <RoleCard role="assistant" h={86}>
      <Bar w="92%" />
      <Bar w="64%" />
    </RoleCard>
  </div>
);

// ── 右：纯色块 token（不显字），按角色色分段、密排填满容器 ───────────────────
// 与左侧对话「人话 ↔ token」对应：紫 system / 青 user / 绿 assistant，宽度仿词元长短。
const TOK_SEQ: { seg: Segment; w: number }[] = (() => {
  const base: [Segment, number[]][] = [
    ["system", [60, 38, 38, 38, 54, 44, 40]],
    ["user", [62, 40, 32, 50, 46]],
    ["assistant", [58, 38, 38, 38, 36, 30, 52, 46, 40, 56, 44]],
    ["tool", [48, 66, 36, 52, 40]],
    ["assistant", [58, 44, 38, 38, 50, 34, 54, 42]],
    ["user", [50, 38, 62, 44]],
    ["assistant", [40, 54, 38, 38, 48, 58, 34]],
  ];
  // 再补一轮，密排填满容器（与左侧消息大致对应：紫→青→绿→橙→绿…）
  const runs = base.concat(base.slice(0, 5));
  return runs.flatMap(([seg, ws]) => ws.map((w) => ({ seg, w })));
})();

const TokBlock: React.FC<{ seg: Segment; w: number }> = ({ seg, w }) => {
  const c = segmentColor[seg];
  return <div style={{ width: w, height: 32, borderRadius: 8, background: tint(c, 24), border: `1.5px solid ${tint(c, 42)}` }} />;
};

const TokensCard: React.FC = () => (
  <div style={{ width: CARD_W, height: CARD_H, boxSizing: "border-box", background: "oklch(0.99 0 0)", borderRadius: 26, padding: "26px 24px", boxShadow: "0 28px 74px rgba(0,0,0,0.14)", display: "flex", flexWrap: "wrap", alignContent: "center", justifyContent: "center", gap: 10 }}>
    {TOK_SEQ.map((t, i) => (
      <TokBlock key={i} seg={t.seg} w={t.w} />
    ))}
  </div>
);

// ── 顶部小标：TokenTour（得意黑斜体·青字橙线），独立置于中上顶部 ─────────────
const TopEyebrow: React.FC = () => (
  <div style={{ position: "absolute", top: 64, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, zIndex: 3 }}>
    <div style={{ fontFamily: font.display, fontStyle: "italic", fontSize: 66, letterSpacing: "0.04em", color: color.primary }}>TokenTour</div>
    <div style={{ width: 138, height: 7, borderRadius: 4, background: color.accent }} />
  </div>
);

// ── 主标题：Token 之旅，画面正中 ───────────────────────────────────────────
const CenterTitle: React.FC = () => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
    <div style={{ fontFamily: font.serif, fontWeight: weight.serif, fontSize: 132, lineHeight: 1, color: color.primary }}>Token</div>
    <div style={{ fontFamily: font.serif, fontWeight: weight.serif, fontSize: 144, lineHeight: 1.02, letterSpacing: "0.28em", paddingLeft: "0.28em", color: color.accent }}>之旅</div>
  </div>
);

const CoverBody: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill style={{ overflow: "hidden" }}>
    <FogBackground t={t} />
    {/* 左：抽象对话卡 */}
    <div style={{ position: "absolute", left: 34, top: "50%", transform: "translateY(-50%) rotate(-6deg)", zIndex: 1 }}>
      <ChatCard />
    </div>
    {/* 右：纯色块 token 卡（与左卡等大、垂直对齐） */}
    <div style={{ position: "absolute", right: 34, top: "50%", transform: "translateY(-50%) rotate(6deg)", transformOrigin: "center center", zIndex: 1 }}>
      <TokensCard />
    </div>
    {/* 顶部小标 */}
    <TopEyebrow />
    {/* 中：主标题（柔光底压住背景，保证可读） */}
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", zIndex: 2 }}>
      <div style={{ position: "absolute", width: 540, height: 460, borderRadius: "50%", background: "radial-gradient(closest-side, oklch(0.99 0 0 / 0.82), transparent)", filter: "blur(8px)" }} />
      <div style={{ position: "relative" }}>
        <CenterTitle />
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);

export const Cover: React.FC = () => {
  const frame = useCurrentFrame();
  return <CoverBody t={frame / 30 + 6} />;
};

// ── 彩色变幻背景素材（无缝循环，整数谐波相位） ──────────────────────────────
export const FOGBG_W = 1920;
export const FOGBG_H = 1080;

export const FogBg: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const th = (2 * Math.PI * frame) / durationInFrames; // 0..2π 整周期
  // k1/k2 取整数 → 周期内整数圈，首尾完美衔接
  const blob = (hue: number, l: number, c: number, a: number, bx: number, by: number, rad: number, k1: number, k2: number, ph: number) => {
    const cx = bx + rad * Math.cos(k1 * th + ph);
    const cy = by + rad * Math.sin(k2 * th + ph);
    return `radial-gradient(42% 46% at ${cx}% ${cy}%, oklch(${l} ${c} ${hue} / ${a}), transparent 72%)`;
  };
  const bg = [
    blob(218, 0.93, 0.12, 0.62, 26, 32, 18, 1, 1, 0), // 青
    blob(55, 0.94, 0.11, 0.6, 76, 28, 16, 1, 2, 1.7), // 橙
    blob(300, 0.93, 0.11, 0.54, 30, 74, 17, 2, 1, 3.1), // 紫
    blob(145, 0.94, 0.1, 0.5, 74, 76, 19, 1, 1, 4.6), // 绿
    blob(195, 0.95, 0.09, 0.44, 50, 50, 15, 2, 2, 2.2), // 青绿
    blob(28, 0.95, 0.08, 0.4, 50, 18, 14, 1, 1, 5.4), // 暖
  ].join(",");
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: color.paper }} />
      <AbsoluteFill style={{ background: bg, filter: "blur(72px)", transform: "scale(1.3)" }} />
    </AbsoluteFill>
  );
};
