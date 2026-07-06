/**
 * @module ui/placement (ui-dev)
 * 배치 모드 + 필드 내 캔버스 오버레이 (렌더 레이어 40 — §8):
 * 마우스 추적 고스트 + 사거리 원 + 타일 하이라이트(가능=초록, 불가=빨강 — AC-08),
 * 건설된 타워 클릭 선택 / 선택 타워 사거리 원.
 * 건설 가능 판정은 map/grid.isBuildable만 소비한다 — 자체 판정 로직 금지.
 * 레이어 40 등록은 main이 drawOverlay를 import해 수행한다 (§8 부트스트랩 4).
 *
 * 구독: input:move {x, y, col, row} — 고스트 위치 갱신
 *      input:click {x, y, col, row, button} — 배치 확정 또는 타워 선택/해제
 *      input:cancel {} — 배치 모드 취소, 선택 해제 (우클릭/ESC — AC-08)
 *      build:rejected {reason} — 배치 모드 유지 + 빨강 펄스 피드백
 *      tower:placed {} — 배치 모드 종료
 *      tower:sold {tower} — 선택 중이던 타워면 선택 해제
 *      game:started {} — 상태 리셋
 * 발행: ui:build-requested {towerType, col, row}
 *      tower:selected {tower} / tower:deselected {}
 *      ui:error {reason: 'placement'}
 */
import { on, emit } from '../core/events.js';
import { get as getAsset } from '../core/assets.js';
import { isBuildable, inBounds, gridToPx, TILE_SIZE } from '../map/grid.js';
import { towers } from '../systems/combat.js';
import { TOWERS } from '../data/towers.js';

/** build:rejected/불가 클릭 시 빨강 펄스 지속 시간(ms). */
const REJECT_FLASH_MS = 350;

let placing = null;      // 배치 모드의 타워 타입 (null = 비활성)
let hover = null;        // 마지막 input:move 페이로드
let selected = null;     // 선택된 설치 타워 (사거리 원 표시용)
let rejectUntil = 0;     // 이 시각(performance.now ms)까지 빨강 펄스
let stageEl = null;

function num(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

function rangeOf(type, level) {
  return num(TOWERS[type]?.levels?.[num(level, 1) - 1]?.range, 0);
}

function cellCenter(cell) {
  const px = gridToPx(cell);
  if (px && Number.isFinite(px.x) && Number.isFinite(px.y)) return px;
  // grid 스텁 단계 폴백 — 렌더 전용, 판정에는 쓰지 않는다
  return {
    x: cell.col * TILE_SIZE + TILE_SIZE / 2,
    y: cell.row * TILE_SIZE + TILE_SIZE / 2
  };
}

function clearSelection() {
  if (!selected) return;
  selected = null;
  emit('tower:deselected', {});
}

/** 구독 등록. main이 1회 호출. (레이어 40 등록은 main 소관) */
export function initPlacement() {
  stageEl = document.getElementById('stage');

  on('input:move', (p = {}) => {
    if (Number.isFinite(p.col) && Number.isFinite(p.row)) hover = p;
  });

  on('input:click', (p = {}) => {
    if (p.button !== 0 || !Number.isFinite(p.col) || !Number.isFinite(p.row)) return;
    const cell = { col: p.col, row: p.row };

    if (placing) {
      if (isBuildable(cell)) {
        emit('ui:build-requested', { towerType: placing, col: cell.col, row: cell.row });
      } else {
        rejectUntil = performance.now() + REJECT_FLASH_MS;
        emit('ui:error', { reason: 'placement' });
      }
      return;
    }

    const hit = towers.find(
      (t) => t.alive !== false && t.col === cell.col && t.row === cell.row
    );
    if (hit) {
      selected = hit;
      emit('tower:selected', { tower: hit });
    } else {
      clearSelection();
    }
  });

  on('input:cancel', () => {
    cancelPlacementMode();
    clearSelection();
  });

  on('build:rejected', () => {
    rejectUntil = performance.now() + REJECT_FLASH_MS;
  });

  on('tower:placed', () => {
    cancelPlacementMode();
  });

  on('tower:sold', ({ tower } = {}) => {
    if (selected && tower && tower.id === selected.id) clearSelection();
  });

  on('game:started', () => {
    placing = null;
    selected = null;
    hover = null;
    rejectUntil = 0;
    stageEl?.classList.remove('placing');
  });
}

/**
 * 상점에서 타워 선택 시 배치 모드 진입 (shop.js가 직접 호출 — ui 내부 결합 허용).
 * @param {'arrow'|'cannon'|'frost'|'arcane'} towerType
 */
export function enterPlacementMode(towerType) {
  clearSelection();
  placing = towerType;
  stageEl?.classList.add('placing');
}

/** 배치 모드 취소 (shop 토글/취소 입력에서 호출 — ui 내부 결합 허용). */
export function cancelPlacementMode() {
  placing = null;
  stageEl?.classList.remove('placing');
}

/**
 * 레이어 40 drawFn — 고스트·사거리 원·하이라이트. 상태 변경 금지.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawOverlay(ctx) {
  if (selected && selected.alive !== false) {
    drawRangeCircle(
      ctx, selected.x, selected.y,
      rangeOf(selected.type, selected.level), 'rgba(105,192,255,'
    );
  }

  if (!placing || !hover) return;
  const cell = { col: hover.col, row: hover.row };
  if (!inBounds(cell)) return;

  const good = !!isBuildable(cell) && performance.now() >= rejectUntil;
  const { x, y } = cellCenter(cell);

  const range = rangeOf(placing, 1);
  if (range > 0) {
    drawRangeCircle(ctx, x, y, range, good ? 'rgba(88,214,141,' : 'rgba(240,84,84,');
  }

  ctx.fillStyle = good ? 'rgba(88,214,141,0.25)' : 'rgba(240,84,84,0.3)';
  ctx.fillRect(cell.col * TILE_SIZE, cell.row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  ctx.lineWidth = 2;
  ctx.strokeStyle = good ? 'rgba(88,214,141,0.95)' : 'rgba(240,84,84,0.95)';
  ctx.strokeRect(
    cell.col * TILE_SIZE + 1, cell.row * TILE_SIZE + 1,
    TILE_SIZE - 2, TILE_SIZE - 2
  );

  drawGhost(ctx, placing, x, y);
}

function drawRangeCircle(ctx, x, y, r, rgbaBase) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(r > 0)) return;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = rgbaBase + '0.08)';
  ctx.fill();
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rgbaBase + '0.7)';
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGhost(ctx, type, x, y) {
  const size = TILE_SIZE;
  ctx.save();
  ctx.globalAlpha = 0.65;
  try {
    const img = getAsset(TOWERS[type]?.assetKey ?? `tower_${type}`);
    if (img) {
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
      ctx.restore();
      return;
    }
  } catch (_) {
    // assets 스텁/로드 전 — 이니셜 폴백으로 진행
  }
  ctx.fillStyle = '#3a4a6b';
  ctx.fillRect(x - size / 2 + 8, y - size / 2 + 8, size - 16, size - 16);
  ctx.fillStyle = '#cfe3ff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(TOWERS[type]?.nameKo?.[0] ?? type[0].toUpperCase(), x, y + 1);
  ctx.restore();
}
