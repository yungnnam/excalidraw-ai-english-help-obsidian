# 画一张「悬浮窗长什么样、坐在画布哪儿」的示意图
# python dev/render_floatbar.py
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "preview-floatbar.png")

S = 2  # 2x，屏幕上看更清楚
W, H = 860, 420
img = Image.new("RGB", (W * S, H * S), "#ffffff")
d = ImageDraw.Draw(img)

CN = os.path.join("C:\\Windows\\Fonts", "msyh.ttc")
MONO = os.path.join("C:\\Windows\\Fonts", "consola.ttf")

def f(path, size):
    try:
        return ImageFont.truetype(path, size * S)
    except Exception:
        return ImageFont.load_default()

f_cn = f(CN, 12)
f_cn_big = f(CN, 14)
f_tiny = f(CN, 10)
f_mono = f(MONO, 11)

# ---- 画布底：虚线网格 ----
for x in range(0, W, 24):
    for y in range(0, H, 24):
        d.ellipse([x * S, y * S, x * S + 1 * S, y * S + 1 * S], fill="#e3e6ea")

d.text((24 * S, 20 * S), "Excalidraw 画布", font=f_cn_big, fill="#adb5bd")
d.text((24 * S, 42 * S), "（示意图：真实按钮上还有 emoji 图标，颜色跟随你的 Obsidian 主题）", font=f_tiny, fill="#c1c7cd")

# ---- 一段「手写」示意 ----
d.text((30 * S, 110 * S), "I has a apple yesterday", font=f(CN, 26), fill="#343a40")
d.rectangle([28 * S, 104 * S, 372 * S, 150 * S], outline="#74c0fc", width=2 * S)
d.text((28 * S, 156 * S), "↑ 框选它，然后点下面的按钮", font=f_tiny, fill="#74c0fc")

# ---- 悬浮窗 ----
labels = ["词缀", "批改", "中译英"]
pad, gap, bh = 6, 4, 26
btn_w = [46, 46, 58]
bar_w = pad * 2 + 14 + gap * 6 + sum(btn_w) + 26 + 44
bar_h = bh + pad * 2
bx, by = W - bar_w - 24, H - bar_h - 20

d.rounded_rectangle([bx * S, by * S, (bx + bar_w) * S, (by + bar_h) * S], radius=10 * S, fill="#f4f5f7", outline="#d5d8dc", width=1 * S)

# 拖动手柄：六个点
hx = bx + pad + 3
for row in range(2):
    for col in range(2):
        cx, cy = hx + col * 5, by + bar_h / 2 - 5 + row * 7
        d.ellipse([cx * S, cy * S, (cx + 3) * S, (cy + 3) * S], fill="#adb5bd")

x = bx + pad + 14 + gap
for i, (lab, bw) in enumerate(zip(labels, btn_w)):
    d.rounded_rectangle([x * S, (by + pad) * S, (x + bw) * S, (by + pad + bh) * S], radius=6 * S, fill="#ffffff", outline="#dadee3", width=1 * S)
    tw = d.textlength(lab, font=f_cn)
    d.text((x * S + (bw * S - tw) / 2, (by + pad + 5) * S), lab, font=f_cn, fill="#343a40")
    x += bw + gap
    # 翻译按钮后面紧跟一个「⇄」：点一下在中译英 / 英译中之间切换
    if i == 2:
        fbw = 22
        d.rounded_rectangle([(x - 2) * S, (by + pad) * S, (x - 2 + fbw) * S, (by + pad + bh) * S], radius=6 * S, fill="#ffffff", outline="#dadee3", width=1 * S)
        f_sym = ImageFont.truetype("C:/Windows/Fonts/seguisym.ttf", 13 * S)
        ft = "⇄"
        tw = d.textlength(ft, font=f_sym)
        d.text(((x - 2) * S + (fbw * S - tw) / 2, (by + pad + 3) * S), ft, font=f_sym, fill="#6c757d")
        x += fbw + gap

# 设置按钮：点一下跳到 Obsidian 的插件设置页
sbw = 44
d.rounded_rectangle([x * S, (by + pad) * S, (x + sbw) * S, (by + pad + bh) * S], radius=6 * S, fill="#ffffff", outline="#dadee3", width=1 * S)
st = "设置"
tw = d.textlength(st, font=f_cn)
d.text((x * S + (sbw * S - tw) / 2, (by + pad + 5) * S), st, font=f_cn, fill="#6c757d")

# 说明箭头
d.line([(bx + bar_w - 6) * S, (by - 6) * S, (bx + bar_w - 6) * S, (by - 40) * S], fill="#ced4da", width=1 * S)
d.text(((bx + bar_w - 176) * S, (by - 58) * S), "常驻右下角，按住左边手柄拖到顺手的位置", font=f_tiny, fill="#adb5bd")

img.save(OUT)
print("written: " + OUT)
