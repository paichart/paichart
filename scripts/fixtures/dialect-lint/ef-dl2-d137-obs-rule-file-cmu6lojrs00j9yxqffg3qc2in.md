# Change Package — Telemetry-Loss Alert (aggregate; scoping infeasible per Phase 1 decision)

*Revision note: this pass closes three structural gaps found on review — (1) an Architect-carried gap (collector memory ceiling) that was dropped rather than restated; (2) a conflated paragraph mixing blast-radius fact with design-preference rationale; (3) an unhedged tool-output literal presented without naming it as an assumption. The two substantive harvest gaps (`evaluation_interval`, refused-counter name) and the <name----> escalation are unchanged — no new tool access this round, so they remain open exactly as flagged, not resolved.*

## ⚠️ Mandatory Escalation Notice — read first

This package delivers an **AGGREGATE** alert, not a `derivedRange`-scoped one. Per the Architect's Phase 1 finding, the harvested OTel collector pipeline has a single OTLP receiver with no per-sender identity/label mechanism, so scoping to `derivedRange` **cannot be achieved without a collector-topology redesign outside this leg's authority**. Per the program interface contract, `observabilityChangeGate` approval belongs to **<name---->** (`<email-redacted>`, userId `<id-redacted------------>`), whose track covers *"the concrete range PRODUCED BY THE FABRIC LEG, for alert scoping, plus every number the rule carries."* Since no range is consumed here, **her review must explicitly evaluate and accept the aggregate substitute** — this package is NOT ready for the standard three-way (cloud/cluster/observability) approval-parity treatment until she does. The Phase 3 Reviewer should treat this as a **blocking condition on production sign-off**, independent of the technical soundness findings below.

---

## Baseline Evidence (restated in full — Reviewer is 2 hops from the Phase 0 Harvester)

| Fact | Value | Source |
|---|---|---|
| Prometheus config file | `/etc/prometheus/prometheus.yml` | `get_prometheus_config` (verbatim) |
| Rule file glob | `rule_files: /etc/prometheus/rules/*.yml` | `get_prometheus_config` (verbatim) |
| Existing rule groups | `node-exporter-host-metrics` (`node-exporter-host.yml`), `platform-baseline` (`platform.yml`) | `get_rules` |
| Existing rule/group/file names scoped to exporter-source health | **none found** | `get_rules` |
| Target job | `otel-exported` → `otel-collector:8889` | `get_scrape_targets` |
| Job health at harvest | `up` | `get_scrape_targets` |
| Job scrape cadence | `scrape_interval: 15s`, `scrape_timeout: 10s` | `get_prometheus_config` (verbatim) |
| Job series count | 6 (`count({job="otel-exported"})`, untruncated) | `query_metric` |
| Collector pipeline | `receivers:[otlp @0.0.0.0:4317/4318]` → `processors:[memory_limiter(limit_mib:204, spike_limit_mib:51, check_interval:1s), batch]` → `exporters:[prometheus @0.0.0.0:8889]` | `get_otel_config` (as-deployed file mount, verbatim) |
| Labelling/routing processor present? | **No** — hard constraint driving the (b) decision | `get_otel_config` |
| Grafana dashboards | `node-exporter-host-metrics`, `stack-overview` — none scoped to telemetry-loss | dashboard inventory |
| `derivedRange` | **absent** from all chained context reaching this pipeline; not consumed by this design | Phase 1 / program contract |
| Global `evaluation_interval` | **NOT harvested** — Phase 0 captured `rule_files` and per-job scrape settings only, not the global evaluation cadence block | gap, §5.2 |
| "Refused"/dropped-points counter name (job=`otel-collector`, port 8888) | **NOT confirmed** — only `otelcol_process_uptime` was witnessed at that job | gap, §1 |
| Collector container/cgroup memory ceiling | **NOT discoverable** via the harvest tools available — only the internal `memory_limiter.limit_mib: 204` config value is known, not the enclosing container/cgroup limit it is sized against | gap carried unchanged from Phase 1 ("Gap 1"); **not used by any value in this rule** (this package sets no memory-limiter thresholds), but restated here because it remains an open Architect-carried fact and would gate a future (a)-branch collector redesign |

Collision check (unchanged from Phase 1, independently restated): new file `telemetry-loss.yml`, new group `telemetry-loss-alerting`, new alert `TelemetryExportPipelineDown` — none collide with the two existing files/groups or their alerts (`HostHighCpuUtilization`, `InstanceDown`).

**No collector/relabeling config file is part of this package.** Phase 1 selected branch (b) — scoping declared infeasible — so there is no scoping-config artifact to author; only the rule file below changes.

---

## 1. Desired-State Config File — FULL, new

**File:** `/etc/prometheus/rules/telemetry-loss.yml` *(CREATE — no such file exists today; lands automatically under the harvested `rule_files: /etc/prometheus/rules/*.yml` glob, so `prometheus.yml` itself is NOT edited)*

```yaml
groups:
  - name: telemetry-loss-alerting
    rules:
      - alert: TelemetryExportPipelineDown
        expr: up{job="otel-exported"} == 0
        for: 45s
        labels:
          severity: critical
          scope: aggregate
        annotations:
          summary: "Telemetry export pipeline (otel-collector:8889) is down"
          description: "The otel-exported scrape target has been down for at least 45s (3 consecutive missed 15s scrapes). This is an AGGREGATE signal across ALL exporter sources — it is NOT scoped to derivedRange. Scoping is not achievable against the current OTel receiver topology (single OTLP listener, no per-sender identity/label mechanism). See escalation note: requires <name----> (observabilityChangeGate) sign-off on the aggregate substitute before production reliance."
          scoping_status: "AGGREGATE — escalation to <name----> required"
```

**Deliberately NOT included — "refused"/dropped-points clause.** Phase 1 flagged that no refused/dropped-metric-points counter was confirmed on `job="otel-collector"` (only `otelcol_process_uptime` was witnessed). Per anti-fabrication rules, no such expression is authored here. **Follow-up required before this rule set is complete:** a Phase 0-style `query_metric` sweep against `job="otel-collector"` for candidate `otelcol_processor_*_refused_*` / `otelcol_exporter_*_send_failed_*` series, then a second Author pass to add the clause once a real metric name is witnessed.

**No `interval:` set at the group level** — see Chosen-Value Rationale §5.2 below; this is a design decision under an open gap, not an omission.

---

## 2. Deterministic Validation Facts

### Pre-apply (operator runs, this package does not execute)

```
promtool check rules /etc/prometheus/rules/telemetry-loss.yml
```
**Expected output — ASSUMPTION, flagged explicitly:** this file has never been checked by any promtool invocation this pipeline witnessed, so no captured rendering exists. The text below is promtool's documented, version-stable SUCCESS format for a syntactically valid single-rule file, not a live capture:
```
Checking /etc/prometheus/rules/telemetry-loss.yml
  SUCCESS: 1 rules found
```
**Caveat the operator should confirm once:** if the installed promtool build's output phrasing differs (e.g. a fork or a pinned older/newer binary), treat this block as the *expected format contract*, not a guaranteed byte-for-byte match — the operator's first real run against this file is the actual witness, and any deviation in wording (as opposed to a reported failure) is not itself a defect signal.

```
otelcol validate --config=<collector-config-path>
```
**N/A for this package.** No collector config file is modified (Phase 1 branch (b) — no relabeling/routing change). This validator is not invoked because there is nothing to validate on the collector side. If a future revision reverses to branch (a), this step becomes required and must cite a real capture of that revision's collector config.

### Post-apply (against the harvest surface — first-ever state, sanctioned presence/comparison shape, no predicted literals)

**Check 1 — rule group presence (`get_rules`).** No rendering of this group has ever existed (CREATE), so no literal is predictable. Comparison to perform: query `get_rules` and confirm presence of a group named exactly `telemetry-loss-alerting` containing an alert named exactly `TelemetryExportPipelineDown`, with `health` reported as `ok` and `type` as `alerting`. Exclude by name (volatile, expected to vary run-to-run): `evaluationTime`, `lastEvaluation`, `state` (transitions `inactive`→`pending`→`firing` over the `for:` window and is not itself a pass/fail signal at first check). *Why no literal: this rule group has never been evaluated by Prometheus before this apply — nothing has ever displayed it.*

**Check 2 — target health, no-regression (`get_scrape_targets`).** This is a baseline-diff claim, not a first-ever state: harvested baseline showed `job="otel-exported"` → `otel-collector:8889` → `health: "up"`. Static fields to re-compare post-reload: `scrapePool` (`otel-exported`), `scrapeUrl` (`otel-collector:8889`), `health` (`up`). Volatile fields excluded by name: `lastScrape`, `lastScrapeDuration`. A rule-file reload only touches the evaluation loop, not scrape scheduling, so these static fields are expected to be byte-identical to the harvested baseline — any deviation is a regression signal, not an expected side effect of this change.

**Check 3 — series continuity (`query_metric`).** Baseline (harvested, untruncated): `count({job="otel-exported"})` = 6. Post-apply comparison: re-run the same query and confirm the count is still 6 (±expected exporter churn unrelated to this change — none is expected, since this change adds no receiver/pipeline component). This is a static-field/no-regression comparison, not a literal-value prediction, because the rule addition does not touch the scrape/export path.

---

## 3. Rollback Plan (per taxonomy, per artifact class)

**Artifact class touched: Prometheus config (rule file).** Rollback-quotable per taxonomy — but this is a **CREATE**, not a modification: the harvest confirmed **no prior file existed** at `/etc/prometheus/rules/telemetry-loss.yml` (existenceAssumptions: "No rule scoped to the exporter sources exists today"). There is no prior verbatim content to quote or restore.

**Rollback procedure:**
1. Delete `/etc/prometheus/rules/telemetry-loss.yml`.
2. Trigger a Prometheus config reload (same mechanism as apply — see §4).
3. Confirm via `get_rules` that group `telemetry-loss-alerting` is absent (mirrors Check 1's presence test, inverted).

**Artifact classes NOT touched — explicit per-class statement, not silence:**
- **Collector (OTel) config** — no change made; the taxonomy's file-mount rollback source does not apply because there is nothing to roll back.
- **Grafana dashboard** — no change made; no provisioned FILE was created or modified, so the taxonomy's "prior provisioned FILE, always" rollback source has no target.
- **Grafana datasource** — no change made; the taxonomy's redacted-rendering caveat is moot since no datasource config was authored or would ever be authored from it.

---

## 4. Ordering + Apply-Governance Note

| Step | Action | Owner |
|---|---|---|
| 1 | Place `telemetry-loss.yml` at `/etc/prometheus/rules/` | Operator (out-of-band) |
| 2 | Run `promtool check rules` pre-apply (§2) | Operator |
| 3 | Trigger Prometheus reload: `curl -X POST http://<prometheus-host>:9090/-/reload` (or `SIGHUP` to the Prometheus process) | Operator |
| 4 | Run post-apply Checks 1–3 (§2), in that order | Operator |
| 5 | **Escalate this package to <name---->** for aggregate-alert acceptance | Operator / Program |

**Apply mechanism (fact):** Prometheus config reload only. The file already falls under the existing `rule_files: /etc/prometheus/rules/*.yml` glob (verbatim, harvested), so **no edit to `prometheus.yml` itself is needed** and no Prometheus restart is required.

**Blast radius (fact):** Sub-second pause in **rule evaluation only**, while Prometheus re-parses the rule set. Scrape targets, scrape scheduling, and already-stored series are **unaffected**. No collector restart. No Grafana provisioning re-scan (no dashboard/datasource change in this package).

**Maintenance window: not required.** A rule-file reload is a hot, in-process re-parse with no data-path interruption (declared per harvested apply mechanics, not assumed) — the only observable effect is the momentary rule-evaluation gap above, which does not affect scrape ingestion or existing alert states beyond the new group being added.

**Design-preference note (kept separate from the blast-radius fact above, not merged with it):** this low-blast-radius apply path is also *why* Phase 1 preferred the aggregate design over a collector-topology redesign for scoping — a collector-side change would additionally require an `otel-collector` restart, interrupting in-flight telemetry from every sender, not just the ones a scoped rule would have targeted. This is a design rationale, distinct from the apply-mechanics fact above.

**First check to run post-apply:** Check 1 (rule group presence) — it is the only check that directly confirms the change took effect at all; Checks 2 and 3 confirm the change caused no regression elsewhere and should follow, not precede, confirmation that the rule loaded.

---

## 5. Chosen-Value Rationale — every threshold/window number

### 5.1 — `for: 45s`

**Harvested quantity sized against:** `scrape_interval: 15s`, `scrape_timeout: 10s` for `job="otel-exported"` (verbatim, `get_prometheus_config`, restated from Phase 1).

**Alternatives compared, arithmetic shown, at the harvested state:**

| Candidate | Missed scrapes covered | Reasoning | Verdict |
|---|---|---|---|
| `for: 15s` | 1 (15s/15s) | A single missed/slow scrape (bounded by `scrape_timeout: 10s`) can occur from a transient GC pause or network blip without a real outage; fires on the very first miss | Rejected — too noisy |
| `for: 30s` | 2 (30s/15s) | Filters single-scrape noise but two consecutive misses can still occur from a brief network partition; marginal | Rejected — still within plausible transient range |
| **`for: 45s`** | **3 (45s/15s)** | **Requires 3 consecutive missed scrapes — filters single- and double-scrape transients, matches Phase 1's stated "3-4 consecutive missed scrapes" band, detects a genuine outage within 45s** | **Chosen** |
| `for: 60s` | 4 (60s/15s) | One additional scrape cycle (+15s) of detection latency vs. 45s, for marginal additional debounce beyond what 3 misses already provides | Rejected — detection speed favored once 3-miss debounce is already achieved |

**Comparison at any other approved-but-unapplied change to this stack:** none is named in this task's chained context or the program contract for the observability stack — no other pending observability change is on record, so no second comparison point applies beyond the harvested baseline above.

**What an operator must revisit:** If `scrape_interval` for `job="otel-exported"` is ever changed from 15s (e.g. a fleet-wide scrape-cadence retune), this `for: 45s` window must be recalculated to preserve the "3 consecutive missed scrapes" design intent — it is a derived multiple of the interval, not an independent constant. If `scrape_timeout` is widened materially beyond 10s, the debounce math should also be re-examined, since a longer timeout narrows the gap between "slow" and "missed."

### 5.2 — rule-group evaluation interval

**Value chosen: none set explicitly** — the group has no `interval:` key, so it inherits Prometheus's global `evaluation_interval`.

**Why this is a flagged gap, not a fabricated number:** Phase 0's harvest of `get_prometheus_config` captured `rule_files` and the per-job scrape block for `otel-exported`, but **did not capture the global `evaluation_interval` value** from the config's global block. Per the anti-fabrication rule, no number is invented here.

**Design decision under the gap:** defer to the Prometheus global default rather than guess a value that might conflict with it.

**What an operator must revisit before relying on the 45s detection latency designed in §5.1:** confirm the actual global `evaluation_interval` via `get_prometheus_config`'s global block before treating "fires within 45s of onset" as accurate.
- If global `evaluation_interval` ≤ 15s (matches or is tighter than the scrape cadence): the 45s `for:` window behaves as designed — the rule is evaluated at least as often as scrapes land, so the 3-miss threshold is checked promptly.
- If global `evaluation_interval` > 45s (e.g. a coarser fleet-wide default such as 1m or more): the alert **cannot fire at the designed 45s latency** regardless of the `for:` value, because Prometheus only checks `for:` satisfaction each time it evaluates. In that case, this rule group needs an explicit `interval:` key sized to the same 15s-scrape-interval reasoning as §5.1 (e.g. `interval: 15s`), and this package should be revised accordingly — do not treat 45s as guaranteed detection latency until the global value is confirmed.

---

## Confidence: 72

Improved from the prior pass by closing three structural gaps that were genuinely fixable without new tool access: (1) restated the Architect's "Gap 1" (collector memory/cgroup ceiling) in baseline evidence rather than dropping it, with an explicit note on why it doesn't affect this rule's values; (2) split the blast-radius fact from the design-preference rationale in §4, which had been conflated; (3) hedged the promtool expected-output block as a named format assumption rather than an unqualified literal. These are real completeness/anchoring fixes, not cosmetic ones — hence the score moves up from 68. It stays in the 70s rather than higher because the two substantive harvest gaps are still genuinely open and unresolved by this pass (no tool access this round): the global `evaluation_interval` is unconfirmed, so the designed 45s detection latency is not yet guaranteed, and the "refused" telemetry-loss clause remains unauthored pending a metric-name harvest. Both are correctly flagged rather than fabricated, which is the right outcome, but their unresolved state — plus the still-open <name----> escalation as a governance blocker — caps how far above "needs revision" this package can honestly sit until a further harvest pass runs.