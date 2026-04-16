import { state } from './state.js';

/** Might: +20% weapon damage per level (UI copy). */
export function mightOnlyMultiplier(player) {
  if (!player || !player.passives.includes('Might')) return 1;
  return 1 + (player.passiveLevels['Might'] || 0) * 0.2;
}

/** Giant Killer: extra damage vs large enemies (radius ≥ 32). */
export function giantKillerMultiplier(player, enemy) {
  if (!player || !enemy || !player.passives.includes('Giant Killer')) return 1;
  if (enemy.r < 32) return 1;
  return 1 + (player.passiveLevels['Giant Killer'] || 0) * 0.12;
}

/** Full multiplier for a weapon hit (Might × Giant Killer when applicable). */
export function weaponDamageMultiplier(player, enemy) {
  return mightOnlyMultiplier(player) * giantKillerMultiplier(player, enemy);
}
