import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMap, placement } from '../src/model.js';
import { enableKenney, defaultTileCount, openTilesets, closeTilesets, openTileImport } from './tileset-ui.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)), out = path.join(root, '.test-output');
test('selection, implicit pan, resize, content shift, renamed sets, VTT and print exports', { timeout: 120000 }, async () => {
  await mkdir(out, { recursive: true });
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: '4188' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser;
  try {
    await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw Error('Test server exited.'); })]);
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4188'); await enableKenney(page);
    assert.equal(await page.locator('[data-tool=pan], #tile-search, #rename-pack, #map-edges, .map-edge, #edge-size-preview').count(), 0);
    await page.locator('#export-map').click(); assert.equal(await page.locator('#export-grid').isChecked(), true); await page.locator('#export-dialog [data-close]').first().click();
    await page.locator('#print-map').click(); assert.equal(await page.locator('#print-grid').isChecked(), true); await page.locator('#print-dialog [data-close]').first().click();
    assert.equal(await page.locator('#tools button').first().getAttribute('data-tool'), 'select');
    assert.equal(await page.locator('#map-settings-dialog #export-form, #map-settings-dialog #print-form, #export-mode, #resize-anchor').count(), 0);
    assert.equal(await page.locator('#tile-grid').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 3);
    // Selecting text and releasing on the backdrop must preserve every dialog and its edits.
    for (const [opener, id, field, value] of [
      ['#new-map', 'new-dialog', '[name=name]', 'A map name in progress'],
      ['#new-tileset', 'new-tileset-dialog', '#new-tileset-name', 'Custom brushes in progress'],
      ['#map-settings', 'map-settings-dialog', '#resize-width', '12'],
      ['#export-map', 'export-dialog', '#export-size', '70'],
      ['#print-map', 'print-dialog', '#print-cell-size', '0.5'],
      [null, 'rename-dialog', '#pack-name', 'Renaming in progress'],
      ['#help', 'help-dialog', 'h2', null],
    ]) {
      if (opener) { if (opener === '#new-tileset') await openTilesets(page); await page.locator(opener).click(); }
      else { await page.locator('#pack-select').focus(); await page.keyboard.press('F2'); }
      const dialog = page.locator(`#${id}`), control = dialog.locator(field);
      if (value !== null) await control.fill(value);
      const bounds = await control.boundingBox(), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(4, 4, { steps: 8 }); await page.mouse.up();
      assert.equal(await dialog.isVisible(), true, `${id} closed when a selection drag ended outside`);
      if (value !== null) assert.equal(await control.inputValue(), value);
      // The reverse gesture is not a backdrop click either.
      await page.mouse.down(); await page.mouse.move(x, y, { steps: 8 }); await page.mouse.up();
      assert.equal(await dialog.isVisible(), true, `${id} closed when an outside drag ended inside`);
      await page.mouse.click(4, 4, { button: 'right' }); assert.equal(await dialog.isVisible(), true);
      await page.mouse.click(4, 4); assert.equal(await dialog.isVisible(), false, `${id} no longer dismisses on a deliberate backdrop click`);
      await closeTilesets(page);
    }
    const a = 'kenney:tiles.png', b = 'kenney:wood.png', c = 'kenney:grass.png';
    const fixture = createMap(8, 8, 'Selection test'); fixture.layers[0].cells[18] = placement(a); fixture.layers[0].cells[19] = placement(b); fixture.layers[0].cells[26] = placement(c); fixture.layers[2].cells[54] = placement('kenney:crate.png'); fixture.layers[1].cells[33] = placement('kenney:wall.png'); fixture.layers[1].locked = true; fixture.layers[1].visible = false;
    async function openMap(value) {
      await page.locator('#map-file').setInputFiles({ name: 'test.vttmap.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
      await page.waitForFunction(name => document.querySelector('#map-name').value === name, value.name);
      await page.locator('#fit-map').click();
    }
    async function saveMap() { await closeTilesets(page); const waiting = page.waitForEvent('download'); await page.locator('#save-map').click(); return JSON.parse(await readFile(await (await waiting).path(), 'utf8')); }
    async function cell(x, y, width = 8, height = 8) {
      const bounds = await page.locator('#map-canvas').boundingBox();
      const zoom = Math.max(.05, Math.min(2, (bounds.width - 96) / (width * 64), (bounds.height - 170) / (height * 64))), pixels = zoom * 64;
      return { x: bounds.x + (bounds.width - width * pixels) / 2 + (x + .5) * pixels, y: bounds.y + 40 + (bounds.height - 170 - height * pixels) / 2 + (y + .5) * pixels };
    }
    await openMap(fixture);
    // RPG Map's dedicated whole-map drag mode moves data, including hidden/locked layers.
    await page.getByRole('button', { name: 'Move map', exact: true }).click();
    const moveStart = await cell(1, 1), moveEnd = await cell(2, 2);
    await page.mouse.move(moveStart.x, moveStart.y); await page.mouse.down(); await page.mouse.move(moveEnd.x, moveEnd.y, { steps: 8 }); await page.mouse.up();
    let movedMap = await saveMap(); assert.equal(movedMap.width, 8); assert.equal(movedMap.height, 8);
    assert.deepEqual(movedMap.layers[0].cells[27], placement(a)); assert.deepEqual(movedMap.layers[1].cells[42], placement('kenney:wall.png')); assert.deepEqual(movedMap.layers[2].cells[63], placement('kenney:crate.png'));
    await page.locator('#undo').click(); assert.deepEqual((await saveMap()).layers, fixture.layers);
    await page.locator('#redo').click();
    // Overflow stays pending until explicitly confirmed; every dismissal preserves data/history.
    async function cropDrag() { await page.mouse.move(moveStart.x, moveStart.y); await page.mouse.down(); await page.mouse.move(moveEnd.x, moveEnd.y, { steps: 8 }); await page.mouse.up(); }
    await cropDrag();
    assert.equal(await page.locator('#move-confirm-dialog').isVisible(), true);
    assert.match(await page.locator('#move-crop-warning').textContent(), /remove 1 tile outside/);
    assert.equal(await page.locator('#move-confirm-dialog').getByRole('button', { name: 'Cancel', exact: true }).evaluate(node => node === document.activeElement), true);
    await page.screenshot({ path: path.join(out, 'move-map-confirmation.png') });
    await page.keyboard.press('Escape'); assert.deepEqual((await saveMap()).layers, movedMap.layers);
    await page.locator('#undo').click(); assert.deepEqual((await saveMap()).layers, fixture.layers); await page.locator('#redo').click();
    await cropDrag(); await page.locator('#move-confirm-dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); assert.deepEqual((await saveMap()).layers, movedMap.layers);
    await cropDrag(); await page.mouse.click(4, 4); assert.deepEqual((await saveMap()).layers, movedMap.layers);
    await cropDrag(); await page.locator('#move-confirm-form button[type=submit]').click();
    assert.equal((await saveMap()).layers[2].cells.filter(Boolean).length, 0);
    await page.locator('#undo').click(); assert.deepEqual((await saveMap()).layers[2].cells[63], placement('kenney:crate.png'));
    await page.locator('#redo').click(); assert.equal((await saveMap()).layers[2].cells.filter(Boolean).length, 0); await page.locator('#undo').click();
    await page.locator('#undo').click(); assert.deepEqual((await saveMap()).layers, fixture.layers);
    const hiddenCrop = createMap(8, 8, 'Hidden layers crop');
    hiddenCrop.layers.forEach((layer, i) => { layer.cells[0] = placement(a); layer.locked = true; layer.visible = i === 0; });
    await openMap(hiddenCrop);
    await page.mouse.move(moveEnd.x, moveEnd.y); await page.mouse.down(); await page.mouse.move(moveStart.x, moveStart.y, { steps: 8 }); await page.mouse.up();
    assert.match(await page.locator('#move-crop-warning').textContent(), /remove 3 tiles outside/);
    await page.locator('#move-confirm-form button[type=submit]').click(); assert.ok((await saveMap()).layers.every(layer => layer.cells.every(cell => !cell)));
    await page.locator('#undo').click(); assert.deepEqual((await saveMap()).layers, hiddenCrop.layers);
    await openMap(fixture);
    // Escape cancels a whole-map drag without adding a history entry.
    await page.mouse.move(moveStart.x, moveStart.y); await page.mouse.down(); await page.mouse.move(moveEnd.x, moveEnd.y, { steps: 5 }); await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual((await saveMap()).layers, fixture.layers);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    const start = await cell(1, 1), end = await cell(4, 4);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
    assert.equal(await page.locator('#selected-name').textContent(), 'Selection');
    await page.locator('#rotate-brush').click();
    let saved = await saveMap(); assert.deepEqual(saved.layers[0].cells[19], placement(a, 1)); assert.deepEqual(saved.layers[0].cells[27], placement(b, 1)); assert.deepEqual(saved.layers[0].cells[18], placement(c, 1));
    await page.locator('#flip-brush').click(); saved = await saveMap(); assert.deepEqual(saved.layers[0].cells[18], placement(a, 3, true));
    await page.locator('#viewport').focus(); await page.keyboard.press('ArrowRight'); saved = await saveMap(); assert.deepEqual(saved.layers[0].cells[19], placement(a, 3, true));
    const from = await cell(3, 2), to = await cell(4, 3);
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
    saved = await saveMap(); assert.deepEqual(saved.layers[0].cells[28], placement(a, 3, true)); assert.equal(saved.layers[0].cells.filter(Boolean).length, 3);
    await page.locator('#viewport').focus(); await page.keyboard.press('Delete'); assert.equal((await saveMap()).layers[0].cells.filter(Boolean).length, 0);
    await page.locator('#undo').click(); assert.deepEqual((await saveMap()).layers[0].cells, saved.layers[0].cells);
    // Selection cancellation and automatic view panning do not edit the saved grid.
    await page.locator('#viewport').focus(); await page.keyboard.press('Escape');
    const beforePan = await page.locator('#map-canvas').evaluate(node => node.toDataURL());
    await page.keyboard.down('Space'); await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + 65, from.y + 35, { steps: 5 }); await page.mouse.up(); await page.keyboard.up('Space');
    assert.notEqual(await page.locator('#map-canvas').evaluate(node => node.toDataURL()), beforePan); assert.deepEqual((await saveMap()).layers[0].cells, saved.layers[0].cells); await page.locator('#fit-map').click();
    // Default-set aliases are persisted without changing tile IDs.
    await openTilesets(page); assert.equal(await page.locator('#delete-pack').isVisible(), true); assert.equal(await page.locator('#delete-pack').textContent(), 'Remove tileset'); assert.equal(await page.locator('#save-pack').isVisible(), false);
    await page.locator('#rename-tileset').click(); await page.locator('#pack-name').fill('Stone set'); await page.locator('#rename-form button[type=submit]').click();
    assert.equal(await page.locator('#pack-select option:checked').textContent(), 'Stone set'); assert.equal((await saveMap()).packNames['kenney-scribble'], 'Stone set');
    await page.locator('#map-settings').click(); await page.locator('#resize-width').fill('10'); await page.locator('#resize-height').fill('10'); await page.locator('#resize-form button[type=submit]').click();
    assert.equal((await saveMap()).width, 10);
    await page.locator('#undo').click(); assert.equal((await saveMap()).width, 8); await page.locator('#redo').click(); assert.equal((await saveMap()).width, 10);
    await page.locator('#export-map').click(); await page.locator('#export-size').fill('70'); await page.locator('#export-grid').check();
    const pngEvent = page.waitForEvent('download'); await page.locator('#export-submit').click(); const png = await readFile(await (await pngEvent).path());
    assert.equal((await saveMap()).settings.pixelsPerCell, 70);
    assert.equal(png.readUInt32BE(16), 700); assert.equal(png.readUInt32BE(20), 700);
    const gridPixel = await page.evaluate(async bytes => { const img = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' })); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); return [...ctx.getImageData(70, 600, 1, 1).data]; }, [...png]);
    assert.notDeepEqual(gridPixel.slice(0, 3), [56, 61, 57]);
    // Print at one physical inch per map cell, paginated rather than scaled down.
    await page.locator('#print-map').click(); await page.locator('#print-paper').selectOption('letter'); await page.locator('#print-dpi').selectOption('100');
    assert.match(await page.locator('#print-dimensions').textContent(), /^4 pages/);
    await page.screenshot({ path: path.join(out, 'map-settings-print.png') });
    const pdfEvent = page.waitForEvent('download'); await page.locator('#print-submit').click(); const pdf = await readFile(await (await pdfEvent).path());
    assert.ok(pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))); assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 4);
    await writeFile(path.join(out, 'map-tools-print.pdf'), pdf);
    // Higher DPI changes image sampling, not PDF grid geometry or physical scale.
    await page.locator('#print-map').click(); await page.locator('#print-paper').selectOption('a4'); await page.locator('#print-orientation').selectOption('landscape'); await page.locator('#print-cell-size').fill('0.5'); await page.locator('#print-dpi').selectOption('300');
    assert.match(await page.locator('#print-dimensions').textContent(), /^1 pages/);
    const halfEvent = page.waitForEvent('download'); await page.locator('#print-submit').click(); await writeFile(path.join(out, 'map-tools-print-half.pdf'), await readFile(await (await halfEvent).path()));
    // A filled floor must still allow marquee selection from any unselected tile.
    const filled = createMap(8, 8, 'Filled selection test'); filled.layers[0].cells.fill(placement(a)); await openMap(filled);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    const fullStart = await cell(1, 1), fullEnd = await cell(3, 2);
    await page.mouse.move(fullStart.x, fullStart.y); await page.mouse.down(); await page.mouse.move(fullEnd.x, fullEnd.y, { steps: 6 }); await page.mouse.up();
    await page.locator('#viewport').focus(); await page.keyboard.press('Delete'); assert.equal((await saveMap()).layers[0].cells.filter(Boolean).length, 58); await page.locator('#undo').click();
    // Custom-only workspaces have no default filters or Kenney attribution.
    const custom = createMap(8, 8, 'Custom-only map'), raw = await readFile(path.join(root, 'assets/kenney-scribble/tiles/tiles_center.png'));
    custom.packs = [{ id: 'custom-only', name: 'My art', images: [{ id: 'image-0', data: `data:image/png;base64,${raw.toString('base64')}`, width: 64, height: 64 }], tiles: [{ id: 'custom-only:0', name: 'My tile', image: 'image-0', category: 'Custom', rect: [0, 0, 64, 64] }] }]; custom.layers.forEach((layer, i) => { layer.cells[9 + i] = placement('custom-only:0', i, true); }); custom.layers[1].locked = true; custom.layers[1].visible = false;
    await openMap(custom); await page.locator('#pack-select').selectOption('custom-only');
    assert.equal(await page.locator('#categories').isVisible(), false); assert.equal(await page.locator('#help-dialog #kenney-credit').count(), 0);
    await openTilesets(page); await page.locator('#rename-tileset').click(); await page.locator('#pack-name').fill('Renamed art'); await page.locator('#rename-form button[type=submit]').click();
    assert.equal((await saveMap()).packs[0].name, 'Renamed art');
    await page.locator('#pack-select').selectOption('kenney-tiny'); assert.equal(await page.locator('#categories').isVisible(), true); assert.equal(await page.locator('#tileset-manager-dialog #kenney-credit').count(), 1);
    await page.getByRole('button', { name: 'Paint', exact: true }).click(); const paint = await cell(2, 2); await page.mouse.click(paint.x, paint.y); await page.locator('#pack-select').selectOption('custom-only'); assert.equal(await page.locator('#kenney-credit').getAttribute('hidden'), null);
    await page.screenshot({ path: path.join(out, 'map-tools-custom.png') });
    // The selector's focus stays within its bounds and cannot cover the first custom tile.
    await page.locator('#pack-select').focus();
    assert.equal(await page.locator('#pack-select').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    const selectorBounds = await page.locator('#pack-select').boundingBox(), tileBounds = await page.locator('.tile-button').first().boundingBox(); assert.ok(tileBounds.y >= selectorBounds.y + selectorBounds.height);
    const beforeDelete = await saveMap();
    await openTilesets(page); await page.screenshot({ path: path.join(out, 'tileset-manager.png') });
    await page.locator('#delete-pack').click();
    assert.match(await page.locator('#delete-pack-warning').textContent(), /already placed on the map will stay/);
    await page.locator('#delete-pack-dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); assert.deepEqual(await saveMap(), beforeDelete);
    await openTilesets(page); await page.locator('#delete-pack').click();
    await page.locator('#delete-pack-form button[type=submit]').click();
    let deleted = await saveMap(); assert.equal(deleted.packs.filter(pack => !pack.hidden).length, 0); assert.deepEqual(deleted.layers, beforeDelete.layers);
    assert.equal(await page.locator('#pack-select option[value=custom-only]').count(), 0);
    await page.locator('#undo').click(); assert.deepEqual(await saveMap(), beforeDelete);
    await page.locator('#pack-select').selectOption('custom-only');
    const restoredBrush = await page.locator('#brush-preview').evaluate(node => node.toDataURL());
    await page.locator('#redo').click(); assert.equal((await saveMap()).packs.filter(pack => !pack.hidden).length, 0);
    // Appending art with the same source IDs must preserve existing tiles and remain undoable.
    await page.locator('#undo').click(); await page.locator('#pack-select').selectOption('custom-only');
    const alternate = structuredClone(beforeDelete.packs[0]), alternateRaw = await readFile(path.join(root, 'assets/kenney-scribble/tiles/grass.png'));
    alternate.images[0].data = `data:image/png;base64,${alternateRaw.toString('base64')}`;
    await openTileImport(page); await page.locator('#pack-file').setInputFiles({ name: 'alternate.brushpack.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'vtt-brush-pack', version: 1, pack: alternate })) });
    await page.waitForFunction(() => !document.querySelector('#import-dialog').open);
    assert.notEqual(await page.locator('#brush-preview').evaluate(node => node.toDataURL()), restoredBrush);
    const appended = await saveMap(); assert.equal(appended.packs.length, 1); assert.equal(appended.packs[0].tiles.length, 2); assert.deepEqual(appended.packs[0].tiles[0], beforeDelete.packs[0].tiles[0]);
    await page.locator('#undo').click(); assert.deepEqual(await saveMap(), beforeDelete);
    await page.locator('#pack-select').selectOption('custom-only'); assert.equal(await page.locator('#brush-preview').evaluate(node => node.toDataURL()), restoredBrush);
    // Unused sets can be deleted too, with keyboard-accessible manager controls.
    const unused = createMap(8, 8, 'Unused custom set'); unused.packs = structuredClone(custom.packs); await openMap(unused); await page.locator('#pack-select').selectOption('custom-only'); const unusedSharedPacks = (await saveMap()).packs;
    await openTilesets(page); await page.locator('#delete-pack').focus(); await page.keyboard.press('Enter');
    assert.match(await page.locator('#delete-pack-warning').textContent(), /Remove/); await page.keyboard.press('Escape'); assert.equal((await saveMap()).packs.length, 1);
    await openTilesets(page); await page.locator('#delete-pack').click(); await page.locator('#delete-pack-form button[type=submit]').click(); assert.equal((await saveMap()).packs.length, 0);
    await page.locator('#undo').click(); assert.deepEqual((await saveMap()).packs, unusedSharedPacks); await page.locator('#pack-select').selectOption('custom-only');
    await openTilesets(page); await page.keyboard.press('Escape'); assert.equal(await page.locator('#tileset-manager-dialog').isVisible(), false);
    await page.locator('#pack-select').selectOption('all'); assert.equal(await page.locator('#manage-tilesets').isEnabled(), true); await openTilesets(page); assert.equal(await page.locator('#managed-tileset-name').textContent(), 'Renamed art'); await closeTilesets(page);
    assert.deepEqual(errors, []);
    console.log('Dialog drag dismissal, crop confirmation/cancellation, selection, map settings, palette, rename, credit, VTT and PDF checks passed.');
  } finally { if (browser) await browser.close(); server.kill(); }
});
