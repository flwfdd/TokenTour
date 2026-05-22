# LLMVis · 从 Agentic Context 到 KV Cache

一个交互式可视化教程，把「你跟 Agent 说的一句话」一路拆解到 GPU 上的 KV Cache，让 messages / chat template / tokens / context distribution / KV cache 这条链路完全透明。

支持 BYOK（OpenAI、Anthropic、DeepSeek、SiliconFlow、通义、OpenRouter、任意 OpenAI 兼容端点），也可以无 key 跑 Demo。

👉 **想知道每个面板和交互怎么用？看 [docs/GUIDE.md](./docs/GUIDE.md)。**

## 启动

```bash
pnpm install
pnpm dev         # http://localhost:4321
pnpm build       # 生产构建（Node SSR）
node dist/server/entry.mjs
```

> 使用 [pnpm](https://pnpm.io/)（≥ 10）。`package.json` 通过 `packageManager` 字段锁定版本；用 [Corepack](https://nodejs.org/api/corepack.html)（`corepack enable`）可一行装好。

## 架构速览

- **Astro 5** + **React 19 islands** + **TypeScript** + **Tailwind v4**（单一 `global.css`，OKLCH 颜色变量）
- 状态：`zustand`（持久化部分 → localStorage；hover / 时间线 / KV 基线 → 会话级）
- Chat template：`@huggingface/jinja` + 三家原始 Jinja 文件（qwen3 / deepseek_v3 / gpt_oss）从 `?raw` 加载
- Tokenizer：内置 `gpt-tokenizer`（cl100k / o200k_harmony）+ `@huggingface/transformers` 加载 Qwen3 / DeepSeek-V3 真实 BPE
- 流式：原生 fetch + SSE 解析；Anthropic 走 `content_block_delta` 事件流
- KV Cache：基于 `src/lib/modelRegistry.ts` 真实推算 shape / memory；prefix 复用通过对**冻结基线** vs 当前 token 序列做最长公共前缀 diff 得到，因此编辑前缀消息会让 `reusedPrefix` 直观地缩短再恢复

## 项目结构

```
src/
├── lib/                  纯逻辑层（无 React）
│   ├── types.ts          全局类型
│   ├── modelRegistry.ts  10 个模型架构参数 + KV 内存计算
│   ├── chatTemplates.ts  Jinja 模板 bundle 元数据（每家的 specialTokens / messageOpening）
│   ├── chatTemplates/    各家原始 Jinja 文件（`?raw` 加载；用 `pnpm sync-chat-templates` 同步上游）
│   │   ├── qwen3.jinja           ← Qwen/Qwen3-8B tokenizer_config.json
│   │   ├── deepseek_v3.jinja     ← vLLM examples/tool_chat_template_deepseekv3.jinja
│   │   └── gpt_oss.jinja         ← openai/gpt-oss-20b chat_template.jinja
│   ├── template.ts       渲染 + 特殊 token 切片
│   ├── spans.ts          marker 注入算 message → char 区间
│   ├── tokenizer.ts      分词 + 角色归属
│   ├── kvSim.ts          KV cache 快照 + prefix diff
│   ├── agentLoop.ts      消息 → template → tokenize → prefill → decode → tool_call 完整循环
│   ├── demo.ts           无需 API key 的演示对话
│   ├── snapshot.ts       URL hash 分享/导入
│   ├── providers/        OpenAI 兼容 / Anthropic streaming 客户端
│   └── tools/            内置 mock tools
├── islands/              React 客户端组件
│   ├── App.tsx           主壳 + 三栏布局
│   ├── AgentChat.tsx     左侧：system prompt + tools + messages + 输入
│   ├── LensChatTemplate.tsx  渲染后的 Jinja 模板（支持双模板对比）
│   ├── LensTokens.tsx        分词后的 token 序列（支持双 tokenizer 对比）
│   ├── LensContextKv.tsx     KV cache 状态分布 + 内存估算
│   ├── SettingsDrawer.tsx    BYOK + provider + temperature + max_tokens
│   ├── MessagesJsonModal.tsx 真正发给 provider 的 messages JSON
│   ├── Intro.tsx             首次访问的引导卡
│   └── lensHooks.ts          各 Lens 共享的 useLensView/useKvSnapshot
├── pages/
│   ├── index.astro       入口页
│   └── api/proxy.ts      可选的 CORS 兜底代理（带 host allow-list）
├── store/                zustand store + persist
└── styles/global.css     Tailwind v4 主题 token
```

## 已知简化

- KV cell 内显示的状态（reused / prefill / decode）是基于 token 序列前缀 diff 推算，**shape 与 memory 数字 100% 真实**，但每个 cell 内的"激活值"是示意。
- BYOK 模式下我们看不到 provider 服务端真实是否命中 prompt cache，演示的是「理论可复用区域」。
- 内置分词器只覆盖 cl100k / o200k_harmony / Qwen3 / DeepSeek-V3 —— 其它模型用 `auto` 落回到 GPT-OSS（边界相近，token ID 仅供示意）。
