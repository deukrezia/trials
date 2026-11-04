import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createMap } from '../src/model.js';
import { closeTilesets, createTileset, openTileImport } from './tileset-ui.mjs';

test('group a 3×3 source asset, place/export at 48px, edit atomically, reorder groups and size centered shapes', {timeout:120000}, async () => {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:'4197'},windowsHide:true,stdio:['ignore','pipe','pipe']}); let browser;
  try {
    await once(server.stdout,'data'); browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}), errors=[];
    page.on('pageerror',e=>errors.push(e.message)); await page.goto('http://127.0.0.1:4197'); await page.waitForSelector('.tile-button');
    const map=createMap(10,10,'Large tree'); await page.locator('#map-file').setInputFiles({name:'tree.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(map))}); await page.waitForFunction(()=>document.querySelector('#map-name').value==='Large tree');
    assert.equal(await page.title(),'Trials - Large tree');
    const id=await createTileset(page,'Trees'); await openTileImport(page);
    const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=48; const ctx=c.getContext('2d'); for(let y=0;y<3;y++) for(let x=0;x<4;x++){ctx.fillStyle=`rgb(${40+x*50},${40+y*70},80)`;ctx.fillRect(x*16,y*16,16,16);}return c.toDataURL();});
    await page.locator('#tile-files').setInputFiles({name:'tree16.png',mimeType:'image/png',buffer:Buffer.from(data.split(',')[1],'base64')});
    await page.waitForFunction(()=>document.querySelector('#import-status').textContent.startsWith('12 tile brushes'));
    const b=await page.locator('#sheet-preview').boundingBox();
    await page.mouse.move(b.x+b.width/8,b.y+b.height/6); await page.mouse.down(); await page.mouse.move(b.x+b.width*5/8,b.y+b.height*5/6,{steps:10}); await page.mouse.up();
    await page.waitForFunction(()=>document.querySelector('#import-status').textContent.startsWith('4 tile brushes'));
    await mkdir(root+'.test-output',{recursive:true}); await page.screenshot({path:root+'.test-output/large-tile-import.png'});
    await page.locator('#import-form button[type=submit]').click(); await page.waitForFunction(()=>!document.querySelector('#import-dialog').open); await closeTilesets(page);
    async function saved(){const download=page.waitForEvent('download');await page.locator('#save-map').click();return JSON.parse(await readFile(await(await download).path(),'utf8'));}
    let value=await saved(), tree=value.packs.find(p=>p.id===id).tiles[0]; assert.deepEqual(tree.rect,[0,0,48,48]); assert.deepEqual(tree.footprint,[3,3]);
    const paletteIds=()=>page.locator('.tile-button').evaluateAll(nodes=>nodes.map(n=>n.dataset.tile));
    const tile=tileId=>page.locator(`.tile-button[data-tile="${tileId}"]`), original=await paletteIds();
    await tile(original[0]).click({modifiers:['Control']}); await tile(original[1]).click({modifiers:['Control']}); assert.equal(await page.locator('.tile-button.organizing').count(),2);
    await tile(original[0]).dragTo(tile(original[3]),{targetPosition:{x:65,y:30}}); assert.deepEqual(await paletteIds(),[original[2],original[3],original[0],original[1]]);
    await tile(tree.id).click();
    async function cell(x,y){const b=await page.locator('#map-canvas').boundingBox(),px=Math.min(128,(b.width-96)/10,(b.height-170)/10);return [b.x+(b.width-10*px)/2+(x+.5)*px,b.y+40+(b.height-170-10*px)/2+(y+.5)*px];}
    await page.locator('#fit-map').click(); await page.mouse.click(...await cell(2,2)); value=await saved(); assert.equal(value.layers[0].cells.filter(Boolean).length,9);
    await page.mouse.click(...await cell(9,9)); assert.equal((await saved()).layers[0].cells.filter(Boolean).length,9);
    await page.locator('#export-map').click(); await page.locator('#export-size').fill('16'); await page.locator('#export-grid').uncheck();
    const download=page.waitForEvent('download');await page.locator('#export-submit').click();const bytes=await readFile(await(await download).path());
    const pixels=await page.evaluate(async bytes=>{const image=await createImageBitmap(new Blob([new Uint8Array(bytes)])),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return [[33,33],[49,33],[65,65]].map(([x,y])=>[...ctx.getImageData(x,y,1,1).data]);},[...bytes]);
    assert.deepEqual(pixels,[[40,40,80,255],[90,40,80,255],[140,180,80,255]]);
    await page.getByRole('button',{name:'Select',exact:true}).click();await page.mouse.click(...await cell(3,3));await page.locator('#viewport').focus();await page.keyboard.press('ArrowRight');value=await saved();assert.ok(value.layers[0].cells[2*10+3]);assert.equal(value.layers[0].cells[2*10+2],null);
    await page.getByRole('button',{name:'Erase',exact:true}).click();await page.mouse.click(...await cell(4,3));assert.equal((await saved()).layers[0].cells.filter(Boolean).length,0);await page.locator('#undo').click();assert.equal((await saved()).layers[0].cells.filter(Boolean).length,9);
    await page.locator('#pack-select').selectOption('default-tiles');await page.locator('.tile-button').first().click();await page.getByRole('button',{name:'Shape',exact:true}).click();
    const before=await saved();await page.mouse.click(...await cell(6,6),{button:'right'});assert.equal(await page.locator('#shape-size-dialog').isVisible(),true);await page.locator('#shape-width').fill('5');await page.locator('#shape-height').fill('3');
    await page.screenshot({path:root+'.test-output/centered-shape.png'});await page.locator('#shape-size-dialog').getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual((await saved()).layers,before.layers);
    await page.mouse.click(...await cell(6,6),{button:'right'});assert.equal(await page.locator('#shape-width').inputValue(),'5');await page.locator('#shape-size-form button[type=submit]').click();value=await saved();for(let y=5;y<=7;y++)for(let x=4;x<=8;x++)assert.ok(value.layers[0].cells[y*10+x]);assert.equal(value.layers[0].cells[5*10+3],null);await page.locator('#undo').click();assert.deepEqual((await saved()).layers,before.layers);
    await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved locally in this browser');await page.reload();await page.waitForFunction(()=>document.querySelector('#map-name').value==='Large tree');await page.locator('#pack-select').selectOption(id);assert.deepEqual(await paletteIds(),[original[2],original[3],original[0],original[1]]);assert.deepEqual((await saved()).layers,before.layers);
    assert.deepEqual(errors,[]);
  } finally {if(browser) await browser.close();server.kill();}
});
