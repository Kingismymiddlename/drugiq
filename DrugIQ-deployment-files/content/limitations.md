# DrugIQ research limitations

DrugIQ supports research exploration, not clinical decision-making. The agent-readiness update preserves the existing research logic, including its limitations. Making information easier for agents to read does not validate the underlying science. This page records important implementation boundaries so that improved discoverability does not turn into overclaiming.

## Scores and evidence

The Candidate Dossier combines heuristic section scores using fixed weights. Its External Evidence Score is not a calibrated probability of clinical success, a safety assessment or a validated commercial-risk model. The TrialMatch implementation derives displayed match scores from result ordering and limited checks; it does not establish patient eligibility. Molecular-property rules are screening heuristics, not full ADME, toxicity or pharmacokinetic simulations. Missing or defaulted upstream values need special scrutiny before interpreting a report.

## Named external models

The AlphaMissense workflow retrieves gene and structure context and links out for score lookup; the supplied code does not directly retrieve an AlphaMissense pathogenicity score. CombinedRx, ImmunIQ and PathogenRx send constructed context to a general synthesis service and provide links to external research models. They do not execute Madrigal, COMPASS or SyntheMol-RL inference in the supplied implementation. Links to those projects must not be represented as native model execution or as partnerships.

## Citations are not automatic claim verification

A source panel can include database records, links, literature returned by a search or general search URLs. These are not interchangeable forms of evidence. Some generated text is based on constructed context rather than a retrieved paper. Review whether a cited source directly supports the exact claim and whether any probe was unavailable. Do not describe every generated sentence as independently verified.

## Boundaries for agents

The new public API and MCP endpoint return documentation and catalog metadata only. They cannot generate a Candidate Dossier, recommend a therapy, diagnose a patient or run a research job. Use [agent instructions](/docs/agent-instructions) to select an appropriate browser workflow, and seek qualified scientific or clinical review when the question requires it. No performance, regulatory, privacy-compliance or availability certification is claimed.
