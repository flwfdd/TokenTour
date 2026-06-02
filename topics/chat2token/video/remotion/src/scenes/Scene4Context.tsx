import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { Frame } from "../components/Frame";
import { color, font, weight, segmentColor, tint, type Segment } from "../lib/theme";
import { useAuthorFrame, useAuthorSpring } from "../lib/fps";

/**
 * Scene 4 · 「记忆」的真相 / Context
 *
 * 左右两栏，同一段对话两种视图：
 *   左 · Context panel  角色卡列表（随追加长高），每次「调用模型」自上而下快速高亮一道
 *   右 · messages JSON  同一份数据的结构化形式，逐条追加、与左栏同步高亮
 *
 * 记忆演示：user「我是奶龙」→ assistant「我记住了」→ user「我是谁」→ assistant「你是奶龙」。
 * 扫描一结束立刻冒出新的 assistant（读完即生成）。镜头内无渐变转场；1.5s 静止尾帧。
 */

const TAIL = 45;
const ANIM = 560;
export const SCENE4_DURATION = ANIM + TAIL;

const CODE_BG = "oklch(0.99 0 0)"; // --color-code-bg

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SOFT = Easing.out(Easing.cubic);
const ease = (f: number, a: number, b: number, fn: (n: number) => number = SOFT) =>
  interpolate(f, [a, b], [0, 1], { easing: fn, ...CLAMP });
/** smooth triangular bump centred at `c` (quick edge-light pulse). */
const bump = (f: number, c: number, w = 10) => {
  const x = interpolate(f, [c - w, c, c + w], [0, 1, 0], CLAMP);
  return x * x * (3 - 2 * x);
};
const useJelly = (f: number, delay: number) =>
  useAuthorSpring(f - delay, { damping: 10, stiffness: 130, mass: 0.85 });

// ── layout ─────────────────────────────────────────────────────────────
const COL_W = 600;
const GAP_COL = 64;
const CARD_H = 92;
const GAP = 13;

// ── conversation (memory demo) ───────────────────────────────────────────
interface Row {
  role: Segment;
  content: string;
  appear: number; // author-frame the message enters (drives both columns)
}
const ROWS: Row[] = [
  { role: "system", content: "你是哈基米", appear: 10 },
  { role: "user", content: "我是奶龙", appear: 70 },
  { role: "assistant", content: "我记住了喵～", appear: 170 },
  { role: "user", content: "我是谁", appear: 260 },
  { role: "assistant", content: "你是奶龙喵～", appear: 382 },
];

// ── read sweeps：每次「调用模型」自上而下快速高亮 ─────────────────────────
interface Sweep {
  start: number;
  step: number;
  count: number;
}
const SWEEP1: Sweep = { start: 145, step: 13, count: 2 };
const SWEEP2: Sweep = { start: 330, step: 13, count: 4 };

const hotOf = (f: number, i: number) => {
  let h = 0;
  if (i < SWEEP1.count) h = Math.max(h, bump(f, SWEEP1.start + i * SWEEP1.step));
  if (i < SWEEP2.count) h = Math.max(h, bump(f, SWEEP2.start + i * SWEEP2.step));
  return h;
};

const RoleCaption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: font.mono, fontSize: 16, letterSpacing: "0.08em", textTransform: "uppercase", color: color.muted }}>
    {children}
  </div>
);

// ── LEFT · a context card — grows open + jelly, edge-lights when re-read ──
const Card: React.FC<{ f: number; row: Row; index: number }> = ({ f, row, index }) => {
  const c = segmentColor[row.role];
  const grow = ease(f, row.appear, row.appear + 13);
  const op = ease(f, row.appear, row.appear + 9);
  const j = useJelly(f, row.appear);
  const hot = hotOf(f, index);
  return (
    <div style={{ height: CARD_H * grow, marginTop: index === 0 ? 0 : GAP * grow, overflow: "hidden" }}>
      <div
        style={{
          position: "relative",
          height: CARD_H,
          boxSizing: "border-box",
          opacity: op,
          transform: `translateY(${interpolate(j, [0, 1], [16, 0])}px) scale(${interpolate(j, [0, 1], [0.97, 1])})`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 6,
          padding: "0 24px",
          borderRadius: 16,
          background: tint(c, 15 + hot * 22),
          boxShadow: hot > 0.02 ? `0 8px 22px rgba(0,0,0,${0.03 + hot * 0.05})` : "none",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 10,
            bottom: 10,
            width: 4,
            borderRadius: 999,
            background: c,
            opacity: 0.28 + 0.72 * hot,
          }}
        />
        <RoleCaption>{row.role}</RoleCaption>
        <div style={{ fontFamily: font.sans, fontWeight: weight.token, fontSize: 30, color: color.ink, lineHeight: 1.1 }}>
          {row.content}
        </div>
      </div>
    </div>
  );
};

const ContextPanel: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 14, width: COL_W }}>
    {/* 标题挪到面板外 */}
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingLeft: 6 }}>
      <span style={{ fontFamily: font.display, fontSize: 23, letterSpacing: "0.16em", textTransform: "uppercase", color: segmentColor.system }}>
        Context
      </span>
      <span style={{ fontFamily: font.sans, fontWeight: weight.sans, fontSize: 19, color: color.inkSoft }}>上下文 · 模型能看到的全部</span>
    </div>
    <div style={{ padding: "24px 28px 28px", borderRadius: 24, background: CODE_BG, boxShadow: "0 18px 50px rgba(0,0,0,0.07)" }}>
      {ROWS.map((r, i) => (
        <Card key={i} f={f} row={r} index={i} />
      ))}
    </div>
  </div>
);

// ── RIGHT · the same messages as JSON, appended + synced highlight ────────
const LH = 34;
interface JLine {
  text: string;
  role?: Segment;
  msg?: number; // index into ROWS (for appear + hot)
}
const JSON_LINES: JLine[] = (() => {
  const out: JLine[] = [{ text: "[" }];
  ROWS.forEach((r, i) => {
    const comma = i < ROWS.length - 1 ? "," : "";
    out.push({ text: "  {", role: r.role, msg: i });
    out.push({ text: `    "role": "${r.role}",`, role: r.role, msg: i });
    out.push({ text: `    "content": "${r.content}"`, role: r.role, msg: i });
    out.push({ text: `  }${comma}`, role: r.role, msg: i });
  });
  out.push({ text: "]" });
  return out;
})();

const JsonColumn: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 14, width: COL_W }}>
    {/* 标题挪到面板外 */}
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingLeft: 6 }}>
      <span style={{ fontFamily: font.display, fontSize: 23, letterSpacing: "0.16em", textTransform: "uppercase", color: color.muted }}>
        messages
      </span>
      <span style={{ fontFamily: font.sans, fontWeight: weight.sans, fontSize: 19, color: color.inkSoft }}>同一份数据 · 结构化 JSON</span>
    </div>
    <div style={{ borderRadius: 18, background: CODE_BG, boxShadow: "0 18px 50px rgba(0,0,0,0.07)", overflow: "hidden" }}>
    {/* chrome */}
    <div style={{ position: "relative", height: 44, display: "flex", alignItems: "center", gap: 9, padding: "0 16px", background: color.paper3 }}>
      {[color.danger, color.warning, color.success].map((c, i) => (
        <span key={i} style={{ width: 12, height: 12, borderRadius: 999, background: c }} />
      ))}
      <div style={{ position: "absolute", left: 0, right: 0, textAlign: "center", fontFamily: font.mono, fontSize: 18, color: color.muted }}>
        messages.json
      </div>
    </div>
    {/* lines */}
    <div style={{ padding: "14px 0" }}>
      {JSON_LINES.map((ln, i) => {
        const appear = ln.msg != null ? ROWS[ln.msg].appear : 10;
        const grow = ease(f, appear, appear + 13);
        const op = ease(f, appear, appear + 9);
        const r = ln.role ? segmentColor[ln.role] : undefined;
        const hot = ln.msg != null ? hotOf(f, ln.msg) : 0;
        return (
          <div
            key={i}
            style={{
              position: "relative",
              height: LH * grow,
              opacity: op,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              background: r ? tint(r, 12 + hot * 20) : "transparent",
            }}
          >
            {r && (
              <span style={{ position: "absolute", left: 0, top: 3, bottom: 3, width: 3, background: r, opacity: 0.2 + 0.8 * hot }} />
            )}
            <span style={{ paddingLeft: 22, fontFamily: font.mono, fontSize: 20, lineHeight: 1.6, color: color.ink, whiteSpace: "pre" }}>
              {ln.text || " "}
            </span>
          </div>
        );
      })}
    </div>
    </div>
  </div>
);

// ── body ───────────────────────────────────────────────────────────────
const Scene4Body: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 56px" }}>
    <div style={{ display: "flex", alignItems: "flex-start", gap: GAP_COL }}>
      <ContextPanel f={f} />
      <JsonColumn f={f} />
    </div>
  </AbsoluteFill>
);

export const Scene4Context: React.FC = () => {
  const f = useAuthorFrame(ANIM - 1);
  return (
    <Frame>
      <Scene4Body f={f} />
    </Frame>
  );
};
