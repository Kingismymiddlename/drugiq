import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {handleRequest} from '../lib/http.mjs';
const manifest=JSON.parse(await readFile(new URL('../dist/site.json',import.meta.url),'utf8'));
const base=manifest.config.url;
const get=(path,headers={},method='GET')=>handleRequest(new Request(base+path,{headers,method}),manifest);
const textOnly=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const preservation=JSON.parse(await readFile(new URL('../reports/preservation.json',import.meta.url),'utf8'));
test('Raw homepage has meaningful content and a clear H1',()=>{
 const h=manifest.resources['/'].html;
 assert.ok(textOnly(h).length>500);assert.equal((h.match(/<h1\b/g)||[]).length,1);
 assert.match(h,/<h1[^>]*id="dx-hero-title"/);assert.match(h,/SciSynth/);assert.match(h,/Candidate Dossier/);
 assert.ok(!/<div id="landing-view"><\/div>/.test(h));
});
test('Homepage metadata, JSON-LD and image are real',()=>{
 const h=manifest.resources['/'].html;
 assert.match(h,/<html lang="en">/);assert.match(h,/<link rel="canonical" href="https:\/\/drugiq.vercel.app\/">/);
 for(const field of ['og:image','og:type','og:url','og:description'])assert.ok(h.includes('property="'+field+'"'));
 const graph=JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)[1])['@graph'];
 assert.ok(graph.some(x=>x['@type']==='SoftwareApplication'&&x.name==='DrugIQ'));
 assert.ok(graph.every(x=>x['@type']!=='Organization'),'No fabricated business identity');
 const bytes=Buffer.from(manifest.resources['/assets/drugiq-social.png'].body,'base64');
 assert.equal(bytes.readUInt32BE(16),1200);assert.equal(bytes.readUInt32BE(20),630);
});
test('Original research core and router are unchanged',async()=>{
 assert.equal(preservation.researchCoreUnchanged,true);assert.equal(preservation.routerUnchanged,true);assert.equal(preservation.researchCoreBytes,163923);
 const source=await readFile(new URL('../source/index.html',import.meta.url),'utf8');
 const original=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const T ='))[1];
 const built=Object.values(manifest.resources).find(r=>r.body?.includes('const T ='))?.body;
 const boundary=original.indexOf('// DrugIQ FIELDNOTES:');assert.ok(boundary>100000);
 assert.equal(original.slice(0,boundary),built.slice(0,boundary));
 const router=original.indexOf('// \u2500\u2500 VIEW ROUTER');assert.ok(router>boundary);assert.equal(original.slice(router),built.slice(built.indexOf('// \u2500\u2500 VIEW ROUTER')));
});
test('Externalized CSS is byte-preserved and ordered',async()=>{
 const source=await readFile(new URL('../source/index.html',import.meta.url),'utf8');
 const head=source.slice(0,source.indexOf('</head>'));
 const styles=[...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)];
 styles.forEach((s,i)=>assert.equal(manifest.resources['/assets/style-'+(i+1)+'.css'].body,s[1]));
});
for(const path of manifest.pages){
 test('HTML and Markdown at '+path,async()=>{
  const html=await get(path,{Accept:'text/html'});const md=await get(path,{Accept:'text/markdown'});
  assert.equal(html.status,200);assert.equal(md.status,200);
  assert.match(html.headers.get('content-type'),/^text\/html/);assert.match(md.headers.get('content-type'),/^text\/markdown/);
  for(const r of [html,md]){assert.match(r.headers.get('vary'),/Accept/);assert.match(r.headers.get('vary'),/Accept-Encoding/);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('vercel-cdn-cache-control'),'no-store');}
  const h=await html.text(),m=await md.text();assert.ok(textOnly(h).length>500);assert.match(m,/^# DrugIQ|^# About DrugIQ|^# Contact DrugIQ|^# Deploying DrugIQ/);
  const headings=[...h.matchAll(/<h([1-6])\b/g)].map(x=>+x[1]);
  assert.equal(headings.filter(x=>x===1).length,1);headings.forEach((n,i)=>{if(i)assert.ok(n<=headings[i-1]+1,'Sequential headings at '+path);});
  assert.equal(await (await get(manifest.resources[path].mdPath)).text(),m);
  const head=await get(path,{Accept:'text/markdown'},'HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(+head.headers.get('content-length'),Buffer.byteLength(m));
 });
}
for(const path of Object.keys(manifest.resources).filter(p=>manifest.resources[p].kind==='static'))test('Static public resource '+path,async()=>{
 const r=await get(path);assert.equal(r.status,200);assert.ok((await r.arrayBuffer()).byteLength>0);assert.ok(r.headers.get('content-type'));assert.equal(r.headers.get('x-content-type-options'),'nosniff');
 const cached=await get(path,{'If-None-Match':r.headers.get('etag')});assert.equal(cached.status,304);assert.equal(cached.headers.get('content-length'),null);assert.equal(await cached.text(),'');
 const head=await get(path,{},'HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');
});
for(const path of ['/not-a-real-drugiq-page','/api/nonexistent','/missing/a/b','/.env','/site.config.json','/source/index.html','/package.json','/api/site','/docs/unknown.md'])test('Real 404, never app shell: '+path,async()=>{
 const r=await get(path);assert.equal(r.status,404);assert.match(r.headers.get('content-type'),/^text\/markdown/);const text=await r.text();assert.ok(text.includes('/sitemap.xml'));assert.ok(text.includes('/llms.txt'));assert.ok(!text.includes('const T ='));
 const html=await get(path,{Accept:'text/html'});assert.equal(html.status,404);assert.match(html.headers.get('x-robots-tag'),/noindex/);
});
test('Unknown catalog entry returns JSON 404',async()=>{const r=await get('/api/catalog/not-real');assert.equal(r.status,404);assert.equal((await r.json()).error,'not_found');});
test('Unsupported media types and methods',async()=>{
 for(const path of ['/','/docs','/api/catalog','/robots.txt'])assert.equal((await get(path,{Accept:'image/jpeg'})).status,406);
 for(const path of ['/','/docs','/api/catalog']){const r=await get(path,{},'POST');assert.equal(r.status,405);assert.equal(r.headers.get('allow'),'GET, HEAD');}
});
test('Explicit q exclusions and sequential cache variants',async()=>{
 for(let i=0;i<3;i++){
  const m=await get('/',{Accept:'text/html;q=0, text/markdown;q=1'});assert.match(m.headers.get('content-type'),/^text\/markdown/);
  const h=await get('/',{Accept:'text/markdown;q=0, text/html;q=1'});assert.match(h.headers.get('content-type'),/^text\/html/);
 }
});
test('Sitemap contains only canonical HTML pages with accurate lastmod dates',()=>{
 const xml=manifest.resources['/sitemap.xml'].body;assert.match(xml,/xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
 const urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]);assert.equal(urls.length,manifest.pages.length);assert.equal(new Set(urls).size,urls.length);
 assert.ok(urls.every(x=>!x.includes('#')&&manifest.resources[new URL(x).pathname]?.indexable));
 assert.equal((xml.match(/<lastmod>2026-09-10<\/lastmod>/g)||[]).length,urls.length);
});
test('llms.txt follows H1, summary, non-heading details, H2 link-list ordering',()=>{
 const llms=manifest.resources['/llms.txt'].body;assert.match(llms,/^# DrugIQ\n\n> /);assert.equal((llms.match(/^# /gm)||[]).length,1);assert.equal((llms.match(/^### /gm)||[]).length,0);
 for(const section of llms.split(/^## .+$/m).slice(1)){const lines=section.trim().split('\n').filter(Boolean);assert.ok(lines.length>0);assert.ok(lines.every(x=>/^- \[[^\]]+\]\(https:\/\/[^\s)]+\)(?:: .+)?$/.test(x)));}
 assert.match(llms,/When to use DrugIQ/);assert.match(llms,/\/docs\/mcp.md/);
});
test('OpenAPI describes only implemented public discovery operations',async()=>{
 const spec=JSON.parse(manifest.resources['/openapi.json'].body);assert.equal(spec.openapi,'3.1.1');assert.deepEqual(Object.keys(spec.paths),['/api/catalog','/api/catalog/{id}']);assert.deepEqual(spec.security,[]);
 const list=await (await get('/api/catalog')).json();assert.equal(list.tools.length,12);
 for(const entry of list.tools){const r=await get('/api/catalog/'+entry.id);assert.equal(r.status,200);assert.deepEqual(await r.json(),entry);assert.equal(entry.executionAvailable,false);assert.ok(entry.limitations.length);}
});
test('Source code and secrets are not public routes',async()=>{
 for(const p of ['/lib/http.mjs','/api/site.mjs','/dist/site.json','/reports/preservation.json','/node_modules','/.git/config'])assert.equal((await get(p)).status,404);
});
test('Known aliases and trailing slashes redirect once',async()=>{
 for(const [alias,to] of Object.entries(manifest.aliases)){const r=await get(alias);assert.equal(r.status,308);assert.equal(r.headers.get('location'),to);assert.ok((await get(to)).status===200);}
 assert.equal((await get('/about/')).headers.get('location'),'/about');
});
