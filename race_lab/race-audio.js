import {buildAudioPlan,crowdProfile,cueSchedule} from './audio-plan.js';
const clamp=x=>Math.max(0,Math.min(1,x));
export function starterShot(context){
 const b=context.createBuffer(1,Math.ceil(context.sampleRate*.65),context.sampleRate),data=b.getChannelData(0);let seed=7331;
 for(let i=0;i<data.length;i++){const t=i/context.sampleRate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;
 data[i]=noise*(.85*Math.exp(-t*95)+.25*Math.exp(-t*16))+Math.sin(2*Math.PI*(190*t-80*t*t))*.25*Math.exp(-t*32)+(t>.06?noise*.10*Math.exp(-(t-.06)*20):0);}
 let peak=0;for(const n of data)peak=Math.max(peak,Math.abs(n));for(let i=0;i<data.length;i++)data[i]*=.82/peak;return b;
}
export class RaceAudio {
 constructor({embedded={},onStatus=()=>{}}={}){
  this.onStatus=onStatus;this.ctx=null;this.buffers=null;this.sources=new Set();this.generation=0;this.playing=false;this.race=null;this.cursor=0;this.speed=1;this.masterVolume=.65;this.muted=false;this.events=[];this.profile=null;
  try{const stored=JSON.parse(localStorage.getItem('race-audio-v1')??'null');if(stored){this.masterVolume=clamp(Number(stored.volume)||0);this.muted=Boolean(stored.muted);}}catch{}
  this.embedded=embedded;this.raw=null;this.rawError=null;this.preload();
 }
 preload(){
  this.rawError=null;
  this.raw=Promise.all(['bugle','crowd','cheer'].map(async id=>{const response=await fetch(this.embedded[id]??`./audio/${id}.mp3?v=race-audio-1`);if(!response.ok)throw Error(`Could not load ${id} audio`);return[id,await response.arrayBuffer()];})).catch(error=>{this.rawError=error;return null;});
 }
 async unlock(){
  if(!this.ctx){const Constructor=globalThis.AudioContext??globalThis.webkitAudioContext;if(!Constructor)throw Error('Audio is unavailable in this browser');
   this.ctx=new Constructor();this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:this.masterVolume*.65;
   this.limiter=this.ctx.createDynamicsCompressor();this.limiter.threshold.value=-10;this.limiter.knee.value=6;this.limiter.ratio.value=8;this.limiter.attack.value=.003;this.limiter.release.value=.18;this.master.connect(this.limiter);this.limiter.connect(this.ctx.destination);
  }
  // Resume synchronously in the Play/Sound click handler, before any fetch awaits.
  await this.ctx.resume();
  if(!this.buffers){if(this.rawError)this.preload();const raw=await this.raw;if(!raw)throw this.rawError;const decoded=await Promise.all(raw.map(async([id,b])=>[id,await this.ctx.decodeAudioData(b.slice(0))]));this.buffers=Object.fromEntries(decoded);this.buffers.shot=starterShot(this.ctx);}
  this.onStatus('ready');
 }
 persist(){try{localStorage.setItem('race-audio-v1',JSON.stringify({volume:this.masterVolume,muted:this.muted}));}catch{}}
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
  this.stopSources();const generation=++this.generation;this.playing=true;this.race=race;this.cursor=time;this.speed=speed;this.plan=buildAudioPlan(race);
  try{await this.unlock();if(generation!==this.generation||!this.playing)return;this.schedule(this.cursor);}
  catch(error){if(generation!==this.generation)return;this.playing=false;this.onStatus('error',error);}
 }
 source(buffer,gain,{loop=false,after=0,offset=0,rate=1,duration}={}){
  const s=this.ctx.createBufferSource();s.buffer=buffer;s.loop=loop;s.playbackRate.value=rate;s.connect(gain);this.sources.add(s);s.onended=()=>{this.sources.delete(s);s.disconnect();};
  const when=this.ctx.currentTime+after;s.start(when,offset);if(duration!==undefined)s.stop(when+duration/rate);return s;
 }
 schedule(time){
  const c=this.ctx;this.runGain=c.createGain();this.runGain.gain.setValueAtTime(0,c.currentTime);this.runGain.gain.linearRampToValueAtTime(1,c.currentTime+.035);this.runGain.connect(this.master);
  this.ambience=c.createGain();this.cheers=c.createGain();this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.Q.value=.3;this.ambience.connect(this.filter);this.cheers.connect(this.filter);this.filter.connect(this.runGain);
  this.source(this.buffers.crowd,this.ambience,{loop:true,offset:time%this.buffers.crowd.duration});
  this.source(this.buffers.cheer,this.cheers,{loop:true,offset:(time+4)%this.buffers.cheer.duration});
  for(const cue of cueSchedule(this.plan,time,this.buffers.bugle.duration)){
   const gain=c.createGain();gain.gain.value=cue.id==='bugle'?1.05:.78;gain.connect(this.runGain);
   this.source(this.buffers[cue.id],gain,{after:cue.after/this.speed,offset:cue.offset,rate:this.speed,duration:cue.duration});
   this.events.push({id:cue.id,raceTime:cue.id==='shot'?this.plan.delay:time,after:cue.after/this.speed,generation:this.generation});if(this.events.length>100)this.events.shift();
  }
  this.updateGains(time,'broadcast',true);
 }
 updateGains(time,shot,immediate=false){
  if(!this.ctx||!this.ambience)return;this.profile=crowdProfile(this.race,this.plan,time,shot);const now=this.ctx.currentTime;
  for(const [param,value] of [[this.ambience.gain,this.profile.ambience],[this.cheers.gain,this.profile.cheer],[this.filter.frequency,this.profile.lowpass]]){
   if(immediate)param.setValueAtTime(value,now);else param.setTargetAtTime(value,now,.16);
  }
 }
 sync(race,time,playing,speed,shot){this.cursor=time;this.speed=speed;if(!playing){if(this.playing)this.pause();return;}if(this.playing&&this.buffers)this.updateGains(time,shot);}
 captureStream(){if(!this.ctx)throw Error('Press Play first');if(!this.capture){this.capture=this.ctx.createMediaStreamDestination();this.limiter.connect(this.capture);}return this.capture.stream;}
 get diagnostics(){return {state:this.ctx?.state??'locked',playing:this.playing,muted:this.muted,volume:this.masterVolume,loaded:this.buffers?Object.keys(this.buffers):[],activeSources:this.sources.size,profile:this.profile,events:this.events.map(e=>({...e}))};}
 dispose(){this.pause();void this.ctx?.close();}
}
