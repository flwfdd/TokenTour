---
name: aligning-blog-playground-terminology
description: >-
  Use when checking or fixing terminology consistency between the chat2token
  blog and playground, when panel/chip/stat labels diverge across zh/en copy,
  when renaming a product term, or when the user mentions inconsistent naming,
  glossary drift, or blog vs playground wording mismatches.
---

# Aligning blog ↔ playground terminology

Keep TokenTour's **blog** and **playground** using the same names for the same concepts so readers can jump between long-form prose and the interactive UI without cognitive friction.

## Surfaces in scope

| Surface | Paths |
| --- | --- |
| Playground UI copy | `topics/chat2token/app/` — `*Copy` objects, `locale.ts`, Pane `title`s, `Intro.tsx` |
| Blog prose + labs | `topics/chat2token/blog/{zh,en}/index.astro`, `topics/chat2token/blog/*Lab.astro`, `MessageView.astro`, `TemplateLab.astro` |
| Supporting docs | `docs/GUIDE.md`, `topics/chat2token/docs/outline.md`, `topics/chat2token/app/tour/tourCopy.ts` |

Out of scope unless the user asks: video narration (`topics/chat2token/video/`), Remotion hard-coded strings.

## Source-of-truth rules

1. **UI labels** (panel titles, legend chips, stat cards, button names the blog tells the reader to click) → **playground is canonical**. Blog and GUIDE must match those strings exactly when referring to the UI.
2. **Pedagogical first mention** may gloss a concept as `中文（English）` or `English (中文)`, but subsequent references to a playground control must use the playground string.
3. **Code identifiers** (`reused`, `prefill`, `tools_schema`, role enums) stay English in code; user-facing copy uses the glossary.
4. **Do not invent synonyms** for the same UI concept (e.g. do not mix「缓存命中」alone with「缓存命中输入」when naming the KV chip).
5. After any rename, update both languages and [glossary.md](glossary.md).

Read [glossary.md](glossary.md) before scanning or editing.

## Workflow

Copy and track:

```
Terminology pass:
- [ ] 1. Load glossary + extract playground strings
- [ ] 2. Scan blog (and GUIDE if touched) for concept mentions
- [ ] 3. Diff → report inconsistencies
- [ ] 4. Fix (or ask when rule is ambiguous)
- [ ] 5. Update glossary if terms changed
- [ ] 6. Spot-check zh + en still aligned with each other
```

### 1. Extract playground strings

Collect user-facing labels from:

- Pane titles: `LensChatTemplate` (`Chat Template`), `LensTokens` (`Tokens`), `AgentChat` Messages subsection (`Messages` / `消息`), `LensContextKv` (`Context × KV Cache`)
- KV state chips: `STATE_LABEL` in `LensContextKv.tsx`
- Role chips: `SEGMENT_LABELS` in `locale.ts`
- Stat / legend / help copy: `kvCopy`, `Intro.tsx`, other `*Copy` maps
- Cross-check `docs/GUIDE.md` tables against those strings

### 2. Scan the blog

For each glossary concept (and any new label found in step 1), search blog + labs for:

- Exact canonical string
- Known aliases / near-misses listed in glossary
- Synonyms that describe the same UI control or stat

Search both `blog/zh` and `blog/en`. Lab `copy` objects must match prose color/term semantics (see `blog/AGENTS.md`).

### 3. Report format

Before editing, list findings:

```markdown
## Terminology diff

| Concept | Canonical (playground) | Found in blog/docs | Severity | Action |
| --- | --- | --- | --- | --- |
| KV reused chip | 缓存命中输入 / cached input | 「缓存命中」 alone in §… | high | rename to full chip label when naming the UI |
| … | … | … | … | … |

Severity:
- high — names a playground panel/chip/stat differently
- medium — conceptual synonym that will confuse a jump-to-playground reader
- low — acceptable pedagogical paraphrase; leave or lightly tighten
```

### 4. Fix

- Prefer **minimal string edits** that restore the canonical label.
- When blog teaches a broader idea (e.g.「前缀缓存 / Prefix Caching」) that is **not** a playground chip name, keep it — but when pointing at the three-color bar, use `缓存命中输入 / 缓存未命中输入 / 输出` (and EN equivalents).
- Keep zh and en **concept-aligned** (same structure); do not "fix" one locale by inventing a third naming scheme.
- If two playground strings themselves disagree, fix playground first, then cascade to blog + GUIDE + glossary. Ask the user which string wins if unclear.
- Do not change design tokens, class names, or code enums as part of a terminology pass unless the user asked for a rename in code too.

### 5. Update glossary

Add or revise rows in [glossary.md](glossary.md) for every term you changed or newly standardized. Include banned aliases.

### 6. Verify

- Grep for banned aliases from the glossary.
- Confirm GUIDE.md panel/chip tables still match playground.
- If only zh or only en was requested, still note cross-locale drift if you spot it.

## Decision guide

```
Referring to a visible playground control?
  YES → must match playground string exactly
  NO  → is it the same underlying concept the UI names?
          YES → prefer glossary term; avoid one-off synonyms
          NO  → pedagogical wording OK (record in glossary if reused)
```

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Shortening「缓存命中输入」→「缓存命中」when naming the chip | Use the full chip label |
| Writing「Context × KV」for the panel title | Playground pane is **Context × KV Cache** |
| Mixing「分词器面板」with pane title **Tokens** | Call the pane Tokens;「分词器」OK for the concept |
| Updating blog zh but not en (or vice versa) | Keep both locales in the same pass |
| "Fixing" video scripts unprompted | Stay in blog + playground (+ GUIDE) unless asked |

## Example

**Bad (blog callout):** 「底部的 KV 三色条显示命中 / 未命中 / 生成」

**Good:** 「底部的 Context × KV Cache 面板把整段上下文画成「缓存命中输入 / 缓存未命中输入 / 输出」三色条」

(Matches `Intro.tsx` + `STATE_LABEL` + GUIDE.md.)
