// QA v3 실데이터 통합: STAGE_WAVES/STAGE_BALANCE ↔ waves/economy, SCORING ↔ score.
// 실행: node _workspace/qa_scratch/qa-verify-v3-realdata-integ.mjs
// 실 이벤트 버스 + 실 데이터로 스테이지 진입 시퀀스를 재현 — 폴백 아닌 실경로 검증.
globalThis.localStorage = { m: new Map(), getItem(k){return this.m.has(k)?this.m.get(k):null;}, setItem(k,v){this.m.set(k,String(v));}, removeItem(k){this.m.delete(k);} };

const { on, emit } = await import('../../src/core/events.js');
const { WAVES, STAGE_WAVES } = await import('../../src/data/waves.js');
const { BALANCE, STAGE_BALANCE } = await import('../../src/data/balance.js');
const { SCORING } = await import('../../src/data/scoring.js');
const { ENEMIES } = await import('../../src/data/enemies.js');
const { LEVELS } = await import('../../src/data/levels.js');
const { initEconomy, getGold, getLives } = await import('../../src/systems/economy.js');
const { initCombat, enemies } = await import('../../src/systems/combat.js');
const { initWaves, updateWaves } = await import('../../src/systems/waves.js');
const { initScore, getScore } = await import('../../src/systems/score.js');

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail++; };

initEconomy(); initCombat(); initWaves(); initScore();

// ═══ 2. STAGE_WAVES / STAGE_BALANCE 실데이터 정합 ═══
console.log('── STAGE_WAVES / STAGE_BALANCE 실데이터 (§4.8·§4.9) ──');
const STAGE_IDS = ['crystal_valley', 'bramble_fork', 'twin_snake', 'narrow_gate', 'last_ridge'];
ok(STAGE_IDS.every((id) => Array.isArray(STAGE_WAVES[id]) && STAGE_WAVES[id].length === 10), 'STAGE_WAVES 5키 각 길이 10');
ok(STAGE_WAVES.crystal_valley === WAVES, 'STAGE_WAVES.crystal_valley === WAVES (참조 동일 §15)');
ok(STAGE_BALANCE.crystal_valley.startGold === 120 && STAGE_BALANCE.crystal_valley.startLives === 20 && STAGE_BALANCE.crystal_valley.hpScale === 1.0,
   'STAGE_BALANCE.crystal_valley = {120,20,1.0} (§15/AC-41)');
// hpScale 단조 증가
const scales = STAGE_IDS.map((id) => STAGE_BALANCE[id].hpScale);
let mono = true; for (let i = 1; i < scales.length; i++) if (scales[i] < scales[i - 1]) mono = false;
ok(mono, `hpScale 단조 비감소: ${scales.join(' ≤ ')}`);

// 스테이지 진입 → economy 시작자원·waves hpScale 실반영 확인
// 헬퍼: 스테이지 진입 후 웨이브1 첫 스폰 적의 maxHp 관측
function enterAndSampleFirstEnemy(stageIndex) {
  const id = STAGE_IDS[stageIndex];
  emit('stage:started', { stageIndex, stageId: id });
  emit('game:started', {});
  let first = null;
  const h = (p) => { if (!first) first = p.enemy; };
  on('enemy:spawned', h);
  enemies.length = 0;
  emit('ui:wave-start-requested', {});
  for (let t = 0; t < 5 * 60 && !first; t++) updateWaves(1 / 60);
  return { id, first };
}

for (let i = 0; i < 5; i++) {
  const id = STAGE_IDS[i];
  emit('stage:started', { stageIndex: i, stageId: id });
  emit('game:started', {});
  // economy 시작 자원 = STAGE_BALANCE
  ok(getGold() === STAGE_BALANCE[id].startGold, `[${id}] 시작 골드 ${STAGE_BALANCE[id].startGold} (실제 ${getGold()})`);
  ok(getLives() === STAGE_BALANCE[id].startLives, `[${id}] 시작 라이프 ${STAGE_BALANCE[id].startLives} (실제 ${getLives()})`);
}

// 웨이브1 첫 그룹 적 HP = base × WaveDef.hpMultiplier × hpScale (스테이지별 다름 확인)
console.log('\n── hpScale 실반영: 스테이지별 첫 적 maxHp (§4.9) ──');
const hps = [];
for (let i = 0; i < 5; i++) {
  const id = STAGE_IDS[i];
  const w1 = STAGE_WAVES[id][0];
  const firstType = w1.groups[0].enemy;
  emit('stage:started', { stageIndex: i, stageId: id });
  emit('game:started', {});
  enemies.length = 0;
  let first = null;
  const h = (p) => { if (!first) first = p.enemy; };
  on('enemy:spawned', h);
  emit('ui:wave-start-requested', {});
  for (let t = 0; t < 5 * 60 && !first; t++) updateWaves(1 / 60);
  const expected = Math.max(1, Math.round(ENEMIES[firstType].hp * w1.hpMultiplier * STAGE_BALANCE[id].hpScale));
  ok(first && first.maxHp === expected,
     `[${id}] 첫 적 ${firstType} maxHp = ${ENEMIES[firstType].hp}×${w1.hpMultiplier}×${STAGE_BALANCE[id].hpScale} = ${expected} (실제 ${first && first.maxHp})`);
  hps.push(first ? first.maxHp : 0);
}

// ═══ 3. SCORING ↔ score.js 무피해 완주 이론 최고점 (독립 재계산) ═══
console.log('\n── SCORING 무피해 완주 이론 최고점 (§4.10·§13.2) ──');
// 스테이지1(crystal_valley) 전 적 처치 + 10웨이브 클리어 + 라이프 20 만점 이론값 독립 계산
function theoreticalMax(stageId, startLives) {
  const waves = STAGE_WAVES[stageId];
  let kill = 0, wave = 0;
  for (let wi = 0; wi < waves.length; wi++) {
    for (const g of waves[wi].groups) {
      const pts = SCORING.killPoints[g.enemy] ?? 0;
      kill += pts * g.count;
    }
    const idx = wi + 1;
    wave += Math.floor(SCORING.waveClearBonus * (1 + (idx - 1) * (SCORING.waveScale - 1)));
  }
  const life = startLives * SCORING.lifeBonusPerLife;
  return { kill, wave, life, total: kill + wave + life };
}
const tm = theoreticalMax('crystal_valley', 20);
console.log(`  이론 최고점 crystal_valley: 처치 ${tm.kill} + 웨이브 ${tm.wave} + 라이프 ${tm.life} = ${tm.total}`);
// score.js를 실제로 구동해 같은 값 나오는지 (모든 enemy:killed + wave:cleared + game:won 발행)
emit('stage:started', { stageIndex: 0, stageId: 'crystal_valley' });
emit('game:started', {});
let simKill = 0;
for (let wi = 0; wi < STAGE_WAVES.crystal_valley.length; wi++) {
  for (const g of STAGE_WAVES.crystal_valley[wi].groups) {
    for (let n = 0; n < g.count; n++) emit('enemy:killed', { enemy: { type: g.enemy } });
  }
  emit('wave:cleared', { index: wi + 1, bonus: STAGE_WAVES.crystal_valley[wi].bonus });
}
const scoreBeforeWin = getScore();
ok(scoreBeforeWin === tm.kill + tm.wave, `score.js 처치+웨이브 소계 ${tm.kill + tm.wave} == 이론 (실제 ${scoreBeforeWin})`);
let finalized = null;
on('score:finalized', (p) => { finalized = p; });
emit('game:won', { kills: 999, livesLeft: 20 });
ok(finalized && finalized.total === tm.total, `score:finalized.total ${tm.total} == 이론 최고점 (실제 ${finalized && finalized.total})`);
ok(finalized.kill === tm.kill && finalized.wave === tm.wave && finalized.life === tm.life,
   `요소 분해 정합 kill ${finalized.kill}/wave ${finalized.wave}/life ${finalized.life}`);

console.log(fail === 0 ? '\n✔ 실데이터 통합 검증 전건 통과' : `\n✗ ${fail}건 실패`);
process.exit(fail ? 1 : 0);
