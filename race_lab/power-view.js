import * as THREE from 'three';
import {POWERS, powerEvents, activePowerEffects} from './powers.js';

/** A small fixed pool of cartoon props. Absolute replay time, no local timers. */
export class PowerView {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'signature-powers';
    scene.add(this.root);
    this.groups = new Map();
    this.rings = new Map();
    this.reactions = new Map();
    this.spectacles = new Map();
    this.dummy = new THREE.Object3D();
    this.feedSignature = '';
    for (const [id, p] of Object.entries(POWERS)) {
      const group = new THREE.Group();
      const props = Array.from({length: 3}, () => {
        const prop = new THREE.Group();
        const mesh = (geometry, color, x=0,y=0,z=0) => {
          const part = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color, roughness:.65}));
          part.position.set(x,y,z); prop.add(part); return part;
        };
        if (id === 'trump') {
          mesh(new THREE.SphereGeometry(.75,12,8,0,Math.PI*2,0,Math.PI/2),p.color);
          mesh(new THREE.BoxGeometry(1.25,.12,1.4),p.color,.4,.05,0);
          mesh(new THREE.BoxGeometry(.38,.22,.04),'#fff4d0',.06,.35,-.68);
        } else if (id === 'elon') {
          mesh(new THREE.CylinderGeometry(.35,.35,1.8,12),'#e1edf4').rotation.z=Math.PI/2;
          mesh(new THREE.ConeGeometry(.35,.8,12),'#ee5f40',1.3,0,0).rotation.z=-Math.PI/2;
          mesh(new THREE.ConeGeometry(.42,1.8,12),'#ffbc49',-1.5,0,0).rotation.z=Math.PI/2;
          mesh(new THREE.BoxGeometry(.65,.08,1.2),'#78d7ff',-.6,0,0);
        } else if (id === 'biden') {
          mesh(new THREE.ConeGeometry(.45,1.3,12),'#d29b50',0,-.6).rotation.z=Math.PI;
          mesh(new THREE.SphereGeometry(.56,12,8),'#ffcfdb',0,.3);
          mesh(new THREE.SphereGeometry(.48,12,8),'#fff4dc',0,.95);
        } else if (id === 'bernie') {
          for (const side of [-1,1]) {
            mesh(new THREE.SphereGeometry(.48,12,8),'#c78958',side*.6);
            mesh(new THREE.SphereGeometry(.23,10,6),'#edd3ad',side*.25,-.1,.15);
            mesh(new THREE.BoxGeometry(.75,.17,.7),'#fff0d3',side*.6,-.3);
          }
        } else if (id === 'mcconnell') {
          for (let n=0;n<5;n++) {
            const sheet=mesh(new THREE.BoxGeometry(.9,.05,1.25),'#fff5df',(n-2)*.45,n*.26,(n%2)*.4);
            sheet.rotation.y=n*.65;
          }
        } else if (id === 'gordon') {
          mesh(new THREE.CylinderGeometry(.7,.7,.16,18),'#444c51').rotation.x=Math.PI/2;
          mesh(new THREE.BoxGeometry(.18,1.4,.15),'#b48656',0,-1.2);
        } else {
          for (let n=0;n<5;n++) mesh(new THREE.SphereGeometry(.65,10,8),p.color,
            Math.cos(n*2.4)*.65,Math.sin(n*1.3)*.4,Math.sin(n*2.4)*.65);
          mesh(new THREE.BoxGeometry(.12,1,.12),'#214b3c',.3,.8,0);
          mesh(new THREE.SphereGeometry(.22,8,6),'#214b3c',.14,.3,0);
        }
        group.add(prop); return prop;
      });
      group.visible=false; this.root.add(group); this.groups.set(id,{group,props});
      const ring=new THREE.Mesh(new THREE.RingGeometry(1.8,2.15,32),
        new THREE.MeshBasicMaterial({color:p.color,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
      ring.rotation.x=-Math.PI/2; ring.visible=false; this.root.add(ring); this.rings.set(id,ring);
      const reaction=new THREE.Group(),starShape=new THREE.Shape();
      for(let n=0;n<10;n++){const angle=n*Math.PI/5,r=n%2?.15:.35;const x=Math.cos(angle)*r,y=Math.sin(angle)*r;n?starShape.lineTo(x,y):starShape.moveTo(x,y);}
      starShape.closePath();
      const stars=Array.from({length:5},()=>{const star=new THREE.Mesh(new THREE.ShapeGeometry(starShape),new THREE.MeshBasicMaterial({color:'#ffe17d',side:THREE.DoubleSide}));reaction.add(star);return star;});
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=80;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#24251cec';ctx.fillRect(0,0,256,80);ctx.fillStyle='#ffe17d';ctx.font='900 40px system-ui';ctx.textAlign='center';ctx.fillText('BONK!',128,55);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthWrite:false}));label.scale.set(3.6,1.1,1);reaction.add(label);
      reaction.visible=false;this.root.add(reaction);this.reactions.set(id,{group:reaction,stars,label,canvas,texture,lastLabel:''});
      const flair=new THREE.Group();flair.visible=false;this.root.add(flair);
      const wave=new THREE.Mesh(new THREE.RingGeometry(.8,1.05,40),new THREE.MeshBasicMaterial({color:p.color,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));wave.rotation.x=-Math.PI/2;flair.add(wave);
      const trail=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.28,0),new THREE.MeshBasicMaterial({color:p.color,transparent:true,opacity:.85,depthWrite:false}),24);
      trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);trail.frustumCulled=false;flair.add(trail);
      this.spectacles.set(id,{group:flair,wave,trail});
    }
  }
  update(race, sample, time) {
    const events=powerEvents(race), byId=new Map(sample.runners.map(r=>[r.id,r]));
    const impact=events.filter(e=>e.impact&&e.targets.some(id=>!byId.get(id)?.finished)&&time>=e.hitTime&&time<e.hitTime+1.2).at(-1);
    const launch=events.filter(e=>e.spectacle&&time>=e.time&&time<e.time+1.8).at(-1),notice=impact??launch;
    const banner=document.getElementById('power-impact');
    if(banner){banner.hidden=!notice;const text=impact?`${impact.actor==='gordon'?'BONK!':impact.actor==='trump'?'HAT TRICK!':'FILIBUSTERED!'} ${impact.targets.join(', ').toUpperCase()} · Regaining stride`:launch?`${POWERS[launch.actor].name.toUpperCase()}!`:'';if(banner.textContent!==text)banner.textContent=text;banner.dataset.kind=impact?'impact':'launch';if(notice)banner.style.borderColor=POWERS[notice.actor].color;}
    for(const [id,{group,props}] of this.groups) {
      const event=events.find(e=>e.actor===id && time>=e.time && time<e.time+e.duration);
      group.visible=Boolean(event);
      if(!event)continue;
      const source=byId.get(id),elapsed=time-event.time, p=POWERS[id];
      props.forEach((prop,index)=>{
        const target=byId.get(event.targets[index]);
        prop.visible=index===0||Boolean(target);
        if(!prop.visible)return;
        const u=Math.min(1,elapsed/Math.max(.001,event.hitTime-event.time));
        if(p.slow&&target) {
          prop.position.set(source.x+(target.x-source.x)*u,3+Math.sin(u*Math.PI)*(event.spectacle?8:3),source.z+(target.z-source.z)*u);
          prop.rotation.set(.3,elapsed*8+index,Math.sin(elapsed*6)*.3);
          if(u===1)prop.position.y=3.7+Math.sin(elapsed*8+index)*.4;
        } else if(id==='bernie'&&target) {
          prop.position.set(target.x,4.8+Math.sin(elapsed*7)*.3,target.z);
          prop.rotation.set(0,elapsed*2,0);
        } else {
          const ahead=id==='biden'?3:id==='elon'?-1.7:0;
          prop.position.set(source.x+Math.cos(source.heading)*ahead, id==='elon'?2.4:4.6,source.z+Math.sin(source.heading)*ahead);
          prop.rotation.set(0,-source.heading,id==='biden'?Math.sin(elapsed*6)*.15:0);
        }
        prop.scale.setScalar((event.spectacle?2.4:1)*(1+Math.sin(elapsed*12)*.10));
      });
    }
    for(const [id,fx] of this.spectacles){
      const event=events.find(e=>e.spectacle&&e.actor===id&&time>=e.time&&time<Math.max(e.time+e.duration,e.hitTime+1.5));
      fx.group.visible=Boolean(event);if(!event)continue;
      const source=byId.get(id),target=byId.get(event.targets[0]),elapsed=time-event.time,hit=target&&time>=event.hitTime;
      const center=hit&&!event.assist?target:source,age=hit?time-event.hitTime:elapsed;
      fx.wave.position.set(center.x,.18,center.z);fx.wave.scale.setScalar(2+Math.min(age,1.3)*7);fx.wave.material.opacity=Math.max(0,.85-age*.65);
      for(let n=0;n<24;n++){
        const phase=(elapsed*1.4+n/24)%1,angle=n*2.399+elapsed*1.8;
        if(event.targets.length&&!event.assist){
          const victim=byId.get(event.targets[n%event.targets.length]);
          this.dummy.position.set(victim.x+Math.cos(angle)*(1+phase*4),1+Math.sin(phase*Math.PI)*5,victim.z+Math.sin(angle)*(1+phase*4));
        }else{
          const behind=1+phase*15,spread=Math.sin(n*7.13)*phase*2.5;
          this.dummy.position.set(source.x-Math.cos(source.heading)*behind+Math.sin(source.heading)*spread,.4+Math.sin(phase*Math.PI)*3,source.z-Math.sin(source.heading)*behind-Math.cos(source.heading)*spread);
        }
        this.dummy.rotation.set(elapsed*3+n,angle,elapsed*2);this.dummy.scale.setScalar(.6+(1-phase)*1.8);this.dummy.updateMatrix();fx.trail.setMatrixAt(n,this.dummy.matrix);
      }
      fx.trail.instanceMatrix.needsUpdate=true;
    }
    for(const runner of sample.runners) {
      const ring=this.rings.get(runner.id),active=activePowerEffects(race,runner.id,time);
      ring.visible=active.length>0&&!runner.finished;
      if(ring.visible){ring.position.set(runner.x,.12,runner.z);ring.material.color.set(active.some(a=>a.kind==='slow')?'#ff826e':POWERS[runner.id].color);ring.scale.setScalar(1+Math.sin(time*12)*.09);}
      const reaction=this.reactions.get(runner.id),hit=active.find(e=>e.kind==='slow'&&e.event.impact);
      reaction.group.visible=Boolean(hit)&&!runner.finished;
      if(reaction.group.visible){
        const elapsed=time-hit.event.hitTime,text=hit.event.actor==='gordon'?'BONK!':hit.event.actor==='trump'?'CAPPED!':'BLAH BLAH!';
        if(text!==reaction.lastLabel){const ctx=reaction.canvas.getContext('2d');ctx.clearRect(0,0,256,80);ctx.fillStyle='#24251cec';ctx.fillRect(0,0,256,80);ctx.fillStyle='#ffe17d';ctx.font='900 36px system-ui';ctx.textAlign='center';ctx.fillText(text,128,53);reaction.texture.needsUpdate=true;reaction.lastLabel=text;}
        reaction.group.position.set(runner.x,5.1,runner.z);
        reaction.group.scale.setScalar(hit.event.spectacle?1.6:1);
        reaction.label.position.set(0,1.7+Math.sin(elapsed*7)*.1,0);
        reaction.stars.forEach((star,n)=>{const angle=elapsed*5+n*Math.PI*2/5;star.position.set(Math.cos(angle)*1.25,Math.sin(angle*2)*.25+.4,Math.sin(angle)*1.25);star.rotation.set(.25,angle,elapsed*3);});
      }
    }
    const feed=document.getElementById('power-feed');
    if(!feed)return;
    const past=events.filter(e=>e.time<=time).sort((a,b)=>b.time-a.time).slice(0,4);
    const signature=`${race.id}:${past.map(e=>e.id).join(',')}`;
    feed.hidden=!race.simulation?.powers;
    if(signature===this.feedSignature)return;
    this.feedSignature=signature;
    feed.replaceChildren();
    const heading=document.createElement('h3');heading.textContent='Trackside antics';feed.append(heading);
    if(!past.length){const note=document.createElement('p');note.textContent=race.simulation?.specials?'One big move per rider. Choose your moment — activating it spends game coins.':'Player powers wait for your button or F. CPU riders choose their moment.';feed.append(note);}
    for(const event of past){const row=document.createElement('p'),tag=document.createElement('strong');tag.textContent=`${event.time.toFixed(1)}s · ${POWERS[event.actor].name}`;row.append(tag,document.createTextNode(event.detail ?? event.text.slice(event.text.indexOf('! ')+2)));feed.append(row);}
  }
  get diagnostics(){return {active:[...this.groups].filter(([,g])=>g.group.visible).map(([id])=>id),victims:[...this.reactions].filter(([,r])=>r.group.visible).map(([id])=>id),spectacles:[...this.spectacles].filter(([,r])=>r.group.visible).map(([id])=>id),maxPropScale:Math.max(0,...[...this.groups.values()].filter(g=>g.group.visible).flatMap(g=>g.props.filter(p=>p.visible).map(p=>p.scale.x))),props:21};}
  dispose(){this.root.traverse(o=>{if(o.isInstancedMesh)o.dispose();o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});this.root.removeFromParent();}
}
