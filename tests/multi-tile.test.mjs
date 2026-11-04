import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap, History, placement, selectionInRect, transformSelection, validateMap, deletePack } from '../src/model.js';
import { stampParts, partRect, sheetEntries } from '../src/multi-tile.js';
import { editionPolicy, policyTiles } from '../src/edition-policy.js';
import { moveTileOrder } from '../src/library.js';

function fixture() {
  const map = createMap(10,10), id = 'custom-tree', tile = {id:id+':tree',name:'Tree',category:'Custom',image:'image',rect:[0,0,48,48],footprint:[3,3],pixelArt:true};
  map.packs = [{id,name:'Trees',images:[{id:'image',width:48,height:48,data:'data:image/png;base64,AAAA'}],tiles:[tile]}];
  return {map,tile,history:new History(map),value:placement(tile.id)};
}
test('a 48px tree on a 16px sheet occupies nine linked cells, round-trips and erases atomically', () => {
  const {map,tile,history,value} = fixture(); history.begin(0); history.stamp(2,2,value,tile.footprint); assert.ok(history.commit());
  assert.equal(map.layers[0].cells.filter(Boolean).length,9);
  const original=structuredClone(map.layers), ids=new Set(map.layers[0].cells.filter(Boolean).map(cell=>cell.instance)); assert.equal(ids.size,1);
  assert.deepEqual(validateMap(map),map); assert.equal(policyTiles(map.packs[0],editionPolicy('web')).length,1);
  history.begin(0); history.stamp(2,2,value,[3,3]); assert.equal(history.commit(),false);
  history.begin(0); history.set(3,3,null); history.commit(); assert.equal(map.layers[0].cells.filter(Boolean).length,0); history.undo(); assert.deepEqual(map.layers,original);
  history.begin(0); history.stamp(9,9,value,[3,3]); assert.equal(history.commit(),false); assert.deepEqual(map.layers,original);
  deletePack(history,map.packs[0].id); assert.deepEqual(map.layers,original); assert.ok(map.packs[0].hidden); assert.deepEqual(validateMap(map).layers,original);
});
test('selecting any tree part selects the full image; movement, rotation, flip and replacement preserve whole assets', () => {
  const {map,tile,history,value}=fixture(); history.begin(0); history.stamp(1,1,value,[3,3]); history.commit(); const original=structuredClone(map.layers);
  let indices=selectionInRect(map,0,2,2,2,2); assert.equal(indices.length,9);
  indices=transformSelection(history,0,indices,'move',2,1); assert.equal(indices.length,9); assert.equal(map.layers[0].cells[2*10+3].tile,tile.id);
  for(let i=0;i<4;i++) indices=transformSelection(history,0,indices,'rotate');
  for(let i=0;i<2;i++) indices=transformSelection(history,0,indices,'flip');
  indices=transformSelection(history,0,indices,'move',-2,-1); assert.deepEqual(map.layers,original);
  history.begin(0); history.set(2,2,placement(tile.id)); history.commit(); assert.equal(map.layers[0].cells.filter(Boolean).length,1); history.undo(); assert.deepEqual(map.layers,original);
});
test('non-square transformed parts map to the correct source cells and sheet gutters are excluded', () => {
  const tile={rect:[2,3,50,33],footprint:[3,2],cellSpacing:1};
  assert.deepEqual(partRect(tile,[2,1,3,2]),[36,20,16,16]);
  const parts=stampParts(placement('tree',1,true),[3,2],'tree');
  assert.deepEqual(parts.find(p=>p.cell.part[0]===0 && p.cell.part[1]===0),{x:1,y:2,cell:{tile:'tree',rotation:1,flip:true,instance:'tree',part:[0,0,3,2]}});
  const entries=sheetEntries(84,67,16,16,1,0,[[0,0,3,3]]);
  assert.deepEqual(entries[0],{rect:[0,0,50,50],footprint:[3,3],cellSpacing:1}); assert.equal(entries.length,12);
});
test('multi-tile palette reordering moves a stable block and leaves the brush definitions intact', () => {
  const tiles=['a','b','c','d','e'].map(id=>({id}));
  assert.deepEqual(moveTileOrder(tiles,[],['d','b'],'e',true),['a','c','e','b','d']);
  assert.deepEqual(moveTileOrder(tiles,[],['b','c'],'c'),['a','b','c','d','e']);
});
