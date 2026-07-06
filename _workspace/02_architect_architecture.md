# 아키텍처 계약 문서 — 크리스탈 가드 (Crystal Guard)

- 작성: system-architect / 2026-07-03 (v2.0 개정 2026-07-06)
- 입력: `_workspace/01_director_gdd.md` (v2.0 — §12, D7~D12, AC-23~37), `td-code-standards` 스킬 (개정판 — 배포·모바일·애니메이션 규약)
- 상태: v2.0 확정 (계약 변경 이력 참조). **이 문서는 모든 모듈 경계의 단일 출처다. 여기 없는 결합은 버그로 간주한다.**
- 변경 절차: 인터페이스 변경이 필요하면 system-architect에게 요청 → 본 문서 갱신 + 영향 에이전트 통지 후에만 구현 변경.

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
│   │   └── assets.js        # 로더 + 플레이스홀더 폴백 + #FF00FF 크로마키 제거
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
│   │   ├── waves.js         # 스폰 스케줄, 카운트다운, 클리어 판정
│   │   └── economy.js       # 골드/라이프 원장 (쓰기는 이벤트 구독으로만)
│   ├── ui/
│   │   ├── hud.js           # 골드/라이프/웨이브/카운트다운/배속/음소거/웨이브시작
│   │   ├── shop.js          # 타워 4종 버튼, 골드 부족 비활성
│   │   ├── placement.js     # 배치 모드: 캔버스 고스트+사거리 원 (레이어 40)
│   │   ├── panel.js         # 타워 정보 패널 (업그레이드/판매)
│   │   └── screens.js       # 타이틀/승리/패배 오버레이
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
│       ├── waves.js         # WAVES (§4.3)
│       ├── balance.js       # BALANCE (§4.4)
│       └── levels.js        # LEVEL — 맵/경로 (§4.5)
└── scripts/sim.mjs          # 헤드리스 밸런스 시뮬 (브라우저 비의존)
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
- 순환 import 금지. `entities`가 `systems`를 import하지 않는다 (역방향만).

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

## 3. 이벤트 계약 표 (②) — 총 36개 (v1 33종 이름·기존 필드 불변 + v2 신규 3종 §3.9)

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

---

## 6. 모듈별 담당 에이전트 표 (⑤)

| 경로 | 담당 | 비고 |
|---|---|---|
| `index.html`, `assets/manifest.js`, `.nojekyll`(v2), 본 문서 | **system-architect** | 변경은 승인 절차 필수 |
| `css/style.css` | **ui-dev** | architect가 레이아웃 시드 제공, 이후 ui-dev 소유 |
| `src/main.js`, `src/core/*`, `src/systems/economy.js` | **engine-dev** | |
| `src/map/*`, `src/data/levels.js` | **map-designer** | |
| `src/entities/*`, `src/systems/combat.js`, `src/systems/waves.js` | **entity-dev** | |
| `src/ui/*` | **ui-dev** | |
| `src/fx/*` | **fx-dev** | 이벤트 구독만 (읽기 API 금지) |
| `src/audio/*` | **audio-dev** | 이벤트 구독만 (읽기 API 금지) |
| `src/data/towers.js, enemies.js, waves.js, balance.js`, `scripts/sim.mjs` | **wave-balancer** | 스키마(§4) 필드명 변경 불가 |
| `assets/images/**` (PNG + `*_walk.json` 아틀라스), `assets/reference/**`(v2) | **asset-artist** | 키·경로는 §5 고정, 아틀라스 형식은 §10, 파이프라인은 td-asset-pipeline v2 |

**소유권 규칙:** 남의 파일에서 결함 발견 시 직접 수정 금지 — 담당자에게 리포트 (td-code-standards).

---

## 7. index.html DOM ID 계약

playtester/qa-engineer가 셀렉터로 조작하므로 아래 ID·속성은 **고정**이다. 내부 구성은 ui-dev 재량.

| 셀렉터 | 역할 |
|---|---|
| `#app` | 전체 래퍼 (폭 960) |
| `#hud` | 상단 바. 내부: `#hud-gold`, `#hud-lives`, `#hud-wave`, `#hud-countdown`, `#btn-wave-start`, `#btn-speed`, `#btn-mute` |
| `#stage` | 캔버스 + 오버레이의 relative 컨테이너 |
| `#game-canvas` | 960×640 게임 캔버스 |
| `#shop` | 하단 상점 바. 타워 버튼: `.shop-item[data-tower="arrow|cannon|frost|arcane"]`, 비활성은 `disabled` 속성 |
| `#tower-panel` | 타워 정보 패널(floating). 내부: `#btn-upgrade`, `#btn-sell` |
| `#screen-title` / `#screen-victory` / `#screen-defeat` | 오버레이 화면. 버튼: `#btn-start`, `#btn-restart-victory`, `#btn-restart-defeat` |
| `#btn-cancel-placement` *(v2)* | 배치 모드 취소 버튼 — #stage 내, **배치 모드 중에만 노출** (모바일 필수 취소 수단 §11, 데스크톱 표시 무방) |
| 공통 | 숨김은 `.hidden` 클래스 토글 |

---

## 8. 코어 계약 (시그니처)

뼈대 파일의 JSDoc과 동일. 여기 요약만.

- **상태 머신 (main.js):** `'loading' → 'title' → 'playing' → 'victory' | 'defeat'` (+재시작 → playing). 승패 판정도 main: `wave:cleared`에서 `index === 10`이면 `game:won`, `lives:changed`에서 `lives <= 0`이면 `game:over`.
- **loop.js:** `STEP = 1/60`, `startLoop(update, render)`, `setSpeed(m)`. td-code-standards의 누적기 패턴 그대로 (스파이럴 캡 0.25초). 카운트다운도 update 안에서 흐르므로 배속의 영향을 받는다 (의도됨).
- **renderer.js:** `initRenderer(canvas)`, `registerLayer(order, drawFn)`, `render()`. 레이어 순서: **10=배경(tilemap), 20=엔티티(타워→지대(zone)→적→투사체 — v2), 30=fx, 40=캔버스 UI(고스트·사거리 원)**. `setCameraOffset(dx, dy)` — fx/flashes가 셰이크용으로 호출, 레이어 ≤30에만 적용. **(v2)** DPR 스케일: 내부 해상도 = 960×640 × `min(devicePixelRatio, 2)`, 컨텍스트 스케일로 **모든 drawFn은 논리 960×640 좌표 그대로** (§11).
- **assets.js:** `await loadAssets(MANIFEST)` → `{loaded, failed}`, `get(key)` → **항상 drawable**(Image|Canvas) 반환. 실패 시 §5 폴백 + 콘솔 경고 1회. draw 호출부는 폴백을 신경 쓰지 않는다. **(v2)** `getAnim(key)` → 항상 `{image, atlas}` — 강등 체인은 §10.
- **grid.js:** §2 변환 함수 + `tileAt(cell)`, `inBounds(cell)`, `isBuildable(cell)`(GRASS이고 미점유), `occupy(cell)`/`release(cell)` — 점유 원장은 grid가 단일 소유.
- **path.js:** `initPath(LEVEL)`, `positionAt(progress)` → `{x, y, done}` (progress px, done=도착), `getTotalLength()`.
- **디버그 훅 (main.js):** `window.GAME = { state, gold, lives, wave, speed, towers, enemies, projectiles, zones(v2), emit, data }` — playtester/qa의 유일한 내부 접근 통로. 제거 금지. AC-23·26·35의 수치 판정 경로.
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

## 계약 변경 이력

| 버전 | 날짜 | 변경 | 영향 에이전트 |
|---|---|---|---|
| v2.0 | 2026-07-06 | GDD v2.0(§12, D7~D12) 반영 개정. ① §5 에셋 키 18→**42** (타워 `tower_{type}_lv1~3` 12키 신설·v1 타워 4키 폐지 / 적 걷기 쌍 5키 `{img, atlas}` 객체 형식 / 잔디 변형 2·길 방향 7·장식 3 추가). 매니페스트 값 형식 확정: 애니메이션은 `{img, atlas}` 명시(로더 probe 금지). `assets/reference/` 신설(런타임 미사용) ② §10 애니메이션 계약 신설 — 아틀라스 JSON 형식, `getAnim` 강등 체인(합성 단일 프레임 아틀라스), 개체 누적 시간 프레임 선택, 회전 방향 표현 ③ §4.1-v2 스키마 확장 — `assetKeys[3]`(v1 `assetKey` 폐지), `levels[i]`의 선택 `splashRadius`/`slow` 오버라이드(Lv2 축), `mechanism` 블록(4 type union: rapid_volley/burning_ground/frost_nova/overcharge — 필드·공식·구속 확정) ④ §3.9 이벤트 3종 추가(33→**36**): `zone:created`/`zone:expired`/`frost:nova` + `input:click/move`에 비파괴 선택 필드 `pointerType`. zone 틱 피해 이벤트 미발행 확정 ⑤ §11 모바일 계약 신설 — Pointer Events 단일 경로, DPR≤2(논리 좌표계 960×640 불변), 터치 1탭 프리뷰/2탭 확정(placement 소유), `#btn-cancel-placement`(§7 추가) ⑥ §12 배포 계약 신설 — 상대 경로 감사 게이트, `.nojekyll` 생성, 소문자 snake_case ⑦ §13 D11 불변 경계 신설 — waypoints·PATH 28타일·킬존(A/B/(13,4)) 불변, 신규 DECO는 PATH에서 체비쇼프 ≥2, `decoTiles` 스키마(§4.5-v2) ⑧ `src/entities/zone.js` 뼈대 신설(entity-dev 소유), 엔티티 레이어 순서에 zone 삽입, window.GAME에 zones 추가 | **전원** — entity-dev(③④ zone/메커니즘/애니 프레임), wave-balancer(③ 수치+AC-37 회귀), asset-artist(①§5 42키+reference), map-designer(⑦ decoTiles·tilemap 방향/변형 렌더), engine-dev(②④⑤ getAnim/DPR/Pointer), ui-dev(⑤ 상태 머신·세로 CSS·취소 버튼·패널 메커니즘 텍스트 AC-28), fx-dev(④ zone/nova 연출), audio-dev(④ 신규 이벤트 SFX — 선택), qa-engineer(AC-23~37 게이트) |
| v1.0 | 2026-07-03 | 최초 확정 (그리드 15×10/64px, 캔버스 960×640 필드 전용, UI=DOM 하이브리드, 이벤트 33종, 에셋 18키) | 전원 |
| v1.2 | 2026-07-03 | QA 관찰 O-3~O-5 반영 (05_qa_report 회차 8) — 전건 기존 구현 추인, 코드 변경 없음. ① §3.2/§3.3 main의 listen-only 구독 2건 명시: `wave:started`(waveReached 집계), `enemy:killed`(kills 집계) — §3.1 승패 페이로드가 요구하는 결합 (main.js:77-83 확인). ② §1 읽기 화살표 추가: `core/input`→`map/grid` (pxToGrid·TILE_SIZE, input.js:18 확인). ③ §1에 "동일 소유자 디렉토리 내부 직접 호출 허용" 명문화 (shop→placement의 enterPlacementMode/cancelPlacementMode 등 — 내부 API는 비계약), §3.8 `input:cancel` 구독 열 정정: ui/shop 추가·ui/panel 제외 (panel은 tower:deselected 경유 — shop.js:160, panel.js:166 확인). 이벤트 수·페이로드 변경 없음 (33종 유지) | engine-dev(①② 추인, 무조치), ui-dev(③ 추인, 무조치), qa-engineer(검증 기준 갱신) |
| v1.1 | 2026-07-03 | QA 요청 3건 반영 (05_qa_report 회차3 O-1/O-2, 회차4 D4-1). ① §1 systems 간 읽기 화살표 2건 명시: waves→combat.enemies, combat→economy.canAfford — 기존 구현 추인, 코드 변경 없음. ② §3.4 `projectile:hit`의 `target`을 `Enemy\|null`로 확정 (null=비행 중 타겟 사망, damage=0) — 구독자 null 가드 의무화. ③ §3.5/§3.7 audio의 listen-only 구독 2건 승인: `tower:selected`, `ui:speed-changed` (클릭음). 주의: QA 리포트가 언급한 ui:start-requested/ui:restart-requested/ui:wave-start-requested 구독은 실코드(sound.js)에 존재하지 않아 반영하지 않음. 이벤트 수·페이로드 필드 변경 없음 (33종 유지) | entity-dev(①추인, 무조치), fx-dev(② null 가드 확인), audio-dev(②③), qa-engineer(검증 기준 갱신) |
