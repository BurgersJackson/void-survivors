/**
 * Premade obstacle presets — same `kind` values as the main game renderer.
 * `shape`: rect (default), circle, hex, tri, star — collision and drawing use real shape.
 */
export const PREMADE_SHAPES = [
  { id: 'wall_wide', label: 'Wall — wide (horizontal)', w: 420, h: 14, kind: 'wall', shape: 'rect' },
  { id: 'wall_wide_v', label: 'Wall — wide (vertical)', w: 14, h: 420, kind: 'wall', shape: 'rect' },
  { id: 'wall_med', label: 'Wall — medium (horizontal)', w: 220, h: 14, kind: 'wall', shape: 'rect' },
  { id: 'wall_med_v', label: 'Wall — medium (vertical)', w: 14, h: 220, kind: 'wall', shape: 'rect' },
  { id: 'wall_tall', label: 'Wall — tall (vertical strip)', w: 14, h: 380, kind: 'wall', shape: 'rect' },
  { id: 'wall_tall_h', label: 'Wall — tall (horizontal strip)', w: 380, h: 14, kind: 'wall', shape: 'rect' },
  { id: 'barrier', label: 'Barrier — horizontal', w: 520, h: 10, kind: 'barrier', shape: 'rect' },
  { id: 'barrier_v', label: 'Barrier — vertical', w: 10, h: 520, kind: 'barrier', shape: 'rect' },
  { id: 'bridge', label: 'Bridge — horizontal', w: 340, h: 20, kind: 'bridge', shape: 'rect' },
  { id: 'bridge_v', label: 'Bridge — vertical', w: 20, h: 340, kind: 'bridge', shape: 'rect' },
  { id: 'pillar_tall', label: 'Pillar — tall', w: 22, h: 200, kind: 'pillar', shape: 'rect' },
  { id: 'pillar_short', label: 'Pillar — short', w: 22, h: 88, kind: 'pillar', shape: 'rect' },
  { id: 'shard', label: 'Crystal shard', w: 32, h: 160, kind: 'shard', shape: 'rect' },
  { id: 'tiny', label: 'Tiny block', w: 40, h: 36, kind: 'building', shape: 'rect' },
  { id: 'small', label: 'Small block', w: 96, h: 72, kind: 'building', shape: 'rect' },
  { id: 'medium', label: 'Medium block', w: 160, h: 112, kind: 'building', shape: 'rect' },
  { id: 'large', label: 'Large block', w: 240, h: 168, kind: 'building', shape: 'rect' },
  { id: 'mega', label: 'Megablock', w: 280, h: 200, kind: 'megablock', shape: 'rect' },
  { id: 'circle_s', label: 'Circle — small', w: 72, h: 72, kind: 'building', shape: 'circle' },
  { id: 'circle_m', label: 'Circle — medium', w: 120, h: 120, kind: 'building', shape: 'circle' },
  { id: 'circle_l', label: 'Circle — large', w: 200, h: 200, kind: 'megablock', shape: 'circle' },
  { id: 'hex_s', label: 'Hex — small', w: 80, h: 80, kind: 'building', shape: 'hex' },
  { id: 'hex_m', label: 'Hex — medium', w: 140, h: 140, kind: 'building', shape: 'hex' },
  { id: 'hex_l', label: 'Hex — large', w: 220, h: 220, kind: 'megablock', shape: 'hex' },
  { id: 'tri_s', label: 'Triangle — small', w: 80, h: 72, kind: 'building', shape: 'tri' },
  { id: 'tri_m', label: 'Triangle — medium', w: 140, h: 120, kind: 'building', shape: 'tri' },
  { id: 'tri_l', label: 'Triangle — large', w: 220, h: 180, kind: 'megablock', shape: 'tri' },
  { id: 'star_s', label: 'Star — small', w: 80, h: 80, kind: 'building', shape: 'star' },
  { id: 'star_m', label: 'Star — medium', w: 140, h: 140, kind: 'building', shape: 'star' },
  { id: 'star_l', label: 'Star — large', w: 220, h: 220, kind: 'megablock', shape: 'star' },
];

export function clonePremade(p) {
  return {
    id: p.id,
    label: p.label,
    w: p.w,
    h: p.h,
    kind: p.kind,
    shape: p.shape || 'rect',
  };
}
