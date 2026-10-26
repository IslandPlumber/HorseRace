import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateRace, sampleRace, generateRace } from './race-core.js';
import { runnerStatus } from './training.js';
import {trackPoint,raceSection,circuitLength} from './track.js';
import {createCourse} from './course-view.js';
import {RaceAudio} from './race-audio.js';
import {MultiplayerUI} from './multiplayer.js';
import {gaitClock} from './gait.js';
import {parkSky} from './park-scenery.js';
import {PowerView} from './power-view.js';
import {powerStatus} from './powers.js';
let multiplayer=null;
let needsRender=true;

const $ = (id) => document.getElementById(id);
const names = { trump: 'Donald Trump', biden: 'Joe Biden', mcconnell: 'Mitch McConnell', bernie: 'Bernie Sanders', elon: 'Elon Musk', gordon: 'Gordon Ramsay', snoop: 'Snoop Dogg' };
const embedded = globalThis.RACE_LAB_EMBEDDED || {};
const raceAudio=new RaceAudio({embedded:embedded.audio,onStatus:(state)=>{soundControls();$('sound-status').textContent=state==='error'?'Sound unavailable — tap Enable sound to retry.':'Sound ready · bugle, starting shot, hoofbeats & quiet crowd';}});
function soundControls(){const active=!raceAudio.muted&&raceAudio.ctx?.state==='running';$('sound-toggle').textContent=raceAudio.muted?'Sound off':active?'Sound on':'Enable sound';$('sound-toggle').setAttribute('aria-pressed',String(active));$('sound-volume').value=Math.round(raceAudio.masterVolume*100);$('crowd-volume').value=Math.round(raceAudio.crowdVolume*100);$('hoof-volume').value=Math.round(raceAudio.hoofVolume*100);}
function armSound(){return raceAudio.unlock().then(()=>{soundControls();if(playing&&!raceAudio.playing&&!raceAudio.muted)void raceAudio.start(race,time,speed);}).catch(()=>{$('sound-status').textContent='Sound unavailable — tap Enable sound to retry.';});}
$('sound-toggle').addEventListener('click',()=>{if(!raceAudio.muted&&raceAudio.ctx?.state==='running'){raceAudio.setMuted(true);soundControls();}else{raceAudio.setMuted(false);void armSound();}});
$('sound-volume').addEventListener('input',()=>{raceAudio.setVolume(Number($('sound-volume').value)/100);soundControls();});
$('crowd-volume').addEventListener('input',()=>{raceAudio.setCrowdVolume(Number($('crowd-volume').value)/100);soundControls();});
$('hoof-volume').addEventListener('input',()=>{raceAudio.setHoofVolume(Number($('hoof-volume').value)/100);soundControls();});
// A real sign-in, room or betting gesture arms audio before asynchronous work.
$('multiplayer').addEventListener('pointerdown',()=>{if(!raceAudio.muted&&raceAudio.ctx?.state!=='running')void armSound();});
$('multiplayer').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&!raceAudio.muted&&raceAudio.ctx?.state!=='running')void armSound();});
soundControls();
const viewport = $('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#d9e2d8');
scene.fog = new THREE.Fog('#d9e2d8', 320, 750);
const camera = new THREE.PerspectiveCamera(42, 1, .1, 1000);
camera.position.set(14, 21, 34);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.prepend(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'Three-dimensional race playback');
renderer.domElement.setAttribute('role', 'img');
scene.add(new THREE.HemisphereLight(0xf3f4e6, 0x58624b, 2.5));
const sun = new THREE.DirectionalLight(0xfff5dc, 2.7);
sun.position.set(-12, 28, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55;
sun.shadow.camera.right = 55;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
sun.shadow.camera.far = 110;
sun.shadow.normalBias = .03;
scene.add(sun, sun.target);
const grass = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: '#4e7051', roughness: 1 }));
grass.material.map=parkSky(scene);
grass.rotation.x = -Math.PI / 2;
grass.position.y = -.045;
grass.receiveShadow = true;
scene.add(grass);
const trackRoot = new THREE.Group();
const castRoot = new THREE.Group();
const ownHalo=new THREE.Mesh(new THREE.RingGeometry(1.6,1.73,48),new THREE.MeshBasicMaterial({color:'#f2d18a',transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));ownHalo.rotation.x=-Math.PI/2;ownHalo.visible=false;scene.add(ownHalo);
const ownMarker=textSprite('YOU');ownMarker.scale.set(3,.56,1);ownMarker.visible=false;scene.add(ownMarker);
scene.add(trackRoot, castRoot);
const powerView = new PowerView(scene);
const loader = new GLTFLoader();
const assetPromises = new Map();
let race = null;
let time = 0;
let playing = false;
let loading = true;
let failed = false;
let speed = 1;
let loadSerial = 0;
let visibleActors = [];
let lastFrame = performance.now();
let smoothCenter = 0;
let cameraDistance = 1;
let sourceKey = 'demo-a';
let lastStandings = '';
let disposed = false;
let course=null;
let cameraMode='auto';
let lastShot='';
const neutralPuppet=new THREE.Quaternion(.462075412,.171928793,-.091826305,.865155935);
const neutralNormal=new THREE.Vector3(0,1,0).applyQuaternion(neutralPuppet);
const neutralAzimuth=Math.atan2(neutralNormal.z,neutralNormal.x);
const cameraPos=new THREE.Vector3(),cameraTarget=new THREE.Vector3();

function clearError() {
  failed = false;
  $('error').hidden = true;
  $('error').textContent = '';
}
function showError(error) {
  console.error(error);
  failed = true;
  $('error').textContent = error?.message || 'The race could not load. Please try again.';
  $('error').hidden = false;
}
function setBusy(value, message = 'Loading reusable rider models…') {
  loading = value;
  $('loading').hidden = !value;
  $('loading').textContent = message;
  syncControls();
}
function syncControls() {
  const blocked = loading || !race;
  for (const id of ['play', 'restart', 'timeline', 'speed', 'download']) $(id).disabled = blocked;
  for (const id of ['generate', 'random-seed', 'race-select', 'import-file']) $(id).disabled = loading;
  if(multiplayer?.managed){for(const id of ['restart','timeline','speed','download'])$(id).disabled=true;for(const id of ['generate','random-seed','race-select','import-file'])$(id).disabled=true;$('play').disabled=loading;$('play').textContent=!raceAudio.muted&&raceAudio.ctx?.state==='running'?'Race sound on':'Enable race sound';return;}
  $('play').textContent = playing ? 'Pause' : (time >= (race?.duration ?? Infinity) ? 'Replay race' : 'Play race');
}

function loadActor(id) {
  if (!Object.hasOwn(names, id)) return Promise.reject(new Error(`Unknown racer: ${id}.`));
  if (!assetPromises.has(id)) {
    const promise = loader.loadAsync(embedded.assets?.[id] || `./assets/${id}.glb`).then((gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y < .01) throw new Error(`${names[id]}'s model is empty.`);
      // Exported actors are in track units, centered on the saddle and on the ground.
      model.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
          if (object.material) {
            for (const material of (Array.isArray(object.material) ? object.material : [object.material])) material.side = THREE.DoubleSide;
          }
        }
      });
      const group = new THREE.Group();
      group.name = id;
      group.add(model);
      const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
      if (mixer) for (const clip of gltf.animations) mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
      let puppet=null;model.traverse(node=>{if(/puppet[ _]body/.test(node.name))puppet=node;});
      const puppetRest=puppet?.quaternion.clone();
      const puppetRotates=Boolean(puppet && gltf.animations.some(clip=>clip.tracks.some(track=>track.name===`${puppet.name}.quaternion`)));
      return { id, group, model, mixer, puppet,puppetRest,puppetRotates,sourcePuppetPose:puppetRest?.clone(), height: size.y, initialY: model.position.y, clipCount: gltf.animations.length };
    }).catch((error) => {
      assetPromises.delete(id);
      throw new Error(`${names[id]}'s model could not load. Reload to try again.`, { cause: error });
    });
    assetPromises.set(id, promise);
  }
  return assetPromises.get(id);
}

function meshBox(width, height, depth, color, x, y, z, parent = trackRoot) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color, roughness: .95 }));
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function textSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#263328';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '700 50px system-ui';
  ctx.fillStyle = '#f6e9bb';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 49);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.scale.set(8, 1.5, 1);
  return sprite;
}
function disposeTrack() {
  trackRoot.traverse((object) => {
    if (object.isInstancedMesh) object.dispose();
    object.geometry?.dispose();
    if (object.material) for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      material.map?.dispose();
      material.dispose();
    }
  });
  trackRoot.clear();
}
function buildTrack(definition) {
  disposeTrack();
  course=null;
  if(definition.track.type==='circuit'){course=createCourse(definition,trackRoot);return;}
  const { length, laneWidth } = definition.track;
  const width = definition.cast.length * laneWidth + 2;
  const start = -length / 2;
  const finish = length / 2;
  meshBox(length + 34, .08, width, '#ba9e74', 5, -.04, 0);
  for (let lane = 0; lane <= definition.cast.length; lane++) {
    const z = (lane - definition.cast.length / 2) * laneWidth;
    for (let x = start - 8; x < finish + 20; x += 4) meshBox(1.6, .012, .035, '#d4c49d', x, .012, z);
  }
  meshBox(.16, .018, width, '#f0e8cf', start, .018, 0);
  const squares = Math.ceil(width / .65);
  for (let row = 0; row < 2; row++) for (let col = 0; col < squares; col++) {
    meshBox(.38, .021, width / squares, (row + col) % 2 ? '#232a22' : '#f5edd6', finish + (row - .5) * .38, .022, (col + .5) * width / squares - width / 2);
  }
  for (const side of [-1, 1]) {
    const z = side * (width / 2 + .45);
    meshBox(length + 30, .08, .10, '#e5e3d1', 5, 1.12, z);
    meshBox(length + 30, .07, .09, '#e5e3d1', 5, .62, z);
    for (let x = start - 8; x < finish + 20; x += 5) meshBox(.13, 1.35, .13, '#e5e3d1', x, .65, z);
    meshBox(.18, 6.4, .18, '#354e39', finish, 3.2, z);
  }
  const sign = textSprite('FINISH');
  sign.position.set(finish, 7, 0);
  trackRoot.add(sign);
}

async function loadRace(definition, options = {}) {
  const serial = ++loadSerial;
  raceAudio.pause();
  playing = false;
  clearError();
  setBusy(true);
  try {
    const validated = validateRace(definition);
    const actors = await Promise.all(validated.cast.map((runner) => loadActor(runner.id)));
    if (serial !== loadSerial || disposed) return false;
    race = validated;
    sourceKey = options.source || 'imported';
    time = 0;
    playing = false;
    visibleActors = actors;
    castRoot.clear();
    for (const actor of actors) {
      castRoot.add(actor.group);
      actor.mixer?.setTime(0);
    }
    buildTrack(race);
    smoothCenter = -race.track.length / 2;
    lastShot='';
    cameraDistance = Math.max(1, (race.cast.length * race.track.laneWidth + 6) / 22);
    lastStandings = '';
    $('race-title').textContent = race.title;
    $('duration').textContent = ` / ${race.duration.toFixed(1)} s`;
    $('timeline').max = race.duration;
    $('timeline').value = 0;
    $('seed').value = race.seed ?? $('seed').value;
    const option = $('race-select').querySelector(`option[value="${sourceKey}"]`);
    if (option) {
      option.hidden = false;
      if (sourceKey === 'generated') option.textContent = 'Generated race';
      else if (sourceKey === 'imported') option.textContent = 'Imported race';
      else option.textContent = `${sourceKey === 'demo-a' ? 'Race A' : 'Race B'} · ${race.title}`;
      $('race-select').value = sourceKey;
    }
    $('stage-badge').textContent = `${race.cast.length} racers · ${Math.round(race.track.length)} m · ${race.track.type==='circuit'?'4 turns':'straight'}`;
    $('race-id').textContent = `${race.id} · seed ${race.seed ?? '—'}`;
    $('race-note').textContent = 'Race prepared. Press play or scrub the timeline.';
    setBusy(false);
    displayFrame(true);
    return true;
  } catch (error) {
    if (serial !== loadSerial) return false;
    setBusy(false);
    $('loading').hidden = Boolean(race);
    if (!race) $('loading').textContent = 'The race could not load.';
    showError(error);
    throw error;
  }
}
async function loadExample(key) {
  playing = false;
  raceAudio.pause();
  clearError();
  setBusy(true, 'Preparing race…');
  try {
    let definition = embedded.races?.[key];
    if (!definition) {
      const response = await fetch(`./races/${key}.json?v=park-audio-3`);
      if (!response.ok) throw new Error('The race definition could not load. Please try again.');
      definition = await response.json();
    }
    await loadRace(definition, { source: key });
  } catch (error) {
    setBusy(false);
    showError(error);
    if (!race) { $('loading').hidden = false; $('loading').textContent = 'The race could not load.'; }
  }
}
function pause() {
  playing = false;
  raceAudio.pause();
  syncControls();
}
function play() {
  if(multiplayer?.managed){enableLiveSound();return;}
  if (!race || loading) return;
  if (time >= race.duration) time = 0;
  playing = true;
  void raceAudio.start(race,time,speed);
  lastFrame = performance.now();
  clearError();
  syncControls();
}
function seek(value) {
  if(multiplayer?.managed)return;
  if (!race || loading) return;
  const next = Number(value);
  if (!Number.isFinite(next)) throw new Error('Timeline position must be a number.');
  time = Math.max(0, Math.min(race.duration, next));
  if (time >= race.duration) playing = false;
  if(playing)void raceAudio.start(race,time,speed);else raceAudio.pause();
  syncControls();
  displayFrame(true);
}
function renderStandings(sample) {
  const signature = sample.standings.map(id=>multiplayer?.managed?multiplayer.label(id):id).join('|');
  if (signature !== lastStandings) {
    $('standings').replaceChildren(...sample.standings.map((id, index) => {
      const li = document.createElement('li');
      li.className = `standing${index === 0 ? ' first' : ''}`;
      li.dataset.rider = id;
      const rank = document.createElement('span');
      rank.className = 'rank'; rank.textContent = String(index + 1).padStart(2, '0');
      const details = document.createElement('span');
      const name = document.createElement('span');
      name.className = 'rider-name'; name.textContent = multiplayer?.managed?multiplayer.label(id):(names[id] || id);
      const sub = document.createElement('span'); sub.className = 'rider-sub';
      const power = document.createElement('span'); power.className = 'rider-power';
      details.append(name, sub, power);
      const distance = document.createElement('span'); distance.className = 'distance';
      li.append(rank, details, distance);
      return li;
    }));
    lastStandings = signature;
  }
  for (const runner of sample.runners) {
    const li = $('standings').querySelector(`[data-rider="${runner.id}"]`);
    if (!li) continue;
    li.querySelector('.rider-sub').textContent = runnerStatus(race, runner, time);
    li.querySelector('.rider-power').textContent = powerStatus(race, runner.id, time);
    li.querySelector('.distance').textContent = runner.finished && Number.isFinite(runner.finishTime) ? `${runner.finishTime.toFixed(2)} s` : `${Math.min(race.track.length, runner.distance).toFixed(1)} m`;
  }
  const first = sample.runners.find((runner) => runner.id === sample.standings[0]);
  $('standings-title').textContent = first?.finished ? 'At the finish' : time < (race.startDelay??0) ? 'Under starter’s orders' : time === 0 ? 'At the start' : 'Race in progress';
  $('result').hidden = !first?.finished;
  if (first?.finished) {
    $('winner').textContent = `${multiplayer?.managed?multiplayer.label(first.id):names[first.id]} wins`;
    const count = sample.runners.filter((runner) => runner.finished).length;
    $('result-note').textContent = `${count} of ${sample.runners.length} across the line · ${multiplayer?.managed?'server race':'scripted outcome'}`;
  }
}
function displayFrame(snapCamera = false) {
  if (!race || loading) return;
  needsRender=true;
  const sample = sampleRace(race, time);
  const actorMap = new Map(visibleActors.map((actor) => [actor.id, actor]));
  for (const runner of sample.runners) {
    const actor = actorMap.get(runner.id);
    if (!actor) continue;
    actor.group.position.set(runner.x, 0, runner.z);
    actor.group.rotation.y = -runner.heading;
    // Restore the source pose before sampling: AnimationMixer may skip writing
    // an unchanged track, so billboard transforms must never feed back into it.
    if(actor.puppet)actor.puppet.quaternion.copy(actor.sourcePuppetPose);
    if (actor.mixer) actor.mixer.setTime(time<(race.startDelay??0)?0:gaitClock(race,race.cast.find(r=>r.id===runner.id),time));
    if(actor.puppet)actor.sourcePuppetPose.copy(actor.puppet.quaternion);
    else actor.model.position.y = actor.initialY + .018 * Math.sin(time * 16);
  }
  const lead=sample.runners.find(r=>r.id===sample.standings[0]);
  const xs=sample.runners.map(r=>r.x),zs=sample.runners.map(r=>r.z);
  const center=new THREE.Vector3((Math.min(...xs)+Math.max(...xs))/2,2.2,(Math.min(...zs)+Math.max(...zs))/2);
  const spread=Math.max(16,Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs)));
  const mobile=viewport.clientWidth<600;
  const factor=Math.max(1,spread/23)*(mobile?1.36:1);
  const heading=lead.heading;
  const forward=new THREE.Vector3(Math.cos(heading),0,Math.sin(heading));
  const outside=new THREE.Vector3(-Math.sin(heading),0,Math.cos(heading));
  const phase=raceSection(race,lead.distance);
  let shot=cameraMode;
  if(shot==='auto')shot=time<(race.startDelay??0)+.5?'gate':phase==='HOME STRETCH'||lead.finished?'finish':lead.turn?'rail':phase==='BACK STRAIGHT'?'chase':'broadcast';
  cameraTarget.copy(center);
  if(shot==='aerial' && race.track.type==='circuit'){
    cameraPos.set(5,190*(mobile?1.25:1),95);cameraTarget.set(0,0,0);
  }else if(shot==='finish' && course){
    const p=course.finish;const f=new THREE.Vector3(Math.cos(p.heading),0,Math.sin(p.heading)),o=new THREE.Vector3(-Math.sin(p.heading),0,Math.cos(p.heading));
    cameraTarget.copy(center);cameraPos.copy(center).addScaledVector(f,13*factor).addScaledVector(o,26*factor);cameraPos.y=13*factor;
  }else{
    const presets={broadcast:[10.5,24,16],rail:[8,25,10],chase:[-18,18,13],gate:[15,27,15],aerial:[0,12,55]};
    const [ahead,side,up]=presets[shot]??presets.broadcast;
    cameraPos.copy(center).addScaledVector(forward,ahead*factor).addScaledVector(outside,side*factor);cameraPos.y=up*factor+2;
  }
  // Cuts occur on shot/sector changes; each view then follows the actual field.
  if(snapCamera||shot!==lastShot)camera.position.copy(cameraPos);else camera.position.lerp(cameraPos,.13);
  camera.lookAt(cameraTarget);lastShot=shot;
  sun.position.set(center.x-20,65,center.z+20);sun.target.position.copy(center);
  // Source photo boards are flat: face the active camera, preserving personal
  // motion relative to the original neutral pose. Horse/tack follow course heading.
  for(const actor of visibleActors)if(actor.puppet){
    const pose=actor.sourcePuppetPose.clone();
    const deviation=neutralPuppet.clone().invert().multiply(pose);
    actor.group.updateMatrixWorld(true);
    const parent=actor.puppet.parent.getWorldQuaternion(new THREE.Quaternion());
    const azimuth=Math.atan2(camera.position.z-actor.group.position.z,camera.position.x-actor.group.position.x);
    const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),neutralAzimuth-azimuth);
    actor.puppet.quaternion.copy(parent.invert().multiply(yaw).multiply(neutralPuppet).multiply(deviation));
  }
  course?.update(time,sample);
  powerView.update(race,sample,time);
  const ownHorse=multiplayer?.room?.race?.entrants.find(e=>e.userId===multiplayer?.user?.id)?.horse;
  const ownRunner=multiplayer?.managed&&sample.runners.find(r=>r.id===ownHorse);
  ownHalo.visible=ownMarker.visible=Boolean(ownRunner);
  if(ownRunner){ownHalo.position.set(ownRunner.x,.055,ownRunner.z);ownMarker.position.set(ownRunner.x,6.2,ownRunner.z);}
  const delay=race.startDelay??0;
  $('gate-count').hidden=!(delay>0&&time<delay);
  $('gate-count').textContent=time<delay-3?'♫':String(Math.max(1,Math.ceil(delay-time)));
  $('gate-count').setAttribute('aria-label',time<delay-3?'Call to the post':`${Math.max(1,Math.ceil(delay-time))} seconds to start`);
  $('section-name').textContent=time<delay-3?'CALL TO THE POST':time<delay?'AT THE GATES':phase;
  $('distance-left').textContent=`${Math.max(0,Math.round(race.track.length-lead.distance))} m to go`;
  $('camera-label').textContent=shot==='finish'?'HOME STRETCH':shot.toUpperCase();
  drawMap(sample);
  const audioView=sample.runners.map(r=>{const p=new THREE.Vector3(r.x,1,r.z).project(camera);return{id:r.id,pan:THREE.MathUtils.clamp(p.x,-.9,.9),distance:Math.hypot(camera.position.x-r.x,camera.position.z-r.z),finished:r.finished};});
  raceAudio.sync(race,time,playing,speed,lastShot,audioView,sample);
  $('elapsed').textContent = time.toFixed(1);
  $('timeline').value = time;
  const text = sample.events.map((event) => event.text || '').filter(Boolean).join(' · ');
  $('caption').textContent = text;
  $('caption').hidden = !text;
  renderStandings(sample);
  if (time >= race.duration) $('race-note').textContent = 'Race complete. Replay it, or prepare a different race.';
  else if (playing) $('race-note').textContent = 'Playing the prepared timeline.';
}

function drawMap(sample){
 const c=$('course-map'),ctx=c.getContext('2d'),w=c.width,h=c.height;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#10271f';ctx.fillRect(0,0,w,h);
 const track=race.track;const points=Array.from({length:241},(_,i)=>trackPoint(track,i/240*track.length));
 const xmin=Math.min(...points.map(p=>p.x)),xmax=Math.max(...points.map(p=>p.x)),zmin=Math.min(...points.map(p=>p.z)),zmax=Math.max(...points.map(p=>p.z));
 const scale=Math.min((w-24)/Math.max(1,xmax-xmin),(h-24)/Math.max(1,zmax-zmin));
 const xy=p=>[(p.x-(xmin+xmax)/2)*scale+w/2,(p.z-(zmin+zmax)/2)*scale+h/2];
 ctx.strokeStyle='#ad9871';ctx.lineWidth=7;ctx.beginPath();points.forEach((p,i)=>{const [x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
 const mine=multiplayer?.room?.race?.entrants.find(e=>e.userId===multiplayer?.user?.id)?.horse;
 for(const runner of sample.runners){const [x,y]=xy(runner),own=runner.id===mine;ctx.beginPath();ctx.arc(x,y,own?4:runner.rank===1?3.5:2.5,0,Math.PI*2);ctx.fillStyle=own?'#b9e2b1':runner.rank===1?'#ffe19a':'#f1f4df';ctx.fill();if(own){ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.stroke();}}
}
$('camera-mode').addEventListener('change',()=>{cameraMode=$('camera-mode').value;if(race)displayFrame(true);});
$('next-camera').addEventListener('click',()=>{const modes=['auto','broadcast','rail','chase','aerial'];cameraMode=modes[(modes.indexOf(cameraMode)+1)%modes.length];$('camera-mode').value=cameraMode;if(race)displayFrame(true);});
function enableLiveSound(){raceAudio.setMuted(false);void armSound();}
$('play').addEventListener('click', () => multiplayer?.managed?enableLiveSound():playing ? pause() : play());
$('restart').addEventListener('click', () => { pause(); seek(0); $('race-note').textContent = 'Back at the start. The same race will replay.'; });
$('timeline').addEventListener('input', () => { pause(); seek($('timeline').value); });
$('speed').addEventListener('click', () => { speed = speed === 1 ? 2 : speed === 2 ? .5 : 1; $('speed').textContent = `${speed}×`;if(playing)void raceAudio.start(race,time,speed); });
$('race-select').addEventListener('change', () => { const key = $('race-select').value; if (key === 'demo-a' || key === 'demo-b') void loadExample(key); });
function generateFromInput() {
  const raw = $('seed').value.trim();
  if (!raw) { showError(new Error('Enter a seed to prepare a race.')); return; }
  const seed = /^-?\d+$/.test(raw) ? Number(raw) : raw;
  try { void loadRace(generateRace(seed), { source: 'generated' }).catch(() => {}); } catch (error) { showError(error); }
}
$('generate').addEventListener('click', generateFromInput);
$('seed').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !loading) generateFromInput(); });
$('random-seed').addEventListener('click', () => {
  const value = globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] % 1000000 : Math.floor(Math.random() * 1000000);
  $('seed').value = value;
  generateFromInput();
});
$('download').addEventListener('click', () => {
  if (!race || loading) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(race, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${race.id.replace(/[^a-z0-9_-]/gi, '_')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('import-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  pause();
  try { await loadRace(JSON.parse(await file.text()), { source: 'imported' }); } catch (error) { showError(error); }
  event.target.value = '';
});
const observer = new ResizeObserver(() => {
  const width = viewport.clientWidth, height = viewport.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  needsRender=true;
});
observer.observe(viewport);
renderer.setAnimationLoop((now) => {
  const delta = Math.max(0, (now - lastFrame) / 1000);
  lastFrame = now;
  if (race && !loading) {
    const previousTime=time;
    if(multiplayer?.managed){
      const live=multiplayer.frame();const wasPlaying=playing;speed=1;
      time=live.ready?live.time:0;playing=Boolean(live.ready&&live.playing&&!document.hidden);
      if(playing&&!wasPlaying&&!raceAudio.playing&&!raceAudio.muted&&raceAudio.ctx?.state==='running')void raceAudio.start(race,time,1);
      if(!playing&&wasPlaying)raceAudio.pause();
      syncControls();
    }else if (playing) {
      time = Math.min(race.duration, time + delta * speed);
      if (time >= race.duration) { playing = false; syncControls(); }
    }
    if(time!==previousTime)needsRender=true;
    if(playing||needsRender)displayFrame();
    if(multiplayer?.managed){const r=multiplayer.room.race;$('race-note').textContent=r?.phase==='racing'?'Live shared race · cameras and sound are personal.':r?.phase==='results'?'Official result · coins and points saved.':'Waiting at the gates · betting closes before the race is prepared.';if(!multiplayer.frame().ready)$('race-title').textContent='Live room · waiting for the start';}
  }
  if(needsRender||playing){renderer.render(scene, camera);needsRender=false;}
});
window.raceLab = {
  get race() { return race; },
  get multiplayer(){return {managed:multiplayer?.managed??false,online:multiplayer?.online??false,room:multiplayer?.room?.code??null,frame:multiplayer?.frame()};},
  get audio(){return raceAudio.diagnostics;},
  get powers(){return powerView.diagnostics;},
  captureAudio:()=>raceAudio.captureStream(),
  get time() { return time; },
  get ready() { return Boolean(race && !loading); },
  get actorCount() { return visibleActors.length; },
  get renderDiagnostics(){return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,ownMarker:ownMarker.visible};},
  get assetCount() { return assetPromises.size; },
  get textureDiagnostics(){return visibleActors.map(actor=>{const textures=new Map();actor.model.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m?.map)textures.set(m.map.uuid,{name:m.name,width:m.map.image?.width??0,height:m.map.image?.height??0});});return {id:actor.id,textures:[...textures.values()]};});},
  get viewDiagnostics(){return visibleActors.map(actor=>{let head;actor.model.traverse(o=>{if(/head[ _]hinge/.test(o.name))head=o;});actor.group.updateMatrixWorld(true);const v=(head??actor.puppet??actor.group).getWorldPosition(new THREE.Vector3());const projected=v.clone().project(camera);return {id:actor.id,headHeight:v.y,screen:projected.toArray(),puppet:actor.puppet?.quaternion.toArray()};});},
  get cameraMode(){return cameraMode;},
  get shot(){return lastShot;},
  get gateOpen(){return Boolean(course && time>=(race.startDelay??0));},
  get courseSection(){return race?raceSection(race,Math.max(...sampleRace(race,time).runners.map(r=>r.distance))):null;},
  get state() { return loading ? 'loading' : failed ? 'error' : playing ? 'playing' : race && time >= race.duration ? 'finished' : 'ready'; },
  loadRace: (definition) => loadRace(definition, { source: 'imported' }), seek, play, pause,
};
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', () => { disposed = true;powerView.dispose();raceAudio.dispose();multiplayer?.dispose(); renderer.setAnimationLoop(null); observer.disconnect(); });
void loadExample('demo-a').then(()=>{multiplayer=new MultiplayerUI({load:def=>loadRace(def,{source:'live'}),onChange:()=>{needsRender=true;document.querySelector('.race-tools').hidden=Boolean(multiplayer?.managed);syncControls();}});});
