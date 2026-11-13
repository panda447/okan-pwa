"""おかんPWAのアイコンを作る（要 Pillow）。

絵柄はアプリの中と同じ：のれんの藍の地に、テープで貼った黄色い置き手紙と、おかんの顔。
色と顔の形は public/style.css と public/js/views/parts.js の OKAN_FACE に合わせてある。

使い方： python tools/make_icons.py public
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

AI = (42, 75, 155)          # --accent（藍）
AI_DEEP = (30, 56, 122)
NOTE = (255, 240, 163)      # --note
NOTE_EDGE = (241, 220, 122) # --note-edge
INK = (51, 48, 31)          # --note-ink
SKIN = (251, 227, 196)
CHEEK = (242, 167, 154)
TAPE = (214, 224, 247, 235)
SS = 4  # 大きく描いてから縮める


def bezier(p0, p1, p2, p3, n=24):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((
            u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
            u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
        ))
    return pts


def draw_face(d, ox, oy, k):
    """OKAN_FACE（viewBox 0 0 40 40）を、左上 (ox, oy)・1単位 k ピクセルで描く。"""
    P = lambda x, y: (ox + x * k, oy + y * k)
    circle = lambda cx, cy, r, **kw: d.ellipse([*P(cx - r, cy - r), *P(cx + r, cy + r)], **kw)
    ellipse = lambda cx, cy, rx, ry, **kw: d.ellipse([*P(cx - rx, cy - ry), *P(cx + rx, cy + ry)], **kw)
    stroke = max(1, round(1.6 * k))

    circle(20, 8.5, 6, fill=INK)                                   # おだんご
    circle(20, 23, 14, fill=SKIN, outline=INK, width=stroke)        # 顔
    fringe = (
        bezier((6.6, 19.5), (8, 11.5), (14, 9.5), (20, 9.5))
        + bezier((20, 9.5), (26, 9.5), (32, 11.5), (33.4, 19.5))
        + bezier((33.4, 19.5), (29.8, 16.1), (25.4, 14.9), (20, 14.9))
        + bezier((20, 14.9), (14.6, 14.9), (10.2, 16.1), (6.6, 19.5))
    )
    d.polygon([P(x, y) for x, y in fringe], fill=INK)               # 前髪
    circle(10.5, 28, 2.2, fill=CHEEK)
    circle(29.5, 28, 2.2, fill=CHEEK)
    circle(20, 23, 14, outline=INK, width=stroke)                   # ほっぺが輪郭に乗らないよう描き直す
    ellipse(14.5, 23.5, 1.5, 2, fill=INK)                           # 目
    ellipse(25.5, 23.5, 1.5, 2, fill=INK)
    smile = bezier((15, 29.5), (16.6, 31.3), (18.2, 32), (20, 32)) + bezier((20, 32), (21.8, 32), (23.4, 31.3), (25, 29.5))
    # 口。線で引くと継ぎ目が角張るので、丸を細かく並べて描く
    for i in range(len(smile) - 1):
        (xa, ya), (xb, yb) = P(*smile[i]), P(*smile[i + 1])
        for j in range(9):
            x, y = xa + (xb - xa) * j / 8, ya + (yb - ya) * j / 8
            d.ellipse([x - stroke / 2, y - stroke / 2, x + stroke / 2, y + stroke / 2], fill=INK)


def memo(side):
    """置き手紙（テープ付き）を、回転の余白込みの透明な画像で返す。"""
    pad = round(side * 0.2)
    im = Image.new("RGBA", (side + pad * 2, side + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = pad, pad, pad + side, pad + side
    fold = round(side * 0.17)
    # 紙（左下の角を折る）
    d.polygon([(x0, y0), (x1, y0), (x1, y1), (x0 + fold, y1), (x0, y1 - fold)], fill=NOTE)
    d.polygon([(x0, y1 - fold), (x0 + fold, y1 - fold), (x0 + fold, y1)], fill=NOTE_EDGE)
    # 顔
    face = side * 0.74
    draw_face(d, x0 + (side - face) / 2, y0 + side * 0.17, face / 40)
    # テープ
    tw, th = round(side * 0.42), round(side * 0.15)
    tape = Image.new("RGBA", (tw, th), TAPE)
    tape = tape.rotate(4, expand=True, resample=Image.BICUBIC)
    im.alpha_composite(tape, (round((x0 + x1) / 2 - tape.width / 2), round(y0 - tape.height * 0.5)))
    return im


def render(size, scale, rounded):
    S = size * SS
    base = Image.new("RGBA", (S, S), AI + (255,))
    note = memo(round(S * scale)).rotate(5, expand=True, resample=Image.BICUBIC)
    pos = (round(S / 2 - note.width / 2), round(S * 0.52 - note.height / 2))
    # 紙の影
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    shadow.paste(AI_DEEP + (255,), (pos[0], pos[1] + round(S * 0.022)), note.getchannel("A"))
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(S * 0.012)))
    base.alpha_composite(note, pos)
    if rounded:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=round(S * 0.22), fill=255)
        base.putalpha(mask)
    out = base.resize((size, size), Image.LANCZOS)
    return out if rounded else out.convert("RGB")


SPECS = [
    ("icon-192.png", 192, 0.66, True),
    ("icon-512.png", 512, 0.66, True),
    ("icon-maskable-512.png", 512, 0.5, False),   # 全面塗り。中央80%の安全領域に収める
    ("apple-touch-icon.png", 180, 0.62, False),   # iOSが角丸を付ける
]

if __name__ == "__main__":
    out = Path(sys.argv[1])
    for name, size, scale, rounded in SPECS:
        render(size, scale, rounded).save(out / name, optimize=True)
        print("wrote", name)
