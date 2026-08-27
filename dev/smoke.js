/*
 * Headless smoke test: boots the app against the mock WordPress API
 * (dev/mock-wp-server.js) and mechanically verifies the core flows:
 *
 *   feed loads live (not sample) data · section tabs filter · infinite
 *   scroll paginates · article view renders sanitized content (script tags
 *   stripped) · members-only articles show the paywall CTA, never a body ·
 *   save → appears under Saved · search filters · no console/page errors
 *
 * Run:  node dev/smoke.js        (requires playwright-core + a Chromium;
 *       set PW_CHROMIUM to your Chromium binary if not auto-detected)
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(__dirname, 'screenshots');

function exe() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  if (fs.existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
  return undefined; // let playwright find one
}

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${!ok && detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(__dirname, 'mock-wp-server.js')], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 600));

  const browser = await chromium.launch({ executablePath: exe(), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // The deliberate wrong-password check makes the browser log the token
    // endpoint's 403 as a resource error — that one is expected.
    const loc = (m.location() && m.location().url) || '';
    if (loc.includes('/jwt-auth/')) return;
    errors.push('console: ' + m.text());
  });

  try {
    // ── Feed ──
    await page.goto(`${BASE}/?api=${BASE}&auth=jwt`);
    await page.waitForSelector('.card[data-id]', { timeout: 8000 });
    await page.waitForFunction(() => document.querySelectorAll('.card[data-id]').length >= 5);
    check('feed renders live cards', true);
    check('no SAMPLE badge on live data', await page.locator('.badge.demo').count() === 0);
    check('locked article carries DIEHARD badge in feed',
      (await page.locator('.card .badge.member').count()) >= 1);
    check('section chips resolved from API',
      await page.locator('.chip', { hasText: 'Broncos' }).count() === 1 &&
      await page.locator('.chip', { hasText: 'CSU Rams' }).count() === 1);
    check('fuzzy match finds prefixed team slugs (Nuggets/Avalanche/Rapids)',
      await page.locator('.chip', { hasText: 'Nuggets' }).count() === 1 &&
      await page.locator('.chip', { hasText: 'Avalanche' }).count() === 1 &&
      await page.locator('.chip', { hasText: 'Rapids' }).count() === 1);
    check('exactly one CU Buffs chip',
      await page.locator('.chip', { hasText: 'CU Buffs' }).count() === 1);
    await page.screenshot({ path: path.join(SHOTS, 'feed-mobile.png') });

    // ── Infinite scroll (24 fixtures, 20 per page) ──
    await page.mouse.wheel(0, 30000);
    await page.waitForFunction(() => document.querySelectorAll('.card[data-id]').length >= 24, null, { timeout: 8000 });
    check('infinite scroll loads page 2', true);

    // ── Section filter ──
    await page.locator('.chip', { hasText: 'Nuggets' }).click();
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('.card[data-id] h2');
      return cards.length > 0 && [...cards].every(h => h.textContent.includes('Nuggets'));
    }, null, { timeout: 8000 });
    check('section tab filters feed', true);
    await page.locator('.chip', { hasText: 'All' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.card[data-id]').length >= 5);

    // ── Article view + sanitization ──
    await page.locator('.card[data-id]').first().click();
    await page.waitForSelector('.article-body', { timeout: 8000 });
    check('article body renders', (await page.locator('.article-body p').count()) >= 2);
    check('script tags stripped from article HTML',
      await page.evaluate(() => window.__XSS_FIXTURE_RAN__ === undefined &&
        document.querySelectorAll('.article-body script').length === 0));
    check('inline event handlers stripped',
      await page.evaluate(() => document.querySelectorAll('.article-body [onclick]').length === 0));
    check('article links open externally',
      await page.evaluate(() => [...document.querySelectorAll('.article-body a')]
        .every(a => a.target === '_blank' && a.rel.includes('noopener'))));
    await page.screenshot({ path: path.join(SHOTS, 'article-mobile.png') });

    // ── Save → Saved list ──
    await page.locator('#saveBtn').click();
    check('save toggles on', (await page.locator('#saveBtn').textContent()).includes('Saved'));
    await page.locator('.nav-btn[data-route="saved"]').click();
    await page.waitForSelector('.card[data-id]', { timeout: 4000 });
    check('saved article listed under Saved', (await page.locator('.card[data-id]').count()) === 1);

    // ── Members-only article → Diehard card, no body ──
    await page.goto(`${BASE}/#/article/104`);
    await page.waitForSelector('.paywall', { timeout: 8000 });
    check('locked article shows Become-a-Diehard card, never a body',
      (await page.locator('.paywall .btn.primary').count()) === 1 &&
      (await page.locator('.article-body').count()) === 0 &&
      (await page.locator('.paywall .member-benefits li').count()) >= 2);
    check('signup CTA points at the join page',
      ((await page.locator('.paywall .btn.primary').getAttribute('href')) || '').includes('/join'));
    check('locked article offers member sign-in',
      (await page.locator('.paywall a[href="#/about"]').count()) === 1);
    await page.screenshot({ path: path.join(SHOTS, 'paywall-mobile.png') });

    // ── Member sign-in: bad creds rejected, good creds unlock ──
    await page.goto(`${BASE}/#/about`);
    await page.waitForSelector('#signInForm', { timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, 'account-mobile.png') });
    await page.fill('#siUser', 'diehard');
    await page.fill('#siPass', 'wrong-password');
    await page.click('#siSubmit');
    await page.waitForFunction(() => {
      const el = document.querySelector('#siError');
      return el && el.textContent.length > 0;
    }, null, { timeout: 8000 });
    check('wrong password shows a readable error (HTML stripped)',
      await page.evaluate(() => !document.querySelector('#siError').textContent.includes('<')));
    await page.fill('#siPass', 'sample');
    await page.click('#siSubmit');
    await page.waitForSelector('#signOutBtn', { timeout: 8000 });
    check('sign-in lands in signed-in account state',
      (await page.locator('.member-card h3').textContent()).includes('Sample Diehard'));

    await page.goto(`${BASE}/#/article/104`);
    await page.waitForSelector('.article-body', { timeout: 8000 });
    check('members-only article unlocks in-app for a member',
      (await page.locator('.paywall').count()) === 0);
    await page.goto(`${BASE}/#/`);
    await page.waitForSelector('.card[data-id]', { timeout: 8000 });
    check('DIEHARD badges clear from the feed for a member',
      (await page.locator('.card .badge.member').count()) === 0);

    // ── Sign out re-locks ──
    await page.goto(`${BASE}/#/about`);
    await page.waitForSelector('#signOutBtn', { timeout: 8000 });
    await page.click('#signOutBtn');
    await page.waitForSelector('#signInForm', { timeout: 8000 });
    await page.goto(`${BASE}/#/article/104`);
    await page.waitForSelector('.paywall', { timeout: 8000 });
    check('sign-out re-locks members-only articles', true);

    // ── Search ──
    await page.goto(`${BASE}/#/`);
    await page.fill('#searchInput', 'Avalanche');
    await page.press('#searchInput', 'Enter');
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('.card[data-id] h2');
      return cards.length > 0 && [...cards].every(h => h.textContent.includes('Avalanche'));
    }, null, { timeout: 8000 });
    check('search filters feed', true);

    // ── Desktop layout shot ──
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/#/`);
    await page.waitForSelector('.card[data-id]', { timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, 'feed-desktop.png') });

    // ── Demo fallback (unreachable API, no cache) ──
    const page2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page2.goto(`${BASE}/?api=http://127.0.0.1:9`); // closed port
    await page2.waitForSelector('.badge.demo', { timeout: 10000 });
    check('unreachable API falls back to labeled sample content', true);
    await page2.close();

    // ── Cookie mode: a website login carries into the app automatically ──
    // (auth=auto also proves the same-origin auto-resolution to cookie mode)
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx3.addCookies([{ name: 'dnvr_mock_login', value: '1', url: BASE }]);
    const page3 = await ctx3.newPage();
    page3.on('pageerror', e => errors.push('pageerror(cookie): ' + e.message));
    await page3.goto(`${BASE}/?api=${BASE}&auth=auto`);
    await page3.waitForSelector('.card[data-id]', { timeout: 8000 });
    check('site login recognized at boot — member feed, no DIEHARD badges',
      (await page3.locator('.card .badge.member').count()) === 0);
    await page3.goto(`${BASE}/#/about`);
    await page3.waitForSelector('.member-card', { timeout: 8000 });
    await page3.waitForFunction(() =>
      document.querySelector('.member-card h3') &&
      document.querySelector('.member-card h3').textContent.includes('Sample Diehard'),
      null, { timeout: 8000 });
    check('account shows website identity with NO in-app sign-in form',
      (await page3.locator('#signInForm').count()) === 0 &&
      (await page3.locator('#signOutBtn').count()) === 0);
    await page3.goto(`${BASE}/#/article/104`);
    await page3.waitForSelector('.article-body', { timeout: 8000 });
    check('members-only article unlocks via website login',
      (await page3.locator('.paywall').count()) === 0);
    await ctx3.close();

    // Cookie mode without a website login → points at the site's login.
    const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page4 = await ctx4.newPage();
    page4.on('pageerror', e => errors.push('pageerror(cookie-anon): ' + e.message));
    await page4.goto(`${BASE}/?api=${BASE}&auth=cookie`);
    await page4.goto(`${BASE}/#/about`);
    await page4.waitForSelector('.member-card', { timeout: 8000 });
    check('logged-out cookie mode offers site login, not an app form',
      (await page4.locator('#probeBtn').count()) === 1 &&
      (await page4.locator('#signInForm').count()) === 0);
    await ctx4.close();

    check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('smoke run completed', false, e.message);
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll smoke checks passed.');
  process.exit(failures ? 1 : 0);
})();
