"""Exercise the actual AtlasClient request/response path against synthetic protos.

Run in both the complete SDK and the deployment runtime. No Google requests are
made. This tests the official codec, scorer catalog, metadata and handler output,
not only that imports succeed. Fixtures are deliberately labelled synthetic.
"""
from contextlib import contextmanager
import importlib.util
import json
import os
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
from alphagenome.atlas import atlas
from alphagenome.data import genome
from alphagenome.models import track_data_utils
from alphagenome.protos import atlas_service_pb2

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("handler_under_test", root / "api/atlas.py")
handler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handler)

variant = genome.Variant(chromosome="chr22", position=36201698,
                         reference_bases="A", alternate_bases="C")
tracks = track_data_utils.metadata_to_proto(pd.DataFrame({
    "name": ["SYNTHETIC_ZERO", "SYNTHETIC_NEGATIVE"],
    "strand": ["+", "-"],
    "biosample_name": ["SYNTHETIC_SAMPLE", "SYNTHETIC_SAMPLE"],
}))

catalog = atlas_service_pb2.ListVariantScoresMetadataResponse()
item = catalog.variant_scorer_metadata.add()
item.variant_scorer.name = "SYNTHETIC_TEST"
item.variant_scorer.is_signed = True
item.metadata.add().tracks.CopyFrom(tracks)

response = atlas_service_pb2.DenseVariantScores()
response.variant.CopyFrom(variant.to_proto())
score = response.scores.add()
score.variant_scorer.CopyFrom(item.variant_scorer)
score.shape.extend([1, 2])
score.scores = np.array([[0.0, -0.6]], dtype=np.float32).tobytes()
score.calibrated_scores = np.array([[0.0, 0.7]], dtype=np.float32).tobytes()
score.metadata.add().tracks.CopyFrom(tracks)


class Stub:
    def ListVariantScoresMetadata(self, request, metadata=None):
        assert request.organism
        return catalog

    def GetDenseVariantScores(self, request, metadata=None):
        assert request.variant == variant.to_proto()
        assert "SYNTHETIC_TEST" in request.filter
        return response


client = atlas.AtlasClient(Stub())
assert client.scorer_metadata()["SYNTHETIC_TEST"].is_signed
result = client.query_variant(variant, requested_scorers=["SYNTHETIC_TEST"])
assert result["SYNTHETIC_TEST"].shape == (1, 2)
assert result["SYNTHETIC_TEST"].var.iloc[0]["name"] == "SYNTHETIC_ZERO"


@contextmanager
def factory(_key):
    yield client


query = {"action": "query", "assembly": "GRCh38", "chromosome": "chr22",
         "position": 36201698, "reference": "A", "alternate": "C", "scorer": "SYNTHETIC_TEST"}
headers = {"Content-Type": "application/json", "Authorization": "Bearer " + "R" * 32}
with patch.dict(os.environ, {"ALPHAGENOME_ENABLED": "true",
                            "ALPHAGENOME_API_KEY": "synthetic-fixture-not-a-real-key",
                            "DRUGIQ_RESEARCH_TOKEN": "R" * 32}, clear=True):
    status, payload, response_headers = handler.dispatch(
        "POST", headers, json.dumps(query).encode(), client_factory=factory)
assert status == 200, payload
assert response_headers["Cache-Control"] == "no-store"
assert payload["returned_count"] == 2
assert payload["rows"][0]["raw_score"] < 0
assert payload["rows"][1]["raw_score"] == 0.0
assert payload["rows"][1]["quantile"] == 0.0
assert payload["rows"][1]["track"]["name"] == "SYNTHETIC_ZERO"
assert payload["provenance"]["client_version"] == "0.9.0"
json.dumps(payload, allow_nan=False)
print("Official AtlasClient catalog, query codec, annotations and HTTP handler passed with synthetic protos. NOT a live Google query.")
