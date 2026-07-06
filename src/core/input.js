/**
 * @module core/input (engine-dev)
 * 원시 포인터/키 입력을 논리 좌표로 변환해 이벤트로 발행. 계약 §3.8, §3.9, §11.
 *
 * v2: **Pointer Events 단일 경로** — pointerdown/move/up/cancel만 사용.
 * mouse/touch 이중 리스너 금지(고스트 클릭 방지). 탭 판정: pointerup 시점
 * 누적 이동 < 8 논리px → input:click 발행.
 *
 * 발행:
 *   input:click  {x, y, col, row, button, pointerType} — 캔버스 내 탭/클릭 (button: 0=좌)
 *   input:move   {x, y, col, row, pointerType}          — 캔버스 내 이동
 *   input:cancel {}                                      — 우클릭(contextmenu 억제) 또는 ESC
 * pointerType('mouse'|'touch'|'pen')은 §3.9 비파괴 선택 필드 — 기존 필드 이름·시맨틱 불변.
 *
 * 좌표: x,y = **논리 960×640 좌표** (CSS 표시 크기 → 논리 역보정, §11 — DPR·반응형 축소 무관).
 * 논리 크기는 계약 §2 상수(COLS×TILE_SIZE, ROWS×TILE_SIZE)에서 유도 — 렌더러 DPR과 결합 없음.
 * col,row = map/grid.pxToGrid 결과. 캔버스 밖 입력은 발행하지 않는다 (AC-22).
 */

import { emit } from './events.js';
import { pxToGrid, TILE_SIZE, COLS, ROWS } from '../map/grid.js';

const LOGICAL_W = COLS * TILE_SIZE; // 960 — §2 논리 좌표계 불변
const LOGICAL_H = ROWS * TILE_SIZE; // 640
const TAP_MAX_TRAVEL = 8; // §11: 누적 이동 < 8 논리px = 탭

let bound = false;
/** @type {{id: number, travel: number, x: number, y: number} | null} 진행 중 탭 후보 */
let tap = null;
/** contextmenu에는 pointerType이 없어 직전 pointerdown의 타입으로 판별한다. */
let lastPointerType = 'mouse';

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

  canvas.addEventListener('pointerdown', (e) => {
    if (e.isPrimary === false) return; // 멀티터치 보조 포인터 무시
    lastPointerType = e.pointerType || 'mouse';
    if (e.button !== 0) return; // 우클릭 취소는 contextmenu 경로
    const pt = toLogicalPoint(canvas, e);
    if (!pt) return;
    tap = { id: e.pointerId, travel: 0, x: pt.x, y: pt.y };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.isPrimary === false) return;
    const pt = toLogicalPoint(canvas, e);
    if (!pt) return;
    if (tap && e.pointerId === tap.id) {
      tap.travel += Math.hypot(pt.x - tap.x, pt.y - tap.y);
      tap.x = pt.x;
      tap.y = pt.y;
    }
    const cell = toCell(pt);
    emit('input:move', {
      x: pt.x, y: pt.y, col: cell.col, row: cell.row,
      pointerType: e.pointerType || 'mouse',
    });
  });

  canvas.addEventListener('pointerup', (e) => {
    if (e.isPrimary === false || e.button !== 0) return;
    const t = tap;
    tap = null;
    if (!t || e.pointerId !== t.id) return;
    const pt = toLogicalPoint(canvas, e);
    if (!pt) return;
    const travel = t.travel + Math.hypot(pt.x - t.x, pt.y - t.y);
    if (travel >= TAP_MAX_TRAVEL) return; // 드래그 — 탭 아님
    const cell = toCell(pt);
    emit('input:click', {
      x: pt.x, y: pt.y, col: cell.col, row: cell.row, button: 0,
      pointerType: e.pointerType || 'mouse',
    });
  });

  canvas.addEventListener('pointercancel', () => {
    tap = null; // 스크롤/제스처로 넘어감 — 탭 후보 폐기, 이벤트 미발행
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // 메뉴 억제는 포인터 종류 무관
    // 터치 롱프레스로 뜨는 contextmenu는 우클릭이 아니다 — cancel 미발행 (§3.8 시맨틱 유지)
    if (lastPointerType === 'touch') return;
    emit('input:cancel', {});
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') emit('input:cancel', {});
  });
}

/**
 * 클라이언트 좌표 → 논리 좌표(960×640). CSS 표시 크기(반응형 축소 포함)를 역보정한다.
 * 백킹스토어 크기(canvas.width — DPR 확대분)와는 무관 (§11).
 * 논리 영역 밖이면 null.
 * @param {HTMLCanvasElement} canvas
 * @param {PointerEvent} e
 * @returns {{x: number, y: number} | null}
 */
function toLogicalPoint(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const x = (e.clientX - rect.left) * (LOGICAL_W / rect.width);
  const y = (e.clientY - rect.top) * (LOGICAL_H / rect.height);
  if (x < 0 || y < 0 || x >= LOGICAL_W || y >= LOGICAL_H) return null;
  return { x, y };
}

/**
 * 논리 픽셀 → 그리드 셀. grid.pxToGrid 우선, 비정상 반환 시 계약 §2 공식으로 폴백.
 * @param {{x: number, y: number}} pt
 * @returns {{col: number, row: number}}
 */
function toCell(pt) {
  const cell = pxToGrid(pt);
  if (cell && Number.isFinite(cell.col) && Number.isFinite(cell.row)) return cell;
  return { col: Math.floor(pt.x / TILE_SIZE), row: Math.floor(pt.y / TILE_SIZE) };
}
