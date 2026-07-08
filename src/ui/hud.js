/**
 * @module ui/hud (ui-dev) — v3
 * 상단 HUD 바 (DOM — #hud, ID 계약 §7): 골드/라이프/웨이브(n/10)/점수(v3)/카운트다운,
 * 웨이브 시작·배속(1x/2x)·음소거 버튼.
 *
 * 구독: game:started {} / gold:changed {gold, delta} / lives:changed {lives, delta}
 *      wave:started {index, total} / wave:cleared {index, bonus} / wave:countdown {remaining}
 *      score:changed {score, delta, source} (v3) — 실시간 누적 점수 표시(§13.2 D18)
 * 발행: ui:wave-start-requested {} (#btn-wave-start)
 *      ui:speed-changed {multiplier: 1|2} (#btn-speed 토글)
 *      ui:mute-changed {muted} (#btn-mute 토글)
 */
import { on, emit } from '../core/events.js';
import { getGold, getLives } from '../systems/economy.js';
import { WAVES } from '../data/waves.js';

/** 이 값 이하이면 라이프 표시가 경고(점멸) 상태가 된다. */
const LOW_LIVES = 5;

let goldValueEl, livesValueEl, waveValueEl, scoreValueEl, countdownEl;
let btnWave, btnSpeed, btnMute;

let lastGold = 0;       // 마지막 유효 값 유지 — NaN/undefined 노출 금지
let lastLives = 0;
let lastScore = 0;
let waveTotal = 10;
let multiplier = 1;
let muted = false;

function num(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

/** 같은 클래스로 CSS 애니메이션을 재시작한다 (reflow 트릭). */
function flash(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function makeStat(container, label) {
  container.classList.add('hud-stat');
  container.innerHTML =
    `<span class="hud-label">${label}</span><span class="hud-value">0</span>`;
  return container.querySelector('.hud-value');
}

function setGold(gold) {
  lastGold = num(gold, lastGold);
  goldValueEl.textContent = String(lastGold);
}

function setLives(lives) {
  lastLives = num(lives, lastLives);
  livesValueEl.textContent = String(lastLives);
  livesValueEl.classList.toggle('danger', lastLives <= LOW_LIVES);
}

function setWave(index) {
  waveValueEl.textContent = `${num(index, 0)}/${waveTotal}`;
}

function setScore(score) {
  if (!scoreValueEl) return;
  lastScore = num(score, lastScore);
  scoreValueEl.textContent = lastScore.toLocaleString('ko-KR');
}

function setWaveButton(ready) {
  btnWave.disabled = !ready;
  btnWave.textContent = ready ? '웨이브 시작' : '진행 중…';
}

/** DOM 바인딩 + 구독 등록. main이 1회 호출. */
export function initHud() {
  goldValueEl = makeStat(document.getElementById('hud-gold'), '골드');
  livesValueEl = makeStat(document.getElementById('hud-lives'), '라이프');
  waveValueEl = makeStat(document.getElementById('hud-wave'), '웨이브');

  // (v3) 점수 표시(§7). architect가 index.html에 #hud-score를 추가(웨이브 옆). 아직 없으면
  // 웨이브 스탯 뒤에 생성해 스스로 언블록 — 이후 계약 반영되면 기존 노드 재사용(중복 없음).
  let scoreHost = document.getElementById('hud-score');
  if (!scoreHost) {
    scoreHost = document.createElement('span');
    scoreHost.id = 'hud-score';
    const waveHost = document.getElementById('hud-wave');
    if (waveHost && waveHost.parentNode) {
      waveHost.parentNode.insertBefore(scoreHost, waveHost.nextSibling);
    } else {
      (document.getElementById('hud') || document.body).appendChild(scoreHost);
    }
  }
  scoreValueEl = makeStat(scoreHost, '점수');

  countdownEl = document.getElementById('hud-countdown');
  btnWave = document.getElementById('btn-wave-start');
  btnSpeed = document.getElementById('btn-speed');
  btnMute = document.getElementById('btn-mute');

  waveTotal = WAVES.length || 10;
  setWave(0);
  setScore(0);
  setWaveButton(true);
  btnSpeed.textContent = '배속 1x';
  btnMute.textContent = '소리 켬';
  btnMute.setAttribute('aria-pressed', 'false');

  btnWave.addEventListener('click', () => {
    if (btnWave.disabled) return;
    emit('ui:wave-start-requested', {});
  });

  btnSpeed.addEventListener('click', () => {
    multiplier = multiplier === 1 ? 2 : 1;
    btnSpeed.textContent = `배속 ${multiplier}x`;
    btnSpeed.classList.toggle('active', multiplier === 2);
    emit('ui:speed-changed', { multiplier });
  });

  btnMute.addEventListener('click', () => {
    muted = !muted;
    btnMute.textContent = muted ? '소리 끔' : '소리 켬';
    btnMute.classList.toggle('active', muted);
    btnMute.setAttribute('aria-pressed', String(muted));
    emit('ui:mute-changed', { muted });
  });

  on('game:started', () => {
    setGold(num(getGold(), lastGold));
    setLives(num(getLives(), lastLives));
    setWave(0);
    setScore(0); // (v3) 스테이지 진입마다 점수 0 리셋 — score.js와 동일 트리거(§14.2)
    if (countdownEl) countdownEl.textContent = '';
    setWaveButton(true);
  });

  // (v3) 실시간 점수 — score.js가 처치/웨이브 가산마다 발행(§14.2). delta>0에 획득 펄스.
  on('score:changed', ({ score, delta } = {}) => {
    setScore(score);
    flash(scoreValueEl, num(delta, 0) < 0 ? 'pulse-spend' : 'pulse-gain');
  });

  on('gold:changed', ({ gold, delta } = {}) => {
    setGold(gold);
    flash(goldValueEl, num(delta, 0) < 0 ? 'pulse-spend' : 'pulse-gain');
  });

  on('lives:changed', ({ lives, delta } = {}) => {
    setLives(lives);
    if (num(delta, 0) < 0) flash(livesValueEl, 'pulse-hit');
  });

  on('wave:started', ({ index, total } = {}) => {
    waveTotal = num(total, waveTotal);
    setWave(index);
    countdownEl.textContent = '';
    setWaveButton(false);
  });

  on('wave:cleared', () => {
    setWaveButton(true);
  });

  on('wave:countdown', ({ remaining } = {}) => {
    const r = num(remaining, 0);
    countdownEl.textContent = r > 0 ? `다음 웨이브 ${r}초 전` : '';
  });
}
