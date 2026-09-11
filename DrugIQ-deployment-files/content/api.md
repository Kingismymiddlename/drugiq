# DrugIQ public API reference

The DrugIQ discovery API provides read-only descriptions of the research tools available in the browser workspace. It does not run analyses, save results, execute external research models or expose backend credentials. This narrower interface is intentional: scientific execution needs an approved API contract, authentication, quotas, privacy controls and an evaluation process before it is exposed to autonomous callers.

## Catalog endpoints

- [GET /api/catalog](/api/catalog): Returns the complete public catalog, including eleven specialist tools and the Candidate Dossier.
- GET /api/catalog/{id}: Returns one entry for an exact catalog ID. For example, [SciSynth](/api/catalog/scisynth) and [Candidate Dossier](/api/catalog/dossier).
- [GET /openapi.json](/openapi.json): The OpenAPI 3.1.1 document for these implemented endpoints.

A catalog entry contains an ID, display name, description, research stage, input-field metadata, documentation URL, browser URL, limitations and an executionAvailable value of false. The field metadata describes the browser form only. Do not send those scientific inputs to the catalog API or infer that an unlisted execution endpoint exists.

## Example request

```sh
curl -fsS https://drugiq.vercel.app/api/catalog/scisynth
```

## Responses and errors

Successful catalog requests return application/json. An unknown catalog ID returns HTTP 404 with a JSON error and recovery links. Other nonexistent site paths also return real HTTP 404 responses, with a compact Markdown recovery message by default or an HTML recovery page when HTML is preferred. Unsupported methods return HTTP 405 and an Allow header. A supported GET endpoint requested with an incompatible Accept media type returns HTTP 406. HEAD has the same status and headers as GET but no response body.

## Content negotiation

```sh
curl -i -H 'Accept: text/markdown' https://drugiq.vercel.app/docs/api
curl -i -H 'Accept: text/html;q=1, text/markdown;q=0.5' https://drugiq.vercel.app/docs/api
```

The server honors media-type quality values and explicit exclusions. Negotiated pages include Vary: Accept, Accept-Encoding. Negotiated responses are not stored by shared caches in this implementation; this avoids relying on undocumented CDN variation behavior. Read the [access policy](/docs/authentication) before building an integration.
