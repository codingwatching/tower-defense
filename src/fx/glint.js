/**
 * @module fx/glint (fx-dev)
 * 물 글린트 — terrain family==='water' 셀 표면의 은은한 반짝임 점멸(개체별 위상 오프셋).
 * 렌더 레이어 15 (terrain-anim: background 위·entities 아래 — §16.3). 코드 오버레이 방식
 *   (애니 타일 시트 대신 — GDD §14.4, seamless 타일 애니는 에셋 실패율이 높다).
 *
 * 배선(engine-dev, main): 레이어 15는 tilemap의 지형 애니와 fx의 물 글린트가 공동 등록한다.
 *   safeInit('fx/glint', initWaterGlint) + registerLayer(15, drawWaterGlint).
 *   fx는 update 틱을 쓰지 않는다 — 트윙클 위상은 performance.now() 기반(월드 애니 tilemap
 *   terrain-anim과 동일 정책, §16.3). 지형 앰비언트는 배속/일시정지와 무관한 벽시계 애니.
 *   order≤30이라 화면 셰이크 시 월드와 함께 흔들린다(의도 — 물은 필드의 일부).
 *
 * 구독만 (§1·§3 — 이 모듈 삭제 시 글린트만 사라지고 게임·terrain-anim은 정상):
 *   stage:started {stageIndex, stageId} — LEVELS[stageIndex].terrain의 water 셀로 글린트 재구성.
 *     terrain 미존재/빈 배열이면 글린트 0개(map-designer 병렬 작업 — 안전 폴백).
 *   game:started {} — 별도 처리 없음(stage:started가 항상 먼저 오며 컨텍스트를 싣는다, §14.1).
 * 데이터 읽기: src/data/levels.js (water 셀 좌표 — §16.3 fx의 LEVELS 읽기 허용).
 * 이미지 에셋 없음.
 */

import { on } from '../core/events.js';
import { gridToPx, TILE_SIZE } from '../map/grid.js';
import * as levelsData from '../data/levels.js';

// ─────────────────────────────────────────────────────────────
// 연출 강도 상수 — 튜닝은 전부 여기서 (playtester 피드백 대응 지점)
// ─────────────────────────────────────────────────────────────
// (§11) 모바일 프리셋 — coarse 포인터(터치)면 상한 하향. node 환경 가드 필수.
const IS_COARSE = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
const MAX_GLINTS = IS_COARSE ? 14 : 22;   // 동시 글린트 상한. "맵당 소수" — 유닛 가독성 우선(§16.3)
const GLINTS_PER_CELL = 1;                 // water 셀당 글린트 수 (면 단위 저밀도)
const OFFSET_FRAC = 0.28;                  // 셀 중심에서의 최대 오프셋(타일변 비율) — 표면 산포
const TWINKLE = {
  periodMin: 1.4, periodMax: 2.6,          // 개체별 점멸 주기(초) — 비동기 반짝임
  size: 3.2,                               // 스파클 기준 크기(px)
  maxAlpha: 0.55,                          // 최대 밝기 — 은은하게(가독성)
  color: '210,240,255',                    // 청백색 물비늘 톤 ('r,g,b')
};

// ─────────────────────────────────────────────────────────────
// 상태 — 글린트 목록(스테이지 진입 시 재구성). 개체 상태가 없어 풀 불요.
// ─────────────────────────────────────────────────────────────
/** @type {{x:number, y:number, period:number, phase:number, size:number}[]} */
const glints = [];

/** 셀 결정적 유사난수 [0,1) — 재진입해도 글린트 배치/위상이 튀지 않게 (col,row,salt) 해시. */
function cellRand(col, row, salt) {
  let h = (col * 73856093) ^ (row * 19349663) ^ (salt * 83492791);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 100000) / 100000;
}

/** LEVELS 안전 해석 — map-designer가 아직 추가 중일 수 있으므로 namespace로(§main.resolveLevels 미러). */
function resolveLevel(stageIndex) {
  const arr = levelsData.LEVELS;
  const levels = Array.isArray(arr) && arr.length > 0 ? arr : [levelsData.LEVEL];
  return levels[stageIndex] || levels[0];
}

/** water 셀 → 글린트 목록 재구성. terrain 부재/빈 배열이면 0개(안전 폴백). */
function rebuild(stageIndex) {
  glints.length = 0;
  const level = resolveLevel(stageIndex);
  const terrain = level && Array.isArray(level.terrain) ? level.terrain : [];
  const water = terrain.filter((t) => t && t.family === 'water'
    && Number.isInteger(t.col) && Number.isInteger(t.row));
  if (water.length === 0) return;
  // "맵당 소수" 유지 — water 셀이 많으면 균일 서브샘플로 상한 준수.
  const wanted = Math.min(MAX_GLINTS, water.length * GLINTS_PER_CELL);
  const stride = Math.max(1, Math.ceil((water.length * GLINTS_PER_CELL) / wanted));
  for (let i = 0; i < water.length && glints.length < MAX_GLINTS; i += stride) {
    const cell = water[i];
    const c = gridToPx({ col: cell.col, row: cell.row });
    const ox = (cellRand(cell.col, cell.row, 1) - 0.5) * TILE_SIZE * OFFSET_FRAC * 2;
    const oy = (cellRand(cell.col, cell.row, 2) - 0.5) * TILE_SIZE * OFFSET_FRAC * 2;
    glints.push({
      x: c.x + ox,
      y: c.y + oy,
      period: TWINKLE.periodMin + cellRand(cell.col, cell.row, 3) * (TWINKLE.periodMax - TWINKLE.periodMin),
      phase: cellRand(cell.col, cell.row, 4),
      size: TWINKLE.size * (0.7 + cellRand(cell.col, cell.row, 5) * 0.6),
    });
  }
}

let warned = false;
function guard(fn) {
  return (payload) => {
    try { fn(payload || {}); } catch (e) {
      if (!warned) { warned = true; console.warn('[fx/glint] 글린트 강등:', e); }
    }
  };
}

/** 구독 등록. main이 1회 호출(safeInit). */
export function initWaterGlint() {
  on('stage:started', guard(({ stageIndex }) => {
    rebuild(Number.isInteger(stageIndex) ? stageIndex : 0);
  }));
}

/**
 * 레이어 15 drawFn (tilemap terrain-anim과 공동 등록). 상태 변경 금지 — 위상은 벽시계로 계산.
 * water 없으면 즉시 반환(비용 0). additive 합성으로 물 표면 위 부드러운 반짝임.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawWaterGlint(ctx) {
  if (glints.length === 0) return;
  const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const g of glints) {
    // sin²(양의 반주기만) — 대부분 어둡고 가끔 반짝(드문 점멸, 화면이 꿈틀대지 않게)
    const s = Math.sin((t / g.period + g.phase) * Math.PI * 2);
    const tw = s > 0 ? s * s : 0;
    if (tw < 0.02) continue;
    const a = TWINKLE.maxAlpha * tw;
    const r = g.size * (0.6 + 0.4 * tw);
    const outer = r * 2.4;
    const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, outer);
    grad.addColorStop(0, `rgba(${TWINKLE.color},${a})`);
    grad.addColorStop(0.5, `rgba(${TWINKLE.color},${a * 0.35})`);
    grad.addColorStop(1, `rgba(${TWINKLE.color},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(g.x, g.y, outer, 0, Math.PI * 2); ctx.fill();
    // 작은 십자 스파클 코어 — 물비늘 하이라이트
    ctx.strokeStyle = `rgba(255,255,255,${a})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g.x - r, g.y); ctx.lineTo(g.x + r, g.y);
    ctx.moveTo(g.x, g.y - r); ctx.lineTo(g.x, g.y + r);
    ctx.stroke();
  }
  ctx.restore();
}
