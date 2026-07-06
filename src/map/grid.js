/**
 * @module map/grid (map-designer)
 * 좌표 변환·타일 조회·점유 원장의 단일 소유자. 계약 §2, §8.
 * 그리드: 15열 × 10행, 타일 64px → 필드 960×640 (GDD 확정값 — 기본값 48px 아님).
 * 다른 모듈은 자체 변환식을 만들지 말고 반드시 gridToPx/pxToGrid를 사용한다.
 */

/** 타일 한 변 px. */
export const TILE_SIZE = 64;
/** 그리드 열 수. */
export const COLS = 15;
/** 그리드 행 수. */
export const ROWS = 10;

/** 타일 종류. LEVEL.tiles의 값 도메인. */
export const TILE = { GRASS: 0, PATH: 1, DECO: 2 };

/** @type {number[][] | null} initGrid로 주입되는 LEVEL.tiles */
let tiles = null;
/** 점유 원장 — 'col,row' 키 집합. grid가 단일 소유. */
const occupied = new Set();

/** @param {{col: number, row: number}} cell */
const cellKey = (cell) => cell.col + ',' + cell.row;

/**
 * 레벨 데이터로 초기화 (타일 조회·점유 원장 준비).
 * 데이터 오류는 조용히 넘기지 않고 콘솔 에러로 명시한다.
 * @param {import('../data/levels.js').LevelDef} level
 */
export function initGrid(level) {
  tiles = level.tiles;
  occupied.clear();
  if (level.cols !== COLS || level.rows !== ROWS || level.tileSize !== TILE_SIZE) {
    console.error(
      `[map/grid] LEVEL 규격 불일치: (${level.cols}×${level.rows}, ${level.tileSize}px) — ` +
      `계약 §2 확정값은 (${COLS}×${ROWS}, ${TILE_SIZE}px)`
    );
  }
  if (!Array.isArray(tiles) || tiles.length !== ROWS || tiles.some((r) => !Array.isArray(r) || r.length !== COLS)) {
    console.error(`[map/grid] LEVEL.tiles 차원 오류: number[${ROWS}][${COLS}](행 우선)이어야 함`);
  }
}

/**
 * 그리드 → 픽셀 (타일 중심).
 * @param {{col: number, row: number}} cell
 * @returns {{x: number, y: number}} x = col*64+32, y = row*64+32
 */
export function gridToPx(cell) {
  return {
    x: cell.col * TILE_SIZE + TILE_SIZE / 2,
    y: cell.row * TILE_SIZE + TILE_SIZE / 2
  };
}

/**
 * 픽셀 → 그리드.
 * @param {{x: number, y: number}} pt
 * @returns {{col: number, row: number}} col = floor(x/64), row = floor(y/64)
 */
export function pxToGrid(pt) {
  return {
    col: Math.floor(pt.x / TILE_SIZE),
    row: Math.floor(pt.y / TILE_SIZE)
  };
}

/**
 * @param {{col: number, row: number}} cell
 * @returns {boolean} 0<=col<15 && 0<=row<10
 */
export function inBounds(cell) {
  return cell.col >= 0 && cell.col < COLS && cell.row >= 0 && cell.row < ROWS;
}

/**
 * @param {{col: number, row: number}} cell
 * @returns {number} TILE enum 값. 범위 밖은 TILE.DECO 취급(건설 불가)
 */
export function tileAt(cell) {
  if (!tiles || !inBounds(cell)) return TILE.DECO;
  return tiles[cell.row][cell.col];
}

/**
 * 건설 가능 여부: inBounds && GRASS && 미점유.
 * @param {{col: number, row: number}} cell
 * @returns {boolean}
 */
export function isBuildable(cell) {
  return inBounds(cell) && tileAt(cell) === TILE.GRASS && !occupied.has(cellKey(cell));
}

/**
 * 타워 배치 시 점유 표시. systems/combat만 호출.
 * @param {{col: number, row: number}} cell
 */
export function occupy(cell) {
  occupied.add(cellKey(cell));
}

/**
 * 타워 판매 시 점유 해제. systems/combat만 호출.
 * @param {{col: number, row: number}} cell
 */
export function release(cell) {
  occupied.delete(cellKey(cell));
}
