"""Scene 11 · BPE：不是切分，是合并

用 `momo` 走一遍字节对编码（权威步骤见 docs/outline.md）。审美取向（务必优雅）：
- 极简纯色方块：无描边、无阴影、纯实心 + 白字。
- 线条式出场（DrawBorderThenFill / Write / Create），不用渐显。
- **历史可见**：每一步另起一行往下摞，旧行变暗保留。
- 每步流程：相邻对「两边聚到一起」→ 直接**飞到词表**对应行点亮 **cyan**（命中从 token
  变换到词表上）；比较在「按 id 升序的词表」里发生 = 最靠上的就是 id 最小 → 转 **orange**
  → 才真正合并成新的一行。合并出的方块与其它方块**同尺寸同形状**，行距足够、不重叠。

可视化优先，解释交给旁白；屏幕无金句。
"""

import numpy as np
from manim import *

from theme import (
    CYAN,
    GREEN,
    HAIRLINE,
    INK,
    INK_SOFT,
    ORANGE,
    NEUTRAL,
    FONT_MONO,
    FONT_SANS,
    PaperScene,
    chip,
)

# 权威词表子集（docs/outline.md 的 momo 例子），按 id 升序。
VOCAB = {"m": 76, "o": 78, "om": 310, "mo": 3690, "omo": 15150, "mom": 94440}

LEFT_X = -5.3   # 序列行左对齐基准（逐行推导，合并就地发生）
ROW0_Y = 2.8    # 第一行盒心高度
PITCH = -1.62   # 每往下一行的位移（行不重叠即可）
BUFF = 0.34     # 行内方块间距


class Scene11BPE(PaperScene):
    def construct(self):
        self.code_rows = {}

        codebook = self._build_codebook()
        codebook.to_edge(RIGHT, buff=1.1).set_y(0.4)

        chips = [chip("m", 76), chip("o", 78), chip("m", 76), chip("o", 78)]
        self._place_row(chips, ROW0_Y)

        self.wait(1.0)  # 头部静帧把手
        self.play(LaggedStart(*[DrawBorderThenFill(c) for c in chips], lag_ratio=0.22), run_time=1.7)
        self.play(self._draw_codebook(), run_time=1.6)
        self.wait(0.4)

        active, prev, y = chips, VGroup(*chips), ROW0_Y
        for _ in range(2):
            active, prev, y = self._step(active, prev, y)
        self._stop(active, y)

        result_box = SurroundingRectangle(
            VGroup(*active), color=GREEN, corner_radius=0.16, buff=0.26, stroke_width=3,
        )
        self.play(Create(result_box), run_time=1.0)
        self.wait(1.5)  # 尾部静帧把手

    # ───────────────────────────── 布局（左对齐：合并 = 就地坍缩 + 右侧补位）
    def _place_row(self, chips, y):
        x = LEFT_X
        for c in chips:
            w = c.box.width
            c.shift(np.array([x + w / 2, y, 0]) - c.box.get_center())
            x += w + BUFF

    def _candidates(self, chips):
        return [
            (i, chips[i].token_text + chips[i + 1].token_text,
             VOCAB.get(chips[i].token_text + chips[i + 1].token_text),
             (chips[i].token_text + chips[i + 1].token_text) in VOCAB)
            for i in range(len(chips) - 1)
        ]

    def _cand_below(self, chips, i, name, y):
        """相邻两块「合并成一个 token」，落在这一对的**正下方**。样式/高度同正式合并
        （full-size + id）。"""
        mid = (chips[i].box.get_center() + chips[i + 1].box.get_center()) / 2
        cand = chip(name, VOCAB.get(name))  # 默认 TOKEN_CYAN、full size、含 id
        cand.shift(np.array([mid[0], y, 0]) - cand.box.get_center())
        return cand

    def _row_targets(self, widths):
        """左对齐一行，返回各盒中心 x。"""
        xs, x = [], LEFT_X
        for w in widths:
            xs.append(x + w / 2)
            x += w + BUFF
        return xs

    def _box_to(self, c, x_center, y):
        c.shift(np.array([x_center, y, 0]) - c.box.get_center())
        return c

    def _row_bar(self, row, color, opacity=0.22):
        """词表某一行后面的矩形高亮条。"""
        bar = RoundedRectangle(
            corner_radius=0.12, width=row.width + 0.5, height=row.height + 0.3, stroke_width=0,
        )
        bar.set_fill(color, opacity)
        bar.move_to(row.get_center()).set_z_index(-1)
        return bar

    # ───────────────────────────── 词表（极简：仅列头 + 细分隔线 + 两列）
    def _build_codebook(self):
        items = sorted(VOCAB.items(), key=lambda kv: kv[1])
        rows = VGroup()
        for name, tid in items:
            nt = Text(name, font=FONT_MONO, weight="SEMIBOLD", color=INK).scale(0.5)
            it = Text(str(tid), font=FONT_MONO, color=INK).scale(0.48)
            row = VGroup(nt, it).arrange(RIGHT, buff=0.8)
            row.name_t, row.id_t = nt, it
            rows.add(row)
            self.code_rows[name] = row
        rows.arrange(DOWN, buff=0.32)
        left = min(r.name_t.get_left()[0] for r in rows)
        right = max(r.id_t.get_right()[0] for r in rows)
        for r in rows:
            r.name_t.shift(RIGHT * (left - r.name_t.get_left()[0]))
            r.id_t.shift(RIGHT * (right - r.id_t.get_right()[0]))

        h_tok = Text("Token", font=FONT_SANS, weight="MEDIUM", color=INK_SOFT).scale(0.36)
        h_id = Text("ID", font=FONT_SANS, weight="MEDIUM", color=INK_SOFT).scale(0.36)
        h_tok.next_to(rows, UP, buff=0.4).align_to(rows[0].name_t, LEFT)
        h_id.next_to(rows, UP, buff=0.4).align_to(rows[0].id_t, RIGHT)
        rule = Line([left - 0.1, 0, 0], [right + 0.1, 0, 0], color=HAIRLINE, stroke_width=2)
        rule.next_to(VGroup(h_tok, h_id), DOWN, buff=0.18)

        # 注明分词器来源（词表 = GPT-OSS 的 o200k）
        cap = Text("GPT-OSS · o200k 词表", font=FONT_SANS, weight="MEDIUM", color=INK_SOFT).scale(0.32)
        cap.next_to(VGroup(h_tok, h_id), UP, buff=0.48).align_to(h_tok, LEFT)

        self._cb_cap = cap
        self._cb_headers = VGroup(h_tok, h_id)
        self._cb_rule = rule
        self._cb_rows = rows
        self._codebook = VGroup(cap, h_tok, h_id, rule, rows)
        return self._codebook

    def _draw_codebook(self):
        return AnimationGroup(
            Write(self._cb_cap),
            Write(self._cb_headers),
            Create(self._cb_rule),
            LaggedStart(*[Write(r) for r in self._cb_rows], lag_ratio=0.12),
            lag_ratio=0.2,
        )

    # ───────────────────────────── 一个合并步
    def _step(self, chips, prev, active_y):
        cands = self._candidates(chips)
        min_id = min(t for _, _, t, ok in cands if ok)
        win_name = next(n for _, n, t, ok in cands if ok and t == min_id)
        win_i = next(i for i, n, t, ok in cands if ok and n == win_name)
        next_y = active_y + PITCH

        # 1) 所有相邻对**一起**预合并：在各自正下方（= 新行高度）形成 full-size token
        cand_chips = {}
        forms = []
        for i, name, tid, ok in cands:
            cand = self._cand_below(chips, i, name, next_y)
            cand_chips[i] = cand
            forms.append(TransformFromCopy(VGroup(chips[i], chips[i + 1]), cand))
        self.play(*forms, run_time=0.9)
        self.wait(0.45)  # 顿一下

        # 2) 一起对照词表：各自在对应行长出 cyan 高亮条（候选**不消失**）
        bars = {}
        looks = []
        for i, name, tid, ok in cands:
            bar = self._row_bar(self.code_rows[name], CYAN)
            bars[i] = bar
            looks.append(TransformFromCopy(cand_chips[i], bar))
        self.play(LaggedStart(*looks, lag_ratio=0.18), run_time=1.2)
        self.wait(0.6)

        # 3) 选中最靠上（id 最小）：该行 cyan 高亮**交叉淡入淡出**成一条淡橙高亮，
        #    同时对应的候选 token 也换成橙色（白字始终在最上层，不会闪）。
        orange_bar = self._row_bar(self.code_rows[win_name], ORANGE, opacity=0.32)
        self.play(
            FadeOut(bars[win_i]),
            FadeIn(orange_bar),
            cand_chips[win_i].box.animate.set_fill(ORANGE, 1.0),
            run_time=0.6,
        )
        bars[win_i] = orange_bar
        self.play(cand_chips[win_i].animate.scale(1.1), rate_func=there_and_back, run_time=0.5)
        self.wait(0.4)

        # 4) 选中之后，其他候选 + 全部高亮条淡出（winner 候选留下）
        fades = [FadeOut(bars[i]) for i in bars]
        fades += [FadeOut(cand_chips[i]) for i in cand_chips if i != win_i]
        self.play(*fades, run_time=0.6)

        # 5) 剩余 token 复制下来，与 winner（始终是正常 token 色）拼成新的一行（左对齐）
        order = []  # [('win', None) | ('surv', j)]
        for j in range(len(chips)):
            if j == win_i:
                order.append(("win", None))
            elif j == win_i + 1:
                continue
            else:
                order.append(("surv", j))
        surv = {j: chip(chips[j].token_text, chips[j].token_id) for _, j in order if j is not None}
        widths = [cand_chips[win_i].box.width if o[0] == "win" else surv[o[1]].box.width for o in order]
        xs = self._row_targets(widths)

        anims, new = [], []
        for k, o in enumerate(order):
            if o[0] == "win":
                # 橙色候选滑入新行的同时归正色（Transform 同时插值位置+颜色）
                target = chip(win_name, VOCAB[win_name])
                self._box_to(target, xs[k], next_y)
                anims.append(ReplacementTransform(cand_chips[win_i], target))
                new.append(target)
            else:
                nc = surv[o[1]]
                self._box_to(nc, xs[k], next_y)
                anims.append(TransformFromCopy(chips[o[1]], nc))
                new.append(nc)
        self.play(*anims, run_time=1.0)

        # 旧行变暗作为历史
        self.play(prev.animate.set_opacity(0.4), run_time=0.6)
        self.wait(0.4)
        return new, VGroup(*new), next_y

    def _stop(self, chips, active_y):
        # m + omo = "momo" → 预合并落在正下方 → 顿一下 → 拿去词表逐行比对，全不匹配 → 作废
        name = chips[0].token_text + chips[1].token_text
        cand = self._cand_below(chips, 0, name, active_y + PITCH)
        self.play(TransformFromCopy(VGroup(chips[0], chips[1]), cand), run_time=0.7)
        self.wait(0.4)

        # 拿候选「贴到词表边上」，逐行扫一遍 —— 没有任何一行点亮 = 词表里没有
        self.play(cand.animate.next_to(self._codebook, LEFT, buff=0.7), run_time=0.9)
        self.play(
            LaggedStart(*[Indicate(r, color=INK_SOFT, scale_factor=1.06) for r in self._cb_rows], lag_ratio=0.4),
            run_time=1.7,
        )
        # 没找到 → 候选作废：褪成中性灰并淡出（不再可合并）
        self.play(cand.box.animate.set_fill(NEUTRAL, 1.0), run_time=0.5)
        self.wait(0.5)
        self.play(FadeOut(cand), run_time=0.6)


# ── 渲染 ────────────────────────────────────────────────────────────
# 低清预览：  .venv/bin/manim render -ql scene11_bpe.py Scene11BPE
# 末帧自检：  .venv/bin/manim render -ql -s scene11_bpe.py Scene11BPE
