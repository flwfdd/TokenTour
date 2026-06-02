# Chat2Token 视频 · 经验沉淀 / 制作约定（活文档）

> 本文件是这支视频的**经验库 + 硬约定**，与 `scenes.md`（分镜计划）互补。
> 在 `topics/chat2token/video/` 下做任何工作前先读这里；每完成一个节点，往末尾「更新日志」追加一条。
> 目标：别让用户重复解释同一件事，别重复踩同一个坑。

---

## 0. 用户偏好与红线（最重要，违反必被打回）

- **拒绝 AI 味文案**。屏幕上的每一句中文都要符合作者语言风格；**所有屏幕文案先给用户确认**，不要自作主张写"科普腔"。
- **可视化优先**：屏幕只放可视化 + 必要标签/数量/分词器名；**解释统统交给旁白**。能用旁白说清的就不要写在画面上。
- **保留玩梗**：哈基米、🥳 这类梗要留着，别"正经化"。
- **不要品牌元素 / 站点顶栏**。
- **不要"脏"的中转文件**：`copy.ts` 这种集中文案文件被明确否决；文案就近**内联**在对应组件里，改起来直观。
- 用户会反复盯**动效质量**和**配色一致性**——这两点是高频返工区，按下面第 2、3 节严格来。

## 1. 渲染器分工

- **有文字 / 有界面 / 要还原设计 → Remotion**；**有公式 / 几何 / 连续变形 → Manim**。
- Remotion 产出在 `video/remotion/`；Manim 产出在 `video/manim/`。

### Manim 侧约定（video/manim/）

- 环境：`uv` 装的 `.venv`，Manim CE 0.20.1。命令用 `.venv/bin/manim render ...`（**别**用全局）。
- `manim.cfg` 固定 1920×1080 / `background_color=#F7F7F6`；**但质量预设会覆盖 fps**，所以渲 1080p30 必须显式 `--fps 30`。
- **所有镜头继承 `theme.py:PaperScene`**（乳白底）；配色/字体全部从 `theme.py` 取（与 design.css/Remotion 同值，token 换引擎不换色）。字体族名：`Source Han Serif SC`/`Source Han Sans SC`/`Smiley Sans`/`Menlo`（本机已装）；Manim `Text(weight=...)` 用字符串 `"MEDIUM"`/`"SEMIBOLD"`/`"BOLD"`（顶层常量不一定有 SEMIBOLD）。
- token 方块用 `theme.py:chip(text, id, color=TOKEN_CYAN, *, font, weight, slant)`（圆角 + **纯实心填充 + 白字** + 下方小号 id，flat 极简——详见下方「Manim 质感红线」）。`font/weight/slant` 默认 `Menlo/SEMIBOLD/NORMAL`，可逐镜头覆盖（如 Scene 1 用得意黑）。
- **字体坑（务必先实测）**：family 名对不上或字重/斜体不存在时，Pango 会**静默回退**成别的字，看起来"像但不是"。**得意黑 = `Smiley Sans`，本机只装了 Oblique 一款** → 必须 `weight="NORMAL"` + `slant="OBLIQUE"`，否则按默认正体匹配不到→回退成直立黑体（被坑过）。排查：`fc-list | grep -i smiley` 看真实 family/style，`.venv/bin/python -c "import manimpango;print(manimpango.list_fonts())"` 看可用 family；拿不准就写个 `font_test.py` 用 `-s` 渲一张多字体对比图肉眼确认（用完即删）。
- **静帧把手**：Manim 没有 Remotion 的 `Freeze`，用 `self.wait(1.0)` 开头 / `self.wait(1.5)` 结尾的静止停留充当剪辑把手。
- 自检：`.venv/bin/manim render -ql -s file.py Scene`（只渲末帧、最快，验证代码能跑 + 看终态）；要看中段就 `-ql` 出 480p15 视频再 `ffmpeg -ss <t> -frames:v 1` 抽帧到 `out/tmp/`。
- 交付：`.venv/bin/manim render -qh --fps 60 -r 1920,1080 ...` → `media/videos/<file>/1080p60/<Scene>.mp4`，再拷到 `out/scene<N>/scene<N>_*.mp4`（默认 mp4 即 H.264；Scene 11 定稿为 **1080p60**）。
- 合并/变形动效：相邻两块合并用 `ReplacementTransform`/`TransformFromCopy`（会自动消费源，别再叠 copy+FadeOut，会重影）。`rate_func` 默认 `smooth`。
- **连续滑动 + 同步副动效（Scene 1 读头母题，踩坑总结）**：
  - 让一个 mobject 平滑滑过且**不瞬移**，直接 `self.play(box.animate.move_to(...), rate_func=smooth)`。**别给 box 挂 `add_updater` 去读另一个 `ValueTracker` 来定位**——同一个 play 里 box 的 updater 经常不随 tracker 走，结果 box 卡住、末了 `move_to` 一帧蹦过去（瞬移）。
  - 要让"读头速度"和"被读 token 的动画速度"**解耦**：读头用 `smooth`（快），token 下沉用**另一个线性 `clock` ValueTracker**（=真实时间）驱动、**固定时长 D**（如 0.5s）——这样读头再快，每个字都用同样看得清的速度沉入。两条动画在同一个 `self.play` 里各用各的 `rate_func`：`box.animate(rate_func=smooth)...` + `clock.animate(rate_func=linear)...`（`.animate(rate_func=, run_time=)` 这种逐动画覆盖是支持的）。
  - 每个 token 的下沉用 `add_updater`，`a = (clock - (t_reach - 0.8D))/D`，落点**实时取 `box.body.get_center()`**（掉进读头当前位置，而非固定槽位，否则字会掉进读头前方空位、脱节）。`t_reach = T * _smooth_inv(p_i)`（数值反解 smooth，算读头滑到该字的时刻）。
  - "模型先动一点、字再沉"：让读头**停在首字左侧约一格**（runway）再起步滑过所有字；别用"首字原地读入"（box 不动、字往下沉 → 看着是"字先动模型后动"，正好反了）。
  - 几何 morph（token 方块**变形**成读头矩形）**被用户否掉**了——观感乱、且留静止副本会拖影。**改用缩放沉入**（副本边移边缩小淡出）。若非要留淡出副本，要么让它**跟着 box 一起走再淡出**、要么直接 remove，别钉在原地（否则一排重影）。
  - 强调读头别用 `Indicate`（会放大+整体染色）；**只描边**：`ShowPassingFlash` 沿 box 边框走一圈。
  - `MoveAlongPath` 末尾可能报 `Alpha 1.00002 not between 0 and 1`（浮点越界）→ 改用 `.animate.move_to`。

### Manim 质感红线（用户明确点名「劣质 HTML 味」要避开）

- **极简纯色**：方块**无描边、无阴影、无 sheen 渐变**——纯实心填充 + 白字，靠颜色/明度区分。**别加投影/高光**（被点名「奇怪的阴影」「劣质 HTML 味」打回两次）。见 `theme.py:chip()`（flat solid）。
- **出场用线条式**：`DrawBorderThenFill`（方块）/ `Write`（文字）/ `Create`（线、分隔线）/ `Circumscribe`（结尾框选）。**能画线就别用 `FadeIn` 渐显**。
- **过程要留历史**：分步推导（如 BPE 合并）每一步**另起一行往下摞**，旧行 `set_opacity(0.4)` 留作历史，**别原地 mutate 抹掉前一步**。行距要够（盒高+id+间隙），**任何瞬间都不能让行/候选块互相重叠**；临时候选块放在行**下方**，别压在方块上。
- **合并出的方块与其它方块同尺寸同形状**（同 `height`/`corner_radius`），别让「刚合并」的和最终的不一样大。**预合并候选块也必须是 full-size + 带 id**，和最终合并块一模一样（别整个灰扑扑的小块）。
- **预合并 = 一次性全部、落在对的正下方**（y 取下一行高度）：所有相邻对**同时** `TransformFromCopy` 成候选块（别一个个慢慢来），**顿一下**（`wait`）再统一对照词表。候选块放在对的**正下方**，别合并到两块中间、别重叠。
- **查表高亮 = 词表行后面的半透明矩形条**（`_row_bar`，用**实时 row 坐标** + `row.width/height` 加 buff；别用预存坐标，会对不齐）。每个候选 `TransformFromCopy` 出自己那行的 **cyan 条**（候选块**不消失**，留到选出胜者）。比较在**按 id 升序的词表**里发生：最靠上的命中行 = id 最小。
- **选中胜者**：该行的 cyan 条 → 淡 **orange** 条（`opacity≈0.32`，和 cyan 一样淡才像高亮），**同时把对应的候选 token 方块也染成 orange**（白字在最上层，不会闪）。**关键坑**：高亮条**别用 `set_fill` 把 cyan 插值成 orange**——RGB 中间会经过脏灰、且半透明条压在文字上会让字"闪一下消失"；要用**交叉淡入淡出**（`FadeOut` 旧条 + `FadeIn` 新条）。实心方块染色没这问题（白字盖在上面），可直接 `box.animate.set_fill`。
- **选完才收场**：其余候选 + 全部高亮条 `FadeOut`，胜者候选留下；剩余 token `TransformFromCopy` 复制到下一行，胜者用 `ReplacementTransform` 变成一个**新的正常 token 色**块滑入新行（橙色归正，保证整行颜色统一、历史行不带橙）。
- **没命中**（如 `momo`）：候选滑到词表旁，逐行 `Indicate` 扫一遍（都不点亮 = 词表里没有），然后候选**褪成中性灰 `NEUTRAL` 并淡出**表示作废。**不要红 ✗**（用户嫌多余）。
- 强调胜者用 `there_and_back` 缩放脉冲，**别用 `Indicate(color=...)`**——它会把方块里的字也一起染色（橙底橙字看不见）。
- **结尾结果框**：用**常驻的 `SurroundingRectangle`**（`Create` 画出来、`wait` 期间保留）框住最终 token，**别用 `Circumscribe` 闪一下**（一闪而过、且只框 `.box` 会漏掉下方 id）。框要包住**整块含 id**（传 `VGroup(*chips)` 而非 `[c.box]`，`buff≈0.26`）。
- 词表等表格要有列头（`Token` / `ID`），可不要面板底（更极简）；**用小字标注分词器来源**（如「GPT-OSS · o200k 词表」）。
- 逐步推导/合并类，序列行用**左对齐**（共享一个 `LEFT_X`），合并就读作「就地坍缩 + 右侧滑过来补位」；**别整行往中心收拢**（会显得"挤到中间"且中途重叠）。左对齐基准别贴最左边（留点边距）。行距（`PITCH`）够大不重叠即可。
- **token 方块底色用偏淡亮的 `TOKEN_CYAN`**（比 primary `CYAN` 更亮），白字；候选/历史/最终都用它，保持统一。

## 2. 设计 / 配色一致性（唯一事实来源）

- 颜色/字体唯一来源：`src/styles/design.css`（全站调色板）+ `topics/chat2token/app/theme.css`（playground 角色色）。已**逐值**移植进 `remotion/src/lib/theme.ts`，用 **OKLCH**（Chromium 原生支持，渲染与网页一致）。
- **Token chip 必须与 playground 一致**（见 `app/visual.ts` 的 `roleSurfaceStyle` + `app/LensTokens.tsx`）：
  - 底色 = `color-mix(in oklch, var(--role) 15%, transparent)`（静息 **15%**，强调 26%）。
  - **special token**：文字用**整段角色色**（`color: var(--role)`）+ 加粗；普通/字节 token 文字 = ink。
  - 角色色对应：`user=primary-500`、`assistant=success-500`、`generation=success-700`、`system=紫`、`schema=粉`、`tool=accent-500`、`control=--color-border`(浅灰，近透明)。视频里另加了 `danger=danger-500` 做"碎裂/多 token"强调红。
  - **关键事实**：`app/lib/spans.ts` 会把开/闭标记（`<|im_start|>` / `<|im_end|>`）**重新归到所属轮次的角色**——所以 user 轮的标记是青色、assistant 轮是绿色，不是中性灰。
- **字体**（本机已装，headless 直接用 family name；跨机器渲染需把 otf bundle 进 `public/fonts/` 再 `@remotion/fonts`）：
  - `serif` 思源宋体 → 正文/注释
  - `sans` 思源黑体 → token 文字、标签。**token 里用 Medium(500)**，别太粗太大（用户嫌过粗/偏下，已加 `vCal` 上移校正）。
  - `display` 得意黑 → 标题/标题头结论词
  - `mono` → 字节转义、special、模板文本
  - 总体偏粗，但 token 文字保持 500。

## 3. 动效原则（3b1b 级，来之不易，务必遵守）

- **单个 token：位移 + 变色由同一个进度 `p`(0→1) 驱动，完全同步**。不要把"分离"和"上色"拆成两条时间线（用户因此返工多次）。
- **不改字号**（不要 scale 缩放）；**无竖直 hop**；`padY` 恒定 → chip 高度/基线不动。
- **非线性只作用在序列层**：用 `useSweep` 的 ease-in-out 前沿（**慢→快→慢**）控制扫描节奏；**单 token 内部线性**，不快。
- **连续→离散**：`p=0` 时 `padX/marginLeft/tint/radius` 全为 0 → 读作真正的连续文本。**别让"还没切分就已经有切分边距"**。
- **居中**要对齐**可视内容中心**，不是屏幕中心（有左侧标签列时会偏，用 `gridColumn` 跨列居中修正，例：Beat C 的分词器标注）。
- 一律用 `Easing`（`Easing.inOut(cubic)` 序列、`Easing.out(cubic)` 柔入），**别用裸线性 `interpolate`**。
- **果冻入场**：`spring({config:{damping:9~10,stiffness:130,mass:0.85}})`（带 overshoot）配 `translateY`/`scale`；强调 **bounce** 用低阻尼 `damping:7,stiffness:200,mass:0.6`。Scene 2/3/4 的卡片、气泡、头像、点亮都用它。
- **镜头内硬切**（用户红线「镜头之间直接切，不用渐变」）：beat 切换用**阶跃** `f>=at?1:0`，**别用 opacity 渐变**；元素自身的入场/点亮动效保留。
- **逐张高亮 = 重读**（Scene 4 母题）：自上而下 `bump(f, start+i*step)` 平滑三角点亮，**快、不放大、不加扫描线、只染底色+左色条**（step≈13、bump 半宽≈10；用户嫌慢/呆板/放大/扫描线，全砍）。**扫描一结束新消息立刻出现**（gap 太长就不像"读完即生成"）。
- **长高式列表**：卡片/JSON 行用 `height: H*grow` + `overflow:hidden`（`grow=ease` **无 overshoot** 防抖动），容器随之长高并保持居中；JSON 收尾 `]` 放 flow 末尾会自动随之下移。
- 转场：各幕**前后留静帧**（见第 5 节）；**幕与幕之间直接硬切**（独立 clip + 静止把手已天然支持），暂无贯穿母题。

## 4. 组件 / 数据 API

- `TokenChip { token, segment, p=1, fontSize }`：单一 `p` 驱动 padding/gap/tint/special 上色。`isByte = byteText && !text`，`isSpecial = token.special`，二者用 mono；普通 CJK 用思源黑体。
- `TokenStrip { tokens, segment, p:(i)=>number, fontSize, gap }`：`marginLeft = gap * p(i)`，左→右扫描。
- `VToken { text, byteText?, special?, seg? }`：`seg` 可逐 token 覆盖 strip 的 `segment`。
- `Frame`（纸张背景，静态）、`Badge { bg, fg }`。
- 数据在 `remotion/src/data/tokens.ts`，分镜在 `remotion/src/scenes/Scene10Tokens.tsx`。

## 5. 渲染 / 交付 / 素材管理（当前约定）

- **全部 1080p60**：Remotion Root `fps={60}`、`width=1920/height=1080`；Manim 交付也 `--fps 60`。
- **关键：30fps author space + 自动重采样**（`remotion/src/lib/fps.ts`）。所有关键帧字面量按 **30fps** 写，运行时重映射到真实 fps：
  - `useAuthorFrame(clampTo?)` = 当前帧换算成 30fps 空间（带可选末帧 clamp）；
  - `useAuthorSpring(frame, config)` = 在 author 空间写 spring、但物理按真实 fps 正确；
  - `useFpsScale()` = `realFps/30`，给 `Sequence`/`Freeze` 这种**按真实帧**计数的地方用（`durationInFrames`/`from`/`Freeze frame` 都要乘它）。
  - Root 里 `durationInFrames={dur(SCENE_DURATION)}`，`dur = author*60/30`。好处：换 fps 不动业务代码、时序不变、是**真 60fps 非补帧**。
- **静帧把手两种写法**：① Scene 10 这种用 `<Freeze>`+`<Sequence>`（`HEAD=30`/`TAIL=45`，记得乘 `useFpsScale()`）；② Scene 2/3/4 **更简**：顶层 `const f = useAuthorFrame(ANIM-1)` —— 首帧 f=0 自然是起始态、尾部 clamp 到 `ANIM-1` 自然冻结终态。**别用 `<Freeze>` 包整幕**（曾把合成重置回首态，踩过坑）。
- 输出 **H.264** 分镜到 `out/<scene>/sceneNx_*.mp4`；**不导 master**（除非明确要）。**临时产物一律 `out/tmp/`**。
- 合成 id：`Scene2-Messages` / `Scene3-Roles` / `Scene4-Context` / `Scene10-Tokens`(master 仅预览) / `Scene10A/B/C`；时长常量从各文件导出。
- **不要每次都渲视频**：定稿前用户会自己在 Studio 预览；改动期最多出一张 `out/tmp/*.png` 静帧自检布局，**用户说定稿了再渲 mp4**。
- **二进制/头像资源 + git lfs**：Remotion 用的图放 `remotion/public/`（`staticFile("x.jpg")`+`<Img>`），原图留 `video/assets/`；`.gitattributes` 用**路径级 lfs**（`video/assets/*.{jpg,png}` 和 `remotion/public/*.{jpg,png}`），全局 `*.jpg binary` 仍管站点小图。`git lfs install --local` 装钩子。头像 `objectFit:"contain"` + 按真实宽高比设盒子，**别裁切**。
- **坑**：Remotion ProRes profile 名是 `hq`/`standard`/…**不是 `422`**；`remotion still --frame=N` 的 N 必须 < `durationInFrames`。（已弃用 ProRes，统一 H.264。）

## 6. 分词数据必须实测（不许凭感觉）

- 屏幕上出现的每个切分都要用**真实分词器**核对，并**用小字标注具体分词器**。不确定就验证。
- 工具：
  - GPT-OSS ≈ `tiktoken` 的 `o200k_base`（`python3 -m pip install tiktoken`）。
  - Qwen3 / DeepSeek：`tokenizers` + `huggingface_hub`，`hf_hub_download("Qwen/Qwen3-0.6B","tokenizer.json")` 后 `Tokenizer.from_file`；token 串是 GPT2 byte-level，需用 byte-decoder 还原可读文本。
- **已验证事实**（可直接复用）：
  - `🥳`(U+1F973) UTF-8 = `F0 9F A5 B3`；GPT-OSS → **2 token** `\xF0\x9F\xA5` + `\xB3`。
  - `hello` = 1 token；`strawberry` = `st/raw/berry`(3)。
  - `何意味是什么意思`：Qwen3 = `何/意味/是什么/意思`(4)；DeepSeek-V3 = `何/意味/是什么意思`(3)。
  - Beat A（Qwen3）`<|im_start|>user\n你是谁？<|im_end|>\n<|im_start|>assistant\n我是哈基米，喵～<|im_end|>` = **19 token**（标记单独成 token，CJK 见代码注释）。

## 7. 每次改动的自检流程

1. 改完跑 `npx tsc --noEmit` + `ReadLints`。
2. 关键帧先用 `npx remotion still <id> out/tmp/xxx.png --frame=N --scale=0.5` 自检（连续态/中段/收尾），确认无误再渲视频。
3. 屏幕文案改动 → 先给用户确认再落地。

---

## 更新日志（每次节点追加）

### 2026-06-01 · Scene 2 / 3 / 4 定稿 + 全面切 1080p60（fps-agnostic 架构）
- **全部 1080p60**：新增 `remotion/src/lib/fps.ts`（`useAuthorFrame`/`useAuthorSpring`/`useFpsScale`），所有镜头仍按 **30fps author space** 写关键帧，运行时重采样到真实 fps；Root 改 `fps={60}` + `dur()` 缩放时长。Scene 10 的 `Sequence`/`Freeze`/`useSweep` 同步接上 `useFpsScale()`/`useAuthorFrame()`。是真 60fps（非补帧），换 fps 不动业务代码、时序不变。细节进第 5 节。
- **Scene 2 · 你看到的↔模型看到的**：左中右三栏 `Chat | Messages | JSON`（对齐 `blog/MessageView.astro`）。聊天气泡=**中性灰**果冻弹入（右 user → 左 assistant）；中间 playground 角色卡**统一宽度、上下排列、从上到下生成但从下往上托起**、assistant 的 Thinking 展开；右侧 `CodeBlock` 同款 JSON，**逐行高亮角色/内容/思考**（不用顶部胶囊）。坑：内容行**固定高度** `CONTENT_H` 防 JSON 挂载时标题上移；行号 `lineHeight` 一致才垂直居中；**别用 `<Freeze>`**，改顶层 clamp 帧。合成 `Scene2-Messages`。
- **Scene 3 · 四种角色**：四角色卡竖排 → **system 聚光**两个果冻小剧场（身份梗：嘴上 Kimi、实际豆包头像；越狱梗：奶奶/喵喵）→ 回到四卡 user/assistant/tool **bounce 点亮**。用户要点：role 英文加大；「对用户隐藏」「用户提示词·系统注入信息」；小剧场**无解释文字、纯果冻动效**；豆包头像 `assets/豆脚.jpg`→`public/doubao.jpg`，**圆角矩形、`objectFit:contain` 不裁切、和消息同时弹出**；高亮**快+bounce+中间留停顿**（spring 低阻尼，windows 间留 gap），**不要扫描线/不要放大**；**整体 `scale(1.18)` 填满**；**镜头间硬切**（阶跃，不渐变）。配了 git lfs（路径级）。合成 `Scene3-Roles`。
- **Scene 4 · 记忆的真相/Context**：**左右两栏同一段对话两视图**——左 Context 角色卡 panel（柔光底、无边框、随追加长高）、右 `messages.json`（逐条追加、与左**同步高亮**）。2 轮**记忆演示**文案（用户给定）：`我是奶龙`→`我记住了`→`我是谁`→`你是奶龙`。重读=**自上而下快速逐张点亮**（无扫描线/无放大），**扫描一结束 assistant 立刻 appear**（读完即生成）；长高式列表（`height*grow`+`overflow:hidden`）。最后**不留解释文字、不放大标签**。合成 `Scene4-Context`。
- **交付**：`out/scene2/scene2_messages.mp4`(~23.5s) / `out/scene3/scene3_roles.mp4`(~26.5s) / `out/scene4/scene4_context.mp4`(~20s) / `out/scene10/scene10{a,b,c}_*.mp4`（全部重渲为 1080p60）。

### 2026-06-01 · Scene 1（词语接龙黑盒）· 定稿（读头母题 + 字体坑）
- **母题**：纯词语接龙（不涉及 chat template），喂 `我会`→逐字接出 `稳稳的接住你`（单字 token，青=输入/绿=生成）。**LLM 盒子本身当"读头"**：从首字左侧起步、ease-in-out 连续滑过整行，滑到哪个字那个字就缩小沉入读头（=读）；滑到行末空位→**描边脉冲一下**（`ShowPassingFlash` 沿边框，不放大不染色）→读头矩形 `ReplacementTransform` 向上**吐出**新字→滑回最左，下一轮。每轮从头读到尾，路越走越长（带出"每次重读全文"+O(n²) 伏笔）。生成完最后一个字**就停在句尾**（不回原位、不通读）。
- **读头/字解耦**（用户要"模型快、字别快到看不清"）：读头 `smooth` 快滑，字下沉由线性 `clock` 驱动、固定 0.5s——细节全进上方「连续滑动 + 同步副动效」。先后顺序靠 runway（读头停在首字左侧一格）实现"模型先动一点字再沉"。
- **多次返工教训**：① 几何 morph(字→读头矩形) 被否，改缩放沉入；② 留静止副本→拖影，要么跟着读头淡出要么直接 remove；③ 给 box 挂 updater 读 tracker → box 卡住末帧瞬移，改 `box.animate` 同 play 驱动；④ ease-out 起步过冲会"一口吞俩字"、`smooth` 在原地读入后又显得"卡住再瞬移"——最终 = runway + smooth + 解耦固定时长下沉。
- **字体坑**：得意黑(`Smiley Sans`)本机仅 Oblique 一款，必须 `weight="NORMAL"`+`slant="OBLIQUE"`，否则回退成直立黑体（连错两版，最后靠多字体对比图 `-s` 才定位）。`chip()` 新增 `font/weight/slant` 参数（默认不变，不影响别的镜头）。
- **交付**：`out/scene1/scene1_blackbox_1080p60.mp4`（1920×1080/60fps/H.264/22.3s，含 1s+1.5s 静帧把手）。清掉了 `out/tmp/*` 与一次性 `font_test.py`。

### 2026-05-31 · Scene 11（BPE）· 首个 Manim 镜头 · 定稿（多轮质感返工）
- **质感大返工**：首版被评「这么高级的 manim 整出了劣质 HTML 质感」（描边 / FadeIn / 原地 mutate / 橙 Indicate 染字）。v1 实心带描边→打回；v2「明暗+投影」更被嫌（「奇怪的阴影」「更丑」）；**最终 = 极简纯色 flat**：无描边/无阴影/无 sheen，纯实心 + 白字。
- **合并/查表流程定稿**（教训全进上方「Manim 质感红线」）：四字节 `m o m o` 起，**历史可见**（每步往下摞一行、旧行 `set_opacity(0.4)`）；**所有相邻对一次性预合并**成 full-size+id 的候选块、落在对的正下方→顿一下→**统一对照词表**，各自在对应行长出 **cyan 半透明高亮条**（候选不消失）；选 id 最小（最靠上命中行）→ 该行**交叉淡入淡出成淡 orange 条**、**对应候选块也染 orange**；其余候选+条淡出，剩余 token 复制到下一行、胜者 `ReplacementTransform` 成正常色块滑入（橙归正）；末步 `momo` 不在词表 → 扫一遍都不亮 → 候选**褪灰淡出**（无红 ✗）；结尾**常驻绿色 `SurroundingRectangle`** 框住 `m|omo`（含 id）。
- **关键坑**：高亮条 cyan→orange **别用 `set_fill` 插值**（经过脏灰 + 半透明压字导致「文字闪一下」），用 `FadeOut`+`FadeIn` 交叉淡入淡出；实心方块染色无此问题（白字在上层）。`Circumscribe` 一闪而过且只框 `.box` 漏 id → 改常驻 `SurroundingRectangle(VGroup(*chips))`。token 底色用更亮的 `TOKEN_CYAN`。
- 数据从 `docs/outline.md` 权威 momo 例逐字核对（词表子集 m76/o78/om310/mo3690/omo15150/mom94440）；词表标注「GPT-OSS · o200k 词表」。
- 新建 `video/manim/theme.py`（`chip()` flat 纯色、`TOKEN_CYAN`、`NEUTRAL`、`PaperScene`）+ `manim.cfg`（30fps/1080/纸白底）+ `scene11_bpe.py`。
- **交付**：`out/scene11/scene11_bpe_1080p60.mp4`（1920×1080 / 60fps / H.264 / ~27s，含 1s+1.5s 静帧把手）；低清预览走 `out/tmp/`。

### 2026-05-31 · Scene 10（纯文本 → Token）完成首版
- 三幕：A 两轮对话切 token（Qwen3，19 token，含特殊 token，连续→离散扫描）；B 同句 Qwen 4 vs DeepSeek 3；C 字符→UTF-8 字节→Token（hello 5/5/1 vs 🥳 1/4/2，GPT-OSS）。
- 动效经历多轮返工，最终确立第 3 节原则（单一 `p` 同步、序列层 ease-in-out、不缩放/不竖跳、p=0 真连续）。
- 配色对齐 playground（第 2 节），新增 `danger` 段；Beat C 配色 cyan(常见词) + 红(生僻/Emoji)，标题头得意黑 + 彩色结论词。
- 交付：弃用 ProRes/master，统一 H.264 CRF18 分镜到 `out/scene10/`，临时件入 `out/tmp/`；每幕含 1s/1.5s 静帧把手。
- 验证了第 6 节所有分词事实。
