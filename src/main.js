/**
 * @module main (engine-dev)
 * 부트스트랩 + 게임 상태 머신 + 전 모듈 조립. 계약 §8·§14.
 *
 * 상태(v3): 'loading' → 'title' → 'stage-select' → 'playing' → 'victory' | 'defeat'
 *   · 결과·게임중 나가기 → 'stage-select'  · 재도전(현재 스테이지) → 'playing'
 *
 * 부트스트랩 순서:
 *   1. initRenderer / initInput → await loadAssets(MANIFEST)
 *   2. initGrid(LEVEL) → initPath(LEVEL) → buildBackground(LEVEL)   // 타이틀/선택 배경(스테이지1)
 *   3. initEconomy / initCombat / initWaves / initScore / initProgress
 *   4. ui·fx·audio init — 개별 try/catch 격리 (§1: 없어도 게임이 돌아야 함)
 *   5. 레이어 등록: 10=배경, 20=엔티티, 30=fx(파티클→플로터→플래시), 40=배치 오버레이
 *   6. startLoop(update, render) → 'title'
 *
 * update(dt): playing일 때만 updateWaves → updateCombat → fx update 3종.
 * fx update 예외는 해당 fx만 비활성화하고 게임은 계속 (§1 부분 재실행 보장).
 *
 * 스테이지 진입 오케스트레이션(§14.1, main 소관):
 *   ui:stage-selected {stageIndex} → state='playing' → LEVELS[i] 로드 →
 *   initGrid/Path/Background(i) → emit('stage:started', {stageIndex, stageId})  // game:started보다 먼저
 *   → emit('game:started', {})                                                  // 기존 리셋 신호(불변)
 *
 * 승패 판정(main 소관, 계약 §8):
 *   wave:cleared에서 index >= 활성 스테이지 total → game:won {kills, livesLeft}
 *   lives:changed에서 lives <= 0                 → game:over {waveReached, kills}
 *   (v3/D16) total은 하드코딩 10이 아니라 wave:started {total}로 캐시한 활성 스테이지 값 — 데이터가 진실.
 *
 * 구독: ui:start-requested / ui:stage-select-requested — 'stage-select' 진입
 *      ui:stage-selected {stageIndex} — 스테이지 진입 오케스트레이션(§14.1)
 *      ui:restart-requested — 캐시한 현재 stageIndex로 재진입
 *      ui:speed-changed {multiplier} → loop.setSpeed
 *      wave:cleared / lives:changed — 승패 판정
 *      wave:started / enemy:killed — 승패 페이로드용 통계(waveReached·kills·total) 집계 (읽기 전용)
 * 발행: stage:started {stageIndex, stageId} / game:started {} /
 *      game:won {kills, livesLeft} / game:over {waveReached, kills}
 *
 * 디버그 훅 (제거 금지 — playtester/qa의 유일한 내부 접근 통로): window.GAME
 */

import { on, emit } from './core/events.js';
import { startLoop, setSpeed, getSpeed } from './core/loop.js';
import { initRenderer, registerLayer, render } from './core/renderer.js';
import { initInput } from './core/input.js';
import { loadAssets } from './core/assets.js';
import { MANIFEST } from '../assets/manifest.js';

import { initGrid } from './map/grid.js';
import { initPath } from './map/path.js';
import { buildBackground, drawBackground } from './map/tilemap.js';

import { initEconomy, getGold, getLives } from './systems/economy.js';
import { initCombat, updateCombat, drawEntities, towers, enemies, projectiles, zones } from './systems/combat.js';
import { initWaves, updateWaves } from './systems/waves.js';
import { initScore, getScore } from './systems/score.js';
import { initProgress, getSnapshot } from './systems/progress.js';

import { initHud } from './ui/hud.js';
import { initShop } from './ui/shop.js';
import { initPlacement, drawOverlay } from './ui/placement.js';
import { initPanel } from './ui/panel.js';
import { initScreens } from './ui/screens.js';
import { initStageSelect } from './ui/stageselect.js';

import { initParticles, updateParticles, drawParticles } from './fx/particles.js';
import { initFloaters, updateFloaters, drawFloaters } from './fx/floaters.js';
import { initFlashes, updateFlashes, drawFlashes } from './fx/flashes.js';

import { initSound } from './audio/sound.js';

import { TOWERS } from './data/towers.js';
import { ENEMIES } from './data/enemies.js';
import { WAVES } from './data/waves.js';
import { BALANCE } from './data/balance.js';
import * as levelsData from './data/levels.js';
import { SCORING } from './data/scoring.js';

/**
 * (v3) LEVELS 배열 해석 — map-designer가 아직 추가 중일 수 있으므로 namespace import로
 * 안전 접근한다(미존재 export가 링크타임 크래시를 내지 않도록). 부재 시 [LEVEL] 단일
 * 스테이지로 폴백 — v2 부팅 경로 회귀 보존(§15).
 * @returns {import('./data/levels.js').LevelDef[]}
 */
function resolveLevels() {
  const arr = levelsData.LEVELS;
  if (Array.isArray(arr) && arr.length > 0) return arr;
  return [levelsData.LEVEL];
}

/** @type {'loading'|'title'|'stage-select'|'playing'|'victory'|'defeat'} */
let state = 'loading';

/** 현재(마지막 진입) 스테이지 인덱스 — 재도전·window.GAME.stageIndex 근거. */
let currentStageIndex = 0;

/** 현재 판의 통계 — game:won/game:over 페이로드 근거. 스테이지 진입마다 리셋. */
const run = { kills: 0, wave: 0 };

/** 활성 스테이지의 웨이브 총수 — wave:started {total}로 캐시(D16). 승리 판정의 진실. */
let waveTotal = 0;

// ── 상태 머신 구독 (계약 §3.1·§3.10) ────────────────────────────────────────

// 타이틀 "게임 시작"·결과 "스테이지 선택으로"·게임중 나가기 → 스테이지 선택 화면.
// (v3) 직접 플레이 경로는 폐기 — ui:start-requested도 스테이지 선택으로 재지향(§3.10 하위호환).
on('ui:start-requested', goStageSelect);
on('ui:stage-select-requested', goStageSelect);

// 스테이지 카드 클릭 → 진입 오케스트레이션(§14.1).
on('ui:stage-selected', (p) => enterStage(Number(p && p.stageIndex)));

// 재도전 → 캐시한 현재 스테이지로 즉시 재진입(선택 화면 경유 없이).
on('ui:restart-requested', () => {
  if (state === 'loading') return;
  enterStage(currentStageIndex);
});

on('ui:speed-changed', (p) => setSpeed(p.multiplier));

on('wave:started', (p) => {
  run.wave = p.index;
  const t = Number(p && p.total);
  if (Number.isFinite(t) && t > 0) waveTotal = t; // 활성 스테이지 total 캐시(D16)
});

on('enemy:killed', () => {
  run.kills += 1;
});

/**
 * 승패 판정 구독 등록 — **initScore 이후** 호출(§14.2 순서 보장).
 * 최종 웨이브 클리어는 하나의 wave:cleared로 ① score의 웨이브 점수 가산과 ② main의 승리 판정을
 * 동시에 트리거한다. score.js가 먼저 구독(initScore)돼 있어야 게임이 game:won→score:finalized로
 * 확정되기 전에 최종 웨이브 보너스가 wave 소계에 포함된다. 구독 순서 의존을 등록 시점으로 명시.
 */
function initWinLoseDetection() {
  on('wave:cleared', (p) => {
    if (state !== 'playing') return;
    const total = waveTotal > 0 ? waveTotal : WAVES.length; // 데이터 우선, 캐시 부재 시 폴백
    if (total > 0 && p.index >= total) {
      state = 'victory';
      emit('game:won', { kills: run.kills, livesLeft: getLives() });
    }
  });

  on('lives:changed', (p) => {
    if (state !== 'playing') return;
    if (p.lives <= 0) {
      state = 'defeat';
      emit('game:over', { waveReached: run.wave, kills: run.kills });
    }
  });
}

/** 타이틀·결과·게임중 → 스테이지 선택. 진행 중이던 판은 포기(점수 미확정 — §14.1). */
function goStageSelect() {
  if (state === 'loading') return;
  state = 'stage-select';
}

/**
 * 스테이지 진입 오케스트레이션(§14.1). 순서 불변식:
 *   state='playing' → LEVELS[i] → initGrid/Path/Background(i)
 *   → stage:started(컨텍스트 캐시) → game:started(리셋).
 * stage:started가 반드시 game:started보다 먼저 — economy/waves/score가 컨텍스트를 캐시한 뒤 리셋.
 * @param {number} idx - 진입할 스테이지 인덱스 0~(LEVELS.length-1)
 */
function enterStage(idx) {
  if (state === 'loading') return;
  const levels = resolveLevels();
  if (!Number.isInteger(idx) || idx < 0 || idx >= levels.length) {
    console.warn(`[main] enterStage: 유효하지 않은 stageIndex ${idx} — 무시`);
    return;
  }
  const level = levels[idx];
  currentStageIndex = idx;
  run.kills = 0;
  run.wave = 0;
  waveTotal = 0;
  state = 'playing';

  // 맵 재초기화 (main→map 직접 호출 허용, §1). grid 점유 원장·경로·배경 캐시를 스테이지에 맞춰 재설정.
  initGrid(level);
  initPath(level);
  buildBackground(level);

  // 컨텍스트 브로드캐스트 — game:started보다 먼저(§14.1). stageId는 economy/waves/score/ui가 소비.
  emit('stage:started', { stageIndex: idx, stageId: level.id });
  // 기존 리셋 신호(불변) — economy/combat/waves/score/fx/ui가 전 상태를 리셋.
  emit('game:started', {});
}

// ── 루프 훅 ─────────────────────────────────────────────────────────────────

/** fx update 3종 — 예외 시 해당 fx만 비활성화 (§1: fx 결함이 게임을 못 멈춤). */
const fxUpdaters = [
  ['fx/particles', updateParticles],
  ['fx/floaters', updateFloaters],
  ['fx/flashes', updateFlashes],
];
const deadFx = new Set();

/** @param {number} dt - 항상 STEP (1/60) */
function update(dt) {
  if (state !== 'playing') return;
  updateWaves(dt);
  updateCombat(dt);
  for (const [name, fn] of fxUpdaters) {
    if (deadFx.has(name)) continue;
    try {
      fn(dt);
    } catch (err) {
      deadFx.add(name);
      console.error(`[main] ${name} update 예외 — 해당 fx 비활성화, 게임 계속:`, err);
    }
  }
}

// ── 부트스트랩 ──────────────────────────────────────────────────────────────

/** ui/fx/audio 전용 — 실패를 격리하고 게임은 계속 (§1). map/systems 실패는 격리하지 않는다(치명). */
function safeInit(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[main] ${name} init 실패 — 해당 모듈 없이 진행 (§1 격리):`, err);
  }
}

async function bootstrap() {
  const canvas = document.getElementById('game-canvas');
  initRenderer(canvas);
  initInput(canvas);

  const { loaded, failed } = await loadAssets(MANIFEST);
  const total = Object.keys(MANIFEST).length;
  console.info(
    `[main] 에셋 ${loaded}/${total} 로딩 완료` +
      (failed.length > 0 ? ` — 실패(플레이스홀더 사용): ${failed.join(', ')}` : '')
  );

  // 맵 — 타이틀/선택 화면 배경용 스테이지1 초기화. 실제 진입 시 enterStage가 스테이지별로 재초기화.
  const boot = resolveLevels()[0];
  initGrid(boot);
  initPath(boot);
  buildBackground(boot);

  // 시스템 — 이벤트 구독 등록. progress는 부트스트랩에서 저장 로드(게임 시작 전).
  initEconomy();
  initCombat();
  initWaves();
  initScore();
  initProgress();
  // 승패 판정은 initScore 이후 구독 — 최종 웨이브 클리어 시 score가 웨이브 보너스를 먼저 가산(§14.2).
  initWinLoseDetection();

  // ui/fx/audio — 개별 격리 (§1: 이 셋 없이도 게임이 돌아야 함)
  safeInit('ui/hud', initHud);
  safeInit('ui/shop', initShop);
  safeInit('ui/placement', initPlacement);
  safeInit('ui/panel', initPanel);
  safeInit('ui/screens', initScreens);
  safeInit('ui/stageselect', initStageSelect); // (v3) 스테이지 선택 화면 — §1 격리 패턴
  safeInit('fx/particles', initParticles);
  safeInit('fx/floaters', initFloaters);
  safeInit('fx/flashes', initFlashes);
  safeInit('audio/sound', initSound);

  // 렌더 레이어 (계약 §8) — 동일 order는 등록 순서대로 호출됨
  registerLayer(10, drawBackground);
  registerLayer(20, drawEntities);
  registerLayer(30, drawParticles);
  registerLayer(30, drawFloaters);
  registerLayer(30, drawFlashes);
  registerLayer(40, drawOverlay);

  startLoop(update, render);
  state = 'title';
  console.info('[main] 부트스트랩 완료 — state: title');
}

// ── 디버그 훅 (계약 §8·§11 — 제거 금지) ─────────────────────────────────────

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.GAME = {
    get state() {
      return state;
    },
    get gold() {
      return getGold();
    },
    get lives() {
      return getLives();
    },
    get wave() {
      return run.wave;
    },
    get speed() {
      return getSpeed();
    },
    get stageIndex() {
      return currentStageIndex; // (v3) 현재 진입 스테이지 인덱스
    },
    get score() {
      return getScore(); // (v3) 현재 누적 점수(kill+wave 소계)
    },
    get progress() {
      return getSnapshot(); // (v3) {unlockedCount, bestScores[5]} 스냅샷
    },
    towers, // systems/combat의 live 배열 참조
    enemies,
    projectiles,
    zones, // v2 §8: 캐논 Lv3 화상 장판 (combat 소유 live 배열)
    emit, // QA 이벤트 주입용
    data: { TOWERS, ENEMIES, WAVES, BALANCE, LEVEL: levelsData.LEVEL, LEVELS: resolveLevels(), SCORING },
  };

  bootstrap().catch((err) => {
    console.error('[main] 부트스트랩 실패:', err);
  });
}
