# 아키텍처 계약 문서 — 크리스탈 가드 (Crystal Guard)

- 작성: system-architect / 2026-07-03 (v2.0 개정 2026-07-06, v3.0 개정 2026-07-08)
- 입력: `_workspace/01_director_gdd.md` (v3.0 — §13, D13~D18, AC-38~48), `td-code-standards` 스킬 (배포·모바일·애니메이션 규약)
- 상태: v3.0 확정 (계약 변경 이력 참조). **이 문서는 모든 모듈 경계의 단일 출처다. 여기 없는 결합은 버그로 간주한다.**
- 변경 절차: 인터페이스 변경이 필요하면 system-architect에게 요청 → 본 문서 갱신 + 영향 에이전트 통지 후에만 구현 변경.
- **v3 확장 원칙(GDD §13 불변 원칙 계승):** v3은 기존 한 판의 룰·이벤트·데이터 스키마를 **바꾸지 않고 추가만 한다.** 신규는 스테이지 진행(그릇)과 점수(척도)의 두 축. v1/v2 이벤트 36종·데이터 스키마·에셋 42키·맵 기하는 전부 불변. v3 신규 계약은 §3.10(이벤트 7종), §4.7~4.11(스키마), §14(스테이지·점수·영속 흐름), §15(v3 불변 경계)에 격리한다.

---

## 0. 핵심 확정 사항 (요약)

| 항목 | 확정값 | 사유 |
|---|---|---|
| 그리드 | **15열 × 10행, 타일 64px** | GDD §5 명시. td-code-standards 기본값(48px, 20×13)보다 GDD가 우선 |
| 캔버스 | **960 × 640 (게임 필드 전용, 1장)** | HUD/상점을 캔버스 밖 DOM에 두어 경로 가림 문제(GDD §7-2)를 원천 차단 |
| 전체 페이지 레이아웃 | 세로 스택: HUD 바(DOM, 48px) + 캔버스(640px) + 상점 바(DOM, 96px), 폭 960px | 필드 밖 UI 확정 — ui-dev 재량 범위였던 배치를 계약으로 고정 |
| UI 레이어 방식 | **하이브리드 — 위젯 UI는 DOM, 필드 내 오버레이(배치 고스트·사거리 원·타일 하이라이트)는 캔버스 레이어 40** | 버튼 비활성/텍스트/패널은 DOM이 압도적으로 저렴하고 QA(playtester)가 셀렉터로 조작 가능. 마우스 추적 프리뷰는 캔버스가 자연스러움 |
| 게임 루프 | 고정 타임스텝 1/60초, 배속은 누적량에 곱함 | td-code-standards 그대로 |
| 실험적 API | 사용 금지. requestAnimationFrame + 2D context만 | 위험 회피 |
| ~~타워 레벨 표기~~ | ~~레벨별 스프라이트 없음 — 코드 배지~~ **(v2 폐기)** | GDD v2 D8이 v1 §3 공통 규칙을 대체 — 아래 v2 행 |
| 실행 | `python3 -m http.server 8000` (file:// 불가) | ES 모듈 CORS |
| **(v2)** 타워 레벨 표기 | 레벨별 실스프라이트 `tower_{type}_lv1~3` 교체, 배지는 보조 표기 | GDD D8·AC-27. 키는 §5.1 |
| **(v2)** 적 애니메이션 | 걷기 4프레임 스트립+아틀라스 쌍, `getAnim` 강등 체인, 프레임 선택은 개체 누적 시간 | GDD D9·AC-29. 계약은 §10 |
| **(v2)** 모바일 | Pointer Events 단일 경로, 터치 1탭 프리뷰→동일 타일 2탭 확정, DPR(상한 2) 스케일 — **논리 좌표계 960×640 불변** | GDD D10·AC-33~35. 계약은 §11 |
| **(v2)** 배포 | GitHub Pages — 상대 경로만, 루트 `.nojekyll`, 소문자 snake_case | GDD D12·AC-36. 계약은 §12 |
| **(v2)** 맵 개선 경계 | 시각 개선만 — waypoints·PATH 집합·킬존 불변 | GDD D11·AC-32. 경계는 §13 |
| **(v3)** 스테이지 | 단일 `LEVEL` → **`LEVELS` 배열 5개**. `LEVELS[0]` = 기존 crystal_valley(불변 — D13/D11). 순차 해금, 각 스테이지 독립 한 판(자원 초기화·10웨이브 고정) | GDD D13~D16·AC-38~44. 스키마 §4.7, 흐름 §14.1 |
| **(v3)** 스테이지 진입 | `stage:started` 이벤트가 활성 스테이지 컨텍스트(level/waves/balance)를 브로드캐스트 → grid/path/economy/waves가 이걸로 리셋. 상태 머신에 `'stage-select'` 추가 | 기존 `game:started` 리셋 경로 보존 + 스테이지 컨텍스트 주입. 흐름 §14.1 |
| **(v3)** 점수 | 종합 점수 = 처치 + 웨이브 클리어 보너스 + 남은 라이프 보너스. `systems/score.js`(신규)가 집계·소유. 배점 데이터는 `src/data/scoring.js`(신규, wave-balancer 소유) | GDD D18·AC-45~47. 스키마 §4.10, 흐름 §14.2 |
| **(v3)** 영속(localStorage) | 해금 진행도 + 스테이지별 최고점만 저장. `core/storage.js`(저수준 I/O·폴백) + `systems/progress.js`(도메인 상태). **키 네임스페이스 `crystal_guard.v1`** — Pages는 origin 단위 저장소 공유(다른 리포와 충돌 방지) | GDD D14/D18·AC-40/47/48. 스키마 §4.11, 흐름 §14.3 |

---

## 1. 모듈 맵 (①)

```
tower-defense/
├── index.html               # 진입점 + DOM 컨테이너 (ID 계약 §7)
├── .nojekyll                # (v2) Pages Jekyll 비활성 (architect 소유 — §12)
├── css/style.css            # 레이아웃 시드 (ui-dev가 확장·소유 — v2 세로 레이아웃 §11 포함)
├── assets/
│   ├── manifest.js          # 에셋 키→경로 단일 출처 (architect 소유, §5와 1:1)
│   ├── images/{towers,enemies,projectiles,map}/   # (v2) enemies/에 *_walk.png+json 아틀라스 쌍 포함 (§10)
│   └── reference/           # (v2) 다각도 레퍼런스 시트 — 런타임 미사용·매니페스트 미등재 (asset-artist, AC-30)
├── src/
│   ├── main.js              # 부트스트랩, 상태 머신, window.GAME 디버그 훅
│   ├── core/
│   │   ├── loop.js          # 고정 타임스텝 루프, 배속
│   │   ├── renderer.js      # 캔버스, 레이어 등록/순서, 카메라 셰이크 오프셋
│   │   ├── input.js         # 마우스/키 → input:* 이벤트 (좌표 변환 포함)
│   │   ├── events.js        # 이벤트 버스 on/off/emit — 모듈 간 유일한 쓰기 결합
│   │   ├── assets.js        # 로더 + 플레이스홀더 폴백 + #FF00FF 크로마키 제거
│   │   └── storage.js       # (v3) localStorage 저수준 I/O + JSON 파싱·폴백 (engine-dev 소유, §4.11·§14.3)
│   ├── map/
│   │   ├── grid.js          # 좌표 변환·타일 조회·점유 관리 (단일 소유)
│   │   ├── path.js          # 웨이포인트 경로: progress(px) → 위치
│   │   └── tilemap.js       # 배경 레이어(타일+수정+입구) 오프스크린 캐시 렌더
│   ├── entities/
│   │   ├── tower.js         # Tower 클래스 (타겟팅·발사·업그레이드 + v2 Lv3 메커니즘)
│   │   ├── enemy.js         # Enemy 클래스 (이동·피해·슬로우·누수 + v2 걷기 애니메이션)
│   │   ├── projectile.js    # Projectile 클래스 (비행·명중·스플래시)
│   │   └── zone.js          # (v2) 지대 엔티티 — 캐논 Lv3 화염 지대 장판 (§3.9, §4.6)
│   ├── systems/
│   │   ├── combat.js        # 엔티티 컬렉션 소유, 건설/업그레이드/판매 처리
│   │   ├── waves.js         # 스폰 스케줄, 카운트다운, 클리어 판정 (v3: 활성 스테이지 웨이브)
│   │   ├── economy.js       # 골드/라이프 원장 (쓰기는 이벤트 구독으로만, v3: 활성 스테이지 balance)
│   │   ├── score.js         # (v3) 종합 점수 집계 원장 (이벤트 구독으로만 가산, §4.10·§14.2)
│   │   └── progress.js      # (v3) 해금 진행도·스테이지별 최고점 도메인 상태 (storage 경유 영속, §4.11·§14.3)
│   ├── ui/
│   │   ├── hud.js           # 골드/라이프/웨이브/카운트다운/배속/음소거/웨이브시작 (v3: 점수 표시)
│   │   ├── shop.js          # 타워 4종 버튼, 골드 부족 비활성
│   │   ├── placement.js     # 배치 모드: 캔버스 고스트+사거리 원 (레이어 40)
│   │   ├── panel.js         # 타워 정보 패널 (업그레이드/판매)
│   │   ├── stageselect.js   # (v3) 스테이지 선택 화면 — 5카드 나열·잠금·최고점 (§7·§14.1)
│   │   └── screens.js       # 타이틀/승리/패배 오버레이 (v3: 점수 분해·최고기록·신기록)
│   ├── fx/
│   │   ├── particles.js     # 폭발·사망 팝·냉기 파편·건설 먼지
│   │   ├── floaters.js      # 데미지 숫자·골드 획득 플로팅 텍스트
│   │   └── flashes.js       # 피격 플래시·슬로우 틴트·화면 흔들림(셰이크 제공자)
│   ├── audio/
│   │   ├── synth.js         # Web Audio 합성 프리미티브 (외부 파일 없음)
│   │   └── sound.js         # 이벤트 구독 → SFX/BGM 재생, 음소거
│   └── data/                # ★ 수치의 유일한 거주지 — 코드 내 매직 넘버 금지
│       ├── towers.js        # TOWERS (스키마 §4.1)
│       ├── enemies.js       # ENEMIES (§4.2)
│       ├── waves.js         # WAVES (§4.3) + (v3) STAGE_WAVES 스테이지별 웨이브 (§4.8)
│       ├── balance.js       # BALANCE (§4.4) + (v3) STAGE_BALANCE 스테이지별 시작 자원·HP 배수 (§4.9)
│       ├── levels.js        # (v3) LEVELS 배열 5개 — LEVEL은 LEVELS[0] 별칭 유지 (§4.7)
│       └── scoring.js       # (v3) SCORING 배점값 (처치·웨이브·라이프 계수, §4.10, wave-balancer 소유)
└── scripts/sim.mjs          # 헤드리스 밸런스 시뮬 (브라우저 비의존, v3: 스테이지별 회귀)
```

### 의존 규칙 (읽기/쓰기 분리)

- **쓰기(상태 변경) 결합은 이벤트 버스로만 한다.** 다른 모듈의 상태를 직접 변경하는 함수 호출 금지.
- **예외 — 동일 소유자 디렉토리 내부 결합** *(v1.2 명문화)*: 같은 에이전트가 소유한 한 디렉토리 안의 모듈끼리는 직접 함수 호출(쓰기 포함)을 허용한다. 예: `ui/shop` → `ui/placement`의 `enterPlacementMode`/`cancelPlacementMode`. 이런 내부 API는 계약 대상이 아니며 소유자가 자유로이 변경 가능하다. 단 **디렉토리 경계를 넘는 쓰기는 여전히 이벤트로만**이며, 이벤트 버스를 쓰는 경우의 §3 표 준수 의무는 내부 결합 여부와 무관하게 적용된다.
- **읽기는 아래 화살표 방향의 API 호출만 허용:**
  - 모든 모듈 → `core/events`, `core/assets`, `src/data/*`
  - `core/input` → `map/grid` (`pxToGrid`, `TILE_SIZE` — §3.8 페이로드의 col/row 변환. §2 "변환은 grid.js 단일 소유"가 요구) *(v1.2 명시)*
  - `systems/*`, `entities/*` → `map/grid`, `map/path` (읽기 + 점유 occupy/release)
  - `systems/waves` → `systems/combat`의 `enemies` 배열 (읽기 전용 — §3.2 클리어 판정 "생존 적 0"이 요구) *(v1.1 명시)*
  - `systems/combat` → `systems/economy` 읽기 API (`canAfford` — 건설/업그레이드 사전 검증, §3.5 reason `'gold'`가 요구) *(v1.1 명시)*
  - `ui/*` → `systems/economy.getGold()` 등 읽기 API, `map/grid`, `systems/combat`의 컬렉션 조회
  - `main` → 전부
  - **`fx/*`, `audio/*` → 이벤트 구독만. 읽기 API 호출도 금지.** 이유: 이 두 디렉토리는 통째로 삭제해도 게임이 돌아야 한다 (부분 재실행 보장).
  - **(v3)** `systems/progress` → `core/storage` (읽기·쓰기 I/O 위임). progress가 도메인 상태 소유·검증, storage는 순수 JSON I/O·폴백만 — 이 결합만 storage를 건드린다.
  - **(v3)** `ui/stageselect`, `ui/screens` → `systems/progress` 읽기 API(`getUnlockedCount`/`getBestScore`), `systems/score`는 이벤트로만 수신. `main` → `progress`/`score` init + 스테이지 진입 오케스트레이션.
  - **(v3)** `systems/score` → 읽기 API 호출 금지, 이벤트 구독으로만 가산(경제 원장과 동일 원칙). `src/data/scoring.js`만 읽기.
- 순환 import 금지. `entities`가 `systems`를 import하지 않는다 (역방향만). **(v3)** `core/storage`는 어떤 게임 모듈도 import하지 않는다(순수 유틸 — 최하위 계층).

---

## 2. 좌표계·그리드 확정값 (⑥)

| 항목 | 값 |
|---|---|
| TILE_SIZE | 64 px |
| COLS × ROWS | 15 × 10 |
| 게임 필드 | 960 × 640 px = 캔버스 전체 |
| 그리드 좌표 | `{col, row}` — col 0~14, row 0~9. 좌상단이 (0,0) |
| 픽셀 좌표 | `{x, y}` — 캔버스 좌상단 원점, 엔티티는 **중심점** 기준 |
| 변환 | `grid.js` 단일 소유: `gridToPx({col,row})` → 타일 **중심** `{x: col*64+32, y: row*64+32}` / `pxToGrid({x,y})` → `{col: floor(x/64), row: floor(y/64)}` |
| 타일 종류 | `TILE = { GRASS: 0, PATH: 1, DECO: 2 }` — GRASS만 건설 가능 |
| 경로 | `LEVEL.waypoints` (타일 좌표 배열, map-designer 확정). 입구=좌측 가장자리, 도착=우측 가장자리. 적의 위치는 경로 누적 이동 거리 `progress`(px)로 결정 |
| 사거리/스플래시 | px 단위 반경, 중심점 간 거리로 판정 (적 판정은 `distance <= range + enemy.radius`) |

**사유:** GDD §5가 15×10/64px/960×640을 명시 — td-code-standards의 기본값 조항("architect가 계약 문서에서 조정 가능")에 따라 본 값이 우선한다.

---

## 3. 이벤트 계약 표 (②) — 총 43개 (v1 33종 + v2 신규 3종 §3.9 + v3 신규 7종 §3.10)

**v3 불변 보증:** v1/v2의 36종은 이름·페이로드 필드·발행/구독 관계가 전부 불변이다. v3는 §3.10에 7종을 추가만 한다. `game:started`/`game:won`/`game:over`의 시맨틱·페이로드도 불변 — v3는 이 위에 스테이지·점수 이벤트를 겹쳐 쌓는다.

이벤트 이름은 `도메인:kebab-case`. 페이로드 필드는 **문자 단위로** 이 표를 따른다.
추가·변경은 system-architect 승인 후 이 표에 먼저 반영한다.

### 3.1 게임 흐름 (5)

| 이벤트 | 페이로드 | 발행 | 구독 |
|---|---|---|---|
| `ui:start-requested` | `{}` | ui/screens (타이틀 시작 버튼) | main |
| `ui:restart-requested` | `{}` | ui/screens (승리/패배 재시작) | main |
| `game:started` | `{}` | main (시작·재시작 공용, 상태 리셋 완료 후) | systems 전부, ui, fx, audio |
| `game:won` | `{kills, livesLeft}` | main (10웨이브 클리어 감지) | ui/screens, audio |
| `game:over` | `{waveReached, kills}` | main (lives ≤ 0 감지) | ui/screens, audio |

### 3.2 웨이브 (5)

| 이벤트 | 페이로드 | 발행 | 구독 |
|---|---|---|---|
| `ui:wave-start-requested` | `{}` | ui/hud (웨이브 시작 버튼) | systems/waves |
| `wave:started` | `{index, total}` — index 1부터 | systems/waves | ui, audio, main (도달 웨이브 집계 → game:over의 waveReached — listen-only, v1.2) |
| `wave:cleared` | `{index, bonus}` | systems/waves (전원 스폰 완료 + 생존 적 0) | main, systems/economy, ui, audio |
| `wave:countdown` | `{remaining}` — 남은 초(정수), 값 변경 시마다. 0 = 만료→자동 시작 | systems/waves | ui/hud |
| `boss:spawned` | `{enemy}` | systems/waves (`enemy:spawned`에 **추가로**) | fx (셰이크), audio |

### 3.3 적 (4)

| 이벤트 | 페이로드 | 발행 | 구독 |
|---|---|---|---|
| `enemy:spawned` | `{enemy}` | systems/waves | systems/combat |
| `enemy:killed` | `{enemy, reward, x, y}` | systems/combat | economy(+골드), fx, audio, main (kills 집계 → game:won/over 통계 — listen-only, v1.2) |
| `enemy:escaped` | `{enemy, livesCost}` | systems/combat (도착점 도달) | economy(-라이프), fx, audio |
| `enemy:slowed` | `{enemy, factor, duration}` | systems/combat (슬로우 적용/갱신 시) | fx (청색 틴트) |

### 3.4 전투 (2)

| 이벤트 | 페이로드 | 발행 | 구독 |
|---|---|---|---|
| `tower:fired` | `{towerType, x, y, target}` — x,y=타워 중심, target=적 참조 | entities/tower (combat 경유) | fx (섬광), audio (타워별 발사음 4종) |
| `projectile:hit` | `{target, damage, x, y, splashRadius}` — splashRadius 0=단일. **target은 `Enemy \| null`** (타겟이 비행 중 사망 → 투사체가 마지막 지점에 헛방 도달, 이때 `damage=0`). 구독자는 target 역참조 전 null 확인 필수, damage 0이면 데미지 숫자 생략 권장 | entities/projectile (combat 경유) | fx (폭발·피격 플래시·데미지 숫자), audio |

### 3.5 타워 생애주기 (9)

| 이벤트 | 페이로드 | 발행 | 구독 |
|---|---|---|---|
| `ui:build-requested` | `{towerType, col, row}` | ui/placement (배치 확정 클릭) | systems/combat |
| `ui:upgrade-requested` | `{towerId}` | ui/panel | systems/combat |
| `ui:sell-requested` | `{towerId}` | ui/panel | systems/combat |
| `build:rejected` | `{towerType, col, row, reason}` — reason: `'gold'\|'tile'\|'occupied'` | systems/combat (검증 실패) | ui, audio (에러음) |
| `tower:placed` | `{tower, cost}` | systems/combat | economy(-골드), ui, fx (먼지), audio |
| `tower:upgraded` | `{tower, cost}` | systems/combat | economy(-골드), ui/panel, fx, audio |
| `tower:sold` | `{tower, refund}` | systems/combat (제거+타일 해제 후) | economy(+골드), ui, audio |
| `tower:selected` | `{tower}` | ui/placement (건설된 타워 클릭) | ui/panel (패널+사거리 원), audio (클릭음 — listen-only, v1.1) |
| `tower:deselected` | `{}` | ui (빈 곳 클릭/ESC/판매) | ui/panel |

### 3.6 경제 (2)

| 이벤트 | 페이로드 | 발행 | 구독 |
|---|---|---|---|
| `gold:changed` | `{gold, delta}` | systems/economy | ui/hud, ui/shop, ui/panel |
| `lives:changed` | `{lives, delta}` | systems/economy | main (0 감지), ui/hud, fx, audio (경고음) |

### 3.7 컨트롤 (3)

| 이벤트 | 페이로드 | 발행 | 구독 |
|---|---|---|---|
| `ui:speed-changed` | `{multiplier}` — 1 또는 2 | ui/hud | main → core/loop.setSpeed, audio (클릭음 — listen-only, v1.1) |
| `ui:mute-changed` | `{muted}` | ui/hud | audio |
| `ui:error` | `{reason}` — `'gold'\|'placement'\|'max-level'` | ui (비활성 버튼 클릭 등) | audio (에러음) |

### 3.8 입력 (3) — core/input이 원시 입력을 캔버스 좌표로 변환해 발행

| 이벤트 | 페이로드 | 발행 | 구독 |
|---|---|---|---|
| `input:click` | `{x, y, col, row, button}` — button: 0=좌 | core/input | ui/placement |
| `input:move` | `{x, y, col, row}` | core/input | ui/placement |
| `input:cancel` | `{}` — 우클릭 또는 ESC | core/input | ui/placement, ui/shop (선택 하이라이트 해제 — v1.2 추가). ui/panel은 직접 구독하지 않음 — placement가 발행하는 `tower:deselected` 경유로 처리 (기능 동등, v1.2 정정) |

### 3.9 v2 신규 — Lv3 메커니즘 (3) *(v2.0 추가)*

| 이벤트 | 페이로드 | 발행 | 구독 |
|---|---|---|---|
| `zone:created` | `{zone, x, y, radius, duration, kind}` — kind: `'burning'`(현재 유일), zone은 §4.6 Zone shape | systems/combat (캐논 Lv3 착탄) | fx (장판 파티클), audio |
| `zone:expired` | `{zone}` | systems/combat (지속 종료) | fx (정리) |
| `frost:nova` | `{x, y, radius}` | systems/combat (프로스트 Lv3 명중 — 확산 대상별 `enemy:slowed`는 별도로 정상 발행) | fx (파동 링), audio |

- **zone 틱 피해는 이벤트를 발행하지 않는다** (틱당 플로터·사운드 스팸 방지). 틱으로 사망하면 `enemy:killed`는 정상 발행.
- 속사 가속(애로우 Lv3)·과충전(아케인 Lv3)은 **신규 이벤트 없음** — `tower:fired` 리듬과 `projectile:hit`의 damage 값으로 표현된다 (AC-23·26 판정 경로).
- **(v2 비파괴 확장)** `input:click`·`input:move` 페이로드에 선택 필드 `pointerType`(`'mouse'|'touch'|'pen'`) 추가 — 기존 구독자는 무시해도 무방, §11 배치 상태 머신이 사용. 기존 필드의 이름·시맨틱은 불변.

### 3.10 v3 신규 — 스테이지·점수·영속 (7) *(v3.0 추가, D13~D18)*

| 이벤트 | 페이로드 | 발행 | 구독 |
|---|---|---|---|
| `ui:stage-select-requested` | `{}` | ui/screens (타이틀 "게임 시작", 결과화면 "스테이지 선택으로"), ui/hud (게임 중 나가기 — 선택) | main (→ `'stage-select'` 상태) |
| `ui:stage-selected` | `{stageIndex}` — 0~4 | ui/stageselect (해금된 카드 클릭) | main (→ 스테이지 진입 오케스트레이션 §14.1) |
| `stage:started` | `{stageIndex, stageId}` — stageId = LEVELS[stageIndex].id | main (레벨 스왑 직후, **`game:started` 직전**) | systems/economy(활성 balance 컨텍스트 캐시), systems/waves(활성 waves 캐시), systems/score(stageIndex 캐시), ui/hud(스테이지명), audio |
| `score:changed` | `{score, delta, source}` — source: `'kill'\|'wave'`, score=가산 후 누적값 | systems/score (`enemy:killed`·`wave:cleared` 구독해 가산) | ui/hud (실시간 표시 AC-45), fx (선택 팝 연출) |
| `score:finalized` | `{stageIndex, outcome, kill, wave, life, total}` — outcome: `'won'\|'over'`, kill/wave/life=요소별 소계, total=합계 | systems/score (`game:won`·`game:over` 구독해 라이프 보너스 확정 후 1회) | ui/screens (결과 분해 표시 AC-46), systems/progress (최고점 갱신·해금 판정) |
| `stage:record-updated` | `{stageIndex, best, isNewBest}` — best=갱신 후 최고점, isNewBest=이번 판이 경신했는가 | systems/progress (`score:finalized` 처리 후) | ui/screens (신기록 연출 AC-47), ui/stageselect (카드 최고점 갱신), audio (신기록 징글 — 선택) |
| `stage:unlocked` | `{stageIndex}` — 새로 해금된 스테이지 인덱스(= 클리어한 스테이지+1) | systems/progress (승리로 신규 해금 발생 시에만) | ui/stageselect (잠금 해제 반영), audio (해금 징글 — 선택) |

**흐름·순서 계약 (구독자 등록 순서에 의존하지 않도록 설계 — §14 상세):**
- **진입:** 타이틀/결과 → `ui:stage-select-requested` → main `'stage-select'` 상태 → stageselect 표시. 카드 클릭 → `ui:stage-selected {stageIndex}` → main이 `LEVELS[stageIndex]`로 grid/path/배경 재초기화(직접 호출 — main→map 허용) 후 `stage:started` → `game:started` 순차 발행. **`stage:started`가 반드시 `game:started`보다 먼저** — economy/waves/score가 컨텍스트를 캐시한 뒤 `game:started`로 리셋한다.
- **종료:** main이 승패 판정 후 `game:won`/`game:over`(기존, 불변) 발행 → score가 이를 구독해 라이프 보너스를 더해 최종 점수를 확정하고 `score:finalized` 발행(중첩 emit, 동기) → progress가 이를 구독해 최고점 비교·해금 처리 후 `stage:record-updated`(+신규 해금 시 `stage:unlocked`) 발행. 전 캐스케이드가 main의 `emit('game:won')` 스택 안에서 동기 완료되므로 결과 화면은 어떤 순서로 채워져도 최종 상태가 일관된다.
- **리셋:** score 누적값은 `game:started`에서 0으로 초기화(economy와 동일 트리거). stageIndex는 `stage:started`에서 캐시. `score:finalized`·`stage:record-updated`는 판당 정확히 1회.
- **기존 이벤트 재사용(신규 필드 없음):** score는 `enemy:killed {enemy, reward}`에서 `enemy.type`으로 처치 점수, `wave:cleared {index, bonus}`의 `index`로 웨이브 점수, `game:won {livesLeft}`의 `livesLeft`로 라이프 보너스를 얻는다 — 세 이벤트의 페이로드는 불변.
- **`ui:start-requested`(기존):** v3에서 타이틀 버튼은 `ui:stage-select-requested`로 재지향된다. 하위 호환을 위해 main은 `ui:start-requested`도 `'stage-select'` 진입으로 처리한다(직접 플레이 경로 폐기). `ui:restart-requested`(기존)는 "현재 스테이지 재도전"으로 의미 유지 — main이 캐시한 현재 stageIndex로 재진입.

---

## 4. 데이터 스키마 (③) — wave-balancer·entity-dev·map-designer가 문자 단위로 따를 필드명

수치는 wave-balancer(§4.1~4.4)와 map-designer(§4.5)가 채운다. **필드명·단위·의미는 여기서 확정.**
단위 규약: 거리·크기 = px / 시간 = 초 / 속도 = px/초.

### 4.1 `src/data/towers.js` — `export const TOWERS`

```js
TOWERS = {
  arrow: {                       // 키 = id. 4종: arrow | cannon | frost | arcane
    id: 'arrow',
    name: 'Arrow Tower',
    nameKo: '애로우 타워',
    assetKey: 'tower_arrow',     // §5 매니페스트 키
    damageType: 'physical',      // 'physical' | 'magic' — magic은 armor 무시
    projectile: {
      assetKey: 'proj_arrow',
      speed: 480,                // px/초 (비행 속도)
      size: 20,                  // 드로우 크기 px
      splashRadius: 0,           // 0 = 단일 대상, >0 = 착탄 스플래시 반경 px (cannon만 >0)
      slow: null                 // frost만: { factor: 0.5, duration: 2.0 } — factor는 속도 배수(0.5=반감)
    },
    levels: [                    // 고정 길이 3. [0]=Lv1, [1]=Lv2, [2]=Lv3
      { cost: 50, damage: 10, range: 160, cooldown: 0.6 },  // Lv1의 cost = 건설 비용
      { cost: 40, damage: 18, range: 176, cooldown: 0.55 }, // Lv2의 cost = Lv1→2 업그레이드 비용
      { cost: 60, damage: 30, range: 192, cooldown: 0.5 }   // Lv3의 cost = Lv2→3 업그레이드 비용
    ]
  },
  // cannon, frost, arcane 동일 구조
}
```

- `cooldown` = 발사 간격(초). 공속 = 1/cooldown. **GDD 구속: arrow가 4종 중 최소 cooldown (AC-09).**
- frost는 `damage` 0 허용, `projectile.slow` 필수. arcane은 `damageType: 'magic'` 권장(스틸 브루트 카운터 — AC-09).
- 위 수치는 스키마 예시일 뿐이며 확정값이 아니다.

**§4.1-v2 확장 — 레벨 스프라이트·Lv2 축 오버라이드·Lv3 메커니즘** *(v2.0 추가, D7·D8)*

```js
// TowerDef v2 변경분 (기존 필드는 위 v1 스키마 그대로):
{
  // assetKey: 'tower_arrow'            ← v1 필드 폐지 (§5.1). 대신:
  assetKeys: ['tower_arrow_lv1', 'tower_arrow_lv2', 'tower_arrow_lv3'], // [level-1] = §5.1 키. 레벨업 시 이미지 교체 (AC-27)

  levels: [
    { cost, damage, range, cooldown },                                     // 기존 4필드 의미 불변
    { cost, damage, range, cooldown, splashRadius: 88 },                   // (선택) cannon의 Lv2 축: 레벨별 스플래시 반경
    { cost, damage, range, cooldown, slow: { factor: 0.4, duration: 3 } }  // (선택) frost의 축: 레벨별 슬로우 오버라이드
  ],
  // levels[i].splashRadius / levels[i].slow가 없으면 projectile의 기본값 사용 (v1 데이터와 하위 호환).
  // Lv2 비대칭 축(GDD §12.1): arrow=공속(cooldown), cannon=splashRadius, frost=slow, arcane=사거리(range)
  //   — arrow·arcane 축은 기존 필드로 표현, 신규 필드 없음.

  mechanism: {                     // (v2 필수) Lv3 해금 고유 메커니즘 — level === 3에서만 활성
    type: 'rapid_volley',          // 'rapid_volley' | 'burning_ground' | 'frost_nova' | 'overcharge'
    nameKo: '속사 가속',
    desc: '같은 적을 연속 명중할수록 공속 증가, 대상이 바뀌면 초기화',  // 패널 1줄 노출 (AC-28)
    // ── type별 파라미터 (union — 해당 type의 필드만 존재) ──
    maxStacks: 5, stackFactor: 0.85
  }
}
```

| mechanism.type | 파라미터 (단위) | 동작 정의 | 밸런스 구속 (GDD §12.1) |
|---|---|---|---|
| `rapid_volley` (arrow) | `maxStacks`(정수), `stackFactor`(0~1) | 유효 발사 간격 = `cooldown × stackFactor^stacks`. 동일 대상 명중마다 +1스택(상한 maxStacks), **대상 변경·사망 시 0으로 초기화** (AC-23) | 최대 가속 DPS/골드가 arcane 단일딜 존재 이유를 침범 금지 |
| `burning_ground` (cannon) | `duration`(초), `radius`(px), `tickInterval`(초), `tickDamage`(틱당), `damageType` | 착탄 지점에 Zone 생성(§4.6). 장판 위 적에게 tickInterval마다 tickDamage (AC-24). 이벤트는 §3.9 | 지대 틱 DPS < 직격 기여 — 주 딜은 착탄 |
| `frost_nova` (frost) | `radius`(px) | 명중 시 착탄 반경 내 **모든 적**에게 해당 레벨의 slow(factor·duration — 오버라이드 반영값)를 그대로 적용, 대상별 `enemy:slowed` 발행 (AC-25). slowResist 규칙(§8) 동일 | `radius ≤ cannon Lv3 splashRadius` |
| `overcharge` (arcane) | `chargeTime`(초), `maxBonus`(배수) | 피해 = `damage × (1 + min(idle / chargeTime, 1) × maxBonus)`, idle = 마지막 발사 후 경과 시간 (AC-26) | 상시 DPS 왜곡 금지 상한. 다중 타겟화 금지(저격 정체성) |

- 4개 메커니즘의 수치는 전부 wave-balancer 소관. 코드(entity-dev)는 위 동작 정의만 구현하고 수치를 하드코딩하지 않는다.

### 4.2 `src/data/enemies.js` — `export const ENEMIES`

```js
ENEMIES = {
  goblin: {                      // 5종: goblin | orc | steel_brute | wasp_runner | stone_golem
    id: 'goblin',
    name: 'Goblin',
    nameKo: '고블린',
    assetKey: 'enemy_goblin',
    hp: 30,                      // 기본 최대 HP — 웨이브의 hpMultiplier가 곱해짐
    speed: 90,                   // px/초 (기본, 슬로우 미적용 시)
    armor: 0,                    // 물리 피해 정액 감산. 실피해 = max(1, damage - armor). magic은 무시
    reward: 5,                   // 처치 골드
    livesCost: 1,                // 누수 시 라이프 차감 — GDD 고정: 일반 1, 보스 5
    slowResist: 0,               // 0~1. 유효 슬로우 factor' = factor + (1-factor)*slowResist — 보스 0.5
    radius: 14,                  // 판정 반경 px (명중·스플래시)
    size: 40,                    // 스프라이트 드로우 크기 px (정사각)
    isBoss: false                // stone_golem만 true
  },
}
```

### 4.3 `src/data/waves.js` — `export const WAVES` (배열 길이 10 고정)

```js
WAVES = [
  { // 배열 인덱스 0 = 웨이브 1
    hpMultiplier: 1.0,           // 이 웨이브 적 HP 배수 (성장 곡선은 이 값으로만)
    bonus: 25,                   // 클리어 보너스 골드
    groups: [                    // 스폰 그룹 — 순차가 아니라 delay 기준 병렬 스케줄
      { enemy: 'goblin', count: 8, interval: 0.8, delay: 0 }
      // enemy: ENEMIES 키 / count: 마릿수 / interval: 개체 간 간격(초) / delay: 웨이브 시작 후 그룹 첫 스폰 지연(초)
    ]
  },
  // ... 총 10개. 등장 순서 구속: GDD §4 (1~2 고블린 → 3~4 오크 → 5 와스프 → 6~7 브루트 → 8~9 혼합 → 10 골렘+호위)
]
```

### 4.4 `src/data/balance.js` — `export const BALANCE`

```js
BALANCE = {
  startGold: 120,              // GDD 구속: 타워 2기 건설 가능해야 함
  startLives: 20,              // GDD 고정
  sellRatio: 0.7,              // GDD 고정. 환불 = floor(총투자 * 0.7)
  interWaveCountdown: 15       // 웨이브 클리어 후 자동 카운트다운(초). 첫 웨이브는 카운트다운 없음(버튼만)
}
```

### 4.5 `src/data/levels.js` — `export const LEVEL` (map-designer 소유)

```js
LEVEL = {
  id: 'crystal_valley',
  name: 'Crystal Valley',
  nameKo: '수정 골짜기',
  cols: 15, rows: 10, tileSize: 64,       // §2 확정값과 일치해야 함
  tiles: [ /* number[10][15] — 행 우선. 값: TILE enum (0=GRASS, 1=PATH, 2=DECO) */ ],
  waypoints: [ /* {col, row}[] — 경로 타일 중심 순서. [0]=입구(col 0), [끝]=도착(col 14). S자 곡선 */ ],
  entrance: { col: 0, row: 0 },           // 동굴 입구 오브젝트 위치 = waypoints[0]
  goal: { col: 14, row: 0 }               // 수정 오브젝트 위치 = waypoints[끝]
}
```

- `tiles`의 PATH 타일 집합은 `waypoints`가 지나는 타일과 일치해야 한다 (qa-engineer 교차 검증 항목).

**§4.5-v2 확장 — 시각 장식 데이터** *(v2.0 추가, D11 — 경계는 §13)*

```js
LEVEL.decoTiles = [               // (선택) DECO 타일의 렌더 키 지정
  { col: 2, row: 0, key: 'deco_rock' },
  { col: 5, row: 9, key: 'deco_bush' }   // key ∈ §5.4의 deco_* 4종. 항목이 가리키는 tiles[row][col]은 반드시 TILE.DECO
];
```

- `decoTiles`에 없는 DECO 타일은 `deco_rock`으로 렌더 (폴백 — v1 데이터 하위 호환).
- **잔디 변형·길 방향 타일 선택은 데이터가 아니라 `tilemap.js`가 결정적으로 계산한다**: 잔디 = `(col,row)` 해시로 `tile_grass`/`_clover`/`_flower` 중 선택(매 로드 동일 결과), 길 = `tiles`의 PATH 인접 관계로 직선 h/v·코너 4종 판별. → waypoints·tiles 불변인 채 시각만 개선.
- **(v3)** 단일 `LEVEL` export는 **하위 호환 별칭으로 유지**되며 `LEVELS[0]`와 동일 객체를 가리킨다 — §4.7. `LevelDef` 스키마 자체는 불변이며 v3에서 선택 필드 `tint`만 추가된다(§4.7).

### 4.6 런타임 엔티티 shape (이벤트 페이로드의 `tower`/`enemy`가 보장하는 필드)

fx/ui/audio는 페이로드로 받은 객체에서 **아래 필드만** 읽는다 (그 외 필드는 비계약 — 의존 금지):

```js
// Tower 인스턴스
{ id,            // 고유 인스턴스 id (문자열 또는 정수)
  type,          // 'arrow' | 'cannon' | 'frost' | 'arcane'
  col, row,      // 그리드 위치
  x, y,          // 픽셀 중심
  level,         // 1 | 2 | 3
  invested,      // 총 투자 골드 (건설+업그레이드 누계) — 환불 계산 근거
  alive }        // Entity 공통

// Enemy 인스턴스
{ id, type,      // type: ENEMIES 키
  x, y,          // 픽셀 중심 (매 스텝 갱신)
  hp, maxHp,
  progress,      // 경로 누적 이동 거리 px — 타겟팅 First = progress 최대
  slowed,        // boolean (슬로우 활성 여부 — fx 틴트용)
  isBoss,
  alive }

// (v2) Zone 인스턴스 (zone:created/expired 페이로드가 보장)
{ id,
  kind,          // 'burning'
  x, y, radius,  // 중심·반경 px
  remaining,     // 남은 지속 시간 초
  alive }
```

- 엔티티 공통 인터페이스는 td-code-standards 그대로: `alive` 플래그, `update(dt)`, `draw(ctx)`, 제거는 `alive=false` 후 일괄 필터.

---

## 4-v3. v3 데이터 스키마 (③ 확장) — 스테이지·점수·영속

**소유:** §4.7(levels.js)=map-designer, §4.8~4.10(waves.js·balance.js·scoring.js)=wave-balancer, §4.11(영속 스키마)=engine-dev 구현/architect 정의. **필드명·단위·의미는 여기서 확정한다.** v1/v2 스키마(§4.1~4.6)는 문자 단위로 불변.

### 4.7 `src/data/levels.js` — `export const LEVELS` (배열 길이 5, map-designer 소유)

v2의 단일 `LEVEL`을 **`LEVELS` 배열 5개**로 확장한다. 각 원소는 §4.5 `LevelDef`를 **그대로** 따르며(스키마 불변), v3 선택 필드 `tint` 하나만 추가된다.

```js
export const LEVELS = [
  { /* LEVELS[0] = 기존 crystal_valley — waypoints·tiles·decoTiles 문자 단위 불변 (D13/D11/AC-41) */
    id: 'crystal_valley', name: 'Crystal Valley', nameKo: '수정 골짜기',
    cols: 15, rows: 10, tileSize: 64,
    tiles: [ /* v2와 동일 */ ], waypoints: [ /* v2와 동일 */ ],
    entrance: {...}, goal: {...}, decoTiles: [ /* v2와 동일 */ ],
    tint: null                              // (v3 선택) 색 오버레이 — null=없음(스테이지 1은 대낮 원색 유지)
  },
  { id: 'bramble_fork',  name: 'Bramble Fork',  nameKo: '덤불 갈림길',  /* … 신규 — map-designer */ tint: {...} },
  { id: 'twin_snake',    name: 'Twin Snake',    nameKo: '뒤엉킨 길',    /* … 신규 */ },
  { id: 'narrow_gate',   name: 'Narrow Gate',   nameKo: '비좁은 관문',  /* … 신규 */ },
  { id: 'last_ridge',    name: 'Last Ridge',    nameKo: '최후의 능선',  /* … 신규 */ }
];

/** @deprecated v3 하위 호환 — LEVELS[0]과 동일 객체. 신규 코드는 LEVELS 사용. */
export const LEVEL = LEVELS[0];
```

- **`tint` 필드 (v3 신규, 선택):** `{ color: '#RRGGBB', alpha: 0.0~0.5 } | null`. `tilemap.js`가 배경 오프스크린 캐시 위에 곱셈/오버레이 1회 적용(전역 색 시간대 — GDD §13.1 테마). null·미기입 = 오버레이 없음. **게임플레이 무관**(순수 시각) — QA는 tint를 밸런스 회귀 대상에서 제외.
- **id 도메인 (고정):** `'crystal_valley'|'bramble_fork'|'twin_snake'|'narrow_gate'|'last_ridge'` — 순서 = stageIndex 0~4. 이 id는 §4.11 저장 스키마·§4.8 STAGE_WAVES·§4.9 STAGE_BALANCE의 키로도 쓰이는 **단일 식별자**.
- 각 신규 레벨의 `tiles`/`waypoints`/`decoTiles`는 map-designer가 채운다. **기하 제약(GDD §13.1 난이도 의도 → wave-balancer 밴드 AC-44):** 경로 길이·코너 수·건설 가능 타일 밀도가 스테이지 1<2<3<4<5 방향으로 압박 상승. `entrance`=waypoints[0](좌측 가장자리 권장), `goal`=waypoints[끝]. §4.5 정합성 구속(PATH 집합 == waypoints 통과 타일) 동일 적용, QA 교차 검증.
- **LEVELS[0] 불변 게이트(AC-41):** map-designer는 LEVELS[0]의 waypoints·tiles·decoTiles를 v2 `LEVEL`에서 복사만 하고 수정 금지. QA가 v2 데이터와 diff 대조.

### 4.8 `src/data/waves.js` — `export const STAGE_WAVES` (wave-balancer 소유)

기존 `WAVES`(§4.3, 길이 10)는 **불변**이며 스테이지 1(crystal_valley)의 웨이브로 계속 쓰인다. v3는 스테이지별 웨이브를 `STAGE_WAVES`로 추가한다.

```js
export const WAVES = [ /* §4.3 — 길이 10 불변. 스테이지 1 웨이브 */ ];

/** 스테이지 id → WaveDef[] (각 길이 10 고정 — D16). 5키 필수. */
export const STAGE_WAVES = {
  crystal_valley: WAVES,        // 스테이지 1 = 기존 WAVES 재사용 (참조 동일 — AC-42 이월없음과 무관, 정의 공유일 뿐)
  bramble_fork:  [ /* 10개 — wave-balancer */ ],
  twin_snake:    [ /* 10개 */ ],
  narrow_gate:   [ /* 10개 */ ],
  last_ridge:    [ /* 10개 */ ]
};
```

- 각 값은 §4.3 `WaveDef[]` 스키마 그대로(길이 10 고정 — D16). 등장 순서 구속(§4.3 GDD §4)은 스테이지 1에만 엄격 적용; 스테이지 2~5는 난이도 곡선(AC-44) 우선.
- **접근 계약:** `systems/waves`는 `stage:started {stageId}`로 활성 스테이지를 알고 `STAGE_WAVES[stageId]`를 활성 웨이브 배열로 캐시한다. `stageId` 미매치·부재 시 `WAVES`(스테이지 1)로 폴백 + 경고 1회. 웨이브 총 개수(`total`)는 활성 배열 길이(항상 10)를 쓴다.

### 4.9 `src/data/balance.js` — `export const STAGE_BALANCE` (wave-balancer 소유)

기존 `BALANCE`(§4.4)는 **전역 상수(sellRatio·interWaveCountdown)의 단일 출처로 불변**. v3는 스테이지별로 달라지는 시작 자원·난이도 배수만 `STAGE_BALANCE`로 분리한다.

```js
export const BALANCE = { /* §4.4 — 불변. sellRatio·interWaveCountdown은 전역 */ };

/** 스테이지 id → 스테이지별 시작 자원·난이도. 5키 필수. */
export const STAGE_BALANCE = {
  crystal_valley: { startGold: 120, startLives: 20, hpScale: 1.0 },  // 스테이지 1 = v2 값과 동일 (AC-41 회귀 불변)
  bramble_fork:   { startGold: 120, startLives: 20, hpScale: 1.0 },  // 값은 wave-balancer 확정
  twin_snake:     { /* … */ },
  narrow_gate:    { /* … */ },
  last_ridge:     { /* … */ }
};
```

| 필드 | 단위/도메인 | 의미 |
|---|---|---|
| `startGold` | 정수 | 그 스테이지 진입 시 시작 골드 (스테이지 간 이월 없음 — D15/AC-42) |
| `startLives` | 정수 | 그 스테이지 시작 라이프 |
| `hpScale` | 배수(≥1) | 스테이지 전역 HP 배수. 실 HP = `ENEMIES[type].hp × WaveDef.hpMultiplier × hpScale`. 난이도 상승의 주 손잡이(D16). 스테이지 1 = 1.0(회귀 불변) |

- **전역 값(`sellRatio`, `interWaveCountdown`)은 `BALANCE`에만** 존재 — 스테이지별로 바뀌지 않는다. `STAGE_BALANCE`는 시작 자원·난이도 배수만.
- **접근 계약:** `systems/economy`는 `stage:started {stageId}`로 `STAGE_BALANCE[stageId]`의 startGold/startLives를 캐시 → 뒤이은 `game:started`에서 그 값으로 리셋(기존 리셋 경로 재사용, §14.1). `hpScale`은 `systems/waves`(Enemy 생성 시)가 캐시해 `Enemy(type, hpMultiplier × hpScale)`로 넘긴다 — Enemy 생성자 시그니처는 불변(둘째 인자에 곱해진 값 전달). 부재 시 `{startGold:BALANCE.startGold, startLives:BALANCE.startLives, hpScale:1.0}` 폴백.

### 4.10 `src/data/scoring.js` — `export const SCORING` (wave-balancer 소유, 신규 파일)

종합 점수 배점값의 단일 출처(GDD §13.2 D18). score.js는 이 값만 읽고 하드코딩하지 않는다.

```js
export const SCORING = {
  killPoints: {                 // 처치 점수 — 적 종류별 차등 (ENEMIES 5키 전부 필수)
    goblin: 5, orc: 10, steel_brute: 25, wasp_runner: 8, stone_golem: 200  // 값은 wave-balancer 확정 (보스 단일 최고)
  },
  waveClearBonus: 50,           // 웨이브 클리어당 가산 점수 (선택: 아래 waveScale로 후반 가중)
  waveScale: 1.0,               // 웨이브 점수 = waveClearBonus × (1 + (index-1) × (waveScale-1)) 형태 — 1.0=균등
  lifeBonusPerLife: 25          // 남은 라이프 보너스 계수 — 클리어 시 livesLeft × 이 값 (패배 시 0)
};
```

| 필드 | 도메인 | 집계 규칙 (score.js 구현, §14.2) |
|---|---|---|
| `killPoints[type]` | 정수, ENEMIES 5키 | `enemy:killed`마다 `killPoints[enemy.type]` 가산 (누수 사망은 처치 아님 — 가산 안 함). 미정의 type = 0 + 경고 |
| `waveClearBonus`, `waveScale` | 정수·배수 | `wave:cleared {index}`마다 웨이브 점수 가산. 후반 가중 공식은 score.js가 이 두 값으로 결정론 계산 |
| `lifeBonusPerLife` | 정수 | `game:won {livesLeft}` 시 `livesLeft × lifeBonusPerLife` 1회 가산. `game:over`(패배)는 라이프 보너스 0 |

- **점수 규칙 구속(GDD §13.2):** 판매·업그레이드는 점수 무영향(경제 이벤트를 score가 구독하지 않음). 배속 페널티 없음. 점수는 스테이지 독립(진입 시 0 리셋). 처치 점수/웨이브 점수는 판 진행 중 실시간 가산(`score:changed`), 라이프 보너스만 종료 시 확정(`score:finalized`).
- 값은 전부 wave-balancer 소관 — sim.mjs에 점수 산출 훅을 넣어 밸런스와 함께 튜닝 가능(선택).

### 4.11 영속(localStorage) 스키마 (engine-dev 구현 / architect 정의)

**저장 키(네임스페이스):** `crystal_guard.v1` — 단일 키에 JSON 문자열로 전체 상태 저장.
- **Pages 주의:** `revfactory.github.io`의 localStorage는 **origin 단위로 같은 계정의 다른 리포와 공유**된다. 게임 고유 접두사 `crystal_guard.`가 충돌을 방지한다. 버전 접미사 `.v1`은 스키마 진화 시 마이그레이션 지점.

```js
// localStorage['crystal_guard.v1'] = JSON.stringify(SaveState)
/** @typedef SaveState */
{
  version: 1,                    // 스키마 버전 (읽을 때 불일치면 폴백 + 재작성)
  unlockedCount: 1,              // 해금된 스테이지 수 (1~5). 항상 ≥1 (스테이지 1 상시 해금 — D14).
                                 //   해금 판정: stageIndex < unlockedCount 이면 선택 가능
  bestScores: [0, 0, 0, 0, 0]    // 길이 5, 인덱스=stageIndex. 스테이지별 최고 점수 (미플레이=0)
}
```

- **폴백 계약(AC-48 — 크래시 금지):** 키 부재·JSON 파싱 실패·타입 불일치·버전 불일치 → `core/storage`가 초기값 `{version:1, unlockedCount:1, bestScores:[0,0,0,0,0]}` 반환 + 경고 1회. `progress`는 항상 유효 구조를 받는다.
- **정규화:** `unlockedCount`는 `[1,5]`로 클램프, `bestScores`는 길이 5로 패딩/절단(부족분 0)·음수 0 클램프. 손상 데이터를 부분 복구.
- **쓰기 시점:** `progress`가 `score:finalized` 처리 후(최고점 경신 또는 신규 해금 시) storage에 1회 저장. 매 프레임 저장 금지.
- **접근 계약:** `core/storage`는 `loadSave()`→`SaveState`(항상 유효), `saveSave(state)`→void만 노출. localStorage 자체 예외(사생활 모드·용량 초과)도 try/catch로 흡수 — 저장 실패는 콘솔 경고만, 게임 진행 방해 금지.

---

## 5. 에셋 키 표 (④) — `assets/manifest.js`와 1:1, 총 42키 (v2.0)

- 키 규칙: `카테고리접두사_이름`, **전부 소문자 snake_case** (Pages 대소문자 구분 — §12). 접두사가 플레이스홀더 폴백 모양을 결정한다.
- 폴백(assets.js): `tower_*`=파랑 사각 / `enemy_*`=빨강 원 / `proj_*`=노랑 점 / `tile_grass*`=초록 사각 / `tile_path*`=갈색 사각 / 기타(`deco_*`·`goal_*`·`entrance_*`)=회색 사각.
- 모든 이미지: PNG, 투명 배경(불투명이면 #FF00FF 크로마키 — 로더가 제거). 밝은 카툰 판타지, **v1 팔레트·비례 유지** (GDD §12.2).
- **매니페스트 값 형식 (v2 확정)**: 정적 이미지 = 문자열 경로, 애니메이션 = `{ img, atlas }` 객체 (스트립 PNG + 아틀라스 JSON 경로 명시). **로더는 JSON 존재를 추측(probe)하지 않는다** — 매니페스트가 유일한 판별 근거. 사유: 키마다 404 fetch를 시도하는 암묵 탐지보다 명시 계약이 Pages 환경·QA 대조에 안전하다.
- **키 추가·변경은 architect 승인 필수.**
- **(v2) v1 타워 키 4종(`tower_arrow` 등) 폐지** — §5.1의 12키로 대체, 매니페스트에서 제거(참조 0). 구 PNG의 디스크 삭제는 asset-artist 재량.
- **레퍼런스 시트**: `assets/reference/` — 스타일 가이드 보존 + QA 스타일 대조 기준 (AC-30). **런타임 미사용·매니페스트 미등재.** 파일명 소문자 snake_case 권장.

### 5.1 타워 (12) — 레벨별 실스프라이트 (D8, AC-27)

| 키 | 경로 (`assets/images/towers/…`) | 드로우 크기 | 시각 (GDD §12.2) |
|---|---|---|---|
| `tower_arrow_lv1` `_lv2` `_lv3` | `tower_arrow_lv{n}.png` | 64×64 | 목재 석궁 망루 — 레벨↑마다 증축·장식 강화, 동일 실루엣 |
| `tower_cannon_lv1` `_lv2` `_lv3` | `tower_cannon_lv{n}.png` | 64×64 | 석재+청동 대포 — Lv3 포신에 화염 문양 (§12.1 암시) |
| `tower_frost_lv1` `_lv2` `_lv3` | `tower_frost_lv{n}.png` | 64×64 | 푸른 수정 첨탑 — Lv3 첨탑에 파동 링 |
| `tower_arcane_lv1` `_lv2` `_lv3` | `tower_arcane_lv{n}.png` | 64×64 | 자주 발광 첨탑 — Lv3 부유 수정 증폭 |

레벨 오인 금지: 같은 타워 Lv1~3은 같은 실루엣의 화려함 증가여야 하며, 다른 타워로 보이면 반려 (GDD §12.2).

### 5.2 적 (10 = 정적 5 + 걷기 쌍 5)

정적 키 5종은 v1 그대로 유지 (경로·컨셉·드로우 크기 = §4.2 `size` 불변): `enemy_goblin`(40) / `enemy_orc`(48) / `enemy_steel_brute`(56) / `enemy_wasp_runner`(40) / `enemy_stone_golem`(96). **v2 용도**: 걷기 아틀라스 강등 폴백(§10) + 정지 상태 표시.

| 걷기 쌍 키 | 값 (`{ img, atlas }`) — `assets/images/enemies/…` | 시트 규격 |
|---|---|---|
| `enemy_goblin_walk` | `enemy_goblin_walk.png` + `enemy_goblin_walk.json` | 1행 4열, 프레임 128×128 |
| `enemy_orc_walk` | 동일 패턴 | 동일 |
| `enemy_steel_brute_walk` | 동일 패턴 | 동일 |
| `enemy_wasp_runner_walk` | 동일 패턴 | 동일 |
| `enemy_stone_golem_walk` | 동일 패턴 | 동일 |

5종 전부 동일 규격 128×128×4프레임 (D9 — 보스 포함. 크기 차이는 draw 시 §4.2 `size`로 스케일). 아틀라스 JSON 형식은 §10.

### 5.3 투사체 (4) — v1 불변

`proj_arrow`(20) / `proj_cannonball`(20) / `proj_frost_orb`(20) / `proj_arcane_bolt`(24) — 경로·컨셉 v1 그대로.

### 5.4 맵 (16 = 잔디 3 + 길 7 + 장식 4 + 오브젝트 2)

| 키 | 경로 (`assets/images/map/…`) | 크기 | 시각 (GDD §12.3 — v1 팔레트 동일) |
|---|---|---|---|
| `tile_grass` | `tile_grass.png` | 64×64 | 민무늬 잔디 (v1 유지) |
| `tile_grass_clover` | `tile_grass_clover.png` | 64×64 | 클로버 점박이 변형 |
| `tile_grass_flower` | `tile_grass_flower.png` | 64×64 | 들꽃 소량 변형 |
| `tile_path` | `tile_path.png` | 64×64 | 방향 무관 흙길 (v1 유지 — **방향 타일 강등 폴백**) |
| `tile_path_h` | `tile_path_h.png` | 64×64 | 흙길 직선 — 가로 |
| `tile_path_v` | `tile_path_v.png` | 64×64 | 흙길 직선 — 세로 |
| `tile_path_ne` | `tile_path_ne.png` | 64×64 | 흙길 코너 — 북·동 변이 열림 |
| `tile_path_nw` | `tile_path_nw.png` | 64×64 | 흙길 코너 — 북·서 변이 열림 |
| `tile_path_se` | `tile_path_se.png` | 64×64 | 흙길 코너 — 남·동 변이 열림 |
| `tile_path_sw` | `tile_path_sw.png` | 64×64 | 흙길 코너 — 남·서 변이 열림 |
| `deco_rock` | `deco_rock.png` | 64×64 | 바위 (v1 유지) |
| `deco_bush` | `deco_bush.png` | 64×64 | 낮은 초록 덤불 |
| `deco_flowers` | `deco_flowers.png` | 64×64 | 들꽃 무리 |
| `deco_crystal_shard` | `deco_crystal_shard.png` | 64×64 | 하늘색 파편 수정 조각 |
| `goal_crystal` | `goal_crystal.png` | 96×96 | 발광 수정 클러스터 (v1 유지) |
| `entrance_cave` | `entrance_cave.png` | 96×96 | 동굴 입구 (v1 유지) |

- 코너 명명 = 타일에서 길이 열린 두 변. 예: 서쪽에서 진입해 북쪽으로 꺾이는 지점 = 북·서가 열림 = `tile_path_nw`.
- 오디오 에셋 없음(전량 Web Audio 합성)·UI 전용 이미지 없음(상점 아이콘 = `tower_{type}_lv1` 재사용, 로고 = CSS 텍스트) — v1 원칙 유지.

### 5.5 v3 에셋 판정 (④ — GDD §13.3 D17): **신규 매니페스트 키 0개**

- **맵 5개 타일:** 신규 테마 타일셋 불필요. 스테이지 2~5의 차별화는 ① `LEVELS[n].waypoints`/`tiles`(경로 기하) ② 기존 §5.4 타일 재배치 밀도 ③ `LEVELS[n].tint`(전역 색 오버레이, §4.7)로만 달성 — **기존 42키 재사용.** asset-artist 맵 타일 추가 작업 없음.
- **스테이지 선택 화면:** 카드 썸네일은 **기존 타일로 조합한 미니맵 프리뷰**(stageselect가 `LEVELS[n].tiles`를 축소 렌더 + tint)로 충족 — 신규 이미지 생략. 잠금 아이콘·클리어 표식·"신기록" 뱃지는 CSS/캔버스 도형·텍스트로 처리(로고=CSS 텍스트 원칙 계승). → **매니페스트 불변(42키 유지).**
- **폴백 원칙(AC-21) 불변:** 미니맵도 §5 폴백(GRASS=초록·PATH=갈색 도형)으로 그려지므로 에셋 부재에도 스테이지 선택 화면이 정상 표시된다.
- 향후 asset-artist가 스테이지 배경/뱃지를 추가하려면 architect 승인 후 §5에 키 등재 — 현 v3 범위에서는 신규 키를 계약하지 않는다.

---

## 6. 모듈별 담당 에이전트 표 (⑤)

| 경로 | 담당 | 비고 |
|---|---|---|
| `index.html`, `assets/manifest.js`, `.nojekyll`(v2), 본 문서 | **system-architect** | 변경은 승인 절차 필수 |
| `css/style.css` | **ui-dev** | architect가 레이아웃 시드 제공, 이후 ui-dev 소유 |
| `src/main.js`, `src/core/*`, `src/systems/economy.js` | **engine-dev** | (v3) `src/core/storage.js` 추가. main의 스테이지 진입 오케스트레이션(§14.1) |
| `src/systems/progress.js` *(v3)* | **engine-dev** | 해금·최고점 도메인 상태. storage 경유 영속. §4.11·§14.3 |
| `src/map/*`, `src/data/levels.js` | **map-designer** | (v3) `LEVELS` 5개 — LEVELS[0]은 v2 데이터 복사(불변), 신규 4개 채움 |
| `src/entities/*`, `src/systems/combat.js`, `src/systems/waves.js` | **entity-dev** | (v3) waves가 `stage:started`로 활성 웨이브·hpScale 캐시 (§4.8·§4.9) |
| `src/ui/*` | **ui-dev** | (v3) `src/ui/stageselect.js` 추가, screens 점수/신기록, hud 점수 표시 |
| `src/systems/score.js` *(v3)* | **ui-dev 또는 engine-dev — 아래 소유 결정** | 점수 집계 원장. 이벤트 구독으로만 가산 (economy와 동일 원칙) |
| `src/fx/*` | **fx-dev** | 이벤트 구독만 (읽기 API 금지). (v3) `score:changed` 팝·신기록 연출(선택) |
| `src/audio/*` | **audio-dev** | 이벤트 구독만 (읽기 API 금지). (v3) 신기록/해금 징글(선택) |
| `src/data/towers.js, enemies.js, waves.js, balance.js`, `scripts/sim.mjs`, `src/data/scoring.js`(v3) | **wave-balancer** | 스키마(§4) 필드명 변경 불가. (v3) STAGE_WAVES·STAGE_BALANCE·SCORING 수치 |
| `assets/images/**` (PNG + `*_walk.json` 아틀라스), `assets/reference/**`(v2) | **asset-artist** | 키·경로는 §5 고정, 아틀라스 형식은 §10, 파이프라인은 td-asset-pipeline v2. **(v3) 맵 타일 추가 작업 없음 — §5.5** |

**§6-v3 소유 결정 — `systems/score.js` = engine-dev 소유.** 근거: score는 economy와 동형(전역 이벤트 구독 → 원장 누적 → `*:changed` 발행 → 종료 시 확정)이고, `game:started` 리셋·`stage:started` 컨텍스트 캐시가 main 오케스트레이션(§14, engine-dev)과 밀착한다. `systems/economy.js`가 이미 engine-dev 소유이므로 systems 원장 계층을 한 소유자로 묶는다. ui-dev는 score를 **구독(`score:changed`/`score:finalized`)으로만** 소비 — 읽기 API도 두지 않는다(economy 패턴). `systems/progress.js`도 동일 사유로 engine-dev.

**소유권 규칙:** 남의 파일에서 결함 발견 시 직접 수정 금지 — 담당자에게 리포트 (td-code-standards).

---

## 7. index.html DOM ID 계약

playtester/qa-engineer가 셀렉터로 조작하므로 아래 ID·속성은 **고정**이다. 내부 구성은 ui-dev 재량.

| 셀렉터 | 역할 |
|---|---|
| `#app` | 전체 래퍼 (폭 960) |
| `#hud` | 상단 바. 내부: `#hud-gold`, `#hud-lives`, `#hud-wave`, `#hud-countdown`, `#hud-score`(v3), `#btn-wave-start`, `#btn-speed`, `#btn-mute`, `#btn-to-stages`(v3, 게임 중 스테이지 선택 복귀 — 선택) |
| `#stage` | 캔버스 + 오버레이의 relative 컨테이너 |
| `#game-canvas` | 960×640 게임 캔버스 |
| `#shop` | 하단 상점 바. 타워 버튼: `.shop-item[data-tower="arrow|cannon|frost|arcane"]`, 비활성은 `disabled` 속성 |
| `#tower-panel` | 타워 정보 패널(floating). 내부: `#btn-upgrade`, `#btn-sell` |
| `#screen-title` / `#screen-victory` / `#screen-defeat` | 오버레이 화면. 버튼: `#btn-start`, `#btn-restart-victory`, `#btn-restart-defeat` |
| `#screen-stage-select` *(v3)* | 스테이지 선택 오버레이. 카드: `.stage-card[data-stage="0..4"]`, 잠긴 카드는 `disabled`(또는 `.locked`), 클리어 표식 `.cleared`, 카드 내 최고점 `.stage-best`. 복귀 버튼 `#btn-to-title`(선택) |
| `#btn-restart-victory` / `#btn-restart-defeat` *(v3 의미 확장)* | "현재 스테이지 재도전"(`ui:restart-requested`). 결과 화면 스테이지 선택 복귀 버튼: `#btn-stages-victory` / `#btn-stages-defeat`(`ui:stage-select-requested`) |
| `#btn-next-victory` *(v3, 선택 — ui-dev 제안 승인)* | 승리 화면 "다음 스테이지". `ui:stage-selected {stageIndex: 현재+1}` 발행 — §14.1 진입 경로 재사용. 다음 스테이지 해금 시에만 노출·활성, 마지막 스테이지(index 4) 클리어 시 숨김 |
| `#btn-cancel-placement` *(v2)* | 배치 모드 취소 버튼 — #stage 내, **배치 모드 중에만 노출** (모바일 필수 취소 수단 §11, 데스크톱 표시 무방) |
| 공통 | 숨김은 `.hidden` 클래스 토글 |

- **(v3) `index.html`(architect 소유)에 `#screen-stage-select` 오버레이 컨테이너와 `#hud-score` 요소를 추가한다.** 내부 카드 구조·미니맵 캔버스는 stageselect.js(ui-dev)가 생성 — architect는 컨테이너와 ID만 계약. 결과 화면의 점수 분해 표시 노드는 screens.js가 §3.10 `score:finalized` 페이로드로 채운다.

---

## 8. 코어 계약 (시그니처)

뼈대 파일의 JSDoc과 동일. 여기 요약만.

- **상태 머신 (main.js):** v2 `'loading' → 'title' → 'playing' → 'victory' | 'defeat'`. **(v3)** `'stage-select'` 상태 추가: `'loading' → 'title' → 'stage-select' → 'playing' → 'victory'|'defeat'`, 결과·재시작·게임중 나가기 → `'stage-select'`, 재도전(`ui:restart-requested`) → `'playing'`(현재 스테이지). 승패 판정 불변(main): `wave:cleared`에서 `index === (활성 웨이브 총수)`이면 `game:won`, `lives:changed`에서 `lives <= 0`이면 `game:over`. **(v3 정정)** 승리 판정의 웨이브 총수는 하드코딩 10이 아니라 **`wave:started {total}`로 캐시한 활성 스테이지 total**(항상 10이지만 데이터가 진실 — D16)로 비교한다. main은 이미 `wave:started`를 listen-only 구독하므로 `total` 캐시만 추가(신규 결합 없음).
- **loop.js:** `STEP = 1/60`, `startLoop(update, render)`, `setSpeed(m)`. td-code-standards의 누적기 패턴 그대로 (스파이럴 캡 0.25초). 카운트다운도 update 안에서 흐르므로 배속의 영향을 받는다 (의도됨).
- **renderer.js:** `initRenderer(canvas)`, `registerLayer(order, drawFn)`, `render()`. 레이어 순서: **10=배경(tilemap), 20=엔티티(타워→지대(zone)→적→투사체 — v2), 30=fx, 40=캔버스 UI(고스트·사거리 원)**. `setCameraOffset(dx, dy)` — fx/flashes가 셰이크용으로 호출, 레이어 ≤30에만 적용. **(v2)** DPR 스케일: 내부 해상도 = 960×640 × `min(devicePixelRatio, 2)`, 컨텍스트 스케일로 **모든 drawFn은 논리 960×640 좌표 그대로** (§11).
- **assets.js:** `await loadAssets(MANIFEST)` → `{loaded, failed}`, `get(key)` → **항상 drawable**(Image|Canvas) 반환. 실패 시 §5 폴백 + 콘솔 경고 1회. draw 호출부는 폴백을 신경 쓰지 않는다. **(v2)** `getAnim(key)` → 항상 `{image, atlas}` — 강등 체인은 §10.
- **grid.js:** §2 변환 함수 + `tileAt(cell)`, `inBounds(cell)`, `isBuildable(cell)`(GRASS이고 미점유), `occupy(cell)`/`release(cell)` — 점유 원장은 grid가 단일 소유.
- **path.js:** `initPath(LEVEL)`, `positionAt(progress)` → `{x, y, done}` (progress px, done=도착), `getTotalLength()`.
- **디버그 훅 (main.js):** `window.GAME = { state, gold, lives, wave, speed, towers, enemies, projectiles, zones(v2), emit, data }` — playtester/qa의 유일한 내부 접근 통로. 제거 금지. AC-23·26·35의 수치 판정 경로. **(v3 추가):**
  - `stageIndex` (getter) — 현재/최근 진입 스테이지 인덱스 0~4 (AC-42 판정)
  - `score` (getter) — 현재 누적 점수 (AC-45 판정)
  - `progress` (getter) — `{ unlockedCount, bestScores }` 현재 영속 상태 스냅샷 (AC-40/47/48 판정)
  - `data`에 `LEVELS`·`STAGE_WAVES`·`STAGE_BALANCE`·`SCORING` 추가 (기존 `LEVEL`은 `LEVELS[0]` 별칭으로 유지 — 하위 호환)
- **게임 규칙 확정:**
  - 타겟팅: First — `progress` 최대인 사거리 내 적.
  - 물리 피해: `max(1, damage - armor)`. 마법 피해: armor 무시.
  - 슬로우: 비중첩 — 새 슬로우는 지속시간 갱신, factor는 더 강한 쪽 유지. 유효 factor = `factor + (1 - factor) * slowResist`.
  - 판매 환불: `Math.floor(invested * BALANCE.sellRatio)`.
  - 웨이브 클리어 보너스는 마지막(10) 웨이브에도 지급 (승리 통계용, 무해).

---

## 9. 완료 기준 (전 모듈 공통, td-code-standards 재확인)

1. `node --check` 통과 (ES 모듈 오탐 시 `node -e "import('./src/….js')"`)
2. 본 문서의 이벤트·시그니처·필드명과 문자 단위 일치
3. fx/audio/ui는 자기 모듈이 없어도 게임이 크래시하지 않아야 함
4. 완료 보고에 공개 API + 발행/구독 이벤트 목록 포함
5. **(v2)** 리소스 참조 상대 경로 — §12 감사 게이트 0건

---

## 10. 애니메이션 계약 (v2.0 — td-code-standards 규약의 계약 편입)

- **아틀라스 JSON** (`*_walk.json`, asset-artist 산출 — td-asset-pipeline v2):
  ```json
  { "frameW": 128, "frameH": 128, "frames": 4, "fps": 8, "sequences": { "walk": [0, 1, 2, 3] } }
  ```
  스트립 PNG는 1행 × `frames`열 균일 프레임. `fps` 기본 8 — 시각 소관(asset-artist)이며 밸런스와 무관.
- **로더 강등 체인**: `assets.getAnim(key)`는 항상 `{image, atlas}`를 반환한다.
  ① 쌍 정상 → 스트립 + 아틀라스 JSON
  ② 아틀라스 실패/미등재 → 대응 정적 이미지(예: `enemy_goblin_walk` → `enemy_goblin`) + **합성 단일 프레임 아틀라스** `{frameW: image.width, frameH: image.height, frames: 1, fps: 1, sequences: {walk: [0]}}`
  ③ 이미지도 실패 → 카테고리 플레이스홀더 + 합성 아틀라스
  → **draw 호출부는 강등 여부를 구분하지 않는다** (v1 폴백 원칙의 확장 — AC-21·29 동시 충족).
- **프레임 선택은 엔티티 소관**: 개체별 누적 시간 `t`로 `frame = floor(t × fps) % frames`. **전역 타이머 공유 금지** — 개체마다 위상이 달라야 자연스럽다. 권장: `t += dt × (현재 이동속도 / 기본 speed)` — 슬로우 걸린 적은 걸음도 느려져 CC가 시각으로 읽힌다 (fx 틴트와 상승 효과).
- **방향 표현은 스프라이트 회전** (진행 각도로 rotate). 4방향 시트 금지 — 시트 물량 4배의 가치가 없다.
- 타워는 애니메이션 없음 — 레벨별 정적 스프라이트 교체(§5.1)만.

---

## 11. 모바일 계약 (v2.0 — D10)

| 항목 | 계약 | 소유 |
|---|---|---|
| 입력 통합 | `core/input`은 **Pointer Events만** 사용 (`pointerdown/move/up/cancel` — mouse/touch 이중 리스너 금지, 고스트 클릭 방지). 탭 판정: pointerup 시점 누적 이동 < 8 논리px → `input:click` 발행. `input:click`·`input:move`에 `pointerType` 선택 필드 (§3.9). `input:*` 이벤트 이름·기존 필드 불변 | engine-dev |
| DPR 스케일 | 캔버스 내부 해상도 = 논리 960×640 × `min(devicePixelRatio, 2)` + 컨텍스트 스케일 (AC-35). **논리 좌표계 960×640 불변** — grid/path/entities/fx/ui의 좌표 코드 영향 0. 입력은 CSS 표시 크기 → 논리 좌표 역보정 | engine-dev |
| 배치 상태 머신 | `ui/placement` 소유. `pointerType==='mouse'`: v1 그대로 (hover 프리뷰 + 클릭 확정 — 회귀 금지). `'touch'|'pen'`: **1탭 = 해당 타일 프리뷰 고정(고스트+사거리+가부 색), 동일 타일 2탭째 = `ui:build-requested` 발행, 다른 타일 탭 = 프리뷰 이동** (AC-33) | ui-dev |
| 취소 수단 | `#btn-cancel-placement`(§7) — 배치 모드 중에만 노출. ESC·우클릭(`input:cancel`) 유지 + 상점 동일 카드 재탭 = 취소 (ui 내부 결합 — §1 예외) | ui-dev |
| 세로 레이아웃 | **CSS만으로**: HUD 상단 / #stage 중앙 (캔버스 `max-width:100%` 종횡비 유지 축소) / 상점 하단. 기준 390×844에서 스크롤·잘림 없이 전 조작 가능 (AC-34). 터치 타깃 ≥ 44×44 CSS px. `#tower-panel` 뷰포트 내 클램프 | ui-dev |
| 터치 CSS | 캔버스/#stage `touch-action: none` (스크롤·더블탭 줌 차단), 버튼류 `touch-action: manipulation`. viewport 메타는 index.html에 기존재 | ui-dev |
| 성능 프리셋 | `matchMedia('(pointer:coarse)')`로 파티클 상한 등 하향 — **권장이며 계약 아님** | fx-dev |

---

## 12. 배포 계약 (v2.0 — D12, GitHub Pages)

- 대상: `https://revfactory.github.io/tower-defense/` (서브패스 서빙). 로컬 `python3 -m http.server 8000`과 **같은 코드**로 동작해야 한다 (분기 금지).
- **상대 경로만**: HTML `src/href`, CSS `url()`, JS `import`·`fetch`(아틀라스 JSON 포함) 전부 선행 `/` 금지. `window.location` 기반 URL 조립 금지.
- **감사 게이트 (qa-engineer, AC-36)** — 결과 0건이 통과 조건:
  ```
  grep -rEn '(src|href)="/|url\(/|fetch\(["'"'"']/|import\(["'"'"']/|from ["'"'"']/' index.html css src assets/manifest.js
  ```
- 루트 `.nojekyll` 필수 (v2.0 개정에서 생성 완료 — architect 소유). `_workspace/` 등 언더스코어 경로에 대한 Jekyll 간섭 차단.
- **대소문자**: 파일명·매니페스트 키·코드 내 경로 문자열 전부 소문자 snake_case. Pages는 대소문자를 구분한다 — macOS 로컬에서만 통과하는 경로는 배포에서 404.
- Pages 활성화(리포 public 전환 또는 설정)는 **사용자 조치** — 미조치 시 AC-36은 조건부 처리 (GDD §12.5).

---

## 13. v2 게임플레이 불변 경계 (D11) — "데이터·렌더만으로 시각 개선"

밸런스는 v1 맵 기하에 맞춰 튜닝 종결(GDD 이력 D9-1) — 아래 불변량을 깨는 변경은 밸런스 회귀 전체를 무효화한다.

**불변 (QA가 v1 데이터와 diff 대조 — AC-32):**
- `LEVEL.waypoints` 문자 단위 동일: `(0,2)→(4,2)→(4,7)→(8,7)→(8,2)→(12,2)→(12,5)→(14,5)`
- PATH 타일 집합 28개 동일 / `grid.js`·`path.js` 로직 동일
- **킬존 타일 GRASS 유지** — A: col5~7 × row3~6, B: col9~11 × row3~4, 보너스 (13,4) — 신규 DECO 전환 금지
- 신규 DECO 전환(장식 추가)은 **모든 PATH 타일에서 체비쇼프 거리 ≥ 2**인 타일에만 허용 ("외곽 한정"의 계량화 — QA가 기계 판정 가능)

**허용 (시각 개선의 전 수단 — 이 안에서는 wave-balancer 재검증 불요):**
- `tilemap.js` 렌더 로직: 잔디 변형 결정적 해시 선택, 길 방향(직선 h/v·코너 4종) 인접 관계 판별 (§4.5-v2)
- `levels.js`의 `decoTiles` 데이터 + 대응 tiles의 GRASS→DECO 전환 (위 불변 준수 시)
- §5.4 신규 에셋 키

경계를 넘어야 하는 요구가 생기면 구현하지 말고 architect 이의 절차로 가져온다.

---

## 14. v3 흐름 계약 — 스테이지 진입·점수·영속 (D13~D18)

이 절은 §3.10 이벤트들이 **어떤 순서로 엮여 한 판을 구성하는지**를 확정한다. 구현자는 이 순서에 문자 단위로 맞춘다. 핵심 설계 원칙: **기존 `game:started` 리셋 경로를 파괴하지 않고, 그 앞에 스테이지 컨텍스트 주입(`stage:started`)을, 그 뒤에 점수 확정 캐스케이드(`score:finalized`→영속)를 겹쳐 쌓는다.**

### 14.1 스테이지 진입 오케스트레이션 (main 소관, engine-dev)

```
[stage-select] .stage-card 클릭 (해금된 카드만)
   → ui/stageselect: emit('ui:stage-selected', {stageIndex})
   → main 수신:
       1. state = 'playing'
       2. const level = LEVELS[stageIndex]
       3. initGrid(level) → initPath(level) → buildBackground(level)   // main→map 직접 호출(허용, §1)
       4. emit('stage:started', {stageIndex, stageId: level.id})        // 컨텍스트 브로드캐스트 — game:started보다 먼저
            · economy: STAGE_BALANCE[stageId] 캐시 (startGold/startLives)
            · waves:   STAGE_WAVES[stageId] 캐시 + hpScale 캐시
            · score:   stageIndex 캐시
            · ui/hud:  스테이지명 표시
       5. emit('game:started', {})                                      // 기존 리셋 신호(불변)
            · economy: 캐시된 시작 자원으로 리셋 (기존 경로)
            · waves/combat/fx/ui: 기존 리셋
            · score: 누적 0 리셋
```

- **순서 불변식:** `initGrid/Path/Background`(3) → `stage:started`(4) → `game:started`(5). economy가 `stage:started`에서 컨텍스트를 캐시한 뒤 `game:started`에서 리셋하므로, 두 이벤트를 같은 콜스택에서 순차 emit하면 구독 등록 순서와 무관하게 결정적이다.
- **재도전(`ui:restart-requested`):** main이 캐시한 현재 stageIndex로 위 2~5를 반복(스테이지 선택 화면 경유 없이 즉시 재진입). 결과 화면의 "재도전" 버튼 경로.
- **스테이지 선택 복귀(`ui:stage-select-requested`):** state='stage-select', 진행 중 게임은 정지(update 게이트가 `state==='playing'`만 통과 — 기존 코드). 진행 중 나가기는 그 판을 포기(점수 미확정) — `score:finalized` 발행 안 함.
- **map 재초기화 안전성:** `initGrid/initPath/buildBackground`는 이미 `level` 인자를 받는 재호출 가능 함수(현 구현 확인). grid 점유 원장은 initGrid가 재설정, combat의 towers/enemies/projectiles/zones 배열은 `game:started`에서 비운다(기존).

### 14.2 점수 집계 (systems/score, engine-dev)

```
game:started    → score = 0 (리셋)
enemy:killed    → score += SCORING.killPoints[enemy.type];  emit('score:changed', {score, delta, source:'kill'})
wave:cleared    → score += 웨이브 점수(waveClearBonus·waveScale·index);  emit('score:changed', {score, delta, source:'wave'})
game:won {livesLeft}  → life = livesLeft × SCORING.lifeBonusPerLife
                        emit('score:finalized', {stageIndex, outcome:'won', kill, wave, life, total})
game:over             → life = 0
                        emit('score:finalized', {stageIndex, outcome:'over', kill, wave, life, total})
```

- score는 **kill 소계·wave 소계를 각각 누적**(라이프 보너스와 분리)해 `score:finalized`에서 요소별로 분해 보고(AC-46). `total = kill + wave + life`.
- score는 economy와 동일하게 **읽기 API 없이 이벤트 구독으로만** 동작. 판매·업그레이드 이벤트 미구독(점수 무영향 — GDD §13.2).
- **`score:finalized`는 판당 정확히 1회.** main이 `game:won`/`game:over`를 판당 1회만 emit(state 가드)하므로 보장된다.

### 14.3 영속 캐스케이드 (systems/progress → core/storage, engine-dev)

```
[부트스트랩] progress.init(): storage.loadSave() → SaveState (항상 유효, §4.11 폴백)
             → ui/stageselect·screens가 getUnlockedCount()·getBestScore(i) 읽기

[판 종료] score:finalized {stageIndex, outcome, total} 수신 (progress 구독):
   1. isNewBest = total > bestScores[stageIndex]
   2. if (isNewBest) bestScores[stageIndex] = total
   3. if (outcome==='won' && stageIndex+1 === unlockedCount && unlockedCount < 5)
          unlockedCount += 1; newlyUnlocked = true
   4. if (isNewBest || newlyUnlocked) storage.saveSave(state)   // 변경 있을 때만 1회 저장
   5. emit('stage:record-updated', {stageIndex, best: bestScores[stageIndex], isNewBest})
   6. if (newlyUnlocked) emit('stage:unlocked', {stageIndex: stageIndex+1})
```

- **해금 규칙(D14):** 스테이지 N 클리어(`outcome==='won'`) 시 N+1 해금. `unlockedCount`는 단조 증가·최대 5·최소 1. 이미 클리어한 스테이지 재클리어는 해금을 재발생시키지 않음(조건 `stageIndex+1 === unlockedCount`).
- **읽기 API (progress 공개, ui가 소비):** `getUnlockedCount()`→1~5, `getBestScore(stageIndex)`→정수, `isUnlocked(stageIndex)`→`stageIndex < unlockedCount`.
- **AC-40/47/48 판정:** 새로고침 후 `window.GAME.progress`가 저장된 값을 반영하면 AC-40/47 통과. localStorage 삭제/손상 후에도 `{unlockedCount:1, bestScores:[0…]}`로 크래시 없이 부팅되면 AC-48 통과.

---

## 15. v3 게임플레이 불변 경계 (D13/D15/D16) — "그릇·척도만 추가, 룰 불변"

v3은 기존 한 판의 룰을 바꾸지 않는다(GDD §13 불변 원칙). 아래를 깨는 변경은 v1/v2 밸런스·QA 회귀 전체를 무효화한다.

**불변 (QA 대조 — AC-41/42):**
- **LEVELS[0]**(crystal_valley)의 `waypoints`·`tiles`·`decoTiles`는 v2 `LEVEL`과 문자 단위 동일. §13 D11 불변량(waypoints 8점·PATH 28타일·킬존 A/B/(13,4))이 LEVELS[0]에도 그대로 적용.
- **STAGE_WAVES.crystal_valley === WAVES**(§4.3, 길이 10 불변), **STAGE_BALANCE.crystal_valley = {startGold:120, startLives:20, hpScale:1.0}** — 스테이지 1은 v2 밸런스와 동일해야 AC-37 회귀가 유지된다.
- **이벤트 36종·데이터 스키마 §4.1~4.6·에셋 42키** 불변. v3 신규는 §3.10·§4.7~4.11·§5.5(키 0개)에 격리.
- **각 스테이지 독립 한 판(D15):** 스테이지 간 골드·타워·라이프 이월 없음. `game:started`가 매 진입 시 전 상태를 리셋. 점수도 스테이지 독립(진입 시 0).
- **웨이브 수 10 고정(D16):** 모든 STAGE_WAVES 원소 길이 10. 난이도는 `hpScale`·웨이브 조합·경로 기하로만 상승.

**허용 (v3 확장의 전 수단):**
- `LEVELS[1..4]` 신규 데이터(waypoints·tiles·tint), `STAGE_WAVES[비1]`·`STAGE_BALANCE[비1]` 신규 수치, `SCORING` 값.
- `stage:started`로 economy/waves가 활성 컨텍스트를 캐시하는 결합(§14.1) — 신규 이벤트 위 결합이므로 기존 불변.
- 신규 모듈(storage/score/progress/stageselect/scoring)과 §3.10 이벤트.

스테이지 1(crystal_valley) 밸런스·기하를 건드려야 하는 요구가 생기면 구현하지 말고 architect 이의 절차로 가져온다 — 그것은 v3 범위 밖(D13 위반)이다.

---

## 계약 변경 이력

| 버전 | 날짜 | 변경 | 영향 에이전트 |
|---|---|---|---|
| v3.0 | 2026-07-08 | GDD v3.0(§13, D13~D18, AC-38~48) 반영 개정 — **추가만, 기존 불변.** ① §4.7 `LEVELS` 배열 5개(LEVELS[0]=crystal_valley 불변·별칭 `LEVEL` 유지, 신규 4개, 선택 필드 `tint`) ② §4.8 `STAGE_WAVES`(스테이지 id→WaveDef[10], crystal_valley=WAVES 재사용) ③ §4.9 `STAGE_BALANCE`(startGold/startLives/hpScale, BALANCE의 sellRatio·interWaveCountdown은 전역 불변) ④ §4.10 `src/data/scoring.js` 신설 `SCORING`(killPoints·waveClearBonus·waveScale·lifeBonusPerLife) ⑤ §4.11 영속 스키마(`crystal_guard.v1` 단일 키, `{version, unlockedCount, bestScores[5]}`, 폴백·정규화 — AC-48) ⑥ §3.10 이벤트 7종 추가(36→**43**): `ui:stage-select-requested`/`ui:stage-selected`/`stage:started`/`score:changed`/`score:finalized`/`stage:record-updated`/`stage:unlocked`. 기존 36종·페이로드 불변 ⑦ §14 흐름 계약 신설(진입 오케스트레이션 stage:started→game:started 순서, 점수 집계, 영속 캐스케이드) ⑧ §15 v3 불변 경계(LEVELS[0]·스테이지1 밸런스·10웨이브·독립 한 판) ⑨ 신규 모듈 4개 뼈대: `core/storage.js`(engine)·`systems/score.js`(engine)·`systems/progress.js`(engine)·`ui/stageselect.js`(ui), score.js 소유=engine-dev 결정(§6-v3) ⑩ §7 DOM: `#screen-stage-select`(`.stage-card[data-stage]`)·`#hud-score`·결과화면 스테이지복귀 버튼, index.html에 컨테이너 추가 ⑪ §8 상태머신 `'stage-select'` 추가·승리판정 total 데이터 기반·window.GAME에 stageIndex/score/progress/data.LEVELS 등 ⑫ §5.5 에셋 판정: **신규 매니페스트 키 0개**(맵=기하+tint 재조합, 카드=미니맵 렌더 — D17) | **전원** — map-designer(①⑮ LEVELS[0] 복사 불변+신규 4개 waypoints/tiles/tint), wave-balancer(②③④ STAGE_WAVES/STAGE_BALANCE/SCORING 수치+AC-44 난이도밴드+sim 스테이지 회귀), engine-dev(⑤⑥⑦⑨⑪ storage/score/progress/main 오케스트레이션·상태머신·window.GAME), ui-dev(⑥⑦⑩ stageselect 화면·screens 점수분해/신기록·hud 점수·세로 5카드), fx-dev(⑥ score:changed 팝·신기록 연출 선택), audio-dev(⑥ 신기록/해금 징글 선택), asset-artist(⑫ 맵 타일 추가 없음), qa-engineer(AC-38~48 게이트+LEVELS[0]/스테이지1 회귀 대조) |
| v2.0 | 2026-07-06 | GDD v2.0(§12, D7~D12) 반영 개정. ① §5 에셋 키 18→**42** (타워 `tower_{type}_lv1~3` 12키 신설·v1 타워 4키 폐지 / 적 걷기 쌍 5키 `{img, atlas}` 객체 형식 / 잔디 변형 2·길 방향 7·장식 3 추가). 매니페스트 값 형식 확정: 애니메이션은 `{img, atlas}` 명시(로더 probe 금지). `assets/reference/` 신설(런타임 미사용) ② §10 애니메이션 계약 신설 — 아틀라스 JSON 형식, `getAnim` 강등 체인(합성 단일 프레임 아틀라스), 개체 누적 시간 프레임 선택, 회전 방향 표현 ③ §4.1-v2 스키마 확장 — `assetKeys[3]`(v1 `assetKey` 폐지), `levels[i]`의 선택 `splashRadius`/`slow` 오버라이드(Lv2 축), `mechanism` 블록(4 type union: rapid_volley/burning_ground/frost_nova/overcharge — 필드·공식·구속 확정) ④ §3.9 이벤트 3종 추가(33→**36**): `zone:created`/`zone:expired`/`frost:nova` + `input:click/move`에 비파괴 선택 필드 `pointerType`. zone 틱 피해 이벤트 미발행 확정 ⑤ §11 모바일 계약 신설 — Pointer Events 단일 경로, DPR≤2(논리 좌표계 960×640 불변), 터치 1탭 프리뷰/2탭 확정(placement 소유), `#btn-cancel-placement`(§7 추가) ⑥ §12 배포 계약 신설 — 상대 경로 감사 게이트, `.nojekyll` 생성, 소문자 snake_case ⑦ §13 D11 불변 경계 신설 — waypoints·PATH 28타일·킬존(A/B/(13,4)) 불변, 신규 DECO는 PATH에서 체비쇼프 ≥2, `decoTiles` 스키마(§4.5-v2) ⑧ `src/entities/zone.js` 뼈대 신설(entity-dev 소유), 엔티티 레이어 순서에 zone 삽입, window.GAME에 zones 추가 | **전원** — entity-dev(③④ zone/메커니즘/애니 프레임), wave-balancer(③ 수치+AC-37 회귀), asset-artist(①§5 42키+reference), map-designer(⑦ decoTiles·tilemap 방향/변형 렌더), engine-dev(②④⑤ getAnim/DPR/Pointer), ui-dev(⑤ 상태 머신·세로 CSS·취소 버튼·패널 메커니즘 텍스트 AC-28), fx-dev(④ zone/nova 연출), audio-dev(④ 신규 이벤트 SFX — 선택), qa-engineer(AC-23~37 게이트) |
| v1.0 | 2026-07-03 | 최초 확정 (그리드 15×10/64px, 캔버스 960×640 필드 전용, UI=DOM 하이브리드, 이벤트 33종, 에셋 18키) | 전원 |
| v1.2 | 2026-07-03 | QA 관찰 O-3~O-5 반영 (05_qa_report 회차 8) — 전건 기존 구현 추인, 코드 변경 없음. ① §3.2/§3.3 main의 listen-only 구독 2건 명시: `wave:started`(waveReached 집계), `enemy:killed`(kills 집계) — §3.1 승패 페이로드가 요구하는 결합 (main.js:77-83 확인). ② §1 읽기 화살표 추가: `core/input`→`map/grid` (pxToGrid·TILE_SIZE, input.js:18 확인). ③ §1에 "동일 소유자 디렉토리 내부 직접 호출 허용" 명문화 (shop→placement의 enterPlacementMode/cancelPlacementMode 등 — 내부 API는 비계약), §3.8 `input:cancel` 구독 열 정정: ui/shop 추가·ui/panel 제외 (panel은 tower:deselected 경유 — shop.js:160, panel.js:166 확인). 이벤트 수·페이로드 변경 없음 (33종 유지) | engine-dev(①② 추인, 무조치), ui-dev(③ 추인, 무조치), qa-engineer(검증 기준 갱신) |
| v1.1 | 2026-07-03 | QA 요청 3건 반영 (05_qa_report 회차3 O-1/O-2, 회차4 D4-1). ① §1 systems 간 읽기 화살표 2건 명시: waves→combat.enemies, combat→economy.canAfford — 기존 구현 추인, 코드 변경 없음. ② §3.4 `projectile:hit`의 `target`을 `Enemy\|null`로 확정 (null=비행 중 타겟 사망, damage=0) — 구독자 null 가드 의무화. ③ §3.5/§3.7 audio의 listen-only 구독 2건 승인: `tower:selected`, `ui:speed-changed` (클릭음). 주의: QA 리포트가 언급한 ui:start-requested/ui:restart-requested/ui:wave-start-requested 구독은 실코드(sound.js)에 존재하지 않아 반영하지 않음. 이벤트 수·페이로드 필드 변경 없음 (33종 유지) | entity-dev(①추인, 무조치), fx-dev(② null 가드 확인), audio-dev(②③), qa-engineer(검증 기준 갱신) |
