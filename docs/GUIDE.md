# TokenTour 用户指南

把「你跟 Agent 说的一句话」一路拆解到 GPU 上的 KV Cache —— messages、chat template、tokens、context 分布、KV cache 状态一屏看完。

---

## 一分钟上手

1. `pnpm install && pnpm dev`，打开 `http://localhost:4321`。
2. 进来就有一组种子消息。点底部 **演示**（无需 API key）加载一段录好的多轮对话，所有面板会跟着更新。
3. 想用真实模型：右上角 **设置 / BYOK** 填一个 OpenAI 兼容 provider + API key，回到主界面点 **发送**。
4. 直接 hover 任意位置（消息卡片、模板片段、token、KV cell、状态/角色 chip），所有联动面板都会同步高亮 + 自动滚动到对应位置。

---

## 界面分区

```
┌──────────────── Header ──── 分享 / 设置 ──┐
│ ┌──────────┬─────────────────┬──────────┐ │
│ │          │ ② Chat Template │ ③ Tokens │ │
│ │ ① 对话   ├─────────────────┴──────────┤ │
│ │          │ ④ Context × KV Cache       │ │
│ └──────────┴────────────────────────────┘ │
└───────────────────────────────────────────┘
```

| 区域 | 说明 |
| --- | --- |
| ① 对话 | 系统 prompt、tools 开关、消息列表、输入框 |
| ② Chat Template | 当前 messages 经 Jinja 渲染后的完整字符串 |
| ③ Tokens | 模板字符串再经分词器拆出的 token 序列 |
| ④ Context × KV Cache | KV cache 状态分布 + 容量监控 + 内存估算 |

---

## ① 对话面板（左侧）

| 元素 | 行为 |
| --- | --- |
| **System prompt** | 直接改文字。任何字符变化都会立刻重渲染模板、重分词、重算 KV。 |
| **Tools 行** | 灰底 = 关闭，蓝底 = 启用。Hover 工具按钮会在右侧面板高亮 `tools_schema` 区段，让你看到一个工具开关在 prefix 上占多少 token。 |
| **Messages · N** | 当前消息数。右上 **查看 JSON** 弹出真正发给 provider 的 `messages` 数组。 |
| **消息卡片** | 左色条标记角色（system / user / assistant / tool）。Hover 整张卡片会在右侧面板高亮对应的字符区段 + token chunk + KV cell。 |
| **点正文 / 编辑按钮** | 进入内联编辑（`⌘/Ctrl+Enter` 保存，`Esc` 取消）。保存后所有下游视图同步刷新。 |
| **删除** | 删掉该条消息。 |
| **输入框** | `⌘/Ctrl+Enter` = 发送。生成中按钮变 **取消**，可随时中止流式 decode。 |
| **演示** | 不需要 API key，加载一段「计算 + 工具调用 + 决策」的多轮示例对话。适合第一次看产品的人。 |

---

## ② Chat Template 面板（中上）

显示当前 messages 经 Jinja 模板渲染后的**原始字符串**（含特殊 token 如 `<|im_start|>`、`<｜tool▁calls▁begin｜>` 等）。

| 区域 | 行为 |
| --- | --- |
| 顶部 **family 选择器** | Qwen3 / DeepSeek-V3 / GPT-OSS。切换后整个应用都改用这一家的模板（基线和 token 会重新计算）。 |
| **对比…** | 旁边并排另一家的渲染结果。两侧滚动联动 —— hover 其中一边，另一边自动滚到同一条消息附近，方便你看「同一组 messages 在不同家模板下的 prefix 长度差多少」。 |
| 字符高亮 | 不同角色用不同色带（system / user / assistant / tool / tools_schema）。Hover 某段字符会触发跨面板高亮。 |

> 模板源自上游官方 Jinja 文件，不做任何二次魔改。详见 `topics/chat2token/app/lib/chatTemplates/*.jinja`，可用 `pnpm sync-chat-templates` 重新拉取。DeepSeek 用的是 vLLM 的 `tool_chat_template_deepseekv3.jinja`，自带 `# Tools` 渲染。

---

## ③ Tokens 面板（中右）

显示模板字符串经分词器拆分后的 token 序列（**忠实分词**：特殊 token 不做单独保护，分词器吐什么就显示什么）。

| 区域 | 行为 |
| --- | --- |
| 顶部 **tokenizer 选择器** | `auto`（默认，自动匹配当前模板家族） · `GPT-4` (cl100k) · `GPT-OSS` (o200k_harmony) · `Qwen3` · `DeepSeek-V3`。Qwen3 / DeepSeek-V3 走 HuggingFace 镜像加载，首次切换会有几秒拉取。 |
| **对比…** | 并排另一种分词器对同一段模板的拆分结果。同一条消息的滚动联动。 |
| **token chip** | 颜色 = 所属角色；hover 触发跨面板高亮 + 滚动同步。 |
| 底部信息条 | hover 任一 token 时显示其 `id` / 位置索引 / 字符偏移，方便对比不同分词器的 ID 分配。 |
| 词表大小 | 顶部副标题展示当前分词器的 `vocabSize`。 |

---

## ④ Context × KV Cache 面板（底部满宽）

把模板 token 序列翻译成「KV cache 里的状态分布 + 内存占用」。

### 顶部 6 个统计卡
| 卡片 | 含义 |
| --- | --- |
| 总 tokens | 当前上下文总 token 数（含输出） |
| **缓存命中输入**（蓝） | 与缓存基线匹配的前缀长度 —— 本轮 prefill 命中 prefix cache、无需重算 |
| **缓存未命中输入**（红） | 与基线分叉之后的输入部分 —— 本轮必须重新 prefill |
| **输出**（橙） | 模型本轮 decode 自回归生成的部分 |
| KV 内存 | 三者相加在当前架构下的 KV 字节占用 |
| 每 token KV | `L × KV_H × headDim × dtype × 2`（K+V） |

### 中段三条
1. **上下文窗口占用条** —— 总长度对当前 ctx 上限的百分比，过 80% 转橙，过 100% 转红。
2. **角色分布条** —— 按 token 序列顺序聚合相邻同角色 token 组成色块。
3. **KV cache 状态条** —— 每个方格 = 1 个 token（超 512 自动桶化），颜色 = 缓存命中输入 / 缓存未命中输入 / 输出 / 未占用。

### 底部图例
- 左边 **KV cache 状态** chips：缓存命中输入 / 缓存未命中输入 / 输出 / 未占用 + 数量。
- 右边 **角色** chips：system / 工具 schema / user / assistant / 工具结果 + 数量。点击可 pin 该角色（再点取消），其它面板会过滤显示。

### 面板控件
| 控件 | 作用 |
| --- | --- |
| 假想架构 | Qwen3-0.6B/8B/32B、DeepSeek-V3、GPT-OSS-20B/120B。**只影响 KV 内存估算**（层数、KV head 数、headDim、dtype），跟 chat template 完全解耦。 |
| ctx | 演示用的窗口大小，与模型真实 maxContext 取最小。 |

---

## 跨面板联动

整个应用围绕**一个全局 hover 状态**驱动：

| 你 hover 的位置 | 联动效果 |
| --- | --- |
| 消息卡片 | 模板 / tokens / KV 都加亮该消息对应的字符段、token 块、KV 格 |
| 模板某段字符 | 对应 token 高亮、消息卡片高亮、KV 状态色块高亮 |
| token chip | 对应字符段、消息、KV 格全部高亮；底部信息条显示该 token 详细信息 |
| KV cell | 反推回 token / 字符 / 消息 |
| **角色 chip** | 所有该角色的 token / 字符 / KV 格保持亮，其它变暗；**同时点亮该角色 token 涉及的所有 KV 状态 tile**（看出 user 的 token 是横跨「缓存命中输入 + 缓存未命中输入」还是全部命中） |
| **KV 状态 chip** | 所有该状态的 KV 格保持亮，其它变暗 |

被动滚动：hover 时**你正在看的面板不会自动滚动**，但其它面板会主动滚到对应位置；hover 在对比子面板里时，主面板 + 另一边对比面板都会跟随。

---

## 编辑前缀 → 看 KV 缓存如何失效

TokenTour 模拟了一个真实 KV cache server 的 prefix-match 逻辑：

1. **初始化**：页面打开 / 刷新 / 演示加载完，系统把当前 messages 冻结为「server 已缓存的基线」。如果末条是 assistant，则按「**它就是刚 decode 完的**」分解：
   - **缓存命中输入** = assistant 之前的所有 token
   - **缓存未命中输入** = 这轮 gen prompt 头部（Qwen 是 `<|im_start|>assistant\n`、DeepSeek vLLM 模板因为 user 已粘上 `<｜Assistant｜>` 所以是 0）
   - **输出** = assistant 内容 + 结束符
2. **改动任意前缀消息**（user / system / tools）：基线不变，当前 token 序列与基线做最长公共前缀 diff —— **缓存命中输入** **缩短**到分歧点，分歧之后的 token 全部归入 **缓存未命中输入**，**输出** 归零。
3. **恢复原文**：token 序列再次与基线一致，原来的「缓存命中输入 / 缓存未命中输入 / 输出」三段**自动复原**。
4. **追加新消息**（如手动新建一条 user）：基线是当前的前缀 → **缓存命中输入** = 基线长度，新加的部分进 **缓存未命中输入**，**输出** = 0。
5. **点「发送」触发真实生成**：内部会按 compose → template → tokenize → prefill → decode 推进 KV 状态（这些阶段名是底层术语）。生成结束后，当前对话会成为新的缓存基线。
6. **切换 chat template / tokenizer**：渲染出来的 token 序列变了，旧基线无法对比 → 自动 reset，按当前状态重新冻结。

---

## BYOK 与 provider 配置（设置抽屉）

- **Provider 预设**：OpenAI / Anthropic / DeepSeek / SiliconFlow / 通义 / OpenRouter / 任意 OpenAI 兼容。
- **Base URL**：覆盖默认地址。
- **API Key**：仅写入浏览器 `localStorage`，不会上报。
- **Model**：填 provider 端实际可用的模型名（与 Context × KV Cache 面板的「假想架构」无关）。
- **使用代理**：勾上后走 `/api/proxy`（带 host allow-list），用来绕过浏览器 CORS。代理只转发，不持久化任何东西。
- **temperature / max_tokens**：每轮 chat completion 的参数。

---

## 状态持久化

下面这些会写到 `localStorage` 跨刷新保留：
- system prompt、messages、enabledTools、modelKey
- provider 配置（含 key —— 仅本地）
- contextLimitOverride、tokenizerKey、templateFamily

**不持久化**：生成过程中的临时步骤、KV 基线缓存、hover 状态 —— 都按「会话级」处理，刷新即清。

---

## 分享一次会话

点 Header 的 **分享** → 把 `{systemPrompt, messages, enabledTools, modelKey}` 编码进 URL hash 并复制到剪贴板。把链接发给同事，对方打开即可加载同一组消息（API key 不会带走）。

---

## 键盘快捷键

| 按键 | 作用 |
| --- | --- |
| `⌘/Ctrl + Enter` | 在输入框 = 发送；在消息编辑器 = 保存 |
| `Esc` | 取消编辑 / 关闭设置抽屉 |

---

## FAQ

**Q：假想架构旁的内存数字准吗？**
A：shape 和总字节是按 `2 (K+V) × L × KV_H × headDim × dtype` 真实算的，跟 vLLM / Megatron 的 KV 公式一致。"激活值"本身是示意。

**Q：BYOK 模式下显示的「缓存命中输入」是真实命中吗？**
A：不是。我们看不到 provider 服务端真实的 prefix cache 命中情况，**展示的是"理论可复用区域"** —— 即"如果服务端按当前 token 序列做最长前缀匹配，应该能复用多少"。

**Q：为什么 DeepSeek vLLM 模板渲染出来有那么多缩进空白？**
A：那是上游官方 Jinja 模板本身的 whitespace handling，我们故意不优化以保持字节一致。可以在 token 面板看到这些空白会被合并成几个 token，不影响 prefix 复用。

**Q：Tokenizer 选 auto 是什么意思？**
A：自动选最匹配当前 chat template 家族的分词器（Qwen → Qwen3 BPE；DeepSeek → DeepSeek-V3；GPT-OSS → harmony）。第一次切到 HF 分词器会从 `hf-mirror.com` 下载（已配置好镜像，国内网络可用）。

**Q：编辑了消息但「缓存命中输入」没变？**
A：如果刚才发送过一轮真实生成，编辑会跟最近一次生成后的基线比，而不是页面刚打开时的初始基线。想回到初始基线，刷新页面或再点一次「演示」重新加载示例对话即可。
