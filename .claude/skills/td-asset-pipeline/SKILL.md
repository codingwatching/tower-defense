---
name: td-asset-pipeline
description: "codex-cli(codex exec)의 image_generation 툴로 타워 디펜스 게임 에셋을 생성하는 파이프라인 v3 — 3D 렌더 룩(pre-rendered 3D) 고퀄리티 스타일, 다각도·애니메이션 레퍼런스 시트, 멀티 시퀀스 시트(idle/attack 2행), 프레임 슬라이싱, 스프라이트 아틀라스, 타워 레벨별 외형, 지형 타일 패밀리 확장까지. 게임 에셋 생성, 3D 고퀄리티 변환, 스프라이트 시트, 애니메이션 프레임(아이들/공격/걷기), 타일·지형 에셋 추가, 이미지 재생성, 에셋 퀄리티 향상, codex 이미지 관련 요청 시 반드시 사용. 오디오는 범위 아님(Web Audio 합성)."
---

# TD Asset Pipeline v3 — 3D 렌더 룩 + 멀티 시퀀스 시트

핵심 원리 두 가지:
1. **한 캐릭터의 모든 각도·프레임을 한 장의 시트로 생성한다.** 이미지 모델은 호출마다 캐릭터가 달라지지만, 한 이미지 안에서는 일관성이 보장된다. 시트 생성 후 균등 셀로 슬라이싱해 아틀라스를 만든다.
2. **v3 스타일은 "pre-rendered 3D 룩"이다.** 실제 3D 파이프라인 없이도, 3D 렌더처럼 보이는 스프라이트(입체 셰이딩·부드러운 조명·재질감)를 생성해 2D 캔버스에서 3D 퀄리티를 낸다 — 클래식 TD(워크래프트/스타 시대 프리렌더 스프라이트)와 같은 접근.

## 0. 사전 점검 (배치 시작 전 1회)

```bash
codex --version && codex login status          # 미로그인 시 즉시 중단·보고
python3 -c "import PIL" 2>/dev/null || pip3 install --user pillow   # 슬라이싱 의존성
```

**Blender MCP 경로 (선택):** `mcp__blender__get_scene_info`가 성공하면 실제 3D 경로(모델 생성→턴테이블/프레임 렌더)도 쓸 수 있다. 실패(미기동)하면 시도를 반복하지 말고 codex 경로로 진행한다 — codex 3D 룩이 기본이자 검증된 경로다.

## 1. v3 스타일 프리픽스 (전 에셋 공통)

```
high-quality pre-rendered 3D game asset for a top-down tower defense game,
stylized 3D render look, soft studio lighting from the upper-left, subtle ambient
occlusion and gentle rim light, painterly PBR materials, rich color depth,
isolated on a fully transparent background, no text, no watermark
```

- **조명 방향(upper-left)은 전 시트에 고정한다.** 시트마다 그림자 방향이 다르면 한 화면에서 어색함이 바로 드러난다.
- **스타일 전환은 전량 재생성이다.** v2 카툰 에셋과 v3 3D 룩을 섞지 않는다 — 매니페스트의 모든 이미지 키를 같은 라운드에서 같은 프리픽스로 재생성한다. 한 장만 화풍이 다르면 게임 전체가 싸구려로 보인다.
- 밝기·채도 위계: 타일(배경) < 장식 < 유닛·타워 < 투사체·이펙트. 배경이 튀면 유닛이 안 보인다.

## 2. 에셋 스펙 표 작성

생성 전 매니페스트 키 전체를 표로 확정한다: `키 | 시트 구성(행×열) | 셀 내용 | 시퀀스 | 최종 규격`. 즉흥 생성 금지 — 시트 구성이 곧 슬라이싱 파라미터다.

| 카테고리 | 시트 구성 | 시퀀스 | 비고 |
|---|---|---|---|
| 타워 (레벨별 1시트) | 2행 × 4열 | 0행 `idle` 4프레임, 1행 `attack` 4프레임 | idle=대기 중 미세 동작(수정 회전·깃발 펄럭임·에너지 맥동), attack=장전→발사 섬광→반동→복귀 |
| 적 걷기 | 1행 × 4열 | `walk` 4프레임 | 탑다운 3/4 고정, 프레임당 256px 셀 |
| 보스 | 2행 × 4열 | 0행 `walk`, 1행 `special`(포효 등) | 선택 |
| 장식 애니메이션 | 1행 × 4열 | `idle` (수정 반짝임, 나뭇잎 흔들림) | 핵심 장식 2~3종만 — 전부 애니메이션화하면 화면이 소란하다 |
| 지형 타일 | 단일 | — | §7 타일 패밀리 참조, 개별 생성 |
| 투사체/UI | 단일 | — | v1 방식 유지 |
| 적 다각도 레퍼런스 | 1행 × 3열 | — | 게임 적용은 선택, 문서·QA 기준 |

- 프레임 수는 행당 4를 기본으로 한다 — 이미지 모델이 안정적으로 지키는 상한이고, 사이클에 충분하다.
- 2행 시트는 1행 시트보다 실패율이 높다 — 행별 내용 차이를 프롬프트에서 명시적으로 대비시킨다(아래 §3). **1행×8열(idle 4 + attack 4 연속) 변형도 허용된다** — 슬라이싱은 행 우선 인덱스라 `--sequences "idle:0-3,attack:4-7"` 결과가 동일하다. 모델이 2행 그리드를 안 지키면 1행×8열로 전환하는 게 재생성 반복보다 싸다 (v4 실증: 1행×8열이 더 안정적).

## 3. 시트 프롬프트 규칙

시트 지시는 **셀 구조를 명시적으로**:

```
..., a sprite sheet of exactly 8 frames in a 2x4 grid (2 rows, 4 columns),
each frame in an equal square cell, the same crystal watchtower in every frame,
identical size and camera angle across frames, centered in each cell,
seen from a high three-quarter top-down angle.
Top row: subtle idle animation (the crystal slowly rotating and pulsing with inner light).
Bottom row: attack animation (energy charging, bright muzzle flash, recoil, settle).
```

- 적 걷기: `a single horizontal row of exactly 4 frames, the same goblin in a walking
  animation cycle (contact, down, passing, up poses)`
- 타워 레벨: 레벨마다 **별도 시트**로 생성한다(같은 타워의 lv1/lv2/lv3). 레벨 간 일관성은
  프롬프트 서술 재사용 + 검수로 확보: `level 2 of the same crystal watchtower, taller and
  more ornate than level 1, same base footprint, same color scheme` — 직전 레벨 시트의
  특징(색·재질·실루엣)을 프롬프트에 명시적으로 적는다.
- 결과 셀 경계가 어긋나는 것은 정상이다 — 슬라이싱 단계에서 보정한다. 행/열 수가 다르게 나오거나 캐릭터가 겹치면 그 시트만 재생성(최대 2회).

## 4. 병렬 배치 생성

v1과 동일: 5장 단위 배치, 파일명 전부 상이, Bash `run_in_background: true`, `sleep` 폴링 금지, `--ask-for-approval` 금지.

**생성과 후처리는 단일 백그라운드 잡으로 묶는다** — "생성 배치 완료 통지를 기다렸다가 슬라이싱"으로 나누면 통지 지연 시 파이프라인이 유휴로 멈춘다(v4 실증: 53분 스톨). 한 스크립트 안에서 `생성 5병렬 → wait → 즉시 슬라이싱·파이널라이즈 → 다음 배치` 루프를 돌리면 통지와 무관하게 최종 파일이 배치마다 착륙한다.

```bash
codex exec --sandbox workspace-write --skip-git-repo-check \
  --cd <스테이징 디렉토리> -o /tmp/codex-sheet-<key>.md \
  "이미지 생성 도구로 '<시트 프롬프트>' 이미지를 생성하고 ./<key>_sheet.png 로 저장. 경로만 한 줄로 보고."
```

시트는 원본이 크므로(1254px+) 스테이징에서 작업 후 최종본만 assets/로 이관한다.

## 5. 슬라이싱 → 아틀라스

번들 스크립트 사용: `.claude/skills/td-asset-pipeline/scripts/slice_sheet.py`

```bash
# 타워 멀티 시퀀스 (2행×4열 → 8프레임 스트립 + idle/attack 아틀라스)
python3 .claude/skills/td-asset-pipeline/scripts/slice_sheet.py \
  <sheet.png> --cols 4 --rows 2 --out assets/images/towers/tower_arrow_lv1.png \
  --atlas assets/images/towers/tower_arrow_lv1.json \
  --sequences "idle:0-3,attack:4-7" --frame-size 128 --fps 8

# 적 걷기 (v2와 동일)
python3 .claude/skills/td-asset-pipeline/scripts/slice_sheet.py \
  <sheet.png> --cols 4 --out assets/images/enemies/goblin_walk.png \
  --atlas assets/images/enemies/goblin_walk.json --frame-size 128 --fps 8
```

동작: ①균등 분할 ②셀별 알파 바운딩박스로 캐릭터 중심 정렬(셀 경계 어긋남 보정) ③균일 프레임 스트립으로 재조립 ④아틀라스 JSON 생성. `--sequences`는 행 우선(row-major) 프레임 인덱스로 시퀀스를 정의한다.

**아틀라스 규약** (계약 문서와 1:1 — engine-dev의 로더가 이 형식을 파싱):

```json
{ "frameW": 128, "frameH": 128, "frames": 8, "fps": 8,
  "sequences": { "idle": [0,1,2,3], "attack": [4,5,6,7] } }
```

- 스트립 PNG와 아틀라스 JSON은 같은 basename을 쓴다.
- 시퀀스 이름은 계약이 확정한다 (기본: `idle`/`walk`/`attack`/`special`). 아틀라스에 없는 시퀀스는 로더가 첫 시퀀스로 강등하므로, 임의 이름을 만들지 말고 계약 명을 쓴다.
- 멀티 시퀀스로 승격되는 키(타워 등)는 매니페스트 값이 문자열→`{img, atlas}` 객체로 바뀐다 — **매니페스트·계약 개정은 system-architect 승인 후에만.**

## 6. 검수 (배치마다)

v2 검수(파일 유효성·알파·육안·스타일 일관·프레임 동일성)에 v3 항목 추가:

- **3D 룩 판정**: 평면 셀 셰이딩으로 나온 시트는 불합격 — 입체 셰이딩·AO·하이라이트가 보여야 한다. 프리픽스의 `pre-rendered 3D`, `ambient occlusion`을 강조해 재생성
- **조명 방향**: 그림자가 upper-left 조명과 모순되면 재생성
- **2행 시트 행 혼입**: idle 행에 발사 섬광이 섞이면 해당 시트 재생성 — 시퀀스가 오염된 채 슬라이싱하면 게임에서 대기 중 총구 화염이 번쩍인다
- 프레임 크기 편차가 심하면(바운딩박스 면적 차 30%+) 시트 재생성 — 프레임 정렬 보정으로는 못 살린다
- 투명 배경 실패 시 마젠타(#FF00FF) 배경으로 재생성 (엔진 크로마키 폴백)

## 7. 지형 타일 패밀리 (v3 고도화)

단일 grass+path 구성을 넘어 **패밀리 단위**로 생성한다. 모든 타일은 `seamless tileable` 명시, 톱뷰(직상단) 고정 — 유닛의 3/4 뷰와 달리 타일은 수직 뷰가 이어붙임에 안전하다.

| 패밀리 | 구성 | 비고 |
|---|---|---|
| 풀 | 기본 + 변형 2~3 (클로버·꽃·잔돌) | 변형 선택은 tilemap 결정적 해시 |
| 길 | 직선 2(h/v) + 코너 4(ne/nw/se/sw) + 범용 폴백 | v2 유지, 3D 룩 재생성 |
| 물 | 기본 + 물가 전이(grass→water edge) 4방향 | 반짝임은 fx 코드 오버레이가 담당 — 애니메이션 타일 시트는 seamless가 깨지기 쉬워 만들지 않는다 |
| 흙/모래 | 기본 + 전이(grass→dirt) | 맵 테마 변형용 |
| 절벽/바위 지대 | 건설 불가 표시가 시각적으로 명확한 융기 타일 | 게임플레이 정보(건설 불가)가 장식보다 우선 |
| 장식 | 바위·덤불·꽃·수정·나무 등 5종+ (일부는 §2 애니메이션 시트) | 배치 밀도는 map-designer 소유 |

- 전이(edge) 타일은 인접 패밀리 경계에 쓰인다 — 경계가 칼로 자른 듯하면 지형이 스티커처럼 보인다.
- 타일 신규 패밀리·키 추가는 매니페스트 개정 사항 — system-architect 승인 후 생성한다.

## 7.5 타일 팔레트 락 (v5 — 색상 일관성)

이미지 모델은 호출마다 색온도·채도가 조금씩 다르게 나온다. 유닛은 한 장씩 보여서 티가 안 나지만, **타일은 수십 장이 이어붙어 미세한 색 편차도 패치워크처럼 드러난다.** 세 겹으로 잠근다:

1. **프롬프트 팔레트 명시** — 패밀리별 앵커 hex를 프롬프트에 직접 적는다: `dominant grass green exactly #4C8C3A with shadow tone #35682B` 식으로. 전이(edge) 타일은 양쪽 패밀리의 앵커 hex를 모두 명시한다.
2. **앵커 기준 후처리 보정(생성 후 필수)** — 번들 스크립트로 같은 패밀리 앵커 타일에 채널 히스토그램 매칭:
   ```bash
   python3 .claude/skills/td-asset-pipeline/scripts/harmonize_palette.py \
     --anchor assets/images/map/tile_grass.png --strength 0.85 \
     assets/images/map/tile_grass_clover.png assets/images/map/tile_grass_flower.png
   ```
   신규 생성뿐 아니라 **기존 타일의 일괄 재보정에도 같은 명령을 쓴다.** 원본은 `--backup-dir`(기본 `assets/reference/pre_harmonize/`)에 보존된다.
3. **검수 계측(육안 전에 수치부터)** — `--check` 모드가 패밀리 내 평균색 거리(불투명 픽셀 RGB 평균의 유클리드 거리)를 표로 출력한다. 임계(기본 18) 초과는 불합격 → 보정 또는 재생성:
   ```bash
   python3 .claude/skills/td-asset-pipeline/scripts/harmonize_palette.py \
     --check --anchor assets/images/map/tile_grass.png assets/images/map/tile_grass_*.png
   ```

- **앵커 = 패밀리 기본 타일** (`tile_grass.png`, `tile_path.png`, `tile_water.png`, `tile_dirt.png`). 앵커 자체를 교체하면 그 패밀리 전체를 재보정한다.
- **2재질 타일(길 방향타일·전이 edge)은 whole-tile 보정·`--check` 판정 금지 — 세그먼트 도구를 쓴다** (v5 실증). 잔디+도로가 한 셀에 공존하는 타일을 단일 앵커에 whole-tile 매칭하면 잔디 여백이 앵커 색으로 오염되는데, `--check` 수치는 오히려 PASS로 좋아진다(지표만 맞고 목적 훼손). 반대로 올바르게 보정할수록 whole-tile 거리는 커진다 — 2재질 평균색은 단일 앵커와 원리상 불일치. 따라서:
  - 보정: `scripts/harmonize_segmented.py --grass-anchor tile_grass.png --other-anchor tile_path.png --mode warm <타일들>` — 픽셀을 재질별 소프트 멤버십(warm=g−r, water=g−b)으로 나눠 각자 앵커에 매칭 후 가중 블렌드(프린징 방지). 물가는 `--mode water --other-anchor tile_water.png`.
  - 판정: `scripts/tile_seam_check.py` — 재질별 세그먼트 거리 전 항목 ≤18이 합격 기준. whole-tile `--check`는 단일 재질 패밀리(잔디 변형 등)에만 쓴다.
- **큰 균일 필드로 깔리는 타일(잔디 변형 등)은 평균색 임계만으로 부족하다** (v5 실증). 평균색 ΔE 2.5짜리 변형 타일도 밝은 잔디날·반점의 밝기·채도 **분포**가 다르면 필드에서 밝은 블록으로 튄다 — 평균 지표는 원리상 이걸 못 잡는다. 판정은 `scripts/grass_lab.py`(Lab ΔE + 실제 해시배치 필드 몽타주 + 스테이지 tint 시뮬)로, 목표는 perceptual ΔE JND(~2.3) 미만. 보정은 whole-tile 분포 매칭(단일재질이므로 `harmonize_palette.py`가 정확한 도구 — 평균이 아닌 채널 분포 전체를 앵커에 정렬한다). 참고: 스테이지 tint(multiply)는 채널 상수배라 편차를 오히려 축소한다 — 패치워크 원인 후보에서 후순위.
- `--strength` 기본 0.85 — 1.0은 텍스처 명암 디테일까지 뭉갤 수 있다. 보정 후 반드시 육안 확인.
- 장식(deco_*)은 타일 위에 얹히는 개체라 히스토그램 보정 대상이 아니다 — 프롬프트 팔레트 명시만 적용.
- 보정 후에는 배경 캐시가 새 파일을 읽도록 브라우저 강력 새로고침으로 확인한다(코드 변경은 불필요 — 경로·키 불변).

## 8. 산출물 리포트

`_workspace/03_artist_asset-report.md` 갱신: `키 | 유형(단일/시트→프레임 N) | 시퀀스 | 상태 | 아틀라스 | 비고`. 매니페스트 전 키 + 아틀라스 전 파일이 표에 있어야 완료. 레퍼런스 시트 원본은 `assets/reference/`에 보존 (재생성·QA 기준).

## 알려진 함정 (v1~v3 누적)

| 증상 | 조치 |
|---|---|
| 파일이 스테이징에 없고 `~/.codex/generated_images/`에만 있음 | "./<파일> 로 저장" 문구 강화 후 재실행 |
| 시트 프레임 수 불일치(3개/5개, 행 누락) | 해당 시트만 재생성, "exactly N frames", "2 rows, 4 columns", "equal square cells" 강조 |
| 2행 시트에서 행 간 내용 혼입 | Top row/Bottom row 서술을 문장으로 분리해 대비 강조 후 재생성 |
| 3D 룩이 아니라 평면 카툰으로 나옴 | `pre-rendered 3D render look, ambient occlusion, soft shadows` 강조, `flat, cel-shaded` 네거티브 서술 추가 |
| 프레임 간 캐릭터 크기 널뛰기 | 슬라이서의 `--normalize` 사용, 심하면 재생성 |
| 배치 전체 비정상 지연(300초+/장) | 배치를 3장으로 축소, 오케스트레이터 보고 |
| Pillow 미설치 | `pip3 install --user pillow` 후 재시도 |
