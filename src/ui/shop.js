/**
 * @module ui/shop (ui-dev)
 * 하단 타워 상점 바 (DOM — #shop, .shop-item[data-tower], ID 계약 §7).
 * 아이콘은 tower_{type}_lv1 에셋(assetKeys[0] — §4.1-v2, v1 assetKey 폐지)의 idle 0프레임 재사용.
 *   (v4 §16.2) 타워 12키가 {img,atlas}로 승격되어 get()은 파랑 사각으로 깨진다 →
 *   getAnim + seqFrames(idle)[0] 로 스트립에서 첫 프레임만 크롭한다. 정적 강등 키(아틀라스
 *   로드 실패)에서도 seqFrames가 길이≥1을 보장하므로 분기 없이 안전.
 * 가격은 TOWERS[type].levels[0].cost.
 * 골드 부족 시 disabled 속성 (AC-07). 비활성은 CSS pointer-events:none이므로
 * 클릭이 #shop 컨테이너로 통과 → 좌표로 버튼을 찾아 ui:error 발행 + 흔들림.
 * #btn-cancel-placement 클릭 = 배치 취소 + 하이라이트 해제 (§11 취소 수단 —
 * 표시/숨김은 placement.js 소관, 같은 ui 디렉토리 내 결합 허용).
 *
 * 구독: gold:changed {gold} — 버튼 활성/비활성 갱신
 *      game:started {} — 선택 해제 + 활성 갱신
 *      tower:placed {} / input:cancel {} — 선택 하이라이트 해제
 * 발행: ui:error {reason: 'gold'} (비활성 버튼 클릭)
 *      (배치 모드 진입/취소는 placement.js 직접 호출 — 같은 ui 디렉토리 내 결합 허용)
 */
import { on, emit } from '../core/events.js';
import { getAnim, seqFrames } from '../core/assets.js';
import { getGold } from '../systems/economy.js';
import { TOWERS } from '../data/towers.js';
import { enterPlacementMode, cancelPlacementMode } from './placement.js';
import { shakeX } from './anim.js';

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

function costOf(type) {
  return TOWERS[type]?.levels?.[0]?.cost;
}

/**
 * 승격 타워 키의 idle 0프레임을 소스 시트에서 크롭할 정보 (§16.2, tower.js `_frameOf`와 동일 math).
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

function drawIcon(canvas, type, def) {
  const ctx = canvas.getContext('2d');
  try {
    // 상점 아이콘 = 건설 결과물인 Lv1 스프라이트의 idle 0프레임 (§5·§16.2 — UI 전용 이미지 없음)
    const f = idleFrame0(def?.assetKeys?.[0] ?? `tower_${type}_lv1`);
    ctx.drawImage(f.image, f.sx, f.sy, f.sw, f.sh, 0, 0, canvas.width, canvas.height);
    return;
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
    shakeX(btn); // (v5) 골드 부족 흔들림 강화 — anime.js 탄성 감쇠(태스크 #6)
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

  // 배치 취소 버튼 (§11) — 취소 로직은 상점의 "같은 카드 재탭" 분기와 동일 경로
  document.getElementById('btn-cancel-placement')?.addEventListener('click', () => {
    cancelPlacementMode();
    deselect();
  });

  on('gold:changed', ({ gold } = {}) => refresh(gold));
  on('game:started', () => {
    deselect();
    refresh(num(getGold(), lastGold));
  });
  on('tower:placed', deselect);
  on('input:cancel', deselect);
}
