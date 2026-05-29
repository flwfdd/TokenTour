import type { CSSProperties } from "react";
import type { TokenSegment, Message, TokenInfo } from "./lib/types";

/** Shared color tokens used across all 4 panes for visual linkage. */
export const SEG_LABEL: Record<TokenSegment, string> = {
  system: "system",
  tools_schema: "tools schema",
  user: "user",
  assistant: "assistant",
  tool: "tool result",
  control: "control",
  generation: "generation prompt",
};

export const SEG_ROLE_VAR: Record<TokenSegment, string> = {
  system: "--color-role-system",
  user: "--color-role-user",
  assistant: "--color-role-assistant",
  tool: "--color-role-tool",
  // The tool schema is injected into the system prompt, so it shares system's
  // (purple) family rather than the tool-result color.
  tools_schema: "--color-role-schema",
  control: "--color-border",
  // The generation prompt opens the assistant turn → assistant's family.
  generation: "--color-role-generation",
};

/**
 * Resolve a role name (possibly arbitrary) to the matching `SEG_ROLE_VAR`
 * CSS variable, falling back to `control` so callers never have to guard
 * for unknown roles when colouring message cards.
 */
export function roleColorVar(role: string): string {
  return SEG_ROLE_VAR[(role as TokenSegment) in SEG_ROLE_VAR ? (role as TokenSegment) : "control"];
}

/**
 * The single source of truth for how a role/segment is painted, so the *same*
 * segment looks identical in every pane (chat cards, token strip, template,
 * KV grid, legend) and only changes *intensity* — never *hue* — between its
 * rest and hover states.
 *
 * Design goals (per repeated user feedback): minimal & airy, never "busy or
 * dirty". So: a faint tint at rest, a slightly stronger tint when active, the
 * role's own hue for the emphasis ring/border (no stray accent color), and no
 * heavy drop shadows. The hue is constant across states → the color reads as
 * "the same thing, just focused".
 *
 * @param seg     which segment to color
 * @param o.hovered  this exact element is the current hover target
 * @param o.dim      element does NOT match the current hover → de-emphasize
 * @param o.border   draw a 1px role-tinted outline (chips / cards / tiles);
 *                   borderless callers (dense token runs) get an inset ring
 *                   on hover instead so adjacent edges never stack up
 * @param o.special  special token → paint the *text* in the role hue
 */
export interface TintSurfaceOpts {
  hovered?: boolean;
  dim?: boolean;
  border?: boolean;
  special?: boolean;
  /** Skip CSS transitions — for dense token grids where any easing reads as
   * lag ("不跟手"); the highlight should snap to the cursor. */
  instant?: boolean;
}

/** Same treatment as {@link roleSurfaceStyle} but keyed off a raw CSS custom
 * property (e.g. a `--color-kv-*` state color) rather than a segment. */
export function tintSurfaceStyle(cssVar: string, o: TintSurfaceOpts = {}): CSSProperties {
  const { hovered = false, dim = false, border = false, special = false, instant = false } = o;
  const style: CSSProperties = {
    backgroundColor: `color-mix(in oklch, var(${cssVar}) ${hovered ? 26 : 15}%, transparent)`,
  };
  if (!instant) {
    style.transition =
      "background-color 0.07s ease, border-color 0.07s ease, box-shadow 0.07s ease, opacity 0.12s ease";
  }
  if (border) {
    style.border = `1px solid color-mix(in oklch, var(${cssVar}) ${hovered ? 65 : 40}%, transparent)`;
  } else if (hovered) {
    style.boxShadow = `inset 0 0 0 1.5px color-mix(in oklch, var(${cssVar}) 70%, transparent)`;
  }
  if (special) style.color = `var(${cssVar})`;
  if (dim && !hovered) style.opacity = 0.4;
  return style;
}

export function roleSurfaceStyle(seg: TokenSegment, o: TintSurfaceOpts = {}): CSSProperties {
  return tintSurfaceStyle(SEG_ROLE_VAR[seg], o);
}

/**
 * Resolve the "effective" hover-role for legend / role-chip highlighting:
 *   1. explicit `hoverRole` wins (e.g. user clicked a chip);
 *   2. otherwise, the hovered token's segment lights up the matching chip;
 *   3. otherwise, fall back to the hovered message's role.
 *
 * Without this, hovering a user-content token (which only writes
 * `hoverMessageId`, not `hoverRole`) leaves every chip dim except
 * `tools_schema` (the one segment that *does* write `hoverRole` because it
 * has no `messageId`).
 */
export function deriveHoverRole(args: {
  hoverRole: string | null;
  hoverTokenIndex: number | null;
  hoverMessageId: string | null;
  tokens: TokenInfo[];
  messages: Message[];
}): string | null {
  const { hoverRole, hoverTokenIndex, hoverMessageId, tokens, messages } = args;
  if (hoverRole != null) return hoverRole;
  if (hoverTokenIndex != null && hoverTokenIndex < tokens.length) {
    return tokens[hoverTokenIndex]!.segment;
  }
  if (hoverMessageId != null) {
    const m = messages.find((x) => x.id === hoverMessageId);
    if (m) return m.role;
  }
  return null;
}

/** A token "matches" a role hover if its segment equals that role. */
export function matchesRoleHover(seg: TokenSegment, hoverRole: string | null): boolean {
  if (!hoverRole) return true;
  if (hoverRole === "tools_schema") return seg === "tools_schema";
  if (hoverRole === "generation") return seg === "generation";
  if (hoverRole === "control") return seg === "control";
  return seg === hoverRole;
}

/**
 * Unified hover-match for a token-like thing.
 * `hoverMessageId` takes precedence: when set, only tokens of that exact message match.
 * Otherwise falls back to role-based matching.
 */
export function matchesHover(
  t: { segment: TokenSegment; messageId?: string },
  hoverRole: string | null,
  hoverMessageId: string | null,
): boolean {
  if (hoverMessageId != null) return t.messageId === hoverMessageId;
  if (hoverRole != null) return matchesRoleHover(t.segment, hoverRole);
  return true;
}

/**
 * Position of `t` within the contiguous run of tokens sharing the same
 * `messageId` (or, when `t.messageId` is empty, sharing the same `segment` for
 * control / generation tokens), as a fraction in [0, 1].
 *
 * Used so compare panes with differing tokenizations can scroll to roughly
 * the same conceptual offset inside the same message.
 */
export function withinMessageFraction(
  tokens: { position: number; segment: TokenSegment; messageId?: string }[],
  t: { position: number; segment: TokenSegment; messageId?: string },
): number {
  const key = t.messageId ?? `@seg:${t.segment}`;
  let first = -1;
  let last = -1;
  let hit = -1;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i]!;
    const k = tk.messageId ?? `@seg:${tk.segment}`;
    if (k !== key) continue;
    if (first < 0) first = i;
    last = i;
    if (tk.position === t.position) hit = i;
  }
  if (first < 0 || last === first) return 0;
  const idx = hit >= 0 ? hit : first;
  return (idx - first) / (last - first);
}
