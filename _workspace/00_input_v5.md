# v5 입력 — 애니메이션 자연화 + 타일 색상 일관성 (2026-07-19)

## 사용자 요구 (원문)

> 에셋 기반의 애니메이션 효과가 어색합니다. animejs 를 사용하여 보다 자연스러운 애니메이션 효과를 적용합니다. 타일 에셋도 색상이 조금씩 다르며 일관성이 떨어집니다. 이것도 보완해주세요.

## 해석·범위 (부분 재실행 2유형)

### A. 애니메이션 자연화 (anime.js 도입)
- 현상: 시트 프레임 교체(4프레임 idle/attack/walk)만으로는 보간이 없어 모션이 딱딱 끊김.
- 방침: td-code-standards **"절차적 트윈 규약 (v5, anime.js)"** 신설 완료 — 프레임 애니메이션 위에 트윈(이징)을 겹친다.
  - anime.js v4 ESM을 `vendor/anime.esm.min.js`로 벤더링 (CDN 금지, Pages 호환)
  - import 허용: `src/fx/tween.js` 파사드 + `src/ui/` 만. entities/systems/map/core/data 금지 (sim.mjs 헤드리스 안전)
  - 엔티티 `vis` 시각 상태 계약: {sx,sy,rot,alpha,ox,oy}, draw 반영만, update 불가지
  - 트윈은 시각 전용 — 게임플레이 상태(HP·쿨다운·경로 진행도) 트윈 금지
- 담당: system-architect(계약 개정) → engine-dev(벤더링·일시정지 연동) ‖ fx-dev(파사드+연출 전환) ‖ entity-dev(vis) ‖ ui-dev(UI 트랜지션)

### B. 타일 색상 일관성 (팔레트 보정)
- 현상: 타일 간 색온도·채도 편차로 이어붙인 화면이 패치워크처럼 보임.
- 방침: td-asset-pipeline **§7.5 타일 팔레트 락** 신설 완료 — 앵커 히스토그램 보정(`harmonize_palette.py`) + `--check` 계측(임계 18).
- 사전 계측 (오케스트레이터, 잔디 패밀리): clover 13.6 PASS / flower 7.0 PASS — 잔디 내부는 양호. 길/물/전이 패밀리와 교차 경계(길 타일의 잔디 여백 등)가 유력 원인.
- 담당: asset-artist 단독 (키·경로 불변 — 계약 개정 불필요)

## 게이트 (완료 조건)
- `node --check` 전 변경 파일 + `node scripts/sim.mjs` exit 0
- `grep -rl "vendor/anime" src/entities src/systems src/map src/core src/data` → 빈 출력
- 헤드리스 Chrome 부팅 스모크: 콘솔 에러 0, "레이어 N draw 예외" 없음
- 타일 `--check` 패밀리별 전 항목 PASS 인용
- playtester 실플레이: 트윈 체감(등장/사망/반동/UI) + 타일 seam 육안
