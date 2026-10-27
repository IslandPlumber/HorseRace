import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Game} from './server/game.js';
import {createServer} from './server/http.js';
import {simulateLiveRace} from './server/race-simulation.js';
import {ACTOR_IDS} from './race-core.js';
const dir=await mkdtemp(path.join(os.tmpdir(),'horse-special-ui-')),out='review/deployment/specials/local';await mkdir(out,{recursive:true});
let now=Date.now(),restarting=false;const clock=()=>now;let game=new Game(path.join(dir,'game.sqlite'),{clock,bettingMs:1000});
const alice=game.register('SpecialAlice','temporary-local-fixture').user,bobby=game.register('SpecialBobby','temporary-local-fixture').user;
game.horse(bobby.id,'gordon');game.run('INSERT INTO player_upgrades VALUES(?,?,?)',bobby.id,'powerReserve',5);
let server=createServer(game,{site:path.resolve('site')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const errors=[],outside=[],pages=[],report={checks:[]};let cleaning=false;
const proxy=http.createServer((req,res)=>{if(!req.url.startsWith('/horserace/')){outside.push(req.url);res.writeHead(404).end();return;}if(restarting){res.writeHead(503).end();return;}const u=http.request({host:'127.0.0.1',port:server.address().port,path:req.url.slice('/horserace'.length),method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});u.on('error',()=>res.writeHead(503).end());req.pipe(u);});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}),url=`http://127.0.0.1:${proxy.address().port}/horserace/`;
async function page(width,name){const c=await browser.newContext({viewport:{width,height:950}}),p=await c.newPage();pages.push(p);p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()===403&&!cleaning)errors.push('Unexpected forbidden response: '+r.url());});p.on('console',m=>{if(m.type()==='error'&&!/status of (400|403|409|503)|net::ERR_FAILED/.test(m.text()))errors.push(m.text());});await p.goto(url);await p.waitForFunction(()=>window.raceLab?.ready&&document.querySelector('#mp-auth'));await p.locator('#mp-username').fill(name);await p.locator('#mp-password').fill('temporary-local-fixture');await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.locator('#mp-name').filter({hasText:name}).waitFor();return p;}
async function api(p,route,body){return p.evaluate(async({route,body})=>{const r=await fetch(new URL('.'+route,document.baseURI),{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+localStorage.getItem('horserace-session-v1'),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};},{route,body});}
function advance(seconds){now+=seconds*1000;game.tick();}
try{
 const a=await page(1280,'SpecialAlice'),b=await page(390,'SpecialBobby');
 await a.locator('#mp-create').click();await a.locator('#mp-room-name').waitFor();const code=(await a.locator('#mp-room-name').textContent()).split(' ')[1];
 await b.locator('#mp-code').fill(code);await b.getByRole('button',{name:'Join room',exact:true}).click();await b.locator('#mp-members').filter({hasText:'SpecialAlice'}).waitFor();await a.locator('#mp-start').click();
 await a.locator('#race-use-power').filter({hasText:'75 coins'}).waitFor();await b.locator('#race-use-power').filter({hasText:'50 coins'}).waitFor();
 assert.ok(await a.locator('#race-use-power').isDisabled());advance(13);
 await Promise.all([a,b].map(p=>p.waitForFunction(()=>window.raceLab.race.simulation?.specials&&document.querySelector('#race-use-power').disabled===false)));
 const id=game.latest(code).id,before=await a.evaluate(()=>window.raceLab.renderDiagnostics);await a.selectOption('#camera-mode','chase');
 const stale=await api(a,`/api/rooms/${code}/power`,{raceId:id,requestId:'stale-unpriced-client'});assert.equal(stale.status,409);assert.equal(game.profile(alice.id).coins,1000);
 let lost=false;await a.route('**/api/rooms/*/power',async route=>{if(lost)return route.continue();lost=true;await route.fetch();await route.abort('failed');});
 await a.locator('#race-use-power').focus();await a.keyboard.press('f');await a.getByRole('button',{name:'Retry ability',exact:true}).waitFor();assert.equal(game.profile(alice.id).coins,925);
 await a.getByRole('button',{name:'Retry ability',exact:true}).click();await a.locator('#race-ability-status').filter({hasText:'75 coins paid'}).waitFor();assert.equal(game.profile(alice.id).coins,925);assert.equal(game.powerUses(id).length,1);
 await a.waitForFunction(()=>document.querySelector('#mp-wallet').textContent.startsWith('925'));advance(.4);await a.waitForFunction(()=>window.raceLab.race.events.some(e=>e.actor==='elon'));
 await b.locator('#race-use-power').click();await b.locator('#race-ability-status').filter({hasText:'50 coins paid'}).waitFor();advance(.4);
 assert.equal(game.profile(bobby.id).coins,950);assert.equal((await api(b,`/api/rooms/${code}/power`,{raceId:id,requestId:'no-second-special',policyVersion:1})).status,409);assert.equal(game.profile(bobby.id).coins,950);
 assert.equal(game.room(bobby.id,code).race.power.charges,1);assert.ok(await b.locator('#race-use-power').isDisabled());
 advance(3);await a.waitForFunction(()=>window.raceLab.powers.spectacles.includes('elon'));assert.ok((await a.evaluate(()=>window.raceLab.powers.maxPropScale))>2);
 assert.equal((await a.evaluate(()=>window.raceLab.renderDiagnostics)).trackBuilds,before.trackBuilds);assert.deepEqual((await a.evaluate(()=>window.raceLab.renderDiagnostics)).actorInstances,before.actorInstances);assert.equal(await a.evaluate(()=>window.raceLab.cameraMode),'chase');
 await a.locator('#race-preview').screenshot({path:out+'/live-rocket.png'});report.checks.push('clear 75/50 coin prices; F and phone tap; lost successful response charges exactly once; budget5 still limited to one use; large live effects without rebuilding scene');
 advance(120);await Promise.all([a,b].map(p=>p.locator('#mp-phase').filter({hasText:'prizes saved'}).waitFor()));
 const profiles=[game.profile(alice.id),game.profile(bobby.id)];for(const [i,p]of[a,b].entries()){const room=(await api(p,'/api/rooms/'+code)).data.room,own=room.race.results.find(r=>r.userId===profiles[i].id);assert.equal(profiles[i].coins,1000-(i?50:75)+own.prize);assert.equal(room.race.powerSpent,i?50:75);}
 await a.locator('#mp-tab-history').click();await a.locator('#mp-slips .slip-power-cost').filter({hasText:'75'}).waitFor();await a.locator('#multiplayer').screenshot({path:out+'/fee-history.png'});
 restarting=true;await new Promise(r=>server.close(r));game.close();game=new Game(path.join(dir,'game.sqlite'),{clock});server=createServer(game,{site:path.resolve('site')});await new Promise(r=>server.listen(0,'127.0.0.1',r));restarting=false;
 for(const u of profiles)assert.deepEqual(game.profile(u.id),u);assert.equal(game.powerUses(id).length,2);assert.equal(game.powerSpent(alice.id,id),75);game.tick();for(const u of profiles)assert.deepEqual(game.profile(u.id),u);
 await b.reload();await b.locator('#mp-name').filter({hasText:'SpecialBobby'}).waitFor();await b.locator('#race-ability-status').filter({hasText:'50 coins paid'}).waitFor();assert.ok(await b.locator('#race-use-power').isDisabled());
 cleaning=true;for(const p of[a,b]){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal((await api(p,'/api/rooms/'+code+'/leave',{})).status,200);}await a.waitForFunction(()=>!window.raceLab.multiplayer.managed);await b.context().close();
 let preview;for(let seed=0;seed<80;seed++){const candidate=simulateLiveRace('special-preview-'+seed,{entrants:ACTOR_IDS.map(horse=>({horse})),specials:true});if(candidate.events.find(e=>e.actor==='gordon').targets.length&&candidate.events.find(e=>e.actor==='trump').targets.length>1){preview=candidate;break;}}assert.ok(preview);
 await a.evaluate(async def=>window.raceLab.loadRace(def),preview);
 for(const event of preview.events){await a.evaluate(t=>window.raceLab.seek(t),event.time+.2);const view=await a.evaluate(()=>window.raceLab.powers);assert.ok(view.spectacles.includes(event.actor));assert.ok(view.maxPropScale>2);await a.locator('#race-preview').screenshot({path:out+'/'+event.actor+'.png'});}
 const pan=preview.events.find(e=>e.actor==='gordon');await a.evaluate(t=>window.raceLab.seek(t),pan.hitTime+.15);const victims=(await a.evaluate(()=>window.raceLab.powers)).victims;assert.ok(pan.targets.every(id=>victims.includes(id)));await a.setViewportSize({width:390,height:950});await a.locator('#race-preview').screenshot({path:out+'/pan-phone.png'});assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);report.checks.push('fee shown in saved history; charges/coins/prizes survive database restart and phone reload; all seven giant props, particles and waves render; heavy hit stars and phone fit');report.verifiedAt=new Date().toISOString();await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}catch(error){for(let i=0;i<pages.length;i++)if(!pages[i].isClosed())await pages[i].screenshot({path:out+'/failure-'+i+'.png',fullPage:true}).catch(()=>{});console.error(errors);throw error;}finally{await browser.close();await new Promise(r=>proxy.close(r));await new Promise(r=>server.close(r));game.close();await rm(dir,{recursive:true,force:true});}
