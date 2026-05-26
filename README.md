# TokenTour · 从 Agentic Context 到 KV Cache

一个交互式可视化教程，把「你跟 Agent 说的一句话」一路拆解到 GPU 上的 KV Cache，让 messages / chat template / tokens / context distribution / KV cache 这条链路完全透明。

支持 BYOK（OpenAI、Anthropic、DeepSeek、SiliconFlow、通义、OpenRouter、任意 OpenAI 兼容端点），也可以无 key 跑 Demo。

👉 **想知道每个面板和交互怎么用？看 [docs/GUIDE.md](./docs/GUIDE.md)。**

## 启动

```bash
pnpm install
pnpm fetch-tokenizers   # 一次性下载 ~19MB HF tokenizer 到 public/tokenizers/
pnpm dev                # http://localhost:4321
```

> 使用 [pnpm](https://pnpm.io/)（≥ 10）。`package.json` 通过 `packageManager` 字段锁定版本；用 [Corepack](https://nodejs.org/api/corepack.html)（`corepack enable`）可一行装好。

## 部署到 Cloudflare Workers

项目使用 `@astrojs/cloudflare` 适配器：`/` 是预渲染静态页面，`/api/proxy` 是按需渲染的 Worker（BYOK 转发器，绕过浏览器 CORS）。两者由 Wrangler 一起部署到 Workers Assets。

```bash
pnpm install
pnpm fetch-tokenizers   # CI 也要跑这步，构建产物里需要 tokenizer.json
pnpm build              # → dist/client（静态资产） + dist/server（Worker）
pnpm exec wrangler login
pnpm deploy             # = astro build && wrangler deploy
```

本地用真实 Worker 运行时预览：

```bash
pnpm build && pnpm preview   # = wrangler dev
```

参考：[Astro · Cloudflare 部署指南](https://docs.astro.build/zh-cn/guides/deploy/cloudflare/) · [Cloudflare · Astro framework guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/)。

### Workers Builds（CI/CD）

如果用 Cloudflare Workers Builds 直接关联仓库，dashboard 里这样填：

- **Build command**：`pnpm install && pnpm fetch-tokenizers && pnpm build`
- **Deploy command**：`pnpm exec wrangler deploy`
- **Node version**：22+

`wrangler.jsonc` 故意没写 `main` 字段 —— 适配器自己在 `dist/server/wrangler.json` 里 resolved 一份完整配置（带正确的 `main: entry.mjs`、`assets: ../client`），`wrangler deploy` 会自动 merge。

### 关于 BYOK 代理

`/api/proxy` 是个简单的 fetch 转发器：客户端在 `x-tokentour-target` 请求头里写上真实 provider URL，Worker 检查 host 在白名单内（`src/pages/api/proxy.ts` 顶部 `ALLOWED_PROVIDERS`）后透传 body 和 Authorization 头。API key 全程只在浏览器和这个 Worker 内存里出现，不落任何存储。

如果你的部署不需要代理（例如你只用 OpenAI / DeepSeek，浏览器直接 CORS 调即可），可以删掉 `src/pages/api/proxy.ts`、在 `astro.config.mjs` 里把 `output` 改成 `'static'`、`wrangler.jsonc` 里去掉 `compatibility_flags` 即可作为纯静态站部署。

## 架构速览

- **Astro 6** + **React 19 islands** + **TypeScript** + **Tailwind v4**（单一 `global.css`，OKLCH 颜色变量）
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
│   ├── spans.ts          基于每家 messageOpening 信号匹配的 char-range 归属
│   ├── tokenizer.ts      分词 + 角色归属
│   ├── kvSim.ts          KV cache 快照 + prefix diff
│   ├── agentLoop.ts      消息 → template → tokenize → prefill → decode → tool_call 完整循环
│   ├── demo.ts           无需 API key 的演示对话
│   ├── snapshot.ts       URL hash 分享/导入
│   ├── providers/        OpenAI 兼容 / Anthropic streaming 客户端 + proxyFetch
│   └── tools/            内置 mock tools
├── islands/              React 客户端组件
│   ├── App.tsx           主壳 + 三栏布局
│   ├── AgentChat.tsx     左侧：system prompt + tools + messages + 输入
│   ├── LensChatTemplate.tsx  渲染后的 Jinja 模板（支持双模板对比）
│   ├── LensTokens.tsx        分词后的 token 序列（支持双 tokenizer 对比）
│   ├── LensContextKv.tsx     KV cache 状态分布 + 内存估算
│   ├── RoleLegend.tsx        所有面板复用的角色 chip 条
│   ├── SettingsDrawer.tsx    BYOK + provider + temperature + max_tokens
│   ├── MessagesJsonModal.tsx 真正发给 provider 的 messages JSON
│   ├── Intro.tsx             帮助按钮触发的引导卡
│   └── lensHooks.ts          各 Lens 共享的 useLensView/useKvSnapshot
├── pages/
│   ├── index.astro       入口页（`export const prerender = true`）
│   └── api/proxy.ts      BYOK CORS 兜底代理（Worker，带 host allow-list）
├── store/                zustand store + persist
└── styles/global.css     Tailwind v4 主题 token

wrangler.jsonc            Cloudflare Worker 配置（main 由适配器写入）
astro.config.mjs          adapter: cloudflare()
```

## 已知简化

- KV cell 内显示的状态（命中输入 / 未命中输入 / 输出）是基于 token 序列前缀 diff 推算，**shape 与 memory 数字 100% 真实**，但每个 cell 内的"激活值"是示意。
- BYOK 模式下我们看不到 provider 服务端真实是否命中 prompt cache，演示的是「理论可复用区域」。
- 内置分词器只覆盖 cl100k / o200k_harmony / Qwen3 / DeepSeek-V3 —— 其它模型用 `auto` 落回到 GPT-OSS（边界相近，token ID 仅供示意）。
