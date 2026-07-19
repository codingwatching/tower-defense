/**
 * @module fx/tween (fx-dev) — 절차적 트윈 파사드 (계약 §17.4, td-code-standards "절차적 트윈 규약")
 *
 * 스프라이트 시퀀스(포즈 교체) '위에' 이징 보간 트윈을 겹쳐 프레임 사이의 딱딱함을 없앤다.
 * 시트=무엇을 하는지(포즈), 트윈=어떻게 움직이는지(가감속·탄성·오버슈트).
 *
 * 이 파일이 anime.js를 직접 import하는 유일한 게임 측 창구다(+ src/ui). entities/systems/map/
 * core/data는 anime를 import하지 않는다(헤드리스 sim 안전 — 트윈=draw 전유). 경계 게이트:
 *   grep -rl "vendor/anime" src/entities src/systems src/map src/core src/data  → 빈 출력.
 * sim.mjs는 tween.js를 import하지 않으므로(entities/systems/data만) anime의 rAF 의존이 sim에 닿지 않는다.
 *
 * 시각 전용 불변식(§17.3): 트윈 대상은 엔티티 vis({sx,sy,rot,alpha,ox,oy})와 fx 소유 시체 vis뿐.
 *   게임플레이 상태(HP·경로 진행도·쿨다운·골드·웨이브 타이머)는 절대 트윈하지 않는다 — 고정
 *   타임스텝 결정성이 유일한 시계다. vis는 게임 로직에 되먹임되지 않는다.
 *
 * 인프라급 필수 모듈(§17.5): 효과 모듈(particles/floaters/flashes/glint)과 달리 통째로 빼는 대상이
 *   아니다. 단 anime 부재·API 불일치 시에도 프리셋은 vis를 최종 상태로 즉시 정착시키는 no-op으로
 *   조용히 강등되어 게임은 정상 렌더한다(vis identity 기본값).
 *
 * 공개 API (8 시그니처 §17.4 + 시체 draw/update + init):
 *   popIn(vis) / deathOut(vis,onDone) / punch(vis,scale=1.15) / recoil(vis,angle) / shake(vis)
 *   pauseAll() / resumeAll() / killTweens(vis)
 *   initTween() (구독 배선) / updateCorpses(dt) (시체 TTL 안전망) / drawCorpses(ctx) (레이어)
 *
 * 트리거(기존 이벤트만 — 신규 이벤트 0, §17.4 트리거 표):
 *   tower:placed   → popIn(tower.vis) + 위치→vis 캐시 적재
 *   tower:upgraded → punch(tower.vis) (§17.3 스케일 펀치 이관분) + 캐시 갱신
 *   tower:sold     → 캐시 제거 + killTweens
 *   tower:fired    → recoil(tower.vis, fireAngle) — 페이로드에 tower 참조 없음 → 위치 캐시로 resolve
 *   enemy:spawned  → popIn(enemy.vis) (boss도 enemy:spawned를 함께 받으므로 boss:spawned 미구독=중복 방지)
 *   enemy:killed   → fx 소유 별도 시체 vis에 deathOut(로직 사망과 분리) + killTweens(enemy.vis)
 *   enemy:escaped  → killTweens(enemy.vis) (유령 popIn 정리)
 *   game:started   → 시체 정리 + 위치 캐시 초기화
 */

import { on } from '../core/events.js';
import { animate } from '../../vendor/anime.esm.min.js';
import * as assets from '../core/assets.js';
import { ENEMIES } from '../data/enemies.js';

// ─────────────────────────────────────────────────────────────
// 튜닝 상수 — 지속시간(ms)·강도는 여기서 (playtester 피드백 대응 지점).
// 이징 톤은 계약 고정(linear 금지): 등장 outBack·소멸 inQuad·펀치/반동 outElastic.
// ─────────────────────────────────────────────────────────────
const IS_COARSE = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;

const POP_IN = { dur: 350, ease: 'outBack', from: 0.6 };   // 등장 스케일-인 + 페이드-인
const DEATH_OUT = { dur: 300, ease: 'inQuad', to: 0.7 };   // 소멸 페이드 + 수축
const PUNCH = { up: 120, down: 280, upEase: 'outQuad', downEase: 'outElastic', scale: 1.15 }; // 레벨업 펀치
const RECOIL = { dur: 250, ease: 'outElastic', kick: 6 };  // 발사 반동(px 킥백 후 탄성 복귀)
const SHAKE = { dur: 200, ease: 'outQuad', amp: 4 };        // 피격 지터(px)

// 동시 트윈 상한(§17.4) — 초과 시 가장 오래된 것부터 즉시 완료 처리(조용한 강등).
const MAX_ACTIVE_TWEENS = IS_COARSE ? 56 : 96;
// 시체 풀 — 웨이브 후반 대량 사망 시 GC 스파이크 방지(링 버퍼 재활용).
const CORPSE_POOL_SIZE = IS_COARSE ? 12 : 24;
const CORPSE_MAX_LIFE = 1.2; // s — deathOut(≈0.3s)보다 넉넉한 안전 TTL(트윈 유실 대비)

const HAS_ANIME = typeof animate === 'function';

// ─────────────────────────────────────────────────────────────
// 활성 트윈 레지스트리 — 일시정지·상한·채널 충돌 해소를 위해 직접 추적.
// (anime 전역 engine.pause는 UI 트랜지션까지 얼리므로 사용하지 않는다 — 자체 추적만 정지.)
// ─────────────────────────────────────────────────────────────
/** @type {{anim:object|null, target:object, channels:string[], finalState:object, onDone:(()=>void)|null, done:boolean}[]} */
const active = [];
let paused = false;

/** 두 채널 집합이 하나라도 겹치면 true — 같은 vis 프로퍼티를 두 트윈이 다투는 것을 막는다. */
function shareChannel(a, b) {
  for (const c of a) if (b.includes(c)) return true;
  return false;
}

/** rec의 최종 상태를 target에 정착시킨다(강제 완료·자연 완료 공통). */
function applyFinal(rec) {
  if (rec.finalState) Object.assign(rec.target, rec.finalState);
}

/** 트윈 완료(자연/강제) — 최종 상태 정착 + 레지스트리 제거 + onDone 1회. 재진입은 done 가드. */
function settle(rec) {
  if (rec.done) return;
  rec.done = true;
  applyFinal(rec);
  const i = active.indexOf(rec);
  if (i !== -1) active.splice(i, 1);
  if (rec.anim && typeof rec.anim.cancel === 'function') {
    try { rec.anim.cancel(); } catch (e) { /* 무해 */ }
  }
  if (rec.onDone) { try { rec.onDone(); } catch (e) { /* fx 예외 격리 */ } }
}

/** 강등 완료(anime 부재/실패) — active에 넣지 않고 즉시 최종 상태+onDone. */
function settleImmediate(rec) {
  rec.done = true;
  applyFinal(rec);
  if (rec.onDone) { try { rec.onDone(); } catch (e) { /* 격리 */ } }
}

/**
 * 같은 vis에서 채널이 겹치는 기존 트윈을 승계 종료(새 트윈이 대체). 두 가지를 보장한다:
 * ① **새 트윈이 덮지 않는 채널(orphan)은 취소 대상의 finalState로 정착** — 아무도 최종값을 주지 않아
 *    vis가 중간값에 방치되는 것을 막는다. (P1: popIn['sx','sy','alpha'] 진행 중 punch['sx','sy']가 오면
 *    alpha를 아무도 1로 안 맞춰 타워가 alpha≈0으로 투명해지던 버그. 새 트윈이 덮는 채널은 현재값 그대로
 *    넘겨 이어받게 둔다.)
 * ② **취소 대상의 정리 콜백(onDone)을 발화** — 현재 onDone은 deathOut의 시체 제거뿐이다. 실제 흐름에선
 *    시체 vis가 유일해 승계되지 않지만(spawnCorpse가 killTweens 후 deathOut), 만약 승계되면 시체가
 *    active에 방치되는 변종을 막기 위해 발화한다(safe-by-construction). onDone 없는 프리셋엔 무영향.
 */
function cancelChannels(vis, channels) {
  for (let i = active.length - 1; i >= 0; i--) {
    const rec = active[i];
    if (rec.target !== vis || !shareChannel(rec.channels, channels)) continue;
    rec.done = true;
    active.splice(i, 1);
    if (rec.anim && typeof rec.anim.cancel === 'function') {
      try { rec.anim.cancel(); } catch (e) { /* 무해 */ }
    }
    if (rec.finalState) {
      for (const key of rec.channels) {
        if (!channels.includes(key) && key in rec.finalState) vis[key] = rec.finalState[key];
      }
    }
    if (rec.onDone) { try { rec.onDone(); } catch (e) { /* fx 예외 격리 */ } }
  }
}

/** 상한 초과 시 가장 오래된 트윈부터 즉시 완료(조용한 강등 — 콘솔 스팸·드랍 금지). */
function enforceCap() {
  while (active.length > MAX_ACTIVE_TWEENS) settle(active[0]);
}

/**
 * 트윈 생성의 단일 통로. 채널 충돌 해소 → anime 생성(실패 시 강등) → 상한 유지.
 * @param {object} vis - 대상 vis
 * @param {object} params - anime 파라미터(프로퍼티 키프레임·duration·ease)
 * @param {object} finalState - 최종 정착값(강제 완료/강등 시 적용)
 * @param {string[]} channels - 이 트윈이 쓰는 vis 프로퍼티명
 * @param {(()=>void)|null} onDone - 완료 콜백(deathOut만 사용)
 */
function track(vis, params, finalState, channels, onDone) {
  cancelChannels(vis, channels);
  const rec = { anim: null, target: vis, channels, finalState, onDone: onDone || null, done: false };
  if (HAS_ANIME) {
    try {
      rec.anim = animate(vis, { ...params, onComplete: () => settle(rec) });
      // 정지 상태에서 생성되면 즉시 정지(드리프트 방지) — 정상 흐름엔 거의 없는 방어.
      if (paused && rec.anim && typeof rec.anim.pause === 'function') rec.anim.pause();
      active.push(rec);
      enforceCap();
      return rec;
    } catch (e) {
      rec.anim = null; // API 불일치 등 — 강등 경로로.
    }
  }
  settleImmediate(rec);
  return rec;
}

// ─────────────────────────────────────────────────────────────
// 프리셋 8종 (§17.4 공개 시그니처 — 문자 단위 확정)
// ─────────────────────────────────────────────────────────────

/** 등장: sx,sy 0.6→1 · alpha 0→1 (outBack 오버슈트). */
export function popIn(vis) {
  if (!vis) return;
  vis.sx = POP_IN.from; vis.sy = POP_IN.from; vis.alpha = 0;
  track(
    vis,
    { sx: 1, sy: 1, alpha: 1, duration: POP_IN.dur, ease: POP_IN.ease },
    { sx: 1, sy: 1, alpha: 1 },
    ['sx', 'sy', 'alpha'],
    null,
  );
}

/** 소멸: alpha 1→0 · sx,sy→0.7 (inQuad). 완료 시 onDone 1회(시체 슬롯 반환). */
export function deathOut(vis, onDone) {
  if (!vis) { if (onDone) { try { onDone(); } catch (e) { /* 격리 */ } } return; }
  track(
    vis,
    { alpha: 0, sx: DEATH_OUT.to, sy: DEATH_OUT.to, duration: DEATH_OUT.dur, ease: DEATH_OUT.ease },
    { alpha: 0, sx: DEATH_OUT.to, sy: DEATH_OUT.to },
    ['sx', 'sy', 'alpha'],
    onDone || null,
  );
}

/** 스케일 펀치: sx,sy 1→scale→1 (빠른 상승 outQuad → 탄성 복귀 outElastic). §17.3 레벨업 이관분. */
export function punch(vis, scale = PUNCH.scale) {
  if (!vis) return;
  vis.sx = 1; vis.sy = 1;
  track(
    vis,
    {
      sx: [{ to: scale, duration: PUNCH.up, ease: PUNCH.upEase }, { to: 1, duration: PUNCH.down, ease: PUNCH.downEase }],
      sy: [{ to: scale, duration: PUNCH.up, ease: PUNCH.upEase }, { to: 1, duration: PUNCH.down, ease: PUNCH.downEase }],
    },
    { sx: 1, sy: 1 },
    ['sx', 'sy'],
    null,
  );
}

/** 발사 반동: 발사각 반대로 ox,oy 킥백 후 0 복귀(outElastic 스프링). */
export function recoil(vis, angle) {
  if (!vis || !Number.isFinite(angle)) return;
  vis.ox = -Math.cos(angle) * RECOIL.kick;
  vis.oy = -Math.sin(angle) * RECOIL.kick;
  track(
    vis,
    { ox: 0, oy: 0, duration: RECOIL.dur, ease: RECOIL.ease },
    { ox: 0, oy: 0 },
    ['ox', 'oy'],
    null,
  );
}

/** 피격 지터: ox,oy 짧은 랜덤 진동 후 0. 선택 프리셋(배선은 fx 재량, 시그니처는 계약). */
export function shake(vis) {
  if (!vis) return;
  const a = SHAKE.amp;
  const r = () => (Math.random() * 2 - 1) * a;
  track(
    vis,
    {
      ox: [{ to: r() }, { to: r() * 0.7 }, { to: r() * 0.4 }, { to: 0 }],
      oy: [{ to: r() }, { to: r() * 0.7 }, { to: r() * 0.4 }, { to: 0 }],
      duration: SHAKE.dur,
      ease: SHAKE.ease,
    },
    { ox: 0, oy: 0 },
    ['ox', 'oy'],
    null,
  );
}

/**
 * 일시정지(§17.5): main이 'playing' 이탈 직후 호출. 자체 추적 트윈만 정지 — 전역 anime engine은
 * 건드리지 않는다(UI 트랜지션 동결 방지). vis 드리프트만 막는다.
 */
export function pauseAll() {
  paused = true;
  for (const rec of active) {
    if (rec.anim && typeof rec.anim.pause === 'function') {
      try { rec.anim.pause(); } catch (e) { /* 무해 */ }
    }
  }
}

/** 재개(§17.5): main이 'playing' 진입 직전 호출. */
export function resumeAll() {
  paused = false;
  for (const rec of active) {
    if (!rec.anim) continue;
    const fn = rec.anim.resume || rec.anim.play;
    if (typeof fn === 'function') {
      try { fn.call(rec.anim); } catch (e) { /* 무해 */ }
    }
  }
}

/** 해당 vis의 잔여 트윈 즉시 종료 + vis를 identity로 리셋(유령 트윈 차단, §17.4 수명 규칙). */
export function killTweens(vis) {
  if (!vis) return;
  for (let i = active.length - 1; i >= 0; i--) {
    const rec = active[i];
    if (rec.target !== vis) continue;
    rec.done = true;
    active.splice(i, 1);
    if (rec.anim && typeof rec.anim.cancel === 'function') {
      try { rec.anim.cancel(); } catch (e) { /* 무해 */ }
    }
  }
  vis.sx = 1; vis.sy = 1; vis.rot = 0; vis.alpha = 1; vis.ox = 0; vis.oy = 0;
}

// ─────────────────────────────────────────────────────────────
// 시체 페이드 — fx 소유 별도 시각 개체(§17.4). 로직 사망(alive=false·보상)과 분리.
// 라이브 enemy.vis가 아니라 자체 vis에 deathOut. 스프라이트는 enemy.type→getAnim 0프레임.
// ─────────────────────────────────────────────────────────────
function makeCorpse() {
  return {
    active: false, type: 'goblin', assetKey: 'enemy_goblin', size: 40,
    x: 0, y: 0, angle: 0, life: 0,
    vis: { sx: 1, sy: 1, rot: 0, alpha: 1, ox: 0, oy: 0 },
  };
}
const corpses = [];
for (let i = 0; i < CORPSE_POOL_SIZE; i++) corpses.push(makeCorpse());
let corpseHead = 0;

/** getAnim 부재 시 로컬 강등 캐시(enemy.js resolveAnim 동형) — 키당 1회 합성. draw 전용. */
const fallbackAnims = new Map();
function resolveCorpseAnim(assetKey) {
  const walkKey = assetKey + '_walk';
  if (typeof assets.getAnim === 'function') return assets.getAnim(walkKey);
  let pair = fallbackAnims.get(walkKey);
  if (!pair) {
    const image = assets.get(assetKey);
    pair = { image, atlas: { frameW: image.width, frameH: image.height, frames: 1, fps: 1, sequences: { walk: [0] } } };
    fallbackAnims.set(walkKey, pair);
  }
  return pair;
}

/** enemy:killed 시 시체 시각 개체 스폰 → deathOut. 슬롯 재활용 시 이전 잔여 트윈을 먼저 끊는다. */
function spawnCorpse(enemy, x, y) {
  const c = corpses[corpseHead];
  corpseHead = (corpseHead + 1) % CORPSE_POOL_SIZE;
  killTweens(c.vis); // 재활용 슬롯의 유령 트윈 차단 + vis identity 리셋
  const type = (enemy && enemy.type) || 'goblin';
  const def = (enemy && enemy.def) || ENEMIES[type] || null;
  c.active = true;
  c.type = type;
  c.assetKey = (def && def.assetKey) || ('enemy_' + type);
  c.size = (def && def.size) || 40;
  c.angle = (enemy && Number.isFinite(enemy.angle)) ? enemy.angle : 0;
  c.x = x; c.y = y; c.life = 0;
  deathOut(c.vis, () => { c.active = false; }); // vis는 killTweens로 identity → alpha 1→0 페이드
}

/** game:started 시 전 시체 정리(잔여 트윈 severance 포함). */
function clearCorpses() {
  for (const c of corpses) {
    if (!c.active) continue;
    killTweens(c.vis);
    c.active = false;
  }
}

/**
 * 시체 TTL 안전망 — 트윈 유실(엔진 히컵·일시정지 중 상태 전이)로 남은 시체를 게임 시간으로 회수.
 * anime의 onDone과 독립. main update(배속 반영)에서 호출. getAnim 미호출(draw 전유 불변식 유지).
 * @param {number} dt - 고정 스텝(초)
 */
export function updateCorpses(dt) {
  for (const c of corpses) {
    if (!c.active) continue;
    c.life += dt;
    if (c.life >= CORPSE_MAX_LIFE) {
      killTweens(c.vis);
      c.active = false;
    }
  }
}

/**
 * 시체 draw — sub-entity 밴드(§17.4: 배경/terrain-anim 위·엔티티 20 아래 → 신규 적이 시체를 덮어그림, order≤30이라
 *   셰이크 월드 동조). **정확한 레이어 번호는 계약·renderer 화이트리스트가 단일 출처**이고 main이 registerLayer로 배선한다
 *   — drawCorpses는 레이어 무관(fx는 drawFn만 제공). 상태 변경 금지.
 * enemy.draw의 스프라이트 경로 재현(0프레임 정지) + vis 변환 반영.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawCorpses(ctx) {
  for (const c of corpses) {
    if (!c.active || c.vis.alpha <= 0.01) continue;
    const { image, atlas } = resolveCorpseAnim(c.assetKey);
    const vis = c.vis;
    ctx.save();
    ctx.globalAlpha = vis.alpha;
    ctx.translate(c.x + vis.ox, c.y + vis.oy);
    ctx.scale(vis.sx, vis.sy);
    ctx.rotate(c.angle + vis.rot);
    ctx.drawImage(
      image,
      0, 0, atlas.frameW, atlas.frameH,          // 0프레임(정지 시체)
      -c.size / 2, -c.size / 2, c.size, c.size,
    );
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
// 트리거 배선 — 기존 이벤트만(§17.4 트리거 표). 전부 방어적(트윈 예외가 전투 emit을 끊지 않게).
// ─────────────────────────────────────────────────────────────

/** 위치→타워 vis 캐시. tower:fired는 tower 참조가 없어(§3.4 불변) (x,y)로 발원 타워를 resolve. */
const towerVisByPos = new Map();
const posKey = (x, y) => `${Math.round(x)},${Math.round(y)}`;

let warned = false;
function guard(fn) {
  return (payload) => {
    try { fn(payload || {}); } catch (e) {
      if (!warned) { warned = true; console.warn('[fx/tween] 트윈 강등:', e); }
    }
  };
}

/** 구독 등록. main이 1회 호출(safeInit). */
export function initTween() {
  on('tower:placed', guard(({ tower }) => {
    if (!tower) return;
    towerVisByPos.set(posKey(tower.x, tower.y), tower.vis || null);
    if (tower.vis) popIn(tower.vis);
  }));
  on('tower:upgraded', guard(({ tower }) => {
    if (!tower) return;
    towerVisByPos.set(posKey(tower.x, tower.y), tower.vis || null); // 동일 타워 객체 — vis 참조 갱신
    if (tower.vis) punch(tower.vis);
  }));
  on('tower:sold', guard(({ tower }) => {
    if (!tower) return;
    towerVisByPos.delete(posKey(tower.x, tower.y));
    if (tower.vis) killTweens(tower.vis);
  }));
  on('tower:fired', guard(({ x, y, target }) => {
    if (!Number.isFinite(x) || !target) return; // target===null이면 반동 생략(헛방)
    const vis = towerVisByPos.get(posKey(x, y));
    if (!vis) return; // 캐시 미스 — recoil 생략(무해)
    recoil(vis, Math.atan2(target.y - y, target.x - x));
  }));
  // boss:spawned는 enemy:spawned를 '추가로' 받으므로(§3.2), 여기서 boss:spawned를 또 구독하면 이중 popIn.
  on('enemy:spawned', guard(({ enemy }) => {
    if (enemy && enemy.vis) popIn(enemy.vis);
  }));
  on('enemy:killed', guard(({ enemy, x, y }) => {
    if (enemy && enemy.vis) killTweens(enemy.vis); // 유령 popIn 정리(§17.4)
    if (Number.isFinite(x) && Number.isFinite(y)) spawnCorpse(enemy, x, y);
  }));
  on('enemy:escaped', guard(({ enemy }) => {
    if (enemy && enemy.vis) killTweens(enemy.vis);
  }));
  on('game:started', guard(() => {
    clearCorpses();
    towerVisByPos.clear();
  }));
}
