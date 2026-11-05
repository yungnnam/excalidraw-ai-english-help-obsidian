"""生成三张「像手写」的样本图，用来实测三个模式的识别与输出。
输出： dev/sample-sentence.png / dev/sample-words.png / dev/sample-zh.png
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(ROOT, "dev")

HAND = [r"C:\Windows\Fonts\inkfree.ttf", r"C:\Windows\Fonts\segoesc.ttf", r"C:\Windows\Fonts\comic.ttf"]
CJK = [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"]


def pick(cands, size):
    for p in cands:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def draw(path, lines, fonts, size, gap=34, pad=40, width=None):
    f = pick(fonts, size)
    tmp = Image.new("RGB", (10, 10))
    d = ImageDraw.Draw(tmp)
    w = width or max(int(d.textlength(t, font=f)) for t in lines) + pad * 2
    h = pad * 2 + len(lines) * size + (len(lines) - 1) * gap
    img = Image.new("RGB", (int(w), int(h)), "white")
    d = ImageDraw.Draw(img)
    y = pad
    for t in lines:
        d.text((pad, y), t, font=f, fill="#1c1c1c")
        y += size + gap
    img.save(path)
    print("OK", path, img.size)


def main():
    draw(
        os.path.join(OUTDIR, "sample-sentence.png"),
        ["I has a apple yesterday,", "and go to school."],
        HAND,
        44,
    )
    draw(
        os.path.join(OUTDIR, "sample-words.png"),
        ["ubiquitous", "resilient", "meticulous"],
        HAND,
        48,
        40,
    )
    draw(
        os.path.join(OUTDIR, "sample-zh.png"),
        ["这个方案在成本上不可行，", "而且交付周期也太长。"],
        CJK,
        40,
    )


if __name__ == "__main__":
    main()
