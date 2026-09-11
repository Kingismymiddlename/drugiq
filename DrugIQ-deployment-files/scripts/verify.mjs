import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import {nodeAdapter} from '../lib/adapter.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(resolve(root,'dist/site.json'),'utf8'));
const args=process.argv.slice(2),local=args.includes('--local');
let server;
let base=args.find(x=>/^https?:\/\//.test(x));
if(local){server=http.createServer((req,res)=>nodeAdapter(req,res,manifest));await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;}
if(!base){console.error('Usage: npm run verify -- --local OR npm run verify -- https://your-deployment.example');process.exit(2);}
base=base.replace(/\/$/,'');
const results=[];
const defaultHeaders={};
if(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)defaultHeaders['x-vercel-protection-bypass']=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
async function fetchRoute(path,options={}){return fetch(base+path,{...options,headers:{...defaultHeaders,...options.headers},redirect:'manual',signal:AbortSignal.timeout(12000)});}
const check=(name,condition,details={})=>results.push({name,pass:Boolean(condition),...details});
async function guard(name,task){try{await task();}catch(e){check(name,false,{error:e.message,cause:e.cause?.message});}}
const reportPath=resolve(root,'reports',local?'local-endpoints.json':'deployed-endpoints.json');
try{
 let reachable=false;
 await guard('HTTP preflight',async()=>{const r=await fetchRoute('/');reachable=r.status===200;check('Homepage reachable',reachable,{status:r.status});await r.arrayBuffer();});
 if(!reachable) {
  const report={base,environment:local?'local':'public host',deployedVerificationCompleted:false,reason:'Homepage could not be fetched successfully; no claim is made that the deployed patch or endpoints were verified.',results};
  await mkdir(dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));process.exitCode=1;
 }else{
  for(const [path,resource] of Object.entries(manifest.resources))await guard(path,async()=>{
   const mime=resource.kind==='page'?'text/html':resource.mime.split(';')[0];
   const response=await fetchRoute(path,{headers:{Accept:mime}});const bytes=Buffer.from(await response.arrayBuffer());
   check('GET '+path,response.status===200&&response.headers.get('content-type')?.startsWith(mime)&&bytes.length>0,{status:response.status,mime:response.headers.get('content-type'),bytes:bytes.length});
   if(resource.kind==='page'){
    const text=bytes.toString();const content=text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    check('Raw content '+path,content.length>=500,{characters:content.length});
    const md=await fetchRoute(path,{headers:{Accept:'text/markdown'}});const mdtext=await md.text();
    check('Markdown negotiation '+path,md.status===200&&md.headers.get('content-type')?.startsWith('text/markdown')&&md.headers.get('vary')?.toLowerCase().includes('accept')&&mdtext.startsWith('# '),{status:md.status,vary:md.headers.get('vary')});
    check('CDN-safe page policy '+path,/no-store/.test(md.headers.get('cache-control')||''));
   }
   const head=await fetchRoute(path,{method:'HEAD',headers:{Accept:mime}});
   check('HEAD '+path,head.status===200&&(await head.text())==='',{status:head.status});
  });
  await guard('Catalog',async()=>{
   const r=await fetchRoute('/api/catalog');const data=await r.json();check('Catalog collection',r.status===200&&data.tools?.length===12);
   for(const tool of manifest.catalog.tools){const entry=await fetchRoute('/api/catalog/'+tool.id);const d=await entry.json();check('Catalog '+tool.id,entry.status===200&&d.id===tool.id&&d.executionAvailable===false);}
   const missing=await fetchRoute('/api/catalog/not-a-tool');check('Catalog 404',missing.status===404);
  });
  for(const path of ['/this-path-does-not-exist-drugiq-audit','/docs/not-a-document','.env'].map(p=>p.startsWith('/')?p:'/'+p))await guard('404 '+path,async()=>{
   const r=await fetchRoute(path,{headers:{Accept:'text/markdown'}});const t=await r.text();check('404 Markdown recovery '+path,r.status===404&&t.includes('/sitemap.xml')&&t.includes('/llms.txt')&&!t.includes('const T ='),{status:r.status});
   const html=await fetchRoute(path,{headers:{Accept:'text/html'}});check('404 HTML recovery '+path,html.status===404&&html.headers.get('content-type')?.startsWith('text/html'));
  });
  for(const [alias,to] of Object.entries(manifest.aliases))await guard('Alias '+alias,async()=>{const r=await fetchRoute(alias);check('Redirect '+alias,r.status===308&&(r.headers.get('location')===to||r.headers.get('location')===base+to),{location:r.headers.get('location')});});
  for(const [accept,want] of [['text/html;q=0.1,text/markdown;q=1','text/markdown'],['text/html;q=1,text/markdown;q=0','text/html'],['text/html;q=0,*/*;q=1','text/markdown']])await guard('q-value '+accept,async()=>{const r=await fetchRoute('/',{headers:{Accept:accept}});check('q-values '+accept,r.status===200&&r.headers.get('content-type')?.startsWith(want));});
  const no=await fetchRoute('/',{headers:{Accept:'image/jpeg'}});check('Unsupported Accept is 406',no.status===406);
  const rpcHeaders={'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'};
  async function rpc(method,params={},id=1){return fetchRoute('/.well-known/mcp',{method:'POST',headers:rpcHeaders,body:JSON.stringify({jsonrpc:'2.0',...(id===undefined?{}:{id}),method,params})});}
  await guard('MCP handshake and calls',async()=>{
   const i=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'drugiq-verifier',version:'1.0.0'}});const init=await i.json();check('MCP initialize',i.status===200&&init.result?.protocolVersion==='2025-11-25'&&init.result?.serverInfo?.name==='drugiq-discovery');
   const n=await fetchRoute('/.well-known/mcp',{method:'POST',headers:rpcHeaders,body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})});check('MCP initialized notification',n.status===202&&(await n.text())==='');
   const t=await rpc('tools/list');const tools=await t.json();check('MCP tools/list',t.status===200&&tools.result?.tools?.length===3);
   for(const entry of manifest.catalog.tools){const r=await rpc('tools/call',{name:'drugiq_get_tool',arguments:{id:entry.id}});const d=await r.json();check('MCP read catalog '+entry.id,r.status===200&&d.result?.structuredContent?.tool?.id===entry.id&&d.result?.isError===false);}
   const all=await rpc('tools/call',{name:'drugiq_list_tools',arguments:{}});const allData=await all.json();check('MCP list catalog tool',allData.result?.structuredContent?.tools?.length===12);
   const resources=await (await rpc('resources/list')).json();check('MCP resources/list',resources.result?.resources?.length===Object.keys(manifest.documents).length);
   for(const doc of Object.values(manifest.documents)){
    const r=await rpc('tools/call',{name:'drugiq_read_document',arguments:{id:doc.id}});const d=await r.json();check('MCP read document '+doc.id,r.status===200&&d.result?.structuredContent?.text?.startsWith('# '));
    const read=await (await rpc('resources/read',{uri:doc.uri})).json();check('MCP resource '+doc.id,read.result?.contents?.[0]?.text?.startsWith('# '));
   }
   const noGet=await fetchRoute('/.well-known/mcp',{headers:{Accept:'text/event-stream'}});check('MCP no standalone SSE',noGet.status===405);
   const forbidden=await fetchRoute('/.well-known/mcp',{method:'POST',headers:{...rpcHeaders,Origin:'https://evil.example'},body:JSON.stringify({jsonrpc:'2.0',id:5,method:'ping'})});check('MCP Origin protection',forbidden.status===403);
  });
  const failed=results.filter(r=>!r.pass);
  const report={base,environment:local?'local same-handler HTTP verification':'public host verification',timestamp:new Date().toISOString(),deployedVerificationCompleted:!local&&failed.length===0,checkedPublicResources:Object.keys(manifest.resources).length,checks:results.length,passed:results.length-failed.length,failed:failed.length,results};
  await mkdir(dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({base,checks:report.checks,passed:report.passed,failed:report.failed,report:reportPath},null,2));
  if(failed.length){console.error(JSON.stringify(failed,null,2));process.exitCode=1;}
 }
}finally{if(server)await new Promise(r=>server.close(r));}
