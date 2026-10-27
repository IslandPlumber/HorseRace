import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Game} from './server/game.js';
import {createServer} from './server/http.js';

const dir=await mkdtemp(path.join(os.tmpdir(),'horserace-slips-'));
const out='review/deployment/slips-local';
await mkdir(out,{recursive:true});
let now=Date.now()-120000;
const game=new Game(path.join(dir,'game.sqlite'),{clock:()=>now,bettingMs:1000,duration:10});
const password=randomBytes(18).toString('hex');
const user=game.register('SlipTester',password);
const code=game.create(user.user.id);
game.start(user.user.id,code);game.bet(user.user.id,code,'trump',50);now+=11001;
game.settle(game.latest(code),{outcome:['trump','biden','mcconnell','bernie','elon','gordon','snoop']});
game.start(user.user.id,code);game.bet(user.user.id,code,'elon',50);now+=11001;
game.settle(game.latest(code),{outcome:['trump','elon','snoop','gordon','biden','mcconnell','bernie']});
game.start(user.user.id,code); // This current race has no ticket and must stay out of Past bets.
const server=createServer(game,{site:path.resolve('site')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const proxy=http.createServer((req,res)=>{
  if(!req.url.startsWith('/horserace/')){res.writeHead(404);res.end('Wrong API prefix');return;}
  const upstream=http.request({host:'127.0.0.1',port:server.address().port,path:req.url.slice('/horserace'.length),method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
  upstream.on('error',()=>{res.writeHead(502);res.end()});req.pipe(upstream);
});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${proxy.address().port}/horserace/`;
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],blocked=[],diagnostics=[];
try{
  for(const width of [1280,390]){
    const context=await browser.newContext({viewport:{width,height:950}});
    const p=await context.newPage();
    p.on('pageerror',e=>errors.push(e.message));
    p.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(/Content Security Policy|Couldn't load texture/.test(m.text()))blocked.push(m.text())});
    await p.goto(base);
    await p.waitForFunction(()=>window.raceLab?.ready&&document.querySelector('#mp-auth'),null,{timeout:60000});
    const textures=await p.evaluate(()=>window.raceLab.textureDiagnostics);
    assert.equal(textures.length,7);
    for(const actor of textures){
      assert.ok(actor.textures.length>0,`${actor.id} has texture maps`);
      assert.ok(actor.textures.every(t=>t.width>1&&t.height>1),`${actor.id} texture images decoded`);
      assert.ok(actor.textures.some(t=>t.width>=128),`${actor.id} has a full texture image`);
    }
    diagnostics.push({width,textures});
    await p.selectOption('#camera-mode','rail');
    await p.evaluate(()=>window.raceLab.seek(38));
    await p.locator('#viewport').screenshot({path:`${out}/textures-${width}.png`});
    await p.locator('#mp-username').fill('SlipTester');
    await p.locator('#mp-password').fill(password);
    await p.getByRole('button',{name:'Sign in',exact:true}).click();
    await p.locator('#mp-name').filter({hasText:'SlipTester'}).waitFor();
    await p.locator('#mp-tab-history').click();
    await p.waitForFunction(()=>document.querySelectorAll('#mp-slips .bet-slip').length===2);
    const won=p.locator('#mp-slips .bet-won'),lost=p.locator('#mp-slips .bet-lost');
    assert.match(await won.textContent(),/Bet profit \/ loss\+150 coins/);
    assert.match(await won.textContent(),/Round total\+200 coins/);
    assert.match(await lost.textContent(),/Bet profit \/ loss−50 coins/);
    assert.match(await lost.textContent(),/Finish prize\+140 coins/);
    assert.match(await lost.textContent(),/Round total\+90 coins/);
    assert.ok((await p.locator('#mp-wallet').textContent()).includes('1,290'));
    await p.locator('#multiplayer').screenshot({path:`${out}/history-${width}.png`});
    await p.selectOption('#mp-history-filter','won');assert.equal(await p.locator('#mp-slips .bet-slip').count(),1);
    assert.equal(await p.locator('#mp-slips .bet-won').count(),1);
    await p.selectOption('#mp-history-filter','lost');assert.equal(await p.locator('#mp-slips .bet-lost').count(),1);
    assert.equal(await p.locator('#mp-history-filter option[value=none]').count(),0);
    await p.selectOption('#mp-history-filter','pending');assert.match(await p.locator('#mp-slips').textContent(),/No bets match/);
    await p.selectOption('#mp-history-filter','all');
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await p.reload();
    await p.locator('#mp-name').filter({hasText:'SlipTester'}).waitFor();
    await p.locator('#mp-tab-history').click();
    await p.waitForFunction(()=>document.querySelectorAll('#mp-slips .bet-slip').length===2);
    await p.locator('#mp-tab-live').click();
    await p.locator('#mp-create').waitFor();
    await context.close();
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(blocked,[]);
  await writeFile(`${out}/report.json`,JSON.stringify({verifiedAt:new Date().toISOString(),checks:['all seven racer texture maps decoded','no texture or CSP console errors','exact 1200 to 1290 accounting fixture','desktop and mobile history slips','won/lost/pending filters; no-ticket race excluded','history survives reload and leaving rooms','no horizontal overflow'],diagnostics},null,2)+'\n');
  console.log('Bet slips, saved history and actual texture decoding passed at 1280px and 390px.');
}finally{
  await browser.close();
  await new Promise(r=>proxy.close(r));
  await new Promise(r=>server.close(r));
  game.close();
  await rm(dir,{recursive:true,force:true});
}
