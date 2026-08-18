import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = path.resolve('d:/Custom/Suck/tmp-filing');
const URL = 'http://127.0.0.1:7456/';
const DW = 1080;
const DH = 1920;

fs.mkdirSync(OUT, { recursive: true });

function map(box, x, y) {
  return {
    x: box.x + (x / DW) * box.width,
    y: box.y + (y / DH) * box.height,
  };
}

async function shot(canvas, name) {
  const file = path.join(OUT, `${name}.jpg`);
  await canvas.screenshot({ path: file, type: 'jpeg', quality: 90 });
  console.log(`saved ${name} ${(fs.statSync(file).size / 1024).toFixed(0)}kb`);
}

async function tap(page, canvas, x, y, label) {
  const box = await canvas.boundingBox();
  const p = map(box, x, y);
  console.log(`${label} (${x},${y})`);
  await page.mouse.click(p.x, p.y);
}

async function drag(page, canvas, x1, y1, x2, y2) {
  const box = await canvas.boundingBox();
  const a = map(box, x1, y1);
  const b = map(box, x2, y2);
  console.log(`drag (${x1},${y1}) -> (${x2},${y2})`);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 16 });
  await page.waitForTimeout(200);
  await page.mouse.up();
}

async function key(page, canvas, k) {
  await canvas.click({ position: { x: 20, y: 20 }, force: true });
  await page.keyboard.press(k);
}

async function main() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[err]', msg.text());
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({
    content: `.toolbar, #bulletin, #error, #sceneIsEmpty { display: none !important; }
      #content { top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; }`,
  });
  const canvas = page.locator('#GameCanvas');
  await canvas.waitFor({ timeout: 30000 });
  await page.waitForTimeout(12000);

  await shot(canvas, 'scene-01-home');

  await tap(page, canvas, 540, 1736, 'play');
  await page.waitForTimeout(4000);
  await shot(canvas, 'scene-02-play');
  await shot(canvas, 'play-02-items');

  await tap(page, canvas, 110, 110, 'settings');
  await page.waitForTimeout(1200);
  await shot(canvas, 'scene-03-settings');
  await tap(page, canvas, 880, 535, 'settings-close');
  await page.waitForTimeout(800);

  // Tutorial unit is the left yellow cube above the item tray.
  await drag(page, canvas, 430, 1480, 400, 1180);
  await page.waitForTimeout(2500);
  await shot(canvas, 'play-01-absorb');

  await key(page, canvas, 'KeyC');
  await page.waitForTimeout(1500);
  await shot(canvas, 'scene-04-fail');

  await key(page, canvas, 'KeyG');
  await page.waitForTimeout(5000);
  await shot(canvas, 'play-03-bomb');

  await key(page, canvas, 'KeyH');
  await page.waitForTimeout(5000);
  await shot(canvas, 'play-03-chest');

  await key(page, canvas, 'KeyV');
  await page.waitForTimeout(1500);
  await shot(canvas, 'scene-04-victory');

  await key(page, canvas, 'KeyR');
  await page.waitForTimeout(2500);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
