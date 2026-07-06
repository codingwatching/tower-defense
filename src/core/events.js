/**
 * @module core/events (engine-dev)
 * 이벤트 버스 — 모듈 간 유일한 쓰기(상태 변경) 결합 수단.
 * 이벤트 이름·페이로드 계약: _workspace/02_architect_architecture.md §3 (총 33종)
 * 계약에 없는 이벤트 발행·구독은 버그다. 추가는 architect 승인 후 계약 문서 선반영.
 *
 * 구현 규약:
 * - 구독자는 등록 순서로 동기 호출된다.
 * - 구독자 예외는 버스에서 격리한다(console.error 후 다음 구독자 진행) — fx/audio가
 *   고장나도 전투가 멈추면 안 된다는 계약 §1의 부분 재실행 보장을 버스 차원에서 지킨다.
 * - emit 중 on/off가 일어나도 안전하도록 스냅샷을 순회한다.
 */

/** @type {Map<string, Array<(payload: object) => void>>} */
const listeners = new Map();

/**
 * 이벤트 구독.
 * @param {string} name - 계약 §3의 이벤트 이름 (예: 'enemy:killed')
 * @param {(payload: object) => void} fn
 */
export function on(name, fn) {
  if (typeof fn !== 'function') {
    console.error(`[events] on('${name}'): fn이 함수가 아님`, fn);
    return;
  }
  let arr = listeners.get(name);
  if (!arr) {
    arr = [];
    listeners.set(name, arr);
  }
  if (!arr.includes(fn)) arr.push(fn);
}

/**
 * 구독 해제. on에 넘긴 동일 참조여야 한다.
 * @param {string} name
 * @param {(payload: object) => void} fn
 */
export function off(name, fn) {
  const arr = listeners.get(name);
  if (!arr) return;
  const i = arr.indexOf(fn);
  if (i !== -1) arr.splice(i, 1);
}

/**
 * 이벤트 발행. 구독자는 등록 순서로 동기 호출된다.
 * @param {string} name
 * @param {object} [payload] - 계약 §3의 페이로드 shape과 문자 단위 일치
 */
export function emit(name, payload = {}) {
  const arr = listeners.get(name);
  if (!arr || arr.length === 0) return;
  for (const fn of arr.slice()) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[events] '${name}' 구독자 예외 (격리됨):`, err);
    }
  }
}
