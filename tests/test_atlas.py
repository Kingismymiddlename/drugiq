"""Offline contract/security tests. Fixtures are synthetic, not scientific evidence."""
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace as NS
import unittest
from contextlib import contextmanager
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('atlas_handler', Path(__file__).resolve().parents[1] / 'api/atlas.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
TOKEN = 'test-only-research-password-' + 'x' * 32
ENV = {'ALPHAGENOME_ENABLED': 'true', 'ALPHAGENOME_API_KEY': 'not-a-real-google-key', 'DRUGIQ_RESEARCH_TOKEN': TOKEN}
HEADERS = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN, 'Origin': 'https://drugiq.vercel.app'}
QUERY = {'action': 'query', 'assembly': 'GRCh38', 'chromosome': 'chr22', 'position': 36201698, 'reference': 'A', 'alternate': 'C', 'scorer': 'AVI'}


class Frame:
    def __init__(self, records): self.records = records
    def to_dict(self, orient): return self.records


class Array:
    def __init__(self, rows): self.rows, self.shape = rows, (len(rows), len(rows[0]) if rows else 0)
    def __getitem__(self, index): return self.rows[index[0]][index[1]]


def matrix(values=None, quantiles=None, variant=None):
    values = values if values is not None else [[0.0, -0.6, float('nan')]]
    variant = variant or NS(chromosome='chr22', position=36201698, reference_bases='A', alternate_bases='C')
    x = Array(values)
    return NS(shape=x.shape, X=x, obs=Frame([{'variant': variant, 'gene_name': '<script>TEST</script>'} for _ in values]),
              var=Frame([{'name': 'Synthetic track ' + str(i)} for i in range(x.shape[1])]),
              layers={'quantiles': Array(quantiles)} if quantiles is not None else {})


class Client:
    def __init__(self, results=None, error=None, metadata=None):
        self.results = results if results is not None else {'AVI': matrix()}
        self.error = error
        self.metadata = metadata if metadata is not None else {'AVI': NS(is_signed=False)}
        self.calls = []
    def scorer_metadata(self):
        if self.error: raise self.error
        return self.metadata
    def query_variant(self, variant, requested_scorers):
        self.calls.append((variant, requested_scorers)); return self.results


class AtlasTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, ENV, clear=True); self.env.start()
        module._requests.clear()
        self.client = Client()
    def tearDown(self): self.env.stop()
    def call(self, data=None, method='POST', headers=None, raw=None):
        @contextmanager
        def factory(key):
            self.assertEqual(key, ENV['ALPHAGENOME_API_KEY']); yield self.client
        return module.dispatch(method, HEADERS if headers is None else headers,
            raw if raw is not None else json.dumps(data if data is not None else QUERY).encode(),
            client_factory=factory, variant_factory=lambda v: v)
    def test_status_makes_no_provider_call(self):
        self.client.error = AssertionError('must not connect')
        status, payload, headers = self.call(method='GET')
        self.assertEqual(status, 200); self.assertTrue(payload['ready'])
        self.assertNotIn(TOKEN, json.dumps(payload)); self.assertEqual(headers['Cache-Control'], 'no-store')
    def test_disabled_by_default(self):
        os.environ.pop('ALPHAGENOME_ENABLED')
        self.assertEqual(self.call()[1]['error']['code'], 'feature_disabled')
    def test_configuration_gates(self):
        for values in [{'ALPHAGENOME_API_KEY': ''}, {'DRUGIQ_RESEARCH_TOKEN': ''}, {'DRUGIQ_RESEARCH_TOKEN': 'short'},
                       {'ALPHAGENOME_API_KEY': TOKEN}]:
            with self.subTest(values=values), patch.dict(os.environ, values):
                self.assertEqual(self.call()[1]['error']['code'], 'not_configured')
    def test_authentication_required(self):
        for auth in ['', 'Bearer wrong', 'Basic ' + TOKEN, 'Bearer ' + 'x' * 2000]:
            with self.subTest(auth=auth[:10]):
                status, payload, _ = self.call(headers={**HEADERS, 'Authorization': auth})
                self.assertEqual(status, 401); self.assertEqual(self.client.calls, [])
    def test_reject_foreign_origin(self):
        self.assertEqual(self.call(headers={**HEADERS, 'Origin': 'https://untrusted.example'})[0], 403)
    def test_allow_vercel_preview_origin(self):
        os.environ['VERCEL_URL'] = 'example-preview.vercel.app'
        self.assertEqual(self.call(headers={**HEADERS, 'Origin': 'https://example-preview.vercel.app'})[0], 200)
    def test_methods_and_content_type(self):
        for method in ['PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD']:
            with self.subTest(method=method):
                s, _, h = self.call(method=method); self.assertEqual(s, 405); self.assertEqual(h['Allow'], 'GET, POST')
        self.assertEqual(self.call(headers={**HEADERS, 'Content-Type': 'text/plain'})[0], 415)
    def test_invalid_json_and_size(self):
        for raw in [b'{', b'null', b'[]', b'"string"', b'\xff']:
            with self.subTest(raw=raw): self.assertEqual(self.call(raw=raw)[0], 400)
        self.assertEqual(self.call(raw=b'x' * 2049)[0], 413)
    def test_invalid_actions_and_extra_fields(self):
        for data in [{}, {'action': 'predict'}, {'action':'scorers', 'patient_name':'TEST'}, {**QUERY, 'patient_name':'TEST'}]:
            with self.subTest(data=data): self.assertEqual(self.call(data)[0], 400)
    def test_assembly_and_chromosome(self):
        for key, values in [('assembly', ['GRCh37', 'hg19', None]), ('chromosome', ['chrM', 'MT', '0', '23', '1;DROP'])]:
            for value in values:
                with self.subTest(key=key, value=value): self.assertEqual(self.call({**QUERY, key:value})[0], 400)
    def test_positions(self):
        for pos in [True, False, 0, -1, 3.4, '36201698', 250000001, None, float('nan')]:
            with self.subTest(pos=pos): self.assertEqual(self.call({**QUERY, 'position': pos})[0], 400)
    def test_alleles(self):
        for ref, alt in [('A','A'), ('AC','T'), ('N','A'), ('A',''), (1,'T'), ('A','<script>')]:
            with self.subTest(ref=ref, alt=alt): self.assertEqual(self.call({**QUERY, 'reference':ref, 'alternate':alt})[0],400)
    def test_normalization_is_not_liftover(self):
        v = module.validate_variant({**QUERY, 'chromosome':'22', 'reference':' a ', 'alternate':' c '})
        self.assertEqual(v['chromosome'],'chr22'); self.assertEqual(v['position'],36201698); self.assertEqual(v['reference'],'A')
    def test_scorer_catalog_is_live(self):
        status, data, _ = self.call({'action':'scorers'})
        self.assertEqual(status,200); self.assertEqual(data['scorers'],[{'name':'AVI','is_signed':False}])
    def test_unknown_scorer_blocked(self):
        self.assertEqual(self.call({**QUERY,'scorer':'ImaginaryModel'})[0],400); self.assertEqual(self.client.calls,[])
    def test_query_preserves_zero_sign_and_source(self):
        status, data, _ = self.call()
        self.assertEqual(status,200); self.assertEqual([r['raw_score'] for r in data['rows']],[-0.6,0.0])
        self.assertEqual(data['omitted_nonfinite_count'],1)
        self.assertEqual(self.client.calls[0][1],['AVI'])
        self.assertEqual(data['input']['position'],36201698)
        self.assertNotIn('risk_score',data)
        self.assertNotIn(ENV['ALPHAGENOME_API_KEY'],json.dumps(data))
    def test_no_data_not_benign(self):
        self.client.results = {}
        _, data, _ = self.call(); self.assertEqual(data['status'],'no_data'); self.assertEqual(data['rows'],[])
    def test_all_nan_no_data(self):
        self.client.results={'AVI':matrix([[float('nan')]])}
        self.assertEqual(self.call()[1]['status'],'no_data')
    def test_quantiles_are_optional_and_bounded(self):
        self.client.results={'AVI':matrix([[0.,.5,.1]],[[0.,.8,3.]])}
        data=self.call()[1]; self.assertEqual([r['quantile'] for r in data['rows']],[.8,None,0.])
    def test_variant_mismatch_blocks_scores(self):
        self.client.results={'AVI':matrix(variant=NS(chromosome='chr1',position=36201698,reference_bases='A',alternate_bases='C'))}
        self.assertEqual(self.call()[1]['error']['code'],'variant_mismatch')
    def test_missing_variant_blocks_scores(self):
        m=matrix(); m.obs=Frame([{}]); self.client.results={'AVI':m}
        self.assertEqual(self.call()[0],502)
    def test_dimension_mismatch(self):
        m=matrix(); m.var=Frame([]); self.client.results={'AVI':m}; self.assertEqual(self.call()[0],502)
    def test_quantile_dimension_mismatch(self):
        m=matrix(); m.layers={'quantiles':Array([[0.]])}; self.client.results={'AVI':m}; self.assertEqual(self.call()[0],502)
    def test_truncation_is_explicit(self):
        self.client.results={'AVI':matrix([list(range(250))])}
        data=self.call()[1]; self.assertTrue(data['truncated']); self.assertEqual(len(data['rows']),200); self.assertEqual(data['finite_score_count'],250)
    def test_oversize_response(self):
        m=matrix(); m.shape=(100001,1); self.client.results={'AVI':m}; self.assertEqual(self.call()[0],422)
    def test_timeout_and_permission_errors_are_redacted(self):
        for error, expected in [(TimeoutError(TOKEN),504),(PermissionError(TOKEN),502),(ValueError(TOKEN),422),(ImportError(TOKEN),503),(RuntimeError(TOKEN),502)]:
            with self.subTest(error=type(error).__name__):
                self.client.error=error; status,data,_=self.call(); self.assertEqual(status,expected); self.assertNotIn(TOKEN,json.dumps(data))
    def test_rpc_quota(self):
        class RpcError(Exception):
            def code(self): return NS(name='RESOURCE_EXHAUSTED')
        self.client.error=RpcError(); status,data,headers=self.call(); self.assertEqual(status,429); self.assertEqual(headers['Retry-After'],'60')
    def test_throttle_before_upstream(self):
        for _ in range(10): self.assertEqual(self.call({'action':'scorers'})[0],200)
        self.assertEqual(self.call({'action':'scorers'})[0],429)
    def test_catalog_failure(self):
        self.client.metadata={}; self.assertEqual(self.call({'action':'scorers'})[0],502)
    def test_json_is_finite(self):
        _,data,_=self.call(); json.dumps(data,allow_nan=False)


if __name__ == '__main__': unittest.main(verbosity=2)
