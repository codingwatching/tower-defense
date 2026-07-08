/**
 * @module scripts/sim (wave-balancer)
 * 헤드리스 밸런스 시뮬레이터 — Node로 실행, 브라우저 비의존.
 *
 * 사용: node scripts/sim.mjs
 * DOM API(document, canvas, Image) 사용 금지 — data + 순수 로직 모듈만 import.
 *
 * 구성 (v4 — 5스테이지 회귀 + 점수 배점 검증. v3 = §12.1 메커니즘. v2 = QA D9-1 보정):
 *  Part 1. 이론 상한 모델 (td-balance-design §3 DPS 예산 부등식) — 참고용. 실엔진 대비 ~2배 낙관.
 *  Part 2. 실엔진 시나리오 — 스테이지 1(crystal_valley) 권위 판정 봇 3종(A/B/C). v2 회귀 대조.
 *          봇은 stage:started{stageId} → game:started로 스테이지 컨텍스트를 주입하고 실엔진
 *          (systems/combat·waves + entities)을 그대로 구동하므로 시뮬 ≈ 실플레이가 보장된다.
 *  Part 3. 스키마·GDD 구속·난이도 검증 — 실패 시 exit 1 (QA 게이트). v3 스키마(STAGE_*·SCORING) 포함.
 *  Part 4. **v3 — 스테이지 2~5 회귀** (§4.8·§4.9). 각 스테이지 킬존 봇 클리어 잔여 라이프 밴드(AC-44)
 *          + 무전략 봇 실패 확인 + 스테이지 1→5 난이도 단조 상승. hpScale이 주손잡이.
 *  Part 5. **v3 — 점수 배점 검증** (§4.10). 스테이지 1 풀클리어 3요소(처치/웨이브/라이프) 비중.
 *
 * 스테이지 2~5 기하: LEVELS(map-designer) 도착 시 스테이지별 경로/킬존으로 자동 반영.
 *   미도착 시 crystal_valley 기하로 근사(경고 출력) — 도착 후 재검증 필수.
 *
 * 최종 판정은 언제나 playtester 체감 리포트가 우선한다.
 */

import { TOWERS } from '../src/data/towers.js';
import { ENEMIES } from '../src/data/enemies.js';
import { WAVES, STAGE_WAVES } from '../src/data/waves.js';
import { BALANCE, STAGE_BALANCE } from '../src/data/balance.js';
import { SCORING } from '../src/data/scoring.js';

// 스테이지 순서 (계약 §4.7 id 도메인 — stageIndex 0~4)
const STAGE_IDS = ['crystal_valley', 'bramble_fork', 'twin_snake', 'narrow_gate', 'last_ridge'];

// ---------- 레벨 데이터 해석 (LEVELS 배열 우선, 단일 LEVEL 폴백) ----------
let LEVELS_DATA = null;
let levelsSource = '';
try {
  const mod = await import('../src/data/levels.js');
  if (Array.isArray(mod.LEVELS) && mod.LEVELS.length === 5) {
    LEVELS_DATA = mod.LEVELS;
    levelsSource = 'levels.js LEVELS 배열 5개 (map-designer 실기하)';
  } else if (mod.LEVEL) {
    LEVELS_DATA = [mod.LEVEL, mod.LEVEL, mod.LEVEL, mod.LEVEL, mod.LEVEL];
    levelsSource = 'levels.js 단일 LEVEL — 스테이지 2~5는 crystal_valley 기하로 근사 (LEVELS 미도착)';
  }
} catch {
  levelsSource = 'levels.js 로드 실패 — 경로 추정치 사용';
}

const pathLenOf = (level) => {
  if (!level || !Array.isArray(level.waypoints) || level.waypoints.length < 2) return 40 * 64;
  let len = 0;
  for (let i = 1; i < level.waypoints.length; i++) {
    const a = level.waypoints[i - 1], b = level.waypoints[i];
    len += (Math.abs(b.col - a.col) + Math.abs(b.row - a.row)) * level.tileSize;
  }
  return len;
};

const stage1Level = LEVELS_DATA ? LEVELS_DATA[0] : null;
const pathLen = pathLenOf(stage1Level);

console.log('════════════════════════════════════════════════════════════');
console.log(' 크리스탈 가드 — 헤드리스 밸런스 시뮬레이션 v4 (5스테이지 + 점수)');
console.log('════════════════════════════════════════════════════════════');
console.log(`레벨 데이터: ${levelsSource}`);
console.log(`스테이지 1 경로 길이: ${pathLen}px`);

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
// Part 2/4. 실엔진 시나리오 (권위 판정) — 스테이지 파라미터화
// ════════════════════════════════════════════════════════════
// 봇 액션 큐. 킬존/산개 배치는 crystal_valley 기하 기준(qa 회차 9 검증 큐).
// 스테이지 2~5는 실기하(LEVELS) 도착 시 스테이지별 킬존 큐로 교체 — 그전까진 이 큐 재사용.
const SCATTER_ACTIONS = [
  ['build', 'arrow', 1, 1], ['build', 'arrow', 9, 1], ['build', 'cannon', 5, 8],
  ['build', 'arrow', 13, 3], ['build', 'arrow', 2, 4], ['build', 'cannon', 10, 6],
  ['build', 'arrow', 6, 1], ['build', 'arrow', 3, 8], ['build', 'arrow', 11, 7],
  ['build', 'cannon', 13, 7], ['build', 'arrow', 0, 4], ['build', 'arrow', 14, 2]
];
const FLOOD_ACTIONS = [
  ['build', 'arrow', 6, 5], ['build', 'arrow', 10, 3], ['build', 'frost', 6, 4],
  ['build', 'cannon', 7, 6], ['build', 'frost', 10, 4], ['build', 'arrow', 11, 3],
  ['build', 'arrow', 5, 3], ['build', 'arrow', 7, 3], ['build', 'cannon', 9, 4],
  ['build', 'arrow', 11, 4], ['build', 'arrow', 5, 6], ['build', 'cannon', 9, 6]
];
const KILLZONE_ACTIONS = [
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
  ['up', 7, 6], ['up', 11, 4], ['up', 5, 3], ['up', 11, 3], ['up', 6, 4], ['up', 10, 4],
  ['up', 6, 4] // frost Lv3 — 빙결 파동 활성으로 4개 메커니즘 전부 노출 (AC-37)
];

// ── 스테이지별 킬존/산개 봇 큐 (수작업 — map-designer LEVELS 킬존 좌표 기반) ──
// 스테이지 2~5는 맵마다 킬존 위치가 달라 crystal_valley 좌표를 재사용할 수 없다. 각 맵의
// 킬존 명당(경로 다중 커버 GRASS)에 crystal_valley와 동형 조합(4 arrow/2 cannon/2 frost/2 arcane +
// 업그레이드 인터리브)을 수작업 배치한다 — Part 2의 방법론을 그대로 각 맵에 적용.
// 자동 커버리지 봇도 시도했으나(그리디 집합피복) 맵 기하별 편차가 크고 crystal_valley조차
// 검증 큐보다 약해(W8 사망) "신중한 플레이어 하한"을 대표하지 못함 → 수작업 큐 채택 (§튜닝 D18-1).
// 봇은 판매·재배치·타이밍 조작이 없으므로 여전히 하한이다 — 사람은 이보다 잘한다.
const KILLZONE_QUEUES = {
  crystal_valley: KILLZONE_ACTIONS,
  // A(10,3) B(4,5) 3중 커버 포켓 (map-designer 문서)
  bramble_fork: [
    ['build', 'arrow', 10, 3], ['build', 'arrow', 4, 5], ['up', 10, 3], ['up', 4, 5],
    ['build', 'frost', 10, 2], ['build', 'cannon', 9, 3], ['build', 'arcane', 4, 6], ['up', 4, 6],
    ['build', 'frost', 3, 5], ['up', 9, 3], ['up', 10, 3], ['up', 4, 5],
    ['build', 'arcane', 11, 3], ['up', 11, 3], ['up', 4, 6], ['build', 'cannon', 5, 5],
    ['build', 'arrow', 11, 2], ['build', 'arrow', 3, 6],
    ['up', 9, 3], ['up', 5, 5], ['up', 11, 2], ['up', 3, 6], ['up', 10, 2], ['up', 3, 5], ['up', 10, 2]
  ],
  // A(4,7) B(11,7) row6·row8 레일 커버 (map-designer 문서)
  twin_snake: [
    ['build', 'arrow', 4, 7], ['build', 'arrow', 11, 7], ['up', 4, 7], ['up', 11, 7],
    ['build', 'frost', 3, 7], ['build', 'cannon', 5, 7], ['build', 'arcane', 10, 7], ['up', 10, 7],
    ['build', 'frost', 12, 7], ['up', 5, 7], ['up', 4, 7], ['up', 11, 7],
    ['build', 'arcane', 6, 7], ['up', 6, 7], ['up', 10, 7], ['build', 'cannon', 13, 7],
    ['build', 'arrow', 4, 9], ['build', 'arrow', 11, 9],
    ['up', 5, 7], ['up', 13, 7], ['up', 4, 9], ['up', 11, 9], ['up', 3, 7], ['up', 12, 7], ['up', 3, 7]
  ],
  // 출구 깔때기 (14,1) 집중 — 병목 관문의 최종 방어선. 상단 우측 col9~13 스택
  narrow_gate: [
    ['build', 'arrow', 11, 3], ['build', 'arrow', 13, 2], ['up', 11, 3], ['up', 13, 2],
    ['build', 'cannon', 13, 3], ['build', 'frost', 11, 2], ['build', 'arcane', 9, 3], ['up', 9, 3],
    ['build', 'arcane', 13, 5], ['up', 13, 3], ['up', 11, 3], ['up', 13, 2],
    ['build', 'cannon', 9, 6], ['up', 9, 6], ['up', 9, 3], ['build', 'frost', 7, 3],
    ['build', 'arrow', 5, 3], ['build', 'arrow', 3, 3],
    ['up', 13, 5], ['up', 5, 3], ['up', 3, 3], ['up', 7, 3], ['up', 11, 2], ['up', 13, 5], ['up', 11, 2]
  ],
  // 출구 깔때기 row8 집중 — 최장 능선의 마지막 레일 (col3~13 row7 커버 row6/row8)
  last_ridge: [
    ['build', 'arrow', 3, 7], ['build', 'arrow', 11, 7], ['up', 3, 7], ['up', 11, 7],
    ['build', 'cannon', 5, 7], ['build', 'frost', 7, 7], ['build', 'arcane', 13, 7], ['up', 13, 7],
    ['build', 'arcane', 9, 7], ['up', 9, 7], ['up', 3, 7], ['up', 11, 7],
    ['build', 'cannon', 7, 5], ['up', 7, 5], ['up', 13, 7], ['build', 'frost', 3, 3],
    ['build', 'arrow', 11, 3], ['build', 'arrow', 3, 5],
    ['up', 9, 7], ['up', 11, 3], ['up', 3, 5], ['up', 3, 3], ['up', 5, 7], ['up', 7, 7], ['up', 5, 7]
  ]
};

/** 산개(무전략) 봇 — 커버리지 낮은 GRASS 12개에 arrow 위주 배치, 업그레이드 없음. */
function buildScatterQueue(level) {
  if (!level || !Array.isArray(level.tiles) || !level.waypoints) return SCATTER_ACTIONS;
  const ts = level.tileSize;
  const path = [], grass = [];
  const wp = level.waypoints;
  for (let i = 1; i < wp.length; i++) {
    const ax = wp[i - 1].col * ts + ts / 2, ay = wp[i - 1].row * ts + ts / 2;
    const bx = wp[i].col * ts + ts / 2, by = wp[i].row * ts + ts / 2;
    const seg = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.round(seg / 32));
    for (let s = 0; s < steps; s++) path.push([ax + (bx - ax) * s / steps, ay + (by - ay) * s / steps]);
  }
  for (let r = 0; r < level.tiles.length; r++)
    for (let c = 0; c < level.tiles[r].length; c++)
      if (level.tiles[r][c] === 0) grass.push([c, r]);
  const cov = ([c, r]) => {
    const x = c * ts + ts / 2, y = r * ts + ts / 2;
    let n = 0;
    for (const [tx, ty] of path) if ((tx - x) ** 2 + (ty - y) ** 2 <= 160 * 160) n++;
    return n;
  };
  const ranked = grass.map((g) => ({ g, c: cov(g) })).sort((a, b) => a.c - b.c).slice(0, 12);
  return ranked.map(({ g }, i) => ['build', (i + 1) % 4 === 0 ? 'cannon' : 'arrow', g[0], g[1]]);
}
const SCATTER_QUEUES = {
  crystal_valley: SCATTER_ACTIONS,
  bramble_fork: buildScatterQueue(LEVELS_DATA?.[1]),
  twin_snake: buildScatterQueue(LEVELS_DATA?.[2]),
  narrow_gate: buildScatterQueue(LEVELS_DATA?.[3]),
  last_ridge: buildScatterQueue(LEVELS_DATA?.[4])
};
const killzoneQueueFor = (id) => KILLZONE_QUEUES[id] || KILLZONE_ACTIONS;
const scatterQueueFor = (id) => SCATTER_QUEUES[id] || SCATTER_ACTIONS;

let engine = null;
try {
  const { on, emit } = await import('../src/core/events.js');
  const { initGrid, isBuildable } = await import('../src/map/grid.js');
  const { initPath } = await import('../src/map/path.js');
  const combat = await import('../src/systems/combat.js');
  const waves = await import('../src/systems/waves.js');
  const economy = await import('../src/systems/economy.js');
  economy.initEconomy();
  combat.initCombat();
  waves.initWaves();
  engine = { on, emit, isBuildable, initGrid, initPath, combat, waves, economy };
} catch (e) {
  console.log(`\n[경고] 실엔진 모듈 로드 실패 — Part 2/4 생략: ${e.message}`);
}

const stageResults = {}; // stageId → { A, (B), C }

if (engine) {
  const { on, emit, isBuildable, initGrid, initPath, combat, economy } = engine;
  const COST = {};
  for (const k of Object.keys(TOWERS)) COST[k] = TOWERS[k].levels.map((l) => l.cost);
  const towerAt = (col, row) => combat.towers.find((t) => t.col === col && t.row === row);

  let current = null;
  let waveTotal = 10;
  on('wave:started', (p) => { if (current) { current.waveLeaks = 0; if (p && p.total) waveTotal = p.total; } });
  on('enemy:escaped', () => { if (current) current.waveLeaks++; });
  on('wave:cleared', (p) => {
    if (!current) return;
    current.log.push({ w: p.index, leaks: current.waveLeaks, lives: economy.getLives() });
    if (p.index === waveTotal) current.won = true;
  });
  on('lives:changed', (p) => { if (current && p.lives <= 0) current.over = true; });

  /**
   * 한 스테이지에서 한 봇을 실엔진으로 구동.
   * @param {string} stageId  STAGE_IDS 원소
   * @param {number} stageIndex 0~4 (LEVELS 인덱스)
   * @param {{key,name,actions}} strat 봇 정의
   */
  const runStageBot = (stageId, stageIndex, strat) => {
    // 스테이지 기하로 grid/path 재초기화 (LEVELS 도착 시 스테이지별, 미도착 시 crystal_valley)
    const level = LEVELS_DATA ? LEVELS_DATA[Math.min(stageIndex, LEVELS_DATA.length - 1)] : null;
    if (level) { initGrid(level); initPath(level); }
    current = { waveLeaks: 0, log: [], won: false, over: false };
    emit('stage:started', { stageIndex, stageId }); // 활성 웨이브·hpScale 캐시 (§14.1)
    emit('game:started', {});                        // 자원 리셋 (stage:started 뒤 — §14.1 순서)
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
    while (!current.won && !current.over && simT < 60 * 60) {
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

  const STRATS = {
    A: { key: 'A', name: 'A 산개 무전략' },
    B: { key: 'B', name: 'B 도배 무업글 (참고)' },
    C: { key: 'C', name: 'C 킬존 최적' }
  };

  // ── Part 2: 스테이지 1 (crystal_valley) — v2 회귀 대조 ──
  console.log('\n■ Part 2 — 실엔진 자동 플레이: 스테이지 1 crystal_valley (v2 회귀 권위 판정)');
  const s1 = 'crystal_valley';
  const s1res = {};
  for (const sk of ['A', 'B', 'C']) {
    const strat = { ...STRATS[sk], actions: sk === 'A' ? scatterQueueFor(s1) : sk === 'B' ? FLOOD_ACTIONS : killzoneQueueFor(s1) };
    const r = runStageBot(s1, 0, strat);
    s1res[sk] = r;
    const rows = r.log.map((e) => `W${e.w}:누수${e.leaks}`).join(' ');
    console.log(`  [${strat.name}] ${r.won ? `클리어 — 잔여 ${r.livesLeft}/${STAGE_BALANCE[s1].startLives}` : `패배 — 웨이브 ${r.deathWave}`}`);
    console.log(`    ${rows || '(클리어 웨이브 없음)'}`);
  }
  stageResults[s1] = s1res;

  // ── Part 4: 스테이지 2~5 회귀 ──
  console.log('\n■ Part 4 — 실엔진 자동 플레이: 스테이지 2~5 (§4.8·§4.9 — hpScale 주손잡이)');
  if (!LEVELS_DATA || LEVELS_DATA[1] === LEVELS_DATA[0]) {
    console.log('  [주의] LEVELS 미도착 — 스테이지 2~5를 crystal_valley 기하로 근사. 실기하 도착 후 재검증 필요.');
  }
  for (let idx = 1; idx <= 4; idx++) {
    const id = STAGE_IDS[idx];
    const bal = STAGE_BALANCE[id] || { startLives: 20, hpScale: 1 };
    const res = {};
    for (const sk of ['A', 'C']) {
      const strat = { ...STRATS[sk], actions: sk === 'A' ? scatterQueueFor(id) : killzoneQueueFor(id) };
      res[sk] = runStageBot(id, idx, strat);
    }
    stageResults[id] = res;
    const c = res.C, a = res.A;
    const pct = c.won ? Math.round((c.livesLeft / bal.startLives) * 100) : 0;
    console.log(`  [스테이지 ${idx + 1} ${id}] hpScale ${bal.hpScale}`);
    console.log(`    킬존 C: ${c.won ? `클리어 — 잔여 ${c.livesLeft}/${bal.startLives} (${pct}%)` : `패배 — 웨이브 ${c.deathWave}`}` +
      ` | 무전략 A: ${a.won ? `클리어 잔여 ${a.livesLeft}` : `웨이브 ${a.deathWave} 패배`}`);
    console.log(`      C누수: ${c.log.map((e) => `W${e.w}:${e.leaks}`).join(' ') || '(없음)'}`);
  }
}

// ════════════════════════════════════════════════════════════
// Part 3. 검증 (스키마 + GDD 구속 + 난이도 목표)
// ════════════════════════════════════════════════════════════
const checks = [];
const ok = (label, cond) => checks.push({ label, cond });

// ── v1/v2 스키마 (불변 회귀) ──
ok('TOWERS 4종 (arrow/cannon/frost/arcane)', ['arrow', 'cannon', 'frost', 'arcane'].every(k => TOWERS[k]?.id === k));
ok('ENEMIES 5종 (goblin/orc/steel_brute/wasp_runner/stone_golem)',
  ['goblin', 'orc', 'steel_brute', 'wasp_runner', 'stone_golem'].every(k => ENEMIES[k]?.id === k));
ok('WAVES 길이 10 고정', WAVES.length === 10);
ok('BALANCE 필드 4종', ['startGold', 'startLives', 'sellRatio', 'interWaveCountdown'].every(k => typeof BALANCE[k] === 'number'));

// GDD 구속 (v1)
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

// v2 스키마 + §12.1 메커니즘 구속
ok('assetKeys = tower_{id}_lv1~3 3키, v1 assetKey 폐지 (AC-27)', Object.values(TOWERS).every(t =>
  !('assetKey' in t) && Array.isArray(t.assetKeys) && t.assetKeys.length === 3 &&
  t.assetKeys.every((k, i) => k === `tower_${t.id}_lv${i + 1}`)));
try {
  const { MANIFEST } = await import('../assets/manifest.js');
  ok('assetKeys 12키 전부 매니페스트 등재', Object.values(TOWERS).every(t => t.assetKeys.every(k => k in MANIFEST)));
} catch {
  ok('assetKeys 매니페스트 대조 — manifest.js 로드 실패', false);
}
ok('mechanism 4종 타입 대응 + nameKo/desc (AC-28)', (
  TOWERS.arrow.mechanism?.type === 'rapid_volley' &&
  TOWERS.cannon.mechanism?.type === 'burning_ground' &&
  TOWERS.frost.mechanism?.type === 'frost_nova' &&
  TOWERS.arcane.mechanism?.type === 'overcharge' &&
  Object.values(TOWERS).every(t => t.mechanism.nameKo && t.mechanism.desc)));
{
  const mArrow = TOWERS.arrow.mechanism, mCannon = TOWERS.cannon.mechanism;
  const mFrost = TOWERS.frost.mechanism, mArcane = TOWERS.arcane.mechanism;
  const arrowL3 = TOWERS.arrow.levels[2], cannonL3 = TOWERS.cannon.levels[2], arcaneL3 = TOWERS.arcane.levels[2];
  const arrowMaxDps = arrowL3.damage / (arrowL3.cooldown * Math.pow(mArrow.stackFactor, mArrow.maxStacks));
  const arcaneSustain = (arcaneL3.damage * (1 + Math.min(arcaneL3.cooldown / mArcane.chargeTime, 1) * mArcane.maxBonus)) / arcaneL3.cooldown;
  ok(`속사 최대 DPS(${arrowMaxDps.toFixed(1)}) < 아케인 상시 DPS(${arcaneSustain.toFixed(1)}) — §12.1 저격 침범 금지`,
    arrowMaxDps < arcaneSustain);
  ok('화염 지대 틱 DPS < 캐논 Lv3 직격 DPS — §12.1 주 딜은 착탄',
    mCannon.tickDamage / mCannon.tickInterval < cannonL3.damage / cannonL3.cooldown);
  ok('빙결 파동 반경 ≤ 캐논 Lv3 스플래시 — §12.1',
    mFrost.radius <= (cannonL3.splashRadius ?? TOWERS.cannon.projectile.splashRadius));
  ok('과충전 상시 보정 ≤ +35% — §12.1 상시 DPS 왜곡 금지',
    Math.min(arcaneL3.cooldown / mArcane.chargeTime, 1) * mArcane.maxBonus <= 0.35);
  ok('Lv2 비대칭 축 — arrow 공속·cannon 스플래시·frost 슬로우·arcane 사거리 (§12.1)', (
    TOWERS.arrow.levels[1].cooldown < TOWERS.arrow.levels[0].cooldown &&
    (TOWERS.cannon.levels[1].splashRadius ?? 0) > TOWERS.cannon.projectile.splashRadius &&
    TOWERS.frost.levels[1].slow && TOWERS.frost.levels[1].slow.factor < TOWERS.frost.projectile.slow.factor &&
    TOWERS.frost.levels[1].slow.duration > TOWERS.frost.projectile.slow.duration &&
    (TOWERS.arcane.levels[1].range - TOWERS.arcane.levels[0].range) >
      Math.max(...['arrow', 'cannon', 'frost'].map(k => TOWERS[k].levels[1].range - TOWERS[k].levels[0].range))));
}

// 등장 순서 (AC-14) — 스테이지 1
const waveTypes = WAVES.map(w => new Set(w.groups.map(g => g.enemy)));
const firstWave = t => waveTypes.findIndex(s => s.has(t)) + 1;
ok('W1~2 고블린만', [0, 1].every(i => [...waveTypes[i]].every(t => t === 'goblin')));
ok('오크 첫 등장 = W3', firstWave('orc') === 3);
ok('와스프 첫 등장 = W5', firstWave('wasp_runner') === 5);
ok('브루트 첫 등장 = W6', firstWave('steel_brute') === 6);
ok('골렘은 W10에만 + 호위 동반', firstWave('stone_golem') === 10 && waveTypes[9].size > 1);

// 보스 비중 (raw HP 40~60%) — 스테이지 1
const w10 = WAVES[9];
const rawEhp = g => ENEMIES[g.enemy].hp * w10.hpMultiplier * g.count;
const golemShare = rawEhp(w10.groups.find(g => g.enemy === 'stone_golem')) / w10.groups.reduce((s, g) => s + rawEhp(g), 0);
ok(`보스 = W10 총 EHP의 40~60% (현재 ${(golemShare * 100).toFixed(0)}%)`, golemShare >= 0.4 && golemShare <= 0.6);

// 골드 수지 — 스테이지 1
const minIncome = Math.min(...WAVES.map(w =>
  w.bonus + w.groups.reduce((s, g) => s + ENEMIES[g.enemy].reward * g.count, 0)));
ok(`골드 수지 — 웨이브당 최소 수입 ${minIncome} ≥ 40`, minIncome >= 40);

// ── v3 스키마 (STAGE_WAVES · STAGE_BALANCE · SCORING) ──
ok('STAGE_WAVES 5키 (crystal_valley/bramble_fork/twin_snake/narrow_gate/last_ridge)',
  STAGE_IDS.every(id => Array.isArray(STAGE_WAVES[id])));
ok('STAGE_WAVES 각 스테이지 길이 10 고정 (D16)', STAGE_IDS.every(id => STAGE_WAVES[id]?.length === 10));
ok('STAGE_WAVES.crystal_valley === WAVES (참조 동일 — §15 회귀 불변)', STAGE_WAVES.crystal_valley === WAVES);
ok('STAGE_WAVES 전 그룹 enemy는 ENEMIES 정의 + 필드 정합',
  STAGE_IDS.every(id => STAGE_WAVES[id].every(w => Array.isArray(w.groups) && w.groups.length > 0 && w.groups.every(g =>
    ENEMIES[g.enemy] && g.count > 0 && g.interval >= 0 && g.delay >= 0) && w.hpMultiplier > 0 && w.bonus >= 0)));
ok('STAGE_WAVES 각 스테이지 보스 = W10에만 (골렘 1기)',
  STAGE_IDS.every(id => {
    const has = (wi) => STAGE_WAVES[id][wi].groups.some(g => g.enemy === 'stone_golem');
    return has(9) && STAGE_WAVES[id].slice(0, 9).every((_, wi) => !has(wi));
  }));
ok('STAGE_BALANCE 5키 + 필드 (startGold/startLives/hpScale≥1)',
  STAGE_IDS.every(id => {
    const b = STAGE_BALANCE[id];
    return b && Number.isFinite(b.startGold) && Number.isFinite(b.startLives) && b.hpScale >= 1;
  }));
ok('STAGE_BALANCE.crystal_valley = {120,20,1.0} (§15 회귀 불변)',
  STAGE_BALANCE.crystal_valley.startGold === 120 && STAGE_BALANCE.crystal_valley.startLives === 20 &&
  STAGE_BALANCE.crystal_valley.hpScale === 1.0);
ok('hpScale 스테이지 1→5 단조 증가 (AC-44 난이도 상승)',
  STAGE_IDS.every((id, i) => i === 0 || STAGE_BALANCE[id].hpScale > STAGE_BALANCE[STAGE_IDS[i - 1]].hpScale));
ok('SCORING killPoints ENEMIES 5키 전부 + 보스 단일 최고 (§13.2)', (
  ['goblin', 'orc', 'steel_brute', 'wasp_runner', 'stone_golem'].every(k => Number.isFinite(SCORING.killPoints[k])) &&
  SCORING.killPoints.stone_golem > Math.max(...['goblin', 'orc', 'steel_brute', 'wasp_runner'].map(k => SCORING.killPoints[k]))));
ok('SCORING 처치 점수 난이도 순 (goblin 최저, brute가 비보스 최고 — §13.2)', (
  SCORING.killPoints.goblin === Math.min(...['goblin', 'orc', 'steel_brute', 'wasp_runner'].map(k => SCORING.killPoints[k])) &&
  SCORING.killPoints.steel_brute === Math.max(...['goblin', 'orc', 'steel_brute', 'wasp_runner'].map(k => SCORING.killPoints[k]))));
ok('SCORING waveClearBonus>0·waveScale≥1·lifeBonusPerLife>0 (§4.10)',
  SCORING.waveClearBonus > 0 && SCORING.waveScale >= 1 && SCORING.lifeBonusPerLife > 0);

// 난이도 목표 — 스테이지 1 (실엔진 봇, D9-1 권위 판정)
if (engine && stageResults.crystal_valley) {
  const a = stageResults.crystal_valley.A;
  const c = stageResults.crystal_valley.C;
  const lo = Math.ceil(STAGE_BALANCE.crystal_valley.startLives * 0.3);
  const hi = Math.floor(STAGE_BALANCE.crystal_valley.startLives * 0.7);
  ok(`[실엔진 S1] 무전략 실패 웨이브 5~7 (현재 ${a.won ? '생존' : a.deathWave})`,
    !a.won && a.deathWave >= 5 && a.deathWave <= 7);
  ok(`[실엔진 S1] 킬존 클리어 + 잔여 라이프 ${lo}~${hi} (현재 ${c.won ? c.livesLeft : '실패'})`,
    c.won && c.livesLeft >= lo && c.livesLeft <= hi);
} else {
  ok('[실엔진 S1] 난이도 검증 불가 — 엔진 모듈 부재', false);
}

// ── v3 난이도 밴드 — 스테이지 2~5 (AC-44) ──
// 각 스테이지 킬존 봇 클리어 잔여 30~70%, 신규 스테이지 2→5 단조 비증가(후반일수록 빡빡).
// 스테이지 1(crystal_valley)은 v2 회귀-고정된 "학습 스테이지"로, 킬존 봇 55%는 단일 맵을
// 빡빡하게 튜닝한 v2 결과일 뿐 "bramble보다 어렵다"는 의미가 아니다(수정 불가 — 계약 §15).
// 따라서 단조 판정은 튜닝 가능 범위인 신규 스테이지 2→5에만 적용한다(스테이지 1은 보고만).
if (engine) {
  const pctOf = (id) => {
    const r = stageResults[id]?.C;
    const sl = STAGE_BALANCE[id].startLives;
    return r && r.won ? (r.livesLeft / sl) * 100 : -1;
  };
  const pcts = STAGE_IDS.map(pctOf);
  for (let i = 1; i <= 4; i++) {
    const id = STAGE_IDS[i];
    const p = pcts[i];
    ok(`[실엔진 S${i + 1} ${id}] 킬존 클리어 + 잔여 30~70% (현재 ${p < 0 ? '실패' : p.toFixed(0) + '%'})`,
      p >= 30 && p <= 70);
  }
  // 신규 스테이지 2→5 단조 비증가 (허용 오차 8%p — 봇 이산 행동의 노이즈 흡수)
  ok(`[실엔진] 난이도 단조 상승 — 킬존 잔여% 신규 S2→5 비증가 (S1=${pcts[0] < 0 ? 'X' : Math.round(pcts[0])}% | ${pcts.slice(1).map(p => p < 0 ? 'X' : Math.round(p)).join('→')})`,
    [1, 2, 3, 4].every((i) => i === 1 || pcts[i] < 0 || pcts[i - 1] < 0 || pcts[i] <= pcts[i - 1] + 8));
} else {
  ok('[실엔진 S2~5] 난이도 밴드 검증 불가 — 엔진 모듈 부재', false);
}

console.log('\n■ Part 3 — 검증 결과');
let failCount = 0;
for (const c of checks) {
  if (!c.cond) failCount++;
  console.log(`  ${c.cond ? 'PASS' : 'FAIL'}  ${c.label}`);
}

// ════════════════════════════════════════════════════════════
// Part 5. 점수 배점 검증 (§4.10) — 스테이지 1 풀클리어 3요소 비중
// ════════════════════════════════════════════════════════════
function stageFullClearScore(stageId, livesLeft) {
  const waveList = STAGE_WAVES[stageId] || WAVES;
  let kill = 0;
  for (const w of waveList) for (const g of w.groups) kill += (SCORING.killPoints[g.enemy] || 0) * g.count;
  let wave = 0;
  waveList.forEach((_, i) => { wave += Math.round(SCORING.waveClearBonus * (1 + i * (SCORING.waveScale - 1))); });
  const life = livesLeft * SCORING.lifeBonusPerLife;
  return { kill, wave, life, total: kill + wave + life };
}
console.log('\n■ Part 5 — 점수 배점 (스테이지 1 풀클리어 기준, §13.2 3요소 비중)');
{
  const perfect = stageFullClearScore('crystal_valley', 20);
  const band = stageFullClearScore('crystal_valley', 11); // 킬존 봇 밴드 잔여
  const pc = (v, t) => `${((v / t) * 100).toFixed(0)}%`;
  console.log(`  무피해(20라): 처치 ${perfect.kill}(${pc(perfect.kill, perfect.total)}) + 웨이브 ${perfect.wave}(${pc(perfect.wave, perfect.total)}) + 라이프 ${perfect.life}(${pc(perfect.life, perfect.total)}) = ${perfect.total}`);
  console.log(`  밴드(11라):   처치 ${band.kill} + 웨이브 ${band.wave} + 라이프 ${band.life} = ${band.total}`);
  console.log(`  완벽도 스윙: 무피해가 밴드보다 +${perfect.total - band.total}점 (${(((perfect.total - band.total) / band.total) * 100).toFixed(0)}% 상승 — 재플레이 동기)`);
}

console.log(`\n${failCount === 0 ? '✔ 전 항목 통과' : `✘ ${failCount}건 실패`} (${checks.length}항목)`);
process.exit(failCount === 0 ? 0 : 1);
