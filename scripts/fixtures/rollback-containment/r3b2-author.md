Output format is unaligned.
# Change Package: `memory_limiter` Addition — promstack R3b-2 (OTel Collector)

**Change class:** OpenTelemetry collector pipeline/processor addition
**Apply mode:** Human-gated config file replace + collector restart. **No apply performed by this pipeline.**

---

## 1. Baseline Evidence (restated from Phase 0 harvest / Phase 1 design — no re-harvest performed)

**Source tool:** `get_otel_config`, `structuredContent.source = "as-deployed file (ro mount)"` — the collector exposes no config API, so this file mount **is** the witnessed artifact for this class.

**Witnessed existing `processors:` / pipeline stanza:**
```yaml
processors:
  batch: {}

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus]
```
- Existing processor names: `batch` only. No `memory_limiter` present → **no name collision**.
- Collector-side scrape targets at harvest time: `otel-collector` (`otel-collector:8888`, self-telemetry, `health: up`), `otel-exported` (`otel-collector:8889`, exported metrics, `health: up`). Stack health at harvest: prometheus / grafana / otel_collector all `up`.

**GAP — config file path:** the harvest's `get_otel_config` returned file content labeled `"as-deployed file (ro mount)"` but **no explicit on-disk path field**. Per anti-fabrication rule, no path is invented. All references below use the placeholder `<COLLECTOR_CONFIG_PATH: UNRESOLVED — operator must supply the ro-mounted file's real path before running any step in §4/§7>`.

---

## 2. Full Desired-State Config File (whole file — operator writes this verbatim to `<COLLECTOR_CONFIG_PATH>`)

```yaml
extensions:
  health_check:
    endpoint: 0.0.0.0:13133

receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 204
    spike_limit_mib: 51
  batch: {}

exporters:
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  extensions: [health_check]
  telemetry:
    metrics:
      readers:
        - pull:
            exporter:
              prometheus: { host: 0.0.0.0, port: 8888 }
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
```

Changes vs. baseline: (1) new `memory_limiter` key added to `processors:`; (2) `service.pipelines.metrics.processors` changed from `[batch]` to `[memory_limiter, batch]` — `memory_limiter` is first, ahead of `batch`. No other key touched.

---

## 3. Sizing Rationale — container limit 256 MiB

`memory_limiter` semantics: `limit_mib` is the **hard ceiling** (the processor begins refusing/dropping data above it); `spike_limit_mib` is **subtracted from** `limit_mib` to form the **soft limit** (steady-state target) — it is not additive headroom on top of the ceiling.

| Parameter | Value | Arithmetic | Basis |
|---|---|---|---|
| Container cgroup hard limit | 256 MiB | given | container spec |
| `limit_mib` (hard ceiling) | **204** | 256 × 0.80 = 204.8 → 204 | ≈80% of container limit |
| `spike_limit_mib` | **51** | 204 × 0.25 = 51 | ≈25% of `limit_mib` |
| Soft limit (steady-state target) | **153 MiB** | `limit_mib − spike_limit_mib` = 204 − 51 = 153 | subtraction, per memory_limiter spec — not addition |
| Headroom outside limiter accounting | **52 MiB** | 256 − 204 = 52 | reserved for Go runtime/GC/non-heap/OS overhead the limiter's heap-based check does not see |
| `check_interval` | **1s** | conventional default, not harvested | frequent enough to react before the 204 MiB ceiling is breached; low CPU cost |

Sanity check for reviewer: 204 (hard ceiling) + 52 (unclaimed headroom) = 256 MiB (100% of container limit) — accounts for the full budget. 153 MiB (soft) < 204 MiB (hard) < 256 MiB (container) — ordering holds.

---

## 4. Validation — Pre-Apply (operator runs before restart)

### 4.1 Config syntax validation

```
otelcol validate --config=<COLLECTOR_CONFIG_PATH>
```
**Expected result — comparison shape (no literal banner text quoted; this exact file has never been validated by any tool call in this pipeline, so no rendering of `otelcol validate`'s stdout exists to quote):**
```
Exit code: 0
stderr: <empty — zero lines written>
```
Reason no literal was used: `otelcol validate`'s success-path console text was not captured by any harvest or mandated capture in this package — asserting a specific banner string would be a predicted literal, not a witnessed one. Exit-code-zero + empty-stderr is the deterministic, checkable property instead.

---

## 5. Validation — Post-Apply (run only after the sequencing in §7 — do not run immediately post-restart)

### 5.1 Collector config re-read (confirms the new file is loaded)
```
services(action:"call", targetService:"observability-readonly", tool:"get_otel_config", arguments:{})
```
**Expected output (literal — for this artifact class the file mount IS the rendering source, so the applied file's own content is the correct literal to quote):**
```yaml
processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 204
    spike_limit_mib: 51
  batch: {}
...
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
```

### 5.2 Stack health re-check
```
services(action:"call", targetService:"observability-readonly", tool:"stack_health", arguments:{})
```
**Expected output (static field, literal format witnessed at harvest — "up"):**
```
otel_collector: up
```
(`prometheus: up`, `grafana: up` expected unchanged — this change does not touch those processes.)

### 5.3 Scrape target recovery — run only after health_check (13133) is ready AND at least one full scrape interval has elapsed post-restart
```
services(action:"call", targetService:"observability-readonly", tool:"get_scrape_targets", arguments:{})
```
**Expected output (identity + health fields, literal instance labels quoted from harvest):**
```
job: otel-collector, instance: otel-collector:8888, health: up
job: otel-exported, instance: otel-collector:8889, health: up
```
**Satisfiability note:** running this check before the collector reports ready or before the next scrape tick has fired will show a transient gap/`unknown` health that is NOT a rollback trigger — it means the check was invoked too early. See §7 for the required wait sequence before this step.

---

## 6. Rollback Plan — prior file content, VERBATIM (per taxonomy: OTel config rollback source is the file itself)

Restore this exact content to `<COLLECTOR_CONFIG_PATH>`:

```yaml
extensions:
  health_check:
    endpoint: 0.0.0.0:13133

receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  batch: {}

exporters:
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  extensions: [health_check]
  telemetry:
    metrics:
      readers:
        - pull:
            exporter:
              prometheus: { host: 0.0.0.0, port: 8888 }
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus]
```

Rollback procedure: overwrite `<COLLECTOR_CONFIG_PATH>` with the block above → restart the collector (same blast radius as apply, §7) → re-run §5.1–5.3, this time expecting `processors: [batch]` (no `memory_limiter`) in 5.1, and unchanged `up`/`up` health in 5.2/5.3.

---

## 7. Recommended Change Ordering + Apply-Governance Note (this section is also the maintenance-window note for this domain)

1. **Stage** the full file from §2 to `<COLLECTOR_CONFIG_PATH>` (operator resolves the real path first — §1 gap).
2. **Pre-apply validate** (§4.1) — must show exit 0 / empty stderr before proceeding. Do not restart on a failed validation.
3. **Restart** the otel-collector process/container. No hot-reload or lifecycle endpoint was found in the harvest (only `health_check` liveness on `0.0.0.0:13133`) — this change is **not** hot-reloadable.
   - **Blast radius:** brief interruption to all in-flight OTLP ingestion (`4317` grpc, `4318` http) for the restart duration; a scrape gap on both collector-side targets — `otel-collector:8888` (self-telemetry) and `otel-collector:8889` (exported metrics) — for one-to-a-few scrape intervals. Prometheus and Grafana processes are unaffected (independent processes, confirmed by harvest).
4. **Wait for readiness:** poll `health_check` (`13133`) until it returns ready.
5. **Wait one full scrape interval**, then run post-apply checks **in order**: §5.1 → §5.2 → §5.3.
6. **If any post-apply check fails to match its expected result**, execute the rollback (§6) immediately and re-verify with the same §5 checks against the rolled-back expectation.

Apply (steps 1, 3, and rollback-step in §6) is out-of-band and human-gated — this package produces the change to be applied, never an applied change.

---

Confidence: 86 — Config, sizing arithmetic, and validation/rollback structure are fully derived from the chained Architect design and its harvested baseline (no re-derivation, no stack contact made by this role). Two explicit named gaps carried forward rather than fabricated: (1) the on-disk config file path was never returned by the harvest and is left as an operator-resolved placeholder throughout; (2) `check_interval: 1s` and the `otelcol validate` success shape are conventional/comparison facts, not literals witnessed by any tool call in this pipeline.
