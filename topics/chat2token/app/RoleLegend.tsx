import type { TokenInfo, TokenSegment } from "./lib/types";
import { SEG_ROLE_VAR, roleSurfaceStyle } from "./visual";
import { segmentLabel, type Lang } from "./locale";

/** Display order for the role chips. Zero-count chips are filtered out. */
export const SEG_ORDER: TokenSegment[] = [
  "system",
  "tools_schema",
  "user",
  "assistant",
  "tool",
];

export function countBySegment(tokens: TokenInfo[]): Record<TokenSegment, number> {
  const c: Record<TokenSegment, number> = {
    system: 0,
    tools_schema: 0,
    user: 0,
    assistant: 0,
    tool: 0,
  };
  for (const t of tokens) c[t.segment] = (c[t.segment] ?? 0) + 1;
  return c;
}

interface Props {
  /** Per-segment token counts. Chips with `count === 0` are hidden. */
  counts: Record<TokenSegment, number>;
  /**
   * Effective hover role (computed by `deriveHoverRole` at the call site)
   * — i.e. either the explicitly hovered role, or the segment inferred
   * from the hovered token / message. Drives which chip lights up.
   */
  hoverRole: string | null;
  /**
   * Called when the user hovers / clicks a chip (or leaves the legend).
   * `seg=null` means "no hover" (mouse left, or click-to-unpin).
   * The caller is responsible for the store mutation + any side effects
   * (e.g. KV panel also clears its `hoverState`).
   */
  onHoverChange: (seg: TokenSegment | null) => void;
  /** Optional prefix label like "角色:" rendered in muted color. */
  label?: string;
  lang?: Lang;
}

/**
 * Shared role-distribution legend used by the Tokens panel and the
 * Context × KV panel. Renders one chip per non-empty segment with shared
 * color + hover semantics, so hovering a chip lights up the same role
 * everywhere through the store's `hoverRole`.
 */
export default function RoleLegend({ counts, hoverRole, onHoverChange, label, lang = "en" }: Props) {
  return (
    <div
      className="flex flex-wrap items-center gap-1 text-[11px]"
      onMouseLeave={() => onHoverChange(null)}
    >
      {label && <span className="text-(--color-muted)">{label}</span>}
      {SEG_ORDER.map((seg) => {
        const n = counts[seg];
        if (!n) return null;
        const active = hoverRole === seg;
        return (
          <button
            key={seg}
            onMouseEnter={() => onHoverChange(seg)}
            onClick={() => onHoverChange(active ? null : seg)}
            className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5"
            style={
              active
                ? { ...roleSurfaceStyle(seg, { hovered: true, border: true }), color: `var(${SEG_ROLE_VAR[seg]})` }
                : { backgroundColor: "var(--color-surface-2)", border: "1px solid transparent" }
            }
          >
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: `var(${SEG_ROLE_VAR[seg]})` }}
            />
            {segmentLabel(lang, seg)} · {n}
          </button>
        );
      })}
    </div>
  );
}
