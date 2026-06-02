import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { Frame } from "../components/Frame";
import { color, font, weight, segmentColor, tint, type Segment } from "../lib/theme";
import { useAuthorFrame, useAuthorSpring } from "../lib/fps";

/**
 * Scene 5 · 工具调用：约定与协议（= 具体的 ReAct 循环）
 *
 * 左右两个面板（呼应 Scene 4）：
 *   左 · MESSAGES 消息列表   角色卡 + 顶部工具 badge（current_time / calculator）
 *   右 · request.json        同一份请求的结构化形式 —— 多出 messages 里没有的 `tools` 块
 *
 * 例子（playground 同款）：「今天的年月日相乘是多少？」
 *   思考→调 current_time→观察→思考→调 calculator(年×月×日)→观察→终答。
 * 一根消息列表一边长一边「转两圈」，把「重复直到不再有 tool_call」演具体；
 * Scene 6（Manim）再把它抽象成一个环。镜头内无渐变转场；1.5s 静止尾帧。
 */

const TAIL = 45;
const ANIM = 520;
export const SCENE5_DURATION = ANIM + TAIL;

const CODE_BG = "oklch(0.99 0 0)";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SOFT = Easing.out(Easing.cubic);
const ease = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { easing: SOFT, ...CLAMP });
const bump = (f: number, c: number, w = 18) => {
  const x = interpolate(f, [c - w, c, c + w], [0, 1, 0], CLAMP);
  return x * x * (3 - 2 * x);
};
const useJelly = (f: number, delay: number) =>
  useAuthorSpring(f - delay, { damping: 11, stiffness: 150, mass: 0.8 });

// ── beats (author 30fps space) ───────────────────────────────────────────
const A_SYS = 8;
const A_USER = 56;
const B_TOOLS = 110; // tools 一开始就在，旁白讲到时轻脉冲
const A_C1 = 150; // round 1 · assistant → current_time
const A_T1 = 224; // round 1 · tool result
const A_C2 = 300; // round 2 · assistant → calculator
const A_T2 = 374; // round 2 · tool result
const A_FINAL = 446;

// ── layout ─────────────────────────────────────────────────────────────
const CHAT_W = 372;
const LEFT_W = 460;
const JSON_W = 700;
const GAP_COL = 36;
const GAP = 13;
// 固定面板高度 → 三栏各自垂直居中、内容增删不再把彼此挤动
const CHAT_CARD_H = 452;
const MSG_H = 884;
const JSON_H = 604;

// ── conversation (left cards) ────────────────────────────────────────────
interface Row {
  role: Segment;
  caption: string;
  appear: number;
  h: number;
  text?: string;
  think?: string; // ReAct 的 Reason —— 调用前的一行轻思考
  call?: string; // function-call signature → accent chip
  mono?: boolean;
}
const ROWS: Row[] = [
  { role: "system", caption: "system", appear: A_SYS, h: 84, text: "遇到计算请优先调用工具" },
  { role: "user", caption: "user", appear: A_USER, h: 84, text: "今天的年月日相乘是多少？" },
  { role: "assistant", caption: "assistant · tool_call", appear: A_C1, h: 122, think: "不知道今天几号，先查时间", call: "current_time()" },
  { role: "tool", caption: "tool", appear: A_T1, h: 80, text: "2026-06-01T03:59+08:00", mono: true },
  { role: "assistant", caption: "assistant · tool_call", appear: A_C2, h: 122, think: "知道今天了，年×月×日交给计算器", call: 'calculator("2026 * 6 * 1")' },
  { role: "tool", caption: "tool", appear: A_T2, h: 80, text: "12156", mono: true },
  { role: "assistant", caption: "assistant", appear: A_FINAL, h: 96, text: "今天是 2026-06-01，年 × 月 × 日 = 12156。" },
];

const RoleCaption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: font.mono, fontSize: 14, letterSpacing: "0.07em", textTransform: "uppercase", color: color.muted }}>
    {children}
  </div>
);

// ── LEFT · message card — grows open + jelly托起 ──────────────────────────
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
          gap: 6,
          padding: "0 22px",
          borderRadius: 16,
          background: tint(c, 15),
        }}
      >
        <span style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 4, borderRadius: 999, background: c, opacity: 0.4 }} />
        <RoleCaption>{row.caption}</RoleCaption>
        {row.think && (
          <div style={{ fontFamily: font.sans, fontWeight: weight.token, fontSize: 15, fontStyle: "italic", color: color.muted, lineHeight: 1.15 }}>
            {row.think}
          </div>
        )}
        {row.call ? (
          <span
            style={{
              alignSelf: "flex-start",
              fontFamily: font.mono,
              fontSize: 18,
              fontWeight: 700,
              color: color.accent,
              background: tint(color.accent, 16),
              padding: "4px 12px",
              borderRadius: 9,
            }}
          >
            {row.call}
          </span>
        ) : (
          <div style={{ fontFamily: row.mono ? font.mono : font.sans, fontWeight: weight.token, fontSize: row.mono ? 19 : 21, color: color.ink, lineHeight: 1.15 }}>
            {row.text}
          </div>
        )}
      </div>
    </div>
  );
};

// 顶部工具 badge —— 两个工具都在，和右侧 JSON 的 tools 块同步脉冲
const ToolPill: React.FC<{ f: number; name: string }> = ({ f, name }) => {
  const c = segmentColor.tools_schema;
  const j = useJelly(f, A_SYS);
  const hot = bump(f, B_TOOLS);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 13px",
        borderRadius: 999,
        background: tint(c, 16 + hot * 28),
        opacity: Math.min(1, Math.max(0, j)),
        transform: `scale(${interpolate(j, [0, 1], [0.9, 1])})`,
        fontFamily: font.mono,
        fontSize: 18,
        fontWeight: 700,
        color: c,
      }}
    >
      {name}
    </span>
  );
};

export const MessagesPanel: React.FC<{ f: number; hideTitle?: boolean }> = ({ f, hideTitle }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, width: LEFT_W }}>
    {!hideTitle && (
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingLeft: 6 }}>
        <span style={{ fontFamily: font.display, fontSize: 22, letterSpacing: "0.16em", textTransform: "uppercase", color: color.inkSoft }}>
          Messages
        </span>
        <span style={{ fontFamily: font.sans, fontWeight: weight.sans, fontSize: 18, color: color.muted }}>消息列表</span>
      </div>
    )}
    <div style={{ height: MSG_H, overflow: "hidden", padding: "22px 26px 26px", borderRadius: 24, background: CODE_BG, boxShadow: "0 18px 50px rgba(0,0,0,0.07)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontFamily: font.mono, fontSize: 13, letterSpacing: "0.09em", textTransform: "uppercase", color: color.muted }}>tools</span>
        <ToolPill f={f} name="current_time" />
        <ToolPill f={f} name="calculator" />
      </div>
      {ROWS.map((r, i) => (
        <Card key={i} f={f} row={r} index={i} />
      ))}
    </div>
  </div>
);

// ── RIGHT · request.json — messages + (额外) tools, 逐行错峰弹入 ───────────
const LH = 23;
const FS = 13;
const PAD_TOP = 14;

type Grp = "struct" | "sys" | "user" | "c1" | "t1" | "c2" | "t2" | "final" | "tools";
const GRP: Record<Grp, { appear: number; hl: number | null; seg?: Segment }> = {
  struct: { appear: A_SYS, hl: null },
  sys: { appear: A_SYS, hl: null, seg: "system" },
  user: { appear: A_USER, hl: null, seg: "user" },
  c1: { appear: A_C1, hl: null, seg: "assistant" },
  t1: { appear: A_T1, hl: null, seg: "tool" },
  c2: { appear: A_C2, hl: null, seg: "assistant" },
  t2: { appear: A_T2, hl: null, seg: "tool" },
  final: { appear: A_FINAL, hl: null, seg: "assistant" },
  tools: { appear: A_SYS, hl: B_TOOLS, seg: "tools_schema" },
};

interface JLine {
  t: string;
  grp: Grp;
  s?: number;
}
const LINES: JLine[] = [
  { t: "{", grp: "struct" },
  { t: '  "messages": [', grp: "struct" },
  { t: '    { "role": "system", "content": "遇到计算请优先调用工具" },', grp: "sys" },
  { t: '    { "role": "user", "content": "今天的年月日相乘是多少？" },', grp: "user" },
  { t: '    { "role": "assistant", "content": "不知道今天几号，先查时间", "tool_calls": [', grp: "c1", s: 0 },
  { t: '      { "id": "c1", "type": "function",', grp: "c1", s: 1 },
  { t: '        "function": { "name": "current_time", "arguments": "{}" } } ] },', grp: "c1", s: 2 },
  { t: '    { "role": "tool", "tool_call_id": "c1", "content": "2026-06-01T03:59+08:00" },', grp: "t1" },
  { t: '    { "role": "assistant", "content": "知道今天了，年×月×日交给计算器", "tool_calls": [', grp: "c2", s: 0 },
  { t: '      { "id": "c2", "type": "function", "function": {', grp: "c2", s: 1 },
  { t: '        "name": "calculator", "arguments": "{\\"expression\\":\\"2026 * 6 * 1\\"}" } } ] },', grp: "c2", s: 2 },
  { t: '    { "role": "tool", "tool_call_id": "c2", "content": "12156" },', grp: "t2" },
  { t: '    { "role": "assistant", "content": "今天是 2026-06-01，年 × 月 × 日 = 12156。" }', grp: "final" },
  { t: "  ],", grp: "struct" },
  { t: '  "tools": [', grp: "tools", s: 0 },
  { t: '    { "type": "function", "function": { "name": "current_time",', grp: "tools", s: 1 },
  { t: '      "description": "获取当前时间", "parameters": {} } },', grp: "tools", s: 2 },
  { t: '    { "type": "function", "function": { "name": "calculator",', grp: "tools", s: 3 },
  { t: '      "description": "计算算术表达式", "parameters": { "type": "object",', grp: "tools", s: 4 },
  { t: '        "properties": { "expression": { "type": "string" } },', grp: "tools", s: 5 },
  { t: '        "required": ["expression"] } } }', grp: "tools", s: 6 },
  { t: "  ]", grp: "tools", s: 7 },
  { t: "}", grp: "struct" },
];

const JRow: React.FC<{ f: number; ln: JLine }> = ({ f, ln }) => {
  const g = GRP[ln.grp];
  const delay = g.appear + (ln.s ?? 0) * 3;
  const grow = ease(f, g.appear, g.appear + 13);
  const j = useJelly(f, delay);
  const hot = g.hl != null ? bump(f, g.hl) : 0;
  const seg = g.seg ? segmentColor[g.seg] : undefined;
  return (
    <div
      style={{
        position: "relative",
        height: LH * grow,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        background: seg ? tint(seg, 10 + hot * 22) : "transparent",
      }}
    >
      {seg && <span style={{ position: "absolute", left: 0, top: 3, bottom: 3, width: 3, background: seg, opacity: 0.18 + 0.7 * hot }} />}
      <span
        style={{
          paddingLeft: 22,
          fontFamily: font.mono,
          fontSize: FS,
          lineHeight: 1.6,
          color: color.ink,
          whiteSpace: "pre",
          opacity: Math.min(1, Math.max(0, j)),
          transform: `translateX(${interpolate(j, [0, 1], [16, 0])}px)`,
        }}
      >
        {ln.t || " "}
      </span>
    </div>
  );
};

export const JsonPanel: React.FC<{ f: number; hideTitle?: boolean }> = ({ f, hideTitle }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, width: JSON_W }}>
    {!hideTitle && (
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingLeft: 6 }}>
        <span style={{ fontFamily: font.display, fontSize: 22, letterSpacing: "0.16em", textTransform: "uppercase", color: color.muted }}>
          request
        </span>
        <span style={{ fontFamily: font.sans, fontWeight: weight.sans, fontSize: 18, color: color.inkSoft }}>发给模型的完整请求 · JSON</span>
      </div>
    )}
    <div style={{ height: JSON_H, borderRadius: 18, background: CODE_BG, boxShadow: "0 18px 50px rgba(0,0,0,0.07)", overflow: "hidden" }}>
      <div style={{ position: "relative", height: 44, display: "flex", alignItems: "center", gap: 9, padding: "0 16px", background: color.paper3 }}>
        {[color.danger, color.warning, color.success].map((c, i) => (
          <span key={i} style={{ width: 12, height: 12, borderRadius: 999, background: c }} />
        ))}
        <div style={{ position: "absolute", left: 0, right: 0, textAlign: "center", fontFamily: font.mono, fontSize: 18, color: color.muted }}>
          request.json
        </div>
      </div>
      <div style={{ padding: `${PAD_TOP}px 0` }}>
        {LINES.map((ln, i) => (
          <JRow key={i} f={f} ln={ln} />
        ))}
      </div>
    </div>
  </div>
);

// ── far-left · Chat UI（博客 HF 风）——工具调用展开 → 出结果 → 下一轮时收起 ─────────
const IOBox: React.FC<{ label: string; text: string }> = ({ label, text }) => (
  <div>
    <div style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: color.muted, marginBottom: 3 }}>{label}</div>
    <div style={{ background: color.paper2, borderRadius: 8, padding: "6px 10px", fontFamily: font.mono, fontSize: 14, color: color.inkSoft, whiteSpace: "pre-wrap" }}>{text}</div>
  </div>
);

// 一轮工具调用：start 展开（显示 Input）→ outAt 同步显示 Output → end（下一轮/终答）**折叠**
// （不是隐藏，收成一行 “▸ Called tool name” 摘要，保留在对话里）。
const CallBlock: React.FC<{
  f: number; name: string; think: string; input: string; output: string; start: number; outAt: number; end: number;
}> = ({ f, name, think, input, output, start, outAt, end }) => {
  const HC = 28; // 折叠后只剩摘要行
  const H1 = 132; // 展开·仅 Input
  const H2 = 190; // 展开·Input+Output
  const h = interpolate(f, [start, start + 12, outAt, outAt + 12, end - 12, end], [0, H1, H1, H2, H2, HC], CLAMP);
  const op = interpolate(f, [start, start + 8], [0, 1], CLAMP); // 出现后保持（折叠不消失）
  const open = interpolate(f, [end - 12, end], [1, 0], CLAMP); // 本轮内展开、之后折叠
  const showOut = f >= outAt;
  return (
    <div style={{ height: h, opacity: op, overflow: "hidden" }}>
      {/* 摘要行：caret + Called tool name（始终在） */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: HC }}>
        <span style={{ width: 0, height: 0, borderLeft: `7px solid ${color.muted}`, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", transform: `rotate(${open * 90}deg)`, opacity: 0.55, flex: "none" }} />
        <span style={{ fontFamily: font.sans, fontWeight: weight.token, fontSize: 15, color: color.muted }}>
          Called tool <span style={{ fontFamily: font.mono, fontWeight: 700, color: color.accent }}>{name}</span>
        </span>
      </div>
      {/* 详情：think + Input + Output（展开时显示，折叠时被裁掉） */}
      <div style={{ paddingLeft: 15, display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ fontFamily: font.sans, fontWeight: weight.token, fontSize: 15, fontStyle: "italic", color: color.muted }}>{think}</div>
        <IOBox label="Input" text={input} />
        {showOut && <IOBox label="Output" text={output} />}
      </div>
    </div>
  );
};

export const ChatPanel: React.FC<{ f: number; hideTitle?: boolean; sysText?: string }> = ({ f, hideTitle, sysText = "遇到计算请优先调用工具" }) => {
  const sysO = ease(f, A_SYS, A_SYS + 10);
  const userJ = useJelly(f, A_USER);
  const finalH = interpolate(f, [A_FINAL, A_FINAL + 12], [0, 66], CLAMP);
  const finalO = ease(f, A_FINAL, A_FINAL + 12);
  return (
    <div style={{ width: CHAT_W }}>
      {!hideTitle && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
          <span style={{ fontFamily: font.display, fontSize: 22, letterSpacing: "0.16em", textTransform: "uppercase", color: color.inkSoft }}>Chat</span>
          <span style={{ fontFamily: font.sans, fontWeight: weight.sans, fontSize: 18, color: color.muted }}>聊天界面</span>
        </div>
      )}
      <div style={{ height: CHAT_CARD_H, overflow: "hidden", background: CODE_BG, borderRadius: 18, padding: "20px 18px", boxShadow: "0 18px 50px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* system */}
        <div style={{ opacity: sysO }}>
          <div style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: color.muted, marginBottom: 3 }}>System</div>
          <div style={{ fontFamily: font.sans, fontWeight: weight.token, fontSize: 16, color: color.inkSoft }}>{sysText}</div>
        </div>
        {/* user bubble（靠右） */}
        <div style={{ display: "flex", justifyContent: "flex-end", opacity: Math.max(0, userJ), transform: `translateY(${interpolate(userJ, [0, 1], [14, 0])}px)` }}>
          <div style={{ maxWidth: "86%", background: color.paper2, borderRadius: 16, padding: "9px 14px", fontFamily: font.sans, fontWeight: weight.token, fontSize: 17, color: color.ink }}>今天的年月日相乘是多少？</div>
        </div>
        {/* 工具调用：同一时间只显示当前一轮，下一轮/终答时上一轮收起隐藏 */}
        <CallBlock f={f} name="current_time" think="不知道今天几号，先查时间" input="{}" output="2026-06-01T03:59+08:00" start={A_C1} outAt={A_T1} end={A_C2} />
        <CallBlock f={f} name="calculator" think="知道今天了，年×月×日交给计算器" input={'{ "expression": "2026 * 6 * 1" }'} output="12156" start={A_C2} outAt={A_T2} end={A_FINAL} />
        {/* 终答（此时所有工具调用过程已隐藏） */}
        <div style={{ height: finalH, opacity: finalO, overflow: "hidden", fontFamily: font.sans, fontWeight: weight.token, fontSize: 17, color: color.ink, lineHeight: 1.4 }}>
          今天是 2026-06-01，年 × 月 × 日 = 12156。
        </div>
      </div>
    </div>
  );
};

const Scene5Body: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 40px" }}>
    <div style={{ display: "flex", alignItems: "flex-start", gap: GAP_COL }}>
      <ChatPanel f={f} />
      <MessagesPanel f={f} />
      <JsonPanel f={f} />
    </div>
  </AbsoluteFill>
);

export const Scene5ToolCalls: React.FC = () => {
  const f = useAuthorFrame(ANIM - 1);
  return (
    <Frame>
      <Scene5Body f={f} />
    </Frame>
  );
};
