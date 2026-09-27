# Change Package: OTLP Ingress Allow/Deny Stanza (4317/4318)

## 1. Scope Confirmation / Gap Report

No gap report is required. Both listener blocks were positively identified upstream with zero ambiguity:

| Target | File | Existence branch | Identified by |
|---|---|---|---|
| 4317 (OTLP-gRPC) `location /` | `otlp-ingress.conf` | ADD (single `allow all;`, no deny-all terminator) | Phase 0 Harvester (`get_ingress_config`) + Phase 1 Architect |
| 4318 (OTLP-HTTP) `location /` | `otlp-ingress.conf` | ADD (single `allow all;`, no deny-all terminator) | Phase 0 Harvester (`get_ingress_config`) + Phase 1 Architect |

`operator-access.conf` (`listen 14318`) is explicitly out of scope (separate rig-operator listener, pre-existing `allow 172.20.0.1; deny all;` precedent) and is not touched or reproduced here.

## 2. Full Desired-State Config File — `otlp-ingress.conf`

```nginx
# OTLP ingress allowlist — the lab's enforcement point for "which senders may export telemetry".
# Fronts BOTH OTLP receivers: gRPC (4317) and HTTP (4318). The collector accepts OTLP only on a
# private network shared with this proxy, so these two server blocks are the only way in.
# nginx evaluates allow/deny IN ORDER, first match wins. Read-only to the harvest service
# (obs-mcp get_ingress_config); changed only by an operator applying an approved change package,
# then `docker exec obs-ingress nginx -s reload`.
#
# CHANGE APPLIED (Telemetry Export Authorisation — Program Run 1): sender set narrowed from
# `allow all` to the fabric exporter CIDR published by the fabric leg
# (crossingValue.fabricExporterCidr = 10.99.0.0/27, consumed verbatim, not recomputed).
# Both server blocks below now allow only 10.99.0.0/27 and deny all other senders.

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

Only the `allow`/`deny` lines change in each `location /` block; `grpc_pass`/`proxy_pass` and all other directives are untouched, per the Architect's per-target change list. `operator-access.conf` is not reproduced — no change there.

## 3. Deterministic Validation Facts

### 3.1 Syntax / block-scan checks (literal — command output is knowable because it is a text scan of the file this package itself mandates be applied verbatim; `nginx -T` echoes included config files' text unchanged, it does not transform directive syntax)

**Step 1 — 4317 block: allow/deny lines present, immediately adjacent**
```
docker exec obs-ingress nginx -T 2>/dev/null | awk '/listen 4317;/,/^}$/' | grep -E 'allow|deny'
```
**Expected output (4317):**
```
        allow 10.99.0.0/27;
        deny all;
```

**Step 2 — 4318 block: allow/deny lines present, immediately adjacent**
```
docker exec obs-ingress nginx -T 2>/dev/null | awk '/listen 4318;/,/^}$/' | grep -E 'allow|deny'
```
**Expected output (4318):**
```
        allow 10.99.0.0/27;
        deny all;
```

**Step 3 — exactly two `allow 10.99.0.0/27;` blocks exist, each immediately followed by `deny all;`**
```
docker exec obs-ingress nginx -T 2>/dev/null | grep -A1 'allow 10.99.0.0/27;'
```
**Expected output:**
```
        allow 10.99.0.0/27;
        deny all;
--
        allow 10.99.0.0/27;
        deny all;
```

**Step 4 — no residual `allow all;` anywhere in the rendered config**
```
docker exec obs-ingress nginx -T 2>/dev/null | grep -c 'allow all;'
```
**Expected output:**
```
0
```

### 3.2 Accept-from-inside / reject-from-outside checks (comparison shape — no witnessed rendering exists for live OTLP traffic through this ingress in either baseline or restricted state; Phase 0 harvested only static config, never a live request/response. Per protocol, the property to verify is stated as a named-field comparison, not a predicted literal, and volatile fields are excluded by name.)

**Step 5 — 4318/HTTP accept-from-inside**
```
curl -sv --connect-timeout 5 http://<obs-ingress-host>:4318/v1/traces \
  -H 'Content-Type: application/x-protobuf' --data-binary @minimal-otlp-trace.pb \
  --interface 10.99.0.5   # unused address inside 10.99.0.0/27
```
**Comparison to perform (no literal available):**
```
PASS = HTTP response status is NOT 403 (nginx's deny-match code) — i.e. the connection reached
proxy_pass and the status reflects the collector's own OTLP-HTTP handling, unchanged from baseline
behavior for in-range senders.
Excluded (volatile): response body length, timing headers, any request/trace-id echo.
No literal asserted: no tool in this pipeline has ever captured a live OTLP request/response
through this ingress (Phase 0 harvested static config only).
```

**Step 6 — 4318/HTTP reject-from-outside**
```
curl -sv --connect-timeout 5 http://<obs-ingress-host>:4318/v1/traces \
  -H 'Content-Type: application/x-protobuf' --data-binary @minimal-otlp-trace.pb \
  --interface 172.31.200.5   # any address outside 10.99.0.0/27
```
**Comparison to perform (no literal available):**
```
PASS = HTTP response status IS 403 (numeric status class only) AND no connection/log/metric
evidence of the request reaching 172.31.114.10:4318 (proxy_pass target).
Excluded (volatile): default nginx error-page body text/version banner, timing.
No literal asserted: this behavior (deny-all response) has never been witnessed by this pipeline's
read-only harvest, and a custom error_page could later change the body — only the status class
is asserted as static.
```

**Step 7 — 4317/gRPC accept-from-inside**
```
grpcurl -plaintext -import-path . -proto otlp.proto \
  -H '' <obs-ingress-host>:4317 opentelemetry.proto.collector.trace.v1.TraceService/Export \
  --local-address 10.99.0.5:0
```
**Comparison to perform (no literal available):**
```
PASS = gRPC call does NOT terminate with connection-refused/reset at the nginx layer; a gRPC
status (OK or an application-level error from the collector itself) is returned, indicating the
stream reached grpc_pass. Excluded (volatile): gRPC trailers, timing metadata.
No literal asserted: no live gRPC exchange through this ingress has been witnessed by the harvest.
```

**Step 8 — 4317/gRPC reject-from-outside**
```
grpcurl -plaintext -import-path . -proto otlp.proto \
  <obs-ingress-host>:4317 opentelemetry.proto.collector.trace.v1.TraceService/Export \
  --local-address 172.31.200.5:0
```
**Comparison to perform (no literal available):**
```
PASS = connection is refused/reset at the nginx layer before any gRPC status is returned by the
collector (i.e. no evidence of the stream reaching 172.31.114.10:4317).
No literal asserted: same reason as Step 6 — deny-all behavior for this listener has never been
witnessed by the harvest.
```

## 4. Rollback Plan (per artifact class, per witnessed-artifact taxonomy)

Ingress config is a file-mount artifact (analogous to the Collector/OTel row: witnessed via the as-deployed file mount — the file IS the artifact, rollback-quotable verbatim). Restore `otlp-ingress.conf` to the exact pre-change content, quoted verbatim below from Phase 0 Harvester's `get_ingress_config` rendering (carried forward unchanged through the Architect's output — no reconstruction):

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

**Rollback apply step:** overwrite `otlp-ingress.conf` with the content above, then `docker exec obs-ingress nginx -s reload`. This reverts to `allow all;` on both blocks — a **security regression to the pre-change posture** — and should only be invoked if the narrowed config causes an operational break for legitimate fabric exporters, not for cosmetic issues.

**Rollback validation (literal, same mandated-file reasoning as §3.1):**
```
docker exec obs-ingress nginx -T 2>/dev/null | grep -c 'allow all;'
```
Expected output after rollback: `2`
```
docker exec obs-ingress nginx -T 2>/dev/null | grep -c 'allow 10.99.0.0/27;'
```
Expected output after rollback: `0`

## 5. Change Ordering / Apply-Governance Note

- **Atomicity**: both 4317 and 4318 blocks live in the single file `otlp-ingress.conf` — apply as one whole-file replacement. A partial apply (one block restricted, one not) is explicitly precluded by doing this as a single file swap, avoiding an asymmetric security posture between the two listeners.
- **Apply mechanism**: file replace → `docker exec obs-ingress nginx -s reload` (graceful reload; nginx worker processes are replaced without dropping the listening sockets — no nginx-process downtime).
- **Blast radius / window declaration**: a coordinated change window (or explicit fabric-team notice) **is warranted** — this is a real, non-invented constraint: baseline is `allow all;` on both blocks (Phase 0/Design, witnessed), so this is a **tightening / hard-cutover event**, not a compatibility-preserving change. The instant `nginx -s reload` takes effect, any sender outside `10.99.0.0/27` permanently loses OTLP export capability through this ingress. Per the fabric leg's derivation, only six exporter loopbacks (10.99.0.1/2/4/24/26/29) are currently expected to send — but an undiscovered ninth sender would break silently at reload, which is the concrete reason a window/notice is warranted here, not a placeholder.
- **Post-apply check order**: (1) run §3.1 Steps 1–4 (syntax/block-scan) first, to confirm the applied file matches this package's mandated desired state; (2) only then run §3.2 Steps 5 & 7 (accept-from-inside) to confirm fabric exporters still function; (3) then §3.2 Steps 6 & 8 (reject-from-outside) to confirm the narrowing is actually enforced. Running behavioral checks before syntax confirmation risks diagnosing a live-traffic symptom against an unconfirmed config state.

## 6. Baseline Evidence (restated for the Reviewer — witnessed at Phase 0, carried through Phase 1 unchanged)

**`get_ingress_config` (as-deployed file mount, witnessed verbatim)** — both blocks originally carried a single `allow all;` with no deny-all terminator (quoted in full in §4 above as the rollback source).

**`get_otel_config` (as-deployed collector file, witnessed verbatim)**:
```yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 172.31.114.10:4317 }
      http: { endpoint: 172.31.114.10:4318 }
```
Confirms the collector itself has zero source-address enforcement fields — nginx is the sole gate, which is why this ingress change is the correct and sufficient enforcement point.

**Out-of-scope precedent (do not touch)**: `operator-access.conf` (`listen 14318`, `allow 172.20.0.1; deny all;`) — separate rig-operator listener, not part of the sender-enforcement surface for this task.

**Crossing value**: `crossingValue.fabricExporterCidr = 10.99.0.0/27`, published by the fabric leg at confidence 92, consumed verbatim by the Architect and by this package — not recomputed or widened. Note for the Reviewer: the fabric leg's own upstream deliverable carries a stamped **needs-revision quality-gate note** from its own pipeline; that is a fact about the fabric leg's release status, not something this Author or the Architect can resolve — flagged here for Reviewer awareness, not treated as a defect in this change package.

## 7. Chosen-Value Rationale

This package introduces **no author-chosen numeric/form values requiring an alternatives comparison**:

- The CIDR (`10.99.0.0/27`) is a chained crossing value, consumed verbatim per the contract's `consumptionRule` — it is not derived, recomputed, or widened by this task, so no rationale is owed for its width or bounds here (that rationale belongs to the fabric leg, already stated in its §2/§3).
- The stanza syntax (`allow <CIDR>; deny all;`) is the contract's fixed `platformDialect.canonicalStanza`, transcribed with only the CIDR substituted — no alternative phrasing was available or considered.
- The only decision this Author made was mechanical placement (replacing the existing `allow all;` line in-place, above `grpc_pass`/`proxy_pass`, per the Architect's per-target change list) — this is a positional/structural choice, not a numeric or form value, and carries no alternatives to compare.

Declaring this explicitly rather than manufacturing a rationale table for values that were not actually chosen by this role.

## Consumed Values
```json
[{"kind": "cidr", "value": "10.99.0.0/27"}]
```

Confidence: 82 — Solid on the config/rollback/ordering sections (fully traceable to Phase 0's verbatim harvest and Phase 1's unambiguous design, zero recomputation of the chained CIDR). Held below 90 because the accept/reject-from-inside/outside checks (§3.2) are necessarily comparison-shape rather than literal — no tool in this pipeline has ever captured live OTLP traffic through this ingress — and because the fabric leg's own upstream deliverable carries an unresolved needs-revision quality-gate stamp that this task cannot clear.