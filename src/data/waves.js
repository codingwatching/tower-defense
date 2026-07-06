/**
 * @module data/waves (wave-balancer)
 * 웨이브 10개 정의. 스키마·필드명은 계약 §4.3 — 문자 단위로 준수. 배열 길이 10 고정.
 *
 * @typedef {Object} SpawnGroup
 * @property {string} enemy    ENEMIES 키
 * @property {number} count    마릿수
 * @property {number} interval 개체 간 스폰 간격 초
 * @property {number} delay    웨이브 시작 후 그룹 첫 스폰까지 지연 초 (그룹은 delay 기준 병렬 스케줄)
 *
 * @typedef {Object} WaveDef
 * @property {number} hpMultiplier 이 웨이브 적 HP 배수 (성장 곡선은 이 값으로만)
 * @property {number} bonus        클리어 보너스 골드
 * @property {SpawnGroup[]} groups
 *
 * GDD §4 등장 순서 구속: 1~2 고블린만 → 3~4 오크 혼합 → 5 와스프 첫 등장 →
 * 6~7 브루트 첫 등장 → 8~9 전 종 혼합 → 10 스톤 골렘 + 소수 호위 (AC-14).
 * 난이도 목표: 첫 실패 지점 5~7웨이브 부근.
 */

/**
 * 성장 곡선: hpMultiplier = 1.18^(n-1), 단 W8~10은 +8% 스파이크 (v2 메커니즘 전력 상쇄 — 리포트 §6 트리거).
 * 보상은 적 reward 고정 + count 성장만으로 늘어 HP 성장보다 완만 — 후반 골드 압박 의도.
 *
 * @type {WaveDef[]} 길이 10
 */
export const WAVES = [
  { // W1 — 고블린만: 조작 학습
    hpMultiplier: 1.0,
    bonus: 30,
    groups: [
      { enemy: 'goblin', count: 8, interval: 1.0, delay: 0 }
    ]
  },
  { // W2 — 고블린 물량 증가: cannon 구매 동기 씨앗
    hpMultiplier: 1.18,
    bonus: 35,
    groups: [
      { enemy: 'goblin', count: 10, interval: 0.8, delay: 0 }
    ]
  },
  { // W3 — 오크 첫 등장: 화력 증설 압박
    hpMultiplier: 1.39,
    bonus: 40,
    groups: [
      { enemy: 'goblin', count: 6, interval: 0.8, delay: 0 },
      { enemy: 'orc', count: 4, interval: 1.6, delay: 2 }
    ]
  },
  { // W4 — 오크 주력 + 고블린 후속
    hpMultiplier: 1.64,
    bonus: 45,
    groups: [
      { enemy: 'orc', count: 7, interval: 1.4, delay: 0 },
      { enemy: 'goblin', count: 8, interval: 0.7, delay: 4 }
    ]
  },
  { // W5 — 와스프 첫 등장: frost 구매 동기 (첫 실패 지점 후보)
    hpMultiplier: 1.94,
    bonus: 50,
    groups: [
      { enemy: 'wasp_runner', count: 9, interval: 0.9, delay: 0 },
      { enemy: 'orc', count: 4, interval: 1.5, delay: 3 }
    ]
  },
  { // W6 — 스틸 브루트 첫 등장: arcane 구매 동기
    hpMultiplier: 2.29,
    bonus: 55,
    groups: [
      { enemy: 'steel_brute', count: 3, interval: 2.5, delay: 0 },
      { enemy: 'orc', count: 6, interval: 1.3, delay: 2 }
    ]
  },
  { // W7 — 브루트 증편 + 고블린 물량 협공
    hpMultiplier: 2.7,
    bonus: 60,
    groups: [
      { enemy: 'steel_brute', count: 5, interval: 2.2, delay: 0 },
      { enemy: 'goblin', count: 14, interval: 0.6, delay: 3 }
    ]
  },
  { // W8 — 전 종 혼합 러시 1
    hpMultiplier: 3.45,
    bonus: 70,
    groups: [
      { enemy: 'goblin', count: 15, interval: 0.6, delay: 0 },
      { enemy: 'orc', count: 7, interval: 1.3, delay: 2 },
      { enemy: 'wasp_runner', count: 8, interval: 0.9, delay: 6 }
    ]
  },
  { // W9 — 전 종 혼합 러시 2: 최종 점검
    hpMultiplier: 4.06,
    bonus: 80,
    groups: [
      { enemy: 'orc', count: 6, interval: 1.2, delay: 0 },
      { enemy: 'steel_brute', count: 3, interval: 2.2, delay: 2 },
      { enemy: 'wasp_runner', count: 9, interval: 0.8, delay: 5 },
      { enemy: 'goblin', count: 9, interval: 0.6, delay: 9 }
    ]
  },
  { // W10 — 스톤 골렘 + 소수 호위 (보스전)
    hpMultiplier: 4.8,
    bonus: 100,
    groups: [
      { enemy: 'stone_golem', count: 1, interval: 1.0, delay: 0 },
      { enemy: 'orc', count: 5, interval: 1.5, delay: 5 },
      { enemy: 'goblin', count: 8, interval: 0.8, delay: 10 }
    ]
  }
];
