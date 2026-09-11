import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {nodeAdapter} from '../lib/adapter.mjs';
const m=JSON.parse(await readFile(new URL('../dist/site.json',import.meta.url),'utf8'));
test('Vercel-style routed Node adapter preserves path, method, body, headers and 404 status',async()=>{
 const server=http.createServer((req,res)=>nodeAdapter(req,res,m,{routed:true}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const path of ['/','/docs','/about','/index.md','/api/catalog','/not-a-real-page']){
   const url=base+'/api/site?__drugiq_path='+encodeURIComponent(path);
   const r=await fetch(url,{headers:{Accept:path==='/api/catalog'?'application/json':'text/markdown'}});
   assert.equal(r.status,path==='/not-a-real-page'?404:200);assert.ok((await r.text()).length>100);
  }
  const result=await fetch(base+'/api/site?__drugiq_path=%2F.well-known%2Fmcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json,text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:3,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'adapter-test',version:'1.0.0'}}})});
  const d=await result.json();assert.equal(result.status,200);assert.equal(d.result.serverInfo.name,'drugiq-discovery');
  const bad=await fetch(base+'/api/site?__drugiq_path='+encodeURIComponent('//evil.example'));
  assert.equal(bad.status,400);
  const ambiguous=await fetch(base+'/api/site?__drugiq_path=%2Fmissing&__drugiq_path=%2F');assert.equal(ambiguous.status,400);
 }finally{await new Promise(r=>server.close(r));}
});
test('Deployment config uses the explicit HTTP layer, not a catch-all app-shell rewrite',async()=>{
 const c=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(c.buildCommand,'npm run build');assert.equal(c.functions['api/site.mjs'].includeFiles,'dist/**');
 assert.equal(c.routes.length,1);assert.equal(c.routes[0].dest,'/api/site?__drugiq_path=/$1');assert.ok(!JSON.stringify(c.routes).includes('index.html'));
});
