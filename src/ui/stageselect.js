/**
 * @module ui/stageselect (ui-dev) — v3
 * 스테이지 선택 화면 (DOM 오버레이 — #screen-stage-select, ID 계약 §7).
 * LEVELS 개수만큼 카드를 나열: 번호·이름·잠금상태·최고점·클리어 표식 (GDD §13.1).
 * 카드 썸네일 = LEVELS[i].tiles 미니맵 축소 렌더 + tint (신규 이미지 없음 — §4.7/§5.5).
 * 모바일 세로(§11): 카드 그리드가 스크롤/잘림 없이 (AC-34) — 좁은 화면은 2열, 필요 시 내부 스크롤.
 *
 * 카드 셀렉터(§7): .stage-card[data-stage="0..4"], 잠김=.locked(+aria-disabled),
 *   클리어=.cleared, 카드 내 최고점=.stage-best. 잠긴 카드는 해금 조건 안내 + 탭 시 흔들림 피드백.
 *
 * 읽기: systems/progress — getUnlockedCount() / getBestScore(i) / isUnlocked(i)  (§ 의존규칙 ui→progress 읽기 API)
 *      data/levels — LEVELS[i].nameKo/tiles/cols/rows/tint/entrance/goal (미니맵·라벨용, namespace import 안전 접근)
 * 구독: stage:record-updated {stageIndex, best, isNewBest} — 카드 최고점 갱신
 *      stage:unlocked {stageIndex}                        — 잠금 해제 반영(전체 재그림)
 *      ui:start-requested {} / ui:stage-select-requested {} — 화면 표시 + 최신 진행도 반영
 *      game:started {}                                    — 스테이지 진입 → 화면 숨김
 * 발행: ui:stage-selected {stageIndex} — 해금된 카드 클릭 (main이 스테이지 진입 §14.1)
 *
 * 표시/숨김은 screens.js와 동일한 .hidden 토글 관례. main의 상태 머신은 이벤트만 소비하고
 * 이 화면을 직접 제어하지 않는다 — 표시 트리거는 ui:start/ui:stage-select-requested(§3.10) 흐름.
 */

import { on, emit } from '../core/events.js';
import { getBestScore, isUnlocked, getUnlockedCount } from '../systems/progress.js';
// (v3) map-designer가 LEVELS를 아직 추가 중일 수 있으므로 namespace import로 안전 접근한다
// (미존재 export가 링크타임 크래시를 내지 않도록 — main.js resolveLevels와 동일 패턴, §15 회귀 보존).
import * as levelsData from '../data/levels.js';
import { fadeInScreen, fadeOutScreen, shakeX } from './anim.js';

/** 미니맵 타일 1칸의 내부 렌더 크기(px). CSS width:100%가 카드 폭에 맞춰 축소한다. */
const CELL = 14;

/** 미니맵 타일 색 — 실에셋 미사용(§4.7): 잔디/경로/장식 3색 + 입구/도착 마커. */
const MAP_COLORS = {
  grass: '#4c7c3f',
  path: '#caa96b',
  deco: '#39562f',
  entrance: '#8fe36a',
  goal: '#57d7ff',
};

/** @typedef {{ index:number, el:HTMLButtonElement, bestEl:HTMLElement, lockEl:HTMLElement }} CardRef */

let rootEl = null;
/** @type {CardRef[]} */
let cards = [];
let built = false;

/** LEVELS 해석 — 배열이 있으면 그대로, 없으면 단일 LEVEL 폴백(v2 회귀 보존). @returns {any[]} */
function resolveLevels() {
  const arr = levelsData.LEVELS;
  if (Array.isArray(arr) && arr.length > 0) return arr;
  return levelsData.LEVEL ? [levelsData.LEVEL] : [];
}

/** 천 단위 구분 점수 표기. 비유한수는 0으로 방어(NaN 노출 금지). */
function fmtScore(v) {
  const n = Number(v);
  return (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0).toLocaleString('ko-KR');
}

/** 스테이지 i가 클리어됐는가 = 다음 스테이지가 해금됨(§14.3 해금 규칙 역산). 마지막 스테이지는 판정 불가→false. */
function isCleared(i) {
  return i + 1 < getUnlockedCount();
}

/**
 * LEVELS[i].tiles를 작은 캔버스에 축소 렌더 + tint 오버레이 + 입구/도착 마커.
 * 화면이 hidden 상태에서 그려도 되도록 내부 해상도는 cols/rows×CELL 고정(레이아웃 비의존).
 * @param {HTMLCanvasElement} canvas @param {any} level
 */
function drawMinimap(canvas, level) {
  const cols = Number(level && level.cols) || 15;
  const rows = Number(level && level.rows) || 10;
  const tiles = Array.isArray(level && level.tiles) ? level.tiles : null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cols * CELL;
  const h = rows * CELL;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 바닥(잔디)로 채운 뒤 타일별 덮어그림 — tiles 부재/불량 시에도 잔디 배경은 나온다.
  ctx.fillStyle = MAP_COLORS.grass;
  ctx.fillRect(0, 0, w, h);

  if (tiles) {
    for (let r = 0; r < rows; r++) {
      const rowArr = tiles[r];
      if (!Array.isArray(rowArr)) continue;
      for (let c = 0; c < cols; c++) {
        const t = rowArr[c];
        if (t === 1) ctx.fillStyle = MAP_COLORS.path;
        else if (t === 2) ctx.fillStyle = MAP_COLORS.deco;
        else continue; // GRASS는 배경으로 이미 채워짐
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    }
  }

  // 입구/도착 마커 — 경로의 흐름을 읽히게(작은 점).
  const mark = (cell, color) => {
    if (!cell) return;
    const cx = (Number(cell.col) + 0.5) * CELL;
    const cy = (Number(cell.row) + 0.5) * CELL;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2);
    ctx.fill();
  };
  mark(level && level.entrance, MAP_COLORS.entrance);
  mark(level && level.goal, MAP_COLORS.goal);

  // (v3) tint 시간대 오버레이 — 게임플레이 무관 순수 시각(§4.7). 없으면 원색.
  const tint = level && level.tint;
  if (tint && typeof tint.color === 'string') {
    const a = Number(tint.alpha);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = Number.isFinite(a) ? Math.min(Math.max(a, 0), 0.5) : 0.3;
    ctx.fillStyle = tint.color;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

/** 카드 1개 생성 + 클릭 배선. @param {any} level @param {number} i @returns {CardRef} */
function createCard(level, i) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'stage-card';
  el.dataset.stage = String(i);

  const canvas = document.createElement('canvas');
  canvas.className = 'stage-map';
  drawMinimap(canvas, level);

  const meta = document.createElement('div');
  meta.className = 'stage-meta';
  const nameKo = (level && (level.nameKo || level.name)) || `스테이지 ${i + 1}`;
  meta.innerHTML =
    `<span class="stage-num">STAGE ${i + 1}</span>` +
    `<span class="stage-name"></span>` +
    `<span class="stage-best"></span>`;
  meta.querySelector('.stage-name').textContent = nameKo;

  const cleared = document.createElement('span');
  cleared.className = 'stage-cleared-badge';
  cleared.textContent = '✓ 클리어';

  const lock = document.createElement('span');
  lock.className = 'stage-lock';
  lock.textContent = `🔒 스테이지 ${i} 클리어 시 해금`;

  el.append(canvas, meta, cleared, lock);

  el.addEventListener('click', () => {
    if (!isUnlocked(i)) {
      shakeX(el); // 잠김: 명시적 피드백(사회성 정책 — 모든 상태 변화는 시각 피드백). (v5) anime.js 흔들림
      return;
    }
    emit('ui:stage-selected', { stageIndex: i });
  });

  return { index: i, el, bestEl: meta.querySelector('.stage-best'), lockEl: lock };
}

/** 카드 1개의 잠금/최고점/클리어 상태를 progress로 재그린다. @param {CardRef} card */
function refreshCard(card) {
  const i = card.index;
  const unlocked = isUnlocked(i);
  const cleared = isCleared(i);
  const best = getBestScore(i);

  card.el.classList.toggle('locked', !unlocked);
  card.el.classList.toggle('cleared', cleared);
  card.el.setAttribute('aria-disabled', String(!unlocked));

  if (unlocked) {
    card.bestEl.textContent = best > 0 ? `최고 ${fmtScore(best)}` : '미기록';
  } else {
    card.bestEl.textContent = '';
  }
}

/** DOM 바인딩 + 카드 생성 + 구독 등록. main이 1회 호출. */
export function initStageSelect() {
  if (built) return;

  // #screen-stage-select는 architect가 index.html에 추가(계약 §7). 아직 없으면 생성해 스스로 언블록
  // (architect 반영 후에는 기존 노드를 재사용 — 중복 없음). class는 다른 오버레이와 동일 .screen.
  rootEl = document.getElementById('screen-stage-select');
  if (!rootEl) {
    rootEl = document.createElement('div');
    rootEl.id = 'screen-stage-select';
    rootEl.className = 'screen hidden';
    const stage = document.getElementById('stage');
    (stage || document.body).appendChild(rootEl);
  }

  const body = document.createElement('div');
  body.className = 'screen-body stage-select-body';
  const title = document.createElement('h2');
  title.className = 'stage-select-title';
  title.textContent = '스테이지 선택';
  const grid = document.createElement('div');
  grid.className = 'stage-grid';

  const levels = resolveLevels();
  cards = levels.map((level, i) => {
    const card = createCard(level, i);
    grid.appendChild(card.el);
    return card;
  });

  body.append(title, grid);
  rootEl.appendChild(body);
  built = true;

  refreshStageSelect();

  // 최고점 갱신 — 해당 카드만.
  on('stage:record-updated', ({ stageIndex } = {}) => {
    const idx = Number(stageIndex);
    const card = cards.find((c) => c.index === idx);
    if (card) refreshCard(card);
  });

  // 신규 해금 — 잠금 해제 + 이전 카드 클리어 표식 변동 가능 → 전체 재그림.
  on('stage:unlocked', () => refreshStageSelect());

  // 화면 표시 트리거(§3.10) — 타이틀 "게임 시작" / 결과·게임중 "스테이지 선택".
  on('ui:start-requested', showStageSelect);
  on('ui:stage-select-requested', showStageSelect);

  // 스테이지 진입 → 숨김(게임 화면으로 전환). game:started는 판 리셋의 보편 신호.
  on('game:started', hideStageSelect);
}

/** 화면 표시 직전 progress 상태로 전 카드 재그리기. 표시 트리거·main 진입 시 호출. */
export function refreshStageSelect() {
  for (const card of cards) refreshCard(card);
}

/** 화면 표시 + 최신 진행도 반영. (v5) 페이드 인(outExpo) — 표시 상태는 fadeInScreen이 .hidden 해제로 확정. */
function showStageSelect() {
  if (!rootEl) return;
  refreshStageSelect();
  fadeInScreen(rootEl);
}

/** 화면 숨김. (v5) 페이드 아웃 후 .hidden 부착(트윈 실패해도 즉시 숨김). */
function hideStageSelect() {
  fadeOutScreen(rootEl);
}
