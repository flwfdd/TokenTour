/**
 * TokenTour design tokens, ported verbatim from the site's design language so
 * the video reads as one piece with the article + playground.
 *
 *   - palette  → `src/styles/design.css` (:root)
 *   - roles    → `topics/chat2token/app/theme.css` (.pg-root)
 *
 * Values are kept in OKLCH (Remotion renders in Chromium, which supports it),
 * so colours match the web exactly rather than being eyeballed into hex.
 */

// ── Surfaces / ink ───────────────────────────────────────────────────
export const color = {
  paper: "oklch(0.975 0 0)",
  paper2: "oklch(0.955 0 0)",
  paper3: "oklch(0.93 0 0)",

  ink: "oklch(0.24 0.04 218)",
  inkSoft: "oklch(0.45 0.05 218)",
  muted: "oklch(0.6 0.04 218)",

  rule: "oklch(0.86 0 0)",
  ruleSoft: "oklch(0.91 0 0)",

  // Brand & semantic (500 step = the brand colour itself).
  primary: "oklch(0.67 0.13 218)",
  primaryEdge: "oklch(0.5 0.12 220)",
  accent: "oklch(0.76 0.15 55)",
  accentEdge: "oklch(0.6 0.14 50)",
  success: "oklch(0.7 0.14 145)",
  warning: "oklch(0.8 0.17 73)",
  danger: "oklch(0.58 0.22 27)",
} as const;

// ── Role / segment colours (playground parity) ──────────────────────
export type Segment =
  | "system"
  | "tools_schema"
  | "user"
  | "assistant"
  | "generation"
  | "tool"
  | "control"
  | "danger";

// Pulled verbatim from the playground (topics/chat2token/app/theme.css →
// --color-role-*), so token chips read identically to the app:
//   user = primary-500 · assistant = success-500 · generation = success-700
//   system = 紫 · schema = 粉 · tool = accent-500 · control = --color-border
export const segmentColor: Record<Segment, string> = {
  system: "oklch(0.62 0.17 300)", // --color-role-system
  tools_schema: "oklch(0.72 0.16 350)", // --color-role-schema
  user: color.primary, // --color-role-user (primary-500)
  assistant: color.success, // --color-role-assistant (success-500)
  generation: "oklch(0.52 0.12 145)", // --color-role-generation (success-700)
  tool: color.accent, // --color-role-tool (accent-500)
  control: "oklch(0.88 0.012 220)", // --color-border (neutral hairline)
  danger: color.danger, // --color-danger-500 — 碎裂/多 token 的强调红
};

/** Token-chip tint strength, matching the playground's roleSurfaceStyle:
 * 15% at rest, 26% when emphasised. */
export const TINT_REST = 15;
export const TINT_HOT = 26;

// ── Fonts ────────────────────────────────────────────────────────────
// Locally installed (see ~/Library/Fonts) and read straight from the OS by the
// headless renderer:
//   - serif   思源宋体 / Source Han Serif SC → prose, notes
//   - sans    思源黑体 / Source Han Sans SC  → token chips, labels
//   - display 得意黑 / Smiley Sans          → punchy headings / eyebrows
//   - mono    system mono                   → ids, byte escapes, template text
//
// TODO(portable render): to render on a machine without these installed,
// bundle the .otf files into `public/fonts/` and register them via
// `@remotion/fonts` loadFont(). On this Mac, family-name reference is enough.
export const font = {
  serif: `"Source Han Serif SC", "Noto Serif SC", "Songti SC", Georgia, serif`,
  sans: `"Source Han Sans SC", "Noto Sans SC", "PingFang SC", sans-serif`,
  display: `"Smiley Sans", "Source Han Sans SC", "Noto Sans SC", sans-serif`,
  mono: `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace`,
} as const;

/** Default weights. Prose/labels lean heavy; token text stays Medium so the
 * 思源黑体 chips don't read too bold / too tall. */
export const weight = {
  serif: 700, // 思源宋体 Bold
  sans: 700, // 思源黑体 Bold (labels)
  token: 500, // token chips — Medium
  tokenSpecial: 700, // special / byte tokens
} as const;

// ── Helpers ──────────────────────────────────────────────────────────
/** A faint tint of `c` over paper — mirrors the playground's token chips. */
export const tint = (c: string, pct: number): string =>
  `color-mix(in oklch, ${c} ${pct}%, transparent)`;

/** Render whitespace the way the Tokens pane does (· ↵ → ↩). */
export const showWhitespace = (s: string): string =>
  s
    .replace(/ /g, "·")
    .replace(/\n/g, "↵")
    .replace(/\t/g, "→")
    .replace(/\r/g, "↩");
