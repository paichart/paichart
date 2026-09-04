# Network-Provisioning Learning Spike — UAT

> **Status**: 🟢 Ready to run (UAT) · **Date**: 2026-06-16 · **Type**: build-to-LEARN, not build-to-ship
> **This is the playbook's Phase 5.3 "dry-run harness pass"** — run the pipeline end-to-end in UAT to
> learn whether the idea works and to de-risk the deferred blockers, *without* building the heavy
> security infra (R1 prod tool / R2 creds / R10 redaction stay deferred).

---

## Objective

Run the network-provisioning pipeline end-to-end in **UAT** to answer: *does the harness actually produce
a sensible, QA-gated change package for a provisioning intent — and does the confinement + self-provision
wiring work as designed?* UAT can't harm prod, so we exercise the **real** service-call + register flow
(not a mock of the harness), pointing at a **real-or-mock device/Ansible MCP endpoint**.

## What the spike validates (ranked by value)

1. **🔑 Confinement wiring works (answers open D2).** Do the three cognition templates, configured with
   `['project','perform','analytics','template','registry']`, **actually resolve at runtime to a grant
   that excludes `services`** — or does the seed→`mcpContext`→engine chain collapse to empty→all-six?
   This is a live platform question; observing the runtime grant answers it and de-risks the parked
   track-1 engine work.
2. **Core hypothesis: does the decomposition produce a sensible change package?** Intent → design →
   per-device config + deterministic validation + rollback → QA verdict.
3. **Self-provision lifecycle works** — register→update→call(read)→delete from inside the pipeline,
   landing the service `ACTIVE` via an auto-approving category. (Bonus: validates the transient model-B
   lifecycle end-to-end.)
4. **Deliverable/QA-gate split fits the domain** (config = `report.md` via `deliverableSourceTaskId`;
   Reviewer = `result.json` via `suppressDefaultReportMd`).
5. **Harness mechanics on a real multi-stage run** — protocol routing, template-type matching, context
   chaining of configs between stages, confidence aggregation, Guard 8 + the 4-point completion invariant.

## What the spike does NOT teach (the honest boundary)

A green spike means *"the pipeline idea works — now decide if the heavy infra earns its build,"* **NOT**
*"ready to ship."* It will not exercise: real device behaviour, **real secret redaction** (R10 — the mock
returns clean canned output), **SSRF resistance**, **credential handling** (R2), the **adversarial/injection
threat** (the parked engine gate), or **launch-authorization** (R8). Those need the real infra and stay
deferred. Do not let a green spike create false confidence that the deferred blockers are optional.

## Build surface (UAT only — provisional, NOT promoted to prod seed-as-shipped)

1. **Seed the protocol** `network-provisioning-protocol` in UAT from `PIPELINE_PROVISIONING_PROTOCOL.draft.md`,
   adding the self-provision opening/closing moves (register→update / delete) **encoded as explicit steps**
   (agent can't read `HOWTO-register-service`). Register under an **auto-approving category** (e.g.
   `automation`) — `security` would stall on admin approval.
2. **Author the templates** (template-system-specialist), provisional:
   - **Cognition trio** — `Network Design Architect`, `Config & Change-Package Author`, `Change Reviewer`:
     explicit `mcpTools = ['project','perform','analytics','template','registry']` (**omit `services`**).
   - **Network State Harvester** — holds `registry` (to self-register) **and** `services` (to call the read
     tool). For the spike, the Harvester does register→update→call(read); teardown `delete` runs at
     synthesize (or accept a manually-cleaned orphan row in UAT — see Observations).
3. **Device endpoint** — point the task at one of:
   - a **real** device/Ansible MCP server if one's reachable in UAT, **or**
   - a **mock MCP server** exposing read tools (`show_run`, `show_vlan`, …) that return canned fixtures.
   The mock is the lower-effort default and is sufficient for learnings #1–#5.
4. **Wire the protocol matcher** so a provisioning-intent task routes to `network-provisioning-protocol`.
5. **Test task** — e.g. *"Provision VLAN 220 (IoT) across campus distribution + access layer"* + the device
   service descriptor. **Two variants (run in order — one clean variable each):**
   - **Run 1 (descriptor provided directly):** the endpoint + schema is supplied with the task. Isolates
     learnings #1–#5 — a fetch/parse hiccup can't muddy whether the *pipeline* works.
   - **Run 2 (descriptor fetched from a reference — Steve, 2026-06-16):** the task carries only a **URL
     reference** (e.g. a GitHub raw link) to a **structured JSON descriptor**. The Harvester *harvests its
     own config* first: `services(call, targetService:'browser-automation-service', tool:'scrape_page',
     {url})` → extract named fields (protocol tells it which) → `registry(register/update)`. Validates the
     "don't fully load the task" ergonomics. Adds a fetch+parse failure mode + lengthens the trust chain
     (task→doc→endpoint = an SSRF surface; UAT-safe, prod needs a guarded fetch + R8). For run 2 the
     Harvester's grant also covers the fetch call (it already holds `services`).

## Run flow

`CREATE` (harness decomposes) → Harvester: `registry(register, automation, endpoint)` →
`registry(update, read tools)` → `services(call, show_*)` → Architect → Config-Author (deliverable) →
Reviewer (QA gate) → `SYNTHESIZE` (change package + status) → `registry(delete)` teardown.

## Observations to capture

- **#1 (critical) — runtime tool grant per child.** From the execution config / pino logs, record the
  effective `mcpTools` each child received. PASS = cognition trio has **no `services`**; Harvester has
  `services` + `registry`. (This is the D2 answer.)
- **Self-provision trace** — did `register` land `status:'ACTIVE'` (auto-approve)? did `update` attach the
  read tools? did the Harvester's `services(call)` succeed? did `delete` run (and if a failure orphaned the
  row, note it — that's the cleanup-on-failure learning)?
- **The deliverable** — `report.md` (change package) + `pipeline-index.json` (`resolvedMode`,
  `resolvedReasonCode`, confidence). Is the config/validation/rollback sensible?
- **Harness invariants** — Guard 8 generation budget + the 4-point completion invariant held; no
  unexpected `TOOL_FAILURES` / degradation; confidence aggregation looks right.
- **QA gate** — did the Reviewer produce a verdict that flips `approved`/`needs-revision` sensibly?

## Out of scope (stays deferred)

R1 prod read-only service (Zod-enum / SSRF-exempt internal service), R2 real credentials, R8 launch-auth,
R9/R10 device-output + deliverable redaction, the parked track-1 engine gate. The spike uses a mock/clean
endpoint precisely so none of these are on the path.

## Exit criteria → the decision it informs

Spike is **done** when we've observed #1–#5 (pass or instructive fail). It then informs the real call:
**is this pipeline worth building the deferred security infra for?**
- If the cognition output is genuinely useful + confinement wires correctly → the deferred blockers
  (R1/R2/R8/R10) earn their build; resume the playbook at "resolve blockers → re-review → Phase 6".
- If the decomposition is weak or the wiring fights us → we've learned that cheaply, and we park the use
  case with evidence rather than speculation.

## Owners

pipeline-harness-specialist (coordinate + protocol seed), template-system-specialist (provisional templates),
mcp-tool-architecture-specialist (mock service registration mechanics / auto-approve category), with
discovery-first per the standing instruction.
