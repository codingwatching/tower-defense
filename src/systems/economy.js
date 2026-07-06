/**
 * @module systems/economy (engine-dev)
 * 골드/라이프 원장. 쓰기는 이벤트 구독으로만 — 외부에서 직접 변경하는 API는 없다.
 *
 * 구독: game:started {} — BALANCE.startGold / startLives로 리셋 (변동 이벤트 발행 포함)
 *      enemy:killed {reward} → +골드 / wave:cleared {bonus} → +골드 / tower:sold {refund} → +골드
 *      tower:placed {cost} / tower:upgraded {cost} → -골드
 *      enemy:escaped {livesCost} → -라이프
 * 발행: gold:changed {gold, delta} / lives:changed {lives, delta} — 모든 변동마다
 *
 * 지불 가능 검증(canAfford)은 systems/combat이 차감 이벤트 발행 **전에** 호출할 책임 —
 * 원장은 받은 변동을 기록할 뿐 음수 방어를 하지 않는다 (이중 검증으로 결함 은폐 방지).
 */

import { on, emit } from '../core/events.js';
import { BALANCE } from '../data/balance.js';

let gold = 0;
let lives = 0;
let bound = false;

/** 이벤트 구독 등록. main이 1회 호출. */
export function initEconomy() {
  if (bound) {
    console.warn('[economy] initEconomy 중복 호출 — 무시');
    return;
  }
  bound = true;
  on('game:started', reset);
  on('enemy:killed', (p) => changeGold(num(p.reward, 0)));
  on('wave:cleared', (p) => changeGold(num(p.bonus, 0)));
  on('tower:sold', (p) => changeGold(num(p.refund, 0)));
  on('tower:placed', (p) => changeGold(-num(p.cost, 0)));
  on('tower:upgraded', (p) => changeGold(-num(p.cost, 0)));
  on('enemy:escaped', (p) => changeLives(-num(p.livesCost, 1)));
}

/** @returns {number} 현재 골드 — ui/shop·panel의 활성화 판단용 (읽기 전용) */
export function getGold() {
  return gold;
}

/** @returns {number} 현재 라이프 */
export function getLives() {
  return lives;
}

/**
 * @param {number} cost
 * @returns {boolean} gold >= cost
 */
export function canAfford(cost) {
  return gold >= cost;
}

/** BALANCE 값으로 리셋. 미기입(스켈레톤) 시 GDD 명시값(120/20)으로 폴백 + 경고. */
function reset() {
  let startGold = BALANCE.startGold;
  let startLives = BALANCE.startLives;
  if (!Number.isFinite(startGold)) {
    console.warn('[economy] BALANCE.startGold 미기입 — GDD 기본값 120 사용 (wave-balancer 확인 필요)');
    startGold = 120;
  }
  if (!Number.isFinite(startLives)) {
    console.warn('[economy] BALANCE.startLives 미기입 — GDD 기본값 20 사용 (wave-balancer 확인 필요)');
    startLives = 20;
  }
  const dg = startGold - gold;
  const dl = startLives - lives;
  gold = startGold;
  lives = startLives;
  // 리셋도 변동으로 발행 — HUD가 초기값을 이 이벤트로 그린다 (delta 0이어도 발행)
  emit('gold:changed', { gold, delta: dg });
  emit('lives:changed', { lives, delta: dl });
}

/** @param {number} delta - 0이면 무발행 */
function changeGold(delta) {
  if (delta === 0) return;
  gold += delta;
  emit('gold:changed', { gold, delta });
}

/** @param {number} delta - 0이면 무발행 */
function changeLives(delta) {
  if (delta === 0) return;
  lives += delta;
  emit('lives:changed', { lives, delta });
}

/**
 * 페이로드 수치 방어적 정규화 — 계약 위반 페이로드가 원장을 NaN으로 오염시키지 않게.
 * @param {unknown} v @param {number} fallback
 * @returns {number}
 */
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
