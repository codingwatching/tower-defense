/**
 * @module map/tilemap (map-designer)
 * 배경 레이어(레이어 10) — 타일 + 장식 + 도착 수정 + 동굴 입구.
 * 오프스크린 캔버스에 1회 캐시 후 매 프레임 복사 (td-code-standards 렌더 레이어 표).
 * get(key)는 항상 drawable을 반환하므로(폴백 계약) 여기서는 폴백을 신경 쓰지 않는다.
 *
 * v2 (계약 §4.5-v2, §13 D11 — 데이터·렌더만으로 시각 개선):
 * - 잔디: (col,row) 결정적 해시로 tile_grass / _clover / _flower 혼합 — 매 로드 동일 결과
 * - 길: tiles의 PATH 인접 관계로 직선 h/v·코너 ne/nw/se/sw 판별. 판별 불가 시 무방향
 *   tile_path 폴백. 좌우 필드 밖은 열림 취급 (입구·도착이 가장자리 너머로 이어지는 연출)
 * - 장식: LEVEL.decoTiles의 key로 렌더, 목록에 없는 DECO는 deco_rock (v1 하위 호환)
 */

import { get } from '../core/assets.js';
import { TILE, TILE_SIZE, COLS, ROWS, gridToPx } from './grid.js';

/** 입구·도착 오브젝트 드로우 크기 px (§5: 96×96, 타일 중심 기준) */
const OBJECT_SIZE = 96;

/** §5.4 장식 키 허용 집합 — decoTiles 검증용 */
const DECO_KEYS = new Set(['deco_rock', 'deco_bush', 'deco_flowers', 'deco_crystal_shard']);

/** 잔디 변형 비율: 민무늬 60% / 클로버 25% / 들꽃 15% */
const GRASS_VARIANTS = [
  { key: 'tile_grass', below: 60 },
  { key: 'tile_grass_clover', below: 85 },
  { key: 'tile_grass_flower', below: 100 }
];

/** @type {HTMLCanvasElement | null} 배경 캐시 */
let cache = null;

/**
 * (col,row) → [0,100) 결정적 해시. Math.imul로 32비트 정밀도 고정 —
 * 플랫폼·로드 시점과 무관하게 항상 같은 값 (§4.5-v2 "매 로드 동일 결과").
 * @param {number} col @param {number} row
 * @returns {number} 0~99
 */
function hash2(col, row) {
  let h = (Math.imul(col, 374761393) + Math.imul(row, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 100;
}

/**
 * 잔디 타일의 변형 키. 순수 함수 — 결정성 테스트에 사용.
 * @param {number} col @param {number} row
 * @returns {'tile_grass' | 'tile_grass_clover' | 'tile_grass_flower'}
 */
export function grassTileKey(col, row) {
  const h = hash2(col, row);
  for (const v of GRASS_VARIANTS) {
    if (h < v.below) return v.key;
  }
  return 'tile_grass';
}

/**
 * PATH 타일의 방향 키 — 4방 인접 PATH로 판별. 순수 함수.
 * 코너 명명 = 길이 열린 두 변 (§5.4). 막다른 길·교차 등 판별 불가는 tile_path 폴백.
 * @param {import('../data/levels.js').LevelDef} level
 * @param {number} col @param {number} row
 * @returns {string} tile_path_{h|v|ne|nw|se|sw} 또는 tile_path
 */
export function pathTileKey(level, col, row) {
  const open = (c, r) => {
    if (c < 0 || c >= COLS) return true; // 좌우 필드 밖 = 경로 연장 (입구·도착 가장자리)
    if (r < 0 || r >= ROWS) return false;
    return level.tiles[r][c] === TILE.PATH;
  };
  const n = open(col, row - 1);
  const s = open(col, row + 1);
  const e = open(col + 1, row);
  const w = open(col - 1, row);
  if (e && w && !n && !s) return 'tile_path_h';
  if (n && s && !e && !w) return 'tile_path_v';
  if (n && e && !s && !w) return 'tile_path_ne';
  if (n && w && !s && !e) return 'tile_path_nw';
  if (s && e && !n && !w) return 'tile_path_se';
  if (s && w && !n && !e) return 'tile_path_sw';
  return 'tile_path';
}

/**
 * decoTiles → 'col,row' → key 매핑. 데이터 오류는 콘솔 에러로 명시 (조용한 실패 금지).
 * @param {import('../data/levels.js').LevelDef} level
 * @returns {Map<string, string>}
 */
function buildDecoKeyMap(level) {
  const map = new Map();
  const errs = [];
  for (const d of level.decoTiles || []) {
    const tile = level.tiles[d.row] && level.tiles[d.row][d.col];
    if (tile !== TILE.DECO) {
      errs.push(`decoTiles (${d.col},${d.row})가 가리키는 타일이 DECO가 아님 (값: ${tile})`);
      continue;
    }
    if (!DECO_KEYS.has(d.key)) {
      errs.push(`decoTiles (${d.col},${d.row})의 key '${d.key}'는 §5.4 deco_* 4종이 아님`);
      continue;
    }
    map.set(d.col + ',' + d.row, d.key);
  }
  if (errs.length > 0) {
    console.error('[map/tilemap] LEVEL.decoTiles 데이터 오류 ' + errs.length + '건:\n- ' + errs.join('\n- '));
  }
  return map;
}

/**
 * 배경 캐시 생성. loadAssets 완료 후 main이 1회 호출.
 * @param {import('../data/levels.js').LevelDef} level
 */
export function buildBackground(level) {
  cache = document.createElement('canvas');
  cache.width = COLS * TILE_SIZE;
  cache.height = ROWS * TILE_SIZE;
  const ctx = cache.getContext('2d');

  const decoKeys = buildDecoKeyMap(level);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;
      // 바닥은 항상 변형 잔디 — 길 코너·장식 PNG의 투명 영역 밑에 비친다
      ctx.drawImage(get(grassTileKey(col, row)), x, y, TILE_SIZE, TILE_SIZE);
      const t = level.tiles[row][col];
      if (t === TILE.PATH) {
        ctx.drawImage(get(pathTileKey(level, col, row)), x, y, TILE_SIZE, TILE_SIZE);
      } else if (t === TILE.DECO) {
        ctx.drawImage(get(decoKeys.get(col + ',' + row) || 'deco_rock'), x, y, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // 은은한 그리드 라인 — 건설 타일 경계 가독용 (배치 하이라이트는 ui 레이어 40 소관)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let col = 1; col < COLS; col++) {
    ctx.moveTo(col * TILE_SIZE + 0.5, 0);
    ctx.lineTo(col * TILE_SIZE + 0.5, ROWS * TILE_SIZE);
  }
  for (let row = 1; row < ROWS; row++) {
    ctx.moveTo(0, row * TILE_SIZE + 0.5);
    ctx.lineTo(COLS * TILE_SIZE, row * TILE_SIZE + 0.5);
  }
  ctx.stroke();

  const entrancePx = gridToPx(level.entrance);
  const goalPx = gridToPx(level.goal);
  ctx.drawImage(
    get('entrance_cave'),
    entrancePx.x - OBJECT_SIZE / 2, entrancePx.y - OBJECT_SIZE / 2,
    OBJECT_SIZE, OBJECT_SIZE
  );
  ctx.drawImage(
    get('goal_crystal'),
    goalPx.x - OBJECT_SIZE / 2, goalPx.y - OBJECT_SIZE / 2,
    OBJECT_SIZE, OBJECT_SIZE
  );
}

/**
 * 배경 그리기. renderer 레이어 10으로 등록될 drawFn.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawBackground(ctx) {
  if (!cache) return;
  ctx.drawImage(cache, 0, 0);
}
