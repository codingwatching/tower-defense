---
name: td-orchestrator
description: "타워 디펜스 게임 제작 에이전트 팀(12명)을 조율하는 오케스트레이터. '게임 만들어/제작해/빌드해', '타워 디펜스 개발' 같은 초기 제작 요청은 물론, 후속 작업 — 게임 수정, 버그 수정, 밸런스/난이도 조정, 에셋 재생성/추가/퀄리티 향상, 스프라이트 시트/애니메이션 적용, UI 개선, 모바일 최적화, GitHub Pages 배포, 이펙트/사운드 보완, 웨이브/맵 추가, 스테이지/레벨 추가, 다단계 스테이지, 점수/스코어/최고기록 시스템, 타워 업그레이드 개편, 다시 실행, 재실행, 업데이트, 보완, 이전 결과 개선, 플레이테스트만 다시, QA만 다시 — 요청 시에도 반드시 이 스킬을 사용할 것. 단순 코드 질문은 직접 응답 가능."
---

# TD Orchestrator — 타워 디펜스 제작 총괄

12개 전문 에이전트를 조율해 HTML Canvas 타워 디펜스 게임을 제작·개선하는 통합 워크플로우.

## 실행 모드: 하이브리드

| Phase | 모드 | 이유 |
|---|---|---|
| 1 설계 | 서브 (생성-검증 순차) | GDD→아키텍처는 강한 순차 의존, 팀 오버헤드 불필요 |
| 2 병렬 제작 | 팀 (팬아웃 + 점진 QA) | 개발자 간 인터페이스 질의·완료 통지·결함 리포트가 실시간 필요 |
| 3 통합 검증 | 팀 유지 (소수) | 통합자↔QA↔담당자 피드백 루프 |
| 4 플레이테스트 | 서브 (독립 검증) | 선입견 없는 단독 플레이가 목적, 팀 통신 불필요 |
| 5 승인·보고 | 서브 | 디렉터 단독 판정 |

**공통 규칙: 모든 Agent 호출에 `model: "opus"` 을 명시한다** (이 하네스의 사용자 지정 모델 정책).

## 에이전트 구성

| 에이전트 | 역할 | 사용 스킬 | 주 산출물 |
|---|---|---|---|
| game-director | 기획·승인 | — | `_workspace/01_director_gdd.md` |
| system-architect | 계약·뼈대 | td-code-standards | `_workspace/02_architect_architecture.md`, `assets/manifest.js`, 뼈대 |
| asset-artist | 이미지 에셋 | td-asset-pipeline | `assets/images/**`, `_workspace/03_artist_asset-report.md` |
| engine-dev | 코어·통합 | td-code-standards | `src/core/*`, `src/main.js` |
| map-designer | 맵·경로 | td-code-standards | `src/map/*`, `src/data/levels.js` |
| entity-dev | 전투 엔티티 | td-code-standards | `src/entities/*`, `src/systems/combat.js` |
| ui-dev | HUD·메뉴 | td-code-standards | `src/ui/*` |
| fx-dev | 이펙트 | td-code-standards | `src/fx/*` |
| audio-dev | 사운드 합성 | td-code-standards | `src/audio/*` |
| wave-balancer | 밸런스 | td-balance-design | `src/data/*`, `scripts/sim.mjs`, `_workspace/04_balancer_report.md` |
| qa-engineer | 경계면 QA | td-playtest-qa | `_workspace/05_qa_report.md` |
| playtester | 실플레이 | td-playtest-qa | `_workspace/06_playtest_report.md` |

## 워크플로우

### Phase 0: 컨텍스트 확인 (후속 작업 지원)

1. `_workspace/` 존재 여부 확인:
   - **미존재** → 초기 실행. Phase 1로
   - **존재 + 부분 수정 요청** (버그·밸런스·에셋·UI 등) → **부분 재실행**: 아래 라우팅 표로 해당 에이전트만 재호출. 프롬프트에 관련 이전 산출물 경로와 사용자 피드백을 포함
   - **존재 + 전면 새 게임 요청** → 기존 `_workspace/`를 `_workspace_{YYYYMMDD_HHMMSS}/`로 이동 후 Phase 1로
2. **부분 재실행 라우팅:**

| 요청 유형 | 재호출 (model: "opus") | 후속 검증 |
|---|---|---|
| 밸런스/난이도 | wave-balancer | playtester 재테스트 |
| 에셋 재생성/추가 | asset-artist (키 변경 시 system-architect 먼저) | qa-engineer 에셋 키 검증 |
| 버그 수정 | qa-engineer로 원인 경계면 진단 → 담당 개발자 | playtester 해당 시나리오 재현 |
| UI/UX 개선 | ui-dev | playtester |
| 이펙트/사운드 | fx-dev / audio-dev | playtester |
| 웨이브/맵 추가·맵 퀄리티 | wave-balancer / map-designer (+asset-artist 타일) | qa + playtester |
| 스테이지 확장(다중 레벨) | system-architect(레벨 배열·진행 상태 계약) → map-designer(레벨 N개) ‖ wave-balancer(레벨별 웨이브·난이도) → ui-dev(스테이지 선택·진행 화면) | qa 경계면 + playtester |
| 점수 시스템 | system-architect(점수 이벤트·집계·저장 계약) → entity-dev/systems(가산 로직) + ui-dev(HUD·결과 화면) + wave-balancer(점수 배점) | qa(점수 정합) + playtester |
| 에셋 시트/애니메이션 적용 | system-architect(아틀라스 계약) → asset-artist ‖ engine-dev(로더) → entity-dev(draw) | qa 경계면 + playtester |
| 모바일 최적화 | engine-dev(입력·DPR·캔버스) + ui-dev(터치 UX·반응형) | playtester (모바일 뷰포트) |
| GitHub Pages 배포 | qa-engineer(상대 경로·대소문자 감사) → 오케스트레이터(.nojekyll, gh로 Pages 활성화, 사용자 승인 후) | 배포 URL 로드 확인 |
| 기획 변경 | game-director → 영향 에이전트 연쇄 | 전체 Phase 3~5 |

**복합 업그레이드 (위 유형 3개 이상 동시):** 부분 재실행을 나열하지 말고 미니 설계를 거친다 — game-director가 GDD 개정(범위·승인 기준 추가) → system-architect가 계약 개정(아틀라스·모바일·경로 규약) → 영향 에이전트만 Wave로 병렬 투입 → Phase 3~5 정상 수행. 계약을 먼저 고치지 않고 병렬 투입하면 경계면이 어긋난다.

3. 부분 재실행 완료 후에도 Phase 5의 보고는 수행한다.

### Phase 1: 설계 (생성-검증)

**실행 모드:** 서브 에이전트 순차

1. `_workspace/` 생성, 사용자 요구를 `_workspace/00_input.md`에 저장
2. `Agent(subagent_type: "game-director", model: "opus")` — 요구사항 전달, GDD 작성
3. `Agent(subagent_type: "system-architect", model: "opus")` — GDD 기반 계약 문서 + `index.html`/`src/` 뼈대 + `assets/manifest.js` 생성
4. game-director에게 SendMessage로 아키텍처가 GDD 의도를 훼손하지 않는지 확인 (반려 시 3번 1회 재실행 — 최대 2회)

### Phase 2: 병렬 제작

**실행 모드:** 에이전트 팀 (named agents + SendMessage + TaskCreate)

1. TaskCreate로 작업 등록 (의존성 명시): 코어 5건 + 피처 3건 + QA 상시 1건
2. **Wave A (코어·에셋·데이터)** — 한 메시지에서 동시 스폰, 전원 `run_in_background: true`, `model: "opus"`, `name`은 에이전트명과 동일:
   - asset-artist, engine-dev, map-designer, entity-dev, wave-balancer
   - qa-engineer도 함께 스폰 — 각 완료 보고마다 해당 모듈 경계면을 즉시 검증 (incremental QA)
3. **Wave B (피처)** — engine-dev의 "코어 사용 가능" 통지 후 스폰: ui-dev, fx-dev, audio-dev
4. **팀 통신 규칙:**
   - 인터페이스 질의·변경은 system-architect에게 (SendMessage로 기존 컨텍스트 이어감)
   - 완료 보고는 오케스트레이터와 qa-engineer에게
   - qa-engineer의 결함 리포트는 담당자에게 직접 발신, P0/P1은 오케스트레이터 동시 보고
   - 수정은 소유권 규칙 준수 — 남의 파일 직접 수정 금지
5. 오케스트레이터는 TaskList로 진행 모니터링, 막힌 에이전트에 SendMessage 개입

> 동시 활성 에이전트는 Wave당 5~6명을 유지한다. 12명 전원 동시 스폰 금지 — 조율 오버헤드가 품질을 깎는다.

**재실행(후속 라운드) 시 에이전트 재사용 원칙:** 같은 세션에서 두 번째 이상 실행할 때는 신규 스폰보다 **기존 에이전트의 SendMessage 재개를 우선**한다. 이유(v2 실행 실증): 같은 name으로 재스폰하면 -N 접미사가 붙어 두 인스턴스가 공존하고, ①태스크 owner(접미사 없는 이름)를 v1 인스턴스가 자기 것으로 인식해 중복 실행 ②팀원 간 메시지가 잘못된 인스턴스로 라우팅 ③동일 파일 교차 편집 위험이 생긴다. 부득이 신규 스폰했다면: 스폰 직후 전원에게 라우팅 표(실제 인스턴스 이름)를 공지하고, 태스크 owner를 실제 인스턴스 이름과 일치시키고, 중복 발견 즉시 한쪽을 감사자(audit) 역할로 전환하거나 해산한다 — 중복 인스턴스는 "덮어쓰기"가 아니라 "독립 검증"으로 전환시키면 오히려 결함 적발에 유용하다.

### Phase 3: 통합 검증

**실행 모드:** 팀 유지 (engine-dev + qa-engineer)

1. engine-dev(SendMessage로 재개)가 `src/main.js`에 전 모듈 연결, 상태 머신 완성
2. 로컬 서버 기동: `python3 -m http.server 8000` (Bash `run_in_background: true`, 프로젝트 루트에서)
3. qa-engineer가 최종 게이트: 전 파일 문법 검증 + 경계면 체크리스트 전 항목 + 브라우저 로드 콘솔 에러 0건
4. P0/P1 잔존 시 담당자 수정 → 해당 경계면 재검증 루프 (최대 3회)

### Phase 4: 플레이테스트 루프

**실행 모드:** 서브 에이전트

1. `Agent(subagent_type: "playtester", model: "opus")` — URL과 GDD 승인 기준 전달
2. 리포트의 버그를 라우팅 표에 따라 담당자에게 수정 지시 (SendMessage로 기존 에이전트 재개), 난이도 체감은 wave-balancer에게
3. 수정 후 playtester 재호출("수정 확인 재테스트" 모드) — **루프 최대 2회**. 2회 후 잔존 P2/P3는 알려진 이슈로 보고서에 기록

### Phase 5: 승인·보고

1. game-director(SendMessage 재개)에게 최종 승인 요청 — GDD 승인 기준 체크리스트 판정
2. 반려 항목은 Phase 0 라우팅으로 1회 수정 후 재판정. 재반려 시 미달 항목을 명시하고 사용자 판단으로 넘김
3. 사용자 보고: 실행 방법(`python3 -m http.server 8000` → `http://localhost:8000`), 승인 기준 판정 결과, 알려진 이슈, `_workspace/` 산출물 목록
4. `_workspace/`는 보존한다 (감사 추적·부분 재실행의 입력)
5. 사용자에게 피드백 기회 제공: "결과나 팀 구성에서 개선할 점이 있나요?" (하네스 진화 — 강요하지 않음)

## 데이터 전달 프로토콜

- **파일 기반 (주)**: 산출물은 표의 경로에. 중간 산출물은 `_workspace/{NN}_{agent}_{artifact}.md`
- **태스크 기반**: Phase 2 작업 등록·의존성·진행 추적 (TaskCreate/TaskList)
- **메시지 기반**: 인터페이스 질의, 완료 통지, 결함 리포트, 기존 에이전트 재개 (SendMessage)
- 소스 코드는 소유권 규칙(td-code-standards)에 따라 담당자만 수정

## 에러 핸들링

| 상황 | 전략 |
|---|---|
| 에이전트 1명 실패/무응답 | 1회 재스폰(이전 산출물 경로 전달). 재실패 시 해당 산출물 없이 진행, 보고서에 누락 명시 |
| codex 미로그인 | 에셋 생성만 보류하고 나머지 진행 (플레이스홀더로 동작) — 사용자에게 `codex login` 안내 후 asset-artist만 재실행 |
| 과반 실패 | 사용자에게 상황 보고 후 진행 여부 확인 |
| 인터페이스 분쟁 | system-architect 판정이 최종. 계약 문서 개정 → 영향 에이전트 통지 |
| QA 3회 루프에도 P0 잔존 | 루프 중단, 현 상태·원인 분석과 함께 사용자 보고 |
| 서버 포트 충돌 | 8001로 변경, playtester에게 변경 URL 전달 |
| 상충 산출물 | 삭제하지 않고 출처 병기, 계약 문서 기준으로 판정 |

## 테스트 시나리오

### 정상 흐름
1. "타워 디펜스 게임 만들어줘" → Phase 0: `_workspace/` 없음 → 초기 실행
2. Phase 1: GDD + 계약 문서 + 뼈대 생성, 디렉터 확인 통과
3. Phase 2: Wave A 6명(QA 포함) → 코어 완료 통지 → Wave B 3명, incremental QA 병행
4. Phase 3: 통합 + 문법/경계면/콘솔 게이트 통과
5. Phase 4: playtester 정상+파괴 플레이, P1 2건 수정 → 재테스트 통과
6. Phase 5: 디렉터 승인 → 사용자 보고. 예상 결과: `http://localhost:8000`에서 플레이 가능한 게임
7. 이후 "너무 어려워" 요청 → Phase 0 부분 재실행: wave-balancer → playtester만 재호출

### 에러 흐름
1. Phase 2에서 asset-artist가 codex 미로그인 보고
2. 오케스트레이터: 에셋 작업 보류, 나머지 Wave A 진행 (플레이스홀더 렌더링으로 게임 완성)
3. Phase 5 보고에 "에셋 미생성 — `codex login` 후 '에셋 다시 생성해줘'로 재개" 명시
4. 사용자 로그인 후 재요청 → Phase 0 라우팅: asset-artist 단독 재실행 → qa 에셋 키 검증 → 완료
