# chat2token terminology glossary

Canonical user-facing terms for blog ↔ playground alignment.
**Playground wins** for UI labels. Update this file whenever those labels change.

Banned aliases are strings that must not name the same UI concept.

---

## Panels / regions

| Concept | Playground (en) | Playground (zh) | Notes / banned |
| --- | --- | --- | --- |
| Left column (whole) | Chat | 对话 | System prompt + tools + Messages + input. Intro / GUIDE region name. |
| Messages subsection | Messages | 消息 | Header `Messages · N` / `消息 · N`. Not a separate Pane title. Callouts may say「Messages 面板」/ “Messages panel”. |
| Template pane | Chat Template | Chat Template | Pane title in `LensChatTemplate`. Banned as pane title:「模板」alone. |
| Token pane | Tokens | Tokens | Pane title in `LensTokens`. Concept「分词器 / tokenizer」OK; pane title is Tokens. |
| Bottom KV pane | Context × KV Cache | Context × KV Cache | Pane title in `LensContextKv`. Banned shorthand as pane title: `Context × KV`. |

Blog chapter headings may stay `Messages` / `Chat Template` / `Tokens` / `KV Cache`. When **pointing at the app**, use the pane / region titles above.

Button: **View JSON** / **查看 JSON** (not「View Messages JSON」/「查看 Messages JSON」).

---

## KV cache states (legend chips + GUIDE stats)

Source: `LensContextKv.tsx` → `STATE_LABEL`

| Internal | Playground (en) | Playground (zh) | Banned aliases (when naming this chip/stat) |
| --- | --- | --- | --- |
| `reused` | cached input | 缓存命中输入 | 命中 alone, 命中输入, 缓存命中 (without 输入), reused (in UI copy) |
| `prefill` | uncached input | 缓存未命中输入 | 未命中 alone, 未命中输入, 需重算 (lab-only OK for PrefixCacheLab cells), prefill (in UI copy) |
| `decode` | output | 输出 | 生成, generation (as chip name) |
| `pending` | unused | 未占用 | empty, free |

Pedagogical OK:「缓存命中 / 缓存未命中」when discussing **pricing** or the general idea of prefix hit rate — not when naming the three playground chips.

Lab-specific (PrefixCacheLab / AttentionKvLab):「命中」green /「需重算」red /「读缓存」are lab-local; do not replace playground chip names with these when describing Context × KV Cache.

---

## Roles / segments

Source: `locale.ts` → `SEGMENT_LABELS` (and `RoleLegend` chip order)

| Internal | en | zh |
| --- | --- | --- |
| `system` | system | system |
| `tools_schema` | tools schema | 工具 schema |
| `user` | user | user |
| `assistant` | assistant | assistant |
| `tool` | tool result | 工具结果 |

There are **no** user-facing role chips named `control` or `generation`.

JSON `role` values stay `system` / `user` / `assistant` / `tool`. Blog may explain「工具消息」for `tool`; chip label is **工具结果 / tool result**.

---

## Pipeline concepts (prose)

| Concept | Preferred | Notes |
| --- | --- | --- |
| Message list | Messages / 消息列表（Messages） | |
| Prompt | 提示词（Prompt） | Content of system/user messages |
| Context | 上下文（Context） | Broader than Messages |
| Chat template | Chat Template | Keep Latin product casing |
| Tokenizer | 分词器（Tokenizer） | |
| Token | Token | Capital T in product prose when naming the unit |
| Vocabulary | 词表（Vocabulary） | |
| KV Cache | KV Cache / KV 缓存 | First mention may bilingual; topic ≠ pane title |
| Prefix caching | 前缀缓存（Prefix Caching） | Concept ≠ chip label「缓存命中输入」 |
| Imaginary architecture | 假想架构 | Playground control; GUIDE uses this |
| Demo | Demo / 演示 | AgentChat button |

---

## Model / family names (as shown in UI)

Use product strings consistently: `Qwen3`, `DeepSeek-V3`, `GPT-OSS` (and architecture variants like `Qwen3-0.6B` as in the model picker). Do not invent alternate spellings (`Deepseek`, `GPT OSS`, `qwen3`) in user-facing copy. Prose may say “DeepSeek V3” when not naming the picker option.

---

## Doc mirrors

`docs/GUIDE.md` must stay synchronized with playground chip/panel wording. Treat GUIDE drift as in-scope for this skill.
