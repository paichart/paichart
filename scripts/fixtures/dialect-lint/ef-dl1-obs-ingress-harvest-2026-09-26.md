## State Summary

**Scope harvested:** Read-only self-provision + harvest of the OTLP sender-enforcement surface fronting the otel-collector, for both listeners named in the task (4317/gRPC, 4318/HTTP), per the observability-config protocol Phase 0. Stack health: `prometheus: up, grafana: up, otel_collector: up`. **No gaps** — both listeners' server blocks were positively identified. Registration (`observability-readonly`, serviceId `<serviceId redacted>`) left ACTIVE — teardown is the harness's job at SYNTHESIZE, not mine.

### Enforcement-point determination

| Listener | Enforcement point | Evidence |
|---|---|---|
| 4317 / OTLP-gRPC | **Ingress layer** (nginx `server{ listen 4317; }` in `otlp-ingress.conf`), proxying via `grpc_pass grpc://172.31.114.10:4317` | Collector's own `receivers.otlp.protocols.grpc.endpoint` is bound to `172.31.114.10:4317` — a private-network address with **no allow/deny or source-IP construct anywhere in the OTel config schema**. The collector cannot enforce sender identity; nginx is the only gate. |
| 4318 / OTLP-HTTP | **Ingress layer** (nginx `server{ listen 4318; }` in `otlp-ingress.conf`), proxying via `proxy_pass http://172.31.114.10:4318` | Same collector receiver (`receivers.otlp.protocols.http.endpoint: 172.31.114.10:4318`) — same absence of source-address control. |

### Witnessed rendering — `otlp-ingress.conf` (verbatim, from `get_ingress_config`, file mount as-deployed)

```
# OTLP ingress allowlist — the lab's enforcement point for "which senders may export telemetry".
# Fronts BOTH OTLP receivers: gRPC (4317) and HTTP (4318). The collector accepts OTLP only on a
# private network shared with this proxy, so these two server blocks are the only way in.
# nginx evaluates allow/deny IN ORDER, first match wins. Read-only to the harvest service
# (obs-mcp get_ingress_config); changed only by an operator applying an approved change package,
# then `docker exec obs-ingress nginx -s reload`.
#
# BASELINE (brownfield): no sender restriction yet — `allow all` on both. Authorising a specific
# sender set means inserting its allow lines ABOVE `allow all` and replacing `allow all` with
# `deny all`, in BOTH server blocks.

# OTLP/gRPC
server {
    listen 4317;
    http2 on;

    location / {
        allow all;

        grpc_pass grpc://172.31.114.10:4317;
    }
}

# OTLP/http
server {
    listen 4318;
    client_max_body_size 16m;          # OTLP batches; nginx's 1m default would 413 real exporters

    location / {
        allow all;

        proxy_pass http://172.31.114.10:4318;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

**Current allow/deny sequence, per listener:**
- **4317 (gRPC):** single directive `allow all;` — **no `deny` present**. Any source may export.
- **4318 (HTTP):** single directive `allow all;` — **no `deny` present**. Any source may export.

Both blocks are structurally identical in their `location /` allow/deny posture (only the proxy mechanism differs: `grpc_pass` vs `proxy_pass`).

### Witnessed rendering — collector receiver binding (verbatim excerpt, from `get_otel_config`, as-deployed file — the collector exposes no config API)

```yaml
receivers:
  otlp:
    protocols:
      # Bound to the PRIVATE otlp network only — reachable solely through obs-ingress (docker-compose.yml).
      grpc: { endpoint: 172.31.114.10:4317 }
      http: { endpoint: 172.31.114.10:4318 }
```
No `tls`, no source-restriction field, no access-control processor upstream of `[memory_limiter, batch]` in the metrics pipeline. Confirms: the collector bind carries no enforcement capability of its own — nginx is the sole and correct enforcement point, consistent with the descriptor's own claim ("the collector itself has no source-address control").

### Out-of-scope file noted (not part of the sender allowlist)

`operator-access.conf` (nginx `listen 14318`, `allow 172.20.0.1; deny all;` fronting the HTTP receiver only) is explicitly labelled in the source as rig-operator plumbing for demo telemetry injection, reachable only from the lab-operator host on the pinned default docker network — **not** the sender-enforcement surface this task targets. Flagged here for the Architect so it is not mistaken for an existing allow/deny precedent on port 4318; it should not be touched by a sender-authorisation change.

### Gap check
Both listeners' server blocks were positively located and quoted in full — **no gap** to report on listener identification. The one open item for downstream legs is standard pipeline plumbing, not a harvest gap: the `<FABRIC_CIDR>` placeholder in the Program Interface Contract resolves to `crossingValue.fabricExporterCidr`, delivered via chained §6 context from the fabric leg — this Harvester has no visibility into that value and does not need it to complete a read-only harvest.

*Synthesis for the Architect: baseline is brownfield-open (`allow all;`, no deny) identically on both OTLP listeners, enforced entirely at the nginx ingress layer in `otlp-ingress.conf`; the collector's own bind is on a private network with zero access-control capability. The Architect's insertion per the interface contract's `platformDialect` (allow `<FABRIC_CIDR>` above the existing `allow all`, then replace `allow all` with `deny all`, terminated in both server blocks) has a clean, unambiguous target: exactly the two `location /` blocks quoted above, in the single file `otlp-ingress.conf`. Do not touch `operator-access.conf`.*

Confidence: 95 — Fully verified from tool outputs (both listener blocks harvested and quoted verbatim, collector's lack of source-address control confirmed directly from its own config), no unresolved assumptions; the only residual dependency (fabric CIDR value) is out of this task's scope by design.