import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { Frame } from "../components/Frame";
import { color, font, weight, segmentColor, tint, type Segment } from "../lib/theme";
import { useAuthorFrame, useAuthorSpring } from "../lib/fps";

/**
 * Scene 17 · Context × KV 分布条 & Agent 设计
 *
 * 复刻 playground LensContextKv：上=角色条 / 下=KV 状态条，按 token 位置 1:1 对齐，
 * 结合左侧消息列表。把 system+tools 钉前面 + 历史只增不改 → 长前缀青色命中、尾部一小段
 * 橙色输出；反例往 system 塞秒级时间戳 → 前缀一改，从该点往后整条变红作废。1.5s 尾帧。
 */

const TAIL = 45;
const ANIM = 640;
export const SCENE17_DURATION = ANIM + TAIL;

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SOFT = Easing.out(Easing.cubic);
const ease = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { easing: SOFT, ...CLAMP });
const useJelly = (f: number, delay: number) =>
  useAuthorSpring(f - delay, { damping: 12, stiffness: 150, mass: 0.8 });

// ── beats ────────────────────────────────────────────────────────────────
const B_IN = 10;
const B_BAD = 360; // inject ticking timestamp into system → suffix red
const B_REVERT = 560;

const BAR_W = 900;

// KV state colours (= --color-kv-*)
const KV = {
  reused: color.primary, // cyan
  prefill: color.danger, // red
  decode: color.accent, // orange
  pending: color.rule,
} as const;
type KvState = keyof typeof KV;

interface Block {
  role: Segment;
  tok: number;
  caption: string;
  text: string;
}
const BLOCKS: Block[] = [
  { role: "system", tok: 30, caption: "system + tools", text: "你是助手 · [current_time, calculator]" },
  { role: "user", tok: 8, caption: "user", text: "今天的年月日相乘是多少？" },
  { role: "assistant", tok: 12, caption: "assistant · tool_call", text: "current_time()" },
  { role: "tool", tok: 6, caption: "tool", text: "2026-06-01…" },
  { role: "assistant", tok: 10, caption: "assistant", text: "今天是 2026-06-01，… = 12156。" },
];
const TOTAL = BLOCKS.reduce((a, b) => a + b.tok, 0);

const RoleCaption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: font.mono, fontSize: 16, letterSpacing: "0.07em", textTransform: "uppercase", color: color.muted }}>{children}</div>
);

const MsgCard: React.FC<{ f: number; b: Block; index: number; bad: boolean; clock: string }> = ({ f, b, index, bad, clock }) => {
  const isSysBad = bad && index === 0;
  const c = isSysBad ? color.danger : segmentColor[b.role];
  const j = useJelly(f, B_IN + index * 12);
  return (
    <div
      style={{
        opacity: Math.max(0, j),
        transform: `translateY(${interpolate(j, [0, 1], [16, 0])}px)`,
        position: "relative",
        padding: "14px 20px",
        borderRadius: 15,
        background: tint(c, isSysBad ? 18 : 14),
        marginBottom: 14,
        border: `1.5px solid ${tint(c, isSysBad ? 55 : 0)}`,
      }}
    >
      <span style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 5, borderRadius: 999, background: c, opacity: 0.4 }} />
      <RoleCaption>{b.caption}</RoleCaption>
      <div style={{ fontFamily: font.sans, fontWeight: weight.token, fontSize: 23, color: color.ink, lineHeight: 1.25, marginTop: 3 }}>
        {isSysBad ? `你是助手 · 现在 ${clock}` : b.text}
      </div>
    </div>
  );
};

const Bar: React.FC<{ children: React.ReactNode; h: number }> = ({ children, h }) => (
  <div style={{ display: "flex", width: BAR_W, height: h, borderRadius: 8, overflow: "hidden", background: color.paper3 }}>{children}</div>
);

const Scene17Body: React.FC<{ f: number }> = ({ f }) => {
  const bad = f >= B_BAD && f < B_REVERT;
  const inO = ease(f, B_IN, B_IN + 24);
  const ss = String(Math.floor(f) % 60).padStart(2, "0");
  const clock = `03:59:${ss}`;

  // KV state per block: good = all reused except last (decode); bad = system + all after = prefill(red)
  const kvOf = (i: number): KvState => {
    if (bad) return "prefill";
    return i === BLOCKS.length - 1 ? "decode" : "reused";
  };

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 90, opacity: inO }}>
        {/* left · message list */}
        <div style={{ width: 560 }}>
          <div style={{ fontFamily: font.display, fontSize: 28, letterSpacing: "0.14em", textTransform: "uppercase", color: color.inkSoft, marginBottom: 18 }}>Messages</div>
          {BLOCKS.map((b, i) => (
            <MsgCard key={i} f={f} b={b} index={i} bad={bad} clock={clock} />
          ))}
        </div>

        {/* right · Context × KV bars */}
        <div style={{ width: BAR_W }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 22 }}>
            <span style={{ fontFamily: font.display, fontSize: 28, letterSpacing: "0.1em", textTransform: "uppercase", color: color.inkSoft }}>Context × KV Cache</span>
            <span style={{ fontFamily: font.mono, fontSize: 19, color: color.muted }}>{TOTAL} tok</span>
          </div>

          {/* role bar */}
          <RoleCaption>角色</RoleCaption>
          <div style={{ height: 10 }} />
          <Bar h={36}>
            {BLOCKS.map((b, i) => (
              <div key={i} style={{ width: `${(b.tok / TOTAL) * 100}%`, background: tint(segmentColor[b.role], 60), borderRight: `1px solid ${tint(color.paper, 50)}` }} />
            ))}
          </Bar>

          <div style={{ height: 26 }} />

          {/* KV state bar */}
          <RoleCaption>KV 状态</RoleCaption>
          <div style={{ height: 10 }} />
          <Bar h={44}>
            {BLOCKS.map((b, i) => {
              const st = kvOf(i);
              return <div key={i} style={{ width: `${(b.tok / TOTAL) * 100}%`, background: tint(KV[st], 70), borderRight: `1px solid ${tint(color.paper, 50)}` }} />;
            })}
          </Bar>

          {/* legend */}
          <div style={{ display: "flex", gap: 28, marginTop: 22 }}>
            {([["reused", "缓存命中"], ["prefill", "未命中·重算"], ["decode", "输出"]] as [KvState, string][]).map(([k, lbl]) => (
              <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 9, fontFamily: font.sans, fontWeight: weight.token, fontSize: 19, color: color.inkSoft }}>
                <span style={{ width: 18, height: 18, borderRadius: 5, background: tint(KV[k], 70) }} />
                {lbl}
              </span>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Scene17ContextKv: React.FC = () => {
  const f = useAuthorFrame(ANIM - 1);
  return (
    <Frame>
      <Scene17Body f={f} />
    </Frame>
  );
};
