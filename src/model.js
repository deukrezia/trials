export const FORMAT = 'vtt-map-maker';
export const VERSION = 1;
export const MAX_CELLS = 40000;
export const MAX_LAYERS = 12;
export const MAX_TILES = 4096;
export const MAX_EMBEDDED_BYTES = 48 * 1024 * 1024;
const clone = value => structuredClone(value);
export const defaultSettings = () => ({ pixelsPerCell: 64, exportGrid: true, transparent: false, cellInches: 1, printDpi: 150, paper: 'a4', orientation: 'portrait', printGrid: true, printBackground: false, gridDefaultsVersion: 1 });

export function createMap(width = 40, height = 30, name = 'Untitled dungeon') {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4 || width > 200 || height > 200 || width * height > MAX_CELLS) throw new Error('Use map dimensions from 4 to 200 cells.');
  return { format: FORMAT, version: VERSION, name, width, height, seed: Date.now(), background: '#383d39', packs: [], packNames: {}, packDescriptions: {}, settings: defaultSettings(), layers: ['Ground', 'Walls', 'Objects'].map((name, i) => ({ id: `layer-${i}`, name, visible: true, locked: false, opacity: 1, cells: Array(width * height).fill(null) })) };
}

export function sameTile(a, b) { return a === b || (!!a && !!b && a.tile === b.tile && a.rotation === b.rotation && a.flip === b.flip); }
export function inBounds(map, x, y) { return x >= 0 && y >= 0 && x < map.width && y < map.height; }
export function placement(tile, rotation = 0, flip = false) { return tile ? { tile, rotation: ((rotation % 4) + 4) % 4, flip: !!flip } : null; }
export function* line(x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    yield [x0, y0];
    if (x0 === x1 && y0 === y1) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}

export const SHAPES = ['rectangle', 'ellipse', 'circle', 'diamond', 'triangle', 'line'];
export function shapeCells(x0, y0, x1, y1, type = 'rectangle', outline = false) {
  if (![x0, y0, x1, y1].every(Number.isInteger) || !SHAPES.includes(type)) throw new Error('Invalid shape.');
  if (type === 'line') return [...line(x0, y0, x1, y1)];
  let left = Math.min(x0, x1), right = Math.max(x0, x1), top = Math.min(y0, y1), bottom = Math.max(y0, y1);
  if (type === 'circle') {
    const side = Math.min(right - left + 1, bottom - top + 1);
    left += Math.floor((right - left + 1 - side) / 2); top += Math.floor((bottom - top + 1 - side) / 2);
    right = left + side - 1; bottom = top + side - 1;
  }
  const width = right - left + 1, height = bottom - top + 1, cx = (left + right) / 2, cy = (top + bottom) / 2;
  const rx = (type === 'circle' ? Math.min(width, height) : width) / 2, ry = (type === 'circle' ? Math.min(width, height) : height) / 2;
  function inside(x, y) {
    if (x < left || x > right || y < top || y > bottom) return false;
    if (type === 'rectangle') return true;
    if (type === 'diamond') return Math.abs(x - cx) / rx + Math.abs(y - cy) / ry <= 1 + 1e-9;
    if (type === 'triangle') return Math.abs(x - cx) <= width / 2 * ((y - top + .5) / height) + 1e-9;
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 + 1e-9;
  }
  const cells = [];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) if (inside(x, y) && (!outline || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1))) cells.push([x, y]);
  return cells;
}

export class History {
  constructor(map) { this.map = map; this.undoStack = []; this.redoStack = []; this.pending = null; }
  begin(layerIndex) {
    if (this.pending) throw new Error('Finish the current stroke first.');
    this.pending = { layerIndex, changes: new Map() };
  }
  set(x, y, value) {
    if (!this.pending || !inBounds(this.map, x, y)) return;
    const layer = this.map.layers[this.pending.layerIndex];
    if (layer.locked || !layer.visible) return;
    const index = y * this.map.width + x;
    if (sameTile(layer.cells[index], value)) return;
    if (!this.pending.changes.has(index)) this.pending.changes.set(index, { before: clone(layer.cells[index]), after: null });
    layer.cells[index] = clone(value);
    this.pending.changes.get(index).after = clone(value);
  }
  brush(x, y, value, size = 1) {
    const start = -Math.floor((size - 1) / 2);
    for (let oy = start; oy < start + size; oy++) for (let ox = start; ox < start + size; ox++) this.set(x + ox, y + oy, value);
  }
  rectangle(x0, y0, x1, y1, value) {
    for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(this.map.height - 1, Math.max(y0, y1)); y++) for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(this.map.width - 1, Math.max(x0, x1)); x++) this.set(x, y, value);
  }
  shape(x0, y0, x1, y1, value, type = 'rectangle', outline = false) {
    for (const [x, y] of shapeCells(x0, y0, x1, y1, type, outline)) this.set(x, y, value);
  }
  fill(x, y, value) {
    if (!this.pending || !inBounds(this.map, x, y)) return;
    const cells = this.map.layers[this.pending.layerIndex].cells;
    const target = clone(cells[y * this.map.width + x]);
    if (sameTile(target, value)) return;
    const visited = new Set(), queue = [[x, y]];
    for (let head = 0; head < queue.length; head++) {
      const [cx, cy] = queue[head], index = cy * this.map.width + cx;
      if (!inBounds(this.map, cx, cy) || visited.has(index)) continue;
      visited.add(index);
      if (!sameTile(cells[index], target)) continue;
      this.set(cx, cy, value);
      queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }
  commit() {
    if (!this.pending) return false;
    const { layerIndex, changes } = this.pending;
    const entries = [...changes].filter(([, change]) => !sameTile(change.before, change.after));
    this.pending = null;
    if (!entries.length) return false;
    this.undoStack.push({ layerIndex, entries });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    return true;
  }
  cancel() {
    if (!this.pending) return;
    const layer = this.map.layers[this.pending.layerIndex];
    for (const [index, change] of this.pending.changes) layer.cells[index] = clone(change.before);
    this.pending = null;
  }
  snapshot(action, { includePacks = false, includeLayers = false } = {}) {
    if (this.pending) this.commit();
    const capture = () => ({ width: this.map.width, height: this.map.height, ...(includeLayers ? { layers: clone(this.map.layers) } : { cells: this.map.layers.map(layer => clone(layer.cells)) }), ...(includePacks ? { packs: clone(this.map.packs) } : {}) });
    const before = capture();
    try { action(); } catch (error) { this.restore(before); throw error; }
    const after = capture();
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.undoStack.push({ kind: 'grid', before, after });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = []; return true;
  }
  restore(snapshot) {
    this.map.width = snapshot.width; this.map.height = snapshot.height;
    if (snapshot.packs) this.map.packs = clone(snapshot.packs);
    if (snapshot.layers) this.map.layers = clone(snapshot.layers);
    else this.map.layers.forEach((layer, i) => { layer.cells = clone(snapshot.cells[i]); });
  }
  apply(from, to, key) {
    if (this.pending) this.commit();
    const entry = from.pop();
    if (!entry) return false;
    if (entry.kind === 'grid') this.restore(entry[key]);
    else for (const [index, change] of entry.entries) this.map.layers[entry.layerIndex].cells[index] = clone(change[key]);
    to.push(entry); return true;
  }
  undo() { return this.apply(this.undoStack, this.redoStack, 'before'); }
  redo() { return this.apply(this.redoStack, this.undoStack, 'after'); }
}

export function addLayer(history, duplicateId = null, limit = MAX_LAYERS) {
  const map = history.map;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LAYERS) throw new Error('Invalid layer limit.');
  if (map.layers.length >= limit) throw new Error(`A map can contain at most ${limit} layers.`);
  const source = duplicateId === null ? null : map.layers.find(layer => layer.id === duplicateId);
  if (duplicateId !== null && !source) throw new Error('Layer not found.');
  let number = source ? 1 : 4, name;
  do { name = source ? `${source.name.slice(0, 85)} copy${number === 1 ? '' : ` ${number}`}` : `Layer ${number}`; number++; } while (map.layers.some(layer => layer.name === name));
  const layer = source ? { ...clone(source), id: `layer-${crypto.randomUUID()}`, name } : { id: `layer-${crypto.randomUUID()}`, name, visible: true, locked: false, opacity: 1, cells: Array(map.width * map.height).fill(null) };
  history.snapshot(() => { map.layers.splice(source ? map.layers.indexOf(source) + 1 : map.layers.length, 0, layer); }, { includeLayers: true });
  return layer.id;
}

export function deleteLayer(history, id) {
  if (history.map.layers.length <= 1) throw new Error('Keep at least one map layer.');
  if (!history.map.layers.some(layer => layer.id === id)) throw new Error('Layer not found.');
  return history.snapshot(() => { history.map.layers = history.map.layers.filter(layer => layer.id !== id); }, { includeLayers: true });
}

export function reorderLayer(history, id, index) {
  const layers = history.map.layers, from = layers.findIndex(layer => layer.id === id);
  if (from < 0 || !Number.isInteger(index) || index < 0 || index >= layers.length) throw new Error('Invalid layer position.');
  return history.snapshot(() => { layers.splice(index, 0, layers.splice(from, 1)[0]); }, { includeLayers: true });
}

export function setLayerState(history, id, changes) {
  const layer = history.map.layers.find(layer => layer.id === id);
  if (!layer || !Object.keys(changes).length || Object.keys(changes).some(key => !['opacity', 'visible', 'locked', 'name'].includes(key))) throw new Error('Invalid layer settings.');
  if ('name' in changes && (typeof changes.name !== 'string' || !changes.name.trim() || changes.name.trim().length > 100)) throw new Error('Use a layer name from 1 to 100 characters.');
  if ('opacity' in changes && ![0, .25, .5, .75, 1].includes(changes.opacity)) throw new Error('Use opacity in increments of 25%.');
  if (['visible', 'locked'].some(key => key in changes && typeof changes[key] !== 'boolean')) throw new Error('Invalid layer settings.');
  return history.snapshot(() => Object.assign(layer, changes, 'name' in changes ? { name: changes.name.trim() } : {}), { includeLayers: true });
}

export function selectionInRect(map, layerIndex, x0, y0, x1, y1) {
  const result = [];
  for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(map.height - 1, Math.max(y0, y1)); y++) for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(map.width - 1, Math.max(x0, x1)); x++) if (map.layers[layerIndex].cells[y * map.width + x]) result.push(y * map.width + x);
  return result;
}
export function selectionBounds(map, indices) {
  const valid = [...indices].filter(i => Number.isInteger(i) && i >= 0 && i < map.width * map.height);
  if (!valid.length) return null;
  const xs = valid.map(i => i % map.width), ys = valid.map(i => Math.floor(i / map.width));
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x + 1, height: Math.max(...ys) - y + 1 };
}
export function transformSelection(history, layerIndex, indices, operation, dx = 0, dy = 0) {
  return transformLayersSelection(history, [history.map.layers[layerIndex].id], indices, operation, dx, dy);
}
export function selectionInLayers(map, layerIds, x0, y0, x1, y1) {
  const selected = new Set(layerIds), indices = new Set();
  map.layers.forEach((layer, i) => { if (selected.has(layer.id) && layer.visible && layer.opacity !== 0 && !layer.locked) for (const index of selectionInRect(map, i, x0, y0, x1, y1)) indices.add(index); });
  return [...indices];
}
export function transformLayersSelection(history, layerIds, indices, operation, dx = 0, dy = 0) {
  const map = history.map, selected = new Set(layerIds), layers = map.layers.filter(layer => selected.has(layer.id) && layer.visible && layer.opacity !== 0 && !layer.locked);
  if (!layers.length) throw new Error('Select an unlocked, visible layer.');
  const active = [...new Set(indices)].filter(i => Number.isInteger(i) && i >= 0 && i < map.width * map.height && layers.some(layer => layer.cells[i]));
  const bounds = selectionBounds(map, active); if (!bounds) return [];
  if (!['move', 'rotate', 'flip', 'delete'].includes(operation) || !Number.isInteger(dx) || !Number.isInteger(dy)) throw new Error('Invalid selection transform.');
  const edits = layers.map(layer => ({ layer, active: active.filter(i => layer.cells[i]), transformed: operation === 'delete' ? [] : active.filter(i => layer.cells[i]).map(i => {
    const x = i % map.width - bounds.x, y = Math.floor(i / map.width) - bounds.y, cell = layer.cells[i];
    if (operation === 'rotate') return { x: bounds.x + bounds.height - 1 - y, y: bounds.y + x, cell: placement(cell.tile, cell.rotation + 1, cell.flip) };
    if (operation === 'flip') return { x: bounds.x + bounds.width - 1 - x, y: bounds.y + y, cell: placement(cell.tile, -cell.rotation, !cell.flip) };
    return { x: bounds.x + x + dx, y: bounds.y + y + dy, cell: clone(cell) };
  }) }));
  if (edits.some(edit => edit.transformed.some(cell => !inBounds(map, cell.x, cell.y)))) throw new Error('The selection would leave the map. Enlarge the map or move it inward first.');
  history.snapshot(() => { for (const edit of edits) { for (const i of edit.active) edit.layer.cells[i] = null; for (const cell of edit.transformed) edit.layer.cells[cell.y * map.width + cell.x] = clone(cell.cell); } });
  return [...new Set(edits.flatMap(edit => edit.transformed.map(cell => cell.y * map.width + cell.x)))];
}
export function resizeOffset(map, width, height, anchor = 'top-left') {
  createMap(width, height);
  if (!['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'].includes(anchor)) throw new Error('Choose a resize anchor.');
  const dw = width - map.width, dh = height - map.height;
  return { dx: anchor.includes('left') ? 0 : anchor.includes('right') ? dw : Math.floor(dw / 2), dy: anchor.includes('top') ? 0 : anchor.includes('bottom') ? dh : Math.floor(dh / 2) };
}
export function countCropped(map, width, height, dx, dy) {
  return map.layers.reduce((count, layer) => count + layer.cells.filter((cell, i) => cell && (i % map.width + dx < 0 || i % map.width + dx >= width || Math.floor(i / map.width) + dy < 0 || Math.floor(i / map.width) + dy >= height)).length, 0);
}
function remapGrid(map, width, height, dx, dy) {
  const oldWidth = map.width;
  for (const layer of map.layers) {
    const cells = Array(width * height).fill(null);
    layer.cells.forEach((cell, i) => { if (!cell) return; const x = i % oldWidth + dx, y = Math.floor(i / oldWidth) + dy; if (x >= 0 && y >= 0 && x < width && y < height) cells[y * width + x] = clone(cell); });
    layer.cells = cells;
  }
  map.width = width; map.height = height;
}
export function resizeMap(history, width, height, anchor = 'top-left', allowCrop = false) {
  const { dx, dy } = resizeOffset(history.map, width, height, anchor);
  const cropped = countCropped(history.map, width, height, dx, dy);
  if (cropped && !allowCrop) throw new Error(`${cropped} tiles would be cropped. Enable cropping to apply this resize.`);
  return history.snapshot(() => remapGrid(history.map, width, height, dx, dy));
}
export function shiftMap(history, dx, dy, allowCrop = false) {
  const map = history.map;
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) throw new Error('Use whole-cell offsets.');
  const cropped = countCropped(map, map.width, map.height, dx, dy);
  if (cropped && !allowCrop) throw new Error(`${cropped} tiles would leave the map. Enable cropping or enlarge the map first.`);
  return history.snapshot(() => remapGrid(map, map.width, map.height, dx, dy));
}

export function deletePack(history, id) {
  const map = history.map, pack = libraryPacks(map).find(pack => pack.id === id);
  if (!pack) throw new Error('Select a custom tileset to delete.');
  const used = placedTileIds(map), retained = pack.tiles.filter(tile => used.has(tile.id)), sources = new Set(retained.map(tile => tile.image));
  return history.snapshot(() => {
    map.packs = map.packs.flatMap(item => item.id !== id ? [item] : retained.length ? [{ ...pack, hidden: true, tiles: retained.map(tile => ({ ...tile, hidden: true })), images: pack.images.filter(image => sources.has(image.id)), imports: [] }] : []);
  }, { includePacks: true });
}

export const libraryPacks = map => map.packs.filter(pack => !pack.hidden);
export const libraryTiles = pack => pack.tiles.filter(tile => !tile.hidden);
function placedTileIds(map) { const ids = new Set(); for (const layer of map.layers) for (const cell of layer.cells) if (cell) ids.add(cell.tile); return ids; }
export function exportablePack(pack) {
  const { hidden, ...data } = pack, tiles = libraryTiles(pack).map(({ hidden, ...tile }) => tile), sources = new Set(tiles.map(tile => tile.image));
  return { ...data, tiles, images: pack.images.filter(image => sources.has(image.id)), imports: tilesetImports(pack) };
}

export function tilesetImports(pack) {
  const groups = (pack.imports || []).map(group => clone(group)), assigned = new Set(groups.flatMap(group => group.tiles));
  for (const image of pack.images) {
    const tiles = pack.tiles.filter(tile => !tile.hidden && tile.image === image.id && !assigned.has(tile.id));
    if (tiles.length) {
      let id = `source:${image.id}`;
      while (groups.some(group => group.id === id)) id += ':unassigned';
      groups.push({ id, name: tiles[0].name.replace(/\s+\d+$/, '') || 'Imported tiles', tiles: tiles.map(tile => tile.id) });
    }
  }
  return groups;
}

export function deleteImport(history, packId, importId) {
  const map = history.map, pack = libraryPacks(map).find(pack => pack.id === packId);
  if (!pack) throw new Error('Select a custom tileset first.');
  const groups = tilesetImports(pack), group = groups.find(group => group.id === importId);
  if (!group) throw new Error('This import could not be found.');
  const ids = new Set(group.tiles), used = placedTileIds(map);
  return history.snapshot(() => {
    pack.tiles = pack.tiles.flatMap(tile => !ids.has(tile.id) ? [tile] : used.has(tile.id) ? [{ ...tile, hidden: true }] : []);
    const sources = new Set(pack.tiles.map(tile => tile.image));
    pack.images = pack.images.filter(image => sources.has(image.id));
    pack.imports = groups.filter(group => group.id !== importId);
    // Replace the pack reference so the editor rebuilds its library after this edit.
    map.packs = map.packs.map(item => item.id === packId ? { ...pack } : item);
  }, { includePacks: true });
}

export function printLayout(map) {
  const s = map.settings, portrait = s.paper === 'letter' ? [8.5, 11] : [210 / 25.4, 297 / 25.4];
  const [pageWidth, pageHeight] = s.orientation === 'landscape' ? [...portrait].reverse() : portrait;
  const margin = .5, footer = .25;
  const columns = Math.floor((pageWidth - 2 * margin) / s.cellInches), rows = Math.floor((pageHeight - 2 * margin - footer) / s.cellInches);
  if (columns < 1 || rows < 1) throw new Error('The selected grid size does not fit this paper.');
  return { pageWidth, pageHeight, margin, footer, columns, rows, pagesX: Math.ceil(map.width / columns), pagesY: Math.ceil(map.height / rows), pixels: Math.round(s.cellInches * s.printDpi) };
}

export function sliceSheet(width, height, tileWidth, tileHeight, spacing = 0, margin = 0) {
  if (![width, height, tileWidth, tileHeight, spacing, margin].every(Number.isInteger) || tileWidth < 1 || tileHeight < 1 || spacing < 0 || margin < 0) throw new Error('Enter whole-number tile dimensions, spacing, and margin.');
  const columns = Math.max(0, Math.floor((width - 2 * margin + spacing) / (tileWidth + spacing)));
  const rows = Math.max(0, Math.floor((height - 2 * margin + spacing) / (tileHeight + spacing)));
  if (!columns || !rows || columns * rows > MAX_TILES) throw new Error(`The sheet must contain between 1 and ${MAX_TILES} complete tiles.`);
  return Array.from({ length: columns * rows }, (_, i) => [margin + (i % columns) * (tileWidth + spacing), margin + Math.floor(i / columns) * (tileHeight + spacing), tileWidth, tileHeight]);
}

export function validateMap(input, builtinIds = []) {
  if (!input || input.format !== FORMAT || input.version !== VERSION) throw new Error('This is not a supported Trials map (version 1).');
  const map = createMap(input.width, input.height, input.name);
  if (typeof input.name !== 'string' || input.name.length > 100) throw new Error('Map names must be text, up to 100 characters.');
  if (!/^#[0-9a-f]{6}$/i.test(input.background)) throw new Error('Invalid map background color.');
  if (!Array.isArray(input.layers) || input.layers.length < 1 || input.layers.length > MAX_LAYERS || !Array.isArray(input.packs) || input.packs.length > MAX_TILES + 64) throw new Error('Invalid layers or asset packs.');
  map.background = input.background;
  map.seed = Number.isSafeInteger(input.seed) ? input.seed : 0;
  if (input.settings !== undefined) {
    const s = { ...defaultSettings(), ...input.settings };
    if (input.settings && input.settings.gridDefaultsVersion !== 1) { s.exportGrid = true; s.printGrid = true; s.gridDefaultsVersion = 1; }
    if (!input.settings || typeof input.settings !== 'object' || Array.isArray(input.settings) || !Number.isInteger(s.pixelsPerCell) || s.pixelsPerCell < 8 || s.pixelsPerCell > 512 || !Number.isFinite(s.cellInches) || s.cellInches < .25 || s.cellInches > 2 || ![100, 150, 300].includes(s.printDpi) || !['a4', 'letter'].includes(s.paper) || !['portrait', 'landscape'].includes(s.orientation) || !['exportGrid', 'transparent', 'printGrid', 'printBackground'].every(key => typeof s[key] === 'boolean')) throw new Error('Invalid map export settings.');
    map.settings = Object.fromEntries(Object.keys(defaultSettings()).map(key => [key, s[key]]));
  }
  if (input.packNames !== undefined) {
    if (!input.packNames || typeof input.packNames !== 'object' || Array.isArray(input.packNames) || Object.keys(input.packNames).length > 256) throw new Error('Invalid tileset names.');
    for (const [id, name] of Object.entries(input.packNames)) { if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(id) || typeof name !== 'string' || !name.trim() || name.length > 100) throw new Error('Invalid tileset name.'); map.packNames[id] = name.trim(); }
  }
  map.packDescriptions = {};
  if (input.packDescriptions !== undefined) {
    if (!input.packDescriptions || typeof input.packDescriptions !== 'object' || Array.isArray(input.packDescriptions) || Object.keys(input.packDescriptions).length > 256) throw new Error('Invalid tileset descriptions.');
    for (const [id, description] of Object.entries(input.packDescriptions)) {
      if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(id) || typeof description !== 'string' || description.length > 1000) throw new Error('Invalid tileset description.');
      map.packDescriptions[id] = description.trim();
    }
  }
  const ids = new Set(builtinIds), packIds = new Set();
  let embeddedSize = 0;
  map.packs = input.packs.map(pack => {
    if (!pack || typeof pack.id !== 'string' || !pack.id.startsWith('custom-') || packIds.has(pack.id) || typeof pack.name !== 'string' || !pack.name.trim() || pack.name.length > 100 || !Array.isArray(pack.tiles) || pack.tiles.length > MAX_TILES || !Array.isArray(pack.images) || pack.images.length > MAX_TILES) throw new Error('Invalid custom brush pack.');
    packIds.add(pack.id);
    if (pack.hidden !== undefined && typeof pack.hidden !== 'boolean') throw new Error('Invalid tileset visibility.');
    const sources = new Set();
    const images = pack.images.map(image => {
      if (!image || typeof image.id !== 'string' || sources.has(image.id) || typeof image.data !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image.data) || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width > 8192 || image.height > 8192) throw new Error('Invalid embedded image; use PNG, JPEG, or WebP up to 8192 pixels per side.');
      embeddedSize += image.data.length;
      if (embeddedSize > MAX_EMBEDDED_BYTES) throw new Error('Embedded images exceed the 48 MB map limit.');
      sources.add(image.id); return clone(image);
    });
    const tiles = pack.tiles.map(tile => {
      const source = images.find(image => image.id === tile?.image);
      if (!tile || typeof tile.id !== 'string' || !tile.id.startsWith(pack.id + ':') || ids.has(tile.id) || typeof tile.name !== 'string' || tile.name.length > 100 || !source || !Array.isArray(tile.rect) || tile.rect.length !== 4 || !tile.rect.every(Number.isInteger)) throw new Error('Invalid brush tile.');
      const [x, y, w, h] = tile.rect;
      if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > source.width || y + h > source.height) throw new Error('Tile rectangle falls outside its image.');
      if (tile.pixelArt !== undefined && typeof tile.pixelArt !== 'boolean') throw new Error('Invalid tile rendering preference.');
      if (tile.hidden !== undefined && typeof tile.hidden !== 'boolean') throw new Error('Invalid brush visibility.');
      ids.add(tile.id); return { id: tile.id, name: tile.name, image: tile.image, category: 'Custom', rect: [...tile.rect], ...(tile.pixelArt !== undefined ? { pixelArt: tile.pixelArt } : {}), ...(tile.hidden !== undefined ? { hidden: tile.hidden } : {}) };
    });
    let imports;
    if (pack.imports !== undefined) {
      if (!Array.isArray(pack.imports) || pack.imports.length > tiles.length) throw new Error('Invalid import groups.');
      const groupIds = new Set(), groupedTiles = new Set(), tileIds = new Set(tiles.filter(tile => !tile.hidden).map(tile => tile.id));
      imports = pack.imports.map(group => {
        if (!group || typeof group.id !== 'string' || !group.id || group.id.length > 200 || groupIds.has(group.id) || typeof group.name !== 'string' || !group.name.trim() || group.name.length > 100 || !Array.isArray(group.tiles) || !group.tiles.length || group.tiles.some(id => !tileIds.has(id) || groupedTiles.has(id))) throw new Error('Invalid import group.');
        groupIds.add(group.id);
        for (const id of group.tiles) { if (groupedTiles.has(id)) throw new Error('Duplicate tile in import groups.'); groupedTiles.add(id); }
        return { id: group.id, name: group.name, tiles: [...group.tiles] };
      });
    }
    return { id: pack.id, name: pack.name, images, tiles, ...(imports ? { imports } : {}), ...(pack.hidden !== undefined ? { hidden: pack.hidden } : {}) };
  });
  if (libraryPacks(map).length > 64) throw new Error('A map can contain at most 64 custom tilesets.');
  if (ids.size > builtinIds.length + MAX_TILES) throw new Error(`A map can contain at most ${MAX_TILES} imported tiles.`);
  const layerIds = new Set();
  map.layers = input.layers.map((layer, i) => {
    if (!layer || typeof layer.visible !== 'boolean' || typeof layer.locked !== 'boolean' || !Array.isArray(layer.cells) || layer.cells.length !== map.width * map.height) throw new Error('Invalid map layer.');
    const id = layer.id ?? `layer-${i}`, name = layer.name ?? ['Ground', 'Walls', 'Objects'][i] ?? `Layer ${i + 1}`, opacity = layer.opacity ?? 1;
    if (typeof id !== 'string' || !id || id.length > 100 || layerIds.has(id) || typeof name !== 'string' || !name.trim() || name.length > 100 || ![0, .25, .5, .75, 1].includes(opacity)) throw new Error('Invalid layer name, ID, or opacity.');
    layerIds.add(id);
    return { id, name, visible: layer.visible, locked: layer.locked, opacity, cells: layer.cells.map(cell => {
      if (cell === null) return null;
      if (!cell || !ids.has(cell.tile) || !Number.isInteger(cell.rotation) || cell.rotation < 0 || cell.rotation > 3 || typeof cell.flip !== 'boolean') throw new Error('The map contains an invalid or missing tile.');
      return placement(cell.tile, cell.rotation, cell.flip);
    }) };
  });
  return map;
}

export function makeDemo() {
  const map = createMap(36, 26, 'The Lantern Vault');
  const p = name => placement(`kenney:${name}.png`);
  const set = (layer, x, y, name, rotation = 0) => { map.layers[layer].cells[y * map.width + x] = placement(`kenney:${name}.png`, rotation); };
  function room(x, y, w, h) {
    for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) map.layers[0].cells[cy * map.width + cx] = p('tile');
    for (let cx = x; cx < x + w; cx++) { set(1, cx, y, 'wall'); set(1, cx, y + h - 1, 'wall', 2); }
    for (let cy = y; cy < y + h; cy++) { set(1, x, cy, 'wall', 3); set(1, x + w - 1, cy, 'wall', 1); }
    for (const [cx, cy, r] of [[x, y, 0], [x + w - 1, y, 1], [x + w - 1, y + h - 1, 2], [x, y + h - 1, 3]]) set(1, cx, cy, 'wall_corner', r);
  }
  room(3, 3, 12, 10); room(21, 3, 12, 10); room(10, 16, 16, 8);
  for (let x = 14; x <= 21; x++) for (let y = 7; y <= 9; y++) { set(0, x, y, 'tile'); if (y === 7 || y === 9) set(1, x, y, 'wall', y === 9 ? 2 : 0); }
  for (let y = 12; y <= 16; y++) for (let x = 16; x <= 18; x++) { set(0, x, y, 'tile'); if (x !== 17) set(1, x, y, 'wall', x === 16 ? 3 : 1); }
  for (let x = 14; x <= 17; x++) { set(0, x, 12, 'tile'); set(0, x, 11, 'tile'); }
  for (const [x, y] of [[14, 8], [21, 8], [17, 16]]) map.layers[1].cells[y * map.width + x] = null;
  for (const [name, x, y, r] of [['table', 6, 6, 0], ['chair', 6, 7, 0], ['chair', 7, 6, 1], ['barrels', 5, 10, 0], ['crate', 12, 5, 0], ['carpet', 25, 7, 0], ['chest', 29, 5, 0], ['coffin', 28, 9, 1], ['stairs_down', 12, 20, 0], ['campfire', 18, 20, 0], ['bed', 23, 19, 0], ['barrel', 23, 21, 0]]) set(2, x, y, name, r);
  return map;
}
