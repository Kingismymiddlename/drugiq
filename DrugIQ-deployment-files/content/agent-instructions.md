# DrugIQ agent instructions

DrugIQ is a browser research workspace with a separate read-only discovery API. Use the website to understand a research workflow and direct a user to the right tool. Use the API or MCP endpoint to retrieve public catalog metadata and usage guidance. These interfaces do not make DrugIQ a clinical authority or provide autonomous scientific execution.

## When to use DrugIQ

- Use SciSynth guidance when the user wants to explore published support for a scientific hypothesis.
- Use TargetScope or RepurposeRx guidance for disease-associated targets or known-drug research questions.
- Use BindPredict or MolProfile guidance to explore target-compound context and molecular-property lookups.
- Use BioSignal, TrialMatch or ImmunIQ guidance for biomarker, trial-landscape or immunotherapy research questions, not patient eligibility or treatment decisions.
- Use AlphaMissense guidance to find variant context and external score resources; the current client does not retrieve an AlphaMissense score directly.
- Use CombinedRx or PathogenRx guidance for combination-therapy or antimicrobial research context; external model links do not run those models.
- Use the Candidate Dossier when the user wants a consolidated browser evidence review for a target, compound and indication.

## How to call the published interfaces

Start at [GET /api/catalog](/api/catalog), then request /api/catalog/{id} for a known tool. For MCP, initialize the [documented endpoint](/docs/mcp), then call drugiq_get_tool or drugiq_read_document. Use exact tool IDs rather than guessing URLs. The returned browserUrl is a navigation link, not an execution API. Do not send patient data, credentials, proprietary compounds or confidential study material to a discovery endpoint.

## Interpreting information responsibly

Distinguish retrieved database records, AI-generated interpretations, manually constructed context and heuristic scores. Cite the primary record supporting a claim rather than citing a generic search page as if it proved the claim. A model being mentioned in the interface is not evidence that model inference ran. A trial match score is not confirmation of patient eligibility. Do not present DrugIQ output as diagnosis, dosing guidance or a validated prediction of safety or efficacy.

## Recovery and limits

If a path returns 404, consult [llms.txt](/llms.txt), the [sitemap](/sitemap.xml) or [documentation](/docs). Do not repeatedly invent paths or interpret a missing page as a positive result. A failed or unavailable upstream service is missing evidence, not a negative scientific finding. If the user needs a formal contact, patient-specific judgment, validated inference or authenticated scientific API, explain the limitation and request the appropriate human or approved service instead.
