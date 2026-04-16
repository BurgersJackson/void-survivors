# Void Survivors

Single-file HTML game (index.html). No build step required.

## Running the Game

- **Do not open index.html directly** - browser security blocks features (localStorage, etc.) with `file://` URLs
- Use a local HTTP server: `npx serve .` or `python -m http.server 8080`
- Open `http://localhost:8080` (or appropriate port)

## Testing

- `test.mjs` uses Playwright for automated testing
- Run tests with `node test.mjs`

## Code Conventions

- All game code in a single `<script>` block within `index.html`
- CSS in `<style>` block at top, HTML structure follows
- Game state uses simple global variables (enemies, projectiles, player, etc.)
- Weapon definitions in `WEAPON_DEFS` object, enemy types in `ENEMY_TYPES` object

## Weapon/Enemy Arrays

When adding weapons/enemies, update BOTH:
- The definitions object (WEAPON_DEFS, ENEMY_TYPES)
- Related arrays: WEAPONS[], PASSIVES[], evolutions, descriptions, cooldowns, matchPassives

## Common Fixes Applied

- **UI pointer-events**: `#ui` has `pointer-events:none`; modals (start-screen, pause-menu, etc.) must explicitly set `pointer-events:all`
- **Math.PI2 bug**: Use `Math.PI*2`, not `Math.PI2`
- **Orbiter weapon**: Use `r.x/r.y` (player ref parameter), not `player.x/player.y` for consistency
- **Homing missiles**: Must have manual collision detection in update loop (not filtered out like regular projectiles)
- **Laser beam**: Applies damage continuously while active, not just once on fire
- **Enemy spreading**: Uses separate collision push-apart loop after movement, no stun/lock
