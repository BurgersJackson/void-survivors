import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = `file://${path.join(__dirname, 'index.html')}`;

async function test() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(filePath);
  await page.waitForTimeout(500);

  // Start game directly via JS
  await page.evaluate(() => startGame());
  await page.waitForTimeout(500);

  // Manually trigger weapon fire and check
  const debugInfo = await page.evaluate(() => {
    // Force fire the weapon
    const w = 'Spread Shot';
    const def = WEAPON_DEFS[w];
    const lvl = player.weaponLevels[w] || 1;
    
    // Get initial state
    const initial = {
      projectiles: projectiles.length,
      enemies: enemies.length,
      playerPos: { x: player.x, y: player.y }
    };
    
    // Fire the weapon
    def.fire(lvl, player);
    
    const afterFire = {
      projectiles: projectiles.length,
      projectilesDetail: projectiles.map(p => ({
        x: p.x, y: p.y,
        vx: p.vx, vy: p.vy,
        enemy: p.enemy,
        playerDamage: p.playerDamage,
        homing: p.homing,
        bomb: p.bomb,
        life: p.life
      }))
    };
    
    return { initial, afterFire };
  });
  console.log('After weapon fire:', JSON.stringify(debugInfo, null, 2));

  // Wait a bit for projectiles to move
  await page.waitForTimeout(1000);

  const afterWait = await page.evaluate(() => {
    return {
      projectiles: projectiles.length,
      enemies: enemies.length,
      kills: kills,
      xp: player.xp,
      projectileDetails: projectiles.map(p => ({
        x: p.x.toFixed(0), y: p.y.toFixed(0),
        vx: p.vx.toFixed(0), vy: p.vy.toFixed(0)
      })),
      enemyDetails: enemies.map(e => ({
        x: e.x.toFixed(0), y: e.y.toFixed(0),
        hp: e.hp.toFixed(2)
      }))
    };
  });
  console.log('After 1s wait:', JSON.stringify(afterWait, null, 2));

  // Test collision manually
  const collisionTest = await page.evaluate(() => {
    if (projectiles.length === 0 || enemies.length === 0) return 'No projectiles or enemies';
    
    const p = projectiles[0];
    const e = enemies[0];
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    const collisionThreshold = e.r + p.r;
    
    return {
      projectilePos: { x: p.x, y: p.y },
      enemyPos: { x: e.x, y: e.y },
      distance: d,
      threshold: collisionThreshold,
      wouldCollide: d < collisionThreshold
    };
  });
  console.log('Collision test:', JSON.stringify(collisionTest, null, 2));

  // Test running updateProjectiles manually
  const manualUpdate = await page.evaluate(() => {
    const projBefore = projectiles.length;
    const enemyHpBefore = enemies.length > 0 ? enemies[0].hp : null;
    
    // Manually call updateProjectiles logic
    const enemyProjs = projectiles.filter(p => p.enemy && !p.playerDamage && !p.homing && !p.bomb);
    let hits = 0;
    enemyProjs.forEach(p => {
      let hit = false;
      enemies.forEach(e => {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < e.r + p.r) {
          e.hp -= p.dmg;
          hit = true;
          hits++;
        }
      });
      if (hit) p.life = 0;
    });
    
    const enemyHpAfter = enemies.length > 0 ? enemies[0].hp : null;
    
    return { 
      projBefore, 
      enemyProjsFound: enemyProjs.length, 
      hits,
      enemyHpBefore, 
      enemyHpAfter,
      enemiesKilled: enemies.filter(e => e.hp <= 0).length
    };
  });
  console.log('Manual update test:', JSON.stringify(manualUpdate, null, 2));

  console.log('\nConsole errors:', errors.length ? errors : 'None');

  await browser.close();
}

test().catch(console.error);