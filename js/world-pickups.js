/**
 * Map-authored pickups + boss loot. VS-style: optional edge arrows toward important drops.
 */
import { state } from './state.js';
import { spawnXP, spawnChest } from './leveling.js';
import { clampXYToMapBounds } from './map-obstacles.js';

const LONG_LIFE = 999999;

/** Matches editor / `parseTilemapSpec` default when no tilemap. */
function mapTileSizePx() {
  const tm = state.tilemap;
  if (tm && Number.isFinite(tm.tileSize)) return tm.tileSize;
  return 64;
}

/**
 * Authored point is a hint; actual spawn is 5–10 map tiles away (random direction; integer tile count),
 * then clamped inside map bounds.
 */
function jitterAuthoredWorldPoint(wx, wy, entityR) {
  const ts = mapTileSizePx();
  const distTiles = 5 + Math.floor(Math.random() * 6);
  const dist = distTiles * ts;
  const a = Math.random() * Math.PI * 2;
  let x = wx + Math.cos(a) * dist;
  let y = wy + Math.sin(a) * dist;
  const bd = clampXYToMapBounds(x, y, entityR);
  return { x: bd.x, y: bd.y };
}

/**
 * @param {{ kind: string, x: number, y: number, amount?: number }} raw
 */
function spawnOneMapPlacement(raw) {
  const kind = String(raw.kind || 'chest');
  const ax = Number(raw.x);
  const ay = Number(raw.y);
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) return;
  if (kind === 'chest') {
    const { x, y } = jitterAuthoredWorldPoint(ax, ay, 20);
    spawnChest(x, y, { hintArrow: true, mapPlaced: true, life: LONG_LIFE });
  } else if (kind === 'gem' || kind === 'large_xp') {
    const amt = raw.amount != null ? Number(raw.amount) : 60;
    const { x, y } = jitterAuthoredWorldPoint(ax, ay, 8);
    spawnXP(x, y, Number.isFinite(amt) ? amt : 60, {
      hintArrow: true,
      mapPlaced: true,
      r: 6,
      life: LONG_LIFE,
    });
  }
}

/** Spawn pickups from `maps/mapN.json` → `placements` (editor: World items). Immediate only; timed → `state.pendingTimedMapPlacements`. */
export function spawnMapPlacementsFromCatalog() {
  state.pendingTimedMapPlacements = [];
  const entry = state.levelCatalog.find((e) => e.index === state.playingMapIndex);
  if (!entry || !Array.isArray(entry.placements) || entry.placements.length === 0) return;
  for (const raw of entry.placements) {
    const t = raw.spawnAtSec != null ? Number(raw.spawnAtSec) : 0;
    if (Number.isFinite(t) && t > 0) {
      state.pendingTimedMapPlacements.push({
        kind: String(raw.kind || 'chest'),
        x: Number(raw.x) || 0,
        y: Number(raw.y) || 0,
        amount: raw.amount != null ? Number(raw.amount) : undefined,
        spawnAtSec: t,
      });
    } else {
      spawnOneMapPlacement(raw);
    }
  }
}

/** Call each frame while playing; spawns treasures when `gameTime` crosses `spawnAtSec`. */
export function updateTimedMapPlacements() {
  const pending = state.pendingTimedMapPlacements;
  if (!pending.length) return;
  const gt = state.gameTime;
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i];
    if (gt >= p.spawnAtSec) {
      spawnOneMapPlacement(p);
      pending.splice(i, 1);
    }
  }
}

/** Boss death: chest + XP cluster with off-screen hints (Vampire Survivors–style treasure chase). */
export function dropBossLoot(wx, wy) {
  spawnXP(wx, wy, 100, {
    hintArrow: true,
    bossDrop: true,
    life: LONG_LIFE,
    r: 8,
  });
  spawnChest(wx + 42, wy, {
    hintArrow: true,
    bossDrop: true,
    life: LONG_LIFE,
  });
  spawnXP(wx - 38, wy + 12, 65, {
    hintArrow: true,
    bossDrop: true,
    life: LONG_LIFE,
    r: 5,
  });
}
