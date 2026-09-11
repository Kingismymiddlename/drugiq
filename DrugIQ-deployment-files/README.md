# DrugIQ agent-readiness implementation

This package implements agent-readable delivery and discovery around the supplied DrugIQ redesign. It is not a new research backend and has not been deployed to the user's production Vercel project. A fresh Is Agentic score has not been measured.

## Important: deploy the package, not a single HTML file

The previous redesign could be deployed by replacing index.html alone. This update cannot: HTTP status codes, Accept negotiation and MCP require the included Node.js handler and routing configuration.

The authoritative UI source is `source/index.html`, copied from the latest supplied `DrugIQ-redesigned.html`. It was inspected before changes. The source snapshot remains untouched. A reproducible build pre-renders its existing landing template, externalizes its original styles and scripts, and adds the public discovery documents. Existing research functions, endpoints, prompts, heuristics, orchestration, exports, assistant logic and router are preserved.

No Git repository, current production commit, deployment settings or backend source was available. Compare your repository's current UI with this supplied snapshot before applying the package if you have made intervening changes. Do not replace unrelated repository files or backend services.

## What changed

| Audit item | Implementation | Remaining boundary |
| --- | --- | --- |
| 1. Content without JavaScript | Existing landing content is present in raw HTML; 5,358 characters of landing text. One H1, sequential headings and real documentation links. | Research interaction still needs JavaScript. |
| 2. Agent-friendly 404s | Unknown paths return HTTP 404 with Markdown recovery links by default, or HTML when preferred. No application-shell fallback. | Must be checked on the deployed Vercel route configuration. |
| 3. Markdown negotiation | HTML pages negotiate text/markdown; q-values, wildcards, q=0, HEAD, 406 and Vary: Accept, Accept-Encoding are tested. | CDN headers need a real deployed-host check. |
| 4. Developer discovery | DrugIQ-named docs, authentication notes, API reference, OpenAPI and tool pages have predictable URLs and llms.txt links. | Search-engine discovery requires deployment and crawling. |
| 5. Brand discovery | DrugIQ titles, canonical links, site identity, source-aware descriptions and sitemap are generated. Search Console verification metadata is configurable. | Search ranking, external citations and domain decisions cannot be guaranteed by code. |
| 6. JSON-LD | SoftwareApplication and WebSite entities describe DrugIQ without invented ratings, authors or affiliations. | The actual operator must confirm any additional entity claims. |
| 7. Agent instructions | llms.txt links to when-to-use, how-to-call, safety, provenance and recovery guidance. | Guidance is not a promise that every agent will follow it. |
| 8. Sitemap | Valid XML sitemap lists 24 canonical HTML pages with stable lastmod dates. robots.txt advertises it. | Submit it after deployment. |
| 9. Organization completeness | Verified organization configuration generates linked Organization, ContactPoint and PostalAddress. Incomplete configurations fail the build. | Disabled by default: real operator identity, contact email and address were not supplied. |
| 10. Trust pages | Substantive /about, /contact and /privacy pages are available without JavaScript. | Contact explicitly says no verified channel is available; privacy is a code-grounded disclosure awaiting operator review. |
| 11. Metadata | Canonical, lang, og:type, absolute og:image, additional social metadata and a real 1200x630 PNG. | No social-preview service or search-engine rendering guarantee. |
| 12. MCP | Actual POST initialize, notifications, tools/list, tools/call and public resources at /.well-known/mcp. | Public-read discovery only, not scientific execution. |

## Local setup

Node.js 22 is required. Runtime and core-test code use Node built-ins only; there are no npm application dependencies.

```sh
npm ci
npm run check
npm start
```

Open `http://127.0.0.1:3000`. Do not double-click a generated HTML file and expect the HTTP layer to work.

`npm run check` builds the package, runs the automated tests and performs real loopback HTTP verification of all generated public resources and the implemented API/MCP operations. Optional document and browser checks are described below.

## Deploy on your existing Vercel project

1. Create a branch such as `agent-readiness`. Preserve the current production deployment for rollback. Compare your current UI against `source/index.html` before overwriting any project content.
2. Copy the package's code, source, content, assets, package files and `vercel.json` into the existing application's project root. Keep unrelated backend files and configuration. Merge an existing `vercel.json` carefully rather than discarding unrelated routes.
3. Commit and push. Use the included settings: Framework **Other**, Node **22.x**, Build Command **npm run build**, Output Directory **dist/public**. The included `vercel.json` specifies them. The old blank static Build Command is no longer appropriate. Check that project-level dashboard routes do not override the new handler.
4. Let Vercel build a preview. The API function must be present in the deployment and receive the catch-all routing rule. Requests are resolved against a strict generated resource allowlist; the catch-all is not an app-shell fallback.
5. Verify the preview, test a normal research workflow using your actual existing services, and merge only after the checks pass. Then verify the production hostname and rerun the external Is Agentic audit.

```sh
npm run verify -- https://YOUR-PREVIEW-HOST.vercel.app
npm run verify -- https://drugiq.vercel.app
```

For a protected preview, the verifier optionally reads `VERCEL_AUTOMATION_BYPASS_SECRET` and sends it as an `x-vercel-protection-bypass` header. Supply a token issued for your own deployment through your local environment; never commit or paste it into public documentation. Without access, the checker reports the failure rather than pretending the endpoint was verified.

The added HTTP layer uses a Vercel Node function. Review function usage and gateway protections for your plan. The code does not introduce paid scientific inference calls or expose an anonymous inference proxy.

## Configuration that requires real operator input

Edit `site.config.json` with verified information only.

- `contactEmail`: A real monitored address. Once populated, the contact-page generator uses it rather than the no-contact disclosure.
- `organization`: Keep null until the legal/public organization identity is confirmed. Publishing requires name, verified=true, contactEmail and an address containing streetAddress, addressLocality, postalCode and addressCountry. Optional phone and sameAs values must also be genuine. Unit tests use clearly synthetic fixtures in temporary directories; those fixtures are not published.
- `sameAs`: Real official profile URLs only. Do not add profiles belonging to another DrugIQ, the hosting provider or an unrelated employer.
- `googleSiteVerification`: Your own search-verification token. This does not itself submit a sitemap or guarantee indexing.
- `url`: The canonical HTTPS origin. A custom-domain move requires an intentional redirect and indexing plan; it is not done automatically.
- `contentUpdated`: The actual content-change date. Do not update it on every build just to look fresh.
- `mcpAllowedOrigins`: Additional exact browser origins you approve. The canonical origin and trusted Vercel preview environment hostnames are also permitted. No wildcard Vercel subdomain is trusted.
- `privacyOperatorReviewComplete`: An internal review-status flag, not a legal compliance certification. Update the authored privacy disclosure after confirming actual production practices; flipping a flag is not a substitute for this review.

The supplied contact and privacy pages deliberately disclose missing facts. Before presenting the product as a verified business or handling sensitive data, confirm the operator, contact channel, backend providers, retention/deletion rules, analytics, consent and applicable processing requirements. Do not put patient data or proprietary research into the public discovery endpoints.

## MCP scope and protocol

Endpoint: `POST /.well-known/mcp`.

Supported revision: **2025-11-25**, with **2025-06-18** and **2025-03-26** compatibility. This implementation does not claim the different 2026-07-28 protocol. It negotiates a supported revision during initialize. Native clients need no Origin header; browser clients must pass the configured origin check.

Callable tools are `drugiq_list_tools`, `drugiq_get_tool` and `drugiq_read_document`. They return public catalog data or allowlisted Markdown documents. They do not run the eleven research tools, generate a dossier, contact external model services, accept patient profiles or follow arbitrary URLs. The catalog clearly sets executionAvailable=false.

This is a small stateless, dependency-free implementation of the declared capabilities, not an untested SDK placeholder. Responses use the JSON option permitted by Streamable HTTP. Valid notifications get 202 with no body. GET and DELETE return 405 because standalone SSE and sessions are not offered. GET 405 must not be confused with a failed POST handshake. A made-up MCP manifest or OAuth metadata file is not published.

Before adding scientific execution, decide which APIs are supported and implement appropriate authentication/scopes, consent, data handling, durable quotas, concurrency limits, provider credentials, timeout handling and scientific evaluation. Do not simply proxy the browser's existing inference endpoints for anonymous agent traffic. Read `content/limitations.md` for implementation issues preserved in the existing research code.

## Verification and evidence

`reports/preservation.json` contains source and research-core SHA-256 values. The protected core matches the source byte-for-byte, including its leading newline; the router is unchanged. Original head styles are compared byte-for-byte, too.

`reports/unit-tests.tap` records the Node tests. They cover negotiation, statuses, cache headers, errors, metadata, all page representations, aliases, safe routing, full MCP requests, origins, input schemas, version negotiation and the verified-organization build path.

`reports/local-endpoints.json` records HTTP requests through the same handler used by the Vercel function. It exercises every declared public resource plus catalog and MCP operations. `reports/document-validation.json` records independent XML, JSON Schema and internal-link checks. The OpenAPI contract's schema, references and operations were checked locally; no live external OpenAPI certification is claimed.

`reports/browser-checks.json` records no-JavaScript rendering, original-form behaviors, examples, filtering, navigation, handoffs, assistant opening and visual comparisons. The current managed browser blocks URL navigation, so the successful browser run used in-memory rendering of the source and exact generated asset contents; actual HTTP behavior was tested separately. External network calls were blocked. The hero had no changed pixels above a two-level channel tolerance; the dossier comparison passed the same small antialiasing tolerance. The footer's new documentation links are intentional.

The public-host verification attempt could not resolve the production hostname from this execution environment. The web reader could see the public homepage, but could not verify custom headers or deployed changes. `reports/deployed-endpoints.json` records the failed preflight and explicitly marks deployedVerificationCompleted=false. No repository deployment, live backend regression test, full accessibility certification, search indexing or fresh Ora/Is Agentic score is claimed.

Optional independent checks:

```sh
python -m pip install -r requirements-test.txt
python tests/validate_documents.py
# In another terminal, serve the baseline for a browser comparison:
python -m http.server 3001 --bind 127.0.0.1 --directory source
# Run npm start in a separate terminal, then:
python tests/browser_check.py
```

Set CHROMIUM_PATH to the installed Chromium executable if needed. In a browser environment that prohibits navigation, `DRUGIQ_BROWSER_IN_MEMORY=1 python tests/browser_check.py` uses in-memory rendering and labels that limitation in the report. This is not a substitute for post-deployment browser smoke tests.

## Files you maintain

`source/index.html` is the original research/UI source. `content/*.md` holds authored trust and developer pages. `public/assets` holds the new documentation stylesheet, favicon and social image. `lib` and `api` implement HTTP and MCP delivery. `scripts/build.mjs` generates `dist`, and `scripts/verify.mjs` verifies the available host. `dist` is included in the download for inspection but is generated and ignored by Git.

Do not modify generated `dist` files as your source of truth. Never publish reports, raw config, source snapshots, node_modules or environment files through a general filesystem route. The included handler intentionally does not expose them.

## Protocol references used

- [HTTP Semantics: Accept, Vary, HEAD and conditional requests](https://www.rfc-editor.org/rfc/rfc9110.html)
- [Accept Markdown requirements](https://acceptmarkdown.com/)
- [llms.txt published format](https://llmstxt.org/)
- [Sitemap XML protocol](https://www.sitemaps.org/protocol.html)
- [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)
- [MCP 2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [Vercel routing configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Google indexing requests and sitemap submission](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [Organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization)

These references informed the implementation; the local reports are evidence of the tests actually run, not certifications issued by those projects.
