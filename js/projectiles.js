import { state } from './state.js';
import { knockBackEnemyFrom } from './enemies.js';
import { giantKillerMultiplier } from './weapon-damage.js';
import { spawnParticles, spawnTrail } from './particles.js';
import {
  circleHitsAny,
  forEachEnemyNearPoint,
  forEachEnemyHitByProjectile,
} from './map-obstacles.js';

export function explodeBomb(p) {
  const player = state.player;
  forEachEnemyNearPoint(p.x, p.y, p.radius, state.enemies, (e) => {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < p.radius) {
      const fall = 1 - d / p.radius;
      e.hp -= p.dmg * fall * giantKillerMultiplier(player, e);
      spawnParticles(e.x, e.y, '#ff6600', 5, 60, 0.3, 2);
      if (e.hp > 0) {
        const falloff = 1 - d / p.radius;
        knockBackEnemyFrom(e, p.x, p.y, 14 + 34 * falloff);
      }
    }
  });
  spawnParticles(p.x, p.y, '#ff6600', 30, 200, 0.8, 5);
  state.screenShake = 0.3;
  state.projectiles = state.projectiles.filter((x) => x !== p);
}

export function updateProjectiles(dt) {
  state.projectiles.forEach((p) => {
    if (p.enemy && !p.playerDamage && !p.homing) {
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      if (p.bomb && circleHitsAny(nx, ny, p.r, state.obstacles)) {
        explodeBomb(p);
        return;
      }
      if (circleHitsAny(nx, ny, p.r, state.obstacles)) {
        p.life = 0;
      } else {
        p.x = nx;
        p.y = ny;
      }
    }
    p.life -= dt;
    if (p.trail && p.life > 0) spawnTrail(p.x, p.y, p.color, 2);
  });

  state.projectiles = state.projectiles.filter((p) => p.life > 0);

  const playerHits = state.projectiles.filter((p) => p.playerDamage);
  playerHits.forEach((p) => {
    const d = Math.hypot(state.player.x - p.x, state.player.y - p.y);
    if (d < state.player.r + p.r) {
      state.player.hp -= p.dmg;
      state.player.invTimer = 0.5;
      spawnParticles(state.player.x, state.player.y, '#44ff44', 5, 60, 0.3, 2);
      p.life = 0;
    }
  });

  const enemyProjs = state.projectiles.filter(
    (p) => p.enemy && !p.playerDamage && !p.homing && !p.bomb
  );
  enemyProjs.forEach((p) => {
    let hit = false;
    forEachEnemyHitByProjectile(p.x, p.y, p.r, state.enemies, (e) => {
      e.hp -= p.dmg * giantKillerMultiplier(state.player, e);
      spawnParticles(p.x, p.y, '#ffee00', 5, 60, 0.3, 2);
      if (e.hp > 0) knockBackEnemyFrom(e, p.x, p.y);
      hit = true;
    });
    if (hit) p.life = 0;
  });
}
