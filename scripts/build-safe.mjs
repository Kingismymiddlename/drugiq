import {readFile, writeFile, mkdir, rm, cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'atlas-public');
const enabled = process.env.ALPHAGENOME_ENABLED === 'true';
const closeHead = '</he' + 'ad>';
const closeBody = '</bo' + 'dy>';
const journeyCss = '<link rel="stylesheet" href="/assets/research-journey.css">';
const journeyJs = '<scr' + 'ipt src="/assets/research-journey.js" defer></scr' + 'ipt>';
const copilotJs = '<scr' + 'ipt src="/assets/research-copilot.js" defer></scr' + 'ipt>';

function beforeLast(text, marker, value) {
  const at = text.lastIndexOf(marker);
  if (at < 0) throw new Error('Missing final document boundary');
  return text.slice(0, at) + value + text.slice(at);
}

function inject(html, includeCopilot) {
  let out = html;
  out = out.replace('<html lang="en"', `<html lang="en" data-atlas-enabled="${enabled ? 'true' : 'false'}"`);
  out = beforeLast(out, closeHead, journeyCss + '\n');
  out = beforeLast(out, closeBody, journeyJs + (includeCopilot ? '\n' + copilotJs : '') + '\n');
  return out;
}

const source = await readFile(path.join(root, 'index.html'), 'utf8');
const variantSource = await readFile(path.join(root, 'variant-evidence.html'), 'utf8');
const firstHead = source.indexOf(closeHead);
const theme = [...source.slice(0, firstHead).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
if (!theme || !source.includes('id="ux-research-nav"')) throw new Error('Unexpected DrugIQ source structure');

await rm(output, {recursive:true, force:true});
await mkdir(path.join(output, 'assets'), {recursive:true});
let home = source;
if (enabled) {
  const marker = '<p class="ss-lbl">Explorer Toolkit</p>';
  if (!home.includes(marker)) throw new Error('Toolkit marker not found');
  home = home.replace(marker, marker + '\n<a class="tbtn journey-atlas-link" href="/variant-evidence.html" style="text-decoration:none" data-atlas-nav><span class="tnum">03</span><span class="tname">AlphaGenome Evidence</span><span class="hero-tag">New</span></a>');
}
home = inject(home, true);
const variantHome = inject(variantSource, false);
await writeFile(path.join(output, 'index.html'), home);
await writeFile(path.join(output, 'assets/drugiq-theme.css'), theme);
await writeFile(path.join(output, 'variant-evidence.html'), variantHome);
for (const name of ['variant-evidence.js','research-journey.css','research-journey.js','research-copilot.js']) {
  await cp(path.join(root, 'assets', name), path.join(output, 'assets', name));
}
console.log('DrugIQ safe build complete');
