---
name: td-code-standards
description: "타워 디펜스 게임의 공통 코드 규약 — 디렉토리 구조, ES 모듈 규칙, 고정 타임스텝 게임 루프, 렌더 레이어, 이벤트 버스 계약, 엔티티 인터페이스, 좌표계, 에셋 로더 폴백. 이 프로젝트의 src/ 아래 JS 코드를 작성·수정하는 모든 작업 전에 반드시 읽을 것. 게임 코드 구현, 모듈 추가, 리팩토링, 버그 수정 요청 시 사용."
---

# TD Code Standards — 캔버스 게임 코드 규약

이 프로젝트의 모든 게임 코드가 따르는 규약. 여러 에이전트가 병렬로 구현해도 조립되도록 경계 규칙을 통일한다.

## 기술 스택 원칙

- **바닐라 JS + ES 모듈만 사용한다.** 빌드 도구(webpack/vite)·프레임워크·외부 라이브러리 금지. 이유: 산출물이 `index.html` 하나로 실행되어야 하고, 여러 에이전트가 빌드 설정 충돌 없이 병렬 작업할 수 있어야 한다.
- ES 모듈은 `file://`에서 CORS로 차단된다. 실행은 반드시 로컬 서버로: `python3 -m http.server 8000`

## 배포 호환 (GitHub Pages)

이 게임은 GitHub Pages(`https://{user}.github.io/{repo}/`)에서 그대로 동작해야 한다:

- **모든 리소스 경로는 상대 경로만.** 선행 `/`(도메인 루트) 금지 — Pages는 서브패스에서 서빙되므로 `/assets/...`는 404가 된다. `assets/...`, `./src/...` 형태만 사용.
- fetch로 JSON(아틀라스 등)을 읽을 때도 상대 경로. `window.location` 기반 URL 조립 금지.
- 리포지토리 루트에 `.nojekyll` 파일 필수 — 없으면 Jekyll이 `_workspace/` 같은 언더스코어 경로를 제외하고 빌드 과정에서 예측 불가한 간섭이 생긴다.
- 로컬 서버에서 되는데 Pages에서 깨지면 원인의 대부분은 ①절대 경로 ②대소문자 불일치(Pages는 대소문자 구분)다.
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
| 1.5 | terrain-anim | 움직이는 지형 요소 (애니메이션 장식) | v3 — "지형 레이어 규약" 참조, 맵당 소수만 |
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

## 모바일/터치 규약

- **입력은 Pointer Events로 통합한다** (`pointerdown/move/up`) — 마우스·터치·펜을 한 코드로 처리. touchstart/mousedown 이중 처리는 고스트 클릭을 만든다.
- **hover에 기능을 걸지 않는다.** 터치에는 hover가 없다 — 배치 미리보기는 "1탭=위치 미리보기(고스트+사거리), 2탭(같은 타일)=확정, 다른 타일 탭=미리보기 이동"으로 동작해야 한다. 취소는 명시적 버튼/바깥 탭.
- 캔버스는 CSS로 반응형 축소(`max-width:100%; height:auto`), 내부 해상도는 논리 크기 × `devicePixelRatio`(상한 2)로 설정하고 컨텍스트를 스케일한다 — 저해상도 흐림과 고해상도 과부하를 동시에 피한다. 입력 좌표는 CSS 스케일을 역보정한다.
- `<meta name="viewport" content="width=device-width, initial-scale=1">` + 게임 영역 `touch-action: none`(스크롤/더블탭 줌 차단), UI 버튼은 `touch-action: manipulation`.
- 터치 타깃(버튼·상점 카드)은 최소 44×44 CSS px.
- 세로 화면에서는 HUD(상단)-캔버스(중앙 스케일)-상점(하단 고정) 스택을 유지하고 가로 스크롤을 만들지 않는다.
- 모바일 성능: 파티클 동시 상한 등 강도 상수는 이미 모듈 상단에 있다 — 필요 시 `matchMedia('(pointer:coarse)')`로 모바일 프리셋을 적용한다.

## 스프라이트 애니메이션 규약

- 애니메이션 에셋은 **균일 프레임 가로 스트립 PNG + 동일 basename의 아틀라스 JSON** 쌍이다 (td-asset-pipeline이 생산). 아틀라스는 멀티 시퀀스를 담을 수 있다:
  `{ "frameW":128, "frameH":128, "frames":8, "fps":8, "sequences":{"idle":[0,1,2,3],"attack":[4,5,6,7]} }`
- 로더(`core/assets.js`)가 쌍을 로드해 `getAnim(key)` → `{image, atlas}`를 반환한다. 아틀라스가 없거나 로드 실패면 단일 이미지/플레이스홀더로 강등 — draw 호출부는 구분하지 않는다. **시퀀스 폴백:** 요청한 시퀀스가 아틀라스에 없으면 첫 번째 시퀀스로 강등한다 — 정적 이미지에서 강등된 1프레임 아틀라스에서도 `idle`/`attack` 요청이 안전해야 한다.
- 프레임 선택은 엔티티가 자신의 누적 시간으로 계산한다: `frame = seq[floor(t * fps) % seq.length]`. 전역 타이머 공유 금지 — 개체마다 위상이 달라야 자연스럽다. 개체 생성 시 위상을 랜덤 오프셋으로 초기화하면 같은 타워 여러 개가 동기 맥동하는 부자연스러움을 없앤다.
- 이동 방향 표현은 스프라이트 회전으로 한다(탑다운이므로 진행 각도로 rotate). 4방향 시트는 만들지 않는다 — 시트 수를 4배로 늘릴 가치가 없다.
- 타워 레벨별 외형 키: `tower_{type}_lv{1..3}` — v3에서 `{img, atlas}` 쌍(idle/attack 시퀀스)으로 승격 가능. 승격 여부는 매니페스트가 판별 근거다(로더는 probe하지 않는다).

## 엔티티 애니메이션 상태 머신 (v3)

엔티티는 시퀀스 상태를 소유한다 — 어떤 시퀀스를 언제 재생할지는 엔티티 로직이고, 프레임 추출은 로더/아틀라스 몫이다:

- **타워:** 평시 `idle` 루프. 발사 순간 `attack`을 **1회 재생(one-shot)** 후 `idle` 복귀. attack 재생 속도는 발사 쿨다운과 무관하게 아틀라스 fps를 따른다 — 쿨다운에 맞춰 늘이면 연사 타워의 모션이 굼떠 보인다. one-shot 중 재발사 시 attack을 처음부터 재시작.
- **적:** `walk` 루프 (v2와 동일). 이동 속도 배율(슬로우)에 fps를 비례시키면 발이 미끄러지지 않는다.
- **one-shot 구현 규약:** 시퀀스 전환 시 로컬 타이머를 0으로 리셋하고, one-shot은 마지막 프레임 도달 시 기본 시퀀스로 복귀한다. 시퀀스 상태는 `update(dt)`에서만 바꾼다 — `draw`는 상태 변경 금지 원칙 그대로.

## 진화(레벨업) 변신 연출 (v3)

레벨업 시 이미지가 순간 교체되면 변화를 놓친다. 변신은 **에셋이 아니라 코드 연출**로 만든다 — 전용 변신 시트는 만들지 않는다(레벨 조합 수만큼 시트가 폭증하고, 이미지 모델이 두 외형의 중간 형태를 일관되게 그리지 못한다):

- 트리거는 기존 `tower:upgraded` 이벤트 그대로 — 페이로드·이벤트 추가 없이 fx/entity가 구독으로 연출한다.
- **entity 측:** 구/신 스프라이트 크로스페이드(약 0.4s) + 스케일 펀치(1.0→1.15→1.0). 연출 중에도 전투 로직(타겟팅·발사)은 즉시 신규 레벨 수치로 동작한다 — 연출이 게임플레이를 지연시키면 안 된다.
- **fx 측:** 광기둥/글로우 버스트 + 상승 파티클. additive 합성, 화면 셰이크는 금지(레벨업은 잦은 이벤트다 — 피로 유발).
- 연출 상수(지속시간·스케일 배율)는 모듈 상단 상수로 — playtester 피드백에 즉시 조정 가능해야 한다.

## 지형 레이어 규약 (v3)

- 배경 타일은 여전히 **오프스크린 캐시 1회 렌더**가 원칙이다(레이어 1). 지형 다양화(타일 패밀리·전이 타일·장식 밀도)는 캐시 생성 시점에 모두 굽는다.
- **움직이는 지형 요소**(반짝이는 수정, 흔들리는 나뭇잎, 물 글린트)는 배경 캐시에 넣지 않는다 — 캐시를 매 프레임 다시 구우면 캐시의 의미가 없다. 별도의 **지형 애니메이션 레이어**(레이어 1.5: background 위, entities 아래)에 개별 draw한다. 대상 수는 맵당 소수(장식 2~3종)로 제한 — 화면 전체가 꿈틀대면 유닛 가독성이 죽는다.
- 물 반짝임 같은 면 단위 효과는 애니메이션 타일 시트 대신 fx의 코드 오버레이(글린트 파티클)로 처리한다 — seamless 타일 애니메이션은 에셋 실패율이 높다.
- 타일 패밀리·전이 타일의 종류와 배치 규칙은 `src/data/levels.js`의 선언 데이터와 tilemap 로직이 소유한다 (map-designer).

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
5. **완료 통지 = 최종 저장 직후 게이트 재실행 결과.** 자체 게이트(`node --check`, `node scripts/sim.mjs`, 헤드리스 스모크 등)를 가진 모듈은, 마지막 저장 뒤 그 게이트를 다시 돌려 통과(exit 0)를 눈으로 확인하고 그 출력을 보고에 인용한다. 튜닝·수정 도중의 중간 측정값이나 별도 계측 하네스 결과로 완료를 선언하지 않는다 — 계측 경로와 실게임 경로가 어긋날 수 있다. 이유: "자체 게이트 red인데 완료 마킹"이 v2 D16-2·v3 D24-1로 반복되어 QA 재작업·라운드 지연을 낳았다. 저장→게이트 재실행→인용 순서가 재현·추적 비용을 없앤다.
6. **`src/entities/`·`src/systems/` 변경은 `node scripts/sim.mjs` exit 0도 게이트에 포함한다** — 담당 모듈이 아니어도. 이유: sim은 update 경로만 실행하는 헤드리스 환경이라, 엔티티 변경이 update에 DOM·에셋 로더 의존을 끌어들이면 sim만 깨진다(v4 D35-1: update 핫패스의 getAnim 호출 → document 크래시). 같은 맥락의 불변식: **에셋 로더(get/getAnim)는 draw() 전유다 — update()는 타이머·시퀀스명 같은 순수 상태만 다룬다.**
