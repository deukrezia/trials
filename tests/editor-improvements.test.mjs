import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { createMap, History, placement, validateMap, transformLayersSelection } from '../src/model.js';
import { copySelection, pasteSelection } from '../src/selection-clipboard.js';
import { replaceImportRegions, inferSheetGrid } from '../src/region-edit.js';
import { libraryFromProject, emptyLibrary, projectWithLibrary } from '../src/library.js';

function fixture() {
  const map=createMap(12,12), history=new History(map);
  map.packs=[{id:'custom-test',name:'Art',images:[{id:'image',width:48,height:48,data:'data:image/png;base64,AAAA'}],tiles:[{id:'custom-test:tree',image:'image',name:'Tree',category:'Custom',rect:[0,0,48,48],footprint:[3,3],pixelArt:true}],imports:[{id:'source',name:'tree.png',tiles:['custom-test:tree']}]}];
  history.begin(0);history.stamp(1,1,placement('custom-test:tree',1,true),[3,3]);history.commit(); map.layers[2].cells[13]=placement('default:stone',2,true);map.layers[0].opacity=.5;
  return {map,history};
}
test('copy and paste preserve grouped sprites, selected layer ordering, holes and transforms with independent IDs and undo',()=>{
  const {map,history}=fixture(),before=structuredClone(map),clip=copySelection(map,['layer-2','layer-0'],[13]);assert.equal(clip.layers.length,2);assert.equal(clip.layers[0].cells.length,9);
  const result=pasteSelection(history,clip,5,5,['layer-2','layer-0']);assert.equal(result.length,9);assert.equal(map.layers[0].opacity,.5);assert.equal(map.layers[0].cells[65].rotation,1);assert.notEqual(map.layers[0].cells[65].instance,map.layers[0].cells[13].instance);assert.equal(map.layers[2].cells[65].tile,'default:stone');assert.deepEqual(map.layers[1],before.layers[1]);
  history.undo();assert.deepEqual(map,before);history.redo();assert.equal(map.layers[0].cells.filter(Boolean).length,18);
  assert.throws(()=>pasteSelection(history,clip,11,11,['layer-0','layer-2']),/leave/);assert.throws(()=>pasteSelection(history,clip,5,5,['layer-0']),/Select 2/);
  map.layers[2].locked=true;assert.throws(()=>pasteSelection(history,clip,5,5,['layer-0','layer-2']),/unlocked/);
});
test('cut is undoable and cross-project paste embeds removed library art without restoring the tileset',()=>{
  const {map,history}=fixture(),clip=copySelection(map,['layer-0'],[13]);transformLayersSelection(history,['layer-0'],[13],'delete');assert.equal(map.layers[0].cells.filter(Boolean).length,0);history.undo();assert.equal(map.layers[0].cells.filter(Boolean).length,9);
  const target=createMap(10,10),targetHistory=new History(target);pasteSelection(targetHistory,clip,2,2,['layer-0']);assert.ok(target.packs[0].hidden);assert.equal(target.layers[0].cells.filter(Boolean).length,9);assert.ok(target.layers[0].cells[22].tile.startsWith(target.packs[0].id));assert.deepEqual(validateMap(target),target);
  const library=libraryFromProject(emptyLibrary(),target);assert.equal(library.packs.length,0);assert.deepEqual(projectWithLibrary(library,target).layers,target.layers);
});
test('editing an import replaces palette regions, retains placed definitions, uses one source and restores with undo',()=>{
  const {map,history}=fixture(),before=structuredClone(map),entries=[{rect:[0,0,16,16]},{rect:[16,0,32,32],footprint:[2,2]}];
  const tiles=replaceImportRegions(history,'custom-test','source','image',entries);assert.equal(tiles.length,2);assert.ok(map.packs[0].tiles.find(t=>t.id==='custom-test:tree').hidden);assert.deepEqual(map.layers,before.layers);assert.equal(map.packs[0].images.length,1);assert.equal(map.packs[0].imports.length,1);assert.deepEqual(map.packs[0].imports[0].tiles,tiles.map(t=>t.id));assert.deepEqual(validateMap(map,['default:stone']),map);history.undo();assert.deepEqual(map,before);
});
test('pasting conflicting portable art archives the copied pixels without replacing the destination library',()=>{
  const {map}=fixture(),clip=copySelection(map,['layer-0'],[13]),target=createMap(10,10);target.packs=structuredClone(map.packs);target.packs[0].images[0].data='data:image/png;base64,BBBB';
  pasteSelection(new History(target),clip,2,2,['layer-0']);assert.equal(target.packs[0].images[0].data,'data:image/png;base64,BBBB');assert.equal(target.packs[1].images[0].data,'data:image/png;base64,AAAA');assert.ok(target.packs[1].hidden);assert.notEqual(target.layers[0].cells[22].tile,'custom-test:tree');assert.equal(libraryFromProject(emptyLibrary(),target).packs.length,1);
});
test('image export settings migrate to PNG, support JPEG quality and reject unsupported output',()=>{
  const map=createMap(4,4);delete map.settings.exportFormat;delete map.settings.jpegQuality;assert.equal(validateMap(map).settings.exportFormat,'png');
  map.settings.exportFormat='jpeg';map.settings.jpegQuality=.75;assert.equal(validateMap(map).settings.jpegQuality,.75);map.settings.exportFormat='webp';assert.throws(()=>validateMap(map),/export format/);
});
test('region editing distinguishes transparent atlas holes from source gutters',()=>{
  assert.deepEqual(inferSheetGrid([{rect:[0,0,16,16]},{rect:[32,0,16,16]}]),{width:16,height:16,spacing:0,margin:0});
  assert.deepEqual(inferSheetGrid([{rect:[1,1,16,16]},{rect:[18,1,16,16]}]),{width:16,height:16,spacing:1,margin:1});
});
test('Default Tiles 2 ships at 16px with stable atlas IDs and no fully transparent brushes',async()=>{
  const pack=JSON.parse(await readFile(new URL('../assets/defaults/default-tiles-2.json',import.meta.url))),image=PNG.sync.read(await readFile(new URL('../assets/defaults/default-tiles-2.png',import.meta.url)));
  assert.deepEqual([image.width,image.height],[112,128]);assert.ok(pack.tiles.length>30);
  for(const tile of pack.tiles){const index=Number(tile.id.split(':')[1]);assert.deepEqual(tile.rect,[index%7*16,Math.floor(index/7)*16,16,16]);const[x,y,w,h]=tile.rect;let alpha=0;for(let sy=y;sy<y+h;sy++)for(let sx=x;sx<x+w;sx++)alpha+=image.data[(sy*image.width+sx)*4+3];assert.ok(alpha>0);}
});
