---
name: td-playtest-qa
description: "타워 디펜스 게임의 품질 검증 방법론 — 경계면 교차 검증(이벤트 발행↔구독, 데이터 스키마↔소비자, 에셋 키↔매니페스트), 문법 게이트, Chrome 브라우저 실플레이 테스트 절차. QA, 검증, 통합 확인, 플레이테스트, 버그 재현, '게임 되는지 확인' 요청 시 반드시 사용."
---

# TD Playtest & QA — 검증 방법론

QA의 핵심은 "파일이 존재하는가"가 아니라 **경계면 양쪽을 동시에 열어 비교하는 것**이다. 모듈 단위 완벽함은 조립 결함을 보장하지 않는다.

## Part A. 경계면 교차 검증 (qa-engineer)

### A-1. 문법 게이트 (모듈 완료 보고마다)

```bash
cd /Users/robin/Downloads/tower-defense
for f in $(find src -name "*.js"); do node --check "$f" 2>&1 | grep -v "^$" ; done
# ES 모듈 문법 오탐 시:
node -e "import('./src/main.js').then(()=>console.log('OK')).catch(e=>{console.error(e);process.exit(1)})"
```

### A-2. 경계면 체크리스트

각 항목은 **양쪽 파일을 모두 열어** 문자 단위로 대조한다. 한쪽만 읽고 통과 처리 금지.

| # | 경계면 | 발행/생산 측 | 구독/소비 측 | 검증 방법 |
|---|---|---|---|---|
| 1 | 이벤트 이름 | `emit('...')` 전체 grep | `on('...')` 전체 grep | 양쪽 집합 diff — 발행만 있고 구독 없는 이벤트, 구독만 있고 발행 없는 이벤트를 목록화 |
| 2 | 이벤트 페이로드 | emit의 객체 리터럴 필드 | 핸들러가 접근하는 필드 | 구독 측이 읽는 필드가 발행 객체에 전부 있는가 |
| 3 | 데이터 스키마 | `src/data/*.js` 필드명 | `entities/`, `ui/`, `systems/`의 접근 코드 | `damage` vs `dmg` 류 이름 불일치, 단위 불일치(초 vs ms) |
| 4 | 에셋 키 | `assets/manifest.js` 키 + 실파일 | `get('key')` 호출 전체 | 키 존재 + `ls`로 경로 실파일 확인 |
| 5 | 공개 API | `map/grid.js`, `map/path.js` export 시그니처 | entity/ui의 호출부 | 인자 순서·단위(거리 vs 진행률 0~1) 일치 |
| 6 | 상태 머신 | `main.js`의 상태 전이 | ui의 화면 전환 조건 | 도달 불가 상태, 빠져나올 수 없는 상태 |

grep 예시:

```bash
grep -rn "emit(" src --include="*.js" | grep -o "emit('[^']*'" | sort -u
grep -rn "\.on(" src --include="*.js" | grep -o "on('[^']*'" | sort -u
grep -rn "get('" src --include="*.js" | grep -o "get('[^']*'" | sort -u
```

### A-3. 리포트 형식

`_workspace/05_qa_report.md`에 증분 추가:

```
## [검증 회차 N] 대상: {모듈} ({날짜})
| # | 심각도 | 경계면 | 증상 | 재현/확인 방법 | 담당 |
P0 실행불가 / P1 핵심루프 파손 / P2 기능결함 / P3 사소
통과 항목도 "확인 방법(파일:줄, 명령)"과 함께 기록. 미검증 항목은 사유와 함께 "미검증" 표기.
```

같은 경계면 결함 2회 재발 → system-architect에게 계약 문서 모호성 보고 (개별 수정보다 계약 수정이 먼저다).

## Part B. 브라우저 플레이테스트 (playtester)

### B-1. 준비

1. 서버 확인: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000` → 200이 아니면 오케스트레이터에 보고 (직접 서버를 띄우지 않는다 — 이미 떠 있는 세션과 포트 충돌)
2. 브라우저 도구 일괄 로드 (ToolSearch 1회):
   `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__gif_creator`
3. `tabs_context_mcp` 호출 후 **반드시 새 탭 생성** → `http://localhost:8000` 이동

### B-2. 정상 플레이 시나리오

1. 타이틀 화면 스크린샷 → 게임 시작
2. 타워 4종을 각각 1기 이상 건설 (상점 클릭 → 타일 클릭)
3. 웨이브 시작 → 첫 킬 확인 (골드 증가, 이펙트, 사운드 이벤트)
4. 타워 1기 업그레이드, 타워 1기 판매 (골드 정산 확인)
5. 최소 5웨이브 진행 — 웨이브마다 HUD 수치와 `window.GAME` 상태 대조:
   `javascript_tool: JSON.stringify({g:GAME.gold,l:GAME.lives,w:GAME.wave,e:GAME.enemies.length})` → `console.log`로 출력 후 read_console_messages로 수집 (alert 금지)
6. 배속 2x 전환 후 1웨이브 진행
7. 가능하면 승리/패배 화면 도달 → 스크린샷

### B-3. 파괴적 플레이 시나리오

- 길/장식물 타일에 건설 시도 → 거부 피드백이 보이는가
- 골드 부족 상태에서 구매·업그레이드 연타 → 음수 골드/NaN 발생 여부
- 웨이브 진행 중 "다음 웨이브" 버튼 연타 → 중복 스폰 여부
- 일시정지 중 건설/판매 시도, 일시정지↔재개 연타
- 게임 오버 직전(라이프 1) 상황 만들기 → 패배 처리 정확성

### B-4. 수집·리포트

- 콘솔: `read_console_messages`로 세션 전체 에러/경고 수집 (`pattern: "error|Error|NaN|undefined"` 활용)
- 주요 구간(첫 전투, 보스 웨이브)은 gif_creator로 기록 — 액션 전후 여유 프레임 포함
- `_workspace/06_playtest_report.md`: ①버그 표(재현 절차·기대·실제·캡처 경로·심각도) ②체감 서술(난이도 곡선, UX 마찰, 연출 과부족 — 플레이어 언어로) ③콘솔 로그 요약
- 이전 리포트가 있으면 기존 버그의 해결/미해결 재확인부터 수행한다

### B-5. 중단 규칙

같은 조작 2~3회 실패, 페이지 무응답, 도구 에러 반복 시 — 재시도를 멈추고 실패 상태를 캡처해 보고한다. 하얀 화면도 결과다 (P0로 리포트).
