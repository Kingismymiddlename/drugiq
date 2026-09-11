# DrugIQ: private AlphaGenome Atlas preview

## Release status

This is a feature-branch implementation, NOT an approved production release. The site owner confirmed personal/non-commercial use and possession of an AlphaGenome API key. No credential has been supplied to the developer or committed to this repository. Appropriate Google terms and account permissions still apply.

Original `index.html` is unchanged. Its Git blob SHA at implementation was `1536acdb34a12aa949636096af37391a9a3ee3ab` (main commit `95c881572d3d8165f1cb6004184fc3cc52426e56`). Original JavaScript, style blocks, tool APIs, prompts, Candidate Dossier scoring, assistant, and exports are not rewritten. The build inserts only one optional research navigation link when enabled. The older `agent-readiness` branch is deliberately not combined with this feature.

## What it does

The separate `/variant-evidence.html` page accepts one human GRCh38 substitution (chromosome 1-22, X or Y; 1-based position; A/C/G/T alleles). It retrieves the official Atlas scorer catalog and one scorer's precomputed values using Google's `alphagenome` Python client. The backend is `/api/atlas`. No LLM creates scores. Values, annotations, provenance and limitations are displayed together. JSON download and printing include the retrieved subset, not an invented clinical verdict.

Coordinates are not converted between builds. Position syntax is checked locally; actual reference compatibility and coverage depend on the upstream service. Insertions, deletions, mitochondrial DNA, files, batch queries, and patient records are not accepted. At most 100,000 matrix cells are processed; at most 200 finite entries are returned, with explicit truncation counts. Sorting is within one scorer, not a pathogenicity or drug-success ranking. AVI and AlphaMissense must not be double-counted as independent evidence.

## Owner setup: Preview only

1. In the existing Vercel project `drugiq`, open **Settings > Environment Variables**.
2. Add these variables for **Preview**, preferably restricted to `feature/alphagenome-variant-evidence`. Do not select Production yet.

| Name | Value | Sensitive? |
| --- | --- | --- |
| `ALPHAGENOME_API_KEY` | Your actual Google AlphaGenome API key | Yes |
| `DRUGIQ_RESEARCH_TOKEN` | A separate randomly generated password, 32-512 ASCII characters | Yes |
| `ALPHAGENOME_ENABLED` | `true` (lowercase, no quotation marks) | No |

Generate the research password in your password manager and save it there. It must NOT be your Google API key. Never paste either secret into GitHub, logs, issues, screenshots, or chat. Do not use `NEXT_PUBLIC_` or `VITE_` prefixes.

3. In **Deployments**, redeploy the feature-branch **Preview** after saving the variables. The included `vercel.json` sets the Node build command and static output directory; `.python-version` selects Python 3.12 for the API. Do not change the project's production branch or root directory.
4. Open the Preview website. The research workspace has a **Variant Evidence** link when the enabled build succeeds. The direct path is `/variant-evidence.html`.
5. Enter the separate **DrugIQ research password** on that page and click **Connect to Atlas**. Never enter your Google key into the webpage.
6. Confirm the scorer list loads from Google, fill the supplied public example, choose a scorer, confirm research use, and retrieve evidence. The example is a documented input, not a guarantee of Atlas coverage. Inspect the source details and download the JSON.
7. Test the pre-existing tools with public examples on the preview before approving a production merge.

Vercel Preview Protection can remain on: sign in through Vercel before using the preview. The browser request retains same-origin cookies. If an origin error occurs on a legitimate preview alias, add its exact HTTPS origin to `ATLAS_ALLOWED_ORIGINS` (comma-separated) for this preview and redeploy. Do not use `*`.

## Security boundaries

All scientific queries need a private research password. Only a non-sensitive status response is public. The Google key stays server-side. Browser code does not write passwords or scores to localStorage, sessionStorage or URLs; the new page has no analytics. Results and credential values are not logged by this handler. This is not a guarantee about Vercel or Google's platform-level logs or retention; consult their policies. Use only public, non-sensitive variants.

Timeouts, payload limits, origin checks, error redaction, no-store responses, and per-instance request limiting are included. The rate limiter is NOT distributed across Vercel instances and is not sufficient for an unrestricted public proxy. Do not share the research password or remove the gate to serve other users without a separate access, licensing and quota review.

## Tests and checks

Run without Google credentials:

```sh
python -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/build.test.mjs
ALPHAGENOME_ENABLED=true node scripts/build-variant.mjs
python tests/browser_smoke.py
```

The browser harness needs Playwright and Chromium. It renders in-memory with mocked provider responses and blocked external research requests. It does not prove real API availability, Vercel routing/CSP behavior, or scientific correctness. Local results before pushing: 30 Python unit tests, 5 Node preservation/build tests, and 45 browser checks passed. Baseline tool screens, field IDs, Guide Mode, dossier examples, assistant opening, new result safety, export and mobile overflow were checked. Full existing scientific backends and printing were not exercised end-to-end.

The GitHub workflow separately installs the pinned official SDK, imports the Atlas/protobuf modules, and reports installed dependency size. A successful Vercel preview build is still required: the scientific Python stack is large and platform bundle limits can differ from the installed-directory size. Do not merge a red build or treat fixture results as live evidence.

After setting private credentials, the owner must verify a real catalog and query through the preview page. `GET /api/atlas` reporting `ready: true` means configuration is present; it does NOT prove Google access or a successful query.

## Release and rollback

Keep the pull request as a draft until preview build, actual authorized Atlas queries, and representative original research workflows pass. No production variables are configured by this change. To release later, explicitly approve the merge and configure production credentials separately. To disable after release, set `ALPHAGENOME_ENABLED=false` for that environment and redeploy; the original homepage is then emitted byte-for-byte and Atlas queries return a disabled response. Removing the key also prevents upstream access. Restore a previous known-good Vercel deployment if the build itself regresses.

## Primary references

- Atlas API: https://www.alphagenomedocs.com/api/atlas.html
- Official SDK and usage terms: https://github.com/google-deepmind/alphagenome
- Atlas source implementation: https://github.com/google-deepmind/alphagenome/blob/main/src/alphagenome/atlas/atlas.py
- AlphaGenome FAQ: https://www.alphagenomedocs.com/faqs.html
- Vercel Python API-directory functions: https://vercel.com/docs/functions/runtimes/python/api-directory
