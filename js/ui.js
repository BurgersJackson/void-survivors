import { state } from './state.js';

export function updateUI() {
  const player = state.player;
  document.getElementById('hpBar').style.width = `${(player.hp / player.maxHp) * 100}%`;
  document.getElementById('hpText').textContent = String(Math.ceil(player.hp));
  document.getElementById('xpBar').style.width = `${(player.xp / player.xpToNext) * 100}%`;
  document.getElementById('levelText').textContent = `LV ${player.level}`;
  document.getElementById('scoreText').textContent = `SCORE: ${state.score}`;
  document.getElementById('timeText').textContent = `${Math.floor(state.gameTime / 60)}:${String(Math.floor(state.gameTime % 60)).padStart(2, '0')}`;

  const wslots = document.getElementById('weapon-slots');
  wslots.innerHTML = '';
  player.weapons.forEach((w, i) => {
    const div = document.createElement('div');
    div.className = `wslot${i === player.selectedWeapon ? ' active' : ''}`;
    const lvl = player.weaponLevels[w] || 1;
    div.innerHTML = `<span style="font-size:16px">${w[0]}</span><span class="level">${lvl}</span>`;
    wslots.appendChild(div);
  });

  const pslots = document.getElementById('passive-slots');
  pslots.innerHTML = '';
  player.passives.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'pslot';
    div.textContent = p[0];
    div.title = `${p} Lv${player.passiveLevels[p]}`;
    pslots.appendChild(div);
  });
}
