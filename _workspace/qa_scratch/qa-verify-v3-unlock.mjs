// QA v3 독립 검증: progress 해금 캐스케이드 (D14·§14.3·AC-40/47)
// 실행: node _workspace/qa_scratch/qa-verify-v3-unlock.mjs
// progress를 실 이벤트 버스로 구동, score:finalized 발행 → record-updated/unlocked 관측 + 영속 왕복.

class FakeStore {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const fake = new FakeStore();
globalThis.localStorage = fake;

const { on, emit } = await import('../../src/core/events.js');
const { STORAGE_KEY, loadSave } = await import('../../src/core/storage.js');
const { initProgress, getUnlockedCount, getBestScore, isUnlocked, getSnapshot } =
  await import('../../src/systems/progress.js');

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail++; };

const captured = [];
on('stage:record-updated', (p) => captured.push({ name: 'record', p }));
on('stage:unlocked', (p) => captured.push({ name: 'unlocked', p }));
const clearCap = () => { captured.length = 0; };
const last = (n) => captured.filter((e) => e.name === n).at(-1);
const count = (n) => captured.filter((e) => e.name === n).length;

// 초기: 저장 부재 → 스테이지1만 해금
fake.m.clear();
initProgress();
console.log('── 초기 상태 (AC-39) ──');
ok(getUnlockedCount() === 1, `초기 unlockedCount 1 (${getUnlockedCount()})`);
ok(isUnlocked(0) === true && isUnlocked(1) === false, '스테이지1만 해금, 2~5 잠김');
ok(getBestScore(0) === 0, '초기 최고점 0');

// 스테이지1 클리어 → 스테이지2 해금 + 최고점 갱신
console.log('\n── N 클리어 → N+1 해금 (D14·AC-40) ──');
clearCap();
emit('score:finalized', { stageIndex: 0, outcome: 'won', kill: 100, wave: 100, life: 50, total: 250 });
ok(getUnlockedCount() === 2, `S1 클리어 → unlockedCount 2 (${getUnlockedCount()})`);
ok(isUnlocked(1) === true, '스테이지2 해금됨');
ok(getBestScore(0) === 250, `S1 최고점 250 (${getBestScore(0)})`);
ok(last('record').p.stageIndex === 0 && last('record').p.best === 250 && last('record').p.isNewBest === true,
   'stage:record-updated{stageIndex:0, best:250, isNewBest:true}');
ok(last('unlocked').p.stageIndex === 1, `stage:unlocked{stageIndex:1} (새로 열린 인덱스) (${last('unlocked').p.stageIndex})`);

// 영속: 저장 반영
const saved = loadSave();
ok(saved.unlockedCount === 2 && saved.bestScores[0] === 250, '해금·최고점 localStorage 저장 (AC-40)');

// 재클리어(같은 스테이지, 낮은 점수) → 해금 재발생 없음, 최고점 유지
console.log('\n── 재클리어 무해금·최고점 유지 (D14) ──');
clearCap();
emit('score:finalized', { stageIndex: 0, outcome: 'won', kill: 10, wave: 10, life: 0, total: 20 });
ok(getUnlockedCount() === 2, `S1 재클리어 → unlockedCount 여전히 2 (${getUnlockedCount()})`);
ok(getBestScore(0) === 250, `낮은 점수 → 최고점 250 유지 (${getBestScore(0)})`);
ok(last('record').p.isNewBest === false, 'isNewBest false(경신 안 됨)');
ok(count('unlocked') === 0, '재클리어 → stage:unlocked 무발행');

// 신기록 경신 (AC-47)
clearCap();
emit('score:finalized', { stageIndex: 0, outcome: 'won', kill: 300, wave: 200, life: 100, total: 600 });
ok(getBestScore(0) === 600, `신기록 600 경신 (${getBestScore(0)})`);
ok(last('record').p.isNewBest === true, '신기록 → isNewBest true (AC-47)');

// 순서 건너뛴 클리어(스테이지3, 아직 미해금) → 최고점만, 해금 조건 미충족
console.log('\n── 해금 단조성: 건너뛴 클리어 (D14) ──');
clearCap();
emit('score:finalized', { stageIndex: 3, outcome: 'won', kill: 0, wave: 0, life: 0, total: 999 });
ok(getUnlockedCount() === 2, `S4 클리어했으나 조건(idx+1===unlockedCount) 미충족 → unlockedCount 2 유지 (${getUnlockedCount()})`);
ok(getBestScore(3) === 999, 'S4 최고점은 갱신됨(재플레이 가능 시나리오)');
ok(count('unlocked') === 0, '건너뛴 클리어 → 해금 무발행(단조성 보존)');

// 패배는 해금 안 함, 최고점만
console.log('\n── 패배 → 최고점만, 해금 없음 ──');
clearCap();
emit('score:finalized', { stageIndex: 1, outcome: 'over', kill: 50, wave: 30, life: 0, total: 80 });
ok(getUnlockedCount() === 2, `S2 패배 → unlockedCount 2 유지 (${getUnlockedCount()})`);
ok(getBestScore(1) === 80, `S2 패배도 최고점 기록 80 (${getBestScore(1)})`);
ok(count('unlocked') === 0, '패배 → 해금 없음');

// 순차 해금 최대 5 상한
console.log('\n── unlockedCount 최대 5 상한 ──');
emit('score:finalized', { stageIndex: 1, outcome: 'won', kill: 0, wave: 0, life: 0, total: 1 }); // idx1+1=2===uc2 → uc3
emit('score:finalized', { stageIndex: 2, outcome: 'won', kill: 0, wave: 0, life: 0, total: 1 }); // uc4
emit('score:finalized', { stageIndex: 3, outcome: 'won', kill: 0, wave: 0, life: 0, total: 1000 }); // uc5
ok(getUnlockedCount() === 5, `순차 해금 → unlockedCount 5 (${getUnlockedCount()})`);
clearCap();
emit('score:finalized', { stageIndex: 4, outcome: 'won', kill: 0, wave: 0, life: 0, total: 5000 }); // idx4+1=5, uc=5 → 상한
ok(getUnlockedCount() === 5, `S5 클리어 → unlockedCount 5 상한 유지 (${getUnlockedCount()})`);
ok(count('unlocked') === 0, 'S5 클리어 → 6번째 해금 없음(최대 5)');
ok(getBestScore(4) === 5000, 'S5 최고점 5000 기록');

// getSnapshot 불변성
const snap = getSnapshot();
snap.bestScores[0] = -1;
ok(getBestScore(0) === 600, 'getSnapshot 반환은 복사본(외부 변경이 내부 오염 안 함)');

console.log(fail === 0 ? '\n✔ progress 해금 캐스케이드 독립 검증 전건 통과' : `\n✗ ${fail}건 실패`);
process.exit(fail ? 1 : 0);
