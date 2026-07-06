/**
 * @module assets/manifest
 * 에셋 키 → 경로 단일 출처. (system-architect 소유 — 키 추가·변경은 승인 필수)
 * 계약: _workspace/02_architect_architecture.md §5 (총 18키, 표와 1:1)
 *
 * 키 접두사가 로더(src/core/assets.js)의 플레이스홀더 폴백 모양을 결정한다:
 *   tower_* = 파랑 사각 / enemy_* = 빨강 원 / proj_* = 노랑 점 /
 *   tile_*·deco_*·goal_*·entrance_* = 단색 사각 (잔디 초록 / 길 갈색 / 기타 회색)
 */
export const MANIFEST = {
  // 타워 (4) — 레벨별 스프라이트 없음, 레벨 표기는 코드 배지
  tower_arrow: 'assets/images/towers/tower_arrow.png',
  tower_cannon: 'assets/images/towers/tower_cannon.png',
  tower_frost: 'assets/images/towers/tower_frost.png',
  tower_arcane: 'assets/images/towers/tower_arcane.png',

  // 적 (5)
  enemy_goblin: 'assets/images/enemies/enemy_goblin.png',
  enemy_orc: 'assets/images/enemies/enemy_orc.png',
  enemy_steel_brute: 'assets/images/enemies/enemy_steel_brute.png',
  enemy_wasp_runner: 'assets/images/enemies/enemy_wasp_runner.png',
  enemy_stone_golem: 'assets/images/enemies/enemy_stone_golem.png',

  // 투사체 (4)
  proj_arrow: 'assets/images/projectiles/proj_arrow.png',
  proj_cannonball: 'assets/images/projectiles/proj_cannonball.png',
  proj_frost_orb: 'assets/images/projectiles/proj_frost_orb.png',
  proj_arcane_bolt: 'assets/images/projectiles/proj_arcane_bolt.png',

  // 맵 (5)
  tile_grass: 'assets/images/map/tile_grass.png',
  tile_path: 'assets/images/map/tile_path.png',
  deco_rock: 'assets/images/map/deco_rock.png',
  goal_crystal: 'assets/images/map/goal_crystal.png',
  entrance_cave: 'assets/images/map/entrance_cave.png'
};
