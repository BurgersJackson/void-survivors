import { PLAYER_BASE_SPEED } from './constants.js';

/** Central mutable game state — imported by systems and render. */
export const state = {
  gameState: 'start',
  gameTime: 0,
  score: 0,
  kills: 0,
  /** Procedural biome 0–2 (Void / Crystal / Neon), derived from playing map index. */
  stage: 0,
  screenShake: 0,
  bossActive: false,
  bossTimer: 0,
  cam: { x: 0, y: 0 },
  player: null,
  enemies: [],
  particles: [],
  projectiles: [],
  xpOrbs: [],
  weaponTimers: {},
  laserBeam: null,
  enemySpawnTimer: 0,
  bossSpawned: false,
  enemyId: 0,
  pendingGameOver: false,
  /** Current level-up options (for gamepad selection). */
  levelUpChoices: /** @type {any[]} */ ([]),
  /** Last movement input magnitude 0–1 (for debug HUD). */
  inputMoveMag: 0,
  W: 0,
  H: 0,
  /** @type {Array<{x:number,y:number,w:number,h:number,kind:string}>} */
  obstacles: [],
  /**
   * Maps loaded from maps/map1.json onward (contiguous). Each entry is one level file.
   * `tilemap` set when JSON includes a `tiles` grid (see tilemap.js).
   * @type {Array<{ index: number, name: string, obstacles: Array<{x:number,y:number,w:number,h:number,kind:string,shape?:string}>, bounds: {minX:number,minY:number,maxX:number,maxY:number}, tilemap: object | null, placements?: Array<{kind:string,x:number,y:number,amount?:number}> }>}
   */
  levelCatalog: [],
  /** Map index currently being played (1-based). */
  playingMapIndex: 1,
  /** Map index selected on the title screen (1-based). */
  selectedMapIndex: 1,
  /** Highest map index unlocked for play (persisted). */
  unlockedMapMax: 1,
  /** Title shown in the HUD for the current run (from file `name` or procedural label). */
  currentMapTitle: '',
  /** True when this run uses layout from levelCatalog for the active map index. */
  useCustomMap: false,
  /** 0–5: palette index for grunt/boss skins (`enemy-appearance.js`). Map JSON `visualSet` overrides; else `(playingMapIndex-1) % 6`. */
  enemyVisualSet: 0,
  /** Flock centers for `migrant` enemies: id → { cx, cy, vx, vy }. */
  migrantGroupMeta: /** @type {Map<number, { cx: number; cy: number; vx: number; vy: number }>} */ (
    new Map()
  ),
  migrantGroupIdCounter: 0,
  /** Seconds until next migrating flock event (not in normal spawn pool). */
  migrantWaveTimer: 55,
  /** When false (map JSON `migrantWaves: false`), skip migrating flock events. */
  migrantWavesEnabled: true,
  /**
   * World `placements` with `spawnAtSec` &gt; 0 — spawned when `gameTime` reaches that second.
   * @type {Array<{ kind: string, x: number, y: number, amount?: number, spawnAtSec: number }>}
   */
  pendingTimedMapPlacements: [],
  /** Playable world limits (spawns, player, enemies). */
  mapBounds: { minX: -3600, minY: -3600, maxX: 3600, maxY: 3600 },
  /** @type {import('./tilemap.js').TilemapSpec | null} */
  tilemap: null,
  /** Obstacle rects from JSON alongside a tilemap (decor); not tile-streamed. */
  tilemapExtraObstacles: /** @type {Array<{x:number,y:number,w:number,h:number,kind:string,shape?:string}>} */ (
    []
  ),
};

export function resetPlayerTemplate() {
  return {
    x: 0,
    y: 0,
    r: 12,
    hp: 100,
    maxHp: 100,
    speed: PLAYER_BASE_SPEED,
    invTimer: 0,
    xp: 0,
    level: 1,
    xpToNext: 26,
    weapons: [],
    passives: [],
    weaponLevels: {},
    passiveLevels: {},
    selectedWeapon: 0,
    turboTimer: 0,
    orbitAngle: 0,
    targetX: 1,
    targetY: 0,
    /** Radians; updated from movement/input for spawn direction bias. */
    lastMoveAngle: 0,
  };
}
