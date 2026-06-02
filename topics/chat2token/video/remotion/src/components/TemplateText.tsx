import React from "react";
import { color, font, segmentColor, tint, weight } from "../lib/theme";
import type { TSpan } from "../data/chatTemplates";

/**
 * Chat-template plain text, painted like the playground's LensChatTemplate:
 *   - each chunk gets a faint role tint (15% at rest, → 26% when "hot")
 *   - special / structural tokens are bold + role-hued
 *   - whitespace:pre-wrap so newlines + indentation read verbatim (mono)
 *
 * `opacityOf(i)` drives a per-span typewriter-by-token reveal; `hotOf(span,i)`
 * drives a per-span highlight pulse (0→1). Both default to "fully shown, cold".
 */
export const TemplateText: React.FC<{
  spans: TSpan[];
  fontSize?: number;
  lineHeight?: number;
  opacityOf?: (i: number) => number;
  hotOf?: (span: TSpan, i: number) => number;
}> = ({ spans, fontSize = 20, lineHeight = 1.65, opacityOf, hotOf }) => (
  <div
    style={{
      fontFamily: font.mono,
      fontSize,
      lineHeight,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      color: color.ink,
    }}
  >
    {spans.map((s, i) => {
      const role = segmentColor[s.seg];
      const hot = hotOf ? hotOf(s, i) : 0;
      const op = opacityOf ? opacityOf(i) : 1;
      return (
        <span
          key={i}
          style={{
            background: tint(role, 15 + hot * 18),
            color: s.sp ? role : color.ink,
            fontWeight: s.sp ? weight.tokenSpecial : 400,
            borderRadius: 3,
            opacity: op,
            boxShadow: hot > 0.02 ? `inset 0 0 0 1.5px ${tint(role, 55 + hot * 25)}` : undefined,
          }}
        >
          {s.t}
        </span>
      );
    })}
  </div>
);
