import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDefaultCatalog } from './default-catalog.mjs';
const root = fileURLToPath(new URL('../assets/kenney-scribble/tiles/', import.meta.url));
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(target);
    else if (entry.name.endsWith('.png')) files.push(path.relative(root, target).replaceAll('\\', '/'));
  }
}
await walk(root);
const tiles = files.sort().map(file => {
  const base = path.basename(file, '.png');
  const category = file.startsWith('Characters/') ? 'Characters' : file.startsWith('Items/') ? 'Items' : base.includes('wall') || base.startsWith('inner_') || base.startsWith('door') ? 'Walls' : /^(floor_|tile|tiles|grass|water|wood|planks|path|stairs)/.test(base) ? 'Floors' : 'Props';
  const label = base.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { id: `kenney:${file}`, name: label, category, src: `assets/kenney-scribble/tiles/${file}`, rect: [0, 0, 64, 64] };
});
await writeFile(new URL('../assets/kenney-scribble/pack.json', import.meta.url), JSON.stringify({ id: 'kenney-scribble', name: 'Kenney · Scribble Dungeons', author: 'Kenney', source: 'https://kenney.nl/assets/scribble-dungeons', license: 'CC0-1.0', tiles }, null, 2) + '\n');
const tinyTiles = Array.from({ length: 132 }, (_, i) => {
  const row = Math.floor(i / 12), column = i % 12;
  const category = row >= 7 && column < 5 ? 'Characters' : row >= 8 ? 'Items' : row >= 5 ? 'Props' : row === 4 || [0, 12, 24, 36, 37, 38, 39, 40].includes(i) ? 'Floors' : 'Walls';
  return { id: `tiny:${i}`, name: `Tiny ${category === 'Characters' ? 'Character' : category === 'Props' ? 'Prop' : category === 'Items' ? 'Item' : category === 'Walls' ? 'Wall' : 'Floor'} ${String(i + 1).padStart(3, '0')}`, category, src: 'assets/kenney-tiny/tilemap.png', rect: [column * 17, row * 17, 16, 16], pixelArt: true };
});
await writeFile(new URL('../assets/kenney-tiny/pack.json', import.meta.url), JSON.stringify({ id: 'kenney-tiny', name: 'Kenney · Tiny Dungeon', author: 'Kenney', source: 'https://kenney.nl/assets/tiny-dungeon', license: 'CC0-1.0', pixelArt: true, tiles: tinyTiles }, null, 2) + '\n');
await writeFile(new URL('../assets/packs.json', import.meta.url), JSON.stringify([...(await buildDefaultCatalog()), { manifest: 'assets/kenney-scribble/pack.json', optional: true, collection: 'kenney' }, { manifest: 'assets/kenney-tiny/pack.json', optional: true, collection: 'kenney' }], null, 2) + '\n');
console.log(`Cataloged ${tiles.length} Scribble Dungeons + ${tinyTiles.length} Tiny Dungeon tiles.`);
