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
 * @property {{col: number, row: number, family: 'water'|'dirt'|'cliff'|'lava'}[]} [terrain]
 *                              (v4, §16.4) 배경 캐시(레이어 10)에 그릴 지형 패밀리 스킨. 순수 시각 — isBuildable 무영향.
 *                              family ∈ {water,cliff,lava} 항목의 tiles[row][col]은 반드시 TILE.DECO
 *                              (건설 불가 시각↔실제 정합, AC-56). dirt는 GRASS/DECO 무관(코스메틱 지면).
 *                              tilemap이 인접 관계로 edge 타일(회전 4방)을 배치. 미기입 = 지형 패밀리 없음.
 * @property {{col: number, row: number, key: string}[]} [animDecos]
 *                              (v4, §16.4) terrain-anim 레이어(15) 애니 장식. key ∈ {deco_bush_anim, deco_crystal_shard_anim}.
 *                              각 (col,row)는 반드시 decoTiles에 존재(정적 폴백 + TILE.DECO 정합). 배경 캐시에서
 *                              제외되고 레이어 15에서 애니로 그려진다. 목표 수정(goal)은 tilemap이 전 5맵 자동 애니.
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
 *
 * v4 (§16.4, v4.0-a): 순수 추가 필드 terrain·animDecos (선택). 배치 규칙: water=DECO / cliff·lava=DECO|PATH / dirt=무관.
 *   GDD §14.3 테마 매핑:
 *   1 없음(shard/bush 애니) / 2 dirt 전이 + bush 애니 / 3 water(DECO 셀) + bush 애니 / 4 cliff(DECO 셀) /
 *   5 lava/cliff PATH 스킨(화산 도로 — 가로 레일=lava·세로 연결부=cliff, DECO 0개라 v4.0-a로 PATH 허용) + dirt GRASS 스코치(하단 화산재).
 *   waypoints·tiles·decoTiles·건설 판정 전부 불변 — LEVELS[0] 동결 3필드 byte 동일(§16.8/AC-41).
 *   PATH·DECO는 비건설이라 건설 셀 집합·명당 불변(sim 무영향, AC-56/60 정합).
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
    tint: null,
    // (v4 §16.4) 스테이지 1 = 지형 패밀리 없음. animDecos = 파편 수정 반짝임 + 덤불 흔들림
    // (§14.4 예시 상한 = goal + shard + bush 3종). 셀은 위 decoTiles의 동일 (col,row)에 존재 → 정적 폴백.
    animDecos: [
      { col: 14, row: 0, key: 'deco_crystal_shard_anim' }, // 우측 상단 파편 수정
      { col: 6, row: 0, key: 'deco_bush_anim' }            // 상단 중앙 덤불
    ]
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
    tint: { color: '#d9a441', alpha: 0.12 },
    // (v4 §16.4/§14.3) 흙/모래 전이 — 하단 개방 밴드 2패치(3×2). 전부 GRASS 셀(코스메틱, 건설 가능 유지),
    // 경로·DECO·킬존(4,5)/(10,3) 회피. tilemap이 grass 인접 방향으로 dirt edge(회전) 배치.
    terrain: [
      { col: 3, row: 8, family: 'dirt' }, { col: 4, row: 8, family: 'dirt' }, { col: 5, row: 8, family: 'dirt' },
      { col: 3, row: 9, family: 'dirt' }, { col: 4, row: 9, family: 'dirt' }, { col: 5, row: 9, family: 'dirt' },
      { col: 7, row: 8, family: 'dirt' }, { col: 8, row: 8, family: 'dirt' }, { col: 9, row: 8, family: 'dirt' },
      { col: 7, row: 9, family: 'dirt' }, { col: 8, row: 9, family: 'dirt' }, { col: 9, row: 9, family: 'dirt' }
    ],
    // (v4 §14.4) 덤불 흔들림 — decoTiles의 deco_bush 셀에만.
    animDecos: [
      { col: 14, row: 3, key: 'deco_bush_anim' },
      { col: 10, row: 9, key: 'deco_bush_anim' }
    ]
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
    tint: { color: '#3a7d8c', alpha: 0.16 },
    // (v4 §16.4/§14.3) 물 패밀리 — 기존 DECO 셀에만(건설 판정 불변, AC-56). 물가 전이는 tilemap이
    // 인접 grass 방향으로 water edge(회전) 배치. 이 셀들의 정적 deco는 물로 대체(장식 미표시).
    terrain: [
      { col: 9, row: 3, family: 'water' },  // 중앙 물웅덩이 (갈래/합류 암시)
      { col: 10, row: 4, family: 'water' }, // 중앙 물웅덩이
      { col: 0, row: 7, family: 'water' },  // 좌측 물가
      { col: 14, row: 5, family: 'water' }  // 우측 물가
    ],
    // (v4 §14.4) 덤불 흔들림 — 상단 좌측 덤불(물 셀과 미중복).
    animDecos: [
      { col: 1, row: 0, key: 'deco_bush_anim' }
    ]
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
    tint: { color: '#3d4a6b', alpha: 0.24 },
    // (v4 §16.4/§14.3) 절벽/바위 지대 — 병목의 '벽'을 좌우 가장자리 DECO 셀에 융기 타일로 표현.
    // cliff는 전이 없는 솔리드(전방향 그림자 스커트로 건설 불가 시각 명확, AC-56). 정적 deco는 절벽으로 대체.
    terrain: [
      { col: 0, row: 4, family: 'cliff' }, { col: 14, row: 4, family: 'cliff' },
      { col: 0, row: 7, family: 'cliff' }, { col: 14, row: 7, family: 'cliff' }
    ]
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
    tint: { color: '#5a1d3a', alpha: 0.32 },
    // (v4.0-a §16.4/§14.3) 화산 능선 — last_ridge는 DECO 셀 0개라 계약 완화(cliff·lava = DECO|PATH) + dirt는 GRASS 허용(기존 조항).
    // dirt(지면) + lava(도로) 상보 배치 — lava가 실표시돼 tile_lava 고아 키 방지(architect 매니페스트 무결성).
    // PATH 스킨: 가로 레일(짝수 행 0·2·4·6·8) = lava 용융 선반, 세로 연결부(홀수 행 1·3·5·7) = cliff 암벽 climb.
    // dirt 스코치: 하단 여백 GRASS 밴드(row9) 2패치 = 화산재 지면(도로의 지면 카운터파트). 킬존(3,3)/(11,5)·밴드 강명당은 GRASS 원색 유지.
    // 전부 순수 시각: waypoints·PATH·GRASS 건설셀 집합 불변(§16.8, sim 무영향). PATH lava는 방향 타일 위 반투명 accent로 AC-31 방향 흐름 보존.
    terrain: [
      { col: 0, row: 0, family: 'lava' }, { col: 1, row: 0, family: 'lava' }, { col: 2, row: 0, family: 'lava' }, { col: 3, row: 0, family: 'lava' }, { col: 4, row: 0, family: 'lava' }, { col: 5, row: 0, family: 'lava' }, { col: 6, row: 0, family: 'lava' }, { col: 7, row: 0, family: 'lava' }, { col: 8, row: 0, family: 'lava' }, { col: 9, row: 0, family: 'lava' }, { col: 10, row: 0, family: 'lava' }, { col: 11, row: 0, family: 'lava' }, { col: 12, row: 0, family: 'lava' }, { col: 13, row: 0, family: 'lava' }, // row0 용융 선반
      { col: 13, row: 1, family: 'cliff' }, // row1 암벽 연결부
      { col: 1, row: 2, family: 'lava' }, { col: 2, row: 2, family: 'lava' }, { col: 3, row: 2, family: 'lava' }, { col: 4, row: 2, family: 'lava' }, { col: 5, row: 2, family: 'lava' }, { col: 6, row: 2, family: 'lava' }, { col: 7, row: 2, family: 'lava' }, { col: 8, row: 2, family: 'lava' }, { col: 9, row: 2, family: 'lava' }, { col: 10, row: 2, family: 'lava' }, { col: 11, row: 2, family: 'lava' }, { col: 12, row: 2, family: 'lava' }, { col: 13, row: 2, family: 'lava' }, // row2 용융 선반
      { col: 1, row: 3, family: 'cliff' }, // row3 암벽 연결부
      { col: 1, row: 4, family: 'lava' }, { col: 2, row: 4, family: 'lava' }, { col: 3, row: 4, family: 'lava' }, { col: 4, row: 4, family: 'lava' }, { col: 5, row: 4, family: 'lava' }, { col: 6, row: 4, family: 'lava' }, { col: 7, row: 4, family: 'lava' }, { col: 8, row: 4, family: 'lava' }, { col: 9, row: 4, family: 'lava' }, { col: 10, row: 4, family: 'lava' }, { col: 11, row: 4, family: 'lava' }, { col: 12, row: 4, family: 'lava' }, { col: 13, row: 4, family: 'lava' }, // row4 용융 선반
      { col: 13, row: 5, family: 'cliff' }, // row5 암벽 연결부
      { col: 1, row: 6, family: 'lava' }, { col: 2, row: 6, family: 'lava' }, { col: 3, row: 6, family: 'lava' }, { col: 4, row: 6, family: 'lava' }, { col: 5, row: 6, family: 'lava' }, { col: 6, row: 6, family: 'lava' }, { col: 7, row: 6, family: 'lava' }, { col: 8, row: 6, family: 'lava' }, { col: 9, row: 6, family: 'lava' }, { col: 10, row: 6, family: 'lava' }, { col: 11, row: 6, family: 'lava' }, { col: 12, row: 6, family: 'lava' }, { col: 13, row: 6, family: 'lava' }, // row6 용융 선반
      { col: 1, row: 7, family: 'cliff' }, // row7 암벽 연결부
      { col: 1, row: 8, family: 'lava' }, { col: 2, row: 8, family: 'lava' }, { col: 3, row: 8, family: 'lava' }, { col: 4, row: 8, family: 'lava' }, { col: 5, row: 8, family: 'lava' }, { col: 6, row: 8, family: 'lava' }, { col: 7, row: 8, family: 'lava' }, { col: 8, row: 8, family: 'lava' }, { col: 9, row: 8, family: 'lava' }, { col: 10, row: 8, family: 'lava' }, { col: 11, row: 8, family: 'lava' }, { col: 12, row: 8, family: 'lava' }, { col: 13, row: 8, family: 'lava' }, { col: 14, row: 8, family: 'lava' }, // row8 용융 선반
      // (A+) dirt 그을린 지면 — 하단 여백 GRASS 2패치(전부 row9 GRASS, 코스메틱·건설 가능 유지). 킬존·밴드 강명당 회피.
      { col: 2, row: 9, family: 'dirt' }, { col: 3, row: 9, family: 'dirt' }, { col: 4, row: 9, family: 'dirt' }, { col: 5, row: 9, family: 'dirt' }, // 좌측 화산재
      { col: 9, row: 9, family: 'dirt' }, { col: 10, row: 9, family: 'dirt' }, { col: 11, row: 9, family: 'dirt' }, { col: 12, row: 9, family: 'dirt' }  // 우측 화산재
    ]
  }
];

/** @deprecated v3 하위 호환 — LEVELS[0]과 동일 객체. 신규 코드는 LEVELS 사용. */
export const LEVEL = LEVELS[0];
