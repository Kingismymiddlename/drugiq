'use strict';

const MAX_BODY = 4096;
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.origin : '';
  } catch (_) {
    return '';
  }
}

function allowedOrigins() {
  const allowed = new Set(['https://drugiq.vercel.app']);
  for (const name of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    const value = String(process.env[name] || '').trim();
    if (!value) continue;
    allowed.add(normalizeOrigin(value.startsWith('https://') ? value : 'https://' + value));
  }
  for (const value of String(process.env.ATLAS_ALLOWED_ORIGINS || '').split(',')) {
    const origin = normalizeOrigin(value);
    if (origin) allowed.add(origin);
  }
  allowed.delete('');
  return allowed;
}

async function verifyTurnstile(token, remoteIp, expectedHostname) {
  const secret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret || !token) return false;
  const form = new URLSearchParams({secret, response: token});
  if (remoteIp) form.set('remoteip', remoteIp);
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: form.toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data.success === true && (!data.hostname || data.hostname === expectedHostname);
  } catch (_) {
    return false;
  }
}

function json(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value);
  res.end(JSON.stringify(payload));
}

function configuration() {
  const siteKey = String(process.env.TURNSTILE_SITE_KEY || '').trim();
  const secret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  const researchToken = String(process.env.DRUGIQ_RESEARCH_TOKEN || '').trim();
  const alphaGenomeKey = String(process.env.ALPHAGENOME_API_KEY || '').trim();
  const enabled = String(process.env.ALPHAGENOME_ENABLED || '').toLowerCase() === 'true';
  const missing = [];
  if (!enabled) missing.push('ALPHAGENOME_ENABLED');
  if (!alphaGenomeKey) missing.push('ALPHAGENOME_API_KEY');
  if (!researchToken) missing.push('DRUGIQ_RESEARCH_TOKEN');
  if (!siteKey) missing.push('TURNSTILE_SITE_KEY');
  if (!secret) missing.push('TURNSTILE_SECRET_KEY');
  return {siteKey, secret, researchToken, alphaGenomeKey, enabled, missing};
}

module.exports = async function handler(req, res) {
  const config = configuration();

  if (req.method === 'GET') {
    return json(res, 200, {
      service: 'DrugIQ Atlas browser access',
      ready: config.missing.length === 0,
      turnstile_site_key: config.siteKey,
      passwordless_browser_access: true,
      missing_configuration: config.missing,
      scope: 'Personal non-commercial research; single GRCh38 substitutions only.',
    });
  }
  if (req.method !== 'POST') return json(res, 405, {error:{code:'method_not_allowed',message:'Use GET or POST.'}}, {'Allow':'GET, POST'});

  const origin = normalizeOrigin(req.headers.origin);
  if (!origin || !allowedOrigins().has(origin)) {
    return json(res, 403, {error:{code:'origin_denied',message:'This request must come from an approved DrugIQ origin.'}});
  }
  if (config.missing.length) {
    return json(res, 503, {error:{code:'not_configured',message:'Passwordless research access is not configured for this deployment.', missing_configuration: config.missing}});
  }

  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') return json(res, 415, {error:{code:'content_type',message:'Send application/json.'}});

  let body = req.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_BODY) return json(res, 413, {error:{code:'request_too_large',message:'Submit one small research request.'}});
    try { body = JSON.parse(body); } catch (_) { return json(res, 400, {error:{code:'invalid_json',message:'The request must contain valid JSON.'}}); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, {error:{code:'invalid_input',message:'The request must be a JSON object.'}});

  const token = typeof body.turnstile_token === 'string' && body.turnstile_token.length <= 4096 ? body.turnstile_token : '';
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const expectedHostname = new URL(origin).hostname;
  if (!await verifyTurnstile(token, forwarded, expectedHostname)) {
    return json(res, 403, {error:{code:'human_verification_failed',message:'The browser verification could not be completed. Please retry.'}});
  }

  const scientificBody = {...body};
  delete scientificBody.turnstile_token;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  if (!host) return json(res, 502, {error:{code:'internal_route',message:'The protected research endpoint could not be reached.'}});

  try {
    const upstream = await fetch(`https://${host}/api/atlas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.researchToken,
        'Origin': origin,
      },
      body: JSON.stringify(scientificBody),
      signal: AbortSignal.timeout(45000),
    });
    const text = await upstream.text();
    let payload;
    try { payload = JSON.parse(text); } catch (_) { payload = {error:{code:'atlas_unavailable',message:'The protected research service returned an unexpected response.'}}; }
    return json(res, upstream.status, payload, upstream.status === 429 ? {'Retry-After': upstream.headers.get('retry-after') || '60'} : {});
  } catch (_) {
    return json(res, 502, {error:{code:'atlas_unavailable',message:'The protected research service is temporarily unavailable.'}});
  }
};
