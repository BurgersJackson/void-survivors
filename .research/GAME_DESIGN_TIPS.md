# Vampire Survivors — Game Design Reference
# Compiled from wiki for game development purposes

## 📁 FILES IN THIS DIRECTORY

| File | Contents |
|------|----------|
| `Enemies.csv` | All 170+ enemies with HP, Power, Speed, XP, resistance, stage/spawn data |
| `Weapons.csv` | All weapons with base damage, cooldown, pierce, pool limits, unlock conditions |
| `Passive_Items.csv` | Passive items with stat effects and stage drop locations |
| `Evolutions.csv` | Weapon → Evolution pairs with required passive and unlock method |
| `Arcanas.csv` | All 22 Arcanas + 12 Darkanas with gameplay modifiers |
| `Relics.csv` | All relics (permanent unlocks) with effects and locations |
| `Stages.csv` | All stages with enemy pools, time limits, coffin characters |
| `PowerUps.csv` | In-game pickup items that boost stats temporarily |
| `Pickups.csv` | All dropped/temp pickup items including gold and food |
| `GAME_DESIGN_TIPS.md` | This file — key takeaways for your own game |

---

## 🎮 CORE GAME LOOP

1. **Move** — WASD/joystick to navigate
2. **Auto-Attack** — Weapons fire automatically (no aiming required)
3. **Collect XP Gems** — Enemies drop colored gems on death
4. **Level Up** — Choose 1 of 3 random weapons/passives
5. **Evolve** — Collect matching passives to evolve weapons
6. **Survive** — Beat the timer (usually 30:00)

---

## ⚔️ WEAPON SYSTEM

### Base Stats (per weapon)
- **Base Damage** — Starting damage per hit
- **Max Level** — 1-12 (evolved weapons can go higher)
- **Cooldown** — Seconds between activations
- **Pierce** — How many enemies projectile passes through
- **Projectile Pool** — Max simultaneous projectiles

### Stat Scaling
Weapons have **6 upgradeable stats** per level:
- Damage, Area, Duration, Speed, Amount, Cooldown

### Evolution System
- Weapons evolve at **Level 5+** (some Level 7)
- Must hold the **Required Passive** to trigger evolution
- Evolution transforms weapon into new form with different behavior
- ~70 weapon pairs in game

### Weapons DON'T auto-target — they fire in:
- Faced direction (most common)
- Nearest enemy (Magic Wand, etc.)
- Orbit around player (King Bible)
- Fixed patterns (Phiera/Eight Sparrow = 4 directions)
- Zone-based (Garlic, Santa Water)
- Random/bouncing (Cherry Bomb, Bone)

---

## 🛡️ PASSIVE ITEMS

Passive items are chosen at level-up and provide **stat bonuses**.

### Key Stats They Affect
| Stat | Effect |
|------|--------|
| Might | +10% damage per level |
| Max Health | +10 HP per level |
| Armor | Reduces incoming damage |
| Speed | Movement velocity |
| Cooldown | Faster weapon cycling |
| Amount | More projectiles |
| Area | Larger weapon zones |
| Duration | Longer weapon effects |
| Projectile Speed | Faster bullets |
| Luck | Better drops, proc rates |
| Greed | More gold |
| Curse | More enemies + enemy HP/speed |
| Recovery | HP regeneration |
| Magnet | Pickup attraction radius |
| Growth | Better XP gems |

### Stage-Only Passives (found as pickups)
- Spinach, Hollow Heart, Pummarola, Clover, Skull O'Maniac
- Stone Mask, Empty Tome, Attractorb, Candelabrador, Wings
- Armor, Bracer, Spellbinder, Duplicator, Crown, Tirajisú

### Hidden Passives (unlocked via Yellow Sign relic)
- Silver Ring, Gold Ring, Metaglio Left, Metaglio Right
- Torrona's Box (special — all stats)

---

## 👾 ENEMY SYSTEM

### Enemy Properties
- **HP** — Health points (scales with time/curse)
- **Power** — Damage dealt on contact
- **Speed** — Movement velocity (100 = baseline)
- **XP** — Experience gems dropped on death
- **KB (Knockback)** — Knockback resistance
- **Resistances** — Freeze, Knockback, Damage, Damage Fraction

### Enemy Scaling
- Enemy HP and damage increase over time (Curse stat)
- More enemies spawn as time progresses
- Different enemy types appear at different minutes

### Enemy Categories
1. **Normal** — Regular enemies, scale with time
2. **Boss** — High HP, unique mechanics, big XP (e.g., Abraxas, Archdemon)
3. **Mini-Boss** — Mid-tier (e.g., Skeletone, 17th Collossus)
4. **Event** — Map events (Ghost Swarm, etc.)
5. **Special** — Summoned by bosses (The Directer's skeletons)

---

## 🗺️ STAGE DESIGN

### Structure
- **30-minute runs** (standard) — survive until timer ends
- **Boss rush modes** — 15 min, back-to-back bosses
- **Endless modes** — Infinite time (unlocked via Great Gospel)
- **5-stage endless** — Room 1665 → runs 5 stages continuously

### Stage Selection
- Milky Way Map relic enables stage selection
- Each stage has unique enemy pool
- Coffin characters found in stage-specific coffins

---

## 🎁 ARCANAS (Modifiers)

Arcanas are **pick-one modifiers** that change gameplay:
- Enable in stage select, choose at run start
- 3 slots per run (can exceed via special methods)
- Boss at 11:00 and 21:00 drops Arcana Chest

### Categories
- **Offensive** — Damage boosts, explosions, poison, crits
- **Defensive** — HP regen, revive, armor
- **Economic** — Gold bonuses, pickup radius
- **Scaling** — Effects that grow over time/minutes
- **Utility** — Clone, freeze, cooldowns

### Darkanas
- Same mechanics, stronger effects
- Unlocked by Darkasso relic (Room 1665)

---

## 🏆 PROGRESSION SYSTEM

### Unlocks
1. **Characters** — Coffin (stage-specific), achievements, enemy kill counts
2. **Weapons** — Start with 5, rest unlocked via survival time
3. **Stages** — Via relics (Milky Way Map, etc.)
4. **Relics** — Light source pickups, one-time collection
5. **Arcanas** — Level 50 with characters, minute 31 in stages
6. **Darkanas** — Darkasso + character level 50

### Collection Menu
- All unlocked items visible in permanent collection
- Tracks statistics: kills, damage, time played

---

## 💡 GAME DESIGN LESSONS

### What Makes Vampire Survivors Addictive
1. **Zero-input combat** — No aiming, just movement
2. **Build crafting** — 80+ weapons × 20+ passives = huge variety
3. **Power curve** — Start weak, feel godlike by end
4. **Evolution dopamine** — Visual transformation at level 5
5. **Risk/reward** — High curse = more enemies = more XP, but harder
6. **Auto-progression** — Kill counter, time survived, collection %
7. **One-more-run** — 30 min runs are completable in one session

### Weapon Design Patterns
- **Primary weapons** — Auto-fire, face direction
- **Aura weapons** — Effect around player (Garlic, Laurel)
- **Bouncing weapons** — Ricochet off walls/enemies
- **Zone weapons** — Place damage zones (Santa Water)
- **Projectile weapons** — Travel and pierce
- **Retaliate weapons** — Damage when player is hit
- **Movement-synergy** — Stronger when moving (Vento Sacro, Shadow Pinion)

### Economy Design
- XP gems color-coded by value (green → red)
- Gold for shops/rerolls (not pay-to-win)
- Pickups provide meaningful decisions
- Reroll currency scarce early, plentiful late

### Difficulty Scaling
- Time-based scaling (enemy count + HP + damage)
- Stage-specific difficulty (Cappella Magna = hardest base stage)
- Boss patterns that demand movement
- Elite enemies (minotaur/mignotaur = tanky)
- Swarm events (Ghost Swarm = 70 ghosts at 13:01)

---

## 🔧 FOR YOUR OWN GAME

### Minimum Viable Copy
- 5-10 weapons with different behaviors
- 5-10 enemies with varied HP/speed/damage
- 5-10 passive items
- Evolution system (weapon + passive = new weapon)
- 3-5 stages
- 30-min run loop

### Differentiation Ideas
- Different theme (not vampire/gothic)
- Unique weapon mechanics (yours alone)
- Character-specific weapons/passives
- Endless mode from start
- Co-op multiplayer
- Daily runs with shared seed
- Build sharing/post-run summary
- No level-up choices (auto-choose) — or hyper-random
