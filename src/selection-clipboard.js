import { selectionBounds, inBounds } from './model.js';
import { expandInstances } from './multi-tile.js';

export function copySelection(map, layerIds, indices) {
  const layers = map.layers.filter(layer => layerIds.includes(layer.id) && layer.visible && !layer.locked && layer.opacity !== 0);
  const expanded = expandInstances(layers, indices), bounds = selectionBounds(map, expanded);
  if (!bounds || !layers.some(layer => expanded.some(i => layer.cells[i]))) return null;
  const ids = new Set();
  const entries = layers.map(layer => ({ id: layer.id, name: layer.name, cells: expanded.filter(i => layer.cells[i]).map(i => { const cell = structuredClone(layer.cells[i]); ids.add(cell.tile); return { x: i % map.width - bounds.x, y: Math.floor(i / map.width) - bounds.y, cell }; }) }));
  const packs = map.packs.flatMap(pack => { const tiles = pack.tiles.filter(tile => ids.has(tile.id)), sources = new Set(tiles.map(tile => tile.image)); return tiles.length ? [{ ...structuredClone(pack), tiles: structuredClone(tiles), images: structuredClone(pack.images.filter(image => sources.has(image.id))), imports: [] }] : []; });
  return { bounds, layers: entries, packs };
}
export function pasteTargets(map, clip, selectedIds) {
  const layers = map.layers.filter(layer => selectedIds.includes(layer.id));
  if (layers.length !== clip.layers.length) throw new Error(`Select ${clip.layers.length} layers to paste this selection.`);
  if (layers.some(layer => layer.locked || !layer.visible || layer.opacity === 0)) throw new Error('Select unlocked, visible layers to paste.');
  return layers;
}
export function canPaste(map, clip, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && inBounds(map,x,y) && inBounds(map,x+clip.bounds.width-1,y+clip.bounds.height-1);
}
function retainAssets(map, clip) {
  const remap = new Map(), retained = { id: `custom-clipboard-${crypto.randomUUID()}`, name: 'Retained selection artwork', hidden: true, images: [], tiles: [], imports: [] };
  for (const source of clip.packs) for (const tile of source.tiles) {
    const image = source.images.find(image => image.id === tile.image);
    const same = map.packs.flatMap(pack => pack.tiles.map(other => ({ pack, other }))).find(({pack,other}) => JSON.stringify(other.rect) === JSON.stringify(tile.rect) && (other.pixelArt ?? true) === (tile.pixelArt ?? true) && (other.cellSpacing || 0) === (tile.cellSpacing || 0) && pack.images.find(i => i.id === other.image)?.data === image.data);
    if (same) { remap.set(tile.id,same.other.id); continue; }
    const imageId = `image-${retained.images.length}`, id = `${retained.id}:${retained.tiles.length}`;
    retained.images.push({...image,id:imageId}); retained.tiles.push({...tile,id,image:imageId,hidden:true}); remap.set(tile.id,id);
  }
  if (retained.tiles.length) map.packs.push(retained);
  return remap;
}
export function pasteSelection(history, clip, x, y, selectedIds) {
  const map = history.map, layers = pasteTargets(map,clip,selectedIds);
  if (!canPaste(map,clip,x,y)) throw new Error('The selection would leave the map. Move it inward first.');
  const selected = new Set();
  history.snapshot(() => {
    const remap = retainAssets(map,clip);
    clip.layers.forEach((entry,i) => {
      const layer = layers[i], hit = new Set(entry.cells.map(p => layer.cells[(y+p.y)*map.width+x+p.x]?.instance).filter(Boolean)), instances = new Map();
      layer.cells.forEach((cell,index) => { if (cell?.instance && hit.has(cell.instance)) layer.cells[index] = null; });
      for (const part of entry.cells) {
        const index = (y+part.y)*map.width+x+part.x, cell = structuredClone(part.cell);
        cell.tile = remap.get(cell.tile) || cell.tile;
        if (cell.instance) { if (!instances.has(cell.instance)) instances.set(cell.instance,crypto.randomUUID()); cell.instance = instances.get(cell.instance); }
        layer.cells[index] = cell; selected.add(index);
      }
    });
  },{includePacks:true});
  return [...selected];
}
