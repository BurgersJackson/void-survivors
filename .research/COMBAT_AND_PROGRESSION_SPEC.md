# Combat and progression (code audit)

Single source of truth for **current** numbers and formulas in `js/`. Use this when balancing or extending toward Vampire Survivors–style depth. Update this file when gameplay constants change.

---

## Enemy roster (`js/constants.js` → `ENEMY_TYPES`)


| id      | r    | base hp | base speed | base xp | contact dmg | notes                                                        |
| ------- | ---- | ------- | ---------- | ------- | ----------- | ------------------------------------------------------------ |
| crawler | 15   | 10      | 60         | 3       | 10          | circle                                                       |
| dasher  | 18   | 15      | 100        | 5       | 15          | triangle, dash                                               |
| tank    | 37.5 | 80      | 30         | 15      | 20          | hex                                                          |
| swarm   | 9    | 3       | 80         | 2       | 5           | square                                                       |
| spitter | 21   | 20      | 50         | 8       | 12          | diamond, ranged                                              |
| migrant | 8    | 4       | 88         | 2       | 6           | square, flock (`migrant: true`) — not in ambient `spawnWave` |
| boss    | 50   | 500     | 20         | 100     | 30          | octagon, `boss: true`                                        |


### Elites (`js/constants.js` + `spawnEnemy`)

Rare roll `ELITE_SPAWN_CHANCE` (~3.8%): **×** `ELITE_HP_MULT` (3), `ELITE_XP_MULT` (2.2), `ELITE_DMG_MULT` (1.12), `ELITE_RADIUS_MULT` (1.07). Gold HP ring in `render.js`. Bosses and flock units never roll elite.

### Visual sets (`js/enemy-appearance.js`)

Six palettes (`enemyVisualSet` 0–5): map JSON `visualSet` or default `(mapIndex - 1) % 6`.

### Scaling on spawn (`js/enemies.js` → `spawnEnemy`)

For type `boss`:

- `scale = 1 + gameTime / 120`
- `hp = t.hp * scale`, `maxHp` same
- `r = t.r * (1 + gameTime / 300)`
- `speed = t.speed * (1 + gameTime / 180)` — **no** `ENEMY_SPEED_MULT`
- `xp = floor(t.xp * scale)`, `dmg = t.dmg * scale`

For all other types:

- Same `scale`, `hp`, `xp`, `dmg`
- `r = t.r` (no time growth)
- `speed = t.speed * (1 + gameTime / 180) * ENEMY_SPEED_MULT` where `**ENEMY_SPEED_MULT = 0.75`**

### Grunt spawn mix (default)

If the map does **not** set `enemyPool`, `spawnWave` uses `**state.stage`** (0 / 1 / 2 from map index mod 3 in `applyPlayfieldForRun`):


| stage | types in pool                         |
| ----- | ------------------------------------- |
| 0     | crawler, swarm                        |
| 1     | crawler, dasher, tank, spitter        |
| 2     | crawler, dasher, tank, swarm, spitter |


`spawnWave` picks one random type from the pool, then ~28% chance of a second spawn when `spawnDifficultyTier(gameTime) >= 1`. Ring distance grows slightly with tier (`js/enemies.js`).

### Per-map enemy pool (`enemyPool`)

Maps parsed by `parseSingleStageMapFile` may include:

```json
"enemyPool": ["crawler", "swarm", "dasher"]
```

- Only **non-boss** ids from `ENEMY_TYPES` are kept; unknown strings and `boss` are dropped.
- When non-empty, `**spawnWave` uses only this list** instead of the stage default. Bosses are still spawned by `updateSpawning` and are **not** part of the pool.
- Stored on catalog entries and applied in `applyPlayfieldForRun` → `state.enemySpawnPool`.

Example: `maps/map1.json` includes a curated pool for testing.

### Boss cadence (`js/spawning.js`)

- After **180s** play time, each **180s** block where `floor(gameTime/180) > bossTimer` triggers a boss (and increments `bossTimer`).
- Boss spawn position: ring around player (`findSpawnRing`), scaled radius from `ENEMY_TYPES.boss.r`.

### Spawn rate (`js/spawning.js`)

- Tier: `min(8, floor(gameTime / SPAWN_TIER_DURATION_SEC))` with `SPAWN_TIER_DURATION_SEC = 300` (5 min).
- Interval and waves-per-event arrays step with tier; each tick fires multiple `spawnWave` calls with slight arc jitter.

### Caps and cleanup

- Non-boss cap: **300** alive; farthest grunts removed when over cap (flock units excluded from both distance cull and overflow trim).
- Despawn distance: **3000** px from player (squared check). **Migrants** are never distance-culled.

### Migrating flocks (`migrant`)

- Spawned on a timer in `updateSpawning` unless map sets `**migrantWaves: false`** (`state.migrantWavesEnabled`).
- `spawnMigratingFlock` in `enemies.js`: torus wrap, no chase AI, no grunt crowd separation (flock indices omitted from separation buckets).

---

## Weapons (`js/weapons.js`, `js/projectiles.js`, `js/render.js`, `js/weapon-damage.js`)

Base cooldowns in `getWeaponCooldown` (before Cooldown passive and Rapid Fire / Overclock, then **÷ 1.25** global RoF):


| weapon          | base cd (s)             |
| --------------- | ----------------------- |
| Magic Wand      | 1.6                     |
| Spread Shot     | 2.4                     |
| Orbiter         | 0 (continuous `update`) |
| Lightning       | 3.0                     |
| Homing Missiles | 4.0                     |
| Laser Beam      | 1.0                     |
| Bomb            | 5.0                     |


`Cooldown`: `cd *= 1 - passiveLevels['Cooldown'] * 0.1`.  
`rapidFireMultiplier`: +12% per Rapid Fire level, +10% per Overclock level; effective cooldown `cd /= rf`, then `**cd *= 1/1.25`**.

### Per-weapon behavior (level = `weaponLevels[w]`, typically 1–5 before evolution UI cap)

- **Magic Wand**: one projectile to nearest in 400px; `dmg = 8 + lvl*2`, speed 450, life 1.5s.
- **Spread Shot**: `count = 3 + lvl`, spread `0.3 + lvl*0.15`, each `dmg = 8 + lvl*3`.
- **Orbiter**: `count = 1 + lvl`, radius `60 + lvl*15`, orbit speed `(2+lvl) * rapidFireMultiplier`; DPS-style tick `(0.5 + lvl*0.3) * dt * 60` when enemy overlaps orbit band (`weapons.js`).
- **Lightning**: `chains = 1 + lvl`; each hit `15 + lvl*5` instant to nearest in 250px.
- **Homing Missiles**: `count = 1 + lvl` projectiles; `dmg = 12 + lvl*4`, homing in `updateWeapons`.
- **Laser Beam**: sets `state.laserBeam` (range, width, angle, short life). **Damage** in `updateLaserBeamSim(dt)` (`weapons.js`, fixed timestep): DPS `(10 + lvl*5) * 3` × `dt` × `weaponDamageMultiplier` (see passives). Level from `**Laser Beam`** or evolved `**Death Ray**` (`laserWeaponLevel`). **Render** only draws the beam (no damage).
- **Bomb**: `count = 1 + lvl` bombs; `dmg = 25 + lvl*8`, fuse `1.5 + lvl*0.3`, radius `80 + lvl*20`; `explodeBomb` in `projectiles.js` with radial falloff.

### Weapon evolution (`js/leveling.js` → `checkEvolution`)

When a base weapon reaches **level 5** and the player owns the matching passive, the weapon **name** is replaced by the evolved string from `evolveWeapon` (e.g. Magic Wand → Arcane Blast). Required passives are listed in `matchPassives` (Cooldown, Might, Swift Boots, Regen, etc. per weapon).

**Implemented:** `attachEvolutionWeaponDefs` copies each base def onto the evolved name; `getWeaponCooldown` resolves via `weaponCooldownBaseName`. `checkEvolution` migrates `weaponTimers` from base → evolved. Orbiter uses `orbiterWeaponLevel` (Orbiter / Planetary Ring). `getWeaponDesc` resolves evolved names to base for card text.

---

## Passives


| passive                | effect in code                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Swift Boots            | move speed `* (1 + 0.15 * level)` (`player.js`)                                                                                            |
| Armor Plate            | incoming damage `* (1 - 0.1 * level)` (`enemies.js`)                                                                                       |
| Magnet                 | pickup range `50 + 20 * level` (`leveling.js`)                                                                                             |
| Cooldown               | shorter weapon cooldowns (`getWeaponCooldown`)                                                                                             |
| Rapid Fire / Overclock | attack speed multiplier (`rapidFireMultiplier`)                                                                                            |
| Regen                  | `+level` HP/s (`player.js`)                                                                                                                |
| Thorns                 | reflect damage on hit (`enemies.js`)                                                                                                       |
| **Might**              | `mightOnlyMultiplier`: +20% weapon damage per level on projectile creation, orbiter/lightning/laser/bomb scaling (`weapon-damage.js`).     |
| **Giant Killer**       | vs enemies with `r >= 32`: extra multiplier on weapon hits (`giantKillerMultiplier`). Projectiles carry Might at spawn; GK applied on hit. |


---

## Player progression (`js/leveling.js`)

- **XP to next level:** `xpToNext = floor(level * 14 + 12)` after each level-up.
- **Weapon slots:** start 1; `maxWeaponSlotsUnlocked = min(6, 1 + floor(gameTime / 120))` — extra slot every **120s** up to 6.
- **Level-up cards:** mix of new weapon, weapon upgrade (if level < 6), and passives; `generateChoices` logic with random weights.
- **Rapid Fire → Overclock:** at Rapid Fire level ≥ 5, passive slot can swap to Overclock (`tryEvolvePassive`).

---

## Related docs

- `.research/DESIGN_WORLD_LOOT_AND_VS_ALIGNMENT.md` — world pickups, boss loot, VS alignment notes (not full combat tables).

---

## Implementation checklist

- `enemyPool` + `visualSet` + `migrantWaves` in map JSON / loader / `applyPlayfieldForRun`
- Map editor: **Spawns & visuals** (`map-editor.html` + `editor-app.js`)
- Evolution weapon defs + cooldowns + timers + desc lookup
- Might + Giant Killer via `weapon-damage.js`
- Laser damage in `updateLaserBeamSim` (60 Hz sim)

Optional next steps: Vampire / Eraser / Treasure Sense combat hooks; boss elite variants.