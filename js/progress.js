import { state } from './state.js';

export const PROGRESS_KEY = 'voidSurvivorsMapProgress';

/** Highest map index the player may select (1 = first map only at new save). */
export function loadProgressIntoState() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) {
      state.unlockedMapMax = 1;
      return;
    }
    const o = JSON.parse(raw);
    let m = Number(o.unlockedMapMax);
    if (!Number.isFinite(m) || m < 1) m = 1;
    state.unlockedMapMax = Math.floor(m);
  } catch {
    state.unlockedMapMax = 1;
  }
}

/**
 * Call when the player survives WIN_TIME_SEC on map `clearedMapIndex`.
 * Unlocks the next map index (clearedMapIndex + 1).
 */
export function recordMapSurvivalWin(clearedMapIndex) {
  const next = clearedMapIndex + 1;
  if (next <= state.unlockedMapMax) return;
  state.unlockedMapMax = next;
  try {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ unlockedMapMax: state.unlockedMapMax })
    );
  } catch {
    /* quota / private mode */
  }
}
