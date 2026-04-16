import { state } from './state.js';
import { ENEMY_TYPES, spawnDifficultyTier } from './constants.js';
import { spawnEnemy, spawnWave, spawnMigratingFlock } from './enemies.js';
import { findSpawnRing } from './map-obstacles.js';

/** Seconds between spawn events; one step per 5 min tier (index 0..8). */
const SPAWN_INTERVAL_BY_TIER = [1.45, 1.28, 1.1, 0.95, 0.82, 0.7, 0.6, 0.52, 0.44];

/** `spawnWave` calls per event; steps up with tier (5 min jumps only). */
const WAVES_PER_EVENT_BY_TIER = [2, 2, 3, 3, 4, 4, 5, 5, 6];

export function updateSpawning(dt) {
  const gt = state.gameTime;
  if (state.migrantWavesEnabled) {
    state.migrantWaveTimer -= dt;
    if (state.migrantWaveTimer <= 0) {
      spawnMigratingFlock();
      state.migrantWaveTimer = 40 + Math.random() * 38;
    }
  }
  const tier = spawnDifficultyTier(gt);
  const rate = SPAWN_INTERVAL_BY_TIER[tier];
  state.enemySpawnTimer -= dt;
  if (state.enemySpawnTimer <= 0) {
    const count = WAVES_PER_EVENT_BY_TIER[tier];
    const batchArc = (Math.random() - 0.5) * 0.48;
    for (let i = 0; i < count; i++) {
      spawnWave(batchArc + (Math.random() - 0.5) * 0.24);
    }
    state.enemySpawnTimer = rate;
  }
  if (
    !state.bossActive &&
    state.gameTime > 180 &&
    Math.floor(state.gameTime / 180) > state.bossTimer
  ) {
    state.bossTimer++;
    state.bossActive = true;
    document.getElementById('boss-alert').style.display = 'block';
    setTimeout(() => {
      document.getElementById('boss-alert').style.display = 'none';
    }, 3000);
    const bossR = ENEMY_TYPES.boss.r * (1 + state.gameTime / 300) * 1.2;
    const bp = findSpawnRing(state.player.x, state.player.y, bossR, 720, 1120);
    spawnEnemy('boss', bp.x, bp.y);
  }
}
