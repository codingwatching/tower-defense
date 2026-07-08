/**
 * @module systems/economy (engine-dev)
 * 골드/라이프 원장. 쓰기는 이벤트 구독으로만 — 외부에서 직접 변경하는 API는 없다.
 *
 * 구독: stage:started {stageId} — (v3) STAGE_BALANCE[stageId]의 startGold/startLives 캐시 (§4.9).
 *                                게임 리셋은 뒤이은 game:started에서 이 캐시 값으로 수행.
 *      game:started {} — 캐시된 시작 자원(없으면 BALANCE 폴백)으로 리셋 (변동 이벤트 발행 포함)
 *      enemy:killed {reward} → +골드 / wave:cleared {bonus} → +골드 / tower:sold {refund} → +골드
 *      tower:placed {cost} / tower:upgraded {cost} → -골드
 *      enemy:escaped {livesCost} → -라이프
 * 발행: gold:changed {gold, delta} / lives:changed {lives, delta} — 모든 변동마다
 *
 * 지불 가능 검증(canAfford)은 systems/combat이 차감 이벤트 발행 **전에** 호출할 책임 —
 * 원장은 받은 변동을 기록할 뿐 음수 방어를 하지 않는다 (이중 검증으로 결함 은폐 방지).
 *
 * (v3) STAGE_BALANCE는 wave-balancer가 아직 추가 중일 수 있으므로 namespace import로
 *   안전 접근한다(미존재 export가 링크타임 크래시를 내지 않도록). 부재 시 BALANCE 폴백 —
 *   스테이지 1 회귀(120/20)를 그대로 보존(§15).
 */

import { on, emit } from '../core/events.js';
import * as balanceData from '../data/balance.js';

const BALANCE = balanceData.BALANCE;

let gold = 0;
let lives = 0;
let bound = false;

/**
 * 활성 스테이지 시작 자원 캐시(§14.1). stage:started에서 채워지고 game:started가 소비.
 * null이면 리셋이 BALANCE 폴백을 쓴다(v2 단일 부팅 경로 = 회귀 보존).
 * @type {{startGold: number, startLives: number}|null}
 */
let stageCtx = null;

/** 이벤트 구독 등록. main이 1회 호출. */
export function initEconomy() {
  if (bound) {
    console.warn('[economy] initEconomy 중복 호출 — 무시');
    return;
  }
  bound = true;
  on('stage:started', (p) => {
    stageCtx = resolveStageBalance(p && p.stageId);
  });
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

/**
 * stage:started의 stageId로 STAGE_BALANCE[stageId]를 해석해 시작 자원 캐시를 만든다(§4.9).
 * STAGE_BALANCE 부재·키 미매치·필드 손상 시 전역 BALANCE로 폴백 — 스테이지 1 회귀 보존.
 * @param {unknown} stageId @returns {{startGold: number, startLives: number}}
 */
function resolveStageBalance(stageId) {
  const table = balanceData.STAGE_BALANCE;
  const entry = table && typeof stageId === 'string' ? table[stageId] : undefined;
  const sg = Number(entry && entry.startGold);
  const sl = Number(entry && entry.startLives);
  return {
    startGold: Number.isFinite(sg) ? sg : Number(BALANCE && BALANCE.startGold),
    startLives: Number.isFinite(sl) ? sl : Number(BALANCE && BALANCE.startLives),
  };
}

/**
 * 시작 자원으로 리셋. 우선순위: stage:started 캐시(stageCtx) → 전역 BALANCE → GDD 기본값(120/20).
 * v2 단일 부팅(stage:started 없이 game:started)에서는 stageCtx=null → BALANCE 폴백(회귀 보존).
 */
function reset() {
  let startGold = stageCtx ? stageCtx.startGold : BALANCE.startGold;
  let startLives = stageCtx ? stageCtx.startLives : BALANCE.startLives;
  if (!Number.isFinite(startGold)) {
    console.warn('[economy] startGold 미기입 — GDD 기본값 120 사용 (wave-balancer 확인 필요)');
    startGold = 120;
  }
  if (!Number.isFinite(startLives)) {
    console.warn('[economy] startLives 미기입 — GDD 기본값 20 사용 (wave-balancer 확인 필요)');
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
