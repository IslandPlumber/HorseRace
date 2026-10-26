import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateRace} from './race-simulation.js';
import {ACTOR_IDS,sampleRace,validateRace,generateRace} from '../race-core.js';
import {POWERS,powerEvents,activePowerEffects,powerStatus} from '../powers.js';
import {distanceAt,finishTime} from '../gait.js';
import {powerSound} from '../race-audio.js';

const entrants=ACTOR_IDS.map(horse=>({horse}));
test('all seven automatic powers are deterministic, persisted and replay correctly when seeking',()=>{
 const a=simulateRace('power-replay',{entrants}),b=JSON.parse(JSON.stringify(a));
 assert.deepEqual(simulateRace('power-replay',{entrants}),a);
 assert.equal(validateRace(b),b);assert.equal(powerEvents(a).length,7);
 assert.equal(new Set(powerEvents(a).map(e=>e.actor)).size,7);
 for(const e of powerEvents(a)) {
  assert.equal(powerStatus(a,e.actor,0),`${POWERS[e.actor].name} · ready`);
  assert.ok(!activePowerEffects(a,e.actor,e.time-.001).some(a=>a.kind==='boost'));
  assert.match(powerStatus(a,e.actor,e.time+.01),/active/);
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
    if(!e.assist)assert.ok(Math.hypot(r.x-source.x,r.z-source.z)<=POWERS[e.actor].radius+3);
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
 assert.ok(current>630&&current<830,`4/2/1 wins ${current/10}%`);
 assert.ok(max>830&&max<960,`max wins ${max/10}%`);
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
  assert.ok(samples.every(n=>Number.isFinite(n)&&Math.abs(n)<.7));
  assert.ok(samples.some(n=>Math.abs(n)>.03));signatures.add(samples.slice(400,410).join(','));
 }
 assert.ok(signatures.size>=6);
});
