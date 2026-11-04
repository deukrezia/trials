import test from 'node:test';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defaultTileCount, createTileset } from './tileset-ui.mjs';

test('desktop opens offline with no ads and keeps its shared library across restarts', { timeout: 120000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url)), profile = path.join(root, '.test-output', `desktop-profile-${Date.now()}`); await mkdir(profile, { recursive: true });
  const environment = { ...process.env, VTT_MAP_MAKER_TEST: '1', VTT_MAP_MAKER_TEST_PROFILE: profile }; delete environment.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.TRIALS_TEST_EXECUTABLE || createRequire(import.meta.url)('electron'); let desktop;
  async function launch() {
    desktop = await _electron.launch({ executablePath, args: process.env.TRIALS_TEST_EXECUTABLE ? [] : [path.resolve(root)], env: environment, timeout: 45000 });
    const page = await desktop.firstWindow();
    await page.waitForFunction(count => document.querySelectorAll('.tile-button').length === count, defaultTileCount);
    assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    assert.equal(await page.locator('html').getAttribute('data-edition'), 'desktop'); assert.equal(await page.locator('#sponsor-slot').isVisible(), false); assert.equal(await page.locator('#pack-select option[value=kenney-tiny]').count(), 0);
    return page;
  }
  try {
    let page = await launch(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    assert.equal(await page.locator('#desktop-titlebar').isVisible(), true);
    assert.equal(await page.locator('.app-header .brand').isVisible(), false);
    assert.equal(await page.locator('#desktop-titlebar').evaluate(node => getComputedStyle(node).getPropertyValue('-webkit-app-region')), 'drag');
    assert.equal(await page.locator('#window-close').evaluate(node => getComputedStyle(node.parentNode).getPropertyValue('-webkit-app-region')), 'no-drag');
    // Exercise IPC without moving/showing the hidden test window on the user's desktop.
    await desktop.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; globalThis.windowCalls = []; globalThis.originalWindowActions = {}; for (const method of ['minimize', 'maximize', 'close']) { globalThis.originalWindowActions[method] = window[method]; window[method] = () => globalThis.windowCalls.push(method); } });
    await page.locator('#window-minimize').click(); await page.locator('#window-maximize').click(); await page.locator('#window-close').click();
    await page.waitForTimeout(100); assert.deepEqual(await desktop.evaluate(() => globalThis.windowCalls), ['minimize', 'maximize', 'close']);
    await desktop.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; for (const [method, original] of Object.entries(globalThis.originalWindowActions)) window[method] = original; window.webContents.send('trials:window-state', { maximized: true }); });
    await page.getByRole('button', { name: 'Restore window', exact: true }).waitFor();
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('trials:window-state', { maximized: false })); await page.getByRole('button', { name: 'Maximize window', exact: true }).waitFor();
    await desktop.evaluate(({ session }) => { session.fromPartition('persist:map-maker').webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true })); });
    const id = await createTileset(page, 'Desktop shared library');
    await page.locator('#new-map').click(); await page.locator('#new-form [name=name]').fill('Desktop second map'); await page.locator('#new-form button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#map-name').value === 'Desktop second map'); assert.equal(await page.locator(`#pack-select option[value="${id}"]`).count(), 1);
    await page.locator('#help').click(); assert.match(await page.locator('#help-dialog').textContent(), /Made by Lazarus/); assert.equal(await page.locator('#help-dialog #kenney-credit').count(), 0); await page.locator('#help-dialog').getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.locator('.support-link').getAttribute('href'), 'https://ko-fi.com/lazarus_');
    await page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Saved locally in this browser'); await desktop.close(); desktop = null;
    page = await launch(); await page.waitForFunction(() => document.querySelector('#map-name').value === 'Desktop second map'); assert.equal(await page.locator(`#pack-select option[value="${id}"]`).count(), 1);
    await page.screenshot({ path: path.join(root, '.test-output', 'desktop-edition.png') }); assert.deepEqual(errors, []);
    console.log('Hidden desktop smoke test passed: offline local scheme, ad-free edition and persistent shared library.');
  } finally { if (desktop) await desktop.close(); }
});
