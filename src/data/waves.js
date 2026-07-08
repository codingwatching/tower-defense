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

/**
 * ─────────────────────────────────────────────────────────────
 * v3 — 스테이지별 웨이브 (계약 §4.8 STAGE_WAVES)
 * ─────────────────────────────────────────────────────────────
 * 스테이지 id → WaveDef[10]. 5키 필수. 각 값은 위 §4.3 WaveDef 스키마 그대로(길이 10 고정 — D16).
 *
 * **crystal_valley = 기존 WAVES 재사용 (참조 동일 — 계약 §15 회귀 불변)**.
 * 스테이지 2~5는 신규. 설계 원칙(td-balance-design §6 — 축 최소화):
 *  - **hpMultiplier 성장 곡선(per-wave)은 5스테이지 전부 동일** = 스테이지 1과 같은
 *    [1.0, 1.18, 1.39, 1.64, 1.94, 2.29, 2.7, 3.45, 4.06, 4.8].
 *    스테이지 난이도 차는 오직 ① STAGE_BALANCE.hpScale(전역 HP 배수 — D16 주손잡이)
 *    ② 웨이브 구성(물량·조기 등장·혼합 강도) ③ 맵 기하(map-designer)로만 만든다.
 *  - 등장 순서 구속(GDD §4)은 스테이지 1에만 엄격. 스테이지 2~5는 난이도 곡선(AC-44) 우선 —
 *    후반 스테이지일수록 강적(wasp/brute)을 조기 등장시켜 조합 압박을 앞당긴다.
 *  - bonus·reward 성장은 물량 증가로 자연 상승(HP 성장보다 완만 유지 — 후반 골드 압박 §2).
 *
 * 난이도 의도 매핑 (GDD §13.1):
 *  2 bramble_fork — 소폭 상승. 수량 완만 증가, 조기 등장 없음. 여전히 관대.
 *  3 twin_snake   — 중간. wasp W2 조기·물량 압박 강화. 명당 없이는 누수.
 *  4 narrow_gate  — 높음. brute W4 조기·혼합 러시 앞당김. 제한된 타일에 최적 조합 강요.
 *  5 last_ridge   — 최고. 전 종 러시 강화·보스 호위 강화. 완성 빌드·숙련 요구.
 *
 * 검증: scripts/sim.mjs Part 4 — 스테이지별 실엔진 봇(hpScale 적용). AC-44 밴드로 판정.
 * @type {Record<string, WaveDef[]>}
 */
export const STAGE_WAVES = {
  // 스테이지 1 — 기존 WAVES 재사용 (참조 동일, 회귀 불변)
  crystal_valley: WAVES,

  // 스테이지 2 — 덤불 갈림길: 소폭 상승. 수량 완만 증가, 조기 등장 없음
  bramble_fork: [
    { hpMultiplier: 1.0,  bonus: 30,  groups: [ { enemy: 'goblin', count: 9, interval: 1.0, delay: 0 } ] },
    { hpMultiplier: 1.18, bonus: 35,  groups: [ { enemy: 'goblin', count: 11, interval: 0.8, delay: 0 } ] },
    { hpMultiplier: 1.39, bonus: 40,  groups: [
      { enemy: 'goblin', count: 7, interval: 0.8, delay: 0 },
      { enemy: 'orc', count: 4, interval: 1.6, delay: 2 } ] },
    { hpMultiplier: 1.64, bonus: 45,  groups: [
      { enemy: 'orc', count: 8, interval: 1.4, delay: 0 },
      { enemy: 'goblin', count: 8, interval: 0.7, delay: 4 } ] },
    { hpMultiplier: 1.94, bonus: 50,  groups: [
      { enemy: 'wasp_runner', count: 10, interval: 0.9, delay: 0 },
      { enemy: 'orc', count: 4, interval: 1.5, delay: 3 } ] },
    { hpMultiplier: 2.29, bonus: 55,  groups: [
      { enemy: 'steel_brute', count: 3, interval: 2.5, delay: 0 },
      { enemy: 'orc', count: 7, interval: 1.3, delay: 2 } ] },
    { hpMultiplier: 2.7,  bonus: 60,  groups: [
      { enemy: 'steel_brute', count: 5, interval: 2.2, delay: 0 },
      { enemy: 'goblin', count: 15, interval: 0.6, delay: 3 } ] },
    { hpMultiplier: 3.45, bonus: 70,  groups: [
      { enemy: 'goblin', count: 16, interval: 0.6, delay: 0 },
      { enemy: 'orc', count: 8, interval: 1.3, delay: 2 },
      { enemy: 'wasp_runner', count: 8, interval: 0.9, delay: 6 } ] },
    { hpMultiplier: 4.06, bonus: 80,  groups: [
      { enemy: 'orc', count: 7, interval: 1.2, delay: 0 },
      { enemy: 'steel_brute', count: 3, interval: 2.2, delay: 2 },
      { enemy: 'wasp_runner', count: 10, interval: 0.8, delay: 5 },
      { enemy: 'goblin', count: 10, interval: 0.6, delay: 9 } ] },
    { hpMultiplier: 4.8,  bonus: 100, groups: [
      { enemy: 'stone_golem', count: 1, interval: 1.0, delay: 0 },
      { enemy: 'orc', count: 6, interval: 1.5, delay: 5 },
      { enemy: 'goblin', count: 9, interval: 0.8, delay: 10 } ] }
  ],

  // 스테이지 3 — 뒤엉킨 길: 중간. wasp W2 조기, 물량 압박 강화.
  //   기하가 관대(하단 이중 킬존)해 물량을 ×1.2로 상향 — hp1.18에서 봇 60% 착지 (§튜닝 D18-1).
  twin_snake: [
    { hpMultiplier: 1.0,  bonus: 30,  groups: [ { enemy: 'goblin', count: 12, interval: 0.9, delay: 0 } ] },
    { hpMultiplier: 1.18, bonus: 35,  groups: [
      { enemy: 'goblin', count: 14, interval: 0.7, delay: 0 },
      { enemy: 'wasp_runner', count: 4, interval: 1.0, delay: 5 } ] },
    { hpMultiplier: 1.39, bonus: 40,  groups: [
      { enemy: 'goblin', count: 10, interval: 0.7, delay: 0 },
      { enemy: 'orc', count: 6, interval: 1.5, delay: 2 } ] },
    { hpMultiplier: 1.64, bonus: 45,  groups: [
      { enemy: 'orc', count: 10, interval: 1.3, delay: 0 },
      { enemy: 'wasp_runner', count: 7, interval: 0.8, delay: 3 } ] },
    { hpMultiplier: 1.94, bonus: 50,  groups: [
      { enemy: 'wasp_runner', count: 14, interval: 0.7, delay: 0 },
      { enemy: 'orc', count: 6, interval: 1.4, delay: 3 } ] },
    { hpMultiplier: 2.29, bonus: 55,  groups: [
      { enemy: 'steel_brute', count: 4, interval: 2.4, delay: 0 },
      { enemy: 'orc', count: 8, interval: 1.2, delay: 2 },
      { enemy: 'goblin', count: 7, interval: 0.7, delay: 6 } ] },
    { hpMultiplier: 2.7,  bonus: 60,  groups: [
      { enemy: 'steel_brute', count: 6, interval: 2.1, delay: 0 },
      { enemy: 'wasp_runner', count: 10, interval: 0.8, delay: 2 },
      { enemy: 'goblin', count: 14, interval: 0.6, delay: 5 } ] },
    { hpMultiplier: 3.45, bonus: 70,  groups: [
      { enemy: 'goblin', count: 22, interval: 0.5, delay: 0 },
      { enemy: 'orc', count: 10, interval: 1.2, delay: 2 },
      { enemy: 'wasp_runner', count: 12, interval: 0.8, delay: 6 } ] },
    { hpMultiplier: 4.06, bonus: 80,  groups: [
      { enemy: 'orc', count: 10, interval: 1.1, delay: 0 },
      { enemy: 'steel_brute', count: 5, interval: 2.1, delay: 2 },
      { enemy: 'wasp_runner', count: 12, interval: 0.7, delay: 5 },
      { enemy: 'goblin', count: 12, interval: 0.6, delay: 9 } ] },
    { hpMultiplier: 4.8,  bonus: 100, groups: [
      { enemy: 'stone_golem', count: 1, interval: 1.0, delay: 0 },
      { enemy: 'orc', count: 8, interval: 1.4, delay: 4 },
      { enemy: 'wasp_runner', count: 7, interval: 0.8, delay: 8 },
      { enemy: 'goblin', count: 10, interval: 0.7, delay: 12 } ] }
  ],

  // 스테이지 4 — 비좁은 관문: 높음. brute W4 조기, 혼합 러시 앞당김.
  //   병목 기하가 이미 빡세(명당 소수·긴 경로 3584px) 물량을 ×0.7로 하향 — hp1.18에서 봇 65% 착지 (§튜닝 D18-1).
  narrow_gate: [
    { hpMultiplier: 1.0,  bonus: 30,  groups: [ { enemy: 'goblin', count: 7, interval: 0.9, delay: 0 } ] },
    { hpMultiplier: 1.18, bonus: 35,  groups: [ { enemy: 'goblin', count: 8, interval: 0.7, delay: 0 } ] },
    { hpMultiplier: 1.39, bonus: 40,  groups: [
      { enemy: 'orc', count: 4, interval: 1.4, delay: 0 },
      { enemy: 'goblin', count: 4, interval: 0.7, delay: 3 } ] },
    { hpMultiplier: 1.64, bonus: 48,  groups: [
      { enemy: 'steel_brute', count: 1, interval: 2.6, delay: 0 },
      { enemy: 'orc', count: 4, interval: 1.3, delay: 2 } ] },
    { hpMultiplier: 1.94, bonus: 52,  groups: [
      { enemy: 'wasp_runner', count: 8, interval: 0.8, delay: 0 },
      { enemy: 'steel_brute', count: 1, interval: 2.4, delay: 4 } ] },
    { hpMultiplier: 2.29, bonus: 58,  groups: [
      { enemy: 'steel_brute', count: 3, interval: 2.2, delay: 0 },
      { enemy: 'orc', count: 6, interval: 1.2, delay: 2 } ] },
    { hpMultiplier: 2.7,  bonus: 64,  groups: [
      { enemy: 'steel_brute', count: 4, interval: 2.0, delay: 0 },
      { enemy: 'goblin', count: 11, interval: 0.55, delay: 3 },
      { enemy: 'wasp_runner', count: 4, interval: 0.9, delay: 8 } ] },
    { hpMultiplier: 3.45, bonus: 72,  groups: [
      { enemy: 'goblin', count: 13, interval: 0.5, delay: 0 },
      { enemy: 'orc', count: 7, interval: 1.1, delay: 2 },
      { enemy: 'steel_brute', count: 2, interval: 2.2, delay: 6 } ] },
    { hpMultiplier: 4.06, bonus: 82,  groups: [
      { enemy: 'orc', count: 7, interval: 1.0, delay: 0 },
      { enemy: 'steel_brute', count: 4, interval: 2.0, delay: 2 },
      { enemy: 'wasp_runner', count: 8, interval: 0.7, delay: 5 },
      { enemy: 'goblin', count: 8, interval: 0.55, delay: 9 } ] },
    { hpMultiplier: 4.8,  bonus: 105, groups: [
      { enemy: 'stone_golem', count: 1, interval: 1.0, delay: 0 },
      { enemy: 'steel_brute', count: 1, interval: 2.2, delay: 3 },
      { enemy: 'orc', count: 4, interval: 1.4, delay: 7 },
      { enemy: 'goblin', count: 6, interval: 0.7, delay: 11 } ] }
  ],

  // 스테이지 5 — 최후의 능선: 최고. 전 종 러시 강화·보스 호위 강화.
  //   최장 경로(4480px)·최저 타일 밀도로 기하가 극도로 빡세 물량을 ×0.8로 하향 — hp1.24에서 봇 55% 착지 (§튜닝 D18-1).
  last_ridge: [
    { hpMultiplier: 1.0,  bonus: 32,  groups: [ { enemy: 'goblin', count: 10, interval: 0.8, delay: 0 } ] },
    { hpMultiplier: 1.18, bonus: 38,  groups: [
      { enemy: 'goblin', count: 11, interval: 0.65, delay: 0 },
      { enemy: 'wasp_runner', count: 2, interval: 1.0, delay: 6 } ] },
    { hpMultiplier: 1.39, bonus: 44,  groups: [
      { enemy: 'orc', count: 6, interval: 1.3, delay: 0 },
      { enemy: 'goblin', count: 6, interval: 0.65, delay: 3 } ] },
    { hpMultiplier: 1.64, bonus: 50,  groups: [
      { enemy: 'steel_brute', count: 2, interval: 2.4, delay: 0 },
      { enemy: 'orc', count: 6, interval: 1.2, delay: 2 },
      { enemy: 'wasp_runner', count: 3, interval: 0.9, delay: 6 } ] },
    { hpMultiplier: 1.94, bonus: 56,  groups: [
      { enemy: 'wasp_runner', count: 11, interval: 0.65, delay: 0 },
      { enemy: 'steel_brute', count: 2, interval: 2.3, delay: 3 },
      { enemy: 'orc', count: 3, interval: 1.4, delay: 7 } ] },
    { hpMultiplier: 2.29, bonus: 62,  groups: [
      { enemy: 'steel_brute', count: 3, interval: 2.1, delay: 0 },
      { enemy: 'orc', count: 8, interval: 1.1, delay: 2 },
      { enemy: 'goblin', count: 6, interval: 0.6, delay: 7 } ] },
    { hpMultiplier: 2.7,  bonus: 68,  groups: [
      { enemy: 'steel_brute', count: 3, interval: 1.9, delay: 0 },
      { enemy: 'wasp_runner', count: 8, interval: 0.7, delay: 2 },
      { enemy: 'goblin', count: 13, interval: 0.5, delay: 5 } ] },
    { hpMultiplier: 3.45, bonus: 76,  groups: [
      { enemy: 'goblin', count: 16, interval: 0.45, delay: 0 },
      { enemy: 'orc', count: 10, interval: 1.0, delay: 2 },
      { enemy: 'steel_brute', count: 3, interval: 2.0, delay: 5 },
      { enemy: 'wasp_runner', count: 6, interval: 0.7, delay: 9 } ] },
    { hpMultiplier: 4.06, bonus: 88,  groups: [
      { enemy: 'orc', count: 10, interval: 0.95, delay: 0 },
      { enemy: 'steel_brute', count: 5, interval: 1.9, delay: 2 },
      { enemy: 'wasp_runner', count: 11, interval: 0.6, delay: 5 },
      { enemy: 'goblin', count: 11, interval: 0.5, delay: 9 } ] },
    { hpMultiplier: 4.8,  bonus: 110, groups: [
      { enemy: 'stone_golem', count: 1, interval: 1.0, delay: 0 },
      { enemy: 'steel_brute', count: 2, interval: 2.0, delay: 3 },
      { enemy: 'orc', count: 6, interval: 1.3, delay: 7 },
      { enemy: 'wasp_runner', count: 5, interval: 0.7, delay: 11 },
      { enemy: 'goblin', count: 8, interval: 0.6, delay: 14 } ] }
  ]
};
