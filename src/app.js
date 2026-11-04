import { createMap, History, placement, line, inBounds, sliceSheet, validateMap, makeDemo, MAX_TILES, MAX_EMBEDDED_BYTES, MAX_LAYERS, selectionInLayers, selectionBounds, transformLayersSelection, resizeMap, resizeOffset, countCropped, shiftMap, printLayout, shapeCells, deletePack, tilesetImports, deleteImport, addLayer, deleteLayer, reorderLayer, setLayerState, libraryPacks, libraryTiles, exportablePack } from './model.js';
import { layerSymbol } from './layer-symbols.js';
import { printPDF } from './print-export.js';
import { createShapeMenu } from './shape-menu.js';
import { createLayerMenu } from './layer-menu.js';
import { emptyLibrary, validateLibrary, adoptProjectLibrary, projectWithLibrary, libraryFromProject, mergeLibraryBackup, orderedTiles, moveTileOrder } from './library.js';
import { configureEdition } from './edition.js';
import { editionPolicy, policyPacks, policyTiles, importCount, assertTileSetup, assertImportCapacity, cropBounds, FREE_UPGRADE } from './edition-policy.js';
import { addFreePNGWatermark } from './watermark.js';
import { footprint, baseTileSize, partRect, stampParts, rotatedFootprint, patternAnchors, sheetEntries } from './multi-tile.js';
import { initializeWindowChrome } from './window-chrome.js';

initializeWindowChrome();

const $ = id => document.getElementById(id);
const TILE = 64, AUTOSAVE_KEY = 'workspace';
const canvas = $('map-canvas'), ctx = canvas.getContext('2d');
const viewport = $('viewport');
let map, history, builtinPacks = [], builtinTiles = [], selected, layerIndex = 0, tool = 'brush', rotation = 0, flip = false;
let activeCategory = 'All', activePack = 'all', grid = true, zoom = 1, pan = { x: 0, y: 0 };
let pointer = null, pendingMapMove = null, hover = null, spaceHeld = false, dirty = false, revision = 0;
let selection = new Set();
let shapeType = 'rectangle', shapeOutline = false, shapePlacement = null;
let importRegions = [], importDrag = null, importLayoutKey = '';
let paletteSelection = new Set(), paletteAnchor = null;
let customImages = new Map(), deletingPackId = null, importTargetId = null;
let managingPackId = null, deletingImport = null;
let draggedTileId = null, suppressTileClick = false;
let activeLayerId = null, draggedLayerId = null, deletingLayerId = null;
let renamingLayerId = null, renamingPackId = null;
let selectedLayerIds = new Set(), layerAnchorId = null;
let sharedLibrary = emptyLibrary(), libraryWrite = Promise.resolve();
let policy = editionPolicy('web');
const availableCustomPacks = (candidate = map) => policyPacks(candidate, policy);
const availablePackTiles = pack => builtinPacks.some(item => item.id === pack.id) ? pack.tiles : policyTiles(pack, policy);
const projectOverLimit = () => map && map.layers.length > policy.maxLayers;
function canEditProject() { if (projectOverLimit()) { notify(`Free supports 6 layers. This project is preserved for viewing, saving and exporting. ${FREE_UPGRADE}`, true); return false; } return true; }
const enabledBuiltins = () => builtinPacks.filter(pack => !pack.optional || sharedLibrary.enabledOptional.includes(pack.id));
const defaultBrush = () => enabledBuiltins()[0]?.tiles[0]?.id;
let images = new Map(), tiles = new Map(), packs = [], frame = 0, autosaveTimer, toastTimer, importImages = [], importGeneration = 0;

function notify(message, error = false) {
  $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, error ? 7000 : 3500);
}
function showError(error) { console.error(error); notify(error.message || 'Something went wrong.', true); }
function safeName(name) { return (name.replace(/[^\p{L}\p{N}\s_-]/gu, '').trim() || 'map').slice(0, 80); }
function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function jsonDownload(value, name) { download(new Blob([JSON.stringify(value)], { type: 'application/json' }), name); }
function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('An image could not be loaded.')); image.src = src; }); }
async function readImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose PNG, JPEG, or WebP images.');
  if (file.size > 24 * 1024 * 1024) throw new Error('Each image must be smaller than 24 MB.');
  let data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read image.')); reader.readAsDataURL(file); });
  let image = await loadImage(data); const originalWidth = image.width, originalHeight = image.height;
  const bounds = cropBounds(policy, image.width, image.height);
  if (policy.edition === 'web' && (bounds.width !== image.width || bounds.height !== image.height)) { const cropped = document.createElement('canvas'); cropped.width = bounds.width; cropped.height = bounds.height; const context = cropped.getContext('2d'); context.imageSmoothingEnabled = false; context.drawImage(image, 0, 0, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height); data = cropped.toDataURL('image/png'); image = await loadImage(data); }
  if (image.width > 8192 || image.height > 8192) throw new Error('Images must be at most 8192 pixels per side.');
  return { name: file.name.replace(/\.[^.]+$/, '').slice(0, 90), filename: file.name, data, width: image.width, height: image.height, image, originalWidth, originalHeight };
}

const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('vtt-map-maker', 2);
  request.onupgradeneeded = () => { for (const name of ['maps', 'library']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name); };
  request.onblocked = () => notify('Close older Trials tabs and reload to update local storage.', true);
  request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); }; request.onerror = () => reject(request.error);
});
// A restricted browser may reject storage; manual file save still works.
database.catch(() => {});
async function storedMap() {
  const db = await database;
  return new Promise((resolve, reject) => { const request = db.transaction('maps').objectStore('maps').get(AUTOSAVE_KEY); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
async function storedLibrary() {
  const db = await database;
  return new Promise((resolve, reject) => { const request = db.transaction('library').objectStore('library').get('shared'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
function publishLibrary(value) {
  sharedLibrary = value; const snapshot = structuredClone(value);
  libraryWrite = libraryWrite.catch(() => {}).then(async () => {
    const db = await database;
    await new Promise((resolve, reject) => { const tx = db.transaction('library', 'readwrite'); tx.objectStore('library').put(snapshot, 'shared'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  });
  libraryWrite.catch(() => notify('The shared library could not be saved. Use Back up library to keep a copy.', true));
}
function autosave() {
  clearTimeout(autosaveTimer);
  const saveRevision = revision;
  autosaveTimer = setTimeout(async () => {
    try {
      const db = await database, value = structuredClone(map);
      await libraryWrite;
      await new Promise((resolve, reject) => { const tx = db.transaction('maps', 'readwrite'); tx.objectStore('maps').put(value, AUTOSAVE_KEY); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
      if (revision === saveRevision) $('save-state').textContent = 'Saved locally in this browser';
    } catch { $('save-state').textContent = 'Use Save map to keep your work'; }
  }, 600);
}
function changed() { dirty = true; revision++; $('save-state').textContent = 'Saving locally…'; updateStats(); autosave(); requestRender(); }

async function prepareAssets(candidate) {
  const allowedPacks = new Set(availableCustomPacks(candidate).map(pack => pack.id));
  const newImages = new Map(builtinTiles.map(tile => [tile.src, images.get(tile.src)]));
  const newTiles = new Map(builtinPacks.flatMap(pack => pack.tiles.map(tile => [tile.id, { ...tile, hidden: !enabledBuiltins().includes(pack), packId: pack.id, packName: pack.name }])));
  for (const pack of candidate.packs) {
    const allowedTiles = new Set(policyTiles(pack, policy).map(tile => tile.id));
    for (const image of pack.images) {
      const loaded = customImages.get(image.data) || await loadImage(image.data);
      if (loaded.width !== image.width || loaded.height !== image.height) throw new Error('An embedded image does not match its declared dimensions.');
      customImages.set(image.data, loaded);
      newImages.set(`${pack.id}/${image.id}`, loaded);
    }
    for (const tile of pack.tiles) { const restricted = !pack.hidden && !tile.hidden && (!allowedPacks.has(pack.id) || !allowedTiles.has(tile.id)); newTiles.set(tile.id, { ...tile, restricted, hidden: !!(pack.hidden || tile.hidden || restricted), pixelArt: tile.pixelArt ?? true, src: `${pack.id}/${tile.image}`, packId: pack.id, packName: pack.name }); }
  }
  return { newImages, newTiles };
}
async function installMap(candidate) {
  finishStroke();
  pendingMapMove = null; $('move-confirm-dialog').close();
  deletingPackId = null; $('delete-pack-dialog').close();
  managingPackId = null; deletingImport = null; $('tileset-manager-dialog').close(); $('delete-import-dialog').close();
  layerMenu.close(); deletingLayerId = null; $('delete-layer-dialog').close(); renamingLayerId = null; $('rename-layer-dialog').close(); $('kenney-dialog').close();
  const adopted = adoptProjectLibrary(sharedLibrary, candidate);
  candidate = validateMap(projectWithLibrary(adopted, candidate), builtinTiles.map(tile => tile.id));
  const prepared = await prepareAssets(candidate);
  publishLibrary(adopted);
  map = candidate; images = prepared.newImages; tiles = prepared.newTiles; packs = [...enabledBuiltins(), ...availableCustomPacks()];
  customImages = new Map(map.packs.flatMap(pack => pack.images.map(image => [image.data, images.get(`${pack.id}/${image.id}`)])));
  history = new History(map); layerIndex = 0; activeLayerId = map.layers[0].id; activeCategory = 'All';
  selectedLayerIds = new Set([activeLayerId]); layerAnchorId = activeLayerId;
  selection.clear();
  selected = tiles.has(selected) && !tiles.get(selected).hidden ? selected : defaultBrush();
  rotation = 0; flip = false;
  activePack = tiles.get(selected).packId;
  $('map-name').value = map.name; $('map-background').value = map.background;
  $('dimensions').textContent = `${map.width} × ${map.height}`;
  updateName(); renderPacks(); renderCategories(); renderPalette(); renderLayers(); updateBrush(); updateStats(); fitMap();
  dirty = false; revision++; autosave();
}
function updateName() { document.title = `Trials - ${map.name}`; }
function renderPacks() {
  const select = $('pack-select'); select.replaceChildren(new Option('All tilesets', 'all'));
  for (const pack of packs) select.add(new Option(map.packNames[pack.id] || pack.name.replace('Kenney · ', ''), pack.id));
  select.value = activePack;
  if ($('tileset-manager-dialog').open) renderTilesetManager();
}
function rebuildLibrary() {
  packs = [...enabledBuiltins(), ...availableCustomPacks()];
  tiles = new Map(builtinPacks.flatMap(pack => pack.tiles.map(tile => [tile.id, { ...tile, hidden: !enabledBuiltins().includes(pack), packId: pack.id, packName: pack.name }])));
  images = new Map(builtinTiles.map(tile => [tile.src, images.get(tile.src)]));
  const allowedPacks = new Set(availableCustomPacks().map(pack => pack.id));
  for (const pack of map.packs) {
    const allowedTiles = new Set(policyTiles(pack, policy).map(tile => tile.id));
    for (const image of pack.images) images.set(`${pack.id}/${image.id}`, customImages.get(image.data));
    for (const tile of pack.tiles) { const restricted = !pack.hidden && !tile.hidden && (!allowedPacks.has(pack.id) || !allowedTiles.has(tile.id)); tiles.set(tile.id, { ...tile, restricted, hidden: !!(pack.hidden || tile.hidden || restricted), pixelArt: tile.pixelArt ?? true, src: `${pack.id}/${tile.image}`, packId: pack.id, packName: pack.name }); }
  }
  if (!tiles.has(selected) || tiles.get(selected).hidden) { selected = availablePackTiles(packs.find(pack => pack.id === activePack) || { tiles: [] })[0]?.id || defaultBrush(); rotation = 0; flip = false; }
  if (activePack !== 'all' && !packs.some(pack => pack.id === activePack)) activePack = tiles.get(selected).packId;
  if (availableCustomPacks().some(pack => pack.id === activePack && !availablePackTiles(pack).length)) selected = undefined;
  activeCategory = 'All'; renderPacks(); renderCategories(); renderPalette();
}
function choosePack(id, equip = false) {
  if (id !== 'all' && !packs.some(pack => pack.id === id)) id = 'all';
  finishStroke(); paletteSelection.clear(); activePack = id; activeCategory = 'All';
  if (equip && tiles.get(selected)?.packId !== id) {
    selected = id === 'kenney-tiny' ? 'tiny:48' : id === 'kenney-scribble' ? 'kenney:tiles.png' : availablePackTiles(packs.find(pack => pack.id === id) || { tiles: [] })[0]?.id;
    rotation = 0; flip = false;
    updateBrush();
  }
  renderPacks(); renderCategories(); renderPalette();
}
function renderCategories() {
  $('categories').replaceChildren();
  const builtin = builtinPacks.some(pack => pack.id === activePack);
  $('categories').hidden = !builtin;
  const categories = [...new Set((packs.find(pack => pack.id === activePack)?.tiles || []).map(tile => tile.category))];
  if (!builtin || categories.length <= 1) { activeCategory = 'All'; $('categories').hidden = true; return; }
  for (const category of ['All', ...['Floors', 'Walls', 'Props', 'Characters', 'Items', 'Tiles'].filter(category => categories.includes(category))]) {
    const button = document.createElement('button'); button.textContent = category; button.classList.toggle('active', category === activeCategory); button.setAttribute('aria-pressed', category === activeCategory);
    button.onclick = () => { activeCategory = category; paletteSelection.clear(); renderCategories(); renderPalette(); }; $('categories').append(button);
  }
}
function drawTile(context, tileId, x, y, pixels, turns = 0, mirrored = false, opacity = 1, part = null) {
  const tile = tiles.get(tileId), image = tile && images.get(tile.src);
  if (!image) return;
  const [sx, sy, sw, sh] = partRect(tile, part);
  context.save(); context.globalAlpha *= opacity; context.translate(x + pixels / 2, y + pixels / 2); context.rotate(turns * Math.PI / 2); context.scale(mirrored ? -1 : 1, 1);
  context.imageSmoothingEnabled = !tile.pixelArt;
  context.drawImage(image, sx, sy, sw, sh, -pixels / 2, -pixels / 2, pixels, pixels); context.restore();
}
function drawStamp(context, tileId, x, y, pixels, turns = 0, mirrored = false, opacity = 1) {
  for (const part of stampParts(placement(tileId, turns, mirrored), footprint(tiles.get(tileId)), 'preview')) drawTile(context, tileId, x + part.x * pixels, y + part.y * pixels, pixels, turns, mirrored, opacity, part.cell.part);
}
function renderPalette() {
  const categoryOrder = ['Floors', 'Walls', 'Props', 'Characters', 'Items', 'Custom'];
  const staples = ['kenney:tile.png', 'kenney:tiles.png', 'kenney:tiles_center.png', 'kenney:tiles_cracked.png', 'kenney:wood.png', 'kenney:grass.png', 'kenney:water.png', 'kenney:floor_planks.png'];
  const rank = tile => staples.includes(tile.id) ? staples.indexOf(tile.id) : 100 + categoryOrder.indexOf(tile.category);
  const visible = packs.filter(pack => activePack === 'all' || pack.id === activePack).flatMap(pack => {
    let entries = pack.tiles.map(tile => tiles.get(tile.id)).filter(tile => tile && !tile.hidden);
    if (pack.collection === 'kenney') entries.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return orderedTiles(entries, sharedLibrary.tileOrders[pack.id]).filter(tile => activeCategory === 'All' || tile.category === activeCategory);
  });
  paletteSelection = new Set([...paletteSelection].filter(id => visible.some(tile => tile.id === id)));
  $('no-tiles').hidden = !!visible.length; $('tile-grid').replaceChildren();
  const activeCustom = availableCustomPacks().find(pack => pack.id === activePack);
  $('no-tiles').textContent = activeCustom && !availablePackTiles(activeCustom).length ? libraryTiles(activeCustom).length ? `These imports need the desktop app. ${FREE_UPGRADE}` : 'This tileset is empty. Import tiles to add brushes.' : 'No tiles in this category.';
  const fragment = document.createDocumentFragment();
  for (const tile of visible) {
    const button = document.createElement('button'); button.className = 'tile-button'; button.classList.toggle('selected', selected === tile.id); button.classList.toggle('organizing', paletteSelection.has(tile.id)); button.dataset.tile = tile.id;
    button.title = `${tile.name}${tile.footprint ? ` · ${tile.footprint.join('×')} cells` : ''} · Ctrl/Shift select; drag to arrange`; button.setAttribute('aria-label', tile.name); button.setAttribute('aria-pressed', selected === tile.id); button.draggable = true;
    const thumb = document.createElement('canvas'); thumb.width = 64; thumb.height = 64; thumb.classList.toggle('pixel-art', !!tile.pixelArt); const [tw, th] = footprint(tile), scale = 64 / Math.max(tw, th); drawStamp(thumb.getContext('2d'), tile.id, (64 - tw * scale) / 2, (64 - th * scale) / 2, scale); button.append(thumb);
    button.onclick = event => { if (suppressTileClick) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        const siblings = visible.filter(item => item.packId === tile.packId);
        paletteSelection = new Set([...paletteSelection].filter(id => tiles.get(id)?.packId === tile.packId));
        if (event.shiftKey && siblings.some(item => item.id === paletteAnchor)) { const a = siblings.findIndex(item => item.id === paletteAnchor), b = siblings.indexOf(tile); for (const item of siblings.slice(Math.min(a,b), Math.max(a,b)+1)) paletteSelection.add(item.id); }
        else { if (paletteSelection.has(tile.id)) paletteSelection.delete(tile.id); else paletteSelection.add(tile.id); paletteAnchor = tile.id; }
        for (const item of $('tile-grid').children) item.classList.toggle('organizing', paletteSelection.has(item.dataset.tile));
        return;
      }
      paletteSelection.clear(); paletteAnchor = tile.id; for (const item of $('tile-grid').children) item.classList.remove('organizing'); selected = tile.id; rotation = 0; flip = false; if (!['brush', 'fill', 'shape'].includes(tool)) setTool('brush'); updateBrush(); for (const item of $('tile-grid').children) { item.classList.toggle('selected', item.dataset.tile === selected); item.setAttribute('aria-pressed', item.dataset.tile === selected); } };
    button.ondragstart = event => { finishStroke(); draggedTileId = tile.id; if (!paletteSelection.has(tile.id)) paletteSelection = new Set([tile.id]); for (const item of $('tile-grid').children) item.classList.toggle('organizing', paletteSelection.has(item.dataset.tile)); suppressTileClick = true; event.dataTransfer.setData('application/x-trials-tile', tile.id); event.dataTransfer.effectAllowed = 'move'; button.classList.add('dragging-tile'); };
    button.ondragover = event => {
      if (!draggedTileId || paletteSelection.has(tile.id) || tiles.get(draggedTileId)?.packId !== tile.packId) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move'; clearTileDropMarks();
      button.classList.add(event.clientX < button.getBoundingClientRect().left + button.offsetWidth / 2 ? 'drop-before' : 'drop-after');
    };
    button.ondragleave = () => button.classList.remove('drop-before', 'drop-after');
    button.ondrop = event => {
      event.preventDefault(); event.stopPropagation();
      if (draggedTileId && tiles.get(draggedTileId)?.packId === tile.packId) reorderPaletteTile(tile.packId, [...paletteSelection], tile.id, event.clientX >= button.getBoundingClientRect().left + button.offsetWidth / 2);
      draggedTileId = null; clearTileDropMarks(); setTimeout(() => suppressTileClick = false, 0);
    };
    button.ondragend = () => { draggedTileId = null; button.classList.remove('dragging-tile'); clearTileDropMarks(); setTimeout(() => suppressTileClick = false, 0); };
    button.onkeydown = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); event.stopPropagation(); paletteSelection = new Set(visible.filter(item => item.packId === tile.packId).map(item => item.id)); renderPalette(); [...$('tile-grid').children].find(item => item.dataset.tile === tile.id)?.focus(); return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); paletteSelection.clear(); for (const item of $('tile-grid').children) item.classList.remove('organizing'); return; }
      if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const siblings = visible.filter(item => item.packId === tile.packId), index = siblings.findIndex(item => item.id === tile.id), direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
      const target = siblings[index + direction * (['ArrowUp', 'ArrowDown'].includes(event.key) ? 3 : 1)];
      if (target) reorderPaletteTile(tile.packId, paletteSelection.has(tile.id) ? [...paletteSelection] : tile.id, target.id, direction > 0, tile.id);
    };
    fragment.append(button);
  }
  $('tile-grid').append(fragment);
}
function clearTileDropMarks() { for (const button of $('tile-grid').children) button.classList.remove('drop-before', 'drop-after'); }
function reorderPaletteTile(packId, sourceId, targetId, after, focusId = null) {
  const pack = packs.find(pack => pack.id === packId); if (!pack) return;
  let base = pack.tiles.map(tile => tiles.get(tile.id)).filter(tile => tile && !tile.hidden);
  if (pack.collection === 'kenney') { const current = [...$('tile-grid').children].map(button => tiles.get(button.dataset.tile)).filter(tile => tile?.packId === packId); if (activeCategory === 'All') base = current; }
  const order = moveTileOrder(base, sharedLibrary.tileOrders[packId], sourceId, targetId, after);
  publishLibrary({ ...sharedLibrary, tileOrders: { ...sharedLibrary.tileOrders, [packId]: order } }); renderPalette();
  if (focusId) [...$('tile-grid').children].find(button => button.dataset.tile === focusId)?.focus({ preventScroll: true });
}
function updateBrush() {
  const editingSelection = tool === 'select' && selection.size > 0;
  const tile = tiles.get(selected);
  if (!tile && !editingSelection) { document.querySelector('.brush-section').hidden = true; requestRender(); return; }
  document.querySelector('.brush-section').hidden = tool === 'move-map' || (tool === 'select' && !editingSelection);
  document.querySelector('.selected-preview').hidden = editingSelection;
  $('selection-actions').hidden = !editingSelection;
  $('rotation-label').hidden = editingSelection;
  $('selected-name').textContent = editingSelection ? 'Selection' : tile.name;
  $('brush-preview').classList.toggle('pixel-art', !!tile?.pixelArt);
  const preview = $('brush-preview'), brushCtx = preview.getContext('2d'); brushCtx.clearRect(0, 0, preview.width, preview.height); const size = rotatedFootprint(footprint(tile), rotation), scale = 120 / Math.max(...size); drawStamp(brushCtx, selected, (144-size[0]*scale)/2, (144-size[1]*scale)/2, scale, rotation, flip);
  $('rotation-label').textContent = `${rotation * 90}°`; $('flip-brush').classList.toggle('active', !editingSelection && flip); $('flip-brush').setAttribute('aria-pressed', !editingSelection && flip);
  requestRender();
}
function renderLayers() {
  layerMenu.close(); $('layers').replaceChildren(); $('add-layer').disabled = map.layers.length >= policy.maxLayers; $('add-layer').title = map.layers.length >= policy.maxLayers ? policy.edition === 'web' ? `Free: 6 layers. ${FREE_UPGRADE}` : 'Maximum of 12 layers' : 'Add layer';
  $('project-edition-notice').hidden = !projectOverLimit(); $('project-edition-notice').textContent = projectOverLimit() ? `This project uses ${map.layers.length} layers. Free supports 6; it remains available for viewing, saving and export. ${FREE_UPGRADE}` : '';
  $('layer-limit-info').hidden = policy.edition !== 'web' || map.layers.length < policy.maxLayers;
  for (let i = map.layers.length - 1; i >= 0; i--) {
    const layer = map.layers[i], row = document.createElement('div'); row.className = 'layer-row'; row.classList.toggle('active', selectedLayerIds.has(layer.id)); row.classList.toggle('hidden-layer', !layer.visible || layer.opacity === 0); row.dataset.layerId = layer.id; row.draggable = true;
    row.title = `${layer.name} · ${Math.round((layer.opacity ?? 1) * 100)}% opacity. Drag to reorder; right-click for options.`;
    const select = document.createElement('button'); select.className = 'layer-select'; select.setAttribute('aria-pressed', selectedLayerIds.has(layer.id)); select.setAttribute('aria-label', `Select ${layer.name} layer`);
    select.textContent = layer.name;
    select.onclick = event => selectLayer(layer.id, event);
    const visibility = document.createElement('button'); visibility.className = 'layer-toggle'; visibility.append(layerSymbol('eye', layer.visible)); visibility.setAttribute('aria-label', `Toggle ${layer.name} visibility`); visibility.setAttribute('aria-pressed', layer.visible); visibility.title = layer.visible ? 'Hide layer' : 'Show layer'; visibility.onclick = () => changeLayer(() => setLayerState(history, layer.id, { visible: !layer.visible }));
    const lock = document.createElement('button'); lock.className = 'layer-toggle'; lock.append(layerSymbol('lock', layer.locked)); lock.setAttribute('aria-label', `Toggle ${layer.name} lock`); lock.setAttribute('aria-pressed', layer.locked); lock.title = layer.locked ? 'Unlock layer' : 'Lock layer'; lock.onclick = () => changeLayer(() => setLayerState(history, layer.id, { locked: !layer.locked }));
    row.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); selectLayer(layer.id, { preserve: selectedLayerIds.has(layer.id) }); layerMenu.open(map.layers.find(item => item.id === layer.id), map.layers.length, event.clientX, event.clientY, policy.maxLayers); });
    row.addEventListener('dragstart', event => { finishStroke(); layerMenu.close(); draggedLayerId = layer.id; event.dataTransfer.setData('text/plain', layer.id); event.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging-layer'); });
    row.addEventListener('dragover', event => { if (!draggedLayerId || draggedLayerId === layer.id) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; clearLayerDropMarks(); row.classList.add(event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2 ? 'drop-above' : 'drop-below'); });
    row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
    row.addEventListener('drop', event => {
      if (!draggedLayerId) return; event.preventDefault();
      const id = draggedLayerId; draggedLayerId = null; clearLayerDropMarks();
      if (id === layer.id) return;
      const order = map.layers.map(layer => layer.id).reverse().filter(item => item !== id), at = order.indexOf(layer.id) + (event.clientY >= row.getBoundingClientRect().top + row.offsetHeight / 2 ? 1 : 0);
      order.splice(at, 0, id); changeLayer(() => reorderLayer(history, id, map.layers.length - 1 - at));
    });
    row.addEventListener('dragend', () => { draggedLayerId = null; clearLayerDropMarks(); });
    row.addEventListener('keydown', event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); const to = i + (event.key === 'ArrowUp' ? 1 : -1); if (to >= 0 && to < map.layers.length) { changeLayer(() => reorderLayer(history, layer.id, to)); $('layers').querySelector(`[data-layer-id="${CSS.escape(layer.id)}"] .layer-select`)?.focus(); } } });
    row.append(select, visibility, lock); $('layers').append(row);
  }
}
function clearLayerDropMarks() { for (const row of $('layers').children) row.classList.remove('drop-above', 'drop-below', 'dragging-layer'); }
function selectLayer(id, event = {}) {
  finishStroke(); const previous = [...selectedLayerIds].join('|'), additive = event.ctrlKey || event.metaKey;
  if (event.shiftKey && layerAnchorId) {
    const anchor = map.layers.findIndex(layer => layer.id === layerAnchorId), end = map.layers.findIndex(layer => layer.id === id), range = map.layers.slice(Math.min(anchor, end), Math.max(anchor, end) + 1).map(layer => layer.id);
    selectedLayerIds = new Set([...(additive ? selectedLayerIds : []), ...range]);
  } else if (additive) { if (selectedLayerIds.has(id) && selectedLayerIds.size > 1) selectedLayerIds.delete(id); else selectedLayerIds.add(id); layerAnchorId = id; }
  else if (!event.preserve) { selectedLayerIds = new Set([id]); layerAnchorId = id; }
  activeLayerId = selectedLayerIds.has(id) ? id : [...selectedLayerIds].at(-1); layerIndex = map.layers.findIndex(layer => layer.id === activeLayerId);
  if (previous !== [...selectedLayerIds].join('|')) selection.clear(); renderLayers(); updateBrush(); updateStats(); requestRender();
}
function selectionLayer(layer) { return selectedLayerIds.has(layer.id) && layer.visible && layer.opacity !== 0 && !layer.locked; }
function updateCursorStatus() {
  let text = '';
  if (hover && inBounds(map, hover.x, hover.y)) { const names = [...map.layers].reverse().filter(layer => layer.visible && layer.opacity !== 0 && layer.cells[hover.y * map.width + hover.x]).map(layer => layer.name); text = `${hover.x + 1}, ${hover.y + 1}${names.length ? ` · ${names.join(', ')}` : ''}`; }
  $('cursor-status').textContent = text; $('cursor-status').title = text;
}
function updateCursor() {
  let cursor = 'crosshair'; const inside = hover && inBounds(map, hover.x, hover.y), layer = map.layers[layerIndex];
  if (pointer?.mode === 'pan' || pointer?.mode === 'move-map' || pointer?.mode === 'move-selection') cursor = 'grabbing';
  else if (spaceHeld || (hover && !inside)) cursor = 'grab';
  else if (projectOverLimit() && tool !== 'picker') cursor = 'not-allowed';
  else if (tool === 'move-map') cursor = 'grab';
  else if (tool === 'select') { if (!map.layers.some(selectionLayer)) cursor = 'not-allowed'; else if (inside && selection.has(hover.y * map.width + hover.x) && map.layers.some(item => selectionLayer(item) && item.cells[hover.y * map.width + hover.x])) cursor = 'grab'; }
  else if (tool === 'picker') { const top = inside ? [...map.layers].reverse().find(item => item.visible && item.opacity !== 0 && item.cells[hover.y * map.width + hover.x])?.cells[hover.y * map.width + hover.x] : null; cursor = top && !tiles.get(top.tile)?.restricted ? 'copy' : 'not-allowed'; }
  else if (!layer.visible || layer.opacity === 0 || layer.locked || (tool !== 'eraser' && !tiles.has(selected))) cursor = 'not-allowed';
  else if (inside && ['brush','fill'].includes(tool) && rotatedFootprint(footprint(tiles.get(selected)),rotation).some((n,i) => (i ? hover.y : hover.x) + n > (i ? map.height : map.width))) cursor = 'not-allowed';
  else if (tool === 'eraser' || tool === 'fill') cursor = 'cell';
  viewport.style.cursor = cursor;
}
function changeLayer(action, allowRemoval = false) { finishStroke(); if (!allowRemoval && !canEditProject()) return; try { if (action()) gridChanged(); } catch (error) { notify(error.message, true); } }
function updateStats() {
  $('undo').disabled = !history.undoStack.length; $('redo').disabled = !history.redoStack.length;
}
function setTool(value) {
  finishStroke(); tool = value; if (tool !== 'select') selection.clear();
  shapeMenu.close();
  for (const button of $('tools').children) { button.classList.toggle('active', button.dataset.tool === tool); button.setAttribute('aria-pressed', button.dataset.tool === tool); }
  $('move-map').classList.toggle('active', tool === 'move-map'); $('move-map').setAttribute('aria-pressed', tool === 'move-map');
  viewport.style.cursor = tool === 'move-map' ? 'move' : 'crosshair'; updateBrush(); requestRender();
}
function resizeCanvas() {
  const { width, height } = viewport.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); requestRender();
}
function fitMap() {
  if (!map) return;
  const { width, height } = viewport.getBoundingClientRect();
  zoom = Math.max(.05, Math.min(2, Math.min((width - 96) / (map.width * TILE), (height - 170) / (map.height * TILE))));
  pan = { x: (width - map.width * TILE * zoom) / 2, y: 40 + (height - 170 - map.height * TILE * zoom) / 2 }; requestRender();
}
function zoomAt(factor, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
  const next = Math.max(.05, Math.min(4, zoom * factor)), ratio = next / zoom;
  pan.x = x - (x - pan.x) * ratio; pan.y = y - (y - pan.y) * ratio; zoom = next; requestRender();
}
function eventPoint(event) {
  const rect = canvas.getBoundingClientRect(), px = event.clientX - rect.left, py = event.clientY - rect.top;
  return { px, py, x: Math.floor((px - pan.x) / (TILE * zoom)), y: Math.floor((py - pan.y) / (TILE * zoom)) };
}
function requestRender() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); }
function drawGrid(context, width, height, pixels, stroke) {
  context.save(); context.strokeStyle = stroke; context.lineWidth = 1; context.beginPath();
  for (let x = 0; x <= width; x++) { context.moveTo(x * pixels, 0); context.lineTo(x * pixels, height * pixels); }
  for (let y = 0; y <= height; y++) { context.moveTo(0, y * pixels); context.lineTo(width * pixels, y * pixels); }
  context.stroke(); context.restore();
}
function render() {
  if (!map) return;
  const dpr = window.devicePixelRatio || 1, w = canvas.width / dpr, h = canvas.height / dpr, px = TILE * zoom;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#171722'; ctx.fillRect(0, 0, w, h);
  // Worktable dot pattern, drawn with canvas primitives rather than image assets.
  ctx.fillStyle = '#353344';
  for (let x = ((pan.x % 24) + 24) % 24; x < w; x += 24) for (let y = ((pan.y % 24) + 24) % 24; y < h; y += 24) ctx.fillRect(x, y, 1, 1);
  ctx.save(); ctx.translate(pan.x, pan.y); ctx.shadowColor = '#0c0d16'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 6; ctx.shadowOffsetY = 6;
  ctx.fillStyle = map.background; ctx.fillRect(0, 0, map.width * px, map.height * px); ctx.shadowColor = 'transparent';
  const minX = Math.max(0, Math.floor(-pan.x / px)), minY = Math.max(0, Math.floor(-pan.y / px));
  const maxX = Math.min(map.width, Math.ceil((w - pan.x) / px)), maxY = Math.min(map.height, Math.ceil((h - pan.y) / px));
  ctx.imageSmoothingEnabled = true;
  const dragging = pointer?.mode === 'move-selection', movingMap = pointer?.mode === 'move-map' || !!pendingMapMove;
  const dx = dragging || pointer?.mode === 'move-map' ? pointer.last.x - pointer.start.x : pendingMapMove?.dx || 0;
  const dy = dragging || pointer?.mode === 'move-map' ? pointer.last.y - pointer.start.y : pendingMapMove?.dy || 0;
  const sourceMinX = movingMap ? Math.max(0, minX - dx) : minX, sourceMinY = movingMap ? Math.max(0, minY - dy) : minY;
  const sourceMaxX = movingMap ? Math.min(map.width, maxX - dx) : maxX, sourceMaxY = movingMap ? Math.min(map.height, maxY - dy) : maxY;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, map.width * px, map.height * px); ctx.clip();
  for (const [li, layer] of map.layers.entries()) if (layer.visible) {
    ctx.save(); ctx.globalAlpha *= layer.opacity ?? 1;
    for (let y = sourceMinY; y < sourceMaxY; y++) for (let x = sourceMinX; x < sourceMaxX; x++) {
      const index = y * map.width + x, cell = layer.cells[index];
      if (cell && !(dragging && selectionLayer(layer) && selection.has(index))) drawTile(ctx, cell.tile, (x + (movingMap ? dx : 0)) * px, (y + (movingMap ? dy : 0)) * px, px, cell.rotation, cell.flip, 1, cell.part);
    }
    if (dragging && selectionLayer(layer)) for (const index of selection) { const cell = layer.cells[index]; if (cell) drawTile(ctx, cell.tile, (index % map.width + dx) * px, (Math.floor(index / map.width) + dy) * px, px, cell.rotation, cell.flip, .8, cell.part); }
    ctx.restore();
  }
  ctx.restore();
  if (grid && px >= 8) drawGrid(ctx, map.width, map.height, px, '#b5bfa01c');
  ctx.strokeStyle = '#aebf864f'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, map.width * px, map.height * px);
  ctx.beginPath(); ctx.rect(0, 0, map.width * px, map.height * px); ctx.clip();
  if (selection.size && tool === 'select') {
    ctx.save(); ctx.fillStyle = '#8bc3d430'; ctx.strokeStyle = '#a8e3ef'; ctx.lineWidth = 1.5;
    for (const index of selection) ctx.fillRect((index % map.width + dx) * px, (Math.floor(index / map.width) + dy) * px, px, px);
    const bounds = selectionBounds(map, selection);
    if (bounds) { ctx.setLineDash([5, 4]); ctx.strokeRect((bounds.x + dx) * px, (bounds.y + dy) * px, bounds.width * px, bounds.height * px); } ctx.restore();
  }
  if (pointer?.mode === 'shape' || shapePlacement) {
    const geometry = shapePlacement ? sizedShapeGeometry() : { start: pointer.start, end: pointer.last }, start = geometry.start, end = geometry.end;
    ctx.fillStyle = '#d6b77822'; ctx.strokeStyle = '#e2c78f';
    for (const [x, y] of patternAnchors(shapeCells(start.x, start.y, end.x, end.y, pointer?.shapeType || shapeType, pointer?.outline ?? shapeOutline), rotatedFootprint(footprint(tiles.get(selected)), rotation))) {
      if (x < minX || x >= maxX || y < minY || y >= maxY) continue;
      if (px >= 8) drawStamp(ctx, selected, x * px, y * px, px, rotation, flip, .5); ctx.fillRect(x * px, y * px, px, px);
    }
  } else if (pointer?.mode === 'selection-rect' && hover) {
    const x = Math.min(pointer.start.x, hover.x), y = Math.min(pointer.start.y, hover.y), rw = Math.abs(pointer.start.x - hover.x) + 1, rh = Math.abs(pointer.start.y - hover.y) + 1;
    ctx.fillStyle = '#d6b77840'; ctx.fillRect(x * px, y * px, rw * px, rh * px); ctx.strokeStyle = '#e2c78f'; ctx.strokeRect(x * px, y * px, rw * px, rh * px);
  } else if (hover && inBounds(map, hover.x, hover.y) && !spaceHeld && tool !== 'select' && tool !== 'move-map') {
    const size = tool === 'eraser' ? [1,1] : rotatedFootprint(footprint(tiles.get(selected)), rotation), start = 0;
    if (['brush', 'fill'].includes(tool) && !pointer && !map.layers[layerIndex].locked && map.layers[layerIndex].visible) drawStamp(ctx, selected, hover.x * px, hover.y * px, px, rotation, flip, .48 * (map.layers[layerIndex].opacity ?? 1));
    ctx.fillStyle = tool === 'eraser' ? '#e7a49a25' : '#d6b77812'; ctx.strokeStyle = tool === 'eraser' ? '#e7a49a' : '#e5c991';
    ctx.fillRect((hover.x + start) * px, (hover.y + start) * px, size[0] * px, size[1] * px); ctx.strokeRect((hover.x + start) * px, (hover.y + start) * px, size[0] * px, size[1] * px);
  }
  ctx.restore(); $('zoom-reset').textContent = `${Math.round(zoom * 100)}%`;
  updateCursorStatus(); updateCursor();
}

function paint(point, erase = false) {
  const value = erase ? null : placement(selected, rotation, flip);
  if (tool === 'fill' && !erase) history.fill(point.x, point.y, value, footprint(tiles.get(selected)));
  else history.stamp(point.x, point.y, value, footprint(tiles.get(selected)));
}
function finishStroke(cancel = false) {
  if (!pointer) return;
  const active = pointer; pointer = null;
  if (active.mode === 'pan') { viewport.style.cursor = tool === 'move-map' ? 'move' : 'crosshair'; requestRender(); return; }
  if (active.mode === 'move-map') {
    if (!cancel) {
      const dx = active.last.x - active.start.x, dy = active.last.y - active.start.y;
      if (dx || dy) {
        const cropped = countCropped(map, map.width, map.height, dx, dy);
        if (cropped) {
          pendingMapMove = { dx, dy };
          $('move-crop-warning').textContent = `This move will remove ${cropped} ${cropped === 1 ? 'tile' : 'tiles'} outside the canvas, across all layers. You can restore them with Undo.`;
          $('move-confirm-dialog').showModal();
        } else if (shiftMap(history, dx, dy)) gridChanged();
      }
    }
    viewport.style.cursor = 'move'; requestRender(); return;
  }
  if (active.mode === 'selection-rect') {
    if (!cancel) { const indices = selectionInLayers(map, selectedLayerIds, active.start.x, active.start.y, active.last.x, active.last.y); selection = new Set([...(active.additive ? active.original : []), ...indices]); }
    else selection = active.original;
    updateBrush(); requestRender(); return;
  }
  if (active.mode === 'move-selection') {
    if (!cancel && (active.last.x !== active.start.x || active.last.y !== active.start.y)) applySelection('move', active.last.x - active.start.x, active.last.y - active.start.y);
    viewport.style.cursor = 'crosshair'; requestRender(); return;
  }
  if (cancel) history.cancel();
  else {
    if (active.mode === 'shape') { const end = active.last; history.shape(active.start.x, active.start.y, end.x, end.y, placement(selected, rotation, flip), active.shapeType, active.outline, footprint(tiles.get(selected))); }
    if (history.commit()) changed();
  }
  updateStats(); requestRender();
}
function applySelection(operation, dx = 0, dy = 0) {
  if (!canEditProject()) return;
  try {
    const undoCount = history.undoStack.length;
    selection = new Set(transformLayersSelection(history, selectedLayerIds, selection, operation, dx, dy));
    if (history.undoStack.length !== undoCount || history.undoStack.length === 100) changed();
    updateBrush(); requestRender();
  } catch (error) { notify(error.message, true); }
}
function gridChanged(fit = false) {
  selectedLayerIds = new Set([...selectedLayerIds].filter(id => map.layers.some(layer => layer.id === id)));
  const foundLayer = map.layers.findIndex(layer => layer.id === activeLayerId && selectedLayerIds.has(layer.id)), groupedLayer = map.layers.findIndex(layer => selectedLayerIds.has(layer.id));
  layerIndex = foundLayer >= 0 ? foundLayer : groupedLayer >= 0 ? groupedLayer : Math.min(layerIndex, map.layers.length - 1); activeLayerId = map.layers[layerIndex].id; selectedLayerIds.add(activeLayerId); renderLayers();
  if (!map.layers.some(layer => layer.id === layerAnchorId)) layerAnchorId = activeLayerId;
  if (packs.length !== enabledBuiltins().length + availableCustomPacks().length || availableCustomPacks().some(pack => !packs.includes(pack))) { publishLibrary(libraryFromProject(sharedLibrary, map)); rebuildLibrary(); }
  selection.clear(); $('dimensions').textContent = `${map.width} × ${map.height}`;
  if ($('map-settings-dialog').open) syncCanvasSettings();
  updateBrush(); changed(); if (fit) fitMap();
}
canvas.addEventListener('pointerdown', event => {
  if (!map || pointer || ![0, 1].includes(event.button)) return;
  event.preventDefault(); viewport.focus(); const point = eventPoint(event); hover = point;
  canvas.setPointerCapture(event.pointerId);
  if (event.button === 1 || spaceHeld || (!inBounds(map, point.x, point.y) && event.button === 0)) { pointer = { mode: 'pan', start: point, origin: { ...pan } }; viewport.style.cursor = 'grabbing'; return; }
  if (!inBounds(map, point.x, point.y)) return;
  if (tool !== 'picker' && !canEditProject()) return;
  if (tool === 'move-map') { if (event.button === 0) { pointer = { mode: 'move-map', start: point, last: point }; viewport.style.cursor = 'move'; requestRender(); } return; }
  if (tool === 'select' && event.button === 0) {
    const index = point.y * map.width + point.x;
    if (!map.layers.some(selectionLayer)) return;
    if (map.layers.some(layer => selectionLayer(layer) && layer.cells[index]) && selection.has(index) && !event.shiftKey) {
      pointer = { mode: 'move-selection', start: point, last: point }; viewport.style.cursor = 'move';
    } else { pointer = { mode: 'selection-rect', start: point, last: point, additive: event.shiftKey, original: new Set(selection) }; if (!event.shiftKey) selection.clear(); }
    updateBrush(); requestRender(); return;
  }
  if (tool === 'picker') {
    for (let i = map.layers.length - 1; i >= 0; i--) {
      const cell = map.layers[i].visible && map.layers[i].opacity !== 0 && map.layers[i].cells[point.y * map.width + point.x];
      if (cell) { if (tiles.get(cell.tile)?.restricted) { notify(FREE_UPGRADE, true); break; } selected = cell.tile; rotation = 0; flip = false; layerIndex = i; activeLayerId = map.layers[i].id; selectedLayerIds = new Set([activeLayerId]); layerAnchorId = activeLayerId; choosePack(tiles.get(selected).packId); setTool('brush'); renderLayers(); updateStats(); updateBrush(); break; }
    } return;
  }
  if (map.layers[layerIndex].locked || !map.layers[layerIndex].visible || map.layers[layerIndex].opacity === 0) { notify('Select an unlocked, visible layer to draw.'); return; }
  if (tool !== 'eraser' && !tiles.has(selected)) { notify('Import tiles into this tileset before drawing.'); return; }
  history.begin(layerIndex);
  const erase = tool === 'eraser';
  pointer = { mode: tool === 'shape' ? 'shape' : 'paint', erase, start: point, last: point, single: tool === 'fill' && !erase, shapeType, outline: shapeOutline };
  if (pointer.mode === 'paint') paint(point, erase); requestRender();
});
canvas.addEventListener('pointermove', event => {
  if (!map) return;
  const point = eventPoint(event); hover = point;
  if (pointer?.mode === 'pan') { pan.x = pointer.origin.x + point.px - pointer.start.px; pan.y = pointer.origin.y + point.py - pointer.start.py; }
  else if (pointer) {
    // Clamp captured input to the map to avoid unbounded line walks outside the viewport.
    const bounded = { ...point, x: Math.max(-1, Math.min(map.width + 1, point.x)), y: Math.max(-1, Math.min(map.height + 1, point.y)) };
    if (pointer.mode === 'paint' && !pointer.single) for (const [x, y] of line(pointer.last.x, pointer.last.y, bounded.x, bounded.y)) paint({ x, y }, pointer.erase);
    pointer.last = bounded;
  }
  requestRender();
});
canvas.addEventListener('pointerup', event => { if (event.button === 0 || event.button === 1) finishStroke(); });
canvas.addEventListener('pointercancel', () => finishStroke(true));
canvas.addEventListener('lostpointercapture', () => finishStroke(true));
canvas.addEventListener('pointerleave', () => { if (!pointer) { hover = null; $('cursor-status').textContent = ''; } requestRender(); });
function sizedShapeGeometry() {
  const width = Math.max(1, Math.min(200, Number($('shape-width').value) || 1)), height = shapeType === 'circle' ? width : Math.max(1, Math.min(200, Number($('shape-height').value) || 1));
  const start = { x: shapePlacement.x - Math.floor(width/2), y: shapePlacement.y - Math.floor(height/2) };
  return { start, end: { x: start.x+width-1, y: start.y+height-1 } };
}
canvas.addEventListener('contextmenu', event => {
  if (tool !== 'shape' || !map || !tiles.has(selected)) return;
  event.preventDefault(); event.stopPropagation(); finishStroke(true);
  const point = eventPoint(event), layer = map.layers[layerIndex];
  if (!inBounds(map, point.x, point.y) || layer.locked || !layer.visible || layer.opacity === 0 || !canEditProject()) return;
  shapePlacement = point; shapeMenu.close();
  $('shape-size-title').textContent = `${shapeType[0].toUpperCase()+shapeType.slice(1)} size`;
  $('shape-height').disabled = shapeType === 'circle'; if (shapeType === 'circle') $('shape-height').value = $('shape-width').value;
  const dialog = $('shape-size-dialog'); dialog.showModal();
  dialog.style.left = `${Math.max(8,Math.min(innerWidth-dialog.offsetWidth-8,event.clientX+12))}px`;
  dialog.style.top = `${Math.max(8,Math.min(innerHeight-dialog.offsetHeight-8,event.clientY+12))}px`;
  $('shape-width').focus(); $('shape-width').select(); requestRender();
});
for (const input of [$('shape-width'),$('shape-height')]) input.addEventListener('input', () => { if (shapeType === 'circle') $('shape-height').value = $('shape-width').value; requestRender(); });
$('shape-size-dialog').addEventListener('close', () => { shapePlacement = null; requestRender(); });
$('shape-size-form').onsubmit = event => {
  event.preventDefault(); if (!shapePlacement) return;
  const {start,end} = sizedShapeGeometry();
  if (!inBounds(map,start.x,start.y) || !inBounds(map,end.x,end.y)) { notify('This shape would leave the map. Reduce its size or choose a point farther inside.',true); return; }
  history.begin(layerIndex); history.shape(start.x,start.y,end.x,end.y,placement(selected,rotation,flip),shapeType,shapeOutline,footprint(tiles.get(selected)));
  if (history.commit()) changed(); $('shape-size-dialog').close();
};
viewport.addEventListener('wheel', event => { event.preventDefault(); if (!map) return; const point = eventPoint(event); zoomAt(Math.exp(-event.deltaY * .0015), point.px, point.py); }, { passive: false });
window.addEventListener('blur', () => { spaceHeld = false; finishStroke(); });

function saveMap() { finishStroke(); map.name = $('map-name').value.trim() || 'Untitled dungeon'; jsonDownload(map, `${safeName(map.name)}.vttmap.json`); dirty = false; updateName(); }
async function openMapFile(file) {
  if (!file) return;
  if (file.size > 64 * 1024 * 1024) throw new Error('Map files must be smaller than 64 MB.');
  const candidate = validateMap(JSON.parse(await file.text()), builtinTiles.map(tile => tile.id));
  await installMap(candidate); notify('Map opened.');
}
function managedOrActivePackId() { return $('tileset-manager-dialog').open ? managingPackId : activePack; }
function openImport(keepImages = false) {
  const pack = availableCustomPacks().find(pack => pack.id === managedOrActivePackId());
  if (!pack) { notify('Create or select a custom tileset first.'); return; }
  if (importCount(pack) >= policy.maxImports) { notify(`Free allows 2 image imports per tileset. ${FREE_UPGRADE}`, true); return; }
  finishStroke(); importTargetId = pack.id;
  if (!keepImages) { importGeneration++; importImages = []; $('tile-files').value = ''; $('tile-files').required = true; updateImportPreview(); }
  $('import-target').textContent = `Adding to ${pack.name}`; $('import-dialog').showModal();
}
function applyEditionUI(config) {
  const free = policy.edition === 'web';
  $('free-edition-rules').hidden = !free; $('free-import-rules').hidden = !free; $('free-tile-size-row').hidden = !free;
  $('free-png-watermark-note').hidden = !free;
  document.querySelector('#import-dialog .import-mode').hidden = free; $('tile-files').multiple = !free;
  $('tile-width').closest('label').hidden = free; $('tile-height').closest('label').hidden = free; $('sheet-fields').classList.toggle('free-sheet-fields', free);
  if (free) { document.querySelector('input[name=mode][value=sheet]').checked = true; $('tile-width').value = $('free-tile-size').value; $('tile-height').value = $('free-tile-size').value; }
  if (free && config.gumroadUrl) { try { const url = new URL(config.gumroadUrl); if (url.protocol === 'https:') { $('upgrade-link').href = url.href; $('upgrade-link').hidden = false; } } catch {} }
}
for (const button of document.querySelectorAll('[data-edition-details]')) button.onclick = () => $('edition-dialog').showModal();
function hasVisiblePixels(image, [x, y, width, height]) {
  if (!image.pixels) { const probe = document.createElement('canvas'); probe.width = image.width; probe.height = image.height; const context = probe.getContext('2d', { willReadFrequently: true }); context.drawImage(image.image, 0, 0); image.pixels = context.getImageData(0, 0, image.width, image.height).data; }
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) if (image.pixels[(py * image.width + px) * 4 + 3]) return true;
  return false;
}
function sheetBrushes() {
  const first = importImages[0]; if (!first) return [];
  const width = Number($('tile-width').value), height = Number($('tile-height').value), gap = Number($('tile-spacing').value), margin = Number($('tile-margin').value);
  assertTileSetup(policy, width, height); sliceSheet(first.width, first.height, width, height, gap, margin);
  return sheetEntries(first.width, first.height, width, height, gap, margin, importRegions).filter(entry => hasVisiblePixels(first, entry.rect));
}
function importRegion(a, b) { return [Math.min(a.x,b.x), Math.min(a.y,b.y), Math.abs(a.x-b.x)+1, Math.abs(a.y-b.y)+1]; }
function importCell(event) {
  const first = importImages[0]; if (!first) return null;
  const bounds = $('sheet-preview').getBoundingClientRect(), cw = Number($('tile-width').value), ch = Number($('tile-height').value), gap = Number($('tile-spacing').value), margin = Number($('tile-margin').value);
  const cols = Math.floor((first.width-2*margin+gap)/(cw+gap)), rows = Math.floor((first.height-2*margin+gap)/(ch+gap));
  if (cols < 1 || rows < 1) return null;
  return { x: Math.max(0,Math.min(cols-1,Math.floor(((event.clientX-bounds.left)*first.width/bounds.width-margin)/(cw+gap)))), y: Math.max(0,Math.min(rows-1,Math.floor(((event.clientY-bounds.top)*first.height/bounds.height-margin)/(ch+gap)))) };
}
$('sheet-preview').addEventListener('pointerdown', event => {
  if (event.button !== 0 || document.querySelector('input[name=mode]:checked').value !== 'sheet') return;
  const point = importCell(event); if (!point) return;
  event.preventDefault(); importDrag = { start: point, last: point }; $('sheet-preview').setPointerCapture(event.pointerId); updateImportPreview();
});
$('sheet-preview').addEventListener('pointermove', event => { if (importDrag) { importDrag.last = importCell(event) || importDrag.last; updateImportPreview(); } });
$('sheet-preview').addEventListener('pointerup', event => {
  if (!importDrag) return;
  const [x,y,w,h] = importRegion(importDrag.start, importCell(event) || importDrag.last);
  importRegions = importRegions.filter(([rx,ry,rw,rh]) => !(x < rx+rw && x+w > rx && y < ry+rh && y+h > ry));
  if (w > 1 || h > 1) importRegions.push([x,y,w,h]);
  importDrag = null; updateImportPreview();
});
for (const event of ['pointercancel','lostpointercapture']) $('sheet-preview').addEventListener(event, () => { if (importDrag) { importDrag = null; updateImportPreview(); } });
function updateImportPreview() {
  const key = JSON.stringify([importGeneration, $('tile-width').value, $('tile-height').value, $('tile-spacing').value, $('tile-margin').value, document.querySelector('input[name=mode]:checked').value]);
  if (key !== importLayoutKey) { importRegions = []; importDrag = null; importLayoutKey = key; }
  if (policy.edition === 'web') document.querySelector('input[name=mode][value=sheet]').checked = true;
  const sheetMode = document.querySelector('input[name=mode]:checked').value === 'sheet'; $('sheet-fields').hidden = !sheetMode;
  for (const input of $('sheet-fields').querySelectorAll('input')) input.disabled = !sheetMode;
  $('sheet-preview-wrap').hidden = !importImages.length;
  if (!importImages.length) return;
  const preview = $('sheet-preview'), context = preview.getContext('2d'), first = sheetMode ? importImages[0] : importImages.find(image => hasVisiblePixels(image, [0, 0, image.width, image.height])) || importImages[0], scale = Math.min(560 / first.width, 240 / first.height);
  preview.width = Math.max(1, Math.round(first.width * scale)); preview.height = Math.max(1, Math.round(first.height * scale));
  context.imageSmoothingEnabled = false;
  context.drawImage(first.image, 0, 0, preview.width, preview.height);
  try {
    if (sheetMode && importImages.length !== 1) throw new Error('Choose one image for a sprite sheet, or switch to Individual tiles.');
    const entries = sheetMode ? sheetBrushes() : [], rects = entries.map(entry => entry.rect);
    $('group-tiles-hint').hidden = !sheetMode;
    context.strokeStyle = '#e3ad49'; context.lineWidth = 1;
    for (const [x, y, w, h] of rects) context.strokeRect(x * scale, y * scale, w * scale, h * scale);
    context.fillStyle = '#8bc3d440'; context.strokeStyle = '#a8e3ef'; context.lineWidth = 2;
    for (const entry of entries.filter(entry => entry.footprint)) { const [x,y,w,h]=entry.rect; context.fillRect(x*scale,y*scale,w*scale,h*scale); context.strokeRect(x*scale,y*scale,w*scale,h*scale); }
    if (importDrag) { const [x,y,w,h] = importRegion(importDrag.start,importDrag.last), cw=Number($('tile-width').value), ch=Number($('tile-height').value), gap=Number($('tile-spacing').value), margin=Number($('tile-margin').value); context.strokeRect((margin+x*(cw+gap))*scale,(margin+y*(ch+gap))*scale,(w*cw+(w-1)*gap)*scale,(h*ch+(h-1)*gap)*scale); }
    const count = sheetMode ? rects.length : importImages.filter(image => hasVisiblePixels(image, [0, 0, image.width, image.height])).length;
    const cropped = first.originalWidth > first.width || first.originalHeight > first.height;
    $('import-status').textContent = `${count} tile brushes · ${first.width} × ${first.height} px${cropped ? ` · top-left cropped from ${first.originalWidth} × ${first.originalHeight} px` : !sheetMode && count > 1 ? ' (first image shown)' : ''}`;
  } catch (error) { $('import-status').textContent = error.message; }
}
async function importPack() {
  if (!importImages.length) throw new Error('Choose an image first.');
  const sheetMode = document.querySelector('input[name=mode]:checked').value === 'sheet';
  if (policy.edition === 'web' && !sheetMode) throw new Error(`Free imports use a 16×16 or 32×32 sprite-sheet setup. ${FREE_UPGRADE}`);
  if (sheetMode && importImages.length !== 1) throw new Error('Select just one sprite sheet.');
  const target = availableCustomPacks().find(pack => pack.id === importTargetId); if (!target) throw new Error('Select a custom tileset first.');
  const id = `custom-${crypto.randomUUID()}`, name = target.name;
  const pack = { id, name, images: importImages.map((image, i) => ({ id: `image-${i}`, data: image.data, width: image.width, height: image.height })), tiles: [] };
  if (sheetMode) pack.tiles = sheetBrushes().map((entry, i) => ({ id: `${id}:${i}`, name: `${name} ${String(target.tiles.length + i + 1).padStart(3, '0')}`, category: 'Custom', image: 'image-0', ...entry, pixelArt: true }));
  else pack.tiles = importImages.flatMap((image, i) => hasVisiblePixels(image, [0, 0, image.width, image.height]) ? [{ id: `${id}:${i}`, name: image.name, category: 'Custom', image: `image-${i}`, rect: [0, 0, image.width, image.height], pixelArt: true }] : []);
  if (!pack.tiles.length) throw new Error('No visible tiles found. Fully transparent tiles are skipped.');
  const usedImages = new Set(pack.tiles.map(tile => tile.image)); pack.images = pack.images.filter(image => usedImages.has(image.id));
  await appendPack(pack, importImages.filter((_, i) => usedImages.has(`image-${i}`)).map(image => image.filename).join(', ').slice(0, 100));
  $('import-dialog').close(); notify(`Imported ${pack.tiles.length} tile brushes.`);
}
async function appendPack(pack, importName = pack.name) {
  finishStroke();
  const targetId = importTargetId, target = availableCustomPacks().find(pack => pack.id === targetId);
  if (!target) throw new Error('Select a custom tileset first.');
  const incoming = exportablePack(validateMap({ ...createMap(4, 4), packs: [pack] }).packs[0]);
  if (policy.edition === 'web') {
    for (const tile of incoming.tiles) assertTileSetup(policy, ...baseTileSize(tile));
    const probes = new Map();
    for (const image of incoming.images) {
      let loaded = await loadImage(image.data); if (loaded.width !== image.width || loaded.height !== image.height) throw new Error('An embedded image does not match its declared dimensions.');
      const bounds = cropBounds(policy, image.width, image.height);
      if (bounds.width !== image.width || bounds.height !== image.height) { const canvas = document.createElement('canvas'); canvas.width = bounds.width; canvas.height = bounds.height; const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false; context.drawImage(loaded, 0, 0, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height); image.data = canvas.toDataURL('image/png'); image.width = bounds.width; image.height = bounds.height; loaded = await loadImage(image.data); }
      probes.set(image.id, { width: image.width, height: image.height, image: loaded });
    }
    incoming.tiles = incoming.tiles.filter(tile => { const image = probes.get(tile.image); return tile.rect[0] + tile.rect[2] <= image.width && tile.rect[1] + tile.rect[3] <= image.height && hasVisiblePixels(image, tile.rect); });
    const sources = new Set(incoming.tiles.map(tile => tile.image)); incoming.images = incoming.images.filter(image => sources.has(image.id));
  }
  if (!incoming.tiles.length) throw new Error('This brush pack has no tiles to import.');
  assertImportCapacity(policy, target, incoming.images.length);
  const imageIds = new Map(incoming.images.map(image => [image.id, `image-${crypto.randomUUID()}`]));
  const importedTiles = incoming.tiles.map(tile => ({ ...tile, id: `${target.id}:${crypto.randomUUID()}`, image: imageIds.get(tile.image) }));
  const combined = { ...target, images: [...target.images, ...incoming.images.map(image => ({ ...image, id: imageIds.get(image.id) }))], tiles: [...target.tiles, ...importedTiles], imports: [...tilesetImports(target), { id: `import-${crypto.randomUUID()}`, name: importName, tiles: importedTiles.map(tile => tile.id) }] };
  const candidate = { ...map, packs: map.packs.map(pack => pack.id === target.id ? combined : pack) };
  const validated = validateMap(candidate, builtinTiles.map(tile => tile.id));
  const prepared = await prepareAssets(validated);
  history.snapshot(() => { map.packs = validated.packs; }, { includePacks: true });
  publishLibrary(libraryFromProject(sharedLibrary, map));
  images = prepared.newImages; tiles = prepared.newTiles; packs = [...enabledBuiltins(), ...availableCustomPacks()];
  activePack = targetId; activeCategory = 'All'; selected = importedTiles[0].id; rotation = 0; flip = false;
  renderPacks(); renderCategories(); renderPalette(); updateBrush(); setTool('brush'); changed();
}
function savePack() {
  const pack = libraryPacks(map).find(pack => pack.id === managedOrActivePackId()) || libraryPacks(map).find(pack => pack.id === tiles.get(selected)?.packId);
  if (!pack) { notify('Select a custom tile or custom pack first.'); return; }
  jsonDownload({ format: 'vtt-brush-pack', version: 1, pack: exportablePack(pack) }, `${safeName(pack.name)}.brushpack.json`); notify('Brush pack exported for reuse in other maps.');
}
function syncCanvasSettings() {
  $('resize-width').value = map.width; $('resize-height').value = map.height; $('map-background').value = map.background; $('resize-crop').checked = false; updateResizeWarning();
}
function updateResizeWarning() {
  try {
    const width = Number($('resize-width').value), height = Number($('resize-height').value), { dx, dy } = resizeOffset(map, width, height);
    const count = countCropped(map, width, height, dx, dy);
    $('resize-warning').hidden = count === 0; $('resize-warning').textContent = `${count} tiles fall outside the new canvas.`; $('resize-crop-row').hidden = count === 0;
  } catch (error) { $('resize-warning').hidden = false; $('resize-warning').textContent = error.message; $('resize-crop-row').hidden = true; }
}
function syncExportSettings() {
  const s = map.settings;
  $('export-size').value = s.pixelsPerCell; $('export-grid').checked = s.exportGrid; $('export-transparent').checked = s.transparent;
  $('print-cell-size').value = s.cellInches; $('print-dpi').value = s.printDpi; $('print-paper').value = s.paper; $('print-orientation').value = s.orientation; $('print-grid').checked = s.printGrid; $('print-background').checked = s.printBackground;
  exportDimensions();
}
function readExportSettings() {
  return { pixelsPerCell: Number($('export-size').value), exportGrid: $('export-grid').checked, transparent: $('export-transparent').checked, cellInches: Number($('print-cell-size').value), printDpi: Number($('print-dpi').value), paper: $('print-paper').value, orientation: $('print-orientation').value, printGrid: $('print-grid').checked, printBackground: $('print-background').checked, gridDefaultsVersion: 1 };
}
function saveExportSettings() {
  const settings = validateMap({ ...createMap(4, 4), settings: readExportSettings() }).settings;
  map.settings = settings; changed();
}
function openMapSettings() {
  finishStroke(); syncCanvasSettings();
  $('map-settings-dialog').showModal();
}
function exportDimensions() {
  const px = Number($('export-size').value), w = map.width * px, h = map.height * px;
  $('export-dimensions').textContent = `${w.toLocaleString()} × ${h.toLocaleString()} pixels`;
  try {
    const layout = printLayout({ ...map, settings: readExportSettings() });
    $('print-dimensions').textContent = `${layout.pagesX * layout.pagesY} pages (${layout.pagesX} across × ${layout.pagesY} down) · ${$('print-cell-size').value} inch cells`;
  } catch (error) { $('print-dimensions').textContent = error.message; }
}
function renderRegion(startX, startY, width, height, pixels, options) {
  const output = document.createElement('canvas'); output.width = width * pixels; output.height = height * pixels;
  const context = output.getContext('2d');
  if (!options.transparent) { context.fillStyle = map.background; context.fillRect(0, 0, output.width, output.height); }
  for (const layer of map.layers) if (layer.visible) {
    context.save(); context.globalAlpha *= layer.opacity ?? 1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cell = layer.cells[(startY + y) * map.width + startX + x]; if (cell) drawTile(context, cell.tile, x * pixels, y * pixels, pixels, cell.rotation, cell.flip, 1, cell.part);
    }
    context.restore();
  }
  if (options.grid) drawGrid(context, width, height, pixels, options.print ? '#777777' : '#acb5bf80');
  return output;
}
async function exportPNG() {
  finishStroke(); const pixels = map.settings.pixelsPerCell, w = map.width * pixels, h = map.height * pixels;
  if (w > 8192 || h > 8192 || w * h > 36_000_000) throw new Error('Export is too large. Choose fewer pixels per cell (max 8192 px per side and 36 megapixels).');
  const output = renderRegion(0, 0, map.width, map.height, pixels, { grid: map.settings.exportGrid, transparent: map.settings.transparent });
  if (policy.edition === 'web') await addFreePNGWatermark(output, pixels);
  const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The browser could not create this PNG. Try a smaller export.');
  download(blob, `${safeName(map.name)}.png`); $('export-dialog').close();
}

for (const button of $('tools').children) button.onclick = () => setTool(button.dataset.tool);
$('move-map').onclick = () => setTool(tool === 'move-map' ? 'select' : 'move-map');
$('move-confirm-form').onsubmit = event => {
  event.preventDefault();
  const move = pendingMapMove; pendingMapMove = null; $('move-confirm-dialog').close();
  if (move && shiftMap(history, move.dx, move.dy, true)) gridChanged();
};
$('move-confirm-dialog').addEventListener('close', () => { pendingMapMove = null; requestRender(); });
$('pack-select').onchange = () => choosePack($('pack-select').value, $('pack-select').value !== 'all');
$('rotate-brush').onclick = () => { finishStroke(); if (tool === 'select') { if (selection.size) applySelection('rotate'); } else { rotation = (rotation + 1) % 4; updateBrush(); } };
$('flip-brush').onclick = () => { finishStroke(); if (tool === 'select') { if (selection.size) applySelection('flip'); } else { flip = !flip; updateBrush(); } };
$('undo').onclick = () => { finishStroke(); if (history.undo()) gridChanged(); };
$('redo').onclick = () => { finishStroke(); if (history.redo()) gridChanged(); };
$('clear-selection').onclick = () => { finishStroke(); selection.clear(); updateBrush(); requestRender(); };
$('delete-selection').onclick = () => { finishStroke(); applySelection('delete'); };
$('grid-toggle').onclick = () => { grid = !grid; $('grid-toggle').classList.toggle('active', grid); $('grid-toggle').setAttribute('aria-pressed', grid); requestRender(); };
$('zoom-in').onclick = () => zoomAt(1.25); $('zoom-out').onclick = () => zoomAt(.8); $('zoom-reset').onclick = () => zoomAt(1 / zoom); $('fit-map').onclick = fitMap;
$('map-name').oninput = () => { map.name = $('map-name').value.trim() || 'Untitled dungeon'; updateName(); changed(); };
$('new-map').onclick = () => { finishStroke(); $('new-dialog').showModal(); };
$('new-form').onsubmit = async event => { event.preventDefault(); try { const form = new FormData(event.target); const candidate = createMap(Number(form.get('width')), Number(form.get('height')), String(form.get('name')).trim() || 'Untitled dungeon'); await installMap(candidate); $('new-dialog').close(); } catch (error) { showError(error); } };
$('open-map').onclick = () => { finishStroke(); $('map-file').click(); };
$('save-map').onclick = saveMap;
$('map-file').onchange = async event => { try { await openMapFile(event.target.files[0]); } catch (error) { showError(error); } finally { event.target.value = ''; } };
$('map-settings').onclick = () => openMapSettings();
$('export-map').onclick = () => { finishStroke(); syncExportSettings(); $('export-dialog').showModal(); };
$('print-map').onclick = () => { finishStroke(); syncExportSettings(); $('print-dialog').showModal(); };
for (const input of document.querySelectorAll('#export-form input, #export-form select, #print-form input, #print-form select')) input.addEventListener('input', exportDimensions);
$('resize-form').onsubmit = event => { event.preventDefault(); if (!canEditProject()) return; try { finishStroke(); let modified = resizeMap(history, Number($('resize-width').value), Number($('resize-height').value), 'top-left', $('resize-crop').checked); const color = $('map-background').value; if (map.background !== color) { map.background = color; modified = true; } if (modified) gridChanged(true); $('map-settings-dialog').close(); } catch (error) { notify(error.message, true); } };
for (const input of document.querySelectorAll('#resize-form input, #resize-form select')) input.addEventListener('input', updateResizeWarning);
$('export-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try {
    saveExportSettings(); await exportPNG();
  } catch (error) { showError(error); } finally { button.disabled = false; }
};
$('print-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try { saveExportSettings(); const blob = await printPDF(map, renderRegion, (current, total) => button.textContent = `Page ${current}/${total}`); download(blob, `${safeName(map.name)}-print.pdf`); $('print-dialog').close(); }
  catch (error) { showError(error); } finally { button.disabled = false; button.textContent = 'Download PDF'; }
};
function openRename() { const pack = packs.find(pack => pack.id === managedOrActivePackId()); if (!pack) return; renamingPackId = pack.id; $('pack-name').value = map.packNames[pack.id] || pack.name.replace('Kenney · ', ''); $('rename-dialog').showModal(); }
$('rename-tileset').onclick = openRename;
$('pack-select').addEventListener('keydown', event => { if (event.key === 'F2') { event.preventDefault(); openRename(); } });
$('rename-form').onsubmit = event => {
  event.preventDefault(); const name = $('pack-name').value.trim(); if (!name) return;
  const pack = packs.find(pack => pack.id === renamingPackId); if (!pack) return;
  if (builtinPacks.some(item => item.id === pack.id)) map.packNames[pack.id] = name;
  else history.snapshot(() => { pack.name = name; }, { includePacks: true });
  publishLibrary(libraryFromProject(sharedLibrary, map));
  renderPacks(); changed(); $('rename-dialog').close();
};
function confirmPackDeletion(pack) {
  finishStroke(); if (!pack) return;
  deletingPackId = pack.id;
  $('delete-pack-title').textContent = 'Delete tileset?';
  document.querySelector('#delete-pack-form button[type=submit]').textContent = 'Delete tileset';
  $('delete-pack-warning').textContent = pack.optional ? `Delete “${map.packNames[pack.id] || pack.name.replace('Kenney · ', '')}” from your library? Placed tiles will stay on your maps. You can add this set again from Free Tilesets.` : `Remove “${pack.name}” from the library? Tiles already placed on the map will stay. Undo restores the tileset to the library.`;
  $('delete-pack-dialog').showModal();
}
$('delete-pack').onclick = () => confirmPackDeletion(libraryPacks(map).find(pack => pack.id === managedOrActivePackId()));
$('delete-pack-form').onsubmit = event => {
  event.preventDefault(); const id = deletingPackId; deletingPackId = null; $('delete-pack-dialog').close();
  if (builtinPacks.some(pack => pack.id === id && pack.optional)) {
    publishLibrary({ ...sharedLibrary, enabledOptional: sharedLibrary.enabledOptional.filter(packId => packId !== id) });
    managingPackId = null; rebuildLibrary(); renderFreeTilesets(); updateBrush(); changed();
  } else if (id && deletePack(history, id)) gridChanged();
  if ($('tileset-manager-dialog').open && !$('kenney-dialog').open) $('new-tileset').focus();
};
$('delete-pack-dialog').addEventListener('close', () => { deletingPackId = null; });
function renderImports() {
  const pack = availableCustomPacks().find(pack => pack.id === managingPackId);
  $('import-list').replaceChildren();
  if (!pack) return;
  const groups = tilesetImports(pack); $('no-imports').hidden = !!groups.length;
  for (const group of groups) {
    const row = document.createElement('div'); row.className = 'import-row';
    const preview = document.createElement('canvas'); preview.width = 64; preview.height = 64; preview.setAttribute('aria-hidden', 'true');
    drawTile(preview.getContext('2d'), group.tiles[0], 0, 0, 64);
    const name = document.createElement('span'); name.className = 'import-row-name'; name.textContent = group.name;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Remove import'; button.setAttribute('aria-label', `Remove import ${group.name}`);
    button.onclick = () => {
      deletingImport = { packId: pack.id, importId: group.id };
      $('delete-import-warning').textContent = `Remove “${group.name}” from “${pack.name}”? Tiles already placed on the map will stay. Undo restores this import.`;
      $('delete-import-dialog').showModal();
    };
    row.append(preview, name, button); $('import-list').append(row);
  }
}
function renderTilesetManager() {
  const pack = packs.find(pack => pack.id === managingPackId) || availableCustomPacks()[0] || packs.find(pack => pack.id === activePack) || enabledBuiltins()[0];
  if (!pack) return;
  managingPackId = pack.id;
  const custom = availableCustomPacks().some(item => item.id === pack.id), removable = custom, name = map.packNames[pack.id] || pack.name.replace('Kenney · ', '');
  $('managed-tileset-name').textContent = name;
  $('managed-tileset-actions').hidden = !custom; $('managed-imports').hidden = !custom; $('managed-tileset-delete').hidden = !removable; $('default-tileset-note').hidden = custom;
  $('default-tileset-note').textContent = pack.id === 'kenney-scribble' ? 'Hand-drawn dungeon floors, walls, props and characters.' : pack.id === 'kenney-tiny' ? 'Pixel dungeon terrain, furniture, items and characters.' : 'Default artwork is included with the editor. Create a custom tileset to import your own tiles.';
  const atImportLimit = custom && importCount(pack) >= policy.maxImports;
  $('import-tiles').disabled = !custom || atImportLimit; $('import-tiles').title = atImportLimit ? `Free allows 2 image imports per tileset. ${FREE_UPGRADE}` : '';
  $('save-pack').disabled = !libraryTiles(pack).length; $('save-pack').hidden = !custom; $('delete-pack').hidden = !removable; $('delete-pack').textContent = pack.optional ? 'Remove tileset' : 'Delete tileset';
  $('new-tileset').disabled = libraryPacks(map).length >= Math.min(64, policy.maxCustomSets); $('new-tileset').title = policy.edition === 'web' && $('new-tileset').disabled ? `Free allows 2 custom tilesets. ${FREE_UPGRADE}` : '';
  $('tileset-capacity').hidden = policy.edition !== 'web'; $('tileset-capacity').textContent = `${libraryPacks(map).length} / 2 custom tilesets`;
  $('tileset-capacity-info').hidden = policy.edition !== 'web' || !$('new-tileset').disabled;
  $('tileset-import-budget').hidden = policy.edition !== 'web' || !custom;
  $('tileset-import-count').textContent = custom ? `${importCount(pack)} / 2 images` : '';
  $('tileset-import-budget').classList.toggle('at-limit', atImportLimit);
  $('managed-tilesets').replaceChildren();
  for (const [label, items] of [['Custom', availableCustomPacks()], ['Default', enabledBuiltins()]]) {
    if (!items.length) continue;
    const heading = document.createElement('h3'); heading.className = 'tileset-list-heading'; heading.textContent = label; $('managed-tilesets').append(heading);
    for (const item of items) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tileset-list-item'; button.textContent = map.packNames[item.id] || item.name.replace('Kenney · ', ''); button.setAttribute('aria-pressed', item.id === pack.id); button.classList.toggle('active', item.id === pack.id);
      button.onclick = () => { managingPackId = item.id; renderTilesetManager(); $('managed-tilesets').querySelector('[aria-pressed=true]')?.focus({ preventScroll: true }); };
      $('managed-tilesets').append(button);
    }
  }
  renderImports();
}
$('manage-tilesets').onclick = () => { finishStroke(); managingPackId = packs.some(pack => pack.id === activePack) ? activePack : availableCustomPacks()[0]?.id || enabledBuiltins()[0]?.id; renderTilesetManager(); $('tileset-manager-dialog').showModal(); };
$('delete-import-form').onsubmit = event => {
  event.preventDefault(); const pending = deletingImport; deletingImport = null; $('delete-import-dialog').close();
  if (pending && deleteImport(history, pending.packId, pending.importId)) gridChanged();
  $('tileset-manager-dialog').querySelector('[data-close]').focus();
};
$('delete-import-dialog').addEventListener('close', () => { deletingImport = null; });
$('import-tiles').onclick = () => openImport();
$('new-tileset').onclick = () => { finishStroke(); $('new-tileset-dialog').showModal(); $('new-tileset-name').focus(); $('new-tileset-name').select(); };
$('new-tileset-form').onsubmit = event => {
  event.preventDefault(); const name = $('new-tileset-name').value.trim(); if (!name) return;
  if (libraryPacks(map).length >= Math.min(64, policy.maxCustomSets)) { notify(policy.edition === 'web' ? `Free allows 2 custom tilesets. ${FREE_UPGRADE}` : 'Your library can contain at most 64 custom tilesets.', true); return; }
  const pack = { id: `custom-${crypto.randomUUID()}`, name, images: [], tiles: [] };
  history.snapshot(() => { map.packs.push(pack); }, { includePacks: true });
  activePack = pack.id; managingPackId = pack.id; gridChanged(); $('new-tileset-dialog').close();
};
$('tile-files').onchange = async event => {
  const generation = ++importGeneration; importImages = []; updateImportPreview();
  try {
    const files = [...event.target.files]; if (files.length > MAX_TILES) throw new Error(`Import at most ${MAX_TILES} tiles.`);
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_EMBEDDED_BYTES * .7) throw new Error('Choose a smaller set of images (under 32 MB total).');
    const loaded = [];
    for (const file of files) loaded.push(await readImage(file));
    if (generation !== importGeneration) return;
    importImages = loaded;
    if (loaded.length > 1) document.querySelector('input[name=mode][value=images]').checked = true;
    updateImportPreview();
  } catch (error) { if (generation === importGeneration) { importImages = []; updateImportPreview(); showError(error); } }
};
for (const input of document.querySelectorAll('#sheet-fields input, input[name=mode]')) input.addEventListener('input', updateImportPreview);
$('free-tile-size').onchange = () => { $('tile-width').value = $('free-tile-size').value; $('tile-height').value = $('free-tile-size').value; updateImportPreview(); };
$('import-form').onsubmit = async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; try { await importPack(); } catch (error) { showError(error); } finally { button.disabled = false; } };
$('load-pack').onclick = () => $('pack-file').click();
$('pack-file').onchange = async event => {
  try {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 64 * 1024 * 1024) throw new Error('Brush packs must be smaller than 64 MB.');
    const data = JSON.parse(await file.text());
    if (data.format !== 'vtt-brush-pack' || data.version !== 1) throw new Error('Choose a Trials brush pack.');
    await appendPack(data.pack); $('import-dialog').close(); notify('Brush pack tiles added to the selected tileset.');
  } catch (error) { showError(error); } finally { event.target.value = ''; }
};
$('save-pack').onclick = savePack;
function renderFreeTilesets() {
  for (const button of document.querySelectorAll('[data-kenney-pack]')) {
    const id = button.dataset.kenneyPack, added = sharedLibrary.enabledOptional.includes(id), name = id === 'kenney-scribble' ? 'Scribble' : 'Tiny Dungeon';
    button.textContent = added ? '×' : '+'; button.title = (added ? 'Delete ' : 'Add ') + name; button.dataset.action = added ? 'delete' : 'add'; button.classList.toggle('danger', added);
    button.setAttribute('aria-label', (added ? 'Delete ' : 'Add ') + name);
  }
}
$('free-tilesets').onclick = () => { finishStroke(); renderFreeTilesets(); $('kenney-dialog').showModal(); };
for (const button of document.querySelectorAll('[data-kenney-pack]')) button.onclick = () => {
  const pack = builtinPacks.find(pack => pack.id === button.dataset.kenneyPack && pack.collection === 'kenney'); if (!pack) return;
  if (sharedLibrary.enabledOptional.includes(pack.id)) { confirmPackDeletion(pack); return; }
  publishLibrary({ ...sharedLibrary, enabledOptional: [...sharedLibrary.enabledOptional, pack.id] });
  managingPackId = pack.id; rebuildLibrary(); renderFreeTilesets(); changed();
};
$('backup-library').onclick = () => jsonDownload(sharedLibrary, 'trials-library.json');
$('restore-library').onclick = () => $('library-file').click();
$('library-file').onchange = async event => {
  try {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 64 * 1024 * 1024) throw new Error('Choose a library backup smaller than 64 MB.');
    finishStroke(); const next = mergeLibraryBackup(sharedLibrary, JSON.parse(await file.text())), candidate = validateMap(projectWithLibrary(next, map), builtinTiles.map(tile => tile.id)), prepared = await prepareAssets(candidate);
    history.snapshot(() => { map.packs = candidate.packs; map.layers = candidate.layers; map.packNames = candidate.packNames; }, { includePacks: true }); map.packDescriptions = candidate.packDescriptions;
    publishLibrary(next); images = prepared.newImages; tiles = prepared.newTiles; rebuildLibrary(); gridChanged(); notify('Library imported. Tilesets are available in every project on this device.');
  } catch (error) { showError(error); } finally { event.target.value = ''; }
};
$('help').onclick = () => $('help-dialog').showModal();
$('inspector-toggle').onclick = () => { const open = document.body.classList.toggle('inspector-open'); $('inspector-toggle').setAttribute('aria-expanded', open); };
$('inspector-close').onclick = () => { document.body.classList.remove('inspector-open'); $('inspector-toggle').setAttribute('aria-expanded', false); $('inspector-toggle').focus(); };
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => button.closest('dialog').close();
for (const dialog of document.querySelectorAll('dialog')) {
  let backdropPointer = null;
  const onBackdrop = event => {
    const rect = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
  };
  // A click can target the dialog after a text-selection drag ends on its backdrop.
  // Dismiss only when the same primary press also began on the backdrop.
  dialog.addEventListener('pointerdown', event => { backdropPointer = event.button === 0 && onBackdrop(event) ? event.pointerId : null; });
  dialog.addEventListener('click', event => {
    const dismiss = backdropPointer !== null && backdropPointer === event.pointerId && event.button === 0 && onBackdrop(event);
    backdropPointer = null;
    if (dismiss) dialog.close();
  });
  dialog.addEventListener('pointercancel', () => { backdropPointer = null; });
  dialog.addEventListener('close', () => { backdropPointer = null; });
}
viewport.addEventListener('dragover', event => { event.preventDefault(); });
viewport.addEventListener('drop', async event => {
  event.preventDefault(); finishStroke(); const files = [...event.dataTransfer.files];
  try {
    if (files.length === 1 && /\.(json|vttmap)$/i.test(files[0].name)) { await openMapFile(files[0]); return; }
    if (!files.length) return;
    if (!availableCustomPacks().some(pack => pack.id === activePack)) { notify('Create or select a custom tileset before dropping tiles.', true); return; }
    if (policy.edition === 'web' && files.length > 1) { notify(`Import one sprite-sheet image at a time. Free allows 2 per tileset. ${FREE_UPGRADE}`, true); return; }
    if (files.length > MAX_TILES || files.reduce((sum, file) => sum + file.size, 0) > MAX_EMBEDDED_BYTES * .7) throw new Error('Drop a smaller set of images (under 32 MB).');
    const loaded = []; for (const file of files) loaded.push(await readImage(file));
    importGeneration++; importImages = loaded; document.querySelector(`input[name=mode][value=${files.length === 1 ? 'sheet' : 'images'}]`).checked = true;
    // Dropped files are already read; remove the native required-file gate.
    $('tile-files').required = false; updateImportPreview(); openImport(true);
  } catch (error) { showError(error); }
});
document.addEventListener('keydown', event => {
  const editing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName), modal = !!document.querySelector('dialog[open]'), key = event.key.toLowerCase(), modifier = event.ctrlKey || event.metaKey;
  if (modal || editing || shapeMenu.open || layerMenu.isOpen || !map) return;
  if (modifier && ['s', 'o', 'z', 'y', 'a'].includes(key)) {
    event.preventDefault();
    if (key === 'a') { setTool('select'); selection = new Set(selectionInLayers(map, selectedLayerIds, 0, 0, map.width - 1, map.height - 1)); updateBrush(); requestRender(); }
    else if (key === 's') saveMap(); else if (key === 'o') $('open-map').click(); else if (key === 'y' || event.shiftKey) $('redo').click(); else $('undo').click(); return;
  }
  if (modifier || event.altKey) return;
  if (event.code === 'Space') { event.preventDefault(); spaceHeld = true; viewport.style.cursor = 'grab'; requestRender(); return; }
  if (tool === 'select' && selection.size) {
    const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (offsets[event.key]) { event.preventDefault(); applySelection('move', ...offsets[event.key]); return; }
    if (key === 'delete' || key === 'backspace') { event.preventDefault(); applySelection('delete'); return; }
  }
  if (event.repeat) return;
  const shortcuts = { b: 'brush', e: 'eraser', g: 'fill', u: 'shape', i: 'picker', s: 'select', m: 'move-map' };
  if (shortcuts[key]) setTool(shortcuts[key]);
  else if (key === 'r') $('rotate-brush').click(); else if (key === 'f') $('flip-brush').click(); else if (key === 'v') $('grid-toggle').click();
  else if (key === '0') fitMap(); else if (key === '+' || key === '=') zoomAt(1.25); else if (key === '-') zoomAt(.8);
  else if (key === 'escape') { if (pointer) finishStroke(true); else if (tool === 'move-map') setTool('select'); else { selection.clear(); updateBrush(); requestRender(); } } else if (key === '?') $('help').click();
});
document.addEventListener('keyup', event => { if (event.code === 'Space') { spaceHeld = false; viewport.style.cursor = pointer?.mode === 'pan' ? 'grabbing' : tool === 'move-map' ? 'move' : 'crosshair'; requestRender(); } });
window.addEventListener('beforeunload', event => { if (dirty && $('save-state').textContent !== 'Saved locally in this browser') { event.preventDefault(); event.returnValue = ''; } });
new ResizeObserver(resizeCanvas).observe(viewport);
const layerMenu = createLayerMenu($('layer-menu'), (action, id, value) => {
  if (action === 'opacity') changeLayer(() => setLayerState(history, id, { opacity: value }));
  else if (action === 'rename') {
    const layer = map.layers.find(layer => layer.id === id); if (!layer || !canEditProject()) return;
    renamingLayerId = id; $('layer-name').value = layer.name; $('rename-layer-dialog').showModal(); $('layer-name').focus(); $('layer-name').select();
  }
  else if (action === 'duplicate') changeLayer(() => { activeLayerId = addLayer(history, id, policy.maxLayers); selectedLayerIds = new Set([activeLayerId]); layerAnchorId = activeLayerId; return true; });
  else if (action === 'delete') {
    const layer = map.layers.find(layer => layer.id === id), count = layer?.cells.filter(Boolean).length;
    if (!layer) return;
    if (!count) changeLayer(() => deleteLayer(history, id), true);
    else { deletingLayerId = id; $('delete-layer-warning').textContent = `Delete “${layer.name}” and its ${count} ${count === 1 ? 'tile' : 'tiles'}? You can restore the layer with Undo.`; $('delete-layer-dialog').showModal(); }
  }
});
$('rename-layer-form').onsubmit = event => {
  event.preventDefault(); const id = renamingLayerId, name = $('layer-name').value.trim(); if (!id || !name) return;
  changeLayer(() => setLayerState(history, id, { name })); $('rename-layer-dialog').close();
};
$('rename-layer-dialog').addEventListener('close', () => { renamingLayerId = null; });
$('add-layer').onclick = () => changeLayer(() => { activeLayerId = addLayer(history, null, policy.maxLayers); selectedLayerIds = new Set([activeLayerId]); layerAnchorId = activeLayerId; return true; });
$('delete-layer-form').onsubmit = event => { event.preventDefault(); const id = deletingLayerId; deletingLayerId = null; $('delete-layer-dialog').close(); if (id) changeLayer(() => deleteLayer(history, id), true); };
$('delete-layer-dialog').addEventListener('close', () => { deletingLayerId = null; });
const shapeMenu = createShapeMenu(document.querySelector('[data-tool=shape]'), $('shape-menu'), (type, outline) => { shapeType = type; shapeOutline = outline; if (tool !== 'shape') setTool('shape'); requestRender(); });

async function init() {
  const edition = await configureEdition().catch(() => ({ edition: 'web' })); policy = editionPolicy(edition.edition); applyEditionUI(edition);
  $('save-state').textContent = 'Loading tile library…';
  const response = await fetch('assets/packs.json'); if (!response.ok) throw new Error('Could not load the bundled tile library. Start the app with npm start.');
  builtinPacks = await Promise.all((await response.json()).map(async entry => { const descriptor = typeof entry === 'string' ? { manifest: entry } : entry; const result = await fetch(descriptor.manifest); if (!result.ok) throw new Error('Could not load a bundled tileset.'); return { ...(await result.json()), optional: !!descriptor.optional, collection: descriptor.collection }; }));
  builtinTiles = builtinPacks.flatMap(pack => pack.tiles);
  await Promise.all([...new Set(builtinTiles.map(tile => tile.src))].map(async src => images.set(src, await loadImage(src))));
  let restored;
  try { const library = await storedLibrary(); if (library) sharedLibrary = validateLibrary(library); } catch (error) { notify('The shared library could not be loaded. Restore a library backup to recover it.', true); }
  try { const stored = await storedMap(); if (stored) restored = validateMap(stored, builtinTiles.map(tile => tile.id)); } catch (error) { notify('The previous local workspace could not be restored. Open a saved map to recover it.', true); }
  try { await installMap(restored || createMap()); }
  catch (error) { if (!restored) throw error; showError(error); await installMap(createMap()); }
  $('save-state').textContent = restored ? 'Restored workspace' : 'New map';
  viewport.style.cursor = 'crosshair';
}
init().catch(error => { $('save-state').textContent = 'Could not start'; showError(error); });
