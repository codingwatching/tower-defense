#!/usr/bin/env python3
"""렌더된 스테이지 배경 PNG에서 순수 잔디 셀 per-tile Lab ΔE(중앙값 대비) 계측.
플레이테스터 방법론 재현: 64px 셀 격자, 초록 지배 셀만(길=갈색·바위=회색·꽃무더기 제외), maxΔE."""
import statistics
from pathlib import Path
from PIL import Image

WS = Path("_workspace")
TILE = 64


def srgb_lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lab(rgb):
    R, G, B = (srgb_lin(x) for x in rgb)
    X = (R*0.4124+G*0.3576+B*0.1805)/0.95047
    Y = R*0.2126+G*0.7152+B*0.0722
    Z = (R*0.0193+G*0.1192+B*0.9505)/1.08883
    f = lambda t: t**(1/3) if t > 0.008856 else 7.787*t+16/116
    fx, fy, fz = f(X), f(Y), f(Z)
    return (116*fy-16, 500*(fx-fy), 200*(fy-fz))


def de(a, b):
    return sum((x-y)**2 for x, y in zip(a, b))**0.5


def cell_stats(img, cx, cy):
    """셀 평균 + 초록지배 픽셀 비율(순수 잔디 판별용)."""
    px = list(img.crop((cx, cy, cx+TILE, cy+TILE)).getdata())
    n = len(px)
    mean = tuple(sum(p[i] for p in px)/n for i in range(3))
    green = sum(1 for r, g, b in px if g > r+4 and g > b+8) / n
    return mean, green


def is_grass_cell(m, green_frac):
    # 순수 잔디 셀만: 픽셀 90%+가 초록지배(길·전이·바위·꽃 스며든 셀 제외)
    return green_frac >= 0.90


print(f"{'스테이지':<8}{'잔디셀수':>7}{'maxΔE':>8}{'p95ΔE':>8}{'초과(>18)':>10}  판정")
for i in range(1, 6):
    p = WS / f"03_render_stage{i}.png"
    if not p.exists():
        continue
    img = Image.open(p).convert("RGB")
    W, H = img.size
    cells = []
    for cy in range(0, H, TILE):
        for cx in range(0, W, TILE):
            m, gf = cell_stats(img, cx, cy)
            if is_grass_cell(m, gf):
                cells.append(lab(m))
    if not cells:
        print(f"stage{i}: 잔디셀 없음")
        continue
    med = tuple(statistics.median(c[k] for c in cells) for k in range(3))
    ds = sorted(de(c, med) for c in cells)
    mx = ds[-1]
    p95 = ds[int(len(ds)*0.95)-1] if len(ds) >= 20 else mx
    over = sum(1 for d in ds if d > 18)
    verdict = "PASS" if mx <= 18 else ("경계" if mx <= 24 else "FAIL")
    print(f"stage{i:<3}{len(cells):>7}{mx:>8.1f}{p95:>8.1f}{over:>7}/{len(ds):<3}  {verdict}")
