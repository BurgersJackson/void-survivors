import { state, resetPlayerTemplate } from './state.js';
import { initRender } from './render.js';
import {
  initInput,
  initVirtualJoystick,
  initTurboButton,
  registerGamepadMenuActions,
} from './input.js';
import {
  gameLoop,
  startGame,
  pauseGame,
  showTitleScreen,
} from './game.js';
import { initMapsAndProgress, getMapLabel, mapFileUrl } from './map-loader.js';
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './constants.js';

const canvas = document.getElementById('c');
const minimapCanvas = document.getElementById('minimap');

state.player = resetPlayerTemplate();

function refreshMapSelectUI() {
  const wrap = document.getElementById('map-select');
  if (!wrap) return;
  wrap.innerHTML = '';
  const catalogMax =
    state.levelCatalog.length > 0
      ? Math.max(...state.levelCatalog.map((e) => e.index))
      : 0;
  const maxSlots = Math.max(1, state.unlockedMapMax, catalogMax);
  for (let i = 1; i <= maxSlots; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn map-slot-btn';
    btn.dataset.mapIndex = String(i);
    const locked = i > state.unlockedMapMax;
    btn.textContent = locked ? `${i}. ${getMapLabel(i)} — locked` : `${i}. ${getMapLabel(i)}`;
    if (locked) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => {
        state.selectedMapIndex = i;
        wrap.querySelectorAll('.map-slot-btn').forEach((b) => b.classList.remove('active-map'));
        btn.classList.add('active-map');
      });
    }
    wrap.appendChild(btn);
  }
  const firstPlayable = wrap.querySelector('.map-slot-btn:not([disabled])');
  if (firstPlayable) {
    firstPlayable.classList.add('active-map');
    state.selectedMapIndex = Number(firstPlayable.dataset.mapIndex) || 1;
  }
}

registerGamepadMenuActions({
  startGame: () => startGame(state.selectedMapIndex),
  pauseGame,
  restartGame: () => startGame(state.playingMapIndex),
  victoryContinue: () => {
    showTitleScreen();
    refreshMapSelectUI();
  },
});

initMapsAndProgress().then(() => {
  refreshMapSelectUI();
  const mapHint = document.getElementById('mapModeHint');
  if (mapHint && state.levelCatalog.length > 0) {
    mapHint.style.display = 'block';
    const urls = state.levelCatalog.map((e) => mapFileUrl(e.index)).join(', ');
    mapHint.textContent = `Loaded ${state.levelCatalog.length} map file(s): ${urls}`;
  }
});

if (window.matchMedia('(pointer: coarse)').matches) {
  const ht = document.querySelector('.help-touch');
  const hd = document.querySelector('.help-desktop');
  if (ht) ht.hidden = false;
  if (hd) hd.hidden = true;
}

function resize() {
  state.W = VIEWPORT_WIDTH;
  state.H = VIEWPORT_HEIGHT;
  canvas.width = VIEWPORT_WIDTH;
  canvas.height = VIEWPORT_HEIGHT;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  /** Uniform scale so 1280×720 stays 16:9; letterbox with body background on non–16:9 windows. */
  const scale = Math.min(vw / VIEWPORT_WIDTH, vh / VIEWPORT_HEIGHT);
  canvas.style.width = `${VIEWPORT_WIDTH * scale}px`;
  canvas.style.height = `${VIEWPORT_HEIGHT * scale}px`;
}

resize();
window.addEventListener('resize', resize);

initRender(canvas, minimapCanvas);
initInput();
initVirtualJoystick(document.getElementById('joystick-base'), document.getElementById('joystick-knob'));
initTurboButton(document.getElementById('turbo-btn'));

document.getElementById('startBtn').onclick = () => startGame(state.selectedMapIndex);
document.getElementById('resumeBtn').onclick = pauseGame;
document.getElementById('restartBtn').onclick = () => startGame(state.playingMapIndex);
document.getElementById('restartBtn2').onclick = () => startGame(state.playingMapIndex);

const winContinue = document.getElementById('winContinueBtn');
if (winContinue) {
  winContinue.onclick = () => {
    showTitleScreen();
    refreshMapSelectUI();
  };
}

window.addEventListener('keydown', (e) => {
  if (
    e.code === 'Space' &&
    (state.gameState === 'playing' || state.gameState === 'paused')
  ) {
    e.preventDefault();
    pauseGame();
  }
  if (e.code === 'Escape' && (state.gameState === 'playing' || state.gameState === 'paused')) {
    e.preventDefault();
    pauseGame();
  }
  if (e.code === 'KeyR' && state.gameState === 'gameover') startGame(state.playingMapIndex);
  if (e.code === 'Digit1' && state.player.weapons[0]) state.player.selectedWeapon = 0;
  if (e.code === 'Digit2' && state.player.weapons[1]) state.player.selectedWeapon = 1;
  if (e.code === 'Digit3' && state.player.weapons[2]) state.player.selectedWeapon = 2;
  if (e.code === 'Digit4' && state.player.weapons[3]) state.player.selectedWeapon = 3;
  if (e.code === 'Digit5' && state.player.weapons[4]) state.player.selectedWeapon = 4;
  if (e.code === 'Digit6' && state.player.weapons[5]) state.player.selectedWeapon = 5;
});

document.addEventListener(
  'touchmove',
  (e) => {
    if (state.gameState === 'playing' || state.gameState === 'paused') {
      if (e.target === canvas || e.target.closest?.('.touch-controls')) {
        e.preventDefault();
      }
    }
  },
  { passive: false }
);

requestAnimationFrame(gameLoop);
