/**
 * @module systems/score (engine-dev) — v3
 * 종합 점수 집계 원장. 계약 §4.10·§14.2. economy와 동형 — 쓰기는 이벤트 구독으로만.
 *
 * 점수 = 처치 점수 + 웨이브 클리어 보너스 + 남은 라이프 보너스 (GDD §13.2 D18).
 *   · 처치/웨이브 점수는 판 진행 중 실시간 가산 (score:changed)
 *   · 라이프 보너스는 종료 시 확정 (score:finalized) — game:won의 livesLeft × 계수, 패배는 0
 * 판매·업그레이드 이벤트는 구독하지 않는다(점수 무영향 — GDD §13.2). 배속 페널티 없음.
 *
 * 구독: stage:started {stageIndex} — 현재 스테이지 인덱스 캐시 (finalized 페이로드용)
 *      game:started {}            — kill/wave 소계·누적 0 리셋
 *      enemy:killed {enemy}       — killPoints[enemy.type] 가산 → score:changed(source:'kill')
 *      wave:cleared {index}       — 웨이브 점수 가산 → score:changed(source:'wave')
 *      game:won {livesLeft}       — life = livesLeft × lifeBonusPerLife → score:finalized(outcome:'won')
 *      game:over {}               — life = 0 → score:finalized(outcome:'over')
 * 발행: score:changed {score, delta, source} — 매 가산마다 (source: 'kill'|'wave')
 *      score:finalized {stageIndex, outcome, kill, wave, life, total} — 판당 정확히 1회
 *
 * 읽기 API 없음(economy 패턴 — ui는 이벤트로만 소비). getScore()는 window.GAME.score 노출용(main 소관).
 */

import { on, emit } from '../core/events.js';
import { SCORING } from '../data/scoring.js';

let kill = 0;   // 처치 소계 (game:started에서 0)
let wave = 0;   // 웨이브 클리어 소계 (game:started에서 0)
let stageIndex = 0; // stage:started에서 캐시 — finalized 페이로드 근거
let bound = false;

/** 미정의 적 타입 — 타입당 경고 1회(스팸 방지). killPoints 부재 시 0점 처리. */
const unknownTypes = new Set();

/** 이벤트 구독 등록. main이 1회 호출. */
export function initScore() {
  if (bound) {
    console.warn('[score] initScore 중복 호출 — 무시');
    return;
  }
  bound = true;

  // 스테이지 컨텍스트 캐시 — game:started보다 먼저 도착(§14.1 순서 불변식).
  on('stage:started', (p) => {
    const i = Number(p && p.stageIndex);
    stageIndex = Number.isFinite(i) ? i : 0;
  });

  // 리셋 — economy와 동일 트리거(§14.2). kill/wave 소계 0.
  on('game:started', () => {
    kill = 0;
    wave = 0;
  });

  // 처치 점수 — enemy.type별 killPoints. 누수 사망은 enemy:killed를 안 타므로 자동 제외.
  on('enemy:killed', (p) => {
    const enemy = p && p.enemy;
    const type = enemy && enemy.type;
    const pts = killPointsFor(type);
    if (pts === 0) return; // 0점(미정의 타입 포함)은 score:changed 무발행 — economy delta 0 패턴
    kill += pts;
    emit('score:changed', { score: kill + wave, delta: pts, source: 'kill' });
  });

  // 웨이브 클리어 점수 — index 기반 후반 가중(§4.10 공식).
  on('wave:cleared', (p) => {
    const index = Number(p && p.index);
    const pts = waveScoreFor(index);
    if (pts === 0) return;
    wave += pts;
    emit('score:changed', { score: kill + wave, delta: pts, source: 'wave' });
  });

  // 종료 확정 — 라이프 보너스 합산 후 score:finalized 1회(§14.2).
  on('game:won', (p) => {
    const livesLeft = Number(p && p.livesLeft);
    const life = (Number.isFinite(livesLeft) ? Math.max(0, livesLeft) : 0) * lifeBonusPerLife();
    finalize('won', life);
  });

  on('game:over', () => {
    finalize('over', 0); // 패배: 라이프 보너스 0(§4.10)
  });
}

/**
 * 처치 점수 조회. 미정의 타입은 0점 + 타입당 경고 1회(매직넘버 금지 — SCORING만 읽음).
 * @param {unknown} type @returns {number}
 */
function killPointsFor(type) {
  const table = (SCORING && SCORING.killPoints) || {};
  const v = Number(table[/** @type {string} */ (type)]);
  if (Number.isFinite(v)) return Math.max(0, v);
  if (typeof type === 'string' && !unknownTypes.has(type)) {
    unknownTypes.add(type);
    console.warn(`[score] SCORING.killPoints에 없는 적 타입: ${type} — 0점 처리`);
  }
  return 0;
}

/**
 * 웨이브 클리어 점수 = waveClearBonus × (1 + (index-1) × (waveScale-1)) (§4.10).
 * waveScale=1.0이면 전 웨이브 균등. index는 1부터.
 * @param {number} index @returns {number} 정수(floor)
 */
function waveScoreFor(index) {
  const base = Number(SCORING && SCORING.waveClearBonus);
  const scale = Number(SCORING && SCORING.waveScale);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const n = Number.isFinite(index) && index >= 1 ? index : 1;
  const s = Number.isFinite(scale) ? scale : 1.0;
  return Math.max(0, Math.floor(base * (1 + (n - 1) * (s - 1))));
}

/** @returns {number} lifeBonusPerLife (비유한수 방어 → 0). */
function lifeBonusPerLife() {
  const v = Number(SCORING && SCORING.lifeBonusPerLife);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/**
 * 최종 점수 확정 + score:finalized 발행(판당 1회 — main의 game:won/over가 1회 보장).
 * @param {'won'|'over'} outcome @param {number} life 라이프 보너스 소계
 */
function finalize(outcome, life) {
  const total = kill + wave + life;
  emit('score:finalized', { stageIndex, outcome, kill, wave, life, total });
}

/** @returns {number} 현재 누적 점수 (kill + wave 소계) — window.GAME.score 경유 노출용 */
export function getScore() {
  return kill + wave;
}
