import { chromium } from '@playwright/test';

const logs = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message}`));
page.on('requestfailed', (r) => logs.push(`FAIL: ${r.url()} — ${r.failure()?.errorText}`));

try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 90_000 });
} catch (e) {
  logs.push(`GOTO: ${e.message}`);
}

await page.waitForTimeout(5000);
const rootHtml = await page.locator('#root').innerHTML().catch(() => '');
const bodyClass = await page.evaluate(() => document.body.className);
const visible = await page.locator('#root').isVisible();

console.log(JSON.stringify({ title: await page.title(), bodyClass, rootVisible: visible, rootLen: rootHtml.length, rootPreview: rootHtml.slice(0, 800), logs }, null, 2));
await page.screenshot({ path: 'samples/dev-blank-debug.png', fullPage: true });
await browser.close();
