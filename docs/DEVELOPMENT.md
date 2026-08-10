# Development

This document covers local setup, deployment, and the repository structure. For the project overview, see the [main README](../README.md).

## Run locally

Use pnpm 10 or newer. The package manager version is pinned in `package.json`.

```bash
pnpm install
pnpm fetch-tokenizers
pnpm dev
```

Then open `http://localhost:4321`.

`pnpm fetch-tokenizers` downloads the playground tokenizer files into `public/tokenizers/`. The site can start without them, but some tokenizer choices will fall back or load remotely.

The `dev` script sets `TOKENTOUR_LOCAL_DEV=1`, which skips the Cloudflare adapter during local Astro development. Vite uses polling to avoid Linux `ENOSPC` watcher-limit errors in constrained environments.

## Build and deploy

The primary deployment target is Cloudflare Workers via `@astrojs/cloudflare`.

```bash
pnpm fetch-tokenizers
pnpm build
pnpm deploy
```

For a local Worker preview:

```bash
pnpm build
pnpm preview
```

For a completely static build, including GitHub Pages:

```bash
pnpm build:static
```

Most routes are prerendered. The Cloudflare build also provides `/api/proxy` for the optional BYOK proxy mode; the static build calls providers directly from the browser where CORS permits it.

For Cloudflare Workers Builds, use:

- Build command: `pnpm install && pnpm fetch-tokenizers && pnpm build`
- Deploy command: `pnpm exec wrangler deploy`
- Node.js: 22 or newer

## Project layout

```text
src/
├── pages/                         # Astro routes
├── components/                    # Shared Astro components
├── layouts/
└── styles/

topics/chat2token/
├── app/                           # Playground React app
│   ├── AgentChat.tsx
│   ├── LensChatTemplate.tsx
│   ├── LensTokens.tsx
│   ├── LensContextKv.tsx
│   ├── store/
│   └── lib/
├── blog/                          # English/Chinese article and embedded labs
└── video/                         # Remotion source; excluded from the site build
```

`src/` owns routing, layout, and shared UI. Topic-specific code lives under `topics/<topic>/`, keeping future explorables separate from the site shell.

## Implementation notes

- Astro 6, React 19 islands, TypeScript, and Tailwind CSS v4
- Zustand state with selected fields persisted to `localStorage`
- Jinja chat templates rendered with `@huggingface/jinja`
- Built-in `gpt-tokenizer` encoders plus local/Hugging Face assets for Qwen3 and DeepSeek-V3
- Native `fetch` streaming with provider-specific adapters
- Token-prefix comparison and model architecture metadata for KV cache visualization
- Shared visual tokens in `src/styles/design.css`

## Routes

| Route | Description |
| --- | --- |
| `/` | English home |
| `/zh` | Chinese home |
| `/chat2token` | English topic hub |
| `/chat2token/zh` | Chinese topic hub |
| `/chat2token/blog` | English interactive article |
| `/chat2token/blog/zh` | Chinese interactive article |
| `/chat2token/playground` | English playground |
| `/chat2token/playground/zh` | Chinese playground |
| `/chat2token/paper` | Print-oriented English article |
| `/design` | Internal design reference |

See [GUIDE.md](./GUIDE.md) for a panel-by-panel playground walkthrough.
