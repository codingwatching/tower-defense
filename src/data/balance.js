/**
 * @module data/balance (wave-balancer)
 * 전역 경제·진행 상수. 스키마·필드명은 계약 §4.4 — 문자 단위로 준수.
 *
 * @typedef {Object} BalanceDef
 * @property {number} startGold          시작 골드 — GDD 구속: 타워 2기 건설 가능 수준
 * @property {number} startLives         20 (GDD 고정)
 * @property {number} sellRatio          0.7 (GDD 고정). 환불 = floor(invested * sellRatio)
 * @property {number} interWaveCountdown 웨이브 클리어 후 자동 카운트다운 초 (GDD 예시 15).
 *                                       첫 웨이브는 카운트다운 없음 — 버튼으로만 시작
 */

/** @type {BalanceDef} */
export const BALANCE = {
  startGold: 120,   // arrow(50)×2 + 여유 20%, 또는 arrow+frost(110) — 첫 선택부터 조합 고민
  startLives: 20,
  sellRatio: 0.7,
  interWaveCountdown: 15
};

/**
 * ─────────────────────────────────────────────────────────────
 * v3 — 스테이지별 시작 자원·난이도 배수 (계약 §4.9 STAGE_BALANCE)
 * ─────────────────────────────────────────────────────────────
 * 스테이지 id → { startGold, startLives, hpScale }. 5키 필수.
 * 전역 값(sellRatio·interWaveCountdown)은 위 BALANCE에만 — 스테이지별로 바뀌지 않는다.
 *
 * 실 HP = ENEMIES[type].hp × WaveDef.hpMultiplier × hpScale (계약 §4.9).
 *   → waves가 stage:started로 hpScale을 캐시, Enemy 생성 시 (hpMultiplier × hpScale)로 전달.
 *
 * **난이도 주손잡이 = hpScale (D16), 그러나 완만하게.** startGold/startLives는 5스테이지 전부 120/20 고정:
 *  - 스테이지 1을 v2와 문자 단위 동일하게 유지 (회귀 불변 — 계약 §15).
 *  - AC-44 밴드(잔여 라이프 30~70%)를 startLives 20 공통 분모로 비교 가능하게 유지.
 *  - "얼마나 빡센가"로 난이도를 올린다(D16) — 시작 자원을 줄이면 "덜 준다"가 되어 축이 흐려진다.
 *
 * **설계 (sim §튜닝 이력 D18-1):** 신규 4개 맵의 웨이브 물량을 맵 기하에 맞춰 먼저 조정하고
 *   (twin은 관대한 하단 이중 킬존 기하라 ×1.2 증량, narrow·last는 긴 경로·좁은 타일이라 ×0.7·×0.8 감량 — §waves),
 *   그 위에 hpScale을 스테이지 순서대로 단조 상승시켜 각 스테이지를 AC-44 밴드(잔여 30~70%)에
 *   착지시킨다. hpScale·웨이브 물량·맵 기하 3축의 합으로 밴드를 맞춘다.
 *   (주의: hpScale은 waves.js가 Enemy 생성 시 hpMultiplier에 곱한다 — sim 검증도 이 경로로 단일 적용.)
 *
 * hpScale 곡선 (스테이지 1→5 단조 상승):
 *   1.00 → 1.10 → 1.26 → 1.34 → 1.42
 *   (후반일수록 큰 스텝 — 긴 경로 맵이 hpScale 상승을 더 잘 견딤. §튜닝 이력)
 *
 * sim(Part 4) 실엔진 킬존 봇 최종 밴드 (crystal_valley=55% 기준):
 *   bramble 70% → twin 60% → narrow 60% → last 50% (전부 30~70%, 후반일수록 낮게 — AC-44 충족).
 *
 * @typedef {Object} StageBalanceDef
 * @property {number} startGold  스테이지 진입 시 시작 골드 (이월 없음 — D15)
 * @property {number} startLives 스테이지 시작 라이프
 * @property {number} hpScale    스테이지 전역 HP 배수(≥1). 스테이지 1 = 1.0 (회귀 불변)
 *
 * @type {Record<string, StageBalanceDef>}
 */
export const STAGE_BALANCE = {
  crystal_valley: { startGold: 120, startLives: 20, hpScale: 1.0 },   // 스테이지 1 = v2 동일 (회귀 불변)
  bramble_fork:   { startGold: 120, startLives: 20, hpScale: 1.10 },
  twin_snake:     { startGold: 120, startLives: 20, hpScale: 1.26 },
  narrow_gate:    { startGold: 120, startLives: 20, hpScale: 1.34 },
  last_ridge:     { startGold: 120, startLives: 20, hpScale: 1.42 }
};
