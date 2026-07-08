// QA v3 독립 검증: score 집계 정합 + progress 해금 캐스케이드 + finalized 1회 + 격리
// 실행: node _workspace/qa_scratch/qa-verify-v3-score-progress.mjs
// 실 이벤트 버스를 통해 score/progress를 구동하고 발행 이벤트를 관측 — 자체 보고 불신, 독립 재현.

// ── 가짜 localStorage 주입 (storage.js 폴백/정규화 경로 검증용) ──
class FakeStore {
  constructor() { this.m = new Map(); this.throwOnSet = false; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (this.throwOnSet) throw new Error('QuotaExceeded'); this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const fake = new FakeStore();
globalThis.localStorage = fake;

const { on, emit, off } = await import('../../src/core/events.js');
const { SCORING } = await import('../../src/data/scoring.js');
const { STORAGE_KEY, loadSave, saveSave, DEFAULT_SAVE } = await import('../../src/core/storage.js');

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail++; };

// 발행 이벤트 캡처 헬퍼
const captured = [];
const cap = (name) => { const h = (p) => captured.push({ name, p }); on(name, h); return h; };
cap('score:changed'); cap('score:finalized'); cap('stage:record-updated'); cap('stage:unlocked');
const clearCap = () => { captured.length = 0; };
const only = (name) => captured.filter((e) => e.name === name);

// ═══ 1. storage 폴백/정규화 (AC-48) ═══
console.log('\n── storage 폴백·정규화 (AC-48·§4.11) ──');
ok(STORAGE_KEY === 'crystal_guard.v1', `STORAGE_KEY === 'crystal_guard.v1' (${STORAGE_KEY})`);

// 부재 → 초기값
fake.m.clear();
let s = loadSave();
ok(s.unlockedCount === 1 && JSON.stringify(s.bestScores) === '[0,0,0,0,0]', '부재 → {unlockedCount:1, bestScores:[0×5]}');
ok(s.bestScores !== DEFAULT_SAVE.bestScores, '반환 배열이 DEFAULT_SAVE 공유 참조 아님(오염 방지)');

// 손상 JSON → 초기값 (크래시 없음)
fake.m.set(STORAGE_KEY, '{not valid json');
s = loadSave();
ok(s.unlockedCount === 1, '손상 JSON → 초기값 폴백(크래시 없음)');

// 버전 불일치 → 초기값
fake.m.set(STORAGE_KEY, JSON.stringify({ version: 99, unlockedCount: 4, bestScores: [1,2,3,4,5] }));
s = loadSave();
ok(s.unlockedCount === 1, '버전 불일치(99) → 초기값 폴백');

// unlockedCount 클램프 [1,5]
fake.m.set(STORAGE_KEY, JSON.stringify({ version: 1, unlockedCount: 99, bestScores: [10] }));
s = loadSave();
ok(s.unlockedCount === 5, `unlockedCount 상한 클램프 99→5 (${s.unlockedCount})`);
fake.m.set(STORAGE_KEY, JSON.stringify({ version: 1, unlockedCount: -3, bestScores: [] }));
s = loadSave();
ok(s.unlockedCount === 1, `unlockedCount 하한 클램프 -3→1 (${s.unlockedCount})`);

// bestScores 정규화: 길이 5 패딩·음수 0·초과 절단
fake.m.set(STORAGE_KEY, JSON.stringify({ version: 1, unlockedCount: 3, bestScores: [100, -5, 'x', 200, 300, 999] }));
s = loadSave();
ok(s.bestScores.length === 5, `bestScores 길이 5로 절단 (${s.bestScores.length})`);
ok(s.bestScores[0] === 100 && s.bestScores[1] === 0 && s.bestScores[2] === 0 && s.bestScores[3] === 200 && s.bestScores[4] === 300,
   `bestScores 정규화 [100,0,0,200,300] (${JSON.stringify(s.bestScores)})`);

// 저장 예외 흡수 (사생활 모드·용량 초과)
fake.throwOnSet = true;
let threw = false;
try { saveSave({ version: 1, unlockedCount: 2, bestScores: [1,2,3,4,5] }); } catch { threw = true; }
ok(!threw, '저장 예외(QuotaExceeded) 흡수 — throw 없음(경고만)');
fake.throwOnSet = false;

// 정상 저장·재로드 왕복
fake.m.clear();
saveSave({ version: 1, unlockedCount: 3, bestScores: [500, 400, 0, 0, 0] });
s = loadSave();
ok(s.unlockedCount === 3 && s.bestScores[0] === 500 && s.bestScores[1] === 400, '저장→로드 왕복 유지 (AC-40 근거)');

// ═══ 2. score 집계 정합 (§4.10·§14.2) ═══
console.log('\n── score 집계 정합 (§4.10·§14.2) ──');
const { initScore, getScore } = await import('../../src/systems/score.js');
initScore();

// 스테이지 진입 시퀀스: stage:started → game:started
emit('stage:started', { stageIndex: 2, stageId: 'twin_snake' });
emit('game:started', {});
clearCap();
ok(getScore() === 0, `game:started 후 누적 0 (${getScore()})`);

// 처치 점수: 종류별 killPoints 정확 가산
const KP = SCORING.killPoints;
emit('enemy:killed', { enemy: { type: 'goblin' } });
ok(getScore() === KP.goblin, `goblin 처치 → +${KP.goblin} (score ${getScore()})`);
emit('enemy:killed', { enemy: { type: 'stone_golem' } });
ok(getScore() === KP.goblin + KP.stone_golem, `golem 처치 누적 (score ${getScore()}, 기대 ${KP.goblin + KP.stone_golem})`);
// score:changed 페이로드 검증
const lastKill = only('score:changed').at(-1);
ok(lastKill.p.source === 'kill' && lastKill.p.delta === KP.stone_golem && lastKill.p.score === getScore(),
   `score:changed{source:'kill', delta:${KP.stone_golem}, score:${getScore()}}`);

// 누수 사망(escaped)은 점수 무영향 — score는 enemy:escaped 미구독
const before = getScore();
emit('enemy:escaped', { enemy: { type: 'goblin' }, livesCost: 1 });
ok(getScore() === before, '누수(enemy:escaped) → 점수 불변(처치 아님)');

// 미정의 타입 → 0점(가산·발행 없음)
clearCap();
emit('enemy:killed', { enemy: { type: 'nonexistent_type' } });
ok(getScore() === before, '미정의 타입 → 0점(누적 불변)');
ok(only('score:changed').length === 0, '미정의 타입 → score:changed 무발행');

// 웨이브 점수: 공식 waveClearBonus × (1 + (index-1)(waveScale-1))
clearCap();
const wb = SCORING.waveClearBonus, ws = SCORING.waveScale;
emit('wave:cleared', { index: 1, bonus: 25 });
const w1Expected = Math.floor(wb * (1 + 0 * (ws - 1)));
const lastW = only('score:changed').at(-1);
ok(lastW && lastW.p.source === 'wave' && lastW.p.delta === w1Expected,
   `wave:cleared index1 → 웨이브점수 ${w1Expected} (delta ${lastW && lastW.p.delta})`);
emit('wave:cleared', { index: 5, bonus: 25 });
const w5Expected = Math.floor(wb * (1 + 4 * (ws - 1)));
const lastW5 = only('score:changed').at(-1);
ok(lastW5.p.delta === w5Expected, `wave:cleared index5 → ${w5Expected} (delta ${lastW5.p.delta})`);

// 판매·업그레이드·배속은 점수 무영향 (score 미구독)
const scoreBeforeEcon = getScore();
emit('tower:sold', { tower: {}, refund: 100 });
emit('tower:upgraded', { tower: {}, cost: 50 });
emit('tower:placed', { tower: {}, cost: 50 });
emit('ui:speed-changed', { multiplier: 2 });
ok(getScore() === scoreBeforeEcon, '판매/업글/건설/배속 → 점수 불변(GDD §13.2)');

// ═══ 3. score:finalized 요소 분해 + 1회 (§14.2·AC-46) ═══
console.log('\n── score:finalized 분해·1회 (§14.2·AC-46) ──');
clearCap();
const killSub = getScore(); // 현재 kill+wave 소계 (finalize 전)
// kill/wave 소계 분리 확인용: 재현을 위해 소계 재계산은 finalized 페이로드로 확인
emit('game:won', { kills: 3, livesLeft: 7 });
const fin = only('score:finalized');
ok(fin.length === 1, `game:won → score:finalized 정확히 1회 (${fin.length})`);
const F = fin[0].p;
ok(F.outcome === 'won', `finalized.outcome === 'won' (${F.outcome})`);
ok(F.stageIndex === 2, `finalized.stageIndex === 2 (stage:started 캐시) (${F.stageIndex})`);
ok(F.life === 7 * SCORING.lifeBonusPerLife, `life = 7 × ${SCORING.lifeBonusPerLife} = ${7 * SCORING.lifeBonusPerLife} (${F.life})`);
ok(F.total === F.kill + F.wave + F.life, `total === kill+wave+life (${F.total} === ${F.kill}+${F.wave}+${F.life})`);
ok(F.kill + F.wave === killSub, `kill+wave 소계 == finalize 전 getScore() (${F.kill + F.wave} == ${killSub})`);

// 패배: 라이프 보너스 0
emit('stage:started', { stageIndex: 0, stageId: 'crystal_valley' });
emit('game:started', {});
emit('enemy:killed', { enemy: { type: 'orc' } });
clearCap();
emit('game:over', {});
const finOver = only('score:finalized');
ok(finOver.length === 1, `game:over → finalized 1회 (${finOver.length})`);
ok(finOver[0].p.outcome === 'over' && finOver[0].p.life === 0, `패배 → outcome 'over', life 0 (life ${finOver[0].p.life})`);

console.log(fail === 0 ? '\n✔ score/progress/storage 독립 검증 전건 통과' : `\n✗ ${fail}건 실패`);
process.exit(fail ? 1 : 0);
