import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleRequest} from '../lib/http.mjs';
const manifest=JSON.parse(await readFile(new URL('../dist/site.json',import.meta.url),'utf8'));
const endpoint=manifest.config.url+'/.well-known/mcp';
const baseHeaders={'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'};
const call=(message,headers={},method='POST')=>handleRequest(new Request(endpoint,{method,headers:{...baseHeaders,...headers},...(!['GET','HEAD'].includes(method)?{body:typeof message==='string'?message:JSON.stringify(message)}:{})}),manifest);
const req=(method,params={},id=1)=>({jsonrpc:'2.0',id,method,params});
const init=version=>req('initialize',{protocolVersion:version,capabilities:{},clientInfo:{name:'verification-client',version:'1.0.0'}});
for(const version of ['2025-11-25','2025-06-18','2025-03-26'])test('MCP initialize '+version,async()=>{
 const r=await call(init(version),{'MCP-Protocol-Version':version});const data=await r.json();assert.equal(r.status,200);assert.equal(data.result.protocolVersion,version);assert.equal(data.result.serverInfo.name,'drugiq-discovery');assert.ok(data.result.capabilities.tools);assert.equal(r.headers.get('mcp-session-id'),null);assert.equal(r.headers.get('cache-control'),'no-store');
});
test('Unsupported initialize version negotiates implemented revision',async()=>{const data=await (await call(init('2026-07-28'))).json();assert.equal(data.result.protocolVersion,'2025-11-25');});
test('Initialization requires actual client information',async()=>{const d=await (await call(req('initialize',{}))).json();assert.equal(d.error.code,-32602);});
test('Initialized notification is 202 with empty body',async()=>{const r=await call({jsonrpc:'2.0',method:'notifications/initialized'});assert.equal(r.status,202);assert.equal(await r.text(),'');});
test('Unknown notification never gets a JSON-RPC response',async()=>{const r=await call({jsonrpc:'2.0',method:'notifications/unknown'});assert.equal(r.status,202);assert.equal(await r.text(),'');});
test('Ping preserves a string request ID',async()=>{const r=await call(req('ping',{},'abc'));const d=await r.json();assert.equal(d.id,'abc');assert.deepEqual(d.result,{});});
test('Tools list has real input/output schemas and safe annotations',async()=>{
 const d=await (await call(req('tools/list'))).json();assert.equal(d.result.tools.length,3);
 for(const t of d.result.tools){assert.equal(t.inputSchema.type,'object');assert.equal(t.outputSchema.type,'object');assert.equal(t.annotations.readOnlyHint,true);assert.equal(t.annotations.openWorldHint,false);}
});
test('Older revision omits newer structured-output fields',async()=>{
 const h={'MCP-Protocol-Version':'2025-03-26'};
 const t=await (await call(req('tools/list'),h)).json();assert.ok(t.result.tools.every(x=>!x.outputSchema));
 const d=await (await call(req('tools/call',{name:'drugiq_get_tool',arguments:{id:'scisynth'}}),h)).json();assert.ok(!d.result.structuredContent);assert.equal(JSON.parse(d.result.content[0].text).tool.id,'scisynth');
});
test('All catalog IDs can be read using actual MCP tools/call',async()=>{
 for(const tool of manifest.catalog.tools){const d=await (await call(req('tools/call',{name:'drugiq_get_tool',arguments:{id:tool.id}}))).json();assert.equal(d.result.isError,false);assert.deepEqual(d.result.structuredContent.tool,tool);assert.deepEqual(JSON.parse(d.result.content[0].text),d.result.structuredContent);}
});
test('Catalog filtering is deterministic and non-executing',async()=>{
 const d=await (await call(req('tools/call',{name:'drugiq_list_tools',arguments:{stage:'clinical'}}))).json();assert.equal(d.result.structuredContent.tools.length,3);assert.ok(d.result.structuredContent.tools.every(t=>t.stage==='clinical'&&!t.executionAvailable));
});
test('Every declared document and MCP resource is readable',async()=>{
 const d=await (await call(req('resources/list'))).json();assert.equal(d.result.resources.length,Object.keys(manifest.documents).length);
 for(const resource of d.result.resources){const result=await (await call(req('resources/read',{uri:resource.uri}))).json();assert.equal(result.result.contents[0].mimeType,'text/markdown');assert.ok(result.result.contents[0].text.length>500);}
 for(const doc of Object.values(manifest.documents)){const result=await (await call(req('tools/call',{name:'drugiq_read_document',arguments:{id:doc.id}}))).json();assert.equal(result.result.structuredContent.text,doc.text);}
});
for(const args of [{},{id:'missing'},{id:'scisynth',patient:'confidential'},{id:42},{id:'../../.env'},null,[]])test('Tool arguments are validated: '+JSON.stringify(args),async()=>{
 const d=await (await call(req('tools/call',{name:'drugiq_get_tool',arguments:args}))).json();assert.equal(d.result.isError,true);assert.ok(!d.result.structuredContent);
});
test('Arbitrary remote resource URLs are rejected without fetching',async()=>{const d=await (await call(req('resources/read',{uri:'http://169.254.169.254/latest/meta-data/'}))).json();assert.equal(d.error.code,-32002);});
test('Unknown methods and tools have appropriate JSON-RPC errors',async()=>{
 assert.equal((await (await call(req('run_research'))).json()).error.code,-32601);
 assert.equal((await (await call(req('tools/call',{name:'run_dossier',arguments:{}}))).json()).error.code,-32602);
});
test('Unsupported pagination cursors are not silently ignored',async()=>{assert.equal((await (await call(req('tools/list',{cursor:'fake'}))).json()).error.code,-32602);});
for(const [body,code] of [['{',-32700],[[], -32600],[null,-32600],[{jsonrpc:'2.0',id:null,method:'ping'},-32600],[{jsonrpc:'1.0',id:1,method:'ping'},-32600],[{jsonrpc:'2.0',id:1,method:'ping',params:[]},-32600]])test('Invalid JSON-RPC request: '+JSON.stringify(body),async()=>{
 const r=await call(body);assert.equal(r.status,400);assert.equal((await r.json()).error.code,code);
});
test('Unsupported protocol header is HTTP 400',async()=>{assert.equal((await call(req('ping'),{'MCP-Protocol-Version':'2099-01-01'})).status,400);});
test('Origin checks reject malicious, null and lookalike origins',async()=>{
 for(const origin of ['https://evil.example','null','https://drugiq.vercel.app.evil.example','https://untrusted.vercel.app'])assert.equal((await call(req('ping'),{Origin:origin})).status,403);
 const r=await call(req('ping'),{Origin:manifest.config.url});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),manifest.config.url);assert.equal(r.headers.get('access-control-allow-credentials'),null);
});
test('Missing JSON or SSE acceptance and wrong content type are rejected',async()=>{
 for(const accept of ['application/json','text/event-stream','application/json,text/event-stream;q=0,*/*;q=1',''])assert.equal((await call(req('ping'),{Accept:accept})).status,406);
 assert.equal((await call(req('ping'),{'Content-Type':'text/plain'})).status,415);
});
test('GET and DELETE use real 405 rather than a fake manifest',async()=>{
 for(const method of ['GET','DELETE']){const r=await call('',{},method);assert.equal(r.status,405);assert.equal(r.headers.get('allow'),'POST, OPTIONS');}
});
test('OPTIONS CORS preflight has exact safe headers',async()=>{
 const r=await call('',{Origin:manifest.config.url,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,mcp-protocol-version'},'OPTIONS');assert.equal(r.status,204);assert.equal(await r.text(),'');
 assert.equal((await call('',{Origin:manifest.config.url,'Access-Control-Request-Headers':'authorization'},'OPTIONS')).status,403);
});
test('Bodies larger than 64 KiB are rejected',async()=>{
 const r=await call(req('tools/call',{name:'drugiq_read_document',arguments:{id:'x'.repeat(70000)}}));assert.equal(r.status,413);
});
