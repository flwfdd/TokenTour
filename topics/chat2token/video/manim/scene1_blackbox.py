"""Scene 1 · 词语接龙黑盒（全片主 motif）

纯「词语接龙」示意（不涉及 chat template）：喂进 `我会`，LLM **一次只吐一个字**，
一个字一个字接出 `稳稳的接住你`。

视觉机制（LLM = 会滑动的「读头」，全程 transform 驱动）：
- 上下两层：上是 token 行（固定），下是 `LLM` 盒子。
- LLM **非线性连续滑动**（不一步一步停）；滑过哪个字，那个字就**向下 transform 进 LLM**
  （读 = 吸收），LLM 自动跟着读到的位置走。
- 滑到行末空位 → **停住、脉冲一下** → 再向上 **transform 出**下一个字 → 缓动滑回最左，再来一轮。
- 每轮从头滑到尾，路越走越长 → 天然带出「每次都重读全文」+ O(n²) 伏笔。
- 收尾不放文字：LLM 把接完的整句再通读一遍，停在句尾。
"""

import numpy as np
from manim import *

from theme import (
    INK,
    ORANGE,
    FONT_MONO,
    FONT_DISPLAY,
    PaperScene,
    chip,
)

SEED = ["我", "会"]                       # 用户输入（青）
GEN = ["稳", "稳", "地", "接", "住", "你"]  # 模型逐字吐出（橙）

# 封面同款 design 品牌色（primary/accent-500），仅 token 方块，不动全局 / 其它镜头
BRIGHT_CYAN = "#00A7CA"
BRIGHT_ORANGE = "#F99549"

ROW_Y = 1.15
BOX_Y = -1.5
ROW_MAX_W = 12.0
CHIP_H = 0.82
GLYPH = 0.5
BUFF = 0.22


def _fast(t):
    """启动快、收尾缓（ease-out cubic），便于把读头「一下子动起来」。"""
    return 1 - (1 - t) ** 3


def _smooth_inv(p):
    """数值反解 manim 的 smooth(ease-in-out)：求 t 使 smooth(t)=p。用于算读头滑到某字的时刻。"""
    lo, hi = 0.0, 1.0
    for _ in range(28):
        m = 0.5 * (lo + hi)
        if smooth(m) < p:
            lo = m
        else:
            hi = m
    return 0.5 * (lo + hi)


class Scene1BlackBox(PaperScene):
    def construct(self):
        # ── 预排版整句（固定落位，零 reflow）
        specs = [(t, BRIGHT_CYAN) for t in SEED] + [(t, BRIGHT_ORANGE) for t in GEN]
        chips = VGroup(
            *[chip(t, None, c, height=CHIP_H, glyph_scale=GLYPH, font=FONT_DISPLAY, weight="NORMAL", slant="OBLIQUE") for t, c in specs]
        )
        chips.arrange(RIGHT, buff=BUFF, aligned_edge=DOWN)
        if chips.width > ROW_MAX_W:
            chips.scale(ROW_MAX_W / chips.width)
        chips.move_to([0, ROW_Y, 0])
        xs = [c.box.get_center()[0] for c in chips]
        n_seed = len(SEED)
        pitch = xs[1] - xs[0]
        start_x = xs[0] - 1.05 * pitch  # 读头停靠在首字左侧一点：先滑一段，第一个字才开始沉

        # ── LLM 读头（盒子 + 标签，无指针）
        body = RoundedRectangle(
            width=1.7, height=1.15, corner_radius=0.2, stroke_width=3.5, stroke_color=INK,
        ).set_fill(self.camera.background_color, 1.0)
        lab = Text("LLM", font=FONT_MONO, weight="BOLD", color=INK).scale(0.5).move_to(body)
        box = VGroup(body, lab)
        box.body = body
        box.move_to([start_x, BOX_Y, 0])

        # ── 开场
        self.wait(1.0)  # 头部静帧把手
        self.play(
            Create(body), Write(lab),
            LaggedStart(*[DrawBorderThenFill(chips[i]) for i in range(n_seed)], lag_ratio=0.3),
            run_time=1.6,
        )
        self.wait(0.3)

        # ── 接龙循环
        last = len(GEN) - 1
        for k, _ in enumerate(GEN):
            idx = n_seed + k                       # 新字落点
            self._read(box, chips, idx, xs, start_x, xs[idx])  # 读 0..idx-1，滑到空位
            self._pulse(box)                       # 停住，描边脉冲一下
            self._emit(box, chips[idx])            # 向上 transform 出新字
            if k != last:
                self._return(box, start_x)         # 滑回最左，准备下一轮

        # ── 生成完最后一个字「你」：就停在句尾，不回原位、不通读
        self.wait(1.5)  # 尾部静帧把手

    # ───────────────────────────── 读：读头快速滑过；每个字用固定时长的下沉动画（解耦，慢而清晰）
    def _read(self, box, chips, idx, xs, x0, x1):
        n = idx  # 读 0..idx-1
        # 读头(box)用 ease-in-out 快速滑过；字的下沉是**固定时长 D 的独立动画**，
        # 由 clock（线性真实时间）驱动，所以读头再快、字也是同样看得清的速度沉进读头。
        T = 0.18 * n + 0.5        # 读头滑行总时长（偏快）
        D = 0.5                   # 单个字下沉时长（固定，看得清）
        clock = ValueTracker(0.0)
        ghosts = VGroup()
        for i in range(n):
            p_i = (xs[i] - x0) / (x1 - x0)
            t_reach = T * _smooth_inv(p_i)         # 读头滑到该字正下方的时刻
            cp = chips[i].copy().set_opacity(0)
            cp.add_updater(self._absorb(clock, t_reach, chips[i].box.get_center().copy(), box, chips[i].height, D))
            ghosts.add(cp)
        self.add(ghosts)
        self.play(
            box.animate(rate_func=smooth).move_to([x1, BOX_Y, 0]),  # 读头：ease-in-out、快
            clock.animate(rate_func=linear).set_value(T),           # 时钟：线性真实时间
            run_time=T,
        )
        for cp in ghosts:
            cp.clear_updaters()
        self.remove(ghosts)
        box.move_to([x1, BOX_Y, 0])

    @staticmethod
    def _absorb(clock, t_reach, origin, box, base_h, D):
        """字的副本沉入读头：固定时长 D 的独立下沉（与读头速度解耦），落点实时取读头当前中心。

        窗口 [t_reach - 0.8D, t_reach + 0.2D]：读头逼近时开始沉、滑到正下方稍后吸收完。
        """
        t0 = t_reach - 0.8 * D
        def upd(m):
            a = (clock.get_value() - t0) / D
            if a <= 0 or a >= 1:
                m.set_opacity(0)
                return
            m.move_to(interpolate(origin, box.body.get_center(), a))  # 落向读头当前位置
            m.scale_to_fit_height(base_h * (1 - 0.62 * a))
            m.set_opacity(float(np.sin(np.pi * a)))
        return upd

    # ───────────────────────────── 停住，描边脉冲（只动描边，不放大、不整体高亮）
    def _pulse(self, box):
        edge = RoundedRectangle(
            corner_radius=0.2, width=box.body.width, height=box.body.height,
            stroke_width=6, stroke_color=ORANGE,
        ).set_fill(opacity=0).move_to(box.body)
        self.play(ShowPassingFlash(edge, time_width=0.6), run_time=0.55)

    # ───────────────────────────── 向上 transform 出新字（LLM 矩形 → 新 token）
    def _emit(self, box, target):
        src = box.body.copy().move_to(box.body.get_center())
        self.play(ReplacementTransform(src, target), rate_func=_fast, run_time=0.7)

    def _return(self, box, x):
        self.play(box.animate.move_to([x, BOX_Y, 0]), rate_func=_fast, run_time=0.5)


# ── 渲染 ────────────────────────────────────────────────────────────
# 低清预览：  .venv/bin/manim render -ql scene1_blackbox.py Scene1BlackBox
# 定稿 1080p60：.venv/bin/manim render -qh --fps 60 -r 1920,1080 scene1_blackbox.py Scene1BlackBox
