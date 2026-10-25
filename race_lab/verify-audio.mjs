import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const out=new URL('./review/audio/',import.meta.url);await mkdir(out,{recursive:true});
if(process.env.VERIFIED_HTTPS_PROXY==='1')await page.route('https://islandplumber.github.io/**',async route=>{
 const {stdout}=await promisify(execFile)('curl',['-fsSL','--max-time','60',route.request().url()],{encoding:'buffer',maxBuffer:10*1024*1024});
 const p=new URL(route.request().url()).pathname;
 const contentType=p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.json')?'application/json':p.endsWith('.glb')?'model/gltf-binary':p.endsWith('.mp3')?'audio/mpeg':'text/html';
 await route.fulfill({status:200,contentType,body:stdout});
});

try{
 await page.goto(process.env.RACE_LAB_URL||'http://127.0.0.1:8768/race_lab/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.raceLab?.ready,null,{timeout:120000});
 assert.equal(await page.evaluate(()=>window.raceLab.audio.state),'locked','no audio context before gesture');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.click('#play');await page.waitForFunction(()=>window.raceLab.audio.loaded.length===4&&window.raceLab.audio.state==='running');
 await page.evaluate(()=>{window.audioParts=[];window.audioRecorder=new MediaRecorder(window.raceLab.captureAudio(),{mimeType:'audio/webm;codecs=opus'});window.audioRecorder.ondataavailable=e=>{if(e.data.size)window.audioParts.push(e.data);};window.audioRecorder.start();});
 const start=await page.evaluate(()=>({time:window.raceLab.time,audio:window.raceLab.audio}));
 assert.equal(start.audio.events.filter(e=>e.id==='shot').length,1);assert.equal(start.audio.events.filter(e=>e.id==='bugle').length,1);
 const gate=await page.evaluate(()=>window.raceLab.race.startDelay);
 await page.waitForFunction(t=>window.raceLab.time>t+.35,gate,{timeout:20000});
 assert.equal(await page.evaluate(()=>window.raceLab.gateOpen),true);
 await page.click('#play');assert.equal(await page.evaluate(()=>window.raceLab.audio.playing),false);assert.equal(await page.evaluate(()=>window.raceLab.audio.activeSources),0);
 await page.waitForTimeout(250);await page.click('#play');await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>window.raceLab.audio.events.filter(e=>e.id==='shot').length),1,'resume cannot bang again');
 await page.evaluate(()=>window.raceLab.seek(window.raceLab.race.duration*.81));await page.waitForTimeout(800);
 const home=await page.evaluate(()=>window.raceLab.audio.profile);assert.equal(home.phase,'home-stretch');
 const finish=await page.evaluate(()=>Math.min(...window.raceLab.race.cast.map(r=>r.progress.find(p=>p.distance===window.raceLab.race.track.length).time)));
 await page.evaluate(t=>window.raceLab.seek(t-.3),finish);await page.waitForTimeout(1600);
 const celebration=await page.evaluate(()=>window.raceLab.audio.profile);assert.equal(celebration.phase,'celebration');assert.ok(celebration.cheer>.5);
 await page.click('#sound-toggle');assert.equal(await page.evaluate(()=>window.raceLab.audio.muted),true);await page.waitForTimeout(500);
 await page.click('#sound-toggle');assert.equal(await page.evaluate(()=>window.raceLab.audio.muted),false);
 await page.evaluate(()=>{const input=document.getElementById('sound-volume');input.value=25;input.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await page.evaluate(()=>window.raceLab.audio.volume),.25);
 assert.equal(await page.evaluate(()=>window.raceLab.audio.events.filter(e=>e.id==='shot').length),1);
 const recording=await page.evaluate(async()=>{await new Promise(resolve=>{window.audioRecorder.onstop=resolve;window.audioRecorder.stop();});const b=await new Blob(window.audioParts).arrayBuffer();return Array.from(new Uint8Array(b));});
 await writeFile(new URL('actual-browser-audio.webm',out),Buffer.from(recording));
 await page.evaluate(()=>window.raceLab.seek(window.raceLab.race.duration));assert.equal(await page.evaluate(()=>window.raceLab.audio.activeSources),0);
 await page.click('#restart');assert.equal(await page.evaluate(()=>window.raceLab.time),0);await page.click('#play');await page.waitForFunction(()=>window.raceLab.audio.events.filter(e=>e.id==='shot').length===2);
 await page.click('#play');await page.click('#speed');await page.click('#play');await page.waitForFunction(()=>window.raceLab.audio.events.filter(e=>e.id==='shot').length===3);assert.ok((await page.evaluate(()=>window.raceLab.audio.events.filter(e=>e.id==='shot').at(-1).after))<=gate/2);
 await page.selectOption('#race-select','demo-b');await page.waitForFunction(()=>window.raceLab.ready&&window.raceLab.race.duration===72);assert.equal(await page.evaluate(()=>window.raceLab.audio.activeSources),0);
 await page.click('#sound-toggle');assert.equal(await page.evaluate(()=>window.raceLab.audio.muted),true);
 await page.reload();await page.waitForFunction(()=>window.raceLab?.ready);assert.equal(await page.evaluate(()=>window.raceLab.audio.muted),true);assert.equal(await page.evaluate(()=>window.raceLab.audio.volume),.25);
 assert.deepEqual(errors,[]);
 await writeFile(new URL('browser-validation.json',out),JSON.stringify({passed:true,url:page.url(),checked_at_utc:new Date().toISOString(),transport:process.env.VERIFIED_HTTPS_PROXY==='1'?'Live HTTPS via curl using configured CA; actual Chromium audio output':'Browser network',context_start:start,home,celebration,checks:['locked until Play gesture','real decoded recordings and procedural shot','shot scheduled on gate time','pause stops loops and cancels cues','resume/seek/unmute do not re-fire start','home-stretch and finish crowd build','mute and volume persist on reload','replay re-arms once','2x cue timing','changing race stops sound','no mobile overflow or page errors'],recording:'actual-browser-audio.webm'},null,2)+'\n');
 console.log('Audio browser checks passed; actual mixed browser audio recorded');
}finally{await browser.close();}
