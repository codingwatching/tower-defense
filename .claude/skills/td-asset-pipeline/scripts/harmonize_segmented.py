#!/usr/bin/env python3
"""전이(2재질) 타일용 세그먼트 하모나이저.

whole-tile 히스토그램 매칭은 grass+road 혼합 타일을 단일 앵커에 맞추면
grass 여백을 앵커 색으로 오염시킨다(실증: 잔디가 갈색으로 뭉개짐).
대신 픽셀을 재질별 소프트 멤버십으로 나눠:
  - grass 픽셀 → grass 앵커 히스토그램
  - 그 외(road/sand) 픽셀 → other 앵커 히스토그램(없으면 identity=원본 유지)
두 LUT 결과를 멤버십 가중 블렌드해 경계 프린징을 피한다.
히스토그램 매칭 수학은 번들 harmonize_palette.py와 동일(단조 CDF LUT).
"""
import argparse
import math
import shutil
import sys
from pathlib import Path
from PIL import Image

ALPHA_MIN = 8


def load(path):
    return Image.open(path).convert("RGBA")


def opaque(img):
    return [p for p in img.getdata() if p[3] >= ALPHA_MIN]


def channel_hist(pixels, ch):
    h = [0] * 256
    for p in pixels:
        h[p[ch]] += 1
    return h


def cdf(hist):
    total = sum(hist) or 1
    acc, out = 0, [0.0] * 256
    for i, v in enumerate(hist):
        acc += v
        out[i] = acc / total
    return out


def match_lut(src_hist, ref_hist):
    sc, rc = cdf(src_hist), cdf(ref_hist)
    lut, j = list(range(256)), 0
    if sum(src_hist) == 0:
        return lut  # 소스에 픽셀 없으면 identity
    for i in range(256):
        while j < 255 and rc[j] < sc[i]:
            j += 1
        lut[i] = j
    return lut


def identity_luts():
    return [list(range(256)) for _ in range(3)]


def smoothstep(x, lo, hi):
    if hi == lo:
        return 1.0 if x >= hi else 0.0
    t = max(0.0, min(1.0, (x - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)


RAMP_LO = -2.0
RAMP_HI = 10.0


def grass_weight(p, mode):
    r, g, b, a = p
    if mode == "water":            # grass vs 파랑 물: g-b 로 분리
        return smoothstep(g - b, 0, 22)
    # grass vs 따뜻한 road/sand: g-r 로 분리(황토 sand는 g≈r이라 g-(r+b)/2로는 grass와 겹침)
    return smoothstep(g - r, RAMP_LO, RAMP_HI)


def build_luts(target_pixels, anchor_pixels, mode, want_grass):
    """want_grass=True 면 grass 서브셋 히스토그램 → 앵커. False 면 other 서브셋."""
    if anchor_pixels is None:
        return identity_luts()
    subset = [p for p in target_pixels
              if (grass_weight(p, mode) >= 0.5) == want_grass]
    return [match_lut(channel_hist(subset, ch), channel_hist(anchor_pixels, ch))
            for ch in range(3)]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="+")
    ap.add_argument("--grass-anchor", required=True)
    ap.add_argument("--other-anchor", default=None, help="생략 시 비-grass 부분 원본 유지")
    ap.add_argument("--mode", choices=["warm", "water"], default="warm")
    ap.add_argument("--strength", type=float, default=0.85)
    ap.add_argument("--ramp-lo", type=float, default=-2.0, help="warm grass 멤버십 g-r 하단")
    ap.add_argument("--ramp-hi", type=float, default=10.0, help="warm grass 멤버십 g-r 상단")
    ap.add_argument("--backup-dir", default="assets/reference/pre_harmonize")
    args = ap.parse_args()

    global RAMP_LO, RAMP_HI
    RAMP_LO, RAMP_HI = args.ramp_lo, args.ramp_hi

    grass_anchor = opaque(load(args.grass_anchor))
    other_anchor = opaque(load(args.other_anchor)) if args.other_anchor else None

    backup_dir = Path(args.backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)

    for tpath in args.targets:
        tpath = Path(tpath)
        img = load(tpath)
        tdata = list(img.getdata())
        tp = [p for p in tdata if p[3] >= ALPHA_MIN]
        gluts = build_luts(tp, grass_anchor, args.mode, want_grass=True)
        oluts = build_luts(tp, other_anchor, args.mode, want_grass=False)

        out = []
        for r, g, b, a in tdata:
            if a < ALPHA_MIN:
                out.append((r, g, b, a))
                continue
            w = grass_weight((r, g, b, a), args.mode)
            src = (r, g, b)
            px = []
            for ch, v in enumerate(src):
                tgt = w * gluts[ch][v] + (1 - w) * oluts[ch][v]
                px.append(round(v + (tgt - v) * args.strength))
            out.append((max(0, min(255, px[0])), max(0, min(255, px[1])),
                        max(0, min(255, px[2])), a))

        bak = backup_dir / tpath.name
        if not bak.exists():
            shutil.copy2(tpath, bak)
        res = Image.new("RGBA", img.size)
        res.putdata(out)
        res.save(tpath)
        print(f"{tpath.name}: 세그먼트 보정 완료 (mode={args.mode}, "
              f"other={'yes' if other_anchor else 'identity'}, 백업 {bak})")


if __name__ == "__main__":
    main()
