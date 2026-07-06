/**
 * @module fx/floaters (fx-dev)
 * 플로팅 텍스트 — 데미지 숫자(피격점 위로 상승·페이드), 골드 획득 +n (GDD §8 필수, AC-18).
 * 렌더 레이어 30 (main이 particles·flashes와 함께 등록). 이미지 에셋 없음.
 *
 * 구독만 (계약 §1·§3 — 모듈 삭제 시에도 게임 동작):
 *   projectile:hit {damage, x, y} — 데미지 숫자
 *   enemy:killed {reward, x, y} — 골드 텍스트
 *   game:started {} — 전체 클리어
 */

import { on } from '../core/events.js';

// ─────────────────────────────────────────────────────────────
// 연출 강도 상수 — 튜닝은 전부 여기서
// ─────────────────────────────────────────────────────────────
const POOL_SIZE = 48;      // 동시 텍스트 상한. 초과 시 가장 오래된 것 재활용
const JITTER_X = 9;        // 스폰 x 흔들림 px (겹침 방지)
const FADE_PORTION = 0.45; // 수명 마지막 몇 %에서 페이드아웃

const DAMAGE = { life: 0.55, riseSpeed: 55, offsetY: -10, font: 'bold 14px "Trebuchet MS", sans-serif', color: '#ffffff' };
const GOLD = { life: 0.85, riseSpeed: 45, offsetY: -16, font: 'bold 16px "Trebuchet MS", sans-serif', color: '#ffd84a' };
const OUTLINE = { color: 'rgba(20,15,10,0.7)', width: 3 };

// ─────────────────────────────────────────────────────────────
// 풀 (링 버퍼 — 고갈 시 최오래된 것 조용히 재활용)
// ─────────────────────────────────────────────────────────────
function makeFloater() {
  return { active: false, text: '', x: 0, y: 0, vy: 0, life: 0, maxLife: 1, font: DAMAGE.font, color: DAMAGE.color };
}
const pool = [];
for (let i = 0; i < POOL_SIZE; i++) pool.push(makeFloater());
let head = 0;

function push(text, x, y, cfg) {
  const f = pool[head];
  head = (head + 1) % POOL_SIZE;
  f.active = true;
  f.text = text;
  f.x = x + (Math.random() * 2 - 1) * JITTER_X;
  f.y = y + cfg.offsetY;
  f.vy = -cfg.riseSpeed;
  f.life = f.maxLife = cfg.life;
  f.font = cfg.font;
  f.color = cfg.color;
}

let warned = false;
function guard(fn) {
  return (payload) => {
    try { fn(payload || {}); } catch (e) {
      if (!warned) { warned = true; console.warn('[fx/floaters] 이펙트 강등:', e); }
    }
  };
}

/** 구독 등록. main이 1회 호출. */
export function initFloaters() {
  on('projectile:hit', guard(({ damage, x, y }) => {
    if (!Number.isFinite(x) || !Number.isFinite(damage) || damage <= 0) return;
    push(String(Math.round(damage)), x, y, DAMAGE);
  }));
  on('enemy:killed', guard(({ reward, x, y }) => {
    if (!Number.isFinite(x) || !Number.isFinite(reward) || reward <= 0) return;
    push('+' + Math.round(reward), x, y, GOLD);
  }));
  on('game:started', guard(() => {
    for (const f of pool) f.active = false;
  }));
}

/** @param {number} dt - 고정 스텝 (초). main update에서 호출 (배속 반영) */
export function updateFloaters(dt) {
  for (const f of pool) {
    if (!f.active) continue;
    f.life -= dt;
    if (f.life <= 0) { f.active = false; continue; }
    f.y += f.vy * dt;
    f.vy *= 1 - Math.min(1, 3 * dt); // 상승 감속 — 끝에서 살짝 머무는 느낌
  }
}

/**
 * 레이어 30 drawFn의 일부. 상태 변경 금지.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawFloaters(ctx) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = OUTLINE.width;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE.color;
  for (const f of pool) {
    if (!f.active) continue;
    const k = f.life / f.maxLife; // 1→0
    ctx.globalAlpha = k < FADE_PORTION ? k / FADE_PORTION : 1;
    ctx.font = f.font;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
}
