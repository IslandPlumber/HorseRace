import test from 'node:test';
import assert from 'node:assert/strict';
import {LivePlaybackClock} from './live-playback.js';
function network({rtt=()=>450,cadence=300,length=24000,jitter=()=>0}={}){
 let now=0,nextStart=0,busyUntil=0,frames=[],pending=[],first=true;
 const clock=new LivePlaybackClock({now:()=>now,pollMs:cadence});
 for(now=0;now<=length;now+=1000/60){
  if(now>=nextStart&&now>=busyUntil){const duration=rtt(now)+jitter(now),sent=now,at=now+duration;busyUntil=at;nextStart=sent+cadence;pending.push({at,sent,duration});}
  while(pending.length&&pending[0].at<=now){const p=pending.shift(),generated=(p.sent+p.duration/2)/1000,head=Math.floor(generated*10)/10;
   clock.observe({id:'race-a',starts:0,definition:{live:true,availableTime:head,completed:false}},{serverTime:generated*1000,receivedAt:now,requestMs:p.duration});first=false;}
  if(!first){const time=clock.frame();frames.push({at:now,time,head:clock.head,rate:clock.rate,buffer:clock.head-time});}
 }
 return {clock,frames};
}
test('steady450ms requests on300ms deadlines keep every rendered frame moving after priming',()=>{
 const {clock,frames}=network();
 const active=frames.filter(f=>f.at>4000);
 for(let i=1;i<active.length;i++){assert.ok(active[i].time>active[i-1].time);assert.ok(active[i].time<=active[i].head);assert.ok(active[i].time-active[i-1].time<.019);}
 assert.equal(clock.underruns,0);assert.ok(clock.diagnostics.headroom>.25);
});
test('room response jitter changes speed within bounds without backward motion or wall clock stalls',()=>{
 const {clock,frames}=network({rtt:t=>t<8000?90:340,jitter:t=>Math.round(t/300)%3*70});
 for(let i=1;i<frames.length;i++)assert.ok(frames[i].time>=frames[i-1].time);
 for(const frame of frames){assert.ok(frame.time<=frame.head);assert.ok(frame.rate>=.92&&frame.rate<=1.04);}
 assert.equal(clock.underruns,0);
});
test('a high latency900ms connection adapts its buffer without repeated starvation',()=>{
 const {clock,frames}=network({rtt:()=>900});
 assert.ok(clock.delay>1.4);assert.equal(clock.underruns,0);
 const active=frames.filter(f=>f.at>5000);for(let i=1;i<active.length;i++)assert.ok(active[i].time>active[i-1].time);
});
test('no new confirmed history never extrapolates; reconnect rebuffers and resumes without a jump',()=>{
 let now=0;const clock=new LivePlaybackClock({now:()=>now});
 clock.observe({id:'race-a',starts:0,definition:{live:true,availableTime:10,completed:false}},{serverTime:10000,requestMs:80});
 let previous=clock.time;for(now=0;now<5000;now+=1000/60){const time=clock.frame();assert.ok(time>=previous&&time<=10);previous=time;}
 assert.equal(clock.underruns,1);assert.equal(clock.time,10);
 clock.frame();
 clock.observe({id:'race-a',starts:0,definition:{live:true,availableTime:15,completed:false}},{serverTime:15000,receivedAt:now,requestMs:80});
 now+=1000/60;const resumed=clock.frame();assert.ok(resumed>10&&resumed<10.02);assert.equal(clock.rebuffering,false);
});
test('an outlier server timing correction cannot freeze playback waiting for wall time to catch up',()=>{
 let now=1000;const clock=new LivePlaybackClock({now:()=>now});
 clock.observe({id:'race-a',starts:0,definition:{live:true,availableTime:20,completed:false}},{serverTime:20000,requestMs:100});
 const before=clock.time;now+=16;clock.observe({id:'race-a',starts:0,definition:{live:true,availableTime:21,completed:false}},{serverTime:18000,receivedAt:now,requestMs:1700});
 const next=clock.frame();assert.ok(next>before);assert.ok(next-before<.02);
});
test('completed races finish on their real confirmed boundary',()=>{
 let now=1000;const clock=new LivePlaybackClock({now:()=>now});
 clock.observe({id:'race-a',starts:0,definition:{live:true,availableTime:12,completed:false}},{serverTime:12000,requestMs:40});
 now+=300;clock.observe({id:'race-a',starts:0,definition:{live:true,availableTime:12.2,completed:true}},{serverTime:12300,receivedAt:now,requestMs:40});
 for(let i=0;i<240;i++){now+=1000/60;clock.frame();}
 assert.equal(clock.time,12.2);assert.equal(clock.underruns,0);
});
