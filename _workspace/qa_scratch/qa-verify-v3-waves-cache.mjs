// QA v3 독립 검증: waves.js 스테이지 캐싱 경계면 (§4.8·§4.9·§14.1)
// 실행: node _workspace/qa_scratch/qa-verify-v3-waves-cache.mjs
// 실 이벤트 버스로 waves를 구동 — enemy:spawned/wave:started 관측. 자체 보고 불신.
// 주의: STAGE_WAVES/STAGE_BALANCE 미착지(wave-balancer #7) 상태이므로 폴백 경로만 검증 가능.
//   실 스테이지2~5 HP스케일·웨이브구성은 #7 착지 후 통합 회차에서.

const { on, emit } = await import('../../src/core/events.js');
const { WAVES } = await import('../../src/data/waves.js');
const { ENEMIES } = await import('../../src/data/enemies.js');
const { initWaves, updateWaves, getCurrentWave } = await import('../../src/systems/waves.js');

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail++; };

const spawned = [];
const waveStarted = [];
// combat 미init → enemies [] 유지 → 웨이브가 즉시 클리어·자동 캐스케이드됨.
// 따라서 첫 wave:cleared 이후 스폰은 무시하고 "웨이브1 스폰"만 카운트한다(테스트 격리).
let wave1Done = false;
on('enemy:spawned', (p) => { if (!wave1Done) spawned.push(p.enemy); });
on('wave:started', (p) => waveStarted.push(p));
on('wave:cleared', () => { wave1Done = true; });
const clear = () => { spawned.length = 0; waveStarted.length = 0; wave1Done = false; };

initWaves();

// 웨이브1 전량 스폰까지 시뮬. 첫 wave:cleared에서 wave1Done=true → 이후 스폰 미집계.
function runWave1() {
  emit('ui:wave-start-requested', {});
  for (let t = 0; t < 60 * 60; t++) updateWaves(1 / 60);
}

// ═══ 1. 기본 경로 (stage:started 미발행 — v2 부팅) ═══
console.log('── 기본 경로: stage:started 없이 (v2 회귀) ──');
emit('game:started', {});
runWave1();
ok(waveStarted.length >= 1, 'wave:started 발행됨');
ok(waveStarted[0].total === WAVES.length && WAVES.length === 10, `wave:started.total === WAVES.length === 10 (${waveStarted[0].total})`);
ok(waveStarted[0].index === 1, `첫 wave index 1 (${waveStarted[0].index})`);
// 스폰된 적의 maxHp = base × WaveDef.hpMultiplier × hpScale(현재 1)
const w1def = WAVES[0];
const w1FirstGroupType = w1def.groups[0].enemy;
const sampleEnemy = spawned.find((e) => e.type === w1FirstGroupType);
const expectedMaxHp = Math.max(1, Math.round(ENEMIES[w1FirstGroupType].hp * w1def.hpMultiplier * 1));
ok(sampleEnemy && sampleEnemy.maxHp === expectedMaxHp,
   `${w1FirstGroupType} maxHp = base×hpMult×1 = ${expectedMaxHp} (실제 ${sampleEnemy && sampleEnemy.maxHp})`);
const w1SpawnCount = w1def.groups.reduce((s, g) => s + g.count, 0);
ok(spawned.length === w1SpawnCount, `웨이브1 스폰 수 == 그룹 count 합 ${w1SpawnCount} (${spawned.length})`);

// ═══ 2. 폴백 경로: 부재 stageId → WAVES 폴백 + 경고 1회 ═══
console.log('\n── 폴백: 존재하지 않는 stageId (§4.8) ──');
clear();
// 경고 캡처
const origWarn = console.warn;
let warnCount = 0;
console.warn = (...a) => { if (String(a[0]).includes("STAGE_WAVES")) warnCount++; };
emit('stage:started', { stageIndex: 9, stageId: 'no_such_stage' });
emit('stage:started', { stageIndex: 9, stageId: 'no_such_stage' }); // 2회 발행 → 경고는 1회만
console.warn = origWarn;
ok(warnCount === 1, `부재 stageId 경고 정확히 1회(스팸 방지) (${warnCount})`);
emit('game:started', {});
runWave1();
ok(waveStarted[0].total === 10, `폴백 후에도 total 10 (WAVES 폴백) (${waveStarted[0].total})`);

// ═══ 3. crystal_valley stage:started (STAGE_WAVES 미착지 → WAVES 폴백, 현재 정상) ═══
console.log('\n── crystal_valley stage:started (현재 STAGE_WAVES 부재 → WAVES) ──');
clear();
console.warn = (...a) => { if (String(a[0]).includes("STAGE_WAVES")) warnCount++; };
emit('stage:started', { stageIndex: 0, stageId: 'crystal_valley' });
console.warn = origWarn;
emit('game:started', {});
runWave1();
ok(waveStarted[0].total === 10, 'crystal_valley → total 10 (STAGE_WAVES 착지 시 crystal_valley===WAVES로 동일)');
ok(getCurrentWave() >= 1, `getCurrentWave 진행됨 (${getCurrentWave()})`);

console.log(fail === 0 ? '\n✔ waves 캐싱 폴백 경계면 독립 검증 통과 (실데이터 스케일은 #7 착지 후 통합)' : `\n✗ ${fail}건 실패`);
process.exit(fail ? 1 : 0);
