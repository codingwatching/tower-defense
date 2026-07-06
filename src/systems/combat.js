/**
 * @module systems/combat (entity-dev)
 * 엔티티 컬렉션(towers/enemies/projectiles/zones)의 단일 소유자 + 건설/업그레이드/판매 처리.
 *
 * 구독: enemy:spawned {enemy}
 *      ui:build-requested {towerType, col, row} — grid.isBuildable + economy.canAfford 검증
 *      ui:upgrade-requested {towerId} / ui:sell-requested {towerId}
 *      game:started {} — 컬렉션 리셋
 * 발행: tower:placed {tower, cost} / tower:upgraded {tower, cost} / tower:sold {tower, refund}
 *      build:rejected {towerType, col, row, reason: 'gold'|'tile'|'occupied'}
 *      tower:fired {towerType, x, y, target}
 *      projectile:hit {target, damage, x, y, splashRadius} — target은 Enemy|null (§3.4 v1.1),
 *        damage는 주 타겟 실피해(없으면 0 — fx는 0이면 숫자 생략 권장)
 *      enemy:killed {enemy, reward, x, y} / enemy:escaped {enemy, livesCost}
 *      enemy:slowed {enemy, factor, duration}
 *      (v2 §3.9) zone:created {zone, x, y, radius, duration, kind} / zone:expired {zone}
 *      (v2 §3.9) frost:nova {x, y, radius}
 *
 * v2 메커니즘 해석 (§4.1-v2 — 수치는 전부 data, 여기선 동작만):
 *   burning_ground — 캐논 Lv3 착탄에 Zone 생성. 틱 피해는 이벤트 미발행(§3.9), 틱 사망은 enemy:killed 정상 발행.
 *   frost_nova     — 프로스트 Lv3 명중 시 착탄 반경 내 전원 슬로우(대상별 enemy:slowed)
 *                    + frost:nova. 헛방 도달(target null — §3.4)엔 미발동.
 *   rapid_volley   — 직격 명중을 tower.notifyHit로 통지, 사망은 notifyEnemyKilled (AC-23).
 *   overcharge     — 타워 내부(idle) 처리 — combat 관여 없음.
 *
 * 제거 규칙: alive=false 마킹 후 일괄 필터 (순회 중 splice 금지).
 */

import { on, emit } from '../core/events.js';
import { TOWERS } from '../data/towers.js';
import { Tower } from '../entities/tower.js';
import { Zone } from '../entities/zone.js';
import { inBounds, tileAt, isBuildable, occupy, release, TILE } from '../map/grid.js';
import { canAfford } from './economy.js';

/** 생존 타워. 읽기 전용 참조 (ui·waves·window.GAME용). @type {import('../entities/tower.js').Tower[]} */
export const towers = [];
/** 생존 적. @type {import('../entities/enemy.js').Enemy[]} */
export const enemies = [];
/** 비행 중 투사체. @type {import('../entities/projectile.js').Projectile[]} */
export const projectiles = [];
/** (v2) 활성 지대. @type {import('../entities/zone.js').Zone[]} */
export const zones = [];

/** 이벤트 구독 등록. main이 부트스트랩에서 1회 호출. */
export function initCombat() {
  on('enemy:spawned', ({ enemy }) => {
    enemies.push(enemy);
  });

  on('ui:build-requested', ({ towerType, col, row }) => {
    handleBuild(towerType, col, row);
  });

  on('ui:upgrade-requested', ({ towerId }) => {
    const tower = getTowerById(towerId);
    if (!tower || !tower.alive) return;
    const cost = tower.upgradeCost;
    if (cost === null || !canAfford(cost)) return; // 버튼 비활성은 ui/panel 소관 — 여기선 방어만
    tower.upgrade();
    emit('tower:upgraded', { tower, cost });
  });

  on('ui:sell-requested', ({ towerId }) => {
    const tower = getTowerById(towerId);
    if (!tower || !tower.alive) return;
    const refund = tower.sellRefund;
    tower.alive = false;
    compact(towers);
    release({ col: tower.col, row: tower.row });
    emit('tower:sold', { tower, refund });
  });

  on('game:started', () => {
    for (const t of towers) release({ col: t.col, row: t.row });
    towers.length = 0;
    enemies.length = 0;
    projectiles.length = 0;
    zones.length = 0;
  });
}

function handleBuild(towerType, col, row) {
  const def = TOWERS[towerType];
  if (!def || !Array.isArray(def.levels) || !def.levels[0]) {
    // 데이터에 없는 타워 타입: 콘솔 에러 + 배치 불가 처리, 게임은 계속 (에러 핸들링 방침)
    console.error(`[combat] 데이터에 정의되지 않은 타워 타입: ${towerType}`);
    emit('build:rejected', { towerType, col, row, reason: 'tile' });
    return;
  }
  const cell = { col, row };
  if (!inBounds(cell) || tileAt(cell) !== TILE.GRASS) {
    emit('build:rejected', { towerType, col, row, reason: 'tile' });
    return;
  }
  if (!isBuildable(cell)) {
    emit('build:rejected', { towerType, col, row, reason: 'occupied' });
    return;
  }
  const cost = def.levels[0].cost;
  if (!canAfford(cost)) {
    emit('build:rejected', { towerType, col, row, reason: 'gold' });
    return;
  }
  const tower = new Tower(towerType, col, row);
  occupy(cell);
  towers.push(tower);
  emit('tower:placed', { tower, cost });
}

/**
 * 전투 스텝: 타워 발사 → 투사체 비행/명중 → 지대 틱/만료 → 적 이동/누수 → 일괄 필터.
 * @param {number} dt - 고정 스텝 (초)
 */
export function updateCombat(dt) {
  // 1. 타워 — 쿨다운·타겟팅·발사
  for (const tower of towers) {
    const proj = tower.update(dt, enemies);
    if (proj) {
      projectiles.push(proj);
      emit('tower:fired', { towerType: tower.type, x: tower.x, y: tower.y, target: proj.target });
    }
  }

  // 2. 투사체 — 비행·도달 시 명중 해석 (피해/스플래시/슬로우/메커니즘/사망)
  for (const proj of projectiles) {
    const hit = proj.update(dt);
    if (hit) resolveHit(proj, hit);
  }

  // 3. (v2) 지대 — 틱 피해(이벤트 미발행)·만료
  for (const zone of zones) {
    if (zone.update(dt)) applyZoneTick(zone);
    if (!zone.alive) emit('zone:expired', { zone });
  }

  // 4. 적 — 이동·누수
  for (const enemy of enemies) {
    enemy.update(dt);
    if (enemy.alive && enemy.reachedEnd) {
      enemy.alive = false;
      emit('enemy:escaped', { enemy, livesCost: enemy.livesCost });
    }
  }

  // 5. 일괄 필터
  compact(towers);
  compact(enemies);
  compact(projectiles);
  compact(zones);
}

/**
 * 명중 해석. splashRadius>0이면 착탄 반경 내 전원, 아니면 직격 타겟만.
 * Lv3 메커니즘(spec.mechanism)은 착탄 시점에 여기서 해석한다.
 * @param {import('../entities/projectile.js').Projectile} proj
 * @param {{target: import('../entities/enemy.js').Enemy|null, x:number, y:number}} hit
 */
function resolveHit(proj, hit) {
  const spec = proj.spec;
  const splashRadius = spec.splashRadius || 0;
  const mech = spec.mechanism || null;

  // 1) 피해 대상 수집
  const affected = [];
  if (splashRadius > 0) {
    for (const e of enemies) {
      if (!e.alive) continue;
      const reach = splashRadius + e.radius;
      if ((e.x - hit.x) ** 2 + (e.y - hit.y) ** 2 <= reach * reach) affected.push(e);
    }
  } else if (hit.target && hit.target.alive) {
    affected.push(hit.target);
  }

  // 2) 피해 적용
  let reportedDamage = 0; // 주 타겟 실피해 (fx 데미지 숫자용 — 0이면 표기 생략 권장)
  for (const e of affected) {
    const applied = e.takeDamage(spec.damage, spec.damageType);
    if (e === hit.target || reportedDamage === 0) reportedDamage = applied;
  }

  emit('projectile:hit', {
    target: hit.target,
    damage: reportedDamage,
    x: hit.x,
    y: hit.y,
    splashRadius,
  });

  // 3) rapid_volley — 직격 명중 통지 (스택 갱신은 tower 내부 규칙 — AC-23)
  const sourceTower = proj.sourceTower;
  if (sourceTower && sourceTower.alive && hit.target && affected.includes(hit.target)) {
    sourceTower.notifyHit(hit.target);
  }

  // 4) 사망 처리
  for (const e of affected) {
    if (!e.alive || e.hp > 0) continue;
    e.alive = false;
    emit('enemy:killed', { enemy: e, reward: e.reward, x: e.x, y: e.y });
    if (sourceTower && sourceTower.alive) sourceTower.notifyEnemyKilled(e);
  }

  // 5) 슬로우 — frost_nova(Lv3)는 '명중' 시에만(§3.9 — target null 헛방 도달 제외)
  //    착탄 반경 내 전원, 그 외엔 피해 대상 중 생존자만
  if (mech && mech.type === 'frost_nova' && hit.target) {
    if (spec.slow) {
      for (const e of enemies) {
        if (!e.alive) continue;
        const reach = mech.radius + e.radius;
        if ((e.x - hit.x) ** 2 + (e.y - hit.y) ** 2 > reach * reach) continue;
        e.applySlow(spec.slow.factor, spec.slow.duration);
        emit('enemy:slowed', { enemy: e, factor: spec.slow.factor, duration: spec.slow.duration });
      }
    }
    emit('frost:nova', { x: hit.x, y: hit.y, radius: mech.radius });
  } else if (spec.slow) {
    for (const e of affected) {
      if (!e.alive) continue;
      e.applySlow(spec.slow.factor, spec.slow.duration);
      emit('enemy:slowed', { enemy: e, factor: spec.slow.factor, duration: spec.slow.duration });
    }
  }

  // 6) burning_ground — 착탄 지점에 화염 지대 생성 (§3.9)
  if (mech && mech.type === 'burning_ground') {
    const zone = new Zone('burning', hit.x, hit.y, mech);
    zones.push(zone);
    emit('zone:created', {
      zone,
      x: hit.x,
      y: hit.y,
      radius: mech.radius,
      duration: mech.duration,
      kind: 'burning',
    });
  }
}

/**
 * (v2) 지대 피해 틱 — 장판 위 생존 적 전원에 tickDamage. 이벤트 미발행 (§3.9 스팸 방지),
 * 틱 사망은 enemy:killed 정상 발행.
 * @param {import('../entities/zone.js').Zone} zone
 */
function applyZoneTick(zone) {
  for (const e of enemies) {
    if (!e.alive) continue;
    const reach = zone.radius + e.radius;
    if ((e.x - zone.x) ** 2 + (e.y - zone.y) ** 2 > reach * reach) continue;
    e.takeDamage(zone.tickDamage, zone.damageType);
    if (e.hp <= 0) {
      e.alive = false;
      emit('enemy:killed', { enemy: e, reward: e.reward, x: e.x, y: e.y });
    }
  }
}

/** alive=false 엔티티를 배열 참조 유지한 채 제자리 제거. */
function compact(arr) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].alive) arr[w++] = arr[i];
  }
  arr.length = w;
}

/**
 * 엔티티 레이어(20) drawFn — 타워 → 지대 → 적 → 투사체 순 (§8 v2).
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawEntities(ctx) {
  for (const t of towers) t.draw(ctx);
  for (const z of zones) z.draw(ctx);
  for (const e of enemies) e.draw(ctx);
  for (const p of projectiles) p.draw(ctx);
}

/**
 * @param {string|number} towerId
 * @returns {import('../entities/tower.js').Tower | undefined} ui/panel 조회용
 */
export function getTowerById(towerId) {
  return towers.find((t) => t.id === towerId);
}
