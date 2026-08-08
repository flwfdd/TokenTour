# chat2token

把「你跟 Agent 说的一句话」一路拆解到 GPU 上的 KV Cache —— TokenTour 站点的第一个主题。
对应 messages / chat template / tokens / context distribution / KV cache 全链路。

## 目录

| 路径 | 内容 |
| --- | --- |
| `app/` | 互动 Playground（原 `src/islands` + `src/lib` + `src/store` 整块迁入） |
| `app/tour/` | 博客 Try-it → Playground 的 `?tour=` driver.js 引导（用户说明见 [GUIDE](../../docs/GUIDE.md)；博客 CTA 见 `blog/zh/PlaygroundTry.astro`） |
| `blog/` | 主题文章（`zh/`、`en/`）与交互 Lab |
| `video/` | Remotion / Manim 资产（不参与站点部署） |

## 本地预览

主题的 Playground 仍挂在站点根路径，与 `pnpm dev` 一致：

```bash
pnpm install
pnpm fetch-tokenizers
pnpm dev                 # http://localhost:4321
```

`src/pages/index.astro` 通过相对路径挂载 `topics/chat2token/app/App.tsx`；
当未来新增 `/learn/chat2token` 等路由时再回到 `src/pages/` 增加薄壳。

## 边界约定

- `src/` 只 import `topics/chat2token/app/App.tsx`（或日后的 `index.ts`），不深入主题内部。
- `topics/chat2token/app/` 内部随意互引（相对路径）。
- 主题间互不 import；若某段代码出现在第二个主题，再考虑抽到 `shared/` 或 `packages/`。

## 详细面板说明

见仓库根的 [`docs/GUIDE.md`](../../docs/GUIDE.md)。
