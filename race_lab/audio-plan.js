/** Sound follows absolute race time, so seeking/replay never accumulate events. */
import {sampleRace} from './race-core.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=n=>{n=clamp(n,0,1);return n*n*(3-2*n);};
export function buildAudioPlan(race){
 const final=sampleRace(race,race.duration),finish=Math.min(...final.runners.map(r=>r.finishTime));
 const delay=race.startDelay??0,changes=[];let previous=sampleRace(race,delay).standings[0];
 for(let t=delay+.1;t<finish;t+=.1){const leader=sampleRace(race,t).standings[0];if(leader!==previous&&t>delay+.4)changes.push({time:Math.round(t*1000)/1000,leader});previous=leader;}
 return {delay,finish,changes,duration:race.duration};
}
export function crowdProfile(race,plan,time,shot='broadcast'){
 const t=clamp(time,0,race.duration),state=sampleRace(race,t),lead=state.runners.find(r=>r.id===state.standings[0]);
 const remaining=Math.max(0,race.track.length-lead.distance),home=race.track.startOffset??race.track.length*.2;
 let cheer=t<plan.delay?.015:.07;
 if(t>=plan.delay)cheer+=.24*Math.exp(-(((t-plan.delay-.6)/1.2)**2));
 for(const change of plan.changes)if(t>=change.time)cheer+=.21*Math.exp(-(t-change.time)/1.4);
 if(t>=plan.delay)cheer+=.43*smooth(1-remaining/Math.max(1,home));
 if(t>=plan.finish)cheer=.85*Math.exp(-(t-plan.finish)/6)+.12;
 const camera=shot==='aerial'?.78:1;
 return {ambience:(t<plan.delay?.19:.27)*camera,cheer:clamp(cheer,0,.95)*camera,lowpass:shot==='aerial'?4800:9000,
  phase:t<plan.delay?'call-to-post':t>=plan.finish?'celebration':remaining<home?'home-stretch':'racing'};
}
export function cueSchedule(plan,time,bugleDuration){
 const cues=[];
 const length=Math.min(bugleDuration,Math.max(0,plan.delay-.35));
 if(length>0&&time<length)cues.push({id:'bugle',after:0,offset:Math.max(0,bugleDuration-length)+time,duration:length-time});
 // A jump past the gate never plays a retrospective bang. A new replay at zero
 // schedules exactly one cue on the AudioContext clock at the actual release.
 if(time<=plan.delay+.001)cues.push({id:'shot',after:Math.max(0,plan.delay-time),offset:0});
 return cues;
}
