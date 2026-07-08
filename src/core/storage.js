/**
 * @module core/storage (engine-dev) — v3
 * localStorage 저수준 I/O + JSON 파싱·폴백. 계약 §4.11·§14.3.
 *
 * 이 모듈은 **순수 유틸(최하위 계층)** — 어떤 게임 모듈도 import하지 않는다.
 * localStorage 예외(사생활 모드·용량 초과)·JSON 파싱 실패·스키마 손상을 전부 흡수하고
 * 항상 유효한 SaveState를 반환한다 (AC-48 — 크래시 금지). 저장 실패는 콘솔 경고만.
 *
 * 저장 키(네임스페이스): 'crystal_guard.v1' — Pages는 origin 단위 localStorage 공유이므로
 *   게임 고유 접두사로 다른 리포와 충돌 방지. '.v1'은 스키마 진화 시 마이그레이션 지점.
 *
 * @typedef {Object} SaveState
 * @property {number} version         스키마 버전 (현재 1)
 * @property {number} unlockedCount   해금 스테이지 수 1~5 (항상 ≥1 — 스테이지 1 상시 해금)
 * @property {number[]} bestScores    길이 5, 인덱스=stageIndex, 스테이지별 최고점 (미플레이=0)
 *
 * 공개 API:
 *   loadSave(): SaveState  — 항상 유효 구조 반환 (부재·손상 시 초기값 + 정규화)
 *   saveSave(state): void  — JSON 직렬화 후 저장. 예외 흡수(경고만)
 */

/** 저장 키 — 변경 금지(마이그레이션 없이 바꾸면 기존 진행도 유실). */
export const STORAGE_KEY = 'crystal_guard.v1';

/** 현재 스키마 버전 — 읽을 때 불일치면 폴백 + 재작성 대상. */
export const SCHEMA_VERSION = 1;

/** 스테이지 개수(고정 5). bestScores 길이·unlockedCount 상한의 단일 출처. */
const STAGE_COUNT = 5;

/**
 * 스키마 손상·부재 시 반환할 초기값(AC-48)의 **참조 상수**.
 * 절대 이 객체를 그대로 반환하지 않는다 — progress가 bestScores를 in-place 변경하므로
 * loadSave는 항상 freshDefault()로 새 인스턴스를 만들어 반환한다(공유 상태 오염 방지).
 */
export const DEFAULT_SAVE = Object.freeze({
  version: SCHEMA_VERSION,
  unlockedCount: 1,
  bestScores: Object.freeze([0, 0, 0, 0, 0]),
});

/** @returns {SaveState} 매번 새 인스턴스(배열 포함) — 호출자가 자유롭게 변경 가능. */
function freshDefault() {
  return { version: SCHEMA_VERSION, unlockedCount: 1, bestScores: new Array(STAGE_COUNT).fill(0) };
}

/** 손상 데이터에 대한 폴백 경고를 세션당 1회만 — 재호출 스팸 방지. */
let warnedLoad = false;

/**
 * localStorage 핸들을 안전하게 획득. 사생활 모드·SSR·접근 차단 시 접근 자체가
 * throw할 수 있으므로 try로 감싼다.
 * @returns {Storage|null}
 */
function getStore() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * 정수로 강제 변환 + [min,max] 클램프. 비유한수·NaN은 fallback.
 * @param {unknown} v @param {number} min @param {number} max @param {number} fallback
 * @returns {number}
 */
function clampInt(v, min, max, fallback) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * 임의 파싱 결과를 유효 SaveState로 정규화(부분 복구).
 * - unlockedCount: [1, STAGE_COUNT] 정수 클램프 (부재/손상 시 1)
 * - bestScores: 길이 STAGE_COUNT로 패딩/절단, 각 원소 max(0, floor) — 음수·비유한수 0
 * @param {unknown} raw
 * @returns {SaveState}
 */
function normalize(raw) {
  const out = freshDefault();
  if (!raw || typeof raw !== 'object') return out;
  out.unlockedCount = clampInt(/** @type {any} */ (raw).unlockedCount, 1, STAGE_COUNT, 1);
  const src = Array.isArray(/** @type {any} */ (raw).bestScores) ? /** @type {any} */ (raw).bestScores : [];
  for (let i = 0; i < STAGE_COUNT; i++) {
    out.bestScores[i] = clampInt(src[i], 0, Number.MAX_SAFE_INTEGER, 0);
  }
  return out;
}

/**
 * localStorage에서 SaveState 로드. 부재·파싱 실패·타입 불일치·버전 불일치 시
 * freshDefault() 반환 + 경고 1회. 정상 로드도 normalize를 거쳐 손상 필드를 부분 복구한다.
 * progress는 항상 유효 구조(변경 가능한 새 인스턴스)를 받는다 (AC-48).
 * @returns {SaveState}
 */
export function loadSave() {
  const store = getStore();
  if (!store) return freshDefault();

  let rawStr;
  try {
    rawStr = store.getItem(STORAGE_KEY);
  } catch {
    return freshDefault();
  }
  if (rawStr === null || rawStr === undefined) return freshDefault(); // 최초 실행 — 조용히 초기값

  let parsed;
  try {
    parsed = JSON.parse(rawStr);
  } catch {
    if (!warnedLoad) {
      warnedLoad = true;
      console.warn('[storage] 저장 데이터 JSON 파싱 실패 — 초기값으로 폴백 (AC-48)');
    }
    return freshDefault();
  }

  // 버전 불일치: 현재는 마이그레이션 없음 → 초기값 폴백(다음 저장에서 재작성됨).
  if (!parsed || typeof parsed !== 'object' || parsed.version !== SCHEMA_VERSION) {
    if (!warnedLoad) {
      warnedLoad = true;
      console.warn(
        `[storage] 저장 스키마 불일치(version=${parsed && parsed.version}) — 초기값으로 폴백`
      );
    }
    return freshDefault();
  }

  return normalize(parsed);
}

/**
 * SaveState를 localStorage에 저장. 저장 직전 normalize로 유효 구조를 보장하고,
 * localStorage 자체 예외(사생활 모드·용량 초과)도 try/catch로 흡수 — 저장 실패는
 * 콘솔 경고만, 게임 진행을 막지 않는다.
 * @param {SaveState} state
 */
export function saveSave(state) {
  const store = getStore();
  if (!store) return; // 저장 불가 환경 — 조용히 진행(플레이는 정상)
  const clean = normalize(state);
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (err) {
    console.warn('[storage] 저장 실패(사생활 모드·용량 초과 등) — 진행 계속:', err);
  }
}
