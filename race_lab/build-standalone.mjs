/** Bundle a self-contained test with no registry, model or race-data fetches. */
import {build} from 'esbuild';
import {readFile, writeFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ACTOR_IDS} from './race-core.js';
import {POWER_CLIPS} from './power-audio.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root,'asset-manifest.json'),'utf8'));
assert.deepEqual(manifest.actors.map(actor=>actor.id).sort(),[...ACTOR_IDS].sort(),
  'Wait for the complete seven-actor export before bundling.');
const embedded = {assets:{},races:{},audio:{}};
for(const id of ['bugle','crowd','cheer','hooves'])embedded.audio[id]='data:audio/mpeg;base64,'+(await readFile(path.join(root,'audio',`${id}.mp3`))).toString('base64');
for(const key of POWER_CLIPS)embedded.audio[key]='data:audio/wav;base64,'+(await readFile(path.join(root,'audio','powers',`${key}.wav`))).toString('base64');
for (const actor of manifest.actors) {
  embedded.assets[actor.id] = 'data:model/gltf-binary;base64,' +
    (await readFile(path.join(root,actor.file))).toString('base64');
}
for (const id of ['demo-a','demo-b']) {
  embedded.races[id] = JSON.parse(await readFile(path.join(root,'races',`${id}.json`),'utf8'));
}
const result = await build({entryPoints:[path.join(root,'app.js')],bundle:true,write:false,
  minify:true,format:'iife',target:'es2022',legalComments:'inline'});
const css = await readFile(path.join(root,'styles.css'),'utf8');
let html = await readFile(path.join(root,'index.html'),'utf8');
html = html.replace('<link rel="stylesheet" href="./styles.css">',()=>`<style>${css}</style>`)
  .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/,'');
html = html.replace('</head>','<link rel="icon" href="data:,">\n</head>');
const config = JSON.stringify(embedded).replaceAll('<','\\u003c');
const code = result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
// Keep attribution with the portable HTML even when copied out of the checkout.
const credits = `<details class="definition"><summary>Model and photograph credits</summary>
<p>Horse mesh: Lyndon Daniels; rig: ChadM, <a href="https://opengameart.org/content/rigged-horse">OpenGameArt</a>, CC0.
Trump portrait: Daniel Torok; Biden portrait: Adam Schultz, public-domain government photographs.
McConnell: TMZ / Charlie Cotton via Know Your Meme. Bernie: Brendan Smialowski / AFP / Getty Images.
Elon: Debbie Rowe / The Royal Society, <a href="https://commons.wikimedia.org/wiki/File:Elon_Musk_Royal_Society_(crop2).jpg">source</a>,
<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>; head silhouette, enlargement and animation adapted under the same license.
Gordon: 20thC.Fox / Everett / Rex Features via <a href="https://imgflip.com/meme/Chef-Gordon-Ramsay">Imgflip</a>.
Snoop: Mike Egerton / PA Images via Getty Images, <a href="https://www.nbcolympics.com/news/our-favorite-snoop-dogg-looks-2024-paris-olympics">NBC Olympics</a>.
Other third-party photographs retain their individual terms; no open redistribution license is asserted for them.
No endorsement implied. Cutout parody; no generated faces or voices. Three.js: MIT. Bugle: U.S. Army, public domain. Quiet audience and applause: stephan, public domain. Gallop texture: Bruno Auzet / Freesound Community, CC0.
Starter, hoof synthesis and comic power clips: original sound design, CC0. Comic stings contain no sampled celebrity speech. No endorsement implied.</p></details>`;
html = html.replace('</main>',()=>credits+'\n</main>');
html = html.replace('<script type="module" src="./app.js"></script>',
  ()=>`<script>globalThis.RACE_LAB_EMBEDDED=${config};</script>\n<script>${code}</script>`);
assert(!html.includes('src="./app.js"'),'External script escaped the standalone build.');
await writeFile(path.join(root,'standalone.html'),html);
console.log(`Offline race lab built: ${((await stat(path.join(root,'standalone.html'))).size/1048576).toFixed(1)} MB, ${manifest.actors.length} reusable models.`);
