/* Run: npm install --no-save playwright && node tests/visual-smoke.cjs
   Optionally set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an installed Chromium.
   The HTML is intercepted into the built-in demo store; no production requests are allowed. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const output = process.env.QA_OUTPUT || '/tmp/price-is-fright-qa';
  fs.mkdirSync(output, { recursive: true });
  let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  html = html.replace(/databaseURL: "[^"]+"/, 'databaseURL: ""').replace(/siteUrl: "[^"]+"/, 'siteUrl: ""');
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const context = await browser.newContext();
  const errors = [], checks = [];
  const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log('PASS', name); };
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') return route.fulfill({ contentType: 'text/html', body: html });
    return route.abort();
  });
  const page = async (query = '', width = 1440, height = 900, reduced = false) => {
    const p = await context.newPage(); p.setDefaultTimeout(12000);
    p.on('pageerror', e => errors.push(e.message));
    await p.setViewportSize({ width, height });
    if (reduced) await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.goto('http://localhost/' + query); return p;
  };
  const shot = async (p, name) => { await p.bringToFront(); await p.screenshot({ timeout: 30000, path: path.join(output, name + '.png'), fullPage: true }); };
  const noOverflow = async p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  try {
    const landing = await page('', 390, 844);
    await landing.locator('#ljoin').waitFor();
    await landing.waitForTimeout(700);
    check('Landing fits a phone', await noOverflow(landing));
    check('Show fonts are available without a network', await landing.evaluate(() => document.fonts.check('16px Creepster') && document.fonts.check('16px "Luckiest Guy"')));
    await shot(landing, 'landing-mobile');
    await landing.setViewportSize({width: 1440, height: 1000}); await shot(landing, 'landing-desktop');
    await landing.locator('.fx-toggle').click();
    check('Reduced effects toggle works', await landing.locator('html').getAttribute('data-effects') === 'reduced');
    await landing.reload(); await landing.locator('#ljoin').waitFor();
    check('Motion preference survives reload', await landing.locator('html').getAttribute('data-effects') === 'reduced');
    await landing.locator('.fx-toggle').click();
    await landing.locator('#lhost').click(); await landing.locator('#lgo').waitFor();
    check('Host spoiler warning still works', await landing.locator('[role="alertdialog"]').count() === 1);

    await landing.close();
    const host = await page('?role=host');
    await host.locator('#hnewg').click(); await host.locator('#hprim').waitFor();
    const primary = async kind => { await host.locator('#hprim[data-kind="' + kind + '"]').click(); await host.waitForTimeout(450); };
    const code = new URL(host.url()).searchParams.get('room');
    check('Host creates a local demo room', /^[A-Z]{4}$/.test(code));
    const player = await page('?room=' + code, 390, 844);
    const player2 = await page('?room=' + code, 1280, 900);
    for (const [p, name] of [[player, 'Cameron'], [player2, 'Alex']]) {
      await p.locator('#jn').fill(name); await p.locator('#jb').click(); await p.locator('.p-hello').waitFor();
      await p.locator('[data-opt="1"]').click();
    }
    const display = await page('?role=display&room=' + code, 1600, 900);
    const calmDisplay = await page('?role=display&room=' + code, 1600, 900, true);
    await display.locator('.s-lobby').waitFor();
    await shot(player, 'lobby-mobile'); await shot(display, 'lobby-display');
    check('Player poll selection persists', await player.locator('[data-opt="1"]').getAttribute('aria-pressed') === 'true');
    await host.evaluate(async code => { await store.update(roomPath(code) + '/settings', { autoEnd: false, lightning: false }); }, code);
    await primary('show');
    await player.locator('#gi').fill('6.45'); await player.locator('#gb').click();
    await player.locator('.p-locked').waitFor();
    check('Confirmed guess has accessible feedback', await player.locator('.p-locked .v').textContent() === '$6.45');
    await player.locator('#gchg').click(); await player.locator('#gi').fill('6.40'); await player.locator('#gb').click();
    await player.waitForFunction(() => document.querySelector('.p-locked .v')?.textContent === '$6.40');
    check('Changing a guess still works', true);
    await player.locator('#gchg').click(); await player.locator('#gi').fill('6.45'); await player.locator('#gb').click();
    await player2.locator('#gi').fill('7'); await player2.locator('#gb').click();
    check('Active round fits mobile and desktop', (await noOverflow(player)) && (await noOverflow(player2)));
    await shot(player, 'guess-locked-mobile'); await shot(display, 'guess-display');
    await primary('stop');
    await primary('reveal');
    await display.locator('.s-scene.revealing').waitFor();
    await calmDisplay.locator('.s-scene.revealing').waitFor();
    await display.waitForTimeout(1600);
    check('Reduced-motion display does not reveal the price early', await calmDisplay.locator('.prow .psign.lit').count() === 0);
    const lateDisplay = await page('?role=display&room=' + code, 1280, 720);
    await lateDisplay.locator('.s-scene.revealing').waitFor();
    check('A display joining mid-reveal does not jump to the answer', await lateDisplay.locator('.prow .psign.lit').count() === 0);
    await player.locator('.pi-res').waitFor({ timeout: 22000 });
    await calmDisplay.locator('.prow .psign.lit').waitFor({ timeout: 22000 });
    await display.locator('.s-scene.calls').waitFor({ timeout: 22000 });
    check('Normal and reduced reveals both finish', await calmDisplay.locator('.s-scene.lined').count() === 1);
    check('Bullseye result is highlighted', await player.locator('.pi-res.is-bull').count() === 1);
    await player.waitForTimeout(1000); await shot(player, 'reveal-mobile'); await shot(display, 'reveal-display');
    await lateDisplay.close(); await calmDisplay.close();
    // Complete the remaining live rounds through the actual controls and host skip path.
    for (let i = 1; i < 10; i++) {
      await primary('show');
      await player.locator('#gi').waitFor();
      await player.locator('#gi').fill(String(20 + i)); await player.locator('#gb').click();
      await player.locator('.p-locked').waitFor();
      await primary('stop');
      await primary('reveal');
      await primary('skip');
      await player.locator('.pi-res').waitFor();
      await player.waitForTimeout(1000); // existing host double-click guard after a skip
    }
    check('All ten rounds and skip transitions complete', true);
    await primary('final');
    await player.locator('.p-fin.crowned').waitFor({timeout: 18000});
    await display.locator('.s-final.crowned').waitFor({timeout: 18000});
    await player.waitForTimeout(1200);
    await shot(player, 'final-mobile'); await shot(display, 'final-display');
    check('Final podium fits the phone', await noOverflow(player));
    await primary('poll'); await player.locator('.p-poll').waitFor();
    check('Poll results remain reachable after the finale', true);
    await host.locator('[data-sec="encore"]').click(); await player.locator('#gi').waitFor();
    check('Encore opens with a fresh guessing form', true);
    // Reduced effects can be enabled during an active round without changing the clock or inputs.
    await player.locator('#gi').fill('12'); await player.locator('.fx-toggle').click();
    check('Motion toggle preserves the draft', await player.locator('#gi').inputValue() === '12');
    await player.locator('#gb').click(); await player.locator('.p-locked').waitFor();
    check('Reduced-motion player can submit guesses', true);
    await player.locator('.fx-toggle').click();
    // Small phone and tablet layout, including a long question and the largest price.
    await player.setViewportSize({width: 320, height: 740});
    check('Narrow 320px layout has no horizontal overflow', await noOverflow(player));
    await shot(player, 'narrow-mobile');

    const ahost = await page('?role=host');
    await ahost.locator('#hnewa').click(); await ahost.locator('[data-secs="0"]').click(); await ahost.locator('#hscreate').click();
    await ahost.waitForURL(/room=/); const acode = new URL(ahost.url()).searchParams.get('room');
    const asyncPlayer = await page('?room=' + acode, 390, 844, true);
    await asyncPlayer.locator('#ajn').fill('Morgan'); await asyncPlayer.locator('#ajf button[type="submit"]').click();
    await asyncPlayer.locator('[data-anext]').click(); await asyncPlayer.locator('#gi').fill('6.45'); await asyncPlayer.locator('#gb').click();
    await asyncPlayer.locator('.pi-res').waitFor({timeout: 22000});
    await asyncPlayer.locator('[data-anext]').click(); await asyncPlayer.locator('#gi').waitFor();
    check('Play-anytime mode reveals and advances with reduced motion', true);
    check('Reduced motion suppresses decorative particles', await asyncPlayer.locator('.show-spark, .confetti, .fireworks').count() === 0);
    check('No browser runtime errors', errors.length === 0);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(`Verified ${checks.length} checks. Screenshots: ${output}`);
  } finally { if (errors.length) console.error('Runtime errors:', errors); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
