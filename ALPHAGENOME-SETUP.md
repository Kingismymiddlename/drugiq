# DrugIQ: passwordless AlphaGenome Atlas preview

## Release status

This is a Preview-only feature branch. It is NOT approved for production until the Vercel Preview, CI, browser regression, and real owner testing all pass.

The existing private `/api/atlas` endpoint remains protected by `DRUGIQ_RESEARCH_TOKEN`. The passwordless browser flow uses a separate lightweight `/api/atlas-public.js` facade that verifies Cloudflare Turnstile first, then supplies the private research token server-side. Neither the AlphaGenome API key nor research token is exposed to browser JavaScript.

## User experience

The `/variant-evidence.html` page accepts one human GRCh38 substitution (chromosome 1-22, X or Y; 1-based position; A/C/G/T alleles). There is no visible DrugIQ research password and no manual Connect step. Browser verification happens automatically before loading the scorer catalog and before each AlphaGenome request.

No LLM creates Atlas scores. Values, annotations, provenance, and limitations are displayed together. Candidate Dossier scoring is not modified.

## Required Preview environment variables

Configure these for the `feature/remove-atlas-password-gate` Preview branch in Vercel:

| Name | Type | Value |
| --- | --- | --- |
| `ALPHAGENOME_ENABLED` | Config | `true` |
| `ALPHAGENOME_API_KEY` | Secret | Existing Google AlphaGenome API key |
| `DRUGIQ_RESEARCH_TOKEN` | Secret | Existing DrugIQ research token |
| `TURNSTILE_SITE_KEY` | Config | Cloudflare Turnstile site key |
| `TURNSTILE_SECRET_KEY` | Secret | Cloudflare Turnstile secret key |

Do not paste secret values into GitHub, logs, issues, screenshots, or chat.

After changing Vercel environment variables, redeploy the Preview so the new deployment receives them.

## Cloudflare Turnstile hostnames

The Turnstile widget should allow:

- `drugiq.vercel.app`
- the exact current Vercel Preview hostname for this branch

Do not include `https://` in Cloudflare hostname management and do not use wildcard hostnames.

## Security boundaries

The AlphaGenome API key and DrugIQ research token remain server-side. The browser receives only the Turnstile site key, which is intentionally public. Turnstile tokens are verified server-side before the facade calls the existing protected Atlas endpoint.

Origin checks, request-size limits, the existing Atlas validation, timeouts, error redaction, no-store responses, and the existing Atlas request limiter remain in place. Use public, non-sensitive variants only. This remains personal/non-commercial research functionality and is not clinical advice.

## Tests and release gate

Before production promotion, require all of the following:

1. Vercel Preview deployment succeeds.
2. Python request/security/packaging tests pass.
3. Original application preservation/build tests pass.
4. JavaScript syntax checks pass.
5. Browser regression checks pass.
6. Official AlphaGenome SDK/runtime checks pass.
7. The owner verifies that the real scorer catalog loads without a password.
8. The owner retrieves a real public variant result successfully.
9. Existing DrugIQ tools remain functional.

## Rollback

Production is unchanged until the Preview is explicitly approved and merged. If anything fails, leave PR #5 as draft and keep the existing production password-protected flow untouched.
