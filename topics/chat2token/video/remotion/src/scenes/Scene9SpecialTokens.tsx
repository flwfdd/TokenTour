import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { Frame } from "../components/Frame";
import { TemplateText } from "../components/TemplateText";
import { color, font, weight, segmentColor, tint, type Segment } from "../lib/theme";
import { useAuthorFrame } from "../lib/fps";
import type { TSpan } from "../data/chatTemplates";

/**
 * Scene 9 · 特殊 Token & 思考开关
 *
 * 同一段 Qwen3 纯文本上做高亮（playground 着色）：
 *   ① 送进去的（muted 底）：到 <think> 为止，旁白点名 → 系统/用户/assistant/<think> 依次脉冲
 *   ② 模型吐的（generation 绿底）：思考 + 回答 + <|im_end|>（强脉冲＝系统检测到→停）
 *   ③ 硬接下去（danger 红底）：续出 <|im_start|>user
 *   右侧思考开关：硬约束（空 <think></think>）vs 软约束（Reasoning: medium）
 * 1.5s 静止尾帧。
 */

const TAIL = 45;
const ANIM = 820;
export const SCENE9_DURATION = ANIM + TAIL;

const CODE_BG = "oklch(0.99 0 0)";
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SOFT = Easing.out(Easing.cubic);
const ease = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { easing: SOFT, ...CLAMP });
const bump = (f: number, c: number, w = 30) => {
  const x = interpolate(f, [c - w, c, c + w], [0, 1, 0], CLAMP);
  return x * x * (3 - 2 * x);
};

// ── beats (author 30fps) ─────────────────────────────────────────────────
const HL_SYS = 150;
const HL_USER = 220;
const HL_THINK = 300;
const B_OUT = 370; // model-output zone fades in
const HL_IMEND = 520; // <|im_end|> stop pulse
const B_CONT = 600; // forced continuation appears
const B_SWITCH = 690; // thinking-switch compare appears

// ── hand-authored Qwen spans with highlight tags ─────────────────────────
const sp = (t: string, seg: Segment, special?: boolean, tag?: string): TSpan => ({ t, seg, sp: special, tag });

const INPUT: TSpan[] = [
  sp("<|im_start|>", "system", true, "ims"),
  sp("system\n", "system", false, "sys"),
  sp("你是一只哈基米", "system", false, "sys"),
  sp("<|im_end|>", "system", true, "ime"),
  sp("\n", "system"),
  sp("<|im_start|>", "user", true, "ims"),
  sp("user\n", "user", false, "user"),
  sp("你是谁？", "user", false, "user"),
  sp("<|im_end|>", "user", true, "ime"),
  sp("\n", "user"),
  sp("<|im_start|>", "assistant", true, "ims"),
  sp("assistant\n", "assistant", false, "asst"),
  sp("<think>", "assistant", false, "think"),
];

const OUTPUT: TSpan[] = [
  sp("\n我想哈用户，但还是忍一下吧。\n", "assistant"),
  sp("</think>", "assistant", false, "think"),
  sp("\n\n我是哈基米，喵～", "assistant"),
  sp("<|im_end|>", "assistant", true, "stop"),
];

const CONT: TSpan[] = [sp("\n<|im_start|>user", "danger", true, "cont")];

// 把若干 span 拆成「字符级 + 出现帧」用于 stream（special / </think> 整块出现）
const CHAR_STEP = 4;
interface RSpan { sp: TSpan; beat: number; }
const streamSpans = (spans: TSpan[], start: number, step: number): RSpan[] => {
  const out: RSpan[] = [];
  let k = 0;
  for (const s of spans) {
    if (s.sp || s.t.includes("think>")) {
      out.push({ sp: s, beat: start + k * step });
      k += 2;
    } else {
      for (const ch of Array.from(s.t)) {
        out.push({ sp: { t: ch, seg: s.seg, tag: s.tag }, beat: start + k * step });
        k += 1;
      }
    }
  }
  return out;
};

// ── thinking-switch mini compares ────────────────────────────────────────
const HARD: TSpan[] = [
  sp("<|im_start|>", "assistant", true),
  sp("assistant\n", "assistant"),
  sp("<think>", "assistant", false, "empty"),
  sp("\n\n", "assistant", false, "empty"),
  sp("</think>", "assistant", false, "empty"),
];
const SOFT_SPANS: TSpan[] = [sp("Reasoning: medium", "system", false, "soft")];

// 一段「区」——无独立圆角，紧贴堆叠在同一面板里，读起来是一整段连续文本
const Region: React.FC<{ bg: string; label: string; labelColor: string; children: React.ReactNode; o?: number }> = ({ bg, label, labelColor, children, o = 1 }) => (
  <div style={{ position: "relative", background: bg, padding: "16px 20px", opacity: o }}>
    <div style={{ position: "absolute", top: 10, right: 16, fontFamily: font.sans, fontWeight: weight.sans, fontSize: 15, color: labelColor }}>{label}</div>
    {children}
  </div>
);

const OUT_STREAM = streamSpans(OUTPUT, B_OUT, CHAR_STEP);

const Scene9Body: React.FC<{ f: number }> = ({ f }) => {
  const hotInput = (s: TSpan) => {
    let h = 0;
    if (s.tag === "sys" || (s.tag === "ims" && false)) h = Math.max(h, bump(f, HL_SYS));
    if (s.tag === "user") h = Math.max(h, bump(f, HL_USER));
    if (s.tag === "think") h = Math.max(h, bump(f, HL_THINK));
    return h;
  };
  const outO = ease(f, B_OUT, B_OUT + 16);
  const hotOut = (s: TSpan) => (s.tag === "stop" ? bump(f, HL_IMEND, 26) : 0);
  const contO = ease(f, B_CONT, B_CONT + 20);
  const switchO = ease(f, B_SWITCH, B_SWITCH + 24);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 64px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 56 }}>
        {/* left · 三段连在一起的同一段 Qwen 文本（输入 → 输出 → 续写） */}
        <div style={{ width: 920, borderRadius: 18, background: CODE_BG, boxShadow: "0 18px 50px rgba(0,0,0,0.07)", overflow: "hidden" }}>
          <Region bg={CODE_BG} label="模型输入" labelColor={color.muted}>
            <TemplateText spans={INPUT} fontSize={23} lineHeight={1.7} hotOf={hotInput} />
          </Region>
          <Region bg={tint(segmentColor.generation, 9)} label="模型输出" labelColor={segmentColor.generation} o={outO}>
            <TemplateText spans={OUT_STREAM.map((r) => r.sp)} fontSize={23} lineHeight={1.7} opacityOf={(i) => ease(f, OUT_STREAM[i].beat, OUT_STREAM[i].beat + 8)} hotOf={hotOut} />
          </Region>
          <Region bg={tint(color.danger, 9)} label="继续生成" labelColor={color.danger} o={contO}>
            <TemplateText spans={CONT} fontSize={23} lineHeight={1.7} hotOf={() => bump(f, B_CONT + 30, 40)} />
          </Region>
        </div>

        {/* right · thinking switch（先软约束、再硬约束，对齐旁白顺序） */}
        <div style={{ width: 460, opacity: switchO, display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontFamily: font.display, fontSize: 22, letterSpacing: "0.12em", textTransform: "uppercase", color: color.muted }}>思考开关</div>
          <div style={{ background: CODE_BG, borderRadius: 14, padding: "16px 18px", boxShadow: "0 12px 34px rgba(0,0,0,0.06)" }}>
            <div style={{ fontFamily: font.sans, fontWeight: weight.sans, fontSize: 18, color: segmentColor.system, marginBottom: 8 }}>软约束 · 提示词引导</div>
            <TemplateText spans={SOFT_SPANS} fontSize={19} lineHeight={1.6} hotOf={(s) => (s.tag === "soft" ? bump(f, B_SWITCH + 60, 40) : 0)} />
          </div>
          <div style={{ background: CODE_BG, borderRadius: 14, padding: "16px 18px", boxShadow: "0 12px 34px rgba(0,0,0,0.06)" }}>
            <div style={{ fontFamily: font.sans, fontWeight: weight.sans, fontSize: 18, color: segmentColor.assistant, marginBottom: 8 }}>硬约束 · 塞空 think</div>
            <TemplateText spans={HARD} fontSize={19} lineHeight={1.6} hotOf={(s) => (s.tag === "empty" ? bump(f, B_SWITCH + 110, 40) : 0)} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Scene9SpecialTokens: React.FC = () => {
  const f = useAuthorFrame(ANIM - 1);
  return (
    <Frame>
      <Scene9Body f={f} />
    </Frame>
  );
};
