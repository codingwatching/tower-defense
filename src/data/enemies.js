/**
 * @module data/enemies (wave-balancer)
 * 적 5종 정의. 스키마·필드명·단위는 계약 §4.2 — 문자 단위로 준수, 변경 불가.
 *
 * @typedef {Object} EnemyDef
 * @property {'goblin'|'orc'|'steel_brute'|'wasp_runner'|'stone_golem'} id 키와 동일
 * @property {string} name
 * @property {string} nameKo
 * @property {string} assetKey   enemy_* (§5)
 * @property {number} hp         기본 최대 HP — WAVES[i].hpMultiplier가 곱해짐
 * @property {number} speed      px/초 (슬로우 미적용 기본값)
 * @property {number} armor      물리 정액 감산. 실피해 = max(1, damage - armor). magic 무시
 * @property {number} reward     처치 골드
 * @property {number} livesCost  누수 라이프 차감 — GDD 고정: 일반 1, stone_golem 5
 * @property {number} slowResist 0~1. 유효 factor = factor + (1-factor)*slowResist — stone_golem 0.5
 * @property {number} radius     판정 반경 px (명중·스플래시)
 * @property {number} size       스프라이트 드로우 크기 px (§5 드로우 크기 열과 일치)
 * @property {boolean} isBoss    stone_golem만 true
 *
 * GDD 구속: goblin=다수·저체력·빠름 / orc=기준점 / steel_brute=고armor·저속 /
 *          wasp_runner=최고속·저체력 / stone_golem=보스·극고HP·슬로우 저항.
 */

/** @type {Record<'goblin'|'orc'|'steel_brute'|'wasp_runner'|'stone_golem', EnemyDef>} */
export const ENEMIES = {
  // 물량형 — orc 대비 HP 40%·속도 138%. 밀집 스폰으로 cannon을 정당화
  goblin: {
    id: 'goblin',
    name: 'Goblin',
    nameKo: '고블린',
    assetKey: 'enemy_goblin',
    hp: 32,
    speed: 90,
    armor: 0,
    reward: 5,
    livesCost: 1,
    slowResist: 0,
    radius: 13,
    size: 40,
    isBoss: false
  },
  // 기준점 — 모든 수치 비교의 baseline
  orc: {
    id: 'orc',
    name: 'Orc',
    nameKo: '오크',
    assetKey: 'enemy_orc',
    hp: 80,
    speed: 65,
    armor: 0,
    reward: 10,
    livesCost: 1,
    slowResist: 0,
    radius: 15,
    size: 48,
    isBoss: false
  },
  // 중갑형 — HP 275%·속도 69%·armor 5 (arrow Lv1 피해 8의 62% 흡수). arcane(magic) 강요
  steel_brute: {
    id: 'steel_brute',
    name: 'Steel Brute',
    nameKo: '스틸 브루트',
    assetKey: 'enemy_steel_brute',
    hp: 220,
    speed: 45,
    armor: 5,
    reward: 20,
    livesCost: 1,
    slowResist: 0,
    radius: 17,
    size: 56,
    isBoss: false
  },
  // 고속형 — HP 63%·속도 215%. 노출 시간이 짧아 frost(슬로우) 강요
  wasp_runner: {
    id: 'wasp_runner',
    name: 'Wasp Runner',
    nameKo: '와스프 러너',
    assetKey: 'enemy_wasp_runner',
    hp: 50,
    speed: 140,
    armor: 0,
    reward: 8,
    livesCost: 1,
    slowResist: 0,
    radius: 13,
    size: 40,
    isBoss: false
  },
  // 보스 — 슬로우 저항 0.5(GDD 고정), 누수 -5. W10 총 EHP의 40~60%를 단독 부담
  stone_golem: {
    id: 'stone_golem',
    name: 'Stone Golem',
    nameKo: '스톤 골렘',
    assetKey: 'enemy_stone_golem',
    hp: 750,
    speed: 36,
    armor: 6,
    reward: 150,
    livesCost: 5,
    slowResist: 0.5,
    radius: 28,
    size: 96,
    isBoss: true
  }
};
