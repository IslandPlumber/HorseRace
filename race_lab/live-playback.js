/** Render only confirmed history, using a monotonic clock between snapshots. */
export class LivePlaybackClock {
  constructor({delay=1.15,pollMs=300,now=()=>performance.now()}={}) {
    this.now=now;this.baseDelay=delay;this.pollMs=pollMs;this.id=null;
    this.time=0;this.head=0;this.delay=delay;this.rate=1;this.underruns=0;this.starvedMs=0;this.rebuffering=false;this.snapshots=0;
  }
  observe(race,{serverTime,receivedAt=this.now(),requestMs=0}={}) {
    const def=race?.definition;if(!def?.live)return;
    const head=def.availableTime,elapsed=Number.isFinite(serverTime)?Math.max(0,(serverTime-race.starts)/1000):head;
    const rtt=Math.max(0,requestMs)/1000,newRace=this.id!==race.id;
    if(newRace){
      this.id=race.id;this.head=head;this.completed=def.completed;
      this.interval=this.pollMs/1000;this.minRtt=rtt;this.delay=Math.max(this.baseDelay,Math.max(this.interval,rtt)+rtt/2+.15);
      this.serverAt=elapsed+rtt/2;this.serverAnchor=receivedAt;
      this.time=Math.max(0,Math.min(head,this.serverAt-this.delay));this.priming=this.serverAt<this.delay&&head<this.delay;this.lastFrame=receivedAt;
      this.lastSnapshot=receivedAt;this.lastTrusted=receivedAt;this.underruns=0;this.starvedMs=0;this.rebuffering=false;this.snapshots=0;
    } else {
      const gap=Math.max(0,(receivedAt-this.lastSnapshot)/1000);
      this.interval=this.interval*.8+Math.min(3,gap)*.2;
      this.minRtt=Math.min(this.minRtt+.002,rtt);
      // A delayed account/directory response never sets this clock. Even for
      // room responses, reject unusually old timing samples while retaining
      // their useful confirmed motion history.
      if(rtt<=this.minRtt+.1 || receivedAt-this.lastTrusted>5000){
        this.serverAt=elapsed+this.minRtt/2;this.serverAnchor=receivedAt;this.lastTrusted=receivedAt;
      }
      const required=Math.min(3,Math.max(this.baseDelay,this.interval+rtt/2+.2));
      this.delay=required>this.delay?required:this.delay*.98+required*.02;
      this.head=Math.max(this.head,head);this.completed=def.completed;
      this.lastSnapshot=receivedAt;
    }
    this.snapshots++;
  }
  frame(at=this.now()) {
    if(!this.id)return 0;
    const elapsed=Math.max(0,(at-this.lastFrame)/1000);this.lastFrame=at;
    if(this.priming){
      if(this.head<this.delay&&!this.completed)return this.time;
      this.priming=false;
    }
    const estimated=this.serverAt+Math.max(0,(at-this.serverAnchor)/1000);
    const desired=Math.max(0,Math.min(this.head,estimated-this.delay));
    // Timing corrections change playback speed gently. They never move a horse
    // backwards, freeze it waiting for a wall-clock offset, or expose the future.
    this.rate=1+Math.max(-.08,Math.min(.04,(desired-this.time)*.12));
    const room=Math.max(0,this.head-this.time);
    if(this.rebuffering && (room>=Math.min(.65,this.delay*.65)||this.completed))this.rebuffering=false;
    if(this.rebuffering){this.starvedMs+=elapsed*1000;return this.time;}
    const next=this.time+elapsed*this.rate;
    if(next>this.head+1e-8&&!this.completed&&this.head>0){
      this.time=this.head;this.underruns++;this.rebuffering=true;
      this.starvedMs+=Math.max(0,elapsed-room/this.rate)*1000;
    }else this.time=Math.min(this.head,next);
    return this.time;
  }
  get diagnostics(){return {time:this.time,confirmedTime:this.head,headroom:Math.max(0,this.head-this.time),targetDelay:this.delay,rate:this.rate,underruns:this.underruns,starvedMs:this.starvedMs,rebuffering:this.rebuffering,priming:Boolean(this.priming),snapshotIntervalMs:this.interval*1000,snapshots:this.snapshots};}
}
