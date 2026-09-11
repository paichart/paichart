# Observability Config — Change Report
## A `memory_limiter` for a live OpenTelemetry collector — the first package in this directory that was also *applied*

> **Source:** pAIchart **observability-config** pipeline run (`protocol: observability-config` 1.0.2), 2026-09-11.
> **POV:** Autonomous Delivery Use Cases · phase *Observability Config Change* · round **R3b-3**
> **Pipeline task:** `cmtwcpnwo0003yx2dvd6wxsbd` · `qualityGate: approved` · reviewer **90** · pipeline confidence 91
> **Environment:** harvested **live, read-only** — a Prometheus 2.55 + Grafana 11.4 + OpenTelemetry Collector 0.116 stack (the "promstack" rig), through a read-only MCP service that exposes the collector's **as-deployed config file** and Prometheus's **running** config/targets/rules.
> **Outcome:** Harvester 95 → Architect → Author 88 → Reviewer **APPROVED / blocking: none**.
> **Status:** **APPLIED** — by a human operator, out of band, following the package's own ordering: `validate` (exit 0) → whole-file swap → collector restart. The collector's startup log confirmed `Memory limiter configured {limit_mib: 204, spike_limit_mib: 51, check_interval: 1}`. See [Addendum B](#addendum-b--what-happened-when-it-was-applied).
>
> 📎 **The harvested current state — the as-deployed collector file and the running Prometheus configuration this package was designed against — is in [Addendum A](#addendum-a--current-state-as-harvested-live-read-only), verbatim.** The rollback in the package is that file, quoted; check one against the other.

---

## Why this example is different from the other five

Two things, and they are connected.

**It was applied.** Every other report in this directory is *approved-but-unapplied* by design — pAIchart never actuates, and that stays true here. But this run's objective is the last of four change classes the observability pipeline was validated on (a scrape job, a Grafana dashboard, alerting/recording rules, and this collector processor), and all four packages were then applied by a human operator, using each package as the runbook. So this is the first example where you can read the proposal, the ground truth it was designed against, **and what the system actually displayed afterwards** — including the one place the package's expectations and the running collector's telemetry diverge (Addendum B).

**The reviewer read a platform fact instead of guessing.** The rollback in a change package is supposed to be the pre-change state, quoted verbatim from the harvest. A reviewer can only see the *package*, never the raw harvest — so "is this rollback really a verbatim quote?" is a judgement it structurally cannot make. Three earlier runs across two domains had refused **content-correct** rollbacks on exactly that suspicion (each reviewer stated in its own verdict that it could not verify the comparison, then asserted the conclusion anyway). The two rounds before this one — R3a-3 and R3b-2 — were two of those three.

This run is the first where the platform stamped the comparison mechanically at the moment the Author's package was persisted — **26 of 26 restore-form lines found verbatim in this leg's own harvest, 0 unmatched** — and delivered it into the reviewer's context. The reviewer's verdict then says, in its own words:

> **Platform fact cited directly (not inferred from prose):** rollback provenance shows **26 of 26 restore lines found verbatim in this leg's own harvest, 0 unmatched**, disposition `benign` (`all-restore-lines-found`). This is full containment — no blocking issue. (Per guidance, this proves line-level provenance only, not completeness; I independently checked completeness in §1/§3 above and found the rollback file matches the full baseline with nothing omitted.)

The parenthetical is the part worth noticing. The fact answers one narrow question — *is each quoted line present in the witnessed harvest?* — and the reviewer kept the question the fact does **not** answer — *is the package complete?* — as its own judgement. A green provenance fact is not "the package is fine". Unmatched lines, when they occur, are rendered as *lines the check could not adjudicate — not evidence of fabrication*, and they escalate; they never block. The measured base rate of true rollback fabrication across the platform's archived runs is zero, so this check earned its place by **exonerating** correct work, not by catching forgeries.

---

## What the pipeline did, autonomously

You hand pAIchart **one plain-English objective** plus a descriptor for a read-only observability service. With no further input it:

1. **Self-provisioned** the read-only service from the descriptor (register → three narrow reads → torn down at synthesis) — pAIchart stores no credentials for the stack, and the registration doesn't persist.
2. **Harvested** the collector's as-deployed config file (the collector has no config API — the file mount *is* the witnessed artifact), the running Prometheus configuration (`/api/v1/status/config`, plus the witnessed config-file path from `/api/v1/status/flags`), and scrape-target health. Read-only; Prometheus's lifecycle/reload endpoint is never proxied by the service.
3. **Designed** the processor and its sizing against a stated 256 MiB container limit, and **carried the witnessed config forward verbatim** to the Author (the fix that R3a-3 earned — a paraphrased baseline is what a reviewer cannot trust).
4. **Authored** the deliverable below: the full desired-state file (whole-file replacement, not a diff), the sizing arithmetic restated so a reviewer can check it from the package alone, a deterministic pre-apply validation (`otelcol validate`, exit 0) and a **presence/structural** post-apply check (deliberately *not* a predicted literal, because this processor had never existed in any prior harvest and nothing had ever rendered one), the rollback (the harvested file, verbatim), and an apply-governance note covering the restart blast radius.
5. **Reviewed** it through an independent QA agent that re-derived the sizing set itself (and caught the one thing the Author glossed — `256 × 0.80 = 204.8` was floored to 204 without saying so; non-blocking, because the floor is the *safer* direction and every downstream figure is computed from 204 consistently), checked the rollback against the platform's provenance fact, and emitted **APPROVED / blocking: none / 90**.

---

## The road to this run (the honest part)

This objective took three attempts, and the two refusals are more informative than the approval.

| Round | Verdict | What happened |
|---|---|---|
| R3b | NEEDS-REVISION | A **legitimate** catch: the package chose sound `memory_limiter` values and documented **no sizing rationale**. The objective was re-run with the rationale requirement made explicit. |
| R3b-2 | NEEDS-REVISION | The package was **content-correct** — its rollback was line-identical to the as-deployed file (an operator string test confirmed it) — but the reviewer blocked on provenance formalism it could not check from the package. The third such refusal across two domains; the platform's rollback-provenance fact was built in response. |
| **R3b-3** | **APPROVED 90** | This report. Same objective; the reviewer read the stamped fact and approved. |

The refusals are kept. A reviewer that only ever says "yes" proves nothing; a reviewer that says "no" for a wrong reason is a defect you fix at the platform layer, not by softening the reviewer.

---

## THE DELIVERABLE

*Verbatim — the harness root's `report.md`, the Author's change package as the reviewer approved it. Nothing below this line was edited.*

---

# CHANGE PACKAGE: `memory_limiter` addition to OTel Collector Metrics Pipeline (promstack R3b-3)

## 1. Baseline Evidence (as-deployed, harvested)

**Source:** `get_otel_config` (as-deployed file mount — the collector has no config API, so the file mount is the witnessed artifact), harvested by the Phase 0 Observability State Harvester and carried forward verbatim by the Phase 1 Architect.

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

**Baseline processor chain (exactly as it stood):** `processors: { batch: {} }`; single `metrics` pipeline with `processors: [batch]`. No `memory_limiter` present. No `traces`/`logs` pipelines exist. Only one processor name (`batch`) is in use.

## 2. Sizing Rationale (restated for standalone reviewer sanity-check)

| Quantity | Value | Derivation |
|---|---|---|
| Container memory limit (cgroup) | 256 MiB | given constraint |
| `limit_mib` — **hard ceiling** (data refused/dropped above this to protect the process from OOM) | **204 MiB** | 256 × 0.80 |
| Headroom above hard ceiling before cgroup OOM-kill | **52 MiB (~20.3%)** | 256 − 204 |
| `spike_limit_mib` — **subtracted from `limit_mib`** to form the soft limit (not added on top) | **51 MiB** | 204 × 0.25 |
| Soft limit = `limit_mib − spike_limit_mib` (above this, GC is forced proactively) | **153 MiB** | 204 − 51 |
| `check_interval` | **1s** | set explicitly for auditability (not left implicit) |

Semantics restated: `limit_mib` is the hard ceiling; the processor derives the soft limit by **subtracting** `spike_limit_mib` from `limit_mib` (153 = 204 − 51), not by adding it. Steady-state usage is expected under 153 MiB; the collector can spike to 204 MiB before shedding load; 52 MiB is preserved above the hard ceiling as unmanaged container headroom against the 256 MiB kill threshold.

## 3. Desired-State Config File (full — for whole-file replacement, not a diff)

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
  memory_limiter:
    check_interval: 1s
    limit_mib: 204
    spike_limit_mib: 51

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

Only two changes relative to baseline: (1) new `processors.memory_limiter` block; (2) `service.pipelines.metrics.processors` changed from `[batch]` to `[memory_limiter, batch]` (ordering is functional — the limiter must run first so it can shed/backpressure before data reaches the batching buffer). All receivers, exporters, extensions, and `service.telemetry` are unchanged.

## 4. Validation

**Pre-apply — operator runs before restart:**

```
otelcol validate --config=<file>
```
**Expected output (valid config):**
```
(no stdout output; process exits with status code 0)
```
This reflects the documented behavior of the `otelcol validate` subcommand: on a syntactically and semantically valid config it performs a silent, no-output pass and returns exit code 0; only a parse/schema error produces stderr output and a non-zero exit. This is a tool-behavior fact (not a stack-state rendering), so it is cited as the documented CLI contract rather than a harvested literal.

**Post-apply — comparison check against the harvest surface (first-ever state, no literal available):**

Run `get_otel_config` against the restarted collector and confirm the returned config satisfies, by presence/structural comparison — **not** a predicted literal, because this processor and pipeline ordering have never existed in any prior harvest, so nothing has ever rendered a literal to quote:

- `processors.memory_limiter` key is present with all three of: `check_interval: 1s`, `limit_mib: 204`, `spike_limit_mib: 51` (named fields whose presence proves the property).
- `service.pipelines.metrics.processors` array equals `[memory_limiter, batch]` in that order (position, not just membership).
- `processors.batch` remains present and unchanged (`{}`), confirming no collateral edit to the existing processor.
- No `traces` or `logs` pipeline key has appeared (confirms scope containment — this change touches only the `metrics` pipeline).

Volatile fields excluded by name: none of the above fields are counters/timers/uptimes, so no exclusion is needed for this check.

## 5. Rollback Plan

**Rollback source (per taxonomy: the file mount IS the witnessed artifact for otel-collector config — quoted verbatim, never reconstructed):**

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

**Restore procedure:** replace the deployed config file wholesale with the block above (byte-identical to the harvested §1 rendering), then perform the same restart step used to apply the forward change (§6 below). No partial/line-level patch — restore the whole file to avoid leaving `memory_limiter` partially wired into the pipeline array without its definition (or vice versa).

**Post-rollback check:** re-run the `get_otel_config` presence check from §4 and confirm `processors.memory_limiter` is **absent** and `service.pipelines.metrics.processors` reads `[batch]` — the inverse of the post-apply check, using the same non-literal comparison shape for the same reason (this is a return to a previously-witnessed state, so the literal IS available this time: it is the harvested block quoted above, verbatim).

## 6. Recommended Change Ordering + Apply-Governance Note

**Ordering (single-file change, no cross-file sequencing required):**
1. Operator runs `otelcol validate --config=<file>` against the desired-state file from §3 (pre-apply gate).
2. Operator replaces the deployed config file with the §3 content.
3. Operator restarts the collector (**no hot-reload path exists for processor definitions on this config surface** — static YAML mount, per Architect's blast-radius call).
4. Operator runs the post-apply check (§4) first — confirms the change took effect before assessing broader health.
5. Operator confirms scrape-target health (`get_scrape_targets` for the `otel-collector` and `otel-exported` jobs showing `up`) and `health_check` endpoint reachability as the second-order check, since transient restart flapping on those surfaces is expected and should be read only after config-correctness is confirmed.

**Apply-governance note (serves as this domain's maintenance-window readiness statement — no separate window section):**
- **Apply mechanism:** collector restart (or container re-create) — config is a static file mount with no hot-reload for processor changes.
- **Blast radius during restart:** (a) OTLP ingestion interrupted on `0.0.0.0:4317` (gRPC) and `0.0.0.0:4318` (HTTP) — client-side retry behavior determines data loss, out of scope here; (b) metrics export to Prometheus via `:8889` gapped for the restart duration — the `otel-exported` scrape job will show a scrape gap; (c) collector self-telemetry on `:8888` gapped — the `otel-collector` scrape job will show a corresponding gap; (d) `health_check` extension on `:13133` reports unreachable/unhealthy for the restart window, flapping any external liveness/readiness probe watching it.
- **Expected duration:** collector restarts are typically seconds; no metrics are buffered to disk in this config, so the gap window is not retroactively recoverable.
- **First check to run post-restart:** the §4 `get_otel_config` presence/comparison check — confirms the intended change is live before drawing any conclusion from the scrape-target/health-check flapping, which is expected transient noise rather than a fault signal.
- **Scope confirmation:** no receivers, exporters, extensions, `service.telemetry`, or other pipelines are touched — this is the single ordering-sensitive addition to the `metrics` pipeline's processor chain only.

Confidence: 88 — The config file, sizing restatement, and rollback content trace directly and verbatim to the Architect's §6 baseline with no invented values. The two flagged gaps: (1) the `otelcol validate` success-output claim (no stdout, exit 0) is standard documented CLI behavior for this subcommand but was not itself witnessed by a harvest tool in this run, so it is cited as a tool-behavior fact rather than a stack rendering; (2) no collector version string was harvested, so the exact validate/behavior contract is assumed to match mainline OTel Collector semantics rather than confirmed against a specific build.


---

## Addendum A — Current state, as harvested (live, read-only)

This is the pre-change ground truth the package above was designed against, reproduced from the Phase 0 Harvester's deliverable (task `cmtwcr10o000pyx2d6r63emnn`, three scoped reads, confidence 95). **The deliverable is the proposal and this is the evidence** — the package's §1 baseline and §5 rollback should match the collector file below line for line, and the platform's provenance fact says they do (26/26). No mutating call was made: the service exposes no reload/apply/write tool, and Prometheus's lifecycle endpoint is never proxied.

### State Summary

**Scope:** Read-only harvest of the promstack rig ahead of designing an OTel `memory_limiter` processor (256MB container limit) for the metrics pipeline. Self-provisioned `observability-readonly` (serviceId `cmtwcrc1z0019yx2dd7brmf5b`, endpoint `http://127.0.0.1:3114/mcp`) per the descriptor in the harness task body, made 3 narrow, single-target read-only calls, all succeeded with no truncation, zero read failures. **No teardown performed** — per protocol, service deletion happens at harness SYNTHESIZE, not by this Phase 0 task.

#### 1. OTel Collector config — `get_otel_config` (as-deployed file mount; the primary witnessed artifact; rollback source)

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

**Confirmed processor chain:** metrics pipeline = `receivers: [otlp] -> processors: [batch] -> exporters: [prometheus]`. **No `memory_limiter` present** — matches the task's stated baseline exactly. This is the file the Architect's design and the Author's rollback plan must key off; it is the collector's only config surface (no config API exists for OTel).

#### 2. Prometheus config — `get_prometheus_config` (context only)

- `configFile`: `/etc/prometheus/prometheus.yml` (witnessed via `/api/v1/status/flags`)
- `rule_files`: `/etc/prometheus/rules/*.yml`
- `global`: scrape_interval 15s, scrape_timeout 10s, evaluation_interval 15s
- `scrape_configs` (5 jobs, all `tier: platform` except `otel-exported` at `tier: pipeline`):

| job_name | target | labels |
|---|---|---|
| prometheus | localhost:9090 | tier=platform |
| grafana | grafana:3000 | tier=platform |
| otel-collector | otel-collector:8888 | tier=platform |
| otel-exported | otel-collector:8889 | tier=pipeline |
| node-exporter | node-exporter:9100 | tier=platform |

No changes needed here for this task — the `memory_limiter` addition is collector-internal and doesn't touch Prometheus scrape config. Included as baseline/name-collision reference for the Architect.

#### 3. Scrape target health — `get_scrape_targets` (context only)

| job | instance | health | lastError |
|---|---|---|---|
| grafana | grafana:3000 | up | none |
| node-exporter | node-exporter:9100 | up | none |
| otel-collector | otel-collector:8888 | up | none |
| otel-exported | otel-collector:8889 | up | none |
| prometheus | localhost:9090 | up | none |

`droppedTargetCount: 0`. All 5 targets healthy — no ambiguous/expired series to reason about at this baseline.

#### Gaps / notes
- No collector version string was returned by `get_otel_config` — not fabricated, simply not present in the harvested payload; the Architect should design against the syntax shown, not assume a specific otelcol build.
- No secrets encountered in any harvested surface (no auth/remote_write credentials present in this rig's config) — nothing to redact or flag.
- All three reads were read-only, non-mutating, no lifecycle/reload calls made.

*Synthesis: The as-deployed collector has a clean, minimal `otlp -> batch -> prometheus` metrics pipeline with no memory_limiter. This is a first-ever-processor addition (nothing to diff against for that specific processor), which downstream Phase 2 must account for when framing validation expected-output (presence/comparison shape, not a predicted literal, for the new processor). Baseline is fully witnessed and healthy — safe foundation for Phase 1 design.*

Confidence: 95 — All three scoped reads succeeded cleanly with no truncation, no read failures, and the harvested pipeline matches the task's stated current-state exactly; the only minor gap (collector version string) is explicitly flagged rather than assumed.


---

## Addendum B — What happened when it was applied

Applied 2026-09-11 03:44Z by a human operator, following the package's §6 ordering exactly. pAIchart was not involved.

| Package step | What the operator ran | Result |
|---|---|---|
| Back up the rollback source | `cp otelcol/config.yaml otelcol/config.yaml.pre-R3b3` | the §5 file, byte-identical (plus the file's two-line header comment, which the witnessed rendering had stripped — kept on purpose so a rollback lands on today's file, not a comment-short one) |
| §4 pre-apply validate | `otelcol validate --config=<desired-state file>` (run with the **same image the collector runs**) | no output, **exit 0** — as the package predicted |
| Whole-file replacement | swap the §3 file into the bind mount | diff against pre-change: the `memory_limiter` block + `[batch]` → `[memory_limiter, batch]`; nothing else |
| Restart (no hot-reload path for processor definitions) | `docker compose restart otel-collector` | container up in ~10 s |
| §4 post-apply presence check | read the as-deployed file | `memory_limiter {check_interval: 1s, limit_mib: 204, spike_limit_mib: 51}`; pipeline `[memory_limiter, batch]`; `batch: {}` unchanged; no `traces`/`logs` pipeline appeared |
| §6 second-order check | scrape-target health | `otel-collector` **down** for ~10 s (the transient flap the package told the operator to expect and to read *after* the config check), then both `otel-*` targets **up** |
| End-to-end | one OTLP POST to `:4318`, then a Prometheus query | `demo_requests_total{exported_job="demo-app"} = 42` — data flowing through the new processor chain |

The collector's own startup log is the line that proves the change took effect:

```
info  memorylimiter@v0.116.0/memorylimiter.go:75  Memory limiter configured
      {"kind": "processor", "name": "memory_limiter", "pipeline": "metrics",
       "limit_mib": 204, "spike_limit_mib": 51, "check_interval": 1}
```

**Where the package's expectations and the running system diverge — recorded, not hidden.** The package sized the limiter correctly against the container limit (`docker inspect` confirms 256 MiB), but nothing in the pipeline could see the collector's *current memory use* — the harvest surface exposes config, not runtime state. Before the apply, the collector's RSS was **183 MiB**, above the package's 153 MiB soft limit, which looked alarming. It wasn't: `memory_limiter` governs **Go heap**, not RSS, and heap was **17 MiB** — a tenth of the soft limit. And the collector exposes **no `memory_limiter`-named metric series** at this version; refusals surface on `otelcol_receiver_refused_metric_points` (which read 0). Both are things an author can only learn from the running system's *reply* to its config — the same "successor problem" the network-provisioning runs recorded in a different vocabulary. The operator's evidence pair for this change is therefore the startup log above plus `otelcol_process_runtime_heap_alloc_bytes` (the value the limiter actually governs), not the RSS series the package's arithmetic naturally suggests.

**Honest scope.** A local containerized stack stands in for a customer's observability platform. The harvest service authenticates with a lab credential, not pAIchart's per-user identity contract. Prometheus's running-config API returns a **normalized** rendering (comments stripped, defaults expanded) rather than file bytes — measured on this rig, 985 bytes vs. a 1,948-byte file — so for *Prometheus* changes the rollback is the normalized form, and the package taxonomy says so; the collector has no such API, which is why its file mount is the witnessed artifact here.
