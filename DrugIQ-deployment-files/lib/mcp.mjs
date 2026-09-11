import {quality} from './accept.mjs';
import {catalogSchema} from './catalog.mjs';
export const MCP_LATEST = '2025-11-25';
export const MCP_VERSIONS = ['2025-11-25','2025-06-18','2025-03-26'];
export const MAX_BODY_BYTES = 64 * 1024;
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const has = (x,k) => Object.prototype.hasOwnProperty.call(x,k);
const validId = id => typeof id==='string' || (typeof id==='number' && Number.isSafeInteger(id));
function json(status,body,extra={}) {return new Response(body===null?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin, Accept','X-Content-Type-Options':'nosniff',...extra}});}
const rpcError=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
const output=(value,version)=>({content:[{type:'text',text:JSON.stringify(value)}],...(version==='2025-03-26'?{}:{structuredContent:value}),isError:false});
const invalidTool=message=>({content:[{type:'text',text:message}],isError:true});
function allowedOrigin(origin,config) {
 if(!origin)return true;
 const origins=new Set([config.url,...(config.mcpAllowedOrigins||[])]);
 // Preview origins come only from a trusted hosting environment, never Host or request headers.
 for(const key of ['VERCEL_URL','VERCEL_BRANCH_URL']){
  const host=process.env[key];if(host&&/^[a-zA-Z0-9.-]+\.vercel\.app$/.test(host))origins.add('https://'+host);
 }
 return origins.has(origin);
}
export function toolsFor(manifest,version=MCP_LATEST) {
 const objectSchema = properties=>({type:'object',properties,additionalProperties:false});
 const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
 const specs=[
  {name:'drugiq_list_tools',description:'List DrugIQ browser research workflows and their limitations. Public metadata only; does not execute research or call model backends.',inputSchema:objectSchema({stage:{type:'string',enum:['target','hit','lead','clinical','cross-stage']}}),outputSchema:{type:'object',required:['tools','scope'],properties:{tools:{type:'array',items:catalogSchema()},scope:{type:'string'}},additionalProperties:false}},
  {name:'drugiq_get_tool',description:'Get one DrugIQ catalog entry, browser input requirements, limitations and navigation URL. Does not generate a scientific result.',inputSchema:{...objectSchema({id:{type:'string',enum:manifest.catalog.tools.map(t=>t.id)}}),required:['id']},outputSchema:{type:'object',required:['tool'],properties:{tool:catalogSchema()},additionalProperties:false}},
  {name:'drugiq_read_document',description:'Read an allowlisted public DrugIQ usage document as Markdown. Cannot fetch arbitrary URLs, access private files or run scientific analyses.',inputSchema:{...objectSchema({id:{type:'string',enum:Object.keys(manifest.documents)}}),required:['id']},outputSchema:{type:'object',required:['id','uri','mimeType','text'],properties:{id:{type:'string'},uri:{type:'string',format:'uri'},mimeType:{type:'string',const:'text/markdown'},text:{type:'string'}},additionalProperties:false}}
 ];
 return specs.map(s=>{const spec={...s,annotations};if(version==='2025-03-26')delete spec.outputSchema;return spec;});
}
function validateArguments(args,schema) {
 if(!plain(args))return 'arguments must be an object.';
 for(const key of schema.required||[])if(!has(args,key))return 'Missing required argument: '+key;
 for(const [key,value] of Object.entries(args)) {
  if(!has(schema.properties,key))return 'Unknown argument: '+key;
  const rule=schema.properties[key];
  if(typeof value!==rule.type || (rule.enum&&!rule.enum.includes(value)))return 'Invalid value for argument: '+key;
 }
 return null;
}
export async function handleMCP(request,manifest) {
 const origin=request.headers.get('origin');
 if(!allowedOrigin(origin,manifest.config))return json(403,{error:'Forbidden origin'});
 const cors=origin?{'Access-Control-Allow-Origin':origin,'Access-Control-Expose-Headers':'MCP-Protocol-Version'}:{};
 if(request.method==='OPTIONS'){
  const asked=request.headers.get('access-control-request-method');
  if(asked&&asked!=='POST')return json(405,{error:'Only POST is supported.'},{Allow:'POST, OPTIONS',...cors});
  const requestedHeaders=(request.headers.get('access-control-request-headers')||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
  if(requestedHeaders.some(x=>!['content-type','accept','mcp-protocol-version'].includes(x)))return json(403,{error:'Unsupported request header.'},cors);
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Accept, MCP-Protocol-Version','Cache-Control':'no-store','Vary':'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',...cors}});
 }
 if(request.method!=='POST')return json(405,{error:'Use POST with JSON-RPC initialization. Standalone SSE and sessions are not supported.',documentation:manifest.config.url+'/docs/mcp'},{Allow:'POST, OPTIONS',...cors});
 const contentType=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 if(contentType!=='application/json')return json(415,{error:'Content-Type must be application/json.'},cors);
 const accept=request.headers.get('accept');
 if(!accept||quality(accept,'application/json').q===0||quality(accept,'text/event-stream').q===0)return json(406,{error:'Accept must permit application/json and text/event-stream.'},cors);
 const headerVersion=request.headers.get('mcp-protocol-version');
 if(headerVersion&&!MCP_VERSIONS.includes(headerVersion))return json(400,{error:'Unsupported MCP-Protocol-Version header.',supported:MCP_VERSIONS},cors);
 const length=request.headers.get('content-length');
 if(length&&Number(length)>MAX_BODY_BYTES)return json(413,{error:'Request body exceeds 64 KiB.'},cors);
 let raw;
 try{raw=await request.text();}catch{return json(400,{error:'Unreadable request body.'},cors);}
 if(Buffer.byteLength(raw)>MAX_BODY_BYTES)return json(413,{error:'Request body exceeds 64 KiB.'},cors);
 let message;
 try{message=JSON.parse(raw);}catch{return json(400,rpcError(null,-32700,'Parse error'),cors);}
 if(!plain(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string'||!message.method||has(message,'result')||has(message,'error')||(has(message,'id')&&!validId(message.id))||(has(message,'params')&&!plain(message.params)))return json(400,rpcError(null,-32600,'Invalid Request. Send one JSON-RPC request or notification, not a batch.'),cors);
 const params=message.params||{},id=message.id;
 // JSON-RPC notifications never receive JSON-RPC responses. No state is retained.
 if(!has(message,'id'))return new Response(null,{status:202,headers:{'Cache-Control':'no-store','Vary':'Origin, Accept',...cors}});
 const success=result=>json(200,{jsonrpc:'2.0',id,result},cors);
 const failure=(code,text)=>json(200,rpcError(id,code,text),cors);
 let version=headerVersion||'2025-03-26';
 if(message.method==='initialize') {
  if(typeof params.protocolVersion!=='string'||!plain(params.capabilities)||!plain(params.clientInfo)||typeof params.clientInfo.name!=='string'||!params.clientInfo.name||typeof params.clientInfo.version!=='string')return failure(-32602,'initialize requires protocolVersion, capabilities and clientInfo with name and version.');
  version=MCP_VERSIONS.includes(params.protocolVersion)?params.protocolVersion:MCP_LATEST;
  return success({protocolVersion:version,capabilities:{tools:{listChanged:false},resources:{subscribe:false,listChanged:false}},serverInfo:{name:'drugiq-discovery',version:'1.0.0',...(version==='2025-03-26'?{}:{title:'DrugIQ Research Discovery',websiteUrl:manifest.config.url})},instructions:'Public-read DrugIQ catalog and guidance only. Tools do not run scientific analyses or call external models. Do not submit patient data or confidential research. Review the limitations document before describing product capabilities.'});
 }
 switch(message.method) {
  case 'ping':return success({});
  case 'tools/list':{
   if(params.cursor!=null)return failure(-32602,'No pagination cursor is issued by this server.');
   return success({tools:toolsFor(manifest,version)});
  }
  case 'tools/call':{
   if(typeof params.name!=='string')return failure(-32602,'Tool name is required.');
   const tool=toolsFor(manifest,version).find(t=>t.name===params.name);
   if(!tool)return failure(-32602,'Unknown tool. Use tools/list to discover supported names.');
   const args=has(params,'arguments')?params.arguments:{};
   const invalid=validateArguments(args,tool.inputSchema);
   if(invalid)return success(invalidTool(invalid));
   if(tool.name==='drugiq_list_tools')return success(output({tools:manifest.catalog.tools.filter(t=>!args.stage||t.stage===args.stage),scope:manifest.catalog.scope},version));
   if(tool.name==='drugiq_get_tool')return success(output({tool:manifest.catalog.tools.find(t=>t.id===args.id)},version));
   const document=manifest.documents[args.id];
   return success(output({id:document.id,uri:document.uri,mimeType:'text/markdown',text:document.text},version));
  }
  case 'resources/list':{
   if(params.cursor!=null)return failure(-32602,'No pagination cursor is issued by this server.');
   return success({resources:Object.values(manifest.documents).map(d=>({uri:d.uri,name:d.id,description:d.title,mimeType:'text/markdown'}))});
  }
  case 'resources/templates/list':return success({resourceTemplates:[]});
  case 'resources/read':{
   if(typeof params.uri!=='string')return failure(-32602,'uri is required.');
   const document=Object.values(manifest.documents).find(d=>d.uri===params.uri);
   if(!document)return failure(-32002,'Resource not found. Use resources/list.');
   return success({contents:[{uri:document.uri,mimeType:'text/markdown',text:document.text}]});
  }
  default:return failure(-32601,'Method not found. Only declared public-read capabilities are supported.');
 }
}
