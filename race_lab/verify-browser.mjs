/** Functional checks against the served app and its offline build. */
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {sampleRace} from './race-core.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const evidence = path.join(root,'review');
await mkdir(evidence,{recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const checks = [];
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  const assetRequests = [];
  page.on('request',request=>{if (/\/assets\/.+\.glb/.test(request.url())) assetRequests.push(request.url());});
  await page.goto(process.env.RACE_LAB_URL || 'http://127.0.0.1:8768/race_lab/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.raceLab?.ready,null,{timeout:120000});
  assert.equal(await page.evaluate(()=>window.raceLab.actorCount),7);
  assert.equal(await page.evaluate(()=>window.raceLab.assetCount),7);
  assert.equal(assetRequests.length,7);
  const a = await page.evaluate(()=>window.raceLab.race);
  await page.evaluate(()=>window.raceLab.seek(window.raceLab.race.duration*.18));
  const early = await page.locator('#standings li').first().getAttribute('data-rider');
  await page.evaluate(()=>window.raceLab.seek(window.raceLab.race.duration*.62));
  const late = await page.locator('#standings li').first().getAttribute('data-rider');
  assert.notEqual(early,late);
  await page.screenshot({path:path.join(evidence,'race-a.png')});
  await page.evaluate(()=>window.raceLab.seek(window.raceLab.race.duration));
  assert.deepEqual(await page.locator('#standings li').evaluateAll(items=>items.map(x=>x.dataset.rider)),a.outcome);
  assert.equal(await page.locator('#result').isVisible(),true);
  await page.locator('#restart').click();
  assert.equal(await page.evaluate(()=>window.raceLab.time),0);
  assert.equal(await page.locator('#result').isHidden(),true);
  await page.locator('#play').click();
  await page.waitForFunction(()=>window.raceLab.time>.25,{timeout:15000});
  await page.locator('#play').click();
  const paused = await page.evaluate(()=>window.raceLab.time);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>window.raceLab.time),paused);
  checks.push('Race A: all seven actual models loaded, overtake, scripted crossing order, restart, play and pause');

  await page.selectOption('#race-select','demo-b');
  await page.waitForFunction(()=>window.raceLab?.ready && window.raceLab.race.cast.length===5);
  const b = await page.evaluate(()=>window.raceLab.race);
  assert.notEqual(a.track.length,b.track.length);
  assert.equal(assetRequests.length,7,'Switching races must reuse cached models');
  await page.evaluate(()=>window.raceLab.seek(window.raceLab.race.duration));
  assert.deepEqual(await page.locator('#standings li').evaluateAll(items=>items.map(x=>x.dataset.rider)),b.outcome);
  assert.notEqual(a.outcome[0],b.outcome[0]);
  await page.screenshot({path:path.join(evidence,'race-b.png')});
  checks.push('Race B: different cast, track length and winner; no GLB downloads repeated');

  await page.fill('#seed','12345');
  await page.click('#generate');
  await page.waitForFunction(()=>window.raceLab?.ready && window.raceLab.race.seed===12345);
  const generated = await page.evaluate(()=>window.raceLab.race);
  await page.fill('#seed','12345');
  await page.click('#generate');
  await page.waitForFunction(()=>window.raceLab?.ready && window.raceLab.race.seed===12345);
  assert.deepEqual(await page.evaluate(()=>window.raceLab.race),generated);
  assert.deepEqual(sampleRace(generated,generated.duration).standings,generated.outcome);
  await page.fill('#seed','12346');
  await page.click('#generate');
  await page.waitForFunction(()=>window.raceLab?.ready && window.raceLab.race.seed===12346);
  assert.notDeepEqual(await page.evaluate(()=>window.raceLab.race),generated);
  const downloadPromise = page.waitForEvent('download');
  await page.click('#download');
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(exported.seed,12346);
  await page.locator('#import-file').setInputFiles({name:'bad-race.json',mimeType:'application/json',buffer:Buffer.from('{"version":99}')});
  await page.waitForFunction(()=>!document.getElementById('error').hidden);
  assert.match(await page.locator('#error').textContent(),/Invalid race/);
  await page.locator('#import-file').setInputFiles({name:'saved-race.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(generated))});
  await page.waitForFunction(()=>window.raceLab?.ready && window.raceLab.race.seed===12345);
  assert.equal(await page.locator('#error').isHidden(),true);
  checks.push('Seeded generation repeats exactly; different seed changes race; export/import round trip; invalid JSON definition rejected');
  assert.deepEqual(errors,[]);
  await page.close();

  const mobile = await browser.newPage({viewport:{width:390,height:844}});
  await mobile.goto('http://127.0.0.1:8768/race_lab/',{waitUntil:'domcontentloaded'});
  await mobile.waitForFunction(()=>window.raceLab?.ready,null,{timeout:120000});
  assert.equal(await mobile.evaluate(()=>window.raceLab.actorCount),7);
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mobile.evaluate(()=>window.raceLab.seek(6));
  await mobile.screenshot({path:path.join(evidence,'mobile.png'),fullPage:true});
  await mobile.close();
  checks.push('Mobile 390px layout: seven loaded actors, working scrub and no horizontal overflow');

  const offline = await browser.newPage({viewport:{width:1440,height:1000}});
  const remoteRequests = [],offlineErrors = [];
  offline.on('request',request=>{if (/^https?:/.test(request.url())) remoteRequests.push(request.url());});
  offline.on('pageerror',error=>offlineErrors.push(error.message));
  const standaloneURL = process.env.RACE_LAB_STANDALONE_URL || 'http://127.0.0.1:8768/race_lab/standalone.html';
  await offline.goto(standaloneURL,{waitUntil:'domcontentloaded'});
  await offline.waitForFunction(()=>window.raceLab?.ready,null,{timeout:120000});
  assert.equal(await offline.evaluate(()=>window.raceLab.actorCount),7);
  // The managed browser blocks file:// navigation. Test the same complete HTML
  // over local HTTP, then disable networking before changing race definitions.
  await offline.context().setOffline(true);
  await offline.selectOption('#race-select','demo-b');
  await offline.waitForFunction(()=>window.raceLab?.ready && window.raceLab.race.cast.length===5);
  await offline.evaluate(()=>window.raceLab.seek(window.raceLab.race.duration));
  assert.equal(await offline.locator('#winner').textContent(),'Snoop Dogg wins');
  assert.deepEqual(remoteRequests,[standaloneURL]);
  assert.deepEqual(offlineErrors,[]);
  checks.push('Standalone HTML needs only its initial document request; switching races and finishing works with networking disabled');
  await offline.close();
  await writeFile(path.join(evidence,'browser-validation.json'),JSON.stringify({checked_at_utc:new Date().toISOString(),checks,asset_fetches:assetRequests.length,passed:true},null,2)+'\n');
  console.log(JSON.stringify({passed:true,checks},null,2));
} finally {
  await browser.close();
}
