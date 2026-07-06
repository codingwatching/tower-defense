/**
 * @module ui/panel (ui-dev)
 * 타워 정보 패널 (DOM — #tower-panel, #btn-upgrade, #btn-sell, ID 계약 §7).
 * 표시: 현재 레벨/능력치(TOWERS[type].levels[level-1]), 다음 레벨 미리보기,
 *      업그레이드 비용, 판매 환불액 = floor(invested * BALANCE.sellRatio).
 * 비활성 조건: 골드 부족 또는 레벨 3 (AC-10). 비활성 버튼은 pointer-events:none —
 * 클릭이 #tower-panel로 통과하므로 좌표로 버튼을 찾아 ui:error 발행.
 *
 * 구독: tower:selected {tower} — 패널 표시 / tower:deselected {} — 숨김
 *      tower:upgraded {tower} — 갱신 / tower:sold {} — 숨김
 *      gold:changed {gold} — 버튼 활성 갱신 / game:started {} — 숨김
 * 발행: ui:upgrade-requested {towerId} / ui:sell-requested {towerId}
 *      ui:error {reason: 'gold'|'max-level'}
 */
import { on, emit } from '../core/events.js';
import { getGold } from '../systems/economy.js';
import { TOWERS } from '../data/towers.js';
import { BALANCE } from '../data/balance.js';

const STAGE_W = 960;
const STAGE_H = 640;
const MARGIN = 8;       // 패널-스테이지 가장자리 최소 간격 px
const OFFSET = 44;      // 타워 중심-패널 가로 간격 px

let panelEl, infoEl, btnUp, btnSell;
let current = null;     // 표시 중인 타워 (tower:selected 페이로드 참조)
let lastGold = 0;

function num(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

function fmt(v) {
  return Number.isFinite(v) ? String(v) : '?';
}

function flash(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function statRow(label, value) {
  return `<div class="panel-stat"><span>${label}</span><b>${value}</b></div>`;
}

function render() {
  if (!current) return;
  const def = TOWERS[current.type] ?? {};
  const level = num(current.level, 1);
  const spec = def.levels?.[level - 1] ?? {};
  const next = def.levels?.[level]; // undefined = 최대 레벨

  let html = `<div class="panel-title">${def.nameKo ?? current.type}` +
    `<span class="panel-level">Lv.${level}</span></div>`;
  html += statRow('피해', fmt(spec.damage));
  html += statRow('사거리', fmt(spec.range));
  html += statRow(
    '공속',
    Number.isFinite(spec.cooldown) && spec.cooldown > 0
      ? `${(1 / spec.cooldown).toFixed(1)}/초`
      : '?'
  );
  const slow = def.projectile?.slow;
  if (slow) {
    html += statRow('감속', `${Math.round((1 - num(slow.factor, 1)) * 100)}% · ${fmt(slow.duration)}초`);
  }
  if (def.projectile?.splashRadius > 0) {
    html += statRow('스플래시', `${def.projectile.splashRadius}px`);
  }
  if (next) {
    html += `<div class="panel-next">다음 레벨: 피해 ${fmt(spec.damage)} → ${fmt(next.damage)}` +
      ` · 사거리 ${fmt(spec.range)} → ${fmt(next.range)}</div>`;
  }
  infoEl.innerHTML = html;

  if (next) {
    btnUp.textContent = `업그레이드 ${fmt(next.cost)} G`;
    btnUp.disabled = !Number.isFinite(next.cost) || lastGold < next.cost;
    btnUp.dataset.reason = 'gold';
  } else {
    btnUp.textContent = '최대 레벨';
    btnUp.disabled = true;
    btnUp.dataset.reason = 'max-level';
  }

  const refund = Math.floor(num(current.invested, 0) * num(BALANCE.sellRatio, 0.7));
  btnSell.textContent = `판매 +${refund} G`;
  btnSell.disabled = false;
}

function positionNear(tower) {
  const w = panelEl.offsetWidth;
  const h = panelEl.offsetHeight;
  const tx = num(tower.x, STAGE_W / 2);
  const ty = num(tower.y, STAGE_H / 2);

  let left = tx + OFFSET;
  if (left + w > STAGE_W - MARGIN) left = tx - OFFSET - w;
  left = Math.max(MARGIN, Math.min(STAGE_W - w - MARGIN, left));
  const top = Math.max(MARGIN, Math.min(STAGE_H - h - MARGIN, ty - h / 2));

  panelEl.style.left = `${left}px`;
  panelEl.style.top = `${top}px`;
}

function show(tower) {
  current = tower;
  panelEl.classList.remove('hidden');
  render();
  positionNear(tower);
}

function hide() {
  current = null;
  panelEl.classList.add('hidden');
}

function buttonAt(x, y) {
  for (const b of [btnUp, btnSell]) {
    const r = b.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return b;
  }
  return null;
}

function onPanelClick(e) {
  if (!current) return;
  const btn =
    (e.target instanceof Element && e.target.closest('button')) ||
    buttonAt(e.clientX, e.clientY);

  if (btn === btnUp) {
    if (btnUp.disabled) {
      emit('ui:error', {
        reason: btnUp.dataset.reason === 'max-level' ? 'max-level' : 'gold'
      });
      flash(btnUp, 'shake');
      return;
    }
    emit('ui:upgrade-requested', { towerId: current.id });
  } else if (btn === btnSell && !btnSell.disabled) {
    emit('ui:sell-requested', { towerId: current.id });
  }
}

/** DOM 바인딩 + 구독 등록. main이 1회 호출. */
export function initPanel() {
  panelEl = document.getElementById('tower-panel');
  btnUp = document.getElementById('btn-upgrade');
  btnSell = document.getElementById('btn-sell');

  infoEl = document.createElement('div');
  infoEl.id = 'panel-info';
  panelEl.insertBefore(infoEl, btnUp);

  panelEl.addEventListener('click', onPanelClick);

  on('tower:selected', ({ tower } = {}) => {
    if (!tower) return;
    lastGold = num(getGold(), lastGold);
    show(tower);
  });

  on('tower:deselected', hide);
  on('tower:sold', hide);
  on('game:started', hide);

  on('tower:upgraded', ({ tower } = {}) => {
    if (current && tower && tower.id === current.id) {
      current = tower;
      render();
      positionNear(tower);
    }
  });

  on('gold:changed', ({ gold } = {}) => {
    lastGold = num(gold, lastGold);
    if (current) render();
  });
}
