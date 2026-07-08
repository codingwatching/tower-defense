/**
 * @module systems/waves (entity-dev)
 * 웨이브 스폰 스케줄·카운트다운·클리어 판정. 데이터: src/data/waves.js (§4.3).
 *
 * 구독: ui:wave-start-requested {} — 준비 중이면 즉시 시작 (진행 중엔 무시)
 *      stage:started {stageIndex, stageId} — (v3 §3.10) 활성 스테이지 컨텍스트 캐시.
 *          STAGE_WAVES[stageId]로 활성 웨이브 배열을, STAGE_BALANCE[stageId].hpScale로 HP 배수를 캐시.
 *          game:started보다 먼저 도착(§14.1) — 캐시만 하고 리셋은 game:started가 담당.
 *      game:started {} — 웨이브 1 준비 상태로 리셋 (첫 웨이브는 카운트다운 없음, 버튼만).
 *          activeWaves/hpScale은 건드리지 않음(stage:started가 이미 세팅, 또는 기본 폴백 유지).
 * 발행: wave:started {index, total} — index 1~total(활성 배열 길이, 항상 10 — §4.8)
 *      wave:cleared {index, bonus} — 전 그룹 스폰 완료 + combat.enemies 전멸 시
 *      wave:countdown {remaining} — 클리어 후 자동 카운트다운(BALANCE.interWaveCountdown), 정수 변경마다. 0=자동 시작
 *      enemy:spawned {enemy} / boss:spawned {enemy} — isBoss인 적은 두 이벤트 모두
 *
 * 클리어 판정을 위해 combat.enemies를 읽는다 (읽기 의존 허용 — §1).
 *
 * v3 (§4.8·§4.9·§14.1): STAGE_WAVES/STAGE_BALANCE는 wave-balancer가 병렬 작성 중일 수 있어
 *   네임스페이스 import로 안전 접근한다(미존재 named import는 링크 시점 SyntaxError). 부재 시
 *   기본 WAVES·hpScale 1로 폴백 → 스테이지 1(crystal_valley) = v2 동작 불변(회귀 보증, AC-41).
 *   HP 배수는 여기서 곱해 Enemy(type, hpMultiplier × hpScale)로 전달 — 생성자 시그니처 불변(§4.9).
 */

import { on, emit } from '../core/events.js';
import * as wavesData from '../data/waves.js';
import * as balanceData from '../data/balance.js';
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

/**
 * (v3) 활성 스테이지 웨이브 배열. 기본은 §4.3 WAVES(스테이지 1). stage:started로 교체.
 * @type {import('../data/waves.js').WaveDef[]}
 */
let activeWaves = wavesData.WAVES;
/** (v3) 활성 스테이지 HP 배수. 기본 1(회귀 불변). spawn 시 hpMultiplier에 곱해짐(§4.9). */
let hpScale = 1;
/** STAGE_WAVES 폴백 경고 — 스테이지당 1회. */
const warnedStages = new Set();

/**
 * (v3) stageId로 활성 웨이브 배열을 안전 조회. 부재/무효 시 WAVES 폴백 + 경고 1회 (§4.8).
 * @param {string} stageId
 * @returns {import('../data/waves.js').WaveDef[]}
 */
function resolveStageWaves(stageId) {
  const table = wavesData.STAGE_WAVES;
  const list = table && table[stageId];
  if (Array.isArray(list) && list.length > 0) return list;
  if (!warnedStages.has(stageId)) {
    warnedStages.add(stageId);
    console.warn(`[waves] STAGE_WAVES['${stageId}'] 부재/무효 — 기본 WAVES로 폴백`);
  }
  return wavesData.WAVES;
}

/**
 * (v3) stageId로 HP 배수를 안전 조회. 부재/무효 시 1.0 폴백 (§4.9).
 * @param {string} stageId
 * @returns {number}
 */
function resolveHpScale(stageId) {
  const entry = balanceData.STAGE_BALANCE && balanceData.STAGE_BALANCE[stageId];
  const scale = entry && entry.hpScale;
  return typeof scale === 'number' && scale > 0 ? scale : 1;
}

/** 이벤트 구독 등록. main이 1회 호출. */
export function initWaves() {
  on('ui:wave-start-requested', () => {
    if (phase !== 'idle' && phase !== 'countdown') return;
    if (currentWave >= activeWaves.length) return;
    startWave(currentWave + 1);
  });

  // (v3 §14.1) 스테이지 진입 컨텍스트 캐시 — game:started보다 먼저 도착. 캐시만, 리셋 금지.
  on('stage:started', ({ stageId } = {}) => {
    activeWaves = resolveStageWaves(stageId);
    hpScale = resolveHpScale(stageId);
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
  const def = activeWaves[n - 1];
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
  emit('wave:started', { index: n, total: activeWaves.length });
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
    const def = activeWaves[currentWave - 1];
    emit('wave:cleared', { index: currentWave, bonus: def.bonus });
    if (currentWave >= activeWaves.length) {
      phase = 'done'; // 승리 판정은 main 소관 (wave:cleared index===total)
    } else {
      phase = 'countdown';
      countdownLeft = balanceData.BALANCE.interWaveCountdown;
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
  // (v3 §4.9) 실 HP = base × WaveDef.hpMultiplier × 스테이지 hpScale. waves가 곱해 전달 — Enemy 시그니처 불변.
  const enemy = new Enemy(type, activeWaves[currentWave - 1].hpMultiplier * hpScale);
  emit('enemy:spawned', { enemy });
  if (enemy.isBoss) emit('boss:spawned', { enemy });
}

/** @returns {number} 현재 웨이브 번호 1~10 (시작 전 0) — hud·window.GAME용 */
export function getCurrentWave() {
  return currentWave;
}
