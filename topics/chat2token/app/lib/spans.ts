import type { Message, ToolSpec, Role, TokenSegment } from "./types";
import { renderChatTemplate } from "./template";
import { getTemplateBundle } from "./chatTemplates";
import type { SegmentSpan } from "./tokenizer";

/** Type-only re-export so callers can still `import type { SegmentSpan }` from spans/pipeline. */
export type { SegmentSpan };

function roleToSegment(role: Role): TokenSegment {
  if (role === "system") return "system";
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  if (role === "tool") return "tool";
  return "system";
}

export interface ComputedSpans {
  cleanedText: string;
  spans: SegmentSpan[];
}

/**
 * Renders the template once, then derives per-message character-range spans
 * by searching forward for each message's *opening signature* (e.g.
 * `<|im_start|>assistant\n` for Qwen, `<|start|>functions.{name} to=assistant`
 * for a GPT-OSS tool message). This is more robust than the older
 * marker-injection approach because some templates either don't render
 * `message.content` directly (GPT-OSS assistant tool-calls only emit
 * `tool_call.arguments`) or pass it through `|tojson` which escapes our
 * sentinel control characters into literal text.
 *
 * Layered overlays applied after the per-message scan:
 *   - Generation-prompt suffix (split off as its own segment, derived by
 *     diffing against a render with `add_generation_prompt=false`).
 *   - Tools-schema region (typically nested inside the auto-injected system
 *     block in GPT-OSS or the user's system message in Qwen), overlaid by
 *     diffing against a render without tools.
 *   - Any prefix before the first message's opening (auto-injected
 *     system+developer blocks in GPT-OSS) is labelled as `system`.
 */
export function computeSpans(args: {
  messages: Message[];
  tools?: ToolSpec[];
  family: string;
  addGenerationPrompt?: boolean;
}): ComputedSpans {
  const { messages, tools, family, addGenerationPrompt = true } = args;

  const cleanedText = renderChatTemplate({ messages, tools, family, addGenerationPrompt });
  const bundle = getTemplateBundle(family);

  // ── Per-message boundary discovery ──────────────────────────────────────
  // Forward-scan: for each message in order, find the earliest occurrence
  // of its opening signature at or after `cursor`, then advance `cursor` past
  // the matched signature so the next message's search can't accidentally
  // back-match into this message's body.
  const boundaries: number[] = new Array(messages.length + 1);
  // Length of each message's matched opening marker (e.g. `<｜User｜>`), so we
  // can re-assert the marker as the message's own segment after the overlays.
  const markerLens: number[] = new Array(messages.length).fill(0);
  let cursor = 0;
  for (let i = 0; i < messages.length; i++) {
    const sig = bundle.messageOpening?.(messages[i]!, i, messages) ?? null;
    if (sig) {
      const re = new RegExp(sig);
      const m = re.exec(cleanedText.slice(cursor));
      if (m) {
        boundaries[i] = cursor + m.index;
        markerLens[i] = m[0].length;
        cursor = cursor + m.index + m[0].length;
        continue;
      }
    }
    // Fallback (e.g. DeepSeek system, or signature genuinely absent): keep
    // the message anchored at the current cursor, contributing a zero-width
    // span that the loop below will silently skip.
    boundaries[i] = cursor;
  }

  // ── Generation prompt detection ─────────────────────────────────────────
  let genStart = cleanedText.length;
  let genEnd = cleanedText.length;
  if (addGenerationPrompt) {
    // Templates that glue the assistant trigger onto the last user turn
    // (DeepSeek) produce no diff against `add_generation_prompt=false`, so
    // rely on the declared trailing marker instead. The marker is the LAST
    // occurrence followed by only whitespace — DeepSeek emits a few trailing
    // newlines from its un-trimmed `{% if %}` tail, so a plain `endsWith`
    // would miss it, and the same marker also appears glued to every earlier
    // user turn.
    const marker = bundle.generationPrompt;
    const lastIdx = marker ? cleanedText.lastIndexOf(marker) : -1;
    if (
      marker &&
      lastIdx >= 0 &&
      /^\s*$/.test(cleanedText.slice(lastIdx + marker.length))
    ) {
      genStart = lastIdx;
      genEnd = cleanedText.length;
    } else {
      const withoutGen = renderChatTemplate({
        messages,
        tools,
        family,
        addGenerationPrompt: false,
      });
      const diff = cleanedText.length - withoutGen.length;
      if (diff > 0) {
        let i = 0;
        const max = Math.min(cleanedText.length, withoutGen.length);
        while (i < max && cleanedText[i] === withoutGen[i]) i++;
        genStart = i;
        genEnd = i + diff;
      }
    }
  }

  boundaries[messages.length] =
    addGenerationPrompt && genStart < cleanedText.length ? genStart : cleanedText.length;

  // ── Assemble spans ──────────────────────────────────────────────────────
  const messageSpans: SegmentSpan[] = [];

  // Prefix region (GPT-OSS auto-injected system+developer blocks). Label as
  // system because that's what the upstream emits — tools-schema overlay
  // below will carve out the developer/Tools portion separately.
  if (boundaries[0]! > 0) {
    messageSpans.push({
      start: 0,
      end: boundaries[0]!,
      segment: "system",
      role: "system",
    });
  }

  for (let i = 0; i < messages.length; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    if (end > start) {
      messageSpans.push({
        start,
        end,
        segment: roleToSegment(messages[i]!.role),
        role: messages[i]!.role,
        messageId: messages[i]!.id,
      });
    }
  }

  if (genStart < genEnd) {
    // The generation prompt opens the assistant's turn, so it's coloured as
    // `assistant` (it has no message id — it isn't a real message).
    messageSpans.push({ start: genStart, end: genEnd, segment: "assistant", role: "assistant" });
  }

  // ── Tools-schema overlay ────────────────────────────────────────────────
  if (tools && tools.length > 0) {
    const withoutTools = renderChatTemplate({
      messages,
      family,
      addGenerationPrompt,
    });
    const lenDiff = cleanedText.length - withoutTools.length;
    if (lenDiff > 0) {
      // Find divergence by walking from BOTH ends and computing the smallest
      // contiguous tools-injected region. This avoids over-claiming when
      // template-injected text is split into multiple chunks with shared
      // text (e.g. user system content) in between.
      let pre = 0;
      while (
        pre < cleanedText.length &&
        pre < withoutTools.length &&
        cleanedText[pre] === withoutTools[pre]
      )
        pre++;
      let post = 0;
      while (
        post < cleanedText.length - pre &&
        post < withoutTools.length - pre &&
        cleanedText[cleanedText.length - 1 - post] === withoutTools[withoutTools.length - 1 - post]
      )
        post++;
      const ts = pre;
      const te = cleanedText.length - post;
      for (let s = messageSpans.length - 1; s >= 0; s--) {
        const ms = messageSpans[s]!;
        if (ms.start < te && ms.end > ts) {
          const replacement: SegmentSpan[] = [];
          if (ms.start < ts) {
            replacement.push({
              start: ms.start,
              end: ts,
              segment: ms.segment,
              role: ms.role,
              messageId: ms.messageId,
            });
          }
          replacement.push({
            start: Math.max(ms.start, ts),
            end: Math.min(ms.end, te),
            segment: "tools_schema",
          });
          if (ms.end > te) {
            replacement.push({
              start: te,
              end: ms.end,
              segment: ms.segment,
              role: ms.role,
              messageId: ms.messageId,
            });
          }
          messageSpans.splice(s, 1, ...replacement);
        }
      }
    }
    // Some templates (notably GPT-OSS) embed the user's system content
    // INSIDE the auto-generated developer block when tools are present
    // (e.g. `# Instructions\n\n{system_content}\n\n# Tools …`). The
    // tools_schema overlay above will swallow the verbatim system content
    // because it sits between two tools-injected fragments. Carve any
    // exact-match message content back out as its own span so hovering on
    // the message lights up the right region.
    for (let s = messageSpans.length - 1; s >= 0; s--) {
      const ms = messageSpans[s]!;
      if (ms.segment !== "tools_schema") continue;
      for (const m of messages) {
        if (!m.content) continue;
        const len = m.content.length;
        const idx = cleanedText.indexOf(m.content, ms.start);
        if (idx < 0 || idx + len > ms.end) continue;
        // Short content (e.g. an emoji-only system prompt, length 2) can match
        // coincidentally inside the JSON schema, so the old code skipped
        // anything < 4 chars — but that mislabeled short genuine content as
        // tools_schema. The verbatim system content is ALWAYS present in the
        // region, so a SOLE occurrence must be it; only bail when a short
        // string is ambiguous (matches more than once in the schema region).
        if (len < 4) {
          const next = cleanedText.indexOf(m.content, idx + 1);
          if (next >= 0 && next + len <= ms.end) continue;
        }
        const replacement: SegmentSpan[] = [];
        if (ms.start < idx) {
          replacement.push({ start: ms.start, end: idx, segment: "tools_schema" });
        }
        replacement.push({
          start: idx,
          end: idx + m.content.length,
          segment: roleToSegment(m.role),
          role: m.role,
          messageId: m.id,
        });
        if (idx + m.content.length < ms.end) {
          replacement.push({
            start: idx + m.content.length,
            end: ms.end,
            segment: "tools_schema",
          });
        }
        messageSpans.splice(s, 1, ...replacement);
        break;
      }
    }
  }

  // ── Re-assert opening markers ───────────────────────────────────────────
  // A message's opening marker (e.g. DeepSeek's `<｜User｜>`) always belongs to
  // the message it opens. The tools-schema overlay diffs by character and can
  // bracket such a marker between two schema fragments, mislabeling it as
  // `tools_schema` (the content carve-back only restores message *bodies*, not
  // markers — that's how the user message's leading `<` ended up pink). Force
  // each marker range back onto its own message segment.
  for (let i = 0; i < messages.length; i++) {
    const len = markerLens[i]!;
    if (len <= 0) continue;
    const mStart = boundaries[i]!;
    forceSegment(messageSpans, mStart, mStart + len, {
      segment: roleToSegment(messages[i]!.role),
      role: messages[i]!.role,
      messageId: messages[i]!.id,
    });
  }

  messageSpans.sort((a, b) => a.start - b.start);
  return { cleanedText, spans: messageSpans };
}

/**
 * Overwrite the character range `[start, end)` with a single `forced` span,
 * trimming/removing any spans it overlaps. Mutates `spans` in place.
 */
function forceSegment(
  spans: SegmentSpan[],
  start: number,
  end: number,
  forced: Pick<SegmentSpan, "segment" | "role" | "messageId">,
): void {
  if (end <= start) return;
  for (let s = spans.length - 1; s >= 0; s--) {
    const ms = spans[s]!;
    if (ms.end <= start || ms.start >= end) continue; // no overlap
    const remnants: SegmentSpan[] = [];
    if (ms.start < start) remnants.push({ ...ms, end: start });
    if (ms.end > end) remnants.push({ ...ms, start: end });
    spans.splice(s, 1, ...remnants);
  }
  spans.push({ start, end, ...forced });
}
