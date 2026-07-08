/**
 * ui-dev 자가 검증 (헤드리스): DOM/canvas 최소 shim으로 hud/screens/stageselect를
 * 실제 이벤트 버스로 구동해 ①크래시 없는 init ②점수 캐스케이드 렌더 ③카드 빌드/잠금을 확인.
 * 브라우저 없이 이벤트 순서(§14.2)를 재현한다. (input to a tool — not a report)
 */
// 게임 모듈은 리포 절대경로로 import (임시 prefix에서 실행 대비).
const SRC = 'file:///Users/robin/Downloads/tower-defense/';

// ── 최소 DOM shim (jsdom 미설치 시) ──────────────────────────────────────────
function installShim() {
  const nodes = new Map();

  /** innerHTML 프래그먼트를 스택 파서로 자식 노드 트리로 변환 (span/li/ul/div/h1/h2/p/b + class/id 지원). */
  function parseFragment(html, parent) {
    const stack = [parent];
    const re = /<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*?)\s*(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(html))) {
      const [, closing, tag, attrs, selfClose, text] = m;
      const top = stack[stack.length - 1];
      if (text !== undefined) {
        const t = text.replace(/\s+/g, ' ');
        if (t.trim()) top.textContent = (top.textContent || '') + t;
        continue;
      }
      if (closing) { if (stack.length > 1) stack.pop(); continue; }
      const child = mk(tag);
      const cm = /class\s*=\s*"([^"]*)"/.exec(attrs);
      if (cm) { child.className = cm[1]; cm[1].split(/\s+/).forEach((c) => c && child.classList.add(c)); }
      const im = /id\s*=\s*"([^"]*)"/.exec(attrs);
      if (im) { child.id = im[1]; nodes.set(im[1], child); }
      top.appendChild(child);
      if (!selfClose && !/^(br|img|input|hr)$/i.test(tag)) stack.push(child);
    }
  }

  function mk(tag) {
    const el = {
      tagName: (tag || 'div').toUpperCase(),
      id: '', type: '', textContent: '',
      _innerHTML: '', _className: '',
      dataset: {}, style: {}, children: [], parentNode: null,
      _attrs: {}, _listeners: {},
      classList: {
        _s: new Set(),
        add(...c) { c.forEach((x) => this._s.add(x)); },
        remove(...c) { c.forEach((x) => this._s.delete(x)); },
        toggle(c, f) { const on = f === undefined ? !this._s.has(c) : f; on ? this._s.add(c) : this._s.delete(c); return on; },
        contains(c) { return this._s.has(c); },
      },
      // 실 DOM처럼 className↔classList 동기화 (shim 정확성).
      set className(v) { el._className = String(v); el.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
      get className() { return [...el.classList._s].join(' '); },
      set innerHTML(html) {
        el.children.length = 0;
        el.textContent = '';
        el._innerHTML = String(html);
        parseFragment(String(html), el);
      },
      get innerHTML() {
        // 테스트 assert가 카드/패널 innerHTML에 정규식을 걸므로, 파싱된 텍스트를 합쳐 근사 재구성.
        const collect = (n) => n.children.reduce((s, c) => s + (c.className ? ` ${c.className} ` : '') + (c.textContent || '') + collect(c), n.textContent || '');
        return el._innerHTML || collect(el);
      },
      appendChild(n) { n.parentNode = el; el.children.push(n); if (n.id) nodes.set(n.id, n); return n; },
      append(...ns) { ns.forEach((n) => el.appendChild(n)); },
      insertBefore(n, ref) { n.parentNode = el; el.children.push(n); if (n.id) nodes.set(n.id, n); return n; },
      insertAdjacentElement() {},
      setAttribute(k, v) { el._attrs[k] = String(v); if (k === 'id') { el.id = String(v); nodes.set(String(v), el); } },
      getAttribute(k) { return el._attrs[k]; },
      addEventListener(t, fn) { (el._listeners[t] || (el._listeners[t] = [])).push(fn); },
      querySelector(sel) {
        const find = (n) => {
          for (const c of n.children) {
            if (sel[0] === '#' && c.id === sel.slice(1)) return c;
            if (sel[0] === '.' && c.classList.contains(sel.slice(1))) return c;
            const deep = find(c);
            if (deep) return deep;
          }
          return null;
        };
        return find(el);
      },
      getContext() {
        return {
          setTransform() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {},
          set fillStyle(v) {}, set globalCompositeOperation(v) {}, set globalAlpha(v) {},
        };
      },
      get offsetWidth() { return 0; },
      get nextSibling() { const i = el.parentNode ? el.parentNode.children.indexOf(el) : -1; return el.parentNode && i >= 0 ? el.parentNode.children[i + 1] || null : null; },
      click() { (el._listeners.click || []).forEach((fn) => fn({})); },
    };
    return el;
  }
  const doc = {
    createElement: (t) => mk(t),
    getElementById: (id) => nodes.get(id) || null,
    body: mk('body'),
  };
  // 계약 §7 필수 노드 시드 (architect가 추가하기 전 상태를 흉내 — hud-score/screen-stage-select는 일부러 미시드)
  for (const id of ['hud', 'hud-gold', 'hud-lives', 'hud-wave', 'hud-countdown',
    'btn-wave-start', 'btn-speed', 'btn-mute', 'stage',
    'screen-title', 'screen-victory', 'screen-defeat',
    'btn-start', 'btn-restart-victory', 'btn-restart-defeat']) {
    const n = mk('div'); n.id = id; nodes.set(id, n); doc.body.appendChild(n);
  }
  globalThis.document = doc;
  globalThis.window = { devicePixelRatio: 2 };
}

try {
  const { JSDOM } = await import('jsdom'); // 미설치면 catch로 내장 shim 폴백
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  // JSDOM엔 canvas 2d가 없을 수 있음 → getContext 폴백
  const origGet = dom.window.HTMLCanvasElement.prototype.getContext;
  dom.window.HTMLCanvasElement.prototype.getContext = function (...a) {
    const r = origGet ? origGet.apply(this, a) : null;
    return r || { setTransform() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, fillStyle: '', globalCompositeOperation: '', globalAlpha: 1 };
  };
  // §7 노드 시드
  for (const id of ['hud', 'hud-gold', 'hud-lives', 'hud-wave', 'hud-countdown',
    'btn-wave-start', 'btn-speed', 'btn-mute', 'stage',
    'screen-title', 'screen-victory', 'screen-defeat',
    'btn-start', 'btn-restart-victory', 'btn-restart-defeat']) {
    const n = document.createElement('div'); n.id = id; document.body.appendChild(n);
  }
  console.log('[shim] jsdom 사용');
} catch {
  installShim();
  console.log('[shim] 내장 최소 shim 사용 (jsdom 미설치)');
}

const { on, emit } = await import(SRC + 'src/core/events.js');
const { initHud } = await import(SRC + 'src/ui/hud.js');
const { initScreens } = await import(SRC + 'src/ui/screens.js');
const { initStageSelect } = await import(SRC + 'src/ui/stageselect.js');

// economy 읽기 API가 hud game:started에서 호출됨 — 실제 모듈 사용
const econ = await import(SRC + 'src/systems/economy.js');
const score = await import(SRC + 'src/systems/score.js');
const progress = await import(SRC + 'src/systems/progress.js');

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

// localStorage shim (progress/storage용)
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

// 부트스트랩 순서 재현: systems(step3) → ui(step4)
econ.initEconomy();
score.initScore();
progress.initProgress();
initHud();
initScreens();
initStageSelect();
ok(true, 'init 6종 크래시 없음');

// #hud-score / #screen-stage-select 자가 생성 확인 (architect 미반영 상태)
ok(!!document.getElementById('hud-score'), '#hud-score 자가 생성(계약 미반영 시 폴백)');
ok(!!document.getElementById('screen-stage-select'), '#screen-stage-select 자가 생성');

// 스테이지 카드 5개 빌드
const grid = document.getElementById('screen-stage-select').querySelector('.stage-grid');
ok(grid && grid.children.length === 5, `스테이지 카드 5개 생성 (실제=${grid ? grid.children.length : 0})`);

// 잠금 상태: 초기 unlockedCount=1 → 카드0만 해금
const card0 = grid.children[0];
const card1 = grid.children[1];
ok(!card0.classList.contains('locked'), '카드0 해금(잠금 아님)');
ok(card1.classList.contains('locked'), '카드1 잠김');

// 카드1 클릭 → 잠김이므로 ui:stage-selected 미발행
let selected = null;
on('ui:stage-selected', (p) => { selected = p; });
card1.click();
ok(selected === null, '잠긴 카드1 클릭 → ui:stage-selected 미발행');
card0.click();
ok(selected && selected.stageIndex === 0, '해금 카드0 클릭 → ui:stage-selected {stageIndex:0}');

// ── 점수 캐스케이드(§14.2): 스테이지0 진입 → 처치/웨이브 → 승리 → 신기록 ──
emit('stage:started', { stageIndex: 0, stageId: 'crystal_valley' });
emit('game:started', {});
const scoreValEl = document.getElementById('hud-score').querySelector('.hud-value');
ok(scoreValEl.textContent === '0', `game:started 시 점수 0 리셋 (=${scoreValEl.textContent})`);

// 기대값은 실제 SCORING에서 계산 — wave-balancer 튜닝에도 유효(하드코딩 금지).
const { SCORING } = await import(SRC + 'src/data/scoring.js');
const orcPts = SCORING.killPoints.orc;
const wave1 = Math.floor(SCORING.waveClearBonus * (1 + (1 - 1) * (SCORING.waveScale - 1)));
emit('enemy:killed', { enemy: { type: 'orc' } });
emit('wave:cleared', { index: 1 });
const expLive = orcPts + wave1;
ok(scoreValEl.textContent === String(expLive), `실시간 점수 가산 처치${orcPts}+웨이브${wave1}=${expLive} (=${scoreValEl.textContent})`);

// 승리 — main이 하는 판정을 흉내: game:won 발행 (score→progress→screens 순 캐스케이드)
const life = 4 * SCORING.lifeBonusPerLife;
const total = expLive + life; // total = kill+wave+life
emit('game:won', { kills: 1, livesLeft: 4 });
const vPanel = document.getElementById('victory-score');
ok(new RegExp(String(total)).test(vPanel.innerHTML), `승리 점수 분해 total ${total} 렌더 (life 4×${SCORING.lifeBonusPerLife}=${life} 포함)`);
ok(/신기록/.test(vPanel.innerHTML), '첫 클리어 신기록! 연출 표시');
ok(document.getElementById('screen-victory').classList.contains('hidden') === false, '승리 화면 노출');

// 해금 반영: 승리로 unlockedCount 2 → 다음 스테이지 버튼 노출
const nextBtn = document.getElementById('btn-next-victory');
ok(nextBtn && !nextBtn.classList.contains('hidden'), '승리 후 다음 스테이지 버튼 노출(해금됨)');
ok(progress.getUnlockedCount() === 2, `해금 카운트 2로 증가 (=${progress.getUnlockedCount()})`);

// 스테이지 선택 카드1 잠금 해제 반영 (stage:unlocked 구독)
ok(!grid.children[1].classList.contains('locked'), '스테이지1 카드 잠금 해제 반영');
ok(grid.children[0].classList.contains('cleared'), '스테이지0 카드 클리어 표식');

// 패배 경로: 재진입 후 라이프0 → game:over, life보너스 0
emit('stage:started', { stageIndex: 0, stageId: 'crystal_valley' });
emit('game:started', {});
emit('enemy:killed', { enemy: { type: 'goblin' } }); // 5
emit('game:over', { waveReached: 1, kills: 1 });
const dPanel = document.getElementById('defeat-score');
ok(/처치/.test(dPanel.innerHTML) && /패배 0/.test(dPanel.innerHTML), '패배 화면 점수 분해(라이프 0) 렌더');

console.log(fail === 0 ? '\n✅ 전체 통과' : `\n❌ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
