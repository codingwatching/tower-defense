// QA v3 UI 경계면: stageselect↔progress, screens↔score:finalized/record, hud↔score:changed.
// 실행: node _workspace/qa_scratch/qa-verify-v3-ui.mjs
// 최소 DOM 셰임 + 실 이벤트 버스로 UI 모듈 구동 — 렌더 순서 불변식·페이로드 소비 검증.

// ── 최소 DOM 셰임 ──
let idSeq = 0;
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this._cls = new Set(); this._id = ''; this._html = ''; this._text = ''; this.listeners = {}; this.style = {}; this.width = 0; this.height = 0; }
  set id(v) { this._id = v; REG.set(v, this); } get id() { return this._id; }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); } get className() { return [...this._cls].join(' '); }
  set innerHTML(v) {
    this._html = v;
    // 셰임: innerHTML의 class="..." 선언을 자식 El로 파싱(querySelector 대상). 실 브라우저 동등.
    this._parsed = [];
    const re = /class="([^"]+)"/g; let m;
    while ((m = re.exec(v))) { const e = new El('span'); e.className = m[1]; this._parsed.push(e); }
  }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = v; } get textContent() { return this._text; }
  get classList() { const s = this._cls; return { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), toggle: (c, f) => { const on = f === undefined ? !s.has(c) : f; on ? s.add(c) : s.delete(c); return on; }, contains: (c) => s.has(c) }; }
  append(...ns) { this.children.push(...ns); } appendChild(n) { this.children.push(n); return n; }
  setAttribute(k, v) { this[k] = v; } getAttribute(k) { return this[k]; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  click() { (this.listeners.click || []).forEach((f) => f({})); }
  querySelector(sel) { const cls = sel.replace('.', ''); const find = (n) => { for (const c of [...(n.children || []), ...(n._parsed || [])]) { if (c._cls && c._cls.has(cls)) return c; const d = find(c); if (d) return d; } return null; }; return find(this); }
  getContext() { return { setTransform() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, set fillStyle(v) {}, set globalCompositeOperation(v) {}, set globalAlpha(v) {} }; }
  get offsetWidth() { return 0; }
}
const REG = new Map();
globalThis.window = { devicePixelRatio: 2 };
globalThis.document = {
  createElement: (t) => new El(t),
  getElementById: (id) => REG.get(id) || null,
  body: new El('body'),
};
// index.html 계약 노드 생성
for (const id of ['screen-stage-select', 'screen-victory', 'screen-defeat', 'stage', 'hud-score', 'hud-gold', 'hud-lives', 'hud-wave']) {
  const e = new El('div'); e.id = id; e.className = id.startsWith('screen') ? 'screen hidden' : '';
}
globalThis.localStorage = { m: new Map(), getItem(k){return this.m.has(k)?this.m.get(k):null;}, setItem(k,v){this.m.set(k,String(v));}, removeItem(k){this.m.delete(k);} };

const { on, emit } = await import('../../src/core/events.js');
const { initScore } = await import('../../src/systems/score.js');
const { initProgress, getUnlockedCount } = await import('../../src/systems/progress.js');
const { initStageSelect } = await import('../../src/ui/stageselect.js');

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail++; };

// 캡처
const captured = [];
on('ui:stage-selected', (p) => captured.push({ n: 'stage-selected', p }));

// ── init 순서: score → progress → (screens/stageselect) — main과 동일 ──
initScore();
initProgress();
initStageSelect();

// ═══ 1. stageselect ↔ progress 읽기 API ═══
console.log('── stageselect ↔ progress (§14.3 읽기 API) ──');
const root = REG.get('screen-stage-select');
const cardEls = [];
const collect = (n) => { for (const c of n.children || []) { if (c._cls && c._cls.has('stage-card')) cardEls.push(c); collect(c); } };
collect(root);
ok(cardEls.length === 5, `.stage-card 5개 생성 (${cardEls.length})`);
ok(cardEls.every((c, i) => c.dataset.stage === String(i)), 'data-stage 0~4 정확');
// 초기: S1만 해금 → S1 카드 클릭 시 emit, S2 카드는 무발행(잠김)
cardEls[0].click();
ok(captured.length === 1 && captured[0].p.stageIndex === 0, 'S1(해금) 카드 클릭 → ui:stage-selected{stageIndex:0}');
captured.length = 0;
cardEls[2].click(); // S3 잠김
ok(captured.length === 0, 'S3(잠김) 카드 클릭 → 무발행(흔들림만)');
ok(cardEls[0].classList.contains('locked') === false && cardEls[1].classList.contains('locked') === true, 'S1 unlocked·S2 locked 클래스');

// ═══ 2. 해금 → stageselect 카드 갱신 (stage:unlocked 구독) ═══
console.log('\n── 해금 캐스케이드 → 카드 갱신 ──');
emit('stage:started', { stageIndex: 0, stageId: 'crystal_valley' });
emit('game:started', {});
// S1 클리어 발행 (score→progress→record-updated/unlocked→stageselect)
emit('enemy:killed', { enemy: { type: 'goblin' } });
emit('wave:cleared', { index: 1, bonus: 25 });
emit('game:won', { kills: 1, livesLeft: 20 });
ok(getUnlockedCount() === 2, `S1 클리어 → unlockedCount 2 (${getUnlockedCount()})`);
ok(cardEls[1].classList.contains('locked') === false, 'S2 카드 잠금 해제됨(stage:unlocked 반영)');
ok(cardEls[0].classList.contains('cleared') === true, 'S1 카드 cleared 표식');
// 최고점 반영 (stage:record-updated → refreshCard). bestEl은 카드 meta의 .stage-best span.
const bestEl0 = cardEls[0].querySelector('.stage-best');
ok(bestEl0 && /최고/.test(bestEl0._text || bestEl0.textContent || ''), `S1 최고점 표시 (${bestEl0 && (bestEl0._text || bestEl0.textContent)})`);

// ═══ 3. screens ↔ score:finalized 렌더 순서 불변식 ═══
// screens의 game:won 핸들러가 renderScorePanel에서 lastFinalized를 읽으려면, score:finalized→record
// 캐스케이드가 game:won 스택 안에서 screens 핸들러보다 먼저 완료돼야 한다. 순서를 이벤트 도달로 직접 관측(DOM 셰임 비의존).
console.log('\n── screens: finalized/record가 game:won 후속 핸들러 전 도달 (순서 불변식) ──');
const { initScreens } = await import('../../src/ui/screens.js');
initScreens();
const victoryEl = REG.get('screen-victory');

// 프로브를 screens 구독 뒤(등록순 후행)에 달아 game:won 처리 시점에 finalized/record 도달 여부만 관측.
const order = [];
on('score:finalized', () => order.push('finalized'));
on('stage:record-updated', () => order.push('record'));
on('game:won', () => order.push('gameWon-probe'));

emit('stage:started', { stageIndex: 1, stageId: 'bramble_fork' });
emit('game:started', {});
emit('enemy:killed', { enemy: { type: 'orc' } });
emit('wave:cleared', { index: 1, bonus: 25 });
order.length = 0;
emit('game:won', { kills: 1, livesLeft: 15 });
ok(order.indexOf('finalized') !== -1 && order.indexOf('finalized') < order.indexOf('gameWon-probe'),
   `score:finalized가 game:won 후속 핸들러 전 도달 (순서: ${order.join('→')})`);
ok(order.indexOf('record') !== -1 && order.indexOf('record') < order.indexOf('gameWon-probe'),
   `stage:record-updated도 game:won 후속 핸들러 전 도달`);
ok(!victoryEl.classList.contains('hidden'), 'game:won → 승리 화면 표시(hidden 해제)');

console.log(fail === 0 ? '\n✔ UI 경계면 독립 검증 전건 통과' : `\n✗ ${fail}건 실패`);
process.exit(fail ? 1 : 0);
