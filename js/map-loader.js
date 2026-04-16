import { state } from './state.js';
import { STAGES } from './constants.js';
import { loadProgressIntoState } from './progress.js';
import { parseTilemapSpec, tilemapPixelSize } from './tilemap.js';

export const MAP_STORAGE_KEY = 'voidSurvivorsCustomMap';

export const DEFAULT_MAP_BOUNDS = {
  minX: -3600,
  minY: -3600,
  maxX: 3600,
  maxY: 3600,
};

/**
 * @typedef {{ x:number, y:number, w:number, h:number, kind:string, shape?: string }} MapObstacle
 * @typedef {{ minX:number, minY:number, maxX:number, maxY:number }} MapBounds
 */

/**
 * @param {unknown} data parsed map JSON root
 * @returns {Array<{ kind: string, x: number, y: number, amount?: number }>}
 */
/**
 * Optional 0–5 index into `ENEMY_VISUAL_SETS` (`enemy-appearance.js`).
 * @param {unknown} data
 * @returns {number | undefined}
 */
/** @returns {false | undefined} — `false` disables flock waves; default is on. */
export function parseMigrantWavesFromMapData(data) {
  if (!data || typeof data !== 'object') return undefined;
  if (data.migrantWaves === false) return false;
  return undefined;
}

export function parseVisualSetFromMapData(data) {
  if (!data || typeof data !== 'object' || data.visualSet == null) return undefined;
  const n = Number(data.visualSet);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(5, Math.floor(n)));
}

export function parsePlacementsFromMapData(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.placements)) return [];
  return data.placements.map((p) => {
    const o = /** @type {Record<string, unknown>} */ (p && typeof p === 'object' ? p : {});
    const t = o.spawnAtSec != null ? Number(o.spawnAtSec) : 0;
    return {
      kind: String(o.kind || 'chest'),
      x: Number(o.x) || 0,
      y: Number(o.y) || 0,
      amount: o.amount != null ? Number(o.amount) : undefined,
      spawnAtSec: Number.isFinite(t) && t > 0 ? t : undefined,
    };
  });
}

function normalizeObstacle(o) {
  const raw = o.shape;
  const shape =
    raw === 'circle' || raw === 'hex' || raw === 'tri' || raw === 'star'
      ? raw
      : 'rect';
  return {
    x: Number(o.x),
    y: Number(o.y),
    w: Math.max(4, Math.abs(Number(o.w))),
    h: Math.max(4, Math.abs(Number(o.h))),
    kind: String(o.kind || 'building'),
    shape,
  };
}

/**
 * Play area centered on world origin (0,0) — matches player spawn.
 * @param {number} w
 * @param {number} h
 * @returns {MapBounds}
 */
export function boundsFromMapSize(w, h) {
  let ww = Number(w);
  let hh = Number(h);
  if (!Number.isFinite(ww) || ww < 200) ww = 7200;
  if (!Number.isFinite(hh) || hh < 200) hh = 7200;
  ww = Math.min(200000, ww);
  hh = Math.min(200000, hh);
  const hw = ww / 2;
  const hh2 = hh / 2;
  return {
    minX: -hw,
    maxX: hw,
    minY: -hh2,
    maxY: hh2,
  };
}

/**
 * @param {unknown} b
 * @returns {MapBounds}
 */
export function normalizeMapBounds(b) {
  if (!b || typeof b !== 'object') {
    return { ...DEFAULT_MAP_BOUNDS };
  }
  const o = /** @type {Record<string, unknown>} */ (b);
  let minX = Number(o.minX);
  let minY = Number(o.minY);
  let maxX = Number(o.maxX);
  let maxY = Number(o.maxY);
  if (!Number.isFinite(minX)) minX = DEFAULT_MAP_BOUNDS.minX;
  if (!Number.isFinite(minY)) minY = DEFAULT_MAP_BOUNDS.minY;
  if (!Number.isFinite(maxX)) maxX = DEFAULT_MAP_BOUNDS.maxX;
  if (!Number.isFinite(maxY)) maxY = DEFAULT_MAP_BOUNDS.maxY;
  if (minX > maxX) {
    const t = minX;
    minX = maxX;
    maxX = t;
  }
  if (minY > maxY) {
    const t = minY;
    minY = maxY;
    maxY = t;
  }
  if (maxX - minX < 200 || maxY - minY < 200) {
    return { ...DEFAULT_MAP_BOUNDS };
  }
  return { minX, minY, maxX, maxY };
}

/**
 * @param {string} jsonText
 * @returns {{ name: string, stages: MapObstacle[][], bounds: MapBounds }}
 */
export function parseMapJSON(jsonText) {
  const data = JSON.parse(jsonText);
  if (data.version !== 1) {
    throw new Error('Map version must be 1');
  }
  let bounds;
  if (data.mapSize && typeof data.mapSize === 'object') {
    const ms = /** @type {Record<string, unknown>} */ (data.mapSize);
    const w = Number(ms.w);
    const h = Number(ms.h);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      bounds = boundsFromMapSize(w, h);
    } else {
      bounds = normalizeMapBounds(data.bounds);
    }
  } else {
    bounds = normalizeMapBounds(data.bounds);
  }
  if (data.stages && Array.isArray(data.stages)) {
    const stages = data.stages.map((arr) =>
      Array.isArray(arr) ? arr.map((o) => normalizeObstacle(o)) : []
    );
    return {
      name: String(data.name || 'Custom map'),
      stages,
      bounds,
    };
  }
  if (data.obstacles && Array.isArray(data.obstacles)) {
    const obs = data.obstacles.map((o) => normalizeObstacle(o));
    return {
      name: String(data.name || 'Custom map'),
      stages: [obs],
      bounds,
    };
  }
  throw new Error('JSON needs "stages" or "obstacles"');
}

/**
 * One engine file per map: version 1 — optional `tiles` tilemap, or obstacles / stages[0].
 * @param {string} jsonText
 * @returns {{ name: string, obstacles: MapObstacle[], bounds: MapBounds, tilemap: import('./tilemap.js').TilemapSpec | null, placements: Array<{ kind: string, x: number, y: number, amount?: number }>, visualSet?: number }}
 */
export function parseSingleStageMapFile(jsonText) {
  const data = JSON.parse(jsonText);
  if (data.version !== 1) {
    throw new Error('Map version must be 1');
  }
  const tm = parseTilemapSpec(data);

  let bounds;
  if (data.mapSize && typeof data.mapSize === 'object') {
    const ms = /** @type {Record<string, unknown>} */ (data.mapSize);
    const w = Number(ms.w);
    const h = Number(ms.h);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      bounds = boundsFromMapSize(w, h);
    } else if (tm) {
      const wh = tilemapPixelSize(tm);
      bounds = boundsFromMapSize(wh.w, wh.h);
    } else {
      bounds = normalizeMapBounds(data.bounds);
    }
  } else if (tm) {
    const wh = tilemapPixelSize(tm);
    bounds = boundsFromMapSize(wh.w, wh.h);
  } else {
    bounds = normalizeMapBounds(data.bounds);
  }

  if (tm) {
    const extra =
      data.obstacles && Array.isArray(data.obstacles)
        ? data.obstacles.map((o) => normalizeObstacle(o))
        : [];
    return {
      name: String(data.name || ''),
      obstacles: extra,
      bounds,
      tilemap: tm,
      placements: parsePlacementsFromMapData(data),
      visualSet: parseVisualSetFromMapData(data),
      migrantWaves: parseMigrantWavesFromMapData(data),
    };
  }

  let obs = [];
  if (data.obstacles && Array.isArray(data.obstacles)) {
    obs = data.obstacles.map((o) => normalizeObstacle(o));
  } else if (
    data.stages &&
    Array.isArray(data.stages) &&
    data.stages.length > 0 &&
    Array.isArray(data.stages[0])
  ) {
    obs = data.stages[0].map((o) => normalizeObstacle(o));
  } else {
    throw new Error('JSON needs "tiles", "obstacles", or "stages[0]"');
  }
  return {
    name: String(data.name || ''),
    obstacles: obs,
    bounds,
    tilemap: null,
    placements: parsePlacementsFromMapData(data),
    visualSet: parseVisualSetFromMapData(data),
    migrantWaves: parseMigrantWavesFromMapData(data),
  };
}

/** @param {number} mapIndex 1-based */
export function mapFileUrl(mapIndex) {
  return `maps/map${mapIndex}.json`;
}

/**
 * Display title for a map slot (file name field, else procedural biome label).
 * @param {number} mapIndex
 */
export function getMapLabel(mapIndex) {
  const e = state.levelCatalog.find((x) => x.index === mapIndex);
  if (e && e.name) return e.name;
  return `Map ${mapIndex} (${STAGES[(mapIndex - 1) % 3]})`;
}

/**
 * Probe maps/map1.json, map2.json, … until the first missing file.
 * @returns {Promise<Array<{ index: number, name: string, obstacles: MapObstacle[], bounds: MapBounds }>>}
 */
export async function discoverProjectMaps() {
  /** @type {Array<{ index: number, name: string, obstacles: MapObstacle[], bounds: MapBounds }>} */
  const out = [];
  for (let i = 1; ; i++) {
    const mapUrl = mapFileUrl(i);
    try {
      const res = await fetch(mapUrl, { cache: 'no-store' });
      if (!res.ok) break;
      const text = await res.text();
      const parsed = parseSingleStageMapFile(text);
      out.push({
        index: i,
        name: parsed.name || `Map ${i}`,
        obstacles: parsed.obstacles,
        bounds: parsed.bounds,
        tilemap: parsed.tilemap || null,
        placements: parsed.placements || [],
        ...(parsed.visualSet != null ? { visualSet: parsed.visualSet } : {}),
        ...(parsed.migrantWaves === false ? { migrantWaves: false } : {}),
      });
    } catch {
      break;
    }
  }
  return out;
}

export function tryLoadLegacyBrowserMap() {
  const raw = localStorage.getItem(MAP_STORAGE_KEY);
  if (!raw) {
    return false;
  }
  try {
    const root = JSON.parse(raw);
    const data = parseMapJSON(raw);
    const layer = data.stages[0] || [];
    const vs = parseVisualSetFromMapData(root);
    const mw = parseMigrantWavesFromMapData(root);
    state.levelCatalog = [
      {
        index: 1,
        name: data.name,
        obstacles: layer,
        bounds: data.bounds,
        tilemap: null,
        placements: parsePlacementsFromMapData(data),
        ...(vs != null ? { visualSet: vs } : {}),
        ...(mw === false ? { migrantWaves: false } : {}),
      },
    ];
    return true;
  } catch {
    return false;
  }
}

export function clearMapsFromState() {
  state.levelCatalog = [];
  state.useCustomMap = false;
  state.mapBounds = { ...DEFAULT_MAP_BOUNDS };
  state.tilemap = null;
  state.tilemapExtraObstacles = [];
  state.enemyVisualSet = 0;
  state.migrantWavesEnabled = true;
  state.pendingTimedMapPlacements = [];
}

/**
 * Discover maps, optional legacy browser JSON, then load unlock progress.
 */
export async function initMapsAndProgress() {
  const url = new URL(window.location.href);
  if (url.searchParams.get('procedural') === '1') {
    clearMapsFromState();
    loadProgressIntoState();
    return;
  }
  try {
    const discovered = await discoverProjectMaps();
    if (discovered.length > 0) {
      state.levelCatalog = discovered;
    } else if (!tryLoadLegacyBrowserMap()) {
      clearMapsFromState();
    }
  } catch {
    if (!tryLoadLegacyBrowserMap()) {
      clearMapsFromState();
    }
  }
  loadProgressIntoState();
}

export function saveCustomMapToStorage(jsonText) {
  localStorage.setItem(MAP_STORAGE_KEY, jsonText);
}

export function clearStoredCustomMap() {
  localStorage.removeItem(MAP_STORAGE_KEY);
}
