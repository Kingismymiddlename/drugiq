import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
async function fixture(patch){
 const dir=await mkdtemp(join(tmpdir(),'drugiq-build-test-'));
 for(const item of ['scripts','lib','public','source','content'])await cp(new URL(item,root),join(dir,item),{recursive:true});
 const config=JSON.parse(await readFile(new URL('site.config.json',root),'utf8'));
 Object.assign(config,patch);await writeFile(join(dir,'site.config.json'),JSON.stringify(config));
 const result=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:dir,encoding:'utf8',timeout:10000});
 return {dir,result};
}
test('Incomplete organization configuration fails closed',async()=>{
 const {dir,result}=await fixture({organization:{name:'Test Fixture Only',verified:false}});
 try{assert.notEqual(result.status,0);assert.match(result.stderr,/Organization must be verified/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('Explicit verified fixture generates linked Organization, ContactPoint and PostalAddress',async()=>{
 const {dir,result}=await fixture({contactEmail:'maintainer@example.org',organization:{name:'Synthetic Test Fixture Organization',verified:true,address:{streetAddress:'1 Fixture Street',addressLocality:'Fixture City',postalCode:'00000',addressCountry:'US'}}});
 try{
  assert.equal(result.status,0,result.stderr);const m=JSON.parse(await readFile(join(dir,'dist/site.json'),'utf8'));
  const graph=JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(m.resources['/'].html)[1])['@graph'];
  const org=graph.find(g=>g['@type']==='Organization');assert.ok(org);assert.equal(org.contactPoint.email,'maintainer@example.org');assert.equal(org.address['@type'],'PostalAddress');assert.match(m.resources['/contact'].markdown,/mailto:maintainer@example.org/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Canonical host and search verification are configurable without fake ownership',async()=>{
 const {dir,result}=await fixture({url:'https://fixture.example.org',googleSiteVerification:'synthetic-test-verification'});
 try{assert.equal(result.status,0,result.stderr);const m=JSON.parse(await readFile(join(dir,'dist/site.json'),'utf8'));assert.match(m.resources['/'].html,/google-site-verification/);assert.match(m.resources['/sitemap.xml'].body,/https:\/\/fixture.example.org/);assert.ok(!m.resources['/docs/mcp'].markdown.includes('https://drugiq.vercel.app'));}
 finally{await rm(dir,{recursive:true,force:true});}
});
test('Invalid canonical host is rejected',async()=>{
 const {dir,result}=await fixture({url:'https://drugiq.vercel.app/extra-path'});
 try{assert.notEqual(result.status,0);assert.match(result.stderr,/bare HTTPS origin/);}finally{await rm(dir,{recursive:true,force:true});}
});
