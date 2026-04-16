/** Keyboard, gamepad, and touch (virtual joystick + turbo) for mobile. */

import { state } from './state.js';
import { pickLevelUpChoice } from './leveling.js';

const keys = {};
const gamepadButtons = {};

/** @type {ReturnType<typeof getFirstGamepad>} */
let _menuGpPrev = null;
const _menuPrev = /** @type {Record<string, boolean>} */ ({});
let _pauseMenuFocus = 0;
let _levelUpFocus = 0;
let _lastMenuGameState = '';
/** Prefer pad from gamepadconnected (Chrome needs consistent polling of the same slot). */
let _preferredGamepadIndex = 0;

const MENU_STICK = 0.52;

/** @type {{ startGame: () => void; pauseGame: () => void; restartGame: () => void; victoryContinue: () => void }} */
let _menuActions = {
  startGame() {},
  pauseGame() {},
  restartGame() {},
  victoryContinue() {},
};

export function registerGamepadMenuActions(actions) {
  _menuActions = { ..._menuActions, ...actions };
}

export function getFirstGamepad() {
  navigator.getGamepads();
  const gps = navigator.getGamepads();
  const n = Math.max(gps.length, 4);
  const prefer = _preferredGamepadIndex;
  if (prefer >= 0 && prefer < n && gps[prefer]) return gps[prefer];
  for (let i = 0; i < n; i++) {
    if (gps[i]) return gps[i];
  }
  return null;
}

const touchJoy = {
  active: false,
  dx: 0,
  dy: 0,
  turbo: false,
};

export function initInput() {
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
  window.addEventListener('gamepadconnected', (e) => {
    _preferredGamepadIndex = e.gamepad.index;
    navigator.getGamepads();
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    if (e.gamepad.index === _preferredGamepadIndex) {
      _preferredGamepadIndex = 0;
    }
    navigator.getGamepads();
  });
  queueMicrotask(() => {
    navigator.getGamepads();
    const gps = navigator.getGamepads();
    for (let i = 0; i < Math.max(gps.length, 4); i++) {
      if (gps[i]) {
        _preferredGamepadIndex = i;
        break;
      }
    }
  });
}

export function initVirtualJoystick(baseEl, knobEl) {
  if (!baseEl || !knobEl) return;
  const maxR = () => Math.min(56, baseEl.offsetWidth * 0.35);
  let pointerId = null;

  function placeKnob(clientX, clientY) {
    const rect = baseEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const vx = clientX - cx;
    const vy = clientY - cy;
    const m = maxR();
    const len = Math.hypot(vx, vy) || 1;
    const scale = len > m ? m / len : 1;
    const nx = vx * scale;
    const ny = vy * scale;
    knobEl.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    touchJoy.dx = m > 0 ? nx / m : 0;
    touchJoy.dy = m > 0 ? ny / m : 0;
  }

  function resetKnob() {
    knobEl.style.transform = 'translate(-50%, -50%)';
    touchJoy.dx = 0;
    touchJoy.dy = 0;
    touchJoy.active = false;
    pointerId = null;
  }

  baseEl.addEventListener(
    'pointerdown',
    (e) => {
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      touchJoy.active = true;
      baseEl.setPointerCapture(e.pointerId);
      placeKnob(e.clientX, e.clientY);
    },
    { passive: true }
  );

  baseEl.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerId !== pointerId) return;
      placeKnob(e.clientX, e.clientY);
    },
    { passive: true }
  );

  function endPointer(e) {
    if (e.pointerId !== pointerId) return;
    try {
      baseEl.releasePointerCapture(e.pointerId);
    } catch (_) {}
    resetKnob();
  }
  baseEl.addEventListener('pointerup', endPointer);
  baseEl.addEventListener('pointercancel', endPointer);
}

export function initTurboButton(btn) {
  if (!btn) return;
  const setTurbo = (v) => {
    touchJoy.turbo = v;
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    setTurbo(true);
  });
  btn.addEventListener('pointerup', () => setTurbo(false));
  btn.addEventListener('pointercancel', () => setTurbo(false));
  btn.addEventListener('pointerleave', () => setTurbo(false));
}

function pollGamepad() {
  const gp = getFirstGamepad();
  if (gp) {
    gamepadButtons['4'] = gp.buttons[4]?.pressed;
    gamepadButtons['5'] = gp.buttons[5]?.pressed;
    gamepadButtons['0'] = gp.buttons[0]?.pressed;
    gamepadButtons['9'] = gp.buttons[9]?.pressed;
  } else {
    gamepadButtons['4'] = false;
    gamepadButtons['5'] = false;
    gamepadButtons['0'] = false;
    gamepadButtons['9'] = false;
  }
}

function menuEdge(key, pressed) {
  const e = pressed && !_menuPrev[key];
  _menuPrev[key] = pressed;
  return e;
}

function cycleMapSelect(delta) {
  const wrap = document.getElementById('map-select');
  if (!wrap) return;
  const btns = [...wrap.querySelectorAll('.map-slot-btn:not([disabled])')];
  if (btns.length === 0) return;
  let i = btns.findIndex((b) => b.classList.contains('active-map'));
  if (i < 0) i = 0;
  i = (i + delta + btns.length) % btns.length;
  btns.forEach((b) => b.classList.remove('active-map'));
  btns[i].classList.add('active-map');
  state.selectedMapIndex = Number(btns[i].dataset.mapIndex) || 1;
}

function updateLevelUpFocusHighlight() {
  const cards = document.querySelectorAll('#levelup-cards .card');
  cards.forEach((el, i) => {
    el.classList.toggle('card-focus', i === _levelUpFocus);
  });
}

function updatePauseFocusHighlight() {
  const resume = document.getElementById('resumeBtn');
  const restart = document.getElementById('restartBtn');
  if (resume) resume.classList.toggle('btn-focus', _pauseMenuFocus === 0);
  if (restart) restart.classList.toggle('btn-focus', _pauseMenuFocus === 1);
}

/**
 * Call once per frame from the main loop. Handles menus when not using mouse.
 */
export function pollGamepadMenus() {
  const gp = getFirstGamepad();
  const gs = state.gameState;

  if (_lastMenuGameState !== gs) {
    if (gs === 'levelup') {
      _levelUpFocus = 0;
      requestAnimationFrame(() => updateLevelUpFocusHighlight());
    }
    if (gs === 'paused') {
      _pauseMenuFocus = 0;
      requestAnimationFrame(() => updatePauseFocusHighlight());
    }
    _lastMenuGameState = gs;
  }

  if (!gp) {
    _menuGpPrev = null;
    return;
  }

  const ax6 = gp.axes[6] ?? 0;
  const ax7 = gp.axes[7] ?? 0;
  const lx = gp.axes[0] ?? 0;
  const ly = gp.axes[1] ?? 0;
  const prevAx6 = _menuGpPrev?.axes[6] ?? 0;
  const prevAx7 = _menuGpPrev?.axes[7] ?? 0;
  const prevLx = _menuGpPrev?.axes[0] ?? 0;
  const prevLy = _menuGpPrev?.axes[1] ?? 0;
  _menuGpPrev = gp;

  const a = gp.buttons[0]?.pressed ?? false;
  const b = gp.buttons[1]?.pressed ?? false;
  const start = gp.buttons[9]?.pressed ?? false;
  const select = gp.buttons[8]?.pressed ?? false;
  const lb = gp.buttons[4]?.pressed ?? false;
  const rb = gp.buttons[5]?.pressed ?? false;
  const du = gp.buttons[12]?.pressed ?? false;
  const dd = gp.buttons[13]?.pressed ?? false;
  const dl = gp.buttons[14]?.pressed ?? false;
  const dr = gp.buttons[15]?.pressed ?? false;

  const aEdge = menuEdge('a', a);
  const bEdge = menuEdge('b', b);
  const startEdge = menuEdge('start', start);
  const selectEdge = menuEdge('select', select);
  const lbEdge = menuEdge('lb', lb);
  const rbEdge = menuEdge('rb', rb);
  const duEdge = menuEdge('du', du);
  const ddEdge = menuEdge('dd', dd);
  const dlEdge = menuEdge('dl', dl);
  const drEdge = menuEdge('dr', dr);

  const ax6Left = ax6 < -0.45 && prevAx6 >= -0.45;
  const ax6Right = ax6 > 0.45 && prevAx6 <= 0.45;
  const ax7Up = ax7 < -0.45 && prevAx7 >= -0.45;
  const ax7Down = ax7 > 0.45 && prevAx7 <= 0.45;
  const stickLeft = lx < -MENU_STICK && prevLx >= -MENU_STICK;
  const stickRight = lx > MENU_STICK && prevLx <= MENU_STICK;
  const stickUp = ly < -MENU_STICK && prevLy >= -MENU_STICK;
  const stickDown = ly > MENU_STICK && prevLy <= MENU_STICK;

  const leftNav = dlEdge || lbEdge || ax6Left || stickLeft;
  const rightNav = drEdge || rbEdge || ax6Right || stickRight;
  const upNav = duEdge || ax7Up || stickUp;
  const downNav = ddEdge || ax7Down || stickDown;

  if (gs === 'start') {
    const n = document.querySelectorAll('#map-select .map-slot-btn:not([disabled])').length;
    if (leftNav && n > 0) {
      cycleMapSelect(-1);
    }
    if (rightNav && n > 0) {
      cycleMapSelect(1);
    }
    if (aEdge || startEdge) {
      _menuActions.startGame();
    }
    return;
  }

  if (gs === 'levelup') {
    const n = state.levelUpChoices.length || document.querySelectorAll('#levelup-cards .card').length;
    if (n <= 0) return;
    if (leftNav) {
      _levelUpFocus = (_levelUpFocus - 1 + n) % n;
      updateLevelUpFocusHighlight();
    }
    if (rightNav) {
      _levelUpFocus = (_levelUpFocus + 1) % n;
      updateLevelUpFocusHighlight();
    }
    if (aEdge || startEdge) {
      pickLevelUpChoice(_levelUpFocus);
    }
    return;
  }

  if (gs === 'paused') {
    if (upNav || leftNav) {
      _pauseMenuFocus = 0;
      updatePauseFocusHighlight();
    }
    if (downNav || rightNav) {
      _pauseMenuFocus = 1;
      updatePauseFocusHighlight();
    }
    if (aEdge || startEdge) {
      if (_pauseMenuFocus === 0) document.getElementById('resumeBtn')?.click();
      else document.getElementById('restartBtn')?.click();
    }
    if (bEdge || selectEdge) {
      _menuActions.pauseGame();
    }
    return;
  }

  if (gs === 'gameover') {
    if (aEdge || startEdge) {
      _menuActions.restartGame();
    }
    return;
  }

  if (gs === 'victory') {
    if (aEdge || startEdge) {
      _menuActions.victoryContinue();
    }
    return;
  }

  if (gs === 'playing') {
    if (startEdge || selectEdge) {
      _menuActions.pauseGame();
    }
  }
}

/** Gamepad: dead inner zone; outer zone maps to 0..1. */
const GP_DEADZONE = 0.1;
/** Below this normalized deflection, scale up so soft rims still hit full speed. */
const GP_REACH_FULL_AT = 0.78;
/** If either axis is past this, treat as fully deflected (covers different stick gates / controllers). */
const GP_SATURATION = 0.92;

export function readInput() {
  pollGamepad();

  let dx = 0;
  let dy = 0;

  if (touchJoy.active) {
    dx = touchJoy.dx;
    dy = touchJoy.dy;
    const turbo =
      keys['KeyE'] ||
      gamepadButtons['4'] ||
      touchJoy.turbo;
    const moveMag = Math.min(1, Math.hypot(dx, dy));
    return { dx, dy, turbo, moveMag };
  }

  if (keys['KeyW'] || keys['ArrowUp']) dy = -1;
  if (keys['KeyS'] || keys['ArrowDown']) dy = 1;
  if (keys['KeyA'] || keys['ArrowLeft']) dx = -1;
  if (keys['KeyD'] || keys['ArrowRight']) dx = 1;

  let gamepadAnalog = false;
  const gp = getFirstGamepad();
  if (gp) {
    const ax0 = gp.axes[0] ?? 0;
    const ay0 = gp.axes[1] ?? 0;
    /** Max axis deflection (L∞) so square-gate sticks reach full speed on diagonals and cardinals. */
    const inf = Math.max(Math.abs(ax0), Math.abs(ay0));
    const len = Math.hypot(ax0, ay0);
    if (inf > GP_DEADZONE && len > 1e-8) {
      const ux = ax0 / len;
      const uy = ay0 / len;
      let t = (inf - GP_DEADZONE) / (1 - GP_DEADZONE);
      if (inf >= GP_SATURATION) t = 1;
      else t = Math.min(1, t / GP_REACH_FULL_AT);
      dx = ux * t;
      dy = uy * t;
      gamepadAnalog = true;
    }
  }

  /** WASD diagonals are (±1,±1) with length √2; normalize. Do not apply to analog sticks or touch. */
  if (!gamepadAnalog && dx !== 0 && dy !== 0) {
    const inv = 0.7071067811865476;
    dx *= inv;
    dy *= inv;
  }

  const turbo =
    keys['KeyE'] ||
    gamepadButtons['4'] ||
    touchJoy.turbo;

  const moveMag = Math.min(1, Math.hypot(dx, dy));
  return { dx, dy, turbo, moveMag };
}

export function getKeys() {
  return keys;
}
