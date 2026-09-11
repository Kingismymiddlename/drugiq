# Deploying DrugIQ on Vercel

This guide is about deploying the DrugIQ application on Vercel. Vercel is the hosting provider, not the owner of the DrugIQ research catalog or MCP capabilities. The agent-readiness package adds a small HTTP layer and a reproducible build around the existing browser application; it does not migrate or replace the existing scientific backends.

## Build and routing

The build creates real homepage HTML before JavaScript runs, externalizes the existing client scripts and styles, and generates public documentation, Markdown variants, a sitemap, structured metadata and the catalog API contract. A Node.js function serves only known generated public resources. Unknown paths return a real 404, not the application shell. The route configuration deliberately sends requests through the HTTP handler so Accept negotiation and 404 behavior are applied consistently.

## Local checks

Run npm ci, npm run build, npm test and npm run verify -- --local with Node.js 22. For a browser preview, run npm start and open http://127.0.0.1:3000. The local server uses the same request handler as the Vercel function. Generated reports distinguish local verification from a deployed-host check; neither should be described as a fresh third-party readiness score.

## Publishing and verification

Deploy to a preview branch first and retain the current production deployment for rollback. Use the supplied vercel.json and build command rather than the previous empty static build configuration. After deployment, run npm run verify -- https://drugiq.vercel.app or point it at the preview hostname. Deployment protection may need a private bypass token for an automated preview check; do not place that token in the public repository or documentation.

## Remaining operator work

Confirm the site owner, contact information and privacy practices before publishing them as facts. Verify the domain with a search-engine webmaster account and submit the sitemap. Decide whether scientific execution should ever be exposed through authenticated APIs; the current package intentionally offers public-read discovery only. Hosting usage, gateway limits and custom-domain choices remain the operator's responsibility.
