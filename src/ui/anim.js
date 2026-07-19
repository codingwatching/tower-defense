/**
 * @module ui/anim (ui-dev) — v5
 * UI 전용 anime.js 트랜지션 헬퍼. anime.js 직접 import는 `src/ui/`에 허용된다(§17.1·§17.6 태스크 #6):
 * DOM 트랜지션은 fx 파사드로 일반화되지 않으므로 파사드 경유가 아니라 여기서 UI 톤을 통일한다.
 *
 * 불변식(§17.7 순수 시각):
 *  - 이벤트 계약·게임 상태를 바꾸지 않는다. 트윈은 **표현만** — DOM 텍스트/변환/투명도만 움직인다.
 *  - 종료 상태(class .hidden, textContent 최종값)는 트윈 성패와 무관하게 항상 정확하다.
 *    anime가 없거나 예외가 나도 즉시 최종값으로 강등한다(NaN/undefined 노출 금지).
 *  - `prefers-reduced-motion: reduce`면 모션을 생략하고 최종 상태만 즉시 반영한다(접근성·가독 우선).
 *
 * 이징 기본값(§17.4 계약 — linear 금지에 준함): UI 슬라이드/페이드 `outExpo`, 카운트업 `outCubic`.
 */
import { animate } from '../../vendor/anime.esm.min.js';

/** 지속시간 상수(ms) — 전 트랜지션 0.6초 미만(§17.4 성능 규칙·태스크 #6 과용 금지). */
const DUR = {
  countUp: 380,
  slideIn: 240,
  slideOut: 160,
  fadeIn: 240,
  fadeOut: 170,
  rise: 300,
  shake: 300,
};

const rmq =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** 모션 최소화 사용자인가. */
function reduce() {
  return !!(rmq && rmq.matches);
}

// 요소별 활성 트윈 핸들 — 재진입 시 이전 트윈을 끊어 유령 트윈/값 튐을 막는다.
const handles = new WeakMap();

function store(el, a) {
  if (a) handles.set(el, a);
  else handles.delete(el);
}

/** 해당 요소의 진행 중 트윈을 즉시 종료(값 되돌림 없음). */
function cancelAnim(el) {
  const a = handles.get(el);
  if (a) {
    try {
      a.cancel();
    } catch (_) {
      /* 강등 — 무해 */
    }
    handles.delete(el);
  }
}

/**
 * 표시 전용 카운트업(outCubic). **실제 게임 상태는 이벤트 값 그대로** — 여기서는 표시 카운터만 트윈한다.
 * state = { shown:number, tween } 를 호출자가 소유(값 연속성·취소 관리). 비유한 목표는 무시(마지막 유효값 유지).
 * @param {HTMLElement} el 텍스트를 쓸 노드
 * @param {{shown:number, tween:any}} state 표시 카운터 상태(호출자 소유)
 * @param {number} to 목표값(이벤트가 준 실제 값)
 * @param {(n:number)=>string} format 정수→표시 문자열
 */
export function countUp(el, state, to, format = String) {
  if (!el) return;
  const target = Number(to);
  if (!Number.isFinite(target)) return; // NaN 노출 금지 — 마지막 유효값 유지
  if (state.tween) {
    try {
      state.tween.cancel();
    } catch (_) {
      /* 무해 */
    }
    state.tween = null;
  }
  const from = Number.isFinite(state.shown) ? state.shown : target;
  if (reduce() || from === target) {
    state.shown = target;
    el.textContent = format(target);
    return;
  }
  const proxy = { v: from };
  try {
    state.tween = animate(proxy, {
      v: target,
      duration: DUR.countUp,
      ease: 'outCubic',
      onUpdate: () => {
        state.shown = proxy.v;
        el.textContent = format(Math.round(proxy.v));
      },
      onComplete: () => {
        state.shown = target;
        el.textContent = format(target); // 최종값은 정확히
        state.tween = null;
      },
    });
  } catch (_) {
    state.shown = target;
    el.textContent = format(target); // 트윈 실패 → 즉시 최종값
  }
}

/** 카운트업 상태를 애니메이션 없이 즉시 목표로 리셋(판 시작 스냅 등). */
export function snapCount(el, state, to, format = String) {
  if (!el) return;
  const target = Number(to);
  if (!Number.isFinite(target)) return;
  if (state.tween) {
    try {
      state.tween.cancel();
    } catch (_) {
      /* 무해 */
    }
    state.tween = null;
  }
  state.shown = target;
  el.textContent = format(target);
}

/**
 * 패널/정보창 슬라이드 인(outExpo) — 살짝 떠오르며 나타남. `.hidden` 해제는 호출 전에 끝났다고 가정.
 * 변환은 인라인으로 걸었다가 완료 시 제거해 CSS 기본(none)으로 되돌린다.
 */
export function slideIn(el) {
  if (!el) return;
  cancelAnim(el);
  if (reduce()) {
    el.style.transform = '';
    el.style.opacity = '';
    return;
  }
  try {
    el.style.willChange = 'transform, opacity';
    el.style.opacity = '0'; // 첫 rAF 전 전체불투명 깜빡임 방지
    const a = animate(el, {
      opacity: [0, 1],
      translateY: [10, 0],
      scale: [0.97, 1],
      duration: DUR.slideIn,
      ease: 'outExpo',
      onComplete: () => {
        el.style.transform = '';
        el.style.opacity = '';
        el.style.willChange = '';
        store(el, null);
      },
    });
    store(el, a);
  } catch (_) {
    el.style.transform = '';
    el.style.opacity = '';
  }
}

/**
 * 패널/정보창 슬라이드 아웃 후 onDone(보통 `.hidden` 부착)을 호출. 트윈 실패/모션 최소화면 즉시 onDone.
 * @param {HTMLElement} el @param {() => void} [onDone]
 */
export function slideOut(el, onDone) {
  const done = () => {
    if (typeof onDone === 'function') onDone();
  };
  if (!el) {
    done();
    return;
  }
  cancelAnim(el);
  if (reduce()) {
    el.style.transform = '';
    el.style.opacity = '';
    done();
    return;
  }
  try {
    const a = animate(el, {
      opacity: [1, 0],
      translateY: [0, 8],
      scale: [1, 0.97],
      duration: DUR.slideOut,
      ease: 'outExpo',
      onComplete: () => {
        done();
        el.style.transform = '';
        el.style.opacity = '';
        el.style.willChange = '';
        store(el, null);
      },
    });
    store(el, a);
  } catch (_) {
    el.style.transform = '';
    el.style.opacity = '';
    done();
  }
}

/**
 * 오버레이 화면 페이드 인(outExpo). `.hidden`을 제거하고 투명도 0→1, 내부 본문은 살짝 떠오름.
 * 종료 상태(표시)는 class 조작으로 이미 확정 — 트윈은 표현만.
 */
export function fadeInScreen(el) {
  if (!el) return;
  el.classList.remove('hidden');
  cancelAnim(el);
  if (reduce()) {
    el.style.opacity = '';
    return;
  }
  try {
    el.style.opacity = '0'; // 첫 rAF 전 깜빡임 방지
    const a = animate(el, {
      opacity: [0, 1],
      duration: DUR.fadeIn,
      ease: 'outExpo',
      onComplete: () => {
        el.style.opacity = '';
        store(el, null);
      },
    });
    store(el, a);
    const body = el.querySelector('.screen-body, .stage-select-body');
    if (body) {
      body.style.opacity = '0';
      animate(body, {
        opacity: [0, 1],
        translateY: [12, 0],
        duration: DUR.rise,
        ease: 'outExpo',
        onComplete: () => {
          body.style.transform = '';
          body.style.opacity = '';
        },
      });
    }
  } catch (_) {
    el.style.opacity = '';
  }
}

/**
 * 오버레이 화면 페이드 아웃 후 `.hidden` 부착. 트윈 실패/모션 최소화면 즉시 숨김.
 * 이미 숨겨진 요소는 아무 것도 하지 않는다(불필요한 페이드 방지).
 */
export function fadeOutScreen(el) {
  if (!el || el.classList.contains('hidden')) return;
  cancelAnim(el);
  if (reduce()) {
    el.classList.add('hidden');
    el.style.opacity = '';
    return;
  }
  const cur = (() => {
    const o = parseFloat(getComputedStyle(el).opacity);
    return Number.isFinite(o) ? o : 1;
  })();
  try {
    const a = animate(el, {
      opacity: [cur, 0],
      duration: DUR.fadeOut,
      ease: 'outExpo',
      onComplete: () => {
        el.classList.add('hidden');
        el.style.opacity = '';
        store(el, null);
      },
    });
    store(el, a);
  } catch (_) {
    el.classList.add('hidden');
    el.style.opacity = '';
  }
}

/**
 * 가로 흔들림(배치 불가·골드 부족·잠금 피드백). 완료 시 인라인 transform 제거로 CSS로 복귀.
 * outElastic 계열 감쇠로 CSS 키프레임보다 탄력 있게. 모션 최소화면 짧은 단발 위치 튐만.
 */
export function shakeX(el) {
  if (!el) return;
  cancelAnim(el);
  if (reduce()) return; // 모션 최소화 — 흔들림 생략(디자블 상태는 이미 시각적으로 명확)
  try {
    const a = animate(el, {
      translateX: [
        { to: -7, duration: 55 },
        { to: 6, duration: 55 },
        { to: -5, duration: 55 },
        { to: 4, duration: 55 },
        { to: 0, duration: 80, ease: 'outElastic(1, .6)' },
      ],
      onComplete: () => {
        el.style.transform = '';
        store(el, null);
      },
    });
    store(el, a);
  } catch (_) {
    el.style.transform = '';
  }
}
