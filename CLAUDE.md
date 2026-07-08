# Tower Defense 프로젝트

## 하네스: HTML Canvas 타워 디펜스 게임 제작

**목표:** 12개 전문 에이전트 팀으로 HTML Canvas 타워 디펜스 웹 게임을 제작·개선한다. 이미지 에셋은 codex-cli로 생성한다.

**트리거:** 게임 제작·수정·버그 수정·밸런스 조정·에셋 생성·플레이테스트 등 이 게임 관련 작업 요청 시 `td-orchestrator` 스킬을 사용하라. 단순 질문은 직접 응답 가능.

**모델 정책:** 모든 Agent 호출은 `model: "opus"` 를 명시한다 (2026-07-06 fable→opus 전환 — 환경에서 fable 모델 접근 불가로 변경).

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-07-03 | 초기 구성 (에이전트 12 + 스킬 5) | 전체 | - |
| 2026-07-06 | 에셋 파이프라인 v2 (레퍼런스 시트→슬라이싱→아틀라스, slice_sheet.py 번들) | skills/td-asset-pipeline | 다각도·애니메이션 시트 요구 |
| 2026-07-06 | Pages 호환·모바일/터치·스프라이트 애니메이션 규약 추가 | skills/td-code-standards | GitHub Pages 배포 + 모바일 최적화 요구 |
| 2026-07-06 | 라우팅 확장(배포/모바일/시트/맵 퀄리티) + 복합 업그레이드 절차 | skills/td-orchestrator | v2 업그레이드 지원 |
| 2026-07-06 | 역할 보강 (시트 제작/아틀라스 로더·DPR/터치 UX/맵 비주얼) | agents/{asset-artist,engine-dev,ui-dev,map-designer} | v2 업그레이드 지원 |
| 2026-07-06 | 재실행 시 에이전트 재사용 원칙 추가 (SendMessage 재개 우선, 이름 충돌 대응) | skills/td-orchestrator | v2 실행 중 -2 접미사 중복 스폰으로 태스크 중복 실행·라우팅 혼선 발생 |
| 2026-07-06 | 모델 정책 fable→opus 전환 | 전체 (에이전트 12 + 오케스트레이터 + CLAUDE.md) | 환경에서 fable 모델(claude-fable-5) 접근 불가 (API 400) |
| 2026-07-08 | 스테이지 확장(다중 레벨)·점수 시스템 라우팅 추가 | skills/td-orchestrator | 5단계 스테이지 + 종합 점수/최고기록 요구 |
