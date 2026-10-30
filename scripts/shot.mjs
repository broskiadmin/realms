// Headless screenshot of the running game, for checking visuals without a human.
// Usage: node scripts/shot.mjs <out.png> [quality=realistic] [worldTime=60] [x,y,z,yaw] [waitMs=12000]
// Uses the Chromium in .browsers/ (install: PLAYWRIGHT_BROWSERS_PATH=.browsers npx playwright-core install chromium).
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH = `${root}.browsers`;
const { chromium } = await import('playwright-core');

const [out = `${root}.shots/shot.png`, quality = 'realistic', worldTime = '60', pose = '', wait = '12000'] = process.argv.slice(2);
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
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
console.log(errors.slice(0, 15).join('\n') || 'no console errors');
await browser.close();
