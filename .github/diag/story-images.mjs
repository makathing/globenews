// Temporary: load the live site like a phone and report every image request.
import { chromium, webkit, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = 'https://makathing.github.io/globenews/';
mkdirSync('diag-out', { recursive: true });
const summary = [];

for (const [name, engine, device] of [
  ['iphone-webkit', webkit, devices['iPhone 14']],
  ['android-chrome', chromium, devices['Pixel 7']],
]) {
  const browser = await engine.launch();
  const context = await browser.newContext({ ...device });
  const page = await context.newPage();
  const images = [];
  page.on('requestfinished', async (req) => {
    if (req.resourceType() !== 'image') return;
    const res = await req.response();
    images.push({ url: req.url(), status: res?.status(), type: res?.headers()['content-type'] });
  });
  page.on('requestfailed', (req) => {
    if (req.resourceType() !== 'image') return;
    images.push({ url: req.url(), status: 'FAILED', error: req.failure()?.errorText });
  });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  // open the story list (drawer on phones) so card images are requested
  const toggle = page.locator('.rail-toggle');
  if (await toggle.count()) await toggle.click();
  await page.waitForTimeout(3000);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `diag-out/${name}.png` });
  const shown = await page.evaluate(() => ({
    cards: document.querySelectorAll('.story-art').length,
    panels: document.querySelectorAll('.story-art.is-panel').length,
    imgs: [...document.querySelectorAll('.story-art img')].map((img) => ({
      src: img.currentSrc || img.src, complete: img.complete, w: img.naturalWidth,
    })),
  }));
  const host = (u) => { try { return new URL(u).host; } catch { return '?'; } };
  const byHost = {};
  for (const im of images) {
    const h = host(im.url);
    if (h.endsWith('github.io')) continue;
    const k = `${h} ${im.status}${im.error ? ' ' + im.error : ''}`;
    byHost[k] = (byHost[k] ?? 0) + 1;
  }
  summary.push({ name, shown: { cards: shown.cards, panels: shown.panels, loadedImgs: shown.imgs.filter((i) => i.w > 0).length, imgsInDom: shown.imgs.length }, byHost, sampleFailures: images.filter((i) => i.status === 'FAILED' || (typeof i.status === 'number' && i.status >= 400)).slice(0, 12), domImgs: shown.imgs.slice(0, 15) });
  await browser.close();
}
writeFileSync('diag-out/summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
