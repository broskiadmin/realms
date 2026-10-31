// Headless screenshot of the running game, for checking visuals without a human.
// Usage: node scripts/shot.mjs <out.png> [quality=realistic] [worldTime=60] [x,y,z,yaw] [waitMs=12000] [lineup]
// "lineup" parks one cow, pig and chicken (side-on) a few metres in front of the camera.
// Uses the Chromium in .browsers/ (install: PLAYWRIGHT_BROWSERS_PATH=.browsers npx playwright-core install chromium).
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH = `${root}.browsers`;
const { chromium } = await import('playwright-core');

const [out = `${root}.shots/shot.png`, quality = 'realistic', worldTime = '60', pose = '', wait = '12000', extra = ''] = process.argv.slice(2);
const [x, y, z, yaw] = pose ? pose.split(',').map(Number) : [0, 1.2, 4, 0];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});

await page.goto('http://127.0.0.1:3001/app/realms/');
await page.evaluate(
  ([q, t, px, py, pz, pyaw]) => {
    localStorage.clear();
    localStorage.setItem('realms-quality', q);
    localStorage.setItem('realms-chat-seen', String(Date.now() + 1e12));
    localStorage.setItem(
      'realms-save-v1',
      JSON.stringify({ state: { worldTime: t, discovered: [0, 1, 2, 3, 4, 5], player: { x: px, y: py, z: pz, yaw: pyaw } }, version: 0 }),
    );
  },
  [quality, Number(worldTime), x, y, z, yaw],
);
await page.reload();
await page.waitForTimeout(Number(wait));
await page.evaluate(() => document.querySelector('.menu')?.classList.add('menu--hidden'));
if (extra === 'hostiles') {
  // Freeze AI and park a Duskwolf, a Shardback and a winding-up Gloomwisp in front of the camera.
  await page.evaluate(() => {
    const r = window.__realms;
    r.debug.freezeHostiles = true;
    const p = r.player.pos;
    const yaw = r.player.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const place = (o, side, dist) => {
      o.x = p.x + fx * dist - fz * side;
      o.z = p.z + fz * dist + fx * side;
    };
    const wolf = r.PREDATORS.find((q) => q.kind === 'duskwolf');
    const shard = r.PREDATORS.find((q) => q.kind === 'shardback');
    for (const [o, side, dist] of [[wolf, -1.8, 4], [shard, 1.6, 5.5]]) {
      Object.assign(o, { alive: true, presence: 1, state: 'chase', hp: 4, strike: -1, y: p.y });
      place(o, side, dist);
      o.heading = yaw + Math.PI * 0.75;
    }
    const w = r.WISPS[0];
    Object.assign(w, { alive: true, fading: 0, charge: 0.7, hp: 3 });
    w.pos.set(p.x + fx * 3.2 + fz * 0.2, p.y + 1.9, p.z + fz * 3.2 - fx * 0.2);
  });
  await page.waitForTimeout(2500);
}
if (extra === 'lineup') {
  await page.evaluate(() => {
    const r = window.__realms;
    const p = r.player.pos;
    const yaw = r.player.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    // Side-on, spaced across the view, ~4.5 m ahead.
    [['cow', -2.2], ['pig', 0.6], ['chicken', 2.4]].forEach(([type, side]) => {
      const m = r.MOBS.find((mm) => mm.type === type && !mm.dead);
      if (!m) return;
      m.island = 0;
      m.x = p.x + fx * 4.5 - fz * side;
      m.z = p.z + fz * 4.5 + fx * side;
      m.heading = yaw + Math.PI / 2;
      m.state = 'idle';
      m.timer = 999;
    });
  });
}
await page.waitForTimeout(1500);
// Software rendering (SwiftShader) can take a long time per frame in Realistic mode.
await page.screenshot({ path: out, timeout: 120000 });
const info = await page.evaluate(() => {
  const r = window.__realms?.gl?.info?.render;
  return r ? `draw calls ${r.calls}, triangles ${(r.triangles / 1e6).toFixed(2)}M` : 'renderer stats unavailable';
});
console.log(info);
console.log(errors.slice(0, 15).join('\n') || 'no console errors');
await browser.close();
