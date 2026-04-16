# Design pass: world loot, boss drops, edge arrows — VS alignment

## Goals (Vampire Survivors–style)

1. **Authored map loot** — Designers place chests / large gems in the level editor; at run start they spawn as real pickups with **edge arrows** when off-screen so players “chase the blink” like VS rosaries / floor pickups.
2. **Boss loot** — Boss kills drop **multiple** hinted pickups (big XP + chest + bonus gem) instead of a single invisible reward.
3. **Keep Void’s identity** — Same neon aesthetic, auto-combat, tilemaps, 30‑minute survival loop; systems extend what you have rather than cloning VS wholesale.

---

## Implemented (this pass)


| Feature                              | Behavior                                                                                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**placements` in `maps/mapN.json`** | Array of `{ "kind": "chest" | "gem", "x", "y" }`. Parsed in `parseSingleStageMapFile`, stored on catalog entries, spawned in `spawnMapPlacementsFromCatalog()` after `applyPlayfieldForRun`. |
| **Editor**                           | Mode **“World items (loot)”**: place chest or large XP gem; exported as `placements`; import reloads them on tilemaps.                                                                       |
| **Hints**                            | Orbs with `hintArrow: true` get **screen-edge arrows** (max 7, nearest first) in `drawOffScreenPickupHints()` — yellow for chests, cyan for gems.                                            |
| **Boss**                             | `dropBossLoot()` — large XP + offset chest + bonus gem, all hinted.                                                                                                                          |


---

## Suggested next steps (closer to VS)

### Economy & pickups

- **Gold** as a separate pickup (for future shop / reroll). See `.research/Pickups.csv` / in-game gold patterns.
- **Food / floor chicken** — heal pickup with authored positions or rare enemy drops.
- **Chest “open” moment** — today chests grant XP; later: roll **weapon upgrade / passive / gold** from a table (VS-style three-choice or instant reward).

### Level-up vs world loot

- **Level-up screen** = build crafting (already tuned with time-gated weapons).
- **World loot** = exploration reward; avoid duplicating level-up choices in chests until mid/late run (use **gold** + **small stats** early).

### Arrows & UX

- **Priority**: boss drops > map chest > large gem (sort key on `bossDrop` / `mapPlaced`).
- **Clamp count** (currently 7) to avoid UI noise in huge maps.
- **Minimap** pips for hinted pickups (optional).

### Editor

- **Validation**: warn if placement inside spawn safety circle (220 px).
- **Kinds**: later add `relic`, `floor_chicken`, `gold_bag` as you add systems.

### Technical

- **Single source of truth** — Pickups are `state.xpOrbs[]` entries with flags (`hintArrow`, `chest`, `bossDrop`, `mapPlaced`). Alternative later: `state.worldPickups[]` with a render/ collect pass if orbs get too many special cases.

---

## References in repo

- `.research/GAME_DESIGN_TIPS.md` — core loop, economy, arcana ideas.
- `.research/vampire_survivors_data.json` — weapon/passive baseline numbers (for future balance).
- `js/world-pickups.js` — map spawn + boss loot entry points.