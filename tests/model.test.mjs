import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMap, History, placement, line, sliceSheet, validateMap, makeDemo, deletePack, libraryPacks } from '../src/model.js';

const builtin = JSON.parse(await readFile(new URL('../assets/kenney-scribble/pack.json', import.meta.url)));
const tiny = JSON.parse(await readFile(new URL('../assets/kenney-tiny/pack.json', import.meta.url)));
const builtinIds = [...builtin.tiles, ...tiny.tiles].map(tile => tile.id);
const tile = placement(builtinIds[0]);
const image = { id: 'image-0', data: 'data:image/png;base64,AAAA', width: 128, height: 64 };
function customPack() { return { id: 'custom-test', name: 'My brush', images: [image], tiles: [{ id: 'custom-test:0', name: 'Custom floor', category: 'Custom', image: 'image-0', rect: [0, 0, 64, 64] }] }; }

test('deleting a custom tileset preserves placements on all layers and embeds their art outside the library', () => {
  const map = createMap(8, 8), history = new History(map); map.packs.push(customPack());
  map.layers.forEach((layer, i) => { layer.cells[i] = placement('custom-test:0', i, true); layer.cells[9] = tile; });
  map.layers[1].locked = true; map.layers[2].visible = false; const before = structuredClone(map);
  assert.equal(deletePack(history, 'custom-test'), true); assert.equal(libraryPacks(map).length, 0); assert.equal(map.packs[0].hidden, true);
  assert.deepEqual(map.layers, before.layers); assert.deepEqual(map.packs[0].images, before.packs[0].images);
  assert.deepEqual(validateMap(map, builtinIds), map); assert.equal(history.undoStack.length, 1);
  history.undo(); assert.deepEqual(map, before); history.redo(); assert.equal(libraryPacks(map).length, 0); history.undo(); assert.deepEqual(map, before);
});

test('deleting an unused tileset remains undoable and preserves surrounding paint history', () => {
  const map = createMap(8, 8), history = new History(map); map.packs.push(customPack());
  history.begin(0); history.set(1, 1, tile); history.commit();
  deletePack(history, 'custom-test'); assert.equal(map.packs.length, 0); assert.deepEqual(map.layers[0].cells[9], tile);
  history.undo(); assert.deepEqual(map.packs, [customPack()]); history.undo(); assert.equal(map.layers[0].cells[9], null);
  history.redo(); history.redo(); assert.equal(map.packs.length, 0); assert.deepEqual(map.layers[0].cells[9], tile);
});

test('deleting a default or missing tileset is rejected without changing the map or history', () => {
  const map = createMap(8, 8), history = new History(map), before = structuredClone(map);
  for (const id of ['kenney-tiny', 'kenney-scribble', 'missing']) assert.throws(() => deletePack(history, id), /custom tileset/);
  assert.deepEqual(map, before); assert.equal(history.undoStack.length, 0);
});

test('one continuous stroke is one undo step, including repeated cell edits', () => {
  const map = createMap(10, 10), history = new History(map);
  history.begin(0);
  for (const [x, y] of line(0, 0, 9, 9)) history.brush(x, y, tile);
  history.set(0, 0, placement(builtinIds[1], 3, true));
  assert.equal(history.commit(), true); assert.equal(history.undoStack.length, 1);
  assert.equal(map.layers[0].cells.filter(Boolean).length, 10);
  history.undo(); assert.equal(map.layers[0].cells.filter(Boolean).length, 0);
  history.redo(); assert.deepEqual(map.layers[0].cells[0], placement(builtinIds[1], 3, true));
});
test('cancel restores original cells; empty strokes preserve redo', () => {
  const map = createMap(8, 8), h = new History(map);
  h.begin(0); h.set(2, 2, tile); h.commit(); h.undo();
  h.begin(0); h.set(2, 2, tile); h.cancel();
  assert.equal(map.layers[0].cells[18], null); assert.equal(h.redoStack.length, 1);
  h.begin(0); assert.equal(h.commit(), false); assert.equal(h.redoStack.length, 1);
});
test('flood fill respects connected regions and layers', () => {
  const map = createMap(10, 10), h = new History(map);
  h.begin(0); h.rectangle(5, 0, 5, 9, tile); h.commit();
  const paint = placement(builtinIds[1]); h.begin(0); h.fill(0, 0, paint); h.commit();
  assert.equal(map.layers[0].cells.filter(cell => cell?.tile === paint.tile).length, 50);
  assert.equal(map.layers[0].cells[6], null); assert.equal(map.layers[1].cells.filter(Boolean).length, 0);
  h.undo(); assert.equal(map.layers[0].cells.filter(Boolean).length, 10);
});
test('brush and rectangle clip to map edges and respect locked or hidden layers', () => {
  const map = createMap(4, 4), h = new History(map);
  h.begin(1); h.brush(0, 0, tile, 3); h.commit(); assert.equal(map.layers[1].cells.filter(Boolean).length, 4);
  map.layers[1].locked = true; h.begin(1); h.rectangle(0, 0, 3, 3, null); assert.equal(h.commit(), false);
  map.layers[0].visible = false; h.begin(0); h.fill(0, 0, tile); assert.equal(h.commit(), false);
});
test('large flood fill does not recurse and redo branches are discarded', () => {
  const map = createMap(200, 200), h = new History(map);
  h.begin(0); h.fill(0, 0, tile); h.commit(); assert.equal(map.layers[0].cells.filter(Boolean).length, 40000);
  h.undo(); h.begin(0); h.set(2, 2, tile); h.commit(); assert.equal(h.redo(), false);
});
test('sprite sheet slicing handles margins, spacing and incomplete edges', () => {
  assert.equal(sliceSheet(203, 186, 16, 16, 1).length, 132);
  assert.deepEqual(sliceSheet(70, 36, 32, 32, 2, 1), [[1, 1, 32, 32], [35, 1, 32, 32]]);
  assert.throws(() => sliceSheet(64, 64, 128, 128)); assert.throws(() => sliceSheet(8192, 8192, 1, 1));
});
test('map round trip preserves imported images, transforms and layer state', () => {
  const map = createMap(8, 8, 'A saved map'); map.packs.push(customPack()); map.layers[2].cells[20] = placement('custom-test:0', 3, true); map.layers[1].visible = false;
  assert.deepEqual(validateMap(JSON.parse(JSON.stringify(map)), builtinIds), map);
});

test('empty custom tilesets and explicit rendering preferences survive map validation', () => {
  const map = createMap(8, 8); map.packs = [{ id: 'custom-empty', name: 'Waiting for tiles', images: [], tiles: [] }, customPack()];
  assert.deepEqual(validateMap(map, builtinIds), map);
  for (const pixelArt of [true, false]) { map.packs[1].tiles[0].pixelArt = pixelArt; assert.deepEqual(validateMap(map, builtinIds), map); }
  map.packs[1].tiles[0].pixelArt = 'yes'; assert.throws(() => validateMap(map, builtinIds), /rendering preference/);
});
test('validation rejects missing assets, external images, duplicate tiles and invalid geometry', () => {
  const base = createMap(8, 8); base.packs.push(customPack());
  for (const mutate of [map => map.layers[0].cells[0] = placement('not-present'), map => map.packs[0].images[0].data = 'https://example.com/tracker.png', map => map.packs[0].tiles[0].rect = [100, 0, 64, 64], map => map.packs[0].tiles.push(map.packs[0].tiles[0]), map => map.layers[1].cells.pop(), map => map.width = 1, map => map.version = 99]) {
    const map = structuredClone(base); mutate(map); assert.throws(() => validateMap(map, builtinIds));
  }
});
test('all demo tiles refer to existing bundled artwork', () => {
  const map = makeDemo(); assert.doesNotThrow(() => validateMap(map, builtinIds)); assert.ok(map.layers.every(layer => layer.cells.some(Boolean)));
});
test('catalog source rectangles match actual local PNG dimensions', async () => {
  for (const tile of builtin.tiles) {
    const png = await readFile(new URL(`../${tile.src}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 64, tile.src); assert.equal(png.readUInt32BE(20), 64, tile.src);
  }
});
test('Tiny Dungeon atlas regions have correct spacing, bounds, stable IDs, and pixel rendering', async () => {
  const png = await readFile(new URL('../assets/kenney-tiny/tilemap.png', import.meta.url));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(tiny.tiles.length, 132); assert.equal(new Set(builtinIds).size, 268);
  for (const [i, tile] of tiny.tiles.entries()) {
    assert.deepEqual(tile.rect, [(i % 12) * 17, Math.floor(i / 12) * 17, 16, 16]);
    assert.ok(tile.rect[0] + 16 <= width && tile.rect[1] + 16 <= height); assert.equal(tile.pixelArt, true);
  }
  const map = createMap(8, 8); map.layers[0].cells[0] = placement('tiny:48'); map.layers[2].cells[1] = placement('kenney:crate.png');
  assert.deepEqual(validateMap(JSON.parse(JSON.stringify(map)), builtinIds), map);
});
