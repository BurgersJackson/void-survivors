import { state, resetPlayerTemplate } from './state.js';
import { WIN_TIME_SEC } from './constants.js';
import { getMapLabel } from './map-loader.js';
import { recordMapSurvivalWin } from './progress.js';
import {
  applyPlayfieldForRun,
  ensureEntityClearOfObstacles,
  clampXYToMapBounds,
  syncTilemapStreaming,
} from './map-obstacles.js';
import { spawnMapPlacementsFromCatalog, updateTimedMapPlacements } from './world-pickups.js';
import { updatePlayer } from './player.js';
import { updateEnemies } from './enemies.js';
import { updateWeapons } from './weapons.js';
import { updateProjectiles } from './projectiles.js';
import { updateParticles } from './particles.js';
import { updateSpawning } from './spawning.js';
import { checkLevelUp } from './leveling.js';
import { updateUI } from './ui.js';
import { initWeaponTimer } from './weapons.js';
import { renderFrame } from './render.js';
import { pollGamepadMenus, readInput } from './input.js';

/** Fixed simulation step (60 Hz). Draw runs every rAF (display refresh); do not throttle draws. */
const FIXED_DT = 1 / 60;
const MAX_SIM_STEPS_PER_FRAME = 5;

let _rafPrevMs = 0;
let _simAcc = 0;
let _fpsPrevRafMs = 0;
let _fpsSmooth = 60;

function updateCamera(dt) {
  state.cam.x += (state.player.x - state.cam.x) * 0.1;
  state.cam.y += (state.player.y - state.cam.y) * 0.1;
}

export function showTitleScreen() {
  state.gameState = 'start';
  document.getElementById('start-screen').style.display = 'flex';
  document.getElementById('gameover-screen').style.display = 'none';
  const win = document.getElementById('win-screen');
  if (win) win.style.display = 'none';
  document.getElementById('pause-menu').style.display = 'none';
}

function stepPlaying(dt) {
  state.gameTime += dt;
  if (state.gameTime >= WIN_TIME_SEC) {
    gameWin();
    return;
  }
  if (state.tilemap) syncTilemapStreaming();
  updateTimedMapPlacements();
  updatePlayer(dt);
  updateEnemies(dt);
  updateWeapons(dt);
  updateProjectiles(dt);
  updateParticles(dt);
  updateCamera(dt);
  updateSpawning(dt);
  checkLevelUp();
  updateUI();
  if (state.screenShake > 0) state.screenShake -= dt;
  if (state.pendingGameOver) {
    state.pendingGameOver = false;
    gameOver();
  }
}

export function gameLoop(time) {
  pollGamepadMenus();

  if (_rafPrevMs === 0) _rafPrevMs = time;
  const deltaSec = Math.min((time - _rafPrevMs) / 1000, 0.25);
  _rafPrevMs = time;

  if (state.gameState === 'playing') {
    _simAcc += deltaSec;
    let steps = 0;
    while (
      state.gameState === 'playing' &&
      _simAcc >= FIXED_DT &&
      steps < MAX_SIM_STEPS_PER_FRAME
    ) {
      _simAcc -= FIXED_DT;
      steps++;
      stepPlaying(FIXED_DT);
    }
  } else {
    _simAcc = 0;
  }

  if (state.gameState === 'paused') {
    state.inputMoveMag = readInput().moveMag;
  } else if (state.gameState !== 'playing') {
    state.inputMoveMag = 0;
  }

  if (_fpsPrevRafMs > 0) {
    const frameMs = time - _fpsPrevRafMs;
    if (frameMs > 0.5 && frameMs < 500) {
      const inst = 1000 / frameMs;
      _fpsSmooth = _fpsSmooth * 0.9 + inst * 0.1;
    }
  }
  _fpsPrevRafMs = time;
  const fpsEl = document.getElementById('fps-counter');
  if (fpsEl) fpsEl.textContent = `${Math.round(_fpsSmooth)} FPS`;
  const moveEl = document.getElementById('move-meter');
  if (moveEl) moveEl.textContent = `MV ${state.inputMoveMag.toFixed(2)}`;
  renderFrame();

  requestAnimationFrame(gameLoop);
}

/**
 * @param {number} [mapIndex] 1-based; defaults to selected map.
 */
export function startGame(mapIndex) {
  const idx =
    mapIndex != null && Number.isFinite(mapIndex)
      ? Math.max(1, Math.floor(mapIndex))
      : state.selectedMapIndex || 1;
  state.selectedMapIndex = idx;
  state.playingMapIndex = idx;

  state.player = resetPlayerTemplate();
  Object.assign(state.player, {
    weapons: ['Magic Wand'],
    weaponLevels: { 'Magic Wand': 1 },
  });
  state.enemies = [];
  state.migrantGroupMeta.clear();
  state.migrantGroupIdCounter = 0;
  state.migrantWaveTimer = 36 + Math.random() * 28;
  state.migrantWavesEnabled = true;
  state.projectiles = [];
  state.particles = [];
  state.xpOrbs = [];
  state.weaponTimers = {};
  state.laserBeam = null;
  initWeaponTimer('Magic Wand');
  state.gameTime = 0;
  state.score = 0;
  state.kills = 0;
  state.bossActive = false;
  state.bossTimer = 0;
  state.cam = { x: 0, y: 0 };
  state.screenShake = 0;
  state.pendingGameOver = false;
  state.levelUpChoices = [];
  _simAcc = 0;

  applyPlayfieldForRun();
  spawnMapPlacementsFromCatalog();
  state.currentMapTitle = getMapLabel(idx);
  document.getElementById('stageText').textContent = state.currentMapTitle;

  const safe = ensureEntityClearOfObstacles(state.player.x, state.player.y, state.player.r);
  const b0 = clampXYToMapBounds(safe.x, safe.y, state.player.r);
  state.player.x = b0.x;
  state.player.y = b0.y;
  updateUI();
  state.gameState = 'playing';
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('gameover-screen').style.display = 'none';
  const win = document.getElementById('win-screen');
  if (win) win.style.display = 'none';
}

export function gameOver() {
  state.gameState = 'gameover';
  document.getElementById('gameover-screen').style.display = 'flex';
  document.getElementById('go-stats').innerHTML = `Score: ${state.score}<br>Time: ${Math.floor(state.gameTime / 60)}:${String(Math.floor(state.gameTime % 60)).padStart(2, '0')}<br>Kills: ${state.kills}<br>Level: ${state.player.level}`;
}

export function gameWin() {
  if (state.gameState !== 'playing') return;
  const levelupModal = document.getElementById('levelup-modal');
  if (levelupModal) levelupModal.style.display = 'none';
  state.gameState = 'victory';
  recordMapSurvivalWin(state.playingMapIndex);
  const win = document.getElementById('win-screen');
  const msg = document.getElementById('win-msg');
  if (msg) {
    msg.textContent = `Map ${state.playingMapIndex} cleared. Map ${state.playingMapIndex + 1} unlocked.`;
  }
  if (win) win.style.display = 'flex';
}

export function pauseGame() {
  if (state.gameState === 'victory' || state.gameState === 'gameover') return;
  if (state.gameState === 'playing') {
    state.gameState = 'paused';
    document.getElementById('pause-menu').style.display = 'flex';
  } else if (state.gameState === 'paused') {
    state.gameState = 'playing';
    document.getElementById('pause-menu').style.display = 'none';
  }
}
