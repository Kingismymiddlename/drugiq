"""Installed official SDK contract check. No Google credentials or network calls."""
import importlib.util
import importlib.metadata
import json
from pathlib import Path
from types import SimpleNamespace
import numpy as np
import pandas as pd
import anndata
from alphagenome.atlas import atlas
from alphagenome.data import genome
from alphagenome.protos import atlas_service_pb2_grpc

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('handler_under_test', root/'api/atlas.py')
handler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handler)
assert importlib.metadata.version('alphagenome') == handler.SDK_VERSION
assert callable(atlas.AtlasClient.query_variant)
assert callable(atlas.AtlasClient.scorer_metadata)
assert callable(atlas_service_pb2_grpc.AtlasServiceStub)
variant = genome.Variant(chromosome='chr22', position=36201698, reference_bases='A', alternate_bases='C')
matrix = anndata.AnnData(X=np.array([[0.0, -0.6]], dtype=np.float32),
    obs=pd.DataFrame({'variant':[variant],'gene_name':['SYNTHETIC_TEST']},index=['0']),
    var=pd.DataFrame({'name':['TEST_TRACK_1','TEST_TRACK_2']},index=['0','1']),
    layers={'quantiles':np.array([[0.0,0.7]],dtype=np.float32)})
query={'assembly':'GRCh38','chromosome':'chr22','position':36201698,'reference':'A','alternate':'C','scorer':'TEST'}
result=handler.summarize_scores({'TEST':matrix},query,SimpleNamespace(is_signed=True))
assert result['status']=='ok' and len(result['rows'])==2
assert result['rows'][1]['raw_score']==0.0
assert result['rows'][0]['raw_score']<0
assert result['rows'][1]['quantile']==0.0
json.dumps(result,allow_nan=False)
print('Official SDK 0.9.0 imports and real AnnData/Variant contract passed. This is NOT a live Google query.')
