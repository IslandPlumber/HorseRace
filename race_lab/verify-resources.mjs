import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const p=await browser.newPage();
 await p.addInitScript(()=>{
  const active=new Set();let made=0,deleted=0;
  for(const Type of[window.WebGLRenderingContext,window.WebGL2RenderingContext])if(Type){
   const create=Type.prototype.createBuffer,remove=Type.prototype.deleteBuffer;
   Type.prototype.createBuffer=function(...args){const b=create.apply(this,args);if(b&&!active.has(b)){active.add(b);made++;}return b;};
   Type.prototype.deleteBuffer=function(b){if(active.delete(b))deleted++;return remove.call(this,b);};
  }
  window.gpuBufferSnapshot=()=>({active:active.size,made,deleted});
 });
 await p.goto(process.env.RACE_LAB_URL||'http://127.0.0.1:8770/');
 await p.waitForFunction(()=>window.raceLab?.ready,null,{timeout:60000});
 const base=await p.evaluate(()=>window.raceLab.race),samples=[];
 for(let i=0;i<7;i++){
  await p.evaluate(async({base,i})=>{await window.raceLab.loadRace({...base,id:'resource-cycle-'+i});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},{base,i});
  samples.push(await p.evaluate(()=>({buffers:window.gpuBufferSnapshot(),renderer:window.raceLab.renderDiagnostics})));
 }
 await mkdir('review/deployment/resources',{recursive:true});
 await writeFile('review/deployment/resources/'+(process.env.ALLOW_RESOURCE_GROWTH?'before':'after')+'.json',JSON.stringify({checkedAt:new Date().toISOString(),samples},null,2)+'\n');
 console.log(JSON.stringify(samples.map(s=>({buffers:s.buffers.active,geometries:s.renderer.geometries,textures:s.renderer.textures}))));
 if(!process.env.ALLOW_RESOURCE_GROWTH){
  assert.ok(samples.at(-1).buffers.active<=samples[1].buffers.active+2,'GPU buffers must not grow across races');
  assert.ok(samples.at(-1).renderer.geometries<=samples[1].renderer.geometries+1);
  assert.ok(samples.at(-1).renderer.textures<=samples[1].renderer.textures+1);
 }
}finally{await browser.close()}
