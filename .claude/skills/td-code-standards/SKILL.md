---
name: td-code-standards
description: "타워 디펜스 게임의 공통 코드 규약 — 디렉토리 구조, ES 모듈 규칙, 고정 타임스텝 게임 루프, 렌더 레이어, 이벤트 버스 계약, 엔티티 인터페이스, 좌표계, 에셋 로더 폴백. 이 프로젝트의 src/ 아래 JS 코드를 작성·수정하는 모든 작업 전에 반드시 읽을 것. 게임 코드 구현, 모듈 추가, 리팩토링, 버그 수정 요청 시 사용."
---

# TD Code Standards — 캔버스 게임 코드 규약

이 프로젝트의 모든 게임 코드가 따르는 규약. 여러 에이전트가 병렬로 구현해도 조립되도록 경계 규칙을 통일한다.

## 기술 스택 원칙

- **바닐라 JS + ES 모듈만 사용한다.** 빌드 도구(webpack/vite)·프레임워크·외부 라이브러리 금지. 이유: 산출물이 `index.html` 하나로 실행되어야 하고, 여러 에이전트가 빌드 설정 충돌 없이 병렬 작업할 수 있어야 한다.
- ES 모듈은 `file://`에서 CORS로 차단된다. 실행은 반드시 로컬 서버로: `python3 -m http.server 8000`
- 문법 검증: 각 파일 작성 후 `node --check <파일>` 실행. ES 모듈 오탐 시 `node -e "import('./src/파일.js')"` 사용.

## 디렉토리 구조

```
tower-defense/
├── index.html            # 단일 진입점
├── css/style.css
├── assets/
│   ├── manifest.js       # 에셋 키→경로 단일 출처 (architect 소유)
│   └── images/{towers,enemies,projectiles,map,ui}/
├── src/
│   ├── main.js           # 부트스트랩 + 상태 머신 (engine-dev)
│   ├── core/             # loop, renderer, input, events, assets (engine-dev)
│   ├── map/              # grid, path (map-designer)
│   ├── entities/         # tower, enemy, projectile (entity-dev)
│   ├── systems/          # combat, waves, economy (entity-dev / engine-dev)
│   ├── ui/               # hud, shop, placement, panels (ui-dev)
│   ├── fx/               # particles, floaters, flashes (fx-dev)
│   ├── audio/            # synth, sound (audio-dev)
│   └── data/             # towers, enemies, waves, balance, levels (wave-balancer / map-designer)
└── scripts/sim.mjs       # 헤드리스 밸런스 시뮬 (wave-balancer)
```

**소유권 규칙:** 각 디렉토리는 괄호 안 에이전트가 소유한다. 남의 파일에서 결함을 발견하면 직접 고치지 말고 담당자에게 리포트한다. 이유: 병렬 작업 중 동일 파일 동시 수정은 서로의 변경을 덮어쓴다.

## 좌표계·그리드 규격 (기본값)

- 타일 48px, 그리드 20열×13행 → 캔버스 960×624. system-architect가 계약 문서에서 조정 가능하며, 조정 시 계약 문서 값이 우선한다.
- 그리드 좌표는 `{col, row}`, 픽셀 좌표는 `{x, y}` (엔티티 중심점 기준). 변환 함수는 `src/map/grid.js`가 단일 소유: `gridToPx({col,row})`, `pxToGrid({x,y})`.

## 게임 루프 (고정 타임스텝)

```js
const STEP = 1 / 60;            // 초 단위 고정 스텝
let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min((now - last) / 1000, 0.25) * speedMultiplier; // 탭 복귀 스파이럴 방지 + 배속
  last = now;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  render();
  requestAnimationFrame(frame);
}
```

- `update(dt)`의 dt는 항상 STEP. 배속(1x/2x)은 누적량에 곱한다 — 물리가 프레임레이트·배속과 무관하게 결정적이어야 밸런스 시뮬과 실플레이가 일치한다.
- `render()`에서 게임 상태를 변경하지 않는다.

## 렌더 레이어 (아래→위)

| 순서 | 레이어 | 내용 | 비고 |
|---|---|---|---|
| 1 | background | 맵 타일 | 오프스크린 캔버스에 1회 캐시 |
| 2 | entities | 타워→적→투사체 순 | 매 프레임 |
| 3 | fx | 파티클, 플로팅 텍스트 | additive 합성 허용 |
| 4 | ui | HUD, 상점, 패널, 오버레이 화면 | DOM 오버레이 또는 최상위 캔버스 — 계약 문서가 하나로 확정 |

## 이벤트 버스 계약

`src/core/events.js`: `on(name, fn)`, `off(name, fn)`, `emit(name, payload)`. 모듈 간 결합은 **이벤트로만** 한다. 이유: fx/audio/ui를 통째로 빼도 전투가 돌아가는 구조가 병렬 개발과 부분 재실행을 가능하게 한다.

**표준 이벤트 (기본 계약 — architect가 계약 문서에서 확장):**

| 이벤트 | 페이로드 | 발행 | 주요 구독 |
|---|---|---|---|
| `game:started` / `game:over` / `game:won` | `{}` | main | ui, audio |
| `wave:started` | `{index, total}` | systems/waves | ui, audio |
| `wave:cleared` | `{index, bonus}` | systems/waves | ui, economy |
| `enemy:spawned` | `{enemy}` | systems/waves | — |
| `enemy:killed` | `{enemy, reward, x, y}` | entities | economy, fx, audio |
| `enemy:escaped` | `{enemy}` | entities | economy(라이프 차감), fx, audio |
| `projectile:hit` | `{target, damage, x, y, splash}` | entities | fx, audio |
| `tower:placed` / `tower:upgraded` / `tower:sold` | `{tower, cost|refund}` | systems | fx, audio, ui |
| `gold:changed` | `{gold, delta}` | systems/economy | ui |
| `lives:changed` | `{lives, delta}` | systems/economy | ui, fx |
| `ui:build-requested` | `{towerType, col, row}` | ui | systems |
| `ui:speed-changed` | `{multiplier}` | ui | main |

이벤트 추가·페이로드 변경은 system-architect 승인 후 계약 문서에 먼저 반영한다.

## 엔티티 인터페이스

모든 엔티티는 다음을 구현한다:

```js
class Entity {
  alive = true;          // false면 컬렉션에서 제거됨
  update(dt) {}          // 고정 스텝 로직
  draw(ctx) {}           // 상태 변경 금지
}
```

- 수치(HP, 데미지, 비용 등)는 생성자에서 `src/data/*`의 정의를 받아 초기화한다. 코드 내 매직 넘버 금지 — wave-balancer가 데이터만으로 튜닝할 수 있어야 한다.
- 제거는 `alive = false`로 표시하고 컬렉션 순회 후 일괄 필터링한다 (순회 중 splice 금지).

## 에셋 로더 폴백 계약

`src/core/assets.js`의 `get(key)`는 **항상 그릴 수 있는 것**을 반환한다:

1. 로딩 성공 → 이미지
2. 이미지가 불투명 배경(#FF00FF 크로마키) → 로드 시점에 캔버스로 픽셀 제거 후 반환
3. 로딩 실패/파일 없음 → 카테고리별 단색 플레이스홀더(타워=파랑 사각, 적=빨강 원, 투사체=노랑 점) + 콘솔 경고 1회

이유: 에셋 생성(asset-artist)과 코드 구현이 병렬로 진행되므로, 코드가 에셋 도착을 기다리면 안 된다. draw 호출부는 폴백을 신경 쓰지 않는다.

## 디버그 훅

`main.js`는 `window.GAME = { state, gold, lives, wave, towers, enemies, speed, ... }`를 노출한다. playtester(javascript_tool)와 qa-engineer의 유일한 내부 상태 접근 통로다. 프로덕션 제거 금지 — 이 게임의 프로덕션은 로컬 플레이다.

## 완료 기준 (모든 모듈 공통)

1. `node --check` (또는 import 검증) 통과
2. 계약 문서의 이벤트/시그니처와 문자 단위로 일치
3. 자기 모듈 없이도 게임이 크래시하지 않음 (fx/audio/ui에 해당)
4. 완료 보고에 공개 API·발행/구독 이벤트 목록 포함
