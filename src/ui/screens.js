/**
 * @module ui/screens (ui-dev) — v3
 * 오버레이 화면 (DOM — #screen-title/#screen-victory/#screen-defeat, ID 계약 §7).
 * 타이틀: 로고(CSS 텍스트 — §5: UI 전용 이미지 없음) + 조작 설명 + #btn-start(→ 스테이지 선택).
 * 승리/패배: 점수 요소별 분해(처치+웨이브+라이프=합계) + 스테이지 최고기록 + 신기록 연출 (GDD §13.2).
 *   버튼(§7): 승리 [다음 스테이지(해금 시)] #btn-restart-victory(재도전) #btn-stages-victory(스테이지 선택)
 *            패배 #btn-restart-defeat(재도전) #btn-stages-defeat(스테이지 선택)
 *
 * 구독: game:started {} — 전 화면 숨김 + 점수 캐시 리셋
 *      game:won {kills, livesLeft} / game:over {waveReached, kills} — 결과 화면 표시
 *      score:finalized {stageIndex, outcome, kill, wave, life, gold, total} — 점수 분해 캐시(§14.2, v3.1 gold 추가)
 *      stage:record-updated {stageIndex, best, isNewBest}            — 최고기록/신기록 캐시(§14.3)
 *      stage:started {stageIndex} — 현재 스테이지 인덱스 캐시(다음 스테이지 버튼 근거)
 * 발행: ui:start-requested {} (#btn-start → 스테이지 선택)
 *      ui:restart-requested {} (#btn-restart-* → 현재 스테이지 재도전, §14.1)
 *      ui:stage-select-requested {} (#btn-stages-* → 스테이지 선택 복귀, §14.1)
 *      ui:stage-selected {stageIndex} (다음 스테이지 버튼 → 해금된 다음 스테이지 진입, §14.1)
 *
 * 이벤트 순서 불변식(§14.2): score(step3 구독) → progress → screens(step4 구독) 순으로
 * game:won/over가 전파되므로, screens가 결과를 그릴 시점엔 score:finalized·stage:record-updated가
 * 이미 발행 완료다. 따라서 두 페이로드를 캐시해 두고 game:won/over에서 캐시로 렌더한다.
 */
import { on, emit } from '../core/events.js';
import { WAVES } from '../data/waves.js';
import { isUnlocked } from '../systems/progress.js';
// LEVELS 개수(다음 스테이지 존재 판정)만 안전 접근 — map-designer WIP 대비 namespace import.
import * as levelsData from '../data/levels.js';
import { fadeInScreen, fadeOutScreen, countUp } from './anim.js';

let titleEl, victoryEl, defeatEl;
let victoryStatsEl, defeatStatsEl;
let victoryScoreEl, defeatScoreEl;
let btnNextVictory; // 다음 스테이지(해금 시에만 노출)

/** 판당 1회 발행되는 점수/기록 페이로드 캐시 — game:started에서 null 리셋. */
let lastFinalized = null;
let lastRecord = null;
/** stage:started로 캐시한 현재 스테이지 인덱스 — 다음 스테이지 버튼 근거(finalized 부재 시 폴백). */
let currentStageIndex = 0;
/** (v5) 결과 화면 "최종 점수" 헤드라인 카운트업 상태 — 표시 전용(값은 score:finalized 캐시가 진실). */
const totalCounter = { shown: 0, tween: null };

function fmt(v) {
  return Number.isFinite(v) ? String(v) : '?';
}

/** 천 단위 구분 점수 표기. 비유한수는 0 방어(NaN 노출 금지). */
function fmtScore(v) {
  const n = Number(v);
  return (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0).toLocaleString('ko-KR');
}

/** LEVELS 총 개수 — 다음 스테이지 존재 판정. 배열 부재 시 1(단일 LEVEL 폴백). */
function totalStages() {
  const arr = levelsData.LEVELS;
  if (Array.isArray(arr) && arr.length > 0) return arr.length;
  return levelsData.LEVEL ? 1 : 0;
}

// (v5) 화면 전환 페이드 — 대상은 페이드 인, 나머지는 페이드 아웃 후 .hidden(트윈 실패해도 즉시 확정).
// 종료 상태(대상만 표시)는 fadeInScreen(.hidden 해제)/fadeOutScreen(.hidden 부착)이 그대로 보존.
function showOnly(target) {
  for (const el of [titleEl, victoryEl, defeatEl]) {
    if (!el) continue;
    if (el === target) fadeInScreen(el);
    else fadeOutScreen(el);
  }
}

function hideAll() {
  for (const el of [titleEl, victoryEl, defeatEl]) fadeOutScreen(el);
}

function injectBody(screenEl, beforeNode, html) {
  const body = document.createElement('div');
  body.className = 'screen-body';
  body.innerHTML = html;
  screenEl.insertBefore(body, beforeNode);
  return body;
}

/**
 * 점수 패널 렌더 — 요소별 분해 + 최고기록 + 신기록 연출.
 * finalized/record 캐시가 이번 판 것(§14.2 순서 보장)이라는 전제로 그린다.
 * 캐시가 없으면(방어) 분해를 숨기고 패널을 비워 NaN/undefined 노출을 막는다.
 * @param {HTMLElement} panelEl @param {'won'|'over'} outcome
 */
function renderScorePanel(panelEl, outcome) {
  if (!panelEl) return;
  const f = lastFinalized;
  const rec = lastRecord;

  if (!f) {
    // 점수 시스템이 없거나(§1 격리) finalized 미도달 — 패널을 비워 안전 강등.
    panelEl.innerHTML = '';
    panelEl.classList.remove('has-record');
    return;
  }

  const kill = Math.max(0, Math.floor(Number(f.kill) || 0));
  const wave = Math.max(0, Math.floor(Number(f.wave) || 0));
  const life = Math.max(0, Math.floor(Number(f.life) || 0));
  const gold = Math.max(0, Math.floor(Number(f.gold) || 0)); // (v3.1) 남은 골드 보너스 — life와 동일 방어
  const total = Math.max(0, Math.floor(Number(f.total) || kill + wave + life + gold));

  const best = rec && Number.isFinite(Number(rec.best)) ? Math.max(0, Math.floor(Number(rec.best))) : total;
  const isNewBest = !!(rec && rec.isNewBest);

  panelEl.innerHTML =
    `<div class="score-total"><span class="score-total-label">최종 점수</span>` +
    `<span class="score-total-value">${fmtScore(total)}</span></div>` +
    `<ul class="score-breakdown">` +
    `<li><span>처치</span><b>${fmtScore(kill)}</b></li>` +
    `<li><span>웨이브 클리어</span><b>${fmtScore(wave)}</b></li>` +
    `<li><span>남은 라이프${outcome === 'over' ? ' (패배 0)' : ''}</span><b>${fmtScore(life)}</b></li>` +
    `<li><span>남은 골드${outcome === 'over' ? ' (패배 0)' : ''}</span><b>${fmtScore(gold)}</b></li>` +
    `</ul>` +
    `<div class="score-best">이 스테이지 최고기록 <b>${fmtScore(best)}</b></div>` +
    (isNewBest ? `<div class="new-record">🏆 신기록!</div>` : '');
  panelEl.classList.add('has-record');

  // (v5) "최종 점수" 헤드라인 0→total 카운트업(outCubic). 표시 전용 — 값은 f.total(캐시)가 진실.
  // innerHTML이 이미 total을 넣었으므로 0으로 되돌린 뒤 롤업(전체값 깜빡임 방지). NaN 방어는 countUp 내부.
  const totalEl = panelEl.querySelector('.score-total-value');
  if (totalEl) {
    totalCounter.shown = 0;
    totalEl.textContent = fmtScore(0);
    countUp(totalEl, totalCounter, total, fmtScore);
  }
}

/**
 * 승리 화면의 "다음 스테이지" 버튼 노출/문구 갱신.
 * 승리로 다음 스테이지가 해금됐고(§14.3, progress가 game:won 이전에 반영) 그 인덱스가
 * 실재 LEVELS 범위 안일 때만 노출한다.
 */
function updateNextButton() {
  if (!btnNextVictory) return;
  const next = currentStageIndex + 1;
  const canGoNext = next < totalStages() && isUnlocked(next);
  btnNextVictory.classList.toggle('hidden', !canGoNext);
  if (canGoNext) btnNextVictory.dataset.stage = String(next);
}

/** DOM 바인딩 + 구독 등록. main이 1회 호출. */
export function initScreens() {
  titleEl = document.getElementById('screen-title');
  victoryEl = document.getElementById('screen-victory');
  defeatEl = document.getElementById('screen-defeat');

  const btnStart = document.getElementById('btn-start');
  const btnRestartV = document.getElementById('btn-restart-victory');
  const btnRestartD = document.getElementById('btn-restart-defeat');

  if (titleEl && btnStart) {
    injectBody(titleEl, btnStart, `
      <h1 class="logo">크리스탈 가드</h1>
      <p class="logo-sub">Crystal Guard</p>
      <ul class="howto">
        <li>먼저 스테이지를 고르세요 — 스테이지를 클리어하면 다음 스테이지가 열립니다</li>
        <li>하단 상점에서 타워를 골라 잔디 타일에 배치 (취소: 우클릭·ESC·배치 취소 버튼)</li>
        <li>터치 화면에서는 1탭 = 위치 미리보기, 같은 칸을 한 번 더 탭 = 건설 확정</li>
        <li>몬스터가 수정에 도달하면 라이프가 깎입니다. 라이프 0 = 패배!</li>
      </ul>`);
    btnStart.textContent = '게임 시작';
    btnStart.addEventListener('click', () => emit('ui:start-requested', {}));
  }

  // ── 승리 화면: 점수 패널 + 액션 버튼 행(다음/재도전/스테이지 선택) ──
  if (victoryEl && btnRestartV) {
    const vBody = injectBody(victoryEl, btnRestartV, `
      <h1 class="result-title win">승리!</h1>
      <p class="result-sub">수정을 지켜냈습니다</p>
      <div class="score-panel" id="victory-score"></div>
      <p class="stats" id="victory-stats"></p>`);
    victoryStatsEl = vBody.querySelector('#victory-stats');
    victoryScoreEl = vBody.querySelector('#victory-score');

    const actions = document.createElement('div');
    actions.className = 'result-actions';
    victoryEl.insertBefore(actions, btnRestartV);

    btnNextVictory = document.createElement('button');
    btnNextVictory.type = 'button';
    btnNextVictory.id = 'btn-next-victory';
    btnNextVictory.className = 'btn-primary hidden';
    btnNextVictory.textContent = '다음 스테이지 →';
    btnNextVictory.addEventListener('click', () => {
      const idx = Number(btnNextVictory.dataset.stage);
      if (Number.isInteger(idx)) emit('ui:stage-selected', { stageIndex: idx });
    });

    const btnStagesV = document.createElement('button');
    btnStagesV.type = 'button';
    btnStagesV.id = 'btn-stages-victory';
    btnStagesV.textContent = '스테이지 선택';
    btnStagesV.addEventListener('click', () => emit('ui:stage-select-requested', {}));

    btnRestartV.textContent = '재도전';
    actions.append(btnNextVictory, btnRestartV, btnStagesV);
    btnRestartV.addEventListener('click', () => emit('ui:restart-requested', {}));
  }

  // ── 패배 화면: 점수 패널 + 액션 버튼 행(재도전/스테이지 선택) ──
  if (defeatEl && btnRestartD) {
    const dBody = injectBody(defeatEl, btnRestartD, `
      <h1 class="result-title lose">패배</h1>
      <p class="result-sub">수정이 파괴되었습니다…</p>
      <div class="score-panel" id="defeat-score"></div>
      <p class="stats" id="defeat-stats"></p>`);
    defeatStatsEl = dBody.querySelector('#defeat-stats');
    defeatScoreEl = dBody.querySelector('#defeat-score');

    const actions = document.createElement('div');
    actions.className = 'result-actions';
    defeatEl.insertBefore(actions, btnRestartD);

    const btnStagesD = document.createElement('button');
    btnStagesD.type = 'button';
    btnStagesD.id = 'btn-stages-defeat';
    btnStagesD.textContent = '스테이지 선택';
    btnStagesD.addEventListener('click', () => emit('ui:stage-select-requested', {}));

    btnRestartD.textContent = '재도전';
    actions.append(btnRestartD, btnStagesD);
    btnRestartD.addEventListener('click', () => emit('ui:restart-requested', {}));
  }

  // ── 구독 ──

  // 스테이지 컨텍스트 캐시 — game:started보다 먼저 도착(§14.1). 다음 스테이지 버튼 근거.
  on('stage:started', (p) => {
    const i = Number(p && p.stageIndex);
    if (Number.isFinite(i)) currentStageIndex = i;
  });

  // 판 시작 — 전 화면 숨김 + 이전 판 점수 캐시 무효화(§14.2 판당 1회 재도달 전제).
  on('game:started', () => {
    lastFinalized = null;
    lastRecord = null;
    hideAll();
  });

  // 점수 확정/최고기록 — game:won/over보다 먼저 도달(§14.2). 캐시만, 렌더는 결과 화면에서.
  on('score:finalized', (p) => {
    lastFinalized = p || null;
  });
  on('stage:record-updated', (p) => {
    lastRecord = p || null;
  });

  on('game:won', ({ kills, livesLeft } = {}) => {
    renderScorePanel(victoryScoreEl, 'won');
    updateNextButton();
    if (victoryStatsEl) {
      victoryStatsEl.textContent = `처치 ${fmt(kills)}마리 · 남은 라이프 ${fmt(livesLeft)}`;
    }
    showOnly(victoryEl);
  });

  on('game:over', ({ waveReached, kills } = {}) => {
    renderScorePanel(defeatScoreEl, 'over');
    if (defeatStatsEl) {
      defeatStatsEl.textContent =
        `도달 웨이브 ${fmt(waveReached)}/${WAVES.length || 10} · 처치 ${fmt(kills)}마리`;
    }
    showOnly(defeatEl);
  });
}
