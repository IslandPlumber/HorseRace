/** Record actual browser playback of two different races using the same assets. */
import {chromium} from '@playwright/test';
import {mkdir,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root,'review');
await mkdir(out,{recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context = await browser.newContext({viewport:{width:1440,height:1100},
  recordVideo:{dir:path.join(root,'test-results'),size:{width:1440,height:1100}}});
const page = await context.newPage();
const report = [];
try {
  await page.goto('http://127.0.0.1:8768/race_lab/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.raceLab?.ready,null,{timeout:120000});
  for (const key of ['demo-a','demo-b']) {
    if (key==='demo-b') {
      await page.selectOption('#race-select',key);
      await page.waitForFunction(()=>window.raceLab?.ready && window.raceLab.race.cast.length===5);
    }
    const definition = await page.evaluate(()=>window.raceLab.race);
    await page.waitForTimeout(1000);
    if(key==='demo-a')await page.click('#speed'); // record full races at 2x
    await page.click('#play');
    await page.waitForFunction(()=>window.raceLab.state==='finished',null,{timeout:120000});
    const standings = await page.locator('#standings li').evaluateAll(nodes=>nodes.map(n=>n.dataset.rider));
    assert.deepEqual(standings,definition.outcome);
    await page.waitForTimeout(1500);
    report.push({id:definition.id,title:definition.title,cast:definition.cast.map(r=>r.id),
      duration:definition.duration,length:definition.track.length,outcome:standings});
  }
  await page.screenshot({path:path.join(out,'finish.png'),fullPage:true});
  const video = page.video();
  await context.close();
  await video.saveAs(path.join(out,'race-system-demo.webm'));
  await writeFile(path.join(out,'recorded-races.json'),JSON.stringify({recorded_at_utc:new Date().toISOString(),races:report},null,2)+'\n');
  console.log('Two actual browser races recorded; finishing orders verified.');
} finally {
  await browser.close();
}
