import test from 'node:test';
import assert from 'node:assert/strict';
import { editionPolicy, policyPacks, policyTiles, importCount, assertImportCapacity, assertTileSetup, cropBounds } from '../src/edition-policy.js';

test('Free and desktop policies enforce the agreed limits without mutating saved assets', () => {
  const free = editionPolicy(), paid = editionPolicy('desktop');
  assert.deepEqual(policyTiles({ tiles: [] }, free), []);
  assert.equal(free.maxLayers, 6); assert.equal(paid.maxLayers, 12);
  const pack = { id: 'custom-test', images: [0, 1, 2].map(id => ({ id: String(id) })), tiles: [0, 1, 2].map(id => ({ id: `tile-${id}`, image: String(id), rect: [0, 0, 16, 16] })) };
  const before = structuredClone(pack);
  assert.equal(policyPacks({ packs: [pack, { ...pack, id: 'custom-2' }, { ...pack, id: 'custom-3' }] }, free).length, 2);
  assert.equal(policyTiles(pack, free).length, 2); assert.equal(policyTiles(pack, paid).length, 3);
  assert.deepEqual(pack, before); assert.throws(() => assertImportCapacity(free, pack, 1), /2 image imports/);
  assert.doesNotThrow(() => assertImportCapacity(paid, pack, 100));
  for (const size of [16, 32]) assert.doesNotThrow(() => assertTileSetup(free, size, size));
  assert.throws(() => assertTileSetup(free, 64, 64), /16×16 or 32×32/); assert.throws(() => assertTileSetup(free, 16, 32));
  assert.doesNotThrow(() => assertTileSetup(paid, 64, 48));
  assert.deepEqual(cropBounds(free, 192, 320), { width: 160, height: 160 });
  assert.deepEqual(cropBounds(free, 64, 32), { width: 64, height: 32 });
  assert.deepEqual(cropBounds(paid, 192, 320), { width: 192, height: 320 });
});

test('removed sources free import slots and Free brushes stay within the top-left crop', () => {
  const pack = { images: ['a', 'b', 'c'].map(id => ({ id })), tiles: [
    { id: 'a', image: 'a', hidden: true, rect: [0, 0, 16, 16] },
    { id: 'b', image: 'b', rect: [128, 128, 32, 32] },
    { id: 'c', image: 'c', rect: [160, 0, 16, 16] },
  ] };
  assert.equal(importCount(pack), 2); assert.deepEqual(policyTiles(pack, editionPolicy()).map(tile => tile.id), ['b']);
  pack.tiles[2].hidden = true; assert.equal(importCount(pack), 1);
  assert.doesNotThrow(() => assertImportCapacity(editionPolicy(), pack, 1));
});
