import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createMap, placement } from '../src/model.js';
import { openTilesets, closeTilesets } from './tileset-ui.mjs';

test('palette organization, contextual edition details and removable optional Kenney sets', { timeout: 120000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: '4195' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let browser;
  try {
    await once(server.stdout, 'data'); browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), errors = [];
    page.on('pageerror', error => errors.push(error.message)); await page.goto('http://127.0.0.1:4195'); await page.waitForSelector('.tile-button');
    assert.equal(await page.locator('#desktop-titlebar').isVisible(), false);
    assert.match(await page.locator('body').evaluate(node => getComputedStyle(node).fontFamily), /Silkscreen/);
    const ids = () => page.locator('.tile-button').evaluateAll(nodes => nodes.map(node => node.dataset.tile));
    const tile = id => page.locator(`.tile-button[data-tile="${id}"]`);
    const original = await ids(); assert.deepEqual(original.slice(0, 9), [0, 1, 2, 8, 9, 10, 16, 17, 18].map(i => `default-tiles:${i}`));
    async function saved() { await closeTilesets(page); const download = page.waitForEvent('download'); await page.locator('#save-map').click(); return JSON.parse(await readFile(await (await download).path(), 'utf8')); }
    async function openMap(map) { await page.locator('#map-file').setInputFiles({ name: 'palette.vttmap.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(map)) }); await page.waitForFunction(name => document.querySelector('#map-name').value === name, map.name); }
    const before = await saved();
    await tile(original[0]).dragTo(tile(original[2]), { targetPosition: { x: 65, y: 30 } });
    const arranged = await ids(); assert.deepEqual(arranged.slice(0, 3), [original[1], original[2], original[0]]); assert.deepEqual((await saved()).layers, before.layers);
    await tile(original[0]).focus(); await page.keyboard.press('Alt+ArrowLeft'); assert.deepEqual((await ids()).slice(0, 3), [original[1], original[0], original[2]]);
    const expected = await ids();
    await page.locator('#categories').getByRole('button', { name: 'Walls', exact: true }).click(); assert.ok((await ids()).every(id => !original.slice(0, 18).includes(id)));
    await page.locator('#categories').getByRole('button', { name: 'All', exact: true }).click(); assert.deepEqual(await ids(), expected);
    await page.locator('#new-map').click(); await page.locator('#new-form [name=name]').fill('Organized next project'); await page.locator('#new-form button[type=submit]').click(); await page.waitForFunction(() => document.querySelector('#map-name').value === 'Organized next project'); assert.deepEqual(await ids(), expected);
    await openTilesets(page); assert.equal(await page.locator('#free-edition-rules').textContent(), 'Free edition'); await page.locator('#free-edition-rules').click();
    assert.equal(await page.locator('#edition-dialog').isVisible(), true); assert.deepEqual(await page.locator('.edition-comparison thead th').allTextContents(), ['', 'Free web', 'Desktop']); await page.locator('#edition-dialog').getByRole('button', { name: 'Close', exact: true }).click();
    const backupDownload = page.waitForEvent('download'); await page.locator('#backup-library').click(); const backup = JSON.parse(await readFile(await (await backupDownload).path(), 'utf8')); assert.deepEqual(backup.tileOrders['default-tiles'], expected);
    await page.locator('#add-kenney').click(); await closeTilesets(page);
    const map = createMap(4, 4, 'Retained Kenney'); map.layers[0].cells[5] = placement('kenney:tiles.png'); map.layers[2].cells[10] = placement('tiny:48'); await openMap(map);
    await page.locator('#pack-select').selectOption('kenney-scribble'); await openTilesets(page); await page.locator('#delete-pack').click(); assert.match(await page.locator('#delete-pack-warning').textContent(), /Placed tiles will stay/);
    await page.locator('#delete-pack-form button[type=submit]').click(); await closeTilesets(page);
    assert.equal(await page.locator('#pack-select option[value=kenney-scribble]').count(), 0); assert.equal(await page.locator('#pack-select option[value=kenney-tiny]').count(), 1); assert.deepEqual((await saved()).layers, map.layers);
    await page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Saved locally in this browser'); await page.reload(); await page.waitForFunction(() => document.querySelector('#map-name').value === 'Retained Kenney'); assert.equal(await page.locator('#pack-select option[value=kenney-scribble]').count(), 0); assert.deepEqual((await saved()).layers, map.layers);
    await page.locator('#pack-select').selectOption('default-tiles'); assert.deepEqual(await ids(), expected);
    await openTilesets(page); assert.equal(await page.locator('#delete-pack').isVisible(), false); await page.locator('#add-kenney').click(); await closeTilesets(page); assert.equal(await page.locator('#pack-select option[value=kenney-scribble]').count(), 1);
    // Custom brushes can also be rearranged; their placement IDs never change.
    const source = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 16; const context = canvas.getContext('2d'); context.fillStyle = 'red'; context.fillRect(0, 0, 48, 16); return canvas.toDataURL(); });
    const custom = createMap(4, 4, 'Custom arrangement'); custom.packs = [{ id: 'custom-order', name: 'Arrange me', images: [{ id: 'source', data: source, width: 48, height: 16 }], tiles: [0, 1, 2].map(i => ({ id: `custom-order:${i}`, name: `Tile ${i}`, image: 'source', rect: [i * 16, 0, 16, 16], category: 'Custom' })) }]; custom.layers[0].cells[0] = placement('custom-order:0'); await openMap(custom);
    await page.locator('#pack-select').selectOption('custom-order'); await tile('custom-order:2').dragTo(tile('custom-order:0'), { targetPosition: { x: 8, y: 30 } }); assert.deepEqual(await ids(), ['custom-order:2', 'custom-order:0', 'custom-order:1']); assert.deepEqual((await saved()).layers, custom.layers);
    await page.setViewportSize({ width: 650, height: 760 }); await openTilesets(page); await page.locator('#free-edition-rules').click(); assert.equal(await page.locator('#edition-dialog').evaluate(node => node.scrollWidth <= node.clientWidth), true);
    await mkdir(root + '.test-output', { recursive: true }); await page.screenshot({ path: root + '.test-output/edition-details-650.png' }); assert.deepEqual(errors, []);
  } finally { if (browser) await browser.close(); server.kill(); }
});
