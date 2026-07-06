/**
 * @module map/path (map-designer)
 * 웨이포인트 경로 — 적의 위치는 경로 누적 이동 거리 progress(px)로 결정. 계약 §2, §8.
 * 타겟팅 First = progress 최대 (entities/tower가 사용).
 */

import { gridToPx, inBounds, TILE, COLS } from './grid.js';

/** @type {{x: number, y: number}[]} 웨이포인트의 픽셀 중심 폴리라인 */
let points = [];
/** cumulative[i] = points[0]→points[i] 누적 길이 px */
let cumulative = [];
let totalLength = 0;

/**
 * 경로 초기화. LEVEL.waypoints(그리드 좌표)를 픽셀 폴리라인으로 변환.
 * 데이터 오류(그리드 이탈·타일 불일치)는 로드 시점에 콘솔 에러로 명시한다.
 * @param {import('../data/levels.js').LevelDef} level
 */
export function initPath(level) {
  validateLevel(level);
  points = level.waypoints.map(gridToPx);
  cumulative = [0];
  totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    totalLength += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    cumulative.push(totalLength);
  }
}

/**
 * 경로상 위치 계산.
 * @param {number} progress - 입구부터의 누적 이동 거리 px (0 = 스폰 지점)
 * @returns {{x: number, y: number, done: boolean}} done=true면 도착점 도달(누수)
 */
export function positionAt(progress) {
  if (points.length === 0) return { x: 0, y: 0, done: false };
  if (progress >= totalLength) {
    const end = points[points.length - 1];
    return { x: end.x, y: end.y, done: true };
  }
  if (progress <= 0) {
    return { x: points[0].x, y: points[0].y, done: false };
  }
  let i = 1;
  while (cumulative[i] < progress) i++;
  const segLen = cumulative[i] - cumulative[i - 1];
  const t = segLen > 0 ? (progress - cumulative[i - 1]) / segLen : 0;
  const a = points[i - 1];
  const b = points[i];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, done: false };
}

/** @returns {number} 경로 전체 길이 px */
export function getTotalLength() {
  return totalLength;
}

/**
 * 레벨 데이터 정합성 검증 (로드 시점 1회). 발견한 오류를 모아 콘솔 에러로 출력.
 * initGrid 호출 순서와 무관하도록 level.tiles를 직접 읽는다.
 * @param {import('../data/levels.js').LevelDef} level
 */
function validateLevel(level) {
  const wps = level.waypoints;
  const errs = [];

  if (!Array.isArray(wps) || wps.length < 2) {
    console.error('[map/path] LEVEL.waypoints가 2개 미만 — 경로를 만들 수 없음');
    return;
  }
  wps.forEach((wp, i) => {
    if (!inBounds(wp)) errs.push(`waypoints[${i}] (${wp.col},${wp.row})가 그리드(15×10)를 벗어남`);
  });
  if (wps[0].col !== 0) errs.push(`waypoints[0].col=${wps[0].col} — 입구는 좌측 가장자리(col 0)여야 함`);
  if (wps[wps.length - 1].col !== COLS - 1) {
    errs.push(`waypoints[끝].col=${wps[wps.length - 1].col} — 도착은 우측 가장자리(col ${COLS - 1})여야 함`);
  }
  if (level.entrance.col !== wps[0].col || level.entrance.row !== wps[0].row) {
    errs.push('entrance가 waypoints[0]과 불일치');
  }
  const last = wps[wps.length - 1];
  if (level.goal.col !== last.col || level.goal.row !== last.row) {
    errs.push('goal이 waypoints[끝]과 불일치');
  }

  // 경로가 지나는 타일 집합 == tiles의 PATH 집합 (계약 §4.5 정합성 구속)
  const covered = new Set();
  for (let i = 1; i < wps.length; i++) {
    const a = wps[i - 1];
    const b = wps[i];
    if (a.col !== b.col && a.row !== b.row) {
      errs.push(`waypoints[${i - 1}]→[${i}] 구간이 축 정렬(수평/수직)이 아님`);
      continue;
    }
    const dc = Math.sign(b.col - a.col);
    const dr = Math.sign(b.row - a.row);
    let c = a.col;
    let r = a.row;
    covered.add(c + ',' + r);
    while (c !== b.col || r !== b.row) {
      c += dc;
      r += dr;
      covered.add(c + ',' + r);
    }
  }
  level.tiles.forEach((rowArr, r) => {
    rowArr.forEach((t, c) => {
      const k = c + ',' + r;
      if (t === TILE.PATH && !covered.has(k)) errs.push(`tiles(${c},${r})는 PATH인데 경로가 지나지 않음`);
      if (t !== TILE.PATH && covered.has(k)) errs.push(`경로가 PATH가 아닌 타일(${c},${r})을 지남`);
    });
  });

  if (errs.length > 0) {
    console.error('[map/path] LEVEL 데이터 오류 ' + errs.length + '건:\n- ' + errs.join('\n- '));
  }
}
