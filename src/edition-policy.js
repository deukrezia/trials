import { libraryPacks, libraryTiles } from './model.js';

export const FREE_UPGRADE = 'Buy/download the desktop app for 12 layers and no Free upload restrictions.';
export function editionPolicy(edition = 'web') {
  return edition === 'desktop'
    ? { edition: 'desktop', maxLayers: 12, maxCustomSets: Infinity, maxImports: Infinity, maxImageSize: 8192, tileSizes: null }
    : { edition: 'web', maxLayers: 6, maxCustomSets: 2, maxImports: 2, maxImageSize: 160, tileSizes: [16, 32] };
}
export const policyPacks = (map, policy) => libraryPacks(map).slice(0, policy.maxCustomSets);
export function importCount(pack) { return new Set(libraryTiles(pack).map(tile => tile.image)).size; }
export function policyTiles(pack, policy) {
  const tiles = libraryTiles(pack);
  if (policy.edition === 'desktop' || !tiles.length) return tiles;
  const used = new Set(tiles.map(tile => tile.image)), allowedImages = new Set(pack.images.filter(image => used.has(image.id)).slice(0, policy.maxImports).map(image => image.id));
  return tiles.filter(tile => allowedImages.has(tile.image) && policy.tileSizes.includes(tile.rect[2]) && tile.rect[2] === tile.rect[3] && tile.rect[0] + tile.rect[2] <= policy.maxImageSize && tile.rect[1] + tile.rect[3] <= policy.maxImageSize);
}
export function assertTileSetup(policy, width, height) {
  if (policy.tileSizes && (width !== height || !policy.tileSizes.includes(width))) throw new Error(`Free supports 16×16 or 32×32 tiles. ${FREE_UPGRADE}`);
}
export function assertImportCapacity(policy, pack, images) {
  if (importCount(pack) + images > policy.maxImports) throw new Error(`Free allows 2 image imports per custom tileset. Remove an import to make room. ${FREE_UPGRADE}`);
}
export function cropBounds(policy, width, height) { return { width: Math.min(width, policy.maxImageSize), height: Math.min(height, policy.maxImageSize) }; }
