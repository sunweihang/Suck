import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = path.resolve('d:/Custom/Suck/tmp-filing/备案截图-新');
const URL = 'http://127.0.0.1:7456/';
const DW = 1080;
const DH = 1920;

fs.mkdirSync(OUT, { recursive: true });

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

  const box = await canvas.boundingBox();
  const tap = async (x, y, label) => {
    console.log(label, x, y);
    await page.mouse.click(box.x + (x / DW) * box.width, box.y + (y / DH) * box.height);
  };
  const drag = async (x1, y1, x2, y2, steps = 18) => {
    await page.mouse.move(box.x + (x1 / DW) * box.width, box.y + (y1 / DH) * box.height);
    await page.mouse.down();
    await page.mouse.move(box.x + (x2 / DW) * box.width, box.y + (y2 / DH) * box.height, { steps });
    await page.mouse.up();
  };
  const key = async (k) => {
    await canvas.click({ position: { x: 24, y: 24 }, force: true });
    await page.keyboard.press(k);
  };
  const shot = async (name) => {
    const file = path.join(OUT, `${name}.jpg`);
    await canvas.screenshot({ path: file, type: 'jpeg', quality: 90 });
    console.log('saved', name, `${(fs.statSync(file).size / 1024).toFixed(0)}kb`);
  };

  await shot('场景-01-主界面');

  await tap(540, 1736, 'play');
  await page.waitForTimeout(4000);
  await shot('玩法-01-对局消除');

  await tap(110, 110, 'settings');
  await page.waitForTimeout(1200);
  await shot('场景-02-设置');
  await tap(880, 535, 'settings-close');
  await page.waitForTimeout(700);

  await key('KeyC');
  await page.waitForTimeout(1400);
  await shot('场景-04-失败');

  await key('KeyG');
  await page.waitForTimeout(5000);
  await drag(700, 860, 280, 980);
  await page.waitForTimeout(800);
  await shot('玩法-03-特殊关卡');

  await tap(237, 1790, 'item-plus');
  await page.waitForTimeout(1200);
  await shot('玩法-02-道具获取');
  await tap(880, 430, 'shop-close');
  await page.waitForTimeout(600);

  await key('KeyV');
  await page.waitForTimeout(1400);
  await shot('场景-03-胜利');

  await key('KeyR');
  await page.waitForTimeout(2500);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
