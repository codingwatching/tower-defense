/**
 * @module main (engine-dev)
 * 부트스트랩 + 게임 상태 머신 + 전 모듈 조립. 계약 §8.
 *
 * 상태: 'loading' → 'title' → 'playing' → 'victory' | 'defeat' (재시작 → 'playing')
 *
 * 부트스트랩 순서:
 *   1. initRenderer / initInput → await loadAssets(MANIFEST)
 *   2. initGrid(LEVEL) → initPath(LEVEL) → buildBackground(LEVEL)
 *   3. initEconomy / initCombat / initWaves
 *   4. ui·fx·audio init — 개별 try/catch 격리 (§1: 없어도 게임이 돌아야 함)
 *   5. 레이어 등록: 10=배경, 20=엔티티, 30=fx(파티클→플로터→플래시), 40=배치 오버레이
 *   6. startLoop(update, render) → 'title'
 *
 * update(dt): playing일 때만 updateWaves → updateCombat → fx update 3종.
 * fx update 예외는 해당 fx만 비활성화하고 게임은 계속 (§1 부분 재실행 보장).
 *
 * 승패 판정(main 소관, 계약 §8):
 *   wave:cleared에서 index === WAVES.length → game:won {kills, livesLeft}
 *   lives:changed에서 lives <= 0        → game:over {waveReached, kills} (즉시 'defeat')
 *
 * 구독: ui:start-requested / ui:restart-requested — 상태 리셋 후 game:started 발행
 *      ui:speed-changed {multiplier} → loop.setSpeed
 *      wave:cleared / lives:changed — 승패 판정
 *      wave:started / enemy:killed — 승패 페이로드용 통계(waveReached·kills) 집계 (읽기 전용)
 * 발행: game:started {} / game:won {kills, livesLeft} / game:over {waveReached, kills}
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

import { initHud } from './ui/hud.js';
import { initShop } from './ui/shop.js';
import { initPlacement, drawOverlay } from './ui/placement.js';
import { initPanel } from './ui/panel.js';
import { initScreens } from './ui/screens.js';

import { initParticles, updateParticles, drawParticles } from './fx/particles.js';
import { initFloaters, updateFloaters, drawFloaters } from './fx/floaters.js';
import { initFlashes, updateFlashes, drawFlashes } from './fx/flashes.js';

import { initSound } from './audio/sound.js';

import { TOWERS } from './data/towers.js';
import { ENEMIES } from './data/enemies.js';
import { WAVES } from './data/waves.js';
import { BALANCE } from './data/balance.js';
import { LEVEL } from './data/levels.js';

/** @type {'loading'|'title'|'playing'|'victory'|'defeat'} */
let state = 'loading';

/** 현재 판의 통계 — game:won/game:over 페이로드 근거. game:started마다 리셋. */
const run = { kills: 0, wave: 0 };

// ── 상태 머신 구독 (계약 §3.1) ──────────────────────────────────────────────

on('ui:start-requested', startRun);
on('ui:restart-requested', startRun);

on('ui:speed-changed', (p) => setSpeed(p.multiplier));

on('wave:started', (p) => {
  run.wave = p.index;
});

on('enemy:killed', () => {
  run.kills += 1;
});

on('wave:cleared', (p) => {
  if (state !== 'playing') return;
  if (WAVES.length > 0 && p.index >= WAVES.length) {
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

/** 시작·재시작 공용. 상태 리셋 완료 후 game:started 발행 — systems 전부가 이걸로 리셋. */
function startRun() {
  if (state === 'loading' || state === 'playing') return;
  run.kills = 0;
  run.wave = 0;
  state = 'playing';
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

  // 맵 — grid(점유 원장) → path(진행 거리) → 배경 오프스크린 캐시 순
  initGrid(LEVEL);
  initPath(LEVEL);
  buildBackground(LEVEL);

  // 시스템 — 이벤트 구독 등록
  initEconomy();
  initCombat();
  initWaves();

  // ui/fx/audio — 개별 격리 (§1: 이 셋 없이도 게임이 돌아야 함)
  safeInit('ui/hud', initHud);
  safeInit('ui/shop', initShop);
  safeInit('ui/placement', initPlacement);
  safeInit('ui/panel', initPanel);
  safeInit('ui/screens', initScreens);
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

// ── 디버그 훅 (계약 §8 — 제거 금지) ─────────────────────────────────────────

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
    towers, // systems/combat의 live 배열 참조
    enemies,
    projectiles,
    zones, // v2 §8: 캐논 Lv3 화상 장판 (combat 소유 live 배열)
    emit, // QA 이벤트 주입용
    data: { TOWERS, ENEMIES, WAVES, BALANCE, LEVEL },
  };

  bootstrap().catch((err) => {
    console.error('[main] 부트스트랩 실패:', err);
  });
}
