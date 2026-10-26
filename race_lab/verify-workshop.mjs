import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Game,RULES} from './server/game.js';
import {createServer} from './server/http.js';
import {UPGRADES,upgradeCost,finishPrize} from './progression.js';
const dir=await mkdtemp(path.join(os.tmpdir(),'horserace-workshop-')),out='review/deployment/workshop-local';await mkdir(out,{recursive:true});
let offset=0;const clock=()=>Date.now()+offset,game=new Game(path.join(dir,'game.sqlite'),{clock,bettingMs:30000});
const veteran=game.register('WorkshopVeteran','temporary-local-fixture').user;game.credit(veteran.id,75000,'Local verification fixture',null);
const server=createServer(game,{site:path.resolve('site')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const errors=[],outside=[],pages=[],report={checks:[]};
const proxy=http.createServer((req,res)=>{
 if(!req.url.startsWith('/horserace/')){outside.push(req.url);res.writeHead(404);res.end();return;}
 const u=http.request({host:'127.0.0.1',port:server.address().port,path:req.url.slice('/horserace'.length),method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});u.on('error',()=>res.end());req.pipe(u);
});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${proxy.address().port}/horserace/`,browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function page(width){const context=await browser.newContext({viewport:{width,height:1000}}),p=await context.newPage();pages.push(p);p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/status of (400|409)/.test(m.text()))errors.push(m.text());});await p.goto(url);await p.waitForFunction(()=>window.raceLab?.ready&&document.querySelector('#mp-auth'),null,{timeout:60000});return p;}
async function auth(p,name,register=true){await p.locator('#mp-username').fill(name);await p.locator('#mp-password').fill('temporary-local-fixture');await p.getByRole('button',{name:register?'Create account':'Sign in',exact:true}).click();await p.locator('#mp-name').filter({hasText:name}).waitFor();}
async function api(p,route,body){return p.evaluate(async({route,body})=>{const r=await fetch(new URL(`.${route}`,document.baseURI),{method:body?'POST':'GET',headers:{Authorization:`Bearer ${localStorage.getItem('horserace-session-v1')}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};},{route,body});}
async function buy(p,kind){
 await p.locator('#mp-tab-upgrades').click();await p.locator(`[data-group=${UPGRADES[kind].group}]`).click();
 const before=(await api(p,'/api/me')).data.user,level=before.upgrades[kind]??0,cost=upgradeCost(kind,level,before.upgrades);
 const card=p.locator(`[data-upgrade=${kind}]`);assert.match(await card.textContent(),new RegExp(cost.toLocaleString().replace(',','[,]')));
  await card.locator('button').click();await p.waitForFunction(({kind,level})=>document.querySelector(`[data-upgrade="${kind}"]`)?.dataset.level===String(level+1),{kind,level});
 const after=(await api(p,'/api/me')).data.user;assert.equal(after.coins,before.coins-cost);assert.equal(after.upgrades[kind],level+1);return after;
}
try{
 const a=await page(1280),b=await page(390),v=await page(1280);await auth(a,'WorkshopAlice');await auth(b,'WorkshopBobby');await auth(v,'WorkshopVeteran',false);
 await a.getByRole('button',{name:/Train Speed to level 1 for/}).click();await a.waitForFunction(()=>document.querySelector('#mp-wallet').textContent.startsWith('880'));
 await a.locator('#mp-tab-live').focus();await a.keyboard.press('ArrowRight');assert.equal(await a.locator('#mp-tab-upgrades').getAttribute('aria-selected'),'true');
 for(const [group,count]of[['horse',8],['tack',4],['power',5],['stable',3]]){await a.locator(`[data-group=${group}]`).click();assert.equal(await a.locator('.workshop-card').count(),count);}
 await a.locator('#mp-tab-upgrades').focus();await a.keyboard.press('End');assert.equal(await a.locator('#mp-tab-history').getAttribute('aria-selected'),'true');
 for(const kind of ['gatecraft','powerPotency','prizeBonus'])await buy(a,kind);
 for(const kind of ['saddle','recovery'])await buy(b,kind);
 assert.equal((await api(a,'/api/me')).data.user.coins,590);assert.equal((await api(b,'/api/me')).data.user.coins,805);
 const stale=await api(a,'/api/upgrades',{kind:'gatecraft',level:0});assert.equal(stale.status,409);assert.equal((await api(a,'/api/me')).data.user.coins,590);
 await a.locator('#mp-tab-upgrades').click();await a.locator('[data-group=horse]').click();await a.locator('#mp-upgrades-panel').screenshot({path:`${out}/horse-desktop.png`});
 await b.locator('#mp-tab-upgrades').click();await b.locator('[data-group=tack]').click();await b.locator('#mp-upgrades-panel').screenshot({path:`${out}/tack-mobile.png`});
 for(let n=0;n<5;n++)await buy(v,'powerReserve');
 for(const kind of Object.keys(UPGRADES).filter(kind=>kind!=='powerReserve'))await buy(v,kind);
 await buy(v,'mastery');
 assert.equal(Object.keys((await api(v,'/api/me')).data.user.upgrades).length,20);
 await v.locator('[data-group=power]').click();assert.match(await v.locator('[data-upgrade=powerReserve]').textContent(),/two moves per race/);assert.ok(await v.locator('[data-upgrade=powerReserve] button').isDisabled());
 await v.locator('#mp-upgrades-panel').screenshot({path:`${out}/power-reserve.png`});await v.locator('[data-group=stable]').click();await v.locator('#mp-upgrades-panel').screenshot({path:`${out}/mastery.png`});
 await b.reload();await b.locator('#mp-name').filter({hasText:'WorkshopBobby'}).waitFor();await b.locator('#mp-open-workshop').click();await b.locator('[data-group=tack]').click();assert.match(await b.locator('[data-upgrade=saddle] .workshop-level').textContent(),/Level 1/);
 report.checks.push('20 paths in four accessible categories; exact UI purchases, stale rejection, all paths purchased, reserve capped, repeatable mastery and phone reload');
 for(const [p,horse]of[[b,'snoop'],[v,'gordon']]){await p.locator('#mp-tab-live').click();await p.selectOption('#mp-horse',horse);await p.getByRole('button',{name:'Save choice',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('#mp-horse').disabled);}
 await a.locator('#mp-tab-live').click();await a.locator('#mp-create').click();await a.locator('#mp-room-name').waitFor();const code=(await a.locator('#mp-room-name').textContent()).split(' ')[1];
 for(const p of[b,v]){await p.locator('#mp-code').fill(code);await p.getByRole('button',{name:'Join room',exact:true}).click();await p.locator('#mp-members').filter({hasText:'WorkshopAlice'}).waitFor();}
 await a.locator('#mp-start').click();await a.locator('#race-betting-banner[data-state=open]').waitFor();
 await a.locator('#mp-tab-upgrades').click();for(const group of['horse','tack','power','stable']){await a.locator(`[data-group=${group}]`).click();for(const button of await a.locator('.workshop-card button').all())assert.ok(await button.isDisabled());}
 assert.equal((await api(a,'/api/upgrades',{kind:'stride',level:0})).status,400);await a.locator('#race-place-bet').click();assert.equal(await a.locator('#mp-tab-live').getAttribute('aria-selected'),'true');
 await a.locator('.racer-builds summary').click();assert.match(await a.locator('#mp-racer-builds').textContent(),/two automatic powers/);
 const before=[];for(const p of[a,b,v])before.push((await api(p,'/api/me')).data.user);
 for(const p of[a,b])for(const kind of['win','place','show']){await p.selectOption('#mp-bet-kind',kind);await p.locator('#mp-stake').fill('10');await p.getByRole('button',{name:'Place bet',exact:true}).click();await p.locator(`#mp-bet-note [data-bet-kind=${kind}]`).waitFor();}
 offset+=31000;game.tick();await Promise.all([a,b,v].map(p=>p.waitForFunction(()=>window.raceLab.race.simulation?.model==='skills-v6-workshop'&&window.raceLab.multiplayer.managed)));
 const definition=JSON.parse(game.latest(code).definition);assert.equal(definition.events.filter(e=>e.actor==='gordon').length,2);
 for(const user of before)assert.deepEqual(definition.cast.find(r=>r.id===user.horse).upgrades,user.upgrades);
 assert.deepEqual(await a.evaluate(()=>window.raceLab.race),await b.evaluate(()=>window.raceLab.race));
 report.checks.push('purchases locked during betting; shortcut returns from Upgrades to bets; frozen public builds and synchronized upgraded timeline with two Gordon casts');
 offset+=70000;game.tick();await a.locator('#mp-phase').filter({hasText:'prizes saved'}).waitFor();
 const profiles=[];
 for(const [i,p]of[a,b,v].entries()){
  const user=(await api(p,'/api/me')).data.user,room=(await api(p,`/api/rooms/${code}`)).data.room,finish=room.race.results.find(r=>r.userId===user.id),returns=room.race.bets.reduce((n,b)=>n+b.payout,0);
  assert.equal(finish.prize,finishPrize(RULES.prizes[finish.place-1],before[i].upgrades));assert.equal(user.coins,before[i].coins-(i<2?30:0)+returns+finish.prize);profiles.push(user);
 }
 const restored=new Game(path.join(dir,'game.sqlite'),{clock});try{for(const user of profiles)assert.deepEqual(restored.profile(user.id),user);assert.deepEqual(restored.room(profiles[0].id,code).race.definition,definition);restored.tick();for(const user of profiles)assert.deepEqual(restored.profile(user.id),user);}finally{restored.close();}
 for(const p of[a,b,v])await api(p,`/api/rooms/${code}/leave`,{});await a.waitForFunction(()=>!window.raceLab.multiplayer.managed);
 await a.evaluate(async def=>window.raceLab.loadRace(def),definition);const reserve=definition.events.find(e=>e.actor==='gordon'&&e.charge===2);await a.evaluate(t=>window.raceLab.seek(t),reserve.time+.1);assert.ok((await a.evaluate(()=>window.raceLab.powers.active)).includes('gordon'));await a.locator('#race-preview').screenshot({path:`${out}/reserve-replay.png`});
 await a.locator('#mp-tab-live').click();await a.selectOption('#mp-horse','gordon');await a.getByRole('button',{name:'Save choice',exact:true}).click();await a.waitForFunction(()=>!document.querySelector('#mp-horse').disabled);await a.locator('#mp-tab-upgrades').click();await a.locator('[data-group=power]').click();assert.match(await a.locator('[data-upgrade=powerPotency] h4').textContent(),/Cast-iron/);assert.match(await a.locator('[data-upgrade=powerPotency] .workshop-level').textContent(),/Level 1/);
 for(const p of pages)assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 report.checks.push('correct frozen purse awards, unchanged ticket terms, restart-safe workshop levels/definition, reserve replay, shared training after rider switch, no overflow or Laravel API requests');
 report.verifiedAt=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(report);
}catch(e){for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:`${out}/failure-${i}.png`,fullPage:true}).catch(()=>{});console.error(errors);throw e;}
finally{await browser.close();await new Promise(r=>proxy.close(r));await new Promise(r=>server.close(r));game.close();await rm(dir,{recursive:true,force:true});}
