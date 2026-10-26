import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Game} from './server/game.js';
import {createServer} from './server/http.js';
import {sampleRace} from './race-core.js';
const dir=await mkdtemp(path.join(os.tmpdir(),'horserace-manual-')),out='review/deployment/manual-local';await mkdir(out,{recursive:true});
let offset=0;const clock=()=>Date.now()+offset;let game=new Game(path.join(dir,'game.sqlite'),{clock,bettingMs:30000});
// The reserve fixture stays in this disposable local database.
const alice=game.register('ManualAlice','temporary-local-fixture').user,bobby=game.register('ManualBobby','temporary-local-fixture').user;
game.horse(bobby.id,'gordon');game.run('INSERT INTO player_upgrades VALUES(?,?,?)',bobby.id,'powerReserve',5);
let server=createServer(game,{site:path.resolve('site')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const errors=[],outside=[],pages=[],report={checks:[]};let restarting=false;
const proxy=http.createServer((req,res)=>{
 if(!req.url.startsWith('/horserace/')){outside.push(req.url);res.writeHead(404);res.end();return;}
 if(restarting){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"Local restart verification"}');return;}
 const u=http.request({host:'127.0.0.1',port:server.address().port,path:req.url.slice('/horserace'.length),method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});u.on('error',()=>{res.writeHead(503);res.end();});req.pipe(u);
});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${proxy.address().port}/horserace/`,browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function page(width,name){const context=await browser.newContext({viewport:{width,height:1000}}),p=await context.newPage();pages.push(p);p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/status of (400|409|503)|net::ERR_FAILED/.test(m.text()))errors.push(m.text());});await p.goto(url);await p.waitForFunction(()=>window.raceLab?.ready,null,{timeout:60000});await p.locator('#mp-username').fill(name);await p.locator('#mp-password').fill('temporary-local-fixture');await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.locator('#mp-name').filter({hasText:name}).waitFor();return p;}
async function api(p,route,body){return p.evaluate(async({route,body})=>{const r=await fetch(new URL(`.${route}`,document.baseURI),{method:body?'POST':'GET',headers:{Authorization:`Bearer ${localStorage.getItem('horserace-session-v1')}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};},{route,body});}
async function setElapsed(code,seconds){const race=game.latest(code);offset+=Math.max(clock(),race.starts+seconds*1000)-clock();game.tick();}
async function waitUse(p,actor,charge){await p.waitForFunction(({actor,charge})=>window.raceLab.race.events.some(e=>e.actor===actor&&e.charge===charge),{actor,charge});}
try{
 const a=await page(1280,'ManualAlice'),b=await page(390,'ManualBobby');
 await a.locator('#mp-create').click();await a.locator('#mp-room-name').waitFor();const code=(await a.locator('#mp-room-name').textContent()).split(' ')[1];
 await b.locator('#mp-code').fill(code);await b.getByRole('button',{name:'Join room',exact:true}).click();await b.locator('#mp-members').filter({hasText:'ManualAlice'}).waitFor();
 await a.locator('#mp-start').click();await a.locator('#race-betting-banner[data-state=open]').waitFor();
 assert.ok(await a.locator('#race-use-power').isDisabled());
 await setElapsed(code,1);await Promise.all(pages.map(p=>p.waitForFunction(()=>window.raceLab.race.live&&window.raceLab.multiplayer.frame.ready)));
 assert.ok(await a.locator('#race-use-power').isDisabled());
 const beforeGate=await api(a,`/api/rooms/${code}/power`,{raceId:game.latest(code).id,requestId:'before-gates-fixture'});assert.equal(beforeGate.status,409);
 await a.selectOption('#camera-mode','chase');await b.selectOption('#camera-mode','rail');
 for(const p of pages){const audio=await p.evaluate(()=>window.raceLab.audio);if(audio.muted||audio.state!=='running')await p.locator('#sound-toggle').click();await p.waitForFunction(()=>window.raceLab.audio.state==='running'&&!window.raceLab.audio.muted);}
 await setElapsed(code,10);await Promise.all(pages.map(p=>p.waitForFunction(()=>window.raceLab.time>=9&&document.querySelector('#race-use-power').disabled===false)));
 const before=await a.evaluate(()=>({render:window.raceLab.renderDiagnostics,assets:window.raceLab.assetCount,time:window.raceLab.time}));
 const publicRace=(await api(a,`/api/rooms/${code}`)).data.room.race.definition;
 assert.equal(publicRace.seed,'live');assert.deepEqual(publicRace.outcome,[]);assert.equal(publicRace.completed,false);
 for(const runner of publicRace.cast)for(const point of runner.progress)assert.ok(point.time<=publicRace.availableTime);
 for(const event of publicRace.events)assert.ok(event.time<=publicRace.availableTime);
 assert.equal(publicRace.events.filter(e=>e.actor==='elon'||e.actor==='gordon').length,0);
 report.checks.push('racing starts with no human automatic moves; gates reject activation; only confirmed history and no private seed or future outcome reach either browser');
 // Typing F must remain ordinary text entry.
 await a.evaluate(()=>{const input=document.createElement('input');input.id='shortcut-typing-fixture';document.body.append(input);input.focus();});await a.keyboard.press('f');assert.equal(game.powerUses(game.latest(code).id).length,0);await a.locator('#shortcut-typing-fixture').evaluate(el=>el.remove());
 let dropped=false,firstBody;
 await a.route('**/api/rooms/*/power',async route=>{if(dropped)return route.continue();dropped=true;firstBody=route.request().postDataJSON();await route.fetch();await route.abort('failed');});
 await a.locator('#viewport').click({position:{x:20,y:20}});await a.keyboard.press('f');
 await a.getByRole('button',{name:'Retry ability',exact:true}).waitFor();assert.equal(game.powerUses(game.latest(code).id).filter(e=>e.actor==='elon').length,1);
 await a.getByRole('button',{name:'Retry ability',exact:true}).click();await a.locator('#race-ability-status').filter({hasText:'All charges used'}).waitFor();
 assert.equal(game.powerUses(game.latest(code).id).filter(e=>e.actor==='elon').length,1);assert.ok(firstBody.requestId);
 await Promise.all(pages.map(p=>waitUse(p,'elon',1)));await a.waitForFunction(()=>window.raceLab.audio.events.some(e=>e.key==='rocket-launch'));
 const after=await a.evaluate(()=>({render:window.raceLab.renderDiagnostics,assets:window.raceLab.assetCount,camera:window.raceLab.cameraMode,time:window.raceLab.time,audio:window.raceLab.audio}));
 assert.equal(after.render.trackBuilds,before.render.trackBuilds);assert.deepEqual(after.render.actorInstances,before.render.actorInstances);assert.equal(after.assets,before.assets);assert.ok(after.render.liveUpdates>before.render.liveUpdates);assert.equal(after.camera,'chase');assert.ok(after.time>=before.time);assert.equal(after.audio.events.filter(e=>e.key==='rocket-launch').length,1);assert.equal(after.audio.horseVoices,7);
 report.checks.push('F activates after gate without intercepting typing; lost success response retries the same request without spending twice; shared launch plays exactly once; seven hoof voices and camera/models/track survive updates');
 await b.locator('#race-use-power').click();await b.locator('#race-ability-status').filter({hasText:'Recharging'}).waitFor();assert.ok(await b.locator('#race-use-power').isDisabled());await Promise.all(pages.map(p=>waitUse(p,'gordon',1)));
 const snapshots=await Promise.all(pages.map(p=>p.evaluate(()=>window.raceLab.race))),common=Math.min(...snapshots.map(d=>d.availableTime))-.15;
 assert.deepEqual(sampleRace(snapshots[0],common),sampleRace(snapshots[1],common));
 const uses=game.powerUses(game.latest(code).id).map(x=>({...x}));
 restarting=true;await new Promise(resolve=>server.close(resolve));game.close();game=new Game(path.join(dir,'game.sqlite'),{clock});server=createServer(game,{site:path.resolve('site')});await new Promise(r=>server.listen(0,'127.0.0.1',r));restarting=false;
 assert.deepEqual(game.powerUses(game.latest(code).id).map(x=>({...x})),uses);
 await setElapsed(code,22);await b.locator('#race-ability-status').filter({hasText:'Ready — choose your moment'}).waitFor();assert.match(await b.locator('#race-ability-status').textContent(),/1\/2 charges/);
 await b.locator('#race-use-power').click();await Promise.all(pages.map(p=>waitUse(p,'gordon',2)));assert.equal(game.powerUses(game.latest(code).id).filter(e=>e.actor==='gordon').length,2);
 await a.locator('#race-preview').screenshot({path:`${out}/desktop-live.png`});await b.locator('#race-preview').screenshot({path:`${out}/phone-live.png`});
 await b.reload();await b.locator('#mp-name').filter({hasText:'ManualBobby'}).waitFor();await b.locator('#race-ability-status').filter({hasText:/All charges used|Your horse has finished/}).waitFor();assert.match(await b.locator('#race-ability-status').textContent(),/0\/2 charges/);assert.ok(await b.locator('#race-use-power').isDisabled());
 await a.locator('#race-preview').screenshot({path:`${out}/desktop.png`});await b.locator('#race-preview').screenshot({path:`${out}/phone.png`});
 report.checks.push('phone tap activates leader attack; both clients agree at common confirmed time; cooldown and reserve second move persist through service restart and reload');
 await setElapsed(code,120);await Promise.all(pages.map(p=>p.locator('#mp-phase').filter({hasText:'prizes saved'}).waitFor()));
 const final=game.room(alice.id,code);assert.equal(final.race.definition.completed,true);assert.deepEqual(final.race.definition.outcome,final.race.results.map(e=>e.horse));assert.ok(await a.locator('#race-use-power').isDisabled());
 const saved=game.profile(alice.id);game.tick();assert.deepEqual(game.profile(alice.id),saved);
 for(const p of pages)assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 report.checks.push('actual crossings settle official result once; finished ability disabled; no browser errors, phone overflow or requests outside /horserace/');
 report.verifiedAt=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(report);
}catch(error){for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:`${out}/failure-${i}.png`,fullPage:true}).catch(()=>{});await writeFile(`${out}/failure-diagnostics.json`,JSON.stringify(await Promise.all(pages.map(p=>p.evaluate(()=>({time:window.raceLab.time,audio:window.raceLab.audio,frame:window.raceLab.multiplayer.frame,events:window.raceLab.race.events}))).map(p=>p.catch(()=>null))),null,2));console.error(errors);throw error;}
finally{await browser.close();await new Promise(r=>proxy.close(r));await new Promise(r=>server.close(r));game.close();await rm(dir,{recursive:true,force:true});}
