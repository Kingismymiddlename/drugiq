const notes = {
  scisynth: 'Searches configured literature services and sends returned papers to a synthesis service. Verify claims against the retrieved records.',
  targetscope: 'Uses the configured target and literature services. Ranked targets and interpretations require independent evidence review.',
  bindpredict: 'Combines protein and ligand context, optional structure lookup and upstream interpretation. Not an experimentally validated affinity measurement.',
  biosignal: 'Uses configured biomarker-literature and gene-disease services. Candidate grades are research aids, not validated diagnostic performance.',
  repurposerx: 'Explores prior-agent and mechanism context. A suggested candidate is not evidence of efficacy for a new indication.',
  trialmatch: 'Retrieves trial records. Displayed match scores use ordering and limited heuristics, not validated eligibility scoring or confirmation of enrollment.',
  alphamissense: 'Retrieves gene and structure context and links to external pathogenicity-score sources. The supplied client does not directly retrieve an AlphaMissense score.',
  molprofile: 'Retrieves molecular properties and applies simple drug-likeness heuristics. Not a validated ADME, toxicity or pharmacokinetics simulation.',
  combinedrx: 'Uses constructed context with a general synthesis service and links to Madrigal. Does not execute Madrigal inference.',
  immuniq: 'Uses constructed context with a general synthesis service and links to COMPASS. Does not execute COMPASS inference or predict a patient outcome reliably.',
  pathogenrx: 'Uses constructed context with a general synthesis service and links to SyntheMol-RL. Does not generate or validate new antibiotic structures.',
  dossier: 'Combines existing evidence probes and fixed heuristic scores. Not a calibrated clinical-success probability. Source availability and missing data require review.'
};
export function createCatalog(config, sourceTools, copy, chain) {
  const entries = Object.entries(sourceTools).map(([id,t]) => ({
    id, name:t.name, description:copy[id][0], category:copy[id][1], stage:chain[id],
    documentationUrl:config.url+'/tools/'+id, browserUrl:config.url+'/#'+id,
    executionAvailable:false, researchUseOnly:true,
    inputs:t.fields.map(f=>({id:f.id,label:f.lbl,required:Boolean(f.req),type:f.type==='select'?'select':'text',...(f.opts?{options:f.opts}: {})})),
    limitations:[notes[id]]
  }));
  entries.unshift({id:'dossier',name:'Candidate Dossier',description:'Bring target validation, compound properties, prior-agent evidence and the trial landscape into one browser research report.',category:'Candidate evidence review',stage:'cross-stage',documentationUrl:config.url+'/tools/dossier',browserUrl:config.url+'/#dossier',executionAvailable:false,researchUseOnly:true,inputs:[{id:'target',label:'Target (gene / protein)',required:true,type:'text'},{id:'compound',label:'Compound (name or SMILES)',required:true,type:'text'},{id:'indication',label:'Indication (disease)',required:true,type:'text'}],limitations:[notes.dossier]});
  return {schemaVersion:'1.0.0',product:'DrugIQ',canonicalUrl:config.url+'/',scope:'Public discovery only; no research execution API',tools:entries};
}
export function catalogSchema() {
 return {
  type:'object',additionalProperties:false,
  required:['id','name','description','category','stage','documentationUrl','browserUrl','executionAvailable','researchUseOnly','inputs','limitations'],
  properties:{
   id:{type:'string'},name:{type:'string'},description:{type:'string'},category:{type:'string'},
   stage:{type:'string',enum:['target','hit','lead','clinical','cross-stage']},
   documentationUrl:{type:'string',format:'uri'},browserUrl:{type:'string',format:'uri'},
   executionAvailable:{type:'boolean',const:false},researchUseOnly:{type:'boolean',const:true},
   inputs:{type:'array',items:{type:'object',additionalProperties:false,required:['id','label','required','type'],properties:{id:{type:'string'},label:{type:'string'},required:{type:'boolean'},type:{type:'string',enum:['text','select']},options:{type:'array',items:{type:'string'}}}}},
   limitations:{type:'array',items:{type:'string'},minItems:1}
  }
 };
}
export function createOpenAPI(config,catalog) {
 const error = {type:'object',required:['error','message','links'],properties:{error:{type:'string'},message:{type:'string'},links:{type:'object',additionalProperties:{type:'string',format:'uri'}}}};
 const headers = {'X-Content-Type-Options':{schema:{type:'string'},description:'nosniff'}};
 const response = (description,schema)=>({description,headers,content:{'application/json':{schema}}});
 const errors = {'404':response('Unknown resource; follow the recovery links.',error),'405':{description:'Unsupported method. Allow: GET, HEAD.',headers:{Allow:{schema:{type:'string'}}}},'406':{description:'The requested response media type is unavailable.'}};
 const collection = {type:'object',required:['schemaVersion','product','canonicalUrl','scope','tools'],properties:{schemaVersion:{type:'string'},product:{type:'string',const:'DrugIQ'},canonicalUrl:{type:'string',format:'uri'},scope:{type:'string'},tools:{type:'array',items:{$ref:'#/components/schemas/ResearchTool'}}}};
 return {
  openapi:'3.1.1',jsonSchemaDialect:'https://json-schema.org/draft/2020-12/schema',
  info:{title:'DrugIQ Public Discovery API',version:'1.0.0',description:'Read-only research-tool catalog. Does not run scientific analyses, process patient profiles or expose existing backend APIs.'},
  servers:[{url:config.url}],security:[],tags:[{name:'Catalog',description:'Public research workflow metadata'}],
  externalDocs:{description:'DrugIQ developer documentation',url:config.url+'/docs/api'},
  paths:{
   '/api/catalog':{get:{operationId:'listDrugIQResearchTools',summary:'List DrugIQ browser research tools',tags:['Catalog'],responses:{'200':response('The public catalog.',collection),...errors}}},
   '/api/catalog/{id}':{get:{operationId:'getDrugIQResearchTool',summary:'Read one DrugIQ catalog entry',tags:['Catalog'],parameters:[{name:'id',in:'path',required:true,description:'An exact catalog ID.',schema:{type:'string',enum:catalog.tools.map(t=>t.id)}}],responses:{'200':response('A public tool description. Input metadata refers to the browser form, not an execution API.',{$ref:'#/components/schemas/ResearchTool'}),...errors}}}
  },components:{schemas:{ResearchTool:catalogSchema(),Error:error}}
 };
}
