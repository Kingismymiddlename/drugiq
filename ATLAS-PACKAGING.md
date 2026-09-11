# Atlas deployment packaging

## Why the first preview failed

The owner supplied Vercel build output for commit 7271532. The function bundle
was 1067.13 MB, over the reported 500 MB maximum. This was a packaging failure,
not an invalid Google API key or an error in the existing homepage. The output
also showed a frontend installation under Python 3.14 and a separate Python
3.12 function installation. Their individual contribution to the final bundle
was not measured by that log.

## What changed

`pyproject.toml` is now the single deployment dependency manifest. It pins the
Python runtime to 3.12 and retains Google's unmodified AlphaGenome 0.9.0 SDK.
The documented uv `exclude-dependencies` setting leaves out matplotlib,
seaborn and pyarrow. Those support SDK plotting and columnar-file workflows,
not the two AtlasClient methods this application calls. Core numeric, metadata,
protobuf and gRPC libraries remain installed. This is an Atlas-specific runtime,
not a complete environment for running every AlphaGenome example or notebook.

The original full SDK requirements are preserved as `requirements-full-sdk.txt`
for an independent comparison job. Do not rename that file to requirements.txt:
it would reintroduce a conflicting deployment manifest and the full stack.
Do not use `pip install .` for the reduced runtime: dependency exclusions are a
uv feature. Use `uv sync --no-dev` and `uv run --no-sync python ...` instead.

The frontend install step no longer installs Python dependencies. Vercel's
Python builder still installs the API requirements. The source exclusion list
also keeps local environments and build caches out of the function source.
No API handler, original page, tool behavior, security gate or scientific score
calculation is changed by this packaging correction.

## Verification gates

The workflow tests both the complete SDK and the deployment dependency set.
Synthetic protocol messages exercise the real AtlasClient scorer catalog,
query response conversion, signed/zero values, track annotations and the API
handler. No Google key or real genomic query is used in those checks.

`scripts/check-runtime-size.py` fails if excluded packages return or installed
dependencies exceed a conservative 450,000,000-byte budget. It includes compiled
caches. This is NOT the actual Vercel function size: Vercel adds its runtime and
may bundle files differently. The real Preview build remains a separate gate.

The generated lockfile and dependency-size report are retained as workflow
artifacts for inspection. Most core libraries are pinned; remaining transitive
dependencies are resolved by uv, so rerun the budget and contract checks after
any update. A future fully committed uv.lock should be reviewed deliberately.

Keep PR #1 a draft. After the preview builds, configure the three Preview-only
variables in ALPHAGENOME-SETUP.md and verify a real catalog and public-example
query. Do not merge, change production settings, expose credentials, or treat
synthetic test output as scientific evidence.

## References

- https://vercel.com/docs/functions/runtimes/python
- https://vercel.com/changelog/python-3-13-and-3-14-are-now-available
- https://docs.astral.sh/uv/reference/settings/#exclude-dependencies
- https://github.com/google-deepmind/alphagenome
