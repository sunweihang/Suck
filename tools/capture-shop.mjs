import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = path.resolve('d:/Custom/Suck/tmp-filing');
const URL = 'http://127.0.0.1:7456/';

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
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({
    content: `.toolbar, #bulletin, #error, #sceneIsEmpty { display: none !important; }
      #content { top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; }`,
  });
  const canvas = page.locator('#GameCanvas');
  await canvas.waitFor();
  await page.waitForTimeout(8000);

  const box = await canvas.boundingBox();
  const tap = async (x, y) => {
    await page.mouse.click(box.x + (x / 1080) * box.width, box.y + (y / 1920) * box.height);
  };

  await tap(540, 1736);
  await page.waitForTimeout(2500);
  await canvas.click({ position: { x: 20, y: 20 }, force: true });
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(4500);
  await tap(237, 1790);
  await page.waitForTimeout(1200);
  await canvas.screenshot({ path: path.join(OUT, 'play-02-shop.jpg'), type: 'jpeg', quality: 90 });
  console.log('shop', (fs.statSync(path.join(OUT, 'play-02-shop.jpg')).size / 1024).toFixed(0) + 'kb');

  await canvas.click({ position: { x: 20, y: 20 }, force: true });
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(2000);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
