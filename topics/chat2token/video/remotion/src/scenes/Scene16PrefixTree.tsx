import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { Frame } from "../components/Frame";
import { color, font, weight, tint } from "../lib/theme";
import { useAuthorFrame, useAuthorSpring } from "../lib/fps";

/**
 * Scene 16 · 前缀缓存：命中只看前缀
 *
 * 下方是一棵**已有的**前缀缓存树（共享主干 system+tools → 用户 query 分叉，叶子＝一条缓存）。
 * 顶部是**当前请求**的一串 token。每换一个请求：树里高亮它能命中的最长前缀路径（绿，含竖线），
 * 当前请求逐 token 标命中（绿）/未命中（红）。
 * 五个 case：完全命中 / 共享前缀+新结尾 / 命中另一分支+后缀 miss / **换工具** / 改靠前 token → 后面全 miss。
 */

const TAIL = 45;
const ANIM = 1090;
export const SCENE16_DURATION = ANIM + TAIL;

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SOFT = Easing.out(Easing.cubic);
const ease = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { easing: SOFT, ...CLAMP });
const bump = (f: number, c: number, w = 16) => {
  const x = interpolate(f, [c - w, c, c + w], [0, 1, 0], CLAMP);
  return x * x * (3 - 2 * x);
};
const useJelly = (f: number, delay: number) =>
  useAuthorSpring(f - delay, { damping: 12, stiffness: 150, mass: 0.8 });

// ── beats ────────────────────────────────────────────────────────────────
const B_TREE = 10; // 树主干
const B_TREE2 = 90; // 分叉
const B_CACHE = 150; // 叶子 Cache 编号
const REQ_START = 220; // 当前请求开始演示
const REQ_STEP = 160; // 每个请求停留

// ── 已有缓存树（共享主干 + 多层分叉，叶子＝一条缓存） ───────────────────────
const TRUNK = ["system", "你是", "哈基米", "[calculator]"];
// 主干之后的各条缓存路径
const BRANCH_SEQS: string[][] = [
  ["我喜欢", "唱", "跳", "rap"],
  ["我喜欢", "南北", "绿豆"],
  ["你是", "谁"],
  ["你这", "瓜", "多少钱"],
];

// 当前请求：初始命中「你是 谁」，后续逐个改写演示前缀复用规律
const REQUESTS: string[][] = [
  ["system", "你是", "哈基米", "[calculator]", "你是", "谁"], // 完全命中一条缓存
  ["system", "你是", "哈基米", "[calculator]", "我喜欢", "金坷垃"], // 命中「我喜欢」，后缀 miss
  ["system", "你是", "哈基米", "[calculator]", "我喜欢", "唱", "跳", "rap", "篮球"], // 命中整条，末尾新 token miss
  ["system", "你是", "奶龙", "[calculator]", "你是", "谁"], // 改靠前 token → 后面全 miss
  ["system", "你是", "哈基米", "[web_search]", "你是", "谁"], // 换工具 → 从工具起全 miss
];

const REQS = REQUESTS.length;

// ── trie ───────────────────────────────────────────────────────────────────
type TNode = { id: string; label: string; children: TNode[]; cache?: number };

const TRIE: TNode = (() => {
  const root: TNode = { id: "root", label: "", children: [] };
  let cur = root;
  TRUNK.forEach((t, i) => {
    const n: TNode = { id: `t${i}`, label: t, children: [] };
    cur.children.push(n);
    cur = n;
  });
  BRANCH_SEQS.forEach((seq) => {
    let node = cur;
    seq.forEach((lab) => {
      let child = node.children.find((c) => c.label === lab);
      if (!child) {
        child = { id: `${node.id}/${lab}`, label: lab, children: [] };
        node.children.push(child);
      }
      node = child;
    });
  });
  let cn = 0;
  const num = (n: TNode) => {
    if (n.children.length === 0) {
      n.cache = ++cn;
      return;
    }
    n.children.forEach(num);
  };
  num(root.children[0]);
  return root;
})();

const leafCount = (n: TNode): number =>
  n.children.length === 0 ? 1 : n.children.reduce((s, c) => s + leafCount(c), 0);

// 当前请求沿 trie 命中的节点集合 + 命中深度
const activePath = (req: string[]): { ids: Set<string>; matched: number } => {
  const ids = new Set<string>();
  let node: TNode = TRIE;
  let depth = 0;
  for (; depth < req.length; depth++) {
    const child = node.children.find((c) => c.label === req[depth]);
    if (!child) break;
    ids.add(child.id);
    node = child;
  }
  return { ids, matched: depth };
};

const isMono = (t: string) => t.startsWith("[") || /^[a-z_]+$/.test(t);

// ── 当前请求 token chip（命中绿 / 未命中红，固定高度） ──────────────────────
const ReqChip: React.FC<{ f: number; label: string; hit: boolean; appear: number; pulse: number }> = ({ f, label, hit, appear, pulse }) => {
  const j = useJelly(f, appear);
  const o = ease(f, appear, appear + 10);
  const c = hit ? color.success : color.danger;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 62,
        padding: "0 22px",
        lineHeight: 1,
        opacity: Math.min(o, Math.max(0, j)),
        transform: `translateY(${interpolate(j, [0, 1], [12, 0])}px) scale(${1 + pulse * 0.07})`,
        borderRadius: 14,
        background: tint(c, 20),
        boxShadow: `inset 0 0 0 1.5px ${tint(c, 50)}`,
        fontFamily: isMono(label) ? font.mono : font.sans,
        fontWeight: isMono(label) ? 700 : weight.token,
        fontSize: 27,
        color: hit ? color.ink : color.danger,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
};

// ── 缓存树节点（命中绿 / 中性灰，固定高度） ──────────────────────────────────
const TreeChip: React.FC<{ f: number; label: string; hit: boolean; appear: number }> = ({ f, label, hit, appear }) => {
  const j = useJelly(f, appear);
  const o = ease(f, appear, appear + 10);
  const c = color.success;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 58,
        padding: "0 20px",
        lineHeight: 1,
        opacity: Math.min(o, Math.max(0, j)),
        transform: `translateY(${interpolate(j, [0, 1], [12, 0])}px)`,
        borderRadius: 13,
        background: hit ? tint(c, 22) : color.paper2,
        boxShadow: hit ? `0 6px 18px ${tint(c, 30)}` : "none",
        fontFamily: isMono(label) ? font.mono : font.sans,
        fontWeight: isMono(label) ? 700 : weight.token,
        fontSize: 25,
        color: hit ? color.ink : color.muted,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
};

// 叶子尾随的缓存编号
const CacheTag: React.FC<{ f: number; n: number; appear: number }> = ({ f, n, appear }) => {
  const o = ease(f, appear, appear + 12);
  return (
    <span style={{ marginLeft: 13, fontFamily: font.mono, fontSize: 17, color: color.muted, whiteSpace: "nowrap", opacity: o }}>
      Cache {n}
    </span>
  );
};

// 树枝括号：输入线 + 竖脊（激活段亮绿）+ 各 prong
const Bracket: React.FC<{ f: number; appear: number; w: number; h: number; inY: number; prongs: number[]; inputLit: boolean; activeProng: number }> = ({ f, appear, w, h, inY, prongs, inputLit, activeProng }) => {
  const o = ease(f, appear, appear + 16);
  const G = color.success;
  const N = color.rule;
  const mx = w / 2;
  const active = activeProng >= 0;
  const litFrom = active ? Math.min(inY, prongs[activeProng]) : 0;
  const litTo = active ? Math.max(inY, prongs[activeProng]) : 0;
  return (
    <svg width={w} height={h} style={{ opacity: o, flex: "none" }}>
      <path d={`M0,${inY} L${mx},${inY}`} fill="none" stroke={inputLit ? G : N} strokeWidth={inputLit ? 3.5 : 2.5} />
      <path d={`M${mx},${Math.min(...prongs)} L${mx},${Math.max(...prongs)}`} fill="none" stroke={N} strokeWidth={2.5} />
      {active && <path d={`M${mx},${litFrom} L${mx},${litTo}`} fill="none" stroke={G} strokeWidth={3.5} />}
      {prongs.map((py, i) => (
        <path key={i} d={`M${mx},${py} L${w},${py}`} fill="none" stroke={i === activeProng ? G : N} strokeWidth={i === activeProng ? 3.5 : 2.5} />
      ))}
    </svg>
  );
};

const LABEL_W = 108;

const SideLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      width: LABEL_W,
      flexShrink: 0,
      fontFamily: font.sans,
      fontWeight: weight.sans,
      fontSize: 21,
      color: color.muted,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </div>
);

const LEAF_H = 80; // 每条叶子（缓存）占的竖向槽高

// ── 递归渲染：一个 trie 节点 + 其右侧的全部分叉 ──────────────────────────────
const NodeRow: React.FC<{ f: number; node: TNode; depth: number; activeIds: Set<string> }> = ({ f, node, depth, activeIds }) => {
  const h = leafCount(node) * LEAF_H;
  const hit = activeIds.has(node.id);
  return (
    <div style={{ display: "flex", alignItems: "center", height: h }}>
      <TreeChip f={f} label={node.label} hit={hit} appear={B_TREE + depth * 12} />
      {node.children.length === 0 ? (
        <CacheTag f={f} n={node.cache!} appear={B_CACHE + (node.cache ?? 0) * 8} />
      ) : (
        (() => {
          const childHeights = node.children.map((c) => leafCount(c) * LEAF_H);
          let acc = 0;
          const centers = childHeights.map((ch) => {
            const c = acc + ch / 2;
            acc += ch;
            return c;
          });
          const activeProng = node.children.findIndex((c) => activeIds.has(c.id));
          const branching = node.children.length > 1;
          return (
            <>
              <Bracket
                f={f}
                appear={B_TREE2 + depth * 8}
                w={branching ? 60 : 22}
                h={h}
                inY={h / 2}
                prongs={centers}
                inputLit={activeProng >= 0}
                activeProng={activeProng}
              />
              <div style={{ display: "flex", flexDirection: "column" }}>
                {node.children.map((c) => (
                  <NodeRow key={c.id} f={f} node={c} depth={depth + 1} activeIds={activeIds} />
                ))}
              </div>
            </>
          );
        })()
      )}
    </div>
  );
};

const Scene16Body: React.FC<{ f: number }> = ({ f }) => {
  const shown = f >= REQ_START;
  const ri = shown ? Math.min(REQS - 1, Math.floor((f - REQ_START) / REQ_STEP)) : 0;
  const req = REQUESTS[ri];
  const phaseStart = REQ_START + ri * REQ_STEP;
  const pulse = bump(f, phaseStart + 8, 14);

  const { ids: activeIds, matched } = shown ? activePath(req) : { ids: new Set<string>(), matched: 0 };
  const reqO = ease(f, REQ_START, REQ_START + 16);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "28px 56px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 72 }}>
        {/* 当前请求 */}
        <div style={{ display: "flex", alignItems: "center", gap: 22, opacity: reqO }}>
          <SideLabel>当前请求</SideLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            {req.map((t, i) => (
              <ReqChip key={i} f={f} label={t} hit={i < matched} appear={REQ_START} pulse={pulse} />
            ))}
          </div>
        </div>

        {/* 已有缓存 */}
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <SideLabel>已有缓存</SideLabel>
          <NodeRow f={f} node={TRIE.children[0]} depth={0} activeIds={activeIds} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Scene16PrefixTree: React.FC<{ fScale?: number }> = ({ fScale = 1 }) => {
  const raw = useAuthorFrame(ANIM - 1);
  const f = Math.min(ANIM - 1, raw * fScale);
  return (
    <Frame>
      <Scene16Body f={f} />
    </Frame>
  );
};
