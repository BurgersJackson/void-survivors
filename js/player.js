import { state } from './state.js';
import { readInput } from './input.js';
import { collectXP } from './leveling.js';
import {
  resolveCircleMove,
  separateCircleFromObstacles,
  clampXYToMapBounds,
} from './map-obstacles.js';

export function updatePlayer(dt) {
  const player = state.player;
  const input = readInput();
  state.inputMoveMag = input.moveMag;
  const prevX = player.x;
  const prevY = player.y;
  let spd = player.speed;
  if (player.passives.includes('Swift Boots')) {
    spd *= 1 + player.passiveLevels['Swift Boots'] * 0.15;
  }
  if (input.turbo) spd *= 1.5;
  const nx = player.x + input.dx * spd * dt;
  const ny = player.y + input.dy * spd * dt;
  const moved = resolveCircleMove(player.x, player.y, nx, ny, player.r, state.obstacles);
  const cleared = separateCircleFromObstacles(moved.x, moved.y, player.r, state.obstacles);
  const bounded = clampXYToMapBounds(cleared.x, cleared.y, player.r);
  player.x = bounded.x;
  player.y = bounded.y;
  const mdx = player.x - prevX;
  const mdy = player.y - prevY;
  if (Math.hypot(mdx, mdy) > 0.2) {
    player.lastMoveAngle = Math.atan2(mdy, mdx);
  } else if (input.dx || input.dy) {
    player.lastMoveAngle = Math.atan2(input.dy, input.dx);
  }
  player.targetX = input.dx || 1;
  player.targetY = input.dy || 0;
  if (player.invTimer > 0) player.invTimer -= dt;
  if (player.passives.includes('Regen')) {
    player.hp = Math.min(player.maxHp, player.hp + player.passiveLevels['Regen'] * dt);
  }
  collectXP(dt);
}
