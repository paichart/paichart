Output format is unaligned.
## State Summary

**Scope harvested:** promstack R3b-2 (live rig), self-provisioned via `observability-readonly` (serviceId `cmtvg3uaz003myxlqrlflfjk4`, endpoint `http://127.0.0.1:3114/mcp`, registered ACTIVE this run — registration left in place per protocol; teardown occurs at SYNTHESIZE). Three narrow, read-only calls issued: `get_otel_config`, `stack_health`, `get_scrape_targets`. All three succeeded in full with no truncation and no denials — **no partial-harvest condition, no zero-result condition**.

### 1. OTel collector config — witnessed as-deployed file (rollback source per taxonomy)

Source: `get_otel_config`, `structuredContent.source = "as-deployed file (ro mount)"`. Quoted **verbatim**:

```yaml
# Brownfield baseline collector config (as-deployed file IS the harvest source for get_otel_config —
# the collector exposes no config API). Demo change class: add a pipeline/exporter/processor here.
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

**Objective-scope confirmation:** the `service.pipelines.metrics` block explicitly reads `receivers: [otlp]`, `processors: [batch]`, `exporters: [prometheus]` — **no `memory_limiter` processor is present**, matching the task's expected baseline exactly. No fields were inferred; this is the literal returned YAML.

### 2. Stack health

Source: `stack_health`:

| Component | Status |
|---|---|
| prometheus | up |
| grafana | up |
| otel_collector | up |

All three core components report healthy. No degraded/down component to flag.

### 3. Scrape targets — otel-collector's own exposure

Source: `get_scrape_targets` (`droppedTargetCount: 0`):

| Job | Instance | Health | Scrape URL |
|---|---|---|---|
| grafana | grafana:3000 | up | http://grafana:3000/metrics |
| node-exporter | node-exporter:9100 | up | http://node-exporter:9100/metrics |
| otel-collector | otel-collector:8888 | up | http://otel-collector:8888/metrics |
| otel-exported | otel-collector:8889 | up | http://otel-collector:8889/metrics |
| prometheus | localhost:9090 | up | http://localhost:9090/metrics |

Two collector-related targets are scraped: `otel-collector` (job `otel-collector`, port 8888 — the collector's own internal/telemetry metrics, consistent with the `service.telemetry.metrics.readers[].pull.exporter.prometheus{host:0.0.0.0,port:8888}` block in the config above) and `otel-exported` (port 8889 — the pipeline's `exporters.prometheus` endpoint carrying pipeline-forwarded metrics). Both report `health: "up"` with no `lastError`. These two existing job names + the port-8888/8889 split are baseline facts the Architect must treat as a name-collision surface if the memory_limiter design touches collector-side scrape config.

### Gaps / notes for downstream
- No `get_prometheus_config` or `get_rules` call was made — out of this task's stated scope (objective is the OTel collector pipeline only), so no Prometheus rule-file or scrape-job baseline is asserted here beyond what `get_scrape_targets` incidentally shows.
- No Grafana dashboard/datasource reads performed — not in scope for this OTel-pipeline objective.
- No secret-bearing fields were present in the returned config; nothing redacted or withheld beyond what the service itself returned.
- Registration `observability-readonly` (serviceId `cmtvg3uaz003myxlqrlflfjk4`) remains ACTIVE — do not delete; teardown is a SYNTHESIZE-phase action per protocol.

**Synthesis:** The live promstack R3b-2 collector runs exactly the baseline pipeline the objective expects — `receivers[otlp] → processors[batch] → exporters[prometheus]` — with no `memory_limiter` processor present, all three stack components healthy, and both collector-side scrape targets (8888 self-metrics, 8889 exported-metrics) up with no errors. This is a clean, complete, non-degraded harvest ready for the Phase 1 Architect to design the memory_limiter addition against.

Confidence: 97 — All three scoped reads returned complete, unambiguous, uncapped data directly answering the task's stated objective (confirm current pipeline composition); no assumptions were required and no fields were fabricated.
