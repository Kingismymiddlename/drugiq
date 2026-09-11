import {readFile, writeFile, mkdir, rm, cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function build(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), enabled = process.env.ALPHAGENOME_ENABLED === 'true') {
  const source = await readFile(path.join(root, 'index.html'), 'utf8');
  const output = path.join(root, 'atlas-public');
  const theme = [...source.slice(0, source.indexOf('</head>')).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
  if (!theme || !source.includes('id="ux-research-nav"')) throw new Error('The current homepage structure changed; review the Atlas navigation insertion before building.');
  await rm(output, {recursive:true, force:true});
  await mkdir(path.join(output, 'assets'), {recursive:true});
  let home = source;
  if (enabled) {
    // Only one plain link is inserted. No original script, tool, prompt, or style is modified.
    const marker = '<p class="ss-lbl">Explorer Toolkit</p>';
    if (!source.includes(marker)) throw new Error('Cannot find the expected toolkit navigation marker.');
    home = source.replace(marker, marker + '\n<a class="tbtn" href="/variant-evidence.html" style="text-decoration:none" data-atlas-nav><span class="tnum">+</span><span class="tname">Variant Evidence</span></a>');
  }
  await writeFile(path.join(output, 'index.html'), home);
  await writeFile(path.join(output, 'assets/drugiq-theme.css'), theme);
  await cp(path.join(root, 'variant-evidence.html'), path.join(output, 'variant-evidence.html'));
  await cp(path.join(root, 'assets/variant-evidence.js'), path.join(output, 'assets/variant-evidence.js'));
  console.log(`Atlas static build: existing homepage ${enabled ? 'with one research navigation link' : 'byte-for-byte unchanged'}; server feature flag still enforced.`);
  return {output, home, source};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
