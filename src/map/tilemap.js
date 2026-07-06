/**
 * @module map/tilemap (map-designer)
 * 배경 레이어(레이어 10) — 타일 + 장식 + 도착 수정 + 동굴 입구.
 * 오프스크린 캔버스에 1회 캐시 후 매 프레임 복사 (td-code-standards 렌더 레이어 표).
 * 에셋 키: tile_grass, tile_path, deco_rock, goal_crystal, entrance_cave (§5).
 * get(key)는 항상 drawable을 반환하므로(폴백 계약) 여기서는 폴백을 신경 쓰지 않는다.
 */

import { get } from '../core/assets.js';
import { TILE, TILE_SIZE, COLS, ROWS, gridToPx } from './grid.js';

/** 입구·도착 오브젝트 드로우 크기 px (§5: 96×96, 타일 중심 기준) */
const OBJECT_SIZE = 96;

/** @type {HTMLCanvasElement | null} 배경 캐시 */
let cache = null;

/**
 * 배경 캐시 생성. loadAssets 완료 후 main이 1회 호출.
 * @param {import('../data/levels.js').LevelDef} level
 */
export function buildBackground(level) {
  cache = document.createElement('canvas');
  cache.width = COLS * TILE_SIZE;
  cache.height = ROWS * TILE_SIZE;
  const ctx = cache.getContext('2d');

  const grass = get('tile_grass');
  const path = get('tile_path');
  const rock = get('deco_rock');

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;
      ctx.drawImage(grass, x, y, TILE_SIZE, TILE_SIZE);
      const t = level.tiles[row][col];
      if (t === TILE.PATH) ctx.drawImage(path, x, y, TILE_SIZE, TILE_SIZE);
      else if (t === TILE.DECO) ctx.drawImage(rock, x, y, TILE_SIZE, TILE_SIZE);
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
