/**
 * @module assets/manifest
 * 에셋 키 → 경로 단일 출처. (system-architect 소유 — 키 추가·변경은 승인 필수)
 * 계약: _workspace/02_architect_architecture.md §5 (v2.0, 총 42키, 표와 1:1)
 *
 * 값 형식 (v2 확정):
 *   - 정적 이미지: 문자열 경로
 *   - 애니메이션: { img, atlas } 객체 — 스트립 PNG + 아틀라스 JSON(§10 형식) 경로 명시.
 *     로더는 JSON 존재를 추측(probe)하지 않는다. 이 매니페스트가 유일한 판별 근거.
 *
 * 경로 규칙 (§12 배포 계약): 전부 상대 경로(선행 / 금지), 소문자 snake_case — Pages 대소문자 구분.
 *
 * 플레이스홀더 폴백 (키 접두사 기준, src/core/assets.js):
 *   tower_* = 파랑 사각 / enemy_* = 빨강 원 / proj_* = 노랑 점 /
 *   tile_grass* = 초록 사각 / tile_path* = 갈색 사각 / deco_*·goal_*·entrance_* = 회색 사각
 */
export const MANIFEST = {
  // ── 타워 (12) — 레벨별 실스프라이트 (§5.1, D8). v1 tower_{type} 4키는 v2에서 폐지 ──
  tower_arrow_lv1: 'assets/images/towers/tower_arrow_lv1.png',
  tower_arrow_lv2: 'assets/images/towers/tower_arrow_lv2.png',
  tower_arrow_lv3: 'assets/images/towers/tower_arrow_lv3.png',
  tower_cannon_lv1: 'assets/images/towers/tower_cannon_lv1.png',
  tower_cannon_lv2: 'assets/images/towers/tower_cannon_lv2.png',
  tower_cannon_lv3: 'assets/images/towers/tower_cannon_lv3.png',
  tower_frost_lv1: 'assets/images/towers/tower_frost_lv1.png',
  tower_frost_lv2: 'assets/images/towers/tower_frost_lv2.png',
  tower_frost_lv3: 'assets/images/towers/tower_frost_lv3.png',
  tower_arcane_lv1: 'assets/images/towers/tower_arcane_lv1.png',
  tower_arcane_lv2: 'assets/images/towers/tower_arcane_lv2.png',
  tower_arcane_lv3: 'assets/images/towers/tower_arcane_lv3.png',

  // ── 적 — 정적 (5, v1 유지: 걷기 강등 폴백 + 정지 표시) ──
  enemy_goblin: 'assets/images/enemies/enemy_goblin.png',
  enemy_orc: 'assets/images/enemies/enemy_orc.png',
  enemy_steel_brute: 'assets/images/enemies/enemy_steel_brute.png',
  enemy_wasp_runner: 'assets/images/enemies/enemy_wasp_runner.png',
  enemy_stone_golem: 'assets/images/enemies/enemy_stone_golem.png',

  // ── 적 — 걷기 4프레임 쌍 (5, §5.2·§10: 1행 4열, 프레임 128×128) ──
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

  // ── 투사체 (4, v1 불변) ──
  proj_arrow: 'assets/images/projectiles/proj_arrow.png',
  proj_cannonball: 'assets/images/projectiles/proj_cannonball.png',
  proj_frost_orb: 'assets/images/projectiles/proj_frost_orb.png',
  proj_arcane_bolt: 'assets/images/projectiles/proj_arcane_bolt.png',

  // ── 맵 — 잔디 (3: v1 + 변형 2, 선택은 tilemap 결정적 해시 — §4.5-v2) ──
  tile_grass: 'assets/images/map/tile_grass.png',
  tile_grass_clover: 'assets/images/map/tile_grass_clover.png',
  tile_grass_flower: 'assets/images/map/tile_grass_flower.png',

  // ── 맵 — 길 (7: 범용 폴백 + 직선 2 + 코너 4, 판별은 tilemap 인접 관계 — §4.5-v2) ──
  tile_path: 'assets/images/map/tile_path.png',
  tile_path_h: 'assets/images/map/tile_path_h.png',
  tile_path_v: 'assets/images/map/tile_path_v.png',
  tile_path_ne: 'assets/images/map/tile_path_ne.png',
  tile_path_nw: 'assets/images/map/tile_path_nw.png',
  tile_path_se: 'assets/images/map/tile_path_se.png',
  tile_path_sw: 'assets/images/map/tile_path_sw.png',

  // ── 맵 — 장식 (4: v1 + 신규 3, 배치는 LEVEL.decoTiles — §13 불변 경계 준수) ──
  deco_rock: 'assets/images/map/deco_rock.png',
  deco_bush: 'assets/images/map/deco_bush.png',
  deco_flowers: 'assets/images/map/deco_flowers.png',
  deco_crystal_shard: 'assets/images/map/deco_crystal_shard.png',

  // ── 맵 — 오브젝트 (2, v1 불변) ──
  goal_crystal: 'assets/images/map/goal_crystal.png',
  entrance_cave: 'assets/images/map/entrance_cave.png'
};
