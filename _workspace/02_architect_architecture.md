# 아키텍처 계약 문서 — 크리스탈 가드 (Crystal Guard)

- 작성: system-architect / 2026-07-03
- 입력: `_workspace/01_director_gdd.md` (v1.0), `td-code-standards` 스킬
- 상태: v1.2 확정 (계약 변경 이력 참조). **이 문서는 모든 모듈 경계의 단일 출처다. 여기 없는 결합은 버그로 간주한다.**
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
| 타워 레벨 표기 | 레벨별 스프라이트 없음 — 코드가 배지/틴트로 그림 | GDD §3 공통 규칙. 에셋 키는 타워당 1개 |
| 실행 | `python3 -m http.server 8000` (file:// 불가) | ES 모듈 CORS |

---

## 1. 모듈 맵 (①)

```
tower-defense/
├── index.html               # 진입점 + DOM 컨테이너 (ID 계약 §7)
├── css/style.css            # 레이아웃 시드 (ui-dev가 확장·소유)
├── assets/
│   ├── manifest.js          # 에셋 키→경로 단일 출처 (architect 소유, §5와 1:1)
│   └── images/{towers,enemies,projectiles,map}/
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
│   │   ├── tower.js         # Tower 클래스 (타겟팅·발사·업그레이드)
│   │   ├── enemy.js         # Enemy 클래스 (이동·피해·슬로우·누수)
│   │   └── projectile.js    # Projectile 클래스 (비행·명중·스플래시)
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

## 3. 이벤트 계약 표 (②) — 총 33개

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
```

- 엔티티 공통 인터페이스는 td-code-standards 그대로: `alive` 플래그, `update(dt)`, `draw(ctx)`, 제거는 `alive=false` 후 일괄 필터.

---

## 5. 에셋 키 표 (④) — `assets/manifest.js`와 1:1, 총 18키

- 키 규칙: `카테고리접두사_이름`. 접두사가 플레이스홀더 폴백 모양을 결정한다.
- 폴백(assets.js): `tower_*`=파랑 사각 / `enemy_*`=빨강 원 / `proj_*`=노랑 점 / `tile_*`·`deco_*`·`goal_*`·`entrance_*`=단색 사각(잔디 초록/길 갈색/기타 회색).
- 모든 이미지: PNG, 투명 배경(불투명이면 #FF00FF 크로마키 — 로더가 제거). 밝은 카툰 판타지.
- **키 추가·변경은 architect 승인 필수.** 레벨별 타워 스프라이트는 없다 (레벨 표기는 코드 배지).

| 키 | 경로 (`assets/images/…`) | 드로우 크기 | 시각 컨셉 (GDD §3·4·5) |
|---|---|---|---|
| `tower_arrow` | `towers/tower_arrow.png` | 64×64 | 나무 망루 위 석궁, 갈색 목재, 탑다운 |
| `tower_cannon` | `towers/tower_cannon.png` | 64×64 | 돌 포탑 위 청동 대포, 회색 석재, 탑다운 |
| `tower_frost` | `towers/tower_frost.png` | 64×64 | 얼음 결정 소용돌이 푸른 수정 첨탑, 탑다운 |
| `tower_arcane` | `towers/tower_arcane.png` | 64×64 | 보라 부유 수정의 어두운 마법 첨탑, 자주색 발광, 탑다운 |
| `enemy_goblin` | `enemies/enemy_goblin.png` | 40×40 | 녹색 피부 누더기 고블린, 단검, 3/4뷰 |
| `enemy_orc` | `enemies/enemy_orc.png` | 48×48 | 어깨 갑주 회록색 오크 전사, 도끼, 3/4뷰 |
| `enemy_steel_brute` | `enemies/enemy_steel_brute.png` | 56×56 | 전신 강철 판금 거구, 투구 사이 붉은 눈, 3/4뷰 |
| `enemy_wasp_runner` | `enemies/enemy_wasp_runner.png` | 40×40 | 노랑-검정 줄무늬 사족 질주 실루엣, 3/4뷰 |
| `enemy_stone_golem` | `enemies/enemy_stone_golem.png` | 96×96 | 이끼 낀 바위 몸통 + 주황 용암 균열 거대 골렘, 3/4뷰 |
| `proj_arrow` | `projectiles/proj_arrow.png` | 20×20 | 화살 |
| `proj_cannonball` | `projectiles/proj_cannonball.png` | 20×20 | 검은 포탄 |
| `proj_frost_orb` | `projectiles/proj_frost_orb.png` | 20×20 | 냉기 구슬 |
| `proj_arcane_bolt` | `projectiles/proj_arcane_bolt.png` | 24×24 | 자주색 마탄 |
| `tile_grass` | `map/tile_grass.png` | 64×64 | 밝은 초록 잔디 타일 (타일링 가능) |
| `tile_path` | `map/tile_path.png` | 64×64 | 밟아 다져진 흙길 타일 (타일링 가능) |
| `deco_rock` | `map/deco_rock.png` | 64×64 | 바위 장식 (건설 불가 표식) |
| `goal_crystal` | `map/goal_crystal.png` | 96×96 | 하늘색 발광 수정 클러스터 (도착점) |
| `entrance_cave` | `map/entrance_cave.png` | 96×96 | 어두운 동굴 입구 |

- 오디오 에셋 없음 — audio-dev가 Web Audio로 전량 합성 (GDD §8).
- UI 전용 이미지 없음 — 상점 아이콘은 `tower_*` 재사용, 타이틀 로고는 CSS 텍스트.

---

## 6. 모듈별 담당 에이전트 표 (⑤)

| 경로 | 담당 | 비고 |
|---|---|---|
| `index.html`, `assets/manifest.js`, 본 문서 | **system-architect** | 변경은 승인 절차 필수 |
| `css/style.css` | **ui-dev** | architect가 레이아웃 시드 제공, 이후 ui-dev 소유 |
| `src/main.js`, `src/core/*`, `src/systems/economy.js` | **engine-dev** | |
| `src/map/*`, `src/data/levels.js` | **map-designer** | |
| `src/entities/*`, `src/systems/combat.js`, `src/systems/waves.js` | **entity-dev** | |
| `src/ui/*` | **ui-dev** | |
| `src/fx/*` | **fx-dev** | 이벤트 구독만 (읽기 API 금지) |
| `src/audio/*` | **audio-dev** | 이벤트 구독만 (읽기 API 금지) |
| `src/data/towers.js, enemies.js, waves.js, balance.js`, `scripts/sim.mjs` | **wave-balancer** | 스키마(§4) 필드명 변경 불가 |
| `assets/images/**` | **asset-artist** | 키·경로는 §5 고정 |

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
| 공통 | 숨김은 `.hidden` 클래스 토글 |

---

## 8. 코어 계약 (시그니처)

뼈대 파일의 JSDoc과 동일. 여기 요약만.

- **상태 머신 (main.js):** `'loading' → 'title' → 'playing' → 'victory' | 'defeat'` (+재시작 → playing). 승패 판정도 main: `wave:cleared`에서 `index === 10`이면 `game:won`, `lives:changed`에서 `lives <= 0`이면 `game:over`.
- **loop.js:** `STEP = 1/60`, `startLoop(update, render)`, `setSpeed(m)`. td-code-standards의 누적기 패턴 그대로 (스파이럴 캡 0.25초). 카운트다운도 update 안에서 흐르므로 배속의 영향을 받는다 (의도됨).
- **renderer.js:** `initRenderer(canvas)`, `registerLayer(order, drawFn)`, `render()`. 레이어 순서: **10=배경(tilemap), 20=엔티티(타워→적→투사체), 30=fx, 40=캔버스 UI(고스트·사거리 원)**. `setCameraOffset(dx, dy)` — fx/flashes가 셰이크용으로 호출, 레이어 ≤30에만 적용.
- **assets.js:** `await loadAssets(MANIFEST)` → `{loaded, failed}`, `get(key)` → **항상 drawable**(Image|Canvas) 반환. 실패 시 §5 폴백 + 콘솔 경고 1회. draw 호출부는 폴백을 신경 쓰지 않는다.
- **grid.js:** §2 변환 함수 + `tileAt(cell)`, `inBounds(cell)`, `isBuildable(cell)`(GRASS이고 미점유), `occupy(cell)`/`release(cell)` — 점유 원장은 grid가 단일 소유.
- **path.js:** `initPath(LEVEL)`, `positionAt(progress)` → `{x, y, done}` (progress px, done=도착), `getTotalLength()`.
- **디버그 훅 (main.js):** `window.GAME = { state, gold, lives, wave, speed, towers, enemies, projectiles, emit, data }` — playtester/qa의 유일한 내부 접근 통로. 제거 금지.
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

---

## 계약 변경 이력

| 버전 | 날짜 | 변경 | 영향 에이전트 |
|---|---|---|---|
| v1.0 | 2026-07-03 | 최초 확정 (그리드 15×10/64px, 캔버스 960×640 필드 전용, UI=DOM 하이브리드, 이벤트 33종, 에셋 18키) | 전원 |
| v1.2 | 2026-07-03 | QA 관찰 O-3~O-5 반영 (05_qa_report 회차 8) — 전건 기존 구현 추인, 코드 변경 없음. ① §3.2/§3.3 main의 listen-only 구독 2건 명시: `wave:started`(waveReached 집계), `enemy:killed`(kills 집계) — §3.1 승패 페이로드가 요구하는 결합 (main.js:77-83 확인). ② §1 읽기 화살표 추가: `core/input`→`map/grid` (pxToGrid·TILE_SIZE, input.js:18 확인). ③ §1에 "동일 소유자 디렉토리 내부 직접 호출 허용" 명문화 (shop→placement의 enterPlacementMode/cancelPlacementMode 등 — 내부 API는 비계약), §3.8 `input:cancel` 구독 열 정정: ui/shop 추가·ui/panel 제외 (panel은 tower:deselected 경유 — shop.js:160, panel.js:166 확인). 이벤트 수·페이로드 변경 없음 (33종 유지) | engine-dev(①② 추인, 무조치), ui-dev(③ 추인, 무조치), qa-engineer(검증 기준 갱신) |
| v1.1 | 2026-07-03 | QA 요청 3건 반영 (05_qa_report 회차3 O-1/O-2, 회차4 D4-1). ① §1 systems 간 읽기 화살표 2건 명시: waves→combat.enemies, combat→economy.canAfford — 기존 구현 추인, 코드 변경 없음. ② §3.4 `projectile:hit`의 `target`을 `Enemy\|null`로 확정 (null=비행 중 타겟 사망, damage=0) — 구독자 null 가드 의무화. ③ §3.5/§3.7 audio의 listen-only 구독 2건 승인: `tower:selected`, `ui:speed-changed` (클릭음). 주의: QA 리포트가 언급한 ui:start-requested/ui:restart-requested/ui:wave-start-requested 구독은 실코드(sound.js)에 존재하지 않아 반영하지 않음. 이벤트 수·페이로드 필드 변경 없음 (33종 유지) | entity-dev(①추인, 무조치), fx-dev(② null 가드 확인), audio-dev(②③), qa-engineer(검증 기준 갱신) |
