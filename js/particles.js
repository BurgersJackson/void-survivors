import { state } from './state.js';

export function spawnParticles(x, y, color, count = 10, speed = 100, life = 0.5, size = 3) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = speed * (0.5 + Math.random() * 0.5);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life,
      maxLife: life,
      color,
      size,
    });
  }
}

export function spawnTrail(x, y, color, size = 2) {
  state.particles.push({
    x,
    y,
    vx: 0,
    vy: 0,
    life: 0.2,
    maxLife: 0.2,
    color,
    size,
    trail: true,
  });
}

export function updateParticles(dt) {
  state.particles.forEach((p) => {
    p.life -= dt;
    if (!p.trail) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
    } else {
      p.size *= 0.9;
    }
  });
  state.particles = state.particles.filter((p) => p.life > 0);
}
