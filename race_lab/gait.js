/** One distance-driven clock shared by rendered legs and individual hoof audio. */
export const GAIT_HZ=3.6;
export const GAIT_LOOP=4;
export function gaitPhase(id){let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)%997/997*GAIT_LOOP;}
export function finishTime(race,runner){
 for(let i=1;i<runner.progress.length;i++){const a=runner.progress[i-1],b=runner.progress[i];if(a.distance<race.track.length&&b.distance>=race.track.length)return a.time+(race.track.length-a.distance)*(b.time-a.time)/(b.distance-a.distance);}
 return race.duration;
}
export function distanceAt(progress,time){
 for(let i=1;i<progress.length;i++)if(time<=progress[i].time){const a=progress[i-1],b=progress[i];return a.distance+(b.distance-a.distance)*Math.max(0,(time-a.time)/(b.time-a.time));}
 return progress.at(-1).distance;
}
export function gaitClock(race,runner,time){
 const nominal=race.track.length/Math.max(.1,finishTime(race,runner)-(race.startDelay??0));
 return gaitPhase(runner.id)+distanceAt(runner.progress,Math.min(time,finishTime(race,runner)))/nominal;
}
export function hoofSchedule(race,time){
 const delay=race.startDelay??0;
 return race.cast.map(runner=>{
  const finish=finishTime(race,runner),nominal=race.track.length/Math.max(.1,finish-delay),segments=[];
  for(let i=1;i<runner.progress.length;i++){
   const a=runner.progress[i-1],b=runner.progress[i],begin=Math.max(time,delay,a.time),end=Math.min(finish,b.time);
   const rate=(b.distance-a.distance)/(b.time-a.time)/nominal;
   if(end<=begin||rate<=.001)continue;
   segments.push({after:Math.max(0,begin-time),offset:gaitClock(race,runner,begin)%GAIT_LOOP,rate,duration:(end-begin)*rate,begin,end});
  }
  return{id:runner.id,lane:runner.lane,finish,segments};
 }).filter(r=>r.segments.length);
}
