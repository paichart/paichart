# Observability Demo Use Case — IaC + GitOps/GitSecOps + Prometheus/Grafana/OTel

**Status**: DESIGN SKELETON (Phase-1 depth) — authored 2026-09-10 for a live customer conversation
(consultancy; asked for IaC pipeline, GitOps/GitSecOps, and modern stacks: Prometheus, Grafana,
OpenTelemetry). Domain fit: `PIPELINE-DOMAIN-FIT-CATALOG.md` §Observability (GO, 2026-09-10) +
§Terraform (shipped) + §K8s (seeded; one design-era run 2026-06-28, zero rounds — see the rounds gate below).
**Not a promise document** — nothing here is customer-facing until its internal rounds are green.

## What the customer sees (target demo shape)

A **program** — *"Stand up the observability pipeline"* — S2 sequenced, three legs, one interface
contract, human gates between legs, ending in a Grafana dashboard visibly live:

| Leg | Domain | Deliverable | Validation | Rig |
|---|---|---|---|---|
| 1. Metrics landing zone | terraform-iac (shipped, live-proven) | HCL package: metrics bucket + remote-write IAM | plan output + conftest policy | LocalStack :3113 (exists) |
| 2. Stack manifests | kubernetes-gitops (seeded; ONE design-era run 2026-06-28, zero rounds since) | kube-prometheus-stack values diff + otel-collector manifests + git-revert rollback | `kubeconform` + `kustomize build` + `conftest`/OPA (all offline — no cluster needed) | git repo as harvest source |
| 3. Live config change | **observability (new domain)** | scrape job + OTel pipeline + provisioned dashboard package | `promtool check config` / `otelcol validate` pre-apply; target `up` + dashboard present post-apply | compose rig on devext (~1 day build) |

**The GitSecOps framing is ours already, just unnamed**: policy-as-code gating in the package's own
validation (conftest/OPA), platform secrets hygiene (R10 both persist paths), independent reviewer
with structured verdicts, human-released gates, full persisted evidence trail including honest
refusals. Say the word "GitSecOps" over the machinery we run every day.

## Multi-cloud, tiered honestly

- **AWS**: live-emulated today (LocalStack). No caveats.
- **Azure**: plan-only leg against a real free-tier subscription with READ-ONLY credentials —
  `terraform plan` is a read; apply stays human-gated and out-of-band. This *demonstrates* the
  no-actuation moat on their actual cloud rather than weakening it. (~half day: sub + RO service
  principal + a tiny pre-provisioned resource group as brownfield.)
- **GCP**: validate/policy-only leg (`terraform validate` + conftest), or same plan-only shape
  later. **Do not fake emulation** — Azurite/GCP emulators are not credible and the demo's
  credibility is the product.

## Design decisions already made (don't relitigate without new evidence)

1. **Observability = new leg domain protocol**, not a network-provisioning variant (dialect
   machinery is EOS-specific). All four roles reuse; `change_reviewer`/`config_change_author`
   become FOUR-domain shared keys — abstract wording rule applies harder.
2. **Cross-leg contract values** (remote-write endpoint, bucket names): the `## Consumed Values`
   machine-check is a CLOSED kind set (`cidr`|`asn`) — carry these values in the contract without
   declaring them in the machine-checked block, OR do the toolkit-tier `name` kind first
   (`adding-a-containment-kind-toolkit.md`; pure membership, one reviewer). Never coin a kind
   (Tasman Run-1 false mismatch).
3. **Rig**: compose Prometheus+Grafana+otel-collector + thin read-only FastMCP harvest service
   (tf-mcp-readonly pattern), twin-suppressed from day one, read-only descriptor per the playbook's
   self-provision model.
4. **Where it runs**: prod hub + devext rigs via the proven tunnel shape, or the devext self-host —
   decide at scheduling time based on the E-series churn; do not demo on a mid-migration host.

## The gate that protects the customer relationship

**No leg domain fronts a customer without green internal rounds**: terraform is proven; the
observability domain needs its Tier-1 rounds; kubernetes-gitops has one design-era leg run (2026-06-28) and zero rounds — 2–3
rounds minimum (every domain's R1 found defects — FW took 5 rounds to green). The demo asset is the
run sheet + persisted artifacts (+ optionally the 2-minute video's observability successor), not a
live first attempt.

## Build order (each step gated on the previous)

1. Re-theme a terraform-iac run to the metrics landing zone (half day authoring; R1 internal).
2. Build the observability rig + harvest service (1 day); author the domain per
   ADD-A-PIPELINE-HARNESS-AGENT + the playbook; Tier-1 rounds.
3. First kubernetes-gitops live round (offline validators only — cheapest of the three to run).
4. Compose the program; decide the `name`-kind question when the contract is drafted.
5. Azure plan-only leg last (needs Steve's sub + credentials).

## Public README (decided, Steve 2026-09-10): evidence-paired only

The public `paichart/paichart` README does NOT mention observability until the domain ships with
its evidence: the "Four domains" section goes to five + the example change report link + the VT
doc, all in ONE commit, after R1–R3 are green — claim and machine record arriving together, per
the README's own credibility model. No roadmap line before then.

## Open customer questions (block Phase 2, not the fit verdict)

Their stack's specifics (managed Prometheus vs self-run? which OTel deployment pattern —
agent/gateway?), GitOps tool (Argo vs Flux — affects leg-2 rollback wording only), whether they
expect design-only or gated-apply demos, and which cloud(s) they actually operate.
