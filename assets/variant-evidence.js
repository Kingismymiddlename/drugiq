'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const endpoint = '/api/atlas_public';
  let result = null;
  let controller = null;
  let ready = false;
  let connected = false;
  let busy = false;
  let revision = 0;
  let siteKey = '';
  let widgetId = null;

  const status = (id, text, error = false) => { $(id).textContent = text; $(id).dataset.error = String(error); };
  const controls = () => {
    $('variant-fields').disabled = !connected || busy;
    $('atlas-export').disabled = !result || busy;
  };
  const clearResult = () => { result = null; $('atlas-results').hidden = true; $('score-rows').replaceChildren(); };

  async function loadTurnstile() {
    if (window.turnstile) return;
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-drugiq-turnstile]');
      if (existing) {
        existing.addEventListener('load', resolve, {once:true});
        existing.addEventListener('error', reject, {once:true});
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.drugiqTurnstile = '1';
      script.addEventListener('load', resolve, {once:true});
      script.addEventListener('error', () => reject(new Error('Browser verification could not be loaded. Please retry.')), {once:true});
      document.head.append(script);
    });
  }

  async function humanToken() {
    await loadTurnstile();
    if (!window.turnstile || !siteKey) throw new Error('Browser verification is not ready yet. Please retry.');
    return await new Promise((resolve, reject) => {
      const host = $('turnstile-widget');
      host.replaceChildren();
      let settled = false;
      const finish = fn => value => {
        if (settled) return;
        settled = true;
        fn(value);
      };
      const ok = finish(resolve);
      const fail = finish(() => reject(new Error('Browser verification could not be completed. Please retry.')));
      try {
        widgetId = window.turnstile.render(host, {
          sitekey: siteKey,
          execution: 'execute',
          appearance: 'interaction-only',
          callback: token => ok(token),
          'error-callback': fail,
          'expired-callback': fail,
          'timeout-callback': fail,
        });
        window.turnstile.execute(widgetId);
      } catch (_error) { fail(); }
    });
  }

  async function request(body) {
    controller = new AbortController();
    const active = controller;
    const timer = setTimeout(() => active.abort(), 45000);
    try {
      const options = {signal: active.signal, cache: 'no-store', credentials: 'same-origin'};
      if (body) {
        const token = await humanToken();
        options.method = 'POST';
        options.headers = {'Content-Type': 'application/json'};
        options.body = JSON.stringify({...body, turnstile_token: token});
      }
      const response = await fetch(endpoint, options);
      const type = response.headers.get('content-type') || '';
      if (!type.includes('application/json')) throw new Error('The research endpoint is not returning JSON. Check the preview deployment or Vercel access protection.');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'The Atlas request could not be completed.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The request was cancelled or timed out. No prediction was generated.');
      throw error;
    } finally {
      clearTimeout(timer);
      if (widgetId !== null && window.turnstile) {
        try { window.turnstile.remove(widgetId); } catch (_error) {}
        widgetId = null;
      }
      if (controller === active) controller = null;
    }
  }

  for (const chromosome of [...Array.from({length: 22}, (_, i) => String(i + 1)), 'X', 'Y']) {
    $('chromosome').add(new Option('Chromosome ' + chromosome, 'chr' + chromosome));
  }

  function annotation(record, keys, fallback) {
    const values = keys.map(k => record?.[k]).filter(v => v !== null && v !== undefined && v !== '');
    return [...new Set(values)].map(String).join(' / ') || fallback;
  }

  function display(data) {
    if (!['ok', 'no_data'].includes(data.status) || !Array.isArray(data.rows) || !data.provenance) throw new Error('Atlas returned an unexpected response. No result was displayed.');
    for (const row of data.rows) if (typeof row.raw_score !== 'number' || !Number.isFinite(row.raw_score)) throw new Error('Atlas returned an invalid score. No result was displayed.');
    result = data;
    $('score-rows').replaceChildren(); $('result-meta').replaceChildren();
    const input = data.input;
    $('result-title').textContent = `${input.chromosome}:${input.position} ${input.reference} > ${input.alternate}`;
    $('result-summary').textContent = data.status === 'no_data'
      ? 'No finite evidence was returned for this variant and scorer. This is not a benign classification.'
      : `Showing ${data.rows.length} of ${data.finite_score_count} finite values, ordered by absolute raw score within ${data.scorer}.${data.truncated ? ' The result is limited to 200 entries; the download contains the same subset.' : ''} Values are not interpreted as clinical risk.`;
    for (const text of [input.assembly, input.scorer, 'Retrieved: ' + data.provenance.retrieved_at]) {
      const span = document.createElement('span'); span.textContent = text; $('result-meta').append(span);
    }
    for (const row of data.rows) {
      const tr = document.createElement('tr');
      const values = [annotation(row.gene, ['gene_name', 'gene_id'], 'Observation ' + row.observation_index),
        annotation(row.track, ['biosample_name', 'name', 'ontology_curie', 'strand'], 'Track ' + row.track_index),
        row.raw_score.toPrecision(6), row.quantile == null ? 'Not supplied' : Number(row.quantile).toPrecision(4)];
      values.forEach((value, index) => { const td = document.createElement('td'); td.textContent = value; if (index > 1) td.className = 'numeric'; tr.append(td); });
      $('score-rows').append(tr);
    }
    $('source-details').textContent = JSON.stringify(data, null, 2);
    $('atlas-results').hidden = false;
    $('result-title').focus();
  }

  async function loadScorers() {
    if (busy || !ready) return;
    const version = ++revision;
    connected = false; busy = true; clearResult(); controls();
    status('atlas-status', 'Verifying browser and loading the official Atlas scorer catalog...');
    try {
      const data = await request({action: 'scorers'});
      if (version !== revision) return;
      if (!Array.isArray(data.scorers) || !data.scorers.length) throw new Error('No scorers were returned. Check Atlas access.');
      $('scorer').replaceChildren();
      const scorers = [...data.scorers].sort((a, b) => Number(b.name === 'AVI') - Number(a.name === 'AVI'));
      for (const item of scorers) $('scorer').add(new Option(item.name, item.name));
      connected = true;
      status('atlas-status', `Ready. ${scorers.length} available scorers retrieved from Google. Verification runs automatically; no DrugIQ password is required.`);
    } catch (error) { if (version === revision) status('atlas-status', error.message, true); }
    finally { if (version === revision) { busy = false; controls(); } }
  }

  $('variant-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !connected || !$('variant-form').reportValidity()) return;
    if ($('reference').value === $('alternate').value) { status('query-status', 'Reference and alternate DNA letters must differ.', true); return; }
    const position = Number($('position').value);
    if (!Number.isSafeInteger(position) || position < 1) { status('query-status', 'Enter a positive, 1-based integer position.', true); return; }
    const version = ++revision;
    const body = {action: 'query', assembly: $('assembly').value, chromosome: $('chromosome').value,
      position, reference: $('reference').value, alternate: $('alternate').value, scorer: $('scorer').value};
    busy = true; clearResult(); controls();
    status('query-status', 'Verifying browser and retrieving precomputed predictions. No language model is generating a score...');
    try {
      const data = await request(body);
      if (version !== revision) return;
      display(data);
      status('query-status', data.status === 'ok' ? 'Evidence retrieved. Read the limitations before interpreting it.' : 'No usable scores were returned.');
    } catch (error) { if (version === revision) { clearResult(); status('query-status', error.message, true); } }
    finally { if (version === revision) { busy = false; controls(); } }
  });

  $('atlas-example').addEventListener('click', () => {
    clearResult();
    $('chromosome').value = 'chr22'; $('position').value = '36201698';
    $('reference').value = 'A'; $('alternate').value = 'C';
    status('query-status', 'Filled the coordinate example from Google\'s AlphaGenome README. It does not imply a particular result or Atlas coverage.');
    controls();
  });
  $('variant-form').addEventListener('input', () => { if (!busy) { clearResult(); status('query-status', ''); controls(); } });
  $('atlas-retry').addEventListener('click', loadScorers);
  $('atlas-export').addEventListener('click', () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'drugiq-atlas-evidence.json'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('atlas-print').addEventListener('click', () => {
    if (!result) return;
    const win = window.open('', '_blank');
    if (!win) { status('query-status', 'Allow the print window in your browser, then retry.', true); return; }
    win.opener = null; win.document.title = 'DrugIQ Atlas - research evidence';
    const heading = win.document.createElement('h1'); heading.textContent = 'DrugIQ Atlas - research evidence';
    const pre = win.document.createElement('pre'); pre.style.whiteSpace = 'pre-wrap'; pre.textContent = JSON.stringify(result, null, 2);
    win.document.body.append(heading, pre); win.print();
  });

  request().then(data => {
    ready = data.ready === true;
    siteKey = typeof data.turnstile_site_key === 'string' ? data.turnstile_site_key : '';
    if (!ready || !siteKey) {
      status('atlas-status', 'AlphaGenome browser access is not configured for this deployment yet.', true);
      controls();
      return;
    }
    controls();
    loadScorers();
  }).catch(error => { ready = false; status('atlas-status', error.message, true); controls(); });
})();
