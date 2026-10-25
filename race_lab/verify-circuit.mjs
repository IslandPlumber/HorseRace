import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const out=new URL('./review/circuit/',import.meta.url);await mkdir(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
// Chromium does not inherit this workspace's custom CA store. For live checks,
// fetch each actual HTTPS resource with curl's configured CA/proxy, then render
// those verified bytes in Chromium. TLS verification remains enabled.
if(process.env.VERIFIED_HTTPS_PROXY==='1')await page.route('https://islandplumber.github.io/**',async route=>{
 const {stdout}=await promisify(execFile)('curl',['-fsSL','--max-time','60',route.request().url()],{encoding:'buffer',maxBuffer:10*1024*1024});
 const pathname=new URL(route.request().url()).pathname;
 const contentType=pathname.endsWith('.js')?'application/javascript':pathname.endsWith('.css')?'text/css':pathname.endsWith('.json')?'application/json':pathname.endsWith('.glb')?'model/gltf-binary':'text/html';
 await route.fulfill({status:200,contentType,body:stdout});
});

try{
 await page.goto(process.env.RACE_LAB_URL||'http://127.0.0.1:8768/race_lab/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.raceLab?.ready,null,{timeout:120000});
 assert.equal(await page.evaluate(()=>window.raceLab.race.track.type),'circuit');assert.equal(await page.evaluate(()=>window.raceLab.actorCount),7);
 await page.evaluate(()=>window.raceLab.seek(1));assert.equal(await page.locator('#gate-count').textContent(),'♫');assert.equal(await page.evaluate(()=>window.raceLab.gateOpen),false);await page.screenshot({path:new URL('gates.png',out).pathname});
 await page.evaluate(()=>window.raceLab.seek(window.raceLab.race.startDelay+1));assert.equal(await page.evaluate(()=>window.raceLab.gateOpen),true);
 const track=await page.evaluate(()=>window.raceLab.race.track);const turnStates=[];
 for(const [label,fraction] of [['turn1',.065],['turn2',.24],['turn3',.59],['turn4',.77],['home',.92]]){
 const t=await page.evaluate(f=>{const r=window.raceLab.race;const runner=r.cast[0];const target=r.track.length*f;for(let i=1;i<runner.progress.length;i++){const a=runner.progress[i-1],b=runner.progress[i];if(target<=b.distance)return a.time+(target-a.distance)/(b.distance-a.distance)*(b.time-a.time);}},fraction);
 await page.evaluate(t=>window.raceLab.seek(t),t);await page.screenshot({path:new URL(label+'.png',out).pathname});turnStates.push({label,time:t,shot:await page.evaluate(()=>window.raceLab.shot)});
 }
 const before=await page.evaluate(()=>window.raceLab.viewDiagnostics);await page.waitForTimeout(400);const after=await page.evaluate(()=>window.raceLab.viewDiagnostics);
 for(let i=0;i<before.length;i++){assert.ok(after[i].headHeight>2.5,`upright head: ${after[i].id}`);assert.ok(Math.max(...before[i].puppet.map((v,k)=>Math.abs(v-after[i].puppet[k])))<1e-4,'paused pose must not accumulate billboard rotation');}
 const time=await page.evaluate(()=>window.raceLab.time);
 for(const mode of ['broadcast','rail','chase','aerial','auto']){await page.selectOption('#camera-mode',mode);assert.equal(await page.evaluate(()=>window.raceLab.time),time);if(mode==='aerial')await page.screenshot({path:new URL('whole-course.png',out).pathname});}
 await page.evaluate(()=>window.raceLab.seek(window.raceLab.race.duration));assert.equal(await page.locator('#winner').textContent(),'Elon Musk wins');
 await page.click('#restart');assert.equal(await page.evaluate(()=>window.raceLab.time),0);assert.equal(await page.evaluate(()=>window.raceLab.gateOpen),false);
 await page.selectOption('#race-select','demo-b');await page.waitForFunction(()=>window.raceLab?.ready&&window.raceLab.race.duration===72);await page.evaluate(()=>window.raceLab.seek(window.raceLab.race.duration));assert.equal(await page.locator('#winner').textContent(),'Snoop Dogg wins');
 await page.setViewportSize({width:390,height:844});await page.click('#restart');await page.selectOption('#camera-mode','aerial');await page.screenshot({path:new URL('mobile.png',out).pathname,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);await writeFile(new URL('browser-validation.json',out),JSON.stringify({passed:true,url:page.url(),checked_at_utc:new Date().toISOString(),transport:process.env.VERIFIED_HTTPS_PROXY==='1'?'Live HTTPS fetched with curl and configured CA; Chromium rendering':'Browser network',turnStates,checks:['gate countdown/open/restart','five manual camera modes without time changes','automatic director','both circuit winners','mobile layout','no page exceptions']},null,2));console.log('Circuit browser checks passed');
}finally{await browser.close();}
