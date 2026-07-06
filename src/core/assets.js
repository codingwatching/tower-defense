/**
 * @module core/assets (engine-dev)
 * 에셋 로더 + 플레이스홀더 폴백 + 애니메이션 아틀라스. 계약 §5(v2 42키), §8, §10, §12.
 *
 * 매니페스트 값 형식 (§5-v2 — 로더는 JSON 존재를 추측(probe)하지 않는다):
 *   - 문자열 경로 → 정적 이미지
 *   - {img, atlas} → 걷기 스트립 PNG + 아틀라스 JSON 쌍
 *
 * get(key)는 **항상 그릴 수 있는 것**을 반환한다:
 *   1. 로딩 성공 → 이미지
 *   2. 불투명 배경(#FF00FF 크로마키) → 로드 시점 캔버스로 픽셀 제거 후 반환
 *   3. 로딩 실패/파일 없음 → 키 접두사별 단색 플레이스홀더 + 콘솔 경고 1회
 *      tower_*=파랑 사각 / enemy_*=빨강 원 / proj_*=노랑 점 /
 *      tile_grass*=초록 사각 / tile_path*=갈색 사각 / 기타(deco_/goal_/entrance_)=회색 사각
 *
 * getAnim(key)는 **항상 {image, atlas}**를 반환한다 (§10 강등 체인):
 *   ① 쌍 정상 → 스트립 + 아틀라스 JSON
 *   ② 아틀라스 실패/미등재 → 대응 정적 이미지(예: enemy_goblin_walk → enemy_goblin)
 *      + 합성 단일 프레임 아틀라스 {frameW, frameH, frames:1, fps:1, sequences:{walk:[0]}}
 *   ③ 이미지도 실패 → 카테고리 플레이스홀더 + 합성 아틀라스 (②와 동일 경로 — get이 처리)
 * draw 호출부는 폴백·강등 여부를 신경 쓰지 않는다. 게임은 에셋 0개로도 실행 가능 (AC-21·29).
 *
 * 경로: 매니페스트의 상대 경로를 그대로 사용 — 선행 / 조립 금지 (§12 GitHub Pages 서브패스).
 */

/** @typedef {{frameW: number, frameH: number, frames: number, fps: number, sequences: Record<string, number[]>}} Atlas */

/** @type {Map<string, HTMLImageElement | HTMLCanvasElement>} 정적 drawable */
const store = new Map();
/** @type {Map<string, {image: HTMLImageElement | HTMLCanvasElement, atlas: Atlas}>} */
const animStore = new Map();
/** get/getAnim 폴백 경고를 키당 1회로 제한. */
const warnedKeys = new Set();

const PLACEHOLDER_SIZE = 64;

/**
 * 매니페스트 전체 프리로드. main이 부트스트랩에서 1회 await.
 * 실패해도 reject하지 않는다 — 실패 항목은 폴백/강등으로 진행하고 목록만 반환.
 * @param {Record<string, string | {img: string, atlas: string}>} manifest
 * @returns {Promise<{loaded: number, failed: string[]}>}
 *   failed 표기: 정적 키는 `키`, 쌍의 부분 실패는 `키.img` / `키.atlas`
 */
export async function loadAssets(manifest) {
  const entries = Object.entries(manifest || {});
  /** @type {string[]} */
  const failed = [];
  let loaded = 0;

  await Promise.all(
    entries.map(async ([key, spec]) => {
      if (typeof spec === 'string') {
        try {
          store.set(key, stripChromaKey(key, await loadImage(spec)));
          loaded++;
        } catch {
          failed.push(key);
        }
        return;
      }
      // {img, atlas} 쌍 — 병렬 로드, 부분 실패는 강등 체인으로 (§10)
      const [imgRes, atlasRes] = await Promise.allSettled([loadImage(spec.img), loadAtlas(spec.atlas)]);
      const imgOk = imgRes.status === 'fulfilled';
      const atlasOk = atlasRes.status === 'fulfilled';
      if (imgOk && atlasOk) {
        animStore.set(key, { image: stripChromaKey(key, imgRes.value), atlas: atlasRes.value });
        loaded++;
        return;
      }
      // 스트립만으로는 프레임 정보가 없어 그릴 수 없다 — 쌍이 깨지면 통째로 강등(getAnim ②③)
      if (!imgOk) failed.push(`${key}.img`);
      if (!atlasOk) failed.push(`${key}.atlas`);
    })
  );

  if (failed.length > 0) {
    console.warn(
      `[assets] ${failed.length}건 로딩 실패 — 플레이스홀더/강등으로 진행: ${failed.join(', ')}`
    );
  }
  return { loaded, failed };
}

/**
 * 로드된 정적 drawable 반환. loadAssets 완료 후에만 유효.
 * 애니메이션 키({img,atlas} 등재 키)는 getAnim을 쓸 것 — get은 정적 전용.
 * @param {string} key - MANIFEST 키 (§5의 42키 외 사용 금지)
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
 * 애니메이션 조회 — 항상 {image, atlas} 반환 (§10 강등 체인 ①→②→③).
 * 강등 시 대응 정적 키(말미 '_walk' 제거)로 get()을 경유하므로
 * 정적 이미지가 있으면 그것을, 없으면 카테고리 플레이스홀더를 단일 프레임으로 쓴다.
 * @param {string} key - 예: 'enemy_goblin_walk'
 * @returns {{image: HTMLImageElement | HTMLCanvasElement, atlas: Atlas}}
 */
export function getAnim(key) {
  const hit = animStore.get(key);
  if (hit) return hit;

  const baseKey = key.replace(/_walk$/, '');
  if (!warnedKeys.has(`anim:${key}`)) {
    warnedKeys.add(`anim:${key}`);
    console.warn(`[assets] '${key}' 애니메이션 미가용 — '${baseKey}' 정적 단일 프레임으로 강등`);
  }
  const image = get(baseKey);
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const fallback = {
    image,
    atlas: { frameW: w, frameH: h, frames: 1, fps: 1, sequences: { walk: [0] } },
  };
  animStore.set(key, fallback); // 키당 1회만 합성
  return fallback;
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
 * 아틀라스 JSON 로드 + 검증 (§10 형식). 실패/형식 불량은 reject → 강등 체인.
 * @param {string} url - 상대 경로 (§12)
 * @returns {Promise<Atlas>}
 */
async function loadAtlas(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`atlas fetch ${res.status}: ${url}`);
  const json = await res.json();
  const frameW = Number(json.frameW);
  const frameH = Number(json.frameH);
  const frames = Number(json.frames);
  if (!Number.isFinite(frameW) || frameW <= 0 || !Number.isFinite(frameH) || frameH <= 0 ||
      !Number.isInteger(frames) || frames < 1) {
    throw new Error(`atlas 형식 불량: ${url}`);
  }
  const fps = Number.isFinite(Number(json.fps)) && Number(json.fps) > 0 ? Number(json.fps) : 8; // §10 기본 8
  const sequences =
    json.sequences && typeof json.sequences === 'object'
      ? json.sequences
      : { walk: Array.from({ length: frames }, (_, i) => i) };
  return { frameW, frameH, frames, fps, sequences };
}

/**
 * 불투명 #FF00FF 배경 제거. 배경이 아니면 원본 이미지를 그대로 반환.
 * 이미 투명 픽셀이 있는 PNG는 손대지 않는다 — 네 모서리가 전부 불투명 마젠타일 때만
 * 배경으로 간주 (arcane 계열의 정상적인 보라/자주색 스프라이트 오폭 방지).
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
 * 키 접두사별 단색 플레이스홀더 캔버스 (계약 §5 폴백 표 — v2: tile_grass·tile_path 변형 키 포함).
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
  } else if (key.startsWith('tile_grass')) {
    ctx.fillStyle = '#5aa74a'; // 잔디 초록 (변형 포함)
    ctx.fillRect(0, 0, s, s);
  } else if (key.startsWith('tile_path')) {
    ctx.fillStyle = '#8b6f47'; // 길 갈색 (방향 변형 포함)
    ctx.fillRect(0, 0, s, s);
  } else {
    ctx.fillStyle = '#8a8a8a'; // deco_/goal_/entrance_/미지 키 = 회색 사각
    ctx.fillRect(0, 0, s, s);
  }
  return cnv;
}
