import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { createMap, addLayer, History } from '../src/model.js';
import { createTileset, openTilesets, closeTilesets, openTileImport, initialTileCount } from './tileset-ui.mjs';

test('Trials editions: shared library, Free limits, top-left cropping, alpha and PNG watermark', { timeout: 120000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: '4194' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let browser;
  try {
    await once(server.stdout, 'data'); browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message)); await page.goto('http://127.0.0.1:4194'); await page.waitForSelector('.tile-button');
    assert.match(await page.title(), /Trials/); assert.equal(await page.locator('.brand').textContent(), 'TRIALS');
    assert.equal(await page.locator('.tile-button').count(), initialTileCount); assert.equal(await page.locator('#pack-select option[value=kenney-tiny]').count(), 0);
    async function saved() { await closeTilesets(page); const download = page.waitForEvent('download'); await page.locator('#save-map').click(); return JSON.parse(await readFile(await (await download).path(), 'utf8')); }
    async function openMap(map) { await page.locator('#map-file').setInputFiles({ name: 'test.vttmap.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(map)) }); await page.waitForFunction(name => document.querySelector('#map-name').value === name, map.name); }
    while (await page.locator('.layer-row').count() < 6) await page.locator('#add-layer').click(); assert.equal(await page.locator('#add-layer').isDisabled(), true);
    const first = await createTileset(page, 'Shared terrain');
    const source = new PNG({ width: 192, height: 192 });
    // Empty atlas except one half-alpha tile and a solid tile outside Free's crop.
    for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) { const i = (y * 192 + x) * 4; if (x < 16 && y < 16) { source.data[i] = 220; source.data[i + 3] = 128; } else if (x >= 160) { source.data[i + 1] = 255; source.data[i + 3] = 255; } }
    const bytes = PNG.sync.write(source);
    async function upload() {
      await openTileImport(page); assert.equal(await page.locator('#free-tile-size-row').isVisible(), true);
      await page.locator('#tile-files').setInputFiles({ name: 'crop.png', mimeType: 'image/png', buffer: bytes });
      await page.waitForFunction(() => document.querySelector('#import-status').textContent.startsWith('1 tile brushes'));
      assert.match(await page.locator('#import-status').textContent(), /160 × 160.*top-left cropped from 192 × 192/);
      await page.locator('#import-form button[type=submit]').click(); await page.waitForFunction(() => !document.querySelector('#import-dialog').open); await closeTilesets(page);
    }
    await upload(); await upload(); let map = await saved(), pack = map.packs.find(pack => pack.id === first);
    assert.equal(pack.images.length, 2); assert.equal(pack.tiles.length, 2); assert.equal(pack.images[0].width, 160);
    const cropped = PNG.sync.read(Buffer.from(pack.images[0].data.split(',')[1], 'base64')); assert.equal(cropped.width, 160); assert.equal(cropped.height, 160); assert.equal(cropped.data[3], 128); assert.equal(cropped.data[(20 * 160 + 20) * 4 + 3], 0);
    await openTilesets(page); assert.equal(await page.locator('#import-tiles').isDisabled(), true);
    await page.locator('.import-row').first().getByRole('button', { name: /^Remove import/ }).click(); await page.locator('#delete-import-form button[type=submit]').click(); assert.equal(await page.locator('#import-tiles').isDisabled(), false); await closeTilesets(page); await upload();
    const second = await createTileset(page, 'Shared props'); await openTilesets(page); assert.equal(await page.locator('#new-tileset').isDisabled(), true);
    assert.match(await page.locator('#kenney-credit').textContent(), /Kenney/); await closeTilesets(page);
    await page.locator('#new-map').click(); await page.locator('#new-form [name=name]').fill('Shared second project'); await page.locator('#new-form button[type=submit]').click(); await page.waitForFunction(() => document.querySelector('#map-name').value === 'Shared second project');
    for (const id of [first, second]) assert.equal(await page.locator(`#pack-select option[value="${id}"]`).count(), 1);
    await page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Saved locally in this browser'); await page.reload(); await page.waitForFunction(() => document.querySelector('#map-name').value === 'Shared second project');
    assert.equal((await saved()).packs.filter(pack => !pack.hidden).length, 2);
    async function exportPNG() { await page.locator('#export-map').click(); await page.locator('#export-grid').uncheck(); await page.locator('#export-transparent').check(); const download = page.waitForEvent('download'); await page.locator('#export-submit').click(); return readFile(await (await download).path()); }
    await openMap(createMap(8, 8, 'Watermark check')); const freePNG = await exportPNG(), freeImage = PNG.sync.read(freePNG);
    let alphaPixels = 0, maxAlpha = 0; for (let i = 3; i < freeImage.data.length; i += 4) { if (freeImage.data[i]) alphaPixels++; maxAlpha = Math.max(maxAlpha, freeImage.data[i]); }
    assert.ok(alphaPixels > 100); assert.ok(maxAlpha < 180, `Watermark must be faded: ${maxAlpha}`);
    await mkdir(root + '.test-output', { recursive: true }); await import('node:fs/promises').then(fs => fs.writeFile(root + '.test-output/free-watermark.png', freePNG));
    const large = createMap(4, 4, 'Twelve preserved'); const history = new History(large); while (large.layers.length < 12) addLayer(history);
    await openMap(large); assert.equal(await page.locator('#project-edition-notice').isVisible(), true); assert.equal((await saved()).layers.length, 12);
    await page.route('**/assets/edition.json', route => route.fulfill({ json: { edition: 'desktop', ad: { enabled: false } } })); await page.reload(); await page.waitForSelector('.tile-button');
    assert.equal(await page.locator('#project-edition-notice').isVisible(), false); await openMap(createMap(8, 8, 'Paid watermark check'));
    const paidImage = PNG.sync.read(await exportPNG()); assert.ok(paidImage.data.every(value => value === 0));
    await createTileset(page, 'Third paid set'); await openTileImport(page); assert.equal(await page.locator('#free-tile-size-row').isVisible(), false);
    await page.locator('#tile-width').fill('64'); await page.locator('#tile-height').fill('64'); await page.locator('#tile-files').setInputFiles({ name: 'uncropped.png', mimeType: 'image/png', buffer: bytes });
    await page.waitForFunction(() => document.querySelector('#import-status').textContent.includes('192 × 192 px')); await page.locator('#import-form button[type=submit]').click(); await page.waitForFunction(() => !document.querySelector('#import-dialog').open);
    pack = (await saved()).packs.find(pack => pack.name === 'Third paid set'); assert.equal(pack.images[0].width, 192); assert.ok(pack.tiles.every(tile => tile.rect[2] === 64));
    assert.deepEqual(errors, []);
  } finally { if (browser) await browser.close(); server.kill(); }
});
