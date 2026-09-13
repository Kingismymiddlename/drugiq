/* DrugIQ Research Copilot enhancement layer */
(() => {
  'use strict';
  const TOOLS = [
    ['scisynth','SciSynth','01 Understand','Literature evidence for a scientific hypothesis.'],
    ['targetscope','TargetScope','02 Identify Biology','Disease-relevant target evidence.'],
    ['biosignal','BioSignal','02 Identify Biology','Disease biomarkers and translational signals.'],
    ['alphagenome','AlphaGenome Evidence','03 Validate Genomics','Genomic and regulatory variant-effect evidence across genes, tissues and tracks.'],
    ['alphamissense','AlphaMissense','03 Validate Genomics','Protein-level missense variant evidence.'],
    ['bindpredict','BindPredict','04 Evaluate Molecule','Target-compound binding evidence and structure context.'],
    ['molprofile','MolProfile','04 Evaluate Molecule','Molecular properties and developability signals.'],
    ['repurposerx','RepurposeRx','05 Explore Strategy','Drug-repurposing opportunities.'],
    ['combinedrx','CombinedRx','05 Explore Strategy','Combination-treatment evidence.'],
    ['immuniq','ImmunIQ','05 Explore Strategy','Immunotherapy response evidence.'],
    ['pathogenrx','PathogenRx','05 Explore Strategy','Antimicrobial discovery strategy.'],
    ['trialmatch','TrialMatch','06 Translate','Clinical-trial landscape.'],
    ['dossier','Candidate Dossier','07 Decide','Decision-ready synthesis of external candidate evidence.']
  ].map(([id,name,stage,what])=>({id,name,stage,what}));

  function context(){
    const x={page:location.pathname,hash:location.hash||'#welcome'};
    const disease=document.getElementById('gDisease')?.value?.trim(); if(disease)x.disease=disease;
    try{if(typeof lastResult!=='undefined'&&lastResult){x.last_analysis=lastResult.id||null;x.last_inputs=lastResult.params||null;}}catch(_){}
    const id=(location.hash||'').replace('#',''); const t=TOOLS.find(v=>v.id===id);
    if(t){x.current_tool=t.name;x.current_stage=t.stage;}
    if(location.pathname.includes('variant-evidence')){x.current_tool='AlphaGenome Evidence';x.current_stage='03 Validate Genomics';}
    return x;
  }

  function prompt(){
    const catalog=TOOLS.map(t=>`- ${t.id} | ${t.name} | ${t.stage}: ${t.what}`).join('\n');
    return `You are DrugIQ Research Copilot, the conversational research layer inside DrugIQ. DrugIQ helps researchers move from a biological question to a decision-ready candidate dossier by connecting literature, target biology, genomic evidence, molecular evidence, therapeutic strategy and clinical evidence.\n\nSESSION CONTEXT:\n${JSON.stringify(context())}\n\nJOURNEY:\n01 Understand -> 02 Identify Biology -> 03 Validate Genomics -> 04 Evaluate Molecule -> 05 Explore Strategy -> 06 Translate -> 07 Decide\n\nCAPABILITIES:\n${catalog}\n\nAnswer scientific and platform questions directly. Explain what evidence means, what is missing, what should come next, and why. Recommend a DrugIQ capability only when useful. Never invent findings, citations, Atlas scores, clinical facts or DrugIQ results. Clearly distinguish general explanation from evidence actually retrieved by DrugIQ. AlphaGenome and AlphaMissense are complementary, not independent confirmations; AVI may incorporate AlphaMissense information. AlphaGenome does not silently alter Candidate Dossier scoring. For medical questions, provide research information rather than personal medical decisions.\n\nWhen opening a DrugIQ capability would help, append one action token on its own final line: <<OPEN:toolid|field=value;field=value>>. Valid toolids: ${TOOLS.map(t=>t.id).join(', ')}. Use <<OPEN:alphagenome>> for AlphaGenome. Include only values supplied by the user or already present in session context.\n\nBe conversational and useful. Do not restrict replies to 2-4 sentences. Use short sections or bullets when helpful and ask a clarifying question only when materially needed.`;
  }

  async function llm(userText){
    CBOT.history.push({role:'user',content:userText});
    const recent=CBOT.history.slice(-16);
    try{
      const r=await fetch('https://scisynth-server.onrender.com/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:prompt(),messages:recent,context:context()})});
      if(r.ok){const d=await r.json();const reply=(d.reply||d.message||d.content||d.text||'').trim();if(reply){CBOT.history.push({role:'assistant',content:reply});return reply;}}
    }catch(_){}
    const transcript=recent.map(m=>`${m.role==='user'?'User':'Assistant'}: ${m.content}`).join('\n');
    const r2=await fetch('https://scisynth-server.onrender.com/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hypothesis:'Answer the latest user message as DrugIQ Research Copilot. Follow the supplied operating context and do not fabricate evidence.',papers:[{title:'DrugIQ Research Copilot context',authors:'DrugIQ',year:'2026',journal:'Platform context',abstract:prompt()+'\n\nCONVERSATION:\n'+transcript}]})});
    if(!r2.ok){if(r2.status===429)throw new Error('rate_limit');throw new Error('backend');}
    const d2=await r2.json();const reply=(d2.summary||d2.reply||d2.message||'').trim();if(!reply)throw new Error('backend');CBOT.history.push({role:'assistant',content:reply});return reply;
  }

  function action(a){
    if(!a||!a.tool)return;
    if(a.tool==='alphagenome'){location.href='/variant-evidence.html';return;}
    if(typeof go!=='function')return;go(a.tool);
    setTimeout(()=>{Object.entries(a.fields||{}).forEach(([field,value])=>{const el=document.getElementById('f-'+field)||document.getElementById(field);if(el&&value!=null){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.style.borderColor='var(--teal)';}});},180);
  }

  function install(){
    if(typeof CBOT==='undefined')return false;
    try{cbotSystemPrompt=prompt;cbotLLM=llm;cbotAction=action;}catch(_){}
    try{CBOT.history.length=0;CBOT.greeted=false;}catch(_){}
    const title=document.querySelector('.cbot-title');if(title)title.textContent='DrugIQ Research Copilot';
    const sub=document.querySelector('.cbot-sub');if(sub)sub.textContent='Evidence-aware research guidance';
    const input=document.getElementById('cbot-input');if(input)input.placeholder='Ask about the science, your evidence, or what to do next…';
    const disclaimer=document.querySelector('.cb-disclaim');if(disclaimer)disclaimer.textContent='Research guidance · Verify primary evidence · Not clinical advice';
    try{cbotGreet=function(){cbotAddBot('I’m your DrugIQ Research Copilot. Tell me the disease, target, variant, compound, hypothesis—or the decision you are trying to make. I can explain the science, connect the evidence, and guide the next research step.');const body=document.getElementById('cbot-body');const wrap=document.createElement('div');wrap.className='cb-chips';['Guide me through DrugIQ','I have a disease but no target yet','How does AlphaGenome fit into the workflow?','I have a target and compound to evaluate','Help me interpret my latest result'].forEach(text=>{const b=document.createElement('button');b.className='cb-chip';b.textContent=text;b.onclick=()=>cbotSend(text);wrap.appendChild(b);});body.appendChild(wrap);body.scrollTop=body.scrollHeight;};}catch(_){}
    return true;
  }
  let n=0;const timer=setInterval(()=>{n++;if(install()||n>40)clearInterval(timer);},100);
})();
