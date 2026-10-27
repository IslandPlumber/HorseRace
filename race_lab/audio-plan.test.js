import test from 'node:test';import assert from 'node:assert/strict';
import {generateRace} from './race-core.js';import {buildAudioPlan,crowdProfile,cueSchedule,cheerSchedule} from './audio-plan.js';
const race=generateRace(731),plan=buildAudioPlan(race);
test('full bugle finishes before gate release; exactly one shot is scheduled there',()=>{
 assert.equal(plan.delay,7);const cues=cueSchedule(plan,0,6.34);assert.equal(cues.length,2);
 assert.equal(cues[0].id,'bugle');assert.equal(cues[0].duration,6.34);assert.equal(cues[1].id,'shot');assert.equal(cues[1].after,7);
});
test('pause/resume continues bugle offset instead of repeating it; jumping past start never bangs',()=>{
 const cues=cueSchedule(plan,4,6.34);assert.equal(cues[0].offset,4);assert.ok(Math.abs(cues[0].duration-2.34)<1e-9);assert.equal(cues[1].after,3);
 assert.deepEqual(cueSchedule(plan,9,6.34),[]);assert.equal(cueSchedule(plan,0,6.34).filter(c=>c.id==='shot').length,1);
});
test('legacy short countdown uses the natural ending of the call, not an abrupt beginning cut',()=>{
 const cues=cueSchedule({...plan,delay:3},0,6.34);assert.ok(cues[0].offset>3);assert.ok(Math.abs(cues[0].offset+cues[0].duration-6.34)<1e-9);
});
test('crowd reacts to genuine lead changes and builds for home/finish',()=>{
 assert.ok(plan.changes.length>=2);const middle=crowdProfile(race,plan,30),finish=crowdProfile(race,plan,plan.finish+.2),quiet=crowdProfile(race,plan,0);
 assert.ok(finish.cheer>middle.cheer*2);assert.ok(quiet.cheer<middle.cheer);assert.equal(finish.phase,'celebration');
 const pulse=plan.changes[0];const reaction=crowdProfile(race,plan,pulse.time+.1);const before=crowdProfile(race,plan,pulse.time-.1);assert.ok(reaction.cheer>before.cheer);
 assert.ok(crowdProfile(race,plan,plan.finish+.2,'aerial').cheer<finish.cheer);
});
test('crowd state is deterministic and independent of seeking history',()=>{
 const a=crowdProfile(race,plan,22);crowdProfile(race,plan,race.duration);assert.deepEqual(crowdProfile(race,plan,22),a);
 for(let t=0;t<race.duration;t+=.1){const s=crowdProfile(race,plan,t);assert.ok(s.cheer>=0&&s.cheer<=.95);assert.ok(s.ambience>=0&&s.ambience<1);}
});

test('crowd reactions are short cues and resume offsets without a continuous cheer loop',()=>{
 const cues=cheerSchedule(plan,0,4);assert.ok(cues.length>=2);
 assert.ok(cues.every(c=>c.duration<=4&&c.after>=plan.delay));
 const finish=cues.find(c=>c.kind==='finish');assert.equal(finish.time,plan.finish);
 const resumed=cheerSchedule(plan,plan.finish+1,4).find(c=>c.kind==='finish');
 assert.equal(resumed.offset,1);assert.equal(resumed.after,0);assert.equal(resumed.duration,3);
 assert.deepEqual(cheerSchedule(plan,plan.finish+4,4),[]);
});
