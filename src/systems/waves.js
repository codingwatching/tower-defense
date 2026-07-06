/**
 * @module systems/waves (entity-dev)
 * 웨이브 스폰 스케줄·카운트다운·클리어 판정. 데이터: src/data/waves.js (§4.3).
 *
 * 구독: ui:wave-start-requested {} — 준비 중이면 즉시 시작 (진행 중엔 무시)
 *      game:started {} — 웨이브 1 준비 상태로 리셋 (첫 웨이브는 카운트다운 없음, 버튼만)
 * 발행: wave:started {index, total} — index 1~10
 *      wave:cleared {index, bonus} — 전 그룹 스폰 완료 + combat.enemies 전멸 시
 *      wave:countdown {remaining} — 클리어 후 자동 카운트다운(BALANCE.interWaveCountdown), 정수 변경마다. 0=자동 시작
 *      enemy:spawned {enemy} / boss:spawned {enemy} — isBoss인 적은 두 이벤트 모두
 *
 * 클리어 판정을 위해 combat.enemies를 읽는다 (읽기 의존 허용 — §1).
 */

import { on, emit } from '../core/events.js';
import { WAVES } from '../data/waves.js';
import { BALANCE } from '../data/balance.js';
import { ENEMIES } from '../data/enemies.js';
import { Enemy } from '../entities/enemy.js';
import { enemies } from './combat.js';

/** @type {'idle'|'countdown'|'active'|'done'} idle=버튼 대기(웨이브 1 전) */
let phase = 'idle';
let currentWave = 0;
/** 이번 웨이브 스폰 스케줄 — {time, enemy} 오름차순. */
let schedule = [];
let cursor = 0;
let elapsed = 0;
let countdownLeft = 0;
/** 데이터에 없는 적 타입 — 타입당 콘솔 에러 1회, 해당 개체만 스킵. */
const unknownTypes = new Set();

/** 이벤트 구독 등록. main이 1회 호출. */
export function initWaves() {
  on('ui:wave-start-requested', () => {
    if (phase !== 'idle' && phase !== 'countdown') return;
    if (currentWave >= WAVES.length) return;
    startWave(currentWave + 1);
  });

  on('game:started', () => {
    phase = 'idle';
    currentWave = 0;
    schedule = [];
    cursor = 0;
    elapsed = 0;
    countdownLeft = 0;
  });
}

/** @param {number} n - 웨이브 번호 1~10 */
function startWave(n) {
  const def = WAVES[n - 1];
  currentWave = n;
  phase = 'active';
  elapsed = 0;
  cursor = 0;
  schedule = [];
  for (const group of def.groups) {
    for (let i = 0; i < group.count; i++) {
      schedule.push({ time: group.delay + i * group.interval, enemy: group.enemy });
    }
  }
  schedule.sort((a, b) => a.time - b.time);
  emit('wave:started', { index: n, total: WAVES.length });
}

/**
 * 스폰 타이머·카운트다운 진행.
 * @param {number} dt - 고정 스텝 (초)
 */
export function updateWaves(dt) {
  if (phase === 'countdown') {
    const prev = Math.ceil(countdownLeft);
    countdownLeft -= dt;
    const cur = Math.max(0, Math.ceil(countdownLeft));
    if (cur !== prev) emit('wave:countdown', { remaining: cur });
    if (countdownLeft <= 0) startWave(currentWave + 1);
    return;
  }

  if (phase !== 'active') return;

  elapsed += dt;
  while (cursor < schedule.length && schedule[cursor].time <= elapsed) {
    spawn(schedule[cursor].enemy);
    cursor++;
  }

  if (cursor >= schedule.length && enemies.length === 0) {
    const def = WAVES[currentWave - 1];
    emit('wave:cleared', { index: currentWave, bonus: def.bonus });
    if (currentWave >= WAVES.length) {
      phase = 'done'; // 승리 판정은 main 소관 (wave:cleared index===total)
    } else {
      phase = 'countdown';
      countdownLeft = BALANCE.interWaveCountdown;
      emit('wave:countdown', { remaining: Math.ceil(countdownLeft) });
    }
  }
}

/** @param {string} type - ENEMIES 키. 데이터에 없으면 해당 개체만 스킵. */
function spawn(type) {
  if (!ENEMIES[type]) {
    if (!unknownTypes.has(type)) {
      unknownTypes.add(type);
      console.error(`[waves] 데이터에 정의되지 않은 적 타입: ${type} — 스폰 스킵`);
    }
    return;
  }
  const enemy = new Enemy(type, WAVES[currentWave - 1].hpMultiplier);
  emit('enemy:spawned', { enemy });
  if (enemy.isBoss) emit('boss:spawned', { enemy });
}

/** @returns {number} 현재 웨이브 번호 1~10 (시작 전 0) — hud·window.GAME용 */
export function getCurrentWave() {
  return currentWave;
}
