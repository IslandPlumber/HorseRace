/** Produce a static web deployment; include no checkout metadata or credentials. */
import {build} from 'esbuild';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(root,'site');
await mkdir(out,{recursive:true});
await build({entryPoints:[path.join(root,'app.js')],outfile:path.join(out,'app.js'),
 bundle:true,minify:true,format:'iife',target:'es2022',legalComments:'inline'});
let html=await readFile(path.join(root,'index.html'),'utf8');
html=html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/,'')
 .replace('<script type="module" src="./app.js"></script>','<script src="./app.js?v=presence-1"></script>')
 .replace('../cutout_v8/CREDITS.md','./CREDITS.md');
html=html.replace('href="./styles.css"','href="./styles.css?v=presence-1"');
await writeFile(path.join(out,'index.html'),html);
for(const name of ['styles.css','CREDITS.md'])await cp(path.join(root,name),path.join(out,name));
for(const name of ['assets','races','audio','source-credits'])await cp(path.join(root,name),path.join(out,name),{recursive:true});
await writeFile(path.join(out,'.nojekyll'),'');
console.log('Static public site prepared in race_lab/site');
