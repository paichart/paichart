# The Observability leg — walkthrough (kept-file telemetry program)

**Worked example:** leg task `cmvr9ru84005oyxvt0tlvb2ux` "Author observability OTLP ingress sender restriction admitting exporter-range CIDR
(protocol: observability-config)". Its child stage is "Pipeline: OTLP Ingress Sender Restriction (Run 20261027-2254)"
(`cmvra9i4r00bvyxvtzun6hilu`). observability-config 1.10.0; Harvester, Architect and Reviewer on Sonnet 5, Author on Opus 5.5.

**The leg in one sentence:** the four-agent team turns "only the exporter range may send telemetry on 4317/4318" into **two line-level
edits** to the ingress proxy's config. The files are held by the platform **from the service that reads them, not from Git**.

**Read first:** `K8S-LEG-WALKTHROUGH.md` for the shared mechanics (the leg task, the three copies, the receipt, applying a package). What is
different here:
- the files come from the observability service, not a Git repo;
- three files are held and only one is changed;
- an **existing grant is replaced** rather than a new object created;
- the Reviewer raised a **non-blocking warning**.

## Stop 1 — The leg task

Same shape as k8s and terraform: a PIPELINE work order, the interface contract, and dependencies on the plan gate, the range gate and the
fabric leg.

Its description says the change is to **"platform-held files, not Git"**, reviewed against the platform's own diff. It notes that the contract's
`enforcer-absent` row is superseded by a gap rule if the declared ports carried no configuration at all. That did not happen here.

**Key takeaway:** *"Not every config lives in Git. Here the platform holds the files it reads straight from the running service, and the
review works the same way."*

## Stop 2 — The Harvester (read the current state)

**Where:** child stage → "Harvest current observability state for OTLP ingress sender restriction…" (template *Observability State
Harvester*). Artifacts: `result.json`, `held-bytes.manifest.json`. 7 calls, 61 s.

| Calls | What | Why it matters |
|---|---|---|
| 1–2 | read the service **descriptor**; `registry register` → `observability-readonly` | self-provisioned, read-only, removed at the end |
| 3 | `get_ingress_config` | returns the proxy's config files; **the platform holds two of them** |
| 4 | `get_otel_config` | returns the collector config; **held as a third file** |
| 5 | `stack_health` | liveness only (evidence, not a design input) |

**Which files are held, and why:** the service's **descriptor declares which tool results are files**. The platform captures exactly those, with
no agent involved in choosing or copying. The manifest lists:

| Handle | File | Lines | Changed later? |
|---|---|---|---|
| H1 | `/etc/nginx/conf.d/operator-access.conf` | 19 | no (a different listener, not the sender allowlist) |
| **H2** | `/etc/nginx/conf.d/otlp-ingress.conf` | 37 | **yes**, the enforcement point for 4317/4318 |
| H3 | `/etc/otelcol/config.yaml` | 37 | no (the collector behind the proxy) |

There is no Git commit (`sourceRevision`) here. The file came from the service, so an operator's base check compares the held base with
**the live file** (`held-base-check --live`), not with a repository.

**What it found:**
- **Existing sender restriction on 4317/4318: none.** Both server blocks say `allow all;` (a "brownfield" baseline).
- It quotes all three files whole. `quoteFidelity` is complete on all three.
- Explicit non-findings and scope notes. Nothing is changed.

**Key takeaways:**
- *"The platform knows from the service's own declaration which outputs are config files, and holds them byte-for-byte. The AI never chooses
  or copies them."*
- *"It held three files and found the real problem: both ports accept anyone."*

## Stop 3 — The Architect (design)

**Where:** "Design OTLP ingress sender restriction…" (template *Observability Change Architect*). One turn, 102 s.

**Branch conditions with evidence:** this is the leg where a **different branch** fires.

| Rule | Answer | Evidence | Outcome |
|---|---|---|---|
| `target-empty` | not confirmed | both listeners fully configured | — |
| `enforcer-absent` | not confirmed | a policy exists; it is just `allow all;` | — |
| **`existing-grant`** | **confirmed** | `allow all;` in both `location /` blocks | **replace**: the range becomes the only sender |
| `target-absent` | not confirmed | both listeners defined | — |
| `principal-unseen` | **untested** | nothing shows whether NAT/proxying rewrites the source address | act; record UNTESTED |

Its other sections:
- **which held file changes and why** (H2 only; H1 is another surface; H3 is behind the proxy);
- a per-target change list, an ordering map and the blast radius;
- the **collateral effect** (every sender outside the range loses 4317/4318);
- a name-collision check;
- baseline facts carried forward.

`markerPresence`: none. That is correct; this Architect did not mislabel the consumed range.

**Key takeaway:** *"The same requirement can need a different action per system: create a policy in Kubernetes and Terraform, replace an
open one here. The design says which branch applied and why."*

## Stop 4 — The Author (the change package)

**Where:** "Author config + validation + rollback for OTLP ingress sender restriction…" (template *Observability Config Rollback Author*).
Execution `cmvradpwk00llyxvti8bw9v2d`, Opus 5.5, 147 s.

**The package:**
1. **Branch outcome and UNTESTED premises** (taken from the Architect, not re-decided).
2. **Baseline evidence** quoted from the harvest and the held blocks.
3. **The collateral effect.**
4. **`## Held File Edits`, two blocks on H2:**
   - 4317 block: `allow all;` → `allow <range>; deny all;`
   - 4318 block: the same.
   - Each SEARCH anchors on `location / {` plus `allow all;` plus the line after, so it can only match its own block. `listen`, `http2`,
     body size, upstream targets and headers are all unchanged. H1 and H3 are untouched.
5. **`## Held File Rollback`:** `restore H2`, then a syntax check and a reload.
6. **`## Consumed Values`:** the range.
7. **Validation V1–V5**, in an operator sequence:
   - **V1:** capture the pre-apply HTTP status of each port. No literal exists, because the open config's responses were never captured,
     so it is labelled as a first-ever capture.
   - **V2:** `nginx -t` exit status → `0`.
   - **V3:** read the written file back, narrowed to the `allow`/`deny` lines. It expects exactly four lines at **18, 19, 31, 32**.
   - **V4:** no-regression read-back of H1.
   - **V5:** a post-apply behavioural check (deny side).
8. **Chosen-value rationale, ordering and apply governance** (the reload is operator-gated).

**The receipt:**
- Both edits applied, matched once at **lines 17 and 29**, 4 lines → 5 each.
- H2 base `cxo22l8xl263bxlvqmni7fg08` → candidate `cesaql3lusyxotrjuk46a747f` (hashes `32844314…` → `66a30906…`).
- H1 and H3 are listed with a base only: held, but no candidate, because nothing changed.
- Rollback: `["H2"]`.

**Platform facts:** `editApplication` applied 2/2 · `formCheck` 0 · `rollbackContainment` `restore-is-held-base` · consumed ✓.

**Key takeaways:**
- *"Two lines changed in one file; the other two files are proven untouched."*
- *"The validation reads back exactly which lines now say allow and deny, with their line numbers, before anyone reloads the proxy."*

## Stop 5 — The Reviewer and the leg's outcome

**Where:** "Review change package for OTLP ingress sender restriction…" (template *Observability Change Reviewer*). 158 s. It gets the
package and the platform diff; the fabric deliverable is excluded by design.

**What it checked:**
1. **Collision/fit:** every branch answer is properly sourced; `existing-grant` → replace matches the contract.
2. **Validation determinism:** V2–V4 are literal.
   - **It recomputed V3's line numbers itself** (each edit shifts later lines by one, so 17 → 18/19 and 29 → 31/32), and they match.
   - V1 and V5 use the sanctioned "first-ever state" shape, correctly labelled.
3. **Rollback adequacy:** `restore H2` against the held base.
4. **Held-diff fidelity:** every changed line in the platform diff is accounted for.
5. **Its own arithmetic** for the chosen value, before reading the package's table.
6. **Consumed value:** checked against where the artifact applies it; not recomputed.
7. **Apply governance.**

**Verdict:** `## VERDICT: APPROVED / Blocking issues: none / Confidence: 90`, **with one non-blocking warning** (`restated-conclusion`):
- The package's opening summary says the range is "used exactly as published", a conclusion stated outside the structured sections.
- The Reviewer checked it, found it true, and labelled the sentence instead of blocking. Its words: the sentence is a restated conclusion
  rather than a requirement.

**Platform facts:**
- `reviewerVerdict` approved with `warnings: [restated-conclusion]`. Warnings are transcribed as facts and carried into the leg's
  report, so they are not lost in prose.
- `reviewedEditDiff` `rendered` (Author `cmvradpw…`, candidate `d7e001f4`, diff `d7b8d6a3`).
- **Leg:** `qualityGate` approved 90; `heldEdit` applied, in scope, reviewer saw the rendered diff, not forced.
- **Containment:** `consuming-leg-consumed-discharged`, upstream green.
- **Teardown:** `observability-readonly` deleted.

**What the program used:** Node C checks 1, 3, 4 and 5. Check 5 for this leg reads "the change is to the configuration files its leg
harvested". The release AND and the human observability gate then followed.

**Key takeaways:**
- *"The reviewer recomputes the expected line numbers itself. It doesn't take the author's word for them."*
- *"A minor issue gets recorded as a labelled warning, not a block and not lost in the text, so you see it without the change being
  held up."*

## The leg in numbers

| | |
|---|---|
| Agents | 4 + the leg harness (2 runs) |
| Tool calls | Harvester 7 (read-only) |
| Held files | 3 (from the service, not Git); 1 changed |
| Wall time | about 10 minutes (22:54:33Z → 23:04:19Z) |
| Cost | $2.15 (today's prices) |
| Output | two held edits on H2 (`allow all` → `allow <range>; deny all`, both ports), 5 validation steps, rollback `restore H2` |
| Changed on the proxy | nothing (an operator applies it and reloads) |
