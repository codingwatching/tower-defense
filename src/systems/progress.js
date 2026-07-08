/**
 * @module systems/progress (engine-dev) — v3
 * 해금 진행도·스테이지별 최고점 도메인 상태. 계약 §4.11·§14.3.
 * storage(순수 I/O)를 경유해 영속. 도메인 규칙(해금 판정·단조 증가·클램프)은 여기 소유.
 *
 * 구독: score:finalized {stageIndex, outcome, total} — 최고점 비교·해금 판정 후 저장
 * 발행: stage:record-updated {stageIndex, best, isNewBest} — 매 판 종료 시
 *      stage:unlocked {stageIndex} — 승리로 신규 해금 발생 시에만 (stageIndex = 새로 열린 인덱스)
 *
 * 해금 규칙(D14): 스테이지 N 클리어(outcome==='won') 시 N+1 해금.
 *   unlockedCount 단조 증가·최대 5·최소 1. 재클리어는 해금 재발생 안 함.
 * 읽기 API(ui 소비): getUnlockedCount() / getBestScore(i) / isUnlocked(i) / getSnapshot()
 */

import { on, emit } from '../core/events.js';
import { loadSave, saveSave } from '../core/storage.js';

/** 스테이지 개수(고정 5). unlockedCount 상한·bestScores 인덱스 유효 범위의 단일 출처. */
const STAGE_COUNT = 5;

/** @type {import('../core/storage.js').SaveState} */
let state = { version: 1, unlockedCount: 1, bestScores: [0, 0, 0, 0, 0] };
let bound = false;

/** storage 로드 + 구독 등록. main이 부트스트랩에서 1회 호출 (게임 시작 전). */
export function initProgress() {
  if (bound) {
    console.warn('[progress] initProgress 중복 호출 — 무시');
    return;
  }
  bound = true;
  state = loadSave(); // 항상 유효 구조(§4.11 폴백·정규화)

  // 판 종료 캐스케이드(§14.3). game:won/over → score:finalized 스택 안에서 동기 실행.
  on('score:finalized', ({ stageIndex, outcome, total } = {}) => {
    const idx = Number(stageIndex);
    // 유효 인덱스 밖이면 저장·해금 대상이 아님(방어).
    if (!Number.isInteger(idx) || idx < 0 || idx >= STAGE_COUNT) {
      console.warn(`[progress] score:finalized stageIndex 범위 밖: ${stageIndex} — 무시`);
      return;
    }
    const score = Number.isFinite(Number(total)) ? Math.max(0, Math.floor(Number(total))) : 0;

    const isNewBest = score > (state.bestScores[idx] ?? 0);
    if (isNewBest) state.bestScores[idx] = score;

    let newlyUnlocked = false;
    if (outcome === 'won' && idx + 1 === state.unlockedCount && state.unlockedCount < STAGE_COUNT) {
      state.unlockedCount += 1;
      newlyUnlocked = true;
    }

    // 변경 있을 때만 1회 저장(§4.11 — 매 프레임 저장 금지).
    if (isNewBest || newlyUnlocked) saveSave(state);

    emit('stage:record-updated', { stageIndex: idx, best: state.bestScores[idx], isNewBest });
    if (newlyUnlocked) emit('stage:unlocked', { stageIndex: idx + 1 });
  });
}

/** @returns {number} 해금된 스테이지 수 1~5 */
export function getUnlockedCount() {
  return state.unlockedCount;
}

/** @param {number} stageIndex 0~4 @returns {number} 그 스테이지 최고점 (미플레이 0) */
export function getBestScore(stageIndex) {
  return state.bestScores[stageIndex] ?? 0;
}

/** @param {number} stageIndex 0~4 @returns {boolean} 선택 가능 여부 */
export function isUnlocked(stageIndex) {
  return stageIndex < state.unlockedCount;
}

/** @returns {{unlockedCount: number, bestScores: number[]}} window.GAME.progress 노출용 스냅샷 */
export function getSnapshot() {
  return { unlockedCount: state.unlockedCount, bestScores: state.bestScores.slice() };
}
