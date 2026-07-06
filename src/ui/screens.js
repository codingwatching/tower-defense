/**
 * @module ui/screens (ui-dev)
 * 오버레이 화면 (DOM — #screen-title/#screen-victory/#screen-defeat, ID 계약 §7).
 * 타이틀: 로고(CSS 텍스트 — 계약 §5: UI 전용 이미지 없음) + 조작 설명 4줄(터치 포함) + #btn-start.
 * 승리: 통계(kills, livesLeft) + #btn-restart-victory. 패배: 도달 웨이브 + #btn-restart-defeat.
 *
 * 구독: game:started {} — 전 화면 숨김
 *      game:won {kills, livesLeft} / game:over {waveReached, kills}
 * 발행: ui:start-requested {} / ui:restart-requested {}
 */
import { on, emit } from '../core/events.js';
import { WAVES } from '../data/waves.js';

let titleEl, victoryEl, defeatEl;
let victoryStatsEl, defeatStatsEl;

function fmt(v) {
  return Number.isFinite(v) ? String(v) : '?';
}

function showOnly(target) {
  for (const el of [titleEl, victoryEl, defeatEl]) {
    el.classList.toggle('hidden', el !== target);
  }
}

function hideAll() {
  for (const el of [titleEl, victoryEl, defeatEl]) el.classList.add('hidden');
}

function injectBody(screenEl, beforeBtn, html) {
  const body = document.createElement('div');
  body.className = 'screen-body';
  body.innerHTML = html;
  screenEl.insertBefore(body, beforeBtn);
  return body;
}

/** DOM 바인딩 + 구독 등록. main이 1회 호출. */
export function initScreens() {
  titleEl = document.getElementById('screen-title');
  victoryEl = document.getElementById('screen-victory');
  defeatEl = document.getElementById('screen-defeat');

  const btnStart = document.getElementById('btn-start');
  const btnRestartV = document.getElementById('btn-restart-victory');
  const btnRestartD = document.getElementById('btn-restart-defeat');

  injectBody(titleEl, btnStart, `
    <h1 class="logo">크리스탈 가드</h1>
    <p class="logo-sub">Crystal Guard</p>
    <ul class="howto">
      <li>하단 상점에서 타워를 골라 잔디 타일에 배치하세요 (취소: 우클릭·ESC·배치 취소 버튼)</li>
      <li>터치 화면에서는 1탭 = 위치 미리보기, 같은 칸을 한 번 더 탭 = 건설 확정</li>
      <li>웨이브 시작 버튼으로 몬스터 무리를 맞이하세요 — 총 ${WAVES.length || 10}웨이브</li>
      <li>몬스터가 수정에 도달하면 라이프가 깎입니다. 라이프 0 = 패배!</li>
    </ul>`);

  const vBody = injectBody(victoryEl, btnRestartV, `
    <h1 class="result-title win">승리!</h1>
    <p class="result-sub">수정을 지켜냈습니다</p>
    <p class="stats" id="victory-stats"></p>`);
  victoryStatsEl = vBody.querySelector('#victory-stats');

  const dBody = injectBody(defeatEl, btnRestartD, `
    <h1 class="result-title lose">패배</h1>
    <p class="result-sub">수정이 파괴되었습니다…</p>
    <p class="stats" id="defeat-stats"></p>`);
  defeatStatsEl = dBody.querySelector('#defeat-stats');

  btnStart.addEventListener('click', () => emit('ui:start-requested', {}));
  btnRestartV.addEventListener('click', () => emit('ui:restart-requested', {}));
  btnRestartD.addEventListener('click', () => emit('ui:restart-requested', {}));

  on('game:started', hideAll);

  on('game:won', ({ kills, livesLeft } = {}) => {
    victoryStatsEl.textContent =
      `처치 ${fmt(kills)}마리 · 남은 라이프 ${fmt(livesLeft)}`;
    showOnly(victoryEl);
  });

  on('game:over', ({ waveReached, kills } = {}) => {
    defeatStatsEl.textContent =
      `도달 웨이브 ${fmt(waveReached)}/${WAVES.length || 10} · 처치 ${fmt(kills)}마리`;
    showOnly(defeatEl);
  });
}
