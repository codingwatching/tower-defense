#!/usr/bin/env python3
"""잔디 변형 타일 perceptual(Lab ΔE) 계측 + 실제 해시 배치 필드 몽타주.
스테이지 tint(multiply) 시뮬레이션 포함 — 플레이테스터 지표(Lab ΔE) 재현.
usage: grass_lab.py <suffix>   # 몽타주 파일명에 붙일 접미사(before/after)
"""
import sys
from pathlib import Path
from PIL import Image

MAP = Path("assets/images/map")
WS = Path("_workspace")
T = 256
suffix = sys.argv[1] if len(sys.argv) > 1 else "now"

TINTS = {  # src/data/levels.js
    "stage1": None,
    "stage2": ("#d9a441", 0.12),
    "stage3": ("#3a7d8c", 0.16),
    "stage4": ("#3d4a6b", 0.24),
    "stage5": ("#5a1d3a", 0.32),
}


def srgb_to_lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb_to_lab(r, g, b):
    R, G, B = srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b)
    X = R * 0.4124 + G * 0.3576 + B * 0.1805
    Y = R * 0.2126 + G * 0.7152 + B * 0.0722
    Z = R * 0.0193 + G * 0.1192 + B * 0.9505
    X, Y, Z = X / 0.95047, Y / 1.0, Z / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(X), f(Y), f(Z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def de(l1, l2):
    return sum((a - b) ** 2 for a, b in zip(l1, l2)) ** 0.5


def mean_rgb(path):
    px = [p for p in Image.open(MAP / path).convert("RGBA").getdata() if p[3] >= 8]
    n = max(len(px), 1)
    return tuple(sum(p[i] for p in px) / n for i in range(3))


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def tint_rgb(rgb, tint):
    if not tint:
        return rgb
    tc, alpha = hexrgb(tint[0]), tint[1]
    # multiply: base*(1-a) + (base*tc/255)*a
    return tuple(rgb[i] * (1 - alpha) + (rgb[i] * tc[i] / 255) * alpha for i in range(3))


base = mean_rgb("tile_grass.png")
clover = mean_rgb("tile_grass_clover.png")
flower = mean_rgb("tile_grass_flower.png")

print(f"[{suffix}] 잔디 변형 perceptual ΔE (기본 tile_grass 대비)")
print(f"  raw RGB: grass{tuple(round(x) for x in base)} clover{tuple(round(x) for x in clover)} flower{tuple(round(x) for x in flower)}")
print(f"{'스테이지':<10}{'tint':<20}{'ΔE clover':>10}{'ΔE flower':>10}")
for st, tint in TINTS.items():
    lb = rgb_to_lab(*tint_rgb(base, tint))
    lc = rgb_to_lab(*tint_rgb(clover, tint))
    lf = rgb_to_lab(*tint_rgb(flower, tint))
    ts = f"{tint[0]} a{tint[1]}" if tint else "없음(원색)"
    print(f"{st:<10}{ts:<20}{de(lb, lc):>10.1f}{de(lb, lf):>10.1f}")


# ── 실제 해시 배치 필드 몽타주 (tilemap.js hash2/grassTileKey 재현) ──
def imul(a, b):
    r = (a * b) & 0xFFFFFFFF
    return r - 0x100000000 if r >= 0x80000000 else r


def hash2(col, row):
    h = (imul(col, 374761393) + imul(row, 668265263)) & 0xFFFFFFFF
    if h >= 0x80000000:
        h -= 0x100000000
    h = imul(h ^ ((h & 0xFFFFFFFF) >> 13), 1274126177)
    return ((h & 0xFFFFFFFF) ^ ((h & 0xFFFFFFFF) >> 16)) % 100


def grass_key(col, row):
    hv = hash2(col, row)
    if hv < 60:
        return "tile_grass.png"
    if hv < 85:
        return "tile_grass_clover.png"
    return "tile_grass_flower.png"


imgs = {n: Image.open(MAP / n).convert("RGBA") for n in
        ["tile_grass.png", "tile_grass_clover.png", "tile_grass_flower.png"]}
COLS, ROWS = 8, 5


def make_field(tint):
    field = Image.new("RGBA", (COLS * T, ROWS * T))
    for r in range(ROWS):
        for c in range(COLS):
            field.paste(imgs[grass_key(c, r)], (c * T, r * T))
    if tint:
        ov = Image.new("RGBA", field.size, hexrgb(tint[0]) + (0,))
        # multiply 근사: 픽셀 곱 후 alpha 블렌드
        base_px = field.convert("RGB")
        tc = hexrgb(tint[0])
        mult = Image.eval(base_px, lambda v: v)  # placeholder
        from PIL import ImageChops
        tint_solid = Image.new("RGB", field.size, tc)
        multiplied = ImageChops.multiply(base_px, tint_solid)
        out = Image.blend(base_px, multiplied, tint[1])
        return out
    return field.convert("RGB")


make_field(None).save(WS / f"03_grassfield_notint_{suffix}.png")
make_field(TINTS["stage2"]).save(WS / f"03_grassfield_stage2tint_{suffix}.png")
print(f"  몽타주: 03_grassfield_notint_{suffix}.png, 03_grassfield_stage2tint_{suffix}.png")
