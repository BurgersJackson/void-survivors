import { state } from './state.js';
import { WEAPONS, PASSIVES, PASSIVE_EVOL } from './constants.js';
import { spawnParticles } from './particles.js';
import { evolveWeapon, initWeaponTimer } from './weapons.js';
import { updateUI } from './ui.js';

/** Seconds between unlocking another weapon slot (after starter). 6th weapon no earlier than ~10 min. */
const WEAPON_SLOT_INTERVAL_SEC = 120;

function maxWeaponSlotsUnlocked(gameTimeSec) {
  return Math.min(6, 1 + Math.floor(gameTimeSec / WEAPON_SLOT_INTERVAL_SEC));
}

function canOfferNewWeapon(player) {
  return player.weapons.length < maxWeaponSlotsUnlocked(state.gameTime);
}

/** @param {Record<string, unknown>} [extra] Merged into orb (e.g. hintArrow, life). */
export function spawnXP(x, y, amount, extra = {}) {
  state.xpOrbs.push({ x, y, amount, life: 30, r: 3, vx: 0, vy: 0, ...extra });
}

/** @param {Record<string, unknown>} [extra] Merged into orb (e.g. hintArrow). */
export function spawnChest(x, y, extra = {}) {
  state.xpOrbs.push({
    x,
    y,
    amount: 50,
    life: 10,
    r: 20,
    vx: 0,
    vy: 0,
    chest: true,
    ...extra,
  });
}

export function collectXP(dt) {
  const player = state.player;
  const range = 50 + (player.passiveLevels['Magnet'] || 0) * 20;
  state.xpOrbs.forEach((o) => {
    const dx = player.x - o.x;
    const dy = player.y - o.y;
    const d = Math.hypot(dx, dy);
    if (d < range) {
      o.vx = (dx / d) * 300;
      o.vy = (dy / d) * 300;
    }
    if (d < 20) {
      player.xp += o.amount;
      spawnParticles(o.x, o.y, '#ffdd00', 5, 50, 0.3, 2);
      state.xpOrbs = state.xpOrbs.filter((x) => x !== o);
    }
  });
  const step = dt || 0.016;
  state.xpOrbs.forEach((o) => {
    o.x += o.vx * step;
    o.y += o.vy * step;
    o.vx *= 0.95;
    o.vy *= 0.95;
  });
}

export function checkLevelUp() {
  while (state.player.xp >= state.player.xpToNext) {
    state.player.xp -= state.player.xpToNext;
    state.player.level++;
    state.player.xpToNext = Math.floor(state.player.level * 14 + 12);
    showLevelUp();
  }
}

export function pickLevelUpChoice(index) {
  const choices = state.levelUpChoices;
  const c = choices[index];
  if (!c) return;
  const modal = document.getElementById('levelup-modal');
  selectChoice(c);
  if (modal) modal.style.display = 'none';
  state.gameState = 'playing';
}

export function showLevelUp() {
  state.gameState = 'levelup';
  const modal = document.getElementById('levelup-modal');
  const cards = document.getElementById('levelup-cards');
  cards.innerHTML = '';
  const choices = generateChoices();
  state.levelUpChoices = choices;
  choices.forEach((c, idx) => {
    const div = document.createElement('div');
    div.className = idx === 0 ? 'card card-focus' : 'card';
    div.innerHTML = `<div class="card-title">${c.name}</div><div class="card-desc">${c.desc}</div>`;
    div.onclick = () => pickLevelUpChoice(idx);
    cards.appendChild(div);
  });
  modal.style.display = 'flex';
}

function offersWeapon(choices, weaponName) {
  return choices.some((c) => c.type === 'weapon' && c.data === weaponName);
}

function offersPassive(choices, passiveName) {
  return choices.some((c) => c.type === 'passive' && c.data === passiveName);
}

export function generateChoices() {
  const player = state.player;
  const choices = [];
  const types = ['weapon', 'passive', 'upgrade'];
  const wtypes = ['new', 'upgrade'];
  if (Math.random() < 0.55 && player.weapons.length > 0) wtypes.push('upgrade');
  const wtype = wtypes[Math.floor(Math.random() * wtypes.length)];
  if (wtype === 'upgrade' && player.weapons.length > 0) {
    const w = player.weapons[Math.floor(Math.random() * player.weapons.length)];
    const lvl = (player.weaponLevels[w] || 0) + 1;
    if (lvl < 6 && !offersWeapon(choices, w)) {
      choices.push({
        type: 'weapon',
        name: `${w} Lv${lvl}`,
        desc: getWeaponDesc(w, lvl),
        data: w,
        action: 'upgrade',
      });
    }
  }
  if (canOfferNewWeapon(player)) {
    const avail = WEAPONS.filter((w) => !player.weapons.includes(w));
    if (avail.length > 0) {
      const w = avail[Math.floor(Math.random() * avail.length)];
      if (!offersWeapon(choices, w)) {
        choices.push({
          type: 'weapon',
          name: w,
          desc: getWeaponDesc(w, 1),
          data: w,
          action: 'new',
        });
      }
    }
  }
  const p =
    player.passives.length < PASSIVES.length
      ? PASSIVES.filter((x) => !player.passives.includes(x))[
          Math.floor(Math.random() * (PASSIVES.length - player.passives.length))
        ]
      : PASSIVES[Math.floor(Math.random() * PASSIVES.length)];
  const pl = player.passiveLevels[p] || 0;
  if (!offersPassive(choices, p)) {
    choices.push({
      type: 'passive',
      name: pl > 0 ? `${p} Lv${pl}` : p,
      desc: getPassiveDesc(p, pl),
      data: p,
      action: pl > 0 ? 'stack' : 'new',
    });
  }
  let fillAttempts = 0;
  while (choices.length < 3 && fillAttempts < 120) {
    fillAttempts++;
    const t = types[Math.floor(Math.random() * types.length)];
    if (t === 'weapon' && canOfferNewWeapon(player)) {
      const avail = WEAPONS.filter(
        (w) => !player.weapons.includes(w) && !offersWeapon(choices, w),
      );
      if (avail.length > 0) {
        const w = avail[Math.floor(Math.random() * avail.length)];
        choices.push({
          type: 'weapon',
          name: w,
          desc: getWeaponDesc(w, 1),
          data: w,
          action: 'new',
        });
      }
    } else if (t === 'passive') {
      const availP = PASSIVES.filter((p2) => !offersPassive(choices, p2));
      if (availP.length > 0) {
        const p2 = availP[Math.floor(Math.random() * availP.length)];
        const pl2 = player.passiveLevels[p2] || 0;
        choices.push({
          type: 'passive',
          name: pl2 > 0 ? `${p2} Lv${pl2}` : p2,
          desc: getPassiveDesc(p2, pl2),
          data: p2,
          action: pl2 > 0 ? 'stack' : 'new',
        });
      }
    } else if (t === 'upgrade' && player.weapons.length > 0) {
      const upgradable = player.weapons.filter((w) => {
        const lvl = (player.weaponLevels[w] || 0) + 1;
        return lvl < 6 && !offersWeapon(choices, w);
      });
      if (upgradable.length > 0) {
        const w = upgradable[Math.floor(Math.random() * upgradable.length)];
        const lvl = (player.weaponLevels[w] || 0) + 1;
        choices.push({
          type: 'weapon',
          name: `${w} Lv${lvl}`,
          desc: getWeaponDesc(w, lvl),
          data: w,
          action: 'upgrade',
        });
      }
    }
  }
  return choices.slice(0, 3);
}

export function selectChoice(c) {
  spawnParticles(state.player.x, state.player.y, '#00f5ff', 20, 150, 0.8, 4);
  if (c.type === 'weapon') {
    if (c.action === 'new') {
      state.player.weapons.push(c.data);
      state.player.weaponLevels[c.data] = 1;
      initWeaponTimer(c.data);
    } else {
      state.player.weaponLevels[c.data]++;
    }
    checkEvolution(c.data);
  } else if (c.action === 'new') {
    state.player.passives.push(c.data);
    state.player.passiveLevels[c.data] = 1;
  } else {
    state.player.passiveLevels[c.data]++;
  }
  tryEvolvePassive(c.data);
  updateUI();
}

function tryEvolvePassive(p) {
  if (p !== 'Rapid Fire') return;
  const evo = PASSIVE_EVOL['Rapid Fire'];
  if (!evo) return;
  const pl = state.player;
  if ((pl.passiveLevels[p] || 0) < 5) return;
  if (!pl.passives.includes(p) || pl.passives.includes(evo)) return;
  const idx = pl.passives.indexOf(p);
  if (idx < 0) return;
  pl.passives[idx] = evo;
  pl.passiveLevels[evo] = pl.passiveLevels[p] || 5;
  delete pl.passiveLevels[p];
  spawnParticles(state.player.x, state.player.y, '#ffdd00', 35, 160, 1, 4);
  state.screenShake = 0.25;
}

export function checkEvolution(w) {
  const evo = evolveWeapon(w);
  if (state.player.weaponLevels[w] >= 5) {
    const matchPassives = {
      'Magic Wand': 'Cooldown',
      'Spread Shot': 'Might',
      Orbiter: 'Swift Boots',
      Lightning: 'Cooldown',
      'Homing Missiles': 'Swift Boots',
      'Laser Beam': 'Might',
      Bomb: 'Regen',
    };
    const mp = matchPassives[w];
    if (mp && state.player.passives.includes(mp)) {
      const idx = state.player.weapons.indexOf(w);
      state.player.weapons[idx] = evo;
      state.player.weaponLevels[evo] = state.player.weaponLevels[w] || 0;
      delete state.player.weaponLevels[w];
      if (state.weaponTimers[w] !== undefined) {
        state.weaponTimers[evo] = state.weaponTimers[w];
        delete state.weaponTimers[w];
      } else {
        initWeaponTimer(evo);
      }
      spawnParticles(state.player.x, state.player.y, '#ffdd00', 50, 200, 1.5, 6);
      state.screenShake = 0.5;
      spawnChest(state.player.x, state.player.y);
    }
  }
}

function weaponDescBaseName(name) {
  for (const w of WEAPONS) {
    if (evolveWeapon(w) === name) return w;
  }
  return name;
}

export function getWeaponDesc(name, lvl) {
  const key = weaponDescBaseName(name);
  const descs = {
    'Magic Wand': ['8 dmg → nearest', '10 dmg', '12 dmg', '14 dmg', '16 dmg', 'Arcane Blast → EVOLVE'],
    'Spread Shot': ['3 bullets', '4 bullets', '5 bullets', '+1 bullet', 'wider spread', '+damage → EVOLVE'],
    Orbiter: ['1 orb', '2 orbs', '3 orbs', '+orbit radius', '4 orbs', '+damage → EVOLVE'],
    Lightning: ['1 chain', '2 chains', 'longer chain', '+damage', '3 chains', '+stun → EVOLVE'],
    'Homing Missiles': ['1 missile', '2 missiles', 'faster reload', '+damage', '3 missiles', 'seeking range → EVOLVE'],
    'Laser Beam': ['thin beam', 'wider beam', '+damage', '+range', 'piercing', '+burn DOT → EVOLVE'],
    Bomb: ['1 bomb', '2 bombs', 'bigger radius', '+damage', 'shorter fuse', 'cluster → EVOLVE'],
  };
  return descs[key] ? descs[key][lvl - 1] : 'Unknown';
}

export function getPassiveDesc(name, lvl) {
  const descs = {
    'Swift Boots': '+15% move speed',
    'Armor Plate': '-10% damage taken',
    Magnet: '+30% XP pickup radius',
    Might: '+20% weapon damage',
    Cooldown: '-10% weapon cooldown',
    'Rapid Fire': '+12% weapon attack speed per level',
    Overclock: '+10% weapon attack speed per level (evolved)',
    Regen: '+1 HP/sec',
    Thorns: 'Attackers take damage',
    'Treasure Sense': 'Find chests',
    'Giant Killer': 'Bonus to big enemies',
    Eraser: 'Chance to reset cooldowns',
    Vampire: 'Lifesteal on hit',
  };
  return descs[name] || 'Unknown';
}
