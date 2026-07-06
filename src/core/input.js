/**
 * @module core/input (engine-dev)
 * 원시 마우스/키 입력을 캔버스 좌표로 변환해 이벤트로 발행. 계약 §3.8.
 *
 * 발행:
 *   input:click  {x, y, col, row, button}  — 캔버스 내 클릭 (button: 0=좌)
 *   input:move   {x, y, col, row}          — 캔버스 내 이동
 *   input:cancel {}                        — 우클릭(contextmenu 억제) 또는 ESC
 *
 * x,y = 캔버스 픽셀 좌표 (CSS 스케일 보정 포함) / col,row = map/grid.pxToGrid 결과.
 * 캔버스 밖 클릭은 발행하지 않는다 (AC-22: 화면 밖 클릭 크래시 금지).
 *
 * grid.pxToGrid가 아직 미구현(스켈레톤)인 동안은 계약 §2의 동일 공식
 * (floor(px / TILE_SIZE))으로 폴백한다 — grid.js 구현이 착지하면 자동으로 그쪽을 쓴다.
 */

import { emit } from './events.js';
import { pxToGrid, TILE_SIZE } from '../map/grid.js';

let bound = false;

/**
 * 입력 리스너 등록.
 * @param {HTMLCanvasElement} canvas - #game-canvas
 */
export function initInput(canvas) {
  if (!canvas || typeof canvas.addEventListener !== 'function') {
    throw new Error('[input] initInput: 유효한 캔버스가 아님');
  }
  if (bound) {
    console.warn('[input] initInput 중복 호출 — 무시');
    return;
  }
  bound = true;

  canvas.addEventListener('click', (e) => {
    const pt = toCanvasPoint(canvas, e);
    if (!pt) return;
    const cell = toCell(pt);
    emit('input:click', { x: pt.x, y: pt.y, col: cell.col, row: cell.row, button: e.button });
  });

  canvas.addEventListener('mousemove', (e) => {
    const pt = toCanvasPoint(canvas, e);
    if (!pt) return;
    const cell = toCell(pt);
    emit('input:move', { x: pt.x, y: pt.y, col: cell.col, row: cell.row });
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    emit('input:cancel', {});
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') emit('input:cancel', {});
  });
}

/**
 * 클라이언트 좌표 → 캔버스 픽셀 좌표. CSS로 스케일된 캔버스도 보정한다.
 * 캔버스 논리 영역(0~width, 0~height) 밖이면 null.
 * @param {HTMLCanvasElement} canvas
 * @param {MouseEvent} e
 * @returns {{x: number, y: number} | null}
 */
function toCanvasPoint(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
  return { x, y };
}

/**
 * 픽셀 → 그리드 셀. grid.pxToGrid 우선, 미구현 시 계약 §2 공식으로 폴백.
 * @param {{x: number, y: number}} pt
 * @returns {{col: number, row: number}}
 */
function toCell(pt) {
  const cell = pxToGrid(pt);
  if (cell && Number.isFinite(cell.col) && Number.isFinite(cell.row)) return cell;
  return { col: Math.floor(pt.x / TILE_SIZE), row: Math.floor(pt.y / TILE_SIZE) };
}
