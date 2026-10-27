import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Game} from './server/game.js';
import {createServer} from './server/http.js';
const dir=await mkdtemp(path.join(os.tmpdir(),'horserace-refine-')),out='review/deployment/refinements-local';await mkdir(out,{recursive:true});
const game=new Game(path.join(dir,'game.sqlite'),{bettingMs:3000,duration:20});
const server=createServer(game,{site:path.resolve('site')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const proxy=http.createServer((req,res)=>{if(!req.url.startsWith('/horserace/')){res.writeHead(404);res.end();return;}const u=http.request({host:'127.0.0.1',port:server.address().port,path:req.url.slice('/horserace'.length),method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});u.on('error',()=>res.end());req.pipe(u)});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${proxy.address().port}/horserace/`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),errors=[],contexts=[];
async function page(width){const context=await browser.newContext({viewport:{width,height:1000}});contexts.push(context);const p=await context.newPage();p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await p.goto(url);await p.waitForFunction(()=>window.raceLab?.ready&&document.querySelector('#mp-auth'),null,{timeout:60000});return p;}
async function register(p,name){await p.locator('#mp-username').fill(name);await p.locator('#mp-password').fill('local-test-password');await p.getByRole('button',{name:'Create account',exact:true}).click();await p.locator('#mp-name').filter({hasText:name}).waitFor();}
async function create(p){await p.locator('#mp-create').click();await p.locator('#mp-room-name').waitFor();return(await p.locator('#mp-room-name').textContent()).split(' ')[1];}
const report={checks:[],audio:[],render:[]};
try{
 const a=await page(1280),b=await page(390);await register(a,'Alpha');const first=await create(a);
 await register(b,'Bravo');const second=await create(b);
 const room=a.locator(`.room-card[data-room-code="${second}"]`);await room.waitFor({timeout:12000});
 assert.ok(await a.locator('#mp-room-name').textContent().then(t=>t.includes(first)));
 assert.ok(await a.locator('#mp-room-directory').isVisible());
 const picker=room.locator('select');assert.notEqual(await picker.inputValue(),'elon','occupied rider is not offered by default');await picker.selectOption('snoop');
 await room.getByRole('button',{name:`Join room ${second}`,exact:true}).click();
 await a.locator('#mp-room-name').filter({hasText:second}).waitFor();await b.locator('#mp-members').filter({hasText:'Alpha'}).waitFor();
 assert.equal(game.profile(game.one("SELECT id FROM users WHERE username='Alpha'").id).horse,'snoop');
 report.checks.push('room stays discoverable while in another room; occupied horse handled before atomic switch');
 await b.locator('#mp-start').click();
 const carol=game.register('Carol','local-test-password'),third=game.create(carol.user.id);
 const other=a.locator(`.room-card[data-room-code="${third}"]`);await other.waitFor({timeout:12000});
 assert.ok(await other.locator('button').isDisabled());assert.ok(await a.locator('#mp-switch-note').isVisible());
 await a.waitForFunction(()=>window.raceLab?.multiplayer.managed&&window.raceLab.renderDiagnostics.ownMarker);
 assert.ok(await a.evaluate(()=>window.raceLab.renderDiagnostics.ownMarker));
 report.checks.push('new online room appears automatically during a race; switching safely locked; own horse marked');
 await a.locator('#multiplayer').screenshot({path:`${out}/room-browser-desktop.png`});await b.locator('#multiplayer').screenshot({path:`${out}/room-browser-mobile.png`});
 for(const p of[a,b])assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await contexts[0].close();await contexts[1].close();
 const p=await page(1280);const base=await p.evaluate(()=>window.raceLab.race);
 for(const count of[1,4,7]){
  const race=structuredClone(base),ids=new Set(race.cast.slice(0,count).map(r=>r.id));race.id='audio-field-'+count;race.title=count+' horse audio check';race.cast=race.cast.slice(0,count).map((r,i)=>({...r,lane:i}));race.outcome=race.outcome.filter(id=>ids.has(id));
  await p.evaluate(def=>window.raceLab.loadRace(def),race);await p.evaluate(()=>window.raceLab.seek(30));await p.selectOption('#camera-mode','rail');
  await p.locator('#crowd-volume').evaluate(el=>{el.value=0;el.dispatchEvent(new Event('input',{bubbles:true}))});
  await p.locator('#play').click();await p.waitForFunction(n=>window.raceLab.audio.horseVoices===n&&window.raceLab.audio.playing,count);
  const audio=await p.evaluate(()=>window.raceLab.audio);assert.equal(audio.hoofRiders,count);assert.ok(audio.activeSources<count*15+20);
  const bytes=await p.evaluate(async()=>{const chunks=[],rec=new MediaRecorder(window.raceLab.captureAudio(),{mimeType:'audio/webm;codecs=opus'});rec.ondataavailable=e=>chunks.push(e.data);rec.start();await new Promise(r=>setTimeout(r,1300));await new Promise(r=>{rec.onstop=r;rec.stop()});return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))});
  await writeFile(`${out}/hooves-${count}.webm`,Buffer.from(bytes));report.audio.push({count,diagnostics:audio});
  await p.locator('#play').click();assert.equal(await p.evaluate(()=>window.raceLab.audio.activeSources),0);
 }
 report.checks.push('one, four and seven individually synchronized hoof voices; late enable, pause and bounded scheduling');
 await p.selectOption('#camera-mode','aerial');await p.locator('#viewport').screenshot({path:`${out}/park-overview.png`});report.render.push(await p.evaluate(()=>window.raceLab.renderDiagnostics));
 await p.selectOption('#camera-mode','rail');await p.locator('#viewport').screenshot({path:`${out}/park-trackside.png`});report.render.push(await p.evaluate(()=>window.raceLab.renderDiagnostics));
 await p.locator('#hoof-volume').evaluate(el=>{el.value=25;el.dispatchEvent(new Event('input',{bubbles:true}))});assert.equal(await p.evaluate(()=>window.raceLab.audio.hoofVolume),.25);
 await p.reload();await p.waitForFunction(()=>window.raceLab?.ready);assert.equal(await p.evaluate(()=>window.raceLab.audio.hoofVolume),.25);
 assert.deepEqual(errors,[]);report.checks.push('independent hoof level persists; scenery renders; no page or resource errors');
 report.verifiedAt=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log('Room discovery, safe switching, individual hoof audio and park scenery verified.');
}catch(error){for(let i=0;i<contexts.length;i++)for(const p of contexts[i].pages())await p.screenshot({path:`${out}/failure-${i}.png`,fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();await new Promise(r=>proxy.close(r));await new Promise(r=>server.close(r));game.close();await rm(dir,{recursive:true,force:true});}
