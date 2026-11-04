import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap, History, placement, shapeCells, SHAPES } from '../src/model.js';
const key = cells => cells.map(([x, y]) => `${x},${y}`).sort();
test('rectangle filled and outline footprints preserve the hollow interior', () => {
  assert.equal(shapeCells(1, 1, 5, 5).length, 25);
  const outline = shapeCells(1, 1, 5, 5, 'rectangle', true); assert.equal(outline.length, 16); assert.ok(!key(outline).includes('3,3'));
  assert.deepEqual(key(outline), key(shapeCells(5, 5, 1, 1, 'rectangle', true)));
});
test('ellipse and diamond have distinct symmetric footprints with clipped corners', () => {
  const ellipse = shapeCells(0, 0, 4, 4, 'ellipse'), diamond = shapeCells(0, 0, 4, 4, 'diamond');
  assert.equal(ellipse.length, 21); assert.equal(diamond.length, 13);
  assert.ok(!key(ellipse).includes('0,0')); assert.ok(key(ellipse).includes('2,2'));
  for (const type of ['ellipse', 'diamond']) { const cells = shapeCells(0, 0, 4, 6, type); assert.deepEqual(key(cells), key(cells.map(([x, y]) => [4 - x, 6 - y]))); }
});
test('circle uses a square footprint even with a nonsquare drag region', () => {
  for (const [width, height] of [[8, 3], [9, 4], [3, 8], [6, 1], [1, 6]]) {
    const cells = shapeCells(0, 0, width - 1, height - 1, 'circle'), xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
    assert.equal(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    assert.deepEqual(key(cells), key(shapeCells(width - 1, height - 1, 0, 0, 'circle')));
  }
});
test('triangle grows from its top to the base; line is a one-cell-wide stroke', () => {
  const triangle = shapeCells(0, 0, 4, 4, 'triangle');
  assert.equal(triangle.filter(([, y]) => y === 0).length, 1); assert.equal(triangle.filter(([, y]) => y === 4).length, 5);
  assert.deepEqual(shapeCells(1, 1, 5, 5, 'line'), [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]);
  assert.deepEqual(shapeCells(1, 1, 5, 5, 'line', true), shapeCells(1, 1, 5, 5, 'line'));
});
test('every shape handles single-cell, reversed and clipped drags as one undoable operation', () => {
  for (const type of SHAPES) {
    assert.deepEqual(shapeCells(2, 2, 2, 2, type), [[2, 2]]);
    const map = createMap(8, 8), h = new History(map), tile = placement('a', 2, true);
    h.begin(1); h.shape(-2, -2, 5, 5, tile, type, true); h.commit();
    assert.equal(h.undoStack.length, 1); assert.equal(map.layers[1].cells.length, 64);
    const painted = structuredClone(map.layers[1].cells); h.undo(); assert.equal(map.layers[1].cells.filter(Boolean).length, 0); h.redo(); assert.deepEqual(map.layers[1].cells, painted);
  }
});
test('outline does not replace existing interior tiles and locked layers remain unchanged', () => {
  const map = createMap(8, 8), h = new History(map); map.layers[0].cells[27] = placement('inside');
  h.begin(0); h.shape(1, 1, 5, 5, placement('edge'), 'rectangle', true); h.commit(); assert.equal(map.layers[0].cells[27].tile, 'inside');
  map.layers[0].locked = true; const before = structuredClone(map.layers[0].cells); h.begin(0); h.shape(0, 0, 7, 7, placement('locked'), 'ellipse'); assert.equal(h.commit(), false); assert.deepEqual(map.layers[0].cells, before);
});
