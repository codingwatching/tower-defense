/**
 * @module data/levels (map-designer)
 * 맵 "수정 골짜기" 데이터. 스키마·필드명은 계약 §4.5 — 문자 단위로 준수.
 *
 * @typedef {{col: number, row: number}} Cell
 *
 * @typedef {Object} LevelDef
 * @property {string} id        'crystal_valley'
 * @property {string} name
 * @property {string} nameKo
 * @property {number} cols      15 (§2 확정값과 일치)
 * @property {number} rows      10
 * @property {number} tileSize  64
 * @property {number[][]} tiles number[10][15] 행 우선. 값: grid.TILE (0=GRASS, 1=PATH, 2=DECO)
 * @property {Cell[]} waypoints 경로 타일 중심 순서. [0]=입구(col 0, 좌측 가장자리),
 *                              [끝]=도착(col 14, 우측 가장자리). S자 곡선 (GDD §5)
 * @property {Cell} entrance    동굴 입구 오브젝트 위치 = waypoints[0]
 * @property {Cell} goal        수정 오브젝트 위치 = waypoints[끝]
 *
 * 정합성 구속(QA 교차 검증): tiles의 PATH 타일 집합 == waypoints가 지나는 타일 집합.
 * 시작 골드/라이프는 이 파일 소관이 아님 — src/data/balance.js의 BALANCE(§4.4, wave-balancer 소유).
 *
 * 경로 설계 (S자 세르펜타인, 총 1728px = 타일 27칸 이동, PATH 타일 28개):
 *   (0,2)→(4,2)→(4,7)→(8,7)→(8,2)→(12,2)→(12,5)→(14,5)
 * 킬존(타워 1기 사거리가 경로를 다중 커버하는 명당 — GDD §5 의도):
 *   A: (6,5) 중심 포켓 (col 5~7, row 3~6) — col4 하행·row7 횡단·col8 상행을 3회 통과
 *   B: (10,3) 중심 포켓 (col 9~11, row 3~4) — col8 상행·row2 횡단·col12 하행을 3회 통과
 *   보너스: (13,4) — 최종 코너 이중 커버
 */

/** @type {LevelDef} */
export const LEVEL = {
  id: 'crystal_valley',
  name: 'Crystal Valley',
  nameKo: '수정 골짜기',
  cols: 15,
  rows: 10,
  tileSize: 64,
  // 0=GRASS(건설 가능) 1=PATH 2=DECO(바위, 건설 불가)
  tiles: [
    [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0], // row 0
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 1
    [1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0], // row 2  입구→ / col8 상행 도착 / →col12
    [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0], // row 3
    [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0], // row 4
    [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1], // row 5  col12 하행 도착 → 수정(14,5)
    [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], // row 6
    [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // row 7  col4 하행 도착 → col8
    [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 8
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0]  // row 9
  ],
  waypoints: [
    { col: 0, row: 2 },   // 입구 (좌측 가장자리)
    { col: 4, row: 2 },
    { col: 4, row: 7 },
    { col: 8, row: 7 },
    { col: 8, row: 2 },
    { col: 12, row: 2 },
    { col: 12, row: 5 },
    { col: 14, row: 5 }   // 도착 수정 (우측 가장자리)
  ],
  entrance: { col: 0, row: 2 },
  goal: { col: 14, row: 5 }
};
