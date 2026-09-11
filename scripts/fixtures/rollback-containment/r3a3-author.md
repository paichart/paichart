Output format is unaligned.
## Change Package: node-exporter Host Alert + Recording Rule Group (R3a-3)

## 1. New Rule File — Full Content

**Path:** `/etc/prometheus/rules/node-exporter-host.yml` (**new file**; `/etc/prometheus/rules/platform.yml` is untouched)

```yaml
groups:
  - name: node-exporter-host
    rules:
      - record: instance:node_cpu_utilization:ratio
        expr: 1 - avg by (instance) (rate(node_cpu_seconds_total{job="node-exporter", mode="idle"}[5m]))

      - alert: HostHighCpuUtilization
        expr: instance:node_cpu_utilization:ratio > 0.85
        for: 10m
        labels:
          severity: warning
          tier: platform
        annotations:
          summary: "High CPU utilization on {{ $labels.instance }}"
          description: "Instance {{ $labels.instance }} CPU utilization has exceeded 85% for over 10 minutes (current value: {{ $value | humanizePercentage }})."
```

This transcribes Phase 1's design verbatim (recording rule listed before the alerting rule that references it, per in-group sequential evaluation order). No other file is modified.

## 2. Validation Facts

### 2a. Pre-apply — syntax check (operator runs, local, no stack contact)

```
promtool check rules /etc/prometheus/rules/node-exporter-host.yml
```
**Expected output (node-exporter-host.yml):**
```
Checking /etc/prometheus/rules/node-exporter-host.yml
  SUCCESS: 2 rules found
```
This is `promtool`'s documented deterministic success format for a syntactically valid rule file containing 2 rules (1 recording + 1 alerting) — not a stack-witnessed value, since the tool runs entirely against the local file.

### 2b. Post-apply — new group presence (FIRST-EVER state; no prior rendering exists to quote a literal from)

```
get_rules  (filter: groups[].name == "node-exporter-host")
```
**Comparison to perform (no literal possible — the group does not exist pre-apply, so nothing has ever displayed it):**
- Response contains one group object with `name: "node-exporter-host"`.
- That group's `rules[]` contains an entry with `name: "instance:node_cpu_utilization:ratio"` and `type: "recording"`.
- That group's `rules[]` contains an entry with `name: "HostHighCpuUtilization"` and `type: "alerting"`, `health: "ok"`.
- Exclude by name (volatile, non-deterministic across runs): `evaluationTime`, `lastEvaluation`, `lastEvaluationTime` (on the group and on each rule).

### 2c. Post-apply — recording-rule series exists (FIRST-EVER state; no prior rendering exists)

```
query_metric  (query: instance:node_cpu_utilization:ratio{instance="node-exporter:9100"})
```
**Comparison to perform (no literal possible — this series has never been recorded, so no float value can be predicted):**
- Result vector is non-empty (at least one series returned).
- The single returned series' labels include exactly `__name__="instance:node_cpu_utilization:ratio"` and `instance="node-exporter:9100"`.
- Exclude by name (volatile): the numeric `value` field itself, and the query's `timestamp`.

### 2d. Post-apply — node-exporter target health unaffected (regression check; literal available from the harvest — this state already exists and must not change)

```
get_scrape_targets  (filter: job == "node-exporter")
```
**Expected output (node-exporter:9100, static field only):**
```
"health": "up"
```
Baseline-diff scope: only the `health` field is asserted (harvested as `up`, no errors, Phase 0). Scrape timing fields (`lastScrape`, `lastScrapeDuration`) are excluded by name as volatile and irrelevant to the "unaffected" claim.

## 3. Rollback Plan

This is a **new file** addition; no existing file or config stanza is modified.

- **Action:** delete `/etc/prometheus/rules/node-exporter-host.yml`.
- **`rule_files` config:** no entry needs to be added or removed. The existing config uses a **glob pattern**, restated below as carried forward from the harvest (Phase 0 → Phase 1 baseline table; the raw `get_prometheus_config` rendering was not present in this task's chained context, so this is the Architect's restated fact, not a directly re-witnessed quote):

```yaml
rule_files:
  - /etc/prometheus/rules/*.yml
```

Because the new file matches this pre-existing glob, no `rule_files` line was ever added — deleting the file alone fully reverts the change. The operator should confirm post-rollback that `rule_files` in the running config still shows exactly the pattern above (unchanged) and that `platform.yml` / `platform-baseline` remain present via `get_rules`.

- **Post-rollback verification:**
```
get_rules  (filter: groups[].name == "node-exporter-host")
```
**Expected output (post-rollback):**
```
(no matching group — empty result)
```

## 4. Recommended Change Ordering + Apply-Governance Note

1. Operator places `node-exporter-host.yml` on disk at `/etc/prometheus/rules/`.
2. Operator runs **2a** (`promtool check rules`) — gate: proceed only on `SUCCESS: 2 rules found`.
3. Operator triggers a **Prometheus config reload** (`SIGHUP` or `POST /-/reload`). This is the **only** step that touches the live stack, and it is human-gated / out-of-band — no pipeline role performs it.
4. Run post-apply checks in this order: **2d first** (confirm `node-exporter:9100` still `up` — cheapest, proves the reload didn't break scraping), then **2b** (new group present), then **2c** (recording series populated — allow ≥1 evaluation cycle, i.e. ≥15s per the harvested `evaluation_interval`, before checking, since the recording rule must evaluate at least once to produce a series).

**Apply-governance / blast-radius note (doubles as this domain's maintenance-window note):**
- **Requires:** one Prometheus config reload (SIGHUP or `/-/reload`).
- **Blast radius:** additive-only change. If `node-exporter-host.yml` is invalid, Prometheus rejects the reload atomically and the previous config (including `platform-baseline`) keeps running unaffected — no downtime, provided the promtool gate (step 2) passed first. On a successful reload, only a brief (sub-second to low-single-digit-second) rule-evaluation/scrape-config restart occurs; no ingested data or existing series are lost; `platform-baseline`, all other scrape jobs (`prometheus`, `grafana`, `otel-collector`, `otel-exported`), and `node-exporter` scraping itself are not modified.
- **Check to run first post-apply:** 2d (`get_scrape_targets` health on `node-exporter:9100`) — it is the regression guard for the one shared dependency (the scrape target) that both the new rules and the existing `platform-baseline` rely on, and it is the cheapest/fastest signal that the reload itself was clean before assessing the new group's own correctness.

## 5. Baseline Evidence (restated for independent Reviewer verification)

| Fact | Value | Source |
|---|---|---|
| `rule_files` config | `/etc/prometheus/rules/*.yml` (glob) | `get_prometheus_config` (via Phase 1 restatement) |
| Existing rule file | `/etc/prometheus/rules/platform.yml` | `get_rules` |
| Existing group name | `platform-baseline` | `get_rules` |
| Existing rule names | `job:up:count` (recording), `InstanceDown` (alerting) | `get_rules` |
| New file | `/etc/prometheus/rules/node-exporter-host.yml` | this package |
| New group name | `node-exporter-host` — no collision with `platform-baseline` | this package |
| New rule names | `instance:node_cpu_utilization:ratio`, `HostHighCpuUtilization` — no collision with `job:up:count` / `InstanceDown` | this package |
| Target health at design time | `node-exporter:9100` — `up`, no errors | `get_scrape_targets` |

No name, path, or file overlap exists between the new group/file and the existing baseline group/file — collision-freedom is verifiable directly from this table without re-querying the stack.

**Open item carried forward (not resolved by this package):** the `0.85` / `10m` alert threshold and duration are justified in Phase 1 against a since-boot cumulative-counter average (~11.7% utilization), not an observed live `rate()` series — this is a design assumption, not a config or validation defect, and does not block this package's own steps (all of which are satisfiable independent of the threshold's tuning accuracy).

Confidence: 88 — Config, validation, and rollback sections are fully traceable to Phase 1's chained design and its harvested baseline facts; the only softened item is the `rule_files` quote, which is the Architect's restated table value rather than a raw `get_prometheus_config` rendering I directly witnessed (flagged explicitly in §3), and the alert-threshold assumption inherited from Phase 1 (flagged in §5).
