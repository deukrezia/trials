import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Default Tiles follow the owner’s left-to-right, top-to-bottom category grid without changing atlas IDs', async () => {
  const pack = JSON.parse(await readFile(new URL('../assets/defaults/default-tiles.json', import.meta.url), 'utf8'));
  const grid = ['FFFFWWWW', 'FFFFPWWW', 'FFFFFFWF', 'PPFFFWW-', 'PPFPPFF-'].join(''), names = { F: 'Floors', W: 'Walls', P: 'Props' }, counts = { Floors: 0, Walls: 0, Props: 0 };
  for (const [index, category] of [...grid].entries()) {
    const tile = pack.tiles.find(tile => tile.id === `default-tiles:${index}`);
    if (category === '-') { assert.equal(tile, undefined); continue; }
    assert.ok(tile); assert.equal(tile.category, names[category]); assert.deepEqual(tile.rect, [index % 8 * 16, Math.floor(index / 8) * 16, 16, 16]); counts[tile.category]++;
  }
  assert.deepEqual(counts, { Floors: 21, Walls: 10, Props: 7 }); assert.equal(pack.tiles.length, 38);
});
