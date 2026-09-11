export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function inlineMarkdown(text) {
  let safe = escapeHtml(text);
  safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*|mailto:[^\s)]+)\)/g, (_, label, href) => `<a href="${href}">${label}</a>`);
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return safe;
}
/** Render the deliberately small Markdown subset used by authored public documents. No raw HTML. */
export function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n'); const out = [];
  let paragraph = [], list = [], code = null;
  const flushP = () => { if (paragraph.length) { out.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`); paragraph = []; } };
  const flushL = () => { if (list.length) { out.push(`<ul>${list.map(x=>`<li>${inlineMarkdown(x)}</li>`).join('')}</ul>`); list = []; } };
  for (const line of lines) {
    if (line.startsWith('```')) { flushP(); flushL(); if (code) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null; } else code = []; continue; }
    if (code) { code.push(line); continue; }
    const heading = /^(#{1,6}) (.+)$/.exec(line);
    if (heading) { flushP(); flushL(); out.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`); }
    else if (line.startsWith('- ')) { flushP(); list.push(line.slice(2)); }
    else if (line.startsWith('> ')) { flushP(); flushL(); out.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`); }
    else if (!line.trim()) { flushP(); flushL(); }
    else { flushL(); paragraph.push(line); }
  }
  flushP(); flushL();
  if (code) throw new Error('Unclosed fenced code block');
  return out.join('\n');
}
export function metadata(config, path, title, description, mdPath) {
  const url = config.url + (path === '/' ? '/' : path);
  return `<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${url}">
<link rel="alternate" type="text/markdown" href="${config.url}${mdPath}">
<link rel="describedby" href="${config.url}/llms.txt" type="text/plain">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DrugIQ">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${config.url}/assets/drugiq-social.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="DrugIQ research workspace: See the evidence. Shape what is next.">
<meta name="twitter:card" content="summary_large_image">`;
}
export function pageHTML(config, path, md, description) {
  const title = /^# (.+)$/m.exec(md)?.[1] || 'DrugIQ';
  const mdPath = path === '/' ? '/index.md' : path + '.md';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${metadata(config,path,title,description,mdPath)}
<link rel="stylesheet" href="/assets/docs.css"></head><body>
<a class="skip" href="#main">Skip to content</a>
<header class="doc-nav"><a class="brand" href="/">Drug<b>IQ</b></a><nav aria-label="Documentation"><a href="/docs">Developers</a><a href="/about">About</a><a href="/contact">Contact</a><a class="button" href="/#welcome">Open workspace</a></nav></header>
<main id="main" tabindex="-1"><p class="eyebrow">DrugIQ / Research in context</p>${renderMarkdown(md)}
<div class="formats"><a href="${mdPath}">Read as Markdown</a><a href="/llms.txt">Agent guide</a><a href="/sitemap.xml">Sitemap</a></div></main>
<footer><span>DrugIQ &middot; Research use only, not clinical advice.</span><nav aria-label="Footer"><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/docs">Documentation</a></nav></footer>
</body></html>`;
}
