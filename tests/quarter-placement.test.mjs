import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap, History, placement, transformSelection, validateMap, deletePack, shiftMap } from '../src/model.js';
import { copySelection, pasteSelection } from '../src/selection-clipboard.js';
import { emptyLibrary, projectWithLibrary } from '../src/library.js';

test('quarter edits preserve other corners and base artwork through undo, rotation and a saved-map round trip', () => {
  const map = createMap(8, 8), history = new History(map);
  const base = placement('floor'), lamp = { ...placement('lamp', 1, true), offset: true }, rug = placement('rug');
  history.begin(0);
  history.stamp(1, 1, base);
  history.setQuarter(2, 2, lamp);
  history.setQuarter(3, 3, rug);
  history.setQuarter(-1, 2, lamp);
  assert.ok(history.commit());
  assert.deepEqual(map.layers[0].cells[9], { ...base, quarters: [lamp, null, null, rug] });
  assert.deepEqual(validateMap(map, ['floor', 'lamp', 'rug']), map);

  history.begin(0);
  history.setQuarter(2, 2, null);
  history.commit();
  assert.deepEqual(map.layers[0].cells[9], { ...base, quarters: [null, null, null, rug] });
  history.undo();
  transformSelection(history, 0, [9], 'rotate');
  assert.deepEqual(map.layers[0].cells[9].quarters, [null, { ...placement('lamp', 2, true), offset: true }, placement('rug', 1), null]);
  shiftMap(history, 1, 0);
  assert.deepEqual(map.layers[0].cells[10].quarters, [null, { ...placement('lamp', 2, true), offset: true }, placement('rug', 1), null]);
});

test('custom tiles used only in a quarter survive library removal and cross-map paste', () => {
  const source = createMap(4, 4), history = new History(source);
  const tile = { id: 'custom-lamp:1', name: 'Lamp', image: 'sheet', rect: [0, 0, 16, 16], pixelArt: true };
  source.packs.push({ id: 'custom-lamp', name: 'Lamp', images: [{ id: 'sheet', width: 16, height: 16, data: 'data:image/png;base64,AAAA' }], tiles: [tile] });
  history.begin(0);
  history.setQuarter(1, 0, placement(tile.id));
  history.commit();
  const clip = copySelection(source, ['layer-0'], [0]);
  deletePack(history, 'custom-lamp');
  const restored = validateMap(projectWithLibrary(emptyLibrary(), source));
  assert.equal(restored.layers[0].cells[0].quarters[1].tile, tile.id);
  assert.ok(restored.packs[0].hidden);

  const target = createMap(4, 4);
  pasteSelection(new History(target), clip, 1, 2, ['layer-0']);
  const pasted = target.layers[0].cells[9].quarters[1];
  assert.equal(pasted.tile, target.packs[0].tiles[0].id);
  assert.ok(target.packs[0].hidden);
  assert.deepEqual(validateMap(target).layers, target.layers);
});
