# DrugIQ privacy and data handling

This disclosure describes behavior visible in the supplied DrugIQ client and the new read-only documentation endpoints. It is not a representation that backend processing, retention or legal compliance has been audited. The operator's legal identity, monitored privacy contact, provider agreements and retention schedule have not been supplied. Those details require operator review before this disclosure can serve as a complete privacy policy.

## Information entered into research tools

The workspace accepts research questions, disease names, targets, compounds and other tool-specific information. Some forms also accept a patient age, gender, biomarkers or prior treatment. Depending on the tool, the browser sends inputs to existing Render-hosted research services and public scientific APIs. AI-assisted requests can include the entered context and retrieved or constructed text. Avoid patient-identifying information, confidential research, proprietary structures and other sensitive data. No private-data handling guarantee is made here.

## Browser resources and the assistant

The supplied client loads resources from external hosts, including Google Fonts, a 3D viewer library and script CDNs. These hosts may receive connection information such as IP address and browser headers when resources are requested. The client also contains Google Analytics code with a placeholder measurement identifier; the operator must confirm the configuration actually deployed. The assistant sends conversational context to the existing synthesis service. This disclosure does not assume that disabling a visible feature prevents all network requests.

## The added public API and MCP endpoint

The added discovery API and MCP tools return public catalog entries, documentation and navigation guidance. They do not invoke scientific inference, accept patient profiles or proxy requests to the existing research backends. Their handlers do not add cookies, persist submitted requests or implement user accounts. The hosting platform can still process request metadata and maintain operational logs under its own configuration and policies; this code cannot establish those retention periods.

## Exports and external destinations

The workspace can create local JSON downloads, copy research briefs and open a printable report. Review an export before sharing it. Following a source link or external-model link takes you to an independently operated service with its own terms and privacy practices. Listing a source is not a promise about how that source processes information.

## Outstanding privacy information

The operator needs to confirm the data controller or responsible entity, a working contact channel, backend subprocessors, retention and deletion arrangements, analytics and consent requirements, and any applicable cross-border processing details. Until this review is complete, do not use DrugIQ with regulated or sensitive datasets. See the [contact page](/contact) for the current contact status and [data sources](/docs/data-sources) for the integration boundaries.
