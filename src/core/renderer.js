/**
 * @module core/renderer (engine-dev)
 * 단일 캔버스 렌더 파이프라인. 계약 §8, §11(DPR).
 *
 * 좌표계: **논리 960×640 불변** — 모든 drawFn은 논리 좌표로 그린다 (AC-35).
 * DPR 스케일: 내부 해상도 = 논리 크기 × min(devicePixelRatio, 2), 기저 변환으로 컨텍스트 스케일.
 * 표시 크기는 전적으로 CSS 소관 — #game-canvas { width:100%; height:auto } (ui-dev, §11).
 *
 * 레이어 순서(order 오름차순 호출):
 *   10 = 배경(map/tilemap) / 15 = terrain-anim(움직이는 지형 장식) + 시체 페이드(fx 소유) /
 *   20 = 엔티티(타워→적→투사체) / 30 = fx / 40 = 캔버스 UI(고스트·사거리 원)
 * (v4, §16.3) 레이어 15 = terrain-anim: 배경 캐시(10) 위, 엔티티(20) 아래. tilemap(장식 애니)과
 *   fx(물 글린트)가 공동 등록(복수 drawFn 허용). 15 ≤ SHAKE_MAX_ORDER(30)이므로 월드와 함께 셰이크됨(의도).
 * (v5, §17.4 v5.0-c) 시체 페이드(fx/tween drawCorpses)도 레이어 15 공동 등록 — 등록 순서 terrainAnim →
 *   waterGlint → corpse(§17.4 명문). 엔티티(20) 아래라 라이브 적이 시체를 가리는 occlusion 유지.
 * 카메라 오프셋(셰이크)은 order <= 30 레이어에만 적용된다 (캔버스 UI는 흔들지 않음).
 * 같은 order에 복수 drawFn 등록 가능 — 등록 순서대로 호출 (fx 3종이 30을 공유).
 * 각 drawFn은 save/restore로 감싸 호출되므로 컨텍스트 상태 누수가 다음 레이어를 오염시키지 않는다.
 */

const LAYER_ORDERS = [10, 15, 20, 30, 40]; // (v4 §16.3) 15 = terrain-anim + (v5 §17.4 v5.0-c) 시체 페이드 공동 등록 (background 위, entities 아래)
const SHAKE_MAX_ORDER = 30;
const MAX_DPR = 2; // §11: min(devicePixelRatio, 2)

/** @type {Array<{order: number, fn: (ctx: CanvasRenderingContext2D) => void}>} */
const layers = [];

/** @type {HTMLCanvasElement | null} */
let canvasEl = null;
/** @type {CanvasRenderingContext2D | null} */
let ctx = null;

let dpr = 1;
let logicalW = 0; // 캔버스 HTML 속성 크기 = 논리 크기 (960×640)
let logicalH = 0;

let camX = 0;
let camY = 0;

/**
 * 렌더러 초기화. 캔버스의 HTML 속성 크기(960×640)를 논리 크기로 삼고,
 * 백킹스토어를 DPR 배율로 확대한다. 논리 좌표계는 불변 (§11).
 * @param {HTMLCanvasElement} canvas - #game-canvas (논리 960×640)
 */
export function initRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('[renderer] initRenderer: 유효한 캔버스가 아님');
  }
  canvasEl = canvas;
  logicalW = canvas.width;
  logicalH = canvas.height;
  dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, MAX_DPR);
  canvas.width = Math.round(logicalW * dpr);
  canvas.height = Math.round(logicalH * dpr);
  // 표시 크기는 CSS가 소유 — css/style.css의 #game-canvas { width:100%; height:auto } (§11).
  // 백킹스토어 확대(예: 1920px)가 표시 크기로 새지 않는 것은 그 규칙이 보장한다.
  ctx = canvas.getContext('2d');
}

/**
 * 렌더 레이어 등록.
 * @param {number} order - 10 | 15 | 20 | 30 | 40 (계약 고정 — 임의 값 금지. 15 = terrain-anim, v4 §16.3)
 * @param {(ctx: CanvasRenderingContext2D) => void} drawFn - 상태 변경 금지, 논리 좌표로 그림
 */
export function registerLayer(order, drawFn) {
  if (typeof drawFn !== 'function') {
    console.error(`[renderer] registerLayer(${order}): drawFn이 함수가 아님`);
    return;
  }
  if (!LAYER_ORDERS.includes(order)) {
    console.warn(`[renderer] 계약 외 레이어 order ${order} — 계약은 10|15|20|30|40 (architect 승인 필요)`);
  }
  layers.push({ order, fn: drawFn });
  layers.sort((a, b) => a.order - b.order); // Array.sort는 stable — 동일 order는 등록 순서 유지
}

/** 등록된 레이어를 order 순으로 그린다. 루프의 render에서 호출. */
export function render() {
  if (!ctx || !canvasEl) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 기저 = DPR 스케일 — drawFn은 논리 좌표
  ctx.clearRect(0, 0, logicalW, logicalH);
  for (const { order, fn } of layers) {
    ctx.save();
    if (order <= SHAKE_MAX_ORDER && (camX !== 0 || camY !== 0)) {
      ctx.translate(camX, camY);
    }
    try {
      fn(ctx);
    } catch (err) {
      console.error(`[renderer] 레이어 ${order} draw 예외 (격리됨):`, err);
    }
    ctx.restore();
  }
}

/**
 * 카메라 오프셋 설정 — fx/flashes의 화면 흔들림 전용.
 * @param {number} dx @param {number} dy - 논리 px. (0,0)이 기본
 */
export function setCameraOffset(dx, dy) {
  camX = Number.isFinite(dx) ? dx : 0;
  camY = Number.isFinite(dy) ? dy : 0;
}
