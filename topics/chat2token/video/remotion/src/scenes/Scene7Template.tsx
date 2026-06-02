import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { Frame } from "../components/Frame";
import { TemplateText } from "../components/TemplateText";
import { color, font, weight, segmentColor, tint, type Segment } from "../lib/theme";
import { useAuthorFrame, useAuthorSpring } from "../lib/fps";
import { TMPL_BASIC_QWEN, segmentTemplate, type TSpan } from "../data/chatTemplates";

/**
 * Scene 7 · Messages → 一长串纯文本（Chat Template）
 *
 * 和 playground LensChatTemplate 同款：左 messages 角色卡 → 右 chat template 纯文本，
 * 只有极小 eyebrow（messages / chat template），不放任何大标题/说明。右侧 token 逐个
 * 错峰浮现、按角色着色，特殊 token 角色色 + bold；旁白讲到「<|im_start|> 这样的标记」时
 * 所有特殊 token 同步轻脉冲。1.5s 静止尾帧。
 */

const TAIL = 45;
const ANIM = 780;
export const SCENE7_DURATION = ANIM + TAIL;

const CODE_BG = "oklch(0.99 0 0)";
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SOFT = Easing.out(Easing.cubic);
const ease = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { easing: SOFT, ...CLAMP });
const bump = (f: number, c: number, w = 26) => {
  const x = interpolate(f, [c - w, c, c + w], [0, 1, 0], CLAMP);
  return x * x * (3 - 2 * x);
};
const useJelly = (f: number, delay: number) =>
  useAuthorSpring(f - delay, { damping: 11, stiffness: 150, mass: 0.8 });

// ── beats (author 30fps) ─────────────────────────────────────────────────
const B_SYS = 8;
const B_USER = 44;
const B_TMPL1 = 110; // system 模板片段整块出现
const B_TMPL1U = 150; // user 模板片段整块出现（不 stream）
const B_OPEN = 250; // <|im_start|>assistant\n<think> 与左侧 assistant 卡「同步出现」
const B_STREAM = 332; // 停顿后，两边「同时 stream」模型输出
const CHAR_STEP = 4.5; // 每个输出字符的出现间隔（author frames）
const B_PULSE = 600; // “<|im_start|> 这样的标记” → pulse all specials

const LEFT_W = 500;
const RIGHT_W = 780;
const GAP_COL = 60;

const SPANS: TSpan[] = segmentTemplate(TMPL_BASIC_QWEN, "qwen");
// 「模型输入」= 送进模型、含生成提示 <|im_start|>assistant\n<think>，到第一个 <think> 为止；
// 其后（思考正文 + 回答 + <|im_end|>）才是「模型输出」。
const THINK_I = SPANS.findIndex((s) => s.t === "<think>");
const INPUT_END = THINK_I >= 0 ? THINK_I : SPANS.length - 1;

// 预先把模板拆成「渲染 span + 出现帧」：
//   · 输入段（system / user）错峰浮现；
//   · 生成提示 <|im_start|>assistant\n<think>（到 INPUT_END）一起出现；
//   · 模型输出按**字符**流式出现（special / </think> 整块），形成 stream 效果。
interface RSpan { sp: TSpan; beat: number; }
const RENDER: RSpan[] = (() => {
  const out: RSpan[] = [];
  let k = 0; // 输出区已铺字符数
  SPANS.forEach((s, i) => {
    if (i < INPUT_END - 2) {
      // system / user 消息整块出现，不做 stream
      out.push({ sp: s, beat: s.seg === "user" ? B_TMPL1U : B_TMPL1 });
    } else if (i <= INPUT_END) {
      out.push({ sp: s, beat: B_OPEN });
    } else if (s.sp || s.t.includes("think>")) {
      out.push({ sp: s, beat: B_STREAM + k * CHAR_STEP });
      k += 2;
    } else {
      for (const ch of Array.from(s.t)) {
        out.push({ sp: { t: ch, seg: s.seg, tag: s.tag }, beat: B_STREAM + k * CHAR_STEP });
        k += 1;
      }
    }
  });
  return out;
})();
// 左侧 assistant 卡的打字窗口（与右侧字符流同一时间轴）
const TW_THINK: [number, number] = [B_STREAM, B_STREAM + 16 * CHAR_STEP];
const TW_ANSWER: [number, number] = [B_STREAM + 18 * CHAR_STEP, B_STREAM + 28 * CHAR_STEP];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const typed = (f: number, text: string, [a, b]: [number, number]) =>
  text.slice(0, Math.round(clamp01((f - a) / (b - a)) * text.length));

// ── left · message cards ──────────────────────────────────────────────────
interface Msg {
  role: Segment;
  caption: string;
  appear: number;
  h: number;
  text?: string;
  think?: string;
}
const INPUT_MSGS: Msg[] = [
  { role: "system", caption: "system", appear: B_SYS, h: 78, text: "你是一只哈基米" },
  { role: "user", caption: "user", appear: B_USER, h: 78, text: "你是谁？" },
];
const ASSIST_THINK = "我想哈用户，但还是忍一下吧。";
const ASSIST_ANSWER = "我是哈基米，喵～";
const ASSIST_H = 132;

const RoleCaption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: font.mono, fontSize: 14, letterSpacing: "0.07em", textTransform: "uppercase", color: color.muted }}>
    {children}
  </div>
);

const MsgCard: React.FC<{ f: number; m: Msg; index: number }> = ({ f, m, index }) => {
  const c = segmentColor[m.role];
  const grow = ease(f, m.appear, m.appear + 13);
  const j = useJelly(f, m.appear);
  return (
    <div style={{ height: m.h * grow, marginTop: index === 0 ? 0 : 13 * grow, overflow: "hidden" }}>
      <div
        style={{
          position: "relative",
          height: m.h,
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
        <RoleCaption>{m.caption}</RoleCaption>
        {m.think && (
          <div style={{ fontFamily: font.sans, fontWeight: weight.token, fontSize: 18, fontStyle: "italic", color: color.muted, lineHeight: 1.15 }}>
            {m.think}
          </div>
        )}
        <div style={{ fontFamily: font.sans, fontWeight: weight.token, fontSize: 26, color: color.ink, lineHeight: 1.12 }}>{m.text}</div>
      </div>
    </div>
  );
};

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: font.mono, fontSize: 15, letterSpacing: "0.1em", textTransform: "uppercase", color: color.muted, marginBottom: 14 }}>
    {children}
  </div>
);

// 左侧 assistant 卡：shell 与 <|im_start|>assistant 同步出现，文字随右侧字符流同步打字
const StreamCard: React.FC<{ f: number }> = ({ f }) => {
  const c = segmentColor.assistant;
  const grow = ease(f, B_OPEN, B_OPEN + 13);
  const j = useJelly(f, B_OPEN);
  const think = typed(f, ASSIST_THINK, TW_THINK);
  const answer = typed(f, ASSIST_ANSWER, TW_ANSWER);
  const blinkOn = Math.floor(f / 8) % 2 === 0 ? 1 : 0;
  const thinkCur = f >= TW_THINK[0] && f < TW_THINK[1] ? blinkOn : 0;
  const ansCur = f >= TW_ANSWER[0] && f < TW_ANSWER[1] ? blinkOn : 0;
  return (
    <div style={{ height: ASSIST_H * grow, marginTop: 13 * grow, overflow: "hidden" }}>
      <div
        style={{
          position: "relative",
          height: ASSIST_H,
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
        <RoleCaption>assistant</RoleCaption>
        <div style={{ fontFamily: font.sans, fontWeight: weight.token, fontSize: 18, fontStyle: "italic", color: color.muted, lineHeight: 1.15, minHeight: 22 }}>
          {think}
          <span style={{ opacity: thinkCur, color: c }}>▌</span>
        </div>
        <div style={{ fontFamily: font.sans, fontWeight: weight.token, fontSize: 26, color: color.ink, lineHeight: 1.12 }}>
          {answer}
          <span style={{ opacity: ansCur, color: c }}>▌</span>
        </div>
      </div>
    </div>
  );
};

// 仅「chat template」右栏 —— 供 Scene 0 流水线单独复用（聚焦模板本身）
export const Scene7TemplatePanel: React.FC<{ f: number; hideTitle?: boolean }> = ({ f, hideTitle }) => {
  const pulse = bump(f, B_PULSE);
  const spans = RENDER.map((r) => r.sp);
  const opacityOf = (i: number) => ease(f, RENDER[i].beat, RENDER[i].beat + 8);
  const hotOf = (s: TSpan) => (s.sp ? pulse : 0);
  return (
    <div style={{ width: RIGHT_W }}>
      {!hideTitle && <Eyebrow>chat&nbsp;template</Eyebrow>}
      <div style={{ padding: "22px 26px", borderRadius: 18, background: CODE_BG, boxShadow: "0 18px 50px rgba(0,0,0,0.07)" }}>
        <TemplateText spans={spans} fontSize={22} lineHeight={1.7} opacityOf={opacityOf} hotOf={hotOf} />
      </div>
    </div>
  );
};

const Scene7Body: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 64px" }}>
    <div style={{ display: "flex", alignItems: "flex-start", gap: GAP_COL }}>
      <div style={{ width: LEFT_W }}>
        <Eyebrow>messages</Eyebrow>
        {INPUT_MSGS.map((m, i) => (
          <MsgCard key={i} f={f} m={m} index={i} />
        ))}
        <StreamCard f={f} />
      </div>
      <Scene7TemplatePanel f={f} />
    </div>
  </AbsoluteFill>
);

export const Scene7Template: React.FC = () => {
  const f = useAuthorFrame(ANIM - 1);
  return (
    <Frame>
      <Scene7Body f={f} />
    </Frame>
  );
};
