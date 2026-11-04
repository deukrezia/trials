import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap, History, placement, deletePack, deleteImport, libraryPacks, exportablePack } from '../src/model.js';
import { emptyLibrary, validateLibrary, adoptProjectLibrary, projectWithLibrary, libraryFromProject, mergeLibraryBackup, orderedTiles, moveTileOrder } from '../src/library.js';

function pack(id = 'custom-library', data = 'AAAA') { return { id, name: 'Shared brushes', images: [{ id: 'image', data: `data:image/png;base64,${data}`, width: 32, height: 32 }], tiles: [0, 1].map(i => ({ id: `${id}:${i}`, name: `Brush ${i}`, category: 'Custom', image: 'image', rect: [0, 0, 32, 32], pixelArt: true })), imports: [{ id: 'import', name: 'source.png', tiles: [`${id}:0`, `${id}:1`] }] }; }
function project() { const map = createMap(4, 4); map.packs = [pack()]; map.layers[0].cells[5] = placement('custom-library:0'); return map; }

test('a migrated library appears in every new project and opening another project keeps existing sets', () => {
  const source = project(), library = adoptProjectLibrary(emptyLibrary(), source), blank = projectWithLibrary(library, createMap(4, 4));
  assert.equal(blank.packs[0].id, source.packs[0].id); assert.equal(blank.packs[0].tiles.length, 2); assert.ok(blank.layers.every(layer => layer.cells.every(cell => !cell)));
  const other = createMap(4, 4); other.packs = [pack('custom-other')]; const merged = adoptProjectLibrary(library, other); assert.equal(merged.packs.length, 2); assert.equal(projectWithLibrary(merged, other).packs.length, 2);
});

test('tileset descriptions persist across projects, old maps, reload validation and library backups', () => {
  const source = project(); source.packDescriptions = { 'custom-library': 'Floors and walls', 'kenney-tiny': 'Pixel dungeon art' };
  const state = adoptProjectLibrary(emptyLibrary(), source), blank = projectWithLibrary(state, createMap(4, 4));
  assert.deepEqual(blank.packDescriptions, source.packDescriptions);
  const old = project(); old.packDescriptions = { 'custom-library': 'Old text' };
  assert.equal(projectWithLibrary(adoptProjectLibrary(state, old), old).packDescriptions['custom-library'], 'Floors and walls');
  const restored = validateLibrary(JSON.parse(JSON.stringify(state))); assert.deepEqual(restored.packDescriptions, state.packDescriptions);
  const backup = emptyLibrary(); backup.packDescriptions['custom-library'] = 'Changed description';
  assert.equal(mergeLibraryBackup(state, backup).packDescriptions['custom-library'], 'Changed description');
  assert.throws(() => validateLibrary({ ...state, packDescriptions: { 'custom-library': 'x'.repeat(1001) } }), /description/);
});

test('global deletion stays deleted when an older project opens, while map artwork stays embedded', () => {
  const original = project(); let library = adoptProjectLibrary(emptyLibrary(), original), current = projectWithLibrary(library, original);
  deletePack(new History(current), 'custom-library'); library = libraryFromProject(library, current);
  assert.equal(library.packs.length, 0); assert.ok(library.removedPacks.includes('custom-library'));
  const reopened = projectWithLibrary(adoptProjectLibrary(library, original), original); assert.equal(libraryPacks(reopened).length, 0); assert.deepEqual(reopened.layers, original.layers); assert.equal(reopened.packs[0].images[0].data, original.packs[0].images[0].data);
  assert.equal(projectWithLibrary(library, createMap(4, 4)).packs.length, 0);
});

test('removed imports stay removed across projects, and Undo restores shared membership', () => {
  const original = project(); let library = adoptProjectLibrary(emptyLibrary(), original), current = projectWithLibrary(library, original); const history = new History(current);
  deleteImport(history, 'custom-library', 'import'); library = libraryFromProject(library, current); assert.equal(library.packs[0].tiles.length, 0); assert.equal(library.removedTiles.length, 2);
  const reopened = projectWithLibrary(adoptProjectLibrary(library, original), original); assert.equal(exportablePack(reopened.packs[0]).tiles.length, 0); assert.deepEqual(reopened.layers, original.layers);
  history.undo(); library = libraryFromProject(library, current); assert.equal(library.packs[0].tiles.length, 2); assert.equal(library.removedTiles.length, 0);
});

test('project artwork is retained when a shared ID points to different image data', () => {
  const source = project(), library = adoptProjectLibrary(emptyLibrary(), source); library.packs[0].images[0].data = 'data:image/png;base64,BBBB';
  const merged = projectWithLibrary(library, source), retained = merged.packs[0].tiles.find(tile => tile.id === merged.layers[0].cells[5].tile);
  assert.notEqual(retained.id, 'custom-library:0'); assert.equal(retained.hidden, true); assert.equal(merged.packs[0].images.find(image => image.id === retained.image).data, 'data:image/png;base64,AAAA'); assert.equal(merged.packs[0].images.find(image => image.id === library.packs[0].tiles[0].image).data, 'data:image/png;base64,BBBB');
});

test('library backups merge sets, optional packs and aliases while preserving earlier sets', () => {
  const current = adoptProjectLibrary(emptyLibrary(), project()), backup = emptyLibrary(); backup.packs = [pack('custom-extra')]; backup.packNames['future-default'] = 'My future tiles'; backup.enabledOptional = ['kenney-tiny']; backup.removedPacks = ['custom-removed'];
  const merged = mergeLibraryBackup(current, backup); assert.equal(merged.packs.length, 2); assert.equal(merged.packNames['future-default'], 'My future tiles'); assert.deepEqual(merged.enabledOptional, ['kenney-tiny']); assert.ok(merged.removedPacks.includes('custom-removed')); assert.deepEqual(validateLibrary(merged), merged);
});

test('palette orders persist independently of project cells and merge through library backups', () => {
  const tiles = ['a', 'b', 'c', 'new'].map(id => ({ id }));
  assert.deepEqual(orderedTiles(tiles, ['c', 'a', 'removed']).map(tile => tile.id), ['c', 'a', 'b', 'new']);
  assert.deepEqual(moveTileOrder(tiles, [], 'a', 'c', true), ['b', 'c', 'a', 'new']);
  assert.deepEqual(moveTileOrder(tiles, [], 'c', 'a'), ['c', 'a', 'b', 'new']);
  const current = adoptProjectLibrary(emptyLibrary(), project()); current.tileOrders = { 'default-tiles': ['default-tiles:3', 'default-tiles:0'] };
  const saved = validateLibrary(JSON.parse(JSON.stringify(current))), map = project();
  assert.deepEqual(adoptProjectLibrary(saved, map).tileOrders, current.tileOrders);
  assert.deepEqual(libraryFromProject(saved, map).tileOrders, current.tileOrders);
  const backup = emptyLibrary(); backup.tileOrders = { 'default-tiles': ['default-tiles:0'], 'custom-library': ['custom-library:1', 'custom-library:0'] };
  assert.deepEqual(mergeLibraryBackup(saved, backup).tileOrders, backup.tileOrders);
  assert.deepEqual(validateLibrary({ ...emptyLibrary(), tileOrders: undefined }).tileOrders, {});
  assert.throws(() => validateLibrary({ ...emptyLibrary(), tileOrders: { 'invalid/id': [] } }), /ordering/);
  assert.throws(() => validateLibrary({ ...emptyLibrary(), tileOrders: { valid: [42] } }), /ordering/);
  assert.deepEqual(map.layers, project().layers);
});
