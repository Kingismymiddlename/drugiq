import {readFile} from 'node:fs/promises';
import {nodeAdapter} from '../lib/adapter.mjs';
let manifestPromise;
function loadManifest(){
 // cwd is the deployed project root. includeFiles in vercel.json bundles only the generated public data.
 manifestPromise ||= readFile(new URL('../dist/site.json',import.meta.url),'utf8').then(JSON.parse).catch(async()=>JSON.parse(await readFile(process.cwd()+'/dist/site.json','utf8')));
 return manifestPromise;
}
export default async function handler(req,res){
 try{return await nodeAdapter(req,res,await loadManifest(),{routed:true});}
 catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Public content unavailable. Run the build before deploying."}');}
}
