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

---

# v4 증분 (2026-07-19) — 계약 v4.0 §16 51키 3D 렌더 룩 전량 재생성

- 입력: `assets/manifest.js` (51키), 계약 §16.1(매니페스트)·§16.7(재생성 키 전량), GDD §14.2~14.4(모션·3D 컨셉·지형 매핑)
- 생성 도구: codex-cli 0.144.3 (`codex exec` image_generation, ChatGPT OAuth) — `td-asset-pipeline` **v3** 절차(3D 룩 프리픽스·멀티 시퀀스 시트·`--sequences` 슬라이싱·타일 패밀리) 준수
- 배치: 51키 / 11배치(b1~b11, 배치당 병렬 ≤5) / 실패 0 / **재생성 0 / 크로마키 폴백 의존 0 / 플레이스홀더 유지 0**
- 후처리: 시트 20장 `slice_sheet.py`(균일 프레임 스트립 + 아틀라스), 단일 31장 `finalize_single.py`(크로마키·알파 크롭·규격화)
- **스타일 전환 = 전량 재생성**(AC-58 — v2 카툰과 3D 룩 혼재 0). 시트 원본은 `assets/reference/`에 today(07-19) 재생성분으로 보존.

## v4 스타일 프리픽스 (2종, 조명 upper-left 전 에셋 고정)

**스프라이트(투명 배경) — 타워·적·투사체·장식·오브젝트:**
```
high-quality pre-rendered 3D game asset for a top-down tower defense game, stylized 3D render look,
soft studio lighting from the upper-left, subtle ambient occlusion and gentle rim light,
painterly PBR materials, rich color depth, isolated on a fully transparent background,
no text, no watermark, not flat, not cel-shaded
```
**타일(불투명 seamless) — 잔디·길·타일 패밀리:**
```
high-quality pre-rendered 3D terrain tile ... seamless tileable texture filling the entire square
frame edge to edge, straight top-down orthographic view, ..., not flat, not cel-shaded
```

## 전 키 결과표 (매니페스트 51키 = 표 51행)

### 타워 12키 — 멀티 시퀀스 시트(소스 2행×4열 → 산출 1×8 스트립 1024×128) + 아틀라스

| 키 | 유형 | 시퀀스 | 상태 | 아틀라스 | 비고 |
|---|---|---|---|---|---|
| tower_arrow_lv1 | 시트→8f | idle[0-3]/attack[4-7] | 성공(1회) | O | 목재 망루+석궁, 청색 깃발. idle=조준 스윙, attack=장전→섬광→반동 |
| tower_arrow_lv2 | 시트→8f | idle/attack | 성공(1회) | O | 금속 보강+쌍석궁, 적색 깃발 |
| tower_arrow_lv3 | 시트→8f | idle/attack | 성공(1회) | O | 연발 다연장+예비 화살통, idle에 속도 잔상(rapid_volley 암시) |
| tower_cannon_lv1 | 시트→8f | idle/attack | 성공(1회) | O | 청동 대포+석재 기단. attack=포구 대폭발 |
| tower_cannon_lv2 | 시트→8f | idle/attack | 성공(1회) | O | 확장 포신+금장 기단 |
| tower_cannon_lv3 | 시트→8f | idle/attack | 성공(1회) | O | 잔불·화염 문양+발광(burning_ground 암시) |
| tower_frost_lv1 | 시트→8f | idle/attack | 성공(1회) | O | 청색 얼음 첨탑. attack=냉기 구슬 방출 |
| tower_frost_lv2 | 시트→8f | idle/attack | 성공(1회) | O | 다면 확장+서리 입자 |
| tower_frost_lv3 | 시트→8f | idle/attack | 성공(1회) | O | 동심 파동 링 문양(frost_nova 암시) |
| tower_arcane_lv1 | 시트→8f | idle/attack | 성공(1회) | O | 부유 자수정+룬 기둥. attack=아케인 볼트 |
| tower_arcane_lv2 | 시트→8f | idle/attack | 성공(1회) | O | 궤도 룬 파편 추가 |
| tower_arcane_lv3 | 시트→8f | idle/attack | 성공(1회) | O | 응축 에너지 코어+오버로드 글로우(overcharge 암시) |

- 소스 시트=2×4(0행 idle/1행 attack), slice_sheet.py가 8프레임 균일 가로 스트립으로 재조립 → 산출 PNG는 1×8. 아틀라스 `{frameW:128,frameH:128,frames:8,fps:8,sequences:{idle:[0,1,2,3],attack:[4,5,6,7]}}`. QA D42-1(문서 표기 명확화, 결함 아님) 종결.
- idle 행에 발사 섬광 혼입 0(파이프라인 §6 검수) — 발사 섬광·폭발은 attack 행에만 확인.

### 적 정적 5키 — 단일 128×128 RGBA (walk 강등 폴백 겸 정지 표시)

| 키 | 유형 | 시퀀스 | 상태 | 아틀라스 | 비고 |
|---|---|---|---|---|---|
| enemy_goblin | 단일 | — | 성공(1회) | — | 녹색 피부 근육 볼륨+단검 금속 하이라이트 |
| enemy_orc | 단일 | — | 성공(1회) | — | 회록색 근육+어깨 갑주 반사+도끼 PBR |
| enemy_steel_brute | 단일 | — | 성공(1회) | — | 강철 판금 PBR+투구 틈 붉은 눈 발광 |
| enemy_wasp_runner | 단일 | — | 성공(1회) | — | 곤충 외골격 광택+노랑검정 줄무늬+반투명 날개 |
| enemy_stone_golem | 단일 | — | 성공(1회) | — | 보스 — 바위+이끼 AO+용암 균열 발광 |

### 적 걷기 5키 — 시트(1행×4열) → 스트립 512×128 + 아틀라스(walk[0-3])

| 키 | 유형 | 시퀀스 | 상태 | 아틀라스 | 비고 |
|---|---|---|---|---|---|
| enemy_goblin_walk | 시트→4f | walk[0-3] | 성공(1회) | O | 걷기 사이클(contact/down/passing/up) |
| enemy_orc_walk | 시트→4f | walk | 성공(1회) | O | 동일 |
| enemy_steel_brute_walk | 시트→4f | walk | 성공(1회) | O | 중갑 걷기 |
| enemy_wasp_runner_walk | 시트→4f | walk | 성공(1회) | O | 빠른 스커틀 |
| enemy_stone_golem_walk | 시트→4f | walk | 성공(1회) | O | 보스 육중 걷기 |

### 투사체 4키 — 단일 64×64 RGBA

| 키 | 유형 | 시퀀스 | 상태 | 아틀라스 | 비고 |
|---|---|---|---|---|---|
| proj_arrow | 단일 | — | 성공(1회) | — | 우향 화살(엔진 회전 전제) |
| proj_cannonball | 단일 | — | 성공(1회) | — | 철제 포탄 |
| proj_frost_orb | 단일 | — | 성공(1회) | — | 청색 냉기 구슬 |
| proj_arcane_bolt | 단일 | — | 성공(1회) | — | 자주색 마력 볼트 |

### 맵 타일 16키 — 단일 256×256 RGB (불투명 seamless, 톱뷰)

| 키 | 유형 | 시퀀스 | 상태 | 아틀라스 | 비고 |
|---|---|---|---|---|---|
| tile_grass / _clover / _flower | 단일 타일 | — | 성공(1회) | — | 3D 룩 잔디 + 변형(클로버/꽃) |
| tile_path / _h / _v | 단일 타일 | — | 성공(1회) | — | 흙길 범용/직선 h·v |
| tile_path_ne / _nw / _se / _sw | 단일 타일 | — | 성공(1회) | — | 코너: 열린 두 변 = 키 명명(ne=상+우 등) 정합 |
| tile_water | 단일 타일 | — | 성공(1회) | — | (신규) 깊이감 청록 물 = 건설 불가 시각 |
| tile_water_edge | 단일 타일 | — | 성공(1회) | — | (신규) grass(상)→water(하) 방향성 그라디언트 — tilemap 회전 4방 |
| tile_dirt | 단일 타일 | — | 성공(1회) | — | (신규) 흙/모래 코스메틱 지면 |
| tile_dirt_edge | 단일 타일 | — | 성공(1회) | — | (신규) grass(상)→dirt(하) 방향성 그라디언트 |
| tile_cliff | 단일 타일 | — | 성공(1회) | — | (신규, v4.0-a) 비방향성 암석 능선 — DECO 융기 겸 PATH 능선/도로 스킨 이중 용도 |
| tile_lava | 단일 타일 | — | 성공(1회) | — | (신규, v4.0-a) 균열 고른 분산 emissive 발광 — DECO 겸 PATH 스킨 이중 용도 |

### 맵 정적 장식 4 + 오브젝트 2 — 단일 256×256 RGBA

| 키 | 유형 | 시퀀스 | 상태 | 아틀라스 | 비고 |
|---|---|---|---|---|---|
| deco_rock | 단일 | — | 성공(1회) | — | 이끼 바위 무더기 |
| deco_bush | 단일 | — | 성공(1회) | — | 초록 덤불 — deco_bush_anim과 시각 일치(강등 폴백) |
| deco_flowers | 단일 | — | 성공(1회) | — | 색색 야생화 |
| deco_crystal_shard | 단일 | — | 성공(1회) | — | 자수정 파편 — deco_crystal_shard_anim과 일치 |
| goal_crystal | 단일 | — | 성공(1회) | — | 청록 목표 수정 — goal_crystal_anim과 일치(강등 폴백) |
| entrance_cave | 단일 | — | 성공(1회) | — | 암벽 동굴 입구 |

### terrain-anim 애니 장식 3키 — 시트(1행×4열) → 스트립 512×128 + 아틀라스(idle[0-3])

| 키 | 유형 | 시퀀스 | 상태 | 아틀라스 | 비고 |
|---|---|---|---|---|---|
| goal_crystal_anim | 시트→4f | idle[0-3] | 성공(1회) | O | 광채 맥동. 정적 폴백=goal_crystal(getAnim `_anim` 스트립) |
| deco_bush_anim | 시트→4f | idle | 성공(1회) | O | 잎 흔들림. 정적 폴백=deco_bush |
| deco_crystal_shard_anim | 시트→4f | idle | 성공(1회) | O | 표면 글린트. 정적 폴백=deco_crystal_shard |

## 검수 내역 (v4)

1. **기계 census**: 매니페스트 51키 전수 파일 대조 — 누락 0 / 0바이트 0 (단일 31 + 시트 스트립 20).
2. **아틀라스 검증**: 20 아틀라스 JSON 필수 필드(frameW·frameH·frames·fps·sequences) 전수 존재·비어있지 않음 — 문제 0. 타워 12×{idle[0-3],attack[4-7]}, walk 5×{walk[0-3]}, terrain-anim 3×{idle[0-3]}.
3. **규격·알파**: 유닛 128²·투사체 64²·타일 256²(RGB 불투명)·장식/오브젝트 256²(RGBA). 스프라이트 투명 비율 0.45~0.96(전부 투명 확보, 크로마키 폴백 의존 0). 타일 16장 전부 RGB 불투명.
4. **육안 전수(컨택트 시트)**: 3D 룩(입체 셰이딩·AO·하이라이트)·조명 upper-left·2행 시트 idle/attack 행 분리(발사 섬광 idle 미혼입)·프레임 동일성·타워 레벨별 외형 구분·edge 타일 방향 그라디언트·cliff/lava 비방향성(v4.0-a)·정적↔애니 시각 일치 — 전 장 합격, 재생성 0회.

## 참고 사항 (v4)

- **v1 잔존 오브펀 4파일 처리**: `assets/images/towers/tower_{arrow,cannon,frost,arcane}.png`(v1 assetKey, v2에서 폐지·매니페스트 미등재·src 미참조)를 v4 마감에서 **삭제**했다. 현 towers/ = lv1~3 12파일만 유지. (v2 리포트의 "Phase 3 이후 삭제 판단" 지침 종결.)
- 시트 원본 20장 `assets/reference/`에 today 재생성분 보존(런타임 미사용·매니페스트 미등재, AC-30 계승). 구 Jul-6 v2 시트는 동명 키가 덮어써짐(wasp/golem walk 포함 전부 3D 재생성 확인).
- 매니페스트 밖 키 생성 0(보스 special 등 비범위 준수). 신규 9키(terrain-anim 3 + 타일 패밀리 6)는 architect 개정 매니페스트와 1:1.

## 증분 내역 (추가)

| 회차 | 일시 | 내용 |
|---|---|---|
| 3 | 2026-07-19 | v4 51키 3D 렌더 룩 전량 재생성 (타워 12 멀티시퀀스 시트+아틀라스 / 적 정적5+걷기5 / 투사체4 / 타일 16(신규 패밀리 6 포함) / 정적장식4+오브젝트2 / terrain-anim 3 시트+아틀라스). tile_cliff/lava는 계약 v4.0-a 이중용도(비방향성 톱뷰) 반영. v1 오브펀 타워 단일 4파일 삭제. 재생성·플레이스홀더 유지 0. |
| 4 (v5) | 2026-07-19 | 타일 팔레트 색상 일관성 보정 — 전이(2재질) 타일 8종 세그먼트 하모나이즈. 키·경로·규격 불변, 코드 변경 0. 아래 "## v5 타일 팔레트 락" 참조. |

## v5 타일 팔레트 락 (색상 일관성 보정)

**요구:** "타일 에셋 색상이 조금씩 다르며 일관성이 떨어진다 — 보완." (SKILL §7.5)

**핵심 판단 — whole-tile 하모나이즈는 전이 타일에 부적합:** 길 방향타일(h/v/코너 4)·물가/흙가 전이 타일은 **grass + road/water/sand 2재질**이 한 셀에 공존한다(길 앵커 `tile_path.png`은 순수 흙 폴백 타일). 번들 `harmonize_palette.py`의 whole-tile 히스토그램 매칭을 이 타일에 걸면 grass 여백이 앵커(갈색)로 오염된다 — 실증: strength 0.85에서 잔디가 갈색으로 뭉개짐(scratch 검증). whole-tile `--check` 는 "PASS"(거리 39.7→5.6)로 나오지만 실제로는 더 나빠짐 = 지표만 맞추고 목적을 해치는 함정.

**채택 — 세그먼트(재질별) 하모나이즈:** 픽셀을 소프트 멤버십으로 grass/비-grass 분리 → grass 픽셀은 `tile_grass` 앵커, 비-grass 픽셀은 각 패밀리 앵커(`tile_path`/`tile_dirt`, 물은 원본 유지)로 각각 채널 히스토그램 매칭 후 멤버십 가중 블렌드(경계 프린징 방지). 매칭 수학은 번들 스크립트와 동일(단조 CDF LUT). 멤버십 분리축: 따뜻한 재질=`g−r`(황토 sand는 g≈r이라 `g−(r+b)/2`로는 grass와 겹침), 물=`g−b`. 스크립트: `_workspace/tools/harmonize_segmented.py`(재질별 하모나이저), `_workspace/tools/tile_seam_check.py`(재질별 계측+몽타주 생성). 원본 백업: `assets/reference/pre_harmonize/`(8파일).

**재질별 거리 보정 전→후 (동일 분류기, 임계 18):**

| 타일 | grass 여백 (vs tile_grass) | 재질 (vs 패밀리앵커) | 재질앵커 | strength |
|---|---|---|---|---|
| tile_path_h  | 29.1 → **9.5**  | 11.0 → **3.4**  | tile_path | 0.85 |
| tile_path_v  | 37.0 → **5.6**  | 21.1 → **3.5**  | tile_path | 0.85 |
| tile_path_ne | 22.5 → **3.8**  | 33.2 → **5.6**  | tile_path | 0.85 |
| tile_path_nw | 41.9 → **5.8**  | 19.1 → **3.9**  | tile_path | 0.85 |
| tile_path_se | 26.5 → **16.2** | 28.3 → **7.8**  | tile_path | 0.92 (ramp −8/4 재보정)¹ |
| tile_path_sw | 35.1 → **7.8**  | 14.1 → **5.5**  | tile_path | 0.85 |
| tile_water_edge | 23.9 → **7.2** | 12.7 → **11.8** | tile_water(물 부분 원본 유지) | 0.85 |
| tile_dirt_edge  | 24.5 → **8.4** | 26.8 → **4.7**  | tile_dirt  | 0.85 |

¹ tile_se 는 잔디가 가장 올리브(=`g−r` 낮음)라 기본 램프(−2/10)에서 grass 여백 22.9 잔존(loop 몽타주 상 top-left 타일이 육안으로 어두움). 백업 원본에서 램프 −8/4·strength 0.92로 재보정 → 16.2 PASS·육안 균질.

**잔디 패밀리(단일재질) — 보정 불필요(사전 PASS 유지):** whole-tile `--check` 그대로 인용 —
`tile_grass_clover 13.6 PASS / tile_grass_flower 7.0 PASS` (exit 0).

**완료 검수 (최종 저장 직후 재실행):**
- 세그먼트 재질별 `--check`(현재 저장 파일 기준): grass 여백 8종 전부 ≤16.2, 재질 8종 전부 ≤11.8 → **전 항목 PASS: True**.
- 참고 — 번들 whole-tile `--check` 는 전이(2재질) 타일에 대해 여전히 FAIL(예: path_ne 45.2)이며 이는 **구조적 한계**다(2재질 평균색은 단일재질 앵커와 원리상 불일치, grass를 올바르게 더 초록으로 만들수록 거리는 오히려 증가). 전이 타일의 유효 지표는 세그먼트 재질별 거리이며 위에서 전 항목 PASS.
- 교차 seam 몽타주(`_workspace/`): `03_tilecheck_seams.png`(grass|path_v|grass, grass/path_h/grass, grass/water_edge/water, grass/dirt_edge/dirt), `03_tilecheck_path_family.png`(길 6종 나란히), `03_tilecheck_path_loop.png`(닫힌 흙 트랙 3×3) — 육안: 잔디 패치워크 해소·도로 톤 균질·경계 프린징 없음.

**범위 밖:** `tile_cliff`·`tile_lava`(패밀리 없는 독립 지형 타일, 비교 앵커 없음), `deco_*`(타일 위 개체 — §7.5 히스토그램 보정 비대상). 매니페스트 키·파일명·경로·규격(256² RGBA, 알파 255 보존) 전부 불변 — engine 로더 코드 변경 불요.

## v5.1 잔디 변형 패치워크 보정 (플레이테스트 후속)

**요구(P2, playtester):** 스테이지 2~5 잔디에 밝은 변형 타일이 패치워크로 튐(스테이지1은 우수). v5 본편은 전이 타일만 다뤘고 잔디 변형(clover/flower)은 whole-tile RGB `--check` PASS(13.6/7.0<18)라 손대지 않았다 — 그런데 실플레이에서 튐이 잔존.

**근본 원인 — 평균색 지표가 놓친 "밝기·채도 캐릭터":** `tile_grass_flower`는 RGB 평균이 기본 잔디와 거의 동일(ΔE 2.5)한데도 필드에서 밝은 연두 블록으로 튄다. 밝은 잔디날·꽃 반점의 고주파 밝기 분포가 타일 전체를 밝게 읽히게 하기 때문 — **평균색(RGB `--check`·Lab ΔE of means) 지표는 원리상 이걸 못 잡는다.** 실제 해시 배치(tilemap.js `grassTileKey` 재현) 필드 몽타주로 재현 확인. 스테이지별 tint는 multiply(채널 상수배)라 차이를 오히려 축소하며(수학), 실제로 tint 최약 스테이지2(alpha 0.12)가 최심·tint 최강 스테이지5(0.32)가 덜함 → **tint는 원인 아님.** playtester의 maxΔE 45는 잔디 위 장식 스프라이트가 셀 평균을 오염시킨 outlier(본인 주의사항과 일치)로, 잔디 타일 색편차가 아님.

**보정 — 분포 매칭(whole-tile 히스토그램):** clover/flower는 단일재질 잔디라 번들 `harmonize_palette.py`가 정확한 도구. 평균이 아닌 **채널 분포 전체**를 앵커에 매칭해 밝기·채도 캐릭터를 정렬(strength 0.85). clover 잎·flower 반점은 미세 텍스처로 잔존(60/25/15 변형 다양성 유지) — 밝기 튐만 제거.

| 타일 | RGB `--check` 전→후 | perceptual ΔE(원색) 전→후 | strength |
|---|---|---|---|
| tile_grass_clover | 13.6 → **1.6** | 6.8 → **1.0** | 0.85 |
| tile_grass_flower | 7.0 → **1.4** | 2.5 → **0.5** | 0.85 |

- perceptual ΔE는 5개 스테이지 tint 전부에서 clover ≤1.0·flower ≤0.5(전 스테이지 JND 미만).
- **완료 검수:** 잔디 패밀리 whole-tile `--check`(단일재질=유효 지표) clover 1.6 / flower 1.4 PASS, exit 0. 필드 몽타주 `_workspace/03_grassfield_{notint,stage2tint}_{before,after}.png` 육안: before 밝은 블록 다수 → after 균질(튐 소멸, 미세 변형 유지).
- 규격 유지: harmonize가 RGB→RGBA로 바꾼 것을 다시 RGB로 환원(기본 잔디·패밀리 관례와 동일, 256² 불투명). 키·경로·매니페스트 불변, 코드 변경 0. 원본 백업 `assets/reference/pre_harmonize/tile_grass_{clover,flower}.png`.
- 계측·몽타주 도구: `_workspace/tools/grass_lab.py`(Lab ΔE + tint 시뮬 + 해시배치 몽타주).

**렌더 기준 검증(팀리드 완료 기준 — 실행 중 헤드리스 Chrome 9222):** 실제 게임 페이지(http://127.0.0.1:8234) 컨텍스트에서 real `tilemap.buildBackground`로 5레벨 배경을 real tint·로드된 에셋으로 렌더해 PNG 캡처(`_workspace/03_render_stage{1-5}.png`), 순수 잔디 셀(초록지배 픽셀 ≥90%, 길·전이·deco 셀 제외) per-tile Lab ΔE(중앙값 대비) 계측:

| 스테이지 | tint | before(playtester) | after(렌더 계측) |
|---|---|---|---|
| 1 수정 골짜기 | 없음 | maxΔE 6.8, 초과 0% | maxΔE **6.8**, 0/117 PASS |
| 2 덤불 갈림길 | #d9a441 a0.12 | maxΔE 45.4, 초과 11.8% | maxΔE **6.6**, 0/93 PASS |
| 3 뒤엉킨 길 | #3a7d8c a0.16 | maxΔE ~26 | maxΔE **6.1**, 0/102 PASS |
| 4 비좁은 관문 | #3d4a6b a0.24 | 육안 최악 | maxΔE **5.9**, 0/89 PASS |
| 5 최후의 능선 | #5a1d3a a0.32 | maxΔE 26, 초과 10.1% | maxΔE **5.9**, 0/71 PASS |

- **방법론 검증:** 렌더 계측 stage1 = 6.8로 playtester 실측 6.8과 정확히 일치 → 순수잔디 필터가 동일 대상 격리 확인. stage2~5가 stage1급(≤6.8)으로 수렴 = 패치워크 소멸.
- 육안(렌더 PNG): 전 스테이지 밝은 변형 블록 소멸, tint별 색조만 균질 적용. 도구 `_workspace/tools/{render_check.mjs,render_measure.py}`.

| 회차 | 일시 | 내용 |
|---|---|---|
| 5 (v5.1) | 2026-07-19 | 잔디 변형 clover/flower whole-tile 분포 하모나이즈 — 필드 패치워크 제거(ΔE 6.8→1.0, 2.5→0.5). 평균색 지표가 놓친 밝기 캐릭터 편차가 원인, tint·deco outlier는 무관. 키·규격 불변. |
