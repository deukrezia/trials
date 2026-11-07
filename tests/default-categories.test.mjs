import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMap, validateMap, placement } from '../src/model.js';
import { emptyLibrary, mergeDefaultCollections } from '../src/library.js';

test('Default Tiles follow the owner’s left-to-right, top-to-bottom category grid without changing atlas IDs', async () => {
  const pack = JSON.parse(await readFile(new URL('../assets/defaults/default-tiles.json', import.meta.url), 'utf8'));
  const grid = ['FFFFWWWW', 'FFFFPWWW', 'FFFFFFWF', 'PPFFFWW-', 'PPFPPFF-'].join(''), names = { F: 'Floors', W: 'Walls', P: 'Props' }, counts = { Floors: 0, Walls: 0, Props: 0 };
  for (const [index, category] of [...grid].entries()) {
    const tile = pack.tiles.find(tile => tile.id === `default-tiles:${index}`);
    if (category === '-') { assert.equal(tile, undefined); continue; }
    assert.ok(tile); assert.equal(tile.category, names[category]); assert.deepEqual(tile.rect, [index % 8 * 16, Math.floor(index / 8) * 16, 16, 16]); counts[tile.category]++;
  }
  assert.deepEqual(counts, { Floors: 21, Walls: 10, Props: 7 }); assert.equal(pack.tiles.filter(tile=>tile.id.startsWith("default-tiles:")).length, 38);
});

test('both source sheets form one default collection with exact categories and one 2×2 PT prop',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../assets/packs.json',import.meta.url))),pack=JSON.parse(await readFile(new URL('../assets/defaults/default-tiles.json',import.meta.url)));
  assert.equal(catalog.filter(entry=>!entry.optional).length,1);assert.deepEqual(pack.sources,['default-tiles','default-tiles-2']);
  const grid=['FFFPPPP','FFFPPPP','PFFPPPF','FFFPPFF','FFFPPFF','WWWWWWP','WWWWWW-','WWW----'].join(''),categories={F:'Floors',W:'Walls',P:'Props'},quarters=new Set([24,25,31,32]);
  for(let i=0;i<grid.length;i++){
    const tile=pack.tiles.find(tile=>tile.id===`default-tiles-2:${i}`);
    if(grid[i]==='-'){assert.equal(tile,undefined);continue;}
    assert.equal(tile.category,categories[grid[i]]);assert.equal(!!tile.hidden,quarters.has(i));assert.deepEqual(tile.rect,[i%7*16,Math.floor(i/7)*16,16,16]);
  }
  const tree=pack.tiles.find(tile=>tile.id==='default-tiles-2:tree');assert.deepEqual(tree.rect,[48,48,32,32]);assert.deepEqual(tree.footprint,[2,2]);assert.equal(tree.category,'Props');assert.equal(pack.tiles.filter(tile=>!tile.hidden).length,86);
  const old=createMap(4,4);old.layers[0].cells[0]=placement('default-tiles-2:24');assert.deepEqual(validateMap(old,pack.tiles.map(tile=>tile.id)).layers,old.layers);
});

test('separate default palette orders migrate together and replace quarter references with the whole tree',async()=>{
  const pack=JSON.parse(await readFile(new URL('../assets/defaults/default-tiles.json',import.meta.url))),old=emptyLibrary();old.tileOrders={'default-tiles':['default-tiles:2','default-tiles:0'],'default-tiles-2':['default-tiles-2:25','default-tiles-2:13','default-tiles-2:24']};
  const migrated=mergeDefaultCollections(old,[pack]);assert.deepEqual(migrated.tileOrders,{'default-tiles':['default-tiles:2','default-tiles:0','default-tiles-2:tree','default-tiles-2:13']});assert.ok(old.tileOrders['default-tiles-2']);assert.deepEqual(mergeDefaultCollections(migrated,[pack]),migrated);
});
