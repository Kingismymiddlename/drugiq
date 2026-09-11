# DrugIQ developer documentation

DrugIQ is a drug-development research workspace, not a Vercel administration product. These first-party resources describe DrugIQ's public discovery API, supported browser workflows, machine-readable content and Model Context Protocol endpoint. The added API is read-only and returns catalog metadata and documentation; it does not execute the existing research tools or provide clinical predictions.

## Start here

- [DrugIQ public API reference](/docs/api): Catalog endpoints and the OpenAPI contract.
- [DrugIQ authentication and access](/docs/authentication): Public-read scope and what is not authorized.
- [DrugIQ MCP integration](/docs/mcp): Streamable HTTP endpoint and initialization example.
- [DrugIQ agent instructions](/docs/agent-instructions): When to use the product and how to recover from missing pages.
- [DrugIQ data sources](/docs/data-sources): Browser integrations and evidence provenance.
- [DrugIQ research limitations](/docs/limitations): Heuristic scores and external-model boundaries.
- [DrugIQ deployment guide](/docs/deployment): How the documentation and HTTP layer are hosted on Vercel.

## Choose a research workflow

Browse [the catalog](/api/catalog) to find tool IDs, input labels, required fields, capabilities, limitations and browser links. Use the individual tool documentation to decide which interface fits the question. A catalog entry is a description, not a scientific result. Running an existing research workflow still requires the browser application and its existing upstream services.

## Machine-readable entry points

The [llms.txt guide](/llms.txt) links to concise Markdown documentation. The [sitemap](/sitemap.xml) lists canonical, indexable HTML pages. The [OpenAPI document](/openapi.json) specifies only the new public catalog API. HTML documentation and the homepage support an Accept header requesting text/markdown, and explicit .md variants are also provided. Prefer these resources rather than extracting inline scripts or guessing backend routes.
