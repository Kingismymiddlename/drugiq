'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const endpoint = '/api/atlas';
  let result = null;
  let controller = null;
  let ready = false;
  let connected = false;
  let busy = false;
  let revision = 0;
  const status = (id, text, error = false) => { $(id).textContent = text; $(id).dataset.error = String(error); };
  const controls = () => {
    $('atlas-connect').disabled = !ready || busy;
    $('variant-fields').disabled = !connected || busy;
    $('research-token').disabled = busy;
    $('atlas-export').disabled = !result || busy;
  };
  const clearResult = () => { result = null; $('atlas-results').hidden = true; $('score-rows').replaceChildren(); };
  const disconnect = () => {
    revision++;
    controller?.abort(); controller = null;
    connected = false; busy = false;
    $('research-token').value = '';
    $('scorer').replaceChildren(new Option('Connect to load available scorers', ''));
    clearResult(); controls();
    status('atlas-status', 'Session cleared. Your Google API key remains on the server.');
    status('query-status', '');
  };
  async function request(body) {
    controller = new AbortController();
    const active = controller;
    const timer = setTimeout(() => active.abort(), 45000);
    try {
      const options = {signal: active.signal, cache: 'no-store', credentials: 'same-origin'};
      if (body) {
        options.method = 'POST';
        options.headers = {'Content-Type': 'application/json', Authorization: 'Bearer ' + $('research-token').value.trim()};
        options.body = JSON.stringify(body);
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
    } finally { clearTimeout(timer); if (controller === active) controller = null; }
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
  $('atlas-connect').addEventListener('click', async () => {
    if (busy) return;
    if ($('research-token').value.trim().length < 32) { status('atlas-status', 'Enter the private DrugIQ research password (at least 32 characters), not the Google API key.', true); return; }
    const version = ++revision;
    connected = false; busy = true; clearResult(); controls();
    status('atlas-status', 'Connecting to the official Atlas scorer catalog...');
    try {
      const data = await request({action: 'scorers'});
      if (version !== revision) return;
      if (!Array.isArray(data.scorers) || !data.scorers.length) throw new Error('No scorers were returned. Check Atlas access.');
      $('scorer').replaceChildren();
      // Prefer AVI when the real service offers that exact scorer; otherwise retain its catalog order.
      const scorers = [...data.scorers].sort((a, b) => Number(b.name === 'AVI') - Number(a.name === 'AVI'));
      for (const item of scorers) $('scorer').add(new Option(item.name, item.name));
      connected = true;
      status('atlas-status', `Connected. ${scorers.length} available scorers retrieved from Google. Your API key was not sent to this browser.`);
    } catch (error) { if (version === revision) status('atlas-status', error.message, true); }
    finally { if (version === revision) { busy = false; controls(); } }
  });
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
    status('query-status', 'Retrieving precomputed predictions. No language model is generating a score...');
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
  $('research-token').addEventListener('input', () => { connected = false; clearResult(); controls(); });
  $('atlas-clear').addEventListener('click', disconnect);
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
  window.addEventListener('pagehide', disconnect);
  window.addEventListener('pageshow', () => { $('research-token').value = ''; });
  const initialVersion = revision;
  request().then(data => {
    if (initialVersion !== revision) return;
    ready = data.ready === true;
    status('atlas-status', ready ? 'Private explorer ready. Enter your separate DrugIQ research password.' : 'Atlas is safely disabled or not configured yet. Your original DrugIQ tools remain available.');
    controls();
  }).catch(error => { if (initialVersion === revision) { ready = false; status('atlas-status', error.message, true); controls(); } });
})();
