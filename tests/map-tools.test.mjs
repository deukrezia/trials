import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap, History, placement, selectionInRect, selectionBounds, transformSelection, resizeMap, shiftMap, countCropped, resizeOffset, validateMap, defaultSettings, printLayout } from '../src/model.js';

const a = placement('a'), b = placement('b', 1, true);
test('selection covers occupied tiles on the current layer and supports reversed boxes', () => {
  const map = createMap(8, 8); map.layers[0].cells[9] = a; map.layers[0].cells[18] = b; map.layers[2].cells[10] = a;
  assert.deepEqual(selectionInRect(map, 0, 3, 3, 0, 0), [9, 18]); assert.deepEqual(selectionBounds(map, [9, 18]), { x: 1, y: 1, width: 2, height: 2 });
});
test('selection moves with overlap as one undoable operation and preserves holes', () => {
  const map = createMap(8, 8), h = new History(map); map.layers[0].cells[9] = a; map.layers[0].cells[10] = b; map.layers[0].cells[18] = a;
  const before = structuredClone(map.layers[0].cells), moved = transformSelection(h, 0, [9, 10], 'move', 1, 0);
  assert.deepEqual(moved, [10, 11]); assert.equal(map.layers[0].cells[9], null); assert.deepEqual(map.layers[0].cells[10], a); assert.deepEqual(map.layers[0].cells[11], b); assert.deepEqual(map.layers[0].cells[18], a);
  h.undo(); assert.deepEqual(map.layers[0].cells, before); h.redo(); assert.deepEqual(map.layers[0].cells[11], b);
});
test('group rotation changes positions and orientation and four rotations restore all cells', () => {
  const map = createMap(8, 8), h = new History(map); map.layers[0].cells[9] = a; map.layers[0].cells[10] = b; map.layers[0].cells[18] = a;
  const before = structuredClone(map.layers[0].cells); let selected = [9, 10, 18];
  selected = transformSelection(h, 0, selected, 'rotate'); assert.deepEqual(map.layers[0].cells[10], placement('a', 1)); assert.deepEqual(map.layers[0].cells[18], placement('b', 2, true));
  for (let i = 0; i < 3; i++) selected = transformSelection(h, 0, selected, 'rotate');
  assert.deepEqual(map.layers[0].cells, before);
});
test('group flip reflects both positions and rotated sprite orientation; twice restores selection', () => {
  const map = createMap(8, 8), h = new History(map); map.layers[1].cells[9] = a; map.layers[1].cells[10] = b;
  const before = structuredClone(map.layers[1].cells); let selected = transformSelection(h, 1, [9, 10], 'flip');
  assert.deepEqual(map.layers[1].cells[9], placement('b', 3, false)); assert.deepEqual(map.layers[1].cells[10], placement('a', 0, true));
  transformSelection(h, 1, selected, 'flip'); assert.deepEqual(map.layers[1].cells, before);
});
test('selection edits reject hidden/locked layers and out-of-bounds transforms without changing data', () => {
  const map = createMap(4, 4), h = new History(map); map.layers[0].cells[0] = a; const before = structuredClone(map.layers[0].cells);
  assert.throws(() => transformSelection(h, 0, [0], 'move', -1, 0)); assert.deepEqual(map.layers[0].cells, before); assert.equal(h.undoStack.length, 0);
  map.layers[0].locked = true; assert.throws(() => transformSelection(h, 0, [0], 'delete')); map.layers[0].locked = false; map.layers[0].visible = false; assert.throws(() => transformSelection(h, 0, [0], 'rotate'));
});
test('selection delete restores all cells with undo', () => {
  const map = createMap(8, 8), h = new History(map); map.layers[0].cells[9] = a; map.layers[0].cells[10] = b;
  assert.deepEqual(transformSelection(h, 0, [9, 10], 'delete'), []); assert.equal(map.layers[0].cells.filter(Boolean).length, 0); h.undo(); assert.deepEqual(map.layers[0].cells[10], b);
});
test('resize preserves anchored content, supports undo/redo across subsequent strokes', () => {
  const map = createMap(8, 8), h = new History(map); map.layers[0].cells[9] = a;
  resizeMap(h, 10, 12, 'center'); assert.deepEqual(map.layers[0].cells[3 * 10 + 2], a);
  h.begin(2); h.set(9, 11, b); h.commit(); h.undo(); h.undo(); assert.equal(map.width, 8); assert.equal(map.height, 8); assert.deepEqual(map.layers[0].cells[9], a);
  h.redo(); h.redo(); assert.equal(map.width, 10); assert.equal(map.height, 12); assert.deepEqual(map.layers[2].cells[119], b);
});
test('shrinking requires explicit cropping and undo restores cropped cells', () => {
  const map = createMap(8, 8), h = new History(map); map.layers[2].cells[63] = b;
  assert.equal(countCropped(map, 4, 4, 0, 0), 1); assert.throws(() => resizeMap(h, 4, 4)); assert.equal(map.width, 8);
  resizeMap(h, 4, 4, 'top-left', true); assert.equal(map.layers[2].cells.filter(Boolean).length, 0); h.undo(); assert.deepEqual(map.layers[2].cells[63], b);
  assert.deepEqual(resizeOffset(map, 10, 12, 'bottom-right'), { dx: 2, dy: 4 }); assert.throws(() => resizeMap(h, 201, 200));
});
test('whole-map shifting moves every layer, including locked and hidden ones, as one operation', () => {
  const map = createMap(8, 8), h = new History(map); map.layers.forEach((layer, i) => layer.cells[9] = placement(String(i))); map.layers[2].locked = true; map.layers[1].visible = false;
  shiftMap(h, 2, 1); map.layers.forEach((layer, i) => assert.deepEqual(layer.cells[19], placement(String(i)))); assert.equal(h.undoStack.length, 1);
  h.undo(); map.layers.forEach(layer => assert.ok(layer.cells[9])); assert.equal(map.layers[2].locked, true); assert.equal(map.layers[1].visible, false);
  assert.throws(() => shiftMap(h, -2, 0)); shiftMap(h, -2, 0, true); assert.equal(map.layers[0].cells.filter(Boolean).length, 0); h.undo(); assert.ok(map.layers[0].cells[9]);
});
test('legacy maps get export defaults; renamed default packs and output settings round-trip', () => {
  const map = createMap(8, 8); delete map.settings; delete map.packNames; assert.deepEqual(validateMap(map).settings, defaultSettings());
  const modern = createMap(8, 8); modern.packNames['kenney-tiny'] = 'My pixel set'; modern.settings.pixelsPerCell = 70; modern.settings.exportGrid = true; modern.settings.paper = 'letter';
  assert.deepEqual(validateMap(modern), modern);
  assert.throws(() => validateMap({ ...modern, settings: { printDpi: 900 } })); assert.throws(() => validateMap({ ...modern, packNames: { 'invalid/key': 'wrong' } }));
});
test('grid lines default on, migrate earlier defaults once, and preserve new explicit choices', () => {
  assert.equal(defaultSettings().exportGrid, true); assert.equal(defaultSettings().printGrid, true);
  const older = createMap(8, 8); delete older.settings.gridDefaultsVersion; older.settings.exportGrid = false; older.settings.printGrid = false;
  const migrated = validateMap(older); assert.equal(migrated.settings.exportGrid, true); assert.equal(migrated.settings.printGrid, true);
  migrated.settings.exportGrid = false; migrated.settings.printGrid = false; assert.deepEqual(validateMap(migrated), migrated);
});
test('print pagination uses actual physical cell size, page margins, paper, and orientation', () => {
  const map = createMap(12, 10); const layout = printLayout(map); assert.equal(layout.columns, 7); assert.equal(layout.rows, 10); assert.equal(layout.pagesX, 2); assert.equal(layout.pagesY, 1); assert.equal(layout.pixels, 150);
  map.settings.paper = 'letter'; map.settings.orientation = 'landscape'; const wide = printLayout(map); assert.equal(wide.pageWidth, 11); assert.equal(wide.pageHeight, 8.5); assert.equal(wide.columns, 10); assert.equal(wide.rows, 7);
  map.settings.cellInches = .5; assert.equal(printLayout(map).columns, 20);
});
