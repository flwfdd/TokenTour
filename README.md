<p align="center">
  <img src="public/cover.webp" alt="TokenTour · 从一句话到 KV Cache" width="820">
</p>

<h1 align="center">TokenTour</h1>

<p align="center">
  TokenTour 是一个包含一系列视频、文章、实验的企划。<br>
  带你以交互式可视化的方式，了解 大模型/Agent 的方方面面。
</p>

> 🚧 **项目还在施工中** 🚧
>
> （如你所见之后的内容都是 AI 写的
>
> TokenTour 想做成一整个系列，把大模型从里到外讲清楚。现在能玩的是「对话怎么变成 token」这一段，往后还会陆续加上模型架构、Agent Harness、训练、推理这些主题。形式上会混着用交互式文章、实验和视频。
>
> 觉得有意思就点个 ⭐ Star 跟进后续，也欢迎提 issue 说说你想先看哪块。

你大概用过 ChatGPT，也大概听过「大模型把文字切成 token 再算」。可中间那几步平时谁都看不见：你的对话怎么被拼成一长串模板，模板怎么被切成 token，为什么改一个字就要重算一大片，KV Cache 又到底省下了什么。

TokenTour 把这段看不见的路做成了可以动手玩的。改一句话，下游的模板、token、缓存命中会当场跟着变；hover 一条消息，它在模板和 token 序列里对应的位置会同步高亮。每个数字都是当场真算出来的。

## 你能玩到什么

打开 **Playground**（`/chat2token/playground`），左边是一个正常的对话框，右边三块镜头实时盯着它：

- **Chat Template**：你的 messages 被某家模型的 Jinja 模板拼成什么样，特殊 token 标在哪。可以左右放两家模型对比。
- **Tokens**：拼好的文本被真实 BPE 切成的 token 序列，按角色上色。中文、生僻字、emoji 怎么从字节开始合并，看得清清楚楚。
- **Context & KV Cache**：按真实模型架构推算的 KV Cache 形状和显存占用。改动前缀消息时，能复用的那段缓存会肉眼可见地缩短再恢复。

想要更系统的讲解，**交互式博客**（`/chat2token/blog/zh`）把这条链路拆成一篇长文，里面嵌了一串能单独玩的小组件：消息三视图、模板渲染、BPE 合并动画、前缀缓存命中、因果注意力 × KV Cache。

**自带钥匙（BYOK）**：填上自己的 key 就能跑真实模型，OpenAI、Anthropic、DeepSeek、SiliconFlow、通义、OpenRouter，或任意 OpenAI 兼容端点都行。不想填 key 也行，内置一段 Demo 对话直接看效果。key 只待在你的浏览器和转发 Worker 的内存里，不写进任何存储。

> 想知道每块面板的细节用法，看 [docs/GUIDE.md](./docs/GUIDE.md)。

## 跑起来

```bash
pnpm install
pnpm fetch-tokenizers   # 一次性拉 ~19MB 的 HF tokenizer 到 public/tokenizers/
pnpm dev                # http://localhost:4321
```

用 [pnpm](https://pnpm.io/)（≥ 10）。版本在 `package.json` 的 `packageManager` 字段锁好了，`corepack enable` 一行就能对齐。

## 部署到 Cloudflare Workers

站点几乎全是预渲染静态页，只有一个 `/api/proxy` 是按需跑的 Worker（BYOK 转发器，帮浏览器绕开 CORS）。两者由 `@astrojs/cloudflare` 一起打包、Wrangler 一起发上去。

```bash
pnpm fetch-tokenizers   # CI 也要跑，构建产物里需要 tokenizer.json
pnpm build              # → dist/（静态资产 + Worker）
pnpm exec wrangler login
pnpm deploy             # = astro build && wrangler deploy
```

想用真实 Worker 运行时在本地预览：

```bash
pnpm build && pnpm preview   # = wrangler dev
```

**用 Workers Builds 直接接仓库**的话，dashboard 里这样填：

- Build command：`pnpm install && pnpm fetch-tokenizers && pnpm build`
- Deploy command：`pnpm exec wrangler deploy`
- Node version：22+

`wrangler.jsonc` 故意没写 `main`，适配器会在 `dist/server/wrangler.json` 里生成一份带正确入口的完整配置，`wrangler deploy` 会自动 merge。

**不需要代理**（比如你只用 OpenAI / DeepSeek，浏览器能直连）也可以纯静态部署：删掉 `src/pages/api/proxy.ts`，把 `astro.config.mjs` 的 `output` 改成 `'static'`，去掉 `wrangler.jsonc` 里的 `compatibility_flags` 即可。

## 它是怎么搭的

- **Astro 6 + React 19 islands + TypeScript + Tailwind v4**。亮色「纸 / 青 / 橙」设计语言全在 `src/styles/design.css`，OKLCH 调色。
- **状态**：`zustand`，需要留存的进 localStorage，hover / 时间线 / KV 基线这些只活在会话里。
- **Chat template**：`@huggingface/jinja` 跑三家原始 Jinja 文件（Qwen3 / DeepSeek-V3 / GPT-OSS），`?raw` 直接加载，不二次加工。
- **Tokenizer**：内置 `gpt-tokenizer`（cl100k / o200k_harmony），加上 `@huggingface/transformers` 加载 Qwen3、DeepSeek-V3 的真实 BPE。
- **流式**：原生 fetch + SSE，Anthropic 走 `content_block_delta` 事件流。
- **KV Cache**：形状和显存按 `modelRegistry.ts` 里的真实架构参数算；前缀复用是拿「冻结基线」和当前 token 序列求最长公共前缀，所以编辑前缀消息能直接看到可复用区间的变化。

## 目录长什么样

仓库按**主题竖切**：站点壳（路由 / 布局 / 全局样式）留在 `src/`，每个交互主题独立成 `topics/<name>/`，内部再分 `app/`（Playground）、`blog/`（文章 + 内嵌组件）、`video/`（Remotion 动画）。现在只有一个主题 **`chat2token`**，但加新主题不用碰老的。

```
src/                                # 只放站点壳
├── pages/
│   ├── index.astro                 # 首页：主题索引（动态封面 + 主题卡）
│   ├── chat2token/
│   │   ├── index.astro             #   主题中心页
│   │   ├── playground.astro        #   挂载交互 Playground
│   │   └── blog/zh.astro           #   中文交互博客壳
│   ├── design.astro                # 设计语言样张
│   └── api/proxy.ts                # BYOK 转发 Worker（带 host 白名单）
├── components/                     # 跨页面共享：Header / CoverHero / 代码块 / TOC …
├── layouts/Layout.astro
└── styles/{design,global}.css

topics/chat2token/
├── app/                            # 交互 Playground（一整块 React）
│   ├── App.tsx                     #   主壳 + 三栏
│   ├── AgentChat.tsx               #   左侧对话编辑器
│   ├── Lens{ChatTemplate,Tokens,ContextKv}.tsx   # 右侧三块镜头
│   ├── store/                      #   zustand + persist
│   └── lib/                        #   纯逻辑：tokenizer / template / kvSim / agentLoop / providers …
├── blog/                           # 文章 + 内嵌交互组件
│   ├── zh/index.astro              #   正文
│   ├── MessageView / TemplateLab / BpeLab / PrefixCacheLab / AttentionKvLab.astro
│   └── AGENTS.md                   #   写这些组件时沉淀的约定
└── video/                          # Remotion 动画 + 资产（不部署）

wrangler.jsonc                      # Worker 配置（main 由适配器写）
astro.config.mjs                    # adapter: cloudflare()
```

> 边界约定：`src/` 只负责把主题挂上路由，主题内部随便互引，**主题之间不互相 import**。要共享的代码先留在主题里，真重复了再抽出来。

## 哪些地方是示意，哪些是真的

诚实是这类可视化的底线，所以把简化都列出来：

- KV cell 里标的状态（输入命中 / 输入未命中 / 输出）是按 token 前缀 diff 推出来的。**形状和显存数字 100% 按真实架构算**，但单个 cell 里的「激活值」是示意。
- BYOK 模式下看不到 provider 服务端到底有没有命中它自己的 prompt cache，画面展示的是「理论上可复用的区域」。
- 内置分词器只覆盖 cl100k / o200k_harmony / Qwen3 / DeepSeek-V3，其它模型用 `auto` 落回 GPT-OSS（边界相近，token ID 仅供示意）。
