// QA v3 독립 검증: LEVELS 5스테이지 정합성·기하 (§4.5·§4.7·§13). path.js validateLevel 불신 — 전부 재계산.
// 실행: node _workspace/qa_scratch/qa-verify-v3-all-levels.mjs
import { LEVELS } from '../../src/data/levels.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail++; };

const DECO_KEYS = new Set(['deco_rock', 'deco_bush', 'deco_flowers', 'deco_crystal_shard']);
const GRASS = 0, PATH = 1, DECO = 2;
const EXPECTED = {
  crystal_valley: { pathLen: 1728, pathCount: 28, grass: 113 },
  bramble_fork:   { pathLen: 2560, pathCount: 41, grass: 102 },
  twin_snake:     { pathLen: 2752, pathCount: 44, grass: 100 },
  narrow_gate:    { pathLen: 3584, pathCount: 57, grass: 89 },
  last_ridge:     { pathLen: 4480, pathCount: 71, grass: 79 },
};
const ORDER = ['crystal_valley', 'bramble_fork', 'twin_snake', 'narrow_gate', 'last_ridge'];

ok(LEVELS.length === 5, `LEVELS.length 5 (${LEVELS.length})`);
ok(LEVELS.map((l) => l.id).join(',') === ORDER.join(','), `id 순서 == ${ORDER.join(',')}`);

const lengths = [], grasses = [];

for (const lv of LEVELS) {
  console.log(`\n── [${lv.id}] ${lv.nameKo} ──`);
  const { tiles, waypoints } = lv;

  // 규격
  ok(lv.cols === 15 && lv.rows === 10 && lv.tileSize === 64, '규격 15x10x64');
  ok(Array.isArray(tiles) && tiles.length === 10 && tiles.every((r) => r.length === 15), 'tiles 10×15');
  // 값 도메인
  let domainOk = true;
  for (const r of tiles) for (const t of r) if (t !== 0 && t !== 1 && t !== 2) domainOk = false;
  ok(domainOk, 'tiles 값 도메인 {0,1,2}');

  // waypoints 그리드 내 + 축 정렬 (각 세그먼트가 col 또는 row 하나만 변경)
  let inBounds = true, axisAligned = true;
  for (const w of waypoints) {
    if (w.col < 0 || w.col > 14 || w.row < 0 || w.row > 9) inBounds = false;
  }
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1], b = waypoints[i];
    const dc = a.col !== b.col, dr = a.row !== b.row;
    if (dc && dr) axisAligned = false; // 대각 이동 금지
    if (!dc && !dr) axisAligned = false; // 정지(중복점) 금지
  }
  ok(inBounds, 'waypoints 전부 그리드 내 (col 0~14, row 0~9)');
  ok(axisAligned, 'waypoints 세그먼트 전부 축 정렬(대각·중복 없음)');

  // 입구/도착: 좌·우 가장자리, entrance==wp[0], goal==wp[last]
  ok(waypoints[0].col === 0, `입구 col 0 (좌측) (${waypoints[0].col})`);
  ok(waypoints.at(-1).col === 14, `도착 col 14 (우측) (${waypoints.at(-1).col})`);
  ok(lv.entrance.col === waypoints[0].col && lv.entrance.row === waypoints[0].row, 'entrance == waypoints[0]');
  ok(lv.goal.col === waypoints.at(-1).col && lv.goal.row === waypoints.at(-1).row, 'goal == waypoints[last]');

  // 경로 통과 타일 집합 재계산 (세그먼트 보간) + 경로 길이(px)
  const traversed = new Set();
  let lenTiles = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const w = waypoints[i];
    traversed.add(`${w.col},${w.row}`);
    if (i === 0) continue;
    const a = waypoints[i - 1], b = w;
    if (a.col === b.col) {
      const step = b.row > a.row ? 1 : -1;
      for (let r = a.row; r !== b.row; r += step) traversed.add(`${a.col},${r}`);
      lenTiles += Math.abs(b.row - a.row);
    } else {
      const step = b.col > a.col ? 1 : -1;
      for (let c = a.col; c !== b.col; c += step) traversed.add(`${c},${a.row}`);
      lenTiles += Math.abs(b.col - a.col);
    }
  }
  const pathLen = lenTiles * lv.tileSize;

  // PATH 집합 (tiles에서)
  const pathSet = new Set();
  for (let r = 0; r < 10; r++) for (let c = 0; c < 15; c++) if (tiles[r][c] === PATH) pathSet.add(`${c},${r}`);

  // 양방향 차집합 0 (정합성 구속 §4.5 — 자체 재계산)
  const missingInTiles = [...traversed].filter((k) => !pathSet.has(k));
  const extraInTiles = [...pathSet].filter((k) => !traversed.has(k));
  ok(missingInTiles.length === 0, `waypoints 통과 타일 전부 PATH (누락 ${missingInTiles.length}: ${missingInTiles.slice(0,5)})`);
  ok(extraInTiles.length === 0, `PATH 타일 전부 waypoints 경유 (잉여 ${extraInTiles.length}: ${extraInTiles.slice(0,5)})`);

  // 기하 수치 대조 (map-designer 주장)
  const exp = EXPECTED[lv.id];
  ok(pathLen === exp.pathLen, `경로 길이 ${exp.pathLen}px (재계산 ${pathLen})`);
  ok(pathSet.size === exp.pathCount, `PATH 타일 ${exp.pathCount}개 (실제 ${pathSet.size})`);
  const grassCount = tiles.flat().filter((t) => t === GRASS).length;
  ok(grassCount === exp.grass, `GRASS ${exp.grass}개 (실제 ${grassCount})`);
  lengths.push(pathLen); grasses.push(grassCount);

  // decoTiles 스키마
  ok(Array.isArray(lv.decoTiles), 'decoTiles 배열');
  let decoOk = true, decoPointsDeco = true, decoNoPathCollision = true;
  for (const d of lv.decoTiles) {
    if (!DECO_KEYS.has(d.key)) { decoOk = false; console.log(`    비허용 key: ${d.key}`); }
    if (tiles[d.row]?.[d.col] !== DECO) { decoPointsDeco = false; console.log(`    (${d.col},${d.row}) tiles=${tiles[d.row]?.[d.col]} != DECO`); }
    if (tiles[d.row]?.[d.col] === PATH) decoNoPathCollision = false;
  }
  ok(decoOk, 'decoTiles key ∈ deco_* 4종');
  ok(decoPointsDeco, 'decoTiles 항목 전부 tiles=DECO 지시');
  ok(decoNoPathCollision, 'decoTiles PATH 충돌 0 (경로 위 장식 없음)');

  // DECO 타일 ∩ PATH == ∅ (타일값 상호배타 — 데이터 무결)
  let decoPathDisjoint = true;
  for (let r = 0; r < 10; r++) for (let c = 0; c < 15; c++) {
    if (tiles[r][c] === DECO && pathSet.has(`${c},${r}`)) decoPathDisjoint = false;
  }
  ok(decoPathDisjoint, 'DECO ∩ PATH = ∅');

  // tint 형식 (§4.7): null 또는 {color:'#RRGGBB', alpha:0~0.5}
  const t = lv.tint;
  const tintOk = t === null || t === undefined ||
    (typeof t === 'object' && /^#[0-9a-fA-F]{6}$/.test(t.color) && typeof t.alpha === 'number' && t.alpha >= 0 && t.alpha <= 0.5);
  ok(tintOk, `tint 형식 (${JSON.stringify(t)})`);
}

// 난이도 단조성 (§4.7 — 경로 길이 증가, GRASS 밀도 감소)
console.log('\n── 난이도 단조성 (§4.7·§13.1) ──');
let lenMono = true, grassMono = true;
for (let i = 1; i < lengths.length; i++) {
  if (lengths[i] <= lengths[i - 1]) lenMono = false;
  if (grasses[i] >= grasses[i - 1]) grassMono = false;
}
ok(lenMono, `경로 길이 단조 증가: ${lengths.join(' < ')}`);
ok(grassMono, `GRASS 밀도 단조 감소: ${grasses.join(' > ')}`);

console.log(fail === 0 ? '\n✔ LEVELS 5스테이지 정합성·기하 독립 검증 전건 통과' : `\n✗ ${fail}건 실패`);
process.exit(fail ? 1 : 0);
