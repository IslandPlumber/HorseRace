import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Game} from './server/game.js';
import {createServer} from './server/http.js';
import {simulateRace} from './server/race-simulation.js';
const out='review/deployment/power-sound';await mkdir(out,{recursive:true});
const game=new Game(':memory:'),server=createServer(game,{site:path.resolve('site')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const report={checks:[]};
try{
 await p.goto(`http://127.0.0.1:${server.address().port}/`);await p.waitForFunction(()=>window.raceLab?.ready);
 let fixture;
 for(let i=0;i<20;i++){
  const race=simulateRace(`sound-${i}`,{entrants:[{horse:'elon',speed:5,stamina:5,focus:5},{horse:'gordon'}]});
  if(race.events.find(e=>e.actor==='gordon').targets.length){fixture=race;break;}
 }
 assert.ok(fixture);const pan=fixture.events.find(e=>e.actor==='gordon');
 await p.evaluate(async def=>window.raceLab.loadRace(def),{...fixture,events:[pan]});
 await p.locator('#sound-toggle').click();await p.waitForFunction(()=>window.raceLab.audio.powerClips===12);
 for(const [id,value]of[['crowd-volume',0],['hoof-volume',0],['power-volume',100]])await p.locator('#'+id).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 async function capture(label,time){
  await p.evaluate(time=>window.raceLab.seek(time),time);
  await p.evaluate(()=>{window.parts=[];window.recorder=new MediaRecorder(window.raceLab.captureAudio(),{mimeType:'audio/webm;codecs=opus'});window.recorder.ondataavailable=e=>{if(e.data.size)window.parts.push(e.data)};window.recorder.start();});
  await p.locator('#play').click();
  await p.waitForFunction(time=>window.raceLab.time>=time+2.8,time);
  const recorded=await p.evaluate(async()=>{
   await new Promise(r=>{window.recorder.onstop=r;window.recorder.stop()});window.raceLab.pause();
   const bytes=await new Blob(window.parts).arrayBuffer(),context=new OfflineAudioContext(1,1,22050),buffer=await context.decodeAudioData(bytes.slice(0));
   let sum=0,peak=0,clipped=0,count=0;for(let c=0;c<buffer.numberOfChannels;c++)for(const n of buffer.getChannelData(c)){sum+=n*n;peak=Math.max(peak,Math.abs(n));clipped+=Math.abs(n)>=.999;count++;}
   return {bytes:Array.from(new Uint8Array(bytes)),rms:Math.sqrt(sum/count),peak,clipped,audio:window.raceLab.audio};
  });
  await writeFile(`${out}/${label}.webm`,Buffer.from(recorded.bytes));delete recorded.bytes;console.log(label,{rms:recorded.rms,peak:recorded.peak,clipped:recorded.clipped});return recorded;
 }
 report.audible=await capture('pan-impact',pan.time-.8);
 await writeFile(`${out}/debug.json`,JSON.stringify(report,null,2)+'\n');
 assert.ok(report.audible.rms>.015,'pan launch/impact must be clearly audible in actual browser output');assert.equal(report.audible.clipped,0);
 const generation=Math.max(...report.audible.audio.events.map(e=>e.generation));
 assert.ok(report.audible.audio.events.some(e=>e.generation===generation&&e.id===`${pan.id}-hit`));
 await p.locator('#power-volume').evaluate(el=>{el.value=0;el.dispatchEvent(new Event('input',{bubbles:true}));});
 report.muted=await capture('power-muted',pan.time-.8);assert.ok(report.muted.rms<.001);
 await p.locator('#power-volume').evaluate(el=>{el.value=100;el.dispatchEvent(new Event('input',{bubbles:true}));});
 report.late=await capture('past-impact',pan.hitTime+1.6);assert.ok(report.late.rms<.001,'late playback must not replay old clips');
 await p.reload();await p.waitForFunction(()=>window.raceLab?.ready);
 assert.equal(await p.evaluate(()=>window.raceLab.audio.powerVolume),1);
 assert.equal(await p.locator('#power-volume').inputValue(),'100');
 assert.deepEqual(errors,[]);report.verifiedAt=new Date().toISOString();report.checks.push('12 WAV clips decode; audible original pan throw/clang without clipping; launch/contact separately scheduled; independent Powers mute; old cues do not replay');
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log('Comic power sound recording and controls passed.');
}finally{await browser.close();await new Promise(r=>server.close(r));game.close();}
