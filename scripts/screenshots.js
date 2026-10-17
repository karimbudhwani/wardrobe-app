// Usage: BASE_URL=http://localhost:3000 node scripts/screenshots.js
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const out = f => path.join(__dirname, '..', 'screenshots', f);
(async () => {
  const browser = await chromium.launch();
  // placeholder "selfie" PNG
  const p0 = await browser.newPage({ viewport: { width: 400, height: 700 } });
  await p0.setContent(`<body style="margin:0;background:linear-gradient(#e0e7ff,#fae8ff);display:grid;place-items:center;height:700px"><svg width="260" height="640" viewBox="0 0 260 640"><circle cx="130" cy="80" r="55" fill="#c68642"/><rect x="65" y="140" width="130" height="250" rx="40" fill="#94a3b8"/><rect x="75" y="380" width="45" height="250" rx="20" fill="#475569"/><rect x="140" y="380" width="45" height="250" rx="20" fill="#475569"/></svg></body>`);
  const selfie = '/tmp/selfie.png'; await p0.screenshot({ path: selfie });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE); await page.waitForSelector('#authForm');
  await page.screenshot({ path: out('01-login-mobile.png') });
  await page.click('#demoBtn'); await page.waitForSelector('.item');
  await page.waitForTimeout(500); await page.screenshot({ path: out('02-closet-mobile.png') });
  await page.selectOption('#fstyle', 'south-asian'); await page.waitForTimeout(600);
  await page.screenshot({ path: out('03-closet-filtered-mobile.png') });
  await page.click('[data-tab=suggest]');
  await page.fill('#event', 'Diwali'); await page.fill('#loc', 'London');
  await page.click('#ctxForm button[type=submit]'); await page.waitForSelector('.outfit', { timeout: 20000 }); await page.waitForTimeout(600);
  await page.screenshot({ path: out('04-diwali-london-mobile.png'), fullPage: true });
  await page.click('[data-try="0"]');
  await page.setInputFiles('#selfieFile', selfie); await page.waitForTimeout(800);
  await page.click('#renderBtn'); await page.waitForSelector('#render:not(.hidden)'); await page.waitForTimeout(800);
  await page.screenshot({ path: out('05-tryon-mobile.png'), fullPage: true });
  await page.click('[data-tab=import]'); await page.screenshot({ path: out('06-import-mobile.png') });
  const d = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await d.goto(BASE); await d.click('#demoBtn'); await d.waitForSelector('.item'); await d.waitForTimeout(600);
  await d.screenshot({ path: out('07-closet-desktop.png') });
  await d.click('[data-tab=suggest]'); await d.fill('#event', 'Western wedding (guest)'); await d.fill('#loc', 'Paris');
  await d.click('#ctxForm button[type=submit]'); await d.waitForSelector('.outfit', { timeout: 20000 }); await d.waitForTimeout(600);
  await d.screenshot({ path: out('08-wedding-paris-desktop.png'), fullPage: true });
  await browser.close(); console.log('screenshots done');
})().catch(e => { console.error(e); process.exit(1); });
