import { createMap, validateMap, libraryPacks, libraryTiles, exportablePack } from './model.js';

const clone = value => structuredClone(value);
export const emptyLibrary = () => ({ format: 'vtt-tile-library', version: 1, packs: [], packNames: {}, packDescriptions: {}, enabledOptional: [], removedPacks: [], removedTiles: [], tileOrders: {} });
export function mergeDefaultCollections(state, collections) {
  const next=clone(state);
  for(const pack of collections) {
    const sources=pack.sources || [pack.id], aliases=new Map(pack.tiles.flatMap(tile=>(tile.legacyIds || []).map(id=>[id,tile.id])));
    const order=[...(next.tileOrders[pack.id] || []),...sources.filter(id=>id!==pack.id).flatMap(id=>next.tileOrders[id] || [])];
    if(order.length)next.tileOrders[pack.id]=[...new Set(order.map(id=>aliases.get(id)||id))];
    for(const id of sources)if(id!==pack.id)delete next.tileOrders[id];
  }
  return next;
}
function sameVisual(pack, tile, source, original, cache) {
  if ((tile.pixelArt ?? true) !== (original.pixelArt ?? true) || (tile.cellSpacing || 0) !== (original.cellSpacing || 0) || tile.rect.some((value, i) => value !== original.rect[i])) return false;
  const key = JSON.stringify([pack.id, tile.image, original.image]);
  if (!cache.has(key)) { const image = pack.images.find(image => image.id === tile.image), other = source.images.find(image => image.id === original.image); cache.set(key, image?.data === other?.data && image?.width === other?.width && image?.height === other?.height); }
  return cache.get(key);
}

export function validateLibrary(value) {
  if (!value || value.format !== 'vtt-tile-library' || value.version !== 1) throw new Error('Choose a Map Maker tileset library backup.');
  const state = emptyLibrary(), map = validateMap({ ...createMap(4, 4), packs: value.packs, packNames: value.packNames || {}, packDescriptions: value.packDescriptions || {} });
  state.packs = libraryPacks(map).map(exportablePack); state.packNames = map.packNames; state.packDescriptions = map.packDescriptions;
  for (const key of ['enabledOptional', 'removedPacks', 'removedTiles']) {
    const values = value[key] || [];
    if (!Array.isArray(values) || values.length > 100000 || values.some(id => typeof id !== 'string' || !id || id.length > 500)) throw new Error('Invalid library preferences.');
    state[key] = [...new Set(values)];
  }
  const orders = value.tileOrders || {};
  if (!orders || typeof orders !== 'object' || Array.isArray(orders) || Object.keys(orders).length > 256) throw new Error('Invalid tile ordering.');
  let total = 0;
  for (const [id, order] of Object.entries(orders)) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !Array.isArray(order) || order.some(tile => typeof tile !== 'string' || !tile || tile.length > 500) || (total += order.length) > 100000) throw new Error('Invalid tile ordering.');
    state.tileOrders[id] = [...new Set(order)];
  }
  return state;
}

export function adoptProjectLibrary(state, project) {
  const next = clone(state), removedPacks = new Set(next.removedPacks), removedTiles = new Set(next.removedTiles);
  for (const source of libraryPacks(project)) {
    if (removedPacks.has(source.id)) continue;
    const incoming = exportablePack(source); incoming.tiles = incoming.tiles.filter(tile => !removedTiles.has(tile.id));
    const current = next.packs.find(pack => pack.id === incoming.id);
    if (!current) next.packs.push(incoming);
    else {
      const known = new Set(current.tiles.map(tile => tile.id)), additions = incoming.tiles.filter(tile => !known.has(tile.id));
      for (const tile of additions) {
        const image = incoming.images.find(image => image.id === tile.image), existing = current.images.find(item => item.id === image.id);
        if (existing && existing.data !== image.data) tile.image = `adopt-image-${crypto.randomUUID()}`;
        if (!current.images.some(item => item.id === tile.image)) current.images.push({ ...image, id: tile.image });
      }
      current.tiles.push(...additions);
      if (additions.length) current.imports = [...(current.imports || []), ...(incoming.imports || []).map(group => ({ ...group, id: `adopt-${crypto.randomUUID()}`, tiles: group.tiles.filter(id => additions.some(tile => tile.id === id)) })).filter(group => group.tiles.length)];
    }
  }
  next.packNames = { ...project.packNames, ...next.packNames };
  next.packDescriptions = { ...project.packDescriptions, ...next.packDescriptions };
  // Rebuild metadata after filtering removed brushes from a portable project.
  for (const pack of next.packs) { const ids = new Set(pack.tiles.map(tile => tile.id)); pack.imports = (pack.imports || []).map(group => ({ ...group, tiles: group.tiles.filter(id => ids.has(id)) })).filter(group => group.tiles.length); }
  return validateLibrary(next);
}

export function projectWithLibrary(state, project) {
  const result = clone(project), used = new Set(result.layers.flatMap(layer => layer.cells.filter(Boolean).map(cell => cell.tile)));
  const sourcePacks = new Map(result.packs.map(pack => [pack.id, pack])), merged = [], imageComparisons = new Map();
  for (const source of result.packs) {
    const canonical = state.packs.find(pack => pack.id === source.id), pack = canonical ? clone(canonical) : { ...source, hidden: true, tiles: [], images: [], imports: [] };
    for (const tile of source.tiles.filter(tile => used.has(tile.id))) {
      const existing = pack.tiles.find(item => item.id === tile.id);
      if (existing && sameVisual(pack, existing, source, tile, imageComparisons)) continue;
      const retained = { ...tile, hidden: true }, image = source.images.find(image => image.id === tile.image);
      if (existing) {
        retained.id = `${source.id}:retained-${crypto.randomUUID()}`;
        for (const layer of result.layers) for (const cell of layer.cells) if (cell?.tile === tile.id) cell.tile = retained.id;
      }
      const oldImage = pack.images.find(item => item.id === image.id);
      if (oldImage && (oldImage.data !== image.data || oldImage.width !== image.width || oldImage.height !== image.height)) retained.image = `retained-${crypto.randomUUID()}`;
      if (!pack.images.some(item => item.id === retained.image)) pack.images.push({ ...image, id: retained.image });
      pack.tiles.push(retained);
    }
    if (canonical || pack.tiles.length) merged.push(pack);
  }
  for (const pack of state.packs) if (!sourcePacks.has(pack.id)) merged.push(clone(pack));
  result.packs = merged; result.packNames = { ...project.packNames, ...state.packNames };
  result.packDescriptions = { ...project.packDescriptions, ...state.packDescriptions };
  return result;
}

export function libraryFromProject(previous, project) {
  const next = clone(previous), active = libraryPacks(project).map(exportablePack), packIds = new Set(active.map(pack => pack.id)), tileIds = new Set(active.flatMap(pack => pack.tiles.map(tile => tile.id)));
  next.removedPacks = [...new Set([...next.removedPacks, ...previous.packs.filter(pack => !packIds.has(pack.id)).map(pack => pack.id)])].filter(id => !packIds.has(id));
  next.removedTiles = [...new Set([...next.removedTiles, ...previous.packs.flatMap(pack => libraryTiles(pack).filter(tile => !tileIds.has(tile.id)).map(tile => tile.id))])].filter(id => !tileIds.has(id));
  next.packs = active; next.packNames = clone(project.packNames);
  next.packDescriptions = clone(project.packDescriptions || {});
  return next;
}

export function mergeLibraryBackup(current, backup) {
  const incoming = validateLibrary(backup), packIds = new Set(incoming.packs.map(pack => pack.id)), tileIds = new Set(incoming.packs.flatMap(pack => pack.tiles.map(tile => tile.id)));
  const livePacks = new Set([...current.packs.map(pack => pack.id), ...packIds]), liveTiles = new Set([...current.packs.flatMap(pack => pack.tiles.map(tile => tile.id)), ...tileIds]);
  const base = { ...current, removedPacks: [...new Set([...current.removedPacks, ...incoming.removedPacks])].filter(id => !livePacks.has(id)), removedTiles: [...new Set([...current.removedTiles, ...incoming.removedTiles])].filter(id => !liveTiles.has(id)) };
  const merged = adoptProjectLibrary(base, { packs: incoming.packs, packNames: incoming.packNames });
  merged.packNames = { ...current.packNames, ...incoming.packNames }; merged.enabledOptional = [...new Set([...current.enabledOptional, ...incoming.enabledOptional])];
  merged.tileOrders = { ...current.tileOrders, ...incoming.tileOrders };
  merged.packDescriptions = { ...current.packDescriptions, ...incoming.packDescriptions };
  for (const pack of merged.packs) { const source = incoming.packs.find(item => item.id === pack.id); if (source) pack.name = source.name; }
  return validateLibrary(merged);
}

// Unknown/new tiles follow the saved order; stale IDs never hide new brushes.
export function orderedTiles(tiles, savedOrder = []) {
  const ranks = new Map(savedOrder.map((id, index) => [id, index]));
  return [...tiles].sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity));
}
export function moveTileOrder(tiles, savedOrder, sourceId, targetId, after = false) {
  const order = orderedTiles(tiles, savedOrder).map(tile => tile.id);
  const ids = new Set(Array.isArray(sourceId) ? sourceId : [sourceId]), moving = order.filter(id => ids.has(id));
  if (ids.has(targetId) || !moving.length || !order.includes(targetId)) return order;
  const rest = order.filter(id => !ids.has(id));
  rest.splice(rest.indexOf(targetId) + Number(after), 0, ...moving);
  return rest;
}
