import * as THREE from 'three';
import {trackPoint,circuitLength} from './track.js';

export function parkSky(scene){
 const c=document.createElement('canvas');c.width=1024;c.height=512;const x=c.getContext('2d');
 const g=x.createLinearGradient(0,0,0,512);g.addColorStop(0,'#90b9ce');g.addColorStop(.6,'#c8dde2');g.addColorStop(1,'#f0e9cf');x.fillStyle=g;x.fillRect(0,0,1024,512);
 for(let i=0;i<12;i++){const cx=(i*173+60)%1024,cy=70+(i*57)%160;const cloud=x.createRadialGradient(cx,cy,2,cx,cy,90);cloud.addColorStop(0,'#ffffff35');cloud.addColorStop(1,'#ffffff00');x.fillStyle=cloud;x.fillRect(cx-90,cy-90,180,180);}
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;scene.background=texture;
 const lawn=document.createElement('canvas');lawn.width=lawn.height=128;const ctx=lawn.getContext('2d'),pixels=ctx.createImageData(128,128);
 for(let i=0;i<pixels.data.length;i+=4){const v=205+((i*31^(i>>3))%30);pixels.data[i]=v-9;pixels.data[i+1]=v;pixels.data[i+2]=v-12;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);
 const grass=new THREE.CanvasTexture(lawn);grass.wrapS=grass.wrapT=THREE.RepeatWrapping;grass.repeat.set(110,110);grass.colorSpace=THREE.SRGBColorSpace;return grass;
}

export function parkScenery(race,parent){
 const t=race.track,width=race.cast.length*t.laneWidth+2,perimeter=circuitLength(t),matrix=new THREE.Matrix4(),q=new THREE.Quaternion();
 const batch=(geometry,material,items)=>{const m=new THREE.InstancedMesh(geometry,material,items.length);items.forEach((p,i)=>{q.setFromAxisAngle(new THREE.Vector3(0,1,0),p.angle??0);matrix.compose(new THREE.Vector3(...p.position),q,new THREE.Vector3(...(p.scale??[1,1,1])));m.setMatrixAt(i,matrix);if(p.color)m.setColorAt(i,new THREE.Color(p.color));});parent.add(m);return m;};
 const matte=color=>new THREE.MeshStandardMaterial({color,roughness:.95});
 const hills=[];for(let i=0;i<16;i++){const a=i*Math.PI*2/16;hills.push({position:[Math.cos(a)*290,-19,Math.sin(a)*240],scale:[60+(i%3)*21,28+(i%4)*9,50+(i%2)*18],color:i%2?'#829b7d':'#93aa88'});}batch(new THREE.SphereGeometry(1,12,6),matte('#ffffff'),hills);
 const trees=[],trunks=[];for(let i=0;i<96;i++){
  const a=i*Math.PI*2/96,r=1+(i%3)*.08,x=Math.cos(a)*(t.straight/2+t.radius+width/2+29)*r,z=Math.sin(a)*(t.shortStraight/2+t.radius+width/2+34)*r;
  const h=4+(i%5)*.5;trunks.push({position:[x,h*.28,z],scale:[.33,h*.55,.33]});
  trees.push({position:[x,h*.8,z],scale:[2.2+(i%3)*.35,h*.6,2.1+(i%2)*.4],color:['#476c43','#547c4a','#66884f','#3d6748'][i%4]});
 }
 batch(new THREE.CylinderGeometry(1,1.2,1,6),matte('#776149'),trunks);
 batch(new THREE.IcosahedronGeometry(1,1),matte('#ffffff'),trees);
 // A promenade outside the rails, with a low clipped hedge beside the infield.
 const ribbon=(offset,half,color)=>{const pos=[],indices=[];for(let i=0;i<=192;i++)for(const side of[-1,1]){const p=trackPoint(t,i/192*perimeter,offset+side*half);pos.push(p.x,.018,p.z);}for(let i=0;i<192;i++){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();const mat=matte(color);mat.side=THREE.DoubleSide;const m=new THREE.Mesh(g,mat);m.receiveShadow=true;parent.add(m);};
 ribbon(width/2+6.2,1.3,'#c7b997');
 const hedge=[];for(let i=0;i<100;i++){const p=trackPoint(t,i/100*perimeter,-width/2-2);hedge.push({position:[p.x,.38,p.z],scale:[1.5,.6,.85],angle:-p.heading,color:i%2?'#456e3d':'#527943'});}batch(new THREE.IcosahedronGeometry(1,0),matte('#ffffff'),hedge);
 const z=-t.shortStraight/2-t.radius-width/2-25,walls=[],roofs=[],doors=[],windows=[];
 for(let i=0;i<3;i++){
  const x=-30+i*22;walls.push({position:[x,2.5,z],scale:[16,5,10],color:['#dfd6ba','#c8d1bd','#e7ddc3'][i]});
  roofs.push({position:[x,5,z],scale:[18,3,12]});doors.push({position:[x,1.5,z+5.02],scale:[3,3,.08]});
  for(const dx of[-5,5])windows.push({position:[x+dx,2.8,z+5.05],scale:[1.8,1.7,.09]});
 }
 const roof=new THREE.BufferGeometry();roof.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,-.5,.5,0,-.5,.5,0,.5,-.5,0,.5,-.5,1,0,.5,1,0],3));roof.setIndex([0,3,4,1,5,2,0,4,5,0,5,1,3,2,5,3,5,4]);roof.computeVertexNormals();const roofMat=matte('#54665b');roofMat.side=THREE.DoubleSide;
 batch(new THREE.BoxGeometry(1,1,1),matte('#ffffff'),walls);batch(roof,roofMat,roofs);batch(new THREE.BoxGeometry(1,1,1),matte('#324d40'),doors);batch(new THREE.BoxGeometry(1,1,1),matte('#d3e5dc'),windows);
 const flags=[],poles=[];
 for(let i=0;i<8;i++){const p=trackPoint(t,i/8*perimeter,width/2+3.3);poles.push({position:[p.x,3,p.z],scale:[.09,6,.09]});const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.9),new THREE.MeshStandardMaterial({color:i%2?'#d8b969':'#275343',side:THREE.DoubleSide,roughness:.9}));flag.position.set(p.x+.85,5.5,p.z);flag.rotation.y=-p.heading;parent.add(flag);flags.push(flag);}batch(new THREE.BoxGeometry(1,1,1),matte('#e6dfc8'),poles);
 // Small ground-level dust, bounded by actual runners; no particles before gates.
 const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d'),fade=ctx.createRadialGradient(16,16,0,16,16,16);fade.addColorStop(0,'#c1a47b88');fade.addColorStop(1,'#c1a47b00');ctx.fillStyle=fade;ctx.fillRect(0,0,32,32);
 const positions=new Float32Array(race.cast.length*4*3);positions.fill(-1000);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));const dust=new THREE.Points(geometry,new THREE.PointsMaterial({map:new THREE.CanvasTexture(c),size:1.7,transparent:true,opacity:.28,depthWrite:false}));dust.frustumCulled=false;parent.add(dust);
 return{update(time,sample){flags.forEach((f,i)=>f.scale.x=.94+.06*Math.sin(time*1.6+i));if(!sample)return;let k=0;for(const r of sample.runners)for(let j=0;j<4;j++){const age=(time*.9+j*.25+r.lane*.13)%1,behind=1.5+age*2.5;const active=time>=(race.startDelay??0)&&!r.finished;positions[k++]=active?r.x-Math.cos(r.heading)*behind+Math.sin(r.heading)*(j-1.5)*.18:-1000;positions[k++]=active?.12+age*.7:-1000;positions[k++]=active?r.z-Math.sin(r.heading)*behind-Math.cos(r.heading)*(j-1.5)*.18:-1000;}geometry.attributes.position.needsUpdate=true;}};
}
