/**
 * @module entities/tower (entity-dev)
 * 타워 엔티티. 수치는 전부 src/data/towers.js에서 — 매직 넘버 금지.
 * 런타임 shape 계약(§4.6): id, type, col, row, x, y, level, invested, alive.
 * 타겟팅: First — 사거리 내 progress 최대 적. 발사 시 tower:fired는 combat이 발행.
 * 사거리 판정(§2): 중심점 간 거리 <= range + enemy.radius.
 *
 * v2 (§4.1-v2):
 * - 레벨별 실스프라이트 assetKeys[level-1] (AC-27), 핍 배지는 보조 표기 유지.
 * - Lv2 축 오버라이드: levels[i].splashRadius / levels[i].slow — 없으면 projectile 기본값.
 * - Lv3 메커니즘 (level===3에서만 활성, 수치는 전부 mechanism 블록):
 *   rapid_volley — 유효 발사 간격 = cooldown × stackFactor^stacks. 스택은 combat이
 *                  명중 시 notifyHit로 갱신 (동일 대상 +1, 대상 변경·사망 시 0 — AC-23)
 *   overcharge  — 피해 = damage × (1 + min(idle/chargeTime, 1) × maxBonus),
 *                  idle = 마지막 발사 후 경과 시간 (AC-26)
 *   burning_ground / frost_nova — 발사 스펙에 mechanism을 실어 combat이 착탄 시 해석.
 *
 * v4 (§16.2·§16.6):
 * - draw는 getAnim으로 전환 — idle 루프 + 발사 시 attack one-shot 후 idle 복귀.
 *   상태는 순수 타이머(animClock 누적 + 발사 시 attackStart 마커)로만 update에서 갱신하고,
 *   getAnim/fps·프레임수 조회는 draw가 전유한다(§10 update/draw 분리). headless sim은 draw를
 *   부르지 않으므로 update 경로의 로더 호출은 금지 — 위반 시 makePlaceholder에서 크래시(D35-1).
 *   개체별 위상 랜덤 오프셋(animPhase)으로 같은 타워 다수의 동기 맥동 방지.
 * - 진화 변신: upgrade() 순간 2-스프라이트 크로스페이드(구 레벨 idle 0프레임 ↔ 신 레벨 시퀀스,
 *   EVOLVE_DURATION). 전투 수치는 즉시 신규 레벨 — 연출은 시각 전용(AC-54).
 * - 발사 시 projectile 스펙에 towerType 실기(§16.5) — combat이 projectile:hit 페이로드로 전달.
 *
 * v5 (§17.3 vis 계약·진화 재분담):
 * - vis = {sx,sy,rot,alpha,ox,oy} 시각 상태를 생성자에서 identity로 초기화. draw는 이를 변환에
 *   반영만 하고, update는 vis를 읽지도 쓰지도 않는다(불변식 2 — headless sim은 vis 초기값 그대로).
 *   vis 값 트윈은 fx(tween 파사드)가 이벤트 구독으로 write한다(계약 인터페이스, 소유권 위반 아님).
 * - 진화 스케일 펀치(1.0→1.15→1.0)는 fx `punch(tower.vis)`(tower:upgraded 구독)로 이관 —
 *   entity의 inline sin 스케일 계산·EVOLVE_SCALE_PEAK 상수는 삭제, draw는 vis.sx/sy만 반영.
 *   2-스프라이트 크로스페이드는 entity 전유(존치) — vis 단일 alpha로 두 스프라이트 블렌드 표현 불가.
 */

import { TOWERS } from '../data/towers.js';
import { BALANCE } from '../data/balance.js';
import { gridToPx } from '../map/grid.js';
import { getAnim } from '../core/assets.js';
import { Projectile } from './projectile.js';

// 표시용 상수 (밸런스 수치 아님)
const TOWER_DRAW_SIZE = 64;
const PIP_RADIUS = 3;
const PIP_SPACING = 9;

// v4 진화 변신 연출 상수 (§16.6 — 밸런스 수치 아님. playtester 피드백에 즉시 조정 가능하도록 모듈 상단 격리)
// v5(§17.3 재분담): 스케일 펀치는 fx punch(tower.vis)로 이관 — EVOLVE_SCALE_PEAK 삭제.
//   EVOLVE_DURATION은 2-스프라이트 크로스페이드(entity 전유) 타이밍으로 존치.
const EVOLVE_DURATION = 0.4;    // 구/신 스프라이트 크로스페이드 지속 (초)

const MAX_LEVEL = 3;

let seq = 0;

/**
 * 교체 가능한 타겟팅 전략. (candidates, tower) → Enemy.
 * candidates는 사거리 내 생존 적 1마리 이상 보장 (필터는 Tower가 수행).
 * 기본값은 first (계약 §8 확정 — 타겟 모드 전환 UI는 MVP 제외).
 */
export const TARGETING = {
  /** 경로 진행도 최대 (최전방) */
  first: (candidates) =>
    candidates.reduce((a, b) => (b.progress > a.progress ? b : a)),
  /** 경로 진행도 최소 (최후방) */
  last: (candidates) =>
    candidates.reduce((a, b) => (b.progress < a.progress ? b : a)),
  /** 타워 중심에서 최근접 */
  nearest: (candidates, tower) =>
    candidates.reduce((a, b) =>
      (b.x - tower.x) ** 2 + (b.y - tower.y) ** 2 <
      (a.x - tower.x) ** 2 + (a.y - tower.y) ** 2
        ? b
        : a
    ),
  /** 현재 HP 최대 */
  strongest: (candidates) =>
    candidates.reduce((a, b) => (b.hp > a.hp ? b : a)),
};

export class Tower {
  /** false면 컬렉션에서 일괄 제거됨. */
  alive = true;

  /**
   * @param {'arrow'|'cannon'|'frost'|'arcane'} type - TOWERS 키
   * @param {number} col @param {number} row - 그리드 위치 (점유는 combat이 grid.occupy로)
   */
  constructor(type, col, row) {
    const def = TOWERS[type];
    if (!def) throw new Error(`[tower] 정의되지 않은 타워 타입: ${type}`);
    this.id = 't' + (++seq);
    this.type = type;
    this.def = def;
    this.col = col;
    this.row = row;
    const px = gridToPx({ col, row });
    this.x = px.x;
    this.y = px.y;

    this.level = 1;
    /** 총 투자 골드 (건설+업그레이드 누계) — 환불 계산 근거 (§4.6). */
    this.invested = def.levels[0].cost;

    this.cooldownTimer = 0;
    /** 교체 가능 — TARGETING의 함수 참조를 할당. */
    this.targeting = TARGETING.first;

    /** overcharge: 마지막 발사 후 경과 시간 (매 발사 시 0 리셋). */
    this.idleTime = 0;
    /** rapid_volley: 연속 명중 스택·추적 대상 id — combat이 notifyHit/notifyEnemyKilled로 갱신. */
    this.volleyStacks = 0;
    this.volleyTargetId = null;

    // v4 애니메이션 상태 머신 (§16.2·§16.6) — 상태(타이머)는 update에서만 갱신하되,
    //   getAnim은 draw 전유(§10 update/draw 분리)로 둔다. headless sim은 update만 돌리므로
    //   update 경로에서 로더를 부르면 크래시한다(D35-1). 따라서 update는 순수 타이머만 굴리고,
    //   fps·프레임수가 필요한 시퀀스 판정은 draw가 아틀라스에서 읽어 파생한다.
    /** 연속 애니 타이머(초) — 매 스텝 누적. idle 루프·attack 경과 계산의 단일 기준. */
    this.animClock = 0;
    /** 마지막 발사 시점의 animClock — attack one-shot 시작 마커(재발사 시 갱신 = 처음부터).
     *  큰 음수 초기값 = 발사 이력 없음 → 항상 idle. */
    this.attackStart = -1e9;
    /** idle 위상 랜덤 오프셋(초) — 같은 타워 다수가 동기 맥동하지 않도록 디싱크 (§10). */
    this.animPhase = Math.random() * 1000;

    // v4 진화 변신 연출 (§16.6) — upgrade()가 트리거, draw가 2-스프라이트 크로스페이드를 그린다.
    //   스케일 펀치는 v5에서 fx punch(vis)로 이관(§17.3) — 여기선 크로스페이드 타이머만 관리.
    /** >0이면 진화 크로스페이드 진행 중 (초, update에서 감소). */
    this.evolveTimer = 0;
    /** 크로스페이드로 페이드아웃할 구 레벨 (0 = 연출 없음). */
    this.evolvePrevLevel = 0;

    // v5 시각 상태 계약(§17.3) — identity 초기화. draw가 변환에 반영만, update는 불가지.
    //   fx(tween 파사드)가 이벤트 구독으로 이 필드를 트윈한다(fx에 개방된 계약 인터페이스).
    this.vis = { sx: 1, sy: 1, rot: 0, alpha: 1, ox: 0, oy: 0 };
  }

  /** @returns {{cost:number, damage:number, range:number, cooldown:number}} 현재 레벨 수치 (+선택 오버라이드 필드) */
  get stats() {
    return this.def.levels[this.level - 1];
  }

  /** @returns {number} 현재 사거리 px — ui/placement·panel의 사거리 원용 */
  get range() {
    return this.stats.range;
  }

  /** @returns {object|null} Lv3에서만 활성인 고유 메커니즘 (§4.1-v2). 데이터에 없으면 null */
  get mechanism() {
    return this.level === MAX_LEVEL ? this.def.mechanism ?? null : null;
  }

  /** @returns {number} 유효 스플래시 반경 — levels[i].splashRadius 오버라이드 우선 (cannon Lv2 축) */
  get splashRadius() {
    return this.stats.splashRadius ?? this.def.projectile.splashRadius;
  }

  /** @returns {{factor:number, duration:number}|null} 유효 슬로우 — levels[i].slow 오버라이드 우선 (frost 축) */
  get slow() {
    return this.stats.slow ?? this.def.projectile.slow;
  }

  /** @returns {number|null} 다음 레벨 비용. 레벨 3이면 null (업그레이드 불가) */
  get upgradeCost() {
    return this.level < MAX_LEVEL ? this.def.levels[this.level].cost : null;
  }

  /** @returns {number} 판매 환불액 = floor(invested * BALANCE.sellRatio) */
  get sellRefund() {
    return Math.floor(this.invested * BALANCE.sellRatio);
  }

  /** 레벨 +1, invested 누적. 비용 검증은 combat 책임. */
  upgrade() {
    if (this.level >= MAX_LEVEL) return;
    this.invested += this.def.levels[this.level].cost;
    // v4 진화 연출 트리거 (§16.6) — 구 레벨 캡처 후 타이머 시작.
    // 전투 수치는 아래 level+1로 즉시 신규 레벨 반영(연출은 시각 전용, 게임플레이 무지연 — AC-54).
    this.evolvePrevLevel = this.level;
    this.evolveTimer = EVOLVE_DURATION;
    this.level += 1;
  }

  /**
   * (v2) 이 타워의 투사체가 직격 대상에 명중 — combat이 호출 (AC-23).
   * rapid_volley: 현재 스택 대상과 일치하는 명중마다 +1스택(상한 maxStacks).
   * 대상 귀속·변경 초기화는 발사 시점(update)이 단일 소유 — 대상 전환 후 도착한
   * 이전 대상행 투사체가 스택 귀속을 바꾸지 않는다.
   * @param {import('./enemy.js').Enemy} target - 직격 대상 (명중 시점 생존)
   */
  notifyHit(target) {
    const mech = this.mechanism;
    if (!mech || mech.type !== 'rapid_volley' || !target) return;
    if (target.id === this.volleyTargetId) {
      this.volleyStacks = Math.min(this.volleyStacks + 1, mech.maxStacks);
    }
  }

  /**
   * (v2) 이 타워의 투사체로 적 사망 — combat이 호출.
   * rapid_volley: 추적 대상 사망 시 스택 0으로 초기화 (AC-23).
   * @param {import('./enemy.js').Enemy} enemy
   */
  notifyEnemyKilled(enemy) {
    if (enemy && enemy.id === this.volleyTargetId) {
      this.volleyStacks = 0;
      this.volleyTargetId = null;
    }
  }

  /**
   * 쿨다운 진행·타겟 선정. 발사가 일어나면 생성할 투사체 정보를 반환.
   * @param {number} dt - 고정 스텝 (초)
   * @param {import('./enemy.js').Enemy[]} enemies - 생존 적 (combat이 전달)
   * @returns {import('./projectile.js').Projectile | null} 발사 시 투사체, 아니면 null
   */
  update(dt, enemies) {
    // v4 애니메이션·진화 상태 진행 — 모든 조기 반환 이전(매 스텝 보장, §16.2·§16.6).
    // 순수 타이머만 갱신 — getAnim 미호출로 headless sim 안전(D35-1). 프레임 판정은 draw 몫.
    this.animClock += dt;
    if (this.evolveTimer > 0) this.evolveTimer = Math.max(0, this.evolveTimer - dt);

    this.idleTime += dt;
    this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
    if (this.cooldownTimer > 0) return null;

    const { range, damage, cooldown } = this.stats;
    const candidates = [];
    for (const e of enemies) {
      if (!e.alive || e.reachedEnd) continue;
      const reach = range + e.radius;
      if ((e.x - this.x) ** 2 + (e.y - this.y) ** 2 <= reach * reach) {
        candidates.push(e);
      }
    }
    if (candidates.length === 0) return null;

    const target = this.targeting(candidates, this);

    // Lv3 메커니즘 반영 (§4.1-v2 공식 — 수치는 전부 data)
    const mech = this.mechanism;
    let effectiveCooldown = cooldown;
    let effectiveDamage = damage;
    if (mech && mech.type === 'rapid_volley') {
      // 대상 변경 초기화는 발사 시점 — 명중 시점까지 미루면 이전 대상의 스택이
      // 새 대상 첫 발 간격에 이월된다 (AC-23: 대상 변경/사망 시 기본 공속 복귀).
      // 대상 사망·누수 후 재조준도 이 경로로 정리된다 (타 타워·지대 킬 포함)
      if (target.id !== this.volleyTargetId) {
        this.volleyTargetId = target.id;
        this.volleyStacks = 0;
      }
      effectiveCooldown = cooldown * mech.stackFactor ** this.volleyStacks;
    } else if (mech && mech.type === 'overcharge') {
      effectiveDamage = Math.round(
        damage * (1 + Math.min(this.idleTime / mech.chargeTime, 1) * mech.maxBonus)
      );
    }

    this.cooldownTimer = effectiveCooldown;
    this.idleTime = 0;

    const proj = new Projectile(
      {
        ...this.def.projectile,
        splashRadius: this.splashRadius,
        slow: this.slow,
        damage: effectiveDamage,
        damageType: this.def.damageType,
        towerType: this.type, // v4 §16.5 — projectile:hit.towerType 발원. combat이 페이로드로 전달
        mechanism: mech, // null = 메커니즘 없음. 착탄 해석은 combat
      },
      this.x,
      this.y,
      target
    );
    proj.sourceTower = this; // rapid_volley 명중 통지용 역참조 (내부 필드 — 비계약)
    this.attackStart = this.animClock; // 발사 순간 attack one-shot 시작 마커 (재발사 시 처음부터 — §16.2)
    return proj;
  }

  /**
   * (v4 §16.2·§16.6 · v5 §17.3) 상태 머신 스프라이트 draw — getAnim으로 idle 루프/attack one-shot 크롭.
   * 시퀀스 판정(attack 경과 vs idle 복귀)은 animClock/attackStart를 **읽어** 여기서 파생한다 —
   * draw는 상태를 바꾸지 않고, getAnim은 draw 전유(§10 update/draw 분리). headless sim은 draw를
   * 부르지 않으므로 로더가 update 핫패스에서 크래시하지 않는다(D35-1 회귀 방지).
   * v5: vis(sx/sy/rot/alpha/ox/oy)를 변환에 반영만 한다(§17.3 draw 적용 규칙) — 진화 스케일 펀치는
   *   이제 fx가 vis.sx/sy로 트윈한다(inline 계산 삭제). 진화 크로스페이드(구 idle 0프레임 ↔ 신 시퀀스)는
   *   entity 전유로 존치 — vis 단일 alpha와 곱셈 합성한다(§17.3 alpha 규칙).
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    const vis = this.vis;
    const evolving = this.evolveTimer > 0 && this.evolvePrevLevel > 0;
    // 크로스페이드 진행도 0→1 (구 스프라이트 페이드아웃, 신 스프라이트 페이드인).
    const t = evolving ? 1 - this.evolveTimer / EVOLVE_DURATION : 1;
    const size = TOWER_DRAW_SIZE; // 스케일 펀치는 vis.sx/sy(fx punch)로 대체 — §17.3 재분담

    // 신 스프라이트 = 현재 레벨의 상태 머신 프레임(idle 루프 / attack one-shot).
    const cur = this._frameOf(this.level, false);

    // §17.3 draw 적용 규칙: translate(ox/oy) → scale(sx/sy) → rotate(rot) → globalAlpha*=alpha.
    //   타워는 진행각이 없으므로 rotate(vis.rot)만. 스프라이트는 원점(0,0) 중심에 그린다.
    ctx.save();
    ctx.translate(this.x + vis.ox, this.y + vis.oy);
    ctx.scale(vis.sx, vis.sy);
    ctx.rotate(vis.rot);
    ctx.globalAlpha *= vis.alpha;
    if (evolving) {
      // 구 스프라이트 = 이전 레벨 idle 0프레임(정적). 크로스페이드 alpha는 vis.alpha와 곱셈 합성(§17.3).
      const prev = this._frameOf(this.evolvePrevLevel, true);
      const baseAlpha = ctx.globalAlpha;
      ctx.globalAlpha = baseAlpha * (1 - t);
      this._blit(ctx, prev, size);
      ctx.globalAlpha = baseAlpha * t;
      this._blit(ctx, cur, size);
    } else {
      this._blit(ctx, cur, size);
    }
    ctx.restore();

    // 레벨 배지: 타일 하단 중앙에 금색 핍 level개. vis 변환 밖(절대 좌표) — 펀치·회전 비적용(가독성 유지).
    const pipY = this.y + TOWER_DRAW_SIZE / 2 - PIP_RADIUS - 2;
    const startX = this.x - ((this.level - 1) * PIP_SPACING) / 2;
    for (let i = 0; i < this.level; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * PIP_SPACING, pipY, PIP_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd54f';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.stroke();
    }
  }

  /**
   * 현재/지정 레벨의 애니 키. assetKeys[level-1](v2+), v1 데이터(assetKeys 부재)는 assetKey로 강등.
   * @param {number} level - 1~3
   * @returns {string} getAnim 키
   */
  _animKey(level) {
    return this.def.assetKeys ? this.def.assetKeys[level - 1] : this.def.assetKey;
  }

  /**
   * 표시 프레임 → 소스 시트 크롭 정보. **오직 draw 경로에서만 호출**(getAnim 전유, D35-1).
   * - idle0=false: 상태 머신. 발사 후 경과(animClock-attackStart)×fps < attack 프레임수면
   *   attack one-shot(마지막 프레임 클램프), 초과하면 idle 루프(animClock+위상 오프셋 디싱크).
   *   재생속도=아틀라스 fps(쿨다운 무관, §16.2). 재발사 시 attackStart 갱신 = one-shot 처음부터.
   * - idle0=true: idle 0프레임 고정(진화 크로스페이드의 구 레벨 스프라이트용).
   * 시퀀스 폴백(§16.2): 요청 시퀀스 부재 시 첫 시퀀스로 강등 — 아틀라스 강등에도 안전(AC-59).
   * @param {number} level @param {boolean} idle0
   * @returns {{image: CanvasImageSource, frameW:number, frameH:number, sx:number, sy:number}}
   */
  _frameOf(level, idle0) {
    const { image, atlas } = getAnim(this._animKey(level));
    const idleSeq = atlas.sequences.idle ?? Object.values(atlas.sequences)[0] ?? [0];
    let frame;
    if (idle0) {
      frame = idleSeq[0] ?? 0;
    } else {
      const attackSeq = atlas.sequences.attack ?? idleSeq;
      const attackT = (this.animClock - this.attackStart) * atlas.fps; // 발사 후 경과 프레임 수
      if (attackT < attackSeq.length) {
        frame = attackSeq[Math.min(Math.floor(attackT), attackSeq.length - 1)] ?? 0; // one-shot 클램프
      } else {
        frame = idleSeq[Math.floor((this.animClock + this.animPhase) * atlas.fps) % idleSeq.length] ?? 0; // idle 루프+위상
      }
    }
    const imgW = image.naturalWidth || image.width || atlas.frameW;
    const cols = Math.max(1, Math.floor(imgW / atlas.frameW)); // 시트 열 수(2행×4열 → 4)
    return {
      image,
      frameW: atlas.frameW,
      frameH: atlas.frameH,
      sx: (frame % cols) * atlas.frameW,
      sy: Math.floor(frame / cols) * atlas.frameH,
    };
  }

  /** 크롭 프레임을 원점(0,0) 중심에 size×size로 그림 — vis 변환(translate/scale/rotate)은 draw가 건다. */
  _blit(ctx, f, size) {
    ctx.drawImage(
      f.image, f.sx, f.sy, f.frameW, f.frameH,
      -size / 2, -size / 2, size, size
    );
  }
}
