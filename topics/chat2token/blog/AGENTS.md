# Chat2Token 博客 · 交互组件经验沉淀 / 约定（活文档）

> 这份是 `topics/chat2token/blog/` 下**交互式可视化组件**（BpeLab / PrefixCacheLab / AttentionKvLab / TemplateLab 等）的经验库 + 硬约定。
> 动手前先读这里；每做完一个组件或一轮大返工，往末尾「更新日志」追加一条。
> 目标：别让用户重复解释同一件事，别重复踩同一个坑（尤其配色、对齐、class 命名）。

---

## 0. 用户偏好与红线（违反必被打回）

- **绝不乱改配色**。沿用全站既有色系（`src/styles/design.css` 变量），高亮统一用 cyan 设计标准色；用户对"瞎改色系"零容忍。
- **极简风、不要 border**。组件靠纯白底（`oklch(1 0 0)`）划分区域，不要外框、不要光感 / sheen 渐变。**例外**：落地页/hub 的门面卡片（`src/components/TopicCard.astro`）**沿用全站「按钮」语言**——1.5px 边 + 硬底边阴影（`0 var(--press) 0 0 var(--edge)`）、hover 上浮 + 边染 accent、点击下沉，和 `.btn` 同款手感。美化部分 = hover 时整张卡浮现一片柔和彩色渐变（oklch 柔光斑按光标做视差），**只由鼠标位置驱动、无任何自发动画**（鼠标停=光停）。**不要**软阴影高级卡那一套，也不要自转/呼吸等常驻动画。
- **组件可比正文宽**，但小屏（`max-width: 640px`）要负 margin 出血 + 保留边距；超长内容**内部滚动**，不要换行，且滚动不能带着 tab / 表头一起动。
- **输入框、按钮严格照设计稿**：复用 `.field` / `.btn`（见第 2 节），不要自己造样式。
- **彩色按钮有固定语义**：重置 = 橙（`btn-warning`）、上下/导航 = 青（`btn-primary`）、自动播放 = 绿（`btn-success`）；图标一律用 lucide（`@lucide/astro`）。
- **结果提示用 badge 风格，不要 ✓ 勾**；提示文案不写句号、不写"科普腔"；`id` 写成大写 `ID`。
- **分词必须用真实分词器**（`gpt-tokenizer` 的 `o200k_base`），不许凭感觉摆 token；中文生僻字 / emoji **从 UTF-8 字节开始合并**，字节碎片显示成 `\xHH`（**不要** `·`）。
- **可视化不能有歧义**：前缀树要在真正分歧点分叉、匹配路径连线一起染绿；候选要全部展示、被选中的才高亮。

## 1. 技术栈与文件约定

- **路由按 topic 分，不按类型分**（topic-first）。一级路径 = topic slug，topic 内部再分 surface：
  - `/` = topic 索引页；`/<topic>` = 该 topic 的 hub 落地页。
  - `/<topic>/playground` = 交互 app；`/<topic>/blog/<lang>` = 长文（镜像 `topics/<topic>/blog/<lang>` 目录）。
  - `src/pages/` 只放**薄壳**（Layout + 站点 chrome + `import` topics 内容），内容永远在 `topics/<topic>/...`。例：`src/pages/chat2token/blog/zh.astro` 只是包 `topics/chat2token/blog/zh/index.astro`。
  - `/design` 是跨 topic 基础设施，留在顶层。topic 多了再考虑 `src/pages/[topic]/...` 动态路由 + manifest，现在静态薄壳即可。
  - 加新 topic：在 `src/pages/index.astro` 的 `topics[]` 加一条 + 建 `src/pages/<topic>/` 薄壳。playground 入口链接统一指向 `/<topic>/playground`。
- **Astro islands + 内联 vanilla `<script>`**，不是 React 组件。原因：token chip 等是 client 脚本拼的**原始 HTML**，拿不到 Astro 的 scoped 属性 → 样式必须走**全局 CSS**。
- **每个 lab = `XxxLab.astro` + `xxx-lab.css` 同目录**；在 `.astro` frontmatter 里 `import "./xxx-lab.css"`。CSS 文件顶部注明「topic-specific，非设计系统，全局样式因为 chip 是脚本拼的」。
- **脚本套路**：server 端只渲染**静态骨架**（带 `data-*` 属性的 cell / chip），client 脚本 `document.querySelectorAll("[data-xxx]").forEach(init)`，`init` 内用 `data-*` 选择器拿元素，只 **toggle class** + 改文本。状态（step / cache…）存在闭包变量里，`render()` 重画。
- **接入正文**：`zh/index.astro` 顶部 `import`，正文写一段引导 prose，再放 `<Component />`。prose 要和组件里的颜色 / 术语严格对应。
- **大依赖动态导入**：`gpt-tokenizer` 这类只在需要时 `await import(...)`，别拖慢首屏。

## 2. 设计 / 配色一致性（唯一事实来源 = design.css）

- 颜色变量：`--color-primary/success/warning/danger/accent-500` 与对应 `-700`（深一档做边）；中性 `--color-paper`（白）/`--color-paper-2`（浅灰底）/`--color-rule`(`-soft`)（线）/`--color-ink`(`-soft`)（字）/`--color-muted`（弱字）。语义提示色另有 `--color-success-tint` / `--color-success-ink`。
- **按钮**：用 `.btn` + 变体 `.btn-primary/-success/-warning/-danger/-accent/-ghost`。`.btn` 自带 chunky 风：`box-shadow: 0 var(--btn-press) 0 0 var(--btn-edge)`，`:active` 下沉 `translateY(--btn-press)`。
  - 局部覆盖只调 `--btn-press`（默认 3px，紧凑组件用 2px）、`padding`、`border-radius`、`font-size`。
  - **disabled 要肉眼可辨**：`opacity:1` + 强行 flat 中性灰（`--btn-bg: paper-2; --btn-edge: rule-soft; --btn-fg: muted`，去掉硬边）。
- **chunky chip**：chip / pill / vocab 项统一 `border: 1.5px solid` + `box-shadow: 0 2px 0 0 var(--edge)`（`--edge` 默认 `--color-rule`，状态色用对应 `-700`）。
- **chip 状态色（全组件统一语义）**：命中 / 已合并 = 绿；本步计算 / 即将合并（chosen）= 橙；失效 / 需重算（dead）= 红；hover / 候选（hot）= 青。**橙的优先级要高于青**（`.lab .x.is-chosen` 提高 specificity 压过 hover）。
- 输入框用 `.field`，hover 边框转 cyan（`--color-primary-500`）。

## 3. 高频坑（都踩过，务必避开）

- **class 名碰撞**：按钮和它所在的 section 容器**绝不能共用 class**。曾让按钮和容器都叫 `pcache__cache`，按钮继承了容器的 `margin-top/padding-top/border-top` → 莫名变矮 / 错位，排查极久。解法：按钮单独命名（如 `pcache__save`）。
- **重复 CSS 规则覆盖**：同名规则写了两遍，后面那份把 `overflow-x` 等覆盖掉。改样式先全文件搜该选择器，删掉陈旧重复块。
- **高度对齐**（按钮 vs 输入框）：两边都 `box-sizing: border-box` + **显式 `height`** + 清零上下 padding，才能像素级对齐；别指望 `align-items: stretch` 兜底。
- **布局微位移**：元素在某状态加了 border / padding 而别的状态没有，会在切换时抖一下。**所有状态保持同样的盒模型**（例：给所有态加 `1px solid transparent`，激活态只改 `border-color`/`border-style`）。
- **字节碎片 token**：多字节字符被切成不完整 UTF-8 的 token，`TextDecoder` 会 decode 成空串。要**逐 token 独立解码其原始字节**，不成完整字符就显示 `\xHH`（参考 BpeLab / PrefixCacheLab 的 `dispOf`）。
- **树状连线无歧义**：连接线用**四段独立 stroke**（up/down/left/right，各自 `<i>`），垂直段用伪元素 `overshoot` 进 row gap（`top: calc(-1*var(--gap))`）才能跨行无缝；匹配路径**逐段染绿**，而不是只染 chip。

## 4. 已建组件清单（速查）

- **TemplateLab.astro**：Chat / Messages / JSON 三视图切换（复用全站 `Tabs`），hover 某条消息 → 模板里对应片段高亮；角色按功能分配颜色（与 playground 对齐），角色 badge 用中性背景。
- **BpeLab.astro** + `bpe-lab.css`：BPE 合并分步动画。左序列 + 右「相关词表」（标了大小、可滚、hover 联动滚动）；输入自定义文本→实时取所有可能用到的 token；中文 / emoji 从字节起合；预合并候选 full-size 一次性全列、被选中的橙、其余青；控制按钮 = 重置橙 / 上下青 / 自动绿（lucide 图标）。
- **PrefixCacheLab.astro** + `prefix-cache-lab.css`：KV Cache 前缀命中。输入→真实分词；「缓存当前」按 **token 计容量**（满了 FIFO 淘汰最早）；下方把多条缓存画成**前缀树**（共享前缀只存一份、分歧处才分叉，第一条续在同行、后续落新行），当前复用路径连线染绿；命中绿 / 需重算红。
- **AttentionKvLab.astro** + `attention-kv-lab.css`：因果注意力 × KV Cache 二合一。同一张**下三角因果方格**并排两份，逐步生成 token：无缓存每步重算整片三角（橙，累计 ~O(n²)），有缓存每步只算对角线新 token（橙）、其余读缓存（绿，累计 ~O(n)）；累计数放上方徽章当主角、本步降为下方小字。

## 5. 每次改动的自检流程

1. 改完 `ReadLints` 看有无 lint。
2. dev server 一般已在跑（`localhost:4321`，多终端时挑 active 的那个）；`curl -s localhost:4321/chat2token/blog/zh -o /tmp/x.html` + `grep` 关键 class 确认渲染、节点数对。**别自己再起 dev server**（用户明确要求过）。
3. 分词相关改动：先 `node -e "const{encode,decode}=require('gpt-tokenizer/encoding/o200k_base');..."` 实测，再把结果写进组件。
4. 配色 / 文案改动遵守第 0 节红线；拿不准先问。

---

## 更新日志（每次节点追加）

### 2026-08-05 · English blog / language switch · 新增
- 新增默认英文博客正文 `topics/chat2token/blog/en/index.astro`，默认路由为 `/chat2token/blog`；中文原文保留在 `/chat2token/blog/zh`，右上角 Header 通过 `langHref/langLabel` 手动切换。
- `BpeLab` / `PrefixCacheLab` / `AttentionKvLab` / `MessageView` / `TemplateLab` 增加轻量 `lang` prop；中文默认不变，英文页传 `lang="en"` 后静态标签与脚本动态提示一起切换。
- 英文翻译尽量保持中文正文的段落和交互位置对齐；本土化例子替换为通用英文语境（如 cheerful cat assistant / AcmeBot / generic provider），避免面向国际评审时出现语境断裂。

### 2026-06-01 · AttentionKvLab（因果注意力 × KV Cache）· 新建
- 用户要求把「因果注意力掩码」和「对比有无 KV cache」**合并成一个**组件——确实更顺，因果下三角本身就是 KV Cache 省下东西的载体。
- 形态：行=生成步 / 列=token 位置的下三角因果方格，并排「无缓存」「有缓存」两份；`下一步`/`重置`/`自动`（橙/青/绿 + lucide）。无缓存每步整片三角变橙、有缓存只对角线变橙 + 其余绿；计数严格对齐正文「三角形 O(n²) → 对角线 O(n)」。
- 默认例子 = 真实 o200k 切分的「语言的边界就是我世界的边界」=`语言/的/边/界/就是/我/世界/的/边/界`（10 token）。
- 两处微调：① top 序列胶囊在 `is-future`(虚线 1px border) 与其它态间切换有像素位移 → 全态统一 `1px solid transparent`、future 只改 border-color/style；② 累计次数提到上方徽章并加粗放大当主角，本步降为方格下方右对齐小灰字。

### 此前 · BpeLab / PrefixCacheLab / TemplateLab（多轮迭代）
- 三者奠定了第 1–3 节的所有约定：Astro island + 全局 co-located CSS + data-* 脚本套路；chunky chip / 彩色语义按钮 / disabled flat；真实分词 + 字节级 `\xHH`；前缀树四段 stroke 连线 + 匹配路径染绿。
- 血泪坑：PrefixCacheLab 的按钮 `pcache__cache` 与容器同名 → 继承容器 padding/border 而错位变矮，重命名 `pcache__save` 才解决；重复 `.pcache__list` 规则覆盖 `overflow-x`；高度对齐靠 `box-sizing:border-box`+显式 `height`+清零 padding。
