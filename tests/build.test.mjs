import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from '../scripts/build-variant.mjs';

const root = new URL('../', import.meta.url).pathname;
const source = await readFile(root + 'index.html', 'utf8');
const variantSource = await readFile(root + 'variant-evidence.html', 'utf8');

function clean(html, atlas) {
  let out = html
    .replace(' data-atlas-enabled="false"', '')
    .replace(' data-atlas-enabled="true"', '')
    .replace('<link rel="stylesheet" href="/assets/research-journey.css">\n', '')
    .replace('<script src="/assets/research-journey.js" defer></script>\n', '')
    .replace('<script src="/assets/research-copilot.js" defer></script>\n', '');
  if (atlas) out = out.replace('\n<a class="tbtn journey-atlas-link" href="/variant-evidence.html" style="text-decoration:none" data-atlas-nav><span class="tnum">03</span><span class="tname">AlphaGenome Evidence</span><span class="hero-tag">New</span></a>', '');
  return out;
}

test('disabled journey build preserves original homepage exactly', async () => {
  const {home} = await build(root, false);
  assert.equal(clean(home, false), source);
});

test('enabled journey build preserves original homepage and adds one Atlas link', async () => {
  const {home} = await build(root, true);
  assert.equal(clean(home, true), source);
  assert.equal((home.match(/data-atlas-nav/g) || []).length, 1);
});

test('journey stylesheet is inside the real document head', async () => {
  const {home} = await build(root, true);
  const cssPos = home.indexOf('/assets/research-journey.css');
  const firstHeadClose = home.indexOf('</head>');
  const firstBodyOpen = home.indexOf('<body');
  assert.ok(cssPos > 0);
  assert.ok(cssPos < firstHeadClose, 'journey stylesheet must be inserted before the real first </head>');
  assert.ok(firstHeadClose < firstBodyOpen, 'document head must close before body begins');
});

test('journey scripts are after the original application script and before final body close', async () => {
  const {home} = await build(root, true);
  const originalTail = '<script>uxInstall();</script>';
  const finalBodyClose = home.lastIndexOf('</body>');
  assert.ok(source.includes(originalTail));
  assert.ok(home.indexOf('/assets/research-journey.js') > home.indexOf(originalTail));
  assert.ok(home.indexOf('/assets/research-copilot.js') > home.indexOf(originalTail));
  assert.ok(home.indexOf('/assets/research-journey.js') < finalBodyClose);
  assert.ok(home.indexOf('/assets/research-copilot.js') < finalBodyClose);
});

test('injected asset tags are not inside original inline JavaScript templates', async () => {
  const {home} = await build(root, true);
  const firstBodyOpen = home.indexOf('<body');
  const realHead = home.slice(0, firstBodyOpen);
  assert.ok(realHead.includes('/assets/research-journey.css'));
  const originalScriptEnd = home.indexOf('<script>uxInstall();</script>') + '<script>uxInstall();</script>'.length;
  const tail = home.slice(originalScriptEnd);
  assert.ok(tail.includes('/assets/research-journey.js'));
  assert.ok(tail.includes('/assets/research-copilot.js'));
});

test('variant page keeps original content and receives journey only', async () => {
  const {variantHome} = await build(root, true);
  assert.equal(clean(variantHome, false), variantSource);
  assert.ok(variantHome.includes('/assets/research-journey.js'));
  assert.ok(!variantHome.includes('/assets/research-copilot.js'));
  assert.ok(variantHome.indexOf('/assets/research-journey.css') < variantHome.indexOf('</head>'));
});
