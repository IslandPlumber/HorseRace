import * as THREE from 'three';
import {trackPoint,circuitLength} from './track.js';
import {parkScenery} from './park-scenery.js';
const smooth=u=>{u=THREE.MathUtils.clamp(u,0,1);return u*u*(3-2*u);};
export function createCourse(race,parent) {
 const t=race.track,n=race.cast.length,width=n*t.laneWidth+2,perimeter=circuitLength(t);
 const group=new THREE.Group();parent.add(group);
 const scenery=parkScenery(race,group);
 const mats={dirt:new THREE.MeshStandardMaterial({color:0xb89a6d,roughness:1}),rail:new THREE.MeshStandardMaterial({color:0xf3ead6}),dark:new THREE.MeshStandardMaterial({color:0x263e34}),gold:new THREE.MeshStandardMaterial({color:0xd8b969}),white:new THREE.MeshStandardMaterial({color:0xfaf1da})};
 const mesh=(geo,mat,x=0,y=0,z=0,p=group)=>{const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;p.add(o);return o;};
 const box=(x,y,z,mat,px,py,pz,p=group)=>mesh(new THREE.BoxGeometry(x,y,z),mat,px,py,pz,p);
 const label=(text,x,y,z,size=6)=>{const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#18372d';ctx.fillRect(0,0,512,96);ctx.fillStyle='#f5db97';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 43px system-ui';ctx.fillText(text,256,48);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const o=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthWrite:false}));o.position.set(x,y,z);o.scale.set(size,size*96/512,1);group.add(o);return o;};
 // A continuous dirt ribbon sampled from the same centerline as the racers.
 const positions=[],uv=[],indices=[],steps=384;
 for(let i=0;i<=steps;i++)for(const side of [-1,1]){const p=trackPoint(t,perimeter*i/steps,side*width/2);positions.push(p.x,.005,p.z);uv.push(i/steps*40,(side+1)/2);}
 for(let i=0;i<steps;i++){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
 const ribbon=new THREE.BufferGeometry();ribbon.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));ribbon.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));ribbon.setIndex(indices);ribbon.computeVertexNormals();
 const noise=document.createElement('canvas');noise.width=noise.height=128;const ctx=noise.getContext('2d'),data=ctx.createImageData(128,128);for(let i=0;i<data.data.length;i+=4){const v=190+((i*37^(i>>5))%42);data.data[i]=v;data.data[i+1]=v-15;data.data[i+2]=v-37;data.data[i+3]=255;}ctx.putImageData(data,0,0);const dirtTex=new THREE.CanvasTexture(noise);dirtTex.wrapS=dirtTex.wrapT=THREE.RepeatWrapping;dirtTex.colorSpace=THREE.SRGBColorSpace;mats.dirt.map=dirtTex;mats.dirt.side=THREE.DoubleSide;mesh(ribbon,mats.dirt);
 class Rail extends THREE.Curve {constructor(offset,y){super();this.offset=offset;this.y=y;}getPoint(u,target=new THREE.Vector3()){const p=trackPoint(t,u*perimeter,this.offset);return target.set(p.x,this.y,p.z);}}
 for(const side of [-1,1]){
  const offset=side*(width/2+.25);
  for(const y of [.7,1.3])mesh(new THREE.TubeGeometry(new Rail(offset,y),320,.055,4,true),mats.rail);
  const count=Math.ceil(perimeter/4),posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,1.5,.12),mats.rail,count),m=new THREE.Matrix4();
  for(let i=0;i<count;i++){const p=trackPoint(t,i*perimeter/count,offset);m.makeTranslation(p.x,.73,p.z);posts.setMatrixAt(i,m);}posts.castShadow=true;group.add(posts);
 }
 // Green infield, a small reflecting pond and track-side planting.
 const pond=mesh(new THREE.CircleGeometry(1,48),new THREE.MeshStandardMaterial({color:0x477f86,roughness:.25}),-13,.012,-3);pond.rotation.x=-Math.PI/2;pond.scale.set(19,8,1);
 label('STREAKCHAT PARK',12,2,0,24);
 // Low grandstand overlooking the home straight: terraced benches and canopy.
 const standZ=t.shortStraight/2+t.radius+width/2+12;
 for(let row=0;row<6;row++){box(64,.45,2.7,new THREE.MeshStandardMaterial({color:row%2?0x49665c:0x5e776b}),-5,.6+row*.7,standZ+row*2.5);}
 const heads=new THREE.InstancedMesh(new THREE.SphereGeometry(.20,6,4),new THREE.MeshStandardMaterial({color:0xffffff}),150);
 const bodies=new THREE.InstancedMesh(new THREE.BoxGeometry(.38,.55,.4),new THREE.MeshStandardMaterial({color:0xffffff}),150);
 const matrix=new THREE.Matrix4(),palette=[0xe4c193,0x8b6145,0xc28f72,0xc7ae92],shirts=[0xb85548,0xe1c36a,0x4a7b92,0x486c59,0xe2dfd2];
 for(let i=0;i<150;i++){const row=Math.floor(i/25),x=-34+(i%25)*2.4,z=standZ+row*2.5,y=.6+row*.7;matrix.makeTranslation(x,y+.6,z);heads.setMatrixAt(i,matrix);heads.setColorAt(i,new THREE.Color(palette[i%palette.length]));matrix.makeTranslation(x,y+.2,z);bodies.setMatrixAt(i,matrix);bodies.setColorAt(i,new THREE.Color(shirts[(i*7)%shirts.length]));}group.add(heads,bodies);
 for(const x of [-35,-15,5,25])box(.25,9,.25,mats.dark,x,4.5,standZ+9);
 box(68,.35,18,mats.dark,-5,9,standZ+7);label('THE HOME STRAIGHT',-5,10.2,standZ+7,27);
 // Corner numbers sit safely in the infield, not in a racing lane.
 for(let k=1;k<=4;k++){
  const s=t.straight+(k===1?0:k===2?Math.PI*t.radius/2+t.shortStraight:k===3?Math.PI*t.radius+t.shortStraight+t.straight:Math.PI*t.radius*1.5+2*t.shortStraight+t.straight)+Math.PI*t.radius/4-t.startOffset;
  const p=trackPoint(t,s,-width/2-5);label(`TURN ${k}`,p.x,3,p.z,7);
 }
 for(let remaining=100;remaining<t.length;remaining+=100){const d=t.length-remaining;const p=trackPoint(t,d,width/2+2);box(.15,2.3,.15,mats.dark,p.x,1.1,p.z);label(`${Math.round(t.length-d)} m`,p.x,3,p.z,5);}
 const finish=trackPoint(t,t.length),finishGroup=new THREE.Group();finishGroup.position.set(finish.x,0,finish.z);finishGroup.rotation.y=-finish.heading;group.add(finishGroup);
 const checks=Math.ceil(width/.65);for(let row=0;row<2;row++)for(let c=0;c<checks;c++)box(.4,.025,width/checks,(row+c)%2?mats.dark:mats.white,(row-.5)*.4,.025,(c+.5)*width/checks-width/2,finishGroup);
 for(const side of [-1,1])box(.25,7,.25,mats.dark,0,3.5,side*(width/2+.7),finishGroup);
 const finishSign=label('FINISH',finish.x,7.5,finish.z,10);
 // Starting stalls are removed sideways after the field has departed.
 const start=trackPoint(t,0),gate=new THREE.Group();gate.position.set(start.x,0,start.z);gate.rotation.y=-start.heading;group.add(gate);
 box(.28,.25,width,mats.dark,2.5,4.9,0,gate);box(.28,.25,width,mats.dark,-2.5,4.9,0,gate);const doors=[];
 const gateSign=label('STARTING GATE',0,0,0,12);group.remove(gateSign);gate.add(gateSign);gateSign.position.set(0,5.9,0);
 for(let lane=0;lane<n;lane++){
  const z=(lane-(n-1)/2)*t.laneWidth;
  for(const edge of [-1,1]){
   box(.16,4.8,.16,mats.dark,2.5,2.4,z+edge*t.laneWidth/2,gate);
   box(5,.12,.10,mats.rail,0,1.8,z+edge*t.laneWidth/2,gate);
   const hinge=new THREE.Group();hinge.position.set(2.5,0,z+edge*(t.laneWidth/2-.08));gate.add(hinge);
   box(.09,1.6,t.laneWidth/2-.12,mats.gold,0,1.6,-edge*t.laneWidth/4,hinge);doors.push({hinge,edge});
  }
  const plate=label(String(lane+1),0,0,0,1.2);group.remove(plate);gate.add(plate);plate.position.set(2.6,4.2,z);
 }
 return {group,gate,doors,finish,update(time,sample){scenery.update(time,sample);const delay=race.startDelay??0;const open=smooth((time-(delay-.5))/.5);for(const {hinge,edge} of doors)hinge.rotation.y=edge*open*Math.PI/2;const retract=smooth((time-delay-3)/2);finishSign.visible=retract>=1;gate.position.set(start.x-Math.sin(start.heading)*retract*(width+12),0,start.z+Math.cos(start.heading)*retract*(width+12));gate.visible=retract<1;},finishSign};
}
