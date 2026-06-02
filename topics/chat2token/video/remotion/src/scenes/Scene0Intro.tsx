import React from "react";
import { AbsoluteFill, Easing, OffthreadVideo, interpolate, staticFile } from "remotion";
import { Frame } from "../components/Frame";
import { color, font } from "../lib/theme";
import { useAuthorFrame } from "../lib/fps";
import { ChatPanel, MessagesPanel, JsonPanel } from "./Scene5ToolCalls";
import { Scene7TemplatePanel } from "./Scene7Template";
import { Scene16PrefixTree } from "./Scene16PrefixTree";
import { TokenStrip } from "../components/TokenStrip";
import { BEAT_A_SYSTEM, BEAT_A_USER, BEAT_A_ASSISTANT } from "../data/tokens";

/**
 * Scene 0 · 序：钻进对话框（流水线一览）
 *
 * 把全片**真正的正式组件**摆成一条横向流水线，平铺在一块大地般延展的平面上。
 * 每个站点直接渲染对应场景里**那一个组件本身**（标题统一为卡片上方一行居中英文）：
 *   ① Chat ② Messages ③ JSON（Scene5 的三块面板各自独立搬来）
 *   ④ Chat Template（Scene7 模板栏）⑤ Tokens（直接复用 10A 的 Beat A）
 *   ⑥ Prefix Cache（Scene16）⑦ KV Cache（Scene13 Manim 成片）
 *
 * 伪 3D 相机：开场正面怼着 Chat，拉远并倾斜成掠射视角斜掠每一站（大地延伸感），
 * 末尾**不再回正/不叠标题卡**，停在最后一站。相邻卡片之间用一串等距 cyan 光点从头连到尾。
 */

const TAIL = 45;
const ANIM = 700;
export const SCENE0_DURATION = ANIM + TAIL;

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SMOOTH = Easing.inOut(Easing.cubic);
const CODE_BG = "oklch(0.99 0 0)";
const bump = (f: number, c: number, w = 40) => {
  const x = interpolate(f, [c - w, c, c + w], [0, 1, 0], CLAMP);
  return x * x * (3 - 2 * x);
};

const N = 7;
const PLATE_H = 50; // 名牌区高度（含下边距）—— 连接段用它对齐卡片中线
const BOX_H = 560; // 卡片站点统一窗口高度（内容绝对居中）

// ── 站点几何（每个站点是一块**已知宽度**的窗口，连接段恰好夹在相邻卡片之间） ────
const WIDE_W = 840; // Scene16 / KV 成片整屏窗口
const WIDE_H = 472;
const WIDE_S = WIDE_W / 1920;
const GAP = 120;
const TOK_CARD_W = 840; // tokens 卡片固定宽（保证不溢出）

// 每个站点：缩放系数 + 该站点窗口宽度（= 原始卡片宽 × 缩放，恰好贴合卡片）
const SC = { chat: 1.08, msg: 0.58, json: 0.86, tmpl: 0.82, tok: 0.76 };
const VW = [
  Math.round(372 * SC.chat), // chat
  Math.round(460 * SC.msg), // messages
  Math.round(700 * SC.json), // json
  Math.round(780 * SC.tmpl), // chat template
  Math.round(TOK_CARD_W * SC.tok), // tokens
  WIDE_W, // prefix
  WIDE_W, // kv
];
const RAIL_W = VW.reduce((a, w) => a + w, 0) + (N - 1) * GAP;
const CENTERS = (() => {
  let x = 0;
  return VW.map((w) => {
    const c = x + w / 2;
    x += w + GAP;
    return c;
  });
})();
const centerAt = (idx: number) => interpolate(idx, VW.map((_, i) => i), CENTERS, CLAMP);

// ── 相机编排（author frames，沿用手动调好的参数；末尾不再回正） ───────────────
const C_HOLD = 60;
const C_PULL = 130;
const C_GLIDE_END = 640;
const reach = (i: number) => C_PULL + (i / (N - 1)) * (C_GLIDE_END - C_PULL);

const useCamera = (f: number) => {
  const idx = interpolate(f, [C_PULL, C_GLIDE_END], [0, N - 1], { easing: SMOOTH, ...CLAMP });
  const camX = centerAt(idx) - RAIL_W / 2;
  const scale = interpolate(f, [0, C_HOLD, C_PULL, C_GLIDE_END], [1.5, 1.5, 1.5, 0.8], { easing: SMOOTH, ...CLAMP });
  const ry = interpolate(f, [C_PULL, C_GLIDE_END], [0, -30], { easing: SMOOTH, ...CLAMP });
  const rx = interpolate(f, [C_PULL, C_GLIDE_END], [0, 10], { easing: SMOOTH, ...CLAMP });
  return { camX, scale, ry, rx };
};

// ── 动态渐变雾背景（帧驱动游动的高亮色斑，仿 TopicCard） ─────────────────────
const FogBackground: React.FC<{ f: number }> = ({ f }) => {
  const t = f / 30;
  const blob = (hue: number, l: number, c: number, a: number, bx: number, by: number, rad: number, sp: number, ph: number) => {
    const cx = bx + rad * Math.cos(t * sp + ph);
    const cy = by + rad * Math.sin(t * sp * 0.8 + ph * 1.3);
    return `radial-gradient(42% 46% at ${cx}% ${cy}%, oklch(${l} ${c} ${hue} / ${a}), transparent 72%)`;
  };
  const bg = [
    blob(350, 0.94, 0.085, 0.55, 28, 32, 16, 0.5, 0),
    blob(58, 0.95, 0.08, 0.5, 74, 30, 14, 0.42, 1.7),
    blob(295, 0.93, 0.095, 0.52, 32, 72, 15, 0.46, 3.1),
    blob(240, 0.94, 0.08, 0.48, 70, 74, 17, 0.38, 4.6),
    blob(175, 0.95, 0.07, 0.42, 50, 50, 13, 0.55, 2.2),
  ].join(",");
  return <AbsoluteFill style={{ background: bg, filter: "blur(64px)", transform: "scale(1.25)" }} />;
};

// ── 名牌：卡片上方一行居中英文 ───────────────────────────────────────────────
const Plate: React.FC<{ en: string; c: string; lit: number }> = ({ en, c, lit }) => (
  <div style={{ height: PLATE_H, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div style={{ fontFamily: font.display, fontSize: 30, letterSpacing: "0.18em", textTransform: "uppercase", color: `color-mix(in oklch, ${c} ${45 + lit * 55}%, ${color.muted})` }}>{en}</div>
  </div>
);

// 固定宽高窗口：内容绝对居中（任意高度都正中），按 scale 等比缩放，带高亮投影。
const Pane: React.FC<{ w: number; scale: number; lit: number; children: React.ReactNode }> = ({ w, scale, lit, children }) => (
  <div style={{ position: "relative", width: w, height: BOX_H, filter: `drop-shadow(0 ${14 + lit * 26}px ${30 + lit * 40}px rgba(0,0,0,${0.1 + lit * 0.1}))` }}>
    <div style={{ position: "absolute", top: "50%", left: "50%", transform: `translate(-50%, -50%) scale(${scale})` }}>{children}</div>
  </div>
);

/** 1920×1080 整屏裁切窗口（仅用于本身就是整屏的场景：Scene16 / KV 成片）。 */
const Screen: React.FC<{ w: number; h: number; scale: number; lit: number; children: React.ReactNode }> = ({ w, h, scale, lit, children }) => (
  // 与卡片站点同高（BOX_H），整屏窗口垂直居中 → 名牌与其它站点齐平
  <div style={{ height: BOX_H, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div
      style={{
        width: w,
        height: h,
        overflow: "hidden",
        borderRadius: 22,
        background: color.paper,
        outline: `1px solid ${color.ruleSoft}`,
        boxShadow: `0 ${18 + lit * 30}px ${48 + lit * 48}px rgba(0,0,0,${0.08 + lit * 0.09})`,
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${w / 2 - 960 * scale}px, ${h / 2 - 540 * scale}px) scale(${scale})` }}>{children}</div>
    </div>
  </div>
);

// 站点外壳：内容宽度（不固定槽宽），名牌居中贴在卡片上方。
// vis(0..1) 控制「依次浮现」：始终占位（不挤动布局），仅做透明度 + 上浮 + 微缩放。
const Station: React.FC<{ en: string; c: string; lit: number; vis: number; children: React.ReactNode }> = ({ en, c, lit, vis, children }) => (
  <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", opacity: vis, transform: `translateY(${(1 - vis) * 46}px) scale(${0.9 + 0.1 * vis})`, transformOrigin: "center center" }}>
    <Plate en={en} c={c} lit={lit} />
    {children}
  </div>
);

// 连接段：相邻卡片之间一串等距 cyan 光点，像流水灯一样有一束亮点循环奔流
const Connector: React.FC<{ f: number; lit: number; vis: number }> = ({ f, lit, vis }) => {
  const W = GAP;
  const DOTS = 6;
  const head = ((f / 26) % 1 + 1) % 1; // 0..1 循环奔流的亮束位置
  return (
    <div style={{ flex: "none", width: W, display: "flex", flexDirection: "column", alignItems: "center", opacity: vis }}>
      <div style={{ height: PLATE_H }} />
      <div style={{ height: 60, display: "flex", alignItems: "center" }}>
        <svg width={W} height={20} style={{ overflow: "visible" }}>
          {Array.from({ length: DOTS }).map((_, d) => {
            const u = (d + 0.5) / DOTS;
            const raw = Math.abs(u - head);
            const dist = Math.min(raw, 1 - raw); // 环绕距离
            const glow = Math.max(0, 1 - dist / 0.32);
            const op = (0.22 + 0.7 * glow) * (0.55 + lit * 0.45);
            return <circle key={d} cx={u * W} cy={10} r={4.5 + 1.8 * glow} fill={color.primary} opacity={op} />;
          })}
        </svg>
      </div>
    </div>
  );
};

// ── Tokens 站点（直接复用 10A 的 Beat A：含 sys 你是哈基米 / user / assistant） ──
const TOK_ROWS = [BEAT_A_SYSTEM, BEAT_A_USER, BEAT_A_ASSISTANT];
const TOK_TOTAL = TOK_ROWS.reduce((a, r) => a + r.length, 0);

const TokensPane: React.FC<{ f: number; lit: number }> = ({ f, lit }) => {
  const front = interpolate(f, [350, 520], [0, TOK_TOTAL + 3], { easing: SMOOTH, ...CLAMP });
  const p = (gi: number) => interpolate(front, [gi, gi + 3], [0, 1], CLAMP);
  let base = 0;
  const rows = TOK_ROWS.map((r, ri) => {
    const start = base;
    base += r.length;
    return <TokenStrip key={ri} tokens={r} segment={r[0].seg ?? "user"} p={(i) => p(start + i)} fontSize={20} gap={6} />;
  });
  return (
    <Pane w={VW[4]} scale={SC.tok} lit={lit}>
      <div style={{ width: TOK_CARD_W, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 18, alignItems: "center", padding: "34px 30px", borderRadius: 20, background: CODE_BG, boxShadow: "0 18px 50px rgba(0,0,0,0.07)" }}>
        {rows}
      </div>
    </Pane>
  );
};

// ── body ───────────────────────────────────────────────────────────────────
const Scene0Body: React.FC<{ f: number }> = ({ f }) => {
  const { camX, scale, ry, rx } = useCamera(f);
  const lit = (i: number) => bump(f, reach(i), 80);

  // 依次浮现：开场只有 Chat（i=0 恒显），其余随相机沿轨道（eased idx）逼近时上浮出现
  const idxE = interpolate(f, [C_PULL, C_GLIDE_END], [0, N - 1], { easing: SMOOTH, ...CLAMP });
  const vis = (i: number) => {
    if (i === 0) return 1;
    const x = Math.min(1, Math.max(0, (idxE - (i - 0.9)) / 0.6));
    return x * x * (3 - 2 * x);
  };

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", perspective: 1500, overflow: "hidden" }}>
      <FogBackground f={f} />
      <div style={{ transformStyle: "preserve-3d", transform: `rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})` }}>
        <div style={{ display: "flex", alignItems: "center", transformStyle: "preserve-3d", transform: `translateX(${-camX}px)`, width: RAIL_W }}>
          {/* ① Chat */}
          <Station en="Chat" c={color.primary} lit={lit(0)} vis={vis(0)}>
            <Pane w={VW[0]} scale={SC.chat} lit={lit(0)}>
              <ChatPanel f={f} hideTitle sysText="你是一只哈基米" />
            </Pane>
          </Station>
          <Connector f={f} lit={Math.max(lit(0), lit(1))} vis={vis(1)} />

          {/* ② Messages */}
          <Station en="Messages" c={color.primary} lit={lit(1)} vis={vis(1)}>
            <Pane w={VW[1]} scale={SC.msg} lit={lit(1)}>
              <MessagesPanel f={f} hideTitle />
            </Pane>
          </Station>
          <Connector f={f} lit={Math.max(lit(1), lit(2))} vis={vis(2)} />

          {/* ③ JSON */}
          <Station en="JSON" c={color.muted} lit={lit(2)} vis={vis(2)}>
            <Pane w={VW[2]} scale={SC.json} lit={lit(2)}>
              <JsonPanel f={f} hideTitle />
            </Pane>
          </Station>
          <Connector f={f} lit={Math.max(lit(2), lit(3))} vis={vis(3)} />

          {/* ④ Chat Template */}
          <Station en="Chat Template" c={color.primary} lit={lit(3)} vis={vis(3)}>
            <Pane w={VW[3]} scale={SC.tmpl} lit={lit(3)}>
              <Scene7TemplatePanel f={f} hideTitle />
            </Pane>
          </Station>
          <Connector f={f} lit={Math.max(lit(3), lit(4))} vis={vis(4)} />

          {/* ⑤ Tokens — 直接复用 10A Beat A */}
          <Station en="Tokens" c={color.accent} lit={lit(4)} vis={vis(4)}>
            <TokensPane f={f} lit={lit(4)} />
          </Station>
          <Connector f={f} lit={Math.max(lit(4), lit(5))} vis={vis(5)} />

          {/* ⑥ Prefix Cache · 前缀缓存树 — Scene16（稍微加速） */}
          <Station en="Prefix Cache" c={color.primary} lit={lit(5)} vis={vis(5)}>
            <Screen w={WIDE_W} h={WIDE_H} scale={WIDE_S} lit={lit(5)}>
              <Scene16PrefixTree fScale={1.3} />
            </Screen>
          </Station>
          <Connector f={f} lit={Math.max(lit(5), lit(6))} vis={vis(6)} />

          {/* ⑦ KV Cache · 有无缓存三角 — Scene13 Manim 成片 */}
          <Station en="KV Cache" c={color.accent} lit={lit(6)} vis={vis(6)}>
            <Screen w={WIDE_W} h={WIDE_H} scale={WIDE_S} lit={lit(6)}>
              <OffthreadVideo src={staticFile("scene13_kv.mp4")} muted style={{ width: 1920, height: 1080 }} />
            </Screen>
          </Station>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Scene0Intro: React.FC = () => {
  const f = useAuthorFrame(ANIM - 1);
  return (
    <Frame>
      <Scene0Body f={f} />
    </Frame>
  );
};
