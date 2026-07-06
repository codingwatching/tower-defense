# 에셋 리포트 — 크리스탈 가드 (Crystal Guard)

- 작성: asset-artist / 2026-07-03
- 입력: `assets/manifest.js` (18키), `_workspace/02_architect_architecture.md` §5, `_workspace/01_director_gdd.md` §3·4·5
- 생성 도구: codex-cli 0.142.3 (`codex exec` image_generation, ChatGPT OAuth) — `td-asset-pipeline` 스킬 절차 준수
- 배치: 18장 / 4배치(5+5+5+3, 배치당 병렬 5) / 총 1056초 / 실패 0
- 후처리: `sips -Z` 규격화 (유닛 128px, 투사체 64px, 맵 256px)

## 스타일 공통 프리픽스 (전 에셋 동일 적용)

```
2D game sprite for a top-down tower defense game, clean vibrant cartoon style,
bold outlines, single object centered, isolated on a fully transparent background,
no text, no watermark, no drop shadow outside the object
```

- 오브젝트 16종: 위 프리픽스 + 하이앵글 3/4 뷰 통일
- 타일 2종(`tile_grass`, `tile_path`)만 예외: 심리스 타일러블 꽉 찬 텍스처(알파 없음 — 의도됨)

## 전 키 결과표 (매니페스트 18키 = 표 18행)

| 키 | 파일 | 규격 | 알파 | 상태 | 비고 |
|---|---|---|---|---|---|
| tower_arrow | assets/images/towers/tower_arrow.png | 128×128 | O | 성공 (1회) | 나무 망루 + 석궁, 청색 깃발 포인트 |
| tower_cannon | assets/images/towers/tower_cannon.png | 128×128 | O | 성공 (1회) | 석재 원형 포탑 + 청동 대포 |
| tower_frost | assets/images/towers/tower_frost.png | 128×128 | O | 성공 (1회) | 얼음 수정 첨탑 + 냉기 소용돌이 |
| tower_arcane | assets/images/towers/tower_arcane.png | 128×128 | O | 성공 (1회) | 어두운 첨탑 + 부유 자수정, 룬 발광 |
| enemy_goblin | assets/images/enemies/enemy_goblin.png | 128×128 | O | 성공 (1회) | 녹색 고블린 + 단검, 달리는 자세 |
| enemy_orc | assets/images/enemies/enemy_orc.png | 128×128 | O | 성공 (1회) | 회록색 오크 + 도끼 + 어깨 갑주 |
| enemy_steel_brute | assets/images/enemies/enemy_steel_brute.png | 128×128 | O | 성공 (1회) | 전신 판금 + 투구 틈 붉은 눈 |
| enemy_wasp_runner | assets/images/enemies/enemy_wasp_runner.png | 128×128 | O | 성공 (1회) | 노랑-검정 줄무늬 사족 질주 실루엣 |
| enemy_stone_golem | assets/images/enemies/enemy_stone_golem.png | 128×128 | O | 성공 (1회) | 보스 — 이끼 바위 + 용암 균열 발광 |
| proj_arrow | assets/images/projectiles/proj_arrow.png | 64×64 | O | 성공 (1회) + 정사각 패딩 | 우향(0°) 기준 — 엔진 회전 전제. QA D11-1 반영 (64×32 → 투명 패딩 64×64) |
| proj_cannonball | assets/images/projectiles/proj_cannonball.png | 64×64 | O | 성공 (1회) | 검은 포탄 + 하이라이트. 어두운 배경에선 대비 낮을 수 있음 — 20px 드로우에서 식별엔 문제 없음 |
| proj_frost_orb | assets/images/projectiles/proj_frost_orb.png | 64×64 | O | 성공 (1회) | 설화 문양 냉기 구슬 |
| proj_arcane_bolt | assets/images/projectiles/proj_arcane_bolt.png | 64×64 | O | 성공 (1회) + 정사각 패딩 | 우향(0°) 기준, 자주색 에너지 트레일. QA D11-1 반영 (64×35 → 투명 패딩 64×64) |
| tile_grass | assets/images/map/tile_grass.png | 256×256 | X (의도) | 성공 (1회) | 심리스 잔디 텍스처, 꽉 찬 프레임 |
| tile_path | assets/images/map/tile_path.png | 256×256 | X (의도) | 성공 (1회) | 심리스 흙길 텍스처, 꽉 찬 프레임 |
| deco_rock | assets/images/map/deco_rock.png | 256×256 | O | 성공 (1회) | 이끼 낀 바위 무더기 |
| goal_crystal | assets/images/map/goal_crystal.png | 256×256 | O | 성공 (1회) | 하늘색 발광 수정 클러스터 + 금장 |
| entrance_cave | assets/images/map/entrance_cave.png | 256×256 | O | 성공 (1회) | 동굴 입구, 뿔 장식 아치 |

- **성공 18 / 재생성 0 / 크로마키 의존 0 / 플레이스홀더 유지 0**

## 검수 내역

1. `file`: 18장 전부 유효 PNG (오브젝트 RGBA, 타일 RGB) — 0바이트/손상 없음
2. `sips -g hasAlpha`: 오브젝트 16장 알파 O, 타일 2장 알파 X(의도된 꽉 찬 텍스처)
3. 육안 전수: 스타일 일관성·시점 통일·객체 잘림·텍스트/워터마크 — 전 장 합격, 재생성 0회
4. 규격 후 총 용량 약 610KB

## 참고 사항

- proj_arrow·proj_arcane_bolt는 우향(→) 기준으로 생성 — 진행 방향 회전은 엔진 관례(0 rad = 우향)와 일치.
- 생성 원본(1254px급)과 codex 로그는 세션 스크래치패드에만 존재 — 저장소에는 규격화본 18장만 반입.

## 증분 내역

| 회차 | 일시 | 내용 |
|---|---|---|
| 1 | 2026-07-03 | QA 리포트 회차 11 P3(D11-1) 반영 — proj_arrow(64×32)·proj_arcane_bolt(64×35)를 중앙 정렬 투명 패딩으로 64×64 정사각화 (Pillow). 정사각(20×20/24×24) 드로우 시 세로 늘어짐 해소. 원화 재생성 없음, 코드 무변경. |
| 2 | 2026-07-06 | v2 신규 28키 반입 (아래 v2 섹션) — 매니페스트 18→42키 대응 완료. |

---

# v2 증분 (2026-07-06) — 계약 v2.0 §5 42키 대응

- 입력: `assets/manifest.js` (42키), 계약 §5.1~5.4·§10, GDD §12.2~12.3
- 파이프라인: `td-asset-pipeline` v2 — 레퍼런스 시트 생성(codex exec image_generation, 병렬 ≤5) → `slice_sheet.py` 슬라이싱 → 아틀라스 JSON
- 스타일: v1 공통 프리픽스 유지(밝은 카툰·굵은 외곽선·하이앵글 3/4 뷰) — v1 에셋과 동일 팔레트·비례

## 시트 → 슬라이싱 산출 (신규 22키 + 아틀라스 5)

**타워 레벨 시트 4장 (1×3, 같은 타워의 3단계 진화) → `--split` 128px 개별 12키**

| 키 (lv1~3) | 원본 시트 (assets/reference/) | 상태 | 비고 |
|---|---|---|---|
| tower_arrow_lv1~3 | tower_arrow_sheet.png | 성공 (1회) | 목재 망루 증축: 단일 석궁 → 이중 석궁 → 쌍 발리스타+문장 방패. 실루엣 동일 |
| tower_cannon_lv1~3 | tower_cannon_sheet.png | 성공 (1회) | 석재 포탑: Lv3 포신·기단 화염 문양 (§12.1 burning_ground 암시) |
| tower_frost_lv1~3 | tower_frost_sheet.png | 성공 (1회) | 수정 첨탑: Lv3 첨탑 상부 발광 파동 링 (frost_nova 암시) |
| tower_arcane_lv1~3 | tower_arcane_sheet.png | 성공 (1회) | 자주 첨탑: Lv3 부유 수정 3기 (overcharge 암시) |

**적 걷기 시트 5장 (1×4 걷기 사이클) → 스트립 512×128 + 아틀라스 JSON 쌍 (frameW/H 128, frames 4, fps 8, walk [0,1,2,3])**

| 키 | 산출 (assets/images/enemies/) | 상태 | 비고 |
|---|---|---|---|
| enemy_goblin_walk | enemy_goblin_walk.png + .json | 성공 (1회) | 4프레임 캐릭터 동일·포즈 진행 확인 |
| enemy_orc_walk | enemy_orc_walk.png + .json | 성공 (1회) | 동일 |
| enemy_steel_brute_walk | enemy_steel_brute_walk.png + .json | 성공 (1회) | 중갑 스톰프 사이클 |
| enemy_wasp_runner_walk | enemy_wasp_runner_walk.png + .json | 성공 (1회) | 슬라이서 면적 편차 경고(min/max 0.48)는 사족 보행의 다리 뻗음 포즈 차이로 판정 — 크기 널뛰기 아님, 육안 합격 |
| enemy_stone_golem_walk | enemy_stone_golem_walk.png + .json | 성공 (1회) | 보스 — 이끼·용암 균열 v1 유지 |

## 단일 생성 (신규 11키)

| 키 | 규격 | 상태 | 비고 |
|---|---|---|---|
| tile_grass_clover | 256×256 불투명 | 성공 — 합성 | 투명 클로버 액센트(accent_clover.png)를 v1 tile_grass 위에 합성 — 팔레트 일치·심리스 보장 |
| tile_grass_flower | 256×256 불투명 | 성공 — 합성 | 동일 방식 (accent_flower.png) |
| tile_path_h / _v | 256×256 불투명 | 성공 (기반입 검수 통과) | 흙길 직선 — v1 잔디·흙길 팔레트 일치 |
| tile_path_ne / _nw / _se / _sw | 256×256 불투명 | 성공 (기반입 검수 통과) | 코너 개구 방향 = 키 명명 규약(열린 두 변)과 일치 확인 |
| deco_bush | 256×256 투명 | 성공 (1회) | 낮은 초록 덤불 |
| deco_flowers | 256×256 투명 | **성공 (재생성 1회)** | 1차본에 회색·검정 꽃 혼입(팔레트 위반) → 분홍·노랑·흰색 한정으로 재생성 |
| deco_crystal_shard | 256×256 투명 | 성공 (1회) | 하늘색 파편 수정 — goal_crystal 톤 일치 |

## 검수 내역 (v2)

1. 시트 9장 육안 전수: 셀 수(3/4) 정확·캐릭터 동일성·잘림 없음 — 전 장 합격
2. 알파 채널 전수: 시트·장식 전부 투명 배경 정상, 크로마키 폴백 의존 0
3. 슬라이스 후 프레임별 육안: 타워 12장(컨택트 시트)·걷기 스트립 5장 — 잘림·크기 널뛰기 없음
4. 아틀라스 5쌍: 스트립 크기 = frameW×frames 정합, §10 형식 준수 — 기계 검증 통과
5. 매니페스트 42키 전수 파일 대조: 누락 0 / 0바이트 0

## 참고 사항 (v2)

- **성공 28키 / 재생성 1 (deco_flowers) / 플레이스홀더 유지 0**
- 레퍼런스 원본 12파일 `assets/reference/` 보존 (시트 9 + 잔디 액센트 2 + deco_flowers 재생성 원본 1) — 런타임 미사용·매니페스트 미등재 (AC-30)
- v1 타워 단일 4키 파일(tower_arrow.png 등)은 매니페스트에서 폐지됐으나 디스크 보존 — 삭제 판단은 Phase 3 이후 (팀 지침)
- 걷기 시트는 정면 3/4 뷰 기준 — 방향 표현은 계약 §10대로 엔진 회전 소관
