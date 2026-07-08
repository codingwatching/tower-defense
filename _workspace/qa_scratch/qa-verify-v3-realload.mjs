// QA v3: 실 grid.js/path.js 모듈로 5스테이지 로드 — validateLevel 실행, console.error 포집.
// + 신규 스테이지 decoTiles 체비쇼프≥2 (D11-E 계량) 독립 재계산.
// 실행: node _workspace/qa_scratch/qa-verify-v3-realload.mjs
import { LEVELS } from '../../src/data/levels.js';
import { initGrid, isBuildable, TILE } from '../../src/map/grid.js';
import { initPath, getTotalLength, positionAt } from '../../src/map/path.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail++; };

// console.error 포집
let errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.join(' ')); };

for (const lv of LEVELS) {
  errors = [];
  initGrid(lv);
  initPath(lv);
  console.error = origErr;
  ok(errors.length === 0, `[${lv.id}] initGrid+initPath console.error 0 (${errors.length}${errors.length ? ': ' + errors[0].slice(0,80) : ''})`);
  console.error = (...a) => { errors.push(a.join(' ')); };

  // getTotalLength == waypoint 세그먼트 합 (px)
  let segLen = 0;
  for (let i = 1; i < lv.waypoints.length; i++) {
    const a = lv.waypoints[i - 1], b = lv.waypoints[i];
    segLen += (Math.abs(b.col - a.col) + Math.abs(b.row - a.row)) * lv.tileSize;
  }
  console.error = origErr;
  ok(getTotalLength() === segLen, `[${lv.id}] getTotalLength ${segLen} 일치 (${getTotalLength()})`);
  // positionAt 끝점 done
  const end = positionAt(getTotalLength());
  ok(end.done === true, `[${lv.id}] positionAt(끝) done=true`);
  // 입구 위치 = waypoints[0] 중심
  const start = positionAt(0);
  const exp = { x: lv.waypoints[0].col * 64 + 32, y: lv.waypoints[0].row * 64 + 32 };
  ok(Math.abs(start.x - exp.x) < 0.01 && Math.abs(start.y - exp.y) < 0.01, `[${lv.id}] positionAt(0) == 입구 중심 (${start.x},${start.y})`);
  console.error = (...a) => { errors.push(a.join(' ')); };

  // 킬존/명당 존재: PATH 아닌 GRASS 중 isBuildable true가 최소 몇 개 (전략 가능성)
  console.error = origErr;
  let buildable = 0;
  for (let r = 0; r < 10; r++) for (let c = 0; c < 15; c++) if (isBuildable({ col: c, row: r })) buildable++;
  ok(buildable >= 40, `[${lv.id}] 건설 가능 타일 ${buildable}개 (≥40 전략 여지)`);
  console.error = (...a) => { errors.push(a.join(' ')); };
}
console.error = origErr;

// ── D11-E 체비쇼프≥2: 신규 스테이지 decoTiles가 모든 PATH에서 체비쇼프 거리 ≥2 ──
// (crystal_valley는 §15 회귀로 이미 회차20 검증. 신규 4개 = map-designer 주장 재계량)
console.log('\n── decoTiles 체비쇼프≥2 외곽 한정 (D11-E 계량) ──');
for (const lv of LEVELS) {
  const pathCells = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 15; c++) if (lv.tiles[r][c] === 1) pathCells.push([c, r]);
  let minCheb = Infinity, worstDeco = null;
  for (const d of lv.decoTiles) {
    for (const [pc, pr] of pathCells) {
      const cheb = Math.max(Math.abs(d.col - pc), Math.abs(d.row - pr));
      if (cheb < minCheb) { minCheb = cheb; worstDeco = `(${d.col},${d.row})`; }
    }
  }
  if (lv.decoTiles.length === 0) {
    ok(true, `[${lv.id}] decoTiles 0개 (빈 배열 — 체비쇼프 제약 무관)`);
  } else {
    ok(minCheb >= 2, `[${lv.id}] 모든 deco PATH에서 체비쇼프 ≥2 (최소 ${minCheb} @ ${worstDeco})`);
  }
}

console.log(fail === 0 ? '\n✔ 실 모듈 로드 + 체비쇼프 독립 검증 전건 통과' : `\n✗ ${fail}건 실패`);
process.exit(fail ? 1 : 0);
