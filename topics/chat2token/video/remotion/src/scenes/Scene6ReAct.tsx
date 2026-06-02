import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { Frame } from "../components/Frame";
import { color, font, weight, segmentColor, tint, type Segment } from "../lib/theme";
import { useAuthorFrame, useAuthorSpring } from "../lib/fps";

/**
 * Scene 6 · ReAct 循环（Remotion · 不放金句）
 *
 * 左 · Messages 面板只增不改地长高（复用 Scene 5 对话）；右 · Reasoning⇄Action 环，
 * 光点绕环与左侧追加同步：思考节点亮→追加思考卡；行动节点亮→追加 tool_call + tool 卡。
 * 跑两圈后光点脱离环、环淡出，左侧落最后一张终答卡（无 tool_call → 收敛）。
 * 仅极小 Turn 计数；ChatGPT / Claude Code / 花式烧开水只走旁白，不上屏。1.5s 静止尾帧。
 */

const TAIL = 45;
const ANIM = 480;
export const SCENE6_DURATION = ANIM + TAIL;

const CODE_BG = "oklch(0.99 0 0)";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SOFT = Easing.out(Easing.cubic);
const ease = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { easing: SOFT, ...CLAMP });
const bump = (f: number, c: number, w = 22) => {
  const x = interpolate(f, [c - w, c, c + w], [0, 1, 0], CLAMP);
  return x * x * (3 - 2 * x);
};
const useJelly = (f: number, delay: number) =>
  useAuthorSpring(f - delay, { damping: 11, stiffness: 150, mass: 0.8 });

// ── beats ────────────────────────────────────────────────────────────────
const A_SYS = 8;
const A_USER = 48;
const A_C1 = 110; // loop1 reason
const A_T1 = 175; // loop1 action
const A_C2 = 250; // loop2 reason
const A_T2 = 315; // loop2 action
const A_FINAL = 400; // exit → converge

const LEFT_W = 560;
const RING_W = 520;
const GAP_COL = 70;
const GAP = 12;

interface Row {
  role: Segment;
  caption: string;
  appear: number;
  h: number;
  text?: string;
  think?: string;
  call?: string;
  mono?: boolean;
}
const ROWS: Row[] = [
  { role: "system", caption: "system", appear: A_SYS, h: 80, text: "遇到计算请优先调用工具" },
  { role: "user", caption: "user", appear: A_USER, h: 80, text: "今天的年月日相乘是多少？" },
  { role: "assistant", caption: "assistant · tool_call", appear: A_C1, h: 116, think: "不知道今天几号，先查时间", call: "current_time()" },
  { role: "tool", caption: "tool", appear: A_T1, h: 76, text: "2026-06-01T03:59+08:00", mono: true },
  { role: "assistant", caption: "assistant · tool_call", appear: A_C2, h: 116, think: "知道今天了，年×月×日交给计算器", call: 'calculator("2026 * 6 * 1")' },
  { role: "tool", caption: "tool", appear: A_T2, h: 76, text: "12156", mono: true },
  { role: "assistant", caption: "assistant", appear: A_FINAL, h: 92, text: "今天是 2026-06-01，年 × 月 × 日 = 12156。" },
];

const RoleCaption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: font.mono, fontSize: 14, letterSpacing: "0.07em", textTransform: "uppercase", color: color.muted }}>{children}</div>
);

const Card: React.FC<{ f: number; row: Row; index: number }> = ({ f, row, index }) => {
  const c = segmentColor[row.role];
  const grow = ease(f, row.appear, row.appear + 13);
  const j = useJelly(f, row.appear);
  return (
    <div style={{ height: row.h * grow, marginTop: index === 0 ? 0 : GAP * grow, overflow: "hidden" }}>
      <div
        style={{
          position: "relative",
          height: row.h,
          boxSizing: "border-box",
          opacity: Math.min(1, Math.max(0, j)),
          transform: `translateY(${interpolate(j, [0, 1], [22, 0])}px) scale(${interpolate(j, [0, 1], [0.96, 1])})`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 5,
          padding: "0 22px",
          borderRadius: 16,
          background: tint(c, 15),
        }}
      >
        <span style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 4, borderRadius: 999, background: c, opacity: 0.4 }} />
        <RoleCaption>{row.caption}</RoleCaption>
        {row.think && (
          <div style={{ fontFamily: font.sans, fontWeight: weight.token, fontSize: 17, fontStyle: "italic", color: color.muted, lineHeight: 1.1 }}>{row.think}</div>
        )}
        {row.call ? (
          <span style={{ alignSelf: "flex-start", fontFamily: font.mono, fontSize: 21, fontWeight: 700, color: color.accent, background: tint(color.accent, 16), padding: "4px 13px", borderRadius: 9 }}>{row.call}</span>
        ) : (
          <div style={{ fontFamily: row.mono ? font.mono : font.sans, fontWeight: weight.token, fontSize: row.mono ? 24 : 25, color: color.ink, lineHeight: 1.12 }}>{row.text}</div>
        )}
      </div>
    </div>
  );
};

// ── ReAct ring ─────────────────────────────────────────────────────────────
const cx = 260;
const cy = 250;
const rx = 150;
const ry = 175;

const Node: React.FC<{ top: boolean; label: string; sub: string; seg: Segment; hot: number }> = ({ top, label, sub, seg, hot }) => {
  const c = segmentColor[seg];
  return (
    <div
      style={{
        position: "absolute",
        left: cx,
        top: top ? cy - ry : cy + ry,
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "12px 24px",
        borderRadius: 16,
        background: tint(c, 16 + hot * 22),
        border: `2px solid ${tint(c, 45 + hot * 45)}`,
        boxShadow: hot > 0.03 ? `0 10px 26px rgba(0,0,0,${0.05 + hot * 0.06})` : "none",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontFamily: font.display, fontSize: 26, letterSpacing: "0.04em", color: c }}>{label}</span>
      <span style={{ fontFamily: font.sans, fontWeight: weight.token, fontSize: 16, color: color.inkSoft }}>{sub}</span>
    </div>
  );
};

// 分段 smoothstep：在每个节拍内缓入缓出 → 光点接近节点减速、离开加速，转得顺
const smoothSeg = (f: number, fs: number[], us: number[]) => {
  for (let i = 0; i < fs.length - 1; i++) {
    if (f <= fs[i + 1] || i === fs.length - 2) {
      let t = (f - fs[i]) / (fs[i + 1] - fs[i]);
      t = Math.max(0, Math.min(1, t));
      t = t * t * (3 - 2 * t);
      return us[i] + (us[i + 1] - us[i]) * t;
    }
  }
  return us[us.length - 1];
};

const ReActRing: React.FC<{ f: number }> = ({ f }) => {
  const reasonHot = Math.max(bump(f, A_C1), bump(f, A_C2));
  const actionHot = Math.max(bump(f, A_T1), bump(f, A_T2));

  // 光点沿环走：top(reason)→bottom(action)→… 每拍半圈；分段 smoothstep 转得顺
  const u = smoothSeg(f, [A_USER, A_C1, A_T1, A_C2, A_T2, A_FINAL], [0, 0, 1, 2, 3, 4]);
  const phi = -Math.PI / 2 + u * Math.PI;
  const onX = cx + rx * Math.cos(phi);
  const onY = cy + ry * Math.sin(phi);
  // 旋转结束：原地淡出（不飞走）
  const dotO = interpolate(f, [A_FINAL + 6, A_FINAL + 34], [1, 0], CLAMP);

  return (
    <div style={{ position: "relative", width: RING_W, height: 520, opacity: ease(f, A_SYS, A_SYS + 24) }}>
      <svg width={RING_W} height={520} style={{ position: "absolute", inset: 0 }}>
        {/* right half: reason → action（无箭头） */}
        <path d={`M ${cx},${cy - ry} A ${rx},${ry} 0 0 1 ${cx},${cy + ry}`} fill="none" stroke={tint(segmentColor.tool, 50)} strokeWidth={3} />
        {/* left half: action → reason（无箭头） */}
        <path d={`M ${cx},${cy + ry} A ${rx},${ry} 0 0 1 ${cx},${cy - ry}`} fill="none" stroke={tint(segmentColor.assistant, 50)} strokeWidth={3} />
        {/* 光点 + 柔光halo */}
        <circle cx={onX} cy={onY} r={20} fill={color.primary} opacity={dotO * 0.16} />
        <circle cx={onX} cy={onY} r={11} fill={color.primary} opacity={dotO} />
      </svg>
      <Node top label="Reasoning" sub="思考" seg="assistant" hot={reasonHot} />
      <Node top={false} label="Action" sub="调用工具" seg="tool" hot={actionHot} />
    </div>
  );
};

const MessagesPanel: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, width: LEFT_W }}>
    {/* 标题挪到面板外 */}
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingLeft: 6 }}>
      <span style={{ fontFamily: font.display, fontSize: 22, letterSpacing: "0.16em", textTransform: "uppercase", color: color.inkSoft }}>Messages</span>
      <span style={{ fontFamily: font.sans, fontWeight: weight.sans, fontSize: 18, color: color.muted }}>消息列表</span>
    </div>
    <div style={{ padding: "22px 26px 26px", borderRadius: 24, background: CODE_BG, boxShadow: "0 18px 50px rgba(0,0,0,0.07)" }}>
      {ROWS.map((r, i) => (
        <Card key={i} f={f} row={r} index={i} />
      ))}
    </div>
  </div>
);

const Scene6Body: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 64px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: GAP_COL }}>
      <MessagesPanel f={f} />
      <ReActRing f={f} />
    </div>
  </AbsoluteFill>
);

export const Scene6ReAct: React.FC = () => {
  const f = useAuthorFrame(ANIM - 1);
  return (
    <Frame>
      <Scene6Body f={f} />
    </Frame>
  );
};
