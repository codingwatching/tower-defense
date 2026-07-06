/**
 * @module fx/particles (fx-dev)
 * 파티클 — 캐논 착탄 폭발(스플래시 반경 암시 링), 피격 스파크, 적 사망 팝+연기,
 * 프로스트 냉기 파편, 아케인 총구 글로우, 건설 먼지/반짝임, 업그레이드 반짝임,
 * 누수 경고 퍼프, 투사체 트레일(캐논 연기·아케인 글로우 — 가상 트레이서 근사).
 * 렌더 레이어 30 (main이 등록), additive 합성은 draw 내부에서만. 이미지 에셋 없음.
 * 톤: 밝고 과장된 카툰, 0.2~0.5초 (GDD §8).
 *
 * 구독만 (읽기 API 금지 — 이 모듈 삭제 시에도 게임 동작, 계약 §1·§3):
 *   projectile:hit {target, damage, x, y, splashRadius}
 *   enemy:killed {enemy, reward, x, y} / enemy:escaped {enemy, livesCost}
 *   enemy:slowed {enemy, factor, duration}
 *   tower:placed {tower, cost} / tower:upgraded {tower, cost}
 *   tower:fired {towerType, x, y, target} / game:started {} (전체 클리어)
 */

import { on } from '../core/events.js';

// ─────────────────────────────────────────────────────────────
// 연출 강도 상수 — 튜닝은 전부 여기서 (playtester 피드백 대응 지점)
// ─────────────────────────────────────────────────────────────
const POOL_SIZE = 256;          // 동시 파티클 상한. 초과 시 가장 오래된 것 재활용
const TRACER_POOL_SIZE = 24;    // 동시 투사체 트레이서 상한

const EXPLOSION = { sparks: 14, smokes: 5, speedMin: 120, speedMax: 300, life: 0.4, ringLife: 0.32 };
const HIT_SPARK = { count: 5, speedMin: 70, speedMax: 180, life: 0.22 };
const DEATH_POP = { count: 10, smokes: 3, speedMin: 50, speedMax: 180, life: 0.45, bossScale: 2.2 };
const FROST_SHARDS = { count: 7, speedMin: 50, speedMax: 140, life: 0.35, gravity: 260 };
const ARCANE_MUZZLE = { count: 6, speedMin: 30, speedMax: 90, life: 0.28 };
const BUILD_DUST = { puffs: 8, stars: 5, speedMin: 30, speedMax: 90, life: 0.5 };
const UPGRADE_SPARKLE = { stars: 8, speedMin: 40, speedMax: 110, life: 0.55 };
const ESCAPE_PUFF = { count: 6, speedMin: 20, speedMax: 70, life: 0.4 };
const TRAIL = {
  speed: { cannon: 340, arcane: 460 }, // 가상 트레이서 px/s (실 투사체 속도 근사)
  emitInterval: 0.03,                  // 트레일 입자 방출 간격(초)
  maxFlight: 1.6,                      // 트레이서 최대 비행 시간(초) — 안전 소멸
};

// 사망 팝 색 (적 타입별, [r,g,b])
const DEATH_COLORS = {
  goblin: [120, 200, 70],
  orc: [90, 150, 65],
  steel_brute: [165, 180, 195],
  wasp_runner: [250, 205, 60],
  stone_golem: [240, 130, 45],
  default: [220, 220, 220],
};

// ─────────────────────────────────────────────────────────────
// 풀 (링 버퍼 — 고갈 시 head 위치의 최오래된 입자를 조용히 재활용)
// ─────────────────────────────────────────────────────────────
function makeParticle() {
  return {
    active: false, shape: 'dot', additive: true,
    x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 1, size0: 3, size1: 0,
    gravity: 0, drag: 0, alpha: 1, color: '#fff',
  };
}
const pool = [];
for (let i = 0; i < POOL_SIZE; i++) pool.push(makeParticle());
let poolHead = 0;

function spawn() {
  const p = pool[poolHead];
  poolHead = (poolHead + 1) % POOL_SIZE;
  p.active = true;
  p.shape = 'dot'; p.additive = true;
  p.vx = 0; p.vy = 0; p.gravity = 0; p.drag = 0;
  p.alpha = 1; p.size1 = 0;
  return p;
}

function makeTracer() {
  return { active: false, x: 0, y: 0, target: null, type: 'cannon', speed: 0, emit: 0, age: 0 };
}
const tracers = [];
for (let i = 0; i < TRACER_POOL_SIZE; i++) tracers.push(makeTracer());
let tracerHead = 0;

const rand = (min, max) => min + Math.random() * (max - min);
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// ─────────────────────────────────────────────────────────────
// 이미터
// ─────────────────────────────────────────────────────────────
function burst(x, y, count, cfg, init) {
  for (let i = 0; i < count; i++) {
    const p = spawn();
    const ang = Math.random() * Math.PI * 2;
    const spd = rand(cfg.speedMin, cfg.speedMax);
    p.x = x; p.y = y;
    p.vx = Math.cos(ang) * spd; p.vy = Math.sin(ang) * spd;
    p.life = p.maxLife = cfg.life * rand(0.7, 1.15);
    init(p, i);
  }
}

function explosion(x, y, splashRadius) {
  burst(x, y, EXPLOSION.sparks, EXPLOSION, (p) => {
    p.shape = 'spark'; p.drag = 3.5; p.size0 = rand(2, 3.5);
    p.color = Math.random() < 0.5 ? 'rgb(255,200,80)' : 'rgb(255,140,40)';
  });
  burst(x, y, EXPLOSION.smokes, { ...EXPLOSION, speedMin: 15, speedMax: 55, life: EXPLOSION.life * 1.3 }, (p) => {
    p.shape = 'dot'; p.additive = false; p.drag = 2; p.vy -= 20;
    p.size0 = rand(6, 10); p.size1 = rand(14, 20);
    p.alpha = 0.35; p.color = 'rgb(90,80,75)';
  });
  // 스플래시 반경 암시 링 — 실제 splashRadius까지 확장
  const ring = spawn();
  ring.shape = 'ring'; ring.x = x; ring.y = y;
  ring.life = ring.maxLife = EXPLOSION.ringLife;
  ring.size0 = 10; ring.size1 = Math.max(24, splashRadius);
  ring.alpha = 0.9; ring.color = 'rgb(255,190,90)';
}

function hitSpark(x, y) {
  burst(x, y, HIT_SPARK.count, HIT_SPARK, (p) => {
    p.shape = 'spark'; p.drag = 4; p.size0 = rand(1.5, 2.5);
    p.color = 'rgb(255,240,180)';
  });
}

function deathPop(x, y, type, isBoss) {
  const scale = isBoss ? DEATH_POP.bossScale : 1;
  const color = rgb(DEATH_COLORS[type] || DEATH_COLORS.default);
  burst(x, y, Math.round(DEATH_POP.count * scale), {
    speedMin: DEATH_POP.speedMin * scale, speedMax: DEATH_POP.speedMax * scale,
    life: DEATH_POP.life,
  }, (p) => {
    p.shape = 'dot'; p.drag = 3; p.gravity = 160;
    p.size0 = rand(2.5, 4.5) * scale; p.color = color;
  });
  burst(x, y, DEATH_POP.smokes, { speedMin: 10, speedMax: 40, life: DEATH_POP.life * 1.2 }, (p) => {
    p.shape = 'dot'; p.additive = false; p.drag = 2; p.vy -= 25;
    p.size0 = rand(5, 8) * scale; p.size1 = rand(12, 16) * scale;
    p.alpha = 0.3; p.color = 'rgb(100,95,90)';
  });
}

function frostShards(x, y) {
  burst(x, y, FROST_SHARDS.count, FROST_SHARDS, (p) => {
    p.shape = 'shard'; p.gravity = FROST_SHARDS.gravity; p.drag = 1.5;
    p.size0 = rand(2.5, 4.5);
    p.color = Math.random() < 0.5 ? 'rgb(180,230,255)' : 'rgb(120,190,250)';
  });
}

function arcaneMuzzle(x, y) {
  burst(x, y, ARCANE_MUZZLE.count, ARCANE_MUZZLE, (p) => {
    p.shape = 'dot'; p.drag = 2.5;
    p.size0 = rand(3, 5); p.color = 'rgb(200,120,255)';
  });
}

function buildDust(x, y) {
  burst(x, y, BUILD_DUST.puffs, BUILD_DUST, (p) => {
    p.shape = 'dot'; p.additive = false; p.drag = 3;
    p.size0 = rand(4, 7); p.size1 = rand(9, 13);
    p.alpha = 0.4; p.color = 'rgb(194,164,120)';
  });
  burst(x, y, BUILD_DUST.stars, { ...BUILD_DUST, speedMin: 20, speedMax: 60 }, (p) => {
    p.shape = 'star'; p.vy -= 40; p.size0 = rand(3, 5);
    p.color = 'rgb(255,255,220)';
  });
}

function upgradeSparkle(x, y) {
  burst(x, y, UPGRADE_SPARKLE.stars, UPGRADE_SPARKLE, (p) => {
    p.shape = 'star'; p.vy = -Math.abs(p.vy) - 30; p.drag = 1.5;
    p.size0 = rand(3, 5.5); p.color = 'rgb(255,220,120)';
  });
}

function escapePuff(x, y) {
  burst(x, y, ESCAPE_PUFF.count, ESCAPE_PUFF, (p) => {
    p.shape = 'dot'; p.additive = false; p.drag = 2; p.vy -= 20;
    p.size0 = rand(5, 8); p.size1 = rand(11, 15);
    p.alpha = 0.4; p.color = 'rgb(170,50,45)';
  });
}

// ─── 투사체 트레일 (가상 트레이서 — 실 투사체 상태를 읽지 않는 이벤트 전용 근사) ───
function spawnTracer(x, y, target, type) {
  const t = tracers[tracerHead];
  tracerHead = (tracerHead + 1) % TRACER_POOL_SIZE;
  t.active = true; t.x = x; t.y = y;
  t.target = target; t.type = type;
  t.speed = TRAIL.speed[type]; t.emit = 0; t.age = 0;
}

function retireTracer(target) {
  for (const t of tracers) {
    if (t.active && t.target === target) { t.active = false; t.target = null; return; }
  }
}

function emitTrailPuff(t) {
  const p = spawn();
  p.x = t.x + rand(-2, 2); p.y = t.y + rand(-2, 2);
  if (t.type === 'cannon') {
    p.shape = 'dot'; p.additive = false;
    p.life = p.maxLife = 0.45; p.vy = -15;
    p.size0 = 3; p.size1 = 7; p.alpha = 0.3; p.color = 'rgb(110,105,100)';
  } else { // arcane
    p.shape = 'dot';
    p.life = p.maxLife = 0.3;
    p.size0 = 4.5; p.size1 = 0.5; p.alpha = 0.8; p.color = 'rgb(190,110,255)';
  }
}

// ─────────────────────────────────────────────────────────────
// 이벤트 핸들러 (전부 방어적 — fx의 예외가 전투 emit을 끊으면 안 된다)
// ─────────────────────────────────────────────────────────────
let warned = false;
function guard(fn) {
  return (payload) => {
    try { fn(payload || {}); } catch (e) {
      if (!warned) { warned = true; console.warn('[fx/particles] 이펙트 강등:', e); }
    }
  };
}

function clearAll() {
  for (const p of pool) p.active = false;
  for (const t of tracers) { t.active = false; t.target = null; }
}

/** 구독 등록. main이 1회 호출. */
export function initParticles() {
  on('projectile:hit', guard(({ target, x, y, splashRadius }) => {
    if (!Number.isFinite(x)) return;
    if (splashRadius > 0) explosion(x, y, splashRadius);
    else hitSpark(x, y);
    if (target) retireTracer(target);
  }));
  on('enemy:killed', guard(({ enemy, x, y }) => {
    if (!Number.isFinite(x)) return;
    deathPop(x, y, enemy && enemy.type, !!(enemy && enemy.isBoss));
  }));
  on('enemy:escaped', guard(({ enemy }) => {
    if (enemy && Number.isFinite(enemy.x)) escapePuff(enemy.x, enemy.y);
  }));
  on('enemy:slowed', guard(({ enemy }) => {
    if (enemy && Number.isFinite(enemy.x)) frostShards(enemy.x, enemy.y);
  }));
  on('tower:fired', guard(({ towerType, x, y, target }) => {
    if (!Number.isFinite(x)) return;
    if (towerType === 'arcane') arcaneMuzzle(x, y);
    if (TRAIL.speed[towerType] && target) spawnTracer(x, y, target, towerType);
  }));
  on('tower:placed', guard(({ tower }) => {
    if (tower && Number.isFinite(tower.x)) buildDust(tower.x, tower.y);
  }));
  on('tower:upgraded', guard(({ tower }) => {
    if (tower && Number.isFinite(tower.x)) upgradeSparkle(tower.x, tower.y);
  }));
  on('game:started', guard(clearAll));
}

/** @param {number} dt - 고정 스텝 (초). main update에서 호출 (배속 반영) */
export function updateParticles(dt) {
  for (const t of tracers) {
    if (!t.active) continue;
    t.age += dt;
    const tg = t.target;
    if (!tg || !tg.alive || t.age > TRAIL.maxFlight) { t.active = false; t.target = null; continue; }
    const dx = tg.x - t.x, dy = tg.y - t.y;
    const d = Math.hypot(dx, dy);
    if (d < 10) { t.active = false; t.target = null; continue; }
    const step = t.speed * dt;
    t.x += (dx / d) * step; t.y += (dy / d) * step;
    t.emit -= dt;
    while (t.emit <= 0) { t.emit += TRAIL.emitInterval; emitTrailPuff(t); }
  }
  for (const p of pool) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; continue; }
    if (p.drag) { const k = 1 - Math.min(1, p.drag * dt); p.vx *= k; p.vy *= k; }
    if (p.gravity) p.vy += p.gravity * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
}

function drawOne(ctx, p) {
  const k = p.life / p.maxLife; // 1→0
  const size = p.size1 + (p.size0 - p.size1) * k;
  ctx.globalAlpha = p.alpha * k;
  switch (p.shape) {
    case 'spark': {
      ctx.strokeStyle = p.color; ctx.lineWidth = p.size0;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.stroke();
      break;
    }
    case 'ring': {
      ctx.strokeStyle = p.color; ctx.lineWidth = 1 + 2 * k;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size1 + (p.size0 - p.size1) * k, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'shard': {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - size);
      ctx.lineTo(p.x + size * 0.6, p.y);
      ctx.lineTo(p.x, p.y + size);
      ctx.lineTo(p.x - size * 0.6, p.y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'star': {
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x - size, p.y); ctx.lineTo(p.x + size, p.y);
      ctx.moveTo(p.x, p.y - size); ctx.lineTo(p.x, p.y + size);
      ctx.stroke();
      break;
    }
    default: { // dot
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, size), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * 레이어 30 drawFn의 일부 (main이 floaters·flashes와 함께 등록). 상태 변경 금지.
 * 2패스: 연기/먼지(normal) → 스파크/글로우(additive).
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawParticles(ctx) {
  ctx.save();
  for (const p of pool) if (p.active && !p.additive) drawOne(ctx, p);
  ctx.globalCompositeOperation = 'lighter';
  for (const p of pool) if (p.active && p.additive) drawOne(ctx, p);
  ctx.restore();
}
