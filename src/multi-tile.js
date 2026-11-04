// Large brushes retain the sheet's base grid. Each occupied cell references a
// source part, so clipping, layer compositing and paginated exports agree.
export const footprint = tile => tile?.footprint || [1, 1];
export function baseTileSize(tile) {
  const [w, h] = footprint(tile), gap = tile.cellSpacing || 0;
  return [(tile.rect[2] - (w - 1) * gap) / w, (tile.rect[3] - (h - 1) * gap) / h];
}
export function partRect(tile, part) {
  if (!part) return tile.rect;
  const [x, y, w, h] = part, gap = tile.cellSpacing || 0;
  const sw = (tile.rect[2] - (w - 1) * gap) / w, sh = (tile.rect[3] - (h - 1) * gap) / h;
  return [tile.rect[0] + x * (sw + gap), tile.rect[1] + y * (sh + gap), sw, sh];
}
export function stampParts(value, size = [1, 1], instance = null) {
  const [w, h] = size;
  if (w === 1 && h === 1) return [{ x: 0, y: 0, cell: value }];
  const result = [], turns = value.rotation, id = instance || crypto.randomUUID();
  for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) {
    let x = value.flip ? w - 1 - sx : sx, y = sy;
    if (turns === 1) [x, y] = [h - 1 - y, x];
    else if (turns === 2) [x, y] = [w - 1 - x, h - 1 - y];
    else if (turns === 3) [x, y] = [y, w - 1 - x];
    result.push({ x, y, cell: { ...value, instance: id, part: [sx, sy, w, h] } });
  }
  return result;
}
export function rotatedFootprint(size, turns) { return turns % 2 ? [size[1], size[0]] : size; }
export function expandInstances(layers, indices) {
  const result = new Set(indices);
  // A shared multi-layer selection can encounter another asset on a newly
  // included cell. Expand to a fixed point rather than leaving split objects.
  let changed = true;
  while (changed) {
    changed = false;
    for (const layer of layers) {
      const ids = new Set([...result].map(i => layer.cells[i]?.instance).filter(Boolean));
      if (!ids.size) continue;
      layer.cells.forEach((cell, i) => { if (cell?.instance && ids.has(cell.instance) && !result.has(i)) { result.add(i); changed = true; } });
    }
  }
  return [...result];
}
export function patternAnchors(cells, size) {
  if (!cells.length) return [];
  if (size[0] === 1 && size[1] === 1) return cells;
  const left = Math.min(...cells.map(p => p[0])), top = Math.min(...cells.map(p => p[1])), right = Math.max(...cells.map(p => p[0])), bottom = Math.max(...cells.map(p => p[1]));
  const allowed = new Set(cells.map(([x, y]) => `${x},${y}`)), anchors = [];
  for (let y = top; y + size[1] - 1 <= bottom; y += size[1]) for (let x = left; x + size[0] - 1 <= right; x += size[0]) {
    let fits = true;
    for (let dy = 0; dy < size[1] && fits; dy++) for (let dx = 0; dx < size[0]; dx++) if (!allowed.has(`${x + dx},${y + dy}`)) { fits = false; break; }
    if (fits) anchors.push([x, y]);
  }
  return anchors;
}
export function sheetEntries(width, height, cellWidth, cellHeight, gap, margin, regions = []) {
  const cols = Math.max(0, Math.floor((width - 2 * margin + gap) / (cellWidth + gap))), rows = Math.max(0, Math.floor((height - 2 * margin + gap) / (cellHeight + gap)));
  const covered = new Set(), entries = [];
  for (const [x, y, w, h] of regions) {
    if (x < 0 || y < 0 || x + w > cols || y + h > rows) continue;
    entries.push({ rect: [margin + x * (cellWidth + gap), margin + y * (cellHeight + gap), w * cellWidth + (w - 1) * gap, h * cellHeight + (h - 1) * gap], footprint: [w, h], ...(gap ? { cellSpacing: gap } : {}) });
    for (let sy = y; sy < y + h; sy++) for (let sx = x; sx < x + w; sx++) covered.add(`${sx},${sy}`);
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!covered.has(`${x},${y}`)) entries.push({ rect: [margin + x * (cellWidth + gap), margin + y * (cellHeight + gap), cellWidth, cellHeight] });
  return entries.sort((a, b) => a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0]);
}
