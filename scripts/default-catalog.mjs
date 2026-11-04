import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { sliceSheet } from '../src/model.js';

const directory = fileURLToPath(new URL('../assets/defaults/', import.meta.url));
export async function buildDefaultCatalog() {
  const entries = JSON.parse(await readFile(path.join(directory, 'tilesets.json'), 'utf8')), manifests = [], ids = new Set();
  for (const entry of entries) {
    if (!/^[a-z0-9-]+$/.test(entry.id) || ids.has(entry.id) || typeof entry.name !== 'string' || !entry.name.trim() || path.basename(entry.file) !== entry.file) throw new Error('Invalid default tileset configuration.');
    ids.add(entry.id);
    const image = PNG.sync.read(await readFile(path.join(directory, entry.file))), rectangles = sliceSheet(image.width, image.height, entry.tileWidth, entry.tileHeight, entry.spacing || 0, entry.margin || 0);
    let categories;
    if (entry.categoryGrid !== undefined) {
      const columns = new Set(rectangles.map(rect => rect[0])).size, rows = new Set(rectangles.map(rect => rect[1])).size;
      if (!Array.isArray(entry.categoryGrid) || entry.categoryGrid.length !== rows || entry.categoryGrid.some(row => typeof row !== 'string' || row.length !== columns || !/^[FWP-]+$/.test(row))) throw new Error('Category grid must match the tile sheet and use F, W, P or -.');
      categories = entry.categoryGrid.join('');
    }
    const tiles = [], grouping = new Map();
    for (const group of entry.groups || []) for (const [position, index] of group.tiles.entries()) {
      if (!Number.isInteger(index) || index < 0 || index >= rectangles.length || grouping.has(index)) throw new Error('Invalid or duplicate grouped tile.');
      grouping.set(index, { name: `${group.name} ${String(position + 1).padStart(2, '0')}`, category: group.category || 'Tiles', order: grouping.size });
    }
    for (const [index, rect] of rectangles.entries()) {
      const [x, y, width, height] = rect;
      if (categories?.[index] === '-') continue;
      if (entry.skipEmpty) {
        let visible = false;
        for (let py = y; py < y + height && !visible; py++) for (let px = x; px < x + width; px++) if (image.data[(py * image.width + px) * 4 + 3]) { visible = true; break; }
        if (!visible) continue;
      }
      tiles.push({ id: `${entry.id}:${index}`, name: `${entry.name} ${String(index + 1).padStart(3, '0')}`, category: 'Tiles', src: `assets/defaults/${entry.file}`, rect, pixelArt: entry.pixelArt !== false, ...grouping.get(index), ...(categories ? { category: { F: 'Floors', W: 'Walls', P: 'Props' }[categories[index]] } : {}) });
    }
    if (!tiles.length) throw new Error(`${entry.name} contains no visible tiles.`);
    tiles.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    const filename = `${entry.id}.json`;
    await writeFile(path.join(directory, filename), JSON.stringify({ id: entry.id, name: entry.name, author: entry.author, license: entry.license, attributionRequired: !!entry.attributionRequired, tiles }, null, 2) + '\n');
    manifests.push({ manifest: `assets/defaults/${filename}`, optional: false });
  }
  return manifests;
}
