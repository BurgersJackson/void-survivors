import { state } from './state.js';
import { COLORS, STAGE_COLORS, STAGE_GRID } from './constants.js';
import { forEachVisibleTile } from './tilemap.js';
import { raycastObstacleRange } from './map-obstacles.js';
import { drawObstaclePath, obstacleShape } from './obstacle-geometry.js';

let ctx;
let mctx;

export function initRender(canvas, minimapCanvas) {
  ctx = canvas.getContext('2d');
  mctx = minimapCanvas.getContext('2d');
  minimapCanvas.width = 120;
  minimapCanvas.height = 120;
}

/** Full world draw + minimap (shake applied to world layer only). */
export function renderFrame() {
  ctx.save();
  if (state.screenShake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * state.screenShake * 20,
      (Math.random() - 0.5) * state.screenShake * 20
    );
  }
  drawBackground();
  drawTileTerrain();
  drawObstacles();
  drawXPOrbs();
  drawOffScreenPickupHints();
  drawEnemies();
  drawProjectiles();
  drawPlayer();
  drawParticles();
  ctx.restore();
  drawMinimap();
}

export function drawBackground() {
  const { W, H } = state;
  if (state.tilemap) {
    ctx.fillStyle = '#070710';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const bg = STAGE_COLORS[state.stage] || STAGE_COLORS[0];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  const ox = state.cam.x % 50;
  const oy = state.cam.y % 50;
  ctx.fillStyle = STAGE_GRID[state.stage] || STAGE_GRID[0];
  for (let x = -ox; x < W + 50; x += 50) {
    for (let y = -oy; y < H + 50; y += 50) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawTileTerrain() {
  const tm = state.tilemap;
  if (!tm) return;
  const { cam, W, H } = state;
  forEachVisibleTile(tm, cam, W, H, (wx, wy, tw, th, fill) => {
    const sx = wx - cam.x + W / 2;
    const sy = wy - cam.y + H / 2;
    ctx.fillStyle = fill;
    ctx.fillRect(sx, sy, tw, th);
  });
}

export function drawObstacles() {
  const { cam, W, H } = state;
  const st = state.stage;
  const accent = st === 0 ? '#00f5ff' : st === 1 ? '#66eeff' : '#ff00aa';
  const toScreen = (wx, wy) => ({
    x: wx - cam.x + W / 2,
    y: wy - cam.y + H / 2,
  });
  state.obstacles.forEach((o) => {
    if (o._tile) return;
    const sx = o.x - cam.x + W / 2;
    const sy = o.y - cam.y + H / 2;
    ctx.save();
    let fill = 'rgba(20,18,35,0.92)';
    let stroke = `${accent}55`;
    if (o.kind === 'wall' || o.kind === 'barrier') {
      fill = 'rgba(12,14,28,0.95)';
      stroke = `${accent}44`;
    } else if (o.kind === 'pillar') {
      fill = 'rgba(25,22,40,0.94)';
    } else if (o.kind === 'shard' || o.kind === 'bridge') {
      fill = 'rgba(18,40,55,0.9)';
      stroke = '#88ffff66';
    } else if (o.kind === 'megablock') {
      fill = 'rgba(40,12,45,0.92)';
      stroke = '#ff44aa55';
    }
    ctx.fillStyle = fill;
    drawObstaclePath(ctx, o, toScreen);
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = o.kind === 'wall' || o.kind === 'barrier' ? 1.5 : 2;
    ctx.stroke();
    if (
      (o.kind === 'building' || o.kind === 'megablock') &&
      obstacleShape(o) === 'rect'
    ) {
      ctx.strokeStyle = `${accent}33`;
      ctx.lineWidth = 1;
      const cols = Math.max(2, Math.floor(o.w / 38));
      for (let c = 1; c < cols; c++) {
        const lx = sx + (c * o.w) / cols;
        ctx.beginPath();
        ctx.moveTo(lx, sy + 6);
        ctx.lineTo(lx, sy + o.h - 6);
        ctx.stroke();
      }
    }
    ctx.restore();
  });
}

function worldToScreen(x, y) {
  return { x: x - state.cam.x + state.W / 2, y: y - state.cam.y + state.H / 2 };
}

/** VS-style arrows at screen edge when a hinted pickup is off-screen. */
function drawOffScreenPickupHints() {
  const { W, H } = state;
  const pad = 52;
  const cx = W / 2;
  const cy = H / 2;
  const list = state.xpOrbs.filter((o) => o.hintArrow && o.life > 0);
  list.sort((a, b) => {
    const da = Math.hypot(a.x - state.player.x, a.y - state.player.y);
    const db = Math.hypot(b.x - state.player.x, b.y - state.player.y);
    return da - db;
  });
  let shown = 0;
  for (const o of list) {
    if (shown >= 7) break;
    const sx = o.x - state.cam.x + W / 2;
    const sy = o.y - state.cam.y + H / 2;
    if (sx >= pad && sx <= W - pad && sy >= pad && sy <= H - pad) continue;
    shown++;
    const dx = sx - cx;
    const dy = sy - cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    let t = Infinity;
    if (ux > 1e-4) t = Math.min(t, (W - pad - cx) / ux);
    if (ux < -1e-4) t = Math.min(t, (pad - cx) / ux);
    if (uy > 1e-4) t = Math.min(t, (H - pad - cy) / uy);
    if (uy < -1e-4) t = Math.min(t, (pad - cy) / uy);
    if (!Number.isFinite(t) || t <= 0) continue;
    const ax = cx + ux * t;
    const ay = cy + uy * t;
    const col = o.chest ? '#ffdd00' : '#66eeff';
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, 7);
    ctx.lineTo(-6, -7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function glow(color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

export function drawPlayer() {
  const pos = worldToScreen(state.player.x, state.player.y);
  const player = state.player;
  ctx.save();
  if (player.invTimer > 0 && Math.floor(player.invTimer * 10) % 2 === 0) {
    ctx.globalAlpha = 0.5;
  }
  glow(COLORS.player, 20);
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, player.r, 0, Math.PI * 2);
  ctx.fill();
  glow(COLORS.playerCore, 15);
  ctx.fillStyle = COLORS.playerCore;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, player.r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ff2244';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(
    pos.x,
    pos.y,
    player.r + 5,
    Math.PI / 2,
    Math.PI / 2 + Math.PI * 2 * (player.hp / player.maxHp)
  );
  ctx.stroke();
  ctx.restore();
}

export function drawEnemies() {
  state.enemies.forEach((e) => {
    const pos = worldToScreen(e.x, e.y);
    ctx.save();
    glow(e.color, 15);
    ctx.fillStyle = e.color;
    const r = e.r * (e.type === 'boss' ? 1 : 1);
    if (e.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.shape === 'triangle') {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 - Math.PI / 2;
        const px = pos.x + Math.cos(a) * r;
        const py = pos.y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else if (e.shape === 'hexagon') {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6 - Math.PI / 2;
        ctx.lineTo(pos.x + Math.cos(a) * r, pos.y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    } else if (e.shape === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y - r);
      ctx.lineTo(pos.x + r * 0.7, pos.y);
      ctx.lineTo(pos.x, pos.y + r);
      ctx.lineTo(pos.x - r * 0.7, pos.y);
      ctx.closePath();
      ctx.fill();
    } else if (e.shape === 'octagon') {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 8;
        ctx.lineTo(pos.x + Math.cos(a) * r, pos.y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    } else if (e.shape === 'square') {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = e.glintColor || 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(pos.x - r * 0.3, pos.y - r * 0.3, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    if (e.elite) {
      const ring = r + 7;
      const hpT = Math.max(0, Math.min(1, e.maxHp > 0 ? e.hp / e.maxHp : 0));
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(35, 28, 8, 0.9)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ring, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffdd77';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ring, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpT);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 230, 140, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ring + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  });
}

export function drawProjectiles() {
  state.projectiles.forEach((p) => {
    const pos = worldToScreen(p.x, p.y);
    ctx.save();
    glow(p.color, 10);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  if (state.laserBeam && state.laserBeam.life > 0) {
    const lb = state.laserBeam;
    const pos = worldToScreen(lb.x, lb.y);
    const clip = raycastObstacleRange(
      lb.x,
      lb.y,
      lb.angle,
      lb.range,
      lb.width * 0.45,
      state.obstacles
    );
    ctx.save();
    glow(lb.color, 20);
    ctx.strokeStyle = lb.color;
    ctx.lineWidth = lb.width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + Math.cos(lb.angle) * clip, pos.y + Math.sin(lb.angle) * clip);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawParticles() {
  state.particles.forEach((p) => {
    const pos = worldToScreen(p.x, p.y);
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    glow(p.color, 8);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

export function drawXPOrbs() {
  state.xpOrbs.forEach((o) => {
    const pos = worldToScreen(o.x, o.y);
    ctx.save();
    if (o.chest) {
      glow('#ffdd00', 20);
      ctx.fillStyle = '#ffdd00';
      ctx.fillRect(pos.x - 12, pos.y - 10, 24, 20);
      ctx.fillStyle = '#aa8800';
      ctx.fillRect(pos.x - 3, pos.y - 10, 6, 20);
    } else {
      glow('#ffdd00', 10);
      ctx.fillStyle = '#ffdd00';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

export function drawMinimap() {
  mctx.fillStyle = 'rgba(0,0,0,0.8)';
  mctx.fillRect(0, 0, 120, 120);
  const scale = 0.05;
  mctx.fillStyle = 'rgba(40,42,58,0.85)';
  const toMini = (wx, wy) => ({
    x: 60 + (wx - state.cam.x) * scale,
    y: 60 + (wy - state.cam.y) * scale,
  });
  state.obstacles.forEach((o) => {
    if (o._tile) return;
    const a = toMini(o.x, o.y);
    const b = toMini(o.x + o.w, o.y + o.h);
    const bx = Math.min(a.x, b.x);
    const by = Math.min(a.y, b.y);
    const bw = Math.abs(b.x - a.x);
    const bh = Math.abs(b.y - a.y);
    if (bx + bw > 0 && bx < 120 && by + bh > 0 && by < 120) {
      drawObstaclePath(mctx, o, toMini);
      mctx.fill();
    }
  });
  const mx = 60 + (state.player.x - state.cam.x) * scale;
  const my = 60 + (state.player.y - state.cam.y) * scale;
  mctx.fillStyle = '#00f5ff';
  mctx.beginPath();
  mctx.arc(mx, my, 3, 0, Math.PI * 2);
  mctx.fill();
  state.enemies.forEach((e) => {
    const ex = 60 + (e.x - state.cam.x) * scale;
    const ey = 60 + (e.y - state.cam.y) * scale;
    if (ex > 0 && ex < 120 && ey > 0 && ey < 120) {
      const rad = e.elite ? 3 : 2;
      if (e.elite) {
        mctx.strokeStyle = 'rgba(255, 210, 100, 0.95)';
        mctx.lineWidth = 1.5;
        mctx.beginPath();
        mctx.arc(ex, ey, rad + 1.2, 0, Math.PI * 2);
        mctx.stroke();
      }
      mctx.fillStyle = e.color;
      mctx.beginPath();
      mctx.arc(ex, ey, rad, 0, Math.PI * 2);
      mctx.fill();
    }
  });
  state.xpOrbs.forEach((o) => {
    const ox = 60 + (o.x - state.cam.x) * scale;
    const oy = 60 + (o.y - state.cam.y) * scale;
    if (ox > 0 && ox < 120 && oy > 0 && oy < 120) {
      mctx.fillStyle = '#ffdd00';
      mctx.beginPath();
      mctx.arc(ox, oy, 1, 0, Math.PI * 2);
      mctx.fill();
    }
  });
}
