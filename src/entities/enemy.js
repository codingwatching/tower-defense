/**
 * @module entities/enemy (entity-dev)
 * 적 엔티티. 수치는 전부 src/data/enemies.js에서.
 * 런타임 shape 계약(§4.6): id, type, x, y, hp, maxHp, progress, slowed, isBoss, alive.
 * 이동: progress(px) 누적 → map/path.positionAt(progress)로 위치 결정. done이면 누수.
 * 규칙(§8): 물리 실피해 = max(1, damage - armor), magic은 armor 무시.
 *          슬로우 비중첩(지속 갱신, 강한 factor 유지), 유효 factor = factor + (1-factor)*slowResist.
 */

import { ENEMIES } from '../data/enemies.js';
import { positionAt } from '../map/path.js';
import { get } from '../core/assets.js';

// 표시용 상수 (밸런스 수치 아님 — 밸런스는 전부 src/data/*)
const HP_BAR_HEIGHT = 5;
const HP_BAR_GAP = 4;

let seq = 0;

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

    const start = positionAt(0);
    this.x = start.x;
    this.y = start.y;
  }

  /** @returns {boolean} 슬로우 활성 여부 — fx 청색 틴트용 (§4.6 계약 필드) */
  get slowed() {
    return this.slowTimer > 0;
  }

  /**
   * 경로 이동(슬로우 반영)·슬로우 타이머 감소. 도착점 도달 판정은 combat이 처리.
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

    this.progress += this.speed * this.slowFactor * dt;
    const pos = positionAt(this.progress);
    this.x = pos.x;
    this.y = pos.y;
    if (pos.done) this.reachedEnd = true;
  }

  /**
   * 스프라이트 + HP바. 슬로우 틴트는 fx 소관(slowed 플래그 노출만). 상태 변경 금지.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    const size = this.def.size;
    const img = get(this.def.assetKey);
    ctx.drawImage(img, this.x - size / 2, this.y - size / 2, size, size);

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
