/**
 * @module ui/panel (ui-dev)
 * 타워 정보 패널 (DOM — #tower-panel, #btn-upgrade, #btn-sell, ID 계약 §7).
 * 표시: 현재 레벨/능력치(TOWERS[type].levels[level-1] — 레벨별 splashRadius/slow
 *      오버라이드 반영, §4.1-v2), 다음 레벨 미리보기(변경 축만 diff로),
 *      Lv3 메커니즘 이름·설명(mechanism.nameKo/desc — 현재 Lv3면 활성 표기,
 *      Lv2→3 업그레이드 전이면 "해금" 예고 — AC-28),
 *      업그레이드 비용, 판매 환불액 = floor(invested * BALANCE.sellRatio).
 * 위치: 논리 960×640 좌표를 #stage의 CSS 표시 크기로 환산해 배치 — 반응형 축소
 *      상태에서도 스테이지(=뷰포트) 안에 클램프 (§11).
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

let panelEl, infoEl, btnUp, btnSell, stageEl;
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

/** 레벨별 slow 오버라이드 반영값 (§4.1-v2 — 없으면 projectile 기본값). */
function slowOf(def, spec) {
  return spec?.slow ?? def.projectile?.slow ?? null;
}

/** 레벨별 splashRadius 오버라이드 반영값 (§4.1-v2). */
function splashOf(def, spec) {
  return Number.isFinite(spec?.splashRadius)
    ? spec.splashRadius
    : num(def.projectile?.splashRadius, 0);
}

function fmtRate(cooldown) {
  return Number.isFinite(cooldown) && cooldown > 0
    ? `${(1 / cooldown).toFixed(1)}/초`
    : '?';
}

function fmtSlow(slow) {
  return `${Math.round((1 - num(slow.factor, 1)) * 100)}% · ${fmt(slow.duration)}초`;
}

function render() {
  if (!current) return;
  const def = TOWERS[current.type] ?? {};
  const level = num(current.level, 1);
  const spec = def.levels?.[level - 1] ?? {};
  const next = def.levels?.[level]; // undefined = 최대 레벨
  const mech = def.mechanism;

  let html = `<div class="panel-title">${def.nameKo ?? current.type}` +
    `<span class="panel-level">Lv.${level}</span></div>`;
  html += statRow('피해', fmt(spec.damage));
  html += statRow('사거리', fmt(spec.range));
  html += statRow('공속', fmtRate(spec.cooldown));
  const slow = slowOf(def, spec);
  if (slow) html += statRow('감속', fmtSlow(slow));
  const splash = splashOf(def, spec);
  if (splash > 0) html += statRow('스플래시', `${splash}px`);

  if (!next && mech) {
    // 현재 Lv3 — 고유 메커니즘 활성 표기 (AC-28)
    html += `<div class="panel-mech"><b>${mech.nameKo ?? mech.type}</b> — ${mech.desc ?? ''}</div>`;
  }

  if (next) {
    // 변경되는 축만 diff — Lv2 비대칭 축(공속/스플래시/감속/사거리)이 드러난다 (AC-28)
    const parts = [];
    if (next.damage !== spec.damage) {
      parts.push(`피해 ${fmt(spec.damage)} → ${fmt(next.damage)}`);
    }
    if (next.range !== spec.range) {
      parts.push(`사거리 ${fmt(spec.range)} → ${fmt(next.range)}`);
    }
    if (next.cooldown !== spec.cooldown) {
      parts.push(`공속 ${fmtRate(spec.cooldown)} → ${fmtRate(next.cooldown)}`);
    }
    const nextSplash = splashOf(def, next);
    if (nextSplash !== splash) {
      parts.push(`스플래시 ${splash} → ${nextSplash}px`);
    }
    const nextSlow = slowOf(def, next);
    if (nextSlow && (!slow ||
        nextSlow.factor !== slow.factor || nextSlow.duration !== slow.duration)) {
      parts.push(`감속 ${slow ? fmtSlow(slow) + ' → ' : ''}${fmtSlow(nextSlow)}`);
    }
    if (parts.length) {
      html += `<div class="panel-next">다음 레벨: ${parts.join(' · ')}</div>`;
    }
    if (level + 1 === 3 && mech) {
      // Lv2 → Lv3 업그레이드 예고 — 무엇이 해금되는지 버튼 누르기 전에 보여준다 (AC-28)
      html += `<div class="panel-mech unlock"><b>Lv3 해금 — ${mech.nameKo ?? mech.type}</b>` +
        `: ${mech.desc ?? ''}</div>`;
    }
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
  // 논리 좌표(960×640) → #stage CSS 표시 크기 환산 — 반응형 축소에서도 스테이지 안 클램프 (§11)
  const stageW = stageEl?.clientWidth || STAGE_W;
  const stageH = stageEl?.clientHeight || STAGE_H;
  const scale = stageW / STAGE_W;
  const w = panelEl.offsetWidth;
  const h = panelEl.offsetHeight;
  const tx = num(tower.x, STAGE_W / 2) * scale;
  const ty = num(tower.y, STAGE_H / 2) * scale;
  const off = OFFSET * scale;

  let left = tx + off;
  if (left + w > stageW - MARGIN) left = tx - off - w;
  left = Math.max(MARGIN, Math.min(stageW - w - MARGIN, left));
  const top = Math.max(MARGIN, Math.min(stageH - h - MARGIN, ty - h / 2));

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
  stageEl = document.getElementById('stage');
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
