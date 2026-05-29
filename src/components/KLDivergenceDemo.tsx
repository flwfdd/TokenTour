import { useEffect, useMemo, useState } from "react";
import katex from "katex";
import "./KLDivergenceDemo.css";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Inline math, rendered with KaTeX (its CSS is loaded by the page). Memoized
// per source string so live-updating labels don't re-parse on every tick.
function Tex({ tex }: { tex: string }) {
  const html = useMemo(
    () =>
      katex.renderToString(tex, {
        throwOnError: false,
        output: "html",
      }),
    [tex],
  );
  return <span className="kl-tex" dangerouslySetInnerHTML={{ __html: html }} />;
}

// Colors mirror the design.css tokens (paper / cyan / orange). Kept as
// literal oklch strings so recharts can hand them straight to SVG.
const C = {
  primary: "oklch(0.67 0.13 218)",
  accent: "oklch(0.76 0.15 55)",
  danger: "oklch(0.58 0.22 27)",
  ink: "oklch(0.24 0.04 218)",
  muted: "oklch(0.6 0.04 218)",
  rule: "oklch(0.86 0 0)",
};

const X_MIN = -6;
const X_MAX = 6;
const BINS = 121;
const XS = Array.from(
  { length: BINS },
  (_, i) => X_MIN + (i * (X_MAX - X_MIN)) / (BINS - 1),
);

// P is the fixed reference distribution N(0, 1).
const P_MU = 0;
const P_SIGMA = 1;

const gaussian = (x: number, mu: number, sigma: number) => {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
};

type Dir = "PQ" | "QP";

interface Preset {
  id: string;
  label: string;
  mu: number;
  sigma: number;
  hint: string;
}
const PRESETS: Preset[] = [
  {
    id: "match",
    label: "重合",
    mu: 0,
    sigma: 1,
    hint: "Q 与 P 完全重合，两个方向都为 0——这是 KL 唯一能取到的下界。",
  },
  {
    id: "shift",
    label: "偏移",
    mu: 1.8,
    sigma: 1,
    hint: "只平移均值、方差不变时，前向与反向 KL 恰好相等；不对称要靠改变形状才显现。",
  },
  {
    id: "narrow",
    label: "过窄",
    mu: 0,
    sigma: 0.5,
    hint: "Q 比 P 窄。D(Q‖P) 尚可，但 D(P‖Q) 很大——P 的尾巴落在 Q≈0 处被重罚。最能体现不对称。",
  },
  {
    id: "wide",
    label: "过宽",
    mu: 0,
    sigma: 2.2,
    hint: "Q 比 P 宽，结论反过来：D(P‖Q) 温和，D(Q‖P) 偏大，因为 Q 把质量铺到了 P 几乎为 0 的尾部。",
  },
];

// The plain-language takeaway for each direction. This is the "skill" payload:
// a later agent can lift these explanations verbatim when teaching KL.
const DIR_NOTE: Record<Dir, string> = {
  PQ: "前向 KL D(P‖Q)：在「P 有质量、Q≈0」处代价爆炸，于是 Q 被逼着盖住 P 的整个支撑（mass-covering / 均值寻求）。最大似然与交叉熵训练最小化的就是它——P 是数据，Q 是模型。",
  QP: "反向 KL D(Q‖P)：在「P≈0、Q 仍有质量」处受罚，于是 Q 收缩到 P 的某一个峰（mode-seeking / 模式寻求）。变分推断，以及把策略拉回参考模型的 RLHF/PPO 正则项，用的是它。",
};

interface Row {
  x: number;
  P: number;
  Q: number;
  contribPQ: number;
  contribQP: number;
}

interface TipProps {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  dir: Dir;
}

function KLTooltip({ active, payload, dir }: TipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const contrib = dir === "PQ" ? row.contribPQ : row.contribQP;
  return (
    <div className="kl-tip">
      <div className="kl-tip__x">x = {row.x.toFixed(2)}</div>
      <div className="kl-tip__row">
        <span className="kl-dot" style={{ background: C.primary }} />
        <Tex tex="P(x)" /> = {row.P.toFixed(3)}
      </div>
      <div className="kl-tip__row">
        <span className="kl-dot" style={{ background: C.accent }} />
        <Tex tex="Q(x)" /> = {row.Q.toFixed(3)}
      </div>
      <div className="kl-tip__c">
        逐点贡献 = {contrib >= 0 ? "+" : ""}
        {contrib.toFixed(4)} bits
      </div>
    </div>
  );
}

export default function KLDivergenceDemo() {
  const [muQ, setMuQ] = useState(1.8);
  const [sigmaQ, setSigmaQ] = useState(1);
  const [dir, setDir] = useState<Dir>("PQ");
  const [showContrib, setShowContrib] = useState(false);
  // Animate on discrete jumps (buttons); keep it instant while dragging
  // a slider so the curve tracks the thumb without lag.
  const [animated, setAnimated] = useState(true);

  // Recharts' ResponsiveContainer measures the DOM, so only mount the
  // chart after hydration to avoid an SSR size-0 / hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, klPQ, klQP } = useMemo(() => {
    const pRaw = XS.map((x) => gaussian(x, P_MU, P_SIGMA));
    const qRaw = XS.map((x) => gaussian(x, muQ, sigmaQ));
    const pSum = pRaw.reduce((a, b) => a + b, 0);
    const qSum = qRaw.reduce((a, b) => a + b, 0);
    const eps = 1e-12;

    let kPQ = 0;
    let kQP = 0;
    const data: Row[] = XS.map((x, i) => {
      const p = pRaw[i] / pSum;
      const q = qRaw[i] / qSum;
      const cPQ = p > eps ? p * Math.log2(p / (q + eps)) : 0;
      const cQP = q > eps ? q * Math.log2(q / (p + eps)) : 0;
      kPQ += cPQ;
      kQP += cQP;
      return { x, P: pRaw[i], Q: qRaw[i], contribPQ: cPQ, contribQP: cQP };
    });
    return { data, klPQ: kPQ, klQP: kQP };
  }, [muQ, sigmaQ]);

  const kl = dir === "PQ" ? klPQ : klQP;
  const contribKey = dir === "PQ" ? "contribPQ" : "contribQP";

  const applyPreset = (p: Preset) => {
    setAnimated(true);
    setMuQ(p.mu);
    setSigmaQ(p.sigma);
  };
  const activePreset = PRESETS.find(
    (p) => Math.abs(p.mu - muQ) < 1e-6 && Math.abs(p.sigma - sigmaQ) < 1e-6,
  );

  // How lopsided are the two directions right now? Drives the asymmetry note.
  const ratio =
    Math.max(klPQ, klQP) / Math.max(Math.min(klPQ, klQP), 1e-6);

  return (
    <div className="kl-demo">
      <div className="kl-head">
        <div className="kl-readout">
          <span className="kl-readout__label">
            <Tex
              tex={
                dir === "PQ"
                  ? "D_{\\mathrm{KL}}(P \\,\\|\\, Q) ="
                  : "D_{\\mathrm{KL}}(Q \\,\\|\\, P) ="
              }
            />
          </span>
          <span className="kl-readout__value">{kl.toFixed(3)}</span>
          <span className="kl-readout__unit">bits</span>
        </div>
        <div className="kl-dir" data-active={dir}>
          <span className="kl-dir__pill" aria-hidden="true" />
          <button
            type="button"
            className={`kl-seg ${dir === "PQ" ? "is-active" : ""}`}
            onClick={() => setDir("PQ")}
          >
            P ‖ Q
          </button>
          <button
            type="button"
            className={`kl-seg ${dir === "QP" ? "is-active" : ""}`}
            onClick={() => setDir("QP")}
          >
            Q ‖ P
          </button>
        </div>
      </div>

      <div className="kl-chart">
        {mounted && (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 4, left: -18 }}
            >
              <defs>
                <linearGradient id="kl-fill-p" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.primary} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={C.primary} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="kl-fill-q" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity={0.26} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="kl-fill-c" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.danger} stopOpacity={0.34} />
                  <stop offset="100%" stopColor={C.danger} stopOpacity={0.04} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke={C.rule} strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="x"
                type="number"
                domain={[X_MIN, X_MAX]}
                ticks={[-6, -4, -2, 0, 2, 4, 6]}
                tick={{ fill: C.muted, fontSize: 12 }}
                stroke={C.rule}
                tickFormatter={(v: number) => `${v}`}
              />
              <YAxis
                tick={{ fill: C.muted, fontSize: 12 }}
                stroke={C.rule}
                width={48}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              {showContrib && (
                <YAxis
                  yAxisId="contrib"
                  orientation="right"
                  hide
                  domain={["auto", "auto"]}
                />
              )}
              <Tooltip
                content={<KLTooltip dir={dir} />}
                cursor={{ stroke: C.muted, strokeDasharray: "3 3" }}
              />
              <ReferenceLine x={0} stroke={C.rule} strokeDasharray="2 4" />

              {showContrib && (
                <Area
                  yAxisId="contrib"
                  type="monotone"
                  dataKey={contribKey}
                  name="contribution"
                  stroke={C.danger}
                  strokeWidth={1}
                  fill="url(#kl-fill-c)"
                  isAnimationActive={animated}
                  animationDuration={450}
                  animationEasing="ease-out"
                />
              )}
              <Area
                type="monotone"
                dataKey="P"
                stroke={C.primary}
                strokeWidth={2}
                fill="url(#kl-fill-p)"
                isAnimationActive={animated}
                animationDuration={450}
                animationEasing="ease-out"
                activeDot={{ r: 3, fill: C.primary, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="Q"
                stroke={C.accent}
                strokeWidth={2}
                fill="url(#kl-fill-q)"
                isAnimationActive={animated}
                animationDuration={450}
                animationEasing="ease-out"
                activeDot={{ r: 3, fill: C.accent, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="kl-legend">
        <span className="kl-legend__item">
          <span className="kl-dot" style={{ background: C.primary }} />
          <Tex tex="P = \mathcal{N}(0,\, 1)" />（参考分布，固定）
        </span>
        <span className="kl-legend__item">
          <span className="kl-dot" style={{ background: C.accent }} />
          <Tex tex={`Q = \\mathcal{N}(${muQ.toFixed(2)},\\, ${sigmaQ.toFixed(2)})`} />（可调）
        </span>
        {showContrib && (
          <span className="kl-legend__item">
            <span className="kl-dot" style={{ background: C.danger }} />
            逐点散度贡献
          </span>
        )}
      </div>

      <div className="kl-controls">
        <label className="kl-slider">
          <span className="kl-slider__label">
            <Tex tex="\mu_Q" />
            <b>{muQ.toFixed(2)}</b>
          </span>
          <input
            type="range"
            min={-3}
            max={3}
            step={0.05}
            value={muQ}
            onChange={(e) => {
              setAnimated(false);
              setMuQ(Number(e.target.value));
            }}
          />
        </label>
        <label className="kl-slider">
          <span className="kl-slider__label">
            <Tex tex="\sigma_Q" />
            <b>{sigmaQ.toFixed(2)}</b>
          </span>
          <input
            type="range"
            min={0.3}
            max={3}
            step={0.05}
            value={sigmaQ}
            onChange={(e) => {
              setAnimated(false);
              setSigmaQ(Number(e.target.value));
            }}
          />
        </label>
      </div>

      <div className="kl-presets">
        {PRESETS.map((p) => (
          <button
            type="button"
            key={p.id}
            className={`btn btn-ghost kl-preset ${activePreset?.id === p.id ? "is-active" : ""}`}
            onClick={() => applyPreset(p)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`btn btn-ghost kl-preset ${showContrib ? "is-active" : ""}`}
          onClick={() => {
            setAnimated(true);
            setShowContrib((v) => !v);
          }}
        >
          {showContrib ? "隐藏散度密度" : "显示散度密度"}
        </button>
      </div>

      <div className="kl-explain">
        <p className="kl-explain__base">
          <Tex tex="D_{\mathrm{KL}}(P\,\|\,Q)" /> 衡量「拿 <Tex tex="Q" /> 去编码真正来自{" "}
          <Tex tex="P" /> 的样本，平均多花几 bit」。它恒 <Tex tex="\ge 0" />，且仅当{" "}
          <Tex tex="P = Q" /> 时为 0。
        </p>
        <div className={`callout callout-${dir === "PQ" ? "primary" : "accent"}`}>
          <p>{DIR_NOTE[dir]}</p>
        </div>
        {ratio > 1.15 && (
          <p className="kl-explain__asym">
            此刻 D(P‖Q) = {klPQ.toFixed(3)}、D(Q‖P) = {klQP.toFixed(3)}，相差约{" "}
            {ratio.toFixed(1)}×——KL 不是距离，左右不能互换。
          </p>
        )}
        {activePreset && (
          <p className="kl-explain__hint">{activePreset.hint}</p>
        )}
      </div>
    </div>
  );
}
