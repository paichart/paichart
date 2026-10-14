## Change Package: OTLP Ingress Sender Restriction — `observability-config` leg

### 1. Branch Condition Outcome (carried from Phase 1 Architect — not re-derived here)

| Row | Condition | Answer | Evidence | Outcome applied |
|---|---|---|---|---|
| `target-absent` | declared OTLP ingress doesn't exist | NOT CONFIRMED | `get_ingress_config` returned `otlp-ingress.conf` with active `server{}` blocks on both ports | n/a |
| `target-empty`/`enforcer-absent` | declared ports carry no config at all | NOT CONFIRMED | Both 4317/4318 have full `server{}`/`location{}` blocks | n/a |
| `existing-grant` | existing sender configuration found on those ports | **CONFIRMED** (`allow all;` on both) | Harvest-verbatim file, header comment: *"BASELINE (brownfield): no sender restriction yet — `allow all` on both."* | **REPLACE** — exporter range `10.99.0.0/27` becomes the sole permitted sender on 4317/4318; `operator-access.conf` (14318) untouched |
| `principal-unseen` | ingress must see true unmodified source address | **UNTESTED** | Harvest's read-only surface cannot confirm absence of NAT/LB rewrite upstream of this nginx | Author regardless — recorded below as an UNTESTED premise, not resolved |

### 2. UNTESTED Premises

- **Source-address fidelity on the path to this nginx listener is UNTESTED.** `allow 10.99.0.0/27` is only effective if `$remote_addr`, as evaluated by this nginx, is genuinely the exporter's unmodified source address. Neither the Phase 0 harvest nor this package can confirm the absence of NAT/SNAT/LB rewriting upstream of `obs-ingress`. This remains open for the Reviewer/operator to close out of-band (e.g. packet capture or known-topology confirmation) before relying on this control as a hard security boundary.

### 3. Baseline Evidence (restated from Phase 0 harvest entry — quoted at point of use, source named)

Source: `### Previous Task: Harvest current observability state for exporter-range sender restriction`, witnessed via `get_ingress_config` (as-deployed file mount — the file IS the artifact):

- Declared OTLP ingress exists, fronting both receivers via nginx `server{}` blocks.
- Port 4317 (gRPC): `location /` contains `allow all;` then `grpc_pass grpc://172.31.114.10:4317;`.
- Port 4318 (HTTP): `location /` contains `allow all;` then `proxy_pass http://172.31.114.10:4318;` plus `proxy_http_version 1.1;`, two `proxy_set_header` lines, and `client_max_body_size 16m;`.
- Separate file `operator-access.conf`, port **14318**, `allow 172.20.0.1;` (pinned Docker gateway) — unrelated lab-plumbing listener, **out of scope**, not touched by this change.
- Collector (`get_otel_config`, verbatim): OTLP receivers bound to `172.31.114.10:4317`/`4318` on a private network behind this nginx; collector has **no source-IP filtering capability** — confirms this nginx is the sole enforcement surface.
- Prometheus running config (`get_prometheus_config`, verbatim): 5 scrape jobs, none referencing 4317/4318 directly — Prometheus is outside the sender-restriction path; **no change to Prometheus**.
- All 5 scrape targets reported `health: "up"`, `lastError: null` at harvest time; stack (`prometheus`/`grafana`/`otel_collector`) reported fully live.

### 4. Desired-State Configuration File — `otlp-ingress.conf` (MODIFIED, full file)

```nginx
# OTLP ingress allowlist — the lab's enforcement point for "which senders may export telemetry".
# Fronts BOTH OTLP receivers: gRPC (4317) and HTTP (4318). The collector accepts OTLP only on a
# private network shared with this proxy, so these two server blocks are the only way in.
# nginx evaluates allow/deny IN ORDER, first match wins. Read-only to the harvest service
# (obs-mcp get_ingress_config); changed only by an operator applying an approved change package,
# then `docker exec obs-ingress nginx -s reload`.
#
# RESTRICTED (post-change): sender access scoped to the exporter range 10.99.0.0/27 on both
# OTLP ports. Chained verbatim from the fabric leg's P1 CIDR derivation — not recomputed here.
# All other sources are denied via the trailing `deny all;` on each block.

# OTLP/gRPC
server {
    listen 4317;
    http2 on;

    location / {
        allow 10.99.0.0/27;
        deny all;

        grpc_pass grpc://172.31.114.10:4317;
    }
}

# OTLP/http
server {
    listen 4318;
    client_max_body_size 16m;          # OTLP batches; nginx's 1m default would 413 real exporters

    location / {
        allow 10.99.0.0/27;
        deny all;

        proxy_pass http://172.31.114.10:4318;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

**`operator-access.conf` (port 14318) — NOT modified**, carried unchanged:
```nginx
server {
    listen 14318;
    location / {
        allow 172.20.0.1;
        deny all;
        # (demo-inject proxy_pass omitted — unrelated surface, out of scope, not quoted further here)
    }
}
```
*(Shown only to confirm no edit is proposed; the authoritative content for this file remains whatever the harvest witnessed — this package does not touch it.)*

### 5. Collateral Effect (explicit)

- **Senders outside `10.99.0.0/27` lose access** to TCP 4317 and TCP 4318 on this ingress immediately upon reload — this is the change's intended effect.
- **Senders inside `10.99.0.0/27` are functionally unaffected** — identical `grpc_pass`/`proxy_pass` targets, identical `client_max_body_size`.
- **Other listeners are untouched**: `operator-access.conf` (14318) keeps its existing `allow 172.20.0.1;` rule; the collector and Prometheus configs are not modified.

### 6. Validation (deterministic facts; operator-run pre-apply / post-apply)

**V1 — Pre-apply syntax check** (generic nginx validator; config file path on the `obs-ingress` host is not witnessed by this harvest, so the literal is narrowed to the exit-code projection rather than the path-bearing message text):
```
docker exec obs-ingress nginx -t; echo "EXIT:$?"
```
**Expected output:**
```
EXIT:0
```

**V2 — Post-apply config-application confirmation** (re-invoke the same witnessed read tool the Phase 0 Harvester used — `get_ingress_config` is a verbatim as-deployed file-mount read per the taxonomy, so its output, after a correct apply, equals this package's authored file exactly):
```
services(action:'call', targetService:'observability-readonly', tool:'get_ingress_config', arguments:{})
```
**Expected output (static fields; file content for `otlp-ingress.conf`):**
```
Must contain, in both server blocks (4317 and 4318):
  allow 10.99.0.0/27;
  deny all;
Must NOT contain, anywhere in this file:
  allow all;
```

**V3 — Post-apply access-control behavior (first-ever state: this specific deny-all response has never been witnessed by this harvest's read-only surface, so no literal status code is predicted)**
```
curl -s -o /dev/null -w '%{http_code}\n' --max-time 3 http://<obs-ingress-host>:4318/ --resolve <obs-ingress-host>:4318:<address-outside-10.99.0.0/27>
```
**Expected result (sanctioned first-ever-state shape — named field, not a literal):** the returned HTTP status code falls in the **4xx class** (nginx's standard behavior for a `deny`-matched client, not yet validated against this specific `deny all;` instance). No exact code (e.g. 403 vs 404) is asserted — this package's harvest never witnessed this ingress returning a deny response, so no prior rendering exists to quote literally. If the operator's observed code is outside 4xx, treat as a validation failure and halt before relying on this control.

### 7. Rollback Plan

**Artifact class:** as-deployed file mount (nginx config file) — per the witnessed-artifact taxonomy, **rollback-quotable: yes**, quote the prior file verbatim, never reconstruct.

**Source:** Phase 0 harvest entry, `get_ingress_config` read of `otlp-ingress.conf` (quoted verbatim, same text as §3 baseline):

```nginx
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

**Rollback procedure:** restore this exact file content, then `docker exec obs-ingress nginx -t` (expect `EXIT:0`) followed by `docker exec obs-ingress nginx -s reload` — both operator-gated, out of band. `operator-access.conf` requires no rollback action (never modified).

### 8. Recommended Change Ordering & Apply-Governance Note

1. Apply both edits (4317 block, 4318 block) as **one file diff** against `otlp-ingress.conf` — no ordering dependency between the two blocks; nginx loads/validates the file atomically, there is no partial-file apply.
2. Run **V1** (`nginx -t`) before reload.
3. Operator-gated apply: `docker exec obs-ingress nginx -s reload` (graceful reload — **not performed by this pipeline**).
4. **Blast radius:** a graceful reload re-reads the entire `obs-ingress` nginx config, momentarily affecting **all three** listeners (4317, 4318, 14318) during worker-process transition — senders mid-connection on any listener may see a brief reconnect; this is standard graceful-reload behavior, not a hard outage. No persistent behavior change on 14318.
5. Post-apply check order: **V2** first (confirm file state applied correctly), then **V3** (confirm deny-path behavior for an out-of-range source) before treating the control as live/relied-upon.
6. No maintenance window is required beyond the transient reload described in step 4 — the collector and Prometheus are not touched, and the reload disruption is sub-second by nginx design.

### 9. Chosen-Value Rationale

No new numeric or form value is introduced by this change beyond the exporter-range CIDR itself. The CIDR (`10.99.0.0/27`) is a **chained value, consumed verbatim** per the Program Interface Contract (`exporterRangeCidr.consumedVerbatim: true`) — its sizing rationale (minimality, alignment, containment against the fabric leg's own harvested interfaces) belongs to the upstream fabric-derivation leg's deliverable, not to this package, and is not re-derived or re-justified here. The only structural choice in this package — inserting the `allow` line above a trailing `deny all;` in place of the existing `allow all;` — is a fixed consequence of nginx's documented first-match-wins `allow`/`deny` evaluation order (stated in the harvested file's own header comment), not a tunable value with alternatives to compare.

## Consumed Values
```json
[{"kind": "cidr", "value": "10.99.0.0/27"}]
```

Confidence: 85 — Solid: the branch outcome, baseline evidence, and rollback content all trace to explicit verbatim harvest/Architect quotes, and the chained CIDR is consumed exactly as received. Docked from the top band for two named gaps: (1) the `principal-unseen` premise remains genuinely UNTESTED, not resolved, and (2) V3's expected result uses the protocol's sanctioned first-ever-state shape rather than a witnessed literal, since no prior deny-path rendering exists in the harvest to quote.