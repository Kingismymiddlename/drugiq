import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from '../scripts/build-variant.mjs';

const root = new URL('../',import.meta.url).pathname;
const source = await readFile(root+'index.html');
const variantSource = await readFile(root+'variant-evidence.html','utf8');
const scripts = html => [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(m=>m[0]);

function stripJourney(html) {
  return html
    .replace(' data-atlas-enabled="false"','')
    .replace(' data-atlas-enabled="true"','')
    .replace('<link rel="stylesheet" href="/assets/research-journey.css">\n','')
    .replace('<script src="/assets/research-journey.js" defer></script>\n','');
}

test('current source matches inspected original application blob',()=>{
  const hash=createHash('sha1').update(Buffer.from(`blob ${source.length}\0`)).update(source).digest('hex');
  assert.equal(hash,'1536acdb34a12aa949636096af37391a9a3ee3ab');
});

test('guided journey build preserves original homepage logic when Atlas is disabled', async()=>{
  const {home}=await build(root,false);
  assert.equal(stripJourney(home),source.toString());
  assert.ok(home.includes('/assets/research-journey.css'));
  assert.ok(home.includes('/assets/research-journey.js'));
  assert.ok(home.includes('data-atlas-enabled="false"'));
  assert.equal((home.match(/data-atlas-nav/g)||[]).length,0);
});

test('Atlas-enabled build promotes AlphaGenome without rewriting existing inline scripts',async()=>{
  const {home}=await build(root,true);
  assert.deepEqual(scripts(stripJourney(home)),scripts(source.toString()));
  assert.equal((home.match(/data-atlas-nav/g)||[]).length,1);
  assert.ok(home.includes('AlphaGenome Evidence'));
  assert.ok(home.includes('journey-atlas-link'));
  assert.ok(home.includes('data-atlas-enabled="true"'));
});

test('variant explorer also receives the shared journey bridge assets',async()=>{
  const {variantHome}=await build(root,true);
  assert.ok(variantHome.includes('/assets/research-journey.css'));
  assert.ok(variantHome.includes('/assets/research-journey.js'));
  assert.equal(stripJourney(variantHome),variantSource);
});

test('public output contains expected journey assets and no source credentials',async()=>{
  await build(root,true);
  assert.deepEqual((await readdir(root+'atlas-public')).sort(),['assets','index.html','variant-evidence.html']);
  assert.deepEqual((await readdir(root+'atlas-public/assets')).sort(),['drugiq-theme.css','research-journey.css','research-journey.js','variant-evidence.js']);
  const atlasUI=await readFile(root+'assets/variant-evidence.js','utf8');
  const journeyUI=await readFile(root+'assets/research-journey.js','utf8');
  assert.ok(!atlasUI.includes('localStorage'));assert.ok(!atlasUI.includes('sessionStorage'));assert.ok(!atlasUI.includes('innerHTML'));
  assert.ok(!atlasUI.includes('ALPHAGENOME_API_KEY'));
  assert.ok(!journeyUI.includes('ALPHAGENOME_API_KEY'));
  assert.ok(!journeyUI.includes('DRUGIQ_RESEARCH_TOKEN'));
});

test('Vercel routes do not rewrite or intercept existing pages or research services',async()=>{
  const config=JSON.parse(await readFile(root+'vercel.json','utf8'));
  assert.equal(config.outputDirectory,'atlas-public');assert.ok(!config.rewrites);assert.ok(!config.redirects);assert.ok(!config.routes);
  assert.deepEqual(Object.keys(config.functions),['api/atlas.py']);
});
