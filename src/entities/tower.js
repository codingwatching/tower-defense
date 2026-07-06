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

    /** overcharge: 마지막 발사 후 경과 시간 (매 발사 시 0 리셋). */
    this.idleTime = 0;
    /** rapid_volley: 연속 명중 스택·추적 대상 id — combat이 notifyHit/notifyEnemyKilled로 갱신. */
    this.volleyStacks = 0;
    this.volleyTargetId = null;
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
        mechanism: mech, // null = 메커니즘 없음. 착탄 해석은 combat
      },
      this.x,
      this.y,
      target
    );
    proj.sourceTower = this; // rapid_volley 명중 통지용 역참조 (내부 필드 — 비계약)
    return proj;
  }

  /**
   * 레벨별 실스프라이트(assetKeys[level-1] — AC-27) + 레벨 핍 배지(보조 표기).
   * 데이터가 아직 v1(assetKeys 부재)이면 v1 assetKey로 강등. 상태 변경 금지.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    const key = this.def.assetKeys
      ? this.def.assetKeys[this.level - 1]
      : this.def.assetKey;
    const img = get(key);
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
