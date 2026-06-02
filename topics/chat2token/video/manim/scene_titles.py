"""TokenTour · 标题 / 章节转场

乳白底：顶部固定小标 `TokenTour`（得意黑·青，下加橙线），中间大标题思源宋体加粗——
英文青色、中文橙色。开场几何生长出现「Token 之旅」，停顿后用 Transform 做整字几何
变形依次切到各章节标题（中英），顶部 TokenTour 始终不动。中间留足停顿便于剪辑。
"""

from manim import *
from theme import FONT_SERIF, FONT_DISPLAY

# 取自 design.css 的品牌色（OKLCH primary/accent-500 → hex）
CYAN_T = "#00A7CA"     # --color-primary-500
ORANGE_T = "#F99549"   # --color-accent-500

# 章节标题（英文 / 中文）；第一个是开场片头。
CARDS = [
    ("Token", "之旅"),        # 片头
    ("Messages", "消息列表"),
    ("Chat Template", "聊天模板"),
    ("Token", "词元"),
    ("KV Cache", "前缀缓存"),
]

EN_SCALE = 1.75
ZH_SCALE = 1.15
HOLD = 1.6      # 每张停留（秒）
MORPH = 1.1     # 几何变形时长（秒）
BG = "#F7F7F7"         # --color-paper


def make_title(en: str, zh: str) -> VGroup:
    """英文（青·上）+ 中文（橙·下），思源宋体加粗，竖排居中。"""
    e = Text(en, font=FONT_SERIF, color=CYAN_T, weight=BOLD).scale(EN_SCALE)
    z = Text(zh, font=FONT_SERIF, color=ORANGE_T, weight=BOLD).scale(ZH_SCALE)
    g = VGroup(e, z).arrange(DOWN, buff=0.36)
    g.move_to(ORIGIN).shift(DOWN * 0.25)
    return g


class TitleCards(Scene):
    def construct(self):
        self.camera.background_color = BG

        # 顶部小标：得意黑（仅 Oblique 字重 → 必须指定 slant 才能命中）
        eyebrow = Text("TokenTour", font=FONT_DISPLAY, slant=OBLIQUE, color=CYAN_T).scale(0.56)
        eyebrow.to_edge(UP, buff=1.5)
        rule = Line(LEFT * 0.46, RIGHT * 0.46, color=ORANGE_T, stroke_width=4)
        rule.next_to(eyebrow, DOWN, buff=0.22)

        title = make_title(*CARDS[0])

        # 开场：像写出来一样逐笔画出现
        self.play(Write(eyebrow), GrowFromCenter(rule), run_time=0.9)
        self.play(Write(title), run_time=1.3)
        self.wait(HOLD)

        # 依次整字几何变形切到各章节标题
        for en, zh in CARDS[1:]:
            nxt = make_title(en, zh)
            self.play(
                Transform(title[0], nxt[0], path_arc=45 * DEGREES),
                Transform(title[1], nxt[1], path_arc=45 * DEGREES),
                run_time=MORPH,
            )
            self.wait(HOLD)

        self.wait(0.4)
        self.play(FadeOut(title), FadeOut(eyebrow), FadeOut(rule), run_time=0.8)
