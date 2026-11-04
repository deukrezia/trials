import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createMap, placement } from '../src/model.js';
import { enableKenney, defaultTileCount, openTilesets, closeTilesets } from './tileset-ui.mjs';

test('layer groups, hover stack, contextual cursors and retained artwork after library deletion', { timeout: 120000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url)), server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: '4192' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let browser;
  try {
    await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw Error('Test server exited'); })]); browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4192'); await enableKenney(page);
    const art = await page.evaluate(() => ['red', 'green', 'blue'].map(color => { const c = document.createElement('canvas'); c.width = c.height = 32; const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 32, 32); return c.toDataURL(); }));
    const fixture = createMap(4, 4, 'Grouped layers'); fixture.packs = [{ id: 'custom-grouped', name: 'Grouped art', images: art.map((data, i) => ({ id: `image-${i}`, data, width: 32, height: 32 })), tiles: art.map((_, i) => ({ id: `custom-grouped:${i}`, name: ['Red', 'Green', 'Blue'][i], image: `image-${i}`, category: 'Custom', rect: [0, 0, 32, 32] })) }]; fixture.layers[0].cells[5] = placement('custom-grouped:0'); fixture.layers[0].cells[6] = placement('custom-grouped:0'); fixture.layers[1].cells[5] = placement('custom-grouped:1'); fixture.layers[2].cells[5] = placement('custom-grouped:2'); fixture.layers[2].cells[9] = placement('custom-grouped:2');
    async function openMap(map) { await closeTilesets(page); await page.locator('#map-file').setInputFiles({ name: 'groups.vttmap.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(map)) }); await page.waitForFunction(name => document.querySelector('#map-name').value === name, map.name); await page.locator('#fit-map').click(); }
    async function saved() { await closeTilesets(page); const event = page.waitForEvent('download'); await page.locator('#save-map').click(); return JSON.parse(await readFile(await (await event).path(), 'utf8')); }
    async function frame() { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
    async function cell(x, y) { const b = await page.locator('#map-canvas').boundingBox(); return { x: b.x + (b.width - 512) / 2 + (x + .5) * 128, y: b.y + 40 + (b.height - 170 - 512) / 2 + (y + .5) * 128 }; }
    async function hover(x, y) { const p = await cell(x, y); await page.mouse.move(p.x, p.y); await frame(); }
    async function cursor() { await frame(); return page.locator('#viewport').evaluate(node => getComputedStyle(node).cursor); }
    const layer = name => page.getByRole('button', { name: `Select ${name} layer`, exact: true });
    async function png() { await page.locator('#export-map').click(); await page.locator('#export-grid').uncheck(); const event = page.waitForEvent('download'); await page.locator('#export-submit').click(); return readFile(await (await event).path()); }
    await openMap(fixture); await page.locator('#pack-select').selectOption('custom-grouped'); await hover(1, 1); assert.equal(await page.locator('#cursor-status').textContent(), '2, 2 · Objects, Walls, Ground'); await hover(0, 3); assert.equal(await page.locator('#cursor-status').textContent(), '1, 4');
    // Ctrl adds/removes individual layers; Shift selects the intervening range.
    await layer('Ground').click(); await layer('Objects').click({ modifiers: ['Control'] }); assert.equal(await page.locator('.layer-select[aria-pressed=true]').count(), 2);
    await layer('Objects').click({ modifiers: ['Control'] }); assert.equal(await page.locator('.layer-select[aria-pressed=true]').count(), 1); await layer('Objects').click({ modifiers: ['Control'] });
    await page.getByRole('button', { name: 'Select', exact: true }).click(); const a = await cell(0, 0), b = await cell(2, 2); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
    await hover(1, 1); assert.equal(await cursor(), 'grab'); await mkdir(root + '/.test-output', { recursive: true }); await page.screenshot({ path: root + '/.test-output/layer-group-selection.png' }); const start = await cell(1, 1), end = await cell(2, 1); await page.mouse.down(); assert.equal(await cursor(), 'grabbing'); await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
    let map = await saved(); assert.equal(map.layers[0].cells[5], null); assert.equal(map.layers[0].cells[6].tile, 'custom-grouped:0'); assert.equal(map.layers[0].cells[7].tile, 'custom-grouped:0'); assert.equal(map.layers[2].cells[6].tile, 'custom-grouped:2'); assert.equal(map.layers[2].cells[10].tile, 'custom-grouped:2'); assert.deepEqual(map.layers[1], fixture.layers[1]);
    const moved = structuredClone(map); await page.locator('#viewport').focus(); await page.keyboard.press('Delete'); map = await saved(); assert.equal(map.layers[0].cells.filter(Boolean).length, 0); assert.equal(map.layers[2].cells.filter(Boolean).length, 0); assert.deepEqual(map.layers[1], fixture.layers[1]); await page.locator('#undo').click(); assert.deepEqual((await saved()).layers, moved.layers); await page.locator('#undo').click(); assert.deepEqual((await saved()).layers, fixture.layers);
    await layer('Ground').click({ modifiers: ['Shift'] }); assert.equal(await page.locator('.layer-select[aria-pressed=true]').count(), 3);
    await page.getByRole('button', { name: 'Toggle Walls lock', exact: true }).click(); await page.locator('#viewport').focus(); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); map = await saved(); assert.equal(map.layers[0].cells.filter(Boolean).length, 0); assert.equal(map.layers[2].cells.filter(Boolean).length, 0); assert.equal(map.layers[1].cells[5].tile, 'custom-grouped:1'); await page.locator('#undo').click();
    // Native cursors describe the actual operation and blocked edits.
    await layer('Walls').click(); await page.getByRole('button', { name: 'Paint', exact: true }).click(); await hover(1, 1); assert.equal(await cursor(), 'not-allowed');
    await layer('Ground').click(); await hover(1, 1); assert.equal(await cursor(), 'crosshair'); await page.keyboard.down('Space'); assert.equal(await cursor(), 'grab'); await page.keyboard.up('Space'); assert.equal(await cursor(), 'crosshair');
    await page.getByRole('button', { name: 'Erase', exact: true }).click(); await hover(1, 1); assert.equal(await cursor(), 'cell'); await page.getByRole('button', { name: 'Pick tile', exact: true }).click(); await hover(1, 1); assert.equal(await cursor(), 'copy'); await hover(0, 3); assert.equal(await cursor(), 'not-allowed');
    const canvasBounds = await page.locator('#map-canvas').boundingBox(); await page.mouse.move(canvasBounds.x + 10, canvasBounds.y + 10); assert.equal(await cursor(), 'grab'); await page.mouse.down(); assert.equal(await cursor(), 'grabbing'); await page.mouse.move(canvasBounds.x + 20, canvasBounds.y + 10); await page.mouse.up(); await page.locator('#fit-map').click();
    // Library removal must not change any map layer, image pixels, or saved/exported artwork.
    await page.getByRole('button', { name: 'Paint', exact: true }).click(); const beforeDelete = await saved(), beforePNG = await png(); await openTilesets(page); await page.locator('#delete-pack').click(); assert.match(await page.locator('#delete-pack-warning').textContent(), /will stay/); await page.locator('#delete-pack-form button[type=submit]').click(); await closeTilesets(page);
    map = await saved(); assert.deepEqual(map.layers, beforeDelete.layers); assert.equal(map.packs.filter(pack => !pack.hidden).length, 0); assert.equal(await page.locator('#pack-select option[value=custom-grouped]').count(), 0); assert.ok((await png()).equals(beforePNG));
    map.name = 'Retained artwork'; await openMap(map); assert.deepEqual((await saved()).layers, beforeDelete.layers); assert.ok((await png()).equals(beforePNG)); await page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Saved locally in this browser'); await page.reload(); await page.waitForFunction(() => document.querySelector('#map-name').value === 'Retained artwork'); assert.ok((await png()).equals(beforePNG));
    // Picking retained art remains useful without putting the deleted set back in the library.
    await page.getByRole('button', { name: 'Pick tile', exact: true }).click(); await hover(1, 1); const picked = await cell(1, 1); await page.mouse.click(picked.x, picked.y); assert.equal(await page.locator('#selected-name').textContent(), 'Blue'); assert.equal(await page.locator('#pack-select option[value=custom-grouped]').count(), 0);
    assert.deepEqual(errors, []); console.log('Grouped edits, locked-layer protection, hover order, cursor states and retained art save/reload/export passed.');
  } finally { if (browser) await browser.close(); server.kill(); }
});
