import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openTilesets, closeTilesets, openFreeTilesets } from './tileset-ui.mjs';

test('Kenney catalog, add/delete actions, layer renaming, edition table and isolated AdSense placement', { timeout: 120000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: '4196' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let browser;
  try {
    await once(server.stdout, 'data'); browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), errors = [], googleRequests = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (request.url().includes('googlesyndication')) googleRequests.push(request.url()); });
    await page.goto('http://127.0.0.1:4196'); await page.waitForSelector('.tile-button');
    assert.equal(await page.locator('#export-map').textContent(), 'Export'); assert.equal(await page.locator('#sponsor-slot').isVisible(), true);
    const frame = await page.locator('.ad-frame').boundingBox(), support = await page.locator('.support-link').boundingBox(); assert.equal(frame.width, (await page.locator('.inspector-panel').boundingBox()).width - 4); assert.equal(frame.height, 150); assert.ok(support.y > frame.y + frame.height);
    assert.equal(googleRequests.length, 0); // Local previews never request real ads.
    await openTilesets(page); await page.locator('#free-edition-rules').click();
    const table = page.locator('.edition-comparison'); assert.equal(await table.getByRole('rowheader', { name: 'Image Size Limit', exact: true }).count(), 1); assert.equal(await table.getByRole('rowheader', { name: 'Tile setup', exact: true }).count(), 0);
    const watermark = table.getByRole('row').filter({ hasText: 'Export Watermark' }); assert.equal(await watermark.getByRole('img', { name: 'Yes', exact: true }).count(), 1); assert.equal(await watermark.getByRole('img', { name: 'No', exact: true }).count(), 1);
    assert.equal((await table.textContent()).includes('No Free'), false); await page.locator('#edition-dialog [data-close]').click();
    assert.equal(await page.locator('#edit-tileset-description').count(), 0); assert.equal(await page.locator('#description-dialog').count(), 0);
    await openFreeTilesets(page); assert.equal(await page.locator('#kenney-title').textContent(), 'Free Tilesets'); assert.match(await page.locator('#kenney-credit').textContent(), /CC0.*not affiliated/);
    assert.equal(await page.locator('#kenney-import h3 a').getAttribute('href'), 'https://kenney.nl');
    await page.locator('#kenney-dialog [data-close]').click(); assert.equal(await page.locator('#pack-select option[value=kenney-tiny]').count(), 0);
    await openFreeTilesets(page); await page.getByRole('button', {name:'Add Tiny Dungeon',exact:true}).click(); assert.equal(await page.locator('#pack-select option[value=kenney-tiny]').count(), 1); assert.equal(await page.locator('#pack-select option[value=kenney-scribble]').count(), 0);
    const tinyAction = page.locator('[data-kenney-pack=kenney-tiny]'); assert.equal(await tinyAction.textContent(), '×'); await tinyAction.click();
    await page.locator('#delete-pack-dialog').getByRole('button', {name:'Cancel',exact:true}).click(); assert.equal(await tinyAction.textContent(), '×'); await closeTilesets(page);
    const row = page.locator('.layer-row[data-layer-id=layer-2] .layer-select'); await row.click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Rename layer', exact: true }).click(); await page.locator('#layer-name').fill('Furniture'); await page.locator('#rename-layer-form button[type=submit]').click(); assert.equal(await row.textContent(), 'Furniture');
    await page.locator('#undo').click(); assert.equal(await row.textContent(), 'Objects'); await page.locator('#redo').click(); assert.equal(await row.textContent(), 'Furniture');
    const download = page.waitForEvent('download'); await page.locator('#save-map').click(); const map = JSON.parse(await readFile(await (await download).path(), 'utf8')); assert.equal(map.layers[2].name, 'Furniture');
    await page.locator('#new-map').click(); await page.locator('#new-form [name=name]').fill('Kenney across maps'); await page.locator('#new-form button[type=submit]').click(); await page.waitForFunction(() => document.querySelector('#map-name').value === 'Kenney across maps'); await page.locator('#pack-select').selectOption('kenney-tiny'); await openFreeTilesets(page); assert.equal(await page.locator('[data-kenney-pack=kenney-tiny]').textContent(), '×'); await closeTilesets(page);
    await page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Saved locally in this browser'); await page.reload(); await page.waitForSelector('.tile-button'); await page.locator('#pack-select').selectOption('kenney-tiny'); await openFreeTilesets(page); assert.equal(await page.locator('[data-kenney-pack=kenney-tiny]').textContent(), '×'); await closeTilesets(page);
    assert.deepEqual(errors, []);
    // All advertising traffic below is intercepted; no impressions or real ads.
    const adPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); let adLoads = 0;
    await adPage.route('https://trials-preview.test/**', async route => { const url = new URL(route.request().url()); await route.fulfill({ response: await route.fetch({ url: 'http://127.0.0.1:4196' + url.pathname + url.search }) }); });
    const ad = { enabled: true, provider: 'adsense', publisherId: 'ca-pub-0000000000000000', slotId: '1234', reserveSpace: true, width: 180, height: 150 };
    await adPage.route('**/assets/edition.json', route => route.fulfill({ json: { edition: 'web', ad } }));
    await adPage.route('https://pagead2.googlesyndication.com/**', route => { adLoads++; return route.fulfill({ contentType: 'text/javascript', body: 'window.adsbygoogle = {push(){document.querySelector("ins.adsbygoogle").setAttribute("data-ad-status","filled")}};' }); });
    await adPage.goto('https://trials-preview.test/'); await adPage.waitForFunction(() => document.querySelector('#sponsor-slot').dataset.state === 'filled'); assert.equal(adLoads, 1); assert.equal(await adPage.locator('ins.adsbygoogle').getAttribute('data-ad-slot'), '1234');
    await adPage.route('**/assets/edition.json', route => route.fulfill({ json: { edition: 'desktop', ad } })); await adPage.reload(); await adPage.waitForSelector('.tile-button'); assert.equal(await adPage.locator('#sponsor-slot').isVisible(), false); assert.equal(adLoads, 1);
    await mkdir(root + '.test-output', { recursive: true }); await page.screenshot({ path: root + '.test-output/manager-features.png' });
  } finally { if (browser) await browser.close(); server.kill(); }
});
