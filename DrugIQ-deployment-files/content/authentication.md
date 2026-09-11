# DrugIQ authentication and access

The added DrugIQ catalog API, public documentation and read-only MCP tools do not require an API key. They expose only material already intended for public reading. Anonymous access is not authorization to run research backends, upload patient data, scrape without limits or access another user's information. No OAuth issuer, token endpoint, protected-resource metadata or paid developer plan is advertised because none has been implemented for this public-read surface.

## Public-read scope

The catalog API returns tool descriptions and input-field metadata. The MCP endpoint can list tools, return one catalog entry, and read allowlisted documentation. Neither surface makes outbound scientific or model-inference requests. It accepts no arbitrary destination URLs, filesystem paths, code, credentials, patient profiles or compound submissions. Existing browser research requests continue to use the original application's integrations; they have not been converted into a supported public execution API.

## Browser origins and transport

The MCP handler validates the Origin header against an explicit configured allowlist. Requests from native clients without Origin are permitted. Browser origins outside the allowlist are rejected; credentials are not enabled through CORS. If an integration requires an additional browser origin, the operator must deliberately add that exact origin, rather than allowing every Vercel subdomain or reflecting an untrusted header.

## Before adding authenticated scientific tools

The operator must decide the supported operations, data classification, user consent, service-account ownership, authentication scopes, quota enforcement, concurrency limits and audit requirements. Durable abuse controls belong at the hosting gateway or in a shared rate-limit service; a per-process counter would not be a reliable distributed quota. Keep any backend secrets in server-side environment variables, never in the client, llms.txt or an OpenAPI example.

The current interface makes no inference SLA or regulated-data commitment. Consult [privacy and data handling](/privacy) and the [MCP guide](/docs/mcp) for the exact published behavior.
