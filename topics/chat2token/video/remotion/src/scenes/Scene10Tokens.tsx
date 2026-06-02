import React from "react";
import { AbsoluteFill, Easing, Freeze, Sequence, interpolate } from "remotion";
import { Frame, Badge } from "../components/Frame";
import { useAuthorFrame, useFpsScale } from "../lib/fps";
import { TokenStrip } from "../components/TokenStrip";
import { TokenChip } from "../components/TokenChip";
import { color, font, weight, tint } from "../lib/theme";
import {
  TOKENIZER_A,
  BEAT_A_SYSTEM,
  BEAT_A_USER,
  BEAT_A_ASSISTANT,
  QWEN_SPLIT,
  DEEPSEEK_SPLIT,
  TOKENIZER_C,
  HELLO_COLUMN,
  EMOJI,
  EMOJI_COLUMN,
} from "../data/tokens";

/**
 * Scene 10 · 纯文本 → Token 小块
 *
 *   Beat A  含特殊 token 的两轮对话，连续文本逐段切成 token（位移+变色同步）· Qwen3
 *   Beat B  同一句话：Qwen3 4 块 vs DeepSeek-V3 3 块
 *   Beat C  字符 → UTF-8 字节 → Token：常见词 vs 生僻字/Emoji · GPT-OSS
 *
 * Motion: a single per-token progress `p` drives each token's separation AND
 * its colour together (in lockstep, linear within the token). The ONLY
 * non-linearity is the *sequence* sweep — an ease-in-out front that starts
 * slow, peaks in the middle, eases out at the end.
 */

// Each beat is padded with a fully STATIC frame at the head and tail (no fade),
// so an editor has clean 1s / 1.5s handles to cut and add their own transitions.
const HEAD = 30; // 1.0s static intro (the beat's frame-0 state, held)
const TAIL = 45; // 1.5s static settled (the beat's final state, held)

// Pure animation length of each beat (frame 0 = the static intro state, the
// last frame = the settled state). Holds are added around this by HoldClip.
const A_ANIM = 188;
const B_ANIM = 150;
const C_ANIM = 165;

export const CLIP_A = HEAD + A_ANIM + TAIL;
export const CLIP_B = HEAD + B_ANIM + TAIL;
export const CLIP_C = HEAD + C_ANIM + TAIL;
export const SCENE10_DURATION = CLIP_A + CLIP_B + CLIP_C;

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SEQ_EASE = Easing.inOut(Easing.cubic); // 序列扫描：慢→快→慢
const SOFT = Easing.out(Easing.cubic);

/**
 * Per-token progress for an eased left→right sweep across `n` tokens between
 * frames [a, b]. The front position is ease-in-out (slow start, fast middle,
 * slow end); each token fills linearly over `feather` token-widths so its move
 * and colour stay synced.
 */
const useSweep = (n: number, a: number, b: number, feather = 2) => {
  const frame = useAuthorFrame();
  const front = interpolate(frame, [a, b], [0, n + feather], { easing: SEQ_EASE, ...CLAMP });
  return (i: number) => interpolate(front, [i, i + feather], [0, 1], CLAMP);
};

const ease = (frame: number, a: number, b: number, fn = SOFT) =>
  interpolate(frame, [a, b], [0, 1], { easing: fn, ...CLAMP });

/**
 * Wraps a beat with static head/tail holds: the beat's frame-0 state is frozen
 * for HEAD frames, then it animates for `anim` frames, then its final frame is
 * frozen for TAIL frames. No fades — boundary frames are perfectly still so
 * they double as editing handles.
 */
const HoldClip: React.FC<{ anim: number; children: React.ReactNode }> = ({ anim, children }) => {
  // Sequence/Freeze operate in REAL render frames, so scale the author-space
  // hold lengths up to the actual fps.
  const s = useFpsScale();
  const head = Math.round(HEAD * s);
  const a = Math.round(anim * s);
  const tail = Math.round(TAIL * s);
  return (
    <Frame>
      <Sequence durationInFrames={head}>
        <Freeze frame={0}>{children}</Freeze>
      </Sequence>
      <Sequence from={head} durationInFrames={a}>
        {children}
      </Sequence>
      <Sequence from={head + a} durationInFrames={tail}>
        <Freeze frame={a - 1}>{children}</Freeze>
      </Sequence>
    </Frame>
  );
};

// Standalone, edit-ready clips (registered as their own compositions).
export const Clip10A: React.FC = () => <HoldClip anim={A_ANIM}><BeatReveal /></HoldClip>;
export const Clip10B: React.FC = () => <HoldClip anim={B_ANIM}><BeatCompare /></HoldClip>;
export const Clip10C: React.FC = () => <HoldClip anim={C_ANIM}><BeatGranularity /></HoldClip>;

/** Review master: the three hold-padded clips back to back, with a gentle fade
 * only at the very start/end of the whole piece. */
export const Scene10Tokens: React.FC = () => {
  const f = useAuthorFrame();
  const s = useFpsScale();
  const edge = interpolate(f, [0, 12, SCENE10_DURATION - 12, SCENE10_DURATION], [0, 1, 1, 0], {
    easing: Easing.inOut(Easing.ease),
    ...CLAMP,
  });
  const a = Math.round(CLIP_A * s);
  const b = Math.round(CLIP_B * s);
  const c = Math.round(CLIP_C * s);
  return (
    <AbsoluteFill style={{ opacity: edge }}>
      <Sequence durationInFrames={a}>
        <Clip10A />
      </Sequence>
      <Sequence from={a} durationInFrames={b}>
        <Clip10B />
      </Sequence>
      <Sequence from={a + b} durationInFrames={c}>
        <Clip10C />
      </Sequence>
    </AbsoluteFill>
  );
};

// ── shared bits ──────────────────────────────────────────────────────

const Center: React.FC<{ children: React.ReactNode; gap?: number }> = ({ children, gap = 56 }) => (
  <AbsoluteFill
    style={{
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      gap,
      padding: "0 120px",
    }}
  >
    {children}
  </AbsoluteFill>
);

const Count: React.FC<{ children?: string }> = ({ children }) =>
  children ? (
    <div style={{ fontFamily: font.mono, fontSize: 26, color: color.muted }}>{children}</div>
  ) : null;

const Annot: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{ fontFamily: font.mono, fontSize: 22, color: color.muted, letterSpacing: "0.04em", ...style }}
  >
    {children}
  </div>
);

// ── Beat A · continuous text split into tokens (one eased sweep) ─────

const BeatReveal: React.FC = () => {
  const frame = useAuthorFrame();
  const nSys = BEAT_A_SYSTEM.length;
  const nUser = BEAT_A_USER.length;
  const n = nSys + nUser + BEAT_A_ASSISTANT.length;
  const sweep = useSweep(n, 16, 158);
  const annot = ease(frame, 158, 182);
  return (
    <Center gap={30}>
      <TokenStrip tokens={BEAT_A_SYSTEM} segment="system" p={(i) => sweep(i)} fontSize={42} gap={11} />
      <TokenStrip tokens={BEAT_A_USER} p={(i) => sweep(i + nSys)} fontSize={42} gap={11} />
      <TokenStrip tokens={BEAT_A_ASSISTANT} p={(i) => sweep(i + nSys + nUser)} fontSize={42} gap={11} />
      <Annot style={{ opacity: annot }}>{TOKENIZER_A} 分词器 · {n} Tokens</Annot>
    </Center>
  );
};

// ── Beat B · same sentence, two tokenizers ───────────────────────────

const CompareRow: React.FC<{
  label: string;
  labelBg: string;
  labelFg: string;
  count: string;
  tokens: typeof QWEN_SPLIT;
  a: number;
  b: number;
}> = ({ label, labelBg, labelFg, count, tokens, a, b }) => {
  const frame = useAuthorFrame();
  const sweep = useSweep(tokens.length, a, b);
  const countOpacity = ease(frame, b, b + 18);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 44 }}>
      <div style={{ width: 320, display: "flex", justifyContent: "flex-end" }}>
        <Badge bg={labelBg} fg={labelFg}>{label}</Badge>
      </div>
      <div style={{ width: 760, display: "flex", justifyContent: "flex-start" }}>
        <TokenStrip tokens={tokens} segment="user" p={(i) => sweep(i)} fontSize={60} gap={16} />
      </div>
      <div style={{ width: 180, opacity: countOpacity }}>
        <Count>{count}</Count>
      </div>
    </div>
  );
};

const BeatCompare: React.FC = () => (
  <Center gap={60}>
    <CompareRow
      label="Qwen3"
      labelBg={tint(color.primary, 16)}
      labelFg={color.primaryEdge}
      count="4 Tokens"
      tokens={QWEN_SPLIT}
      a={18}
      b={92}
    />
    <CompareRow
      label="DeepSeek-V3"
      labelBg={tint(color.accent, 18)}
      labelFg={color.accentEdge}
      count="3 Tokens"
      tokens={DEEPSEEK_SPLIT}
      a={50}
      b={120}
    />
  </Center>
);

// ── Beat C · 字符 → UTF-8 字节 → Token (two labelled columns) ─────────

// 标题头：得意黑分类词 → 彩色结论（常见词 → 单个 Token / 生僻字·中文·Emoji → 多个 Token）
const ColHeader: React.FC<{ cat: string; punch: string; tone: string; opacity: number }> = ({
  cat,
  punch,
  tone,
  opacity,
}) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, opacity }}>
    <span style={{ fontFamily: font.display, fontSize: 36, color: color.ink, letterSpacing: "0.01em" }}>
      {cat}
    </span>
    <span style={{ fontFamily: font.sans, fontWeight: weight.sans, fontSize: 32, color: tone }}>→</span>
    <span style={{ fontFamily: font.display, fontSize: 36, color: tone, letterSpacing: "0.01em" }}>
      {punch}
    </span>
  </div>
);

const RowLabel: React.FC<{ children: React.ReactNode; opacity: number }> = ({ children, opacity }) => (
  <div
    style={{
      fontFamily: font.sans,
      fontWeight: weight.sans,
      fontSize: 23,
      color: color.inkSoft,
      textAlign: "right",
      paddingRight: 8,
      opacity,
    }}
  >
    {children}
  </div>
);

const Cell: React.FC<{ count: string; opacity: number; children: React.ReactNode }> = ({
  count,
  opacity,
  children,
}) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, opacity }}>
    <div style={{ minHeight: 76, display: "flex", alignItems: "center" }}>{children}</div>
    <Count>{count}</Count>
  </div>
);

const PlainText: React.FC<{ children: string; mono?: boolean; fontSize?: number }> = ({
  children,
  mono,
  fontSize = 46,
}) => (
  <span style={{ fontFamily: mono ? font.mono : font.sans, fontWeight: weight.token, fontSize, color: color.ink }}>
    {children}
  </span>
);

const BeatGranularity: React.FC = () => {
  const frame = useAuthorFrame();
  // Whole rows fade in by stage (no per-token reveal — tokens are shown formed).
  const stage = (s: number) => ease(frame, 16 + s * 30, 16 + s * 30 + 18);
  const annot = ease(frame, 16 + 4 * 30, 16 + 4 * 30 + 18);

  return (
    <Center gap={44}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "190px 1fr 1fr",
          columnGap: 48,
          rowGap: 52,
          alignItems: "center",
        }}
      >
        {/* header (得意黑 + 彩色结论) */}
        <div />
        <ColHeader cat="常见词" punch="单个 Token" tone={color.primaryEdge} opacity={stage(0)} />
        <ColHeader cat="生僻字·中文·Emoji" punch="多个 Token" tone={color.danger} opacity={stage(0)} />

        {/* 原文本 */}
        <RowLabel opacity={stage(1)}>原文本</RowLabel>
        <Cell count={HELLO_COLUMN.charCount} opacity={stage(1)}>
          <PlainText mono fontSize={48}>{HELLO_COLUMN.text}</PlainText>
        </Cell>
        <Cell count={EMOJI_COLUMN.charCount} opacity={stage(1)}>
          <span style={{ fontSize: 64, lineHeight: 1 }}>{EMOJI}</span>
        </Cell>

        {/* UTF-8 编码 */}
        <RowLabel opacity={stage(2)}>UTF-8 编码</RowLabel>
        <Cell count={HELLO_COLUMN.byteCount} opacity={stage(2)}>
          <TokenStrip tokens={HELLO_COLUMN.bytes} segment="user" fontSize={32} gap={10} />
        </Cell>
        <Cell count={EMOJI_COLUMN.byteCount} opacity={stage(2)}>
          <TokenStrip tokens={EMOJI_COLUMN.bytes} segment="danger" fontSize={32} gap={10} />
        </Cell>

        {/* Token */}
        <RowLabel opacity={stage(3)}>Token</RowLabel>
        <Cell count={HELLO_COLUMN.tokenCount} opacity={stage(3)}>
          <TokenChip token={HELLO_COLUMN.tokens[0]} segment="user" fontSize={44} />
        </Cell>
        <Cell count={EMOJI_COLUMN.tokenCount} opacity={stage(3)}>
          <TokenStrip tokens={EMOJI_COLUMN.tokens} segment="danger" fontSize={34} gap={12} />
        </Cell>

        {/* tokenizer label — centred under the two data columns, not the screen */}
        <div />
        <div style={{ gridColumn: "2 / 4", display: "flex", justifyContent: "center", opacity: annot }}>
          <Annot>{TOKENIZER_C} 分词器</Annot>
        </div>
      </div>
    </Center>
  );
};
