import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from '../scripts/build-variant.mjs';
const root = new URL('../',import.meta.url).pathname;
const source = await readFile(root+'index.html');
const scripts = html => [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(m=>m[0]);
test('current source matches inspected GitHub blob',()=>{
 const hash=createHash('sha1').update(Buffer.from(`blob ${source.length}\0`)).update(source).digest('hex');
 assert.equal(hash,'1536acdb34a12aa949636096af37391a9a3ee3ab');
});
test('disabled build preserves entire application byte-for-byte', async()=>{
 const {home}=await build(root,false); assert.equal(home,source.toString());
});
test('enabled build adds exactly one link, preserving original styles and scripts',async()=>{
 const {home}=await build(root,true);
 assert.deepEqual(scripts(home),scripts(source.toString()));
 assert.equal((home.match(/data-atlas-nav/g)||[]).length,1);
 assert.equal(home.replace('\n<a class="tbtn" href="/variant-evidence.html" style="text-decoration:none" data-atlas-nav><span class="tnum">+</span><span class="tname">Variant Evidence</span></a>',''),source.toString());
});
test('public output contains no source files or credentials',async()=>{
 const {readdir}=await import('node:fs/promises');
 assert.deepEqual((await readdir(root+'atlas-public')).sort(),['assets','index.html','variant-evidence.html']);
 const ui=await readFile(root+'assets/variant-evidence.js','utf8');
 assert.ok(!ui.includes('localStorage'));assert.ok(!ui.includes('sessionStorage'));assert.ok(!ui.includes('innerHTML'));
 assert.ok(!ui.includes('ALPHAGENOME_API_KEY'));
});
test('Vercel routes do not rewrite or intercept existing pages or research services',async()=>{
 const config=JSON.parse(await readFile(root+'vercel.json','utf8'));
 assert.equal(config.outputDirectory,'atlas-public');assert.ok(!config.rewrites);assert.ok(!config.redirects);assert.ok(!config.routes);
 assert.deepEqual(Object.keys(config.functions),['api/atlas.py']);
});
