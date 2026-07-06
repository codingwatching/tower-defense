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
