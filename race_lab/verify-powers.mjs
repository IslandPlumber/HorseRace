import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Game} from './server/game.js';
import {createServer} from './server/http.js';
import {simulateRace,publicLiveRace} from './server/race-simulation.js';
import {ACTOR_IDS,sampleRace} from './race-core.js';
import {POWERS,powerEvents} from './powers.js';
import {BET_TYPES,ticketReturn} from './betting.js';
const dir=await mkdtemp(path.join(os.tmpdir(),'horserace-powers-')),out='review/deployment/powers-local';
await mkdir(out,{recursive:true});let now=Date.now();
const game=new Game(path.join(dir,'game.sqlite'),{clock:()=>now,bettingMs:30000});
function advance(milliseconds){assert.ok(milliseconds>=0,'fixture time advances monotonically');now+=milliseconds;game.tick();}
function advanceTo(code,seconds){const target=game.latest(code).starts+seconds*1000;advance(Math.max(0,target-now));}
const server=createServer(game,{site:path.resolve('site')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const outside=[],errors=[],pages=[],report={checks:[]};
const proxy=http.createServer((req,res)=>{
 if(!req.url.startsWith('/horserace/')){outside.push(req.url);res.writeHead(404);res.end();return;}
 const u=http.request({host:'127.0.0.1',port:server.address().port,path:req.url.slice('/horserace'.length),method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});u.on('error',()=>res.end());req.pipe(u);
});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${proxy.address().port}/horserace/`;
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function page(width){const c=await browser.newContext({viewport:{width,height:1000}}),p=await c.newPage();pages.push(p);p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await p.goto(url);await p.waitForFunction(()=>window.raceLab?.ready&&document.querySelector('#mp-auth'),null,{timeout:60000});return p;}
async function auth(p,name){await p.locator('#mp-username').fill(name);await p.locator('#mp-password').fill('temporary-local-fixture');await p.getByRole('button',{name:'Create account',exact:true}).click();await p.locator('#mp-name').filter({hasText:name}).waitFor();}
try{
 const a=await page(1280),b=await page(390);await auth(a,'PowerAlice');await auth(b,'PowerBobby');
 await a.waitForFunction(()=>window.raceLab.audio.powerClips===12);
 await a.locator('#power-volume').evaluate(el=>{el.value=70;el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await a.evaluate(()=>window.raceLab.audio.powerVolume),.7);
 assert.match(await a.locator('#mp-power-name').textContent(),/Rocket/);
 await b.selectOption('#mp-horse','trump');await b.getByRole('button',{name:'Save choice',exact:true}).click();
 await b.locator('#mp-power-name').filter({hasText:'Hat Trick'}).waitFor();
 await a.locator('.signature-card summary').click();assert.equal(await a.locator('.signature-card details p').count(),7);
 await a.locator('#multiplayer').screenshot({path:`${out}/stable-desktop.png`});await b.locator('#multiplayer').screenshot({path:`${out}/stable-mobile.png`});
 report.checks.push('saved rider selection shows their power; all seven descriptions, manual player timing and automatic CPU use explained');
 await a.locator('#mp-create').click();await a.locator('#mp-room-name').waitFor();const code=(await a.locator('#mp-room-name').textContent()).split(' ')[1];
 await b.locator('#mp-code').fill(code);await b.getByRole('button',{name:'Join room',exact:true}).click();await b.locator('#mp-members').filter({hasText:'PowerAlice'}).waitFor();
 await a.locator('#mp-start').click();await a.locator('#race-betting-banner[data-state=open]').waitFor();
 for(const p of[a,b]){await p.selectOption('#mp-bet-kind','show');await p.getByRole('button',{name:'Place bet',exact:true}).click();await p.locator('#mp-bet-note [data-bet-kind=show]').waitFor();}
 assert.equal(game.latest(code).definition,null);advance(31000);
 await Promise.all([a,b].map(p=>p.waitForFunction(()=>window.raceLab.race.simulation?.powers&&window.raceLab.multiplayer.managed)));
 let race=JSON.parse(game.latest(code).definition);
 assert.equal(powerEvents(race).length,5,'only the five CPU riders cast automatically');
 assert.ok(powerEvents(race).every(e=>!['elon','trump'].includes(e.actor)));
 for(const p of [a,b]) {
  const live=await p.evaluate(()=>window.raceLab.race);
  assert.equal(live.live,true);assert.equal(live.seed,'live');assert.deepEqual(live.outcome,[]);
 }
 advanceTo(code,10);
 for(const [p,actor] of [[a,'elon'],[b,'trump']]) {
  await p.waitForFunction(()=>document.querySelector('#race-use-power')?.disabled===false);
  await p.locator('#race-use-power').click();
  // The server schedules the move on the next physical step. Confirm the
  // accepted request first, then explicitly advance this disposable clock.
  await p.locator('#race-ability-status').filter({hasText:'All charges used'}).waitFor();
  advance(250);
  await p.waitForFunction(actor=>window.raceLab.race.events.some(e=>e.actor===actor),actor);
 }
 await Promise.all([a,b].map(p=>p.waitForFunction(()=>['elon','trump'].every(id=>window.raceLab.race.events.some(e=>e.actor===id)))));
 race=JSON.parse(game.latest(code).definition);
 assert.equal(game.powerUses(race.id).length,2);assert.equal(powerEvents(race).length,7);
 const snapshots=await Promise.all([a,b].map(p=>p.evaluate(()=>window.raceLab.race)));
 const common=Math.min(...snapshots.map(r=>r.availableTime));
 assert.deepEqual(sampleRace(snapshots[0],common),sampleRace(snapshots[1],common));
 for(const snapshot of snapshots)assert.deepEqual(snapshot,publicLiveRace(race,snapshot.availableTime,{id:race.id,revision:2}));
 // Jump to a later CPU cast after both player requests are confirmed. The
 // deterministic imported fixtures below still inspect every exact impact.
 const first=powerEvents(race).filter(e=>!['elon','trump'].includes(e.actor)).toSorted((a,b)=>a.time-b.time)[0];
 advanceTo(code,first.time+.7);
 await Promise.all([a,b].map(p=>p.waitForFunction(id=>window.raceLab.race.events.some(e=>e.actor===id&&e.time<=window.raceLab.time),first.actor)));
 for(const p of[a,b]){assert.ok(await p.locator('#power-feed').isVisible());assert.match(await p.locator('#power-feed').textContent(),new RegExp(POWERS[first.actor].name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));}
 await a.locator('#race-preview').screenshot({path:`${out}/live-power.png`});
 await b.reload();await b.locator('#mp-name').filter({hasText:'PowerBobby'}).waitFor();
 await b.waitForFunction(id=>window.raceLab?.ready&&window.raceLab.race.id===id,race.id);
 assert.equal(await a.locator('#power-volume').inputValue(),'70');
 const restored=await b.evaluate(()=>window.raceLab.race);
 assert.equal(restored.live,true);assert.equal(restored.seed,'live');assert.deepEqual(restored.outcome,[]);
 assert.deepEqual(restored,publicLiveRace(race,restored.availableTime,{id:race.id,revision:2}));
 assert.equal(restored.events.filter(e=>['elon','trump'].includes(e.actor)).length,2);
 report.checks.push('both players manually use their own power; causal snapshots agree at a common confirmed time; CPU props/feed and reload preserve accepted actions without exposing future results');
 advanceTo(code,120);await a.locator('#mp-phase').filter({hasText:'prizes saved'}).waitFor();
 for(const name of['PowerAlice','PowerBobby']){
  const user=game.one('SELECT id FROM users WHERE username=?',name),room=game.room(user.id,code),me=game.profile(user.id);
  const finish=room.race.results.find(e=>e.userId===user.id),ticket=room.race.bets[0],place=room.race.results.find(r=>r.horse===ticket.horse).place;
  assert.equal(ticket.payout,place<=3?ticketReturn(ticket.stake,BET_TYPES.show.units):0);
  assert.equal(me.coins,1000-ticket.stake+ticket.payout+finish.prize);
 }
 report.checks.push('powers settle from real crossings with unchanged Show terms, prizes and ledger balances');
 // A deterministic import lets us inspect each signature at its exact impact
 // without changing a live race or any account.
 const preview=await page(1280);let fixture;
 for(let i=0;i<100;i++){
  const candidate=simulateRace(`visual-${i}`,{entrants:ACTOR_IDS.map(horse=>({horse}))});
  if(powerEvents(candidate).find(e=>e.actor==='trump').targets.length>1){fixture=candidate;break;}
 }
 assert.ok(fixture);await preview.evaluate(async def=>window.raceLab.loadRace(def),fixture);
 for(const e of powerEvents(fixture)){
  const t=e.hitTime+.1;await preview.evaluate(t=>window.raceLab.seek(t),t);
  assert.ok((await preview.evaluate(()=>window.raceLab.powers.active)).includes(e.actor));
  await preview.locator('#race-preview').screenshot({path:`${out}/${e.actor}.png`});
 }
 // Preview a trained front-runner outside normal area-attack range.
 let leaderFixture;
 for(let i=0;i<100;i++){
  const candidate=simulateRace(`leader-visual-${i}`,{entrants:ACTOR_IDS.map(horse=>({horse,...(horse==='elon'?{speed:5,stamina:5,focus:5}:{})}))});
  const attacks=powerEvents(candidate).filter(e=>e.targeting==='leader'&&e.targets.length);
  if(attacks.length===2&&attacks.every(e=>{
   const frame=sampleRace(candidate,e.time),source=frame.runners.find(r=>r.id===e.actor),target=frame.runners.find(r=>r.id===e.targets[0]);
   return target.rank===1&&Math.hypot(target.x-source.x,target.z-source.z)>16;
  })){leaderFixture=candidate;break;}
 }
 assert.ok(leaderFixture);await preview.evaluate(async def=>window.raceLab.loadRace(def),leaderFixture);
 for(const e of powerEvents(leaderFixture).filter(e=>e.targeting==='leader')){
  await preview.evaluate(t=>window.raceLab.seek(t),e.hitTime+.1);
  assert.ok((await preview.evaluate(()=>window.raceLab.powers.active)).includes(e.actor));
  assert.deepEqual((await preview.evaluate(()=>window.raceLab.powers.victims)),e.targets);
  assert.ok(await preview.locator('#power-impact').isVisible());
  assert.match(await preview.locator('#standings').textContent(),/Regaining stride/);
  assert.match(await preview.locator('#power-feed').textContent(),/Leader targeted/);
  await preview.locator('.workbench').screenshot({path:`${out}/leader-${e.actor}.png`});
 }
 report.checks.push('paperwork and homing frying pan visibly target the actual leader beyond 16 metres');
 await preview.evaluate(()=>window.raceLab.seek(0));assert.deepEqual(await preview.evaluate(()=>window.raceLab.powers.active),[]);
 const resources=[];
 for(let i=0;i<3;i++){
  await preview.evaluate(async({fixture,i})=>{
   await window.raceLab.loadRace({...fixture,id:`power-resource-${i}`});
   for(const e of fixture.events){window.raceLab.seek(e.hitTime+.1);await new Promise(r=>requestAnimationFrame(r));}
   await new Promise(r=>requestAnimationFrame(r));
  },{fixture,i});
  resources.push(await preview.evaluate(()=>window.raceLab.renderDiagnostics));
 }
 assert.ok(resources.at(-1).geometries<=resources[0].geometries+1);
 assert.ok(resources.at(-1).textures<=resources[0].textures+1);report.resources=resources;
 await preview.setViewportSize({width:390,height:1000});const hat=powerEvents(fixture).find(e=>e.actor==='trump');await preview.evaluate(t=>window.raceLab.seek(t),hat.hitTime+.1);
 await preview.locator('.workbench').screenshot({path:`${out}/hat-mobile.png`});
 for(const p of pages)assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 report.checks.push('all seven procedural effects render; multi-target hat preview; backward seek clears effects; 390px fit; no page/CSP errors or Laravel API requests');
 report.verifiedAt=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(report);
}catch(e){for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:`${out}/failure-${i}.png`,fullPage:true}).catch(()=>{});console.error(errors);throw e;}
finally{await browser.close();await new Promise(r=>proxy.close(r));await new Promise(r=>server.close(r));game.close();await rm(dir,{recursive:true,force:true});}
