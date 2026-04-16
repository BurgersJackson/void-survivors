import { state } from './state.js';
import { WEAPONS } from './constants.js';
import { knockBackEnemyFrom } from './enemies.js';
import { spawnParticles, spawnTrail } from './particles.js';
import { explodeBomb } from './projectiles.js';
import {
  mightOnlyMultiplier,
  weaponDamageMultiplier,
  giantKillerMultiplier,
} from './weapon-damage.js';
import {
  circleHitsAny,
  nearestEnemyInRange,
  forEachEnemyNearPoint,
  forEachEnemyHitByProjectile,
  raycastObstacleRange,
} from './map-obstacles.js';

export function lightningChain(x1, y1, x2, y2, lvl) {
  let sx = x1;
  let sy = y1;
  const segs = 5 + lvl * 2;
  for (let i = 0; i < segs; i++) {
    const t = (i + 1) / segs;
    const tx = x1 + (x2 - x1) * t + (Math.random() - 0.5) * 30;
    const ty = y1 + (y2 - y1) * t + (Math.random() - 0.5) * 30;
    spawnParticles((sx + tx) / 2, (sy + ty) / 2, '#88ffff', 2, 30, 0.2, 2);
    sx = tx;
    sy = ty;
  }
}

export function evolveWeapon(w) {
  const evos = {
    'Magic Wand': 'Arcane Blast',
    'Spread Shot': 'Nova Burst',
    Orbiter: 'Planetary Ring',
    Lightning: 'Thunder Storm',
    'Homing Missiles': 'Swarm Strike',
    'Laser Beam': 'Death Ray',
    Bomb: 'Mortar Rain',
  };
  return evos[w] || w;
}

/** Evolved weapon → same defs/cooldowns as base. */
function attachEvolutionWeaponDefs(defs) {
  for (const w of WEAPONS) {
    const evo = evolveWeapon(w);
    if (evo !== w && defs[w]) defs[evo] = defs[w];
  }
}

const EVO_COOLDOWN_BASE = /** @type {Record<string, string>} */ ({});
for (const w of WEAPONS) {
  const evo = evolveWeapon(w);
  if (evo !== w) EVO_COOLDOWN_BASE[evo] = w;
}

export function weaponCooldownBaseName(w) {
  return EVO_COOLDOWN_BASE[w] || w;
}

export function laserWeaponLevel(player) {
  if (!player) return 1;
  return (
    player.weaponLevels['Death Ray'] ||
    player.weaponLevels['Laser Beam'] ||
    1
  );
}

export function orbiterWeaponLevel(player) {
  if (!player) return 1;
  return player.weaponLevels['Planetary Ring'] || player.weaponLevels['Orbiter'] || 1;
}

function buildWeaponDefs() {
  const p = () => state.player;
  const E = () => state.enemies;
  const Pr = () => state.projectiles;

  return {
    'Magic Wand': {
      color: '#ffcc00',
      fire: (lvl) => {
        const player = p();
        const m = mightOnlyMultiplier(player);
        const nearest = nearestEnemyInRange(player.x, player.y, 400, E());
        if (nearest) {
          const angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
          Pr().push({
            x: player.x,
            y: player.y,
            vx: Math.cos(angle) * 450,
            vy: Math.sin(angle) * 450,
            r: 4,
            dmg: (8 + lvl * 2) * m,
            life: 1.5,
            color: '#ffcc00',
            trail: true,
            enemy: true,
            playerDamage: false,
          });
        }
      },
    },
    'Spread Shot': {
      color: '#ffee00',
      fire: (lvl) => {
        const player = p();
        const m = mightOnlyMultiplier(player);
        let angle = Math.atan2(player.targetY || 0, player.targetX || 1);
        const nearest = nearestEnemyInRange(player.x, player.y, 600, E());
        if (nearest) {
          angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
        }
        const count = 3 + lvl;
        const spread = 0.3 + lvl * 0.15;
        for (let i = 0; i < count; i++) {
          const a = angle + (i - (count - 1) / 2) * spread;
          Pr().push({
            x: player.x,
            y: player.y,
            vx: Math.cos(a) * 400,
            vy: Math.sin(a) * 400,
            r: 5,
            dmg: (8 + lvl * 3) * m,
            life: 1.5,
            color: '#ffee00',
            trail: true,
            enemy: true,
            playerDamage: false,
          });
        }
      },
    },
    Orbiter: {
      color: '#00aaff',
      orbits: true,
      fire: () => {},
      update: (dt, r) => {
        const lvl = orbiterWeaponLevel(r);
        const count = 1 + lvl;
        const radius = 60 + lvl * 15;
        const speed = (2 + lvl) * rapidFireMultiplier(r);
        if (r.orbitAngle === undefined) r.orbitAngle = 0;
        r.orbitAngle += dt * speed;
        const orbitHitR = radius + 55;
        for (let i = 0; i < count; i++) {
          const a = r.orbitAngle + (i * Math.PI * 2) / count;
          const ox = r.x + Math.cos(a) * radius;
          const oy = r.y + Math.sin(a) * radius;
          spawnTrail(ox, oy, '#00aaff', 2);
          forEachEnemyNearPoint(ox, oy, orbitHitR, E(), (e) => {
            const dx = e.x - ox;
            const dy = e.y - oy;
            if (dx * dx + dy * dy < (e.r + 12) * (e.r + 12)) {
              const mult = weaponDamageMultiplier(r, e);
              e.hp -= (0.5 + lvl * 0.3) * dt * 60 * mult;
              if (Math.random() < 0.05) spawnParticles(e.x, e.y, e.color, 3, 50, 0.3, 2);
            }
          });
        }
      },
    },
    Lightning: {
      color: '#88ffff',
      fire: (lvl) => {
        const player = p();
        const chains = 1 + lvl;
        for (let i = 0; i < chains; i++) {
          const target = nearestEnemyInRange(player.x, player.y, 250, E());
          if (target) {
            lightningChain(player.x, player.y, target.x, target.y, lvl);
            const mult = weaponDamageMultiplier(player, target);
            target.hp -= (15 + lvl * 5) * mult;
            if (target.hp > 0) knockBackEnemyFrom(target, player.x, player.y, 32);
            if (target.hp <= 0) {
              state.enemies = state.enemies.filter((e) => e !== target);
            }
            spawnParticles(target.x, target.y, '#88ffff', 5, 80, 0.3, 3);
          }
        }
      },
    },
    'Homing Missiles': {
      color: '#ff4400',
      fire: (lvl) => {
        const player = p();
        const m = mightOnlyMultiplier(player);
        const count = 1 + lvl;
        for (let i = 0; i < count; i++) {
          Pr().push({
            x: player.x,
            y: player.y,
            vx: 0,
            vy: 0,
            r: 6,
            dmg: (12 + lvl * 4) * m,
            life: 3,
            color: '#ff4400',
            trail: true,
            homing: true,
            speed: 250,
            enemy: true,
            playerDamage: false,
            cooldown: i * 0.15,
            targetIdx: 0,
          });
        }
      },
    },
    'Laser Beam': {
      color: '#ff0088',
      fire: (lvl) => {
        const player = p();
        let angle = Math.atan2(player.targetY || 0, player.targetX || 1);
        const nearest = nearestEnemyInRange(player.x, player.y, 400, E());
        if (nearest) {
          angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
        }
        const range = 300 + lvl * 50;
        const width = 4 + lvl * 2;
        const lx = player.x + Math.cos(angle) * (range / 2);
        const ly = player.y + Math.sin(angle) * (range / 2);
        spawnParticles(lx, ly, '#ff0088', 3, 30, 0.2, 2);
        state.laserBeam = {
          x: player.x,
          y: player.y,
          angle,
          range,
          width,
          life: 0.3,
          color: '#ff0088',
        };
      },
    },
    Bomb: {
      color: '#884400',
      fire: (lvl) => {
        const player = p();
        const m = mightOnlyMultiplier(player);
        const count = 1 + lvl;
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          Pr().push({
            x: player.x,
            y: player.y,
            vx: Math.cos(angle) * 150,
            vy: Math.sin(angle) * 150,
            r: 8,
            dmg: (25 + lvl * 8) * m,
            life: 4,
            color: '#884400',
            bomb: true,
            fuse: 1.5 + lvl * 0.3,
            radius: 80 + lvl * 20,
            enemy: true,
            playerDamage: false,
            trail: true,
          });
        }
      },
    },
  };
}

const _built = buildWeaponDefs();
attachEvolutionWeaponDefs(_built);
export const WEAPON_DEFS = _built;

/** Attack speed from Rapid Fire / Overclock passives (1 = baseline 100% weapon speed). */
export function rapidFireMultiplier(player) {
  if (!player) return 1;
  let m = 1;
  if (player.passives.includes('Rapid Fire')) {
    m += (player.passiveLevels['Rapid Fire'] || 0) * 0.12;
  }
  if (player.passives.includes('Overclock')) {
    m += (player.passiveLevels['Overclock'] || 0) * 0.1;
  }
  return m;
}

export function getWeaponCooldown(w) {
  const cds = {
    'Magic Wand': 1.6,
    'Spread Shot': 2.4,
    Orbiter: 0,
    Lightning: 3.0,
    'Homing Missiles': 4.0,
    'Laser Beam': 1.0,
    Bomb: 5.0,
  };
  let cd = cds[weaponCooldownBaseName(w)] || 1;
  const player = state.player;
  if (player && player.passives.includes('Cooldown')) {
    cd *= 1 - player.passiveLevels['Cooldown'] * 0.1;
  }
  const rf = rapidFireMultiplier(player);
  if (rf > 1) cd /= rf;
  /** Baseline +25% attack speed (shorter cooldowns) for all weapons. */
  return cd * (1 / 1.25);
}

export function initWeaponTimer(w) {
  state.weaponTimers[w] = 0;
}

/** Fixed-timestep laser damage (was incorrectly tied to render frame rate). */
export function updateLaserBeamSim(dt) {
  const lb = state.laserBeam;
  if (!lb || lb.life <= 0) return;
  const player = state.player;
  const lvl = laserWeaponLevel(player);
  const dps = (10 + lvl * 5) * 3;
  const clip = raycastObstacleRange(
    lb.x,
    lb.y,
    lb.angle,
    lb.range,
    lb.width * 0.45,
    state.obstacles
  );
  forEachEnemyNearPoint(lb.x, lb.y, clip + 80, state.enemies, (e) => {
    const ex = e.x - lb.x;
    const ey = e.y - lb.y;
    const dot = ex * Math.cos(lb.angle) + ey * Math.sin(lb.angle);
    if (dot > 0 && dot < clip) {
      const perp = Math.abs(-ex * Math.sin(lb.angle) + ey * Math.cos(lb.angle));
      if (perp < lb.width + e.r) {
        const dmg = dps * dt * weaponDamageMultiplier(player, e);
        e.hp -= dmg;
        if (Math.random() < 0.1) spawnParticles(e.x, e.y, '#ff0088', 1, 30, 0.2, 2);
      }
    }
  });
  lb.life -= dt;
}

export function updateWeapons(dt) {
  updateLaserBeamSim(dt);
  Object.keys(state.weaponTimers).forEach((w) => {
    state.weaponTimers[w] -= dt;
    if (state.weaponTimers[w] <= 0) {
      const def = WEAPON_DEFS[w];
      if (def) {
        const cd = getWeaponCooldown(w);
        state.weaponTimers[w] = cd;
        const lvl = state.player.weaponLevels[w] || 1;
        def.fire(lvl, state.player);
      }
    }
    const od = WEAPON_DEFS[w];
    if (od?.orbits && od.update) {
      od.update(dt, state.player);
    }
  });

  state.projectiles.forEach((p) => {
    if (p.homing) {
      const nearest = nearestEnemyInRange(p.x, p.y, 300, state.enemies);
      if (nearest) {
        const angle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
        p.vx = Math.cos(angle) * p.speed;
        p.vy = Math.sin(angle) * p.speed;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (circleHitsAny(p.x, p.y, p.r, state.obstacles)) {
        p.life = 0;
      } else {
        let hit = false;
        forEachEnemyHitByProjectile(p.x, p.y, p.r, state.enemies, (e) => {
          e.hp -= p.dmg * giantKillerMultiplier(state.player, e);
          spawnParticles(p.x, p.y, '#ff4400', 5, 60, 0.3, 2);
          if (e.hp > 0) knockBackEnemyFrom(e, p.x, p.y);
          hit = true;
        });
        if (hit) p.life = 0;
      }
    }
  });

  state.projectiles.forEach((p) => {
    if (p.bomb && p.fuse !== undefined) {
      p.fuse -= dt;
      if (p.fuse <= 0) explodeBomb(p);
    }
  });
}
