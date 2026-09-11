# DrugIQ data sources and provenance

This guide describes integrations visible in the supplied browser code. It does not assert that every upstream service is available, that every returned statement is supported by a retrieved record, or that the backend implementations have been audited. Database names and external-model names are identifiers, not affiliations or endorsements.

## Existing research requests

SciSynth, TargetScope, BindPredict, BioSignal and RepurposeRx use existing Render-hosted services for their configured search and interpretation steps. Several other workflows reuse the SciSynth synthesis endpoint. The browser also contains direct lookups to scientific services including PubChem, ChEMBL, Ensembl, AlphaFold DB and clinical-trial registries. The new catalog API and MCP documentation tools do not proxy or invoke those services.

## Evidence versus constructed context

SciSynth passes retrieved papers to its synthesis step when search results exist. Other workflows can construct an input text from the user's parameters and ask a general synthesis service to interpret it. A constructed input record is not a retrieved publication, even when its label resembles a journal or database attribution. Inspect the current tool behavior and source identifiers before treating any statement as evidence.

## External research resources

The interface links to independently operated model resources, including AlphaMissense and other research projects. In the supplied implementation, some tools provide contextual synthesis and links instead of calling those specialized models. The [limitations guide](/docs/limitations) names these distinctions so agents do not inflate the implemented capabilities.

## Practical source review

Record the source URL, identifier, retrieval time when available, and whether the relevant record was actually fetched. Separate unavailable data from negative findings. Confirm a trial's current recruitment status and eligibility with its official record and study team. Consult original publications and databases before relying on an AI summary. The API catalog documents workflow intent; it is not itself a source of scientific findings.
