"""Scene 13–15（合并）· 因果注意力 × KV Cache（对标博客 AttentionKvLab）

布局：
  顶部   ：一排 token 一个接一个「生成」；生成前先从前面每个 token 各拉**一根弧线**
          （平滑、两侧外鼓、无折角）汇到即将生成的新槽位 = KV 联系（query t 回看 0..t）。
  左下   ：三角形①「无 KV Cache」—— 每步把整片下三角**全部重算**（橙）。
  中下   ：三角形②「有 KV Cache」—— 每步只算对角线那一个新 token（橙），其余**读缓存**（绿）。
  右下   ：折线图 —— 两条曲线随生成**同步**描点：无缓存累计 = tri(t)≈O(n²)，有缓存 = t+1 = O(n)；
          曲线名用 **LaTeX** 公式。收尾不再画三角轮廓/对角线，直接给公式。
"""

import numpy as np
from manim import *

from theme import (
    CYAN,
    GREEN,
    ORANGE,
    RED,
    INK,
    INK_SOFT,
    NEUTRAL,
    TOKEN_CYAN,
    FONT_SANS,
    PaperScene,
)

TOKENS = ["语言", "的", "边", "界", "就是", "我", "世界", "的", "边", "界"]
N = len(TOKENS)

# 马卡龙亮色（本场景局部覆盖；其它镜头不受影响）
M_RED = "#FF6F81"      # 本步计算（cell 状态）
M_GREEN = "#3FD69B"    # 读缓存（cell 状态）
M_ORANGE = "#FF9F45"   # 无 KV Cache（曲线 / 徽章）
M_BLUE = "#34B6E8"     # 有 KV Cache（曲线 / 徽章）
FLASH_RED = "#FFB3BD"  # 重算高亮一闪
FLASH_GREEN = "#A9EFD2"  # 复用高亮一闪


def tri(k: int) -> int:
    return (k + 1) * (k + 2) // 2


# ── 几何 ──────────────────────────────────────────────────────────────
C = 0.36
S = 0.3
YT = 0.92
X1 = -6.05
X2 = -1.85
TOK_Y = 3.2
TITLE_Y = 1.95


def cell(color, op=0.9):
    sq = RoundedRectangle(corner_radius=0.06, width=S, height=S, stroke_width=2, stroke_color=color)
    sq.set_fill(color, op)
    return sq


def mini(text, color=TOKEN_CYAN, op=1.0, *, h=0.56, gscale=0.3):
    g = Text(text, font=FONT_SANS, weight="MEDIUM", color=WHITE).scale(gscale)
    w = max(h, g.width + 0.24)
    box = RoundedRectangle(corner_radius=0.1, width=w, height=h, stroke_width=0).set_fill(color, op)
    g.move_to(box)
    grp = VGroup(box, g)
    grp.box, grp.glyph = box, g
    return grp


class Scene13KV(PaperScene):
    def construct(self):
        self.wait(1.0)
        self._build_stage()
        self._intro()
        for t in range(N):
            self._step(t, slow=t < 3)
        self._finish()
        self.wait(1.5)

    def _build_stage(self):
        self.toks = VGroup(*[mini(t, NEUTRAL, 0.32) for t in TOKENS]).arrange(RIGHT, buff=0.14)
        if self.toks.width > 12.6:
            self.toks.scale(12.6 / self.toks.width)
        self.toks.move_to([0, TOK_Y, 0])

        c1x = X1 + (N - 1) * C / 2
        c2x = X2 + (N - 1) * C / 2
        # 标题只留主名（去掉描述小字）
        self.title1 = Text("无 KV Cache", font=FONT_SANS, weight="MEDIUM", color=INK).scale(0.46).move_to([c1x, TITLE_Y, 0])
        self.title2 = Text("有 KV Cache", font=FONT_SANS, weight="MEDIUM", color=INK).scale(0.46).move_to([c2x, TITLE_Y, 0])

        bad_y = YT - (N - 1) * C - 0.4
        self.badbad = self._badge("累计计算 0", M_ORANGE, [c1x, bad_y, 0])
        self.badgood = self._badge("累计计算 0", M_BLUE, [c2x, bad_y, 0])

        # token 行列标注（query=左侧逐行 / key=顶部逐列旋转）
        self.axlab1 = self._token_axes(X1)
        self.axlab2 = self._token_axes(X2)

        # 方块图例（cell 状态）：本步计算=红 / 读缓存=绿
        self.legend = self._legend([(M_RED, "本步计算"), (M_GREEN, "读缓存")]).move_to([(c1x + c2x) / 2, bad_y - 0.55, 0])

        self.axes = Axes(
            x_range=[0, N, 2], y_range=[0, tri(N - 1), 20],
            x_length=2.9, y_length=2.5, tips=False,
            axis_config={"stroke_color": INK_SOFT, "stroke_width": 2, "include_ticks": False},
        )
        self.axes.shift(np.array([2.45, -1.75, 0]) - self.axes.c2p(0, 0))
        self.xlab = Text("生成的 token 数 n", font=FONT_SANS, weight="MEDIUM", color=INK_SOFT).scale(0.3)
        self.xlab.next_to(self.axes.x_axis, DOWN, buff=0.12).shift(RIGHT * 0.3)
        self.ylab = Text("累计计算量", font=FONT_SANS, weight="MEDIUM", color=INK_SOFT).scale(0.3)
        self.ylab.next_to(self.axes.y_axis.get_top(), UP, buff=0.14)

        self.cells_no: dict[tuple[int, int], VMobject] = {}
        self.cells_ca: dict[tuple[int, int], VMobject] = {}

        self.pts_no = [self.axes.c2p(k + 1, tri(k)) for k in range(N)]
        self.pts_ca = [self.axes.c2p(k + 1, k + 1) for k in range(N)]
        self.prev_no = self.axes.c2p(0, 0)
        self.prev_ca = self.axes.c2p(0, 0)

        # 曲线名用 LaTeX 公式
        self.lab_no = MathTex(r"O(n^2)", color=M_ORANGE).scale(0.7)
        self.lab_ca = MathTex(r"O(n)", color=M_BLUE).scale(0.7)

    def _badge(self, text, color, pos):
        t = Text(text, font=FONT_SANS, weight="MEDIUM", color=color).scale(0.32)
        bg = RoundedRectangle(corner_radius=0.12, width=t.width + 0.34, height=t.height + 0.22, stroke_width=0)
        bg.set_fill(color, 0.12).move_to(t)
        g = VGroup(bg, t).move_to(pos)
        g.bg, g.label = bg, t
        return g

    def _set_badge(self, badge, text, color):
        new = Text(text, font=FONT_SANS, weight="MEDIUM", color=color).scale(0.32).move_to(badge.label)
        return Transform(badge.label, new)

    def _legend(self, items):
        row = VGroup()
        for color, label in items:
            sw = RoundedRectangle(corner_radius=0.04, width=0.26, height=0.26, stroke_width=0).set_fill(color, 0.95)
            tx = Text(label, font=FONT_SANS, weight="MEDIUM", color=INK).scale(0.32)
            row.add(VGroup(sw, tx).arrange(RIGHT, buff=0.14))
        row.arrange(RIGHT, buff=0.5)
        return row

    def _token_axes(self, base_x):
        keys = VGroup()    # 顶部：列 = key（旋转竖排）
        queries = VGroup()  # 左侧：行 = query
        for j in range(N):
            kt = Text(TOKENS[j], font=FONT_SANS, color=INK_SOFT).scale(0.26).rotate(PI / 2)
            kt.move_to([base_x + j * C, YT + 0.46, 0])
            keys.add(kt)
        for i in range(N):
            qt = Text(TOKENS[i], font=FONT_SANS, color=INK_SOFT).scale(0.26)
            qt.move_to([base_x - 0.44, YT - i * C, 0])
            queries.add(qt)
        return VGroup(keys, queries)

    def _pos(self, base_x, i, j):
        return np.array([base_x + j * C, YT - i * C, 0])

    def _intro(self):
        self.play(LaggedStart(*[FadeIn(t, shift=DOWN * 0.12) for t in self.toks], lag_ratio=0.06), run_time=1.3)
        self.play(
            FadeIn(self.title1, shift=UP * 0.1), FadeIn(self.title2, shift=UP * 0.1),
            FadeIn(self.badbad), FadeIn(self.badgood), FadeIn(self.legend),
            FadeIn(self.axlab1), FadeIn(self.axlab2),
            Create(self.axes), FadeIn(self.xlab), FadeIn(self.ylab),
            run_time=1.2,
        )
        self.wait(0.3)

    def _flash_border(self, chip, color):
        edge = RoundedRectangle(
            corner_radius=0.1, width=chip.box.width, height=chip.box.height,
            stroke_width=5, stroke_color=color,
        ).set_fill(opacity=0).move_to(chip.box)
        return ShowPassingFlash(edge, time_width=0.7)

    # 平滑、两侧外鼓、无折角的弧线（半椭圆样本 + set_points_smoothly）
    def _arc(self, src, dst, depth):
        n = 28
        pts = []
        for k in range(n + 1):
            u = k / n
            x = src[0] + (dst[0] - src[0]) * u
            y = src[1] - depth * np.sqrt(max(0.0, 1.0 - (2 * u - 1) ** 2))
            pts.append(np.array([x, y, 0]))
        c = VMobject()
        c.set_points_smoothly(pts)
        c.set_stroke(M_BLUE, width=2, opacity=0.55)
        return c

    def _step(self, t, slow: bool):
        rt = 1.0 if slow else 0.55
        tok = self.toks[t]

        # 1) 先连线（第一个→最后一个依次出发）汇到新槽位
        rays = VGroup()
        dst = tok.get_bottom()
        for j in range(t):
            src = self.toks[j].get_bottom()
            chord = abs(dst[0] - src[0])
            rays.add(self._arc(src, dst, min(0.4, 0.06 + 0.04 * chord)))
        if len(rays) > 0:
            self.play(LaggedStart(*[Create(c) for c in rays], lag_ratio=0.08), run_time=0.8)

        # 2) 顶部 token 与两三角第 t 行 + 折线描点「同步」生成
        new_no, new_ca = VGroup(), VGroup()
        for j in range(t + 1):
            cn = cell(M_RED, 0.95).move_to(self._pos(X1, t, j))
            self.cells_no[(t, j)] = cn
            new_no.add(cn)
            is_diag = j == t
            cc = cell(M_RED if is_diag else M_GREEN, 0.95 if is_diag else 0.85).move_to(self._pos(X2, t, j))
            self.cells_ca[(t, j)] = cc
            new_ca.add(cc)

        seg_no = Line(self.prev_no, self.pts_no[t], color=M_ORANGE, stroke_width=3.2)
        dot_no = Dot(self.pts_no[t], radius=0.045, color=M_ORANGE)
        seg_ca = Line(self.prev_ca, self.pts_ca[t], color=M_BLUE, stroke_width=3.2)
        dot_ca = Dot(self.pts_ca[t], radius=0.045, color=M_BLUE)

        self.play(
            tok.box.animate.set_fill(TOKEN_CYAN, 1.0),
            tok.glyph.animate.set_fill(WHITE, 1.0),
            self._flash_border(tok, CYAN),
            LaggedStart(*[DrawBorderThenFill(c) for c in new_no], lag_ratio=0.05),
            LaggedStart(*[DrawBorderThenFill(c) for c in new_ca], lag_ratio=0.05),
            Create(seg_no), Create(dot_no), Create(seg_ca), Create(dot_ca),
            self._set_badge(self.badbad, f"累计计算 {tri(t)}", M_ORANGE),
            self._set_badge(self.badgood, f"累计计算 {t + 1}", M_BLUE),
            run_time=rt,
        )
        if len(rays) > 0:
            self.play(FadeOut(rays), run_time=rt * 0.3)

        self.prev_no, self.prev_ca = self.pts_no[t], self.pts_ca[t]

    # 收尾：直接给 LaTeX 公式标在曲线端点（不画三角轮廓/对角线）
    def _finish(self):
        self.lab_no.next_to(self.pts_no[-1], RIGHT, buff=0.14)
        self.lab_ca.next_to(self.pts_ca[-1], RIGHT, buff=0.14)
        self.play(Write(self.lab_no), Write(self.lab_ca), run_time=1.0)
        self.wait(0.4)


# ── 渲染 ────────────────────────────────────────────────────────────
# 低清预览：  .venv/bin/manim render -ql scene13_kv.py Scene13KV
# 末帧自检：  .venv/bin/manim render -ql -s scene13_kv.py Scene13KV
# 定稿 1080p60：.venv/bin/manim render -qh --fps 60 -r 1920,1080 scene13_kv.py Scene13KV
