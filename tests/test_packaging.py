"""Packaging safeguards: no service calls, credentials or external dependencies."""
import hashlib
import json
from pathlib import Path
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PackagingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.project = tomllib.loads((ROOT / "pyproject.toml").read_text())
        cls.vercel = json.loads((ROOT / "vercel.json").read_text())

    def test_python_build_and_runtime_are_aligned(self):
        self.assertEqual(self.project["project"]["requires-python"], "~=3.12.0")
        self.assertEqual((ROOT / ".python-version").read_text().strip(), "3.12")

    def test_sdk_is_pinned_and_not_replaced(self):
        self.assertIn("alphagenome==0.9.0", self.project["project"]["dependencies"])
        self.assertFalse(self.project["tool"]["uv"]["package"])

    def test_only_reviewed_non_atlas_dependencies_are_excluded(self):
        self.assertEqual(set(self.project["tool"]["uv"]["exclude-dependencies"]),
                         {"matplotlib", "seaborn", "pyarrow"})

    def test_one_unambiguous_deployment_manifest(self):
        self.assertFalse((ROOT / "requirements.txt").exists())
        self.assertIn("alphagenome==0.9.0", (ROOT / "requirements-full-sdk.txt").read_text())

    def test_static_install_does_not_install_a_second_python_environment(self):
        self.assertEqual(self.vercel["installCommand"],
                         "node -e \"console.log('Static frontend needs no dependency install; Vercel builds the API functions separately.')\"")
        self.assertEqual(self.vercel["buildCommand"], "node scripts/build-variant.mjs")
        self.assertEqual(self.vercel["outputDirectory"], "atlas-public")

    def test_heavy_python_function_keeps_exclusions_and_facade_is_lightweight(self):
        functions = self.vercel["functions"]
        self.assertEqual(set(functions), {"api/atlas.py", "api/atlas-public.js"})
        excludes = functions["api/atlas.py"]["excludeFiles"]
        for path in (".venv/**", "venv/**", ".uv/**", ".cache/**", "tests/**", "reports/**"):
            self.assertIn(path, excludes)
        self.assertNotIn("excludeFiles", functions["api/atlas-public.js"])
        self.assertTrue((ROOT / "api" / "atlas-public.js").exists())
        self.assertFalse((ROOT / "api" / "atlas_public.py").exists())

    def test_only_reviewed_passwordless_route_alias_is_added(self):
        self.assertEqual(self.vercel.get("rewrites"), [
            {"source": "/api/atlas_public", "destination": "/api/atlas-public"}
        ])
        for key in ("routes", "redirects", "env", "build"):
            self.assertNotIn(key, self.vercel)

    def test_existing_homepage_still_matches_original_blob(self):
        source = (ROOT / "index.html").read_bytes()
        actual = hashlib.sha1(f"blob {len(source)}\0".encode() + source).hexdigest()
        self.assertEqual(actual, "1536acdb34a12aa949636096af37391a9a3ee3ab")


if __name__ == "__main__":
    unittest.main()
