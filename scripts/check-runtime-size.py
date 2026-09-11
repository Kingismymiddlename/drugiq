"""Fail CI on unexpected Atlas dependencies or an oversized Python runtime.

Measures installed files (including compiled caches) with a conservative 450 MB
budget. This is a dependency budget, NOT a measurement of a Vercel deployment.
The real Vercel Preview must also build and pass live checks before release.
"""
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import site
import sys

BUDGET_BYTES = 450_000_000
EXCLUDED = ("matplotlib", "seaborn", "pyarrow")


def inspect_runtime():
    roots = [Path(p).resolve() for p in site.getsitepackages()]
    prefix = Path(sys.prefix).resolve()
    if sys.prefix == sys.base_prefix or any(not p.is_relative_to(prefix) for p in roots):
        raise RuntimeError("Run with uv run --no-sync python in the isolated deployment environment.")
    unexpected = [name for name in EXCLUDED if importlib.util.find_spec(name) is not None]
    if unexpected:
        raise RuntimeError("Excluded non-Atlas libraries were installed: " + ", ".join(unexpected))
    seen = set()
    sizes = {}
    for root in roots:
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            resolved = path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            key = path.relative_to(root).parts[0]
            sizes[key] = sizes.get(key, 0) + path.stat().st_size
    total = sum(sizes.values())
    return {
        "scope": "Installed deployment dependencies; actual Vercel bundle not measured here",
        "python": sys.version.split()[0],
        "total_bytes": total,
        "budget_bytes": BUDGET_BYTES,
        "passes": total < BUDGET_BYTES,
        "excluded_libraries_absent": list(EXCLUDED),
        "largest_directories": dict(sorted(sizes.items(), key=lambda item: item[1], reverse=True)[:15]),
        "versions": {d.metadata["Name"]: d.version for d in importlib.metadata.distributions()},
    }


if __name__ == "__main__":
    report = inspect_runtime()
    out = Path("reports")
    out.mkdir(exist_ok=True)
    (out / "runtime-size.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    if not report["passes"]:
        raise SystemExit("Atlas runtime exceeds the conservative 450 MB dependency budget. Do not merge.")
