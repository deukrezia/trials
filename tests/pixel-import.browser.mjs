import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createMap } from '../src/model.js';
import { enableKenney, defaultTileCount, openTilesets, closeTilesets, createTileset, openTileImport } from './tileset-ui.mjs';

test('32px imports stay crisp and repeated imports append to the selected custom tileset', { timeout: 120000 }, async () => {
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, PORT: '4190' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let browser;
  try {
    await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw Error('Test server exited'); })]);
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4190'); await enableKenney(page);
    const fixture = createMap(4, 4, 'Pixel import checks');
    async function openMap(map) { await page.locator('#map-file').setInputFiles({ name: 'pixels.vttmap.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(map)) }); await page.waitForFunction(name => document.querySelector('#map-name').value === name, map.name); }
    async function saved() { await closeTilesets(page); const event = page.waitForEvent('download'); await page.locator('#save-map').click(); return JSON.parse(await readFile(await (await event).path(), 'utf8')); }
    async function newSet(name) { return createTileset(page, name); }
    await openMap(fixture); assert.equal(await page.locator('.library-panel #import-tiles, .library-panel #new-tileset, #tileset-options').count(), 0);
    const firstId = await newSet('Pixel floors'); assert.equal(await page.locator('.tile-button').count(), 0); assert.equal((await saved()).packs[0].tiles.length, 0);
    // A synthetic two-color stripe pattern makes interpolation and adjacent-atlas bleeding measurable.
    const source = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 32; const ctx = c.getContext('2d'); for (let x = 0; x < 32; x++) { ctx.fillStyle = x % 2 ? '#0000ff' : '#ff0000'; ctx.fillRect(x, 0, 1, 32); } ctx.fillStyle = '#00ff00'; ctx.fillRect(32, 0, 32, 32); return c.toDataURL(); });
    async function importSheet() {
      await openTileImport(page); assert.equal(await page.locator('#import-name').count(), 0);
      await page.locator('input[name=mode][value=sheet]').check(); await page.locator('#tile-width').fill('32'); await page.locator('#tile-height').fill('32');
      await page.locator('#tile-files').setInputFiles({ name: 'stripes32.png', mimeType: 'image/png', buffer: Buffer.from(source.split(',')[1], 'base64') });
      await page.waitForFunction(() => document.querySelector('#import-status').textContent.startsWith('2 tile brushes'));
      assert.equal(await page.locator('#sheet-preview').evaluate(node => node.getContext('2d').imageSmoothingEnabled), false);
      await page.locator('#import-form button[type=submit]').click(); await page.waitForFunction(() => !document.querySelector('#import-dialog').open);
      await closeTilesets(page);
    }
    await importSheet(); let map = await saved(); assert.equal(map.packs.length, 1); assert.equal(map.packs[0].id, firstId); assert.equal(map.packs[0].name, 'Pixel floors'); assert.equal(map.packs[0].tiles.length, 2); assert.ok(map.packs[0].tiles.every(tile => tile.pixelArt));
    const originalIds = map.packs[0].tiles.map(tile => tile.id);
    const stripe = page.locator(`.tile-button[data-tile="${originalIds[0]}"] canvas`);
    async function colors(locator, region) { return locator.evaluate((node, rect) => { const pixels = node.getContext('2d').getImageData(...rect).data, colors = new Set(); for (let i = 0; i < pixels.length; i += 4) colors.add([...pixels.slice(i, i + 4)].join(',')); return [...colors].sort(); }, region); }
    const pure = ['0,0,255,255', '255,0,0,255'];
    assert.deepEqual(await colors(stripe, [0, 0, 64, 64]), pure); assert.equal(await stripe.evaluate(node => getComputedStyle(node).imageRendering), 'pixelated');
    assert.deepEqual(await colors(page.locator('#brush-preview'), [13, 13, 118, 118]), pure);
    await page.locator('#fit-map').click(); await page.locator('#grid-toggle').click();
    const bounds = await page.locator('#map-canvas').boundingBox(), px = 128, left = bounds.x + (bounds.width - 4 * px) / 2, top = bounds.y + 40 + (bounds.height - 170 - 4 * px) / 2;
    await page.mouse.click(left + 1.5 * px, top + 1.5 * px); await page.mouse.move(10, 100); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(await colors(page.locator('#map-canvas'), [Math.round(left - bounds.x + px + 4), Math.round(top - bounds.y + px + 4), px - 8, px - 8]), pure);
    await page.locator('#export-map').click(); await page.locator('#export-size').fill('128'); await page.locator('#export-grid').uncheck();
    const event = page.waitForEvent('download'); await page.locator('#export-submit').click(); const png = await readFile(await (await event).path());
    const exportColors = await page.evaluate(async bytes => { const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' })), c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0); const data = ctx.getImageData(128, 128, 128, 128).data, colors = new Set(); for (let i = 0; i < data.length; i += 4) colors.add([...data.slice(i, i + 4)].join(',')); return [...colors].sort(); }, [...png]); assert.deepEqual(exportColors, pure);
    await importSheet(); map = await saved(); assert.equal(map.packs.length, 1); assert.equal(map.packs[0].tiles.length, 4); assert.deepEqual(map.packs[0].tiles.slice(0, 2).map(tile => tile.id), originalIds); assert.equal(new Set(map.packs[0].tiles.map(tile => tile.id)).size, 4); assert.equal(new Set(map.packs[0].images.map(image => image.id)).size, 2); assert.equal(map.layers[0].cells[5].tile, originalIds[0]);
    assert.equal(map.packs[0].imports.length, 2); assert.equal(map.packs[0].imports[0].name, 'stripes32.png');
    // Remove one import from the library while preserving its placed map artwork.
    const beforeRemoval = structuredClone(map);
    await openTilesets(page); assert.equal(await page.locator('.import-row').count(), 2);
    await mkdir(fileURLToPath(new URL('../.test-output/', import.meta.url)), { recursive: true }); await page.screenshot({ path: fileURLToPath(new URL('../.test-output/import-manager.png', import.meta.url)) });
    await page.locator('.import-row').first().getByRole('button', { name: /^Remove import/ }).click(); assert.match(await page.locator('#delete-import-warning').textContent(), /already placed on the map will stay/);
    await page.locator('#delete-import-dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(await page.locator('.import-row').count(), 2);
    await page.locator('.import-row').first().getByRole('button', { name: /^Remove import/ }).click(); await page.locator('#delete-import-form button[type=submit]').click(); assert.equal(await page.locator('.import-row').count(), 1);
    await closeTilesets(page);
    map = await saved(); assert.equal(map.packs.length, 1); assert.equal(map.packs[0].id, firstId); assert.equal(map.packs[0].tiles.filter(tile => !tile.hidden).length, 2); assert.equal(map.packs[0].images.length, 2); assert.deepEqual(map.layers, beforeRemoval.layers);
    assert.deepEqual(await colors(page.locator('#map-canvas'), [Math.round(left - bounds.x + px + 4), Math.round(top - bounds.y + px + 4), px - 8, px - 8]), pure);
    await page.locator('#undo').click(); assert.deepEqual(await saved(), beforeRemoval); await page.locator('#redo').click(); assert.equal((await saved()).packs[0].tiles.filter(tile => !tile.hidden).length, 2); await page.locator('#undo').click();
    await page.locator('#undo').click(); assert.equal((await saved()).packs[0].tiles.length, 2); await page.locator('#redo').click(); assert.equal((await saved()).packs[0].tiles.length, 4);
    const secondId = await newSet('Pixel props'); await importSheet(); map = await saved(); assert.equal(map.packs.length, 2); assert.equal(map.packs.find(pack => pack.id === firstId).tiles.length, 4); assert.equal(map.packs.find(pack => pack.id === secondId).tiles.length, 2);
    // Earlier saved maps have no rendering flag; they should become crisp without reimporting.
    map.name = 'Legacy pixel imports'; map.packs.forEach(pack => { delete pack.imports; pack.tiles.forEach(tile => { delete tile.pixelArt; }); }); await openMap(map); await page.locator('#pack-select').selectOption(firstId); await page.locator(`.tile-button[data-tile="${originalIds[0]}"]`).click();
    assert.deepEqual(await colors(page.locator('#brush-preview'), [13, 13, 118, 118]), pure);
    await page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Saved locally in this browser'); await page.reload(); await page.waitForFunction(() => document.querySelector('#map-name').value === 'Legacy pixel imports');
    await page.locator('#pack-select').selectOption(firstId); assert.equal(await page.locator('.tile-button canvas.pixel-art').count(), 4);
    await openTilesets(page); assert.equal(await page.locator('.import-row').count(), 2);
    await page.locator('#managed-tilesets').getByRole('button', { name: 'Pixel props', exact: true }).click(); assert.equal(await page.locator('#managed-tileset-name').textContent(), 'Pixel props'); assert.equal(await page.locator('#pack-select').inputValue(), firstId); assert.equal(await page.locator('.import-row').count(), 1);
    await page.locator('#import-tiles').click(); assert.equal(await page.locator('#import-target').textContent(), 'Adding to Pixel props'); await page.locator('#import-dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.locator('#managed-tilesets').getByRole('button', { name: 'Tiny Dungeon', exact: true }).click(); assert.equal(await page.locator('#managed-tileset-actions').isVisible(), false); assert.equal(await page.locator('#delete-pack').isVisible(), false); assert.equal(await page.locator('#default-tileset-note').isVisible(), true);
    await page.locator('#managed-tilesets').getByRole('button', { name: 'Pixel floors', exact: true }).click(); await page.setViewportSize({ width: 650, height: 760 });
    const manager = page.locator('#tileset-manager-dialog'), managerBounds = await manager.boundingBox(); assert.ok(managerBounds.x >= 0 && managerBounds.x + managerBounds.width <= 650); assert.equal(await manager.evaluate(node => node.scrollWidth <= node.clientWidth), true);
    await page.screenshot({ path: fileURLToPath(new URL('../.test-output/tileset-manager-650.png', import.meta.url)) });
    const heading = await page.locator('#tileset-manager-title').boundingBox(); await page.mouse.move(heading.x + 10, heading.y + 10); await page.mouse.down(); await page.mouse.move(4, 4, { steps: 6 }); await page.mouse.up(); assert.equal(await manager.isVisible(), true); await page.keyboard.press('Escape'); assert.equal(await manager.isVisible(), false);
    assert.deepEqual(errors, []); console.log('32px rendering, append targets, undo, legacy restoration and consolidated manager checks passed.');
  } finally { if (browser) await browser.close(); server.kill(); }
});
