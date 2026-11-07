import { tilesetImports } from './model.js';
import { baseTileSize } from './multi-tile.js';

export function inferSheetGrid(tiles) {
  const [width,height]=baseTileSize(tiles[0]), grouped=tiles.find(tile=>tile.footprint?.some(n=>n>1));
  // Empty atlas cells can separate visible sprites. Choose the smallest grid
  // spacing that aligns every source region, rather than treating holes as gaps.
  for(let spacing=grouped?.cellSpacing || 0;spacing<=1024;spacing++) {
    if (grouped && spacing!==(grouped.cellSpacing || 0)) break;
    const margin=tiles[0].rect[0]%(width+spacing);
    if(tiles.every(tile=>(tile.rect[0]-margin)%(width+spacing)===0 && (tile.rect[1]-margin)%(height+spacing)===0)) return {width,height,spacing,margin};
  }
  return {width,height,spacing:0,margin:0};
}

// Existing placements keep their original IDs and source regions. Only palette
// definitions are replaced; used definitions become embedded, hidden artwork.
export function replaceImportRegions(history, packId, importId, imageId, entries) {
  const map = history.map, pack = map.packs.find(pack => pack.id === packId && !pack.hidden), groups = pack && tilesetImports(pack), group = groups?.find(group => group.id === importId);
  if (!group || !pack.images.some(image => image.id === imageId) || !entries.length) throw new Error('No visible tile regions to save.');
  const old = new Set(group.tiles.filter(id => pack.tiles.find(tile => tile.id === id)?.image === imageId)), used = new Set(map.layers.flatMap(layer => layer.cells.filter(Boolean).map(cell => cell.tile)));
  const tiles = entries.map((entry,i) => ({...structuredClone(entry),id:`${pack.id}:region-${crypto.randomUUID()}`,name:`${pack.name} ${String(i+1).padStart(3,'0')}`,category:'Custom',image:imageId,pixelArt:true}));
  history.snapshot(() => {
    pack.tiles = [...pack.tiles.flatMap(tile => !old.has(tile.id) ? [tile] : used.has(tile.id) ? [{...tile,hidden:true}] : []),...tiles];
    pack.imports = groups.map(item => item.id === importId ? {...item,tiles:[...item.tiles.filter(id=>!old.has(id)),...tiles.map(tile=>tile.id)]} : item);
    map.packs = map.packs.map(item=>item.id===packId?{...pack}:item);
  },{includePacks:true});
  return tiles;
}
