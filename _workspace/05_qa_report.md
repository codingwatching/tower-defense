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
