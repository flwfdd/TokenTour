import type { TokenSegment, Role, Message, TokenInfo } from "~/lib/types";

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
  tools_schema: "--color-warn",
  control: "--color-border",
  generation: "--color-accent",
};

/** Inline style: filled background (used in stacked bars + KV columns) */
export function segBgStyle(seg: TokenSegment): React.CSSProperties {
  return { backgroundColor: `var(${SEG_ROLE_VAR[seg]})` };
}

/** Inline style: tinted background with alpha (used in template spans + token chips) */
export function segTintStyle(seg: TokenSegment, alpha = 0.18): React.CSSProperties {
  return {
    backgroundColor: `color-mix(in oklch, var(${SEG_ROLE_VAR[seg]}) ${alpha * 100}%, transparent)`,
    borderColor: `color-mix(in oklch, var(${SEG_ROLE_VAR[seg]}) 45%, transparent)`,
  };
}

export function segDotStyle(seg: TokenSegment): React.CSSProperties {
  return { backgroundColor: `var(${SEG_ROLE_VAR[seg]})` };
}

export function roleOfSegment(seg: TokenSegment): Role | null {
  if (seg === "system" || seg === "user" || seg === "assistant" || seg === "tool") return seg;
  return null;
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
