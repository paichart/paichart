"""Read-only observability MCP service — Phase-4 promstack validation rig.

Exposes a DELIBERATELY read-only surface over a live Prometheus + Grafana + otel-collector stack,
following the tf-mcp-readonly / nornir-mcp family contract:
  - R1 verb-enum: ONLY the read tools below exist. No reload/apply/write/admin/delete — those
        tools DO NOT EXIST here (not "denied at runtime"). Prometheus's lifecycle/reload endpoint
        is never proxied; Grafana access is GET-only in code.
  - ARG-CONFINEMENT: `uid` and `query` are validated/capped server-side; no caller-supplied
        URLs/paths ever reach an HTTP client (config file path is fixed at build time).
  - SECRET BACKSTOP: Grafana datasource payloads are deep-redacted by key (secureJsonFields and
        anything password/token/secret-shaped). Prometheus config is served as the API returns it —
        the RIG baseline carries no credentials; a real deployment's remote_write auth would be
        the platform R10 backstop's job (documented in the DEMO-RUN-GUIDE secret-hygiene note).
  - DENIAL CHANNEL (§7.5): out-of-policy requests return an MCP isError:true tool result (via
        ToolError), NOT a thrown/transport error — a confined harvest stays success:true and the
        harness does not self-degrade.
  - LEAN BY DESIGN: list-shaped results carry selected fields, not raw API dumps — the 8KB Tier-1
        window binds harvest strategy (harvest-truncation-safety.md); narrow beats paginated.

NOT JWKS-conformant (R2a): rig identity is static/absent — same honest caveat as the cEOS/tf rigs.
Validates the COGNITION pipeline + read-only enforcement, not the identity contract.

Transport: streamable-http on 3107 (container-internal). Host maps 127.0.0.1:3114 → 3107.
"""
import os
import re

import httpx
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

PROMETHEUS_URL = os.environ.get("PROMETHEUS_URL", "http://prometheus:9090")
GRAFANA_URL = os.environ.get("GRAFANA_URL", "http://grafana:3000")
OTELCOL_HEALTH_URL = os.environ.get("OTELCOL_HEALTH_URL", "http://otel-collector:13133")
GRAFANA_AUTH = (os.environ.get("GRAFANA_USER", "admin"), os.environ.get("GRAFANA_PASSWORD", "admin"))
OTEL_CONFIG_PATH = "/rig/otelcol/config.yaml"  # fixed at build; never caller-supplied

UID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
MAX_QUERY_LEN = 512
SECRET_KEYISH = re.compile(
    r"(password|passwd|secret|token|private_key|access_key|client_secret|credential|secureJson)", re.I
)
PLACEHOLDER = "<<REDACTED-SENSITIVE>>"


# TWIN SUPPRESSION (r10-serialized-leaf-blindness follow-up, 2026-08-31): FastMCP duplicates every
# structured tool result into a serialized content[0].text block (~30% of payload, most Tier-1
# truncations). Suppress at the producer from day one; structuredContent keeps the full payload.
def _stub_serializer(data) -> str:
    return "(full payload in structuredContent; serialized text twin suppressed)"


mcp = FastMCP("observability-readonly", tool_serializer=_stub_serializer)


def _get(url: str, auth=None, timeout: float = 10.0):
    try:
        r = httpx.get(url, auth=auth, timeout=timeout)
    except httpx.HTTPError as e:
        raise ToolError(f"upstream unreachable: {e.__class__.__name__}: {e}") from e
    if r.status_code != 200:
        raise ToolError(f"upstream returned HTTP {r.status_code} for {url.split('?')[0]}")
    return r


def _redact(obj):
    """Deep key-based redaction backstop for payloads that can carry credentials (Grafana)."""
    if isinstance(obj, dict):
        return {
            k: (PLACEHOLDER if SECRET_KEYISH.search(k) else _redact(v)) for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_redact(x) for x in obj]
    return obj


@mcp.tool()
def stack_health() -> dict:
    """Liveness of all three stack components (read-only)."""
    out = {}
    for name, url in (
        ("prometheus", f"{PROMETHEUS_URL}/-/ready"),
        ("grafana", f"{GRAFANA_URL}/api/health"),
        ("otel_collector", OTELCOL_HEALTH_URL),
    ):
        try:
            _get(url, auth=GRAFANA_AUTH if name == "grafana" else None, timeout=5.0)
            out[name] = "up"
        except ToolError as e:
            out[name] = f"DOWN ({e})"
    return {"stack": out}


@mcp.tool()
def get_prometheus_config() -> dict:
    """The RUNNING Prometheus configuration, exactly as the server reports it
    (/api/v1/status/config — witnessed rendering, quote from this, never reconstruct), plus the
    config FILE PATH witnessed from /api/v1/status/flags (--config.file) — closes R1b Gap G1
    (the rendering alone never named its file)."""
    data = _get(f"{PROMETHEUS_URL}/api/v1/status/config").json()
    flags = _get(f"{PROMETHEUS_URL}/api/v1/status/flags").json().get("data", {})
    return {
        "yaml": data.get("data", {}).get("yaml", ""),
        "configFile": flags.get("config.file"),
        "configFileSource": "/api/v1/status/flags --config.file (witnessed)",
    }


@mcp.tool()
def get_scrape_targets() -> dict:
    """Active scrape targets: job, instance, health, lastError (lean fields, not the raw dump)."""
    data = _get(f"{PROMETHEUS_URL}/api/v1/targets").json().get("data", {})
    targets = [
        {
            "job": t.get("labels", {}).get("job"),
            "instance": t.get("labels", {}).get("instance"),
            "health": t.get("health"),
            "scrapeUrl": t.get("scrapeUrl"),
            "lastError": t.get("lastError") or None,
        }
        for t in data.get("activeTargets", [])
    ]
    return {"activeTargets": targets, "droppedTargetCount": len(data.get("droppedTargets", []))}


@mcp.tool()
def get_rules() -> dict:
    """Loaded recording/alerting rule groups (name, type, expr/query, state)."""
    data = _get(f"{PROMETHEUS_URL}/api/v1/rules").json().get("data", {})
    groups = [
        {
            "group": g.get("name"),
            "file": g.get("file"),
            "rules": [
                {
                    "name": r.get("name"),
                    "type": r.get("type"),
                    "query": r.get("query"),
                    "state": r.get("state"),
                }
                for r in g.get("rules", [])
            ],
        }
        for g in data.get("groups", [])
    ]
    return {"groups": groups}


@mcp.tool()
def query_metric(query: str) -> dict:
    """Instant PromQL query (read-only evaluation). Confined: <=512 chars."""
    if not query or len(query) > MAX_QUERY_LEN:
        raise ToolError(f"query must be 1..{MAX_QUERY_LEN} characters")
    try:
        r = httpx.get(f"{PROMETHEUS_URL}/api/v1/query", params={"query": query}, timeout=15.0)
    except httpx.HTTPError as e:
        raise ToolError(f"upstream unreachable: {e.__class__.__name__}: {e}") from e
    if r.status_code != 200:
        raise ToolError(f"query rejected: HTTP {r.status_code}: {r.text[:200]}")
    body = r.json()
    result = body.get("data", {}).get("result", [])
    return {"resultType": body.get("data", {}).get("resultType"), "result": result[:50],
            "truncatedTo50": len(result) > 50}


@mcp.tool()
def get_grafana_datasources() -> dict:
    """Provisioned Grafana datasources (credentials deep-redacted by key)."""
    data = _get(f"{GRAFANA_URL}/api/datasources", auth=GRAFANA_AUTH).json()
    return {"datasources": _redact(data)}


@mcp.tool()
def list_grafana_dashboards() -> dict:
    """Dashboard inventory (uid, title, folder)."""
    data = _get(f"{GRAFANA_URL}/api/search?type=dash-db", auth=GRAFANA_AUTH).json()
    return {"dashboards": [
        {"uid": d.get("uid"), "title": d.get("title"), "folder": d.get("folderTitle") or "General"}
        for d in data
    ]}


@mcp.tool()
def get_grafana_dashboard(uid: str) -> dict:
    """One dashboard's full JSON model by uid (the as-provisioned artifact — quote, don't rebuild)."""
    if not UID_RE.match(uid or ""):
        raise ToolError("uid must match ^[A-Za-z0-9_-]{1,64}$")
    data = _get(f"{GRAFANA_URL}/api/dashboards/uid/{uid}", auth=GRAFANA_AUTH).json()
    return {"dashboard": _redact(data.get("dashboard", {})),
            "meta": {"provisioned": data.get("meta", {}).get("provisioned")}}


@mcp.tool()
def get_otel_config() -> dict:
    """The otel-collector config AS DEPLOYED (file mounted read-only; the collector has no config
    API). This is the witnessed artifact for collector-change packages."""
    try:
        with open(OTEL_CONFIG_PATH, "r", encoding="utf-8") as f:
            return {"yaml": f.read(), "source": "as-deployed file (ro mount)"}
    except OSError as e:
        raise ToolError(f"otel config unreadable: {e}") from e


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=3107)
