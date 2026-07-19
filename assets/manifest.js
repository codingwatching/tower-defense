/**
 * @module assets/manifest
 * 에셋 키 → 경로 단일 출처. (system-architect 소유 — 키 추가·변경은 승인 필수)
 * 계약: _workspace/02_architect_architecture.md §5 (v2.0) + §16 (v4.0 비주얼 업그레이드).
 * 총 51키 (v4.0): v2 42키 유지 + v4 신규 9키(terrain-anim 3 + 타일 패밀리 6),
 *   타워 12키는 문자열→{img, atlas} 승격(값만 변경, 키 수 불변). §16.1 표와 1:1.
 *
 * 값 형식 (v2 확정):
 *   - 정적 이미지: 문자열 경로
 *   - 애니메이션: { img, atlas } 객체 — 스트립 PNG + 아틀라스 JSON(§10 형식) 경로 명시.
 *     로더는 JSON 존재를 추측(probe)하지 않는다. 이 매니페스트가 유일한 판별 근거.
 *   - (v4) 타워는 멀티 시퀀스 시트(row-major 8프레임): idle 0-3 / attack 4-7 (선형) — §16.2.
 *   - (v4) terrain-anim 장식은 애니 쌍 키 신설(정적 키는 폴백·정적 베이크용으로 유지) — §16.1.
 *
 * 경로 규칙 (§12 배포 계약): 전부 상대 경로(선행 / 금지), 소문자 snake_case — Pages 대소문자 구분.
 *
 * 플레이스홀더 폴백 (키 접두사 기준, src/core/assets.js):
 *   tower_* = 파랑 사각 / enemy_* = 빨강 원 / proj_* = 노랑 점 /
 *   tile_grass* = 초록 사각 / tile_path* = 갈색 사각 /
 *   (v4) tile_water* = 청색 사각 / tile_dirt* = 황갈색 사각 / tile_cliff = 암회색 사각 / tile_lava = 주황 사각 /
 *   deco_*·goal_*·entrance_* = 회색 사각.
 *   *_anim(애니 장식) 키는 getAnim 강등 시 대응 정적 키(_anim 제거)의 폴백을 따른다 (§16.2).
 */
export const MANIFEST = {
  // ── 타워 (12) — (v4) 멀티 시퀀스 시트 {img, atlas} 승격, idle:0-3 / attack:4-7 (§16.1·§16.2, D20) ──
  //    시트 = row-major 8프레임(현 산출 1행×8열, 아틀라스가 규정). sequences={idle:[0,1,2,3], attack:[4,5,6,7]} 선형.
  //    로더가 cols=floor(imgW/frameW) 파생 → 물리 레이아웃 불가지(1×8 ≡ 2×4). 아틀라스가 런타임 유일 근거 (D42-1).
  tower_arrow_lv1:  { img: 'assets/images/towers/tower_arrow_lv1.png',  atlas: 'assets/images/towers/tower_arrow_lv1.json' },
  tower_arrow_lv2:  { img: 'assets/images/towers/tower_arrow_lv2.png',  atlas: 'assets/images/towers/tower_arrow_lv2.json' },
  tower_arrow_lv3:  { img: 'assets/images/towers/tower_arrow_lv3.png',  atlas: 'assets/images/towers/tower_arrow_lv3.json' },
  tower_cannon_lv1: { img: 'assets/images/towers/tower_cannon_lv1.png', atlas: 'assets/images/towers/tower_cannon_lv1.json' },
  tower_cannon_lv2: { img: 'assets/images/towers/tower_cannon_lv2.png', atlas: 'assets/images/towers/tower_cannon_lv2.json' },
  tower_cannon_lv3: { img: 'assets/images/towers/tower_cannon_lv3.png', atlas: 'assets/images/towers/tower_cannon_lv3.json' },
  tower_frost_lv1:  { img: 'assets/images/towers/tower_frost_lv1.png',  atlas: 'assets/images/towers/tower_frost_lv1.json' },
  tower_frost_lv2:  { img: 'assets/images/towers/tower_frost_lv2.png',  atlas: 'assets/images/towers/tower_frost_lv2.json' },
  tower_frost_lv3:  { img: 'assets/images/towers/tower_frost_lv3.png',  atlas: 'assets/images/towers/tower_frost_lv3.json' },
  tower_arcane_lv1: { img: 'assets/images/towers/tower_arcane_lv1.png', atlas: 'assets/images/towers/tower_arcane_lv1.json' },
  tower_arcane_lv2: { img: 'assets/images/towers/tower_arcane_lv2.png', atlas: 'assets/images/towers/tower_arcane_lv2.json' },
  tower_arcane_lv3: { img: 'assets/images/towers/tower_arcane_lv3.png', atlas: 'assets/images/towers/tower_arcane_lv3.json' },

  // ── 적 — 정적 (5, v1 유지: 걷기 강등 폴백 + 정지 표시 / v4: 3D 룩 재생성) ──
  enemy_goblin: 'assets/images/enemies/enemy_goblin.png',
  enemy_orc: 'assets/images/enemies/enemy_orc.png',
  enemy_steel_brute: 'assets/images/enemies/enemy_steel_brute.png',
  enemy_wasp_runner: 'assets/images/enemies/enemy_wasp_runner.png',
  enemy_stone_golem: 'assets/images/enemies/enemy_stone_golem.png',

  // ── 적 — 걷기 4프레임 쌍 (5, §5.2·§10: 1행 4열, 프레임 128×128 / v4: 3D 룩 재생성) ──
  enemy_goblin_walk: {
    img: 'assets/images/enemies/enemy_goblin_walk.png',
    atlas: 'assets/images/enemies/enemy_goblin_walk.json'
  },
  enemy_orc_walk: {
    img: 'assets/images/enemies/enemy_orc_walk.png',
    atlas: 'assets/images/enemies/enemy_orc_walk.json'
  },
  enemy_steel_brute_walk: {
    img: 'assets/images/enemies/enemy_steel_brute_walk.png',
    atlas: 'assets/images/enemies/enemy_steel_brute_walk.json'
  },
  enemy_wasp_runner_walk: {
    img: 'assets/images/enemies/enemy_wasp_runner_walk.png',
    atlas: 'assets/images/enemies/enemy_wasp_runner_walk.json'
  },
  enemy_stone_golem_walk: {
    img: 'assets/images/enemies/enemy_stone_golem_walk.png',
    atlas: 'assets/images/enemies/enemy_stone_golem_walk.json'
  },

  // ── 투사체 (4, v1 불변 / v4: 3D 룩 재생성) ──
  proj_arrow: 'assets/images/projectiles/proj_arrow.png',
  proj_cannonball: 'assets/images/projectiles/proj_cannonball.png',
  proj_frost_orb: 'assets/images/projectiles/proj_frost_orb.png',
  proj_arcane_bolt: 'assets/images/projectiles/proj_arcane_bolt.png',

  // ── 맵 — 잔디 (3: v1 + 변형 2, 선택은 tilemap 결정적 해시 — §4.5-v2 / v4: 3D 룩 재생성) ──
  tile_grass: 'assets/images/map/tile_grass.png',
  tile_grass_clover: 'assets/images/map/tile_grass_clover.png',
  tile_grass_flower: 'assets/images/map/tile_grass_flower.png',

  // ── 맵 — 길 (7: 범용 폴백 + 직선 2 + 코너 4, 판별은 tilemap 인접 관계 — §4.5-v2 / v4: 3D 룩 재생성) ──
  tile_path: 'assets/images/map/tile_path.png',
  tile_path_h: 'assets/images/map/tile_path_h.png',
  tile_path_v: 'assets/images/map/tile_path_v.png',
  tile_path_ne: 'assets/images/map/tile_path_ne.png',
  tile_path_nw: 'assets/images/map/tile_path_nw.png',
  tile_path_se: 'assets/images/map/tile_path_se.png',
  tile_path_sw: 'assets/images/map/tile_path_sw.png',

  // ── 맵 — (v4) 타일 패밀리 확장 (6, §16.1·§16.4, D23). 배경 캐시(레이어 10)에만 그림 — 순수 시각 ──
  //    물/절벽/용암 스킨은 LEVELS[n].terrain으로 DECO 셀에만 배치(건설 판정 무영향 — AC-56).
  //    edge는 tilemap이 인접 관계로 회전 배치(회전 대응 방향성 그라디언트 — asset-artist).
  tile_water: 'assets/images/map/tile_water.png',           // 기본 물(seamless, 깊이감으로 건설 불가 시각)
  tile_water_edge: 'assets/images/map/tile_water_edge.png', // 물가 전이(grass→water) — 회전 4방
  tile_dirt: 'assets/images/map/tile_dirt.png',             // 기본 흙/모래 지면(코스메틱)
  tile_dirt_edge: 'assets/images/map/tile_dirt_edge.png',   // 흙 전이(grass→dirt) — 회전 4방
  tile_cliff: 'assets/images/map/tile_cliff.png',           // 절벽/바위 융기(전방향 그림자 스커트 — 건설 불가 시각)
  tile_lava: 'assets/images/map/tile_lava.png',             // 용암/균열(emissive 발광 — 위험 신호, 건설 불가)

  // ── 맵 — 장식 정적 (4: v1 + 신규 3, 배치는 LEVEL.decoTiles / v4: 3D 룩 재생성 + 애니 강등 폴백 유지) ──
  deco_rock: 'assets/images/map/deco_rock.png',
  deco_bush: 'assets/images/map/deco_bush.png',
  deco_flowers: 'assets/images/map/deco_flowers.png',
  deco_crystal_shard: 'assets/images/map/deco_crystal_shard.png',

  // ── 맵 — (v4) terrain-anim 애니메이션 장식 쌍 (3, §16.1·§16.4, D23/D24). 레이어 15에서 draw ──
  //    정적 키(deco_bush 등)는 유지 — 애니 미배치 맵의 배경 베이크 + getAnim 강등 폴백.
  //    시트 1행×4열 idle. goal_crystal_anim은 전 5맵 자동 애니(목표물), deco_*_anim은 LEVELS[n].animDecos 배치.
  goal_crystal_anim: {
    img: 'assets/images/map/goal_crystal_anim.png',
    atlas: 'assets/images/map/goal_crystal_anim.json'
  },
  deco_bush_anim: {
    img: 'assets/images/map/deco_bush_anim.png',
    atlas: 'assets/images/map/deco_bush_anim.json'
  },
  deco_crystal_shard_anim: {
    img: 'assets/images/map/deco_crystal_shard_anim.png',
    atlas: 'assets/images/map/deco_crystal_shard_anim.json'
  },

  // ── 맵 — 오브젝트 (2, v1 불변 / v4: 3D 룩 재생성. goal_crystal은 애니(goal_crystal_anim) 강등 폴백 겸용) ──
  goal_crystal: 'assets/images/map/goal_crystal.png',
  entrance_cave: 'assets/images/map/entrance_cave.png'
};
