import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap, History, placement, tilesetImports, deleteImport, validateMap, libraryTiles, exportablePack } from '../src/model.js';

function fixture() {
  const map = createMap(8, 8);
  map.packs = [{ id: 'custom-main', name: 'My collection', images: [0, 1].map(i => ({ id: `image-${i}`, data: 'data:image/png;base64,AAAA', width: 64, height: 32 })), tiles: [0, 1, 2].map(i => ({ id: `custom-main:${i}`, image: `image-${i === 2 ? 1 : 0}`, name: `Floors ${String(i + 1).padStart(3, '0')}`, category: 'Custom', rect: [i === 1 ? 32 : 0, 0, 32, 32], pixelArt: true })), imports: [{ id: 'batch-a', name: 'floors.png', tiles: ['custom-main:0'] }, { id: 'batch-b', name: 'furniture.png, props.png', tiles: ['custom-main:1', 'custom-main:2'] }] }];
  map.layers.forEach((layer, i) => { layer.cells[i] = placement('custom-main:0', i, true); layer.cells[9] = placement('custom-main:2'); });
  map.layers[1].locked = true; map.layers[2].visible = false;
  return map;
}

test('deleting one import hides its brushes and preserves every map placement and shared source', () => {
  const map = fixture(), history = new History(map), before = structuredClone(map);
  assert.equal(deleteImport(history, 'custom-main', 'batch-a'), true);
  assert.equal(map.packs.length, 1); assert.equal(map.packs[0].id, 'custom-main'); assert.equal(map.packs[0].name, 'My collection');
  assert.deepEqual(libraryTiles(map.packs[0]).map(tile => tile.id), ['custom-main:1', 'custom-main:2']); assert.equal(map.packs[0].images.length, 2);
  assert.deepEqual(map.layers, before.layers); assert.equal(map.packs[0].tiles.find(tile => tile.id === 'custom-main:0').hidden, true);
  assert.deepEqual(exportablePack(map.packs[0]).tiles.map(tile => tile.id), ['custom-main:1', 'custom-main:2']);
  assert.deepEqual(validateMap(map), map); assert.equal(history.undoStack.length, 1);
  history.undo(); assert.deepEqual(map, before); history.redo(); assert.equal(libraryTiles(map.packs[0]).length, 2); history.undo(); assert.deepEqual(map, before);
});

test('deleting imports prunes unused images and keeps an empty reusable tileset after the last import', () => {
  const map = fixture(), history = new History(map), before = structuredClone(map);
  deleteImport(history, 'custom-main', 'batch-b'); assert.equal(libraryTiles(map.packs[0]).length, 1); assert.equal(map.packs[0].images.length, 2);
  deleteImport(history, 'custom-main', 'batch-a'); assert.equal(map.packs.length, 1); assert.deepEqual(libraryTiles(map.packs[0]), []); assert.deepEqual(map.packs[0].imports, []);
  assert.deepEqual(validateMap(map), map); assert.deepEqual(map.layers, before.layers); assert.equal(map.packs[0].tiles.length, 2);
  history.undo(); assert.equal(libraryTiles(map.packs[0]).length, 1); history.undo(); assert.deepEqual(map, before);
});

test('older maps group imports by source image without mutating saved data', () => {
  const map = fixture(); delete map.packs[0].imports; const before = structuredClone(map);
  const groups = tilesetImports(map.packs[0]); assert.deepEqual(groups.map(group => group.tiles), [['custom-main:0', 'custom-main:1'], ['custom-main:2']]); assert.deepEqual(map, before);
  const history = new History(map); deleteImport(history, 'custom-main', groups[1].id); assert.deepEqual(libraryTiles(map.packs[0]).map(tile => tile.id), ['custom-main:0', 'custom-main:1']); assert.deepEqual(map.layers, before.layers); history.undo(); assert.deepEqual(map, before);
});

test('import metadata round-trips and rejects duplicate groups, missing/overlapping tiles and invalid deletion', () => {
  const map = fixture(); assert.deepEqual(validateMap(map), map);
  for (const change of [groups => groups.push(structuredClone(groups[0])), groups => groups[0].tiles.push('missing'), groups => groups[1].tiles.push('custom-main:0'), groups => groups[0].tiles.push('custom-main:0'), groups => { groups[0].name = ''; }]) {
    const invalid = structuredClone(map); change(invalid.packs[0].imports); assert.throws(() => validateMap(invalid));
  }
  const history = new History(map), before = structuredClone(map); assert.throws(() => deleteImport(history, 'kenney-tiny', 'batch-a')); assert.throws(() => deleteImport(history, 'custom-main', 'missing')); assert.deepEqual(map, before); assert.equal(history.undoStack.length, 0);
});
