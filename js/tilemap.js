/**
 * Tilemap: authored grid + tiling mode, streamed collision & terrain around the player.
 * Tiling modes: none | horizontal | vertical | omnidirectional
 */

/** @typedef {'none'|'horizontal'|'vertical'|'omnidirectional'} TilingMode */

/**
 * @typedef {{ kind: string, solid: boolean, fill?: string }} TileTypeDef
 */

/** Default palette: 0 floor, 1 wall, 2 building (solid). */
export const DEFAULT_TILE_TYPES = {
  0: { kind: 'floor', solid: false, fill: '#12141c' },
  1: { kind: 'wall', solid: true, fill: '#2a2d42' },
  2: { kind: 'building', solid: true, fill: '#3a2848' },
  3: { kind: 'pillar', solid: true, fill: '#283040' },
};

export const DEFAULT_STREAM_RADIUS_PX = 2400;

/**
 * @param {unknown} v
 * @returns {TilingMode}
 */
export function normalizeTilingMode(v) {
  if (v === 'horizontal' || v === 'vertical' || v === 'omnidirectional' || v === 'none') {
    return v;
  }
  return 'none';
}

/**
 * @typedef {object} TilemapSpec
 * @property {number} tileSize
 * @property {number} widthTiles
 * @property {number} heightTiles
 * @property {number[][]} tiles
 * @property {TilingMode} tiling
 * @property {number} streamRadiusPx
 * @property {Record<number, TileTypeDef>} tileTypes
 */

/**
 * @param {Record<string, unknown>} raw
 * @returns {TilemapSpec | null}
 */
export function parseTilemapSpec(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const tiles = o.tiles;
  if (!Array.isArray(tiles) || tiles.length === 0) return null;
  const first = tiles[0];
  if (!Array.isArray(first)) return null;
  const widthTiles = Number(o.widthTiles) || first.length;
  const heightTiles = Number(o.heightTiles) || tiles.length;
  const tileSize = Math.max(8, Math.min(512, Number(o.tileSize) || 64));
  const tiling = normalizeTilingMode(o.tiling);
  const streamRadiusPx = Math.max(
    400,
    Math.min(8000, Number(o.streamRadiusPx) || DEFAULT_STREAM_RADIUS_PX)
  );

  /** @type {number[][]} */
  const grid = [];
  for (let y = 0; y < heightTiles; y++) {
    const row = Array.isArray(tiles[y]) ? tiles[y] : [];
    const line = [];
    for (let x = 0; x < widthTiles; x++) {
      const id = Number(row[x]);
      line.push(Number.isFinite(id) ? id : 0);
    }
    grid.push(line);
  }

  /** @type {Record<number, TileTypeDef>} */
  const types = { ...DEFAULT_TILE_TYPES };
  const custom = o.tileTypes;
  if (custom && typeof custom === 'object') {
    for (const k of Object.keys(custom)) {
      const n = Number(k);
      if (!Number.isFinite(n)) continue;
      const t = /** @type {Record<string, unknown>} */ (custom[k]);
      types[n] = {
        kind: String(t.kind || 'floor'),
        solid: Boolean(t.solid),
        fill: typeof t.fill === 'string' ? t.fill : undefined,
      };
    }
  }

  return {
    tileSize,
    widthTiles,
    heightTiles,
    tiles: grid,
    tiling,
    streamRadiusPx,
    tileTypes: types,
  };
}

/** Map pixel size (full authored extent). */
export function tilemapPixelSize(tm) {
  return {
    w: tm.widthTiles * tm.tileSize,
    h: tm.heightTiles * tm.tileSize,
  };
}

/** Axis-aligned bounds of the authored map in world space (one period). */
export function tilemapWorldBounds(tm) {
  const { ox, oy } = tilemapOrigin(tm);
  const { w, h } = tilemapPixelSize(tm);
  return { minX: ox, minY: oy, maxX: ox + w, maxY: oy + h };
}

export function tilemapOrigin(tm) {
  const { w, h } = tilemapPixelSize(tm);
  return { ox: -w / 2, oy: -h / 2 };
}

export function isInfiniteTiling(tm) {
  return tm.tiling !== 'none';
}

/**
 * @param {TilemapSpec} tm
 * @param {number} wx
 * @param {number} wy
 */
export function worldToTileIndicesRaw(tm, wx, wy) {
  const { ox, oy } = tilemapOrigin(tm);
  const ts = tm.tileSize;
  return {
    tx: Math.floor((wx - ox) / ts),
    ty: Math.floor((wy - oy) / ts),
  };
}

/**
 * Map logical tile indices to sample cell in authored grid (wrap / clamp).
 * @param {TilemapSpec} tm
 */
export function normalizeSampleIndex(tx, ty, tm) {
  const W = tm.widthTiles;
  const H = tm.heightTiles;
  const mode = tm.tiling;
  let sx = tx;
  let sy = ty;
  if (mode === 'omnidirectional') {
    sx = ((tx % W) + W) % W;
    sy = ((ty % H) + H) % H;
  } else if (mode === 'horizontal') {
    sx = ((tx % W) + W) % W;
    sy = Math.max(0, Math.min(H - 1, ty));
  } else if (mode === 'vertical') {
    sx = Math.max(0, Math.min(W - 1, tx));
    sy = ((ty % H) + H) % H;
  } else {
    sx = Math.max(0, Math.min(W - 1, tx));
    sy = Math.max(0, Math.min(H - 1, ty));
  }
  return { sx, sy };
}

export function getTileIdAtWorld(tm, wx, wy) {
  const { tx, ty } = worldToTileIndicesRaw(tm, wx, wy);
  const { sx, sy } = normalizeSampleIndex(tx, ty, tm);
  const row = tm.tiles[sy];
  if (!row) return 0;
  const id = row[sx];
  return Number.isFinite(id) ? id : 0;
}

/**
 * @param {TilemapSpec} tm
 * @param {number} px
 * @param {number} py
 * @param {number} radiusPx
 */
export function buildSolidObstaclesNear(tm, px, py, radiusPx) {
  const ts = tm.tileSize;
  const { ox, oy } = tilemapOrigin(tm);
  const tMin = Math.floor((px - radiusPx - ox) / ts) - 1;
  const tMax = Math.ceil((px + radiusPx - ox) / ts) + 1;
  const uMin = Math.floor((py - radiusPx - oy) / ts) - 1;
  const uMax = Math.ceil((py + radiusPx - oy) / ts) + 1;

  /** @type {Array<{x:number,y:number,w:number,h:number,kind:string,shape:string,_tile?:boolean}>} */
  const out = [];
  const cap = 9000;
  let count = 0;

  for (let tx = tMin; tx <= tMax && count < cap; tx++) {
    for (let ty = uMin; ty <= uMax && count < cap; ty++) {
      const { sx, sy } = normalizeSampleIndex(tx, ty, tm);
      const tid = tm.tiles[sy] ? tm.tiles[sy][sx] : 0;
      const def = tm.tileTypes[tid] || tm.tileTypes[0] || { kind: 'floor', solid: false };
      if (!def.solid) continue;
      const wx = ox + tx * ts;
      const wy = oy + ty * ts;
      if (
        wx + ts < px - radiusPx ||
        wx > px + radiusPx ||
        wy + ts < py - radiusPx ||
        wy > py + radiusPx
      ) {
        continue;
      }
      out.push({
        x: wx,
        y: wy,
        w: ts,
        h: ts,
        kind: def.kind,
        shape: 'rect',
        _tile: true,
      });
      count++;
    }
  }
  return out;
}

/**
 * Circle (center px,py radius r) vs axis-aligned rect.
 */
function circleIntersectsRect(px, py, r, ox, oy, ow, oh) {
  const nx = Math.max(ox, Math.min(px, ox + ow));
  const ny = Math.max(oy, Math.min(py, oy + oh));
  return Math.hypot(px - nx, py - ny) <= r;
}

/**
 * Repeat authored prop/box obstacles with the same periods as the tile grid (full map tiles together).
 * @param {TilemapSpec} tm
 * @param {Array<{x:number,y:number,w:number,h:number,kind:string,shape?:string}>} extras
 */
export function expandTiledExtrasInRange(tm, extras, px, py, radiusPx) {
  if (!extras || extras.length === 0) return [];
  const mode = tm.tiling;
  const { w: MW, h: MH } = tilemapPixelSize(tm);
  const r = radiusPx * 1.35;
  const maxTotal = 5000;
  /** @type {Array<{x:number,y:number,w:number,h:number,kind:string,shape:string}>} */
  const out = [];

  const pushIfNear = (o) => {
    if (out.length >= maxTotal) return;
    if (circleIntersectsRect(px, py, r, o.x, o.y, o.w, o.h)) {
      out.push({ ...o, shape: o.shape || 'rect' });
    }
  };

  for (const raw of extras) {
    const o = {
      x: raw.x,
      y: raw.y,
      w: raw.w,
      h: raw.h,
      kind: raw.kind,
      shape: raw.shape || 'rect',
    };
    if (mode === 'none') {
      pushIfNear(o);
      continue;
    }
    if (mode === 'horizontal') {
      const k0 = Math.floor((px - r - o.x - o.w) / MW) - 1;
      const k1 = Math.ceil((px + r - o.x) / MW) + 1;
      for (let k = k0; k <= k1; k++) {
        pushIfNear({ ...o, x: o.x + k * MW });
      }
    } else if (mode === 'vertical') {
      const k0 = Math.floor((py - r - o.y - o.h) / MH) - 1;
      const k1 = Math.ceil((py + r - o.y) / MH) + 1;
      for (let k = k0; k <= k1; k++) {
        pushIfNear({ ...o, y: o.y + k * MH });
      }
    } else {
      const i0 = Math.floor((px - r - o.x - o.w) / MW) - 1;
      const i1 = Math.ceil((px + r - o.x) / MW) + 1;
      const j0 = Math.floor((py - r - o.y - o.h) / MH) - 1;
      const j1 = Math.ceil((py + r - o.y) / MH) + 1;
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          pushIfNear({ ...o, x: o.x + i * MW, y: o.y + j * MH });
        }
      }
    }
  }
  return out;
}

/**
 * @param {TilemapSpec} tm
 * @param {{x:number,y:number}} cam
 * @param {number} viewW
 * @param {number} viewH
 * @param {(wx:number,wy:number,w:number,h:number,fill:string)=>void} drawCell
 */
export function forEachVisibleTile(tm, cam, viewW, viewH, drawCell) {
  const ts = tm.tileSize;
  const { ox, oy } = tilemapOrigin(tm);
  const pad = ts * 2;
  const minWx = cam.x - viewW / 2 - pad;
  const maxWx = cam.x + viewW / 2 + pad;
  const minWy = cam.y - viewH / 2 - pad;
  const maxWy = cam.y + viewH / 2 + pad;

  const tMin = Math.floor((minWx - ox) / ts) - 1;
  const tMax = Math.ceil((maxWx - ox) / ts) + 1;
  const uMin = Math.floor((minWy - oy) / ts) - 1;
  const uMax = Math.ceil((maxWy - oy) / ts) + 1;
  const cap = 12000;
  let n = 0;

  for (let tx = tMin; tx <= tMax && n < cap; tx++) {
    for (let ty = uMin; ty <= uMax && n < cap; ty++) {
      const { sx, sy } = normalizeSampleIndex(tx, ty, tm);
      const tid = tm.tiles[sy] ? tm.tiles[sy][sx] : 0;
      const def = tm.tileTypes[tid] || tm.tileTypes[0];
      const fill = def.fill || '#111';
      const wx = ox + tx * ts;
      const wy = oy + ty * ts;
      if (
        wx + ts < minWx ||
        wx > maxWx ||
        wy + ts < minWy ||
        wy > maxWy
      ) {
        continue;
      }
      drawCell(wx, wy, ts, ts, fill);
      n++;
    }
  }
}
