/**
 * Procedural world obstacles (walls / ruins / buildings), inspired by
 * Vampire Survivors–style stages: corridors, clusters, and landmark blocks.
 */
import { state } from './state.js';
import { DEFAULT_MAP_BOUNDS } from './map-loader.js';
import {
  buildSolidObstaclesNear,
  expandTiledExtrasInRange,
  isInfiniteTiling,
  tilemapWorldBounds,
} from './tilemap.js';
import {
  circleOverlapsObstacle,
  separateCircleFromObstacle,
} from './obstacle-geometry.js';

export { circleOverlapsRect } from './obstacle-geometry.js';

/** `visualSet` on map JSON (0–5) or rotate by map slot index. */
function resolveEnemyVisualSetForRun(entry, mapIndex) {
  if (entry && typeof entry.visualSet === 'number' && Number.isFinite(entry.visualSet)) {
    state.enemyVisualSet = Math.max(0, Math.min(5, Math.floor(entry.visualSet)));
  } else {
    state.enemyVisualSet = ((mapIndex - 1) % 6 + 6) % 6;
  }
}

function resolveMigrantWavesForRun(entry) {
  state.migrantWavesEnabled = entry?.migrantWaves !== false;
}

export function getMapBounds() {
  if (state.tilemap && isInfiniteTiling(state.tilemap)) {
    return { minX: -1e7, minY: -1e7, maxX: 1e7, maxY: 1e7 };
  }
  const m = state.mapBounds;
  if (m && Number.isFinite(m.minX)) return m;
  return DEFAULT_MAP_BOUNDS;
}

/** Keep a circle of radius r inside playable bounds. */
export function clampXYToMapBounds(x, y, r = 0) {
  if (state.tilemap && isInfiniteTiling(state.tilemap)) {
    return { x, y };
  }
  const b = getMapBounds();
  return {
    x: Math.min(b.maxX - r, Math.max(b.minX + r, x)),
    y: Math.min(b.maxY - r, Math.max(b.minY + r, y)),
  };
}

/** Rebuild streamed solid tiles + merge manual obstacles (call each frame while playing). */
export function syncTilemapStreaming() {
  if (!state.tilemap || !state.player) return;
  const tm = state.tilemap;
  const px = state.player.x;
  const py = state.player.y;
  const rad = tm.streamRadiusPx;
  const tilePart = buildSolidObstaclesNear(tm, px, py, rad);
  const props = expandTiledExtrasInRange(
    tm,
    state.tilemapExtraObstacles,
    px,
    py,
    rad
  );
  state.obstacles = [...tilePart, ...props];
}

const SPAWN_CLEAR_R = 220;
const WORLD = 3600;

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distPointToRect(px, py, o) {
  const qx = Math.max(o.x, Math.min(px, o.x + o.w));
  const qy = Math.max(o.y, Math.min(py, o.y + o.h));
  return Math.hypot(px - qx, py - qy);
}

function rectTooCloseToSpawn(o) {
  return distPointToRect(0, 0, o) < SPAWN_CLEAR_R;
}

function pushRectFromSpawn(x, y, w, h) {
  const o = { x, y, w, h };
  if (!rectTooCloseToSpawn(o)) return o;
  const a = Math.atan2(y + h / 2, x + w / 2);
  const push = SPAWN_CLEAR_R + Math.max(w, h) * 0.6;
  return { x: Math.cos(a) * push - w / 2, y: Math.sin(a) * push - h / 2, w, h };
}

const OBSTACLE_CELL = 112;

let _obsSpatialRef = null;
let _obsBuckets = /** @type {Map<string, number[]> | null} */ (null);
let _obsQueryStamp = 1;
/** Dedupe obstacle indices within one spatial query (same id in multiple cells). */
let _obsSeen = new Uint32Array(2048);

function ensureObsSeen(n) {
  if (_obsSeen.length < n) {
    const next = Math.max(n, _obsSeen.length * 2);
    _obsSeen = new Uint32Array(next);
  }
}

function buildObstacleBuckets(obstacles) {
  const buckets = new Map();
  const c = OBSTACLE_CELL;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    const x0 = Math.floor(o.x / c);
    const x1 = Math.floor((o.x + o.w) / c);
    const y0 = Math.floor(o.y / c);
    const y1 = Math.floor((o.y + o.h) / c);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const k = ix + ',' + iy;
        let arr = buckets.get(k);
        if (!arr) {
          arr = [];
          buckets.set(k, arr);
        }
        arr.push(i);
      }
    }
  }
  return buckets;
}

/** Call when `obstacles` may have changed; cheap if same array reference as last build. */
export function prepareObstacleSpatialIndex(obstacles) {
  if (_obsSpatialRef === obstacles && _obsBuckets) return;
  _obsSpatialRef = obstacles;
  if (!obstacles || obstacles.length === 0) {
    _obsBuckets = new Map();
    return;
  }
  _obsBuckets = buildObstacleBuckets(obstacles);
}

export function circleHitsAny(cx, cy, r, obstacles) {
  if (!obstacles || obstacles.length === 0) return false;
  prepareObstacleSpatialIndex(obstacles);
  ensureObsSeen(obstacles.length);
  _obsQueryStamp++;
  if (_obsQueryStamp > 0xffc00000) {
    _obsSeen.fill(0);
    _obsQueryStamp = 1;
  }
  const stamp = _obsQueryStamp;
  const c = OBSTACLE_CELL;
  const x0 = Math.floor((cx - r) / c);
  const x1 = Math.floor((cx + r) / c);
  const y0 = Math.floor((cy - r) / c);
  const y1 = Math.floor((cy + r) / c);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iy = y0; iy <= y1; iy++) {
      const b = _obsBuckets.get(ix + ',' + iy);
      if (!b) continue;
      for (let t = 0; t < b.length; t++) {
        const i = b[t];
        if (_obsSeen[i] === stamp) continue;
        _obsSeen[i] = stamp;
        if (circleOverlapsObstacle(cx, cy, r, obstacles[i])) return true;
      }
    }
  }
  return false;
}

/** Slide along obstacles (Vampire Survivors–like wall sliding). */
export function resolveCircleMove(px, py, nx, ny, r, obstacles) {
  if (!circleHitsAny(nx, ny, r, obstacles)) return { x: nx, y: ny };
  if (!circleHitsAny(nx, py, r, obstacles)) return { x: nx, y: py };
  if (!circleHitsAny(px, ny, r, obstacles)) return { x: px, y: ny };
  return { x: px, y: py };
}

/**
 * Like resolveCircleMove but favors sliding along props: walks the intended segment
 * to the last free point, then tries perpendicular nudges so chasers don’t dead-end on corners.
 */
export function resolveCircleMoveGreedy(px, py, nx, ny, r, obstacles) {
  if (!circleHitsAny(nx, ny, r, obstacles)) return { x: nx, y: ny };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i++) {
    const m = (lo + hi) * 0.5;
    const tx = px + (nx - px) * m;
    const ty = py + (ny - py) * m;
    if (circleHitsAny(tx, ty, r, obstacles)) hi = m;
    else lo = m;
  }
  const bx = px + (nx - px) * lo;
  const by = py + (ny - py) * lo;
  if (lo > 1e-6) return { x: bx, y: by };

  const mdx = nx - px;
  const mdy = ny - py;
  const ml = Math.hypot(mdx, mdy);
  if (ml < 1e-8) return { x: px, y: py };
  const ux = mdx / ml;
  const uy = mdy / ml;
  const pxn = -uy;
  const pyn = ux;
  const scales = [1.25, 2.5, 0.5, -1.25, -2.5, -0.5];
  for (let i = 0; i < scales.length; i++) {
    const s = scales[i] * r;
    const sx = px + pxn * s;
    const sy = py + pyn * s;
    if (!circleHitsAny(sx, sy, r, obstacles)) return { x: sx, y: sy };
  }
  return resolveCircleMove(px, py, nx, ny, r, obstacles);
}

/** Push circle out of overlapping solids (used after resolution). */
export function separateCircleFromObstacles(x, y, r, obstacles) {
  if (!obstacles || obstacles.length === 0) return { x, y };
  prepareObstacleSpatialIndex(obstacles);
  ensureObsSeen(obstacles.length);
  let ox = x;
  let oy = y;
  const c = OBSTACLE_CELL;
  for (let pass = 0; pass < 4; pass++) {
    _obsQueryStamp++;
    if (_obsQueryStamp > 0xffc00000) {
      _obsSeen.fill(0);
      _obsQueryStamp = 1;
    }
    const stamp = _obsQueryStamp;
    const x0 = Math.floor((ox - r) / c);
    const x1 = Math.floor((ox + r) / c);
    const y0 = Math.floor((oy - r) / c);
    const y1 = Math.floor((oy + r) / c);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const bucket = _obsBuckets.get(ix + ',' + iy);
        if (!bucket) continue;
        for (let t = 0; t < bucket.length; t++) {
          const i = bucket[t];
          if (_obsSeen[i] === stamp) continue;
          _obsSeen[i] = stamp;
          const b = obstacles[i];
          if (!circleOverlapsObstacle(ox, oy, r, b)) continue;
          const p = separateCircleFromObstacle(ox, oy, r, b);
          ox = p.x;
          oy = p.y;
        }
      }
    }
  }
  return { x: ox, y: oy };
}

/** Ray march for laser / line-of-sight through solids. */
export function raycastObstacleRange(x, y, angle, maxRange, probeR, obstacles) {
  const step = 12;
  for (let d = step; d <= maxRange; d += step) {
    const px = x + Math.cos(angle) * d;
    const py = y + Math.sin(angle) * d;
    if (circleHitsAny(px, py, probeR, obstacles)) {
      return Math.max(0, d - step);
    }
  }
  return maxRange;
}

/* --- Enemy spatial queries (avoid O(n) scans per shot / projectile) --- */
const ENEMY_CELL = 96;
let _enBuckets = /** @type {Map<string, number[]> | null} */ (null);

/** Rebuilt every call — enemies move every frame while the array ref often stays the same. */
export function prepareEnemyNearIndex(enemies) {
  const buckets = new Map();
  if (!enemies || enemies.length === 0) {
    _enBuckets = buckets;
    return;
  }
  const c = ENEMY_CELL;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const ix = Math.floor(e.x / c);
    const iy = Math.floor(e.y / c);
    const k = ix + ',' + iy;
    let arr = buckets.get(k);
    if (!arr) {
      arr = [];
      buckets.set(k, arr);
    }
    arr.push(i);
  }
  _enBuckets = buckets;
}

/** Closest enemy within `maxDist` of (px,py), or null. */
export function nearestEnemyInRange(px, py, maxDist, enemies) {
  if (!enemies || enemies.length === 0) return null;
  prepareEnemyNearIndex(enemies);
  const max2 = maxDist * maxDist;
  const c = ENEMY_CELL;
  const x0 = Math.floor((px - maxDist) / c);
  const x1 = Math.floor((px + maxDist) / c);
  const y0 = Math.floor((py - maxDist) / c);
  const y1 = Math.floor((py + maxDist) / c);
  let best = null;
  let best2 = max2;
  for (let ix = x0; ix <= x1; ix++) {
    for (let iy = y0; iy <= y1; iy++) {
      const b = _enBuckets.get(ix + ',' + iy);
      if (!b) continue;
      for (let t = 0; t < b.length; t++) {
        const e = enemies[b[t]];
        const dx = e.x - px;
        const dy = e.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < best2) {
          best2 = d2;
          best = e;
        }
      }
    }
  }
  return best;
}

/** Call fn(e) for enemies within `range` (world units) of the point. */
export function forEachEnemyNearPoint(px, py, range, enemies, fn) {
  if (!enemies || enemies.length === 0) return;
  prepareEnemyNearIndex(enemies);
  const max2 = range * range;
  const c = ENEMY_CELL;
  const x0 = Math.floor((px - range) / c);
  const x1 = Math.floor((px + range) / c);
  const y0 = Math.floor((py - range) / c);
  const y1 = Math.floor((py + range) / c);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iy = y0; iy <= y1; iy++) {
      const b = _enBuckets.get(ix + ',' + iy);
      if (!b) continue;
      for (let t = 0; t < b.length; t++) {
        const e = enemies[b[t]];
        const dx = e.x - px;
        const dy = e.y - py;
        if (dx * dx + dy * dy <= max2) fn(e);
      }
    }
  }
}

/** Projectile at (px,py) radius pr hits enemies (distance test). */
export function forEachEnemyHitByProjectile(px, py, pr, enemies, fn) {
  if (!enemies || enemies.length === 0) return;
  prepareEnemyNearIndex(enemies);
  const reach = pr + 48;
  const c = ENEMY_CELL;
  const x0 = Math.floor((px - reach) / c);
  const x1 = Math.floor((px + reach) / c);
  const y0 = Math.floor((py - reach) / c);
  const y1 = Math.floor((py + reach) / c);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iy = y0; iy <= y1; iy++) {
      const b = _enBuckets.get(ix + ',' + iy);
      if (!b) continue;
      for (let t = 0; t < b.length; t++) {
        const e = enemies[b[t]];
        const dx = e.x - px;
        const dy = e.y - py;
        const rr = pr + e.r;
        if (dx * dx + dy * dy < rr * rr) fn(e);
      }
    }
  }
}

function addBuilding(list, rand, x, y, w, h, kind) {
  const r = pushRectFromSpawn(x, y, w, h);
  if (r.x + r.w < -WORLD || r.x > WORLD || r.y + r.h < -WORLD || r.y > WORLD) return;
  list.push({ ...r, kind });
}

/** Stage 0 — The Void: broken walls, obelisks, hollow plazas */
function buildVoidMap(rand) {
  const o = [];
  let i;
  for (i = 0; i < 28; i++) {
    const w = 80 + rand() * 160;
    const h = 70 + rand() * 100;
    const x = (rand() - 0.5) * 2 * WORLD * 0.85;
    const y = (rand() - 0.5) * 2 * WORLD * 0.85;
    addBuilding(o, rand, x, y, w, h, 'building');
  }
  for (i = 0; i < 22; i++) {
    const len = 180 + rand() * 420;
    const thick = 14 + rand() * 10;
    const horiz = rand() > 0.5;
    const x = (rand() - 0.5) * 2 * WORLD * 0.9;
    const y = (rand() - 0.5) * 2 * WORLD * 0.9;
    if (horiz) addBuilding(o, rand, x - len / 2, y - thick / 2, len, thick, 'wall');
    else addBuilding(o, rand, x - thick / 2, y - len / 2, thick, len, 'wall');
  }
  for (i = 0; i < 40; i++) {
    const pw = 16 + rand() * 20;
    const ph = 50 + rand() * 120;
    const x = (rand() - 0.5) * 2 * WORLD * 0.92;
    const y = (rand() - 0.5) * 2 * WORLD * 0.92;
    addBuilding(o, rand, x, y, pw, ph, 'pillar');
  }
  for (i = 0; i < 12; i++) {
    const cx = (rand() - 0.5) * 2400;
    const cy = (rand() - 0.5) * 2400;
    const gap = 55 + rand() * 35;
    for (let k = 0; k < 5; k++) {
      addBuilding(o, rand, cx + k * gap, cy - 100, 22, 200, 'wall');
    }
  }
  return o;
}

/** Stage 1 — Crystal Caves: shards, bridges, tight runs */
function buildCrystalMap(rand) {
  const o = [];
  let i;
  for (i = 0; i < 35; i++) {
    const w = 30 + rand() * 50;
    const h = 90 + rand() * 200;
    const x = (rand() - 0.5) * 2 * WORLD * 0.88;
    const y = (rand() - 0.5) * 2 * WORLD * 0.88;
    addBuilding(o, rand, x, y, w, h, 'shard');
  }
  for (i = 0; i < 18; i++) {
    const len = 240 + rand() * 500;
    const thick = 18 + rand() * 14;
    const x = (rand() - 0.5) * 2 * WORLD * 0.85;
    const y = (rand() - 0.5) * 2 * WORLD * 0.85;
    addBuilding(o, rand, x - len / 2, y - thick / 2, len, thick, 'bridge');
  }
  for (i = 0; i < 20; i++) {
    const s = 60 + rand() * 90;
    const x = (rand() - 0.5) * 2 * WORLD * 0.8;
    const y = (rand() - 0.5) * 2 * WORLD * 0.8;
    addBuilding(o, rand, x, y, s, s * 0.85, 'building');
  }
  return o;
}

/** Stage 2 — Neon Wastes: sparse megastructures, barrier lines */
function buildNeonMap(rand) {
  const o = [];
  let i;
  for (i = 0; i < 14; i++) {
    const w = 140 + rand() * 200;
    const h = 100 + rand() * 160;
    const x = (rand() - 0.5) * 2 * WORLD * 0.75;
    const y = (rand() - 0.5) * 2 * WORLD * 0.75;
    addBuilding(o, rand, x, y, w, h, 'megablock');
  }
  for (i = 0; i < 16; i++) {
    const len = 320 + rand() * 600;
    const thick = 12 + rand() * 8;
    const x = (rand() - 0.5) * 2 * WORLD * 0.9;
    const y = (rand() - 0.5) * 2 * WORLD * 0.9;
    if (rand() > 0.5) addBuilding(o, rand, x - len / 2, y - thick / 2, len, thick, 'barrier');
    else addBuilding(o, rand, x - thick / 2, y - len / 2, thick, len, 'barrier');
  }
  for (i = 0; i < 45; i++) {
    const pw = 20 + rand() * 30;
    const ph = 40 + rand() * 100;
    const x = (rand() - 0.5) * 2 * WORLD * 0.95;
    const y = (rand() - 0.5) * 2 * WORLD * 0.95;
    addBuilding(o, rand, x, y, pw, ph, 'pillar');
  }
  return o;
}

export function rebuildObstaclesForStage(stageIndex) {
  const seed = 0x9e3779b9 + stageIndex * 2654435761;
  const rand = mulberry32(seed);
  let obs;
  if (stageIndex === 0) obs = buildVoidMap(rand);
  else if (stageIndex === 1) obs = buildCrystalMap(rand);
  else obs = buildNeonMap(rand);
  state.obstacles = obs;
}

/**
 * Apply obstacles + bounds for the current run (`state.playingMapIndex`).
 * Custom layout if `maps/mapN.json` exists in the catalog; otherwise procedural biome cycles by map index.
 */
export function applyPlayfieldForRun() {
  const idx = state.playingMapIndex;
  const biome = ((idx - 1) % 3 + 3) % 3;
  state.stage = biome;

  state.tilemap = null;
  state.tilemapExtraObstacles = [];

  const entry = state.levelCatalog.find((e) => e.index === idx);
  if (entry) {
    state.useCustomMap = true;
    if (entry.tilemap) {
      state.tilemap = entry.tilemap;
      state.tilemapExtraObstacles = (entry.obstacles || []).map((o) => ({ ...o }));
      syncTilemapStreaming();
      state.mapBounds = isInfiniteTiling(entry.tilemap)
        ? { minX: -1e7, minY: -1e7, maxX: 1e7, maxY: 1e7 }
        : tilemapWorldBounds(entry.tilemap);
      resolveEnemyVisualSetForRun(entry, idx);
      resolveMigrantWavesForRun(entry);
      return;
    }
    state.obstacles = entry.obstacles.map((o) => ({ ...o }));
    state.mapBounds = { ...entry.bounds };
    resolveEnemyVisualSetForRun(entry, idx);
    resolveMigrantWavesForRun(entry);
    return;
  }
  state.useCustomMap = false;
  rebuildObstaclesForStage(biome);
  state.mapBounds = { ...DEFAULT_MAP_BOUNDS };
  resolveEnemyVisualSetForRun(null, idx);
  resolveMigrantWavesForRun(null);
}

export function ensureEntityClearOfObstacles(x, y, r) {
  if (!circleHitsAny(x, y, r, state.obstacles)) return { x, y };
  return separateCircleFromObstacles(x, y, r, state.obstacles);
}

/** Pick a spawn point in ring around player; avoids solids and map bounds. */
export function findSpawnRing(px, py, r, minD, maxD, maxAttempts = 48) {
  return findSpawnRingDirectional(px, py, r, minD, maxD, {
    forwardWeight: 0,
    maxAttempts,
  });
}

/**
 * Ring spawn with optional wedge bias toward `biasAngle` (e.g. player move direction).
 * `forwardWeight` 0 = uniform like classic VS off-screen horde from all sides; higher = more spawns in the wedge ahead of travel.
 */
export function findSpawnRingDirectional(
  px,
  py,
  r,
  minD,
  maxD,
  opts = {}
) {
  const {
    biasAngle = 0,
    forwardWeight = 0.55,
    arc = Math.PI * 0.72,
    maxAttempts = 72,
  } = opts;
  const obs = state.obstacles;
  const useWedge = forwardWeight > 0.001;
  for (let a = 0; a < maxAttempts; a++) {
    let ang;
    if (useWedge && Math.random() < forwardWeight) {
      ang = biasAngle + (Math.random() - 0.5) * arc;
    } else {
      ang = Math.random() * Math.PI * 2;
    }
    const dist = minD + Math.random() * (maxD - minD);
    let x = px + Math.cos(ang) * dist;
    let y = py + Math.sin(ang) * dist;
    const c = clampXYToMapBounds(x, y, r);
    x = c.x;
    y = c.y;
    if (!circleHitsAny(x, y, r, obs)) return { x, y };
  }
  const fallbackAng = useWedge ? biasAngle : 0;
  const fb = clampXYToMapBounds(
    px + Math.cos(fallbackAng) * minD,
    py + Math.sin(fallbackAng) * minD,
    r
  );
  return fb;
}
