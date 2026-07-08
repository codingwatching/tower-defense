# QA 리포트 — 크리스탈 가드 (증분 기록)

- 작성: qa-engineer
- 기준 문서: `_workspace/02_architect_architecture.md` v1.0 (계약), `_workspace/01_director_gdd.md` v1.1 (AC-01~22)
- 심각도: P0 실행불가 / P1 핵심루프 파손 / P2 기능결함 / P3 사소

---

## [검증 회차 1] 대상: 뼈대 (index.html, css, manifest, src 스텁) — 2026-07-03

Wave A 병렬 작업 시작 전 선제 검증. **결함 0건.**

### 통과 항목

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 1-1 | 문법 게이트 | 통과 | `find src assets scripts -name "*.js" -o -name "*.mjs"` 전 28파일에 `node --input-type=module --check < $f` — 파스 에러 0건 |
| 1-2 | DOM ID 계약 §7 ↔ index.html | 통과 | 양쪽 대조: `#app`(14행), `#hud` + 내부 7종 `#hud-gold/#hud-lives/#hud-wave/#hud-countdown/#btn-wave-start/#btn-speed/#btn-mute`(15~23행), `#stage`(25), `#game-canvas` 960×640(26), `#tower-panel`+`#btn-upgrade`+`#btn-sell`(27~30), `#screen-title/victory/defeat`+`#btn-start/#btn-restart-victory/#btn-restart-defeat`(31~39), `#shop`+`.shop-item[data-tower]` 4종 arrow/cannon/frost/arcane(42~47) — 전 셀렉터 문자 단위 일치 |
| 1-3 | `.hidden` 공통 계약 | 통과 | css/style.css:46 `display:none !important` 정의. victory/defeat 초기 hidden, title 초기 표시 — 상태 머신과 정합 |
| 1-4 | 매니페스트 §5 ↔ assets/manifest.js | 통과 | 18키 전수 대조(타워4+적5+투사체4+맵5): 키명·경로 모두 계약 표와 문자 단위 일치. `manifest.js:10-36` |
| 1-5 | ES 모듈 진입점 | 통과 | index.html:50 `<script type="module" src="src/main.js">` — 계약 §0 실행 방식과 정합 |
| 1-6 | 그리드 상수 §2 ↔ grid.js 스텁 | 통과 | `src/map/grid.js:8-15` TILE_SIZE=64, COLS=15, ROWS=10, TILE={GRASS:0,PATH:1,DECO:2} — 계약 확정값 일치 |
| 1-7 | 스텁 JSDoc ↔ 계약 §8 시그니처 | 통과 | events.js(on/off/emit), grid.js(initGrid/gridToPx/pxToGrid/inBounds/tileAt/isBuildable/occupy/release), main.js(상태 머신·window.GAME 훅) — 계약 요약과 모순 없음 |

### 보류 (상대 모듈 미완성 — 완료 통지 시 재검증)

| # | 경계면 | 사유 |
|---|---|---|
| H-1 | 에셋 실파일 ↔ 매니페스트 경로 | `assets/images/{towers,enemies,projectiles,map}/` 4디렉토리 존재하나 파일 0건 — asset-artist 작업 중. 폴백 설계(AC-21)로 결함 아님. 완료 시 18키 전수 `ls` 대조 예정 |
| H-2 | 이벤트 emit↔on 집합 diff (33종) | src 전체가 `export {}` 스텁 — 구현 코드 없음. 각 모듈 완료 시 증분 대조 |
| H-3 | 데이터 스키마 §4 ↔ 소비 코드 | wave-balancer/entity-dev 미완 |
| H-4 | LEVEL.tiles PATH 집합 ↔ waypoints 경유 타일 | map-designer 미완 (계약 §4.5 명시 교차 검증 항목) |
| H-5 | map API 호출 시그니처 | entity-dev/ui-dev 미완 |
| H-6 | 통합 스모크 (콘솔 에러 0) | 실행 가능 코드 없음 |

---

## [검증 회차 2] 대상: 맵/경로 모듈 (map-designer 완료 통지) — 2026-07-03

대상: `src/map/grid.js`, `src/map/path.js`, `src/map/tilemap.js`, `src/data/levels.js`. **결함 0건.**
담당자 자체 테스트에 의존하지 않고 QA 독립 검증 스크립트를 별도 작성·실행함.

### 통과 항목

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 2-1 | 문법 게이트 | 통과 | 4파일 `node --input-type=module --check` 파스 에러 0건. tilemap 동적 import OK (exports: buildBackground, drawBackground) |
| 2-2 | LEVEL 스키마 §4.5 필드명 | 통과 | id/name/nameKo/cols/rows/tileSize/tiles/waypoints/entrance/goal 10필드 문자 단위 일치. 규격 15×10×64, tiles number[10][15], 값 도메인 {0,1,2} — 독립 스크립트 검증 |
| 2-3 | **tiles PATH 집합 == waypoints 경유 타일** (H-4 해소) | 통과 | QA 자체 재계산: 경유 집합 28타일 == PATH 집합 28타일, 차집합 양방향 0건. 전 구간 축 정렬. `qa-verify-map.mjs` (scratchpad) 47/47 통과 |
| 2-4 | 경로 기하 | 통과 | 총 길이 독립 재계산 1728px == getTotalLength(). 입구 waypoints[0] col=0, 도착 col=14, entrance==waypoints[0] (0,2), goal==waypoints[끝] (14,5) |
| 2-5 | path API §8 시그니처·경계값 | 통과 | positionAt(0)=(32,160,false) / (-50) 클램프 / (1728)=(928,352,**true**) / (99999) 클램프 done=true / 중간·코너 보간 정확 (128→(160,160), 576→(288,480)) |
| 2-6 | grid API §2·§8 | 통과 | gridToPx(3,5)=(224,352), pxToGrid 역변환·경계(63.9→0, 64→1), tileAt 범위 밖=DECO, isBuildable(GRASS/PATH/DECO/범위밖)=T/F/F/F, occupy→false→release→true 왕복 |
| 2-7 | 에셋 키 ↔ 매니페스트 | 통과 | tilemap.js:28-30,60,65의 get 호출 5종(tile_grass, tile_path, deco_rock, entrance_cave, goal_crystal) 전부 manifest.js:31-35에 존재. 실파일은 H-1 유지 |
| 2-8 | 의존 규칙 §1 | 통과 | map/* import: path←grid, tilemap←core/assets+grid — 허용 방향만. levels.js는 import 0건. 순환 없음 |
| 2-9 | 로드 시점 자체 검증 침묵 | 통과 | initGrid+initPath 실행 중 console.error 0건 (QA 스크립트가 포집 확인). 담당자 test-map.mjs 재실행 ALL PASS (출력 중 "PATH가 아닌 타일" 에러는 오류 검출 확인용 네거티브 케이스) |

### 보류 갱신

- H-4 **해소**. H-5는 map 측 시그니처 확정 완료 — entity-dev/ui-dev 완료 시 호출부만 대조하면 됨. H-1·H-2·H-3·H-6 유지.
- 정보 공유(결함 아님): 적 스폰 위치는 positionAt(0)=(32,160) 타일 중심 — 화면 안에서 등장. progress 음수는 클램프되므로 화면 밖 스폰 연출은 불가. entity-dev 설계 참고사항.

---

## [검증 회차 3] 대상: 전투 엔티티 (entity-dev 완료 통지) — 2026-07-03

대상: `src/entities/{enemy,tower,projectile}.js`, `src/systems/{combat,waves}.js` (+결합 상대 `systems/economy.js`, `core/events.js` 시그니처 확인). **결함 0건.**
QA 독립 헤드리스 테스트 `qa-verify-entity.mjs`(scratchpad, 51케이스) — 테스트 전용 타워/적 타입을 in-process 주입해 wave-balancer 데이터와 무관하게 결정적 검증.

### 통과 항목

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 3-1 | 문법 게이트 | 통과 | 5파일 파스 + 동적 import OK (economy/events 포함 9파일) |
| 3-2 | 이벤트 발행 14종 ↔ 계약 §3 | 통과 | wave:started{index,total}·wave:cleared{index,bonus}·wave:countdown{remaining}·enemy:spawned/boss:spawned{enemy}·enemy:killed{enemy,reward,x,y}·enemy:escaped{enemy,livesCost}·enemy:slowed{enemy,factor,duration}·tower:fired{towerType,x,y,target}·projectile:hit{target,damage,x,y,splashRadius}·tower:placed/upgraded{tower,cost}·tower:sold{tower,refund}·build:rejected{towerType,col,row,reason} — 코드 대조 + 런타임 페이로드 필드 검증 |
| 3-3 | 구독 6종 | 통과 | enemy:spawned, ui:build/upgrade/sell-requested, game:started×2, ui:wave-start-requested — combat.js:34-61, waves.js:35-41 |
| 3-4 | 건설 검증 분기 | 통과 | GRASS→placed(골드 차감), 점유→'occupied', PATH/DECO/범위밖/미정의타입→'tile', 부족→'gold' — reason 우선순위 tile→occupied→gold 확인 (B1~B9) |
| 3-5 | 런타임 엔티티 shape §4.6 | 통과 | Tower 9필드·Enemy 10필드(slowed getter 포함) 전부 존재, x/y 타일 중심 (B2, C3) |
| 3-6 | 전투 규칙 §8 | 통과 | 물리 max(1,dmg-armor)(G1~G2), 마법 armor 무시(G3), 슬로우 비중첩·강한 factor 유지·지속 max 갱신(G4~G5), 보스 slowResist 0.5→유효 0.75(G6, AC-15), 슬로우 이동 50%(G7)·만료 복귀(G8), 판정 range+radius(tower.js:119-120) |
| 3-7 | 웨이브 흐름 | 통과 | hpMultiplier 반영(C4), interval 스케줄(C5), 클리어 보너스(C9~C10), 카운트다운 3→2→1→0 정수 변경마다 중복 없이(D2)·0=자동 시작(D3), 진행 중 버튼 무시(D4, AC-22), 보스 이중 발행(E1), 미정의 적 스킵+게임 계속(E2), 누수 livesCost(E3~E5, AC-13), 누수 전멸도 클리어(E6, GDD v1.1), 마지막 웨이브 후 카운트다운 없음(E7) |
| 3-8 | 업그레이드/판매 | 통과 | invested 누계 50→90→150, Lv3 업그레이드 무시(upgradeCost null, AC-10), 환불 floor(150×0.7)=105, 판매 후 재건설 가능(release 선행, AC-11) (F1~F6) |
| 3-9 | 투사체 타겟 사망 엣지 | 통과 | 비행 중 타겟 사망 → 마지막 지점 도달, target=null 반환(H1~H2). combat.js:150-162 — 이때 projectile:hit damage=0 발행 (fx가 0을 숫자로 그리면 안 됨 — fx 검증 항목으로 이관) |
| 3-10 | 재시작 리셋 (AC-05) | 통과 | game:started → 컬렉션 3종 비움+타일 release+골드/라이프 리셋+웨이브 0 (I1~I2) |
| 3-11 | 의존 규칙 §1 | 통과 | entities는 systems 미import(역방향만), combat↛waves(순환 없음), 데이터 필드명 §4.1~4.4 전부 일치(damage/range/cooldown/levels[].cost/projectile.*/hp/armor/reward/livesCost/slowResist/radius/size/isBoss/hpMultiplier/bonus/groups.*/sellRatio/interWaveCountdown) |
| 3-12 | economy 원장 (결합 상대) | 통과 | canAfford 시그니처, 처치/보너스/판매 +골드, 건설/업그레이드 -골드, 누수 -라이프, 페이로드 NaN 방어(economy.js:96-99) — 런타임 정산 검증 (A1~A2, C10, E4, F4) |

### 관찰 (결함 아님 — system-architect에게 계약 문서 보완 요청)

- O-1: §1 읽기 화살표에 systems→systems 읽기(waves→combat.enemies, combat→economy.canAfford)가 명시돼 있지 않으나, §3.2 클리어 판정("생존 적 0")과 §3.5 reason 'gold'가 이 읽기를 요구함 — 구현은 계약 의도와 정합, 문서 명시 필요
- O-2: §3.4 projectile:hit의 target이 null일 수 있음(타겟 비행 중 사망 — 헛방 폭발 연출용)이 계약에 미기재. fx/audio가 target을 역참조하면 크래시 위험 — nullable 명시 필요 (audio는 payload 미사용 확인, fx는 검증 예정)

---

## [검증 회차 4] 대상: 오디오 (audio-dev 완료 통지) — 2026-07-03

대상: `src/audio/{synth,sound}.js`. **기능 결함 0건, P3 계약 편차 1건.**

### 통과 항목

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 4-1 | 문법 게이트 | 통과 | 2파일 파스 + 동적 import OK (node 환경 무해 — initSynth가 typeof window 가드, synth.js:54) |
| 4-2 | 구독 21종 이벤트 이름 ↔ 계약 §3 | 통과 | sound.js:174-204 전수 대조 — 21종 전부 계약에 존재하는 이름. 주의: sub() 래퍼 경유라 grep on-집합에 안 잡힘 (emit↔on diff 시 수동 합산 필요) |
| 4-3 | 페이로드 필드 읽기 | 통과 | tower:fired→towerType(발행측 combat.js:107에 존재, 미지 타입 arrow 폴백), lives:changed→delta(economy.js:88 존재), ui:mute-changed→muted(발행측 ui-dev — 보류 H-7). 그 외 18종은 페이로드 미사용 — enemy/tower 객체 필드 역참조 없음(§4.6 안전, projectile:hit target=null에도 무해) |
| 4-4 | 의존 규칙 §1 (구독만) | 통과 | sound.js import = core/events(on)+synth뿐, synth.js import 0건. 읽기 API 호출 없음. 발행 0건 |
| 4-5 | 격리 (부분 재실행 보장) | 통과 | 전 핸들러 try/catch(sound.js:163-171) + 버스 자체 격리(events.js:55-61) 이중. AudioContext 실패 시 영구 무음 no-op(synth.js:15,31-34). 제스처 전 playTone no-op(synth.js:122) |
| 4-6 | GDD §8 필수 SFX | 통과 | 발사 4종(구분되는 파형: square 하강/노이즈+저음/triangle 상승/sawtooth 상승)·명중·사망·건설·판매·업그레이드·에러·팡파레·경고·승리/패배 징글·BGM 루프(C-G-Am-F, 볼륨 0.11로 SFX 미간섭) — 코드 존재 확인. 실재생은 브라우저 플레이테스트(AC-19) 소관 |

### 결함

| # | 심각도 | 경계면 | 증상 | 재현/확인 | 담당 |
|---|---|---|---|---|---|
| D4-1 | P3 → **종결(계약 v1.1)** | 계약 §3 구독자 표 | listen-only 구독이 계약 구독자 열에 없음. **[정정 — 회차 10]** 최초 리포트의 4건은 audio-dev의 후속 수정(ui-dev 클릭음 협의 반영) 이전 버전 기준. 현행 sound.js는 구독 19종, 계약 외 구독은 2건뿐(tower:selected sound.js:200, ui:speed-changed sound.js:201). architect가 실코드 교차 확인 후 이 2건을 계약 v1.1 §3.5/§3.7에 반영 승인. QA 현행본 재판독으로 19종·2건·페이로드 안전(muted/delta/towerType만 읽음) 재확인 | sound.js:174-207 ↔ 계약 v1.1 §3 | 종결 |

### 보류 추가

| # | 경계면 | 사유 |
|---|---|---|
| H-7 | ui:mute-changed {muted} 발행측 | ui-dev 완료 통지 대기 — audio는 p.muted를 읽음, 발행 페이로드에 muted 필수 |

---

## [검증 회차 5] 대상: 밸런스 데이터 (wave-balancer, Task #5 완료 확인 — 선제 검증) — 2026-07-03

대상: `src/data/{towers,enemies,waves,balance}.js`, `scripts/sim.mjs`. **결함 0건.**
QA 독립 스크립트 `qa-verify-data.mjs`(scratchpad) 56/56 통과 + 담당자 sim.mjs 재실행 21항목 전부 PASS.

### 통과 항목

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 5-1 | 문법 게이트 (src 전체 재실행) | 통과 | src 전 26파일 파스 에러 0건 — ui/fx/main 포함 (내용 검증은 해당 회차에서) |
| 5-2 | TOWERS §4.1 스키마 | 통과 | 키 4종 정확, 필드명·단위 전부 일치, levels 길이 3, projectile.slow 구조 (T1~T5) |
| 5-3 | 에셋 키 참조 | 통과 | 타워 4·투사체 4·적 5 assetKey 전부 매니페스트 존재 (T3/T4/E2). 실파일은 H-1 유지 |
| 5-4 | GDD/AC-09 타워 역할 구속 | 통과 | arrow 최소 cooldown·최저가(T6/T10), cannon만 splash>0(T7), frost slow 필수(T8), arcane magic·최고가·최장 사거리(T9~T11) |
| 5-5 | ENEMIES §4.2 스키마·역할 | 통과 | 키 5종, golem만 isBoss, livesCost 1/5(GDD 고정), slowResist 보스 0.5·일반 0, goblin/brute/wasp/golem 역할 구속 (E1~E9; 보스 HP 750=차상위 220×3.4, W10 유효 4485) |
| 5-6 | WAVES §4.3 | 통과 | 길이 10, 전 그룹 필드 유효+적 키 존재, 등장 순서 GDD §4 정합(1~2 고블린만/오크 W3/와스프 W5/브루트 W6/골렘 W10 단독+호위), hpMultiplier 단조 증가 (W1~W9) |
| 5-7 | BALANCE §4.4 | 통과 | startGold 120=arrow 50×2+여유(GDD 구속), startLives 20, sellRatio 0.7, interWaveCountdown 15 (B1~B2) |
| 5-8 | 담당자 시뮬 재실행 | 통과 | `node scripts/sim.mjs` — 21항목 PASS (보스 W10 EHP 53%, 무전략 실패 W7, 킬존 클리어 잔여 라이프 7/20) |

### 보류 갱신

- H-3 **해소** (데이터 측 스키마 + entity 소비 측 3회차에서 완료. ui 소비 측은 ui 회차에서 확인).

---

## [검증 회차 6] 대상: 코어 엔진 (engine-dev, Task #2 완료 확인 — 선제 검증) — 2026-07-03

대상: `src/main.js`, `src/core/{loop,renderer,input,assets,events}.js`, `src/systems/economy.js`. **결함 0건.**

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 6-1 | 상태 머신 §8 | 통과 | loading→title→playing→victory/defeat, startRun의 loading/playing 가드(main.js:103), 승리=wave:cleared index≥total(87), 패배=lives≤0 즉시(93-99). 보스 누수 시 lives:changed가 wave:cleared보다 먼저 동기 처리되어 GDD v1.1 판정(라이프 우선)과 정합 |
| 6-2 | 페이로드 §3.1 | 통과 | game:won {kills, livesLeft}(89), game:over {waveReached, kills}(97) — 통계는 wave:started/enemy:killed listen-only 구독으로 집계 (관찰 O-3) |
| 6-3 | loop §8 | 통과 | STEP 1/60, 누적기+0.25s 스파이럴 캡, 배속은 누적량에 곱함(loop.js:31), setSpeed 유한수 검증 |
| 6-4 | renderer §8 | 통과 | registerLayer stable sort(동일 order 등록순), 카메라 오프셋 ≤30 레이어만(renderer.js:61), draw 예외 격리, drawFn save/restore 래핑 |
| 6-5 | input §3.8 | 통과 | input:click {x,y,col,row,button}/input:move/input:cancel(우클릭+ESC), CSS 스케일 보정, 캔버스 밖 미발행(AC-22), 변환은 grid.pxToGrid 소비(관찰 O-4) |
| 6-6 | assets §5·§8 | 통과 | get() 항상 drawable(폴백 캔버스, 키당 경고 1회), 접두사별 폴백 색 §5 표와 일치(assets.js:146-168), 크로마키는 4모서리 불투명 마젠타일 때만(보수 기준), loadAssets 실패 무reject |
| 6-7 | 부트스트랩 격리 §1 | 통과 | ui/fx/audio init 개별 try/catch(safeInit), fx update 예외 시 해당 fx만 비활성(main.js:125-133), 레이어 등록 10/20/30×3/40 계약 순서 |
| 6-8 | window.GAME 훅 | 통과 | state/gold/lives/wave/speed getter + towers/enemies/projectiles 라이브 참조 + emit + data 5종(main.js:196-217) — 계약 §8 전 필드 |

## [검증 회차 7] 대상: 이펙트 (fx-dev, Task #7 완료 확인 — 선제 검증) — 2026-07-03

대상: `src/fx/{particles,floaters,flashes}.js`. **결함 0건. O-2 리스크 해소 확인.**

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 7-1 | projectile:hit target=null 방어 (O-2) | 통과 | particles.js:235 `if (target)`, flashes.js:87 `!!(target && ...)`, floaters.js:60 damage≤0 미표기 — 헛방 폭발 시 크래시·0 숫자 표기 없음 (3회차 3-9 이관 항목 종결) |
| 7-2 | 구독 이벤트 이름·페이로드 | 통과 | particles 8종/floaters 3종/flashes 6종 전부 §3 존재 이름. 읽는 필드는 §4.6 보장 필드만(enemy.type/isBoss/x/y/alive/slowed, tower.x/y, delta 등) |
| 7-3 | 의존 규칙 §1 | 통과 | 3파일 모두 import는 core/events(+flashes만 renderer.setCameraOffset — §8 명시 허용). 읽기 API 호출 0, 발행 0 |
| 7-4 | 격리·복원 | 통과 | 전 핸들러 guard try/catch, game:started 전체 클리어+카메라 리셋(flashes.js:75-81), 셰이크 종료 시 setCameraOffset(0,0)(flashes.js:125), 풀 링버퍼(고갈 시 재활용 — 무한 성장 없음) |
| 7-5 | GDD §8 필수 이펙트 (AC-18) | 통과 | 캐논 폭발+스플래시 링(실반경), 피격 플래시(보스 확대), 사망 팝(타입별 색·보스 2.2배), 데미지/골드 플로팅, 냉기 파편+슬로우 틴트(활성 추적), 아케인 섬광, 트레일(캐논·아케인), 건설 먼지, 보스 셰이크(강한 쪽 유지 — 연타 증폭 방지) — 코드 존재. 시각 확인은 플레이테스트 소관 |

## [검증 회차 8] 대상: UI (ui-dev, Task #6 완료 확인 — 선제 검증) — 2026-07-03

대상: `src/ui/{hud,shop,placement,panel,screens}.js`, `css/style.css`. **결함 0건. H-7 해소.**

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 8-1 | 발행 이벤트 10종 ↔ §3 | 통과 | ui:wave-start-requested{}/ui:speed-changed{multiplier}/ui:mute-changed{muted}(hud.js:86,93,101 — **H-7 해소**), ui:error{reason 3종}, ui:build-requested{towerType,col,row}, tower:selected{tower}/tower:deselected{}, ui:upgrade/sell-requested{towerId}, ui:start/restart-requested{} — 페이로드 문자 단위 일치 |
| 8-2 | 구독·필드 읽기 | 통과 | 5파일 구독 전부 §3 존재 이름. tower 객체는 §4.6 필드만 읽음(id/type/level/invested/x/y/col/row). game:won{kills,livesLeft}/game:over{waveReached,kills} 정확 소비(screens.js:76-86) |
| 8-3 | 읽기 의존 §1 | 통과 | economy.getGold/getLives, grid.isBuildable/inBounds/gridToPx, combat.towers, assets.get, data — 전부 허용 화살표. 건설 판정은 isBuildable만 소비(자체 로직 없음, placement.js:72) |
| 8-4 | DOM ID 계약 §7 | 통과 | 계약 ID만 getElementById로 바인딩, 내부 구성은 동적 생성(계약 위반 없음). .hidden 토글 방식 유지 |
| 8-5 | AC 대응 | 통과 | AC-07 disabled+ui:error(shop.js:100,130), AC-08 초록/빨강 프리뷰+우클릭/ESC 취소(placement), AC-10 max-level/gold 비활성(panel.js:78-86), AC-16 n/10 표기(hud), NaN 방어 num() 일관 적용 — 동작 확인은 플레이테스트 소관 |

### 관찰 추가 (system-architect 문서 보완 — O-1/O-2에 이어)

- O-3: main이 wave:started/enemy:killed를 listen-only 구독(통계 집계 — §3.1 페이로드가 요구). §3 구독 열에 main 추가 필요
- O-4: core/input → map/grid 읽기(pxToGrid)가 §1 화살표에 없음 — §2 "변환은 grid 단일 소유"가 요구하는 결합
- O-5: ui/shop이 input:cancel 구독(§3.8 열은 placement/panel만), ui/panel은 input:cancel 대신 tower:deselected로 간접 처리, shop→placement 직접 함수 호출(enterPlacementMode/cancelPlacementMode — 동일 소유자 ui 내부 결합). ui 내부 결합 허용 여부 계약 명시 필요

## [검증 회차 9] 대상: 통합 (전 모듈 조립) — 2026-07-03

**헤드리스 통합: 결함 0건 (7/7). 브라우저 스모크: 미검증. 밸런스 난이도: P2 잠정 1건.**

| # | 항목 | 판정 | 확인 방법 |
|---|---|---|---|
| 9-1 | 이벤트 emit↔on 전역 diff (H-2 해소) | 통과 | 계약 33종 전부 발행 존재, 전부 구독 존재(grep + audio sub() 21종·main 최상위 구독 수동 합산). 고아 이벤트 0. 계약 외 이벤트 0 |
| 9-2 | 실데이터 전체 게임 체인 | 통과 | `qa-verify-integration.mjs`(scratchpad): game:started→건설→웨이브→클리어 체인 1..N 순차, 골드 음수/NaN 없음, 콘솔 에러/경고 0건, 소프트락 없음. loading 중 ui:start-requested 무시(main 방어) 확인 |
| 9-3 | 통합 스모크 — 브라우저 (H-6) | **미검증** | Chrome 확장 미연결로 도구 사용 불가. main 상태 머신 브라우저 경로(bootstrap·렌더·DOM)는 playtester 확인 필요. 참고: 포트 8000 서버는 타 디렉토리 서빙 중(404) — QA가 8123에 프로젝트 루트 서버 기동해 정적 200 확인 |
| 9-4 | 에셋 실파일 (H-1) | **미검증** | asset-artist(Task #1) 진행 중 — 이미지 0/18. 폴백으로 실행은 가능(AC-21 경로) |

### 결함 (잠정)

| # | 심각도 | 경계면 | 증상 | 재현/확인 | 담당 |
|---|---|---|---|---|---|
| D9-1 | P2 (잠정 — 플레이테스트 확정 필요) | 밸런스 모델 ↔ 실엔진 | GDD §4 "신중한 플레이어는 첫 판 클리어 가능" 목표 대비 난이도 상회 신호. 실엔진 헤드리스 자동 플레이 3전략 모두 패배: ①단순 킬존 12타워 → W6 패배 ②업그레이드 인터리브 → W8 패배 ③커버리지 기하 최적화(아케인 4구간 지점, 애로우 Lv2 조기, 더블 프로스트) → W8 패배, 웨이브별 누수 W3:2/W4:2/W5:7/W6:3/W7:5 (W5 와스프에서 급증). sim.mjs 추상 모델의 배치계수 0.95·슬로우 보너스 40% 가정이 실엔진 커버리지 대비 낙관적일 가능성 | `node qa-verify-integration.mjs` (scratchpad) — 웨이브별 라이프/골드/누수 로그 출력 | wave-balancer (sim.mjs 자체 명시대로 최종 판정은 playtester 우선 — 튜닝은 플레이테스트 후 권장) |

---

## [검증 회차 10] Phase 3 최종 게이트 — 2026-07-03

기준: 아키텍처 계약 **v1.2** (v1.1: O-1/O-2/D4-1 반영, v1.2: O-3/O-4/O-5 반영 — 전건 기존 구현 추인, 코드 변경 없음). engine-dev의 main.js 통합 배선 완료 후 실행.

### 판정 요약: **P0 0건 / P1 0건 / P2 잠정 1건(D9-1 유지) / P3 0건(D4-1 종결)**

| # | 게이트 항목 | 판정 | 확인 방법 |
|---|---|---|---|
| 10-1 | 전 파일 문법 게이트 | 통과 | src 전 26파일 `node --input-type=module --check` 파스 에러 0 + main.js 전체 import 체인 동적 import OK |
| 10-2 | 이벤트 emit↔on 최종 diff (통합본) | 통과 | 발행 33종(계약과 1:1, 계약 외 0) ↔ 구독: grep on-집합 + audio sub() 19종(재판독) + main 최상위 7종 합산 — 고아 이벤트 0. audio 변경분(클릭음 game:started 통합, ui:speed-changed 추가) 반영 확인 |
| 10-3 | main.js 통합 배선 ↔ 계약 §8 | 통과 | 17:25 최종본 재판독 — 회차 6 검증본과 내용 동일(레이어 10/20/30×3/40, updateWaves→updateCombat→fx 3종 격리, safeInit 9모듈, window.GAME). engine-dev 헤드리스 스모크(scratchpad/headless_smoke.mjs, 브라우저 스텁 — 상태 머신 title→playing 경로 포함) QA 재실행 11/11 PASS, console.error 0 |
| 10-4 | 데이터 스키마↔소비자 / map API / LEVEL 정합 | 통과 | 회차 2·3·5 검증 후 해당 파일 변경 없음(mtime 대조) — 결과 유효. `node scripts/sim.mjs` exit 0 (게이트 재실행) |
| 10-5 | 상태 머신 도달성 | 통과 | loading(시작 요청 무시 확인)→title→playing→victory(회차 6 코드)·defeat(통합 시뮬 실도달)→재시작 리셋(회차 3 I1). 실데이터 회귀 시뮬 7/7 — 이벤트 체인 1..N 순차·골드 무결·소프트락 없음 |
| 10-6 | 에셋 키↔매니페스트↔실파일 (H-1) | 키 통과 / 실파일 **보류** | draw 호출 키 전수(회차 2-7·5-3) 매니페스트와 1:1. 실파일 0/18 — asset-artist 진행 중. 폴백 경로는 assets.js 검증 완료(AC-21 절반) |
| 10-7 | 브라우저 로드 스모크 (H-6) | **미검증 (환경 사유)** | Chrome 확장 미연결(2회 시도, engine-dev 환경도 동일). 정적 서빙은 curl로 확인: **:8123(QA 기동, 프로젝트 루트) index/main/manifest 전부 200**. 주의 — :8000은 타 디렉토리 서빙(404), :8001은 IPv4를 무관한 앱(JSON 404 응답)이 점유 중이고 engine-dev의 http.server는 IPv6에만 바인딩되어 가려짐. **플레이테스트는 http://127.0.0.1:8123 사용 권장** |
| 10-8 | D9-1 회귀 확인 | 유지 | 통합 배선 후 재실행 — 동일 결과(커버리지 최적화 전략 W8 패배, 누수 패턴 동일). engine-dev 스모크에서도 W1에 arrow 2기로 누수 3(라이프 17) — 난이도 신호 일관 |

### 잔여 항목 (게이트 통과 후 후속)

1. **브라우저 스모크/AC-20** — playtester 실행 필요 (:8123 사용). 확인 포인트: "[main] 부트스트랩 완료 — state: title" 로그, window.GAME 존재, 콘솔 에러 0(에셋 플레이스홀더 경고 1줄 허용), 실마우스 input:click 경로, 레이어 렌더 출력, AudioContext 소리.
2. **에셋 실파일 18키** — asset-artist 완료 시 `ls` 전수 대조 + 크로마키/투명 배경 확인 (H-1).
3. **D9-1 (P2 잠정)** — playtester 체감과 교차 확인 후 wave-balancer 튜닝 여부 결정.

---

## [검증 회차 11] 대상: 이미지 에셋 (asset-artist, Task #1 완료) — 2026-07-03

**H-1 해소. P3 1건.**

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 11-1 | 매니페스트 18키 ↔ 실파일 | 통과 | Node fs로 MANIFEST 경로 전수 대조 — 18/18 존재, 전부 100B 초과. PNG 시그니처(89504E47...) 18/18 유효 |
| 11-2 | 투명 배경 (계약 §5) | 통과 | IHDR 컬러 타입 검사: 스프라이트 16종 전부 RGBA(알파 보유). tile_grass/tile_path만 RGB(불투명)이나 전면 채움 타일링 텍스처이므로 정합(크로마키 비대상, 의도된 형태). 시각 확인 4종(tower_frost·enemy_stone_golem·tile_path·proj_arrow) — 컨셉 §5와 일치, 배경 투명 정상 |
| 11-3 | 해상도 | 통과 | 타워/적 128², 맵 오브젝트 256², 투사체 64급 — 드로우 크기의 2~4배 소스, drawImage 축소로 무손실 |

### 결함

| # | 심각도 | 경계면 | 증상 | 재현/확인 | 담당 |
|---|---|---|---|---|---|
| D11-1 | P3 | 에셋 종횡비 ↔ 드로우 계약 | proj_arrow 64×32, proj_arcane_bolt 64×35 — 비정사각. 드로우 코드는 계약 §5대로 정사각(20×20/24×24)으로 그리므로(projectile.js:70-77) 세로 약 2배 늘어난 화살로 표시됨. 게임 진행 무영향, 시각 왜곡만 | `xxd -s 16 -l 8` IHDR 치수 vs manifest 드로우 크기 표 | asset-artist — 투명 여백 패딩으로 정사각 캔버스화 권장(코드 변경 불요). 플레이테스트에서 체감 미미하면 무시 가능 |

### 보류 최종 현황

- H-1~H-7 전부 **해소**. 잔여 미검증은 브라우저 스모크(AC-20, 환경 사유 — playtester 이관) 1건.

---

## [검증 회차 12] 대상: D11-1 수정분 재검증 (asset-artist) — 2026-07-03

**D11-1 종결.** 수정된 경계면(투사체 2종)만 재검증 — 재호출 지침에 따른 증분 검증.

| # | 항목 | 판정 | 확인 방법 |
|---|---|---|---|
| 12-1 | 정사각화 | 통과 | proj_arrow 64×64, proj_arcane_bolt 64×64 (IHDR 실측) — 정사각 드로우(20×20/24×24)와 종횡비 일치, 세로 왜곡 해소 |
| 12-2 | 포맷·알파 | 통과 | PNG 시그니처 유효, 컬러 타입 06(RGBA) — 투명 패딩 확인. 시각 확인 2종: 중앙 정렬·원화 유지 |
| 12-3 | 부수 변경 없음 | 통과 | 나머지 16키 파일 크기 회차 11 기록과 전건 일치 — 이번 수정이 다른 에셋을 건드리지 않음 |

### 최종 결함 집계 (전 회차)

| 심각도 | 건수 | 상태 |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 1 (D9-1 밸런스 난이도) | 잠정 — playtester 체감과 교차 확인 대기 |
| P3 | 2 (D4-1, D11-1) | 전건 종결 |

잔여 미검증: 브라우저 스모크(AC-20) 1건 — playtester 이관 (http://127.0.0.1:8123).

---

## [검증 회차 13] 대상: D9-1 밸런스 보정분 재검증 (wave-balancer) — 2026-07-03

**D9-1 종결.** 변경 파일: `src/data/{enemies,waves}.js`, `scripts/sim.mjs` v2. towers.js/balance.js는 불변(mtime 대조 — 담당자 주장과 일치).

| # | 항목 | 판정 | 확인 방법 |
|---|---|---|---|
| 13-1 | 문법 게이트 | 통과 | 변경 3파일 + towers/balance 파스 에러 0 |
| 13-2 | 스키마·구속 회귀 | 통과 | `qa-verify-data.mjs` 56/56 재통과 — 필드명·역할 구속(AC-09)·등장 순서(AC-14)·livesCost/slowResist 고정값 전부 유지. 보상 상향(goblin 4→5 등)·hpMultiplier 1.22→1.18은 스키마 무변경 |
| 13-3 | sim.mjs v2 게이트 | 통과 | exit 0, 21/21 — 실엔진 자동 플레이 봇이 난이도 판정 권위로 승격됨(회차 9 QA 스크립트 패턴 채택 확인): 무전략 W6 사망(목표 5~7), 킬존 클리어 잔여 10(목표 6~14) |
| 13-4 | **QA 독립 재현 (D9-1 결정 검증)** | 통과 | `qa-verify-integration.mjs`(v3 킬존 전략, 보정 전 W8 패배) 재실행 → **10웨이브 전체 클리어, 잔여 라이프 10/20=50%** (GDD 목표 30~70% 부합). 누수 곡선 건전: W1~4 0, W5 와스프 1(보정 전 7), W7~9 압박 구간 2/5/2(GDD "첫 실패 지점 5~7" 의도 유지 — 무전략 봇은 W6 사망), W10 보스 0. 체인 9/9(승리 판정 포함), 골드 무결·소프트락 없음 |

### 최종 결함 집계 (갱신)

| 심각도 | 건수 | 상태 |
|---|---|---|
| P0 / P1 | 0 | — |
| P2 | 1 (D9-1) | **종결** — 원인: 추상 모델의 전 경로 노출·전체 슬로우 가정(실엔진 대비 ~2배 낙관). 조치: 데이터 보정 + sim v2 실엔진 봇 권위화. QA 독립 재현으로 확인 |
| P3 | 2 (D4-1, D11-1) | 전건 종결 |

**미결 0건.** 잔여 미검증: 브라우저 스모크(AC-20) 1건 — playtester 이관 (http://127.0.0.1:8123). 난이도 체감(GDD "신중한 첫 판 클리어 가능")의 최종 확정도 플레이테스트 소관.

---

# ═══ v2 사이클 (계약 v2.0, GDD v2.0 — 2026-07-06) ═══

## [검증 회차 14] v2 선행 감사 (Task #15 개시 — 모듈 작업 전 선제) — 2026-07-06

기준: 계약 v2.0 (이벤트 36종, 에셋 42키, §10 애니메이션, §11 모바일, §12 배포, §13 불변 경계), GDD v2.0 (D7~D12, AC-23~37). **결함 0건.**

| # | 항목 | 판정 | 확인 방법 |
|---|---|---|---|
| 14-1 | §12 상대 경로 감사 게이트 (선행) | 통과 | 계약 명시 grep(선행 `/` src/href/url()/fetch/import) — 현행 전체 코드베이스 매치 0건 |
| 14-2 | .nojekyll | 통과 | 루트 존재 (0B, architect 생성 — 계약 v2.0 §12) |
| 14-3 | 소문자 snake_case | 통과 | 파일명(grep 정밀 — macOS find의 case-insensitive 오탐 배제) + 코드 내 assets/ 경로 문자열 대문자·공백 0건 |
| 14-4 | window.location 조립 금지 | 통과 | src·index.html grep 0건 |
| 14-5 | 매니페스트 v2 ↔ §5 42키 | 통과 | 독립 스크립트: 42/42 키 1:1(누락 0·계약 외 0 — 타워 12/적 정적 5/walk 쌍 5/투사체 4/맵 16), walk 5쌍 `{img, atlas}` 객체 형식·확장자 정확, 폐지 v1 타워 4키 제거 확인, 경로 위반(절대/대문자) 0 |
| 14-6 | index.html §7 v2 | 통과 | `#btn-cancel-placement` #stage 내 hidden으로 추가(index.html:31), viewport 메타 기존재 |
| 14-7 | zone.js 뼈대 ↔ 계약 | 통과 | JSDoc이 §3.9(틱 무이벤트)·§4.6(shape)·§8(레이어 20 내 타워→지대→적→투사체)·§1(컬렉션은 combat 소유, entities↛systems)과 정합 |
| 14-8 | §13 불변 대조 기준선 고정 | 기록 | v1 최종본 md5 — levels.js bb1e81dc… / grid.js ddc8fe4b… / path.js 5b1e9b11… (map-designer 완료 시 diff 대조 근거) |

### v2 보류 (담당 완료 통지 시 검증)

| # | 경계면 | 대기 대상 |
|---|---|---|
| V-1 | 폐지 v1 타워 키 참조 제거 — 현행 towers.js(assetKey:'tower_arrow' 등)·tower.js:141(get(def.assetKey))·shop.js:50이 폐지 키 참조 중 (과도기 — 지금 실행 시 타워는 폴백 표시) | wave-balancer #14(assetKeys 전환) + entity-dev #13 + ui-dev |
| V-2 | 신규 이벤트 3종(zone:created/expired, frost:nova) emit↔on + 페이로드, zone 틱 무이벤트 | entity-dev #13 → fx-dev/audio-dev |
| V-3 | mechanism union 4종 스키마↔소비 코드 + AC-23~26 동작 | wave-balancer #14 + entity-dev #13 |
| V-4 | 42키 실파일↔아틀라스 쌍(24키 신규분 + 아틀라스 JSON 형식 §10) + reference/ 보존(AC-30) | asset-artist #10 |
| V-5 | getAnim 강등 체인 3단·DPR(min 2, 논리 좌표 불변)·Pointer 단일 경로(이중 리스너 금지) | engine-dev #11 |
| V-6 | §13 불변 diff(waypoints 문자 단위·PATH 28·킬존 GRASS·신규 DECO 체비쇼프 ≥2) + decoTiles 스키마 | map-designer #12 |
| V-7 | AC-23~37 통합 게이트 + 상대 경로 재감사(전 모듈 변경 후) | 전 모듈 완료 후 |

---

## [검증 회차 15] 대상: levels.js v2 데이터 조기 신호 점검 — D11 불변 선행 (map-designer #12 진행 중) — 2026-07-06

작업 중 파일이 D11 불변(§13)을 건드리면 밸런스 회귀 전체가 무효화되므로 완료를 기다리지 않고 데이터만 선행 대조. **결함 0건 — 14/14 통과.**
(기록 경위: 최초 검증·스크립트 작성은 qa-engineer-2 — 해산 정리로 원기록 제거됨. 본 기록은 인계받은 `qa-verify-d11.mjs`(scratchpad)를 qa-engineer가 코드 검토 후 직접 재실행한 결과이며, git diff 스팟체크로도 교차 확인함. 방법: v1 기준본을 git 커밋 75392d2에서 추출해 자동 대조 — 회차 14-8의 md5 기준선을 대체·강화.)

| # | 항목 | 판정 | 확인 방법 |
|---|---|---|---|
| 15-1 | waypoints 문자 단위 동일 + §13 명시 좌표 일치 | 통과 | JSON 직렬화 v1==v2 == (0,2)→(4,2)→(4,7)→(8,7)→(8,2)→(12,2)→(12,5)→(14,5) (D11-A/B) |
| 15-2 | PATH 타일 집합 28개 동일 | 통과 | 양방향 차집합 0건 (D11-C) |
| 15-3 | 킬존 19타일 전부 GRASS | 통과 | A(col5~7×row3~6)12 + B(col9~11×row3~4)6 + (13,4)1 — 위반 0 (D11-D) |
| 15-4 | 신규 DECO 5타일 체비쇼프 ≥ 2 | 통과 | (6,0)d=2 (14,0)d=2 (0,6)d=4 (14,8)d=3 (0,9)d=4 — 전 PATH 대비 최솟값 기계 판정 (D11-E). (6,0)→(4,2) d=2 수동 재계산 일치 |
| 15-5 | v1 DECO 4개 위치 유지 | 통과 | (2,0)(13,0)(1,8)(10,9) 전부 DECO 유지 — 역방향 전환 없음 (D11-F) |
| 15-6 | decoTiles 스키마 §4.5-v2 | 통과 | 전 항목 key ∈ deco_* 4종, 지시 타일 전부 TILE.DECO, 미등재 DECO 0건 (V2-A/B/C) |
| 15-7 | grid.js·path.js 로직 불변 | 통과 | git diff 75392d2 대비 0건 (D11-G) |
| 15-8 | 규격·필수 필드 회귀 | 통과 | 15×10×64, tiles[10][15] 도메인 {0,1,2}, entrance/goal==waypoints 양끝 (V2-D/E/F). 동적 import 성공 = 파스 게이트 겸함 |

- **V-6 부분 해소** (levels.js 데이터 측). 잔여: tilemap.js 렌더 로직(잔디 해시·길 방향 판별 §4.5-v2)·에셋 키 호출 대조 — map-designer #12 완료 통지 시. levels.js가 이후 재변경되면 본 회차 무효, 재실행.
- 정보: 길 방향 타일 PNG 6종(tile_path_h/v/ne/nw/se/sw) 실파일 존재 확인 — 잔디 변형 2종·장식 3종은 미생성 (V-4에서 42키 전수 대조, 폴백으로 결함 아님).

---

## [검증 회차 16] v2 전 모듈 경계면 (Task #11~14, #16~18 완료분 — 선제 포함) — 2026-07-06

기준: 계약 v2.0. 검증 도중 파일이 갱신되어(작업 병행) 최종 상태 기준으로 재검증함. **P2 1건, P3 1건, 그 외 통과.**

### 통과 항목

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 16-1 | 문법 게이트 (전 26파일) | 통과 | 파스 에러 0 |
| 16-2 | **Lv3 메커니즘 4종 행동** (§4.1-v2, AC-23~26 로직) | 통과 | QA 독립 테스트 `qa-verify-mechanisms.mjs` 28/28 — rapid_volley(스택별 cd = cooldown×factor^stacks, 상한, 자기킬 리셋, **발사 시점 대상 변경 리셋으로 타 원인 사망 가속 이월 없음** — tower.js:195-197 주석 명시 설계), overcharge(대기 200 > 연사 150, 상한 min(idle/chargeTime,1)), burning_ground(zone:created 6필드 문자 단위, 틱 -10 무이벤트, 틱 사망 enemy:killed, 만료 zone:expired+제거), frost_nova(반경 내 전원 슬로우+대상별 enemy:slowed+frost:nova, 반경 밖 제외, 직격 피해는 타겟만) |
| 16-3 | Lv2 축 오버라이드 | 통과 | levels[i].splashRadius/slow 우선, 부재 시 projectile 기본 복귀 (E1~E3). 실데이터: cannon 90/104, frost {0.45,2.6} |
| 16-4 | Zone shape §4.6 | 통과 | {id,kind,x,y,radius,remaining,alive} 전 필드 + 렌더 순서 타워→지대→적→투사체(combat.drawEntities) |
| 16-5 | 데이터 v2 스키마 (§4.1-v2) | 통과 | 14/14 — assetKeys[3] §5.1 키 정확·매니페스트 존재, mechanism 타입 매핑 4종·union 필드·nameKo/desc(AC-28), 구속 nova.radius ≤ cannon Lv3 splash, v1 4필드 회귀 |
| 16-6 | 이벤트 emit↔on 36종 | 통과 | 발행 36 유니크(계약 1:1), 신규 3종 구독 — zone:created(fx+audio), zone:expired(fx), frost:nova(fx+audio). fx 페이로드 읽기 계약 필드만, zone.alive 읽기는 §4.6 허용, 정리 3중 경로(particles.js:385) |
| 16-7 | core v2 (§8·§10·§11) | 통과 | renderer: DPR=min(dpr,2) 백킹스토어·기저 변환·논리 960×640 불변 / input: Pointer 단일 경로(mouse/touch 리스너 0), 탭<8px, pointerType 부가, 터치 롱프레스 contextmenu 무시, 논리 좌표 §2 상수 유도 / assets: {img,atlas} 로드(probe 없음), getAnim 강등 체인 ①→②→③('_walk' 제거 정적 키 경유) |
| 16-8 | enemy 애니메이션 (§10) | 통과 | 개체 누적 시간 t += dt×slowFactor(슬로우 시 걸음 감속), frame=floor(t×fps)%frames, 진행 각도 회전, HP바 비회전, getAnim 부재 시 로컬 강등(체인 ② 동형) |
| 16-9 | ui v2 (§11, AC-28·33) | 통과 | placement: 터치 1탭 프리뷰 고정→동일 타일 2탭 확정→타 타일 이동, 마우스 v1 경로 불변, #btn-cancel-placement 노출 제어 / shop: 취소 버튼 배선+assetKeys[0] 아이콘 / panel: mechanism.nameKo/desc 표기 / css: touch-action none(게임 영역)·manipulation(버튼) |
| 16-10 | tilemap v2 (§4.5-v2, AC-31) | 통과 | 순수 함수 직접 검증 — PATH 28타일 전부 방향 판별(h12·v10·코너6 == 웨이포인트 내부 꺾임 수), 무방향 폴백 0, 잔디 해시 결정적(Math.imul, 분포 91/44/15), decoTiles 키 렌더+DECO_KEYS 검증, 사용 키 전부 매니페스트 존재 |
| 16-11 | V-1 해소 (폐지 키 참조) | 통과 | towers.js=assetKeys, shop=assetKeys[0], placement 갱신, tower.js:234의 def.assetKey는 v1 데이터 하위 호환 강등 분기(현 데이터에서 미도달) — 폐지 키 참조 실효 0 |
| 16-12 | §12 상대 경로 재감사 (전 모듈 변경 후) | 통과 | 계약 grep 0건, touch-action/viewport 확인 |
| 16-13 | 실데이터 통합 회귀 | 통과(체인)·수치는 D16-2 | 9/9 — 10웨이브 승리, 이벤트 체인·골드 무결·소프트락 없음. Lv3 메커니즘 인게임 활성 확인 |

### 결함

| # | 심각도 | 경계면 | 증상 | 재현/확인 | 담당 |
|---|---|---|---|---|---|
| D16-1 | P3 | 계약 §8 ↔ main.js | window.GAME에 v2 필수 필드 `zones` 누락 (계약 §8·변경 이력 ⑧ "window.GAME에 zones 추가" — engine-dev 배정). 게임플레이 무영향, AC-24 수치 판정·playtester 접근 경로 제한 | `grep zones src/main.js` 0건. combat.js는 zones export 완비 — main 훅 1줄 누락 | engine-dev |
| D16-2 | P2 | 밸런스 게이트 (AC-37) | **wave-balancer 자체 게이트 sim.mjs가 exit 1로 실패 중인데 Task #14가 완료 마킹됨.** 실패 항목: "[실엔진] 킬존 클리어 + 잔여 라이프 6~14 (현재 16)" — v2 Lv3 메커니즘으로 난이도가 목표 밴드(잔여 30~70%) 아래로 하락(80%). QA 독립 시뮬 교차 확인: v1 보정 후 잔여 10 → v2 동일 전략 잔여 16 (W7 누수 5→0, W9 2→0 — Lv3 구간 완화). 메커니즘 코드는 계약 공식 그대로(16-2) — 순수 수치 영역 | `node scripts/sim.mjs; echo $?` → 1 / `qa-verify-integration.mjs` RESULT 비교 | wave-balancer |

### 잔여 (v2 마감 전)

- V-4: 42키 실파일+아틀라스 JSON 쌍 + reference/ + AC-30 스타일 대조 — asset-artist #10 진행 중
- AC-33~35 실기/에뮬 확인, AC-27·29·31 육안 확인 — 브라우저 플레이테스트 소관
- AC-36 배포 — 사용자 Pages 활성화 조치 대기 (§12 조건부)

---

## [검증 회차 17] v2 수정분 재검증 (entity 감사 2건·밸런스 최종·비네트 DPR·audio/ui 증분) — 2026-07-06

완료 통지 배치 수신 후 최종 파일 상태 기준 재검증. **결함 0건 신규. D16-2 종결.**

| # | 항목 | 판정 | 확인 방법 |
|---|---|---|---|
| 17-1 | entity 감사 수정 ① rapid_volley 발사 시점 리셋 | 통과 | 회차 16에서 이미 최종본 기준 검증 완료(16-2 — 검증 도중 착지분을 추적 반영). 재실행 28/28 유지 |
| 17-2 | entity 감사 수정 ② frost_nova 헛방 게이트 | 통과 | combat.js:207 `hit.target` 조건 확인 — 헛방(target null·damage 0) 시 노바·슬로우 미발동. §3.9 "명중 시" 문언과 정합, burning_ground의 지점 기반과 의미 구분 유지. entity-dev-2 스크립트(30단언, 실데이터) 재실행 전체 통과로 단언 포함 확인 |
| 17-3 | **D16-2 종결** (밸런스 게이트) | 통과 | 최초 재리포트 시점엔 실패 재현(잔여 16, exit 1)이었으나 13:24 waves.js 최종 조정 착지 후: `sim.mjs` 29/29·exit 0·3회 연속 잔여 11(결정적 — Math.random 0건). QA 독립 시뮬 교차: 승리, 잔여 11/20=55% — GDD 밴드(30~70%) 정중앙. 원인 규명(wave-balancer 확인): 최초 완료 측정(13/20)이 entity 13:13 최종 패치 이전 엔진 기준이었음 — 패치본 기준 16/20 이탈을 게이트가 정상 검출, W7~9 물량 강화(goblin 12→14/14→15, wasp 7→8/8→9 — 간격 불변)로 재보정. QA가 보고 수치와 파일 실값 전건 대조 일치 확인. 완료 보고는 최종 저장 후 게이트 재실행 기준 권고 전달 |
| 17-4 | 비네트 DPR 수정 (flashes.js — engine-dev-2 발견, fx-dev 수정) | 통과 | flashes.js:202-216 — 그라데이션·fillRect가 논리 상수 960×640 기준(물리 px canvas.width 참조 제거, 주석으로 금지 명시). §11 논리 좌표계 원칙과 정합. 렌더 육안 확인(레티나 중앙 대칭)은 플레이테스트 항목 |
| 17-5 | fx v2 증분 (tower:fired 리듬 추적) | 통과 | 신규 이벤트·페이로드 의존 없음(§3.9 확정 경로 — fx 내부 발사 간격 관측), Zone 필드는 alive만(§4.6), 정리 3중 경로. 계약 준수 |
| 17-6 | audio 증분 (synth pointerup) | 통과 | synth.js:61-64 — pointerdown+pointerup(capture) 이중 unlock, iOS 사용자 활성화 시점 대응. 구독·발행 변화 없음 |
| 17-7 | V-1 최종 재확정 | 통과 | src/ui 폐지 assetKey 참조 0건(ui-dev-2 수정 착지) — wave-balancer·engine-dev-2가 리포트한 shop.js:50/placement.js:188 건은 메시지 교차(수정 전 상태 기준)로 이미 해소됨 |
| 17-8 | 메커니즘 회귀 (최종 수치) | 통과 | 실데이터: volley {maxStacks 4, factor 0.88}, overcharge {chargeTime 8, maxBonus 1}, arrow Lv2 10/0.50, W8~10 hpMult 3.45/4.06/4.80 — 스키마·구속 준수(sim 29항목 내 §12.1 구속 4건 포함 PASS) |

### 미결 현황

- D16-1 (P3, window.GAME.zones): engine-dev Phase 3 통합 지시에 포함(team-lead 확인) — 통합 완료 보고 시 검증
- V-4: 42키 실파일+아틀라스 JSON — asset-artist #10 진행 중
- 플레이테스트 이관: AC-23~26 육안·수치(±1스텝 허용 — 부동소수점 잔차, entity-dev-2 명시), AC-27/29/31 육안, AC-33~35 실기(합성 클릭은 PointerEvent로 주입 필요 — engine-dev 명시), AC-36(사용자 Pages 조치)

---

## [검증 회차 18] v2 Phase 3 통합 검증 (engine-dev 통합 완료) — 2026-07-06

**D16-1 종결. 신규 결함 0건. 헤드리스 전 게이트 그린.**

| # | 항목 | 판정 | 확인 방법 |
|---|---|---|---|
| 18-1 | **D16-1 종결** (window.GAME.zones) | 통과 | main.js:43 combat zones import + main.js:215 GAME.zones 노출 — §8 v2 계약 필드 완비. AC-24 수치 판정 경로 개통 |
| 18-2 | renderer 표시 크기 소유권 이관 | 통과 | 인라인 style 설정 제거(주석으로 CSS 소유 명시), css/style.css:147 `#game-canvas` 규칙 존재 — §11 세로 레이아웃과 단일 소유. AC-35 판정 시 인라인이 아닌 CSS 크기 기준임을 플레이테스트 항목에 반영 |
| 18-3 | engine-dev 헤드리스 스모크 v2 | 통과 | `headless_smoke_v2.mjs` 재실행 25/25·console.error 0 — 4종 발사·장판 생성/만료 전량·매각 환불·frost:nova 실발동·GAME.zones 포함 |
| 18-4 | QA 전체 회귀 | 통과 | 문법 게이트, 메커니즘 28/28, 통합 시뮬 9/9(승리·잔여 11), sim.mjs exit 0, §12 경로 감사 0건, :8123 정적 200 |
| 18-5 | 브라우저 게이트 (AC-20 콘솔·AC-33/34 모바일·AC-35 DPR) | **미검증 (환경 사유)** | Chrome 확장 미연결(누적 3회 시도) — playtester 이관. 참고: 합성 클릭은 PointerEvent 주입 필요, nova 육안 확인은 프로스트 단독 국면 권장(혼성 배치에서 volley가 타겟 선점 — engine-dev 실측), 에셋 착지 후 걷기 아틀라스 frames 4·fps 8 실로딩 재확인 |

### v2 미결 현황

- **V-4만 잔존**: 42키 실파일+아틀라스 JSON 쌍+reference/(AC-30) — asset-artist #10 진행 중. 착지 시 회차 19로 검증 후 v2 QA 게이트 종결 가능 (브라우저·배포 항목은 각각 playtester·사용자 조치 소관)

---

## [검증 회차 19] v2 에셋 검증 (asset-artist #10 완료) — V-4 종결 — 2026-07-06

**결함 0건. v2 QA 보류 전 항목 종결.**

| # | 항목 | 판정 | 확인 방법 |
|---|---|---|---|
| 19-1 | 42키 전수 실파일 (walk 쌍 포함 47파일) | 통과 | 독립 스크립트 — 매니페스트 전 경로 존재·50B 초과, 누락 0 |
| 19-2 | 아틀라스 JSON 5종 §10 형식 | 통과 | frameW/H 128·frames 4·fps 8·sequences.walk [0,1,2,3] — 5종 전부 계약과 1:1 파싱 대조 |
| 19-3 | 치수·포맷 | 통과 | 걷기 스트립 5종 512×128(1행 4열), 타워 12키 128×128, PNG 시그니처 전수, walk 5종 RGBA(투명) |
| 19-4 | reference/ (AC-30 전반) | 통과 | 원본 12장 보존, 매니페스트 미등재(런타임 미사용), 파일명 snake_case |
| 19-5 | AC-30 스타일 대조 (QA 시각 판정) | 통과 | tower_arrow lv1↔lv3: 동일 목재 석궁 망루 실루엣 + 증축·장식 강화(레벨 오인 없음 — §5.1 반려 기준 미해당) / goblin walk 4프레임: v1 팔레트(녹색 피부·누더기·단검) 유지·프레임별 걷기 자세 뚜렷 / tile_path_ne: 북·동 개구 = 키 명명 일치, 잔디 모서리 톤은 tile_grass(v1 무변경 — git diff 0)와 동일 계열로 이음새 위험 없음 |

### v2 QA 최종 집계

| 구분 | 결과 |
|---|---|
| 검증 회차 | 14~19 (6회) |
| 결함 | D16-1(P3)·D16-2(P2) — **전건 종결**, 미결 0 |
| 보류 V-1~V-7 | **전건 해소** (V-7 중 헤드리스 게이트 완료 — AC-23~26 로직·28·30·31·32·37 판정 근거 확보) |
| 헤드리스 게이트 | 문법·이벤트 36종·스키마·메커니즘 28케이스·D11 불변·상대 경로·snake_case·sim 29항목·통합 시뮬 — 전부 그린 |
| 이관 | AC-20/27(육안)/29(육안)/31(육안)/33/34/35 → playtester (기술 참고 4건 등재) / AC-36 → 사용자 Pages 조치 후 조건부 |

---

# ═══ v3 사이클 (계약 v3.0, GDD v3.0 — 2026-07-08) ═══

기준: 계약 v3.0 (§3.10 이벤트 43종, §4.7~4.11 스키마, §14 흐름, §15 불변), GDD v3.0 (D13~D18, AC-38~48). 심각도 P0~P3 동일.
v3 특화 경계면 6종(오케스트레이터 지시): ① 신규 이벤트 7종 emit↔on+페이로드 ② 점수 집계 정합 ③ LEVELS[0]/스테이지1 회귀 불변 ④ 저장 스키마↔로드 폴백 ⑤ 상태머신 stage-select 도달성·해금 캐스케이드 ⑥ AC-38~48 게이트+sim 스테이지 회귀.

## [검증 회차 20] v3 선행 감사 (Task #10 개시 — Wave A 작업 전 baseline 고정) — 2026-07-08

Wave A(map-designer #6 LEVELS·wave-balancer #7 밸런스/점수·engine-dev #8 storage/score/progress/main) 병렬 착수 전 선제 검증. **결함 0건 — baseline 전건 그린. v3 구현은 아직 미착지(전 신규 모듈 TODO 스텁, levels.js는 v2 단일 LEVEL 그대로).**

| # | 항목 | 판정 | 확인 방법 |
|---|---|---|---|
| 20-1 | 문법 게이트 (src 전 36파일 + sim) | 통과 | `node --input-type=module --check` 36/36 파스 에러 0 (신규 5파일 storage/score/progress/stageselect/scoring 포함) + `node --check scripts/sim.mjs` PASS |
| 20-2 | sim.mjs v2 회귀 baseline (AC-37 유지) | 통과 | `node scripts/sim.mjs` exit 0, 29/29 — 무전략 W6 실패·킬존 잔여 11/20(55%, 밴드 정중앙). **스테이지 회귀(STAGE_WAVES·hpScale) 미도입 상태 기준선** — wave-balancer #7 착지 후 스테이지별 재실행 예정 |
| 20-3 | §12 상대 경로 감사 (선행) | 통과 | 계약 grep(선행 `/` src/href/url()/fetch/import) 매치 0건 — 현행 전체 코드베이스 |
| 20-4 | 매니페스트 42키 불변 (§5.5 신규 키 0개) | 통과 | 동적 import 키 수 42 — v3 신규 매니페스트 키 0개 계약 확인 (D17: 맵=기하+tint 재조합, 카드=미니맵 렌더) |
| 20-5 | v3 신규 모듈 뼈대 ↔ 계약 정합 | 통과 | storage.js(loadSave/saveSave·STORAGE_KEY='crystal_guard.v1'·DEFAULT_SAVE §4.11 정합), score.js(구독 6종 JSDoc §14.2·getScore·읽기 API 없음·economy 패턴), progress.js(getUnlockedCount/getBestScore/isUnlocked/getSnapshot §14.3·해금 규칙 D14 주석), scoring.js(SCORING 5키 killPoints+waveClearBonus+waveScale+lifeBonusPerLife §4.10 문자 단위), stageselect.js(발행 ui:stage-selected·구독 record-updated/unlocked·읽기 progress §1). **전부 TODO 스텁 — 로직 미구현** |
| 20-6 | index.html §7 v3 DOM 미착지 확인 | 기록(미결) | `#screen-stage-select`·`#hud-score`·`.stage-card[data-stage]`·결과화면 스테이지복귀 버튼 **부재** — architect index.html v3 갱신 대기 (§7 "architect는 컨테이너와 ID만 계약"). `#btn-cancel-placement`(v2)만 존재 |
| 20-7 | main/hud/screens v3 배선 미착지 확인 | 기록(미결) | main.js: stage-select 상태·stage:started·initScore/Progress/StageSelect·LEVELS·window.GAME.{stageIndex,score,progress} 전부 부재. hud.js: #hud-score/score:changed 부재. screens.js: score:finalized/스테이지복귀 부재 — engine-dev #8·ui-dev #9 대기 |
| 20-8 | §15 불변 baseline 고정 | 기록 | levels.js가 v2 커밋 4f7d346과 **byte-identical**(git diff 0, md5 07dd7cd7) — map-designer #6 LEVELS 착지 시 이 baseline으로 LEVELS[0] 문자 단위 diff. waves.js=WAVES만·balance.js=BALANCE만(STAGE_* 미도입) |

### v3 회귀 하네스 준비 (재사용 도구)

- `_workspace/qa_scratch/levels_v2_baseline.js` — v2 커밋 4f7d346의 levels.js 추출(md5 07dd7cd7). LEVELS[0] 회귀 대조 기준 원본.
- `_workspace/qa_scratch/qa-verify-v3-levels0.mjs` — LEVELS[0] === v2 문자 단위 불변 자동 검증(waypoints·tiles·decoTiles JSON 대조 + §13 D11 불변량 재확인 + LEVEL 별칭 동일 객체 + tint null). 현재는 LEVELS export 부재로 정상 reject(하네스 동작 확인) — map-designer #6 착지 시 즉시 실행.

### v3 보류 (담당 완료 통지 시 검증)

| # | 경계면 | 대기 대상 |
|---|---|---|
| W3-1 | 신규 이벤트 7종 emit↔on diff + 페이로드 문자 단위 (ui:stage-select-requested/stage-selected/stage:started/score:changed/score:finalized/stage:record-updated/stage:unlocked) | engine-dev #8 + ui-dev #9 |
| W3-2 | 점수 집계 정합 — score.js 가산값 == scoring.js 데이터, 판당 finalized 1회, 판매/업글/배속 무영향, kill/wave 소계 분해 | engine-dev #8 (+ wave-balancer #7 수치) |
| W3-3 | LEVELS[0] byte-identity(qa-verify-v3-levels0.mjs) + STAGE_WAVES[crystal_valley]===WAVES + STAGE_BALANCE.crystal_valley={120,20,1.0} | map-designer #6 + wave-balancer #7 |
| W3-4 | 신규 4스테이지 waypoints/tiles 정합성(PATH==waypoints), 기하 난이도 단조(경로길이·코너·건설밀도 1<2<3<4<5), decoTiles 스키마 | map-designer #6 |
| W3-5 | 저장 스키마↔로드 폴백(손상/부재/버전불일치→DEFAULT_SAVE), unlockedCount [1,5] 클램프, bestScores 길이5 정규화 | engine-dev #8 |
| W3-6 | 상태머신 stage-select 도달성·이탈, 해금 캐스케이드 단조성(N클리어→N+1, 재클리어 무해), stage:started→game:started 순서 불변식 | engine-dev #8 |
| W3-7 | index.html §7 v3 DOM(#screen-stage-select·#hud-score·.stage-card·복귀 버튼) + hud 점수 표시 + screens 분해 표시 | architect + ui-dev #9 |
| W3-8 | AC-38~48 통합 게이트 + sim.mjs 스테이지 회귀 exit 0 + 이벤트 43종 전역 diff + 상대경로 재감사 | 전 모듈 완료 후 |

---

## [검증 회차 21] 대상: engine-dev v3 코어 (Task #8 완료 — storage/score/progress/economy/main) — 2026-07-08

기준: 계약 v3.0 §3.10·§4.10·§4.11·§14. **결함 0건.** QA 독립 헤드리스(실 이벤트 버스 구동, 자체 보고 불신) — `qa-verify-v3-score-progress.mjs`(28단언)·`qa-verify-v3-unlock.mjs`(26단언) 전건 통과.

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 21-1 | 문법 게이트 (변경 5파일) | 통과 | storage/score/progress/economy/main `node --input-type=module --check` 파스 에러 0 |
| 21-2 | **저장 스키마↔로드 폴백** (W3-5, AC-48·§4.11) | 통과 | 가짜 localStorage 주입 독립 검증: 부재/손상JSON/버전불일치(99) 전부 freshDefault 폴백(크래시 0), unlockedCount [1,5] 클램프(99→5·-3→1), bestScores 길이5 정규화([100,-5,'x',200,300,999]→[100,0,0,200,300]), 저장 예외(QuotaExceeded) 흡수(throw 없음·경고만), 저장→로드 왕복 유지. DEFAULT_SAVE 공유 참조 오염 방지(freshDefault 새 인스턴스) 확인 |
| 21-3 | **점수 집계 정합** (W3-2, §4.10·§14.2) | 통과 | 실 버스 구동: killPoints 종류별 정확 가산(goblin 5·golem 200), score:changed{source,delta,score} 페이로드 일치, **누수(enemy:escaped) 점수 무영향**(combat.js가 killed/escaped 별도 발행 — 141/201/254행 확인), 미정의 타입 0점+무발행+경고1회, 웨이브 점수 공식 `waveClearBonus×(1+(index-1)(waveScale-1))` (waveScale=1.0 균등 검증), **판매/업글/건설/배속 점수 불변**(score 미구독) |
| 21-4 | **score:finalized 분해·1회** (AC-46·§14.2) | 통과 | game:won→finalized 정확히 1회, {stageIndex(stage:started 캐시), outcome:'won', kill, wave, life, total} 전 필드, life=livesLeft×lifeBonusPerLife(7×25=175), total===kill+wave+life, kill+wave==finalize 전 getScore(). 패배: outcome 'over'·life 0 |
| 21-5 | **해금 캐스케이드 단조성** (W3-6, D14·§14.3·AC-40/47) | 통과 | 실 버스 구동 26단언: 초기 S1만 해금, N클리어→N+1 해금+stage:unlocked{stageIndex:idx+1}, **재클리어 무해금**(조건 idx+1===unlockedCount), 낮은점수 최고점 유지·isNewBest false, 신기록 경신 isNewBest true, **건너뛴 클리어(S4 미해금 상태) 최고점만·해금 무발행(단조성)**, 패배 최고점만·해금 없음, unlockedCount 최대 5 상한(S5 클리어→6번째 해금 없음), getSnapshot 복사본(외부 변경 격리) |
| 21-6 | 이벤트 계약 diff — v3 7종 engine 측 | 통과 | emit↔on 위치 전수: stage:started(main emit 2·economy/score on 2), score:changed(score emit 2), score:finalized(score emit↔progress on), stage:record-updated/unlocked(progress emit). 페이로드 필드 §3.10 문자 단위. **미착지 구독처(ui:stage-select-requested의 ui/screens emit, score:changed의 hud on 등)는 ui-dev #9·entity #11 대기** — engine 측 계약은 완비 |
| 21-7 | 버스 순서 불변식 (§14.2 최종 웨이브 보너스) | 통과 | events.js:55 등록 순서 동기 호출 확인 → main.js:251 initScore(wave:cleared 구독)가 254 initWinLoseDetection(승리 판정)보다 먼저 등록 → 최종 wave:cleared가 score 웨이브 가산 후 game:won→finalized 순. 구독 순서 의존을 등록 시점으로 보장 |
| 21-8 | 상태머신 §8·오케스트레이션 §14.1 (정적) | 통과 | main: 'stage-select' 상태 추가, ui:start/stage-select-requested→goStageSelect, ui:stage-selected→enterStage, 재도전 캐시 stageIndex 재진입, enterStage 순서 initGrid/Path/Background→stage:started→game:started(불변식), 승리 total=waveTotal(wave:started 캐시)>0?:WAVES.length 폴백(D16). resolveLevels() LEVELS 부재 시 [LEVEL] 폴백(§15 v2 회귀 보존). **실런타임 도달성은 브라우저 스모크 소관(환경 사유)** |
| 21-9 | window.GAME v3 훅 (§8) | 통과 | stageIndex/score/progress getter + data.{LEVELS,SCORING} 추가(main.js:299-313). LEVEL은 LEVELS[0] 별칭 유지 |
| 21-10 | economy stage:started 캐싱 회귀 (§4.9) | 통과 | resolveStageBalance: STAGE_BALANCE[stageId] 캐시→game:started 리셋, 부재 시 BALANCE 폴백(120/20 회귀 보존). **sim.mjs exit 0, 29/29 유지**(economy 변경 후 재실행) — AC-37 무회귀. 상대경로 재감사 0건. 계약 외 이벤트 발행 0(engine 신규 emit 전수 §3 존재) |

### 회차 21 잔여 (미착지 의존 — 담당 완료 통지 시 검증)

- W3-2/점수 **최종 수치**: scoring.js는 현재 스키마 예시값(killPoints goblin5…golem200, waveClearBonus50, waveScale1.0, lifeBonusPerLife25). wave-balancer #7이 sim 튜닝값 확정 시 score 집계는 데이터만 읽으므로 로직 불변 — 수치 착지 시 재대조.
- W3-1 완결: score:changed의 hud 구독, ui:stage-select-requested의 screens 발행 등 **ui-dev #9** 착지 시 emit↔on 쌍 완성 확인.
- W3-6 런타임: stage-select 상태 실도달·이탈은 브라우저 스모크(playtester).

---

## [검증 회차 22] 대상: entity-dev v3 웨이브 캐싱 (Task #11 완료 — waves.js) — 2026-07-08

기준: 계약 v3.0 §4.8·§4.9·§14.1. **결함 0건.** QA 독립 헤드리스(`qa-verify-v3-waves-cache.mjs`, 실 이벤트 버스 구동) 전건 통과. 변경 파일: `src/systems/waves.js`만 (enemy.js 무수정 — 담당 주장과 일치, git 대조).

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 22-1 | 문법 게이트 | 통과 | waves.js `node --input-type=module --check` 파스 에러 0 |
| 22-2 | 경계면: waves가 stage:started 신규 구독 (W3-1 부분) | 통과 | on('stage:started', {stageId})(waves.js:88) ↔ main emit(main.js:187). 페이로드 stageId 소비. waves 발행 이벤트는 v2와 동일 5종(wave:started/cleared/countdown, enemy:spawned, boss:spawned) — 계약 외 신규 0 |
| 22-3 | **HP 배수 위치** (§4.9) | 통과 | Enemy(type, hpMultiplier×hpScale) — waves.js:165가 곱해 전달. Enemy 생성자 `(type, hpMultiplier)` 시그니처 불변(enemy.js:64), maxHp=round(def.hp×hpMultiplier)(enemy.js:71). 실 HP = base×WaveDef.hpMultiplier×hpScale. 독립 검증: goblin base 30×1.06×1 → maxHp 32 정확 |
| 22-4 | 데이터 소비 안전 접근 (§4.8·§4.9) | 통과 | STAGE_WAVES/STAGE_BALANCE **네임스페이스 import**(wavesData.*/balanceData.*) — wave-balancer #7 미착지 상태에서 링크 에러 0. resolveStageWaves 부재→WAVES 폴백+경고 1회(스테이지당), resolveHpScale 부재→1.0 폴백 |
| 22-5 | 폴백 경로 독립 검증 | 통과 | 실 버스: 부재 stageId('no_such_stage') 2회 발행→경고 정확히 1회(스팸 방지)+WAVES 폴백, stage:started 없이 game:started(v2 부팅)→total 10·maxHp 기본, 웨이브1 스폰수==그룹 count 합(8) |
| 22-6 | wave:started.total 소스 (D16) | 통과 | total=activeWaves.length(=10). main의 승리 판정 waveTotal 캐시(회차 21-8)와 정합 — 데이터가 진실, 하드코딩 아님 |
| 22-7 | combat.enemies 읽기 의존 (§1) | 통과 | export const enemies=[](combat.js:39) live 배열, 클리어 판정 enemies.length===0 읽기(waves.js:142) — §1 허용 방향. combat이 push/length=0로 in-place 변경 |
| 22-8 | sim.mjs 회귀 (AC-37) | 통과 | `node scripts/sim.mjs` exit 0, 29/29 — 무전략 W6·킬존 잔여 11/20 유지. sim은 game:started만 발행(stage:started 없음)→기본 WAVES·hpScale 1 경로=v2 동작 |

### 회차 22 잔여 (미착지 의존)

- **실 스테이지2~5 HP스케일·웨이브 구성 반영**: STAGE_WAVES/STAGE_BALANCE 데이터(wave-balancer #7) 착지 후 통합 회차(W3-8)에서 검증 — stage:started{stageId:'twin_snake' 등}→다른 웨이브·HP 확인. 현재는 crystal_valley 폴백만 실동작(정상, 데이터 갭).
- **STAGE_WAVES.crystal_valley===WAVES / STAGE_BALANCE.crystal_valley.hpScale===1.0 회귀 게이트**(§15/AC-41): wave-balancer #7 착지 시 확인 — 참조 동일성·hpScale 1.0이면 스테이지1이 v2와 byte-identical 동작.

---

## [검증 회차 23] 대상: map-designer v3 LEVELS 5스테이지 (Task #6 완료 — levels.js·tilemap.js) — 2026-07-08

기준: 계약 v3.0 §4.5·§4.7·§13·§15/AC-41. **결함 0건.** QA 독립 검증(자체 재계산 — path.js validateLevel 불신) 3하네스 전건 통과: `qa-verify-v3-levels0.mjs`(14)·`qa-verify-v3-all-levels.mjs`(전 5스테이지)·`qa-verify-v3-realload.mjs`(실 grid/path 로드+체비쇼프).

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 23-1 | 문법 게이트 | 통과 | levels.js·tilemap.js `node --input-type=module --check` 파스 에러 0 |
| 23-2 | **LEVELS[0] byte-identity** (W3-3, §15/AC-41) | 통과 | 회차20 준비 하네스: waypoints·tiles·decoTiles·entrance·goal v2(4f7d346) 문자 단위 동일, LEVEL 별칭===LEVELS[0](동일 객체), §13 D11 불변량(waypoints 8점·PATH 28·킬존 A/B/(13,4) GRASS), tint null(스테이지1 원색). 14/14 |
| 23-3 | **신규 4스테이지 PATH↔waypoints 정합** (W3-4, §4.5) | 통과 | **자체 재계산**(세그먼트 보간으로 통과 타일 집합 산출): 5스테이지 전부 양방향 차집합 0(waypoints 통과==PATH 집합), 축 정렬(대각·중복 세그먼트 0), 입구 col0·도착 col14, entrance==wp[0]·goal==wp[last]. tiles 10×15·도메인 {0,1,2} |
| 23-4 | 기하 수치 대조 (§4.7) | 통과 | 경로길이 재계산 1728/2560/2752/3584/4480 == map-designer 주장, PATH 28/41/44/57/71, GRASS 113/102/100/89/79 전건 일치 |
| 23-5 | **난이도 단조성** (§13.1·AC-44 기하 측면) | 통과 | 경로길이 단조 증가(1728<2560<2752<3584<4480), GRASS 밀도 단조 감소(113>102>100>89>79) — 스테이지 1<2<3<4<5 압박 점진. (밸런스 밴드 AC-44는 wave-balancer sim 소관) |
| 23-6 | **실 모듈 로드** (grid.js·path.js validateLevel) | 통과 | 실 initGrid+initPath 5스테이지 구동 console.error 0(validateLevel 통과), getTotalLength==세그먼트합, positionAt(끝)done=true·positionAt(0)==입구중심, 건설 가능 타일 79~113개(≥40 전략 여지) |
| 23-7 | decoTiles 스키마·체비쇼프≥2 (D11-E) | 통과 | 전 스테이지 key ∈ deco_* 4종, 항목 tiles=DECO 지시, PATH 충돌 0, DECO∩PATH=∅. **체비쇼프 독립 재계량**: crystal_valley/bramble_fork/twin_snake/narrow_gate 최소 2(외곽 한정), last_ridge decoTiles 0개(밀집 능선 — 제약 무관) |
| 23-8 | tint 렌더 (§4.7·§11) | 통과 | tilemap.applyTint: null 가드(LEVELS[0] v2 픽셀 동일), 형식 검증(#RRGGBB·alpha 0~0.5)+경고, multiply 블렌드, save/restore, **논리 좌표 COLS×TILE_SIZE**(물리 px 아님 — §11 정합). 5스테이지 tint 형식 전건 유효(alpha 0.12~0.32). 게임플레이 무관(밸런스 회귀 대상 아님) |
| 23-9 | 계약 외 이벤트/신규 emit | 통과 | levels.js·tilemap.js emit 0(map은 데이터/렌더 — §1 이벤트 미발행). 상대경로 감사 map 포함 0건(회차22 재확인) |

**W3-3(LEVELS[0])·W3-4(신규 스테이지) 해소.** map-designer #6 완결 — 잔여: STAGE_WAVES/STAGE_BALANCE 데이터와 결합한 실 스테이지 밸런스는 wave-balancer #7 검증(회차 24)에서 교차.

---

## [검증 회차 24] 대상: wave-balancer v3 밸런스·점수 (Task #7 — waves.js·balance.js·scoring.js·sim.mjs) — 2026-07-08

기준: 계약 v3.0 §4.8·§4.9·§4.10·§15/AC-41, GDD AC-44. **P2 1건(D24-1 — sim 게이트 exit 1).** 스키마·회귀·점수 배점은 전건 통과, 실엔진 스테이지 밴드만 실패.

### 통과 항목

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 24-1 | 문법 게이트 | 통과 | waves.js·balance.js·scoring.js `node --input-type=module --check` 파스 에러 0 |
| 24-2 | **STAGE_WAVES.crystal_valley===WAVES** (W3-3, §15/AC-41) | 통과 | sim 게이트 참조 동일성 PASS + 5키(crystal_valley/bramble_fork/twin_snake/narrow_gate/last_ridge), 각 길이 10 고정(D16), 전 그룹 enemy∈ENEMIES, 각 스테이지 골렘 W10에만 |
| 24-3 | **STAGE_BALANCE.crystal_valley={120,20,1.0}** (§15/AC-41) | 통과 | sim PASS: startGold 120·startLives 20·hpScale 1.0(스테이지1 v2 회귀). 5키+필드(startGold/startLives/hpScale≥1), hpScale 1→5 단조 증가(AC-44) |
| 24-4 | SCORING 배점 (§4.10·§13.2) | 통과 | killPoints ENEMIES 5키 전부·보스 단일 최고, 처치점수 난이도순(goblin 최저·brute 비보스 최고), waveClearBonus>0·waveScale≥1·lifeBonusPerLife>0. score.js는 이 데이터만 읽음(회차21 로직 검증 — 수치 착지로 로직 불변) |
| 24-5 | 점수 3요소 비중 (§13.2) | 통과 | sim Part5: S1 무피해 2679(처치55%+웨이브23%+라이프22%), 밴드 2409, 완벽도 스윙 +270(11% 재플레이 동기) — 3요소 균형 |
| 24-6 | 실엔진 S1 회귀 (AC-37) | 통과 | 무전략 W6 실패·킬존 잔여 11/20 — v2 밴드 유지 |
| 24-7 | 실엔진 S2 bramble_fork | 통과 | 킬존 클리어 잔여 40% (밴드 30~70%) |
| 24-8 | 난이도 단조 (킬존 잔여%) | 통과(경고) | sim: 55→40→X→X→X 비증가 판정 PASS — 단 X(S3~5 실패)가 포함된 단조성이라 실질 의미는 D24-1 해소 후 재판정 |

### 결함

| # | 심각도 | 경계면 | 증상 | 재현/확인 | 담당 |
|---|---|---|---|---|---|
| D24-1 | P2 | 밸런스 게이트 (AC-44·AC-37) | **wave-balancer 자체 게이트 sim.mjs가 exit 1로 실패 중인데 Task #7이 완료 마킹됨** (v2 D16-2 재발 패턴). 실패 3항목: 실엔진 S3 twin_snake·S4 narrow_gate·S5 last_ridge 킬존 봇이 **클리어 자체 실패**("현재 실패"). **의심 지점(QA 근본원인 진단): sim의 킬존 봇 큐 갭 — 밸런스 결함 아닐 수 있음.** `KILLZONE_QUEUES = {crystal_valley: ...}`만 정의(sim.mjs:179), S2~5는 `|| KILLZONE_ACTIONS`(crystal_valley 좌표) 폴백. 그 좌표가 신규 맵에서 **PATH 타일(건설 불가)**: bramble 5개·twin_snake 2개·narrow_gate 4개·last_ridge 6개 충돌(QA 독립 재계산). 봇이 타워를 못 지어 클리어 실패 — **스테이지 기하에 맞는 킬존 큐 부재가 원인**이지 STAGE_WAVES/hpScale 수치 결함이라 단정 불가. S3~5 실 밸런스는 봇이 제대로 플레이해야 판정 가능 | `node scripts/sim.mjs; echo $?` → 1 (45항목 중 3 FAIL, line 80~82) / 좌표 충돌: QA 독립 재계산(crystal 킬존 10좌표 vs LEVELS[n].tiles PATH 대조) | wave-balancer |

### 회차 24 잔여

- **D24-1 해소 트리거**: wave-balancer가 sim.mjs에 스테이지 2~5 킬존 봇 큐(각 맵 GRASS 명당 좌표)를 추가 → 봇이 실기하로 플레이 → 실제 AC-44 밴드 판정. 그 후 (가) sim exit 0이면 밸런스 정상 (나) 여전히 밴드 이탈이면 STAGE_BALANCE(hpScale)·STAGE_WAVES 수치 재튜닝. **W3-8 통합 게이트는 sim exit 0 요구 — D24-1 미해소 시 v3 QA 종결 불가.**
- 완료 보고는 최종 저장 후 게이트 재실행 기준 권고(v2 D16-2 교훈 — [[verify-gate-after-final-save]]).

---

## [검증 회차 25] 실데이터 재검증 (Wave A 데이터 3종 착지 — team-lead 요청) + D24-1 진척 — 2026-07-08

기준: 계약 v3.0 §4.8·§4.9·§4.10·§15. **실데이터 통합 4항목 중 3 통과, D24-1(sim) P2 유지(성격 변경).** 폴백으로 통과했던 경계면을 실데이터로 재검증(engine #8·entity #11 무회귀 확인).

| # | 경계면 (team-lead 재검증 4점) | 판정 | 확인 방법 |
|---|---|---|---|
| 25-1 | LEVELS[0] 불변 + 신규 4개 로드 (점1) | 통과 | 3하네스 재실행 exit 0: qa-verify-v3-levels0(byte-identity 14/14), all-levels(5스테이지 정합·단조), realload(실 grid/path console.error 0). levels.js 회차23 이후 무변경 |
| 25-2 | **STAGE_WAVES/STAGE_BALANCE ↔ waves hpScale·economy 캐싱 실데이터** (점2) | 통과 | `qa-verify-v3-realdata-integ.mjs` 실 버스 구동: 5스테이지 진입 시 economy 시작자원 == STAGE_BALANCE(전부 120/20), **hpScale 실반영**(첫 적 goblin maxHp 32/34/36/40/44 = base×hpMult×hpScale[1/1.06/1.14/1.24/1.36] 정확), hpScale 단조 비감소. STAGE_WAVES 5키 길이10·crystal_valley===WAVES |
| 25-3 | **SCORING ↔ score.js 무피해 완주 이론 최고점** (점3, 독립 재확인) | 통과 | QA 독립 이론 계산 vs score.js 실구동 대조: crystal_valley 처치 1463 + 웨이브 612 + 라이프 600 = **2675 완전 일치**. 요소 분해(kill/wave/life) score:finalized 페이로드 정합. wave-balancer 1차 대조와 독립적으로 재확인 |
| 25-4 | **sim.mjs 스테이지 회귀 5/5 exit 0** (점4) | **미통과 (D24-1 유지)** | `node scripts/sim.mjs` exit 1, 45항목 중 4 FAIL. **아래 D24-1 성격 변경 참조** |

### D24-1 성격 변경 (P2 유지) — 하네스 갭 해소, 순수 밸런스 곡선 문제로 격리

wave-balancer가 회차24 리포트의 **하네스 갭을 수정함**(sim.mjs 13:05): `buildKillzoneQueue(level)`가 각 맵 커버리지 상위 GRASS 12타일을 자동 선정 → 봇이 실기하로 정상 플레이(더 이상 crystal 좌표를 PATH에 배치하지 않음, QA 확인). **원 진단(큐 갭) 해소.** 그러나 sim은 여전히 exit 1 — 이제 **순수 밸런스 곡선 문제**로 분리됨:

| 실패 항목 | 증상 | 데이터 | 신호 |
|---|---|---|---|
| S2 bramble_fork | 잔여 95% (밴드 30~70%) — **너무 쉬움** | hpScale 1.06, 총EHP 34k | C누수 W1:1 이후 전부 0 |
| S4 narrow_gate | W5 패배 (클리어 실패) — **너무 어려움** | hpScale 1.24, 총EHP 53k | 누수 W1:3 W2:2 W3:5 W4:3 |
| S5 last_ridge | W3 패배 — **크게 어려움** | hpScale 1.36, 총EHP 74k | 누수 W1:7 W2:11 |
| 난이도 단조 | 킬존 잔여% 55→95→60→X→X (S2가 S1 상회 — 비단조) | | S2 과이지 + S4/5 급락 |

- **결정성 확인**: sim 5회 반복 전부 동일 결과(Math.random 0건) — 안정적 재현. 총EHP 곡선은 단조(30k→34k→43k→53k→74k)이나 실엔진 클리어 결과는 비단조 → **hpScale만으로는 기하 난이도(경로길이·병목)를 상쇄 못함**. narrow_gate(병목·GRASS 89)·last_ridge(최장·GRASS 79)는 봇이 명당을 충분히 확보해도 물량이 방어를 초과.
- **QA 판정**: 코드/하네스 결함 아님 — STAGE_BALANCE hpScale·STAGE_WAVES 조합의 **수치 재튜닝** 영역(wave-balancer 소관). S2는 압박 상향(hpScale↑ 또는 물량↑), S4/S5는 완화(hpScale↓ 또는 시작자원↑ 또는 물량↓). **W3-8 통합 게이트 sim exit 0 요구 — D24-1 미해소 시 v3 종결 불가.**

### 회차 25 판정: engine #8·entity #11·map #6 실데이터 무회귀 확정. 잔여 = D24-1(밸런스 재튜닝) 단일 블로커.

---

## [검증 회차 26] 대상: ui-dev v3 UI (Task #9 완료 — stageselect/hud/screens + index.html §7 DOM) — 2026-07-08

기준: 계약 v3.0 §3.10·§7·§14. **결함 0건.** QA 독립 UI 헤드리스(`qa-verify-v3-ui.mjs`, 최소 DOM 셰임+실 이벤트 버스, 12단언) 전건 통과. index.html은 architect가 §7 v3 컨테이너 추가(#hud-score·#screen-stage-select).

| # | 경계면 | 판정 | 확인 방법 |
|---|---|---|---|
| 26-1 | 문법 게이트 (ui 3파일 + 전 src) | 통과 | stageselect/hud/screens `node --check` + src 36파일 전수 파스 에러 0 |
| 26-2 | **§7 v3 DOM 계약** (W3-7) | 통과 | index.html: #hud-score·#screen-stage-select 존재(architect 추가). 결과화면 스테이지복귀 버튼 #btn-stages-victory/defeat는 screens.js가 동적 생성(§7 "내부 구성 ui-dev 재량" — 계약 위반 아님). stageselect: .stage-card[data-stage=0..4]·.stage-best·.locked·.cleared 셀렉터 실생성 확인 |
| 26-3 | **v3 이벤트 emit↔on 최종 diff (7종)** (W3-1 완결) | 통과 | 전 7종 emit·on 양측 존재(고아 0): ui:stage-select-requested(emit 2 screens/ on 2 main·stageselect), ui:stage-selected(emit 2 screens·stageselect/ on 1 main), stage:started(emit 1 main/ on 4 economy·score·waves·screens), score:changed(emit 2 score/ on 1 hud), score:finalized(emit 1 score/ on 2 progress·screens), stage:record-updated(emit 1 progress/ on 2 screens·stageselect), stage:unlocked(emit 1 progress/ on 1 stageselect) |
| 26-4 | **stageselect ↔ progress 읽기 API** (§1·§14.3) | 통과 | 실 버스 구동: getUnlockedCount/getBestScore/isUnlocked 읽기, 카드 5개 생성·data-stage 0~4, S1(해금) 클릭→ui:stage-selected{stageIndex:0}, S3(잠김) 클릭→무발행(shake만), locked/cleared 클래스 토글, 해금 후 S2 카드 잠금 해제·최고점 "최고 645" 표시. drawMinimap은 LEVELS[i].tiles/tint 읽기(신규 이미지 0 — §5.5) |
| 26-5 | **screens ↔ score:finalized 페이로드·순서 불변식** (AC-46) | 통과 | renderScorePanel이 score:finalized {kill,wave,life,total} 요소 분해 + stage:record-updated {best,isNewBest} 신기록 표시. **순서 불변식 직접 관측**: game:won emit 스택 내 record→finalized→(screens game:won 후속 핸들러) 순 — score(먼저 등록)→progress 중첩 캐스케이드가 screens 렌더 전 완료(init 순서 initScore 252<initScreens 262 보장). 승리 화면 hidden 해제 |
| 26-6 | hud ↔ score:changed (AC-45) | 통과 | on('score:changed', {score, delta}) → setScore(score)+delta 부호별 펄스(hud.js:139). game:started에서 setScore(0) 리셋(score.js 동일 트리거) |
| 26-7 | 격리 (§1 부분 재실행) | 통과 | main safeInit로 stageselect 포함 ui 개별 격리(main.js:263). stageselect는 #screen-stage-select 부재 시 자가 생성(architect 미반영 대비)·progress 읽기 실패에도 카드 렌더 폴백. screens는 finalized 미도달 시 점수판 비우고 안전 강등(renderScorePanel f 가드) |
| 26-8 | 상대경로 재감사 (전 ui 착지 후) | 통과 | §12 grep 매치 0건 |

**W3-1(이벤트 쌍)·W3-7(DOM+표시) 해소.** ui-dev #9 완결 — v3 헤드리스 경계면 전건 그린.

### v3 QA 현황 (회차 20~26)

| 모듈 | Task | 회차 | 판정 |
|---|---|---|---|
| engine-dev (storage/score/progress/economy/main) | #8 | 21 | 통과 |
| entity-dev (waves 캐싱) | #11 | 22 | 통과 |
| map-designer (LEVELS 5) | #6 | 23 | 통과 |
| wave-balancer (STAGE_*/SCORING) | #7 | 24·25 | 스키마·회귀·점수 통과 / **D24-1(P2 sim exit 1) 미해소** |
| 실데이터 통합 재검증 | — | 25 | 3/4 통과(sim만 D24-1) |
| ui-dev (stageselect/hud/screens) | #9 | 26 | 통과 |

**v3 유일 블로커: D24-1 (P2, sim.mjs exit 1 — 밸런스 곡선 재튜닝, wave-balancer).** 나머지 전 경계면 헤드리스 그린. D24-1 해소 시 W3-8 통합 게이트(sim exit 0 + AC-38~48 종합) 실행 → v3 QA 종결. 브라우저 스모크(AC-20/상태머신 실도달/모바일)는 playtester 이관.

---

## [검증 회차 27] 통합 배선 재확인 + W3-8 게이트 사전 스테이징 — 2026-07-08

engine-dev main.js initStageSelect 배선·architect index.html §7 DOM·ui-dev 재사용 경로 착지 통지 수신 후 재확인. **결함 0건. D24-1(P2) 유지 — 유일 블로커.**

| # | 항목 | 판정 | 확인 방법 |
|---|---|---|---|
| 27-1 | main.js initStageSelect 배선 실재 | 통과 | main.js:63 import + :263 safeInit('ui/stageselect') — 회차26 검증본과 동일(무회귀), `node --check` PASS |
| 27-2 | index.html §7 v3 DOM 실재 | 통과 | :20 #hud-score, :37 #screen-stage-select(class="screen hidden") — architect 반영. ui-dev 재사용 경로(계약 노드 있으면 getElementById 재사용·중복 0)와 정합 |
| 27-3 | SCORING 재튜닝 추종 (하드코딩 0 확인) | 통과 | wave-balancer SCORING 조정(waveClearBonus 50→40·waveScale 1.0→1.12·lifeBonusPerLife 25→30). score.js·hud·screens는 데이터 read로 자동 추종 — 하네스 재실행에서 wave index5→59·life 7×30=210·이론 최고점 2675 자동 반영, 코드 무변경(§4.10 매직넘버 금지 준수) |
| 27-4 | **W3-8 통합 게이트 스테이징** | 통과(게이트 자체) | `_workspace/qa_scratch/qa-v3-gate.sh` 작성 — 문법(36파일)+헤드리스 8하네스+sim+이벤트7종 고아검사+상대경로 5스텝 종합. **드라이런: 3(sim/D24-1) 외 전 스텝 그린.** D24-1 해소 시 이 스크립트 1회로 W3-8 종합 판정 |
| 27-5 | D24-1 현황 재확인 | 미해소 | sim.mjs exit 1(4 FAIL), balance.js/waves.js mtime 12:5x(회차25 이후 밸런스 재튜닝 미착지). S2 95%·S4/S5 클리어실패·단조성 실패 동일 |

**v3 헤드리스 QA는 D24-1 단일 항목에서만 red.** 나머지 전 경계면(이벤트·스키마·점수·해금·저장·LEVELS 회귀·UI 순서·배선·DOM·상대경로) 그린 확정. wave-balancer 밸런스 재튜닝 착지 시 `bash _workspace/qa_scratch/qa-v3-gate.sh`로 즉시 W3-8 종합 판정 → v3 헤드리스 QA 종결. 브라우저 스모크는 playtester 이관.

---

## [검증 회차 28] W3-8 v3 통합 게이트 — D24-1 종결 + 헤드리스 QA 종결 — 2026-07-08

기준: 계약 v3.0 전체, GDD AC-38~48. **D24-1(P2) 종결. W3-8 통합 게이트 전건 그린. v3 헤드리스 QA 종결.** wave-balancer #7 밸런스 재튜닝 착지 통지 후 자체 보고 불신 원칙으로 독립 재검증.

### D24-1 종결

wave-balancer가 밸런스 곡선 재튜닝 착지(hpScale 1.0/1.10/1.26/1.34/1.42 — S4/S5 완화, S2 상향). **QA 독립 재현**: `node scripts/sim.mjs` **exit 0, 45/45, 5회 반복 완전 동일(결정적)**. 킬존 봇 5스테이지 전부 클리어, 잔여 라이프 밴드:

| 스테이지 | hpScale | 킬존 잔여% | AC-44 밴드(30~70%) |
|---|---|---|---|
| S1 crystal_valley | 1.0 | 55% (v2 고정) | ✓ |
| S2 bramble_fork | 1.10 | 70% | ✓ |
| S3 twin_snake | 1.26 | 60% | ✓ |
| S4 narrow_gate | 1.34 | 60% | ✓ |
| S5 last_ridge | 1.42 | 50% | ✓ |

신규 S2→S5 단조 비증가(70→60→60→50) — AC-44 통과. 회차24·25의 하네스 갭·밸런스 곡선 문제 전부 해소. **완료 보고가 최종 저장 후 게이트 재실행 기준(exit 0)이었음 — v2 D16-2 교훈 반영 확인([[verify-gate-after-final-save]]).**

### W3-8 통합 게이트 (`qa-v3-gate.sh` — 5스텝 종합)

| 스텝 | 항목 | 판정 |
|---|---|---|
| 1 | 문법 게이트 (src 36파일 + sim) | ✓ 파스 0 |
| 2a~2h | 헤드리스 8하네스 (LEVELS0 회귀·5스테이지 정합·실로드·score/storage·해금 캐스케이드·waves 캐싱·실데이터 통합·UI 순서) | ✓ 전건 |
| 3 | sim.mjs 스테이지 회귀 (AC-37·AC-44) | ✓ exit 0, 45/45 |
| 4 | v3 이벤트 7종 emit↔on 고아 검사 | ✓ 고아 0 |
| 5 | 상대경로 감사 (§12) | ✓ 0건 |

**게이트 exit 0.** 실데이터 재확인(재튜닝 반영): hpScale maxHp 32/35/40/43/45 실반영, SCORING(waveClearBonus 40·waveScale 1.12·lifeBonusPerLife 30) score.js 자동 추종(하드코딩 0 — §4.10), STAGE_WAVES.crystal_valley===WAVES·WAVES 원본 라인 무변경(추가만 — §15/AC-41), 이론 최고점 2675 정합.

### AC-38~48 헤드리스 커버리지 매핑

| AC | 항목 | 판정 근거 (회차) |
|---|---|---|
| AC-38 | 스테이지 선택 5카드 나열 | 26-2/26-4 (.stage-card 5·이름·잠금·최고점) |
| AC-39 | 초기 S1만 선택가능·2~5 잠김 | 21-5·26-4 (초기 unlockedCount 1) |
| AC-40 | N클리어→N+1 해금·재접속 유지 | 21-5·25 (해금+localStorage 저장 왕복) — **실브라우저 재접속은 playtester** |
| AC-41 | 각 스테이지 경로 상이·S1=crystal_valley 불변 | 23-2·28 (byte-identity·WAVES 무변경) |
| AC-42 | 진입 시 자원 초기화·독립 한 판 | 25-2 (시작자원 120/20 실반영·이월 없음) |
| AC-43 | 게임중/결과→스테이지 선택 복귀 | 26-3 (ui:stage-select-requested emit↔on) — **실도달 playtester** |
| AC-44 | S1→5 난이도 상승 밴드 | 28 (sim 킬존 70/60/60/50 단조·exit 0) |
| AC-45 | HUD 실시간 점수 | 26-6 (score:changed↔hud) |
| AC-46 | 결과 화면 점수 분해 | 21-4·26-5 (finalized kill/wave/life 분해) |
| AC-47 | 신기록 표시·저장·반영 | 21-5·26-5 (isNewBest·record-updated·저장) — **실브라우저 playtester** |
| AC-48 | localStorage 부재/손상 크래시 없음 | 21-2 (부재/손상/버전불일치 폴백) |

- **헤드리스 원천 달성 8건** (AC-38/39/41/42/44/45/46/48), **실브라우저 국면 잔여 3건** (AC-40 재접속·AC-43 실도달·AC-47 실렌더 — 로직/저장은 헤드리스 확정, 실렌더/영속 왕복만 playtester).

### v3 QA 최종 집계 (회차 20~28)

| 심각도 | 건수 | 상태 |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 1 (D24-1) | **종결** (sim exit 0·45/45·결정적, AC-44 밴드 정합) |
| P3 | 0 | — |

**미결 0건.** v3 헤드리스 QA 종결 — 이벤트 43종 emit↔on 고아 0, 스키마·점수 집계·해금 캐스케이드·저장 폴백·LEVELS[0] 회귀·5스테이지 기하·UI 순서 불변식·상대경로·문법 전건 그린. 재사용 게이트 `_workspace/qa_scratch/qa-v3-gate.sh`. **playtester 이관**: AC-20(브라우저 콘솔 0)·AC-40/47(재접속 영속 실왕복)·AC-43(상태머신 실도달)·AC-34(모바일 세로)·AC-27/29/31(v2 육안) — 브라우저 자동화 환경 필요.
