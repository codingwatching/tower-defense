/**
 * @module core/assets (engine-dev)
 * 에셋 로더 + 플레이스홀더 폴백. 계약 §5, §8.
 *
 * get(key)는 **항상 그릴 수 있는 것**을 반환한다:
 *   1. 로딩 성공 → 이미지
 *   2. 불투명 배경(#FF00FF 크로마키) → 로드 시점 캔버스로 픽셀 제거 후 반환
 *   3. 로딩 실패/파일 없음 → 키 접두사별 단색 플레이스홀더 + 콘솔 경고 1회
 *      tower_*=파랑 사각 / enemy_*=빨강 원 / proj_*=노랑 점 /
 *      tile_grass=초록 사각 / tile_path=갈색 사각 / 기타(deco_/goal_/entrance_)=회색 사각
 * draw 호출부는 폴백을 신경 쓰지 않는다. 게임은 에셋 0개로도 실행 가능해야 함 (AC-21).
 *
 * 크로마키 판정: 이미 투명 픽셀이 있는 PNG는 손대지 않는다. 네 모서리가 전부 불투명
 * 마젠타(#FF00FF 근사)일 때만 배경으로 간주해 제거한다 — arcane 계열의 정상적인
 * 보라/자주색 스프라이트를 오폭하지 않기 위한 보수적 기준.
 */

/** @type {Map<string, HTMLImageElement | HTMLCanvasElement>} */
const store = new Map();
/** get(key) 실패 경고를 키당 1회로 제한. */
const warnedKeys = new Set();

const PLACEHOLDER_SIZE = 64;

/**
 * 매니페스트 전체 프리로드. main이 부트스트랩에서 1회 await.
 * 실패해도 reject하지 않는다 — 실패 키는 폴백으로 진행하고 목록만 반환.
 * @param {Record<string, string>} manifest - assets/manifest.js의 MANIFEST
 * @returns {Promise<{loaded: number, failed: string[]}>}
 */
export async function loadAssets(manifest) {
  const entries = Object.entries(manifest || {});
  /** @type {string[]} */
  const failed = [];

  await Promise.all(
    entries.map(async ([key, url]) => {
      try {
        const img = await loadImage(url);
        store.set(key, stripChromaKey(key, img));
      } catch {
        failed.push(key);
      }
    })
  );

  if (failed.length > 0) {
    console.warn(
      `[assets] ${failed.length}/${entries.length}개 로딩 실패 — 플레이스홀더로 진행: ${failed.join(', ')}`
    );
  }
  return { loaded: entries.length - failed.length, failed };
}

/**
 * 로드된 drawable 반환. loadAssets 완료 후에만 유효.
 * @param {string} key - MANIFEST 키 (§5의 18키 외 사용 금지)
 * @returns {HTMLImageElement | HTMLCanvasElement} 항상 drawable
 */
export function get(key) {
  const hit = store.get(key);
  if (hit) return hit;
  if (!warnedKeys.has(key)) {
    warnedKeys.add(key);
    console.warn(`[assets] '${key}' 미로딩 — 플레이스홀더 반환`);
  }
  const ph = makePlaceholder(key);
  store.set(key, ph); // 키당 1회만 생성
  return ph;
}

/**
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`load failed: ${url}`));
    img.src = url;
  });
}

/**
 * 불투명 #FF00FF 배경 제거. 배경이 아니면 원본 이미지를 그대로 반환.
 * @param {string} key
 * @param {HTMLImageElement} img
 * @returns {HTMLImageElement | HTMLCanvasElement}
 */
function stripChromaKey(key, img) {
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w === 0 || h === 0) return img;

    const cnv = document.createElement('canvas');
    cnv.width = w;
    cnv.height = h;
    const ctx = cnv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;

    const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
    if (!corners.every((i) => isChromaPixel(px, i) && px[i + 3] === 255)) return img;

    let removed = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (isChromaPixel(px, i)) {
        px[i + 3] = 0;
        removed++;
      }
    }
    if (removed === 0) return img;
    ctx.putImageData(data, 0, 0);
    console.info(`[assets] '${key}' 크로마키(#FF00FF) 배경 ${removed}px 제거`);
    return cnv;
  } catch (err) {
    // getImageData 실패(오염된 캔버스 등) — 원본이라도 그릴 수 있게 반환
    console.warn(`[assets] '${key}' 크로마키 처리 실패 — 원본 사용:`, err);
    return img;
  }
}

/**
 * #FF00FF 근사 판정 (무손실 PNG 전제, 안티앨리어싱 여유만 허용).
 * @param {Uint8ClampedArray} px @param {number} i - RGBA 시작 인덱스
 */
function isChromaPixel(px, i) {
  return px[i] >= 230 && px[i + 1] <= 50 && px[i + 2] >= 230;
}

/**
 * 키 접두사별 단색 플레이스홀더 캔버스 (계약 §5 폴백 표).
 * @param {string} key
 * @returns {HTMLCanvasElement}
 */
function makePlaceholder(key) {
  const s = PLACEHOLDER_SIZE;
  const cnv = document.createElement('canvas');
  cnv.width = s;
  cnv.height = s;
  const ctx = cnv.getContext('2d');

  if (key.startsWith('tower_')) {
    ctx.fillStyle = '#2f6fd0'; // 파랑 사각
    ctx.fillRect(s * 0.125, s * 0.125, s * 0.75, s * 0.75);
  } else if (key.startsWith('enemy_')) {
    ctx.fillStyle = '#d03030'; // 빨강 원
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.375, 0, Math.PI * 2);
    ctx.fill();
  } else if (key.startsWith('proj_')) {
    ctx.fillStyle = '#f0d020'; // 노랑 점
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
  } else if (key === 'tile_grass') {
    ctx.fillStyle = '#5aa74a'; // 잔디 초록
    ctx.fillRect(0, 0, s, s);
  } else if (key === 'tile_path') {
    ctx.fillStyle = '#8b6f47'; // 길 갈색
    ctx.fillRect(0, 0, s, s);
  } else {
    ctx.fillStyle = '#8a8a8a'; // deco_/goal_/entrance_/미지 키 = 회색 사각
    ctx.fillRect(0, 0, s, s);
  }
  return cnv;
}
