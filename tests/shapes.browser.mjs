import { enableKenney } from './tileset-ui.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createMap } from '../src/model.js';

const root = fileURLToPath(new URL('../', import.meta.url));
test('Shape menu, filled/outline geometry, undo and inert right-click elsewhere', { timeout: 120000 }, async () => {
  const out = path.join(root, '.test-output'); await mkdir(out, { recursive: true });
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: '4189' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let browser;
  try {
    await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw Error('Test server exited'); })]);
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4189'); await enableKenney(page);
    const fixture = createMap(10, 10, 'Shape checks');
    await page.locator('#map-file').setInputFiles({ name: 'shape.vttmap.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => document.querySelector('#map-name').value === 'Shape checks'); await page.locator('#fit-map').click();
    async function cell(x, y) { const b = await page.locator('#map-canvas').boundingBox(), z = Math.max(.05, Math.min(2, (b.width - 96) / 640, (b.height - 170) / 640)), px = 64 * z; return [b.x + (b.width - 10 * px) / 2 + (x + .5) * px, b.y + 40 + (b.height - 170 - 10 * px) / 2 + (y + .5) * px]; }
    async function drag(x0, y0, x1, y1, button = 'left') { const a = await cell(x0, y0), b = await cell(x1, y1); await page.mouse.move(...a); await page.mouse.down({ button }); await page.mouse.move(...b, { steps: 8 }); await page.mouse.up({ button }); }
    async function saved() { const event = page.waitForEvent('download'); await page.locator('#save-map').click(); return JSON.parse(await readFile(await (await event).path(), 'utf8')); }
    async function choose(type) { await page.getByRole('button', { name: 'Shape', exact: true }).click({ button: 'right' }); await page.locator(`[data-shape=${type}]`).click(); }
    const occupied = data => data.layers[0].cells.filter(Boolean).length;
    assert.equal(await page.getByRole('button', { name: 'Rectangle', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Shape', exact: true }).click(); await drag(1, 1, 5, 5); assert.equal(occupied(await saved()), 25);
    await page.locator('#undo').click(); assert.equal(occupied(await saved()), 0); await page.locator('#redo').click(); assert.equal(occupied(await saved()), 25); await page.locator('#undo').click();
    await page.getByRole('button', { name: 'Shape', exact: true }).click({ button: 'right' });
    assert.equal(await page.getByRole('menu', { name: 'Shape options' }).isVisible(), true); assert.equal(await page.locator('#shape-menu [data-shape]').count(), 6);
    await page.screenshot({ path: path.join(out, 'shape-options.png') });
    await page.locator('[data-outline]').click(); assert.equal(await page.locator('[data-outline]').getAttribute('aria-checked'), 'true');
    await page.locator('[data-shape=rectangle]').click(); await drag(1, 1, 5, 5); let data = await saved(); assert.equal(occupied(data), 16); assert.equal(data.layers[0].cells[33], null); await page.locator('#undo').click();
    await page.getByRole('button', { name: 'Shape', exact: true }).click({ button: 'right' }); await page.locator('[data-outline]').click(); await page.locator('[data-shape=circle]').click();
    await drag(1, 1, 7, 5); data = await saved(); assert.equal(occupied(data), 21); assert.equal(data.layers[0].cells[11], null); await page.locator('#undo').click();
    await choose('ellipse'); await drag(1, 1, 7, 5); assert.ok(occupied(await saved()) > 21); await page.locator('#undo').click();
    await choose('diamond'); await drag(1, 1, 5, 5); assert.equal(occupied(await saved()), 13); await page.screenshot({ path: path.join(out, 'shape-diamond.png') }); await page.locator('#undo').click();
    await choose('triangle'); await drag(1, 1, 5, 5); data = await saved(); assert.equal(data.layers[0].cells.slice(50, 60).filter(Boolean).length, 5); await page.locator('#undo').click();
    await choose('line'); await drag(1, 1, 5, 5); const before = await saved(); assert.equal(occupied(before), 5);
    for (const name of ['Select', 'Paint', 'Erase', 'Flood fill', 'Shape', 'Pick tile', 'Move map']) {
      await page.getByRole('button', { name, exact: true }).click(); await drag(1, 1, 5, 5, 'right'); assert.deepEqual(await saved(), before, `${name} right-drag altered map`); assert.equal(await page.locator('#shape-menu').isVisible(), false);
    }
    await page.locator('#pack-select').click({ button: 'right' }); assert.equal(await page.locator('#rename-dialog').isVisible(), false);
    await page.locator('#pack-select').focus(); await page.keyboard.press('F2'); assert.equal(await page.locator('#rename-dialog').isVisible(), true); await page.locator('#rename-dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Shape', exact: true }).click({ button: 'right' }); assert.equal(await page.locator('[data-outline]').isDisabled(), true); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-shape=triangle]').getAttribute('aria-checked'), 'true'); assert.equal(await page.locator('#shape-menu').isVisible(), false);
    await page.setViewportSize({ width: 650, height: 760 }); await page.getByRole('button', { name: 'Shape', exact: true }).click({ button: 'right' });
    const bounds = await page.locator('#shape-menu').boundingBox(); assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 650 && bounds.y + bounds.height <= 760);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#shape-menu').isVisible(), false);
    assert.deepEqual(errors, []); console.log('All shape options, outlines, undo, keyboard menu and right-click restrictions passed.');
  } finally { if (browser) await browser.close(); server.kill(); }
});
