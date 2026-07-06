/**
 * @module data/towers (wave-balancer)
 * 타워 4종 정의. 스키마·필드명·단위는 계약 §4.1 + §4.1-v2 — 문자 단위로 준수, 변경 불가.
 * 단위: 거리 px / 시간 초 / cooldown = 발사 간격(공속 = 1/cooldown).
 *
 * @typedef {Object} TowerLevelSpec
 * @property {number} cost      [0]=건설 비용, [1]·[2]=해당 레벨로의 업그레이드 비용
 * @property {number} damage    발사 1회 피해량 (frost는 0 허용)
 * @property {number} range     사거리 반경 px (타워 중심 기준)
 * @property {number} cooldown  발사 간격 초
 * @property {number} [splashRadius]  (선택) 레벨별 스플래시 오버라이드 — cannon Lv2 축
 * @property {{factor: number, duration: number}} [slow] (선택) 레벨별 슬로우 오버라이드 — frost 축.
 *           levels[i]에 없으면 projectile 기본값 사용 (v1 하위 호환 — §4.1-v2)
 *
 * @typedef {Object} ProjectileSpec
 * @property {string} assetKey                              proj_* (§5)
 * @property {number} speed                                 비행 속도 px/초
 * @property {number} size                                  드로우 크기 px
 * @property {number} splashRadius                          0=단일 대상 (cannon만 >0)
 * @property {{factor: number, duration: number}|null} slow frost만 (factor=속도 배수 0~1)
 *
 * @typedef {Object} MechanismSpec  (v2 필수) Lv3 해금 고유 메커니즘 — level === 3에서만 활성
 * @property {'rapid_volley'|'burning_ground'|'frost_nova'|'overcharge'} type
 * @property {string} nameKo
 * @property {string} desc    패널 1줄 노출 (AC-28)
 * — type별 파라미터 union은 §4.1-v2 표 참조. 동작은 entity-dev, 수치는 본 파일이 유일 출처.
 *
 * @typedef {Object} TowerDef
 * @property {'arrow'|'cannon'|'frost'|'arcane'} id         키와 동일
 * @property {string} name
 * @property {string} nameKo
 * @property {[string, string, string]} assetKeys           [level-1] = tower_{id}_lv{n} (§5.1, AC-27).
 *                                                          v1 assetKey 필드는 v2에서 폐지
 * @property {'physical'|'magic'} damageType                magic은 armor 무시
 * @property {ProjectileSpec} projectile
 * @property {[TowerLevelSpec, TowerLevelSpec, TowerLevelSpec]} levels
 * @property {MechanismSpec} mechanism
 *
 * GDD 구속: arrow=최저가·최고 공속 / cannon=스플래시 / frost=슬로우 필수 /
 *          arcane=최고가·최장 사거리·고단일딜 (AC-09).
 * v2 Lv2 비대칭 축 (GDD §12.1): arrow=공속 / cannon=splashRadius / frost=slow / arcane=range.
 * v2 설계 원칙: 레벨별 총 전투력은 v1과 등가 (AC-37 회귀) — 성장분을 정체성 축으로 재배분,
 *              Lv3 메커니즘의 추가 전력은 §12.1 구속 수식(sim.mjs Part 3)으로 상한 검증.
 */

/** @type {Record<'arrow'|'cannon'|'frost'|'arcane', TowerDef>} */
export const TOWERS = {
  // 기준 타워 — DPS/골드 효율 1.0 기준점. 최저가·최고 공속 (AC-09)
  // v2 축=공속: cd 0.70→0.50→0.45 — Lv2 공속 +40% > 데미지 +25% (축이 수치로 읽히도록).
  // 레벨별 DPS 11.4/20.0/33.3 = v1 등가 (AC-37 회귀 보존)
  arrow: {
    id: 'arrow',
    name: 'Arrow Tower',
    nameKo: '애로우 타워',
    assetKeys: ['tower_arrow_lv1', 'tower_arrow_lv2', 'tower_arrow_lv3'],
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
      { cost: 40, damage: 10, range: 168, cooldown: 0.5 },
      { cost: 60, damage: 15, range: 176, cooldown: 0.45 }
    ],
    // 최대 가속 DPS 15/(0.45×0.88⁴) = 55.6 — arcane Lv3 상시 69.5 미만 (§12.1 저격 침범 금지).
    // 스택은 대상 변경·사망 시 초기화 → 물량전에선 발동 자체가 어렵다 (단일딜 정체성)
    mechanism: {
      type: 'rapid_volley',
      nameKo: '속사 가속',
      desc: '같은 적 연속 명중마다 공속 증가 (최대 4중첩), 대상이 바뀌면 초기화',
      maxStacks: 4,
      stackFactor: 0.88
    }
  },
  // 물량전 카운터 — v2 축=스플래시 반경: 72→90→104 (단일 DPS는 완만 19.4/32,
  // 면적 배율 반영 시 크라우드 DPS는 v1 등가). Lv3 직격을 v1보다 낮춰 화염 지대 몫 확보
  cannon: {
    id: 'cannon',
    name: 'Cannon Tower',
    nameKo: '캐논 타워',
    assetKeys: ['tower_cannon_lv1', 'tower_cannon_lv2', 'tower_cannon_lv3'],
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
      { cost: 72,  damage: 30, range: 138, cooldown: 1.55, splashRadius: 90 },
      { cost: 108, damage: 48, range: 145, cooldown: 1.5,  splashRadius: 104 }
    ],
    // 틱 DPS 4/0.5 = 8 < 직격 DPS 48/1.5 = 32 (§12.1 — 주 딜은 착탄).
    // damageType 'magic': 정액 armor 감산이 저틱 피해를 잠식하는 것 방지 (브루트 위에서도 장판이 유효)
    mechanism: {
      type: 'burning_ground',
      nameKo: '화염 지대',
      desc: '착탄 지점에 3초간 불장판 — 위를 지나는 적에게 지속 피해',
      duration: 3.0,
      radius: 84,
      tickInterval: 0.5,
      tickDamage: 4,
      damageType: 'magic'
    }
  },
  // 군중 제어 — v2 축=슬로우 오버라이드: {0.5,2.0}→{0.45,2.6}→{0.4,3.2}. 딜·공속은 거의 정체
  // (붙잡는 힘이 자라는 서포터 정체성 — GDD §12.1)
  frost: {
    id: 'frost',
    name: 'Frost Tower',
    nameKo: '프로스트 타워',
    assetKeys: ['tower_frost_lv1', 'tower_frost_lv2', 'tower_frost_lv3'],
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
      { cost: 48, damage: 2, range: 155, cooldown: 0.95, slow: { factor: 0.45, duration: 2.6 } },
      { cost: 72, damage: 3, range: 160, cooldown: 0.9,  slow: { factor: 0.4,  duration: 3.2 } }
    ],
    // 반경 96 ≤ cannon Lv3 splashRadius 104 (§12.1 구속). 단일 투사체 CC의 열차 한계
    // (v1 리포트 실증: 9마리 중 2마리만 유지)를 Lv3 투자로 해소 — slowResist 규칙(§8) 그대로
    mechanism: {
      type: 'frost_nova',
      nameKo: '빙결 파동',
      desc: '명중 시 주변 적 전체에 슬로우 확산',
      radius: 96
    }
  },
  // 중갑 카운터 — v2 축=사거리: 230→265→300 (최장 사거리 정체성 — AC-09).
  // Lv3 기본 데미지를 120으로 낮춰 과충전 상시 보정(+27.5%) 포함 시 v1 등가(≈69.5 DPS)
  arcane: {
    id: 'arcane',
    name: 'Arcane Tower',
    nameKo: '아케인 타워',
    assetKeys: ['tower_arcane_lv1', 'tower_arcane_lv2', 'tower_arcane_lv3'],
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
      { cost: 112, damage: 88,  range: 265, cooldown: 2.3 },
      { cost: 168, damage: 120, range: 300, cooldown: 2.2 }
    ],
    // 상시 왜곡 상한: 연사 중 idle=cooldown 2.2 → 보정 = min(2.2/8, 1)×1.0 = +27.5% (≤35% 상한).
    // 완충 첫 발 = 240 (연사 중 153 대비 1.57배 — AC-26 육안 판정 가능). 다중 타겟화 없음 (§12.1)
    mechanism: {
      type: 'overcharge',
      nameKo: '과충전',
      desc: '대기 시간에 비례해 다음 발 피해 증폭 (최대 2배)',
      chargeTime: 8.0,
      maxBonus: 1.0
    }
  }
};
