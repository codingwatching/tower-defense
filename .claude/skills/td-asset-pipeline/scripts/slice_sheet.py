#!/usr/bin/env python3
"""스프라이트 시트 슬라이서 — codex 생성 시트를 게임용 프레임 스트립/개별 파일 + 아틀라스로 변환.

사용:
  # 걷기 4프레임 → 균일 스트립 + 아틀라스
  python3 slice_sheet.py sheet.png --cols 4 --out walk.png --atlas walk.json --frame-size 128 --fps 8

  # 타워 레벨 시트 → 개별 파일 3개
  python3 slice_sheet.py sheet.png --cols 3 --split "tower_arrow_lv{i}.png" --frame-size 128

  # 멀티 시퀀스 시트 (2행×4열: 0행=idle, 1행=attack) → 8프레임 스트립 + 시퀀스 아틀라스
  python3 slice_sheet.py sheet.png --cols 4 --rows 2 --out tower.png --atlas tower.json \
      --sequences "idle:0-3,attack:4-7" --frame-size 128 --fps 8
"""
import argparse, json, os, sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow 필요: pip3 install --user pillow")

MAGENTA_TOL = 40


def chroma_key(img):
    """불투명 마젠타 배경 제거 (엔진 크로마키와 동일 규칙)."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    if not all(abs(r - 255) < MAGENTA_TOL and g < MAGENTA_TOL and abs(b - 255) < MAGENTA_TOL and a > 200
               for r, g, b, a in corners):
        return img
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if abs(r - 255) < MAGENTA_TOL and g < MAGENTA_TOL and abs(b - 255) < MAGENTA_TOL:
                px[x, y] = (0, 0, 0, 0)
    return img


def alpha_bbox(img):
    bbox = img.getbbox()
    return bbox if bbox else (0, 0, img.width, img.height)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("sheet")
    p.add_argument("--cols", type=int, required=True)
    p.add_argument("--rows", type=int, default=1)
    p.add_argument("--out", help="균일 프레임 가로 스트립 출력 경로")
    p.add_argument("--split", help="개별 파일 패턴, {i}=1부터 (예: tower_lv{i}.png)")
    p.add_argument("--atlas", help="아틀라스 JSON 출력 경로")
    p.add_argument("--frame-size", type=int, default=128, help="정사각 프레임 한 변(px)")
    p.add_argument("--fps", type=int, default=8)
    p.add_argument("--pad", type=float, default=0.06, help="프레임 내 여백 비율")
    p.add_argument("--normalize", action="store_true",
                   help="프레임별 스케일을 개별 정규화(크기 편차 보정). 기본은 시트 전체 공통 스케일")
    p.add_argument("--sequences",
                   help='아틀라스 시퀀스 정의: "이름:시작-끝[,이름:시작-끝...]" (프레임 인덱스 0부터, '
                        '행 우선 순서). 예: "idle:0-3,attack:4-7". 미지정 시 전 프레임 walk')
    a = p.parse_args()
    if not a.out and not a.split:
        sys.exit("--out 또는 --split 중 하나는 필수")

    sheet = chroma_key(Image.open(a.sheet))
    cw, ch = sheet.width // a.cols, sheet.height // a.rows

    # 1) 균등 셀 분할 + 셀별 알파 바운딩박스
    cells = []
    for r in range(a.rows):
        for c in range(a.cols):
            cell = sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            bb = alpha_bbox(cell)
            cells.append((cell, bb))

    areas = [(bb[2] - bb[0]) * (bb[3] - bb[1]) for _, bb in cells]
    if max(areas) > 0 and min(areas) / max(areas) < 0.5:
        print(f"경고: 프레임 간 캐릭터 면적 편차 큼 (min/max={min(areas)/max(areas):.2f}) — 재생성 검토", file=sys.stderr)

    # 2) 공통 스케일 산정 (프레임 크기 안정성 위해 기본은 최대 바운딩박스 기준)
    fs = a.frame_size
    inner = int(fs * (1 - a.pad * 2))
    max_dim = max(max(bb[2] - bb[0], bb[3] - bb[1]) for _, bb in cells)

    frames = []
    for cell, bb in cells:
        crop = cell.crop(bb)
        dim = max(crop.width, crop.height) if a.normalize else max_dim
        scale = inner / dim if dim else 1
        nw, nh = max(1, round(crop.width * scale)), max(1, round(crop.height * scale))
        crop = crop.resize((nw, nh), Image.LANCZOS)
        frame = Image.new("RGBA", (fs, fs), (0, 0, 0, 0))
        # 수평 중앙, 수직은 바닥 정렬(발 위치 고정 — 걷기 애니메이션 떨림 방지)
        frame.paste(crop, ((fs - nw) // 2, fs - int(fs * a.pad) - nh), crop)
        frames.append(frame)

    # 3) 출력
    if a.split:
        for i, f in enumerate(frames, 1):
            path = a.split.format(i=i)
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            f.save(path)
            print(path)
    if a.out:
        strip = Image.new("RGBA", (fs * len(frames), fs), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            strip.paste(f, (i * fs, 0))
        os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
        strip.save(a.out)
        print(a.out)
    if a.atlas:
        if a.sequences:
            seqs = {}
            for part in a.sequences.split(","):
                name, _, rng = part.strip().partition(":")
                if not name or not rng:
                    sys.exit(f"--sequences 형식 오류: '{part}' (이름:시작-끝 필요)")
                s, _, e = rng.partition("-")
                lo, hi = int(s), int(e) if e else int(s)
                if not (0 <= lo <= hi < len(frames)):
                    sys.exit(f"--sequences 범위 초과: '{part}' (프레임 0~{len(frames)-1})")
                seqs[name] = list(range(lo, hi + 1))
        else:
            seqs = {"walk": list(range(len(frames)))}
        atlas = {"frameW": fs, "frameH": fs, "frames": len(frames), "fps": a.fps,
                 "sequences": seqs}
        os.makedirs(os.path.dirname(a.atlas) or ".", exist_ok=True)
        with open(a.atlas, "w") as fp:
            json.dump(atlas, fp, indent=2)
        print(a.atlas)


if __name__ == "__main__":
    main()
