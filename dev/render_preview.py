"""把 dev/preview-model.json 用 Pillow 画成 PNG，用来肉眼检查卡片排版。

用法： python dev/render_preview.py
输出： dev/preview.png
"""
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = os.path.join(ROOT, "dev", "preview-model.json")
OUT = os.path.join(ROOT, "dev", "preview.png")
if len(sys.argv) > 1:
    MODEL = os.path.abspath(sys.argv[1])
    OUT = MODEL.replace("preview-model", "preview").replace(".json", ".png")

SCALE = 2

CJK_FONT = r"C:\Windows\Fonts\msyh.ttc"
IPA_FONT = r"C:\Windows\Fonts\segoeui.ttf"

EMOJI = {"🔤": "Aa", "📝": "ABC", "🌉": "中英"}
IPA_RANGES = ((0x0250, 0x02FF), (0x1D00, 0x1DBF), (0x02B0, 0x02FF))
_cache = {}


def get_font(size, kind="cjk"):
    key = (size, kind)
    if key not in _cache:
        path = IPA_FONT if kind == "ipa" else CJK_FONT
        if not os.path.exists(path):
            path = CJK_FONT
        _cache[key] = ImageFont.truetype(path, int(size * SCALE))
    return _cache[key]


def is_ipa(ch):
    if ch in "ˈˌːəɪʊɛæʌɑɔθðʃʒŋɜɐɚɝ":
        return True
    code = ord(ch)
    return any(a <= code <= b for a, b in IPA_RANGES)


def strip_emoji(text):
    for k, v in EMOJI.items():
        text = text.replace(k, v)
    return text


def draw_rich(draw, x, y, text, size, color):
    for ch in strip_emoji(text):
        f = get_font(size, "ipa" if is_ipa(ch) else "cjk")
        draw.text((x, y), ch, font=f, fill=color)
        x += f.getlength(ch)
    return x


def draw_card(draw, model, ox, oy):
    w = model["width"] * SCALE
    h = model["height"] * SCALE
    draw.rounded_rectangle([ox, oy, ox + w, oy + h], radius=8 * SCALE, fill="#f8f9fa", outline="#dee2e6", width=SCALE)

    for row in model["rows"]:
        x = ox + row["x"] * SCALE
        y = oy + row["y"] * SCALE
        if row["kind"] == "divider":
            draw.line([x, y, x + row["w"] * SCALE, y], fill=row["color"], width=SCALE)
            continue
        draw_rich(draw, x, y, row["text"], row["size"], row["color"])


def main():
    with open(MODEL, encoding="utf-8") as fh:
        models = json.load(fh)

    # --each：每张卡片单独出一张图（长卡片拼在一起会看不清）
    if "--each" in sys.argv:
        for m in models:
            h = m["height"] * SCALE
            w = m["width"] * SCALE
            img = Image.new("RGB", (int(w + 40), int(h + 40)), "#ffffff")
            draw = ImageDraw.Draw(img)
            draw_card(draw, m, 20, 20)
            out = os.path.join(ROOT, "dev", "preview-" + m["id"] + ".png")
            img.save(out)
            print("OK", out, img.size)
        return

    pad = 40 * SCALE
    src_w = 260 * SCALE
    gap = 24 * SCALE
    label_h = 30 * SCALE

    total_h = pad * 2 + sum(max(m["height"] * SCALE, 90 * SCALE) + label_h + gap for m in models) + 20 * SCALE
    total_w = pad * 2 + src_w + gap + max(m["width"] for m in models) * SCALE + 20 * SCALE

    img = Image.new("RGB", (int(total_w), int(total_h)), "#ffffff")
    draw = ImageDraw.Draw(img)

    y = pad
    for m in models:
        draw.text((pad, y), m["label"], font=get_font(13), fill="#868e96")
        y += label_h

        ty = y
        for line in m["src"].split("\n"):
            draw_rich(draw, pad, ty, line, 22, "#495057")
            ty += int(22 * 1.6 * SCALE)

        ax = pad + src_w - 26 * SCALE
        draw.text((ax, y + 12 * SCALE), "→", font=get_font(18, "ipa"), fill="#ced4da")

        draw_card(draw, m, pad + src_w + gap, y)
        y += max(m["height"] * SCALE, 90 * SCALE) + gap

    img.save(OUT)
    print("OK", OUT, img.size)


if __name__ == "__main__":
    main()
