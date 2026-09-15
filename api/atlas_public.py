"""Turnstile-protected browser facade for the existing private Atlas endpoint."""
from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.parse
import urllib.request
from api.atlas import dispatch as private_dispatch

MAX_BODY = 4096
SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def _allowed_origins():
    allowed = {"https://drugiq.vercel.app"}
    for name in ("VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
        value = os.getenv(name, "").strip().rstrip("/")
        if value:
            allowed.add(value if value.startswith("https://") else "https://" + value)
    allowed.update(v.strip().rstrip("/") for v in os.getenv("ATLAS_ALLOWED_ORIGINS", "").split(",") if v.strip())
    return allowed


def _verify_turnstile(token, remote_ip=""):
    secret = os.getenv("TURNSTILE_SECRET_KEY", "").strip()
    if not secret or not token:
        return False
    form = {"secret": secret, "response": token}
    if remote_ip:
        form["remoteip"] = remote_ip
    request = urllib.request.Request(
        SITEVERIFY_URL,
        data=urllib.parse.urlencode(form).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            result = json.loads(response.read(16384))
        return result.get("success") is True
    except Exception:
        return False


def dispatch(method, headers=None, raw=b"", verifier=_verify_turnstile):
    headers = {str(k).lower(): str(v) for k, v in (headers or {}).items()}
    response_headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
    }
    if method == "GET":
        status, payload, _ = private_dispatch("GET")
        payload = dict(payload)
        payload["turnstile_site_key"] = os.getenv("TURNSTILE_SITE_KEY", "").strip()
        payload["passwordless_browser_access"] = True
        payload["ready"] = bool(payload.get("ready") and payload["turnstile_site_key"] and os.getenv("TURNSTILE_SECRET_KEY", "").strip())
        return status, payload, response_headers
    if method != "POST":
        response_headers["Allow"] = "GET, POST"
        return 405, {"error": {"code": "method_not_allowed", "message": "Use GET or POST."}}, response_headers

    origin = headers.get("origin", "").strip().rstrip("/")
    if not origin or origin not in _allowed_origins():
        return 403, {"error": {"code": "origin_denied", "message": "This request must come from an approved DrugIQ origin."}}, response_headers
    if headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
        return 415, {"error": {"code": "content_type", "message": "Send application/json."}}, response_headers
    if len(raw) > MAX_BODY:
        return 413, {"error": {"code": "request_too_large", "message": "Submit one small research request."}}, response_headers
    try:
        data = json.loads(raw)
    except Exception:
        return 400, {"error": {"code": "invalid_json", "message": "The request must contain valid JSON."}}, response_headers
    if not isinstance(data, dict):
        return 400, {"error": {"code": "invalid_input", "message": "The request must be a JSON object."}}, response_headers

    token = data.pop("turnstile_token", "")
    if not isinstance(token, str) or len(token) > 4096:
        token = ""
    forwarded = headers.get("x-forwarded-for", "")
    remote_ip = forwarded.split(",")[0].strip() if forwarded else headers.get("x-real-ip", "").strip()
    if not verifier(token, remote_ip):
        return 403, {"error": {"code": "human_verification_failed", "message": "The browser verification could not be completed. Please retry."}}, response_headers

    research_token = os.getenv("DRUGIQ_RESEARCH_TOKEN", "").strip()
    if not research_token:
        return 503, {"error": {"code": "not_configured", "message": "The research service is not configured."}}, response_headers
    internal_headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + research_token,
        "Origin": origin,
    }
    return private_dispatch("POST", internal_headers, json.dumps(data).encode())


class handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
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
