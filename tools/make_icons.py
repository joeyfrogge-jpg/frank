"""Regenerate FRANK PNG icons (needs Pillow): python3 tools/make_icons.py"""
import math, os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

def star(d, cx, cy, r, fill):
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2
        rad = r if i % 2 == 0 else r * 0.28
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    d.polygon(pts, fill=fill)

def icon(size, rounded=True, scale=0.62):
    S = size * 4  # supersample
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=(0, 0, 0, 255))
    else:
        d.rectangle([0, 0, S, S], fill=(0, 0, 0, 255))
    star(d, S / 2, S / 2, S * scale / 2, (167, 139, 250, 255))
    star(d, S / 2, S / 2, S * scale / 2 * 0.55, (96, 165, 250, 255))
    return img.resize((size, size), Image.LANCZOS)

os.makedirs(OUT, exist_ok=True)
icon(192).save(os.path.join(OUT, "icon-192.png"))
icon(512).save(os.path.join(OUT, "icon-512.png"))
icon(512, rounded=False, scale=0.46).save(os.path.join(OUT, "icon-maskable-512.png"))   # safe zone
# iOS wants an opaque square; the OS rounds it
icon(180, rounded=False, scale=0.62).convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"))
print("icons written to", OUT)
