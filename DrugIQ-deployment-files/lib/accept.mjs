/** RFC 9110 Accept negotiation. Specific ranges override wildcards, including q=0. */
function splitOutsideQuotes(value, separator) {
  const parts = []; let start = 0, quoted = false, escaped = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (escaped) { escaped = false; continue; }
    if (quoted && c === '\\') { escaped = true; continue; }
    if (c === '"') quoted = !quoted;
    if (!quoted && c === separator) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  parts.push(value.slice(start));
  return parts;
}
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
export function parseAccept(header) {
  if (header == null || !header.trim()) return [{ type: '*', subtype: '*', params: {}, q: 1, position: 0 }];
  return splitOutsideQuotes(header, ',').map((part, position) => {
    const [media, ...parameters] = splitOutsideQuotes(part, ';');
    const pair = media.trim().toLowerCase().split('/');
    if (pair.length !== 2 || !pair.every(x => TOKEN.test(x)) || (pair[0] === '*' && pair[1] !== '*')) return null;
    let q = 1, seenQ = false; const params = {};
    for (const parameter of parameters) {
      const eq = parameter.indexOf('=');
      if (eq < 1) return null;
      const name = parameter.slice(0, eq).trim().toLowerCase();
      let value = parameter.slice(eq + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\(.)/g, '$1');
      if (!TOKEN.test(name)) return null;
      if (name === 'q') {
        if (seenQ || !/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(value)) return null;
        q = Number(value); seenQ = true;
      } else if (!seenQ) params[name] = name === 'charset' ? value.toLowerCase() : value;
    }
    return { type: pair[0], subtype: pair[1], params, q, position };
  }).filter(Boolean);
}
export function quality(header, mime, representationParams = { charset: 'utf-8' }) {
  const [type, subtype] = mime.toLowerCase().split('/');
  let best = null;
  for (const item of parseAccept(header)) {
    if (item.type !== '*' && item.type !== type) continue;
    if (item.subtype !== '*' && item.subtype !== subtype) continue;
    if (!Object.entries(item.params).every(([k,v]) => representationParams[k] === v)) continue;
    const specificity = (item.type === '*' ? 0 : item.subtype === '*' ? 1 : 2) * 100 + Object.keys(item.params).length;
    if (!best || specificity > best.specificity || (specificity === best.specificity && item.q > best.q))
      best = { q: item.q, specificity };
  }
  return best || { q: 0, specificity: -1 };
}
/** Server preference breaks true ties: HTML by default; Markdown on missing-page requests. */
export function negotiate(header, preference = ['text/html', 'text/markdown']) {
  const ranked = preference.map((mime, priority) => ({ mime, priority, ...quality(header, mime) }))
    .filter(x => x.q > 0)
    .sort((a,b) => b.q - a.q || b.specificity - a.specificity || a.priority - b.priority);
  return ranked[0]?.mime || null;
}
