"""TokenTour · Manim 共享主题

唯一事实来源：`src/styles/design.css` + playground `app/theme.css`。
所有 Manim 镜头都用这里的配色 / 字体 / paper 基类，保证和 Remotion、文章、
playground 数值一致（token「换引擎不换色」）。
"""

from manim import *

# ── 调色板（近似 hex，对应 design.css 的 OKLCH；见 scenes.md「Color Palette」） ──
PAPER = "#F7F7F6"  # 乳白背景
INK = "#16242B"  # 墨色正文
INK_SOFT = "#5E6B70"  # muted（id / 次要标注）
HAIRLINE = "#D7DBDB"  # 发丝线 / 边框
CYAN = "#2E9FC4"  # primary（user）
ORANGE = "#E08C42"  # accent（强调 / 选中）
GREEN = "#43B06A"  # success（assistant）
RED = "#D03A36"  # danger（停止 / 失败）
PURPLE = "#8A5CD1"  # system

# ── 字体（本机已装；Manim 走 Pango 按字体族名查找） ──
FONT_SERIF = "Source Han Serif SC"  # 思源宋体 → 正文 / 金句
FONT_SANS = "Source Han Sans SC"  # 思源黑体 → 标签
FONT_DISPLAY = "Smiley Sans"  # 得意黑 → 标题
FONT_MONO = "Menlo"  # 等宽 → 字节 / token / id / 词表


class PaperScene(Scene):
    """所有 TokenTour Manim 镜头的基类：乳白背景。"""

    def setup(self):
        self.camera.background_color = PAPER


NEUTRAL = "#AEB7BA"  # 候选未判定时的中性灰
TOKEN_CYAN = "#5FB7D8"  # token 方块填充：比 primary 更淡更亮（user / 输入）
TOKEN_GREEN = "#56BD83"  # token 方块填充：比 success 更淡更亮（assistant / 模型吐的）


def chip(
    text: str,
    tid: int | None = None,
    color: str = TOKEN_CYAN,
    *,
    width: float | None = None,
    height: float = 0.92,
    glyph_scale: float = 0.6,
    id_scale: float = 0.34,
    text_color: str = WHITE,
    font: str = FONT_MONO,
    weight: str = "SEMIBOLD",
    slant: str = "NORMAL",
):
    """一个 token 方块：**极简纯色**——无描边、无阴影、纯实心填充 + 白字。

    返回的 VGroup 带 .box / .glyph / .idtag 与 .token_text / .token_id。
    """
    glyph = Text(text, font=font, weight=weight, slant=slant, color=text_color).scale(glyph_scale)
    w = width if width is not None else max(height, glyph.width + 0.5)
    box = RoundedRectangle(corner_radius=0.12, width=w, height=height, stroke_width=0)
    box.set_fill(color, 1.0)
    glyph.move_to(box)

    group = VGroup(box, glyph)
    group.box = box
    group.glyph = glyph
    group.token_text = text
    group.token_id = tid
    group.role_color = color
    if tid is not None:
        idtag = Text(str(tid), font=FONT_MONO, color=INK_SOFT).scale(id_scale)
        idtag.next_to(box, DOWN, buff=0.14)
        group.add(idtag)
        group.idtag = idtag
    else:
        group.idtag = None
    return group
