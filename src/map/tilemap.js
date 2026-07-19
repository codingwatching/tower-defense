/**
 * @module map/tilemap (map-designer)
 * 배경 레이어(레이어 10) — 타일 + 장식 + 도착 수정 + 동굴 입구.
 * 오프스크린 캔버스에 1회 캐시 후 매 프레임 복사 (td-code-standards 렌더 레이어 표).
 * get(key)는 항상 drawable을 반환하므로(폴백 계약) 여기서는 폴백을 신경 쓰지 않는다.
 *
 * v2 (계약 §4.5-v2, §13 D11 — 데이터·렌더만으로 시각 개선):
 * - 잔디: (col,row) 결정적 해시로 tile_grass / _clover / _flower 혼합 — 매 로드 동일 결과
 * - 길: tiles의 PATH 인접 관계로 직선 h/v·코너 ne/nw/se/sw 판별. 판별 불가 시 무방향
 *   tile_path 폴백. 좌우 필드 밖은 열림 취급 (입구·도착이 가장자리 너머로 이어지는 연출)
 * - 장식: LEVEL.decoTiles의 key로 렌더, 목록에 없는 DECO는 deco_rock (v1 하위 호환)
 *
 * v3 (계약 §4.7 — 스테이지 테마):
 * - tint: level.tint({color, alpha})가 있으면 완성된 배경 캐시 위에 색을 곱(multiply)해
 *   전역 시간대(대낮→오후→저녁→밤)를 연출. 게임플레이 무관(순수 시각).
 *   tint null·미기입이면 무적용.
 *
 * v4 (계약 §16.3/§16.4):
 * - 지형 패밀리: level.terrain(순수 시각 필드)의 water/dirt/cliff/lava를 배경 캐시에 렌더.
 *   water/dirt는 인접 비패밀리 셀 방향으로 전이(edge) 타일을 회전 배치. cliff/lava는 솔리드(융기/발광).
 *   (v4.0-a) 배치: water=DECO 전용 / cliff·lava=DECO|PATH(화산 도로 스킨) / dirt=무관 → 건설 판정 불변(§16.8),
 *   PATH·DECO는 비건설이라 AC-56 정합 유지. cliff/lava PATH는 방향 타일 위 반투명 accent(AC-31 흐름 보존).
 * - terrain-anim(레이어 15): 목표 수정(goal_crystal_anim, 전 5맵)과 animDecos(deco_*_anim)를
 *   drawTerrainAnim에서 개별 애니 draw. goal_crystal·animDecos 셀은 배경 캐시에서 제외(움직이는 요소만 15).
 *   프레임 선택은 performance.now() + 셀별 위상 오프셋(동기 맥동 방지, §16.2). 에셋 미도착 시 정적 폴백.
 *   (경계 갱신 §16.8: v3 "LEVELS[0] 픽셀 동일" 보증은 v4에서 무효 — 3D 재생성·goal 레이어 이동.
 *    대체 불변식 = waypoints·경로 타일 집합·GRASS 건설 셀 집합.)
 */

import { get, getAnim, seqFrames } from '../core/assets.js';
import { TILE, TILE_SIZE, COLS, ROWS, gridToPx } from './grid.js';

/** 입구·도착 오브젝트 드로우 크기 px (§5: 96×96, 타일 중심 기준) */
const OBJECT_SIZE = 96;

/** §5.4 장식 키 허용 집합 — decoTiles 검증용 */
const DECO_KEYS = new Set(['deco_rock', 'deco_bush', 'deco_flowers', 'deco_crystal_shard']);

/** (v4 §16.4) 지형 패밀리 → 기본 타일 키. */
const FAMILY_TILE = { water: 'tile_water', dirt: 'tile_dirt', cliff: 'tile_cliff', lava: 'tile_lava' };
/** (v4 §16.1-C) 전이(edge) 타일을 가진 패밀리만. cliff·lava는 전이 없음(솔리드 융기/발광). */
const FAMILY_EDGE = { water: 'tile_water_edge', dirt: 'tile_dirt_edge' };
/** (v4.0-a §16.4) cliff·lava는 DECO 또는 PATH 셀 스킨 허용(화산 도로). 배치 검증용. */
const CLIFF_LAVA = new Set(['cliff', 'lava']);
/** DECO 셀에서 정적 장식을 대체하는 솔리드 패밀리(지형이 곧 시각). water/cliff/lava. */
const SOLID_FAMILIES = new Set(['water', 'cliff', 'lava']);
/** (v4.0-a) cliff/lava PATH 스킨 accent 불투명도 — 방향 path 타일 위 반투명 합성(AC-31 방향 흐름 보존). 튜닝값. */
const PATH_SKIN_ALPHA = 0.5;
/** (v4 §16.1-B) terrain-anim 애니 장식 허용 키 — animDecos 검증용. */
const ANIM_DECO_KEYS = new Set(['deco_bush_anim', 'deco_crystal_shard_anim']);
/** (v4 §16.3) 목표 수정 애니 키(전 5맵). 정적 goal_crystal은 배경 캐시에서 제외됨. */
const GOAL_ANIM_KEY = 'goal_crystal_anim';
/** terrain-anim 위상 분산 폭(초) — 개체별 오프셋으로 동기 맥동 방지(§16.2). */
const ANIM_PHASE_SPREAD = 4;

/**
 * (v4) 전이 타일 4방 인접·회전각(라디안). edge 기본 방향 = 비패밀리 측이 북(위) →
 * 대상 방향으로 회전(북 0, 동 90°, 남 180°, 서 270°). 방향별 키 없이 1시트를 회전 재사용(§16.1-C).
 */
const EDGE_DIRS = [
  { dc: 0, dr: -1, rot: 0 },              // 북
  { dc: 1, dr: 0, rot: Math.PI / 2 },     // 동
  { dc: 0, dr: 1, rot: Math.PI },         // 남
  { dc: -1, dr: 0, rot: -Math.PI / 2 }    // 서
];

/** 잔디 변형 비율: 민무늬 60% / 클로버 25% / 들꽃 15% */
const GRASS_VARIANTS = [
  { key: 'tile_grass', below: 60 },
  { key: 'tile_grass_clover', below: 85 },
  { key: 'tile_grass_flower', below: 100 }
];

/** @type {HTMLCanvasElement | null} 배경 캐시 */
let cache = null;
/** @type {import('../data/levels.js').LevelDef | null} 레이어 15 draw용 현재 레벨 (buildBackground이 설정) */
let currentLevel = null;

/**
 * (col,row) → [0,100) 결정적 해시. Math.imul로 32비트 정밀도 고정 —
 * 플랫폼·로드 시점과 무관하게 항상 같은 값 (§4.5-v2 "매 로드 동일 결과").
 * @param {number} col @param {number} row
 * @returns {number} 0~99
 */
function hash2(col, row) {
  let h = (Math.imul(col, 374761393) + Math.imul(row, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 100;
}

/**
 * 잔디 타일의 변형 키. 순수 함수 — 결정성 테스트에 사용.
 * @param {number} col @param {number} row
 * @returns {'tile_grass' | 'tile_grass_clover' | 'tile_grass_flower'}
 */
export function grassTileKey(col, row) {
  const h = hash2(col, row);
  for (const v of GRASS_VARIANTS) {
    if (h < v.below) return v.key;
  }
  return 'tile_grass';
}

/**
 * PATH 타일의 방향 키 — 4방 인접 PATH로 판별. 순수 함수.
 * 코너 명명 = 길이 열린 두 변 (§5.4). 막다른 길·교차 등 판별 불가는 tile_path 폴백.
 * @param {import('../data/levels.js').LevelDef} level
 * @param {number} col @param {number} row
 * @returns {string} tile_path_{h|v|ne|nw|se|sw} 또는 tile_path
 */
export function pathTileKey(level, col, row) {
  const open = (c, r) => {
    if (c < 0 || c >= COLS) return true; // 좌우 필드 밖 = 경로 연장 (입구·도착 가장자리)
    if (r < 0 || r >= ROWS) return false;
    return level.tiles[r][c] === TILE.PATH;
  };
  const n = open(col, row - 1);
  const s = open(col, row + 1);
  const e = open(col + 1, row);
  const w = open(col - 1, row);
  if (e && w && !n && !s) return 'tile_path_h';
  if (n && s && !e && !w) return 'tile_path_v';
  if (n && e && !s && !w) return 'tile_path_ne';
  if (n && w && !s && !e) return 'tile_path_nw';
  if (s && e && !n && !w) return 'tile_path_se';
  if (s && w && !n && !e) return 'tile_path_sw';
  return 'tile_path';
}

/**
 * decoTiles → 'col,row' → key 매핑. 데이터 오류는 콘솔 에러로 명시 (조용한 실패 금지).
 * @param {import('../data/levels.js').LevelDef} level
 * @returns {Map<string, string>}
 */
function buildDecoKeyMap(level) {
  const map = new Map();
  const errs = [];
  for (const d of level.decoTiles || []) {
    const tile = level.tiles[d.row] && level.tiles[d.row][d.col];
    if (tile !== TILE.DECO) {
      errs.push(`decoTiles (${d.col},${d.row})가 가리키는 타일이 DECO가 아님 (값: ${tile})`);
      continue;
    }
    if (!DECO_KEYS.has(d.key)) {
      errs.push(`decoTiles (${d.col},${d.row})의 key '${d.key}'는 §5.4 deco_* 4종이 아님`);
      continue;
    }
    map.set(d.col + ',' + d.row, d.key);
  }
  if (errs.length > 0) {
    console.error('[map/tilemap] LEVEL.decoTiles 데이터 오류 ' + errs.length + '건:\n- ' + errs.join('\n- '));
  }
  return map;
}

/**
 * (v4.0-a §16.4) terrain 필드 검증 + 'col,row'→family 매핑. 조용한 실패 금지 — 콘솔 에러.
 * 배치 규칙: water=DECO 전용 / cliff·lava=DECO|PATH(화산 도로 스킨) / dirt=무관.
 * (건설 판정은 tiles만 참조 → 신규 필드 무영향; PATH·DECO는 비건설이라 AC-56 정합 유지.) 범위 밖·미지 family는 스킵.
 * @param {import('../data/levels.js').LevelDef} level
 * @returns {Map<string, 'water'|'dirt'|'cliff'|'lava'>}
 */
function buildTerrainMap(level) {
  const map = new Map();
  const errs = [];
  for (const t of level.terrain || []) {
    if (!FAMILY_TILE[t.family]) {
      errs.push(`terrain (${t.col},${t.row}) family '${t.family}'는 §16.4 {water,dirt,cliff,lava}가 아님`);
      continue;
    }
    const tile = level.tiles[t.row] && level.tiles[t.row][t.col];
    if (tile === undefined) {
      errs.push(`terrain (${t.col},${t.row})가 그리드 범위를 벗어남`);
      continue;
    }
    if (t.family === 'water' && tile !== TILE.DECO) {
      errs.push(`terrain (${t.col},${t.row}) water는 DECO 셀 전용(현재 tile=${tile}) — AC-56 건설 판정 정합`);
      continue;
    }
    if (CLIFF_LAVA.has(t.family) && tile !== TILE.DECO && tile !== TILE.PATH) {
      errs.push(`terrain (${t.col},${t.row}) '${t.family}'는 DECO 또는 PATH 셀에만(v4.0-a §16.4, 현재 tile=${tile}) — GRASS 스킨은 AC-56 위반`);
      continue;
    }
    map.set(t.col + ',' + t.row, t.family);
  }
  if (errs.length > 0) {
    console.error('[map/tilemap] LEVEL.terrain 데이터 오류 ' + errs.length + '건:\n- ' + errs.join('\n- '));
  }
  return map;
}

/**
 * (v4 §16.4) animDecos 검증 + 'col,row' Set(배경 캐시 제외 대상). 조용한 실패 금지 — 콘솔 에러.
 * 각 항목: key ∈ {deco_bush_anim, deco_crystal_shard_anim}, (col,row)는 decoTiles에 존재 && TILE.DECO.
 * @param {import('../data/levels.js').LevelDef} level
 * @returns {Set<string>}
 */
function buildAnimDecoSet(level) {
  const set = new Set();
  const errs = [];
  const decoCells = new Set((level.decoTiles || []).map((d) => d.col + ',' + d.row));
  for (const a of level.animDecos || []) {
    const cell = a.col + ',' + a.row;
    if (!ANIM_DECO_KEYS.has(a.key)) {
      errs.push(`animDecos (${a.col},${a.row}) key '${a.key}'는 §16.4 {deco_bush_anim, deco_crystal_shard_anim}가 아님`);
      continue;
    }
    if (!decoCells.has(cell)) {
      errs.push(`animDecos (${a.col},${a.row})가 decoTiles에 없음 — 정적 폴백·DECO 정합 위반`);
      continue;
    }
    const tile = level.tiles[a.row] && level.tiles[a.row][a.col];
    if (tile !== TILE.DECO) {
      errs.push(`animDecos (${a.col},${a.row})가 가리키는 타일이 DECO가 아님(값 ${tile})`);
      continue;
    }
    set.add(cell);
  }
  if (errs.length > 0) {
    console.error('[map/tilemap] LEVEL.animDecos 데이터 오류 ' + errs.length + '건:\n- ' + errs.join('\n- '));
  }
  return set;
}

/**
 * (v4) 타일 이미지를 셀 중심 기준으로 회전 draw (전이 타일 방향 배치용).
 * @param {CanvasRenderingContext2D} ctx @param {CanvasImageSource} img
 * @param {number} x @param {number} y - 타일 좌상단 px @param {number} rot - 회전각(라디안)
 */
function drawRotatedTile(ctx, img, x, y, rot) {
  if (rot === 0) {
    ctx.drawImage(img, x, y, TILE_SIZE, TILE_SIZE);
    return;
  }
  ctx.save();
  ctx.translate(x + TILE_SIZE / 2, y + TILE_SIZE / 2);
  ctx.rotate(rot);
  ctx.drawImage(img, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
  ctx.restore();
}

/**
 * 배경 캐시 생성. loadAssets 완료 후 main이 1회 호출.
 * @param {import('../data/levels.js').LevelDef} level
 */
export function buildBackground(level) {
  currentLevel = level; // (v4 §16.3) 레이어 15 drawTerrainAnim이 참조
  cache = document.createElement('canvas');
  cache.width = COLS * TILE_SIZE;
  cache.height = ROWS * TILE_SIZE;
  const ctx = cache.getContext('2d');

  const decoKeys = buildDecoKeyMap(level);
  const terrainMap = buildTerrainMap(level);   // (v4) 지형 패밀리 스킨
  const animDecoSet = buildAnimDecoSet(level); // (v4) 배경 캐시 제외 셀(레이어 15에서 애니)

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;
      const key = col + ',' + row;
      // 바닥은 항상 변형 잔디 — 지형 패밀리/길 코너/장식 PNG의 투명 영역 밑에 비친다
      ctx.drawImage(get(grassTileKey(col, row)), x, y, TILE_SIZE, TILE_SIZE);

      const t = level.tiles[row][col];
      const family = terrainMap.get(key);
      const isPath = t === TILE.PATH;

      // (v4) 지형 패밀리 지면 — PATH가 아닌 셀(GRASS/DECO)에서만 지면 대체. water/dirt는 비패밀리 인접 방향으로 전이.
      if (family && !isPath) {
        ctx.drawImage(get(FAMILY_TILE[family]), x, y, TILE_SIZE, TILE_SIZE);
        const edgeKey = FAMILY_EDGE[family];
        if (edgeKey) {
          for (const d of EDGE_DIRS) {
            const nc = col + d.dc;
            const nr = row + d.dr;
            if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue; // 맵 경계 = 전이 없음
            if (terrainMap.get(nc + ',' + nr) === family) continue;      // 같은 패밀리 = 내부(경계 아님)
            drawRotatedTile(ctx, get(edgeKey), x, y, d.rot);             // 비패밀리 측으로 전이
          }
        }
      }

      if (isPath) {
        ctx.drawImage(get(pathTileKey(level, col, row)), x, y, TILE_SIZE, TILE_SIZE);
        // (v4.0-a §16.4) cliff/lava PATH 스킨 — 방향 타일 위 반투명 accent 합성(화산 도로, AC-31 방향 흐름 보존).
        if (CLIFF_LAVA.has(family)) {
          ctx.save();
          ctx.globalAlpha = PATH_SKIN_ALPHA;
          ctx.drawImage(get(FAMILY_TILE[family]), x, y, TILE_SIZE, TILE_SIZE);
          ctx.restore();
        }
      } else if (t === TILE.DECO) {
        // (v4) animDecos 셀은 레이어 15에서 애니로 그리므로 정적 장식 제외.
        //      water/cliff/lava(솔리드) 패밀리 셀은 지형이 곧 시각(장식 미표시). dirt·무패밀리는 장식 그대로.
        if (!animDecoSet.has(key) && !SOLID_FAMILIES.has(family)) {
          ctx.drawImage(get(decoKeys.get(key) || 'deco_rock'), x, y, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  // 은은한 그리드 라인 — 건설 타일 경계 가독용 (배치 하이라이트는 ui 레이어 40 소관)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let col = 1; col < COLS; col++) {
    ctx.moveTo(col * TILE_SIZE + 0.5, 0);
    ctx.lineTo(col * TILE_SIZE + 0.5, ROWS * TILE_SIZE);
  }
  for (let row = 1; row < ROWS; row++) {
    ctx.moveTo(0, row * TILE_SIZE + 0.5);
    ctx.lineTo(COLS * TILE_SIZE, row * TILE_SIZE + 0.5);
  }
  ctx.stroke();

  const entrancePx = gridToPx(level.entrance);
  ctx.drawImage(
    get('entrance_cave'),
    entrancePx.x - OBJECT_SIZE / 2, entrancePx.y - OBJECT_SIZE / 2,
    OBJECT_SIZE, OBJECT_SIZE
  );
  // (v4 §16.3) goal_crystal은 배경 캐시에서 제외 — drawTerrainAnim(레이어 15)에서 goal_crystal_anim로 애니.

  applyTint(ctx, level.tint);
}

/**
 * (v3 §4.7) 스테이지 색 틴트를 배경 캐시 전면에 곱연산으로 1회 오버레이.
 * multiply 블렌드는 밝은 잔디는 살짝, 어두운 길은 강하게 어둡혀 시간대 인상을 만든다.
 * 잘못된 데이터(alpha 범위 밖·색 형식 오류)는 조용히 넘기지 않고 콘솔 경고.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{color: string, alpha: number} | null | undefined} tint
 */
function applyTint(ctx, tint) {
  if (!tint) return; // null·미기입 = 오버레이 없음 (스테이지 1 원색)
  const { color, alpha } = tint;
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color) || typeof alpha !== 'number' || alpha < 0 || alpha > 0.5) {
    console.warn(`[map/tilemap] LEVEL.tint 형식 오류 (color '${color}', alpha ${alpha}) — 오버레이 생략. §4.7: {color:'#RRGGBB', alpha:0~0.5}`);
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, COLS * TILE_SIZE, ROWS * TILE_SIZE);
  ctx.restore();
}

/**
 * 배경 그리기. renderer 레이어 10으로 등록될 drawFn.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawBackground(ctx) {
  if (!cache) return;
  ctx.drawImage(cache, 0, 0);
}

/**
 * 셀별 위상 오프셋(초) — 같은 장식이 동기 맥동하지 않도록 디싱크(§16.2).
 * hash2(결정적)로 셀마다 다른 상수 오프셋을 부여한다.
 * @param {number} col @param {number} row @returns {number} 0~ANIM_PHASE_SPREAD 초
 */
function phaseFor(col, row) {
  return (hash2(col, row) / 100) * ANIM_PHASE_SPREAD;
}

/**
 * 애니 스프라이트 1프레임 draw (1행×N열 idle 시트, enemy walk와 동일 크롭 패턴).
 * getAnim + seqFrames로 강등(정적 단일 프레임)까지 안전(§16.2 시퀀스 폴백).
 * @param {CanvasRenderingContext2D} ctx @param {string} key
 * @param {number} cx @param {number} cy - 중심 px @param {number} size - draw 크기 px
 * @param {number} nowSec @param {number} phaseSec
 */
function drawAnimSprite(ctx, key, cx, cy, size, nowSec, phaseSec) {
  const { image, atlas } = getAnim(key);
  const seq = seqFrames(atlas, 'idle');
  const frame = seq[Math.floor((nowSec + phaseSec) * atlas.fps) % seq.length];
  ctx.drawImage(
    image,
    frame * atlas.frameW, 0, atlas.frameW, atlas.frameH,
    cx - size / 2, cy - size / 2, size, size
  );
}

/**
 * (v4 §16.3) terrain-anim 레이어(15) draw — renderer가 registerLayer(15, drawTerrainAnim)로 등록.
 * ① 목표 수정(goal_crystal_anim)을 전 5맵 goal 위치에 애니 draw (배경 캐시에서 이동)
 * ② level.animDecos의 deco_*_anim를 해당 셀에 애니 draw (맵당 소수 — §14.4 상한 3종, goal 포함)
 * 프레임 선택은 performance.now() 기반(읽기 — draw 무상태) + 셀별 위상 오프셋으로 동기 맥동 방지(§16.2).
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawTerrainAnim(ctx) {
  const level = currentLevel;
  if (!level) return;
  const nowSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

  // ① 목표 수정 — 전 5맵 공통. 오브젝트 크기(96), 타일 중심 기준(배경 캐시의 정적 goal 위치와 동일).
  const goalPx = gridToPx(level.goal);
  drawAnimSprite(ctx, GOAL_ANIM_KEY, goalPx.x, goalPx.y, OBJECT_SIZE, nowSec, phaseFor(level.goal.col, level.goal.row));

  // ② 애니메이션 장식 — 타일 크기(64). 배경 캐시에서 제외된 셀에만.
  for (const a of level.animDecos || []) {
    const px = gridToPx(a);
    drawAnimSprite(ctx, a.key, px.x, px.y, TILE_SIZE, nowSec, phaseFor(a.col, a.row));
  }
}
