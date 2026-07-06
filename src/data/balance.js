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
