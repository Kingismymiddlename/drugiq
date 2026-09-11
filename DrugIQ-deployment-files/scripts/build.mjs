import {readFile,writeFile,mkdir,rm,cp} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {metadata,pageHTML,escapeHtml} from '../lib/render.mjs';
import {createCatalog,createOpenAPI} from '../lib/catalog.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(resolve(ROOT,'site.config.json'),'utf8'));
const site = new URL(config.url);
if (site.protocol !== 'https:' || config.url !== site.origin) throw new Error('site.config.json url must be a bare HTTPS origin without a trailing slash');
if (!/^\d{4}-\d{2}-\d{2}$/.test(config.contentUpdated) || Number.isNaN(Date.parse(config.contentUpdated))) throw new Error('contentUpdated must be a real ISO date');
if (config.contactEmail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(config.contactEmail)) throw new Error('Invalid public contact email');
if (!Array.isArray(config.sameAs) || config.sameAs.some(x=>!/^https:\/\//.test(x))) throw new Error('sameAs must contain only verified HTTPS profile URLs');
const source = await readFile(resolve(ROOT,'source/index.html'),'utf8');
const scriptRe=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const mainMatch=[...source.matchAll(scriptRe)].find(m=>m[2].includes('const T ='));
if(!mainMatch) throw new Error('Cannot locate original application script');
const mainJs=mainMatch[2];
const coreEnd=mainJs.indexOf('// DrugIQ FIELDNOTES:');
if(coreEnd<0) throw new Error('Unexpected source version; review before modifying');
const uiStart=mainJs.indexOf('function dxArrow()');
const uiEnd=mainJs.indexOf('// The canvas is original');
const toolStart=mainJs.indexOf('const T =');
const toolEnd=mainJs.indexOf('const HANDOFFS =');
if([uiStart,uiEnd,toolStart,toolEnd].some(x=>x<0)) throw new Error('Missing source markers');
const footerLinks='<a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/docs">Developers</a>';
let presentation=mainJs.slice(uiStart,uiEnd);
presentation=presentation.replace('<button onclick="cbotToggle()">Ask DrugIQ</button></div>', '<button onclick="cbotToggle()">Ask DrugIQ</button>'+footerLinks+'</div>');
// Normal clicks still invoke the original app handlers. Non-JS readers get real documentation URLs.
presentation=presentation.replaceAll('href="#${id}"','href="/tools/${id}"');
for(const id of ['dossier','scisynth','trialmatch']) presentation=presentation.replaceAll('href="#'+id+'"','href="/tools/'+id+'"');
presentation=presentation.replaceAll('href="#welcome"','href="/docs"');
presentation=presentation.replace('class="dx-footer-links"','class="dx-footer-links" style="flex-wrap:wrap"');
const patchedJs=mainJs.slice(0,uiStart)+presentation+mainJs.slice(uiEnd);
const sandbox=Object.create(null);
vm.runInNewContext(mainJs.slice(toolStart,toolEnd)+ '\n'+presentation+'\nresult={markup:landingHTML(),tools:T,copy:UX_TOOL_COPY,chain:CHAIN_MAP};',sandbox,{timeout:2000});
const extracted=JSON.parse(JSON.stringify(sandbox.result));
const catalog=createCatalog(config,extracted.tools,extracted.copy,extracted.chain);
const out=resolve(ROOT,'dist'); await rm(out,{recursive:true,force:true}); await mkdir(resolve(out,'public'),{recursive:true});
const resources={}; const documents={}; const pages=[];
async function asset(path,mime,body,{encoding='utf8',indexable=false}={}) {
 const filename=path.replace(/^\//,'');
 const target=resolve(out,'public',filename); await mkdir(dirname(target),{recursive:true});
 await writeFile(target,body,encoding==='base64'?{encoding:'base64'}:'utf8');
 resources[path]={kind:'static',mime,body:encoding==='base64'?body:body.toString(),encoding,indexable};
}
function page(path,md,description) {
 const html=pageHTML(config,path,md,description), mdPath=path==='/'?'/index.md':path+'.md';
 resources[path]={kind:'page',mime:'text/html; charset=utf-8',html,markdown:md,mdPath,indexable:true};
 resources[mdPath]={kind:'static',mime:'text/markdown; charset=utf-8',body:md,encoding:'utf8',indexable:false,canonicalPath:path};
 pages.push(path);
}
const graph=[
 {'@type':'SoftwareApplication','@id':config.url+'/#software',name:config.name,url:config.url+'/',description:config.description,applicationCategory:'EducationalApplication',applicationSubCategory:'Drug-development research workspace',operatingSystem:'Web browser',isAccessibleForFree:true,image:config.url+'/assets/drugiq-social.png',featureList:catalog.tools.map(t=>t.name),...(config.sameAs.length?{sameAs:config.sameAs}:{})},
 {'@type':'WebSite','@id':config.url+'/#website',name:config.name,url:config.url+'/',description:config.description,inLanguage:'en',about:{'@id':config.url+'/#software'}}
];
let orgPublished=false;
if(config.organization) {
 const o=config.organization,a=o.address;
 if(!o.name || !o.verified || !config.contactEmail || !a || !['streetAddress','addressLocality','postalCode','addressCountry'].every(k=>typeof a[k]==='string'&&a[k].trim())) throw new Error('Organization must be verified with name, contactEmail and a complete real public postal address. Otherwise leave organization null.');
 graph.push({'@type':'Organization','@id':config.url+'/#organization',name:o.name,url:config.url+'/',contactPoint:{'@type':'ContactPoint',contactType:'support',email:config.contactEmail,...(o.phone?{telephone:o.phone}:{})},address:{'@type':'PostalAddress',...a},...(config.sameAs.length?{sameAs:config.sameAs}:{})});
 graph[0].publisher={'@id':config.url+'/#organization'}; graph[1].publisher={'@id':config.url+'/#organization'};orgPublished=true;
}
const jsonld=JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c');
let html=source.replace(mainMatch[0],'<script>'+patchedJs+'</script>');
html=html.replace('<div id="landing-view"></div>','<div id="landing-view">'+extracted.markup+'</div>');
html=html.replace(/<title>[\s\S]*?<\/title>/,metadata(config,'/','DrugIQ - Research drug development, faster',config.description,'/index.md'));
html=html.replace('</head>','<script type="application/ld+json">'+jsonld+'</script>\n'+(config.googleSiteVerification?'<meta name="google-site-verification" content="'+escapeHtml(config.googleSiteVerification)+'">\n':'')+'</head>');
// Move only actual head styles. Never parse the print template inside the application script as page CSS.
const headEnd=html.indexOf('</head>');let head=html.slice(0,headEnd),tail=html.slice(headEnd),styleIndex=0;
for(const m of [...head.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)]) {
 const path='/assets/style-'+(++styleIndex)+'.css'; await asset(path,'text/css; charset=utf-8',m[2]);
 head=head.replace(m[0],`<link rel="stylesheet" href="${path}">`);
}
html=head+tail;
const inlineHashes=[];let scriptIndex=0;
for(const m of [...html.matchAll(scriptRe)]) {
 if(/\bsrc\s*=|application\/ld\+json/.test(m[1]))continue;
 const path='/assets/inline-'+(++scriptIndex)+'.js';await asset(path,'application/javascript; charset=utf-8',m[2]);
 inlineHashes.push({path,sha256:createHash('sha256').update(m[2]).digest('hex'),bytes:Buffer.byteLength(m[2])});
 html=html.replace(m[0],`<script src="${path}"></script>`);
}
const nojs='<noscript><div style="padding:12px 5vw;background:#edf0e5;color:#283a2d;font:14px/1.6 system-ui">DrugIQ research tools require JavaScript. You can still read this homepage, <a href="/docs">browse the tool documentation</a> or <a href="/index.md">read the Markdown version</a>.</div><style>#cbot-launch,#cbot-panel,.dx-motion,.dx-menu,.dx-filters,.dx-scroll{display:none!important}.dx-nav-links{display:flex!important;position:static!important;flex-wrap:wrap!important}.dx-nav-inner{height:auto!important;min-height:88px;padding-top:12px;padding-bottom:12px}.dx-reveal{opacity:1!important;transform:none!important}</style></noscript>';
html=html.replace(/<noscript>[\s\S]*?<\/noscript>/g,'');
html=html.replace('<body>','<body>'+nojs);
const homeMd='# DrugIQ - Research drug development, faster\n\n> See the evidence. Shape what is next.\n\n'+config.description+'\n\nBring literature, targets, compounds and trials into one research workspace. A clearer starting point for your next scientific question. Free to explore; no sign-up required. The browser workspace requires JavaScript; this page and the documentation do not.\n\n## Candidate Dossier\n\nStart with a target, compound and indication. Bring target validation, compound properties, prior-agent evidence and the trial landscape into a single report. Keep the sources in view and export a research brief, print your report, or take structured JSON into your next workflow. The dossier uses heuristic scores, not a validated clinical-success prediction.\n\n[Candidate Dossier documentation]('+config.url+'/tools/dossier)\n\n## Eleven specialist research tools\n\n'+catalog.tools.filter(t=>t.id!=='dossier').map(t=>'- ['+t.name+']('+t.documentationUrl+'): '+t.description).join('\n')+'\n\n## Who the workspace is for\n\nDiscovery researchers can explore literature, disease-associated targets and compound context. Translational researchers can investigate biomarkers, trial landscapes and immunotherapy research. Learners can use example inputs and Guide Mode for plain-language explanations.\n\n## Public sources and limitations\n\nSources used across the toolkit include PubMed, Open Targets, ChEMBL, PubChem and ClinicalTrials.gov. Availability varies by tool. Names identify sources, not partners or endorsements. Some workflows provide AI-assisted context and external-model links rather than executing the named external models. Review source panels and unavailable-data notices.\n\nDrugIQ is for research and exploration only, not diagnosis, treatment selection or clinical decision-making. AI-generated interpretations and scores require independent scientific review. Do not submit sensitive patient information or confidential research.\n\n## Next steps\n\n- [Open the workspace]('+config.url+'/#welcome): JavaScript required.\n- [DrugIQ developer documentation]('+config.url+'/docs)\n- [Agent instructions]('+config.url+'/docs/agent-instructions)\n- [Research limitations]('+config.url+'/docs/limitations)\n- [About DrugIQ]('+config.url+'/about)\n- [Contact status]('+config.url+'/contact)\n- [Privacy and data handling]('+config.url+'/privacy)\n';
page('/',homeMd,config.description);resources['/'].html=html;
const authored=[['about','/about'],['contact','/contact'],['privacy','/privacy'],['docs','/docs'],['api','/docs/api'],['authentication','/docs/authentication'],['mcp','/docs/mcp'],['agent-instructions','/docs/agent-instructions'],['data-sources','/docs/data-sources'],['limitations','/docs/limitations'],['deployment','/docs/deployment']];
for(const [file,path] of authored){
 let md=await readFile(resolve(ROOT,'content',file+'.md'),'utf8');
 // A custom canonical host propagates to authored examples and links.
 md=md.replaceAll('https://drugiq.vercel.app',config.url);
 if(config.contactEmail&&file==='contact') md='# Contact DrugIQ\n\nFor product-support questions, documentation corrections or data-handling inquiries, email [the DrugIQ maintainer](mailto:'+config.contactEmail+'). This channel is configured by the site operator. It is not an emergency or clinical service. No response-time guarantee is made.\n\n## Reporting a technical problem\n\nInclude the tool name, browser, approximate time and a reproducible public or synthetic example. Describe the expected behavior and what happened instead. Do not include patient-identifying information, private research, passwords, access tokens or proprietary compound structures. Use source identifiers to document a scientific correction, and distinguish a retrieval failure from a disputed interpretation.\n\n## Documentation and privacy\n\nRead [the documentation](/docs) for workflow instructions and [privacy and data handling](/privacy) for the available processing disclosures. The assistant is a navigation aid, not a monitored human support queue.\n'+(orgPublished?'\n## Responsible organization\n\n'+config.organization.name+'\n\n'+Object.values(config.organization.address).join(', ')+'\n':'\nA verified legal operator and public business address have not yet been supplied. No business-location claim is made.\n');
 if(orgPublished&&file==='about') md=md.replace('No legal operator identity or business address has been verified in the supplied project, so this page does not attribute DrugIQ to an unconfirmed company.','The operator has verified '+config.organization.name+' as the organization responsible for this site. See the [contact page](/contact) for its configured public details.');
 const description=md.split('\n\n').find(s=>!s.startsWith('#'))?.slice(0,220)||config.description;
 page(path,md,description);documents[file]={id:file,title:/^# (.+)$/m.exec(md)[1],uri:config.url+path+'.md',path:path+'.md',text:md};
}
for(const tool of catalog.tools) {
 const md='# DrugIQ '+tool.name+' - '+tool.category+'\n\n'+tool.description+' This is an existing browser research workflow. The public API and MCP interface describe it but do not execute it.\n\n## Inputs in the browser\n\n'+tool.inputs.map(f=>'- '+f.label+': '+(f.required?'required':'optional')+(f.options?'; options: '+f.options.join(', '):'')+'.').join('\n')+'\n\n## What to expect and what not to assume\n\n'+tool.limitations.join('\n\n')+'\n\nCheck the original source records and any missing-data indicators. Generated interpretations and heuristic scores are for exploratory research, not clinical decisions. Do not submit confidential research or patient-identifying information.\n\n## Open or integrate\n\n- [Open '+tool.name+' in the workspace]('+tool.browserUrl+'): Requires JavaScript and the existing upstream services.\n- [Read this catalog entry as JSON]('+config.url+'/api/catalog/'+tool.id+')\n- [Read the DrugIQ public API reference]('+config.url+'/docs/api)\n- [Review scientific limitations]('+config.url+'/docs/limitations)\n\nThis page documents the supplied client, not an independently audited backend or a guarantee of live availability. Source names and external-model links do not imply endorsement.\n';
 page('/tools/'+tool.id,md,tool.description);
 documents['tool-'+tool.id]={id:'tool-'+tool.id,title:'DrugIQ '+tool.name,uri:tool.documentationUrl+'.md',path:'/tools/'+tool.id+'.md',text:md};
}
documents.home={id:'home',title:'DrugIQ overview',uri:config.url+'/index.md',path:'/index.md',text:homeMd};
const llms='# DrugIQ\n\n> Drug-development research workspace with eleven specialist tools and a Candidate Dossier. Public API and MCP access provide read-only tool metadata and usage guidance, not scientific execution.\n\nCanonical site: '+config.url+'/. Research use only; not for diagnosis or treatment decisions. Do not submit confidential research or patient-identifying information. Vercel is the hosting provider, not the DrugIQ product identity.\n\nWhen to use DrugIQ: find a browser workflow for literature synthesis, target or compound exploration, biomarker and trial research, or a consolidated candidate evidence review. Use GET /api/catalog or the read-only MCP endpoint to discover capabilities. Do not assume external model links run those models or that heuristic scores validate a clinical conclusion.\n\n## When to use DrugIQ\n\n- [DrugIQ agent instructions]('+config.url+'/docs/agent-instructions.md): Specific best-fit jobs, calling instructions, restrictions and 404 recovery.\n- [DrugIQ overview]('+config.url+'/index.md): Product purpose, audiences and toolkit.\n- [DrugIQ limitations]('+config.url+'/docs/limitations.md): Heuristic scores, missing evidence and external-model boundaries.\n\n## Developer resources\n\n- [DrugIQ developer documentation]('+config.url+'/docs.md): Public API and browser workflow directory.\n- [DrugIQ API reference]('+config.url+'/docs/api.md): Implemented read-only catalog endpoints.\n- [DrugIQ OpenAPI 3.1.1 specification]('+config.url+'/openapi.json): Machine-readable contract for the public catalog only.\n- [DrugIQ authentication]('+config.url+'/docs/authentication.md): Anonymous public-read scope and required decisions before scientific execution.\n- [DrugIQ MCP integration]('+config.url+'/docs/mcp.md): Streamable HTTP initialization and read-only tools at /.well-known/mcp.\n- [DrugIQ deployment on Vercel]('+config.url+'/docs/deployment.md): Hosting instructions, not Vercel developer-product capabilities.\n\n## Research tools\n\n'+catalog.tools.map(t=>'- [DrugIQ '+t.name+']('+t.documentationUrl+'.md): '+t.description).join('\n')+'\n\n## Trust and data handling\n\n- [About DrugIQ]('+config.url+'/about.md): Product scope and verified identity boundaries.\n- [Contact DrugIQ]('+config.url+'/contact.md): Actual contact availability; do not infer an unpublished email or address.\n- [DrugIQ privacy disclosure]('+config.url+'/privacy.md): Client data flows and outstanding operator review.\n- [DrugIQ data sources]('+config.url+'/docs/data-sources.md): Provenance and integration limitations.\n\n## Optional\n\n- [DrugIQ sitemap]('+config.url+'/sitemap.xml): Canonical indexable HTML pages.\n';
await asset('/llms.txt','text/plain; charset=utf-8',llms);
await asset('/robots.txt','text/plain; charset=utf-8','User-agent: *\nAllow: /\n\nSitemap: '+config.url+'/sitemap.xml\n');
const sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+pages.map(path=>'  <url><loc>'+escapeHtml(config.url+(path==='/'?'/':path))+'</loc><lastmod>'+config.contentUpdated+'</lastmod></url>').join('\n')+'\n</urlset>\n';
await asset('/sitemap.xml','application/xml; charset=utf-8',sitemap);
const openapi=createOpenAPI(config,catalog);await asset('/openapi.json','application/json; charset=utf-8',JSON.stringify(openapi,null,2)+'\n');
for(const [file,mime] of [['docs.css','text/css; charset=utf-8'],['favicon.svg','image/svg+xml'],['drugiq-social.png','image/png']]) {
 const bytes=await readFile(resolve(ROOT,'public/assets',file));
 await asset('/assets/'+file,mime,bytes.toString('base64'),{encoding:'base64'});
}
const notFoundMarkdown='# DrugIQ - 404 Not Found\n\nThis path does not exist. No research result was generated.\n\n- [DrugIQ homepage]('+config.url+'/)\n- [Documentation]('+config.url+'/docs)\n- [Agent guide]('+config.url+'/llms.txt)\n- [Sitemap]('+config.url+'/sitemap.xml)\n- [Public API reference]('+config.url+'/docs/api)\n';
const errorHtml=pageHTML(config,'/404',notFoundMarkdown,'DrugIQ page not found').replace(/<link rel="canonical"[^>]*>\n|<link rel="alternate"[^>]*>\n/g,'').replace('</head>','<meta name="robots" content="noindex"></head>');
const manifest={version:1,config,catalog,documents,resources,notFoundMarkdown,notFoundHTML:errorHtml,pages,aliases:{'/index.html':'/','/developers':'/docs','/docs/index.html':'/docs','/api/openapi.json':'/openapi.json','/docs/llms.txt':'/llms.txt'}};
await writeFile(resolve(out,'site.json'),JSON.stringify(manifest));
// Export actual generated files for inspection, without exposing non-public source or config.
for(const [path,r] of Object.entries(resources)) {
 if(r.kind==='page'){const file=path==='/'?'index.html':path.slice(1)+'.html';await mkdir(dirname(resolve(out,'public',file)),{recursive:true});await writeFile(resolve(out,'public',file),r.html);}
 else if(r.encoding!=='base64') {await mkdir(dirname(resolve(out,'public',path.slice(1))),{recursive:true});await writeFile(resolve(out,'public',path.slice(1)),r.body);}
}
const hash=s=>createHash('sha256').update(s).digest('hex');
const preservation={source:'source/index.html',sourceSha256:hash(source),sourceBytes:Buffer.byteLength(source),researchCoreBytes:Buffer.byteLength(mainJs.slice(0,coreEnd)),researchCoreSha256:hash(mainJs.slice(0,coreEnd)),researchCoreUnchanged:mainJs.slice(0,coreEnd)===patchedJs.slice(0,coreEnd),routerUnchanged:mainJs.slice(mainJs.indexOf('// \u2500\u2500 VIEW ROUTER'))===patchedJs.slice(patchedJs.indexOf('// \u2500\u2500 VIEW ROUTER')),scriptAssets:inlineHashes,changes:['Pre-render existing landing template','Move original CSS and JavaScript into same-origin files without altering the research core','Add metadata and SoftwareApplication/WebSite JSON-LD','Add footer documentation links and no-JavaScript navigation targets','Add public documentation, discovery API and read-only MCP'],organizationPublished:orgPublished,privacyOperatorReviewComplete:config.privacyOperatorReviewComplete};
await mkdir(resolve(ROOT,'reports'),{recursive:true});await writeFile(resolve(ROOT,'reports/preservation.json'),JSON.stringify(preservation,null,2)+'\n');
console.log(JSON.stringify({built:true,canonicalPages:pages.length,publicResources:Object.keys(resources).length,catalogEntries:catalog.tools.length,homepageBytes:Buffer.byteLength(html),researchCoreUnchanged:preservation.researchCoreUnchanged,organizationPublished:orgPublished,privacyReviewComplete:config.privacyOperatorReviewComplete},null,2));
