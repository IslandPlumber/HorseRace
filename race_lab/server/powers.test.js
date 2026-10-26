import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateRace} from './race-simulation.js';
import {ACTOR_IDS,sampleRace,validateRace,generateRace} from '../race-core.js';
import {POWERS,powerEvents,activePowerEffects,powerStatus,hitReaction} from '../powers.js';
import {POWER_CLIPS,comicClip,powerCues} from '../power-audio.js';
import {distanceAt,finishTime} from '../gait.js';
import {powerSound} from '../race-audio.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const entrants=ACTOR_IDS.map(horse=>({horse}));
test('all seven automatic powers are deterministic, persisted and replay correctly when seeking',()=>{
 const a=simulateRace('power-replay',{entrants}),b=JSON.parse(JSON.stringify(a));
 assert.deepEqual(simulateRace('power-replay',{entrants}),a);
 assert.equal(validateRace(b),b);assert.equal(powerEvents(a).length,7);
 assert.equal(new Set(powerEvents(a).map(e=>e.actor)).size,7);
 for(const e of powerEvents(a)) {
  assert.equal(powerStatus(a,e.actor,0),`${POWERS[e.actor].name} · ready`);
  assert.ok(!activePowerEffects(a,e.actor,e.time-.001).some(a=>a.kind==='boost'));
  assert.match(powerStatus(a,e.actor,e.time+.01),/active|Regaining stride/);
  assert.ok(activePowerEffects(a,e.actor,e.time+.01).some(a=>a.kind==='boost'));
  assert.equal(activePowerEffects(a,e.actor,0).length,0);
  assert.deepEqual(sampleRace(a,e.time),sampleRace(b,e.time));
 }
 assert.ok(ACTOR_IDS.every(id=>/used/.test(powerStatus(a,id,a.duration))));
 assert.equal(powerEvents(generateRace('legacy')).length,0);
 assert.equal(powerStatus(generateRace('legacy'),'trump',20),'');
});

test('hat can hit several rivals; attacks obey range and targets are still racing',()=>{
 let multi=0,miss=0;
 for(let i=0;i<160;i++) {
  const race=simulateRace(`range-${i}`,{entrants});
  for(const e of powerEvents(race)) {
   const frame=sampleRace(race,e.time),source=frame.runners.find(r=>r.id===e.actor);
   assert.equal(source.finished,false);assert.ok(e.targets.length<=3);
   if(e.actor==='trump'&&e.targets.length>=2)multi++;
   if(POWERS[e.actor].slow&&!e.targets.length)miss++;
   for(const id of e.targets) {
    const r=frame.runners.find(r=>r.id===id);assert.equal(r.finished,false);
    // The canonical state sits at most one 0.125-second simulation step
    // behind sampled motion; allow the corresponding travel distance.
    if(!e.assist&&e.targeting!=='leader')assert.ok(Math.hypot(r.x-source.x,r.z-source.z)<=POWERS[e.actor].radius+3);
    assert.ok(activePowerEffects(race,id,e.hitTime+.001).some(a=>a.event.id===e.id&&a.kind!=='boost'));
   }
  }
 }
 assert.ok(multi>0,'hat must genuinely support multiple targets');
 assert.ok(miss>0,'ranged attacks can miss an escaped pack');
});

test('rocket boosts real distance and hat reduces a rival’s actual pace before their own move',()=>{
 let rocket=0,hat=0;
 for(let i=0;i<100;i++) {
  const race=simulateRace(`movement-${i}`,{entrants}),plain=simulateRace(`movement-${i}`,{entrants,powers:false});
  const event=powerEvents(race).find(e=>e.actor==='elon');
  const own=race.cast.find(r=>r.id==='elon'),baseline=plain.cast.find(r=>r.id==='elon');
  if(!powerEvents(race).some(e=>e.targets.includes('elon')&&e.time<event.time)) {
   const at=event.time+event.duration*.9;
   if(distanceAt(own.progress,at)>distanceAt(baseline.progress,at)+.5)rocket++;
  }
  const hatEvent=powerEvents(race).find(e=>e.actor==='trump');
  for(const id of hatEvent.targets) {
   const ownEvent=powerEvents(race).find(e=>e.actor===id),at=hatEvent.hitTime+hatEvent.hitDuration*.9;
   if(ownEvent.time<=at||powerEvents(race).some(e=>e.id!==hatEvent.id&&e.targets.includes(id)&&e.time<at))continue;
   if(distanceAt(race.cast.find(r=>r.id===id).progress,at)<distanceAt(plain.cast.find(r=>r.id===id).progress,at)-.25)hat++;
  }
 }
 assert.ok(rocket>10,'rocket is a real acceleration/cruise boost');
 assert.ok(hat>0,'a hat hit changes movement, not only captions');
});

test('leader hunters hit the live leader at activation, including distant rivals, without self hits',()=>{
 let distant=0,leading=0,hits=0;
 for(let i=0;i<200;i++){
  const field=entrants.map(e=>({...e,...(e.horse==='elon'?{speed:5,stamina:5,focus:5}:{})}));
  const race=simulateRace(`leader-${i}`,{entrants:field});
  for(const e of powerEvents(race).filter(e=>e.targeting==='leader')){
   const frame=sampleRace(race,e.time),leader=frame.runners.find(r=>r.rank===1),source=frame.runners.find(r=>r.id===e.actor);
   if(leader.id===e.actor||leader.finished){assert.deepEqual(e.targets,[]);leading++;}
   else{
    assert.deepEqual(e.targets,[leader.id],`must hit the actual visible leader, seed ${i}`);
    hits++;if(Math.hypot(leader.x-source.x,leader.z-source.z)>16)distant++;
   }
  }
 }
 assert.ok(hits>100);assert.ok(distant>20,'attacks reach a front-runner outside normal area range');
 // Equal fields also exercise the attack owners holding first place themselves.
 for(let i=0;i<60;i++){
  const race=simulateRace(`self-lead-${i}`,{entrants});
  for(const e of powerEvents(race).filter(e=>e.targeting==='leader')){
   const leader=sampleRace(race,e.time).standings[0];
   if(leader===e.actor){assert.deepEqual(e.targets,[]);leading++;}
   else assert.deepEqual(e.targets,[leader]);
  }
 }
 assert.ok(leading>0,'a leader never attacks itself or retargets second place');
});

test('powers preserve the strong training advantage and all identities remain competitive',()=>{
 const wins=Object.fromEntries(ACTOR_IDS.map(id=>[id,0]));let current=0,max=0;
 for(let i=0;i<1000;i++) {
  const seed=`powered-balance-${i}`,race=simulateRace(seed,{entrants});wins[race.outcome[0]]++;
  for(const [skills,count] of [[{speed:4,stamina:2,focus:1},'current'],[{speed:5,stamina:5,focus:5},'max']]) {
   const field=entrants.map(e=>({...e,...(e.horse==='elon'?skills:{})}));
   const win=simulateRace(seed,{entrants:field}).outcome[0]==='elon';
   if(count==='current')current+=win;else max+=win;
  }
 }
 for(const [id,n] of Object.entries(wins))assert.ok(n>70&&n<230,`${id}: ${n/10}% novice wins`);
 assert.ok(current>550&&current<800,`4/2/1 should still win most races: ${current/10}%`);
 assert.ok(max>780&&max<940,`maximum training should remain dominant: ${max/10}%`);
 console.log('Powers balance:',{noviceWins:wins,currentPercent:current/10,maxPercent:max/10});
});

test('solo riders and short rounds finish; no self attacks or powers after the race',()=>{
 for(const horse of ACTOR_IDS)for(const duration of [2,10,64,120]){
  const race=simulateRace('solo',{entrants:[{horse}],duration});assert.equal(validateRace(race),race);
  assert.equal(powerEvents(race).length,1);assert.deepEqual(powerEvents(race)[0].targets,[]);
  assert.ok(finishTime(race,race.cast[0])<race.duration);
 }
 const race=simulateRace('invalid-event',{entrants});race.events[0].targets=['unknown'];
 assert.throws(()=>validateRace(race),/targets/);
});

test('original power foley is audible, finite, bounded and distinct',()=>{
 const context={sampleRate:22050,createBuffer(_channels,length){const data=new Float32Array(length);return {getChannelData:()=>data};}};
 const signatures=new Set();
 for(const p of Object.values(POWERS)){
  const samples=powerSound(context,p.effect).getChannelData(0);
  assert.ok(samples.every(n=>Number.isFinite(n)&&Math.abs(n)<=.781));
  assert.ok(samples.some(n=>Math.abs(n)>.03));signatures.add(samples.slice(400,410).join(','));
 }
 assert.ok(signatures.size>=6);
});

test('heavy hits sharply reduce actual pace, persist through recovery and reset visual reactions on seek',()=>{
 let measured=0,loss=0;
 for(let i=0;i<80;i++){
  const race=simulateRace(`hard-hit-${i}`,{entrants});
  for(const e of powerEvents(race).filter(e=>e.impact&&e.targets.length)){
   const id=e.targets[0],horse=race.cast.find(r=>r.id===id),dt=.22;
   const before=(distanceAt(horse.progress,e.hitTime-.05)-distanceAt(horse.progress,e.hitTime-.05-dt))/dt;
   const after=(distanceAt(horse.progress,e.hitTime+.35)-distanceAt(horse.progress,e.hitTime+.13))/dt;
   if(before>3){loss+=1-after/before;measured++;}
   assert.ok(e.hitDuration>2.5,'multi-second recovery on normal race clock');
   assert.match(powerStatus(race,id,e.hitTime+.3),/Regaining stride/);
   assert.notDeepEqual(hitReaction(race,id,e.hitTime+.3),{roll:0,lift:0});
   assert.deepEqual(hitReaction(race,id,0),{roll:0,lift:0});
   assert.deepEqual(hitReaction(race,id,race.duration),{roll:0,lift:0});
  }
 }
 assert.ok(measured>100);assert.ok(loss/measured>.35,`average immediate pace loss: ${loss/measured}`);
});

test('comic clips are distinct and impacts sound at contact without replaying old launches',()=>{
 const signatures=new Set();
 for(const key of POWER_CLIPS){const samples=comicClip(key);assert.ok(samples.length>22050*.8);assert.ok(samples.every(v=>Number.isFinite(v)&&Math.abs(v)<=.781));signatures.add(samples.slice(2000,2010).join(','));}
 assert.equal(signatures.size,POWER_CLIPS.length);
 const race=simulateRace('sound-cues',{entrants}),event=powerEvents(race).find(e=>e.impact&&e.targets.length);
 const all=powerCues(race),hit=all.find(c=>c.id===`${event.id}-hit`);
 assert.equal(hit.time,event.hitTime);assert.equal(hit.phase,'hit');
 const late=powerCues(race,event.time+.01);assert.ok(!late.some(c=>c.id===event.id));assert.ok(late.some(c=>c.id===hit.id));
 assert.ok(!powerCues(race,event.hitTime+.01).some(c=>c.id===hit.id));
});

test('shipped comic WAV clips match their manifest and contain audible unclipped PCM',()=>{
 const root=new URL('../audio/powers/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
 assert.deepEqual(manifest.clips.map(c=>c.key),POWER_CLIPS);
 for(const clip of manifest.clips){
  const wav=readFileSync(new URL(`${clip.key}.wav`,root));
  assert.equal(createHash('sha256').update(wav).digest('hex'),clip.sha256);
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),22050);
  let peak=0,sum=0;for(let i=44;i<wav.length;i+=2){const sample=wav.readInt16LE(i)/32767;peak=Math.max(peak,Math.abs(sample));sum+=sample*sample;}
  assert.ok(peak>.77&&peak<.79);assert.ok(Math.sqrt(sum/((wav.length-44)/2))>.08);
 }
});
