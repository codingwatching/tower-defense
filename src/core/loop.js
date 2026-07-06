/**
 * @module core/loop (engine-dev)
 * 고정 타임스텝 게임 루프. 계약 §8.
 * - update(dt)의 dt는 항상 STEP. 배속은 누적량에 곱한다 (물리 결정성 유지).
 * - 탭 복귀 스파이럴 방지: 프레임 경과분 캡 0.25초.
 * - render()는 게임 상태를 변경하지 않는다.
 * - 카운트다운도 update 안에서 흐르므로 배속의 영향을 받는다 (계약상 의도됨).
 */

/** 고정 스텝 (초). */
export const STEP = 1 / 60;

let speed = 1;
let running = false;

/**
 * 루프 시작. requestAnimationFrame 기반.
 * @param {(dt: number) => void} update - 고정 스텝마다 호출 (dt = STEP)
 * @param {() => void} render - 프레임마다 1회 호출
 */
export function startLoop(update, render) {
  if (running) {
    console.warn('[loop] startLoop 중복 호출 — 무시');
    return;
  }
  running = true;
  let acc = 0;
  let last = performance.now();

  function frame(now) {
    acc += Math.min((now - last) / 1000, 0.25) * speed;
    last = now;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/**
 * 배속 설정. ui:speed-changed를 받은 main이 호출한다.
 * @param {number} multiplier - 1 | 2 (계약 §3.7)
 */
export function setSpeed(multiplier) {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    console.warn(`[loop] setSpeed(${multiplier}) 무시 — 양의 유한수만 허용`);
    return;
  }
  speed = multiplier;
}

/** @returns {number} 현재 배속 */
export function getSpeed() {
  return speed;
}
