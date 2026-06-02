import React from "react";
import { AbsoluteFill } from "remotion";
import { color, font } from "../lib/theme";

/** Paper backdrop shared by every Remotion scene (cream, never pure white). */
export const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: color.paper,
      color: color.ink,
      fontFamily: font.serif,
      fontWeight: 500,
    }}
  >
    {children}
  </AbsoluteFill>
);

/** Eyebrow label — small-caps tracking, muted, like the site's section tags. */
export const Eyebrow: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      fontFamily: font.display,
      fontSize: 24,
      fontWeight: 400,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: color.muted,
      ...style,
    }}
  >
    {children}
  </div>
);

/** Pill badge mirroring `.badge` — soft tinted, used for family / count tags. */
export const Badge: React.FC<{
  children: React.ReactNode;
  bg?: string;
  fg?: string;
}> = ({ children, bg = color.paper3, fg = color.inkSoft }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 16px",
      borderRadius: 999,
      fontFamily: font.mono,
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: "0.02em",
      background: bg,
      color: fg,
    }}
  >
    {children}
  </span>
);
