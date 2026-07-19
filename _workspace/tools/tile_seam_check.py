#!/usr/bin/env python3
"""보정 후 최종 검수: 재질별 거리 계측 + seam 몽타주 생성."""
import math
from pathlib import Path
from PIL import Image

MAP = Path("assets/images/map")
WS = Path("_workspace")
ALPHA_MIN = 8
T = 256


def opq(p):
    return [q for q in Image.open(MAP / p).convert("RGBA").getdata() if q[3] >= ALPHA_MIN]


def mean(px):
    n = max(len(px), 1)
    return tuple(sum(q[i] for q in px) / n for i in range(3))


def is_grass_warm(q):  # 하모나이저 warm 멤버십과 동일: g-r
    r, g, b, a = q
    return (g - r) >= 4


def is_water(q):
    r, g, b, a = q
    return (g - b) < 11 and b > 70


def fmt(m):
    return f"RGB({m[0]:3.0f},{m[1]:3.0f},{m[2]:3.0f})"


grass_anchor = mean(opq("tile_grass.png"))
path_anchor = mean(opq("tile_path.png"))
water_anchor = mean([q for q in opq("tile_water.png") if is_water(q)])
dirt_anchor = mean(opq("tile_dirt.png"))

print("=== 보정 후 재질별 거리 (임계 18) ===")
print(f"앵커 grass {fmt(grass_anchor)} | path {fmt(path_anchor)} | water {fmt(water_anchor)} | dirt {fmt(dirt_anchor)}\n")
print(f"{'타일':<22}{'grass여백 d':>12}{'  판정':<6}{'재질 d':>10}{'  판정':<6}  재질앵커")
print("-" * 76)

spec = [
    ("tile_path_h.png", path_anchor, "warm", "path"),
    ("tile_path_v.png", path_anchor, "warm", "path"),
    ("tile_path_ne.png", path_anchor, "warm", "path"),
    ("tile_path_nw.png", path_anchor, "warm", "path"),
    ("tile_path_se.png", path_anchor, "warm", "path"),
    ("tile_path_sw.png", path_anchor, "warm", "path"),
    ("tile_water_edge.png", water_anchor, "water", "water"),
    ("tile_dirt_edge.png", dirt_anchor, "warm", "dirt"),
]
allpass = True
for name, oa, mode, lbl in spec:
    px = opq(name)
    if mode == "water":
        g = [q for q in px if not is_water(q) and (q[1] - q[2]) >= 11]
        o = [q for q in px if is_water(q)]
    else:
        g = [q for q in px if is_grass_warm(q)]
        o = [q for q in px if not is_grass_warm(q)]
    dg = math.dist(grass_anchor, mean(g))
    do = math.dist(oa, mean(o))
    pg = "PASS" if dg <= 18 else "FAIL"
    po = "PASS" if do <= 18 else "FAIL"
    allpass = allpass and dg <= 18 and do <= 18
    print(f"{name:<22}{dg:9.1f}   {pg:<6}{do:8.1f}   {po:<6}  {lbl}")
print(f"\n전 항목 PASS: {allpass}")

# 잔디 패밀리(단일재질) whole-tile
print("\n=== 잔디 패밀리 whole-tile (단일재질, 임계 18) ===")
for name in ["tile_grass_clover.png", "tile_grass_flower.png"]:
    d = math.dist(grass_anchor, mean(opq(name)))
    print(f"{name:<24}{d:6.1f}  {'PASS' if d<=18 else 'FAIL'}")


def load(p):
    return Image.open(MAP / p).convert("RGBA")


def hstack(names, gap=4):
    imgs = [load(n) for n in names]
    W = sum(i.width for i in imgs) + gap * (len(imgs) - 1)
    canvas = Image.new("RGBA", (W, T), (30, 30, 30, 255))
    x = 0
    for im in imgs:
        canvas.paste(im, (x, 0), im)
        x += im.width + gap
    return canvas


def vstack(names, gap=4):
    imgs = [load(n) for n in names]
    H = sum(i.height for i in imgs) + gap * (len(imgs) - 1)
    canvas = Image.new("RGBA", (T, H), (30, 30, 30, 255))
    y = 0
    for im in imgs:
        canvas.paste(im, (0, y), im)
        y += im.height + gap
    return canvas


WS.mkdir(exist_ok=True)

# 교차 seam 몽타주
seams = [
    ("seam_path_v", hstack(["tile_grass.png", "tile_path_v.png", "tile_grass.png"])),
    ("seam_path_h", vstack(["tile_grass.png", "tile_path_h.png", "tile_grass.png"])),
    ("seam_water", vstack(["tile_grass.png", "tile_water_edge.png", "tile_water.png"])),
    ("seam_dirt", vstack(["tile_grass.png", "tile_dirt_edge.png", "tile_dirt.png"])),
]
# 하나의 큰 캔버스에 배치
pad = 16
col_w = max(im.width for _, im in seams) + pad
total_w = col_w * len(seams) + pad
total_h = max(im.height for _, im in seams) + 2 * pad
board = Image.new("RGBA", (total_w, total_h), (24, 24, 28, 255))
x = pad
for _, im in seams:
    board.paste(im, (x, pad), im)
    x += col_w
board.convert("RGB").save(WS / "03_tilecheck_seams.png")
print(f"\nseam 몽타주 저장: {WS/'03_tilecheck_seams.png'}")

# 길 패밀리 패치워크 (6종 나란히 — 색 일관성 육안)
patch = hstack(["tile_path_nw.png", "tile_path_h.png", "tile_path_ne.png",
                "tile_path_v.png", "tile_path_sw.png", "tile_path_se.png"])
patch.convert("RGB").save(WS / "03_tilecheck_path_family.png")
print(f"길 패밀리 몽타주 저장: {WS/'03_tilecheck_path_family.png'}")

# 길 loop (닫힌 트랙) — 도로 연속성/톤 일관성
loop_layout = [["tile_path_se.png", "tile_path_h.png", "tile_path_sw.png"],
               ["tile_path_v.png", "tile_grass.png", "tile_path_v.png"],
               ["tile_path_ne.png", "tile_path_h.png", "tile_path_nw.png"]]
loop = Image.new("RGBA", (T * 3, T * 3), (30, 30, 30, 255))
for r, row in enumerate(loop_layout):
    for c, n in enumerate(row):
        im = load(n)
        loop.paste(im, (c * T, r * T), im)
loop.convert("RGB").save(WS / "03_tilecheck_path_loop.png")
print(f"길 loop 몽타주 저장: {WS/'03_tilecheck_path_loop.png'}")
