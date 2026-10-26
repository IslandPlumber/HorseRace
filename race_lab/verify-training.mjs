import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Game} from './server/game.js';
import {createServer} from './server/http.js';
import {simulateRace} from './server/race-simulation.js';
import {sampleRace} from './race-core.js';
const dir=await mkdtemp(path.join(os.tmpdir(),'horserace-training-'));
const out='review/deployment/training/browser';await mkdir(out,{recursive:true});
let offset=0;
const game=new Game(path.join(dir,'game.sqlite'),{clock:()=>Date.now()+offset,bettingMs:20000});
const server=createServer(game,{site:path.resolve('site')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const outside=[];
const proxy=http.createServer((req,res)=>{
 if(!req.url.startsWith('/horserace/')){outside.push(req.url);res.writeHead(404);res.end();return;}
 const u=http.request({host:'127.0.0.1',port:server.address().port,path:req.url.slice('/horserace'.length),method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});u.on('error',()=>res.end());req.pipe(u);
});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${proxy.address().port}/horserace/`;
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],pages=[],report={checks:[]};
async function page(width){const context=await browser.newContext({viewport:{width,height:1000}});const p=await context.newPage();pages.push(p);p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await p.goto(url);await p.waitForFunction(()=>window.raceLab?.ready&&document.querySelector('#mp-auth'),null,{timeout:60000});return p;}
async function register(p,name){await p.locator('#mp-username').fill(name);await p.locator('#mp-password').fill('temporary-local-fixture');await p.getByRole('button',{name:'Create account',exact:true}).click();await p.locator('#mp-name').filter({hasText:name}).waitFor();}
async function train(p,kind,level){await p.getByRole('button',{name:new RegExp(`Train ${kind} to level ${level} for`,'i')}).click();await p.locator('.training-card strong').filter({hasText:new RegExp(`${kind} · ${level}/5`,'i')}).waitFor();}
try{
 const a=await page(1280),b=await page(390);await register(a,'Alice');await register(b,'Bobby');
 for(const [kind,level] of [['speed',1],['speed',2],['stamina',1],['focus',1]])await train(a,kind,level);
 await train(b,'focus',1);
 const id=game.one("SELECT id FROM users WHERE username='Alice'").id;
 assert.equal(game.profile(id).coins,210);assert.equal(await a.locator('.training-card meter').count(),3);
 await a.locator('.training-help summary').click();await b.locator('.training-help summary').click();
 await a.locator('#multiplayer').screenshot({path:`${out}/training-desktop.png`});await b.locator('#multiplayer').screenshot({path:`${out}/training-mobile.png`});
 report.checks.push('real coin purchases and all three explained skill cards; level meters and 390px layout');
 await b.selectOption('#mp-horse','snoop');await b.getByRole('button',{name:'Save choice',exact:true}).click();await b.waitForFunction(()=>!document.querySelector('#mp-horse').disabled);
 await a.locator('#mp-create').click();await a.locator('#mp-room-name').waitFor();const code=(await a.locator('#mp-room-name').textContent()).split(' ')[1];
 await b.locator('#mp-code').fill(code);await b.getByRole('button',{name:'Join room',exact:true}).click();await b.locator('#mp-members').filter({hasText:'Alice'}).waitFor();await a.locator('#mp-start').click();
 await b.locator('#mp-bet-form').waitFor();await b.getByRole('button',{name:'Place bet',exact:true}).click();await b.locator('#mp-bet-note').filter({hasText:'Locked in'}).waitFor();
 assert.equal(game.latest(code).definition,null);for(const p of[a,b])for(const button of await p.locator('#mp-upgrades button').all())assert.ok(await button.isDisabled());
 offset+=21000;game.tick();await Promise.all([a,b].map(p=>p.waitForFunction(()=>window.raceLab.multiplayer.managed&&window.raceLab.state==='playing'&&window.raceLab.race.simulation?.model==='skills-v3-powers')));
 const def=JSON.parse(game.latest(code).definition);assert.deepEqual(def.cast.find(r=>r.id==='elon').skills,{speed:2,stamina:1,focus:1});assert.deepEqual(await a.evaluate(()=>window.raceLab.race),await b.evaluate(()=>window.raceLab.race));
 const replay=simulateRace(def.seed,{entrants:JSON.parse(game.latest(code).entrants),title:def.title});replay.id=def.id;assert.deepEqual(replay,def);
 assert.deepEqual(sampleRace(def,64).standings,def.outcome);report.checks.push('purchased levels frozen into the same server-simulated timeline in both browsers; actual crossings determine outcome');
 await a.waitForFunction(()=>window.raceLab.audio.playing&&window.raceLab.audio.horseVoices===7);
 report.audio=await a.evaluate(()=>window.raceLab.audio);assert.ok(report.audio.activeSources<35,'dense timeline still has only one continuous hoof source per horse');
 offset+=24000;game.tick();await a.waitForFunction(()=>window.raceLab.time>24);
 await a.selectOption('#camera-mode','aerial');await a.locator('#race-preview').screenshot({path:`${out}/simulated-race.png`});
 const labels=await a.locator('.rider-sub').allTextContents();assert.ok(labels.some(s=>/Focus|Speed|Stamina|rhythm/.test(s)));report.labels=labels;
 report.checks.push('live skill/rhythm explanations and bounded per-horse hoof audio with dense motion');
 offset+=64000;game.tick();await a.locator('#mp-phase').filter({hasText:'prizes saved'}).waitFor();
 const before=game.profile(id);const race=game.room(id,code).race;assert.deepEqual(race.results.map(r=>r.horse),def.outcome);assert.equal(before.coins,210+race.results.find(r=>r.userId===id).prize);
 await a.reload();await a.locator('#mp-name').filter({hasText:'Alice'}).waitFor();assert.deepEqual(game.profile(id),before);
 assert.equal(await a.locator('meter[aria-label="Speed level"]').getAttribute('value'),'2');
 for(const p of[a,b])assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);report.checks.push('correct awards, saved training after reload, no duplicate payout, no page errors or Laravel API requests');
 report.verifiedAt=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log('Training, shared simulated motion, sound, awards and phone layout passed.');
}catch(e){for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:`${out}/failure-${i}.png`,fullPage:true}).catch(()=>{});console.error(errors);throw e;}
finally{await browser.close();await new Promise(r=>proxy.close(r));await new Promise(r=>server.close(r));game.close();await rm(dir,{recursive:true,force:true});}
