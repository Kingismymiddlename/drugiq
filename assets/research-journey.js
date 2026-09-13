'use strict';
(() => {
  const isAtlasPage = Boolean(document.getElementById('variant-form'));
  const isWorkspace = Boolean(document.getElementById('app-view') && document.getElementById('content'));
  if (!isAtlasPage && !isWorkspace) return;

  const STAGES = [
    {
      n: 1, key: 'understand', title: 'Understand', lead: 'scisynth',
      question: 'Does the scientific evidence support the hypothesis?',
      why: 'Start with the evidence base. Establish what is known, what is uncertain, and whether the biological idea is worth taking forward.',
      tools: 'SciSynth'
    },
    {
      n: 2, key: 'biology', title: 'Identify Biology', lead: 'targetscope',
      question: 'Which targets and biomarkers matter most?',
      why: 'Move from a broad disease question to the biological mechanisms, targets, and measurable signals that can be acted on.',
      tools: 'TargetScope · BioSignal'
    },
    {
      n: 3, key: 'genomics', title: 'Validate Genomics', lead: 'atlas',
      question: 'Does human variation support or challenge the biology?',
      why: 'Before committing to a molecule, examine variant-level evidence. AlphaGenome adds regulatory and genomic context; AlphaMissense focuses on missense protein effects.',
      tools: 'AlphaGenome Atlas · AlphaMissense', highlight: true
    },
    {
      n: 4, key: 'molecule', title: 'Evaluate Molecule', lead: 'bindpredict',
      question: 'Can the molecule engage the target and behave like a drug?',
      why: 'Translate biological confidence into molecular feasibility by checking binding evidence, physicochemical properties, and drug-likeness.',
      tools: 'BindPredict · MolProfile'
    },
    {
      n: 5, key: 'strategy', title: 'Explore Strategy', lead: 'repurposerx',
      question: 'Are there better or complementary therapeutic strategies?',
      why: 'Explore optional branches such as repurposing, combinations, immunotherapy, or anti-infective design when they fit the research question.',
      tools: 'RepurposeRx · CombinedRx · ImmunIQ · PathogenRx', optional: true
    },
    {
      n: 6, key: 'translate', title: 'Translate', lead: 'trialmatch',
      question: 'What is already happening in the clinic?',
      why: 'Place the hypothesis in the real clinical landscape: active studies, competing approaches, and evidence that has already reached patients.',
      tools: 'TrialMatch'
    },
    {
      n: 7, key: 'decide', title: 'Decide', lead: 'dossier',
      question: 'What does the external evidence say when viewed together?',
      why: 'Bring the evidence together into a cited Candidate Dossier so the next research decision is based on a coherent external-evidence picture.',
      tools: 'Candidate Dossier'
    }
  ];

  const TOOL_STAGE = {
    scisynth: 1,
    targetscope: 2, biosignal: 2,
    alphamissense: 3, atlas: 3,
    bindpredict: 4, molprofile: 4,
    repurposerx: 5, combinedrx: 5, immuniq: 5, pathogenrx: 5,
    trialmatch: 6,
    dossier: 7,
    welcome: 0
  };

  const STARTS = [
    {label: 'Scientific hypothesis', target: 'scisynth', hint: 'Start by testing the evidence'},
    {label: 'Disease / indication', target: 'targetscope', hint: 'Start with target discovery'},
    {label: 'Genomic variant', target: 'atlas', hint: 'Start with variant evidence'},
    {label: 'Compound', target: 'molprofile', hint: 'Start with molecule quality'},
    {label: 'Full candidate', target: 'dossier', hint: 'Start with a complete review'}
  ];

  const visitedStages = new Set();
  let currentTool = isAtlasPage ? 'atlas' : 'welcome';
  let originalGo = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function stageFor(tool) {
    const n = TOOL_STAGE[tool] || 0;
    return STAGES.find(s => s.n === n) || null;
  }

  function analytics(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  }

  function navigate(target) {
    analytics('journey_navigate', {target});
    if (target === 'atlas') {
      window.location.href = '/variant-evidence.html';
      return;
    }
    if (typeof window.go === 'function') {
      window.go(target);
      return;
    }
    window.location.href = '/#' + encodeURIComponent(target);
  }

  function nextStage(stage) {
    if (!stage || stage.n >= STAGES.length) return null;
    return STAGES.find(s => s.n === stage.n + 1) || null;
  }

  function railHTML(activeTool) {
    const active = TOOL_STAGE[activeTool] || 0;
    return `<div class="jr-topbar-label">Research journey</div><div class="jr-rail" role="navigation" aria-label="DrugIQ research journey">${STAGES.map((s, i) => {
      const cls = s.n === active ? ' is-active' : visitedStages.has(s.n) ? ' is-complete' : '';
      const optional = s.optional ? ' · optional' : '';
      return `<button type="button" class="jr-step${cls}" data-jr-go="${esc(s.lead)}" title="${esc(s.question)}${optional}"><span class="jr-step-num">${visitedStages.has(s.n) && s.n !== active ? '✓' : String(s.n).padStart(2,'0')}</span><span class="jr-step-name">${esc(s.title)}</span></button>${i < STAGES.length - 1 ? '<span class="jr-step-arrow" aria-hidden="true">→</span>' : ''}`;
    }).join('')}</div>`;
  }

  function installRail(activeTool) {
    if (!isWorkspace) return;
    const app = document.getElementById('app-view');
    const header = app && app.querySelector('.hdr');
    if (!app || !header) return;
    let rail = document.getElementById('jr-topbar');
    if (!rail) {
      rail = document.createElement('div');
      rail.id = 'jr-topbar';
      rail.className = 'jr-topbar';
      header.insertAdjacentElement('afterend', rail);
      bindActions(rail);
    }
    rail.innerHTML = railHTML(activeTool);
    bindActions(rail);
    document.body.classList.add('jr-ready');
  }

  function sidebarHTML(activeTool) {
    const active = TOOL_STAGE[activeTool] || 0;
    return `<div class="jr-side-title">Research journey</div>${STAGES.map(s => `<button type="button" class="jr-side-btn${s.n === active ? ' is-active' : ''}" data-jr-go="${esc(s.lead)}"><span class="jr-side-dot"></span><span>${String(s.n).padStart(2,'0')} ${esc(s.title)}</span>${s.optional ? '<span class="jr-side-optional">optional</span>' : ''}</button>`).join('')}`;
  }

  function installSidebar(activeTool) {
    if (!isWorkspace) return;
    const nav = document.getElementById('ux-research-nav');
    if (!nav) return;
    let box = nav.querySelector('.jr-side');
    if (!box) {
      box = document.createElement('div');
      box.className = 'jr-side';
      nav.prepend(box);
    }
    box.innerHTML = sidebarHTML(activeTool);
    bindActions(box);
  }

  function welcomeHTML() {
    return `<section class="jr-welcome" aria-labelledby="jr-purpose-title">
      <div class="jr-kicker">DrugIQ guided research workspace</div>
      <h1 id="jr-purpose-title">From a biological question to a <em>decision-ready evidence dossier.</em></h1>
      <p class="jr-dek">DrugIQ connects <strong>scientific literature, target biology, genomic evidence, molecular properties, therapeutic strategy, and clinical evidence</strong> into one guided research workflow. You can enter anywhere, but the journey below shows what normally comes next — and why.</p>
      <div class="jr-start-label">What are you starting with?</div>
      <div class="jr-starts">${STARTS.map(s => `<button type="button" class="jr-start" data-jr-go="${esc(s.target)}" title="${esc(s.hint)}">${esc(s.label)} →</button>`).join('')}</div>
      <div class="jr-stage-grid" aria-label="Research stages">${STAGES.map(s => `<article class="jr-stage-card${s.highlight ? ' is-genomics' : ''}${s.key === 'decide' ? ' is-decision' : ''}">
        ${s.highlight ? '<span class="jr-new">AlphaGenome · new</span>' : ''}
        <div class="jr-stage-no">STAGE ${String(s.n).padStart(2,'0')}${s.optional ? ' · OPTIONAL' : ''}</div>
        <div class="jr-stage-name">${esc(s.title)}</div>
        <div class="jr-stage-question">${esc(s.question)}</div>
        <div class="jr-stage-tool">${esc(s.tools)}</div>
        <button type="button" class="jr-next-btn" data-jr-go="${esc(s.lead)}" style="margin-top:10px">Open stage →</button>
      </article>`).join('')}</div>
    </section><div class="jr-legacy-label">Explore individual research tools</div>`;
  }

  function toolContextHTML(tool) {
    const stage = stageFor(tool);
    if (!stage) return '';
    const next = nextStage(stage);
    const optionalClass = stage.optional ? ' is-optional' : '';
    const genomicsClass = stage.key === 'genomics' ? ' is-genomics' : '';
    let nextBlock = '';
    if (next) {
      const label = stage.n === 4 ? `Next: ${next.title} (optional)` : `Next: ${next.title}`;
      nextBlock = `<div class="jr-next"><div class="jr-next-label">Recommended sequence</div><div class="jr-next-title">${esc(label)} — ${esc(next.question)}</div><button type="button" class="jr-next-btn" data-jr-go="${esc(next.lead)}">Continue to stage ${String(next.n).padStart(2,'0')} →</button>${stage.n === 4 ? '<div class="jr-tool-note">If strategy exploration is not relevant, you can move directly to clinical translation from the journey rail.</div>' : ''}</div>`;
    } else {
      nextBlock = `<div class="jr-next"><div class="jr-next-label">Journey complete</div><div class="jr-next-title">Use the cited dossier to decide what needs deeper validation next.</div><button type="button" class="jr-next-btn" data-jr-go="welcome">Review the full journey →</button></div>`;
    }

    let companion = '';
    if (tool === 'alphamissense') {
      companion = `<div class="jr-tool-note"><strong>Companion evidence:</strong> AlphaMissense focuses on missense protein effects. AlphaGenome adds broader genomic and regulatory context. <button type="button" class="jr-atlas-btn" data-jr-go="atlas" style="margin-left:6px">Open AlphaGenome Atlas →</button></div>`;
    } else if (stage.n === 2) {
      companion = `<div class="jr-tool-note">Once the biological target is credible, use AlphaGenome to examine whether human variant evidence supports or challenges the mechanism before molecule-level work.</div>`;
    }

    return `<section class="jr-context${genomicsClass}${optionalClass}" aria-label="Current research journey stage"><div><div class="jr-context-eyebrow">Stage ${String(stage.n).padStart(2,'0')} of 07${stage.optional ? ' · optional branch' : ''}</div><div class="jr-context-title">${esc(stage.title)} — ${esc(stage.question)}</div><div class="jr-context-why"><strong>Why this comes here:</strong> ${esc(stage.why)}</div>${companion}</div>${nextBlock}</section>`;
  }

  function enhanceContent(tool) {
    if (!isWorkspace) return;
    const content = document.getElementById('content');
    if (!content) return;
    content.querySelectorAll(':scope > .jr-welcome, :scope > .jr-legacy-label, :scope > .jr-context').forEach(el => el.remove());
    if (tool === 'welcome') content.insertAdjacentHTML('afterbegin', welcomeHTML());
    else content.insertAdjacentHTML('afterbegin', toolContextHTML(tool));
    bindActions(content);
  }

  function update(tool) {
    currentTool = tool || 'welcome';
    const n = TOOL_STAGE[currentTool] || 0;
    if (n) visitedStages.add(n);
    installRail(currentTool);
    installSidebar(currentTool);
    enhanceContent(currentTool);
  }

  function bindActions(root) {
    root.querySelectorAll('[data-jr-go]').forEach(el => {
      if (el.dataset.jrBound === '1') return;
      el.dataset.jrBound = '1';
      el.addEventListener('click', event => {
        event.preventDefault();
        navigate(el.dataset.jrGo);
      });
    });
  }

  function installWorkspace() {
    if (!isWorkspace) return;
    originalGo = typeof window.go === 'function' ? window.go : null;
    if (originalGo) {
      window.go = function(tool, skipHash) {
        const currentN = TOOL_STAGE[currentTool] || 0;
        if (currentN) visitedStages.add(currentN);
        const result = originalGo.apply(this, arguments);
        window.requestAnimationFrame(() => update(tool || 'welcome'));
        return result;
      };
    }
    const hashTool = window.location.hash.replace(/^#/, '') || 'welcome';
    update(TOOL_STAGE[hashTool] !== undefined ? hashTool : 'welcome');
    window.addEventListener('hashchange', () => {
      const tool = window.location.hash.replace(/^#/, '') || 'welcome';
      if (TOOL_STAGE[tool] !== undefined && tool !== currentTool) update(tool);
    });
  }

  function installAtlasBridge() {
    if (!isAtlasPage) return;
    document.body.classList.add('jr-atlas-page');
    const header = document.querySelector('.atlas-header');
    if (!header || document.querySelector('.jr-atlas-bridge')) return;
    const bridge = document.createElement('div');
    bridge.className = 'jr-atlas-bridge';
    bridge.innerHTML = `<strong>Stage 03 · Validate Genomics</strong><span>You are examining variant-level evidence. AlphaGenome complements — but should not be double-counted with — overlapping AlphaMissense evidence.</span><a class="jr-atlas-btn" href="/#bindpredict">Continue to Stage 04 · Evaluate Molecule →</a>`;
    header.insertAdjacentElement('afterend', bridge);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { installWorkspace(); installAtlasBridge(); }, {once:true});
  } else {
    installWorkspace(); installAtlasBridge();
  }
})();
