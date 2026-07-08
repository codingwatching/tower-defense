/**
 * @module data/levels (map-designer)
 * 스테이지 맵 데이터. 스키마·필드명은 계약 §4.5 / §4.7 — 문자 단위로 준수.
 *
 * @typedef {{col: number, row: number}} Cell
 *
 * @typedef {Object} LevelDef
 * @property {string} id        'crystal_valley' | 'bramble_fork' | 'twin_snake' | 'narrow_gate' | 'last_ridge'
 * @property {string} name
 * @property {string} nameKo
 * @property {number} cols      15 (§2 확정값과 일치)
 * @property {number} rows      10
 * @property {number} tileSize  64
 * @property {number[][]} tiles number[10][15] 행 우선. 값: grid.TILE (0=GRASS, 1=PATH, 2=DECO)
 * @property {Cell[]} waypoints 경로 타일 중심 순서. [0]=입구(col 0, 좌측 가장자리),
 *                              [끝]=도착(col 14, 우측 가장자리).
 * @property {Cell} entrance    동굴 입구 오브젝트 위치 = waypoints[0]
 * @property {Cell} goal        수정 오브젝트 위치 = waypoints[끝]
 * @property {{col: number, row: number, key: string}[]} decoTiles
 *                              (v2, §4.5-v2) DECO 타일의 렌더 키. key ∈ §5.4 deco_* 4종.
 *                              항목이 가리키는 tiles[row][col]은 반드시 TILE.DECO.
 *                              목록에 없는 DECO는 deco_rock으로 렌더 (v1 하위 호환 폴백).
 * @property {{color: string, alpha: number} | null} [tint]
 *                              (v3, §4.7) 전역 색 오버레이 — 스테이지 분위기(대낮→밤).
 *                              tilemap.js가 배경 캐시 위에 1회 적용. 게임플레이 무관(순수 시각).
 *                              null·미기입 = 오버레이 없음(스테이지 1 대낮 원색).
 *
 * 정합성 구속(QA 교차 검증, path.js validateLevel): tiles의 PATH 타일 집합 == waypoints가 지나는 타일 집합.
 * 시작 골드/라이프·hpScale은 이 파일 소관이 아님 — src/data/balance.js의 STAGE_BALANCE(§4.9, wave-balancer 소유).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * v3 (§4.7): 단일 LEVEL → LEVELS 배열 5개. 난이도는 경로 기하로 점진 상승.
 *   경로 길이(px):   1728 < 2560 < 2752 < 3584 < 4480  (스테이지 1<2<3<4<5)
 *   GRASS 타일 수:    113 > 102 > 100 >  89 >  79       (건설 압박 점진 상승)
 *   각 맵 킬존(사거리 160 기준 경로 다중 커버 GRASS) ≥ 2곳 확보 — 전략 가능성 유지.
 * LEVELS[0] = 기존 crystal_valley (waypoints·tiles·decoTiles 문자 단위 불변 — §15/AC-41).
 * ─────────────────────────────────────────────────────────────────────────
 */

/** @type {LevelDef[]} */
export const LEVELS = [
  // ══════════════════════════════════════════════════════════════════════
  // [0] 수정 골짜기 (Crystal Valley) — v2 데이터 불변 (§15/AC-41 diff 게이트)
  //   경로: (0,2)→(4,2)→(4,7)→(8,7)→(8,2)→(12,2)→(12,5)→(14,5) — 1728px, PATH 28
  //   킬존 A:(6,5) 중심 포켓 / B:(10,3) 중심 포켓 / 보너스 (13,4)
  //   tint: null — 스테이지 1은 밝은 초록 대낮 원색 유지 (GDD §13.1)
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'crystal_valley',
    name: 'Crystal Valley',
    nameKo: '수정 골짜기',
    cols: 15,
    rows: 10,
    tileSize: 64,
    // 0=GRASS(건설 가능) 1=PATH 2=DECO(장식, 건설 불가)
    tiles: [
      [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 2, 2], // row 0  DECO: (2,0)v1 (6,0)v2 (13,0)v1 (14,0)v2
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 1
      [1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0], // row 2  입구→ / col8 상행 도착 / →col12
      [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0], // row 3
      [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0], // row 4
      [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1], // row 5  col12 하행 도착 → 수정(14,5)
      [2, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], // row 6  DECO: (0,6)v2
      [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // row 7  col4 하행 도착 → col8
      [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], // row 8  DECO: (1,8)v1 (14,8)v2
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0]  // row 9  DECO: (0,9)v2 (10,9)v1
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
    goal: { col: 14, row: 5 },
    // (v2) DECO 렌더 키 — v1 바위 4개는 deco_rock 유지, v2 신규 5개는 §5.4 신규 키
    decoTiles: [
      { col: 2, row: 0, key: 'deco_rock' },           // v1
      { col: 13, row: 0, key: 'deco_rock' },          // v1
      { col: 1, row: 8, key: 'deco_rock' },           // v1
      { col: 10, row: 9, key: 'deco_rock' },          // v1
      { col: 6, row: 0, key: 'deco_bush' },           // v2 상단 중앙 외곽
      { col: 14, row: 0, key: 'deco_crystal_shard' }, // v2 수정 테마 — 골짜기 우측 상단
      { col: 0, row: 6, key: 'deco_flowers' },        // v2 좌측 외곽
      { col: 0, row: 9, key: 'deco_bush' },           // v2 좌하단 구석
      { col: 14, row: 8, key: 'deco_crystal_shard' }  // v2 도착 수정 하단 파편
    ],
    tint: null
  },

  // ══════════════════════════════════════════════════════════════════════
  // [1] 덤불 갈림길 (Bramble Fork) — 경로가 길어진 3단 지그재그
  //   경로: (0,1)→(12,1)→(12,4)→(2,4)→(2,7)→(14,7) — 2560px(40칸), PATH 41
  //   3개의 긴 가로 레일(row1·row4·row7)을 col12·col2 세로 연결부가 잇는다.
  //   커버할 길이 늘어 "어디를 이중 커버할지" 선택지 증가 (GDD §13.1).
  //   킬존 A:(10,3) — row1 레일·col12 하행·row4 레일 3중 커버 (cov=10)
  //           B:(4,5)  — row4 레일·col2 하행·row7 레일 3중 커버 (cov=10)
  //   (보조 명당: (11,3)/(3,6) 인접 타일도 cov≈9)
  //   tint: 오후 따뜻한 누런 톤 (초록+누런 풀 — GDD §13.1)
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'bramble_fork',
    name: 'Bramble Fork',
    nameKo: '덤불 갈림길',
    cols: 15,
    rows: 10,
    tileSize: 64,
    tiles: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], // row 0  DECO (14,0)
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0], // row 1  입구→ row1 레일 → col12
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0], // row 2  col12 하행
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2], // row 3  DECO (0,3)(14,3)
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0], // row 4  col2 ← row4 레일 ← col12
      [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 5  col2 하행
      [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 6
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 7  col2 → row7 레일 → 도착(14,7)
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 8
      [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 2, 0]  // row 9  DECO (2,9)(6,9)(10,9)(13,9)
    ],
    waypoints: [
      { col: 0, row: 1 },
      { col: 12, row: 1 },
      { col: 12, row: 4 },
      { col: 2, row: 4 },
      { col: 2, row: 7 },
      { col: 14, row: 7 }
    ],
    entrance: { col: 0, row: 1 },
    goal: { col: 14, row: 7 },
    decoTiles: [
      { col: 14, row: 0, key: 'deco_bush' },
      { col: 0, row: 3, key: 'deco_flowers' },
      { col: 14, row: 3, key: 'deco_bush' },
      { col: 2, row: 9, key: 'deco_rock' },
      { col: 6, row: 9, key: 'deco_flowers' },
      { col: 10, row: 9, key: 'deco_bush' },
      { col: 13, row: 9, key: 'deco_rock' }
    ],
    tint: { color: '#d9a441', alpha: 0.12 }
  },

  // ══════════════════════════════════════════════════════════════════════
  // [2] 뒤엉킨 길 (Twin Snake) — 이중 굴곡, 짧은·긴 구간 혼재
  //   경로: (0,3)→(7,3)→(7,1)→(12,1)→(12,6)→(2,6)→(2,8)→(14,8) — 2752px(43칸), PATH 44
  //   상단 짧은 굴곡(빠르게 통과)과 하단 긴 되돌이(row6 전폭 횡단)가 뒤엉킨다.
  //   속도 다른 구간 혼재 → 프로스트(슬로우) 배치 위치가 진짜 고민거리 (GDD §13.1).
  //   킬존 A:(4,7) — row6 레일·col2 하행·row8 레일 3중 커버 (cov=11)
  //           B:(11,7) — row6 레일·col12 하행·row8 레일 커버 (cov=10)
  //   tint: 청록 흐린 하늘 (GDD §13.1)
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'twin_snake',
    name: 'Twin Snake',
    nameKo: '뒤엉킨 길',
    cols: 15,
    rows: 10,
    tileSize: 64,
    tiles: [
      [0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 0  DECO (1,0)(4,0)
      [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0], // row 1  col7 상행 → row1 짧은 레일 → col12
      [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0], // row 2
      [1, 1, 1, 1, 1, 1, 1, 1, 0, 2, 0, 0, 1, 0, 0], // row 3  입구→ row3 레일 → col7 / DECO (9,3)
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0], // row 4  col12 하행 / DECO (10,4)
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2], // row 5  DECO (14,5)
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0], // row 6  col2 ← row6 긴 레일 ← col12
      [2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 7  col2 하행 / DECO (0,7)
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 8  col2 → row8 레일 → 도착(14,8)
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]  // row 9
    ],
    waypoints: [
      { col: 0, row: 3 },
      { col: 7, row: 3 },
      { col: 7, row: 1 },
      { col: 12, row: 1 },
      { col: 12, row: 6 },
      { col: 2, row: 6 },
      { col: 2, row: 8 },
      { col: 14, row: 8 }
    ],
    entrance: { col: 0, row: 3 },
    goal: { col: 14, row: 8 },
    decoTiles: [
      { col: 9, row: 3, key: 'deco_crystal_shard' },
      { col: 10, row: 4, key: 'deco_crystal_shard' },
      { col: 1, row: 0, key: 'deco_bush' },
      { col: 4, row: 0, key: 'deco_flowers' },
      { col: 0, row: 7, key: 'deco_rock' },
      { col: 14, row: 5, key: 'deco_bush' }
    ],
    tint: { color: '#3a7d8c', alpha: 0.16 }
  },

  // ══════════════════════════════════════════════════════════════════════
  // [3] 비좁은 관문 (Narrow Gate) — 세로 빗살 병목, 명당은 강력하나 적다
  //   경로: (0,1)→(2,1)↓(2,8)→(4,8)↑(4,1)→(6,1)↓… 6개 세로 레일 지그재그 → (14,1)
  //         3584px(56칸), PATH 57
  //   레일 사이 GRASS는 1칸 폭 슬롯(col 3·5·7·9·11) — 두 레일을 동시 커버하는 강한 자리지만
  //   개수가 적다. "좋은 자리가 부족하다"는 제약 (GDD §13.1). GRASS 89(밀도↓).
  //   킬존 A:(5,3) — col4·col6 두 세로 레일 동시 커버 (cov=11, spanRow=5)
  //           B:(9,3) — col8·col10 두 세로 레일 동시 커버 (cov=11)
  //   (동급 명당 (3,6)(7,6)(11,6) 하단 밴드에도 존재 — 총 강명당 ≈5, 그러나 전부 1칸 슬롯)
  //   tint: 어둑한 회청 저녁 (GDD §13.1)
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'narrow_gate',
    name: 'Narrow Gate',
    nameKo: '비좁은 관문',
    cols: 15,
    rows: 10,
    tileSize: 64,
    tiles: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 0
      [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1], // row 1  상단 연결부(짝수 col 레일 진입/전환)
      [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0], // row 2  세로 레일 col2·4·6·8·10·12
      [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0], // row 3
      [2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2], // row 4  DECO (0,4)(14,4)
      [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0], // row 5
      [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0], // row 6
      [2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2], // row 7  DECO (0,7)(14,7)
      [0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0], // row 8  하단 연결부
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]  // row 9
    ],
    waypoints: [
      { col: 0, row: 1 },
      { col: 2, row: 1 },
      { col: 2, row: 8 },
      { col: 4, row: 8 },
      { col: 4, row: 1 },
      { col: 6, row: 1 },
      { col: 6, row: 8 },
      { col: 8, row: 8 },
      { col: 8, row: 1 },
      { col: 10, row: 1 },
      { col: 10, row: 8 },
      { col: 12, row: 8 },
      { col: 12, row: 1 },
      { col: 14, row: 1 }
    ],
    entrance: { col: 0, row: 1 },
    goal: { col: 14, row: 1 },
    decoTiles: [
      { col: 0, row: 4, key: 'deco_rock' },
      { col: 14, row: 4, key: 'deco_crystal_shard' },
      { col: 0, row: 7, key: 'deco_rock' },
      { col: 14, row: 7, key: 'deco_rock' }
    ],
    tint: { color: '#3d4a6b', alpha: 0.24 }
  },

  // ══════════════════════════════════════════════════════════════════════
  // [4] 최후의 능선 (Last Ridge) — 가장 길고 복잡한 서펜타인 (5단 능선)
  //   경로: (0,0)→(13,0)↓(13,2)→(1,2)↓(1,4)→(13,4)↓(13,6)→(1,6)↓(1,8)→(14,8)
  //         4480px(70칸), PATH 71 — 최장. 다중 코너 + 긴 직선 사거리 구간.
  //   5개 가로 레일(row0·2·4·6·8)이 교대 세로 연결(col13/col1)로 이어지는 능선.
  //   레일 사이 넓은 GRASS 밴드(row1·3·5·7)가 상하 두 레일을 긴 직선으로 커버 —
  //   사거리 긴 애로우/아케인의 저격 명당이 되지만, 경로가 길어 동시 생존 적이 많다.
  //   보스전 압박 극대화, 완성된 빌드·업글 숙련 요구 (GDD §13.1 최고 난이도).
  //   킬존 A:(3,3) — row2·row4 두 레일 커버 (cov=11)
  //           B:(11,5) — row4·row6 두 레일 커버 (cov=11)
  //   (동급 (11,1)/(3,7) 등 각 밴드마다 강명당 다수 — 길이가 곧 난이도, 기하는 관대)
  //   GRASS 79(최저 밀도). tint: 어두운 자주+용암 밤 (GDD §13.1 — 최강 오버레이)
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'last_ridge',
    name: 'Last Ridge',
    nameKo: '최후의 능선',
    cols: 15,
    rows: 10,
    tileSize: 64,
    tiles: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], // row 0  입구(0,0)→ row0 레일 → col13
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], // row 1  col13 하행
      [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], // row 2  col13 ← row2 레일 ← col1
      [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 3  col1 하행
      [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], // row 4  col1 → row4 레일 → col13
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], // row 5  col13 하행
      [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], // row 6  col13 ← row6 레일 ← col1
      [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 7  col1 하행
      [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 8  col1 → row8 레일 → 도착(14,8)
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]  // row 9
    ],
    waypoints: [
      { col: 0, row: 0 },
      { col: 13, row: 0 },
      { col: 13, row: 2 },
      { col: 1, row: 2 },
      { col: 1, row: 4 },
      { col: 13, row: 4 },
      { col: 13, row: 6 },
      { col: 1, row: 6 },
      { col: 1, row: 8 },
      { col: 14, row: 8 }
    ],
    entrance: { col: 0, row: 0 },
    goal: { col: 14, row: 8 },
    // 서펜타인이 필드를 촘촘히 채워 체비쇼프 ≥2인 외곽 GRASS가 없다 —
    // decoTiles 없음(빈 배열). 밀도 높은 능선의 폐색감을 장식 없이 유지.
    decoTiles: [],
    tint: { color: '#5a1d3a', alpha: 0.32 }
  }
];

/** @deprecated v3 하위 호환 — LEVELS[0]과 동일 객체. 신규 코드는 LEVELS 사용. */
export const LEVEL = LEVELS[0];
