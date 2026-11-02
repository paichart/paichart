# The Kubernetes leg — walkthrough (kept-file telemetry program)

**Worked example:** leg task `cmvr9ru4e005ayxvtqf24dm6g` "Author Kubernetes NetworkPolicy admitting exporter-range CIDR (protocol:
kubernetes-gitops)", inside program root `cmvr9hd78000uyxvn32ctl8xc`. Its own child stage is "Pipeline: K8s NetworkPolicy Exporter CIDR (Run
20261027-2254)" (`cmvra9e6x00bdyxvtpzbi98fk`). kubernetes-gitops 1.18.0; Harvester, Architect and Reviewer on Sonnet 5, Author on Opus 5.5.

**The leg in one sentence:** a small team of four agents (read, design, write, check) turns "admit the exporter range on 4317/4318 for the
telemetry receiver" into one reviewed edit to the team's own manifest file. Nothing is applied anywhere.

## Stop 1 — The leg task (the pipeline)

**Where:** program stage "Program: Telemetry Export Authorisation (Run 20261027-2233)" → the task above.

**What it is:** a PIPELINE task, a work order for a coordinator agent (the *harness*). `(protocol: kubernetes-gitops)` in the title selects
the playbook.

**What it received:**
- **Description:**
  - the objective (a NetworkPolicy for `app.kubernetes.io/component: telemetry-receiver` in `trading`, only the derived range, TCP
    4317/4318);
  - **the file the change is made to** (`paichart/paichart-lab-configs`, ref `main`, `k8s/sample-workloads.yaml`);
  - the read-only cluster service's descriptor URL;
  - the rules: never recompute the range, state the collateral effect, escalate if the range is missing.
- **Interface contract** (task metadata, `interfaceContractSource`): the program-wide agreement (namespace, selector, ports, branch rules). It
  is the Program Architect's copy, stored by the platform (`source: plan`).

**What it waits for (dependencies):**
- the plan gate;
- the range gate;
- **the fabric leg itself**. That is the data edge: the range rides it. A gate only says "go".

**What its harness did:**
- **Run 1 (CREATE):** built read → design → write → check, with the Author also wired straight to the Harvester so it quotes the evidence
  itself.
- **Run 2 (SYNTHESIZE):** collected the results, stamped the leg's outcome (`qualityGate`), and tore down the read-only service.

**Key takeaway:** *"Every domain gets its own small team and its own playbook. The program hands it only the goal, the file, and the agreed
constraints."*

## Stop 2 — The Harvester (read the current state)

**Where:** child stage → "Harvest current cluster state for NetworkPolicy admitting exporter-range CIDR" (template *Cluster State
Harvester*). Artifacts: `result.json`, `held-bytes.manifest.json`.

**What it did:** 23 tool calls, all succeeded, 123 s, read-only.

| Calls | What | Why it matters |
|---|---|---|
| 1 | read the service **descriptor** (public JSON) | the agent learns how to connect from a published file |
| 2 | `github-service.get_file_contents` → `k8s/sample-workloads.yaml` @ `main` | **the kept-file read**: the platform captures these bytes as held file **H1** |
| 3 | `registry register` → `k8s-rig-readonly` | **self-provisions** a read-only connection for this run only (removed at the end) |
| 4–20 | 17 narrow reads in `trading`: pods, services, NetworkPolicies, quotas, limit ranges, PDBs, endpoints, secret **names** only, the Deployment, a ConfigMap | scoped, never a cluster-wide dump; never secret values |

**What it produced (report sections):**
- the selector match report (**0** telemetry-receiver pods, as a fact);
- port usage (nothing on 4317/4318);
- **Repo Read — Held File H1** (the whole file quoted);
- the **drift comparison** of each object the file declares against live (all **no drift**; the witness is `last-applied-configuration`);
- the containing population (every pod with its labels);
- **`## Harvested Allocations`** (machine-readable in-scope addresses: 2 pod IPs, 1 service IP).

**Platform facts (in `result.json`; the agent does not write them):**
- `heldBytes`: 1 file held (`github:paichart:paichart-lab-configs` / `sample-workloads.yaml`, 64 lines, 1,598 bytes, 0 redactions). The
  manifest artifact lists it.
- `quoteFidelity`: the agent's quote equals the bytes read (`all-quotes-complete`, no findings).
- Later agents edit **the held copy**, never the quote.

**Key takeaways:**
- *"The AI never types your config file. The platform reads it from your Git repo and holds those exact bytes."*
- *"It checks your repo against what is actually running before anyone designs anything."*

## Stop 3 — The Architect (design)

**Where:** child stage → "Design NetworkPolicy admitting exporter-range CIDR" (template *Workload Architect*).

**What it is given:** the Harvester's report (chained context) and the fabric leg's deliverable with the range, inherited from its leg
(`chainedContext`: 1 predecessor + 1 inherited cross-pipeline entry). Also the contract and its role instructions.

**What it did:** one turn, no reads, 79 s. Design works only from the evidence it is handed.

**What it produced:**

1. **Branch conditions, each answered with its deciding evidence:**

   | Rule | Answer | Outcome |
   |---|---|---|
   | `enforcer-absent` | confirmed (0 policies on the receiver) | **create** |
   | `existing-grant` | not confirmed | nothing to replace |
   | `target-absent` | not confirmed (`trading` answered) | proceed |
   | `target-empty` | confirmed (0 pods) | **act anyway**; report 0 as a fact |
   | `principal-unseen` | **untested** (no path/CNI visibility) | act; record UNTESTED |

2. **The change:** create `NetworkPolicy/trading/telemetry-receiver-ingress` as **one more document in H1**. `orders-api-ingress` is explicitly
   unchanged.
3. **Collateral effect, stated:** a selected receiver pod is closed on every other port.
4. **Handoff to the Author:**
   - edit H1 by reference only;
   - stamp the range in `## Consumed Values`;
   - restate the constraint evidence (LimitRange, ResourceQuota, PDB: 0 each).

**The Architect edits nothing.** It writes the design; the Author writes edits; the platform applies them (see *The three copies*).

**Key takeaways:**
- *"Every decision is written down with the evidence behind it. What cannot be checked is labelled UNTESTED, not guessed."*
- *"It says in writing what it will not touch."*

⚠️ **Know this if a customer compares legs:** this Architect carried the range under `## Derived Values` (a heading for values the leg
computed itself) rather than as a consumed value.
- So the k8s leg's containment fact reads `checked-clean`, while the terraform and observability legs read `consuming-leg-consumed-discharged`.
- It is the same correct value with the same benign outcome. The Author declared it correctly as `## Consumed Values`.
- Filed as register K8S-ARCHITECT-CONSUMED-AS-DERIVED.
- **Changed 2026-10-31 (D3).** The platform now checks a value carried under `## Derived Values` that equals an upstream value as CONSUMED: a
  new run of this leg reads `consuming-leg-consumed-discharged` with `carriedInDerivedBlock` naming the carried value, like the other two.
  This run's stored fact still reads `checked-clean` (stored facts are never rewritten), and that clean said less than it looks: the six
  fabric members were checked against this leg's own harvest, which never held them. The value itself was right — Node C checked it
  against the fabric leg.

## The three copies — who changes what (read before Stop 4)

| Copy | What it is | Who changes it |
|---|---|---|
| **The source file** in the team's Git repo | the real file | **nobody during the run**; the platform reads Git once and never writes |
| **Held base** (H1) | an exact byte copy of what was read, hashed, with the commit it came from | nobody; the fixed reference |
| **Held candidate** | the base with the Author's edits applied, hashed | **the platform**, mechanically, not an agent |

**"Applied 1/1"** means the platform applied the Author's one edit to the base and produced the candidate. The Reviewer checks the
platform-rendered difference between them, not the Author's description.

**How a person applies the change afterwards:**
1. **Read the edits** in the GUI: the Author task's report → `## Held File Edits` (SEARCH/REPLACE) and `## Held File Rollback` (`restore H1`).
2. **Get the exact bytes** with MCP (owner/team/admin, audited):

   ```
   project({ action: "held.get", executionId: "<Author execution id>", handle: "H1", kind: "BASE" })
   project({ action: "held.get", executionId: "<Author execution id>", handle: "H1", kind: "CANDIDATE" })
   ```

   Each returns the file plus its hash, repo (`target`), `path` and `sourceRevision` (the commit). There is no GUI view of the bytes yet
   (register HELD-FILES-GUI-VIEW).
3. **Base check** with your own GitHub login (`held-base-check.ts --git`). MATCH means the base is the file at that commit and it is
   unchanged at the branch head. Otherwise stop and re-run.
4. **Apply through your normal flow:** a PR with the candidate (or the same edits), CI runs the package's validation steps, merge, and the
   reconciler or `kubectl apply` takes it. **Rollback** = `restore H1` (the held base).

Reference: `../PIPELINE-HARNESS-USER-GUIDE.md` *Applying a kept-file package safely*.

**Key takeaway:** *"The AI proposes edits. The platform applies them to a sealed copy of your file so the reviewer sees the exact diff.
Your repository changes only when your own people merge it."*

## Stop 4 — The Author (the change package)

**Where:** child stage → "Author manifests + validation + rollback for NetworkPolicy admitting exporter-range CIDR" (template *Manifest
Rollback Author*). Execution `cmvraexv600lyyxvt34jt0oya`. Artifacts: `result.json` and **`edit-application.manifest.json`**.

**What it is given:** the Harvester's report and the Architect's design (2 predecessors, both chained directly), plus the fabric leg's
deliverable inherited from its leg. It sees H1 rendered with line numbers.

**What it did:** one turn, Opus 5.5, 143 s, about 17.6K characters of package.

**The package (report sections):**
1. **`## Held File Edits`:** one SEARCH/REPLACE block on H1.
   - SEARCH: the last two lines of `orders-api-ingress` (`ports:` / `- { protocol: TCP, port: 80 }`).
   - REPLACE: the same two lines, then `---` and the new `NetworkPolicy/trading/telemetry-receiver-ingress`.
   - The anchor lines are copied back unchanged, so `orders-api-ingress` stays byte-identical.
2. **`## Held File Rollback`:** `restore H1`. An operator note adds that plain `kubectl apply` does not delete a removed object, so without
   a pruning reconciler the policy must be removed as a separate step.
3. **Collateral isolation effect:** a receiver pod is closed on every other port, including from other pods.
4. **Validation, V1–V9, offline:** each is a command plus the literal output it must print.
   - V1 kubeconform: 5 → 6 resources, all valid.
   - V2–V6: a scratch kustomize render, then checks on the new policy's selector, its single sender (`1 1 <range> false`) and its ports.
   - V7–V9: a scratch OPA/conftest gate that passes on the edit and **fails on a widened /24**, proving the gate can fail.
   - The package also says which checks print something different before the change, i.e. which ones prove the change happened.
5. **Ordering and apply governance:** independent of the other legs; no disruption at apply (0 matching pods); the `orders-api` path is
   untouched.
6. **The evidence restated:** namespace constraints (none), the chosen-value rationale, the drift decision (none), and the branch answers
   carried from the design, plus the **UNTESTED premises** (CNI enforcement of `ipBlock`).
7. **`## Consumed Values`:** `[{"kind": "cidr", "value": "<the range>"}]`. A machine-parsed declaration; the platform checks it equals what
   the fabric leg derived.

**The receipt: `edit-application.manifest.json`** (written by the platform, not the Author):

| Field | This run |
|---|---|
| `state` | `applied` (alternatives: `partial` / `refused` / `unheld`, which force needs-revision) |
| `refWrite` | `committed`: the candidate was saved in the same transaction as the Author's result |
| `files[0]` | H1 `/k8s/sample-workloads.yaml`, `baseRefId c8ouf3rm7z8rnfzkay1680jmk`, `candidateRefId cfsrngrlonikskqonbofwbkrt`, plus the versions of what the Author was shown (`r9Version`, `viewVersion`) |
| `edits[0]` | block 1, `edit`, applied; the SEARCH matched **once, at line 63**; 2 lines → 20; no refusals |
| `packageRefusals` / `rollback` | none / `["H1"]` |

`project({ action: "held.get", refId: "<candidateRefId>" })` fetches the candidate directly (owner/team/admin, audited). The rule that a
SEARCH must match **exactly once** is what makes the edit mechanical: zero or two matches and the platform refuses the edit rather than
guessing.

**Platform facts on the Author (`result.json`):**
- `editApplication`: the manifest's summary, applied 1/1, base hash `b1ce7436…` → candidate `dd5d0e79…`.
- `markerPresence`: consumed ✓ (the Author declared the value correctly).
- `formCheck`: 0 hits (no malformed diff hunks).
- `rollbackContainment`: not checked, `restore-is-held-base`. Rollback is the held base itself, so there is nothing retyped to check.
- `quoteFidelity`: no pairable quotes. The Author quoted no harvested file; it edited by reference.
- `applyBlockPlaceholder`: 0 (no redacted secret inside anything to apply).

**Key takeaways:**
- *"The AI writes a few lines of edit, not your file. The platform applies them and gives you a receipt: which line, matched exactly
  once, and sealed before-and-after copies."*
- *"Every validation step has its exact expected output, and one test proves the policy gate would fail on a wider range."*

## Stop 5 — The Reviewer and the leg's outcome

**Where:** child stage → "Review change package for NetworkPolicy admitting exporter-range CIDR" (template *GitOps Change Reviewer*). Execution
`cmvrai12400ndyxvtx0gk3w0z`. Its report is not published separately (`suppressDefaultReportMd`): the Author's package is the leg's
deliverable, and the Reviewer is its quality gate.

**What it is given (and deliberately not given):**
- **Given:** the Author's package (its one predecessor) and the **platform-rendered diff** of H1 (base → candidate).
- **Not given:** the fabric leg's deliverable (`inheritedSkipped: role-excluded`, by design: a second document to review muddies the
  review) and the raw harvest. So it judges the package and the diff, not the source evidence directly.

**What it did:** one turn, Sonnet 5, 130 s. Every finding is graded **VERIFIED-AGAINST-EVIDENCE** ("I checked this myself") or
**ACCEPTED-FROM-CLAIMS** ("I am trusting the package").

| # | Checked | Grade |
|---|---|---|
| 1 | The held edit: the SEARCH occurs exactly once; REPLACE copies the anchor back; **the platform diff shows exactly +20 / −2**, every line accounted for; all other objects are unchanged context | verified |
| 2 | `## Consumed Values` present and equal to the `ipBlock.cidr` in the edit (also pinned by V5/V8/V9) | verified |
| 3 | Grant scope: Ingress only, one rule, one peer, no `except`, TCP 4317/4318, exact selector and namespace; nothing broader | verified |
| 4 | Collateral effect stated; the CNI/SNAT premises correctly marked UNTESTED | verified |
| 5 | Validation: every step is a command followed by a literal output; V9 proves the gate can fail | verified |
| … | Drift decision: well structured, but the raw harvest is not in its context | **accepted-from-claims** (and it says so) |

`evidenceGrading`: 10 lines verified, 1 accepted. It also checked for widening, self-graded "PASS" tables, unsupported "requirement met"
claims, and stray injection text, and found none.

**Its verdict** (the last lines, parsed by the platform): `## VERDICT: APPROVED / Blocking issues: none / Confidence: 90`.

**Platform facts on the Reviewer:**
- `reviewerVerdict`: approved, 0 blocking, 0 warnings. That is the parsed verdict, so no later agent has to re-read prose to know it.
- **`reviewedEditDiff`:** `state: rendered`, naming the Author execution it reviewed (`cmvraexv…`), the candidate digest (`5f554bd6`) and
  the diff it saw (`e7f12b0b`). This is the proof the Reviewer saw the platform's diff of **this** Author's candidate, not a stale or
  different one.

**The leg's outcome (the leg task's metadata, stamped at the leg's SYNTHESIZE):**
- `qualityGate`: outcome **approved**, reviewerScore 90, reviewerPresent true.
- **`qualityGate.heldEdit`:** `state: applied`, `inScope: true`, `reviewerSaw: rendered`, `forced: false`, `agentOutcome: approved`.
  - The platform writes this **carrier**, not an agent.
  - It could force `needs-revision` (an edit not applied, the Reviewer not having seen the diff, a file written out whole, a source read
    outside the pin). Here it had nothing to force.
- **Teardown:** the self-provisioned `k8s-rig-readonly` registration was deleted (17 interactions removed).
- **The leg's deliverable:** the Author's package as `report.md`, which is what the program tier reads.

**What the program tier took from this leg:**
- **Node C** received the leg's deliverable in its chained context, read the leg's facts (outcome, `heldEdit`, containment), and checked
  conformance against the contract.
  - Same range as the fabric leg (check 1); no widening (check 3); coverage (check 4).
  - The change is to the named held file, applied, nothing else changed (**check 5**).
- **The release AND** used the leg's `qualityGate.outcome` (approved), its containment disposition (benign), and coverage.
- **The k8s change-package gate** (human) was released after a person read the held edit.

**Key takeaways:**
- *"The reviewer checks the platform's own diff of your file, line by line, not the AI author's description of it."*
- *"It says what it verified itself and what it took on trust, so you know exactly how much weight each finding carries."*
- *"The platform records that the review covered this exact candidate, and it would have forced 'needs revision' if the edit hadn't
  applied or the reviewer hadn't seen the diff."*

## The leg task versus the Author — two different records

- **The Author** writes the change package. Its record is its `result.json` (facts about its own output) and the
  `edit-application.manifest.json` receipt.
- **The leg task's harness** writes no package. Its SYNTHESIZE run:
  - publishes the Author's package **verbatim** as the leg's `report.md`. Here it is character for character (17,602 = 17,602), with
    `reportMdSource: { mode: upstream, sourceTaskId: <Author> }`;
  - writes leg-wide facts into its `pipeline-index.json`: `editApplication` copied up, `derivationContainment`, `verdictFreshness: same`,
    `reviewerWarnings`, `dialectLint`, `contractPropagation`;
  - leaves the leg's **verdict** on the task's metadata: `qualityGate` and `heldEdit`.
- **Node C and the program read the leg task, not the Author.** The full comparison table is in `PROGRAM-WALKTHROUGH.md`.

## The leg in numbers

| | |
|---|---|
| Agents | 4 (read, design, write, check) + the leg harness (2 runs) |
| Tool calls | Harvester 23 (all read-only); Architect, Author and Reviewer only comment on their task |
| Wall time | about 10 minutes (harness launch 22:54:25Z → leg complete 23:04:10Z) |
| Cost | $2.49 (today's prices; Author on Opus 5.5) |
| Output | one held edit (+20/−2 on H1), 9 validation steps, rollback `restore H1` |
| Changed in Git / on the cluster | nothing (a person applies it through a PR) |
