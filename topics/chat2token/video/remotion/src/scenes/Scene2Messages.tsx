import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { Frame } from "../components/Frame";
import { color, font, weight, segmentColor, tint, type Segment } from "../lib/theme";
import { useAuthorFrame, useAuthorSpring } from "../lib/fps";

/**
 * Scene 2 · 你看到的 ↔ 模型看到的
 *
 * Three panels, left → center → right, mirroring the article's MessageView tabs
 * (topics/chat2token/blog/MessageView.astro). The same 哈基米 exchange shown three
 * ways, with content flowing in left → right:
 *
 *   ① Chat      你看到的聊天气泡   — two bubbles only (no system): user right, assistant
 *                                  left, both jelly-spring in (右 then 左)
 *   ② Messages  模型看到的消息列表 — playground role cards, SAME width, stacked; rise in
 *                                  one-by-one bottom→top; assistant's Thinking expanded
 *   ③ JSON      编码为纯结构       — shared CodeBlock chrome, role-tinted rows; the
 *                                  角色 / 内容 / 思考 lines pulse-highlight in turn
 *
 * Data = `msgBasicFull` (blog/zh/index.astro). The content row has a FIXED height
 * so the JSON card mounting never shoves the headers up.
 */

const TAIL = 45; // static tail handle (full three-panel)
const ANIM = 660;
export const SCENE2_DURATION = ANIM + TAIL;

const CODE_BG = "oklch(0.99 0 0)"; // --color-code-bg
const CONTENT_H = 580; // reserved height → headers never jump

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SMOOTH = Easing.inOut(Easing.cubic);
const SOFT = Easing.out(Easing.cubic);

const ease = (f: number, a: number, b: number, fn: (n: number) => number = SOFT) =>
  interpolate(f, [a, b], [0, 1], { easing: fn, ...CLAMP });
const pulse = (f: number, a: number, b: number) =>
  interpolate(f, [a, a + 18, b - 18, b], [0, 1, 1, 0], CLAMP);
/** jelly spring 0→1 with overshoot. */
const useJelly = (f: number, delay: number) =>
  useAuthorSpring(f - delay, { damping: 9, stiffness: 130, mass: 0.85 });

// ── layout ─────────────────────────────────────────────────────────────
const GAP = 56;
const W_CHAT = 460;
const W_MSG = 520;
const W_JSON = 700;

// ── beat keyframes (local frame) ─────────────────────────────────────────
const T_MSG_IN = 70; // messages cards rise in
const MSG_STAGGER = 18;
const T_JSON_IN = 165; // json column encodes in
const HL_ROLE: [number, number] = [270, 375];
const HL_CONTENT: [number, number] = [385, 490];
const HL_REASON: [number, number] = [495, 600];

// ── conversation (msgBasicFull) ──────────────────────────────────────────
interface Row {
  role: Segment;
  content: string;
  reasoning?: string;
}
const ROWS: Row[] = [
  { role: "system", content: "你是一只哈基米" },
  { role: "user", content: "你是谁？" },
  { role: "assistant", content: "我是哈基米，喵～", reasoning: "我想哈用户，但还是忍一下吧。" },
];

type Kind = "role" | "content" | "reasoning";
interface JLine {
  t: string;
  role?: Segment;
  kind?: Kind;
}
const JSON_LINES: JLine[] = [
  { t: "[" },
  { t: "  {", role: "system" },
  { t: '    "role": "system",', role: "system", kind: "role" },
  { t: '    "content": "你是一只哈基米"', role: "system", kind: "content" },
  { t: "  },", role: "system" },
  { t: "  {", role: "user" },
  { t: '    "role": "user",', role: "user", kind: "role" },
  { t: '    "content": "你是谁？"', role: "user", kind: "content" },
  { t: "  },", role: "user" },
  { t: "  {", role: "assistant" },
  { t: '    "role": "assistant",', role: "assistant", kind: "role" },
  { t: '    "reasoning_content": "我想哈用户，但还是忍一下吧。",', role: "assistant", kind: "reasoning" },
  { t: '    "content": "我是哈基米，喵～"', role: "assistant", kind: "content" },
  { t: "  }", role: "assistant" },
  { t: "]" },
];

// ── header ────────────────────────────────────────────────────────────────
const Header: React.FC<{ opacity: number; en: string; zh: string }> = ({ opacity, en, zh }) => (
  <div style={{ opacity, textAlign: "center", display: "flex", flexDirection: "column", gap: 4 }}>
    <div style={{ fontFamily: font.display, fontSize: 24, letterSpacing: "0.18em", textTransform: "uppercase", color: color.muted }}>
      {en}
    </div>
    <div style={{ fontFamily: font.sans, fontWeight: weight.sans, fontSize: 22, color: color.inkSoft }}>{zh}</div>
  </div>
);

const RoleCaption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: font.mono, fontSize: 16, letterSpacing: "0.08em", textTransform: "uppercase", color: color.muted }}>
    {children}
  </div>
);

// ── ① Chat — two bubbles, jelly spring (right then left) ──────────────────
const Bubble: React.FC<{ f: number; delay: number; fromX: number; align: "left" | "right"; bg: string; text: string }> = ({
  f,
  delay,
  fromX,
  align,
  bg,
  text,
}) => {
  const j = useJelly(f, delay);
  const op = ease(f, delay, delay + 7);
  return (
    <div style={{ display: "flex", justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
      <div
        style={{
          opacity: op,
          transform: `translateX(${interpolate(j, [0, 1], [fromX, 0])}px) scale(${j})`,
          transformOrigin: align === "right" ? "right center" : "left center",
          maxWidth: "86%",
          padding: "16px 24px",
          borderRadius: 26,
          background: bg,
          fontFamily: font.sans,
          fontWeight: weight.token,
          fontSize: 34,
          color: color.ink,
          boxShadow: "0 6px 20px rgba(0,0,0,0.05)",
        }}
      >
        {text}
      </div>
    </div>
  );
};

const ChatColumn: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ width: W_CHAT, display: "flex", flexDirection: "column", gap: 28 }}>
    <Bubble f={f} delay={6} fromX={70} align="right" bg="oklch(0.915 0 0)" text="你是谁？" />
    <Bubble f={f} delay={24} fromX={-70} align="left" bg="oklch(0.94 0 0)" text="我是哈基米，喵～" />
  </div>
);

// ── ② Messages — playground cards, rise in bottom→top, Thinking expanded ──
const MessageCard: React.FC<{ f: number; row: Row; delay: number }> = ({ f, row, delay }) => {
  const role = segmentColor[row.role];
  const j = useJelly(f, delay);
  const op = ease(f, delay, delay + 8);
  return (
    <div
      style={{
        opacity: op,
        transform: `translateY(${interpolate(j, [0, 1], [38, 0])}px) scale(${interpolate(j, [0, 1], [0.96, 1])})`,
        width: "100%",
        padding: "14px 18px",
        borderRadius: 16,
        background: tint(role, 16),
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <RoleCaption>{row.role}</RoleCaption>
      </div>
      {row.reasoning && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <RoleCaption>
              <span style={{ color: segmentColor.assistant, marginRight: 6 }}>▾</span>Thinking
            </RoleCaption>
          </div>
          <div
            style={{
              marginTop: 6,
              paddingLeft: 14,
              fontFamily: font.sans,
              fontWeight: weight.token,
              fontStyle: "italic",
              fontSize: 24,
              lineHeight: 1.4,
              color: color.inkSoft,
            }}
          >
            {row.reasoning}
          </div>
        </div>
      )}
      <div style={{ fontFamily: font.sans, fontWeight: weight.token, fontSize: 28, color: color.ink, lineHeight: 1.35 }}>
        {row.content}
      </div>
    </div>
  );
};

const MessagesColumn: React.FC<{ f: number }> = ({ f }) => (
  // Generated top→bottom (system first), each card *rising up* into place.
  <div style={{ width: W_MSG, display: "flex", flexDirection: "column", gap: 14 }}>
    {ROWS.map((r, i) => (
      <MessageCard key={i} f={f} row={r} delay={T_MSG_IN + i * MSG_STAGGER} />
    ))}
  </div>
);

// ── ③ JSON — CodeBlock chrome, role-tinted rows + line-level highlight ────
const JsonColumn: React.FC<{ f: number }> = ({ f }) => {
  const cardOp = ease(f, T_JSON_IN, T_JSON_IN + 35);
  const scale = interpolate(ease(f, T_JSON_IN, T_JSON_IN + 60, SMOOTH), [0, 1], [0.975, 1], CLAMP);
  const roleHL = pulse(f, HL_ROLE[0], HL_ROLE[1]);
  const contentHL = pulse(f, HL_CONTENT[0], HL_CONTENT[1]);
  const reasonHL = pulse(f, HL_REASON[0], HL_REASON[1]);
  const hlOf = (k?: Kind) => (k === "role" ? roleHL : k === "content" ? contentHL : k === "reasoning" ? reasonHL : 0);
  const dot = (c: string) => <span style={{ width: 12, height: 12, borderRadius: 999, background: c, display: "inline-block" }} />;

  return (
    <div style={{ width: W_JSON, opacity: cardOp, transform: `scale(${scale})` }}>
      <div style={{ borderRadius: 16, background: CODE_BG, boxShadow: "0 12px 36px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{ position: "relative", height: 44, display: "flex", alignItems: "center", gap: 9, padding: "0 16px", background: color.paper3 }}>
          {dot(color.danger)}
          {dot(color.warning)}
          {dot(color.success)}
          <div style={{ position: "absolute", left: 0, right: 0, textAlign: "center", fontFamily: font.mono, fontSize: 19, color: color.muted }}>
            messages
          </div>
        </div>
        <div style={{ padding: "14px 0" }}>
          {JSON_LINES.map((ln, i) => {
            const start = T_JSON_IN + 10 + i * 4;
            const lo = ease(f, start, start + 16);
            const r = ln.role ? segmentColor[ln.role] : undefined;
            const hl = hlOf(ln.kind);
            const bgPct = r ? 13 + hl * 20 : 0;
            return (
              <div
                key={i}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  opacity: lo,
                  transform: `translateX(${(1 - lo) * -16}px)`,
                  background: r ? tint(r, bgPct) : "transparent",
                }}
              >
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: r ?? "transparent", opacity: hl }} />
                <span style={{ width: 50, flex: "none", textAlign: "right", paddingRight: 16, fontFamily: font.mono, fontSize: 18, lineHeight: 1.6, color: color.muted, opacity: 0.7 }}>
                  {i + 1}
                </span>
                <span style={{ fontFamily: font.mono, fontSize: 20, lineHeight: 1.6, color: color.ink, whiteSpace: "pre" }}>{ln.t || " "}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── body ───────────────────────────────────────────────────────────────────
const Scene2Body: React.FC<{ f: number }> = ({ f }) => {
  const msgHead = ease(f, 55, 95);
  const jsonHead = ease(f, T_JSON_IN - 10, T_JSON_IN + 25);
  const jsonCol = ease(f, T_JSON_IN, T_JSON_IN + 25);
  const colStyle = (w: number): React.CSSProperties => ({ width: w, display: "flex", justifyContent: "center" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 48, padding: "0 64px" }}>
      {/* header row */}
      <div style={{ display: "flex", gap: GAP, alignItems: "flex-end" }}>
        <div style={colStyle(W_CHAT)}>
          <Header opacity={1} en="Chat" zh="聊天气泡" />
        </div>
        <div style={colStyle(W_MSG)}>
          <Header opacity={msgHead} en="Messages" zh="消息列表" />
        </div>
        <div style={colStyle(W_JSON)}>
          <Header opacity={jsonHead} en="JSON" zh="结构化编码" />
        </div>
      </div>
      {/* content row — FIXED height so the headers never shift */}
      <div style={{ display: "flex", gap: GAP, alignItems: "center", height: CONTENT_H }}>
        <div style={colStyle(W_CHAT)}>
          <ChatColumn f={f} />
        </div>
        <div style={colStyle(W_MSG)}>
          <MessagesColumn f={f} />
        </div>
        <div style={{ ...colStyle(W_JSON), opacity: jsonCol }}>{jsonCol > 0 && <JsonColumn f={f} />}</div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Edit-ready clip. The chat jelly-entrance opens the scene; a clamped local frame
 * holds the settled three-panel state for the 1.5s tail handle. No Freeze.
 */
export const Scene2Messages: React.FC = () => {
  const f = useAuthorFrame(ANIM - 1);
  return (
    <Frame>
      <Scene2Body f={f} />
    </Frame>
  );
};
