import { state } from './state.js';
import {
  ENEMY_TYPES,
  ELITE_SPAWN_CHANCE,
  ELITE_HP_MULT,
  ELITE_XP_MULT,
  ELITE_DMG_MULT,
  ELITE_RADIUS_MULT,
  spawnDifficultyTier,
  SPAWN_TIER_DURATION_SEC,
} from './constants.js';
import { resolveEnemyAppearance } from './enemy-appearance.js';
import { isInfiniteTiling } from './tilemap.js';
import { spawnParticles } from './particles.js';
import { spawnXP } from './leveling.js';
import { dropBossLoot } from './world-pickups.js';
import {
  resolveCircleMoveGreedy,
  separateCircleFromObstacles,
  findSpawnRing,
  findSpawnRingDirectional,
  clampXYToMapBounds,
} from './map-obstacles.js';

/** Grunts farther than this from the player are removed (simulates VS off-screen cleanup). */
const ENEMY_DESPAWN_DIST_SQ = 3000 * 3000;
/** Max non-boss enemies alive; bosses do not count and are never removed by overflow. */
const ENEMY_MAX_NON_BOSS = 300;
/** Movement speed vs design baseline (0.75 = 25% slower). */
const ENEMY_SPEED_MULT = 0.75;

function cullDistantAndOverflowEnemies(px, py) {
  state.enemies = state.enemies.filter((e) => {
    if (e.type === 'boss' || e.migrant) return true;
    const dx = e.x - px;
    const dy = e.y - py;
    return dx * dx + dy * dy <= ENEMY_DESPAWN_DIST_SQ;
  });
  const nonBoss = state.enemies.filter((e) => e.type !== 'boss' && !e.migrant);
  if (nonBoss.length <= ENEMY_MAX_NON_BOSS) return;
  const need = nonBoss.length - ENEMY_MAX_NON_BOSS;
  const ranked = nonBoss
    .map((e) => ({
      e,
      d: Math.hypot(e.x - px, e.y - py),
    }))
    .sort((a, b) => b.d - a.d);
  const drop = new Set(ranked.slice(0, need).map((x) => x.e));
  state.enemies = state.enemies.filter(
    (e) => e.type === 'boss' || e.migrant || !drop.has(e)
  );
}

/**
 * @param {string} type
 * @param {number} x
 * @param {number} y
 * @param {{ allowOutside?: boolean, migrantSpawn?: { center: { cx: number, cy: number }, gid: number }, noElite?: boolean, forceElite?: boolean }} [opts]
 */
export function spawnEnemy(type, x, y, opts = {}) {
  const t = ENEMY_TYPES[type];
  const scale = 1 + state.gameTime / 120;
  const r = t.r * (type === 'boss' ? 1 + state.gameTime / 300 : 1);
  let x0 = x;
  let y0 = y;
  if (!opts.allowOutside) {
    const bd = clampXYToMapBounds(x0, y0, r);
    x0 = bd.x;
    y0 = bd.y;
  }
  const vis = resolveEnemyAppearance(type, state.enemyVisualSet);
  /** @type {any} */
  const e = {
    id: state.enemyId++,
    type,
    x: x0,
    y: y0,
    r,
    hp: t.hp * scale,
    maxHp: t.hp * scale,
    speed:
      t.speed *
      (type === 'boss' ? 1 : 1 + state.gameTime / 180) *
      (type === 'boss' ? 1 : ENEMY_SPEED_MULT),
    color: vis.color,
    glintColor: vis.glintColor,
    shape: t.shape,
    xp: Math.floor(t.xp * scale),
    dmg: t.dmg * scale,
    ranged: t.ranged || false,
    dashTimer: t.dashTimer || 0,
    dashCooldown: 0,
    dashDir: { x: 0, y: 1 },
    vel: { x: 0, y: 0 },
    stunTimer: 0,
    migrant: !!t.migrant,
    migrantGroupId: undefined,
    migrantOx: 0,
    migrantOy: 0,
  };
  if (opts.migrantSpawn && t.migrant) {
    const c = opts.migrantSpawn.center;
    e.migrantGroupId = opts.migrantSpawn.gid;
    e.migrantOx = x0 - c.cx;
    e.migrantOy = y0 - c.cy;
  }

  e.elite = false;
  if (
    !t.boss &&
    !t.migrant &&
    !opts.noElite &&
    (opts.forceElite || Math.random() < ELITE_SPAWN_CHANCE)
  ) {
    e.elite = true;
    e.hp *= ELITE_HP_MULT;
    e.maxHp = e.hp;
    e.xp = Math.floor(e.xp * ELITE_XP_MULT);
    e.dmg *= ELITE_DMG_MULT;
    e.r *= ELITE_RADIUS_MULT;
  }

  state.enemies.push(e);
  return e;
}

const FLOCK_WRAP_MARGIN = 440;

function updateMigrantFlocks(dt) {
  const b = state.mapBounds;
  const wrapW = b.maxX - b.minX + 2 * FLOCK_WRAP_MARGIN;
  const wrapH = b.maxY - b.minY + 2 * FLOCK_WRAP_MARGIN;
  const huge = wrapW > 25000 || wrapH > 25000;

  for (const [gid, g] of state.migrantGroupMeta) {
    g.cx += g.vx * dt;
    g.cy += g.vy * dt;
    if (!huge) {
      const minX = b.minX - FLOCK_WRAP_MARGIN;
      const maxX = b.maxX + FLOCK_WRAP_MARGIN;
      const minY = b.minY - FLOCK_WRAP_MARGIN;
      const maxY = b.maxY + FLOCK_WRAP_MARGIN;
      while (g.cx < minX) g.cx += wrapW;
      while (g.cx > maxX) g.cx -= wrapW;
      while (g.cy < minY) g.cy += wrapH;
      while (g.cy > maxY) g.cy -= wrapH;
    }
    const members = state.enemies.filter((e) => e.migrant && e.migrantGroupId === gid);
    for (const e of members) {
      e.x = g.cx + e.migrantOx;
      e.y = g.cy + e.migrantOy;
    }
  }

  for (const gid of [...state.migrantGroupMeta.keys()]) {
    if (!state.enemies.some((e) => e.migrant && e.migrantGroupId === gid)) {
      state.migrantGroupMeta.delete(gid);
    }
  }
}

/**
 * VS-style crossing flock: constant velocity, torus wrap as a formation; does not chase.
 * Disabled on infinite tilemaps / absurd bounds.
 */
export function spawnMigratingFlock() {
  if (!state.player) return;
  if (state.tilemap && isInfiniteTiling(state.tilemap)) return;
  const b = state.mapBounds;
  if (b.maxX - b.minX > 25000 || b.maxY - b.minY > 25000) return;

  const angle = Math.random() * Math.PI * 2;
  const fdx = Math.cos(angle);
  const fdy = Math.sin(angle);
  const perpX = -fdy;
  const perpY = fdx;
  const speed = 72 + Math.random() * 38;
  const gid = state.migrantGroupIdCounter++;
  const midX = (b.minX + b.maxX) / 2;
  const midY = (b.minY + b.maxY) / 2;
  const cx =
    midX -
    fdx * ((b.maxX - b.minX) * 0.42) +
    (Math.random() - 0.5) * 160;
  const cy =
    midY -
    fdy * ((b.maxY - b.minY) * 0.42) +
    (Math.random() - 0.5) * 160;

  state.migrantGroupMeta.set(gid, { cx, cy, vx: fdx * speed, vy: fdy * speed });

  const count = 12 + Math.floor(Math.random() * 9);
  const center = { cx, cy };
  for (let i = 0; i < count; i++) {
    const spread = (Math.random() - 0.5) * 220;
    const ox = perpX * spread + (Math.random() - 0.5) * 50;
    const oy = perpY * spread + (Math.random() - 0.5) * 50;
    spawnEnemy('migrant', cx + ox, cy + oy, { migrantSpawn: { center, gid } });
  }
}

/**
 * Ambient grunts for `spawnWave` (migrant flocks + boss are separate).
 * Order = Vampire Survivors–style ramp: fodder first, heavier/ranged later.
 */
const AMBIENT_SPAWN_ORDER = ['swarm', 'crawler', 'dasher', 'spitter', 'tank'];

/** Extra enemy *types* join the spawn table at this interval (first two are always active). */
const ROSTER_UNLOCK_INTERVAL_SEC = 180;

function getAmbientSpawnTypesAtTime(gameTimeSec) {
  const ids = AMBIENT_SPAWN_ORDER.filter(
    (id) => ENEMY_TYPES[id] && !ENEMY_TYPES[id].migrant,
  );
  const n = ids.length;
  if (n <= 2) return ids;
  const extra = Math.floor(Math.max(0, gameTimeSec) / ROSTER_UNLOCK_INTERVAL_SEC);
  const maxTypes = Math.min(n, 2 + extra);
  return ids.slice(0, maxTypes);
}

function getSpawnEnemyTypes() {
  return getAmbientSpawnTypesAtTime(state.gameTime);
}

/** @param {number} [angleOffset] radians added to movement bias so batch spawns form a “wall” arc */
export function spawnWave(angleOffset = 0) {
  const types = getSpawnEnemyTypes();
  const p = state.player;
  const cx = p.x;
  const cy = p.y;
  const type = types[Math.floor(Math.random() * types.length)];
  const baseR = ENEMY_TYPES[type].r * 2.5;
  const t = state.gameTime;
  const tier = spawnDifficultyTier(t);
  const teff = tier * SPAWN_TIER_DURATION_SEC;
  const minD = (360 + Math.min(120, teff / 16)) * 2;
  const maxD = (700 + Math.min(200, teff / 10)) * 2;
  const bias = p.lastMoveAngle + angleOffset;
  const forwardWeight = Math.max(0.34, 0.74 - teff / 520);
  const pos = findSpawnRingDirectional(cx, cy, baseR, minD, maxD, {
    biasAngle: bias,
    forwardWeight,
    arc: Math.PI * 0.78,
  });
  spawnEnemy(type, pos.x, pos.y);
  if (tier >= 1 && Math.random() < 0.28) {
    const type2 = types[Math.floor(Math.random() * types.length)];
    const pos2 = findSpawnRingDirectional(cx, cy, ENEMY_TYPES[type2].r * 2.5, minD, maxD, {
      biasAngle: bias + (Math.random() - 0.5) * 0.32,
      forwardWeight,
      arc: Math.PI * 0.68,
    });
    spawnEnemy(type2, pos2.x, pos2.y);
  }
}

function applyEnemyMove(e, nx, ny) {
  const moved = resolveCircleMoveGreedy(e.x, e.y, nx, ny, e.r, state.obstacles);
  const fin = separateCircleFromObstacles(moved.x, moved.y, e.r, state.obstacles);
  const bd = clampXYToMapBounds(fin.x, fin.y, e.r);
  e.x = bd.x;
  e.y = bd.y;
}

/** Push enemy away from a hit source (projectiles, explosions, etc.). Bosses resist more. */
export function knockBackEnemyFrom(e, fromX, fromY, strength = 26) {
  if (e.migrant) return;
  if (e.type === 'boss') strength *= 0.38;
  const dx = e.x - fromX;
  const dy = e.y - fromY;
  const len = Math.hypot(dx, dy) || 1;
  applyEnemyMove(e, e.x + (dx / len) * strength, e.y + (dy / len) * strength);
}

export function updateEnemies(dt) {
  const player = state.player;
  updateMigrantFlocks(dt);
  cullDistantAndOverflowEnemies(player.x, player.y);
  state.enemies.forEach((e) => {
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    if (!e.migrant) {
    if (e.type === 'dasher') {
      e.dashCooldown -= dt;
      if (e.dashCooldown <= 0) {
        e.dashDir = { x: ux, y: uy };
        e.dashCooldown = e.dashTimer;
      }
      if (e.dashCooldown > 1) {
        applyEnemyMove(e, e.x + e.dashDir.x * e.speed * 1.5 * dt, e.y + e.dashDir.y * e.speed * 1.5 * dt);
      } else {
        applyEnemyMove(e, e.x + ux * e.speed * dt, e.y + uy * e.speed * dt);
      }
    } else if (e.type === 'spitter') {
      if (dist > 150) {
        applyEnemyMove(e, e.x + ux * e.speed * dt, e.y + uy * e.speed * dt);
      } else if (Math.random() < 0.02) {
        state.projectiles.push({
          x: e.x,
          y: e.y,
          vx: (-dx / dist) * 200,
          vy: (-dy / dist) * 200,
          r: 5,
          dmg: e.dmg,
          life: 2,
          color: '#44ff44',
          enemy: true,
          playerDamage: true,
        });
      }
    } else if (e.type === 'boss') {
      applyEnemyMove(e, e.x + ux * e.speed * dt, e.y + uy * e.speed * dt);
      if (Math.random() < 0.01) {
        const sr = ENEMY_TYPES.swarm.r * 2;
        const sp = findSpawnRing(e.x, e.y, sr, 8, 42);
        spawnEnemy('swarm', sp.x, sp.y);
      }
    } else {
      applyEnemyMove(e, e.x + ux * e.speed * dt, e.y + uy * e.speed * dt);
    }
    }
    if (dist < player.r + e.r && player.invTimer <= 0) {
      let dmg = e.dmg;
      if (player.passives.includes('Armor Plate')) {
        dmg *= 1 - player.passiveLevels['Armor Plate'] * 0.1;
      }
      player.hp -= dmg;
      player.invTimer = 0.5;
      state.screenShake = 0.2;
      spawnParticles(player.x, player.y, '#ff2244', 10, 100, 0.4, 3);
      if (player.passives.includes('Thorns')) {
        const reflect = player.passiveLevels['Thorns'] * 5;
        e.hp -= reflect;
        spawnParticles(e.x, e.y, '#ff6644', 5, 80, 0.3, 2);
      }
      if (player.hp <= 0) state.pendingGameOver = true;
    }
    if (e.hp <= 0) {
      spawnParticles(e.x, e.y, e.color, 15, 120, 0.6, 4);
      state.score += Math.floor(e.xp * 10);
      state.kills++;
      if (e.type === 'boss') {
        state.bossActive = false;
        dropBossLoot(e.x, e.y);
      } else {
        spawnXP(e.x, e.y, e.xp);
      }
      addKillFeed(e.type, e.xp);
      state.enemies = state.enemies.filter((x) => x !== e);
    }
  });

  separateEnemyCrowd();
}

/**
 * Push grunts apart without O(n²) all-pairs (critical at 300+ enemies).
 * Flock (`migrant`) units are omitted from buckets and never overlap-resolve — they pass through grunts.
 */
function separateEnemyCrowd() {
  const arr = state.enemies;
  const n = arr.length;
  if (n < 2) return;
  const CELL = 96;
  const buckets = new Map();
  for (let i = 0; i < n; i++) {
    const e = arr[i];
    if (e.migrant) continue;
    const ix = Math.floor(e.x / CELL);
    const iy = Math.floor(e.y / CELL);
    const k = ix + ',' + iy;
    let b = buckets.get(k);
    if (!b) {
      b = [];
      buckets.set(k, b);
    }
    b.push(i);
  }
  for (let i = 0; i < n; i++) {
    const e = arr[i];
    if (e.type === 'boss' || e.migrant) continue;
    const ix = Math.floor(e.x / CELL);
    const iy = Math.floor(e.y / CELL);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const b = buckets.get(ix + ox + ',' + (iy + oy));
        if (!b) continue;
        for (let t = 0; t < b.length; t++) {
          const j = b[t];
          if (j <= i) continue;
          const o = arr[j];
          if (o.type === 'boss') continue;
          const odx = e.x - o.x;
          const ody = e.y - o.y;
          const minDist = e.r + o.r + 2;
          const min2 = minDist * minDist;
          const distSq = odx * odx + ody * ody;
          if (distSq >= min2 || distSq < 1e-8) continue;
          const odist = Math.sqrt(distSq);
          const overlap = minDist - odist;
          const nx = odx / odist;
          const ny = ody / odist;
          e.x += nx * overlap * 0.5;
          e.y += ny * overlap * 0.5;
          o.x -= nx * overlap * 0.5;
          o.y -= ny * overlap * 0.5;
        }
      }
    }
  }
}

function addKillFeed(type, xpAwarded) {
  const kf = document.getElementById('killfeed');
  const div = document.createElement('div');
  div.className = 'kf-item';
  div.textContent = `+${xpAwarded} XP`;
  kf.appendChild(div);
  setTimeout(() => kf.removeChild(div), 2000);
}
