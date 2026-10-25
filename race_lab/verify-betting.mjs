import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Game} from './server/game.js';
import {createServer} from './server/http.js';
import {BET_TYPES,ticketReturn} from './betting.js';
const dir=await mkdtemp(path.join(os.tmpdir(),'horserace-wps-')),out='review/deployment/wps-local';await mkdir(out,{recursive:true});
let offset=0;
const game=new Game(path.join(dir,'game.sqlite'),{clock:()=>Date.now()+offset,bettingMs:60000});
const server=createServer(game,{site:path.resolve('site')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const outside=[],errors=[],pages=[];
const proxy=http.createServer((req,res)=>{
 if(!req.url.startsWith('/horserace/')){outside.push(req.url);res.writeHead(404);res.end();return;}
 const u=http.request({host:'127.0.0.1',port:server.address().port,path:req.url.slice('/horserace'.length),method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});u.on('error',()=>res.end());req.pipe(u);
});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${proxy.address().port}/horserace/`;
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function page(width){const c=await browser.newContext({viewport:{width,height:1000}}),p=await c.newPage();pages.push(p);p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/server responded with a status of (400|409) /.test(m.text()))errors.push(m.text())});await p.goto(url);await p.waitForFunction(()=>window.raceLab?.ready&&document.querySelector('#mp-auth'),null,{timeout:60000});return p;}
async function auth(p,name,register=true){await p.locator('#mp-username').fill(name);await p.locator('#mp-password').fill('temporary-local-fixture');await p.getByRole('button',{name:register?'Create account':'Sign in',exact:true}).click();await p.locator('#mp-name').filter({hasText:name}).waitFor();}
async function api(p,route,body){return p.evaluate(async({route,body})=>{const r=await fetch(new URL(`.${route}`,document.baseURI),{method:body?'POST':'GET',headers:{Authorization:`Bearer ${localStorage.getItem('horserace-session-v1')}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};},{route,body});}
const report={checks:[]};
try{
 const a=await page(1280),b=await page(390);await auth(a,'Alice');await auth(b,'Bobby');
 await b.selectOption('#mp-horse','snoop');await b.getByRole('button',{name:'Save choice',exact:true}).click();await b.waitForFunction(()=>!document.querySelector('#mp-horse').disabled);
 await a.locator('#mp-create').click();await a.locator('#mp-room-name').waitFor();const code=(await a.locator('#mp-room-name').textContent()).split(' ')[1];
 await b.locator('#mp-code').fill(code);await b.getByRole('button',{name:'Join room',exact:true}).click();await b.locator('#mp-members').filter({hasText:'Alice'}).waitFor();await a.locator('#mp-start').click();
 await a.locator('#race-betting-banner[data-state=open]').waitFor();await b.locator('#race-betting-banner[data-state=open]').waitFor();
 const initial=parseInt(await b.locator('#race-bet-countdown').textContent());offset+=5000;
 await b.waitForFunction(n=>parseInt(document.querySelector('#race-bet-countdown').textContent)<=n,initial-4);
 const beforeReload=parseInt(await b.locator('#race-bet-countdown').textContent());await b.reload();await b.locator('#mp-name').filter({hasText:'Bobby'}).waitFor();await b.locator('#race-betting-banner[data-state=open]').waitFor();
 assert.ok(parseInt(await b.locator('#race-bet-countdown').textContent())<=beforeReload);
 await a.locator('#mp-tab-history').click();await a.locator('#race-place-bet').click();assert.equal(await a.locator('#mp-tab-live').getAttribute('aria-selected'),'true');assert.ok(await a.locator('#mp-bet-form').isVisible());
 await a.locator('#race-betting-banner').screenshot({path:`${out}/countdown-desktop.png`});await b.locator('#race-betting-banner').screenshot({path:`${out}/countdown-mobile.png`});
 report.checks.push('race-screen countdown follows absolute server deadline through reload; shortcut opens betting from the history tab');
 for(const [p,horse]of[[a,'elon'],[b,'snoop']])for(const[kind,stake]of[['win',50],['place',51],['show',51]]){
  await p.selectOption('#mp-bet-kind',kind);await p.selectOption('#mp-bet-horse',horse);await p.locator('#mp-stake').fill(String(stake));
  if(kind==='show')assert.match(await p.locator('#mp-bet-preview').textContent(),/76 coins returned/);
  await p.getByRole('button',{name:'Place bet',exact:true}).click();await p.locator(`#mp-bet-note [data-bet-kind=${kind}]`).waitFor();
 }
 for(const p of[a,b]){assert.ok(await p.locator('#mp-bet-form').isHidden());assert.ok(await p.locator('#race-bet-countdown').isVisible());assert.ok(await p.locator('#race-place-bet').isHidden());}
 const duplicate=await api(a,`/api/rooms/${code}/bets`,{horse:'trump',stake:50,kind:'place'});assert.equal(duplicate.status,409);
 const during=(await api(a,`/api/rooms/${code}`)).data.room;assert.equal(during.race.bets.length,3);assert.equal(during.race.definition,null);
 await a.locator('#multiplayer').screenshot({path:`${out}/tickets-desktop.png`});await b.locator('#multiplayer').screenshot({path:`${out}/tickets-mobile.png`});
 report.checks.push('Win, Place and Show locked separately; exact preview including fractional-coin rounding; duplicate rejected; countdown stays visible after all tickets');
 offset+=61000;game.tick();await Promise.all([a,b].map(p=>p.locator('#race-betting-banner[data-state=closed]').waitFor()));
 const late=await api(a,`/api/rooms/${code}/bets`,{horse:'trump',stake:50,kind:'show'});assert.equal(late.status,400);assert.match(late.data.error,/closed/);
 report.checks.push('banner closes automatically and server rejects late typed bets');
 offset+=64000;game.tick();await a.locator('#mp-phase').filter({hasText:'prizes saved'}).waitFor();
 const snapshots=[];
 for(const p of[a,b]){
  const me=(await api(p,'/api/me')).data.user,room=(await api(p,`/api/rooms/${code}`)).data.room;
  const prize=room.race.results.find(r=>r.userId===me.id).prize;
  for(const bet of room.race.bets){const place=room.race.results.find(r=>r.horse===bet.horse).place;assert.equal(bet.payout,place<=BET_TYPES[bet.kind].places?ticketReturn(bet.stake,bet.returnUnits):0);}
  assert.equal(me.coins,1000-152+prize+room.race.bets.reduce((n,b)=>n+b.payout,0));
  const history=(await api(p,'/api/history')).data.history;assert.equal(history[0].bets.length,3);assert.equal(history[0].netCoins,me.coins-1000);snapshots.push({me,history});
  await p.locator('#mp-tab-history').click();assert.equal(await p.locator('#mp-slips [data-bet-kind]').count(),3);
 }
 await a.locator('#multiplayer').screenshot({path:`${out}/results-desktop.png`});await b.locator('#multiplayer').screenshot({path:`${out}/results-mobile.png`});
 const returning=await page(390);await auth(returning,'Bobby',false);assert.deepEqual((await api(returning,'/api/history')).data.history,snapshots[1].history);
 report.checks.push('all ticket payouts and aggregate slip totals match actual finish; fresh login restores all three tickets');
 // A deterministic second-place fixture proves mixed slip rendering explicitly.
 const mixed=game.register('MixedSlip','temporary-local-fixture').user,room=game.create(mixed.id);game.start(mixed.id,room);
 for(const kind of['win','place','show'])game.bet(mixed.id,room,'elon',50,kind);
 game.settle(game.latest(room),{outcome:['trump','elon','snoop','biden','gordon','bernie','mcconnell']});
 const p=await page(390);await auth(p,'MixedSlip',false);await p.locator('#mp-tab-history').click();const slip=p.locator('#mp-slips .bet-slip').first();
 assert.match(await slip.textContent(),/2 of 3 bets won/);assert.match(await slip.textContent(),/Bet profit \/ loss\+25 coins/);assert.match(await slip.textContent(),/Round total\+165 coins/);
 await p.locator('#multiplayer').screenshot({path:`${out}/mixed-place-show.png`});
 for(const filter of['won','lost']){await p.selectOption('#mp-history-filter',filter);assert.equal(await p.locator('#mp-slips .bet-slip').count(),1);}
 for(const p of pages)assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 report.checks.push('second-place fixture loses Win but wins Place/Show; mixed history filters and 390px layout');
 report.verifiedAt=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log('Race-screen countdown, all three bet types, locked tickets, payouts and saved slips passed.');
}catch(e){for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:`${out}/failure-${i}.png`,fullPage:true}).catch(()=>{});console.error(errors);throw e;}
finally{await browser.close();await new Promise(r=>proxy.close(r));await new Promise(r=>server.close(r));game.close();await rm(dir,{recursive:true,force:true});}
