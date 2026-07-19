#!/usr/bin/env python3
"""전이(2재질) 타일의 재질별 평균색을 계측한다.
whole-tile 평균은 grass+road 혼합이라 단일재질 앵커와 비교 무의미 →
grass 여백 픽셀 / 비-grass(road·water·dirt) 픽셀을 분리해 각각의 앵커와 비교.
"""
import math
import sys
from pathlib import Path
from PIL import Image

MAP = Path("assets/images/map")
ALPHA_MIN = 8


def px(path):
    return [p for p in Image.open(path).convert("RGBA").getdata() if p[3] >= ALPHA_MIN]


def is_grass(p):
    r, g, b, a = p
    return g > r + 8 and g > b + 8


def is_water(p):
    r, g, b, a = p
    return b > r + 15 and b >= g - 10 and b > 70


def mean(pixels):
    n = max(len(pixels), 1)
    return tuple(sum(p[i] for p in pixels) / n for i in range(3))


def fmt(m):
    return f"RGB({m[0]:3.0f},{m[1]:3.0f},{m[2]:3.0f})"


grass_anchor = mean([p for p in px(MAP / "tile_grass.png")])
path_anchor = mean(px(MAP / "tile_path.png"))
water_anchor = mean([p for p in px(MAP / "tile_water.png") if is_water(p)])
dirt_anchor = mean(px(MAP / "tile_dirt.png"))

print(f"앵커  grass {fmt(grass_anchor)}  path {fmt(path_anchor)}  water {fmt(water_anchor)}  dirt {fmt(dirt_anchor)}")
print()
print(f"{'타일':<24}{'grass여백':<16}{'d(grass)':>9}   {'비-grass':<16}{'d(비앵커)':>10}  비앵커")
print("-" * 88)

# 타일별: 어떤 앵커를 '비-grass' 부분에 쓸지
spec = [
    ("tile_path_h.png", "path", path_anchor),
    ("tile_path_v.png", "path", path_anchor),
    ("tile_path_ne.png", "path", path_anchor),
    ("tile_path_nw.png", "path", path_anchor),
    ("tile_path_se.png", "path", path_anchor),
    ("tile_path_sw.png", "path", path_anchor),
    ("tile_water_edge.png", "water", water_anchor),
    ("tile_dirt_edge.png", "dirt", dirt_anchor),
]

for name, label, other_anchor in spec:
    pixels = px(MAP / name)
    g = [p for p in pixels if is_grass(p)]
    if label == "water":
        o = [p for p in pixels if is_water(p)]
    else:
        o = [p for p in pixels if not is_grass(p)]
    gm = mean(g)
    om = mean(o)
    dg = math.dist(grass_anchor, gm)
    do = math.dist(other_anchor, om)
    gf = 100 * len(g) / max(len(pixels), 1)
    of = 100 * len(o) / max(len(pixels), 1)
    print(f"{name:<24}{fmt(gm)}  {dg:6.1f}   {fmt(om)}  {do:7.1f}   {label} ({gf:.0f}%g/{of:.0f}%o)")
