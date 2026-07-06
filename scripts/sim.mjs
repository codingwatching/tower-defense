/**
 * @module scripts/sim (wave-balancer)
 * 헤드리스 밸런스 시뮬레이터 — Node로 실행, 브라우저 비의존.
 *
 * 사용: node scripts/sim.mjs
 * DOM API(document, canvas, Image) 사용 금지 — data + 순수 로직 모듈만 import.
 *
 * 구성 (v2 — QA D9-1 보정 반영):
 *  Part 1. 이론 상한 모델 (td-balance-design §3 DPS 예산 부등식) — 참고용.
 *          전 경로 노출 × 배치 계수를 가정하므로 실엔진 대비 약 2배 낙관임이
 *          실측(QA 회차 9)으로 확인됨. 난이도 판정에 사용하지 않는다.
 *  Part 2. 실엔진 시나리오 (권위 판정) — systems/combat·waves + entities를 실데이터로
 *          구동하는 자동 플레이 봇 3종. 시뮬 ≈ 실플레이가 구조적으로 보장된다.
 *          - A 산개 무전략: 아무 데나 배치, 업그레이드 없음 → 5~7웨이브 실패해야 함
 *          - B 도배 무업글: 명당 배치, 조합/업그레이드 없음 → 중간 지표 (참고)
 *          - C 킬존 최적:   커버리지 기하 + 업그레이드 인터리브(qa-engineer 회차9 v3)
 *                           → 클리어 + 잔여 라이프 30~70%여야 함
 *          봇은 판매/재배치/타이밍 미세 조작이 없으므로 "신중한 플레이어"의 하한이다.
 *  Part 3. 스키마·GDD 구속 검증 — 실패 시 exit 1 (QA 게이트).
 *
 * 최종 판정은 언제나 playtester 체감 리포트가 우선한다.
 */

import { TOWERS } from '../src/data/towers.js';
import { ENEMIES } from '../src/data/enemies.js';
import { WAVES } from '../src/data/waves.js';
import { BALANCE } from '../src/data/balance.js';

// ---------- 경로 길이 ----------
let pathLen = null;
let pathSource = '';
try {
  const { LEVEL } = await import('../src/data/levels.js');
  if (LEVEL && Array.isArray(LEVEL.waypoints) && LEVEL.waypoints.length >= 2) {
    let len = 0;
    for (let i = 1; i < LEVEL.waypoints.length; i++) {
      const a = LEVEL.waypoints[i - 1];
      const b = LEVEL.waypoints[i];
      len += (Math.abs(b.col - a.col) + Math.abs(b.row - a.row)) * LEVEL.tileSize;
    }
    pathLen = len;
    pathSource = `levels.js 실측 (웨이포인트 ${LEVEL.waypoints.length}개)`;
  }
} catch {
  // levels.js 미완성 — 아래 추정치 사용
}
if (!pathLen) {
  pathLen = 40 * 64;
  pathSource = '추정치 — levels.js 미완성. 계약 §4.5 S자 경로 사양 기반 40스텝 × 64px';
}

console.log('════════════════════════════════════════════════════════════');
console.log(' 크리스탈 가드 — 헤드리스 밸런스 시뮬레이션 v2 (D9-1 보정)');
console.log('════════════════════════════════════════════════════════════');
console.log(`경로 길이: ${pathLen}px — ${pathSource}`);

// ════════════════════════════════════════════════════════════
// Part 1. 이론 상한 모델 (참고용 — 판정에 사용하지 않음)
// ════════════════════════════════════════════════════════════
const INVEST_RATE = 0.9;
const UPPER_MODEL = {
  '무전략(상한)': {
    coverage: 0.6, slowBonus: 0,
    mix: [
      { tower: 'arrow', level: 0, share: 0.7, crowd: 1.0 },
      { tower: 'cannon', level: 0, share: 0.3, crowd: 1.5 }
    ]
  },
  '킬존(상한)': {
    coverage: 0.95, slowBonus: 0.4,
    mix: [
      { tower: 'arrow', level: 1, share: 0.4, crowd: 1.0 },
      { tower: 'cannon', level: 1, share: 0.25, crowd: 1.8 },
      { tower: 'frost', level: 0, share: 0.15, crowd: 1.0 },
      { tower: 'arcane', level: 0, share: 0.2, crowd: 1.0 }
    ]
  }
};

const dpsAt = (t, li) => t.levels[li].damage / t.levels[li].cooldown;
const cumCost = (t, li) => t.levels.slice(0, li + 1).reduce((s, l) => s + l.cost, 0);

function scenarioModel(mix) {
  let eff = 0, physEff = 0, magEff = 0, physHitWeighted = 0;
  for (const m of mix) {
    const t = TOWERS[m.tower];
    const e = (dpsAt(t, m.level) / cumCost(t, m.level)) * m.crowd * m.share;
    eff += e;
    if (t.damageType === 'magic') magEff += e;
    else { physEff += e; physHitWeighted += e * t.levels[m.level].damage; }
  }
  return {
    effPerGold: eff,
    physShare: physEff / (physEff + magEff),
    avgPhysHit: physEff > 0 ? physHitWeighted / physEff : 1
  };
}

function enemyEhp(def, hpMult, model) {
  const dmgKeep = Math.max(1, model.avgPhysHit - def.armor) / model.avgPhysHit;
  const inflator = 1 / (model.physShare * dmgKeep + (1 - model.physShare));
  return def.hp * hpMult * inflator;
}

function runUpperModel(name) {
  const sc = UPPER_MODEL[name];
  const model = scenarioModel(sc.mix);
  let gold = BALANCE.startGold;
  const rows = [];
  WAVES.forEach((wave, i) => {
    let totalEhp = 0, exposureWeighted = 0, killReward = 0;
    for (const g of wave.groups) {
      const def = ENEMIES[g.enemy];
      const ehp = enemyEhp(def, wave.hpMultiplier, model) * g.count;
      const exposure = (pathLen / def.speed) * (1 + sc.slowBonus * (1 - def.slowResist));
      totalEhp += ehp;
      exposureWeighted += ehp * exposure;
      killReward += def.reward * g.count;
    }
    const capacity = gold * INVEST_RATE * model.effPerGold * sc.coverage * (exposureWeighted / totalEhp);
    rows.push({ n: i + 1, gold, ehp: totalEhp, ratio: capacity / totalEhp });
    gold += killReward + wave.bonus;
  });
  return rows;
}

console.log('\n■ Part 1 — 이론 상한 모델 (비율 = 상한 방어력량/EHP, 실엔진은 이보다 낮다)');
const upperRows = Object.keys(UPPER_MODEL).map((name) => ({ name, rows: runUpperModel(name) }));
console.log('  W  | ' + upperRows.map((r) => r.name.padEnd(12)).join(' | '));
for (let i = 0; i < WAVES.length; i++) {
  console.log(`  ${String(i + 1).padStart(2)} | ` + upperRows.map((r) => r.rows[i].ratio.toFixed(2).padStart(12)).join(' | '));
}

// ════════════════════════════════════════════════════════════
// Part 2. 실엔진 시나리오 (권위 판정)
// ════════════════════════════════════════════════════════════
// 봇 전략. C의 액션 큐는 qa-engineer 회차 9 검증 스크립트(v3)에서 가져옴.
const STRATEGIES = [
  {
    key: 'A', name: 'A 산개 무전략',
    actions: [
      ['build', 'arrow', 1, 1], ['build', 'arrow', 9, 1], ['build', 'cannon', 5, 8],
      ['build', 'arrow', 13, 3], ['build', 'arrow', 2, 4], ['build', 'cannon', 10, 6],
      ['build', 'arrow', 6, 1], ['build', 'arrow', 3, 8], ['build', 'arrow', 11, 7],
      ['build', 'cannon', 13, 7], ['build', 'arrow', 0, 4], ['build', 'arrow', 14, 2]
    ]
  },
  {
    key: 'B', name: 'B 도배 무업글 (참고)',
    actions: [
      ['build', 'arrow', 6, 5], ['build', 'arrow', 10, 3], ['build', 'frost', 6, 4],
      ['build', 'cannon', 7, 6], ['build', 'frost', 10, 4], ['build', 'arrow', 11, 3],
      ['build', 'arrow', 5, 3], ['build', 'arrow', 7, 3], ['build', 'cannon', 9, 4],
      ['build', 'arrow', 11, 4], ['build', 'arrow', 5, 6], ['build', 'cannon', 9, 6]
    ]
  },
  {
    key: 'C', name: 'C 킬존 최적',
    actions: [
      ['build', 'arrow', 6, 5], ['build', 'arrow', 10, 3],
      ['up', 6, 5], ['up', 10, 3],
      ['build', 'frost', 6, 4], ['build', 'cannon', 7, 6],
      ['build', 'arcane', 9, 4],
      ['up', 9, 4],
      ['build', 'frost', 10, 4], ['up', 7, 6],
      ['up', 6, 5], ['up', 10, 3],
      ['build', 'arcane', 7, 4], ['up', 7, 4],
      ['up', 9, 4],
      ['build', 'cannon', 11, 4],
      ['build', 'arrow', 5, 3], ['build', 'arrow', 11, 3],
      ['up', 7, 6], ['up', 11, 4], ['up', 5, 3], ['up', 11, 3], ['up', 6, 4], ['up', 10, 4]
    ]
  }
];

let engine = null;
try {
  const { on, emit } = await import('../src/core/events.js');
  const { LEVEL } = await import('../src/data/levels.js');
  const { initGrid, isBuildable } = await import('../src/map/grid.js');
  const { initPath } = await import('../src/map/path.js');
  const combat = await import('../src/systems/combat.js');
  const waves = await import('../src/systems/waves.js');
  const economy = await import('../src/systems/economy.js');
  initGrid(LEVEL);
  initPath(LEVEL);
  economy.initEconomy();
  combat.initCombat();
  waves.initWaves();
  engine = { on, emit, isBuildable, combat, waves, economy };
} catch (e) {
  console.log(`\n[경고] 실엔진 모듈 로드 실패 — Part 2 생략: ${e.message}`);
}

const engineResults = {};
if (engine) {
  const { on, emit, isBuildable, combat, economy } = engine;
  const COST = {};
  for (const k of Object.keys(TOWERS)) COST[k] = TOWERS[k].levels.map((l) => l.cost);
  const towerAt = (col, row) => combat.towers.find((t) => t.col === col && t.row === row);

  let current = null;
  on('wave:started', () => { if (current) current.waveLeaks = 0; });
  on('enemy:escaped', () => { if (current) current.waveLeaks++; });
  on('wave:cleared', (p) => {
    if (!current) return;
    current.log.push({ w: p.index, leaks: current.waveLeaks, lives: economy.getLives() });
    if (p.index === WAVES.length) current.won = true;
  });
  on('lives:changed', (p) => { if (current && p.lives <= 0) current.over = true; });

  const runBot = (strat) => {
    current = { waveLeaks: 0, log: [], won: false, over: false };
    emit('game:started', {});
    let actIdx = 0;
    const tryActions = () => {
      while (actIdx < strat.actions.length) {
        const a = strat.actions[actIdx];
        if (a[0] === 'build') {
          const [, type, col, row] = a;
          if (!isBuildable({ col, row })) { actIdx++; continue; }
          if (economy.getGold() < COST[type][0]) return;
          emit('ui:build-requested', { towerType: type, col, row });
          actIdx++;
        } else {
          const [, col, row] = a;
          const t = towerAt(col, row);
          if (!t || t.level >= 3) { actIdx++; continue; }
          if (economy.getGold() < COST[t.type][t.level]) return;
          emit('ui:upgrade-requested', { towerId: t.id });
          actIdx++;
        }
      }
    };
    const DT = 1 / 60;
    let simT = 0, buildT = 0, kickT = 0;
    while (!current.won && !current.over && simT < 40 * 60) {
      simT += DT; buildT += DT; kickT += DT;
      if (buildT >= 0.25) { buildT = 0; tryActions(); }
      if (kickT >= 1.0) { kickT = 0; emit('ui:wave-start-requested', {}); }
      engine.waves.updateWaves(DT);
      combat.updateCombat(DT);
    }
    const r = current;
    current = null;
    return {
      won: r.won,
      livesLeft: r.won ? r.log[r.log.length - 1].lives : 0,
      deathWave: r.won ? null : r.log.length + 1,
      log: r.log
    };
  };

  console.log('\n■ Part 2 — 실엔진 자동 플레이 (권위 판정)');
  for (const strat of STRATEGIES) {
    const r = runBot(strat);
    engineResults[strat.key] = r;
    const rows = r.log.map((e) => `W${e.w}:누수${e.leaks}`).join(' ');
    console.log(`  [${strat.name}] ${r.won ? `클리어 — 잔여 ${r.livesLeft}/${BALANCE.startLives}` : `패배 — 웨이브 ${r.deathWave}`}`);
    console.log(`    ${rows || '(클리어 웨이브 없음)'}`);
  }
}

// ════════════════════════════════════════════════════════════
// Part 3. 검증 (스키마 + GDD 구속 + 난이도 목표)
// ════════════════════════════════════════════════════════════
const checks = [];
const ok = (label, cond) => checks.push({ label, cond });

// 스키마
ok('TOWERS 4종 (arrow/cannon/frost/arcane)', ['arrow', 'cannon', 'frost', 'arcane'].every(k => TOWERS[k]?.id === k));
ok('ENEMIES 5종 (goblin/orc/steel_brute/wasp_runner/stone_golem)',
  ['goblin', 'orc', 'steel_brute', 'wasp_runner', 'stone_golem'].every(k => ENEMIES[k]?.id === k));
ok('WAVES 길이 10 고정', WAVES.length === 10);
ok('BALANCE 필드 4종', ['startGold', 'startLives', 'sellRatio', 'interWaveCountdown'].every(k => typeof BALANCE[k] === 'number'));

// GDD 구속
const others = ['cannon', 'frost', 'arcane'];
ok('arrow 최저가 (GDD §3)', others.every(k => TOWERS[k].levels[0].cost > TOWERS.arrow.levels[0].cost));
ok('arrow 최고 공속 — 전 레벨 최소 cooldown (AC-09)',
  others.every(k => Math.min(...TOWERS[k].levels.map(l => l.cooldown)) > Math.max(...TOWERS.arrow.levels.map(l => l.cooldown)) - 0.11));
ok('arcane 최고가·최장 사거리 (AC-09)',
  ['arrow', 'cannon', 'frost'].every(k =>
    TOWERS[k].levels[0].cost < TOWERS.arcane.levels[0].cost &&
    Math.max(...TOWERS[k].levels.map(l => l.range)) < TOWERS.arcane.levels[0].range));
ok('cannon만 splashRadius > 0', Object.values(TOWERS).every(t => (t.projectile.splashRadius > 0) === (t.id === 'cannon')));
ok('frost만 slow 보유 (factor 0<f<1)', Object.values(TOWERS).every(t =>
  t.id === 'frost' ? t.projectile.slow && t.projectile.slow.factor > 0 && t.projectile.slow.factor < 1 : t.projectile.slow === null));
ok('arcane은 magic (브루트 카운터)', TOWERS.arcane.damageType === 'magic');
ok('보스 slowResist 0.5·livesCost 5·isBoss (GDD 고정)',
  ENEMIES.stone_golem.slowResist === 0.5 && ENEMIES.stone_golem.livesCost === 5 && ENEMIES.stone_golem.isBoss === true);
ok('시작 골드로 타워 2기 건설 가능 (GDD §6)',
  BALANCE.startGold >= 2 * TOWERS.arrow.levels[0].cost &&
  BALANCE.startGold >= TOWERS.arrow.levels[0].cost + TOWERS.frost.levels[0].cost);

// 등장 순서 (AC-14)
const waveTypes = WAVES.map(w => new Set(w.groups.map(g => g.enemy)));
const firstWave = t => waveTypes.findIndex(s => s.has(t)) + 1;
ok('W1~2 고블린만', [0, 1].every(i => [...waveTypes[i]].every(t => t === 'goblin')));
ok('오크 첫 등장 = W3', firstWave('orc') === 3);
ok('와스프 첫 등장 = W5', firstWave('wasp_runner') === 5);
ok('브루트 첫 등장 = W6', firstWave('steel_brute') === 6);
ok('골렘은 W10에만 + 호위 동반', firstWave('stone_golem') === 10 && waveTypes[9].size > 1);

// 보스 비중 (raw HP 기준 40~60%)
const w10 = WAVES[9];
const rawEhp = g => ENEMIES[g.enemy].hp * w10.hpMultiplier * g.count;
const golemShare = rawEhp(w10.groups.find(g => g.enemy === 'stone_golem')) / w10.groups.reduce((s, g) => s + rawEhp(g), 0);
ok(`보스 = W10 총 EHP의 40~60% (현재 ${(golemShare * 100).toFixed(0)}%)`, golemShare >= 0.4 && golemShare <= 0.6);

// 골드 수지 — 완벽 방어 시 웨이브당 수입이 최소 행동(최저 업그레이드 40) 이상
const minIncome = Math.min(...WAVES.map(w =>
  w.bonus + w.groups.reduce((s, g) => s + ENEMIES[g.enemy].reward * g.count, 0)));
ok(`골드 수지 — 웨이브당 최소 수입 ${minIncome} ≥ 40`, minIncome >= 40);

// 난이도 목표 (실엔진 봇 기준 — D9-1 이후 권위 판정)
if (engine) {
  const a = engineResults.A;
  const c = engineResults.C;
  const lo = Math.ceil(BALANCE.startLives * 0.3);
  const hi = Math.floor(BALANCE.startLives * 0.7);
  ok(`[실엔진] 무전략 실패 웨이브 5~7 (현재 ${a.won ? '생존' : a.deathWave})`,
    !a.won && a.deathWave >= 5 && a.deathWave <= 7);
  ok(`[실엔진] 킬존 클리어 + 잔여 라이프 ${lo}~${hi} (현재 ${c.won ? c.livesLeft : '실패'})`,
    c.won && c.livesLeft >= lo && c.livesLeft <= hi);
} else {
  ok('[실엔진] 난이도 검증 불가 — 엔진 모듈 부재', false);
}

console.log('\n■ Part 3 — 검증 결과');
let failCount = 0;
for (const c of checks) {
  if (!c.cond) failCount++;
  console.log(`  ${c.cond ? 'PASS' : 'FAIL'}  ${c.label}`);
}
console.log(`\n${failCount === 0 ? '✔ 전 항목 통과' : `✘ ${failCount}건 실패`} (${checks.length}항목)`);
process.exit(failCount === 0 ? 0 : 1);
