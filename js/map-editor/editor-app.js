import { PREMADE_SHAPES, clonePremade } from './premades.js';
import { drawObstaclePath } from '../obstacle-geometry.js';
import {
  parseMapJSON,
  saveCustomMapToStorage,
  MAP_STORAGE_KEY,
  mapFileUrl,
  normalizeMapBounds,
  boundsFromMapSize,
} from '../map-loader.js';
import {
  parseTilemapSpec,
  DEFAULT_TILE_TYPES,
  DEFAULT_STREAM_RADIUS_PX,
} from '../tilemap.js';

const WORLD = 3600;
const SPAWN_CLEAR = 220;

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');

/** @type {Array<{id:number,x:number,y:number,w:number,h:number,kind:string,shape?:string}>} */
const obstacles = [];
let nextId = 1;

/** Map pickups: chest / gem positions (see `placements` in exported JSON). */
/** @type {Array<{id:number,x:number,y:number,kind:string}>} */
const placements = [];
let nextPlacementId = 1;
let selectedPlacementId = null;

let editorMode = 'tiles';
let mapTilesW = 32;
let mapTilesH = 24;
let tileSizeEditor = 64;
/** @type {'none'|'horizontal'|'vertical'|'omnidirectional'} */
let tilingMode = 'none';
let brushTileId = 1;
/** @type {number[][]} */
let tileGrid = [];
/** Selected tile for delete (Tiles + Select). */
let selectedTileCell = /** @type {{ tx: number, ty: number } | null} */ (null);

let panX = 0;
let panY = 0;
let zoom = 0.42;

let grid = 16;
let tool = 'place';
/** Which preset is active — string id, looked up fresh from PREMADE_SHAPES on every place (no stale object). */
let activePremadeId = PREMADE_SHAPES[0].id;

function getActivePreset() {
  return PREMADE_SHAPES.find((x) => x.id === activePremadeId) || PREMADE_SHAPES[0];
}

let selectedId = null;

let dragging = false;
let dragKind = null;
/** World point at pointer-down; obstacle uses origin + (pointer - this) until release. */
let dragOriginWorld = { x: 0, y: 0 };
let dragOriginObs = { x: 0, y: 0 };
let dragObstacle = null;
let panning = false;
let panStart = { x: 0, y: 0, px: 0, py: 0 };

/** Pointer id for active pan / drag gesture (window listens so moves work without capture). */
let activeCanvasPointerId = null;

let windowPointerListenersAttached = false;

/** True when Delete/Backspace should edit the field, not remove the selected obstacle. */
function isTypingInTextField(el) {
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const t = (el.type || 'text').toLowerCase();
    return (
      t === 'text' ||
      t === 'search' ||
      t === 'url' ||
      t === 'email' ||
      t === 'password' ||
      t === 'number' ||
      t === 'tel'
    );
  }
  return false;
}

function setTool(next) {
  if (next !== 'place' && next !== 'select') return;
  tool = next;
  const placeBtn = document.getElementById('tool-place');
  const selectBtn = document.getElementById('tool-select');
  if (next === 'place') {
    selectedTileCell = null;
    placeBtn.classList.add('on');
    selectBtn.classList.remove('on');
  } else {
    selectBtn.classList.add('on');
    placeBtn.classList.remove('on');
  }
}

function takePointerForCanvas(e) {
  activeCanvasPointerId = e.pointerId;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (_) {
    /* ignore */
  }
  attachWindowPointerListeners();
}

function attachWindowPointerListeners() {
  if (windowPointerListenersAttached) return;
  windowPointerListenersAttached = true;
  window.addEventListener('pointermove', onWindowPointerMove, { passive: true });
  window.addEventListener('pointerup', onWindowPointerUp, true);
  window.addEventListener('pointercancel', onWindowPointerUp, true);
}

function detachWindowPointerListeners() {
  if (!windowPointerListenersAttached) return;
  window.removeEventListener('pointermove', onWindowPointerMove, { passive: true });
  window.removeEventListener('pointerup', onWindowPointerUp, true);
  window.removeEventListener('pointercancel', onWindowPointerUp, true);
  windowPointerListenersAttached = false;
}

function onWindowPointerMove(e) {
  if (
    activeCanvasPointerId == null ||
    e.pointerId !== activeCanvasPointerId
  ) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  if (panning) {
    panX = panStart.px - (e.clientX - panStart.x) / zoom;
    panY = panStart.py - (e.clientY - panStart.y) / zoom;
    return;
  }

  if (dragging && dragKind === 'move' && dragObstacle) {
    const w = screenToWorld(sx, sy);
    dragObstacle.x = dragOriginObs.x + (w.x - dragOriginWorld.x);
    dragObstacle.y = dragOriginObs.y + (w.y - dragOriginWorld.y);
  }
}

function onWindowPointerUp(e) {
  if (
    activeCanvasPointerId == null ||
    e.pointerId !== activeCanvasPointerId
  ) {
    return;
  }
  endPointerGesture(e);
}

function endPointerGesture(e) {
  if (
    activeCanvasPointerId == null ||
    e.pointerId !== activeCanvasPointerId
  ) {
    return;
  }
  detachWindowPointerListeners();
  if (
    typeof canvas.hasPointerCapture === 'function' &&
    canvas.hasPointerCapture(activeCanvasPointerId)
  ) {
    try {
      canvas.releasePointerCapture(activeCanvasPointerId);
    } catch (_) {
      /* ignore */
    }
  }
  activeCanvasPointerId = null;
  panning = false;
  if (dragging && dragObstacle) {
    dragObstacle.x = snap(dragObstacle.x);
    dragObstacle.y = snap(dragObstacle.y);
    syncPropsFromSelection();
  }
  dragging = false;
  dragObstacle = null;
}

function nudgeSelectedObstacle(dx, dy) {
  if (selectedId == null) return false;
  const o = currentObs().find((x) => x.id === selectedId);
  if (!o) return false;
  o.x += dx;
  o.y += dy;
  syncPropsFromSelection();
  setStatus(
    `Moved #${o.id} → (${Math.round(o.x)}, ${Math.round(o.y)})`
  );
  return true;
}

const nameInput = document.getElementById('map-name');
const visualSetInput = document.getElementById('map-visual-set');
const migrantWavesInput = document.getElementById('map-migrant-waves');
const statusEl = document.getElementById('status');

/** True while programmatically filling prop inputs — avoids change/blur applying stale w/h to the new selection. */
let syncingProps = false;

function currentObs() {
  return obstacles;
}

function snap(v) {
  return Math.round(v / grid) * grid;
}

function ensureTileGrid() {
  while (tileGrid.length < mapTilesH) {
    tileGrid.push(new Array(mapTilesW).fill(0));
  }
  tileGrid.length = mapTilesH;
  for (let y = 0; y < mapTilesH; y++) {
    if (!tileGrid[y]) tileGrid[y] = new Array(mapTilesW).fill(0);
    while (tileGrid[y].length < mapTilesW) tileGrid[y].push(0);
    tileGrid[y].length = mapTilesW;
  }
}

function tileOrigin() {
  const tw = mapTilesW * tileSizeEditor;
  const th = mapTilesH * tileSizeEditor;
  return { ox: -tw / 2, oy: -th / 2 };
}

/** @returns {{ tx: number, ty: number } | null} */
function worldToTileCell(wx, wy) {
  const { ox, oy } = tileOrigin();
  const tx = Math.floor((wx - ox) / tileSizeEditor);
  const ty = Math.floor((wy - oy) / tileSizeEditor);
  if (tx < 0 || ty < 0 || tx >= mapTilesW || ty >= mapTilesH) return null;
  return { tx, ty };
}

function syncMapSizeInputsFromTiles() {
  const w = mapTilesW * tileSizeEditor;
  const h = mapTilesH * tileSizeEditor;
  const mw = document.getElementById('map-size-w');
  const mh = document.getElementById('map-size-h');
  if (mw) mw.value = String(Math.round(w));
  if (mh) mh.value = String(Math.round(h));
}

function readTileInputsFromDom() {
  const wEl = document.getElementById('map-tiles-w');
  const hEl = document.getElementById('map-tiles-h');
  const tsEl = document.getElementById('tile-size-ed');
  const tilEl = document.getElementById('tiling-sel');
  const modeEl = document.getElementById('editor-mode-sel');
  const brushEl = document.getElementById('tile-brush');
  if (wEl) {
    const n = Number(wEl.value);
    if (Number.isFinite(n) && n >= 4 && n <= 512) mapTilesW = Math.floor(n);
  }
  if (hEl) {
    const n = Number(hEl.value);
    if (Number.isFinite(n) && n >= 4 && n <= 512) mapTilesH = Math.floor(n);
  }
  if (tsEl) {
    const n = Number(tsEl.value);
    if (Number.isFinite(n) && n >= 8 && n <= 256) tileSizeEditor = Math.floor(n);
  }
  if (tilEl && tilEl.value) {
    const v = tilEl.value;
    if (v === 'horizontal' || v === 'vertical' || v === 'omnidirectional' || v === 'none') {
      tilingMode = v;
    }
  }
  if (modeEl && modeEl.value) {
    const mv = modeEl.value;
    editorMode = mv === 'items' || mv === 'obstacles' || mv === 'tiles' ? mv : 'tiles';
  }
  if (brushEl) {
    const b = Number(brushEl.value);
    if (Number.isFinite(b)) brushTileId = b;
  }
  ensureTileGrid();
  syncMapSizeInputsFromTiles();
}

function drawTileEditorLayer() {
  ensureTileGrid();
  const { ox, oy } = tileOrigin();
  const pal = DEFAULT_TILE_TYPES;
  for (let ty = 0; ty < mapTilesH; ty++) {
    for (let tx = 0; tx < mapTilesW; tx++) {
      const tid = tileGrid[ty][tx];
      const def = pal[tid] || pal[0];
      const wx = ox + tx * tileSizeEditor;
      const wy = oy + ty * tileSizeEditor;
      const p1 = worldToScreen(wx, wy);
      const p2 = worldToScreen(wx + tileSizeEditor, wy + tileSizeEditor);
      const bx = Math.min(p1.x, p2.x);
      const by = Math.min(p1.y, p2.y);
      const bw = Math.abs(p2.x - p1.x);
      const bh = Math.abs(p2.y - p1.y);
      ctx.fillStyle = def.fill || '#333';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      if (
        selectedTileCell &&
        selectedTileCell.tx === tx &&
        selectedTileCell.ty === ty
      ) {
        ctx.strokeStyle = '#ffee00';
        ctx.lineWidth = 3;
        ctx.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);
      }
    }
  }
}

function resize() {
  const wrap = document.getElementById('canvas-wrap');
  canvas.width = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
}

function worldToScreen(wx, wy) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  return {
    x: (wx - panX) * zoom + cx,
    y: (wy - panY) * zoom + cy,
  };
}

function screenToWorld(sx, sy) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  return {
    x: (sx - cx) / zoom + panX,
    y: (sy - cy) / zoom + panY,
  };
}

function hitTest(wx, wy) {
  const obs = currentObs();
  for (let i = obs.length - 1; i >= 0; i--) {
    const o = obs[i];
    if (wx >= o.x && wx <= o.x + o.w && wy >= o.y && wy <= o.y + o.h) return o;
  }
  return null;
}

function addObstacle(template, centerWx, centerWy) {
  const tpl = clonePremade(template);
  const w = tpl.w;
  const h = tpl.h;
  let x = snap(centerWx - w / 2);
  let y = snap(centerWy - h / 2);
  const pk = document.getElementById('prop-kind');
  const kind =
    pk && pk.value ? pk.value : tpl.kind;
  const o = {
    id: nextId++,
    x,
    y,
    w,
    h,
    kind,
    shape: tpl.shape || 'rect',
  };
  currentObs().push(o);
  selectedId = o.id;
  setStatus(`Placed ${tpl.label} (${w}×${h}) · kind: ${kind}`);
  syncPropsFromSelection();
}

function deleteSelected() {
  if (selectedId == null) return;
  const obs = currentObs();
  const i = obs.findIndex((o) => o.id === selectedId);
  if (i >= 0) {
    obs.splice(i, 1);
    selectedId = null;
    setStatus('Deleted');
    syncPropsFromSelection();
  }
}

function duplicateSelected() {
  if (selectedId == null) return;
  const o = currentObs().find((x) => x.id === selectedId);
  if (!o) return;
  const c = {
    id: nextId++,
    x: o.x + grid * 2,
    y: o.y + grid * 2,
    w: o.w,
    h: o.h,
    kind: o.kind,
    shape: o.shape || 'rect',
  };
  currentObs().push(c);
  selectedId = c.id;
  setStatus('Duplicated');
  syncPropsFromSelection();
}

function draw() {
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gstep = 100 * zoom;
  const o0 = worldToScreen(0, 0);
  ctx.strokeStyle = '#ffffff08';
  ctx.lineWidth = 1;
  for (let sx = o0.x % gstep; sx < canvas.width; sx += gstep) {
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, canvas.height);
    ctx.stroke();
  }
  for (let sy = o0.y % gstep; sy < canvas.height; sy += gstep) {
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(canvas.width, sy);
    ctx.stroke();
  }

  const mw = Number(document.getElementById('map-size-w').value);
  const mh = Number(document.getElementById('map-size-h').value);
  if (Number.isFinite(mw) && Number.isFinite(mh) && mw >= 200 && mh >= 200) {
    const b = boundsFromMapSize(mw, mh);
    const pA = worldToScreen(b.minX, b.minY);
    const pB = worldToScreen(b.maxX, b.maxY);
    const bx = Math.min(pA.x, pB.x);
    const by = Math.min(pA.y, pB.y);
    const bw = Math.abs(pB.x - pA.x);
    const bh = Math.abs(pB.y - pA.y);
    ctx.fillStyle = 'rgba(100, 200, 140, 0.04)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(120, 220, 170, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.setLineDash([2, 6]);
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#7a9';
    ctx.font = '11px system-ui';
    ctx.fillText(
      `Map ${Math.round(b.maxX - b.minX)}×${Math.round(b.maxY - b.minY)} (play area)`,
      bx + 6,
      by + 14
    );
  }

  const INACTIVE_LAYER_ALPHA = 0.38; // non-active editor modes: faded preview only

  ctx.save();
  if (editorMode !== 'tiles') ctx.globalAlpha = INACTIVE_LAYER_ALPHA;
  drawTileEditorLayer();
  ctx.restore();

  const accent = '#00f5ff';
  const toEditor = (wx, wy) => worldToScreen(wx, wy);

  ctx.save();
  if (editorMode !== 'obstacles') ctx.globalAlpha = INACTIVE_LAYER_ALPHA;
  currentObs().forEach((o) => {
    ctx.fillStyle = 'rgba(30,28,45,0.92)';
    drawObstaclePath(ctx, o, toEditor);
    ctx.fill();
    ctx.strokeStyle = o.id === selectedId ? '#ffee00' : `${accent}88`;
    ctx.lineWidth = o.id === selectedId ? 2.5 : 1.5;
    drawObstaclePath(ctx, o, toEditor);
    ctx.stroke();
  });
  ctx.restore();

  ctx.save();
  if (editorMode !== 'items') ctx.globalAlpha = INACTIVE_LAYER_ALPHA;
  placements.forEach((p) => {
    const s = worldToScreen(p.x, p.y);
    ctx.beginPath();
    ctx.fillStyle =
      p.kind === 'gem' || p.kind === 'large_xp'
        ? 'rgba(80,240,255,0.9)'
        : 'rgba(255,200,60,0.9)';
    ctx.moveTo(s.x, s.y - 12);
    ctx.lineTo(s.x + 11, s.y + 8);
    ctx.lineTo(s.x - 11, s.y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = p.id === selectedPlacementId ? '#ffee00' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = p.id === selectedPlacementId ? 2.5 : 1.2;
    ctx.stroke();
    const st = p.spawnAtSec != null ? Number(p.spawnAtSec) : 0;
    if (Number.isFinite(st) && st > 0) {
      ctx.fillStyle = 'rgba(255,240,200,0.95)';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${st}s`, s.x, s.y + 22);
      ctx.textAlign = 'start';
    }
  });
  ctx.restore();

  const sp0 = worldToScreen(0, 0);
  ctx.strokeStyle = '#00f5ff33';
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sp0.x, sp0.y, SPAWN_CLEAR * zoom, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#00f5ff';
  ctx.font = '11px system-ui';
  ctx.fillText('Spawn (keep clear)', sp0.x + 8, sp0.y - 8);

  if (editorMode === 'obstacles' && tool === 'place') {
    const pr = getActivePreset();
    ctx.font = '13px system-ui';
    ctx.fillStyle = '#889';
    ctx.fillText(`Placing: ${pr.label} · ${pr.w}×${pr.h}`, 12, 24);
  }
  if (editorMode === 'items' && tool === 'place') {
    const pk = document.getElementById('placement-kind-sel');
    const lab = pk && pk.value === 'gem' ? 'Large XP gem' : 'Chest';
    ctx.font = '13px system-ui';
    ctx.fillStyle = '#9cc8ff';
    ctx.fillText(`World item: ${lab} — click to place`, 12, 24);
  }

  requestAnimationFrame(draw);
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function syncPropsFromSelection() {
  syncingProps = true;
  try {
    let o =
      selectedId != null ? currentObs().find((x) => x.id === selectedId) : null;
    if (selectedId != null && !o) {
      selectedId = null;
      o = null;
    }
    const px = document.getElementById('prop-x');
    const py = document.getElementById('prop-y');
    const pw = document.getElementById('prop-w');
    const ph = document.getElementById('prop-h');
    const pk = document.getElementById('prop-kind');
    if (!o) {
      px.value = '';
      py.value = '';
      pw.value = '';
      ph.value = '';
      return;
    }
    px.value = String(Math.round(o.x));
    py.value = String(Math.round(o.y));
    pw.value = String(Math.round(o.w));
    ph.value = String(Math.round(o.h));
    pk.value = o.kind;
  } finally {
    syncingProps = false;
  }
}

function snapPlacementXY(wx, wy) {
  const g = grid;
  return {
    x: Math.round(wx / g) * g,
    y: Math.round(wy / g) * g,
  };
}

function hitTestPlacement(wx, wy) {
  for (let i = placements.length - 1; i >= 0; i--) {
    const p = placements[i];
    if (Math.hypot(p.x - wx, p.y - wy) < 36) return p;
  }
  return null;
}

function syncPlacementSpawnFromSelection() {
  const el = document.getElementById('placement-spawn-sec');
  if (!el) return;
  const p = placements.find((x) => x.id === selectedPlacementId);
  if (!p) {
    el.value = '0';
    el.disabled = true;
    return;
  }
  el.disabled = false;
  const s = p.spawnAtSec != null ? Number(p.spawnAtSec) : 0;
  el.value = String(Number.isFinite(s) && s > 0 ? Math.floor(s) : 0);
}

function exportJSON() {
  readTileInputsFromDom();
  ensureTileGrid();
  const mapW = mapTilesW * tileSizeEditor;
  const mapH = mapTilesH * tileSizeEditor;
  const data = {
    version: 1,
    name: nameInput.value.trim() || 'Untitled map',
    mapSize: { w: mapW, h: mapH },
    tileSize: tileSizeEditor,
    widthTiles: mapTilesW,
    heightTiles: mapTilesH,
    tiling: tilingMode,
    tiles: tileGrid.map((row) => [...row]),
    streamRadiusPx: DEFAULT_STREAM_RADIUS_PX,
  };
  if (obstacles.length > 0) {
    data.obstacles = obstacles.map(({ x, y, w, h, kind, shape }) => ({
      x,
      y,
      w,
      h,
      kind,
      shape: shape || 'rect',
    }));
  }
  if (placements.length > 0) {
    data.placements = placements.map((p) => {
      const row = {
        kind: p.kind === 'gem' || p.kind === 'large_xp' ? 'gem' : 'chest',
        x: p.x,
        y: p.y,
      };
      const sec = p.spawnAtSec != null ? Number(p.spawnAtSec) : 0;
      if (Number.isFinite(sec) && sec > 0) row.spawnAtSec = sec;
      return row;
    });
  }
  if (visualSetInput) {
    const vs = Number(visualSetInput.value);
    if (Number.isFinite(vs)) {
      data.visualSet = Math.max(0, Math.min(5, Math.floor(vs)));
    }
  }
  if (migrantWavesInput && !migrantWavesInput.checked) {
    data.migrantWaves = false;
  }
  return JSON.stringify(data, null, 2);
}

/** Engine file: maps/mapN.json — `name` is the in-game title from the map name field. */
function exportEngineJSON() {
  return exportJSON();
}

function syncMapSizeInputsFromBounds(b) {
  const n = normalizeMapBounds(b);
  const w = Math.round(n.maxX - n.minX);
  const h = Math.round(n.maxY - n.minY);
  document.getElementById('map-size-w').value = String(w);
  document.getElementById('map-size-h').value = String(h);
}

function importMapText(text) {
  const data = JSON.parse(text);
  const tm = parseTilemapSpec(data);
  if (tm) {
    nameInput.value = String(data.name || 'Imported map');
    mapTilesW = tm.widthTiles;
    mapTilesH = tm.heightTiles;
    tileSizeEditor = tm.tileSize;
    tilingMode = tm.tiling;
    tileGrid = tm.tiles.map((row) => [...row]);
    const wEl = document.getElementById('map-tiles-w');
    const hEl = document.getElementById('map-tiles-h');
    const tsEl = document.getElementById('tile-size-ed');
    const tilEl = document.getElementById('tiling-sel');
    if (wEl) wEl.value = String(mapTilesW);
    if (hEl) hEl.value = String(mapTilesH);
    if (tsEl) tsEl.value = String(tileSizeEditor);
    if (tilEl) tilEl.value = tilingMode;
    syncMapSizeInputsFromTiles();
    obstacles.length = 0;
    if (data.obstacles && Array.isArray(data.obstacles)) {
      for (let i = 0; i < data.obstacles.length; i++) {
        const o = data.obstacles[i];
        obstacles.push({
          id: nextId++,
          x: o.x,
          y: o.y,
          w: o.w,
          h: o.h,
          kind: o.kind,
          shape: o.shape || 'rect',
        });
      }
    }
    placements.length = 0;
    nextPlacementId = 1;
    selectedPlacementId = null;
    if (data.placements && Array.isArray(data.placements)) {
      for (let i = 0; i < data.placements.length; i++) {
        const p = data.placements[i];
        const t = p.spawnAtSec != null ? Number(p.spawnAtSec) : 0;
        placements.push({
          id: nextPlacementId++,
          kind: String(p.kind || 'chest'),
          x: Number(p.x) || 0,
          y: Number(p.y) || 0,
          spawnAtSec: Number.isFinite(t) && t > 0 ? t : 0,
        });
      }
    }
    if (visualSetInput) {
      visualSetInput.value =
        data.visualSet != null && Number.isFinite(Number(data.visualSet))
          ? String(Math.max(0, Math.min(5, Math.floor(Number(data.visualSet)))))
          : '0';
    }
    if (migrantWavesInput) {
      migrantWavesInput.checked = data.migrantWaves !== false;
    }
    selectedId = null;
    syncPropsFromSelection();
    syncPlacementSpawnFromSelection();
    setStatus(`Imported tilemap “${nameInput.value}”`);
    return;
  }
  const { name, stages: st, bounds } = parseMapJSON(text);
  nameInput.value = name;
  if (visualSetInput) {
    visualSetInput.value =
      data.visualSet != null && Number.isFinite(Number(data.visualSet))
        ? String(Math.max(0, Math.min(5, Math.floor(Number(data.visualSet)))))
        : '0';
  }
  if (migrantWavesInput) {
    migrantWavesInput.checked = data.migrantWaves !== false;
  }
  syncPlacementSpawnFromSelection();
  syncMapSizeInputsFromBounds(bounds);
  const layer =
    st.find((arr) => Array.isArray(arr) && arr.length > 0) || st[0] || [];
  obstacles.length = 0;
  for (let i = 0; i < layer.length; i++) {
    const o = layer[i];
    obstacles.push({
      id: nextId++,
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      kind: o.kind,
      shape: o.shape || 'rect',
    });
  }
  selectedId = null;
  syncPropsFromSelection();
  setStatus(`Imported “${name}”`);
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    panning = true;
    panStart = { x: e.clientX, y: e.clientY, px: panX, py: panY };
    takePointerForCanvas(e);
    e.preventDefault();
    return;
  }

  if (e.button !== 0) return;

  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const w = screenToWorld(sx, sy);

  readTileInputsFromDom();
  if (editorMode === 'tiles') {
    canvas.focus({ preventScroll: true });
    const cell = worldToTileCell(w.x, w.y);
    if (!cell) {
      e.preventDefault();
      return;
    }
    if (tool === 'select') {
      selectedTileCell = { tx: cell.tx, ty: cell.ty };
      selectedId = null;
      setStatus(
        `Tile (${cell.tx},${cell.ty}) — Delete/Backspace clears · Place + brush to repaint`
      );
      e.preventDefault();
      return;
    }
    selectedTileCell = null;
    tileGrid[cell.ty][cell.tx] = brushTileId;
    setStatus(`Paint tile (${cell.tx},${cell.ty}) = ${brushTileId}`);
    e.preventDefault();
    return;
  }

  if (editorMode === 'items') {
    canvas.focus({ preventScroll: true });
    if (tool === 'select') {
      const hit = hitTestPlacement(w.x, w.y);
      selectedPlacementId = hit ? hit.id : null;
      selectedId = null;
      syncPlacementSpawnFromSelection();
      setStatus(hit ? `Selected item #${hit.id}` : 'No item');
      e.preventDefault();
      return;
    }
    const pk = document.getElementById('placement-kind-sel');
    const kindRaw = pk && pk.value === 'gem' ? 'gem' : 'chest';
    const spEl = document.getElementById('placement-spawn-sec');
    const rawSec = spEl ? Number(spEl.value) : 0;
    const spawnAtSec = Number.isFinite(rawSec) && rawSec > 0 ? Math.floor(rawSec) : 0;
    const sw = snapPlacementXY(w.x, w.y);
    placements.push({
      id: nextPlacementId++,
      kind: kindRaw,
      x: sw.x,
      y: sw.y,
      spawnAtSec,
    });
    setStatus(`Placed ${kindRaw} at (${sw.x}, ${sw.y})${spawnAtSec > 0 ? ` · spawns at ${spawnAtSec}s` : ''}`);
    e.preventDefault();
    return;
  }

  canvas.focus({ preventScroll: true });

  if (tool === 'select') {
    const hit = hitTest(w.x, w.y);
    if (hit) {
      selectedId = hit.id;
      dragging = true;
      dragKind = 'move';
      dragObstacle = hit;
      dragOriginWorld = { x: w.x, y: w.y };
      dragOriginObs = { x: hit.x, y: hit.y };
      takePointerForCanvas(e);
      e.preventDefault();
      setStatus(`Selected #${hit.id} (${hit.kind})`);
      syncPropsFromSelection();
    } else {
      selectedId = null;
      syncPropsFromSelection();
    }
    return;
  }

  if (tool === 'place') {
    const preset = PREMADE_SHAPES.find((x) => x.id === activePremadeId);
    if (preset) {
      addObstacle(preset, w.x, w.y);
    }
  }
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.09;
    zoom = Math.min(2.2, Math.max(0.06, zoom * factor));
  },
  { passive: false }
);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    const ae = document.activeElement;
    if (isTypingInTextField(ae)) return;
    if (ae && (ae.tagName === 'SELECT' || ae.tagName === 'BUTTON')) return;
    if (ae && ae.tagName === 'INPUT') {
      const t = (ae.type || '').toLowerCase();
      if (
        t === 'checkbox' ||
        t === 'radio' ||
        t === 'button' ||
        t === 'submit' ||
        t === 'reset' ||
        t === 'file'
      ) {
        return;
      }
    }
    e.preventDefault();
    setTool(tool === 'place' ? 'select' : 'place');
    return;
  }
  if (e.code === 'Delete' || e.code === 'Backspace') {
    if (isTypingInTextField(document.activeElement)) return;
    readTileInputsFromDom();
    if (editorMode === 'tiles') {
      if (selectedTileCell) {
        e.preventDefault();
        tileGrid[selectedTileCell.ty][selectedTileCell.tx] = 0;
        setStatus(`Cleared tile (${selectedTileCell.tx},${selectedTileCell.ty})`);
      }
      return;
    }
    if (editorMode === 'obstacles' && selectedId != null) {
      e.preventDefault();
      deleteSelected();
    }
    if (editorMode === 'items' && selectedPlacementId != null) {
      e.preventDefault();
      const sid = selectedPlacementId;
      const ix = placements.findIndex((p) => p.id === sid);
      if (ix >= 0) placements.splice(ix, 1);
      selectedPlacementId = null;
      syncPlacementSpawnFromSelection();
      setStatus('Removed world item');
    }
    return;
  }

  const isArrow =
    e.code === 'ArrowLeft' ||
    e.code === 'ArrowRight' ||
    e.code === 'ArrowUp' ||
    e.code === 'ArrowDown';
  if (isArrow) {
    readTileInputsFromDom();
    if (editorMode === 'tiles') return;
    if (selectedId == null) return;
    const el = document.activeElement;
    if (el === nameInput || (el && el.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    const step = e.shiftKey ? grid : 1;
    if (e.code === 'ArrowLeft') nudgeSelectedObstacle(-step, 0);
    else if (e.code === 'ArrowRight') nudgeSelectedObstacle(step, 0);
    else if (e.code === 'ArrowUp') nudgeSelectedObstacle(0, -step);
    else if (e.code === 'ArrowDown') nudgeSelectedObstacle(0, step);
    return;
  }
});

document.getElementById('tool-place').addEventListener('click', () => setTool('place'));

document.getElementById('tool-select').addEventListener('click', () => setTool('select'));

const editorModeEl = document.getElementById('editor-mode-sel');
if (editorModeEl) {
  editorModeEl.addEventListener('change', () => {
    selectedTileCell = null;
    selectedId = null;
    selectedPlacementId = null;
    syncPlacementSpawnFromSelection();
  });
}

const placementSpawnSecEl = document.getElementById('placement-spawn-sec');
if (placementSpawnSecEl) {
  placementSpawnSecEl.addEventListener('input', () => {
    const p = placements.find((x) => x.id === selectedPlacementId);
    if (!p) return;
    const v = Math.max(0, Number(placementSpawnSecEl.value) || 0);
    p.spawnAtSec = v > 0 ? v : 0;
  });
}

const premadeSel = document.getElementById('premade-sel');
PREMADE_SHAPES.forEach((p) => {
  const opt = document.createElement('option');
  opt.value = p.id;
  opt.textContent = `${p.label} (${p.w}×${p.h})`;
  premadeSel.appendChild(opt);
});
premadeSel.value = activePremadeId;
premadeSel.addEventListener('change', () => {
  const id = premadeSel.value;
  if (!id) return;
  activePremadeId = id;
  const picked = PREMADE_SHAPES.find((x) => x.id === id);
  if (!picked) return;
  setTool('place');
  const pl = clonePremade(picked);
  setStatus(`Ready: ${pl.label} (${pl.w}×${pl.h}) — adjust “Kind” below if needed`);
});

document.getElementById('grid-sel').addEventListener('change', (e) => {
  grid = Number(e.target.value);
});

document.getElementById('btn-dup').addEventListener('click', duplicateSelected);

document.getElementById('btn-export').addEventListener('click', () => {
  const json = exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(nameInput.value || 'void-map').replace(/\s+/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus('Downloaded JSON (includes level bounds).');
});

function readMapSlot() {
  const el = document.getElementById('map-slot');
  const n = Number(el && el.value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(9999, Math.floor(n));
}

document.getElementById('btn-save-engine').addEventListener('click', () => {
  const json = exportEngineJSON();
  const slot = readMapSlot();
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `map${slot}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(
    `Downloaded map${slot}.json — place as ${mapFileUrl(slot)} in this project. The "Map name" field is saved as the in-game title.`
  );
});

document.getElementById('btn-save-game').addEventListener('click', () => {
  try {
    const json = exportJSON();
    saveCustomMapToStorage(json);
    setStatus('Saved map in this browser (backup). Project maps/map1.json… still load first when present.');
  } catch (err) {
    setStatus(String(err.message || err));
  }
});

document.getElementById('btn-clear-storage').addEventListener('click', () => {
  localStorage.removeItem(MAP_STORAGE_KEY);
  syncMapSizeInputsFromBounds(null);
  setStatus('Cleared browser backup. Game uses maps/map1.json, map2.json, … when present.');
});

document.getElementById('file-import').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      importMapText(String(r.result));
    } catch (err) {
      setStatus(`Import error: ${err.message}`);
    }
  };
  r.readAsText(f);
  e.target.value = '';
});

/** Apply sidebar X/Y/W/H to the selected obstacle — Enter only (avoids stale values overwriting new placements). */
function commitSelectionGeometry() {
  if (syncingProps) return;
  if (selectedId == null) return;
  const o = currentObs().find((x) => x.id === selectedId);
  if (!o) return;
  const vx = document.getElementById('prop-x').value;
  const vy = document.getElementById('prop-y').value;
  const vw = document.getElementById('prop-w').value;
  const vh = document.getElementById('prop-h').value;
  if (vx !== '') o.x = snap(Number(vx));
  if (vy !== '') o.y = snap(Number(vy));
  if (vw !== '') o.w = Math.max(4, Number(vw));
  if (vh !== '') o.h = Math.max(4, Number(vh));
}

['prop-x', 'prop-y', 'prop-w', 'prop-h'].forEach((id) => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitSelectionGeometry();
    }
  });
});

document.getElementById('prop-kind').addEventListener('change', (e) => {
  if (syncingProps) return;
  const o =
    selectedId != null ? currentObs().find((x) => x.id === selectedId) : null;
  if (o) {
    o.kind = e.target.value;
  }
});

['editor-mode-sel', 'map-tiles-w', 'map-tiles-h', 'tile-size-ed', 'tiling-sel', 'tile-brush'].forEach(
  (id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => readTileInputsFromDom());
  }
);

window.addEventListener('resize', resize);
resize();
readTileInputsFromDom();
draw();

setStatus(
  'Tiles: click to paint · Props: place shapes · Space: place/select · Alt+drag pan · wheel zoom.'
);
