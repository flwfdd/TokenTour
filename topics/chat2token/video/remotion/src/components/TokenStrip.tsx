import React from "react";
import { TokenChip } from "./TokenChip";
import type { Segment } from "../lib/theme";
import type { VToken } from "../data/tokens";

/**
 * A horizontal run of {@link TokenChip}. Timing lives in the parent scene.
 *
 *   p  (i)→0..1 each token's single progress, driving BOTH its separation
 *      (left-margin gap) and its colour in lockstep. At p=0 a chip has zero gap
 *      and zero padding, so the row reads as continuous running text; as the
 *      parent's eased sweep advances, each token separates and colours together.
 */
export const TokenStrip: React.FC<{
  tokens: VToken[];
  segment?: Segment;
  p?: (i: number) => number;
  fontSize?: number;
  gap?: number;
}> = ({ tokens, segment = "user", p, fontSize = 46, gap = 12 }) => {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      {tokens.map((t, i) => {
        const pi = p ? p(i) : 1;
        return (
          <span key={i} style={{ display: "inline-flex", marginLeft: i === 0 ? 0 : gap * pi }}>
            <TokenChip token={t} segment={segment} p={pi} fontSize={fontSize} />
          </span>
        );
      })}
    </div>
  );
};
