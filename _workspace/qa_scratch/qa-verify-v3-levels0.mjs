// QA v3 회귀: LEVELS[0] === v2 crystal_valley 문자 단위 불변 (계약 §15 AC-41)
// 실행: node _workspace/qa_scratch/qa-verify-v3-levels0.mjs
import { LEVELS, LEVEL } from '../../src/data/levels.js';
import { LEVEL as V2 } from './levels_v2_baseline.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail++; };

// LEVELS 배열 자체
ok(Array.isArray(LEVELS), 'LEVELS는 배열');
ok(LEVELS.length === 5, `LEVELS.length === 5 (실제 ${LEVELS && LEVELS.length})`);
ok(LEVEL === LEVELS[0], 'LEVEL 별칭 === LEVELS[0] (동일 객체 참조)');

const s0 = LEVELS[0];
// 핵심 3필드 JSON 직렬화 비교 (문자 단위)
ok(JSON.stringify(s0.waypoints) === JSON.stringify(V2.waypoints),
   'LEVELS[0].waypoints 문자 단위 == v2');
ok(JSON.stringify(s0.tiles) === JSON.stringify(V2.tiles),
   'LEVELS[0].tiles 문자 단위 == v2');
ok(JSON.stringify(s0.decoTiles) === JSON.stringify(V2.decoTiles),
   'LEVELS[0].decoTiles 문자 단위 == v2');
// 메타 필드
ok(s0.id === 'crystal_valley', `LEVELS[0].id === 'crystal_valley' (${s0.id})`);
ok(s0.cols === 15 && s0.rows === 10 && s0.tileSize === 64, '규격 15x10x64');
ok(JSON.stringify(s0.entrance) === JSON.stringify(V2.entrance), 'entrance == v2');
ok(JSON.stringify(s0.goal) === JSON.stringify(V2.goal), 'goal == v2');

// §13 D11 불변량 재확인 (LEVELS[0]에도 적용)
const WP = '[[0,2],[4,2],[4,7],[8,7],[8,2],[12,2],[12,5],[14,5]]';
ok(JSON.stringify(s0.waypoints.map(w => [w.col, w.row])) === WP, 'waypoints 8점 §13 명시 좌표');
// PATH 집합 28
let pathCount = 0;
for (const row of s0.tiles) for (const t of row) if (t === 1) pathCount++;
ok(pathCount === 28, `PATH 타일 28개 (${pathCount})`);
// 킬존 GRASS 유지: A col5~7×row3~6, B col9~11×row3~4, (13,4)
let killzoneOk = true;
for (let c = 5; c <= 7; c++) for (let r = 3; r <= 6; r++) if (s0.tiles[r][c] !== 0) killzoneOk = false;
for (let c = 9; c <= 11; c++) for (let r = 3; r <= 4; r++) if (s0.tiles[r][c] !== 0) killzoneOk = false;
if (s0.tiles[4][13] !== 0) killzoneOk = false;
ok(killzoneOk, '킬존 A/B/(13,4) 전부 GRASS');

// tint: LEVELS[0]은 null(대낮 원색) 이어야 함 (§4.7 — 게임플레이 무관이나 스테이지1 원색 유지)
ok(s0.tint === null || s0.tint === undefined, `LEVELS[0].tint null/미기입 (${JSON.stringify(s0.tint)})`);

console.log(fail === 0 ? '\n✔ LEVELS[0] 회귀 전건 통과' : `\n✗ ${fail}건 실패`);
process.exit(fail ? 1 : 0);
