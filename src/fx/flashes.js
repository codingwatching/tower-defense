/**
 * @module fx/flashes (fx-dev)
 * 화면·엔티티 플래시 — 적 피격 흰색 점멸(타겟 추적), 슬로우 청색 틴트,
 * 타워별 총구 섬광(아케인 최대), 화면 흔들림(보스 등장 1회·라이프 손실 — 짧고 드물게),
 * 라이프 손실 붉은 비네트. 렌더 레이어 30 (main이 등록).
 * setCameraOffset은 fx에 허용된 유일한 코어 API 호출 (계약 §8).
 *
 * 구독만 (계약 §1·§3 — 모듈 삭제 시에도 게임 동작):
 *   projectile:hit {target, x, y} / enemy:slowed {enemy} / tower:fired {towerType, x, y}
 *   boss:spawned {enemy} / lives:changed {lives, delta} / game:started {}
 */

import { on } from '../core/events.js';
import { setCameraOffset } from '../core/renderer.js';

// ─────────────────────────────────────────────────────────────
// 연출 강도 상수 — 튜닝은 전부 여기서
// ─────────────────────────────────────────────────────────────
const FLASH_POOL_SIZE = 32; // 동시 플래시 상한. 초과 시 가장 오래된 것 재활용

const HIT_FLASH = { life: 0.12, radius: 15, bossRadius: 36, color: 'rgb(255,255,255)', alpha: 0.85 };
const MUZZLE = { // 타워별 총구 섬광. arrow는 공속이 높아 가장 절제
  arrow:  { life: 0.07, radius: 7,  color: 'rgb(255,240,190)', alpha: 0.7 },
  cannon: { life: 0.12, radius: 15, color: 'rgb(255,170,70)',  alpha: 0.9 },
  frost:  { life: 0.10, radius: 10, color: 'rgb(160,220,255)', alpha: 0.8 },
  arcane: { life: 0.16, radius: 18, color: 'rgb(210,130,255)', alpha: 0.95 },
};
const SLOW_TINT = { radius: 20, bossRadius: 46, color: 'rgb(80,150,255)', alpha: 0.28 };
const SHAKE_BOSS = { magnitude: 9, duration: 0.55 }; // 보스 등장 — 강하게 1회
const SHAKE_LEAK = { magnitude: 4, duration: 0.22 }; // 기지 피격(누수) — 짧게
const VIGNETTE = { life: 0.4, maxAlpha: 0.45, color: [190, 25, 25] };

// ─────────────────────────────────────────────────────────────
// 상태
// ─────────────────────────────────────────────────────────────
function makeFlash() {
  return { active: false, x: 0, y: 0, target: null, life: 0, maxLife: 1, radius: 10, color: '#fff', alpha: 1 };
}
const flashes = [];
for (let i = 0; i < FLASH_POOL_SIZE; i++) flashes.push(makeFlash());
let head = 0;

const slowedEnemies = new Set();
const shake = { time: 0, duration: 1, magnitude: 0, dx: 0, dy: 0 };
let vignetteTime = 0;
let vignetteGradient = null; // 캔버스 크기 고정(960×640) — 최초 draw에서 1회 생성

function pushFlash(x, y, target, cfg, radiusOverride) {
  const f = flashes[head];
  head = (head + 1) % FLASH_POOL_SIZE;
  f.active = true;
  f.x = x; f.y = y; f.target = target || null;
  f.life = f.maxLife = cfg.life;
  f.radius = radiusOverride !== undefined ? radiusOverride : cfg.radius;
  f.color = cfg.color; f.alpha = cfg.alpha;
}

function startShake(cfg) {
  // 진행 중이면 더 강한 쪽 유지 — 연타로 누적 증폭되지 않게 (드물고 짧게)
  if (shake.time > 0 && shake.magnitude >= cfg.magnitude) return;
  shake.time = cfg.duration;
  shake.duration = cfg.duration;
  shake.magnitude = cfg.magnitude;
}

let warned = false;
function guard(fn) {
  return (payload) => {
    try { fn(payload || {}); } catch (e) {
      if (!warned) { warned = true; console.warn('[fx/flashes] 이펙트 강등:', e); }
    }
  };
}

function clearAll() {
  for (const f of flashes) { f.active = false; f.target = null; }
  slowedEnemies.clear();
  shake.time = 0; shake.dx = 0; shake.dy = 0;
  vignetteTime = 0;
  try { setCameraOffset(0, 0); } catch { /* 코어 미초기화 시 무시 */ }
}

/** 구독 등록. main이 1회 호출. */
export function initFlashes() {
  on('projectile:hit', guard(({ target, x, y }) => {
    if (!Number.isFinite(x)) return;
    const boss = !!(target && target.isBoss);
    pushFlash(x, y, target, HIT_FLASH, boss ? HIT_FLASH.bossRadius : HIT_FLASH.radius);
  }));
  on('enemy:slowed', guard(({ enemy }) => {
    if (enemy) slowedEnemies.add(enemy);
  }));
  on('tower:fired', guard(({ towerType, x, y }) => {
    const cfg = MUZZLE[towerType];
    if (cfg && Number.isFinite(x)) pushFlash(x, y, null, cfg);
  }));
  on('boss:spawned', guard(() => startShake(SHAKE_BOSS)));
  on('lives:changed', guard(({ delta }) => {
    if (delta < 0) {
      startShake(SHAKE_LEAK);
      vignetteTime = VIGNETTE.life;
    }
  }));
  on('game:started', guard(clearAll));
}

/** @param {number} dt - 고정 스텝 (초). 셰이크 감쇠 후 setCameraOffset 호출 */
export function updateFlashes(dt) {
  for (const f of flashes) {
    if (!f.active) continue;
    f.life -= dt;
    if (f.life <= 0) { f.active = false; f.target = null; continue; }
    if (f.target && f.target.alive) { f.x = f.target.x; f.y = f.target.y; } // 점멸이 적을 따라감
  }

  for (const e of slowedEnemies) {
    if (!e.alive || !e.slowed) slowedEnemies.delete(e);
  }

  if (vignetteTime > 0) vignetteTime = Math.max(0, vignetteTime - dt);

  if (shake.time > 0) {
    shake.time -= dt;
    if (shake.time <= 0) {
      shake.time = 0; shake.dx = 0; shake.dy = 0;
      setCameraOffset(0, 0);
    } else {
      const falloff = shake.time / shake.duration;
      shake.dx = (Math.random() * 2 - 1) * shake.magnitude * falloff;
      shake.dy = (Math.random() * 2 - 1) * shake.magnitude * falloff;
      setCameraOffset(shake.dx, shake.dy);
    }
  }
}

/**
 * 레이어 30 drawFn의 일부. 상태 변경 금지 (캐시 생성 제외).
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawFlashes(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 슬로우 청색 틴트 — 슬로우 중인 적을 따라다니는 부드러운 원
  ctx.fillStyle = SLOW_TINT.color;
  ctx.globalAlpha = SLOW_TINT.alpha;
  for (const e of slowedEnemies) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.isBoss ? SLOW_TINT.bossRadius : SLOW_TINT.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 피격 점멸·총구 섬광 — 이중 원 (코어 진하게 + 바깥 은은하게)
  for (const f of flashes) {
    if (!f.active) continue;
    const k = f.life / f.maxLife; // 1→0
    ctx.fillStyle = f.color;
    ctx.globalAlpha = f.alpha * k * 0.35;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = f.alpha * k;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // 라이프 손실 붉은 비네트 — normal 합성, 셰이크 오프셋 대비 여유분 확대 드로우
  if (vignetteTime > 0) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    if (!vignetteGradient) {
      const [r, g, b] = VIGNETTE.color;
      vignetteGradient = ctx.createRadialGradient(w / 2, h / 2, h * 0.42, w / 2, h / 2, w * 0.72);
      vignetteGradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
      vignetteGradient.addColorStop(1, `rgba(${r},${g},${b},1)`);
    }
    ctx.save();
    ctx.globalAlpha = VIGNETTE.maxAlpha * (vignetteTime / VIGNETTE.life);
    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(-16, -16, w + 32, h + 32);
    ctx.restore();
  }
}
