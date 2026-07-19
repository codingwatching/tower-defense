#!/usr/bin/env python3
"""타일 팔레트 하모나이저 — 앵커 타일 기준 채널 히스토그램 매칭으로 색상 일관성 보정.

보정:  harmonize_palette.py --anchor tile_grass.png [--strength 0.85] target1.png target2.png ...
계측:  harmonize_palette.py --check --anchor tile_grass.png target1.png target2.png ...

- 불투명(alpha>=8) 픽셀만 계산에 사용, 알파 채널은 그대로 보존.
- 보정은 대상을 제자리 덮어쓰기하며 원본을 --backup-dir 에 보존한다.
- --check 는 쓰기 없이 앵커 대비 평균색 거리 표를 출력, 임계 초과 시 exit 1.
사용 맥락: td-asset-pipeline SKILL.md §7.5 (타일 팔레트 락).
"""
import argparse
import math
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow 필요: pip3 install --user pillow")

ALPHA_MIN = 8


def load_rgba(path):
    return Image.open(path).convert("RGBA")


def opaque_data(img):
    return [p for p in img.getdata() if p[3] >= ALPHA_MIN]


def mean_color(pixels):
    n = max(len(pixels), 1)
    return tuple(sum(p[i] for p in pixels) / n for i in range(3))


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
    """소스 CDF를 레퍼런스 CDF에 사상하는 단조 LUT."""
    sc, rc = cdf(src_hist), cdf(ref_hist)
    lut, j = [0] * 256, 0
    for i in range(256):
        while j < 255 and rc[j] < sc[i]:
            j += 1
        lut[i] = j
    return lut


def harmonize(target_img, anchor_pixels, strength):
    tdata = list(target_img.getdata())
    topaque = [p for p in tdata if p[3] >= ALPHA_MIN]
    luts = [
        match_lut(channel_hist(topaque, ch), channel_hist(anchor_pixels, ch))
        for ch in range(3)
    ]
    out = []
    for r, g, b, a in tdata:
        if a < ALPHA_MIN:
            out.append((r, g, b, a))
            continue
        out.append((
            round(r + (luts[0][r] - r) * strength),
            round(g + (luts[1][g] - g) * strength),
            round(b + (luts[2][b] - b) * strength),
            a,
        ))
    res = Image.new("RGBA", target_img.size)
    res.putdata(out)
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="+", help="보정/계측 대상 PNG")
    ap.add_argument("--anchor", required=True, help="패밀리 앵커 타일 PNG")
    ap.add_argument("--strength", type=float, default=0.85, help="보정 강도 0~1 (기본 0.85)")
    ap.add_argument("--check", action="store_true", help="쓰기 없이 평균색 거리 계측만")
    ap.add_argument("--threshold", type=float, default=18.0, help="--check 합격 임계 (기본 18)")
    ap.add_argument("--backup-dir", default="assets/reference/pre_harmonize", help="보정 전 원본 보존 위치")
    args = ap.parse_args()

    anchor_path = Path(args.anchor)
    anchor_pixels = opaque_data(load_rgba(anchor_path))
    anchor_mean = mean_color(anchor_pixels)

    targets = [Path(t) for t in args.targets if Path(t).resolve() != anchor_path.resolve()]
    if not targets:
        sys.exit("대상이 없습니다 (앵커 자신은 제외됩니다)")

    if args.check:
        print(f"앵커 {anchor_path.name} 평균색 RGB({anchor_mean[0]:.0f},{anchor_mean[1]:.0f},{anchor_mean[2]:.0f}) 임계 {args.threshold}")
        print(f"{'타일':<32} {'평균색':<18} {'거리':>6}  판정")
        failed = 0
        for t in targets:
            m = mean_color(opaque_data(load_rgba(t)))
            d = math.dist(anchor_mean, m)
            ok = d <= args.threshold
            failed += 0 if ok else 1
            print(f"{t.name:<32} RGB({m[0]:.0f},{m[1]:.0f},{m[2]:.0f})   {d:6.1f}  {'PASS' if ok else 'FAIL'}")
        sys.exit(1 if failed else 0)

    backup_dir = Path(args.backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)
    for t in targets:
        img = load_rgba(t)
        before = math.dist(anchor_mean, mean_color(opaque_data(img)))
        bak = backup_dir / t.name
        if not bak.exists():
            shutil.copy2(t, bak)
        res = harmonize(img, anchor_pixels, args.strength)
        res.save(t)
        after = math.dist(anchor_mean, mean_color(opaque_data(res)))
        print(f"{t.name}: 거리 {before:.1f} → {after:.1f} (백업 {bak})")


if __name__ == "__main__":
    main()
