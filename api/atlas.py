"""Private, opt-in Atlas discovery and single-SNV evidence. Never runs an LLM.

The original DrugIQ application and its research services are not imported here.
Uses Google's public AtlasClient with a deadline-limited official gRPC stub.
"""
from collections import deque
from contextlib import contextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
import hashlib
import hmac
import json
import math
import os
import re
import threading
import time

SDK_VERSION = "0.9.0"
MAX_BODY = 2048
MAX_CELLS = 100000
MAX_ROWS = 200
SCORER_NAME = re.compile(r"^[A-Za-z0-9_.:/ -]{1,160}$")
_lock = threading.Lock()
_requests = deque()


class Problem(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message
        super().__init__(message)


def configuration():
    enabled = os.getenv("ALPHAGENOME_ENABLED", "").lower() == "true"
    key = os.getenv("ALPHAGENOME_API_KEY", "").strip()
    token = os.getenv("DRUGIQ_RESEARCH_TOKEN", "").strip()
    return enabled, key, token


def validate_variant(data):
    allowed = {"action", "assembly", "chromosome", "position", "reference", "alternate", "scorer"}
    if set(data) - allowed:
        raise Problem(400, "invalid_input", "Unexpected fields. Submit only a public research variant, not patient information.")
    if data.get("assembly") != "GRCh38":
        raise Problem(400, "invalid_assembly", "Use GRCh38/hg38 coordinates. This tool does not convert genome builds.")
    chrom = str(data.get("chromosome", "")).strip()
    chrom = re.sub(r"^chr", "", chrom, flags=re.I).upper()
    if chrom not in [str(n) for n in range(1, 23)] + ["X", "Y"]:
        raise Problem(400, "invalid_chromosome", "Choose chromosome 1-22, X, or Y.")
    pos = data.get("position")
    if type(pos) is not int or not 1 <= pos <= 250000000:
        raise Problem(400, "invalid_position", "Position must be a positive, 1-based integer within the human reference genome.")
    ref, alt = data.get("reference", ""), data.get("alternate", "")
    if not isinstance(ref, str) or not isinstance(alt, str):
        raise Problem(400, "invalid_alleles", "Use one DNA letter (A, C, G, or T) for each allele.")
    ref, alt = ref.strip().upper(), alt.strip().upper()
    if ref not in ("A", "C", "G", "T") or alt not in ("A", "C", "G", "T") or ref == alt:
        raise Problem(400, "invalid_alleles", "Reference and alternate must be different single DNA letters: A, C, G, or T.")
    scorer = data.get("scorer")
    if not isinstance(scorer, str) or not SCORER_NAME.fullmatch(scorer):
        raise Problem(400, "invalid_scorer", "Connect to Atlas and choose one of its available scorers.")
    return {"assembly": "GRCh38", "chromosome": "chr" + chrom, "position": pos,
            "reference": ref, "alternate": alt, "scorer": scorer}


def finite(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError, OverflowError):
        return None


def metadata_record(record):
    """Only primitive, bounded source annotations; never serialize arbitrary objects."""
    result = {}
    for key, value in record.items():
        if str(key) == "variant":
            continue
        if hasattr(value, "item"):
            try:
                value = value.item()
            except (ValueError, TypeError):
                continue
        if isinstance(value, str):
            result[str(key)[:80]] = value[:300]
        elif isinstance(value, (bool, int)):
            result[str(key)[:80]] = value
        elif isinstance(value, float) and math.isfinite(value):
            result[str(key)[:80]] = value
        if len(result) >= 24:
            break
    return result


def summarize_scores(results, variant, scorer_info):
    """Preserve source axes and values; rank within ONE scorer, never across scorers."""
    name = variant["scorer"]
    matrix = results.get(name)
    if matrix is None:
        return {"status": "no_data", "rows": [], "message": "Atlas returned no data for this variant and scorer. This is not evidence of safety."}
    shape = tuple(matrix.shape)
    if len(shape) != 2 or any(type(int(n)) is not int or n < 0 for n in shape):
        raise Problem(502, "unexpected_response", "Atlas returned an unsupported score shape.")
    nobs, ntracks = int(shape[0]), int(shape[1])
    if nobs * ntracks > MAX_CELLS:
        raise Problem(422, "result_too_large", "This scorer returned too much data for the single-variant viewer. Choose a more focused scorer.")
    observations = matrix.obs.to_dict(orient="records")
    tracks = matrix.var.to_dict(orient="records")
    if len(observations) != nobs or len(tracks) != ntracks:
        raise Problem(502, "unexpected_response", "Atlas annotations do not match the score matrix.")
    for obs in observations:
        source = obs.get("variant")
        if source is None or (source.chromosome, source.position, source.reference_bases, source.alternate_bases) != (
            variant["chromosome"], variant["position"], variant["reference"], variant["alternate"]
        ):
            raise Problem(502, "variant_mismatch", "Atlas returned a different or unidentifiable variant; no scores were displayed.")
    quantiles = matrix.layers.get("quantiles")
    if quantiles is not None and tuple(quantiles.shape) != shape:
        raise Problem(502, "unexpected_response", "Atlas quantile dimensions do not match the raw scores.")
    rows = []
    for i in range(nobs):
        for j in range(ntracks):
            raw = finite(matrix.X[i, j])
            if raw is None:
                continue
            quantile = finite(quantiles[i, j]) if quantiles is not None else None
            if quantile is not None and not 0 <= quantile <= 1:
                quantile = None
            rows.append({"observation_index": i, "track_index": j, "raw_score": raw,
                         "quantile": quantile, "gene": metadata_record(observations[i]),
                         "track": metadata_record(tracks[j])})
    rows.sort(key=lambda row: abs(row["raw_score"]), reverse=True)
    total = len(rows)
    return {"status": "ok" if total else "no_data", "scorer": name,
            "is_signed": bool(scorer_info.is_signed), "shape": [nobs, ntracks],
            "finite_score_count": total, "omitted_nonfinite_count": nobs * ntracks - total,
            "returned_count": min(total, MAX_ROWS), "truncated": total > MAX_ROWS,
            "ordering": "Descending absolute raw score within the selected scorer only; not a pathogenicity ranking.",
            "rows": rows[:MAX_ROWS]}


@contextmanager
def official_client(key):
    # Lazy imports keep disabled/status routes healthy without contacting Google.
    import grpc
    from alphagenome.atlas import atlas
    from alphagenome.protos import atlas_service_pb2_grpc

    class DeadlineStub:
        def __init__(self, channel):
            self.stub = atlas_service_pb2_grpc.AtlasServiceStub(channel)
        def GetDenseVariantScores(self, request, metadata=None):
            return self.stub.GetDenseVariantScores(request, metadata=metadata, timeout=15)
        def ListVariantScoresMetadata(self, request, metadata=None):
            return self.stub.ListVariantScoresMetadata(request, metadata=metadata, timeout=10)

    # Address and metadata name follow Google's atlas.create implementation.
    options = (("grpc.max_receive_message_length", 8 * 1024 * 1024), ("grpc.enable_retries", 0))
    with grpc.secure_channel("gdmscience.googleapis.com:443", grpc.ssl_channel_credentials(), options=options) as channel:
        grpc.channel_ready_future(channel).result(timeout=5)
        yield atlas.AtlasClient(DeadlineStub(channel), metadata=[("x-goog-api-key", key)])


def make_variant(data):
    from alphagenome.data import genome
    return genome.Variant(chromosome=data["chromosome"], position=data["position"],
                          reference_bases=data["reference"], alternate_bases=data["alternate"])


def throttle():
    # Best-effort per-instance protection, NOT a distributed quota guarantee.
    with _lock:
        now = time.monotonic()
        while _requests and _requests[0] <= now - 60:
            _requests.popleft()
        if len(_requests) >= 10:
            raise Problem(429, "rate_limited", "Please wait a minute before making more Atlas requests.")
        _requests.append(now)


def upstream_problem(error):
    code = ""
    if callable(getattr(error, "code", None)):
        try:
            code = error.code().name
        except Exception:
            pass
    if isinstance(error, (TimeoutError,)) or type(error).__name__ == "FutureTimeoutError" or code == "DEADLINE_EXCEEDED":
        return Problem(504, "atlas_timeout", "Atlas did not respond in time. Please retry later.")
    if code == "RESOURCE_EXHAUSTED":
        return Problem(429, "atlas_quota", "The Atlas service quota is temporarily exhausted. Please retry later.")
    if isinstance(error, PermissionError) or code in ("UNAUTHENTICATED", "PERMISSION_DENIED"):
        return Problem(502, "atlas_access", "Google rejected the server's Atlas access. Check the server API key and account permissions.")
    if isinstance(error, (ValueError, IndexError)) or code in ("INVALID_ARGUMENT", "NOT_FOUND", "OUT_OF_RANGE"):
        return Problem(422, "atlas_variant_unavailable", "Atlas could not resolve this request. Check the GRCh38 position, reference allele, and scorer. No risk conclusion can be drawn.")
    if isinstance(error, ImportError):
        return Problem(503, "atlas_dependency", "The server's Atlas client is not available. The deployment needs review.")
    return Problem(502, "atlas_unavailable", "Atlas is temporarily unavailable. No prediction was generated.")


def dispatch(method, headers=None, raw=b"", client_factory=official_client, variant_factory=make_variant):
    headers = {str(k).lower(): str(v) for k, v in (headers or {}).items()}
    response_headers = {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
                        "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"}
    try:
        enabled, key, token = configuration()
        configured = bool(key) and 32 <= len(token) <= 512 and key.isascii() and not hmac.compare_digest(key.encode(), token.encode())
        if method == "GET":
            return 200, {"service": "DrugIQ Atlas", "enabled": enabled, "configured": configured,
                         "ready": enabled and configured, "requires_research_password": True,
                         "scope": "Personal non-commercial research; single GRCh38 substitutions only."}, response_headers
        if method != "POST":
            response_headers["Allow"] = "GET, POST"
            raise Problem(405, "method_not_allowed", "Use GET for status or POST for an authenticated query.")
        if not enabled:
            raise Problem(503, "feature_disabled", "The Atlas explorer is disabled. Your existing DrugIQ tools are unaffected.")
        if not configured:
            raise Problem(503, "not_configured", "The site owner must configure the server API key and a separate research password.")
        supplied = headers.get("authorization", "")
        if len(supplied) > 1024 or not hmac.compare_digest(hashlib.sha256(supplied.encode()).digest(), hashlib.sha256(("Bearer " + token).encode()).digest()):
            raise Problem(401, "unauthorized", "Enter your private DrugIQ research password, not your Google API key.")
        origin = headers.get("origin")
        allowed = {"https://drugiq.vercel.app"}
        for variable in ("VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
            if os.getenv(variable):
                allowed.add("https://" + os.environ[variable])
        allowed.update(v.strip() for v in os.getenv("ATLAS_ALLOWED_ORIGINS", "").split(",") if v.strip())
        if origin and origin not in allowed:
            raise Problem(403, "origin_denied", "This origin is not allowed to access the private Atlas endpoint.")
        if headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
            raise Problem(415, "content_type", "Send application/json.")
        if len(raw) > MAX_BODY:
            raise Problem(413, "request_too_large", "Submit one variant only. File uploads and batch queries are not supported.")
        try:
            data = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            raise Problem(400, "invalid_json", "The request must contain valid JSON.")
        if not isinstance(data, dict):
            raise Problem(400, "invalid_input", "The request must be a JSON object.")
        action = data.get("action")
        if action not in ("scorers", "query"):
            raise Problem(400, "invalid_action", "Choose scorers or query.")
        variant = validate_variant(data) if action == "query" else None
        if action == "scorers" and set(data) != {"action"}:
            raise Problem(400, "invalid_input", "The scorer request accepts no other fields.")
        throttle()
        try:
            with client_factory(key) as client:
                metadata = client.scorer_metadata()
                catalog = {name: item for name, item in metadata.items() if SCORER_NAME.fullmatch(name)}
                if not catalog:
                    raise Problem(502, "no_scorers", "Atlas did not return a supported scorer catalog.")
                if action == "scorers":
                    payload = {"status": "ok", "scorers": [{"name": name, "is_signed": bool(info.is_signed)}
                               for name, info in sorted(catalog.items())]}
                else:
                    if variant["scorer"] not in catalog:
                        raise Problem(400, "invalid_scorer", "The selected scorer is not present in the current Atlas catalog.")
                    results = client.query_variant(variant_factory(variant), requested_scorers=[variant["scorer"]])
                    payload = summarize_scores(results, variant, catalog[variant["scorer"]])
                    payload["input"] = variant
        except Problem:
            raise
        except Exception as error:
            raise upstream_problem(error) from None
        payload["provenance"] = {"provider": "Google DeepMind AlphaGenome Atlas", "client": "alphagenome",
            "client_version": SDK_VERSION, "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "documentation": "https://www.alphagenomedocs.com/api/atlas.html", "source_type": "retrieved_precomputed_predictions",
            "model_release": "Not supplied by this endpoint; SDK version is not the model version."}
        payload["limitations"] = ["Research predictions, not clinical advice or a diagnosis.",
            "Raw scores from different scorers must not be compared directly. Quantiles are not probabilities of disease.",
            "No result does not mean benign. AVI and AlphaMissense are not independent lines of evidence.",
            "This result does not alter DrugIQ Candidate Dossier scoring. No language model generated these scores."]
        return 200, payload, response_headers
    except Problem as error:
        if error.status == 429:
            response_headers["Retry-After"] = "60"
        return error.status, {"error": {"code": error.code, "message": error.message}}, response_headers


class handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        # Do not write variant requests, authorization headers, or provider errors to application logs.
        pass

    def _respond(self):
        raw = b""
        if self.command == "POST":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length < 0 or length > MAX_BODY or self.headers.get("Transfer-Encoding"):
                    raise ValueError()
                raw = self.rfile.read(length)
            except ValueError:
                self.send_response(413)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(b'{"error":{"code":"request_too_large","message":"Submit one small JSON request."}}')
                return
        status, payload, headers = dispatch(self.command, dict(self.headers), raw)
        body = json.dumps(payload, ensure_ascii=True, allow_nan=False).encode()
        self.send_response(status)
        for name, value in headers.items():
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    do_GET = do_POST = do_HEAD = do_OPTIONS = do_PUT = do_DELETE = _respond
