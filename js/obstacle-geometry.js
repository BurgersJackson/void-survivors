/**
 * Shared obstacle shapes: rects (default), circles, hexes, triangles, 5-point stars.
 * Bounding box (x,y,w,h) matches the map editor placement. Stars use a circular hull for
 * collision/separation so concave pockets do not snag movers; drawing still uses the star path.
 */

/** @param {{ shape?: string }} o */
export function obstacleShape(o) {
  const s = o.shape;
  if (s === 'circle' || s === 'hex' || s === 'tri' || s === 'star') return s;
  return 'rect';
}

function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 > 0 ? (apx * abx + apy * aby) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + abx * t, y: ay + aby * t };
}

/** Simple polygon (convex or concave) — ray cast, robust for canvas Y-down. */
export function pointInConvexPoly(px, py, verts) {
  const n = verts.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i].x;
    const yi = verts[i].y;
    const xj = verts[j].x;
    const yj = verts[j].y;
    const yn = (yi > py) !== (yj > py);
    if (yn) {
      const xcross =
        ((xj - xi) * (py - yi)) / (yj - yi || 1e-12) + xi;
      if (px < xcross) inside = !inside;
    }
  }
  return inside;
}

function distancePointToFilledConvexPoly(px, py, verts) {
  if (pointInConvexPoly(px, py, verts)) return 0;
  let md = Infinity;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const q = closestPointOnSegment(
      px,
      py,
      verts[i].x,
      verts[i].y,
      verts[j].x,
      verts[j].y
    );
    const d = Math.hypot(px - q.x, py - q.y);
    if (d < md) md = d;
  }
  return md;
}

/** World-space vertices for obstacle (centered in its x,y,w,h box). */
export function getObstacleWorldVertices(o) {
  const sh = obstacleShape(o);
  const x = o.x;
  const y = o.y;
  const w = o.w;
  const h = o.h;
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (sh === 'circle') {
    return null;
  }
  if (sh === 'tri') {
    return [
      { x: cx, y: y },
      { x: x, y: y + h },
      { x: x + w, y: y + h },
    ];
  }
  if (sh === 'hex') {
    const R = Math.min(w / 2, h / Math.sqrt(3)) * 0.98;
    const verts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * (Math.PI / 3);
      verts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
    }
    return verts;
  }
  if (sh === 'star') {
    const R = Math.min(w, h) / 2 * 0.95;
    const r = R * 0.38;
    const verts = [];
    for (let k = 0; k < 5; k++) {
      const aOut = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
      verts.push({
        x: cx + R * Math.cos(aOut),
        y: cy + R * Math.sin(aOut),
      });
      const aIn = -Math.PI / 2 + ((2 * k + 1) * Math.PI) / 5;
      verts.push({
        x: cx + r * Math.cos(aIn),
        y: cy + r * Math.sin(aIn),
      });
    }
    return verts;
  }
  return null;
}

function circleParams(o) {
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const rr = Math.min(o.w, o.h) / 2;
  return { cx, cy, rr };
}

/** Star props use a circular hull for collision (avoids concave / notch artifacts). */
function starCollisionRR(o) {
  return Math.min(o.w, o.h) * 0.44;
}

/** @returns {boolean} */
export function circleOverlapsRect(cx, cy, r, o) {
  const qx = Math.max(o.x, Math.min(cx, o.x + o.w));
  const qy = Math.max(o.y, Math.min(cy, o.y + o.h));
  const dx = cx - qx;
  const dy = cy - qy;
  return dx * dx + dy * dy < r * r;
}

/** Closest point on the filled axis-aligned rect's boundary (for collision response). */
function closestPointOnRectBoundary(px, py, o) {
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  if (px < x0 || px > x1 || py < y0 || py > y1) {
    const qx = Math.max(x0, Math.min(px, x1));
    const qy = Math.max(y0, Math.min(py, y1));
    return { x: qx, y: qy };
  }
  const dl = px - x0;
  const dr = x1 - px;
  const dt = py - y0;
  const db = y1 - py;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return { x: x0, y: py };
  if (m === dr) return { x: x1, y: py };
  if (m === dt) return { x: px, y: y0 };
  return { x: px, y: y1 };
}

export function circleOverlapsObstacle(cx, cy, r, o) {
  const sh = obstacleShape(o);
  if (sh === 'rect') {
    return circleOverlapsRect(cx, cy, r, o);
  }
  if (sh === 'circle' || sh === 'star') {
    const { cx: ox, cy: oy, rr } = circleParams(o);
    const R = sh === 'star' ? starCollisionRR(o) : rr;
    const d = Math.hypot(cx - ox, cy - oy);
    return d < r + R;
  }
  const verts = getObstacleWorldVertices(o);
  if (!verts) return circleOverlapsRect(cx, cy, r, o);
  const d = distancePointToFilledConvexPoly(cx, cy, verts);
  return d < r;
}

/**
 * Closest point on obstacle (filled) to P; for rects uses AABB boundary.
 * Used for separation pushes.
 */
function closestPointOnObstacle(px, py, o) {
  const sh = obstacleShape(o);
  if (sh === 'rect') {
    return closestPointOnRectBoundary(px, py, o);
  }
  if (sh === 'circle' || sh === 'star') {
    const { cx, cy, rr } = circleParams(o);
    const R = sh === 'star' ? starCollisionRR(o) : rr;
    const dx = px - cx;
    const dy = py - cy;
    const d = Math.hypot(dx, dy) || 1;
    return { x: cx + (dx / d) * R, y: cy + (dy / d) * R };
  }
  const verts = getObstacleWorldVertices(o);
  if (!verts) {
    const qx = Math.max(o.x, Math.min(px, o.x + o.w));
    const qy = Math.max(o.y, Math.min(py, o.y + o.h));
    return { x: qx, y: qy };
  }

  if (!pointInConvexPoly(px, py, verts)) {
    let best = { x: verts[0].x, y: verts[0].y };
    let bestD = Infinity;
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const q = closestPointOnSegment(
        px,
        py,
        verts[i].x,
        verts[i].y,
        verts[j].x,
        verts[j].y
      );
      const d = Math.hypot(px - q.x, py - q.y);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    return best;
  }

  let bestQ = verts[0];
  let bestD = Infinity;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const q = closestPointOnSegment(
      px,
      py,
      verts[i].x,
      verts[i].y,
      verts[j].x,
      verts[j].y
    );
    const d = Math.hypot(px - q.x, py - q.y);
    if (d < bestD) {
      bestD = d;
      bestQ = q;
    }
  }
  return bestQ;
}

function pointInFilledObstacle(px, py, o) {
  const sh = obstacleShape(o);
  if (sh === 'rect') {
    return (
      px > o.x &&
      px < o.x + o.w &&
      py > o.y &&
      py < o.y + o.h
    );
  }
  if (sh === 'circle' || sh === 'star') {
    const { cx, cy, rr } = circleParams(o);
    const R = sh === 'star' ? starCollisionRR(o) : rr;
    return Math.hypot(px - cx, py - cy) < R;
  }
  const verts = getObstacleWorldVertices(o);
  if (!verts) return false;
  return pointInConvexPoly(px, py, verts);
}

/**
 * @param {(wx: number, wy: number) => { x: number; y: number }} toScreen
 */
export function drawObstaclePath(ctx, o, toScreen) {
  const sh = obstacleShape(o);
  ctx.beginPath();
  if (sh === 'rect') {
    const a = toScreen(o.x, o.y);
    const b = toScreen(o.x + o.w, o.y + o.h);
    ctx.rect(
      Math.min(a.x, b.x),
      Math.min(a.y, b.y),
      Math.abs(b.x - a.x),
      Math.abs(b.y - a.y)
    );
    return;
  }
  if (sh === 'circle') {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const c = toScreen(cx, cy);
    const px = Math.abs(toScreen(cx + 1, cy).x - toScreen(cx, cy).x);
    const py = Math.abs(toScreen(cx, cy + 1).y - toScreen(cx, cy).y);
    const zoomF = Math.max(px, py) || 1;
    const rr = (Math.min(o.w, o.h) / 2) * zoomF;
    ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
    return;
  }
  const verts = getObstacleWorldVertices(o);
  if (!verts || verts.length < 3) {
    const a = toScreen(o.x, o.y);
    const b = toScreen(o.x + o.w, o.y + o.h);
    ctx.rect(
      Math.min(a.x, b.x),
      Math.min(a.y, b.y),
      Math.abs(b.x - a.x),
      Math.abs(b.y - a.y)
    );
    return;
  }
  const p0 = toScreen(verts[0].x, verts[0].y);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < verts.length; i++) {
    const p = toScreen(verts[i].x, verts[i].y);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

export function separateCircleFromObstacle(ox, oy, r, o) {
  if (!circleOverlapsObstacle(ox, oy, r, o)) return { x: ox, y: oy };

  const sh = obstacleShape(o);
  if (sh === 'circle' || sh === 'star') {
    const { cx, cy, rr } = circleParams(o);
    const R = sh === 'star' ? starCollisionRR(o) : rr;
    let dx = ox - cx;
    let dy = oy - cy;
    let d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      dx = 1;
      dy = 0;
      d = 1;
    }
    const minD = r + R;
    if (d >= minD) return { x: ox, y: oy };
    const pen = minD - d;
    return { x: ox + (dx / d) * pen, y: oy + (dy / d) * pen };
  }

  const inside = pointInFilledObstacle(ox, oy, o);
  const q = closestPointOnObstacle(ox, oy, o);
  let dx = ox - q.x;
  let dy = oy - q.y;
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    dx = ox - cx;
    dy = oy - cy;
    d = Math.hypot(dx, dy) || 1;
  }
  if (inside) {
    dx = q.x - ox;
    dy = q.y - oy;
    d = Math.hypot(dx, dy);
    if (d < 1e-6) return { x: ox, y: oy };
  }
  const pen = r - d;
  if (pen > 0) {
    return { x: ox + (dx / d) * pen, y: oy + (dy / d) * pen };
  }
  return { x: ox, y: oy };
}
