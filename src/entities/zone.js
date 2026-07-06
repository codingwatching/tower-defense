/**
 * @module entities/zone (entity-dev)
 * (v2) 지대 엔티티 — 캐논 Lv3 '화염 지대'(burning_ground) 장판.
 * 계약: §3.9(이벤트), §4.1-v2(mechanism 파라미터), §4.6(Zone shape), §8(렌더 순서).
 *
 * - 렌더 순서: 엔티티 레이어(20) 내 타워 → **지대** → 적 → 투사체.
 * - 컬렉션 소유는 systems/combat (zones 배열). zone:created/expired 발행도 combat.
 * - 틱 피해는 이벤트 미발행 (§3.9 — 스팸 방지). 틱 사망 시 enemy:killed는 combat이 정상 발행.
 * - 수치(duration/radius/tickInterval/tickDamage/damageType)는 전부
 *   TOWERS[type].mechanism (src/data/towers.js) — 하드코딩 금지.
 */

// 표시용 상수 (밸런스 수치 아님)
const FADE_TAIL = 0.5; // 만료 직전 페이드아웃 구간 초
const FILL_ALPHA = 0.22;
const RING_ALPHA = 0.5;
const CORE_RATIO = 0.35; // 중심 발광 반경 비율

let seq = 0;

export class Zone {
  /** false면 컬렉션에서 일괄 제거됨 (제거 직전 combat이 zone:expired 발행). */
  alive = true;

  /**
   * @param {'burning'} kind - 현재 'burning'만 존재
   * @param {number} x @param {number} y - 착탄 중심 px (논리 좌표)
   * @param {object} spec - TOWERS[type].mechanism 참조
   *   {duration, radius, tickInterval, tickDamage, damageType}
   */
  constructor(kind, x, y, spec) {
    this.id = 'z' + (++seq);
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.radius = spec.radius;
    this.duration = spec.duration;
    /** 남은 지속 시간 초 (§4.6 계약 필드). */
    this.remaining = spec.duration;
    this.tickInterval = spec.tickInterval;
    this.tickDamage = spec.tickDamage;
    this.damageType = spec.damageType;
    this.tickTimer = spec.tickInterval; // 첫 틱은 생성 tickInterval초 후
  }

  /**
   * 지속시간·틱 타이머 진행. 틱 도래 시 반환값으로 combat에 알린다 —
   * 범위 내 적 탐색·피해 적용·사망 처리는 combat 소관 (§1 의존 규칙: entities는 systems를 모른다).
   * @param {number} dt - 고정 스텝 (초)
   * @returns {boolean} 이번 스텝에 피해 틱이 발생하면 true
   */
  update(dt) {
    if (!this.alive) return false;
    this.remaining -= dt;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.alive = false;
      return false;
    }
    this.tickTimer -= dt;
    if (this.tickTimer <= 0) {
      this.tickTimer += this.tickInterval;
      return true;
    }
    return false;
  }

  /**
   * 장판 드로잉 — 반투명 화염색 원 + 중심 발광 + 외곽 링. 만료 직전 페이드아웃.
   * 파티클 연출은 fx 소관 (zone:created 구독). 상태 변경 금지.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    const fade = Math.min(1, this.remaining / FADE_TAIL);
    ctx.save();
    ctx.globalAlpha = fade;

    const grad = ctx.createRadialGradient(
      this.x, this.y, this.radius * CORE_RATIO,
      this.x, this.y, this.radius
    );
    grad.addColorStop(0, `rgba(255, 170, 60, ${FILL_ALPHA * 1.8})`);
    grad.addColorStop(1, `rgba(255, 90, 30, ${FILL_ALPHA * 0.6})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(255, 140, 50, ${RING_ALPHA})`;
    ctx.stroke();
    ctx.restore();
  }
}
