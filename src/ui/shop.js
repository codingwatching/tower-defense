/**
 * @module ui/shop (ui-dev)
 * 하단 타워 상점 바 (DOM — #shop, .shop-item[data-tower], ID 계약 §7).
 * 아이콘은 tower_* 에셋 재사용, 가격은 TOWERS[type].levels[0].cost.
 * 골드 부족 시 disabled 속성 (AC-07). 비활성은 CSS pointer-events:none이므로
 * 클릭이 #shop 컨테이너로 통과 → 좌표로 버튼을 찾아 ui:error 발행 + 흔들림.
 *
 * 구독: gold:changed {gold} — 버튼 활성/비활성 갱신
 *      game:started {} — 선택 해제 + 활성 갱신
 *      tower:placed {} / input:cancel {} — 선택 하이라이트 해제
 * 발행: ui:error {reason: 'gold'} (비활성 버튼 클릭)
 *      (배치 모드 진입/취소는 placement.js 직접 호출 — 같은 ui 디렉토리 내 결합 허용)
 */
import { on, emit } from '../core/events.js';
import { get as getAsset } from '../core/assets.js';
import { getGold } from '../systems/economy.js';
import { TOWERS } from '../data/towers.js';
import { enterPlacementMode, cancelPlacementMode } from './placement.js';

/** 카드 툴팁용 역할 한 줄 (UI 카피 — 수치 아님). */
const ROLE_HINT = {
  arrow: '빠른 단일 공격',
  cannon: '광역 폭발',
  frost: '적 이동 감속',
  arcane: '장거리 고위력'
};

let items = [];          // .shop-item 버튼 4개
let selectedType = null; // 배치 모드로 진입한 타워 타입
let lastGold = 0;

function num(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

function flash(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function costOf(type) {
  return TOWERS[type]?.levels?.[0]?.cost;
}

function drawIcon(canvas, type, def) {
  const ctx = canvas.getContext('2d');
  try {
    const img = getAsset(def?.assetKey ?? `tower_${type}`);
    if (img) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return;
    }
  } catch (_) {
    // assets 스텁/로드 전 — 이니셜 폴백으로 진행
  }
  ctx.fillStyle = '#3a4a6b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#cfe3ff';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    def?.nameKo?.[0] ?? type[0].toUpperCase(),
    canvas.width / 2, canvas.height / 2 + 1
  );
}

function buildCard(btn) {
  const type = btn.dataset.tower;
  const def = TOWERS[type];
  const cost = costOf(type);

  btn.textContent = '';
  const icon = document.createElement('canvas');
  icon.width = 48;
  icon.height = 48;
  icon.className = 'shop-icon';
  drawIcon(icon, type, def);

  const info = document.createElement('span');
  info.className = 'shop-info';
  const name = document.createElement('span');
  name.className = 'shop-name';
  name.textContent = def?.nameKo ?? type;
  const costEl = document.createElement('span');
  costEl.className = 'shop-cost';
  costEl.textContent = Number.isFinite(cost) ? `${cost} G` : '? G';
  info.append(name, costEl);

  btn.append(icon, info);
  btn.title = `${def?.nameKo ?? type} — ${ROLE_HINT[type] ?? ''}`;
}

function refresh(gold) {
  lastGold = num(gold, lastGold);
  for (const btn of items) {
    const cost = costOf(btn.dataset.tower);
    btn.disabled = !Number.isFinite(cost) || lastGold < cost;
  }
}

function select(type) {
  selectedType = type;
  for (const b of items) b.classList.toggle('selected', b.dataset.tower === type);
  enterPlacementMode(type);
}

function deselect() {
  if (selectedType === null) return;
  selectedType = null;
  for (const b of items) b.classList.remove('selected');
}

function buttonAt(x, y) {
  return items.find((b) => {
    const r = b.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
}

function onShopClick(e) {
  const btn =
    (e.target instanceof Element && e.target.closest('.shop-item')) ||
    buttonAt(e.clientX, e.clientY);
  if (!btn) return;

  if (btn.disabled) {
    emit('ui:error', { reason: 'gold' });
    flash(btn, 'shake');
    return;
  }

  const type = btn.dataset.tower;
  if (selectedType === type) {
    // 같은 카드 재클릭 = 배치 모드 취소
    cancelPlacementMode();
    deselect();
  } else {
    select(type);
  }
}

/** DOM 바인딩 + 구독 등록. main이 1회 호출. */
export function initShop() {
  const shopEl = document.getElementById('shop');
  items = [...shopEl.querySelectorAll('.shop-item')];
  items.forEach(buildCard);
  refresh(num(getGold(), 0));

  shopEl.addEventListener('click', onShopClick);

  on('gold:changed', ({ gold } = {}) => refresh(gold));
  on('game:started', () => {
    deselect();
    refresh(num(getGold(), lastGold));
  });
  on('tower:placed', deselect);
  on('input:cancel', deselect);
}
