export const COLORS = {
  player: '#00f5ff',
  playerCore: '#ffffff',
  enemy: {
    crawler: '#ff2244',
    dasher: '#ff6600',
    tank: '#aa1122',
    swarm: '#ff00aa',
    spitter: '#44ff44',
    migrant: '#ee88ff',
    boss: '#ffdd00',
  },
  xp: '#ffdd00',
  projectile: '#ffee00',
  ui: '#ffffff',
};

export const WEAPONS = [
  'Magic Wand',
  'Spread Shot',
  'Orbiter',
  'Lightning',
  'Homing Missiles',
  'Laser Beam',
  'Bomb',
];

export const PASSIVES = [
  'Swift Boots',
  'Armor Plate',
  'Magnet',
  'Might',
  'Cooldown',
  'Rapid Fire',
  'Regen',
];

export const PASSIVE_EVOL = {
  'Armor Plate': 'Thorns',
  Magnet: 'Treasure Sense',
  Might: 'Giant Killer',
  Cooldown: 'Eraser',
  'Rapid Fire': 'Overclock',
  Regen: 'Vampire',
};

export const EVO_REQ = { weapon: [], passive: [] };
WEAPONS.forEach((w) => EVO_REQ.weapon.push(w));

/** Procedural biome labels (rotate by map index). */
export const STAGES = ['The Void', 'Crystal Caves', 'Neon Wastes'];

/** Survive this many seconds on a map to clear it and unlock the next. */
export const WIN_TIME_SEC = 30 * 60;

/** Internal canvas resolution (720p, 16:9). CSS scales uniformly to fit the window; letterboxing preserves aspect. */
export const VIEWPORT_WIDTH = 1280;
export const VIEWPORT_HEIGHT = 720;

/** Spawn pressure steps up when this many seconds elapse (5 minutes per tier). */
export const SPAWN_TIER_DURATION_SEC = 300;

/** Tier 0..8 from game time; difficulty jumps only when this value increases. */
export function spawnDifficultyTier(gameTimeSec) {
  return Math.min(8, Math.floor(gameTimeSec / SPAWN_TIER_DURATION_SEC));
}
export const STAGE_COLORS = ['#0a0a15', '#150a20', '#0a1520'];
export const STAGE_GRID = ['#ffffff08', '#ffffff05', '#00f5ff10'];

export const ENEMY_TYPES = {
  crawler: {
    r: 15,
    hp: 10,
    speed: 60,
    color: '#ff2244',
    xp: 3,
    shape: 'circle',
    dmg: 10,
  },
  dasher: {
    r: 18,
    hp: 15,
    speed: 100,
    color: '#ff6600',
    xp: 5,
    shape: 'triangle',
    dmg: 15,
    dashTimer: 2,
  },
  tank: {
    r: 37.5,
    hp: 80,
    speed: 30,
    color: '#aa1122',
    xp: 15,
    shape: 'hexagon',
    dmg: 20,
  },
  swarm: {
    r: 9,
    hp: 3,
    speed: 80,
    color: '#ff00aa',
    xp: 2,
    shape: 'square',
    dmg: 5,
  },
  /** Cross-screen flock (VS-style bats): constant drift, wraps as a group; does not chase. */
  migrant: {
    r: 8,
    hp: 4,
    speed: 88,
    color: '#ee88ff',
    xp: 2,
    shape: 'square',
    dmg: 6,
    migrant: true,
  },
  spitter: {
    r: 21,
    hp: 20,
    speed: 50,
    color: '#44ff44',
    xp: 8,
    shape: 'diamond',
    dmg: 12,
    ranged: true,
  },
  boss: {
    r: 50,
    hp: 500,
    speed: 20,
    color: '#ffdd00',
    xp: 100,
    shape: 'octagon',
    dmg: 30,
    boss: true,
  },
};

/** Before Swift Boots / turbo. */
export const PLAYER_BASE_SPEED = 125;

/** Rare grunt upgrade (not boss / not flock). Ring + thicker HP in render. */
export const ELITE_SPAWN_CHANCE = 0.038;
export const ELITE_HP_MULT = 3;
export const ELITE_XP_MULT = 2.2;
export const ELITE_DMG_MULT = 1.12;
/** Slight size bump so the ring reads clearly. */
export const ELITE_RADIUS_MULT = 1.07;
