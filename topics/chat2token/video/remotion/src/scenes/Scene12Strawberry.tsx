import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { Frame } from "../components/Frame";
import { TokenChip } from "../components/TokenChip";
import { color, font, weight, segmentColor, tint } from "../lib/theme";
import { useAuthorFrame } from "../lib/fps";
import type { VToken } from "../data/tokens";

/**
 * Scene 12 · 为什么数不清 strawberry 的 r
 *
 * 顶部标 `GPT-OSS 分词器`。strawberry →（切）→ 三块 TokenChip（st/raw/berry，复用
 * Scene 10 同款视觉）→ 翻面变成三个真实 Token ID（302 / 1618 / 19772，GPT-OSS
 * o200k_harmony 实测）。字母消失，只剩冷冰冰编号——想数 r 的人一脸懵。1.5s 静止尾帧。
 */

const TAIL = 45;
const ANIM = 700;
export const SCENE12_DURATION = ANIM + TAIL;

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SOFT = Easing.out(Easing.cubic);
const ease = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { easing: SOFT, ...CLAMP });

// ── beats ────────────────────────────────────────────────────────────────
const B_WORD = 10;
const B_SPLIT = 130; // continuous → 3 chips
const B_FLIP = 330; // chips flip to IDs

const TOKENS: VToken[] = [{ text: "st" }, { text: "raw" }, { text: "berry" }];
const IDS = [302, 1618, 19772];
const FS = 84;
const GAP = 16;

const FlipChip: React.FC<{ token: VToken; id: number; split: number; flip: number }> = ({ token, id, split, flip }) => {
  const sx = Math.abs(Math.cos(flip * Math.PI)); // 1 → 0 → 1
  const showBack = flip >= 0.5;
  // 正面（TokenChip）始终占据布局，背面（ID）绝对定位居中覆盖 → 翻转时宽高都不变、不挤动邻居
  return (
    <span style={{ position: "relative", display: "inline-flex", transform: `scaleX(${sx})` }}>
      <span style={{ opacity: showBack ? 0 : 1 }}>
        <TokenChip token={token} segment="user" p={split} fontSize={FS} />
      </span>
      {/* 背面 ID 完全填满正面 TokenChip 的尺寸 → 高度/宽度一致、不缩小、不与邻居重叠 */}
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: FS * 0.2,
          background: tint(color.danger, 14),
          fontFamily: font.mono,
          fontSize: FS * 0.78,
          fontWeight: 700,
          color: color.danger,
          whiteSpace: "nowrap",
          opacity: showBack ? 1 : 0,
        }}
      >
        {id}
      </span>
    </span>
  );
};

const ROW_H = 150; // 固定行高 → 翻转切换前后正反面，上下文案不抖动

const Scene12Body: React.FC<{ f: number }> = ({ f }) => {
  const splitOf = (i: number) => ease(f, B_SPLIT + i * 22, B_SPLIT + i * 22 + 40);
  const flipOf = (i: number) => ease(f, B_FLIP + i * 30, B_FLIP + i * 30 + 36);
  const wordO = ease(f, B_WORD, B_WORD + 16);
  const qO = ease(f, 0, 14); // 问题从一开始就打出来

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 44 }}>
      <div style={{ fontFamily: font.serif, fontWeight: weight.serif, fontSize: 36, color: color.ink, opacity: qO }}>
        strawberry 里有几个 <span style={{ color: color.danger }}>r</span>？
      </div>

      <div style={{ fontFamily: font.mono, fontSize: 21, letterSpacing: "0.1em", color: color.muted, opacity: wordO }}>
        GPT-OSS 分词器
      </div>

      {/* 固定高度行：翻转时高度恒定，不带动上下文案 */}
      <div style={{ height: ROW_H, display: "flex", alignItems: "center", justifyContent: "center", opacity: wordO }}>
        {TOKENS.map((t, i) => (
          <span key={i} style={{ display: "inline-flex", marginLeft: i === 0 ? 0 : GAP * splitOf(i) }}>
            <FlipChip token={t} id={IDS[i]} split={splitOf(i)} flip={flipOf(i)} />
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const Scene12Strawberry: React.FC = () => {
  const f = useAuthorFrame(ANIM - 1);
  return (
    <Frame>
      <Scene12Body f={f} />
    </Frame>
  );
};
