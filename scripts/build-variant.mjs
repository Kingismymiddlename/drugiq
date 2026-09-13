import {readFile, writeFile, mkdir, rm, cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const JOURNEY_CSS = '<link rel="stylesheet" href="/assets/research-journey.css">';
const JOURNEY_JS = '<script src="/assets/research-journey.js" defer></script>';
const COPILOT_JS = '<script src="/assets/research-copilot.js" defer></script>';

function injectJourney(html, enabled, includeCopilot = false) {
  let out = html;
  if (!out.includes('<html lang="en"')) throw new Error('Expected html root not found while adding journey metadata.');
  out = out.replace('<html lang="en"', `<html lang="en" data-atlas-enabled="${enabled ? 'true' : 'false'}"`);
  if (!out.includes('</head>') || !out.includes('</body>')) throw new Error('Expected document boundaries not found while adding journey assets.');
  out = out.replace('</head>', `${JOURNEY_CSS}\n</head>`);
  out = out.replace('</body>', `${JOURNEY_JS}${includeCopilot ? '\n' + COPILOT_JS : ''}\n</body>`);
  return out;
}

export async function build(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), enabled = process.env.ALPHAGENOME_ENABLED === 'true') {
  const source = await readFile(path.join(root, 'index.html'), 'utf8');
  const variantSource = await readFile(path.join(root, 'variant-evidence.html'), 'utf8');
  const output = path.join(root, 'atlas-public');
  const theme = [...source.slice(0, source.indexOf('</head>')).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
  if (!theme || !source.includes('id="ux-research-nav"')) throw new Error('The current homepage structure changed; review the Atlas navigation insertion before building.');

  await rm(output, {recursive:true, force:true});
  await mkdir(path.join(output, 'assets'), {recursive:true});

  let home = source;
  if (enabled) {
    const marker = '<p class="ss-lbl">Explorer Toolkit</p>';
    if (!source.includes(marker)) throw new Error('Cannot find the expected toolkit navigation marker.');
    home = source.replace(
      marker,
      marker + '\n<a class="tbtn journey-atlas-link" href="/variant-evidence.html" style="text-decoration:none" data-atlas-nav><span class="tnum">03</span><span class="tname">AlphaGenome Evidence</span><span class="hero-tag">New</span></a>'
    );
  }

  home = injectJourney(home, enabled, true);
  const variantHome = injectJourney(variantSource, enabled, false);

  await writeFile(path.join(output, 'index.html'), home);
  await writeFile(path.join(output, 'assets/drugiq-theme.css'), theme);
  await writeFile(path.join(output, 'variant-evidence.html'), variantHome);
  await cp(path.join(root, 'assets/variant-evidence.js'), path.join(output, 'assets/variant-evidence.js'));
  await cp(path.join(root, 'assets/research-journey.css'), path.join(output, 'assets/research-journey.css'));
  await cp(path.join(root, 'assets/research-journey.js'), path.join(output, 'assets/research-journey.js'));
  await cp(path.join(root, 'assets/research-copilot.js'), path.join(output, 'assets/research-copilot.js'));

  console.log(`DrugIQ static build: guided research journey and Research Copilot enabled; AlphaGenome ${enabled ? 'enabled and promoted' : 'server feature disabled'}.`);
  return {output, home, source, variantHome};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
