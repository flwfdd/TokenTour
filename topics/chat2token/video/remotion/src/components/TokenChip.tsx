import React from "react";
import { color, font, weight, segmentColor, tint, showWhitespace, TINT_REST, type Segment } from "../lib/theme";
import type { VToken } from "../data/tokens";

/**
 * One token, painted exactly like the playground chip
 * (app/visual.ts → roleSurfaceStyle): faint role tint (15% at rest), special
 * tokens in the role hue + bold, everything else ink.
 *
 * A SINGLE progress `p` (0→1) drives the whole 连续→离散 transition for this
 * token, so its separation (padding/gap/rounding) and its colour (tint + special
 * hue) move in lockstep — never out of sync. No scale: the glyph size is
 * constant. No vertical motion: chip height + baseline are constant (padY is
 * fixed; tint is just invisible at p=0).
 *
 * Per-token motion is intentionally linear — the only non-linearity lives in
 * how the parent schedules `p` across the sequence.
 */
export const TokenChip: React.FC<{
  token: VToken;
  segment?: Segment;
  p?: number;
  fontSize?: number;
}> = ({ token, segment = "user", p = 1, fontSize = 46 }) => {
  const seg = token.seg ?? segment;
  const role = segmentColor[seg];

  const isByte = !!token.byteText && !token.text;
  const isSpecial = !!token.special;
  const mono = isByte || isSpecial; // machine strings → mono; CJK content → 思源黑体
  const display = (isByte ? token.byteText! : showWhitespace(token.text)) || "·";

  // Horizontal breathing room grows from 0 (touching = continuous) to discrete.
  const padX = fontSize * 0.26 * p;
  const padY = fontSize * 0.12; // constant → constant height
  const radius = fontSize * 0.2 * p;

  const textColor = isSpecial
    ? `color-mix(in oklch, ${role} ${Math.round(p * 100)}%, ${color.ink})`
    : color.ink;

  const vCal = mono ? 0 : fontSize * 0.05; // 思源黑体 sits low — constant nudge up

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: mono ? font.mono : font.sans,
        fontSize,
        fontWeight: isSpecial ? weight.tokenSpecial : weight.token,
        lineHeight: 1,
        color: textColor,
        background: tint(role, TINT_REST * p),
        padding: `${padY}px ${padX}px`,
        borderRadius: radius,
        transform: `translateY(${-vCal}px)`,
        whiteSpace: "pre",
      }}
    >
      {display}
    </span>
  );
};
