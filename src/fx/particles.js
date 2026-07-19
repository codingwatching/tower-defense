/**
 * @module fx/particles (fx-dev)
 * 파티클 — 캐논 착탄 폭발(스플래시 반경 암시 링), 피격 스파크, 적 사망 팝+연기,
 * 프로스트 냉기 파편, 아케인 총구 글로우, 건설 먼지/반짝임, 업그레이드 반짝임,
 * 누수 경고 퍼프, 투사체 트레일(캐논 연기·아케인 글로우 — 가상 트레이서 근사).
 * 렌더 레이어 30 (main이 등록), additive 합성은 draw 내부에서만. 이미지 에셋 없음.
 * 톤: 밝고 과장된 카툰, 0.2~0.5초 (GDD §8).
 *
 * 구독만 (읽기 API 금지 — 이 모듈 삭제 시에도 게임 동작, 계약 §1·§3):
 *   projectile:hit {target, damage, x, y, splashRadius, towerType}
 *     (v4 §16.5) towerType('arrow'|'cannon'|'frost'|'arcane', 선택) → 타입별 시그니처 명중 이펙트
 *     분기. 부재(구 페이로드)면 기존 범용(hitSpark/explosion)으로 폴백 — AC-53.
 *   enemy:killed {enemy, reward, x, y} / enemy:escaped {enemy, livesCost}
 *   enemy:slowed {enemy, factor, duration}
 *   tower:placed {tower, cost} / tower:upgraded {tower, cost}
 *     (v4 §16.6) tower:upgraded → 진화 광기둥+글로우(+기존 상승 반짝임). 화면 셰이크 금지(AC-54).
 *   tower:fired {towerType, x, y, target} / game:started {} (전체 클리어)
 *   (v2 §3.9) zone:created {zone, x, y, radius, duration, kind} — 화염 지대 점화+지속 불꽃.
 *             바닥 원은 entities/zone.draw 소관(레이어 20), 여기는 그 위 불꽃만.
 *             틱 피해 이벤트는 없다 — 장판 자체가 지속 연출을 담당 (디렉터 확정: 숫자 스팸 방지)
 *   (v2 §3.9) zone:expired {zone} — 이미터 정리 / frost:nova {x, y, radius} — 파동 링+서리 파편
 */

import { on } from '../core/events.js';

// ─────────────────────────────────────────────────────────────
// 연출 강도 상수 — 튜닝은 전부 여기서 (playtester 피드백 대응 지점)
// ─────────────────────────────────────────────────────────────
// (v2 §11) 모바일 프리셋 — coarse 포인터(터치)면 밀도·상한 하향. node 환경 가드 필수.
const IS_COARSE = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
const DENSITY = IS_COARSE ? 0.6 : 1;                // 모든 버스트 개수에 곱하는 밀도 배율
const POOL_SIZE = IS_COARSE ? 160 : 256;            // 동시 파티클 상한. 초과 시 가장 오래된 것 재활용
const TRACER_POOL_SIZE = IS_COARSE ? 16 : 24;       // 동시 투사체 트레이서 상한

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
// (v2) 화염 지대 — 점화 버스트 + duration 동안 불꽃/불티 지속 방출
const ZONE_FX = {
  maxZones: IS_COARSE ? 3 : 6,               // 동시 장판 이미터 상한. 초과 시 최오래된 것 재활용
  emitInterval: IS_COARSE ? 0.10 : 0.055,    // 장판 1개당 불꽃 방출 간격(초)
  ttlMargin: 0.25,                           // zone:expired 유실 대비 자체 수명 여유(초)
  flame: { life: 0.55, riseMin: 26, riseMax: 66, sizeMin: 2.5, sizeMax: 5.5 },
  emberChance: 0.3,                          // 불꽃 대신 밝은 불티가 나올 확률
  ignite: { sparks: 10, speedMin: 60, speedMax: 170, life: 0.35, ringLife: 0.3 },
};
// (v2) 빙결 파동 — 링은 정확히 nova radius까지 확장 (AC-25 반경 암시)
const NOVA = {
  rings: [{ life: 0.38, from: 0.15 }, { life: 0.55, from: 0.02 }], // from = 시작 반경 비율
  shards: 14, shardSpeedMin: 90, shardSpeedMax: 220, shardLife: 0.4,
  sparkles: 8, sparkleLifeMin: 0.3, sparkleLifeMax: 0.55,          // 반경 내 지면 서리 반짝임
};
// (v4 §16.5) 타워 시그니처 명중 이펙트 — projectile:hit.towerType별 차별화.
// 도형+그라디언트+다층 글로우+additive만 (이미지 에셋 의존 0). 발사 빈도가 높은 arrow는 가장 절제.
const SIG = {
  frost:  { ringR: 30, ringLife: 0.34, shards: 5, glowR: 22, glowLife: 0.28 },
  arcane: { rays: 7, raySpeedMin: 180, raySpeedMax: 320, rayLife: 0.30, glowR: 28, glowLife: 0.34, coreR: 10, coreLife: 0.22 },
  cannon: { ringR: 40, ringLife: 0.30, debris: 5, glowR: 30, glowLife: 0.26 },
  arrow:  { sparks: 4, speedMin: 120, speedMax: 240, life: 0.20, glowR: 9, glowLife: 0.16 },
};
// (v4 §16.6) 진화 광기둥 — tower:upgraded. 화면 셰이크 금지(AC-54, 잦은 이벤트).
// life는 entity 크로스페이드(≈0.4s)를 감싸도록 여유(0.5s) — 변신 순간을 놓치지 않게 협연.
const PILLAR = { life: 0.5, h0: 60, h1: 135, width: 26, color: '255,225,140', glowR: 46, glowLife: 0.4, glowColor: '255,220,150' };

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

// (v2) 장판 이미터 — zone 1개당 슬롯 1개. zone 참조는 정리 판정에만 사용 (상태 조회 API 아님)
function makeZoneEmitter() {
  return { active: false, zone: null, x: 0, y: 0, radius: 0, emit: 0, ttl: 0 };
}
const zoneEmitters = [];
for (let i = 0; i < ZONE_FX.maxZones; i++) zoneEmitters.push(makeZoneEmitter());
let zoneHead = 0;

const rand = (min, max) => min + Math.random() * (max - min);
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// ─────────────────────────────────────────────────────────────
// 이미터
// ─────────────────────────────────────────────────────────────
function burst(x, y, count, cfg, init) {
  const n = Math.max(1, Math.round(count * DENSITY));
  for (let i = 0; i < n; i++) {
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

// ─── (v2) 화염 지대 — 점화 버스트 + 장판 위 불꽃 지속 방출 ───
function igniteBurst(x, y, radius) {
  burst(x, y, ZONE_FX.ignite.sparks, ZONE_FX.ignite, (p) => {
    p.shape = 'spark'; p.drag = 3; p.size0 = rand(1.5, 3);
    p.color = Math.random() < 0.5 ? 'rgb(255,180,70)' : 'rgb(255,120,40)';
  });
  // 장판 범위 암시 링 — 스플래시 링(explosion)과 별개로 zone radius까지만 확장
  const ring = spawn();
  ring.shape = 'ring'; ring.x = x; ring.y = y;
  ring.life = ring.maxLife = ZONE_FX.ignite.ringLife;
  ring.size0 = radius * 0.3; ring.size1 = radius;
  ring.alpha = 0.7; ring.color = 'rgb(255,150,60)';
}

function emitFlame(s) {
  // 반경 내 균일 분포 지점에서 위로 떠오르는 불꽃/불티
  const ang = Math.random() * Math.PI * 2;
  const r = s.radius * Math.sqrt(Math.random()) * 0.9;
  const p = spawn();
  p.x = s.x + Math.cos(ang) * r;
  p.y = s.y + Math.sin(ang) * r;
  p.vx = rand(-12, 12);
  if (Math.random() < ZONE_FX.emberChance) { // 불티 — 작고 밝게, 높이
    p.life = p.maxLife = ZONE_FX.flame.life * 1.3;
    p.vy = -rand(ZONE_FX.flame.riseMax * 0.9, ZONE_FX.flame.riseMax * 1.5);
    p.size0 = rand(1.2, 2.2); p.size1 = 0.3;
    p.color = 'rgb(255,235,150)';
  } else {                                   // 불꽃 혀 — 떠오르며 수축
    p.life = p.maxLife = ZONE_FX.flame.life * rand(0.7, 1.15);
    p.vy = -rand(ZONE_FX.flame.riseMin, ZONE_FX.flame.riseMax);
    p.size0 = rand(ZONE_FX.flame.sizeMin, ZONE_FX.flame.sizeMax); p.size1 = 0.5;
    p.color = Math.random() < 0.5 ? 'rgb(255,150,50)' : 'rgb(255,100,35)';
  }
}

function startZoneEmitter(zone, x, y, radius, duration) {
  const s = zoneEmitters[zoneHead];
  zoneHead = (zoneHead + 1) % ZONE_FX.maxZones; // 고갈 시 최오래된 슬롯 조용히 재활용
  s.active = true; s.zone = zone || null;
  s.x = x; s.y = y; s.radius = radius; s.emit = 0;
  s.ttl = (Number.isFinite(duration) ? duration : 3) + ZONE_FX.ttlMargin;
}

function stopZoneEmitter(zone) {
  for (const s of zoneEmitters) {
    if (s.active && s.zone === zone) { s.active = false; s.zone = null; return; }
  }
}

// ─── (v2) 빙결 파동 — nova radius까지 확산하는 이중 링 + 서리 파편 + 지면 반짝임 ───
function frostNova(x, y, radius) {
  for (const rc of NOVA.rings) {
    const ring = spawn();
    ring.shape = 'ring'; ring.x = x; ring.y = y;
    ring.life = ring.maxLife = rc.life;
    ring.size0 = radius * rc.from; ring.size1 = radius;
    ring.alpha = 0.9; ring.color = 'rgb(170,225,255)';
  }
  burst(x, y, NOVA.shards, { speedMin: NOVA.shardSpeedMin, speedMax: NOVA.shardSpeedMax, life: NOVA.shardLife }, (p) => {
    p.shape = 'shard'; p.drag = 2.5; p.gravity = 150;
    p.size0 = rand(2, 4);
    p.color = Math.random() < 0.5 ? 'rgb(200,240,255)' : 'rgb(130,200,250)';
  });
  const n = Math.max(1, Math.round(NOVA.sparkles * DENSITY));
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = radius * Math.sqrt(Math.random());
    const p = spawn();
    p.shape = 'star'; p.x = x + Math.cos(ang) * r; p.y = y + Math.sin(ang) * r;
    p.life = p.maxLife = rand(NOVA.sparkleLifeMin, NOVA.sparkleLifeMax);
    p.vy = -rand(5, 20); p.size0 = rand(2, 4); p.size1 = 0.5;
    p.color = 'rgb(220,245,255)';
  }
}

// ─── (v4 §16.5) 타워 시그니처 명중 이펙트 — 타입별 도형+그라디언트+다층 글로우 ───
// frost=노바 링(팽창 원+서리 파편+청색 글로우) — 서리 톤, 지면 향해 파편이 떨어짐.
function frostHitSig(x, y) {
  const c = SIG.frost;
  const ring = spawn();
  ring.shape = 'ring'; ring.additive = true; ring.x = x; ring.y = y;
  ring.life = ring.maxLife = c.ringLife;
  ring.size0 = c.ringR * 0.3; ring.size1 = c.ringR; // k:1→0 = 시작 반경→끝 반경(팽창)
  ring.alpha = 0.9; ring.color = 'rgb(170,225,255)';
  burst(x, y, c.shards, { speedMin: 60, speedMax: 150, life: 0.32 }, (p) => {
    p.shape = 'shard'; p.drag = 2.2; p.gravity = 140; p.size0 = rand(2, 3.5);
    p.color = Math.random() < 0.5 ? 'rgb(200,240,255)' : 'rgb(140,205,255)';
  });
  const glow = spawn();
  glow.shape = 'glow'; glow.additive = true; glow.x = x; glow.y = y;
  glow.life = glow.maxLife = c.glowLife;
  glow.size0 = c.glowR; glow.size1 = 4; glow.alpha = 0.8; glow.color = '150,220,255';
}

// arcane=버스트(방사 광선 ray + 왜곡 글로우 + 밝은 코어) — 보랏빛, 사방으로 뻗는 마법 방출.
function arcaneHitSig(x, y) {
  const c = SIG.arcane;
  const n = Math.max(3, Math.round(c.rays * DENSITY));
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rand(-0.15, 0.15);
    const spd = rand(c.raySpeedMin, c.raySpeedMax);
    const p = spawn();
    p.shape = 'ray'; p.additive = true; p.x = x; p.y = y;
    p.vx = Math.cos(ang) * spd; p.vy = Math.sin(ang) * spd; p.drag = 3.5;
    p.life = p.maxLife = c.rayLife * rand(0.8, 1.1);
    p.size0 = rand(2.5, 4); p.size1 = 0.5; p.color = '200,120,255';
  }
  const glow = spawn(); // 왜곡 글로우 — 넓고 은은
  glow.shape = 'glow'; glow.additive = true; glow.x = x; glow.y = y;
  glow.life = glow.maxLife = c.glowLife;
  glow.size0 = c.glowR; glow.size1 = 8; glow.alpha = 0.7; glow.color = '190,110,255';
  const core = spawn(); // 밝은 코어 플래시
  core.shape = 'glow'; core.additive = true; core.x = x; core.y = y;
  core.life = core.maxLife = c.coreLife;
  core.size0 = c.coreR; core.size1 = 2; core.alpha = 0.9; core.color = '235,205,255';
}

// cannon=충격파(크리스프 링 + 흙먼지 파편 + 착탄 글로우) — explosion(스플래시) 위에 레이어.
function cannonHitSig(x, y) {
  const c = SIG.cannon;
  const ring = spawn();
  ring.shape = 'ring'; ring.additive = true; ring.x = x; ring.y = y;
  ring.life = ring.maxLife = c.ringLife;
  ring.size0 = 6; ring.size1 = c.ringR; ring.alpha = 0.85; ring.color = 'rgb(255,210,140)';
  burst(x, y, c.debris, { speedMin: 70, speedMax: 170, life: 0.4 }, (p) => {
    p.shape = 'shard'; p.additive = false; p.drag = 2; p.gravity = 260; p.size0 = rand(2.5, 4.5);
    p.color = Math.random() < 0.5 ? 'rgb(150,120,85)' : 'rgb(110,88,62)';
  });
  const glow = spawn();
  glow.shape = 'glow'; glow.additive = true; glow.x = x; glow.y = y;
  glow.life = glow.maxLife = c.glowLife;
  glow.size0 = c.glowR; glow.size1 = 6; glow.alpha = 0.85; glow.color = '255,190,110';
}

// arrow=경량 트레이서 스파크 — 가장 절제(공속 높음). 날카로운 황백색 스파크 + 작은 코어.
function arrowHitSig(x, y) {
  const c = SIG.arrow;
  burst(x, y, c.sparks, { speedMin: c.speedMin, speedMax: c.speedMax, life: c.life }, (p) => {
    p.shape = 'spark'; p.drag = 5; p.size0 = rand(1.5, 2.5); p.color = 'rgb(255,240,190)';
  });
  const glow = spawn();
  glow.shape = 'glow'; glow.additive = true; glow.x = x; glow.y = y;
  glow.life = glow.maxLife = c.glowLife;
  glow.size0 = c.glowR; glow.size1 = 1; glow.alpha = 0.8; glow.color = '255,240,190';
}

// (v4 §16.6) 진화 광기둥 — tower:upgraded. 수직 그라디언트 빔이 솟아오르며 페이드 + 바닥 글로우.
// 상승 파티클은 기존 upgradeSparkle이 담당(협연). 화면 셰이크 없음.
function evolutionPillar(x, y) {
  const pil = spawn();
  pil.shape = 'pillar'; pil.additive = true; pil.x = x; pil.y = y;
  pil.life = pil.maxLife = PILLAR.life;
  pil.size0 = PILLAR.h0; pil.size1 = PILLAR.h1; // k:1→0 = h0(짧게 시작)→h1(솟아오름)
  pil.alpha = 0.85; pil.color = PILLAR.color;
  const glow = spawn();
  glow.shape = 'glow'; glow.additive = true; glow.x = x; glow.y = y;
  glow.life = glow.maxLife = PILLAR.glowLife;
  glow.size0 = PILLAR.glowR; glow.size1 = 10; glow.alpha = 0.9; glow.color = PILLAR.glowColor;
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
  for (const s of zoneEmitters) { s.active = false; s.zone = null; }
}

/** 구독 등록. main이 1회 호출. */
export function initParticles() {
  on('projectile:hit', guard(({ target, x, y, splashRadius, towerType }) => {
    if (!Number.isFinite(x)) return;
    // 스플래시는 타입 무관 메커닉(캐논 등) — 유지. cannonHitSig는 그 위에 충격파를 레이어.
    if (splashRadius > 0) explosion(x, y, splashRadius);
    // (v4 §16.5) 타입별 시그니처 명중. 부재/미지 towerType이면 범용 폴백(hitSpark) — AC-53.
    switch (towerType) {
      case 'frost':  frostHitSig(x, y); break;
      case 'arcane': arcaneHitSig(x, y); break;
      case 'cannon': cannonHitSig(x, y); break;
      case 'arrow':  arrowHitSig(x, y); break;
      default:       if (!(splashRadius > 0)) hitSpark(x, y); // 구 페이로드 폴백(스플래시 없을 때만)
    }
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
    if (tower && Number.isFinite(tower.x)) {
      upgradeSparkle(tower.x, tower.y);   // 기존 상승 반짝임(협연) — 유지
      evolutionPillar(tower.x, tower.y);  // (v4 §16.6) 광기둥+글로우 — 셰이크 없음
    }
  }));
  on('zone:created', guard(({ zone, x, y, radius, duration }) => {
    if (!Number.isFinite(x) || !(radius > 0)) return;
    igniteBurst(x, y, radius);
    startZoneEmitter(zone, x, y, radius, duration);
  }));
  on('zone:expired', guard(({ zone }) => {
    if (zone) stopZoneEmitter(zone);
  }));
  on('frost:nova', guard(({ x, y, radius }) => {
    if (!Number.isFinite(x) || !(radius > 0)) return;
    frostNova(x, y, radius);
  }));
  on('game:started', guard(clearAll));
}

/** @param {number} dt - 고정 스텝 (초). main update에서 호출 (배속 반영) */
export function updateParticles(dt) {
  for (const s of zoneEmitters) {
    if (!s.active) continue;
    s.ttl -= dt;
    // 정리 경로 3중: zone:expired 이벤트 > zone.alive=false > 자체 ttl 소진
    if ((s.zone && s.zone.alive === false) || s.ttl <= 0) {
      s.active = false; s.zone = null; continue;
    }
    s.emit -= dt;
    while (s.emit <= 0) { s.emit += ZONE_FX.emitInterval; emitFlame(s); }
  }
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
    // (v4) 시그니처/진화 전용 — p.color는 'r,g,b' 원문(그라디언트 스톱 조립용). globalAlpha가 페이드 담당.
    case 'glow': { // 방사 그라디언트 소프트 글로우 (다층 글로우의 층 1개)
      const r = Math.max(0.1, size);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(${p.color},0.95)`);
      g.addColorStop(0.45, `rgba(${p.color},0.5)`);
      g.addColorStop(1, `rgba(${p.color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'ray': { // 속도 방향으로 뻗는 테이퍼 그라디언트 광선 (머리 밝음→꼬리 소멸)
      const spd = Math.hypot(p.vx, p.vy) || 1;
      const ux = p.vx / spd, uy = p.vy / spd;
      const len = 6 + size * 2.4;
      const tx = p.x - ux * len, ty = p.y - uy * len;
      const g = ctx.createLinearGradient(p.x, p.y, tx, ty);
      g.addColorStop(0, `rgba(${p.color},0.95)`);
      g.addColorStop(1, `rgba(${p.color},0)`);
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, size * 0.9); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke();
      break;
    }
    case 'pillar': { // (x,y) 바닥에서 위로 솟는 수직 그라디언트 광기둥
      const h = size, w = PILLAR.width;
      const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y - h);
      g.addColorStop(0, `rgba(${p.color},0.85)`);
      g.addColorStop(0.5, `rgba(${p.color},0.35)`);
      g.addColorStop(1, `rgba(${p.color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(p.x - w / 2, p.y - h, w, h);
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
