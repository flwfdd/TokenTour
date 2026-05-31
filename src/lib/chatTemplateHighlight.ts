// Function-coloring for rendered chat-template text, so the blog's static
// template examples read the *same* way as the playground's live Chat Template
// pane: every span is tinted by the role/function it belongs to, and special
// tokens (`<|im_start|>`, `<｜User｜>`, `<|message|>`, …) are drawn bold in that
// same hue.
//
// The playground gets its segments "for free" from the tokenizer + Jinja
// diffing pipeline (see app/lib/spans.ts). Here we only have the frozen,
// hand-authored output strings, so we re-derive segments with a small per-family
// scanner keyed on each family's special tokens. The mapping (system → purple,
// schema → pink, user → cyan, assistant → green, tool → orange) matches
// `--color-role-*` in the playground theme.

export type Seg =
  | "system"
  | "schema"
  | "user"
  | "assistant"
  | "tool";

/** Working segment: a role, or `null` for neutral/structural text (no tint). */
export type SegOrNeutral = Seg | null;

export interface Piece {
  text: string;
  seg: SegOrNeutral;
  /** Special token → rendered bold + in the segment hue. */
  special: boolean;
  /**
   * Index of the source message this piece renders (set by `attachMessageIndices`
   * when a `messages` array is supplied). Lets the hover bus light up a single
   * message — not just its role — across panes. `undefined` = belongs to no one
   * message (tools schema, injected boilerplate, generation prompt, structure).
   */
  mi?: number;
}

/** The slice of a message we need to align template turns back to messages. */
export interface TemplateMessage {
  role?: string;
  content?: string;
  reasoning_content?: string;
  tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }>;
}

export type TemplateFamily = "qwen" | "deepseek" | "gptoss";

/** Segment metadata shared with the legend / hover bus (TemplateLab). */
export const SEG_ORDER: Seg[] = ["system", "schema", "user", "assistant", "tool"];
export const SEG_LABEL: Record<Seg, string> = {
  system: "system",
  schema: "tools schema",
  user: "user",
  assistant: "assistant",
  tool: "tool result",
};

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Render a template string to the inner HTML of a `<code>` element: one
 * `<span class="line">` per line, each holding role-tinted token spans. Every
 * colored span carries `data-seg` so a hover bus (TemplateLab) can light up the
 * matching role across panes. Shared by ChatTemplate.astro and TemplateLab.astro.
 */
export function renderTemplateLines(
  code: string,
  family: TemplateFamily,
  baseSeg: SegOrNeutral = null,
  messages?: TemplateMessage[],
): string {
  return toLines(highlightChatTemplate(code, family, baseSeg, messages))
    .map((pieces) => {
      const inner = pieces
        .map((p) => {
          const t = escHtml(p.text);
          if (p.seg === null) return `<span>${t}</span>`;
          const cls = p.special ? "ct-tok ct-tok--sp" : "ct-tok";
          const msg = p.mi !== undefined ? ` data-msg="${p.mi}"` : "";
          return `<span class="${cls}" data-seg="${p.seg}"${msg} style="--seg:var(--ct-${p.seg})">${t}</span>`;
        })
        .join("");
      return `<span class="line">${inner}</span>`;
    })
    .join("");
}

/** Distinct, ordered segments that actually appear in a template render. */
export function segmentsIn(code: string, family: TemplateFamily, baseSeg: SegOrNeutral = null): Seg[] {
  const present = new Set<Seg>();
  for (const p of highlightChatTemplate(code, family, baseSeg)) {
    if (p.seg !== null) present.add(p.seg);
  }
  return SEG_ORDER.filter((s) => present.has(s));
}

/** Split a flat piece list into per-line piece lists (drops the `\n`s). */
export function toLines(pieces: Piece[]): Piece[][] {
  const lines: Piece[][] = [[]];
  for (const p of pieces) {
    const parts = p.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push({ text: part, seg: p.seg, special: p.special, mi: p.mi });
    });
  }
  return lines;
}

export function highlightChatTemplate(
  code: string,
  family: TemplateFamily,
  baseSeg: SegOrNeutral = null,
  messages?: TemplateMessage[],
): Piece[] {
  let pieces: Piece[];
  switch (family) {
    case "qwen":
      pieces = parseQwen(code, baseSeg);
      break;
    case "deepseek":
      pieces = parseDeepseek(code, baseSeg);
      break;
    case "gptoss":
      pieces = parseGptoss(code, baseSeg);
      break;
    default:
      pieces = [{ text: code, seg: baseSeg, special: false }];
  }
  if (messages && messages.length) attachMessageIndices(pieces, family, messages);
  return pieces;
}

// ── Per-message alignment ────────────────────────────────────────────────────
// The parsers above color by *role*; this pass additionally ties each piece to
// the *specific* message it renders, so a hover can light up one message's turn
// rather than every turn of that role.
//
// Approach: a chat template is rendered FROM the message list in order, but the
// turn↔message map isn't 1:1 (GPT-OSS injects a boilerplate `system` turn and
// splits the final assistant turn into analysis+final channels; DeepSeek
// interleaves assistant tool-calls and tool-outputs inside ONE assistant turn;
// tools schema lives inside a turn but belongs to no message). So instead of
// counting turns we match by content over *segment runs*: a run is a maximal
// stretch of pieces sharing one role (`null`/`schema` pieces break runs and
// stay unlinked). For each run we pick the message of that role whose most
// distinctive text the run contains. Robust across all three families.

// Distinctive needles for a message (≥2 chars, trimmed) — content, reasoning,
// and each tool call's function name + arguments.
function messageNeedles(m: TemplateMessage): string[] {
  const out: string[] = [];
  const add = (s: unknown) => {
    if (typeof s === "string") {
      const t = s.trim();
      if (t.length >= 2) out.push(t);
    }
  };
  add(m.content);
  add(m.reasoning_content);
  for (const tc of m.tool_calls ?? []) {
    add(tc?.function?.name);
    const a = tc?.function?.arguments;
    add(typeof a === "string" ? a : a != null ? JSON.stringify(a) : undefined);
  }
  return out;
}

// Whitespace is unreliable across templates (e.g. a tool call's arguments are
// re-serialized with/without spaces), so we compare ignoring all whitespace.
const squash = (s: string) => s.replace(/\s+/g, "");

function attachMessageIndices(pieces: Piece[], _family: TemplateFamily, messages: TemplateMessage[]): void {
  const needles = messages.map((m) => messageNeedles(m).map(squash).filter((n) => n.length >= 2));

  // 1) Group consecutive pieces into role runs. `null` (structural) and
  //    `schema` (tools, belongs to no message) pieces break the current run.
  const runs: { role: Seg; idxs: number[] }[] = [];
  let cur: { role: Seg; idxs: number[] } | null = null;
  pieces.forEach((p, idx) => {
    if (p.seg === null || p.seg === "schema") {
      cur = null;
      return;
    }
    if (!cur || cur.role !== p.seg) {
      cur = { role: p.seg, idxs: [] };
      runs.push(cur);
    }
    cur.idxs.push(idx);
  });

  // 2) For each run, pick the message of that role whose longest needle the run
  //    text contains; tag the run's pieces with it. Unmatched runs (injected
  //    boilerplate, generation prompt, stray closers) stay unlinked.
  for (const run of runs) {
    const text = squash(run.idxs.map((i) => pieces[i]!.text).join(""));
    let bestMi = -1;
    let bestLen = 0;
    messages.forEach((m, mi) => {
      if (m.role !== run.role) return;
      for (const n of needles[mi]!) {
        if (n.length > bestLen && text.includes(n)) {
          bestLen = n.length;
          bestMi = mi;
        }
      }
    });
    if (bestMi < 0) continue;
    for (const i of run.idxs) pieces[i]!.mi = bestMi;
  }
}

// A closing token (`<|im_end|>`, `<｜end▁of▁sentence｜>`, `<|end|>`, …) belongs to
// the message it closes. While we're inside the injected tool schema (which
// only ever lives inside the system turn), that means the closer is `system`,
// not `schema`; every other segment already carries the right role.
const closeSeg = (seg: SegOrNeutral): SegOrNeutral => (seg === "schema" ? "system" : seg);

// ── Qwen3 ──────────────────────────────────────────────────────────────────
// `<|im_start|>role\n … <|im_end|>`. Tool results are wrapped in a *user* block
// whose body is `<tool_response>…</tool_response>`; per the playground we color
// the whole such block as `tool`. Tool schema is injected into the system turn
// (from `# Tools` onward), so it's colored as schema like the playground.
function parseQwen(text: string, base: SegOrNeutral): Piece[] {
  const out: Piece[] = [];
  let seg: SegOrNeutral = base;
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) out.push({ text: buf, seg, special: false });
    buf = "";
  };
  while (i < text.length) {
    if (text.startsWith("<|im_start|>", i)) {
      flush();
      const rest = text.slice(i + "<|im_start|>".length);
      const role = /^([a-z]+)/.exec(rest)?.[1] ?? "";
      let blockSeg: SegOrNeutral =
        role === "system"
          ? "system"
          : role === "user"
            ? "user"
            : role === "assistant"
              ? "assistant"
              : null;
      // A user block that opens straight into a <tool_response> is really a
      // tool-result turn → color it orange like the playground does.
      if (role === "user" && /^user\s*\n\s*<tool_response>/.test(rest)) blockSeg = "tool";
      seg = blockSeg;
      out.push({ text: "<|im_start|>", seg, special: true });
      i += "<|im_start|>".length;
      if (role) {
        out.push({ text: role, seg, special: false });
        i += role.length;
      }
      continue;
    }
    if (text.startsWith("<|im_end|>", i)) {
      flush();
      out.push({ text: "<|im_end|>", seg: closeSeg(seg), special: true });
      i += "<|im_end|>".length;
      seg = null;
      continue;
    }
    if (seg === "system" && text.startsWith("# Tools", i)) {
      flush();
      seg = "schema";
    }
    buf += text[i++];
  }
  flush();
  return out;
}

// ── DeepSeek-V3 ──────────────────────────────────────────────────────────────
// `<｜begin▁of▁sentence｜>` opens the system prompt; `<｜User｜>` / `<｜Assistant｜>`
// switch turns; `<｜end▁of▁sentence｜>` closes one. Tool *calls* are part of the
// assistant turn; tool *outputs* are fenced by `<｜tool▁outputs▁begin｜>…end`. The
// injected tool schema (everything from `# Tools` to the end of the system
// prompt) is colored as schema.
const DS_SPECIALS = [
  "<｜begin▁of▁sentence｜>",
  "<｜end▁of▁sentence｜>",
  "<｜User｜>",
  "<｜Assistant｜>",
  "<｜tool▁calls▁begin｜>",
  "<｜tool▁calls▁end｜>",
  "<｜tool▁call▁begin｜>",
  "<｜tool▁call▁end｜>",
  "<｜tool▁sep｜>",
  "<｜tool▁outputs▁begin｜>",
  "<｜tool▁outputs▁end｜>",
  "<｜tool▁output▁begin｜>",
  "<｜tool▁output▁end｜>",
];
function parseDeepseek(text: string, base: SegOrNeutral): Piece[] {
  const out: Piece[] = [];
  let seg: SegOrNeutral = base;
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) out.push({ text: buf, seg, special: false });
    buf = "";
  };
  while (i < text.length) {
    const tok = DS_SPECIALS.find((t) => text.startsWith(t, i));
    if (tok) {
      flush();
      // Segment transitions that take effect *before* the token is painted.
      if (tok === "<｜begin▁of▁sentence｜>") seg = "system";
      else if (tok === "<｜User｜>") seg = "user";
      else if (tok === "<｜Assistant｜>") seg = "assistant";
      else if (tok === "<｜tool▁outputs▁begin｜>" || tok === "<｜tool▁output▁begin｜>") seg = "tool";
      out.push({ text: tok, seg: tok === "<｜end▁of▁sentence｜>" ? closeSeg(seg) : seg, special: true });
      i += tok.length;
      // Transitions that take effect *after* the token.
      if (tok === "<｜end▁of▁sentence｜>") seg = null;
      else if (tok === "<｜tool▁outputs▁end｜>") seg = "assistant";
      continue;
    }
    // The injected tool block starts at "# Tools" inside the system prompt.
    if (seg === "system" && text.startsWith("# Tools", i)) {
      flush();
      seg = "schema";
    }
    buf += text[i++];
  }
  flush();
  return out;
}

// ── GPT-OSS (Harmony) ────────────────────────────────────────────────────────
// `<|start|>{header}<|channel|>…<|message|>…<|end|>` (or `<|call|>`/`<|return|>`).
// The header decides the segment: `functions.*` (a tool result) → tool,
// `assistant…` → assistant, `user` → user, `system`/`developer` → system. The
// `# Tools` namespace block inside the developer turn is colored as schema.
const GO_SPECIALS = ["<|start|>", "<|channel|>", "<|message|>", "<|end|>", "<|call|>", "<|return|>"];
function parseGptoss(text: string, base: SegOrNeutral): Piece[] {
  const out: Piece[] = [];
  let seg: SegOrNeutral = base;
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) out.push({ text: buf, seg, special: false });
    buf = "";
  };
  while (i < text.length) {
    const tok = GO_SPECIALS.find((t) => text.startsWith(t, i));
    if (tok) {
      flush();
      if (tok === "<|start|>") {
        const header = /^([^<]*)/.exec(text.slice(i + tok.length))?.[1] ?? "";
        seg = header.startsWith("functions.")
          ? "tool"
          : header.startsWith("assistant")
            ? "assistant"
            : header.startsWith("user")
              ? "user"
              : header.startsWith("system") || header.startsWith("developer")
                ? "system"
                : null;
        out.push({ text: tok, seg, special: true });
        i += tok.length;
        if (header) {
          out.push({ text: header, seg, special: false });
          i += header.length;
        }
        continue;
      }
      const closing = tok === "<|end|>" || tok === "<|call|>" || tok === "<|return|>";
      out.push({ text: tok, seg: closing ? closeSeg(seg) : seg, special: true });
      i += tok.length;
      if (closing) seg = null;
      continue;
    }
    if (seg === "system" && text.startsWith("# Tools", i)) {
      flush();
      seg = "schema";
    }
    buf += text[i++];
  }
  flush();
  return out;
}
