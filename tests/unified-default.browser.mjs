import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { createMap, placement } from '../src/model.js';

test('one default palette has exact terrain categories, a linked 2×2 tree, migrated order and preserved old quarters', {timeout:120000},async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:'4199'},windowsHide:true,stdio:['ignore','pipe','pipe']});let browser;
  try{
    await once(server.stdout,'data');browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:4199');await page.waitForSelector('.tile-button');
    assert.deepEqual(await page.locator('#pack-select option').allTextContents(),['All tilesets','Default Tiles']);assert.equal(await page.locator('.tile-button').count(),86);
    const tree=page.locator('.tile-button[data-tile="default-tiles-2:tree"]');assert.equal(await tree.count(),1);for(const id of [24,25,31,32])assert.equal(await page.locator(`.tile-button[data-tile="default-tiles-2:${id}"]`).count(),0);
    for(const [category,count]of[['Floors',40],['Walls',25],['Props',21]]){await page.locator('#categories').getByRole('button',{name:category,exact:true}).click();assert.equal(await page.locator('.tile-button').count(),count);if(category==='Props')assert.equal(await tree.count(),1);}
    // Seed earlier separate-palette preferences to exercise the real reload migration.
    await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('vtt-map-maker',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('library','readwrite'),store=tx.objectStore('library'),r=store.get('shared');r.onsuccess=()=>{const value=r.result;value.tileOrders={'default-tiles':['default-tiles:2'],'default-tiles-2':['default-tiles-2:25','default-tiles-2:13','default-tiles-2:24']};store.put(value,'shared');};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();});
    await page.reload();await page.waitForSelector('.tile-button');assert.deepEqual(await page.locator('.tile-button').evaluateAll(nodes=>nodes.slice(0,3).map(n=>n.dataset.tile)),['default-tiles:2','default-tiles-2:tree','default-tiles-2:13']);
    const fixture=createMap(8,8,'Unified default');fixture.layers[0].cells[0]=placement('default-tiles-2:24');await page.locator('#map-file').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.waitForFunction(()=>document.querySelector('#map-name').value==='Unified default');await page.locator('#fit-map').click();await tree.click();
    const b=await page.locator('#map-canvas').boundingBox(),px=Math.min(128,(b.width-96)/8,(b.height-170)/8),x=b.x+(b.width-8*px)/2,y=b.y+40+(b.height-170-8*px)/2;await page.mouse.click(x+2.5*px,y+2.5*px);
    const download=page.waitForEvent('download');await page.locator('#save-map').click();const saved=JSON.parse(await readFile(await(await download).path(),'utf8'));assert.deepEqual(saved.layers[0].cells[0],fixture.layers[0].cells[0]);assert.equal(saved.layers[0].cells.filter(cell=>cell?.tile==='default-tiles-2:tree').length,4);
    await page.locator('#export-map').click();await page.locator('#export-size').fill('16');await page.locator('#export-grid').uncheck();await page.locator('#export-transparent').check();const pngEvent=page.waitForEvent('download');await page.locator('#export-submit').click();const png=PNG.sync.read(await readFile(await(await pngEvent).path())),source=PNG.sync.read(await readFile(root+'assets/defaults/default-tiles-2.png'));
    for(let sy=0;sy<32;sy++)for(let sx=0;sx<32;sx++){const a=((32+sy)*png.width+32+sx)*4,c=((48+sy)*source.width+48+sx)*4;if(!source.data[c+3])assert.equal(png.data[a+3],0);else assert.deepEqual([...png.data.subarray(a,a+4)],[...source.data.subarray(c,c+4)]);}
    await page.getByRole('button',{name:'Erase',exact:true}).click();await page.mouse.click(x+3.5*px,y+3.5*px);await page.locator('#undo').click();assert.equal(await page.locator('#pack-select option[value=default-tiles-2]').count(),0);
    await mkdir(root+'.test-output',{recursive:true});await page.screenshot({path:root+'.test-output/unified-default.png'});assert.deepEqual(errors,[]);
  }finally{if(browser)await browser.close();server.kill();}
});
