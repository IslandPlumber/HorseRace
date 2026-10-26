import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {Game} from './server/game.js';
import {createServer} from './server/http.js';

// Real-time browser regression. This deliberately does not advance a fixture
// clock: periodic pauses are invisible when a test jumps between snapshots.
const label=process.env.SMOOTHNESS_LABEL??'after';
const shouldAssert=process.env.SMOOTHNESS_ASSERT!=='0';
const seconds=Number(process.env.SMOOTHNESS_SECONDS??12);
const delayMs=Number(process.env.SMOOTHNESS_DELAY_MS??350);
const fullApp=process.env.SMOOTHNESS_FULL_APP==='1';
const out=`review/deployment/smoothness/${label}`;
await mkdir(out,{recursive:true});
const dir=await mkdtemp(path.join(os.tmpdir(),'horserace-smoothness-'));
// Freeze the loaded bundle for the entire run, even if another worker prepares
// the next build while the before/after measurement is recording.
const bundle=await readFile('site/app.js');
const sourceRoot=process.cwd();
const multiplayerSource=label==='before'?execFileSync('git',['show',`${process.env.SMOOTHNESS_BASE_REF??'3fa5524'}:race_lab/multiplayer.js`],{encoding:'utf8'}):await readFile('multiplayer.js','utf8');
const harness=Buffer.from(`import {MultiplayerUI} from './multiplayer.js';
let race=null,time=0,updates=0;
const mp=new MultiplayerUI({load:async definition=>{race=definition;updates++;},update:definition=>{race=definition;updates++;},onChange:()=>{}});
function animate(){if(mp.managed){const frame=mp.frame();time=frame.ready?frame.time:0;}requestAnimationFrame(animate);}requestAnimationFrame(animate);
window.raceLab={get ready(){return true;},get race(){return race;},get time(){return time;},get renderDiagnostics(){return {liveUpdates:updates};},get multiplayer(){return {frame:mp.frame(),available:mp.room?.race?.definition?.availableTime,timing:mp.playbackDiagnostics??null};}};
`);
const harnessHTML=Buffer.from((await readFile('index.html','utf8')).replace(/<script type="importmap">[\s\S]*?<\/script>/,'').replace('<script type="module" src="./app.js"></script>','<script type="module" src="./smooth-harness.js"></script>'));
const game=new Game(path.join(dir,'game.sqlite'),{bettingMs:750});
const a=game.register('SmoothAlice','temporary-local-fixture'),b=game.register('SmoothBobby','temporary-local-fixture');
game.horse(b.user.id,'gordon');
const code=game.create(a.user.id);game.join(b.user.id,code);
const requests=[],errors=[],outside=[];
let auxiliaryDelay=0,roomDelay=0;
const server=createServer(game,{site:path.resolve('site')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const proxy=http.createServer((req,res)=>{
  const parsed=new URL(req.url,'http://local');
  if(!parsed.pathname.startsWith('/horserace/')){outside.push(req.url);res.writeHead(404).end();return;}
  if(!fullApp&&parsed.pathname==='/horserace/'){res.writeHead(200,{'Content-Type':'text/html'}).end(harnessHTML);return;}
  if(!fullApp&&parsed.pathname==='/horserace/smooth-harness.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(harness);return;}
  if(!fullApp&&parsed.pathname==='/horserace/multiplayer.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(multiplayerSource);return;}
  if(!fullApp&&parsed.pathname.endsWith('.js')){
    const filename=path.resolve(sourceRoot,'.'+parsed.pathname.slice('/horserace'.length));
    if(filename.startsWith(sourceRoot+path.sep)){
      readFile(filename).then(content=>res.writeHead(200,{'Content-Type':'text/javascript'}).end(content)).catch(()=>res.writeHead(404).end());return;
    }
  }
  if(parsed.pathname==='/horserace/app.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(bundle);return;}
  const pathname=parsed.pathname.slice('/horserace'.length);
  const entry={path:pathname,method:req.method,start:performance.now(),delay:/^\/api\/rooms\/[A-F0-9]{6}$/.test(pathname)?roomDelay:auxiliaryDelay&&['/api/me','/api/rooms','/api/history'].includes(pathname)?auxiliaryDelay:0};
  if(pathname.startsWith('/api/'))requests.push(entry);
  const forward=()=>{
    const target=http.request({host:'127.0.0.1',port:server.address().port,path:pathname+parsed.search,method:req.method,headers:req.headers},upstream=>{
      entry.status=upstream.statusCode;entry.headers=performance.now();
      res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);
      upstream.on('end',()=>{entry.end=performance.now();});
    });
    target.on('error',error=>{entry.error=error.message;res.writeHead(502).end();});
    req.pipe(target);
  };
  if(entry.delay)setTimeout(forward,entry.delay);else forward();
});
await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1100,height:850}}),page=await context.newPage();
page.setDefaultTimeout(30000);
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)]??0;};
function summarize(samples,network){
  const spans=[],deltas=[],headroom=[];let flat=0,streak=0,maxStreak=0,gpuGap=0,backward=0;
  for(let i=1;i<samples.length;i++){
    const current=samples[i],prior=samples[i-1],wall=current.wall-prior.wall,motion=current.actual-prior.actual;
    deltas.push(wall);headroom.push(current.available-current.frame);
    if(motion<-.00001)backward++;
    if(wall>200){gpuGap+=wall;streak=0;continue;}
    if(motion<=.001){flat+=wall;streak+=wall;maxStreak=Math.max(maxStreak,streak);}
    else if(streak){spans.push(streak);streak=0;}
  }
  const duration=(samples.at(-1).wall-samples[0].wall)/1000;
  const rooms=network.filter(request=>/^\/api\/rooms\/[A-F0-9]{6}$/.test(request.path));
  const gaps=rooms.slice(1).map((request,index)=>request.start-rooms[index].start);
  return {frames:samples.length,seconds:duration,raceAdvance:samples.at(-1).race-samples[0].race,frameAdvance:samples.at(-1).frame-samples[0].frame,
    fps:samples.length/duration,rafP50:percentile(deltas,.5),rafP95:percentile(deltas,.95),gpuGapMs:gpuGap,
    plateauMs:flat,plateauFraction:flat/(duration*1000),longestPlateauMs:maxStreak,plateausOver150ms:spans.filter(value=>value>=150).length,
    backwardFrames:backward,headroomP05:percentile(headroom,.05),headroomP50:percentile(headroom,.5),headroomP95:percentile(headroom,.95),
    liveUpdates:samples.at(-1).updates-samples[0].updates,roomRequests:rooms.length,roomGapP50:percentile(gaps,.5),roomGapP95:percentile(gaps,.95),roomGapMax:Math.max(0,...gaps),
    auxiliaryRequests:network.filter(request=>['/api/me','/api/rooms','/api/history'].includes(request.path)).length};
}
async function record(name,actor){
  auxiliaryDelay=name==='delayed'?delayMs:0;
  roomDelay=name==='room-delay'?delayMs:0;
  const since=performance.now();
  await page.evaluate(()=>{
    window.smoothFrames=[];window.smoothRecording=true;
    function capture(wall){
      if(!window.smoothRecording)return;
      const lab=window.raceLab,race=lab.race;
    const multiplayer=lab.multiplayer;
    window.smoothFrames.push({wall,race:lab.time,actual:Math.min(lab.time,race.availableTime),frame:multiplayer.frame.time,available:race.availableTime,frameAvailable:multiplayer.available??null,timing:multiplayer.timing,updates:lab.renderDiagnostics.liveUpdates,revision:race.revision,
        winnerVisible:race.outcome.length,latestEvent:Math.max(-1,...race.events.map(event=>event.time))});
      requestAnimationFrame(capture);
    }
    requestAnimationFrame(capture);
  });
  await new Promise(resolve=>setTimeout(resolve,seconds*500));
  if(actor==='elon'){
    await page.locator('#race-use-power').click();
    await page.locator('#race-ability-status').filter({hasText:'All charges used'}).waitFor();
  }else if(actor){
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/rooms/${code}/power`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${b.token}`},body:JSON.stringify({raceId:game.latest(code).id,requestId:`smoothness-${label}-bobby`})});
    assert.equal(response.status,200);
  }
  await new Promise(resolve=>setTimeout(resolve,seconds*500));
  const samples=await page.evaluate(()=>{window.smoothRecording=false;return window.smoothFrames;});
  const network=requests.filter(request=>request.start>=since),summary=summarize(samples,network);
  assert.ok(samples.every(sample=>sample.actual<=sample.available+1e-8),'rendered playback never passes confirmed history');
  assert.ok(samples.every(sample=>sample.frameAvailable===null||sample.frame<=sample.frameAvailable+1e-8),'clock never passes its own confirmed snapshot');
  assert.ok(samples.every(sample=>sample.winnerVisible===0),'live snapshots never reveal a future outcome');
  assert.ok(samples.every(sample=>sample.latestEvent<=sample.available+1e-8),'future activations stay private');
  await writeFile(`${out}/${name}-frames.json`,JSON.stringify(samples));
  await writeFile(`${out}/${name}-requests.json`,JSON.stringify(network,null,2));
  await writeFile(`${out}/${name}-summary.json`,JSON.stringify(summary,null,2));
  console.log(name,JSON.stringify(summary));
  if(shouldAssert){
    assert.ok(samples.every(sample=>sample.race<=sample.available+1e-8),'render clock stays within the loaded confirmed prefix');
    assert.equal(summary.backwardFrames,0,'live playback must not rewind');
    assert.ok(summary.plateauFraction<.08,`${name}: confirmed playback froze ${(summary.plateauFraction*100).toFixed(1)}% of measured render time`);
    assert.ok(summary.longestPlateauMs<180,`${name}: repeated snapshot clamp ${summary.longestPlateauMs.toFixed(0)}ms`);
    assert.ok(summary.roomGapP95<650,`${name}: auxiliary requests delayed room polling (${summary.roomGapP95.toFixed(0)}ms)`);
  }
  return summary;
}
try{
  await page.goto(`http://127.0.0.1:${proxy.address().port}/horserace/`);
  await page.waitForFunction(()=>window.raceLab?.ready&&document.querySelector('#mp-auth'),null,{timeout:60000});
  await page.evaluate(token=>{localStorage.setItem('horserace-session-v1',token);},a.token);await page.reload();
  await page.locator('#mp-name').filter({hasText:'SmoothAlice'}).waitFor();
  game.start(a.user.id,code);
  await page.waitForFunction(()=>window.raceLab.race?.live&&window.raceLab.time>=9&&document.querySelector('#race-use-power').disabled===false,null,{timeout:45000});
  const normal=await record('normal','elon'),delayed=await record('delayed','gordon'),roomDelayed=await record('room-delay');
  assert.equal(game.powerUses(game.latest(code).id).length,2);
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  await writeFile(`${out}/report.json`,JSON.stringify({label,fullApp,normal,delayed,roomDelayed,errors,verifiedAt:new Date().toISOString()},null,2));
  console.log('Real-time seven-rider playback, manual actions, confirmed history and delayed auxiliary polling verified.');
}catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});await writeFile(`${out}/errors.json`,JSON.stringify(errors));throw error;}
finally{await browser.close();await new Promise(resolve=>proxy.close(resolve));await new Promise(resolve=>server.close(resolve));game.close();await rm(dir,{recursive:true,force:true});}
