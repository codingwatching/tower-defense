/**
 * @module entities/tower (entity-dev)
 * 타워 엔티티. 수치는 전부 src/data/towers.js에서 — 매직 넘버 금지.
 * 런타임 shape 계약(§4.6): id, type, col, row, x, y, level, invested, alive.
 * 타겟팅: First — 사거리 내 progress 최대 적. 발사 시 tower:fired는 combat이 발행.
 * 사거리 판정(§2): 중심점 간 거리 <= range + enemy.radius.
 */

import { TOWERS } from '../data/towers.js';
import { BALANCE } from '../data/balance.js';
import { gridToPx } from '../map/grid.js';
import { get } from '../core/assets.js';
import { Projectile } from './projectile.js';

// 표시용 상수 (밸런스 수치 아님)
const TOWER_DRAW_SIZE = 64;
const PIP_RADIUS = 3;
const PIP_SPACING = 9;

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
  }

  /** @returns {{cost:number, damage:number, range:number, cooldown:number}} 현재 레벨 수치 */
  get stats() {
    return this.def.levels[this.level - 1];
  }

  /** @returns {number} 현재 사거리 px — ui/placement·panel의 사거리 원용 */
  get range() {
    return this.stats.range;
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
    this.level += 1;
  }

  /**
   * 쿨다운 진행·타겟 선정. 발사가 일어나면 생성할 투사체 정보를 반환.
   * @param {number} dt - 고정 스텝 (초)
   * @param {import('./enemy.js').Enemy[]} enemies - 생존 적 (combat이 전달)
   * @returns {import('./projectile.js').Projectile | null} 발사 시 투사체, 아니면 null
   */
  update(dt, enemies) {
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
    this.cooldownTimer = cooldown;
    return new Projectile(
      { ...this.def.projectile, damage, damageType: this.def.damageType },
      this.x,
      this.y,
      target
    );
  }

  /**
   * 스프라이트(assetKey) + 레벨 배지(코드 드로잉 — 레벨별 스프라이트 없음). 상태 변경 금지.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    const img = get(this.def.assetKey);
    ctx.drawImage(
      img,
      this.x - TOWER_DRAW_SIZE / 2,
      this.y - TOWER_DRAW_SIZE / 2,
      TOWER_DRAW_SIZE,
      TOWER_DRAW_SIZE
    );

    // 레벨 배지: 타일 하단 중앙에 금색 핍 level개
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
}
