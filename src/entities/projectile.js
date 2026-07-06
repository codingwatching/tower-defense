/**
 * @module entities/projectile (entity-dev)
 * 투사체 엔티티. 스펙은 TOWERS[type].projectile (§4.1 ProjectileSpec).
 * 명중 처리(피해·스플래시·슬로우)와 projectile:hit 발행은 combat이 담당 —
 * 투사체는 비행·도달 판정까지만.
 *
 * 비행 규칙: 타겟 생존 중엔 유도(매 스텝 재조준), 타겟 사망 시 마지막 위치로 직진.
 * 도달 판정: 남은 거리 <= 이번 스텝 이동량 + 타겟 판정 반경.
 */

import { get } from '../core/assets.js';

export class Projectile {
  /** false면 컬렉션에서 일괄 제거됨. */
  alive = true;

  /**
   * @param {object} spec - TOWERS[type].projectile + {damage, damageType} (발사 시점 타워 레벨 수치)
   * @param {number} x @param {number} y - 발사 위치 (타워 중심)
   * @param {import('./enemy.js').Enemy} target - 추적 대상 (사망 시 마지막 위치로 직진)
   */
  constructor(spec, x, y, target) {
    this.spec = spec;
    this.x = x;
    this.y = y;
    this.target = target;
    this.aimX = target.x;
    this.aimY = target.y;
    this.angle = Math.atan2(target.y - y, target.x - x);
  }

  /**
   * 타겟 추적 비행. 도달 시 명중 정보를 반환하고 alive=false.
   * @param {number} dt - 고정 스텝 (초)
   * @returns {{target: import('./enemy.js').Enemy|null, x: number, y: number} | null}
   *          도달 시 명중 정보 (target=null이면 타겟이 먼저 죽어 지점 도달), 아니면 null
   */
  update(dt) {
    if (!this.alive) return null;

    const tracking = this.target && this.target.alive && !this.target.reachedEnd;
    if (tracking) {
      this.aimX = this.target.x;
      this.aimY = this.target.y;
    }

    const dx = this.aimX - this.x;
    const dy = this.aimY - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.spec.speed * dt;
    const hitDist = tracking ? this.target.radius : 0;

    if (dist <= step + hitDist) {
      this.x = this.aimX;
      this.y = this.aimY;
      this.alive = false;
      return { target: tracking ? this.target : null, x: this.x, y: this.y };
    }

    this.angle = Math.atan2(dy, dx);
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    return null;
  }

  /**
   * 스프라이트(spec.assetKey, spec.size) — 진행 방향으로 회전. 상태 변경 금지.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    const size = this.spec.size;
    const img = get(this.spec.assetKey);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
}
