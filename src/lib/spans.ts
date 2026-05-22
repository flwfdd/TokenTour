import type { Message, ToolSpec, Role, TokenSegment } from "./types";
import { renderChatTemplate } from "./template";
import { getTemplateBundle } from "./chatTemplates";
import type { SegmentSpan } from "./tokenizer";

function roleToSegment(role: Role): TokenSegment {
  if (role === "system") return "system";
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  if (role === "tool") return "tool";
  return "control";
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

  const rendered = renderChatTemplate({ messages, tools, family, addGenerationPrompt });
  const cleanedText = rendered.text;
  const bundle = getTemplateBundle(family);

  // ── Per-message boundary discovery ──────────────────────────────────────
  // Forward-scan: for each message in order, find the earliest occurrence
  // of its opening signature at or after `cursor`, then advance `cursor` past
  // the matched signature so the next message's search can't accidentally
  // back-match into this message's body.
  const boundaries: number[] = new Array(messages.length + 1);
  let cursor = 0;
  for (let i = 0; i < messages.length; i++) {
    const sig = bundle.messageOpening?.(messages[i]!, i, messages) ?? null;
    if (sig) {
      const re = new RegExp(sig);
      const m = re.exec(cleanedText.slice(cursor));
      if (m) {
        boundaries[i] = cursor + m.index;
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
    const withoutGen = renderChatTemplate({
      messages,
      tools,
      family,
      addGenerationPrompt: false,
    }).text;
    const diff = cleanedText.length - withoutGen.length;
    if (diff > 0) {
      let i = 0;
      const max = Math.min(cleanedText.length, withoutGen.length);
      while (i < max && cleanedText[i] === withoutGen[i]) i++;
      genStart = i;
      genEnd = i + diff;
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
    messageSpans.push({ start: genStart, end: genEnd, segment: "generation" });
  }

  // ── Tools-schema overlay ────────────────────────────────────────────────
  if (tools && tools.length > 0) {
    const withoutTools = renderChatTemplate({
      messages,
      family,
      addGenerationPrompt,
    }).text;
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
        if (ms.start < te && ms.end > ts && ms.segment !== "generation") {
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
        if (!m.content || m.content.length < 4) continue; // skip short fragments that are likely false positives
        const idx = cleanedText.indexOf(m.content, ms.start);
        if (idx < 0 || idx + m.content.length > ms.end) continue;
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

  messageSpans.sort((a, b) => a.start - b.start);
  return { cleanedText, spans: messageSpans };
}
