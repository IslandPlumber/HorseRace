import {finishTime} from './gait.js';
/** Original comic sound design. Rendered to local WAV clips by prepare-power-audio.mjs. */
export const POWER_CLIPS = Object.freeze([
  'hat-launch','hat-hit','rocket-launch','icecream-launch','filibuster-launch',
  'filibuster-hit','mittens-launch','mittens-hit','kitchen-launch','kitchen-hit','chill-launch','chill-hit',
]);

export function comicClip(key, rate=22050) {
  if(!POWER_CLIPS.includes(key))throw Error(`Unknown power clip: ${key}`);
  const duration=key==='filibuster-hit'?1.65:key==='rocket-launch'?1.55:key==='icecream-launch'?1.4:key==='chill-launch'?1.4:key==='kitchen-hit'?1.35:1.05;
  const out=new Float32Array(Math.ceil(rate*duration));let seed=7331;
  const tone=(t,f)=>Math.sin(2*Math.PI*f*t);
  function note(t,start,length,f,volume=.4){const u=(t-start)/length;return u<0||u>1?0:volume*Math.sin(Math.PI*u)**.5*tone(t-start,f);}
  for(let i=0;i<out.length;i++){
    const t=i/rate,u=t/duration;seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/2147483648-1;let v=0;
    if(key==='kitchen-hit'){
      // Ringing pan, rubbery wobble and the classic falling dizzy whistle.
      v=(tone(t,622)+.65*tone(t,1049)+.42*tone(t,1673))*Math.exp(-t*5)*.28;
      v+=Math.sin(2*Math.PI*(260*t+18*Math.sin(t*24)))*Math.exp(-t*3)*.32;
      if(t>.24)v+=Math.sin(2*Math.PI*(850*(t-.24)-340*(t-.24)**2))*Math.exp(-(t-.24)*3)*.23;
    }else if(key==='filibuster-hit'){
      // Nonsense talking-trombone syllables, then a sleepy descending flourish.
      const syllable=Math.floor(t/.18),a=t% .18,frequency=[155,220,180,270,165,210,140,110,90][syllable]??90;
      v=(tone(a,frequency)+.35*tone(a,frequency*2)+.18*tone(a,frequency*3))*Math.sin(Math.PI*Math.min(1,a/.18))*.4;
    }else if(key==='rocket-launch'){
      v=note(t,0,.13,880)+note(t,.18,.13,660)+note(t,.36,.13,440);
      if(t>.5){const a=t-.5;v+=(noise*.55+tone(a,60)*.18)*Math.min(1,a*25)*Math.exp(-a*1.8)*( .7+.3*Math.sin(a*70)**2);}
      v+=note(t,1.15,.25,165,.3); // A little engine hiccup.
    }else if(key==='icecream-launch'){
      const notes=[659,784,988,784,880,659];for(let n=0;n<notes.length;n++)v+=note(t,n*.17,.20,notes[n],.32);
      if(t>1.08)v+=noise*.18*Math.exp(-(t-1.08)*8)+Math.sin(2*Math.PI*(180*(t-1.08)+200*(t-1.08)**2))*.22*Math.exp(-(t-1.08)*7);
    }else if(key==='hat-launch'){
      v=Math.sin(2*Math.PI*(450*t+210*t*t)+Math.sin(t*24)*3)*Math.sin(Math.PI*u)*.35+noise*.1*Math.sin(Math.PI*u);
    }else if(key==='hat-hit'){
      v=Math.sin(2*Math.PI*(440*t-140*t*t)+Math.sin(t*32)*5)*Math.exp(-t*4)*.45+noise*.2*Math.exp(-t*25);
      v+=note(t,.18,.15,880,.25)+note(t,.4,.16,660,.25);
    }else if(key==='filibuster-launch'){
      v=noise*.28*(.3+.7*Math.sin(t*45)**2)*Math.exp(-t*2);
      v+=note(t,.08,.3,185,.35)+note(t,.40,.32,147,.4)+note(t,.76,.22,110,.35);
    }else if(key==='mittens-launch'||key==='mittens-hit'){
      const notes=key.endsWith('hit')?[784,988,1175]:[392,494,587,784];
      for(let n=0;n<notes.length;n++)v+=note(t,n*.16,.28,notes[n],.36);
      v+=Math.sin(2*Math.PI*(1200*t-400*t*t))*Math.exp(-t*11)*.22;
    }else if(key==='kitchen-launch'){
      v=Math.sin(2*Math.PI*(1000*t-380*t*t))*Math.sin(Math.PI*u)*.32+noise*.15*Math.sin(Math.PI*u);
      v+=note(t,.65,.26,220,.35);
    }else if(key==='chill-launch'){
      for(let n=0;n<4;n++)v+=note(t,n*.27,.3,[110,147,165,98][n],.48)+note(t,n*.27,.2,[220,294,330,196][n],.16);
      v+=noise*.08*Math.sin(t*60)**8*Math.exp(-t*2);
    }else{
      v=Math.sin(2*Math.PI*(280*t-110*t*t))*Math.sin(Math.PI*u)*.45;
      v+=note(t,.5,.3,82,.36);
    }
    // Short ramps eliminate hard waveform edges; normalize the complete clip.
    out[i]=v*Math.min(1,t/.008,(duration-t)/.03);
  }
  let peak=0;for(const v of out)peak=Math.max(peak,Math.abs(v));
  for(let i=0;i<out.length;i++)out[i]*=.78/Math.max(.01,peak);
  return out;
}

/** Cue impact separately from launch, and never replay past cues on late enable. */
export function powerCues(race, time=0) {
  return (race.events??[]).filter(e=>e.power).flatMap(e=>[
    {id:e.id,key:`${e.power}-launch`,time:e.time,phase:'launch'},
    ...(e.targets?.some(id=>{const horse=race.cast?.find(r=>r.id===id);return horse&&finishTime(race,horse)>e.hitTime;})?[{id:`${e.id}-hit`,key:`${e.power}-hit`,time:e.hitTime,phase:'hit'}]:[]),
  ]).filter(cue=>cue.time>=time&&cue.time<race.duration);
}
