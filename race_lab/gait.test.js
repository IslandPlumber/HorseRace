import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRace} from './race-core.js';
import {gaitClock,gaitPhase,hoofSchedule,GAIT_LOOP} from './gait.js';
import {hoofCycle} from './race-audio.js';
test('one, four and seven actual riders produce exactly that many independent hoof voices',()=>{
 for(const cast of [['elon'],['trump','biden','elon','snoop'],undefined]){
  const race=generateRace('hoof-test',{...(cast?{cast}:{})});
  const before=JSON.stringify(race),plan=hoofSchedule(race,0);
  assert.equal(plan.length,race.cast.length);
  assert.equal(new Set(plan.map(p=>gaitPhase(p.id))).size,race.cast.length);
  for(const horse of plan)for(const s of horse.segments){
   assert.ok(s.begin>=race.startDelay&&s.end<=horse.finish);
   assert.ok(s.rate>0&&s.duration>0&&s.offset>=0&&s.offset<GAIT_LOOP);
   const runner=race.cast.find(r=>r.id===horse.id);
   assert.ok(Math.abs((gaitClock(race,runner,s.begin)%GAIT_LOOP)-s.offset)<1e-8);
   assert.ok(Math.abs(s.duration/s.rate-(s.end-s.begin))<1e-8,'sound and animation traverse the same distance interval');
  }
  assert.deepEqual(hoofSchedule(race,race.duration),[]);
  assert.equal(JSON.stringify(race),before);
 }
});
test('late sound enable starts at the current gait phase without replaying past footfalls',()=>{
 const race=generateRace('late-hooves');
 for(const h of hoofSchedule(race,30))assert.ok(h.segments.every(s=>s.begin>=30&&s.after>=0));
});
test('dry hoof cycles are deterministic, finite, bounded and vary between horses',()=>{
 const c={sampleRate:8000,createBuffer(_channels,length){const samples=new Float32Array(length);return{getChannelData(){return samples}}}};
 const natural={getChannelData(){return Float32Array.from({length:3000},(_,i)=>Math.sin(i*.3)*.2)}};
 const a=hoofCycle(c,natural,'elon').getChannelData(0),b=hoofCycle(c,natural,'elon').getChannelData(0),other=hoofCycle(c,natural,'snoop').getChannelData(0);
 assert.deepEqual(a,b);assert.notDeepEqual(a,other);
 assert.ok(a.every(n=>Number.isFinite(n)&&Math.abs(n)<=.581));
 assert.ok(a.some(n=>Math.abs(n)>.4));
});
