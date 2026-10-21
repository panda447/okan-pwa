"""おかんPWAのアイコンをPillow無しで生成する（暗い背景＋ティールのハート）。"""
import struct
import sys
import zlib
from pathlib import Path

BG = (8, 11, 15)
FG = (97, 244, 222)
SS = 3  # スーパーサンプリング


def heart_inside(x, y):
    # 古典的なハート曲線 (x^2+y^2-1)^3 - x^2 y^3 <= 0
    return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0


def render(size, scale, rounded):
    rows = []
    r = size * 0.22
    for py in range(size):
        row = bytearray()
        for px in range(size):
            hits = 0
            inside_bg = 0
            for sy in range(SS):
                for sx in range(SS):
                    fx = px + (sx + 0.5) / SS
                    fy = py + (sy + 0.5) / SS
                    # 背景の角丸
                    ok = True
                    if rounded:
                        cx = min(max(fx, r), size - r)
                        cy = min(max(fy, r), size - r)
                        ok = (fx - cx) ** 2 + (fy - cy) ** 2 <= r * r
                    if ok:
                        inside_bg += 1
                    # ハート（中心を少し上に）
                    nx = (fx - size / 2) / (size * scale / 2.6)
                    ny = -(fy - size * 0.52) / (size * scale / 2.6)
                    if ok and heart_inside(nx, ny):
                        hits += 1
            n = SS * SS
            a = inside_bg / n
            t = hits / n
            if rounded and a == 0:
                row += bytes((0, 0, 0, 0))
                continue
            col = tuple(round(BG[i] * (1 - t) + FG[i] * t) for i in range(3))
            row += bytes(col + (round(255 * a) if rounded else 255,))
        rows.append(b"\x00" + bytes(row))
    return rows


def png(size, rows):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")


out = Path(sys.argv[1])
specs = [
    ("icon-192.png", 192, 0.78, True),
    ("icon-512.png", 512, 0.78, True),
    ("icon-maskable-512.png", 512, 0.56, False),  # 全面塗り＋安全領域に収める
    ("apple-touch-icon.png", 180, 0.62, False),  # iOSが角丸を付ける
]
for name, size, scale, rounded in specs:
    (out / name).write_bytes(png(size, render(size, scale, rounded)))
    print("wrote", name)
