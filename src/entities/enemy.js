/**
 * @module entities/enemy (entity-dev)
 * 적 엔티티. 수치는 전부 src/data/enemies.js에서.
 * 런타임 shape 계약(§4.6): id, type, x, y, hp, maxHp, progress, slowed, isBoss, alive.
 * 이동: progress(px) 누적 → map/path.positionAt(progress)로 위치 결정. done이면 누수.
 * 규칙(§8): 물리 실피해 = max(1, damage - armor), magic은 armor 무시.
 *          슬로우 비중첩(지속 갱신, 강한 factor 유지), 유효 factor = factor + (1-factor)*slowResist.
 *
 * v2 (§10 애니메이션 계약):
 * - 걷기 4프레임: assets.getAnim(`${assetKey}_walk`) → {image, atlas}. 프레임 선택은
 *   개체별 누적 시간 t (전역 타이머 공유 금지) — frame = floor(t × fps) % frames.
 * - t 누적 속도 = dt × slowFactor (현재 이동속도/기본 speed) — 슬로우가 걸음으로 읽힘.
 * - 방향은 진행 각도 스프라이트 회전. HP바는 회전하지 않음.
 * - getAnim 미탑재(engine-dev v2 병행 중)이면 §10 강등 체인 ②와 동일한 로컬 폴백
 *   (정적 이미지 + 합성 단일 프레임 아틀라스)으로 동작 — draw 호출부 분기 없음.
 */

import { ENEMIES } from '../data/enemies.js';
import { positionAt } from '../map/path.js';
import * as assets from '../core/assets.js';

// 표시용 상수 (밸런스 수치 아님 — 밸런스는 전부 src/data/*)
const HP_BAR_HEIGHT = 5;
const HP_BAR_GAP = 4;

let seq = 0;

/** getAnim 부재 시의 로컬 강등 캐시 — 키당 1회 합성 (§10 체인 ② 동형). */
const fallbackAnims = new Map();

/**
 * @param {string} walkKey - `${assetKey}_walk` (§5.2)
 * @param {string} staticKey - 정적 폴백 키 (§4.2 assetKey)
 * @returns {{image: CanvasImageSource, atlas: object}} 항상 유효한 쌍
 */
function resolveAnim(walkKey, staticKey) {
  if (typeof assets.getAnim === 'function') return assets.getAnim(walkKey);
  let pair = fallbackAnims.get(walkKey);
  if (!pair) {
    const image = assets.get(staticKey);
    pair = {
      image,
      atlas: {
        frameW: image.width,
        frameH: image.height,
        frames: 1,
        fps: 1,
        sequences: { walk: [0] },
      },
    };
    fallbackAnims.set(walkKey, pair);
  }
  return pair;
}

export class Enemy {
  /** false면 컬렉션에서 일괄 제거됨. */
  alive = true;

  /**
   * @param {string} type - ENEMIES 키 (goblin | orc | steel_brute | wasp_runner | stone_golem)
   * @param {number} hpMultiplier - 현재 웨이브의 HP 배수 (WAVES[i].hpMultiplier)
   */
  constructor(type, hpMultiplier) {
    const def = ENEMIES[type];
    if (!def) throw new Error(`[enemy] 정의되지 않은 적 타입: ${type}`);
    this.id = 'e' + (++seq);
    this.type = type;
    this.def = def;

    this.maxHp = Math.max(1, Math.round(def.hp * hpMultiplier));
    this.hp = this.maxHp;
    this.armor = def.armor;
    this.speed = def.speed;
    this.reward = def.reward;
    this.livesCost = def.livesCost;
    this.slowResist = def.slowResist;
    this.radius = def.radius;
    this.isBoss = !!def.isBoss;

    /** 경로 누적 이동 거리 px — 타겟팅 First 기준. */
    this.progress = 0;
    /** 도착점 도달 플래그 — 누수 처리(enemy:escaped)는 combat이 담당. */
    this.reachedEnd = false;

    /** 유효 슬로우 배수(slowResist 반영 후). 1 = 슬로우 없음. */
    this.slowFactor = 1;
    this.slowTimer = 0;

    /** 걷기 애니메이션 누적 시간 (개체별 — §10). draw 전용, 물리 무관. */
    this.animTime = 0;
    /** 진행 방향 rad — 스프라이트 회전용. 이동 전 기본 0(우향). */
    this.angle = 0;

    const start = positionAt(0);
    this.x = start.x;
    this.y = start.y;
  }

  /** @returns {boolean} 슬로우 활성 여부 — fx 청색 틴트용 (§4.6 계약 필드) */
  get slowed() {
    return this.slowTimer > 0;
  }

  /**
   * 경로 이동(슬로우 반영)·슬로우 타이머 감소·애니 시간 누적. 도착 판정은 combat이 처리.
   * @param {number} dt - 고정 스텝 (초)
   */
  update(dt) {
    if (!this.alive || this.reachedEnd) return;

    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.slowTimer = 0;
        this.slowFactor = 1;
      }
    }

    const prevX = this.x;
    const prevY = this.y;
    this.progress += this.speed * this.slowFactor * dt;
    const pos = positionAt(this.progress);
    this.x = pos.x;
    this.y = pos.y;
    if (pos.done) this.reachedEnd = true;

    if (this.x !== prevX || this.y !== prevY) {
      this.angle = Math.atan2(this.y - prevY, this.x - prevX);
    }
    this.animTime += dt * this.slowFactor; // 슬로우 시 걸음도 느려짐 (§10 권장)
  }

  /**
   * 걷기 프레임(개체 누적 시간·진행 방향 회전) + HP바(비회전).
   * 슬로우 틴트는 fx 소관(slowed 플래그 노출만). 상태 변경 금지.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    const size = this.def.size;
    const { image, atlas } = resolveAnim(this.def.assetKey + '_walk', this.def.assetKey);
    const seqWalk = (atlas.sequences && atlas.sequences.walk) || [0];
    const frame = seqWalk[Math.floor(this.animTime * atlas.fps) % seqWalk.length];

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.drawImage(
      image,
      frame * atlas.frameW, 0, atlas.frameW, atlas.frameH,
      -size / 2, -size / 2, size, size
    );
    ctx.restore();

    if (this.hp < this.maxHp) {
      const w = size;
      const barX = this.x - w / 2;
      const barY = this.y - size / 2 - HP_BAR_GAP - HP_BAR_HEIGHT;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(barX, barY, w, HP_BAR_HEIGHT);
      const ratio = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = ratio > 0.5 ? '#4caf50' : ratio > 0.25 ? '#ffc107' : '#f44336';
      ctx.fillRect(barX, barY, w * ratio, HP_BAR_HEIGHT);
    }
  }

  /**
   * 피해 적용. 사망 판정(hp<=0 → enemy:killed)은 combat이 담당.
   * @param {number} amount - 원 피해량
   * @param {'physical'|'magic'} damageType - magic은 armor 무시
   * @returns {number} 실제 적용된 피해
   */
  takeDamage(amount, damageType) {
    if (!this.alive || this.hp <= 0) return 0;
    const applied = damageType === 'magic' ? amount : Math.max(1, amount - this.armor);
    this.hp -= applied;
    return applied;
  }

  /**
   * 슬로우 적용/갱신. 비중첩 — 더 강한(낮은) factor 유지, 지속시간은 긴 쪽으로 갱신.
   * enemy:slowed 발행은 combat 책임.
   * @param {number} factor - 속도 배수 0~1 (slowResist 반영 전)
   * @param {number} duration - 초
   */
  applySlow(factor, duration) {
    const effective = factor + (1 - factor) * this.slowResist;
    this.slowFactor = this.slowTimer > 0 ? Math.min(this.slowFactor, effective) : effective;
    this.slowTimer = Math.max(this.slowTimer, duration);
  }
}
