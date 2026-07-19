/**
 * @module ui/placement (ui-dev)
 * 배치 모드 + 필드 내 캔버스 오버레이 (렌더 레이어 40 — §8):
 * 고스트 타워 + 사거리 원 + 타일 하이라이트(가능=초록, 불가=빨강 — AC-08),
 * 건설된 타워 클릭 선택 / 선택 타워 사거리 원.
 * 건설 가능 판정은 map/grid.isBuildable만 소비한다 — 자체 판정 로직 금지.
 * 레이어 40 등록은 main이 drawOverlay를 import해 수행한다 (§8 부트스트랩 4).
 *
 * v2 배치 상태 머신 (계약 §11, AC-33):
 *   'mouse'        — v1 그대로: hover 추적 프리뷰 + 클릭 즉시 확정 (데스크톱 회귀 금지, AC-37)
 *   'touch'|'pen'  — 1탭 = 해당 타일 프리뷰 고정(고스트+사거리+가부 색),
 *                    다른 타일 탭 = 프리뷰 이동, 동일 타일 2탭째 = 확정(ui:build-requested)
 *   취소           — ESC/우클릭(input:cancel) + #btn-cancel-placement(§7).
 *                    버튼 표시/숨김은 이 모듈, 클릭 배선은 shop.js(상점 하이라이트 해제 동반
 *                    — 같은 ui 디렉토리 내 결합 허용, §1 예외)
 *
 * 구독: input:move {x, y, col, row, pointerType} — 마우스 고스트 위치 갱신
 *      input:click {x, y, col, row, button, pointerType} — 확정/프리뷰 고정/타워 선택
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
import { getAnim, seqFrames } from '../core/assets.js';
import { isBuildable, inBounds, gridToPx, TILE_SIZE } from '../map/grid.js';
import { towers } from '../systems/combat.js';
import { TOWERS } from '../data/towers.js';

/** build:rejected/불가 클릭 시 빨강 펄스 지속 시간(ms). */
const REJECT_FLASH_MS = 350;

let placing = null;      // 배치 모드의 타워 타입 (null = 비활성)
let hover = null;        // 마지막 input:move 페이로드 (pointerType 포함)
let touchPreview = null; // 터치/펜 1탭으로 고정된 프리뷰 셀 {col, row} (null = 미고정)
let selected = null;     // 선택된 설치 타워 (사거리 원 표시용)
let rejectUntil = 0;     // 이 시각(performance.now ms)까지 빨강 펄스
let stageEl = null;
let btnCancelEl = null;  // #btn-cancel-placement — 배치 모드 중에만 노출 (§7, §11)

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

/** 탭 상태 머신을 타는 포인터인가 (§11 — 'touch'|'pen'). 미지정은 마우스로 간주. */
function isTapPointer(pointerType) {
  return pointerType === 'touch' || pointerType === 'pen';
}

function setCancelButtonVisible(visible) {
  btnCancelEl?.classList.toggle('hidden', !visible);
}

/** 구독 등록. main이 1회 호출. (레이어 40 등록은 main 소관) */
export function initPlacement() {
  stageEl = document.getElementById('stage');
  btnCancelEl = document.getElementById('btn-cancel-placement');

  on('input:move', (p = {}) => {
    if (Number.isFinite(p.col) && Number.isFinite(p.row)) hover = p;
  });

  on('input:click', (p = {}) => {
    if (p.button !== 0 || !Number.isFinite(p.col) || !Number.isFinite(p.row)) return;
    const cell = { col: p.col, row: p.row };

    if (placing) {
      if (isTapPointer(p.pointerType) &&
          (!touchPreview || touchPreview.col !== cell.col || touchPreview.row !== cell.row)) {
        // 1탭 = 프리뷰 고정 / 다른 타일 탭 = 프리뷰 이동 — 확정은 동일 타일 2탭째 (AC-33)
        touchPreview = cell;
        return;
      }
      if (!isTapPointer(p.pointerType)) touchPreview = null; // 마우스 확정은 클릭 타일 기준 (v1)
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
    touchPreview = null;
    rejectUntil = 0;
    stageEl?.classList.remove('placing');
    setCancelButtonVisible(false);
  });
}

/**
 * 상점에서 타워 선택 시 배치 모드 진입 (shop.js가 직접 호출 — ui 내부 결합 허용).
 * @param {'arrow'|'cannon'|'frost'|'arcane'} towerType
 */
export function enterPlacementMode(towerType) {
  clearSelection();
  placing = towerType;
  touchPreview = null;
  stageEl?.classList.add('placing');
  setCancelButtonVisible(true);
}

/** 배치 모드 취소 (shop 토글/취소 버튼/취소 입력에서 호출 — ui 내부 결합 허용). */
export function cancelPlacementMode() {
  placing = null;
  touchPreview = null;
  stageEl?.classList.remove('placing');
  setCancelButtonVisible(false);
}

/**
 * 레이어 40 drawFn — 고스트·사거리 원·하이라이트. 상태 변경 금지.
 * 프리뷰 셀: 터치 고정 셀 우선, 없으면 마우스 hover (터치/펜 hover는 프리뷰를 움직이지
 * 않는다 — §11 "1탭 프리뷰 고정" 시맨틱).
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawOverlay(ctx) {
  if (selected && selected.alive !== false) {
    drawRangeCircle(
      ctx, selected.x, selected.y,
      rangeOf(selected.type, selected.level), 'rgba(105,192,255,'
    );
  }

  if (!placing) return;
  const cell = touchPreview ??
    (hover && !isTapPointer(hover.pointerType) ? { col: hover.col, row: hover.row } : null);
  if (!cell || !inBounds(cell)) return;

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

/**
 * 승격 타워 키의 idle 0프레임 크롭 정보 (§16.2, tower.js `_frameOf`와 동일 math).
 * getAnim은 항상 {image, atlas}를, seqFrames는 항상 길이≥1을 반환하므로 정적 강등 키에서도 분기 불요.
 * @param {string} key - tower_{type}_lv1
 * @returns {{image: CanvasImageSource, sx:number, sy:number, sw:number, sh:number}}
 */
function idleFrame0(key) {
  const { image, atlas } = getAnim(key);
  const frame = seqFrames(atlas, 'idle')[0]; // idle 부재 시 첫 시퀀스로 강등(§16.2)
  const imgW = image.naturalWidth || image.width || atlas.frameW;
  const cols = Math.max(1, Math.floor(imgW / atlas.frameW)); // 시트 열 수(2행×4열 → 4)
  return {
    image,
    sx: (frame % cols) * atlas.frameW,
    sy: Math.floor(frame / cols) * atlas.frameH,
    sw: atlas.frameW,
    sh: atlas.frameH
  };
}

function drawGhost(ctx, type, x, y) {
  const size = TILE_SIZE;
  ctx.save();
  ctx.globalAlpha = 0.65;
  try {
    // 고스트는 건설 결과물 = Lv1 스프라이트의 idle 0프레임 (§4.1-v2 assetKeys, §16.2)
    const f = idleFrame0(TOWERS[type]?.assetKeys?.[0] ?? `tower_${type}_lv1`);
    ctx.drawImage(f.image, f.sx, f.sy, f.sw, f.sh, x - size / 2, y - size / 2, size, size);
    ctx.restore();
    return;
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
