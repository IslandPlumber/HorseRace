import {buildAudioPlan,crowdProfile,cueSchedule,cheerSchedule} from './audio-plan.js';
import {GAIT_HZ,GAIT_LOOP,hoofSchedule} from './gait.js';
import {powerEvents} from './powers.js';
const clamp=x=>Math.max(0,Math.min(1,x));
export function starterShot(context){
 const b=context.createBuffer(1,Math.ceil(context.sampleRate*.65),context.sampleRate),data=b.getChannelData(0);let seed=7331;
 for(let i=0;i<data.length;i++){const t=i/context.sampleRate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;
 data[i]=noise*(.85*Math.exp(-t*95)+.25*Math.exp(-t*16))+Math.sin(2*Math.PI*(190*t-80*t*t))*.25*Math.exp(-t*32)+(t>.06?noise*.10*Math.exp(-(t-.06)*20):0);}
 let peak=0;for(const n of data)peak=Math.max(peak,Math.abs(n));for(let i=0;i<data.length;i++)data[i]*=.82/peak;return b;
}
/** Original cartoon foley, with no sampled speech or external recordings. */
export function powerSound(context,kind){
 const seconds=kind==='rocket'?.85:.5,buffer=context.createBuffer(1,Math.ceil(context.sampleRate*seconds),context.sampleRate),out=buffer.getChannelData(0);
 let seed=9123;
 for(let i=0;i<out.length;i++){
  const t=i/context.sampleRate,u=t/seconds;seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const noise=seed/2147483648-1,envelope=Math.sin(Math.PI*u)*Math.exp(-u*2);
  const pitch=kind==='icecream'?700:kind==='mittens'?450:kind==='chill'?220:kind==='kitchen'?1000:330;
  out[i]=(kind==='rocket'?noise*.48+Math.sin(t*180)*.15:
   kind==='hat'||kind==='filibuster'?noise*.28+Math.sin(2*Math.PI*(pitch*t-180*t*t))*.18:
   Math.sin(2*Math.PI*(pitch*t+140*t*t))*.28+noise*.06)*envelope;
 }
 return buffer;
}
/** Dry dirt impacts, with a little real recorded hoof texture; one horse per voice. */
export function hoofCycle(context,natural,id){
 const rate=context.sampleRate,b=context.createBuffer(1,Math.round(rate*GAIT_LOOP),rate),out=b.getChannelData(0);
 const input=natural.getChannelData(0);let seed=0;for(const c of id)seed=(Math.imul(seed,31)+c.charCodeAt(0))>>>0;
 let peakAt=0;for(let i=0;i<input.length;i++)if(Math.abs(input[i])>Math.abs(input[peakAt]))peakAt=i;
 const sampleAt=Math.max(0,peakAt-Math.floor(rate*.008));
 const steps=[0,.16,.49,.66];
 for(let cycle=0;cycle/GAIT_HZ<GAIT_LOOP;cycle++)for(let foot=0;foot<4;foot++){
  const at=(cycle+steps[foot])/GAIT_HZ;if(at>=GAIT_LOOP)continue;
  const start=Math.floor(at*rate);let low=0;
  for(let j=0;j<rate*.11;j++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=seed/2147483648-1,t=j/rate;low=low*.65+white*.35;
   const attack=Math.min(1,t/.002),tail=Math.exp(-t*42),tone=Math.sin(2*Math.PI*((foot<2?100:78)*t-100*t*t));
   const recorded=input[(sampleAt+j)%input.length]??0;
   const value=attack*(tone*.28*tail+low*.62*tail+white*.08*Math.exp(-t*180)+recorded*.26*Math.exp(-t*30));
   out[(start+j)%out.length]+=value*(foot%2?.86:1);
  }
 }
 let peak=0;for(const n of out)peak=Math.max(peak,Math.abs(n));
 for(let i=0;i<out.length;i++)out[i]*=.58/Math.max(peak,.01);
 return b;
}
export class RaceAudio {
 constructor({embedded={},onStatus=()=>{}}={}){
  this.onStatus=onStatus;this.ctx=null;this.buffers=null;this.sources=new Set();this.generation=0;this.playing=false;this.race=null;this.cursor=0;this.speed=1;this.masterVolume=.65;this.crowdVolume=.3;this.hoofVolume=.75;this.muted=false;this.events=[];this.profile=null;this.hoofBuffers=new Map();this.horseChannels=new Map();
  try{const stored=JSON.parse(localStorage.getItem('race-audio-v1')??'null');if(stored){this.masterVolume=clamp(Number(stored.volume)||0);this.muted=Boolean(stored.muted);if(Number.isFinite(stored.crowdVolume))this.crowdVolume=clamp(stored.crowdVolume);if(Number.isFinite(stored.hoofVolume))this.hoofVolume=clamp(stored.hoofVolume);}}catch{}
  this.embedded=embedded;this.raw=null;this.rawError=null;this.preload();
 }
 preload(){
  this.rawError=null;
  this.raw=Promise.all(['bugle','crowd','cheer','hooves'].map(async id=>{const response=await fetch(this.embedded[id]??`./audio/${id}.mp3?v=individual-hooves-3`);if(!response.ok)throw Error(`Could not load ${id} audio`);return[id,await response.arrayBuffer()];})).catch(error=>{this.rawError=error;return null;});
 }
 async unlock(){
  if(!this.ctx){const Constructor=globalThis.AudioContext??globalThis.webkitAudioContext;if(!Constructor)throw Error('Audio is unavailable in this browser');
   this.ctx=new Constructor();this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:this.masterVolume*.65;
   this.limiter=this.ctx.createDynamicsCompressor();this.limiter.threshold.value=-10;this.limiter.knee.value=6;this.limiter.ratio.value=8;this.limiter.attack.value=.003;this.limiter.release.value=.18;this.master.connect(this.limiter);this.limiter.connect(this.ctx.destination);
  }
  // Resume synchronously in the Play/Sound click handler, before any fetch awaits.
  await this.ctx.resume();
  if(!this.buffers){
   if(!this.decoding)this.decoding=(async()=>{if(this.rawError)this.preload();const raw=await this.raw;if(!raw)throw this.rawError;const decoded=await Promise.all(raw.map(async([id,b])=>[id,await this.ctx.decodeAudioData(b.slice(0))]));return {...Object.fromEntries(decoded),shot:starterShot(this.ctx)};})();
   try{this.buffers=await this.decoding;}finally{this.decoding=null;}
  }
  this.onStatus('ready');
 }
 persist(){try{localStorage.setItem('race-audio-v1',JSON.stringify({volume:this.masterVolume,crowdVolume:this.crowdVolume,hoofVolume:this.hoofVolume,muted:this.muted}));}catch{}}
 setHoofVolume(value){this.hoofVolume=clamp(value);this.persist();if(this.playing)this.updateGains(this.cursor,this.shot??'broadcast');}
 setCrowdVolume(value){this.crowdVolume=clamp(value);if(this.crowdMaster)this.crowdMaster.gain.setTargetAtTime(this.crowdVolume,this.ctx.currentTime,.025);this.persist();}
 setVolume(value){this.masterVolume=clamp(value);this.updateVolume();this.persist();}
 setMuted(value){this.muted=Boolean(value);this.updateVolume();this.persist();}
 updateVolume(){if(this.ctx)this.master.gain.setTargetAtTime(this.muted?0:this.masterVolume*.65,this.ctx.currentTime,.025);}
 stopSources(){
  if(this.ctx&&this.runGain){const now=this.ctx.currentTime;this.runGain.gain.cancelScheduledValues(now);this.runGain.gain.setTargetAtTime(0,now,.015);}
  const old=this.runGain;if(old)setTimeout(()=>{try{old.disconnect();}catch{}},150);
  for(const source of this.sources){try{source.stop((this.ctx?.currentTime??0)+.07);}catch{}}
  this.sources.clear();
 }
 pause(){this.playing=false;this.generation++;this.stopSources();}
 async start(race,time,speed=1){
  const requestedAt=performance.now();
  this.stopSources();const generation=++this.generation;this.playing=true;this.race=race;this.cursor=time;this.speed=speed;this.plan=buildAudioPlan(race);
  try{await this.unlock();if(generation!==this.generation||!this.playing)return;
   for(const rider of race.cast)if(!this.hoofBuffers.has(rider.id))this.hoofBuffers.set(rider.id,hoofCycle(this.ctx,this.buffers.hooves,rider.id));
   let current=Math.min(race.duration,time+(performance.now()-requestedAt)/1000*speed);
   if(time<=this.plan.delay+.001&&current>this.plan.delay&&current-this.plan.delay<.12)current=this.plan.delay;
   this.schedule(current);
  }
  catch(error){if(generation!==this.generation)return;this.playing=false;this.onStatus('error',error);}
 }
 source(buffer,gain,{loop=false,after=0,offset=0,rate=1,duration}={}){
  const s=this.ctx.createBufferSource();s.buffer=buffer;s.loop=loop;s.playbackRate.value=rate;s.connect(gain);this.sources.add(s);s.onended=()=>{this.sources.delete(s);s.disconnect();};
  const when=(this.scheduleAnchor??this.ctx.currentTime)+after;s.start(when,offset);if(duration!==undefined)s.stop(when+duration/rate);return s;
 }
 schedule(time){
  const c=this.ctx;this.scheduleAnchor=c.currentTime+.015;this.runGain=c.createGain();this.runGain.gain.setValueAtTime(0,c.currentTime);this.runGain.gain.linearRampToValueAtTime(1,c.currentTime+.035);this.runGain.connect(this.master);
  this.ambience=c.createGain();this.cheers=c.createGain();this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.Q.value=.3;this.ambience.connect(this.filter);this.cheers.connect(this.filter);
  this.crowdMaster=c.createGain();this.crowdMaster.gain.value=this.crowdVolume;this.filter.connect(this.crowdMaster);this.crowdMaster.connect(this.runGain);
  this.source(this.buffers.crowd,this.ambience,{loop:true,offset:time%this.buffers.crowd.duration});
  for(const cue of cheerSchedule(this.plan,time,this.buffers.cheer.duration)){
   const reaction=c.createGain(),when=this.scheduleAnchor+cue.after/this.speed,end=when+cue.duration/this.speed;
   reaction.connect(this.cheers);reaction.gain.setValueAtTime(Math.min(1,cue.offset/.12),when);
   if(cue.offset<.12)reaction.gain.linearRampToValueAtTime(.8,Math.min(end,when+(.12-cue.offset)/this.speed));
   reaction.gain.linearRampToValueAtTime(0,end);
   this.source(this.buffers.cheer,reaction,{after:cue.after/this.speed,offset:cue.offset,rate:this.speed,duration:cue.duration});
  }
  this.hooves=c.createGain();this.hooves.connect(this.runGain);
  this.horseChannels=new Map();
  for(const horse of hoofSchedule(this.race,time)){
   const gain=c.createGain(),pan=c.createStereoPanner();gain.gain.value=1/Math.pow(this.race.cast.length,.3);pan.pan.value=(horse.lane-(this.race.cast.length-1)/2)/Math.max(1,this.race.cast.length)*1.3;gain.connect(pan);pan.connect(this.hooves);
   this.horseChannels.set(horse.id,{gain,pan,finish:horse.finish});
   // One continuous voice per horse, even with a detailed simulation timeline.
   // Scheduled rates integrate the same distance clock used by the rendered gait.
   const first=horse.segments[0];
   const voice=this.source(this.hoofBuffers.get(horse.id),gain,{loop:true,after:first.after/this.speed,offset:first.offset,rate:first.rate*this.speed});
   for(const segment of horse.segments)voice.playbackRate.setValueAtTime(segment.rate*this.speed,this.scheduleAnchor+segment.after/this.speed);
   voice.stop(this.scheduleAnchor+(horse.finish-time)/this.speed);
  }
  for(const cue of cueSchedule(this.plan,time,this.buffers.bugle.duration)){
   const gain=c.createGain();gain.gain.value=cue.id==='bugle'?1.05:.78;gain.connect(this.runGain);
   this.source(this.buffers[cue.id],gain,{after:cue.after/this.speed,offset:cue.offset,rate:this.speed,duration:cue.duration});
   this.events.push({id:cue.id,raceTime:cue.id==='shot'?this.plan.delay:time,after:cue.after/this.speed,generation:this.generation});if(this.events.length>100)this.events.shift();
  }
  for(const event of powerEvents(this.race)) {
   if(event.time<time)continue; // Joining late never replays old attacks.
   const gain=c.createGain();gain.gain.value=.35;gain.connect(this.runGain);
   this.source(powerSound(c,event.power),gain,{after:(event.time-time)/this.speed,rate:this.speed});
   this.events.push({id:event.id,raceTime:event.time,generation:this.generation});
   if(this.events.length>100)this.events.shift();
  }
  this.updateGains(time,'broadcast',true);
 }
 updateGains(time,shot,immediate=false,view=[],sample){
  if(!this.ctx||!this.ambience)return;this.shot=shot;this.profile=crowdProfile(this.race,this.plan,time,shot,sample);const now=this.ctx.currentTime;
  const hoofLevel=(shot==='aerial'?.22:['rail','chase'].includes(shot)?.82:.6)*this.hoofVolume*(time<this.plan.delay?0:1);
  for(const [id,channel] of this.horseChannels){
   const rider=view.find(r=>r.id===id);
   if(rider)channel.pan.pan.setTargetAtTime(rider.pan,now,.12);
   const distance=rider?Math.max(.4,Math.min(1,40/Math.max(1,rider.distance))):1;
   channel.gain.gain.setTargetAtTime(time>=channel.finish?0:distance/Math.pow(this.race.cast.length,.3),now,.06);
  }
  for(const [param,value] of [[this.ambience.gain,this.profile.ambience],[this.cheers.gain,this.profile.cheer],[this.filter.frequency,this.profile.lowpass],[this.hooves.gain,hoofLevel]]){
   if(immediate)param.setValueAtTime(value,now);else param.setTargetAtTime(value,now,.16);
  }
 }
 sync(race,time,playing,speed,shot,view=[],sample){this.cursor=time;this.speed=speed;if(!playing){if(this.playing)this.pause();return;}if(this.playing&&this.buffers)this.updateGains(time,shot,false,view,sample);}
 captureStream(){if(!this.ctx)throw Error('Press Play first');if(!this.capture){this.capture=this.ctx.createMediaStreamDestination();this.limiter.connect(this.capture);}return this.capture.stream;}
 get diagnostics(){return {state:this.ctx?.state??'locked',playing:this.playing,muted:this.muted,volume:this.masterVolume,crowdVolume:this.crowdVolume,hoofVolume:this.hoofVolume,hoofRiders:this.playing?[...this.horseChannels.values()].filter(h=>this.cursor>=this.plan.delay&&this.cursor<h.finish).length:0,horseVoices:this.horseChannels.size,loaded:this.buffers?Object.keys(this.buffers):[],activeSources:this.sources.size,hoofGain:this.hooves?.gain.value??0,profile:this.profile,events:this.events.map(e=>({...e}))};}
 dispose(){this.pause();void this.ctx?.close();}
}
