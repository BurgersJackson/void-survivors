import { ENEMY_TYPES } from './constants.js';

/** Six palettes so each map/stage can reuse the same enemy *roles* with different looks. */
export const ENEMY_VISUAL_SET_COUNT = 6;

/**
 * @typedef {{ color: string, glint?: string }} EnemySkin
 * Each set maps logical enemy `type` → fill + optional highlight for the specular dot in render.
 */
export const ENEMY_VISUAL_SETS = [
  {
    crawler: { color: '#ff3355', glint: 'rgba(255,200,210,0.35)' },
    dasher: { color: '#ff7722', glint: 'rgba(255,220,180,0.35)' },
    tank: { color: '#992233', glint: 'rgba(255,160,170,0.3)' },
    swarm: { color: '#ff33aa', glint: 'rgba(255,180,240,0.35)' },
    spitter: { color: '#55ee66', glint: 'rgba(200,255,210,0.35)' },
    migrant: { color: '#ee88ff', glint: 'rgba(255,220,255,0.4)' },
    boss: { color: '#ffdd33', glint: 'rgba(255,255,220,0.45)' },
  },
  {
    crawler: { color: '#66ccff', glint: 'rgba(220,245,255,0.38)' },
    dasher: { color: '#44aaee', glint: 'rgba(200,230,255,0.35)' },
    tank: { color: '#3366aa', glint: 'rgba(180,210,255,0.3)' },
    swarm: { color: '#88ddff', glint: 'rgba(230,250,255,0.38)' },
    spitter: { color: '#44ffcc', glint: 'rgba(200,255,245,0.35)' },
    migrant: { color: '#aaddff', glint: 'rgba(240,250,255,0.42)' },
    boss: { color: '#ffee88', glint: 'rgba(255,255,230,0.42)' },
  },
  {
    crawler: { color: '#aa44cc', glint: 'rgba(230,200,255,0.35)' },
    dasher: { color: '#66ff44', glint: 'rgba(220,255,200,0.38)' },
    tank: { color: '#553388', glint: 'rgba(200,180,240,0.28)' },
    swarm: { color: '#cc66ff', glint: 'rgba(240,210,255,0.38)' },
    spitter: { color: '#88ff44', glint: 'rgba(235,255,200,0.35)' },
    migrant: { color: '#dd77ff', glint: 'rgba(255,220,255,0.4)' },
    boss: { color: '#ffcc44', glint: 'rgba(255,245,200,0.42)' },
  },
  {
    crawler: { color: '#ff6644', glint: 'rgba(255,210,190,0.35)' },
    dasher: { color: '#ffaa33', glint: 'rgba(255,235,200,0.38)' },
    tank: { color: '#884422', glint: 'rgba(255,200,160,0.28)' },
    swarm: { color: '#ff8844', glint: 'rgba(255,220,200,0.36)' },
    spitter: { color: '#ffcc55', glint: 'rgba(255,250,200,0.35)' },
    migrant: { color: '#ffaa66', glint: 'rgba(255,230,210,0.4)' },
    boss: { color: '#ffe066', glint: 'rgba(255,255,220,0.45)' },
  },
  {
    crawler: { color: '#cc2233', glint: 'rgba(255,180,190,0.32)' },
    dasher: { color: '#dd5522', glint: 'rgba(255,200,170,0.34)' },
    tank: { color: '#661122', glint: 'rgba(200,140,150,0.26)' },
    swarm: { color: '#bb1166', glint: 'rgba(255,170,210,0.34)' },
    spitter: { color: '#889944', glint: 'rgba(230,240,200,0.32)' },
    migrant: { color: '#994466', glint: 'rgba(255,200,220,0.36)' },
    boss: { color: '#ddaa22', glint: 'rgba(255,240,200,0.4)' },
  },
  {
    crawler: { color: '#ff0088', glint: 'rgba(255,180,220,0.38)' },
    dasher: { color: '#00ffcc', glint: 'rgba(200,255,245,0.38)' },
    tank: { color: '#880066', glint: 'rgba(255,160,220,0.3)' },
    swarm: { color: '#ff00ee', glint: 'rgba(255,200,255,0.4)' },
    spitter: { color: '#66ff99', glint: 'rgba(210,255,230,0.35)' },
    migrant: { color: '#ff66dd', glint: 'rgba(255,220,250,0.42)' },
    boss: { color: '#ffff00', glint: 'rgba(255,255,200,0.48)' },
  },
];

/**
 * @param {string} type
 * @param {number} setIndex 0..5 (clamped)
 * @returns {{ color: string, glintColor: string }}
 */
export function resolveEnemyAppearance(type, setIndex) {
  const base = ENEMY_TYPES[type];
  const idx =
    (((Number(setIndex) || 0) % ENEMY_VISUAL_SET_COUNT) + ENEMY_VISUAL_SET_COUNT) %
    ENEMY_VISUAL_SET_COUNT;
  const skin = ENEMY_VISUAL_SETS[idx][type];
  if (skin && skin.color) {
    return {
      color: skin.color,
      glintColor: skin.glint || 'rgba(255,255,255,0.32)',
    };
  }
  return {
    color: base.color,
    glintColor: 'rgba(255,255,255,0.3)',
  };
}
