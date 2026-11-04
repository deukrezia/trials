import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap, History, placement, addLayer, deleteLayer, reorderLayer, setLayerState, resizeMap, validateMap, selectionInLayers, transformLayersSelection, MAX_LAYERS } from '../src/model.js';

test('maps start with three ordered layers and allow up to twelve with unique persistent IDs', () => {
  const map = createMap(4, 4), history = new History(map);
  assert.deepEqual(map.layers.map(layer => layer.name), ['Ground', 'Walls', 'Objects']);
  for (let i = 3; i < MAX_LAYERS; i++) addLayer(history);
  assert.equal(map.layers.length, 12); assert.equal(new Set(map.layers.map(layer => layer.id)).size, 12);
  assert.deepEqual(map.layers.slice(3).map(layer => layer.name), Array.from({ length: 9 }, (_, i) => `Layer ${i + 4}`));
  const before = structuredClone(map); assert.throws(() => addLayer(history), /12 layers/); assert.throws(() => addLayer(history, map.layers[0].id), /12 layers/); assert.deepEqual(map, before);
  history.undo(); assert.equal(map.layers.length, 11); history.redo(); assert.deepEqual(map, before); assert.deepEqual(validateMap(map), map);
});

test('layer renaming preserves placement IDs, validates names and supports undo/redo', () => {
  const map = createMap(4, 4), history = new History(map), layer = map.layers[0]; layer.cells[5] = placement('red');
  const before = structuredClone(layer);
  assert.equal(setLayerState(history, layer.id, { name: '  Stone floor  ' }), true);
  assert.equal(layer.name, 'Stone floor'); assert.equal(layer.id, before.id); assert.deepEqual(layer.cells, before.cells);
  history.undo(); assert.deepEqual(map.layers[0], before); history.redo(); assert.equal(map.layers[0].name, 'Stone floor');
  for (const name of ['', '   ', 'x'.repeat(101), 42]) assert.throws(() => setLayerState(history, layer.id, { name }), /layer name/);
  assert.equal(history.undoStack.length, 1);
});

test('duplicates preserve all layer properties and own independent cells; deleting remains undoable', () => {
  const map = createMap(4, 4), history = new History(map), original = map.layers[2];
  original.cells[5] = placement('blue', 2, true); original.locked = true; original.visible = false; original.opacity = .25;
  const id = addLayer(history, original.id), copy = map.layers[3];
  assert.equal(copy.id, id); assert.equal(copy.name, 'Objects copy'); assert.equal(copy.locked, true); assert.equal(copy.visible, false); assert.equal(copy.opacity, .25); assert.notEqual(copy.cells, original.cells); assert.notEqual(copy.cells[5], original.cells[5]);
  setLayerState(history, id, { locked: false, visible: true }); history.begin(3); history.set(1, 1, placement('red')); history.commit(); assert.equal(original.cells[5].tile, 'blue');
  const before = structuredClone(map); deleteLayer(history, id); assert.equal(map.layers.length, 3); history.undo(); assert.deepEqual(map, before); history.redo(); assert.equal(map.layers.length, 3);
});

test('topology, brush strokes, opacity and resizing undo correctly across index changes', () => {
  const map = createMap(4, 4), history = new History(map), states = [structuredClone(map)];
  const record = action => { action(); states.push(structuredClone(map)); };
  record(() => { history.begin(0); history.set(0, 0, placement('red')); history.commit(); });
  let id; record(() => { id = addLayer(history); });
  record(() => { history.begin(3); history.set(1, 1, placement('blue')); history.commit(); });
  record(() => reorderLayer(history, id, 0)); record(() => setLayerState(history, id, { opacity: .5 })); record(() => resizeMap(history, 6, 6, 'top-left')); record(() => deleteLayer(history, 'layer-1'));
  for (let i = states.length - 2; i >= 0; i--) { assert.equal(history.undo(), true); assert.deepEqual(map, states[i]); }
  for (let i = 1; i < states.length; i++) { assert.equal(history.redo(), true); assert.deepEqual(map, states[i]); }
});

test('layer validation migrates legacy opacity, preserves names/order and rejects invalid stacks', () => {
  const map = createMap(4, 4); map.layers.reverse(); map.layers[0].name = 'Upper props'; delete map.layers[0].opacity;
  const loaded = validateMap(map); assert.equal(loaded.layers[0].id, 'layer-2'); assert.equal(loaded.layers[0].name, 'Upper props'); assert.equal(loaded.layers[0].opacity, 1);
  for (const change of [m => { m.layers = []; }, m => { m.layers = Array(13).fill(m.layers[0]); }, m => { m.layers[1].id = m.layers[0].id; }, m => { m.layers[0].opacity = .3; }, m => { m.layers[0].name = ''; }]) { const invalid = structuredClone(loaded); change(invalid); assert.throws(() => validateMap(invalid)); }
  const single = createMap(4, 4); single.layers.length = 1; const history = new History(single);
  assert.throws(() => deleteLayer(history, single.layers[0].id), /at least one/); assert.deepEqual(validateMap(single), single);
  for (const opacity of [0, .25, .5, .75, 1]) { setLayerState(history, single.layers[0].id, { opacity }); assert.equal(validateMap(single).layers[0].opacity, opacity); }
  assert.throws(() => setLayerState(history, single.layers[0].id, { opacity: .6 })); assert.throws(() => reorderLayer(history, single.layers[0].id, -1));
});

test('multi-layer marquee, move and delete form one atomic edit and leave other layers alone', () => {
  const map = createMap(4, 4), history = new History(map), ids = [map.layers[0].id, map.layers[2].id];
  map.layers[0].cells[5] = placement('red'); map.layers[0].cells[6] = placement('red'); map.layers[1].cells[5] = placement('green'); map.layers[2].cells[5] = placement('blue'); map.layers[2].cells[9] = placement('blue');
  const before = structuredClone(map), indices = selectionInLayers(map, ids, 0, 0, 2, 2); assert.deepEqual([...indices].sort((a,b)=>a-b), [5,6,9]);
  const moved = transformLayersSelection(history, ids, indices, 'move', 1, 0); assert.deepEqual([...moved].sort((a,b)=>a-b), [6,7,10]); assert.deepEqual(map.layers[1], before.layers[1]); assert.equal(map.layers[0].cells[6].tile, 'red'); assert.equal(map.layers[2].cells[6].tile, 'blue'); assert.equal(history.undoStack.length, 1);
  const after = structuredClone(map); transformLayersSelection(history, ids, moved, 'delete'); assert.equal(map.layers[0].cells.filter(Boolean).length, 0); assert.equal(map.layers[2].cells.filter(Boolean).length, 0); assert.deepEqual(map.layers[1], before.layers[1]); history.undo(); assert.deepEqual(map, after); history.undo(); assert.deepEqual(map, before);
});

test('multi-layer transforms use shared bounds, preserve locks and reject overflow atomically', () => {
  const map = createMap(4, 4), history = new History(map), ids = map.layers.map(layer => layer.id); map.layers[0].cells[5] = placement('red'); map.layers[2].cells[6] = placement('blue'); map.layers[1].cells[9] = placement('locked'); map.layers[1].locked = true;
  const before = structuredClone(map), indices = selectionInLayers(map, ids, 0, 0, 3, 3); assert.deepEqual(indices, [5,6]);
  transformLayersSelection(history, ids, indices, 'rotate'); assert.equal(map.layers[0].cells[5].tile, 'red'); assert.equal(map.layers[2].cells[9].tile, 'blue'); assert.deepEqual(map.layers[1], before.layers[1]); history.undo();
  assert.throws(() => transformLayersSelection(history, ids, indices, 'move', 2, 0)); assert.deepEqual(map, before);
  map.layers[2].visible = false; assert.deepEqual(selectionInLayers(map, ids, 0, 0, 3, 3), [5]);
});
