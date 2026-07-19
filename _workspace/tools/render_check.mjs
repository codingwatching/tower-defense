// 실행 중 헤드리스 Chrome(9222)의 게임 페이지에서 실제 tilemap 렌더 경로로
// 5개 레벨 배경을 빌드해 PNG로 저장 — 렌더 기준 잔디 패치워크 검증.
import { writeFileSync } from 'node:fs';

const base = 'http://localhost:9222';
const list = await (await fetch(`${base}/json/list`)).json();
const page = list.find(t => t.type === 'page' && /8234/.test(t.url)) || list.find(t => t.type === 'page');
if (!page) { console.error('페이지 타깃 없음'); process.exit(1); }
console.log('타깃:', page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id; pending.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params }));
});

await send('Runtime.enable');

const harness = `(async () => {
  const grid = await import('/src/map/grid.js');
  const tm = await import('/src/map/tilemap.js');
  const lv = await import('/src/data/levels.js');
  const assets = await import('/src/core/assets.js');
  const probe = assets.get('tile_grass');
  const out = [];
  for (const level of lv.LEVELS) {
    tm.buildBackground(level);
    const c = document.createElement('canvas');
    c.width = grid.COLS * grid.TILE_SIZE;
    c.height = grid.ROWS * grid.TILE_SIZE;
    const ctx = c.getContext('2d');
    tm.drawBackground(ctx);
    out.push({ name: level.nameKo || level.name, tint: level.tint || null, w: c.width, h: c.height, url: c.toDataURL('image/png') });
  }
  return JSON.stringify({ probe: { w: probe && probe.width, tag: probe && (probe.tagName||probe.constructor.name) }, levels: out });
})()`;

const r = await send('Runtime.evaluate', { expression: harness, awaitPromise: true, returnByValue: true });
if (r.result && r.result.exceptionDetails) { console.error('예외:', JSON.stringify(r.result.exceptionDetails)); process.exit(1); }
const val = r.result && r.result.result && r.result.result.value;
if (!val) { console.error('결과 없음:', JSON.stringify(r.result)); process.exit(1); }
const data = JSON.parse(val);
console.log('probe(tile_grass):', JSON.stringify(data.probe));
const WS = '/Users/robin/Downloads/tower-defense/_workspace';
data.levels.forEach((L, i) => {
  const b64 = L.url.replace(/^data:image\/png;base64,/, '');
  const p = `${WS}/03_render_stage${i + 1}.png`;
  writeFileSync(p, Buffer.from(b64, 'base64'));
  console.log(`stage${i + 1} "${L.name}" ${L.w}x${L.h} tint=${JSON.stringify(L.tint)} -> ${p}`);
});
ws.close();
