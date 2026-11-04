import { readFile } from 'node:fs/promises';
const catalog = JSON.parse(await readFile(new URL('../assets/packs.json', import.meta.url), 'utf8'));
export const defaultTileCount = (await Promise.all(catalog.filter(entry => !entry.optional).map(async entry => JSON.parse(await readFile(new URL(`../${entry.manifest}`, import.meta.url), 'utf8')).tiles.length))).reduce((sum, count) => sum + count, 0);
export async function enableKenney(page) {
  // Core regression flows exercise the full paid editor; tier tests use the real web configuration.
  await page.route('**/assets/edition.json', route => route.fulfill({ json: { edition: 'desktop', ad: { enabled: false } } })); await page.reload();
  await page.waitForSelector('.tile-button'); await openTilesets(page);
  await addKenney(page);
  await closeTilesets(page); await page.locator('#pack-select').selectOption('kenney-scribble');
}
export async function addKenney(page) {
  await openFreeTilesets(page);
  for (const id of ['kenney-scribble', 'kenney-tiny']) { const button = page.locator(`[data-kenney-pack="${id}"]`); if (await button.getAttribute('data-action') === 'add') await button.click(); }
  await closeFreeTilesets(page);
}
export async function openFreeTilesets(page) {
  await openTilesets(page); if (!await page.locator('#kenney-dialog').isVisible()) await page.locator('#free-tilesets').click();
}
export async function closeFreeTilesets(page) {
  if (await page.locator('#kenney-dialog').isVisible()) await page.locator('#kenney-dialog [data-close]').click();
}

export async function openTilesets(page) {
  if (!await page.locator('#tileset-manager-dialog').isVisible()) await page.locator('#manage-tilesets').click();
}
export async function closeTilesets(page) {
  await closeFreeTilesets(page);
  if (await page.locator('#tileset-manager-dialog').isVisible()) await page.locator('#tileset-manager-dialog').getByRole('button', { name: 'Close', exact: true }).click();
}
export async function createTileset(page, name) {
  await openTilesets(page); await page.locator('#new-tileset').click(); await page.locator('#new-tileset-name').fill(name); await page.locator('#new-tileset-form button[type=submit]').click();
  const id = await page.locator('#pack-select').inputValue(); await closeTilesets(page); return id;
}
export async function openTileImport(page) {
  await openTilesets(page); await page.locator('#import-tiles').click();
}
