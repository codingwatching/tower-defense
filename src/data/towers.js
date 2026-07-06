/**
 * @module data/towers (wave-balancer)
 * 타워 4종 정의. 스키마·필드명·단위는 계약 §4.1 — 문자 단위로 준수, 변경 불가.
 * 단위: 거리 px / 시간 초 / cooldown = 발사 간격(공속 = 1/cooldown).
 *
 * @typedef {Object} TowerLevelSpec
 * @property {number} cost      [0]=건설 비용, [1]·[2]=해당 레벨로의 업그레이드 비용
 * @property {number} damage    발사 1회 피해량 (frost는 0 허용)
 * @property {number} range     사거리 반경 px (타워 중심 기준)
 * @property {number} cooldown  발사 간격 초
 *
 * @typedef {Object} ProjectileSpec
 * @property {string} assetKey                              proj_* (§5)
 * @property {number} speed                                 비행 속도 px/초
 * @property {number} size                                  드로우 크기 px
 * @property {number} splashRadius                          0=단일 대상 (cannon만 >0)
 * @property {{factor: number, duration: number}|null} slow frost만 (factor=속도 배수 0~1)
 *
 * @typedef {Object} TowerDef
 * @property {'arrow'|'cannon'|'frost'|'arcane'} id         키와 동일
 * @property {string} name
 * @property {string} nameKo
 * @property {string} assetKey                              tower_* (§5)
 * @property {'physical'|'magic'} damageType                magic은 armor 무시
 * @property {ProjectileSpec} projectile
 * @property {[TowerLevelSpec, TowerLevelSpec, TowerLevelSpec]} levels
 *
 * GDD 구속: arrow=최저가·최고 공속 / cannon=스플래시 / frost=슬로우 필수 /
 *          arcane=최고가·최장 사거리·고단일딜 (AC-09).
 */

/** @type {Record<'arrow'|'cannon'|'frost'|'arcane', TowerDef>} */
export const TOWERS = {
  // 기준 타워 — DPS/골드 효율 1.0 기준점. 최저가·최고 공속 (AC-09)
  arrow: {
    id: 'arrow',
    name: 'Arrow Tower',
    nameKo: '애로우 타워',
    assetKey: 'tower_arrow',
    damageType: 'physical',
    projectile: {
      assetKey: 'proj_arrow',
      speed: 480,
      size: 20,
      splashRadius: 0,
      slow: null
    },
    levels: [
      { cost: 50, damage: 8,  range: 160, cooldown: 0.7 },
      { cost: 40, damage: 13, range: 172, cooldown: 0.65 },
      { cost: 60, damage: 20, range: 184, cooldown: 0.6 }
    ]
  },
  // 물량전 카운터 — 단일 대상 효율은 기준 이하, 밀집 다중 명중 기대값 포함 시 1.2배
  cannon: {
    id: 'cannon',
    name: 'Cannon Tower',
    nameKo: '캐논 타워',
    assetKey: 'tower_cannon',
    damageType: 'physical',
    projectile: {
      assetKey: 'proj_cannonball',
      speed: 300,
      size: 20,
      splashRadius: 72,
      slow: null
    },
    levels: [
      { cost: 90,  damage: 22, range: 130, cooldown: 1.6 },
      { cost: 72,  damage: 35, range: 140, cooldown: 1.5 },
      { cost: 108, damage: 56, range: 150, cooldown: 1.4 }
    ]
  },
  // 군중 제어 — DPS 가치 제외, 킬존 체류 시간 +40%가 존재 이유. 고속(wasp) 카운터
  frost: {
    id: 'frost',
    name: 'Frost Tower',
    nameKo: '프로스트 타워',
    assetKey: 'tower_frost',
    damageType: 'physical',
    projectile: {
      assetKey: 'proj_frost_orb',
      speed: 360,
      size: 20,
      splashRadius: 0,
      slow: { factor: 0.5, duration: 2.0 }
    },
    levels: [
      { cost: 60, damage: 2, range: 150, cooldown: 1.0 },
      { cost: 48, damage: 3, range: 160, cooldown: 0.9 },
      { cost: 72, damage: 5, range: 170, cooldown: 0.8 }
    ]
  },
  // 중갑(armor) 카운터 — magic은 armor 무시. 최고가·최장 사거리·최대 한 방 (AC-09)
  arcane: {
    id: 'arcane',
    name: 'Arcane Tower',
    nameKo: '아케인 타워',
    assetKey: 'tower_arcane',
    damageType: 'magic',
    projectile: {
      assetKey: 'proj_arcane_bolt',
      speed: 420,
      size: 24,
      splashRadius: 0,
      slow: null
    },
    levels: [
      { cost: 140, damage: 60,  range: 230, cooldown: 2.4 },
      { cost: 112, damage: 96,  range: 245, cooldown: 2.2 },
      { cost: 168, damage: 150, range: 260, cooldown: 2.0 }
    ]
  }
};
