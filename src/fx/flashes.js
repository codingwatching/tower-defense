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
 *
 * (v2) Lv3 속사 가속·과충전 시각 암시 — 계약 §3.9: 신규 이벤트·페이로드 없음,
 * "tower:fired 리듬"으로 표현. 타워별(x,y 키) 발사 간격을 추적해 섬광 강도만 조절한다.
 * 전투 상태를 읽지 않는 근사이므로 Lv1~2에도 옅게 걸릴 수 있음 — 허용 오차 (TRAIL 상수와 같은 정책).
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
// (v2) 발사 리듬 → 섬광 강도 배율. 수치는 data/towers.js mechanism의 근사치 (직접 읽지 않는다).
// arrow(속사 가속): Lv3 cooldown 0.45, 최대 스택 간격 ≈ 0.45×0.88⁴ ≈ 0.27 — calm~hot 사이 가열
// arcane(과충전): chargeTime 8초 — 직전 발사 후 대기가 길수록 섬광 증폭 (연사 중에도 옅게 존재)
const RAPID_HINT = { calm: 0.46, hot: 0.28, maxBoost: 1.8 };
const CHARGE_HINT = { chargeTime: 8, maxBoost: 1.7 };
const SHAKE_BOSS = { magnitude: 9, duration: 0.55 }; // 보스 등장 — 강하게 1회
const SHAKE_LEAK = { magnitude: 4, duration: 0.22 }; // 기지 피격(누수) — 짧게
const VIGNETTE = { life: 0.4, maxAlpha: 0.45, color: [190, 25, 25] };
// 비네트는 유일한 전체 화면 fx — 크기는 논리 좌표 상수 (계약 §11: 논리 960×640 불변, AC-35).
// ctx.canvas.width/height는 물리 px(논리×DPR)라 DPR>1에서 중심이 우하단으로 밀린다 — 참조 금지.
const LOGICAL_W = 960, LOGICAL_H = 640;

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
let fxClock = 0;               // 게임 시간 누적 (updateFlashes) — 발사 간격 측정용, 배속 불변
const lastFiredAt = new Map(); // '타워x,y' → 마지막 발사 시각(fxClock). 타워 참조를 잡지 않는다
let vignetteTime = 0;
let vignetteGradient = null; // 논리 크기(LOGICAL_W×H) 고정 — 최초 draw에서 1회 생성

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
  lastFiredAt.clear(); // fxClock은 단조 유지 — 리셋 직후 첫 발은 부스트 없음

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
    if (!cfg || !Number.isFinite(x)) return;
    const key = x + ',' + y;
    const prev = lastFiredAt.get(key);
    lastFiredAt.set(key, fxClock);
    let boost = 1;
    if (prev !== undefined) {
      const gap = fxClock - prev;
      if (towerType === 'arrow' && gap < RAPID_HINT.calm) {
        const heat = Math.min(1, (RAPID_HINT.calm - gap) / (RAPID_HINT.calm - RAPID_HINT.hot));
        boost = 1 + (RAPID_HINT.maxBoost - 1) * heat;
      } else if (towerType === 'arcane') {
        boost = 1 + (CHARGE_HINT.maxBoost - 1) * Math.min(1, gap / CHARGE_HINT.chargeTime);
      }
    }
    pushFlash(x, y, null, cfg, cfg.radius * boost);
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
  fxClock += dt;
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
    if (!vignetteGradient) {
      const [r, g, b] = VIGNETTE.color;
      vignetteGradient = ctx.createRadialGradient(
        LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_H * 0.42,
        LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_W * 0.72
      );
      vignetteGradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
      vignetteGradient.addColorStop(1, `rgba(${r},${g},${b},1)`);
    }
    ctx.save();
    ctx.globalAlpha = VIGNETTE.maxAlpha * (vignetteTime / VIGNETTE.life);
    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(-16, -16, LOGICAL_W + 32, LOGICAL_H + 32);
    ctx.restore();
  }
}
