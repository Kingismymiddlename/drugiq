import {createHash} from 'node:crypto';
import {negotiate,quality} from './accept.mjs';
import {handleMCP} from './mcp.mjs';
const common = {'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
const privateCache = {'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store'};
const links = config=>({homepage:config.url+'/',documentation:config.url+'/docs',llms:config.url+'/llms.txt',sitemap:config.url+'/sitemap.xml'});
function response(request,body,status=200,headers={}){
 const h=new Headers({...common,...headers});
 const buf=Buffer.isBuffer(body)?body:Buffer.from(body||'');
 if(status===304||status===204)h.delete('Content-Length');else h.set('Content-Length',String(buf.length));
 return new Response(request.method==='HEAD'||status===304||status===204?null:buf,{status,headers:h});
}
function json(request,value,status=200,headers={}) {return response(request,JSON.stringify(value,null,2)+'\n',status,{'Content-Type':'application/json; charset=utf-8',...privateCache,...headers});}
function unacceptable(request){return response(request,'Not acceptable. Request text/html or text/markdown for pages, or the resource\'s documented media type.\n',406,{'Content-Type':'text/plain; charset=utf-8','Vary':'Accept, Accept-Encoding',...privateCache});}
function pageResponse(request,resource,status,config){
 const preferred=status===404?['text/markdown','text/html']:['text/html','text/markdown'];
 const selected=negotiate(request.headers.get('accept'),preferred);
 if(!selected) return unacceptable(request);
 const body=selected==='text/markdown'?resource.markdown:resource.html;
 const head={'Content-Type':selected+'; charset=utf-8','Vary':'Accept, Accept-Encoding',...privateCache,'Link':`<${config.url}/llms.txt>; rel="describedby"`};
 if(resource.mdPath)head.Link+=`, <${config.url}${resource.mdPath}>; rel="alternate"; type="text/markdown"`;
 if(status===404)head['X-Robots-Tag']='noindex';
 return response(request,body,status,head);
}
export async function handleRequest(request,manifest){
 const config=manifest.config;
 let url;try{url=new URL(request.url);}catch{return response(request,'Bad request\n',400,{'Content-Type':'text/plain; charset=utf-8',...privateCache});}
 const path=url.pathname;
 // Match against a generated allowlist only. User paths never become filesystem paths or fetch destinations.
 if(/%(?![a-fA-F0-9]{2})/.test(path)||/%00|%0[ad]|%2f|%5c/i.test(path))return response(request,'Invalid path\n',400,{'Content-Type':'text/plain; charset=utf-8',...privateCache});
 if(path==='/.well-known/mcp'){
  const result=await handleMCP(request,manifest);
  for(const[k,v]of Object.entries(common))result.headers.set(k,v);
  result.headers.set('CDN-Cache-Control','no-store');result.headers.set('Vercel-CDN-Cache-Control','no-store');
  return result;
 }
 if(manifest.aliases[path])return response(request,'',308,{Location:manifest.aliases[path],...privateCache});
 if(path.endsWith('/')&&path!=='/'&&manifest.resources[path.slice(0,-1)])return response(request,'',308,{Location:path.slice(0,-1)+url.search,...privateCache});
 const resource=Object.hasOwn(manifest.resources,path)?manifest.resources[path]:null;
 const catalogPath=path==='/api/catalog';
 const toolPath=/^\/api\/catalog\/([a-z0-9-]+)$/.exec(path);
 if(!['GET','HEAD'].includes(request.method)){
  if(resource||catalogPath||toolPath)return json(request,{error:'method_not_allowed',message:'Use GET or HEAD for this public resource.',links:links(config)},405,{Allow:'GET, HEAD'});
  return pageResponse(request,{html:manifest.notFoundHTML,markdown:manifest.notFoundMarkdown},404,config);
 }
 if(catalogPath||toolPath){
  if(quality(request.headers.get('accept'),'application/json').q===0)return unacceptable(request);
  const item=catalogPath?manifest.catalog:manifest.catalog.tools.find(t=>t.id===toolPath[1]);
  if(!item)return json(request,{error:'not_found',message:'Unknown DrugIQ catalog ID. Read /api/catalog for valid IDs.',links:links(config)},404,{'X-Robots-Tag':'noindex','Vary':'Accept'});
  return json(request,item,200,{'Vary':'Accept','Link':`<${config.url}/openapi.json>; rel="service-desc"; type="application/json", <${config.url}/docs/api>; rel="service-doc"`});
 }
 if(!resource)return pageResponse(request,{html:manifest.notFoundHTML,markdown:manifest.notFoundMarkdown},404,config);
 if(resource.kind==='page')return pageResponse(request,resource,200,config);
 const baseType=resource.mime.split(';')[0];
 if(quality(request.headers.get('accept'),baseType,baseType.startsWith('text/')||baseType.includes('json')||baseType.includes('xml')?{charset:'utf-8'}:{}).q===0)return unacceptable(request);
 const bytes=resource.encoding==='base64'?Buffer.from(resource.body,'base64'):Buffer.from(resource.body);
 const etag='"'+createHash('sha256').update(bytes).digest('hex').slice(0,32)+'"';
 const hdr={'Content-Type':resource.mime,'ETag':etag,'Vary':'Accept, Accept-Encoding','Cache-Control':'public, max-age=0, must-revalidate','Link':`<${config.url}/llms.txt>; rel="describedby"`};
 if(resource.canonicalPath)hdr.Link+=`, <${config.url}${resource.canonicalPath}>; rel="canonical"`;
 const matches=(request.headers.get('if-none-match')||'').split(',').map(x=>x.trim().replace(/^W\//,''));
 if(matches.includes(etag)||matches.includes('*'))return response(request,'',304,hdr);
 return response(request,bytes,200,hdr);
}
