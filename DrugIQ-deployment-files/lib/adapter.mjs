import {handleRequest} from './http.mjs';
import {MAX_BODY_BYTES} from './mcp.mjs';
/** Shared adapter for Vercel's Node request/response API and the local deployment emulator. */
export async function nodeAdapter(req,res,manifest,{routed=false}={}){
 const parsed=new URL(req.url,manifest.config.url);
 let path=parsed.pathname;
 if(routed){
  if(parsed.searchParams.getAll('__drugiq_path').length>1){res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Ambiguous route\n');return;}
  const injected=parsed.searchParams.get('__drugiq_path');
  if(injected!==null){path=injected;parsed.searchParams.delete('__drugiq_path');}
 }
 if(!path.startsWith('/')||path.startsWith('//')||/[\r\n?#\\]/.test(path)){
  res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Invalid route\n');return;
 }
 const headers=new Headers();
 for(const[k,v]of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(', '):v);
 let body;
 if(!['GET','HEAD'].includes(req.method)){
  if(Number(req.headers['content-length']||0)>MAX_BODY_BYTES){res.writeHead(413,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Request body exceeds 64 KiB."}');req.resume();return;}
  const chunks=[];let size=0;
  try{
   // Vercel may already have consumed/parsed a request body; preserve the raw stream whenever available.
   if(req.readableEnded && req.body!==undefined){body=Buffer.isBuffer(req.body)?req.body:Buffer.from(typeof req.body==='string'?req.body:JSON.stringify(req.body));size=body.length;}
   else {for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>MAX_BODY_BYTES){res.writeHead(413,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Request body exceeds 64 KiB."}');return;}chunks.push(bytes);}body=Buffer.concat(chunks);}
   if(size>MAX_BODY_BYTES){res.writeHead(413,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Request body exceeds 64 KiB."}');return;}
  }catch{if(!res.headersSent){res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Unreadable request body."}');}return;}
 }
 try{
  const request=new Request(manifest.config.url+path+(parsed.searchParams.size?'?'+parsed.searchParams.toString():''),{method:req.method,headers,...(body?{body}: {})});
  const result=await handleRequest(request,manifest);
  const resultHeaders=Object.fromEntries(result.headers);
  res.writeHead(result.status,resultHeaders);
  if(req.method==='HEAD'||!result.body)res.end();else res.end(Buffer.from(await result.arrayBuffer()));
 }catch{
  if(!res.headersSent){res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end('{"error":"Internal server error."}');}else res.end();
 }
}
