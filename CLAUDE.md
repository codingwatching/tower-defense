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
| 2026-07-08 | "완료 통지 = 최종 저장 후 게이트 재실행 결과" 규약 추가 | skills/td-code-standards, agents/wave-balancer | 자체 게이트 red 상태 완료 마킹 2회 재발(v2 D16-2·v3 D24-1) |
| 2026-07-08 | 남은 골드 점수 반영·취소 버튼 위치 수정 라우팅 처리 (v3.1) | src(부분 재실행) | 골드 보너스 4요소·배치 취소 버튼 클릭 가로채기 버그 |
| 2026-07-08 | "계약 배정 담당은 빠짐없이 태스크 등록" 규약 추가 | skills/td-orchestrator | v3.1 D30-1: 계약이 배정한 작업이 태스크 없이 틈으로 빠짐 |
| 2026-07-19 | 에셋 파이프라인 v3 (3D 렌더 룩·멀티 시퀀스 시트 idle/attack·지형 타일 패밀리, slice_sheet.py --sequences) | skills/td-asset-pipeline | 에셋 3D 고퀄리티 변환 + 애니메이션 강화 요구 |
| 2026-07-19 | 애니메이션 상태 머신·진화 변신 연출·지형 레이어(1.5) 규약 추가 | skills/td-code-standards | 아이들/공격 모션·레벨업 변신·움직이는 지형 요구 |
| 2026-07-19 | 역할 보강 (3D 룩 시트/시퀀스 폴백·terrain-anim/상태 머신·크로스페이드/시그니처 이펙트·변신 연출/지형 패밀리) | agents/{asset-artist,engine-dev,entity-dev,fx-dev,map-designer} | v3 비주얼 업그레이드 지원 |
| 2026-07-19 | 3D 전환·애니메이션 강화·지형 고도화 라우팅 추가 | skills/td-orchestrator | v3 비주얼 업그레이드 지원 |
| 2026-07-19 | "entities/systems 변경 시 sim.mjs 게이트 포함 + 로더는 draw 전유" 규약 추가 | skills/td-code-standards | v4 D35-1: update 핫패스 getAnim 호출로 헤드리스 sim 크래시 |
| 2026-07-19 | "생성+즉시 후처리 단일 잡" 권장·1행×8열 시트 변형 허용 | skills/td-asset-pipeline | v4 실증: 통지 지연 53분 스톨·2행 그리드보다 1행×8열이 안정 |
| 2026-07-19 | 절차적 트윈 규약(anime.js v4 벤더링·vis 계약·tween 파사드·import 경계) 신설 + 외부 라이브러리 금지에 벤더링 예외 | skills/td-code-standards | 시트 프레임 교체만으론 모션이 끊김 — animejs 자연화 요구 (v5) |
| 2026-07-19 | 타일 팔레트 락 §7.5 + harmonize_palette.py 번들 | skills/td-asset-pipeline | 타일 색상 편차 패치워크 보완 요구 (v5) |
| 2026-07-19 | 애니메이션 자연화·타일 색상 일관성 라우팅 추가 | skills/td-orchestrator | v5 지원 |
| 2026-07-19 | 역할 보강 (트윈 파사드/벤더링·일시정지 연동/vis 계약/UI 트랜지션/팔레트 락) | agents/{fx-dev,engine-dev,entity-dev,ui-dev,asset-artist} | v5 지원 |
| 2026-07-19 | §7.5 세그먼트 하모나이즈 승격 (harmonize_segmented·tile_seam_check 번들, 2재질 타일 whole-tile 판정 금지) | skills/td-asset-pipeline | v5 실증: 2재질 타일에 whole-tile 매칭 시 지표는 PASS인데 잔디 오염 (거짓 합격 함정) |
| 2026-07-19 | "레이어 번호는 계약 화이트리스트 전용, 미승인 번호 유통 금지" 규칙 추가 | skills/td-code-standards | v5 실증: 미승인 레이어 18 권장 → 15→18→15 왕복, 5개 에이전트 정정 파급 |
| 2026-07-19 | §7.5 필드 타일 분포 지표 승격 (grass_lab.py 번들 — Lab ΔE·해시배치 몽타주·tint 시뮬, JND 기준) | skills/td-asset-pipeline | v5 실증: 평균색 ΔE 2.5 타일이 밝기 분포 차로 필드에서 튐 (평균 지표 사각) |
