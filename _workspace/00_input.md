# 사용자 요구사항 (2026-07-03)

- 요청: "타워 디펜스 게임 만들어줘" (초기 제작)
- 플랫폼: HTML Canvas 웹 게임, 바닐라 JS ES 모듈, 빌드 도구 없음
- 이미지 에셋: codex-cli(image_generation)로 생성 (로그인 확인됨: codex-cli 0.142.3, ChatGPT OAuth)
- 실행 환경: 로컬 서버 (python3 -m http.server 8000)
- 특이 제약: 없음 — GDD가 MVP 범위를 결정

# v2 업그레이드 요구사항 (2026-07-06)

1. GitHub Pages에서 동작 — 상대 경로·.nojekyll·Pages 활성화 (리포: revfactory/tower-defense, 현재 private)
2. 모바일 최적화 — 터치 입력(Pointer Events), 반응형 레이아웃, DPR 스케일링
3. 맵 구성·에셋 퀄리티 향상 — 타일 변형·길 직선/코너·장식 밀도
4. 에셋 레퍼런스 시트 — 다각도·애니메이션(걷기 사이클) 시트 생성 → 슬라이싱 → 스프라이트 아틀라스로 게임 적용
5. 타워 업그레이드 차별화 — 레벨별 외형(tower_{type}_lv1~3) + 레벨별 효과 차별화
- 참고: td-asset-pipeline v2(시트 파이프라인+slice_sheet.py), td-code-standards(모바일/Pages/애니메이션 규약) 하네스 개정 완료
