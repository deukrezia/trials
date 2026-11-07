import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enableKenney, defaultTileCount, openTilesets, closeTilesets, createTileset, openTileImport } from './tileset-ui.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputDir = path.join(root, '.test-output');

test('editor: paint, history, layers, import, portable save, PNG and restore', { timeout: 120000 }, async () => {
  await mkdir(outputDir, { recursive: true });
  const port = 4187;
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser;
  try {
    await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error('Test server exited.'); })]);
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`);
    await enableKenney(page);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('svg').evaluateAll(nodes => nodes.every(node => !!node.closest('.layer-toggle'))), true);
    assert.equal(await page.locator('button').evaluateAll(buttons => buttons.every(button => button.textContent.trim().length > 0 || button.getAttribute('aria-label'))), true);
    assert.equal(await page.locator('#brush-size, .layer-number, .mini-tag, .dock-heading, #tool-status, #map-stats, .active-layer-badge, .canvas-label').count(), 0);
    assert.deepEqual(await page.locator('.layer-select').allTextContents(), ['Objects', 'Walls', 'Ground']);
    assert.equal(await page.locator('#pack-select').textContent(), 'All tilesetsDefault TilesDefault Tiles 2Scribble DungeonsTiny Dungeon');
    assert.equal(await page.locator('body > .workspace').textContent().then(text => /Kenney|FREE|SELECT COMMAND|CLICK TO EQUIP/.test(text)), false);
    assert.equal(await page.evaluate(() => document.fonts.check('16px "Silkscreen"')), true);
    await page.screenshot({ path: path.join(outputDir, 'editor-desktop.png') });
    await page.locator('#pack-select').selectOption('kenney-tiny');
    assert.equal(await page.locator('.tile-button').count(), 132);
    assert.equal(await page.locator('#pack-select').inputValue(), 'kenney-tiny');
    assert.equal(await page.locator('.tile-button canvas.pixel-art').count(), 132);
    await page.screenshot({ path: path.join(outputDir, 'editor-tiny.png') });
    await page.locator('#pack-select').selectOption('all'); assert.equal(await page.locator('.tile-button').count(), 268 + defaultTileCount);
    await page.locator('#pack-select').selectOption('kenney-scribble');
    assert.equal(await page.locator('#map-name').inputValue(), 'Untitled dungeon');
    assert.equal(await page.locator('#undo').isDisabled(), true);
    await page.getByRole('button', { name: 'New map', exact: false }).click();
    await page.locator('#new-form [name=name]').fill('Browser test');
    await page.locator('#new-form [name=width]').fill('12'); await page.locator('#new-form [name=height]').fill('10');
    await page.getByRole('button', { name: 'Create map', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#dimensions').textContent === '12 × 10');
    await page.getByRole('button', { name: 'Tiles Center', exact: true }).click();
    const bounds = await page.locator('#map-canvas').boundingBox();
    // The fitted map is centered horizontally; center is safely in the blank map.
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2 + 8;
    await page.mouse.move(x - 30, y); await page.mouse.down(); await page.mouse.move(x + 90, y, { steps: 10 }); await page.mouse.up();
    assert.equal(await page.locator('#undo').isEnabled(), true);
    async function saveJSON() {
      await closeTilesets(page);
      const event = page.waitForEvent('download'); await page.locator('#save-map').click();
      const download = await event; return JSON.parse(await readFile(await download.path(), 'utf8'));
    }
    const painted = await saveJSON(); const count = painted.layers[0].cells.filter(Boolean).length; assert.ok(count >= 2);
    await page.locator('#undo').click(); assert.equal((await saveJSON()).layers[0].cells.filter(Boolean).length, 0);
    await page.locator('#redo').click(); assert.equal((await saveJSON()).layers[0].cells.filter(Boolean).length, count);
    await page.getByRole('button', { name: 'Toggle Ground lock', exact: true }).click();
    await page.mouse.click(x, y + 80); assert.equal((await saveJSON()).layers[0].cells.filter(Boolean).length, count);
    await page.getByRole('button', { name: 'Toggle Ground lock', exact: true }).click();
    await page.getByRole('button', { name: 'Select Objects layer', exact: true }).click();
    await page.mouse.click(x, y + 80); assert.equal((await saveJSON()).layers[2].cells.filter(Boolean).length, 1);
    // Right-click is inert; erasing requires choosing the eraser.
    await page.mouse.click(x, y + 80, { button: 'right' }); assert.equal((await saveJSON()).layers[2].cells.filter(Boolean).length, 1);
    await page.getByRole('button', { name: 'Erase', exact: true }).click(); await page.mouse.click(x, y + 80); assert.equal((await saveJSON()).layers[2].cells.filter(Boolean).length, 0);
    await page.locator('#undo').click();
    await page.getByRole('button', { name: 'Paint', exact: true }).click();
    await page.locator('#pack-select').selectOption('kenney-tiny');
    await page.mouse.click(x - 120, y + 80);
    assert.ok((await saveJSON()).layers[2].cells.some(cell => cell?.tile === 'tiny:48'));
    await createTileset(page, 'Imported stone');
    await openTileImport(page);
    await page.locator('#tile-files').setInputFiles(path.join(root, 'assets/kenney-scribble/tiles/tiles_center.png'));
    await page.waitForFunction(() => document.querySelector('#import-status').textContent.startsWith('1 tile brushes'));
    await page.locator('#import-form button[type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('#import-dialog').open);
    await closeTilesets(page);
    await page.locator('#rotate-brush').click(); await page.locator('#flip-brush').click();
    await page.mouse.click(x + 120, y + 80);
    const portable = await saveJSON(); assert.equal(portable.packs.length, 1); assert.match(portable.packs[0].images[0].data, /^data:image\/png;base64,/);
    assert.ok(portable.layers[2].cells.some(cell => cell?.tile.startsWith('custom-') && cell.rotation === 1 && cell.flip));
    // Export/import a reusable pack through its real download/file controls.
    await openTilesets(page); const packEvent = page.waitForEvent('download'); await page.locator('#save-pack').click();
    const packDownload = await packEvent; const packFile = await packDownload.path();
    await closeTilesets(page);
    await page.locator('#export-map').click(); const pngEvent = page.waitForEvent('download'); await page.locator('#export-form button[type=submit]').click();
    const png = await readFile(await (await pngEvent).path()); assert.equal(png.readUInt32BE(16), 12 * 64); assert.equal(png.readUInt32BE(20), 10 * 64);
    // Reload from a file, preserving embedded images and transformed placements.
    await page.locator('#map-file').setInputFiles({ name: 'roundtrip.vttmap.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(portable)) });
    await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Map opened.');
    assert.deepEqual(await saveJSON(), portable);
    await page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Saved locally in this browser');
    await page.reload(); await page.waitForFunction(() => document.querySelector('#map-name').value === 'Browser test' && document.querySelectorAll('.tile-button').length > 0);
    assert.deepEqual(await saveJSON(), portable);
    // Pack remains reusable in a fresh map with no previous custom assets.
    await page.locator('#new-map').click(); await page.getByRole('button', { name: 'Create map', exact: true }).click();
    await createTileset(page, 'Imported stone');
    await openTileImport(page); await page.locator('#pack-file').setInputFiles(packFile);
    await page.waitForFunction(() => !document.querySelector('#import-dialog').open);
    assert.equal((await saveJSON()).packs[0].name, 'Imported stone');
    await closeTilesets(page);
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.locator('#fit-map').click();
    await page.screenshot({ path: path.join(outputDir, 'editor-compact.png') });
    for (const width of [900, 650]) {
      await page.setViewportSize({ width, height: 760 }); await page.locator('#fit-map').click();
      await page.getByRole('button', { name: 'Brush and layers', exact: true }).click();
      assert.equal(await page.locator('#inspector').isVisible(), true);
      await page.getByRole('button', { name: 'Select Walls layer', exact: true }).click();
      assert.equal(await page.locator('.layer-row.active .layer-select').textContent(), 'Walls');
      await page.getByRole('button', { name: 'Close brush and layers', exact: true }).click();
      assert.equal(await page.locator('#inspector').isVisible(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const viewport = await page.locator('#viewport').boundingBox(), tools = await page.locator('#tools').boundingBox();
      assert.ok(tools.x >= viewport.x && tools.x + tools.width <= viewport.x + viewport.width);
      await page.screenshot({ path: path.join(outputDir, `editor-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    console.log('Headless browser checks passed; screenshots in .test-output.');
  } finally { if (browser) await browser.close(); server.kill(); }
});
