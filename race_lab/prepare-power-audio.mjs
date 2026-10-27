import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {comicClip,POWER_CLIPS} from './power-audio.js';
await mkdir('audio/powers',{recursive:true});const manifest={author:'Original HorseRace sound design',license:'CC0-1.0',sampleRate:22050,clips:[]};
for(const key of POWER_CLIPS){
 const rate=manifest.sampleRate,samples=comicClip(key,rate),wav=Buffer.alloc(44+samples.length*2);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);
 let sum=0;for(let i=0;i<samples.length;i++){wav.writeInt16LE(Math.round(samples[i]*32767),44+i*2);sum+=samples[i]**2;}
 await writeFile(`audio/powers/${key}.wav`,wav);
 manifest.clips.push({key,seconds:samples.length/rate,peak:.78,rms:Math.sqrt(sum/samples.length),sha256:createHash('sha256').update(wav).digest('hex')});
}
await writeFile('audio/powers/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared ${manifest.clips.length} original comic launch/impact WAV clips.`);
