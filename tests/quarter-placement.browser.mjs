import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { createMap, placement } from '../src/model.js';

test('the right panel switches paint and erase between full cells and individual quarters', { timeout: 120000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: root, env: { ...process.env, PORT: '4200' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  let browser;
  try {
    await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error('Test server exited.'); })]);
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4200');
    await page.waitForSelector('.tile-button');
    const sections = page.locator('#inspector > section');
    assert.deepEqual(await sections.evaluateAll(nodes => nodes.map(node => node.className)),
      ['brush-section', 'placement-section', 'layers-section']);
    const full = page.getByRole('button', { name: 'Full', exact: true });
    const quarter = page.getByRole('button', { name: 'Quarter', exact: true });
    assert.equal(await full.getAttribute('aria-pressed'), 'true');

    const map = createMap(8, 8, 'Quarter brush checks');
    const sheet = new PNG({ width: 32, height: 16 });
    for (let x = 0; x < 32; x++) for (let y = 0; y < 16; y++) {
      const i = (y * 32 + x) * 4;
      sheet.data[i + (x < 16 ? 0 : 2)] = 255;
      sheet.data[i + 3] = 255;
    }
    const red = 'custom-quarter:0', blue = 'custom-quarter:1';
    map.packs.push({
      id: 'custom-quarter', name: 'Quarter colors',
      images: [{ id: 'sheet', width: 32, height: 16, data: 'data:image/png;base64,' + PNG.sync.write(sheet).toString('base64') }],
      tiles: [red, blue].map((id, i) => ({ id, name: id, image: 'sheet', rect: [i * 16, 0, 16, 16], pixelArt: true }))
    });
    const openMap = async value => {
      await page.locator('#map-file').setInputFiles({ name: 'quarter.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
      await page.waitForFunction(name => document.querySelector('#map-name').value === name, value.name);
    };
    const saveMap = async () => {
      const event = page.waitForEvent('download');
      await page.locator('#save-map').click();
      return JSON.parse(await readFile(await (await event).path(), 'utf8'));
    };
    await openMap(map);
    await page.locator('#fit-map').click();
    const box = await page.locator('#map-canvas').boundingBox();
    const px = Math.min(128, (box.width - 96) / 8, (box.height - 170) / 8);
    const left = box.x + (box.width - 8 * px) / 2, top = box.y + 40 + (box.height - 170 - 8 * px) / 2;
    const point = (x, y) => [left + x * px, top + y * px];
    await page.locator('#pack-select').selectOption('custom-quarter');
    await page.locator('[data-tile="custom-quarter:0"]').click();
    await page.mouse.click(...point(2.25, 2.25));
    await quarter.click();
    await page.locator('[data-tile="custom-quarter:1"]').click();
    await page.mouse.move(...point(2.25, 2.25));
    await page.mouse.down();
    await page.mouse.move(...point(3.25, 2.25));
    await page.mouse.up();
    await page.mouse.click(...point(2.75, 2.75));
    const painted = await saveMap();
    assert.deepEqual(painted.layers[0].cells[18], { ...placement(red), quarters: [placement(blue), placement(blue), null, placement(blue)] });
    assert.deepEqual(painted.layers[0].cells[19], { quarters: [placement(blue), null, null, null] });
    await page.getByRole('button', { name: 'Erase', exact: true }).click();
    await page.mouse.click(...point(2.25, 2.25));
    assert.deepEqual((await saveMap()).layers[0].cells[18], { ...placement(red), quarters: [null, placement(blue), null, placement(blue)] });
    await page.locator('#undo').click();
    assert.deepEqual((await saveMap()).layers, painted.layers);
    await openMap({ ...painted, name: 'Quarter brush saved' });
    await page.locator('#export-map').click();
    await page.locator('#export-size').fill('16');
    await page.locator('#export-grid').uncheck();
    await page.locator('#export-transparent').check();
    const exported = page.waitForEvent('download');
    await page.locator('#export-submit').click();
    const png = PNG.sync.read(await readFile(await (await exported).path()));
    const pixel = (x, y) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)];
    assert.deepEqual(pixel(33, 33), [0, 0, 255, 255]);
    assert.deepEqual(pixel(41, 33), [0, 0, 255, 255]);
    assert.deepEqual(pixel(33, 41), [255, 0, 0, 255]);
    assert.deepEqual(pixel(41, 41), [0, 0, 255, 255]);
    assert.deepEqual(pixel(55, 42), [0, 0, 0, 0]);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
});
