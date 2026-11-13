# Pipeline Harness User Guide

**Version**: 3.1 | **Updated**: 2026-11-08 (network-provisioning 1.27.0 + network-derivation 1.3.1 mirror) · 2026-06-29
**Status**: Production — three-mode (CREATE + ORCHESTRATE + SYNTHESIZE), platform-resolved

> **This guide = how to RUN/USE the harness.** To **design + add a new domain pipeline** (the triage → decompose → build → validate → promote process), see the sibling [`PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md`](./PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md). Which domains exist + why they fit: [`PIPELINE-DOMAIN-FIT-CATALOG.md`](./PIPELINE-DOMAIN-FIT-CATALOG.md). To compose MULTIPLE pipelines into a plan-gated **program** (pipeline-of-pipelines): [`PROGRAM-HARNESS-USER-GUIDE.md`](./PROGRAM-HARNESS-USER-GUIDE.md).

---

## What Is the Pipeline Harness?

The Pipeline Harness is a **meta-agent** that orchestrates other agents. It operates in **three modes**, **platform-resolved per execution** (since 2026-04-26 via `harnessModeResolver.ts`):

**CREATE mode** — You give the harness a high-level objective and it:
1. **Decomposes** the objective into 3-7 typed tasks (in a fresh child stage)
2. **Assigns** the right specialist template to each task
3. **Wires** dependencies so tasks execute in the right order
4. **Wires Step 5a deliverable metadata** (`deliverableSourceTaskId` on self + `suppressDefaultReportMd` on the leaf) so the engine can extract the customer-facing `report.md` later
5. **Posts a "Pipeline Queued" breadcrumb comment** and **EXITS**

The harness does NOT execute children itself — reactors do that. The harness exits after CREATE; reactors cascade children one-by-one as deps clear.

**ORCHESTRATE mode** — Rare. Fires when a CREATE was interrupted (child stage exists but some tasks lack templates or dependencies). The harness finishes the partial setup and exits.

**SYNTHESIZE mode** — Auto-fired by `pipelineRetriggerReactorService` when ALL children of the harness's child stage are terminal (COMPLETED or FAILED). The harness:
1. Reads each child's `result.json` (confidence, qualityMetrics, errorCategory)
2. Applies the quality gate (≥70 accept, 50-69 retry, <50 escalate)
3. Composes `pipeline-index.json` (the forensic harness summary) — quality gates table, audit trail, deliverable pointer with `{{HARNESS_REPORT_MD_ID}}` placeholder
4. Calls `task.complete` on itself (gated by 4-point invariant server-side)

The engine then post-processes (still inside the same transaction): extracts the source child's `finalResponse` into the harness's `report.md`, and substitutes the placeholder for the actual `report.md` artifact ID.

**Mode resolution is platform-driven, not agent-detected.** The harness reads its own `metadata.pipelineStageId` (absent → CREATE; present + child stage all terminal → SYNTHESIZE; present + partial setup → ORCHESTRATE) via the resolver running BEFORE the LLM turn starts. The resolved mode is injected into the system prompt as a `## Harness Context (Platform-Resolved)` block. Pre-2026-04-26 logic (sibling-detection in the harness's own stage) is retired.

**The human provides direction. The agents provide labor. Reactors provide loop closure.**

---

## Domain Pipelines (connected-service) — network, k8s, Terraform

Beyond generic objective-decomposition, the harness runs **domain-specific connected-service pipelines** that produce an **approved-but-unapplied infrastructure change** against a customer's *real* state — read-only by construction. Shipped/validated domains: **network provisioning**, **Kubernetes/GitOps**, and **Terraform/Cloud-IaC** — each selected by a `(protocol: <name>)` tag in the task title (the harness matches the protocol's description against the task intent).

How they differ from a generic pipeline:

- **Self-provision lifecycle.** A conditional Phase-0 *Harvester* registers a **customer-governed read-only MCP service** from a descriptor carried in the task (register → read-only call → teardown). pAIchart stores no infrastructure credentials.
- **Network: declare each device's source (network-provisioning ≥ 1.23.0; kept files since 1.25.0).** A `## Device sources` block, one line per device — `<device>: git-file — service <name | descriptor URL> ; <owner>/<repo>/<path> [@ <ref>]`, `<device>: device-read — service <name | descriptor URL>`, `<device>: live-read — service <name | descriptor URL>` (since 1.26.0: a device the leg reads as evidence but never changes — alone on its device, never kept), or `<device>: command-package`. A device with no line stops the leg (the pipeline never guesses a source); a device may carry both a git-file and a device-read line (the Git file is the kept base; the device read is evidence, compared by a platform warning fact). A ref outside the Git service's pin is refused: that device is HELD and the leg is needs-revision (forced if needed); on an unpinned customer Git service the ref is read as named. Pasted state is evidence, never a base. A service named by name is used as already registered (never registered or deleted by the run). Value legs (network-derivation) need no block. See *Network: kept device configurations* below.
- **The cognition/actuation seam — it never actuates.** The deliverable is a change *to be applied* (a config / manifest / HCL diff + validation facts + rollback); applying it is the customer's **out-of-band, human-gated** run (a deterministic applier / Argo-Flux reconcile / `terraform apply`).
- **Read-only floor + secret discipline.** The customer service enforces a read-only verb-enum + redacts secrets at the source; pAIchart's *own* guards back it up — **R9** (`CONNECTED_OUTPUT_SANITIZE_ENABLED`) sanitizes harvested output before the reasoner, **R10** (`ARTIFACT_SECRET_REDACT_ENABLED`) redacts secrets from the persisted artifacts. Both are **enabled in prod** (2026-06-29).
- **⚠️ A redacted line is not applicable.** R10 writes `<<REDACTED-SECRET>>` (a terraform harvest may show `<REDACTED-SECRET>`), and devices accept either as a literal value — device-verified 2026-10-13 on EOS (community / `secret 0` / enable / TACACS key), nginx (`proxy_set_header`) and otelcol (headers, auth). **Never apply a block containing either spelling, or any other `<REDACTED…>` / `<<REDACTED…>>` form** (Authors invent variants; check with `grep -nE '<{1,2}REDACTED' <package file>`). A green `nginx -t` / `otelcol validate` does not prove it safe, and on EOS a full config replace with a redacted password-hash line can delete the object (the only admin user included) while printing success. Hold and re-author. The leg's `report.md` lists such lines under **Platform warnings (non-blocking)** since 2026-10-13, and the absence of that section is not clearance. Full rule: [`PROGRAM-OPERATOR-GATE-PLAYBOOK.md`](./PROGRAM-OPERATOR-GATE-PLAYBOOK.md) (Apply gate, step 2).

**Internal setups (one person registers the team's services, many run pipelines):** register by descriptor URL (the platform takes the name and every field from the descriptor; each tool description ≤ 500 characters; a token only in the URL's query string, accepted only from a person); a private descriptor host needs the operator's `HUB_PRIVATE_ENDPOINT_ALLOWLIST`; to let colleagues' pipelines hold a shared service the owner grants their POV (`heldGrantPovIds`). Full rules: [`CUSTOMER-INTERNAL-SETUP-GUIDE.md`](./CUSTOMER-INTERNAL-SETUP-GUIDE.md) (internal draft).

**Kept files:** where a domain's config files are held by the platform, the Author writes *edits*, not files — read
[Kept files — edits by reference](#kept-files--edits-by-reference) below before reading or applying such a package.

**References:** [`PIPELINE-DOMAIN-FIT-CATALOG.md`](./PIPELINE-DOMAIN-FIT-CATALOG.md) (which domains fit + why) · the per-domain RFCs under `network-provisioning/` · `kubernetes-gitops/` · `terraform-iac/` (decomposition + the customer integration spec + a validation-rig `DEMO-RUN-GUIDE`) · [`../domain/harness/harness-output-guards.md`](../domain/harness/harness-output-guards.md) (R9/R10). To **add** a new domain, follow the [Use-Case Design Playbook](./PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md).

---

## Kept files — edits by reference

*Live in: **observability-config** (since 2026-10-17), **kubernetes-gitops** (since 2026-10-19), **terraform-iac** (since
2026-10-21) and **network-provisioning** (since 2026-10-27, 1.25.0) — k8s and terraform with files from a Git config repo, network with
each device's declared Git file or, where it has none, its running configuration read from the device.*

### What it is

When a pipeline changes a configuration file, the platform **keeps the exact bytes** of that file as it read it, and the
Author never retypes the file. The Author writes only **edits** — small *find this text, replace it with that* blocks —
and the **platform** applies them to the kept bytes. The Reviewer then judges **the platform's own diff** of what changed,
not the Author's description of it.

Why: an agent that retypes a file drops lines and changes words, and every later check compares against the same bad
copy. A file that never passes through the model cannot be retyped wrong. (Before this, 28 of 42 observability harvests
dropped lines from a quote labelled verbatim; three changed a word, e.g. `$remote_addr` → `$remote_actor`.)

### What you will see in a package

- **Handles** — each kept file is named `H1`, `H2`, … with its path (e.g. `H2 (/etc/nginx/conf.d/otlp-ingress.conf)`).
- **`## Held File Edits`** — the Author's edits, one block per change:
  ```
  <<<<<<< SEARCH H2
          allow all;
  =======
          allow 10.20.30.0/24;
          deny all;
  >>>>>>> REPLACE
  ```
  The SEARCH text must appear **exactly once** in the kept file, or the platform refuses that edit.
- **`## Held File Rollback`** — usually one line, `restore H2`: put the kept original back. It cannot drift from the
  original, because it *is* the original.
- **The platform's diff** (`---`/`+++` with `-` and `+` lines) — what actually changed. This is what the Reviewer judged.
- **Files the change does not touch** are unaffected: a package that changes only, say, a Prometheus alert rule is written
  and reviewed in full, exactly as before ("out of scope" — never forced by this rule).

### The gate facts (how to read the outcome)

On the leg's card and in `qualityGate.heldEdit`:

| Fact | Meaning |
|---|---|
| `editApplication: applied (2/2; replace-file)` | every edit matched once and was applied to the kept bytes |
| `editApplication: … refused: …` | an edit did not match (or was ambiguous); the reason is named |
| `heldEdit.forced: true` + `reason` | the platform set the leg to **needs-revision** whatever the Reviewer said — an in-scope edit was not applied, or a kept file was written out whole |
| `heldEdit.inScope: false` (card: `; out of scope`) | the package touched no kept file; the held rule did not force it (a `forced` with a named `reason` can still appear for a run-level failure) |
| `reviewerSaw: rendered` | the Reviewer was shown the platform's diff |

A forced needs-revision is a fact, not a judgement: re-run the leg; do not hand-edit the package to "fix" it.

#### Forced outcomes — what they are and why

A leg's outcome normally comes from its agents (the Reviewer's verdict, written by the harness). A **forced outcome** is the platform
setting the leg to **needs-revision** because a fact it holds proves the package cannot be trusted as complete — whatever the agents
concluded. It exists for one reason: **no false releases**. Some reasons a package must not be approved need no judgement (a source was
refused, a declared file was never read), so the platform does not ask; it decides. Properties:

- **One direction only.** A force can turn `approved` into `needs-revision`; it can never create an approval.
- **Nothing is hidden.** `qualityGate.heldEdit` carries `forced: true`, the `reason` (and the devices, where relevant); the Reviewer's own
  verdict stays beside it (`agentOutcome`); the deliverable gains a "Platform outcome: needs-revision — …" line.
- **Not a quality verdict.** The rest of the package can be good and its edits still apply (e.g. the other device's edit) — the package
  as a whole is not releasable until the cause is fixed.
- When the agents already concluded needs-revision for the same cause, the reason is recorded with `forced: false` (nothing to override).

The reasons, in precedence order (only the first that holds is recorded):

| `reason` | Means | What to do |
|---|---|---|
| `stage-rebind` | the leg's records point at another stage — its evidence cannot be trusted | run a fresh leg |
| `source-not-pinned` | a Git read asked for a ref or file outside the Git service's pin and was refused | fix the declaration (a ref the pin admits, or no ref), run a fresh leg |
| `git-file-not-held` | a device declares a Git file the platform holds no copy of (refused, missing, never read) | correct the path/ref, or the service, then run a fresh leg |
| `device-read-not-held` | a device declared `device-read` has no captured running configuration | make sure the leg reads that device's whole config (service reachable), run a fresh leg |
| `device-sources-absent` / `-unparseable` / `-conflict` / `-unresolved`, `device-sources-snapshot-absent` / `-unreadable` / `-changed` | no `## Device sources` block, one the platform cannot parse, a task body that disagrees with the contract, a line it cannot resolve, or a declaration missing from / changed since the snapshot taken when the leg started | write one valid block (one line per device) and run a fresh leg |
| `author-not-of-leg` | the package came from an Author outside this leg | run a fresh leg |
| the package's own state (`editApplication` `refused` / `partial` / `unheld`, or `held-file-written-whole`) | an in-scope edit did not apply, or a kept file was written out whole | run a fresh leg |

A completed leg cannot be re-run in place: create a fresh PIPELINE task (see *Re-running a Completed Pipeline*).

### Applying a kept-file package safely

Nothing in the pipeline writes. When the gate releases and you apply:

0. **Read the edits, and find what to fetch.**
   - The edits are text in the package. Open the leg's Author task (in the GUI, under the leg's child stage). Its report has
     `## Held File Edits` (each SEARCH/REPLACE block, headed with its handle, e.g. `H1 (k8s/sample-workloads.yaml)`) and
     `## Held File Rollback` (`restore H1`).
   - The **Author execution id** is listed by `perform({ action: "agent.status", parameters: { taskId: "<Author task id>" } })`. Use
     the newest `SUCCESS` execution.
   - The **handles** are on that execution's results card: `perform({ action: "agent.results", parameters: { taskId: "<Author task
     id>" } })` ends with a facts line such as `editApplication: applied (1/1) | heldFiles: H1 /k8s/sample-workloads.yaml`.
   - The GUI shows the edits but not the held base or candidate bytes. Those come only through `held.get` below.
   - **Shortcut:** the Author's `edit-application.manifest.json` artifact (the platform's receipt for applying the edits) lists
     each held file's `baseRefId` and `candidateRefId`. `project({ action: "held.get", refId: "<candidateRefId>" })` fetches that
     exact file directly, with no execution id or handle needed.
1. **Fetch the bytes** (owner/team/admin only; every read is audited):
   `project({ action: "held.get", executionId: "<Author execution id>", handle: "H2", kind: "BASE" })` and the same with
   `kind: "CANDIDATE"`. Save each metadata block, and the candidate's text, to files.
2. **Run the base check** — is the kept original still what is deployed, and is the candidate safe to write?
   `npx ts-node -r tsconfig-paths/register scripts/held-base-check.ts --live <copy of the live file> --base <base.json>
   --candidate <cand.json> --candidate-text <cand.txt> --label H2`
   - **MATCH** → proceed. **MISMATCH** or a refusal → **STOP**: the file changed since the run; re-run, never merge by hand.
   - **placeholders > 0** → *not applicable as-is*: the candidate contains a redacted secret (`<<REDACTED-SECRET>>`), which
     devices accept as a literal. Never apply it; re-author with the secret referenced (`${env:NAME}`) or as an operator step.
3. **Apply** the candidate (the domain guide says how — copy into place, or a pull request), run the package's validators
   and post-apply checks. Rollback = the `restore` in the package (the kept original).

The base check is an operator tool, run from a copy of this repo; it is not published yet.

**Files kept from a Git repository** (the file source for kubernetes-gitops; k8s legs are held since 2026-10-19, 1.18.0): the
kept original then comes from a commit, and `held.get`'s metadata carries that commit as `sourceRevision` plus the repository
(`target`) and the file's `path`. Check it against the repository instead of a live file, with **your own** GitHub CLI
login (never the platform's file source):
`npx ts-node -r tsconfig-paths/register scripts/held-base-check.ts --git --base <base.json> --held-text <base.txt> [--pr <n>]`.
`--repo <owner/repo>` and `--path <repo path>` default from the held ref; if you type one and it disagrees with the ref, the
check STOPS (`repo-not-held-target` / `path-not-held-path`), and with neither it stops `no-coordinates`. It warns if `GH_TOKEN`
is set — use your own read credential. MATCH means the kept bytes are the file at that commit AND the file is
unchanged at the branch head (and at the PR's base, with `--pr`). Re-run it immediately before you merge. **NOT-APPLICABLE**
means the kept copy is not the committed bytes (the platform redacted a secret in it, or the file has Windows line endings) —
check that file by hand. The Git file source is admin-only, and reads only the one repository the platform is pinned to.

### Kubernetes (GitOps): kept files from your config repo

- **Name the file in the task.** One line per file, e.g. *"Config-repo file to read (Repo read): owner `acme`, repo
  `cluster-config`, ref `main`, path `apps/orders/deploy.yaml`"*. Name the override values file (`values-prod.yaml`), never a
  chart's default `values.yaml`. Only the **`main` branch** of the pinned repository is read (a read naming no branch is read as `main`); a task naming another branch,
  repository or commit gets no read (the Harvester says so), and the package falls back to writing new files in full.
- **What changes in the package.** The file you named is `H1`; the Author edits it in place (a new document can be appended to
  it). A brand-new file appears as `create H2 on H1 <path>` beside it. Rollback is `restore H1` for a kept file and a `git revert`
  of the adding commit only for a file the change created.
- **The cluster is evidence, never the kept file.** Live objects are read to compare against the repo. A difference is reported
  as drift with both values; when the change touches that field, the package reconciles it with a callout ("merging this
  overwrites the live value"). A cause is stated only with the witness that shows it.
- **Who can run it.** The Git file source is admin-only: a non-admin's run gets no kept file and is judged in full, as before
  (not forced).
- **Apply** = merge the candidate as a pull request after the Git base check reads MATCH (above); re-run the check just before
  you merge.

### Terraform: kept `.tf` files from your config repo (terraform-iac 1.15.0, since 2026-10-21)

- **Name the file in the task.** One line per file, e.g. *"Source file to read (repo read): owner `acme`, repo `infra-live`, path
  `terraform/storage.tf`"*. Only the **`main` branch** of the pinned repository is read (a read naming no branch is read as `main`). A task naming a branch, tag or commit is not
  read: the leg returns `needs-revision` (the platform refused the read) or builds its package without that file. **Never name a state,
  plan or variables file** (`*.tfstate*`, `*.tfplan`, `*.tfvars*`, `.terraform/`) — the platform refuses those reads; state comes from your
  read-only Terraform service.
- **What changes in the package.** The file you named is `H1`; the Author edits it in place by reference (an attribute changed, a block
  added inside a resource), or adds new resources in a new file beside it. Rollback is `restore H1` for a kept file and a revert of the HCL
  only for a file the change created. Your files that were not read are written as before (a new file, or a labelled complete block).
- **State is evidence, never the kept file.** The Harvester compares every attribute the file declares with the state. A difference is
  reported with both values and no cause unless a witness (a supplied plan) shows one; a value the file takes from a reference it did not
  read (`local.*`, `var.*`) is not a difference. In scope ⇒ the package reconciles it with a callout; out of scope ⇒ the leg halts.
- **Replacements are named.** A change that forces a replacement (e.g. `random_password` length) says so, with the plan's own
  `must be replaced` line as the check.
- **Who can run it.** The Git file source is admin-only: a non-admin's run gets no kept file and is judged in full, as before (not forced).
- **Apply** = merge the candidate as a pull request after the Git base check reads MATCH (above), then your governed `terraform apply`.

### Network: kept device configurations (network-provisioning 1.25.0, since 2026-10-27)

- **Declare each device's source** in a `## Device sources` block (see *Domain Pipelines* above): `git-file` (your config file in a Git
  repo), `device-read` (the running configuration read from the device through your read-only device service), `live-read` (since
  network-provisioning 1.26.0: a device the leg must see but never changes — its running configuration is read whole as evidence, never
  kept and never edited), or `command-package` (no kept file — the package is written as commands, as before).
- **What is kept.** For each device, the declared **Git file**; for a device with no Git file, its **running configuration** as the device
  returned it. A device that declares both: the Git file is the kept file; the device read is **evidence only** (no handle), and a
  platform fact compares the two (*Git file vs device configuration* — a warning, never a gate). Handle numbers can have gaps (`H1`, `H3`).
- **What changes in the package.** The Author edits each kept configuration by reference — never as configuration-mode commands, never as
  the whole file — and the rollback is `restore H<n>`. A device whose source could not be read is listed **first** as held, nothing is
  packaged for it, and the leg is **needs-revision** (forced if the agents did not say so — see *Forced outcomes*). Since
  network-provisioning 1.27.0 the change Reviewer refuses such a leg itself and names the device and the reason (the service could
  not be reached, the read was refused, or it returned no configuration): fix that source and run a fresh leg. A device whose
  configuration the platform **did** keep, and which the package edits by reference, is not this case; it is reviewed on its merits.
- **Secrets.** Kept configurations are redacted at capture; an edit never anchors on, or carries, a redacted line. Never load a file that
  contains a placeholder (`<<REDACTED-SECRET>>`) onto a device.
- **Apply** (the package states it by reference): apply the edits to **your own** copy of the file (never the kept candidate, which carries
  placeholders), load it with the device's own tooling in a configuration session, review the **device's own diff** before committing,
  and commit with a timer that **reverts unless you confirm it** where the device offers one; a device without an atomic whole-file replace
  gets the difference applied with its own tooling. Base check: `held-base-check.ts --git` for a Git file; `--device` for a device base.
- **Apply base — when a device's Git file differs from its running configuration (network-provisioning 1.27.0).** If the platform's
  *Git file vs device configuration* fact lists lines of the Git file that the device does not have under the same block, loading the
  whole edited file would carry those differences to the device too, and the device's own diff would stop the load. So the package
  says so in that device's change list and gives it an **incremental apply**: enter only the lines the edits add or change, in a
  configuration session, review that session's diff, and commit with the same revert timer — or bring the Git file in line with the
  device first. It never loads that whole file, and the change Reviewer refuses a package that does. Some listed lines are rendering
  differences rather than real drift: in our lab a top-level BGP `network` line in the Git file is shown by the device under
  `address-family ipv4`. The incremental apply is still the safe shape for that device.
- **Markers on new members.** When the change adds a member to a population the objective, the contract or the existing members
  identify by a marker (for example the description every existing exporter interface carries), the new member carries the same
  marker, in plain ASCII, so a later value leg that selects by it sees the new member. Known cosmetic case: when the existing
  descriptions carry an extra note (in our lab, `telemetry-exporter (existing allocation)`), the new member may copy the whole
  description, note included (register VALUE-MARKER-CONTINUITY).
- **Proven on one platform family** (Arista EOS in our lab); other vendors are designed for but not yet live-proven.

### Limits worth knowing

- A file the platform could not keep (too large, a redacted credential it cannot hold, no file source) falls back to the
  old way: written in full and reviewed in full. The card says which.
- Only files read through a **declared file source** are kept. A file merely pasted into the task is not.
- Credentials never belong in an edit — reference them (`${env:NAME}`) or state an operator step.
- **Run one pipeline at a time per cluster or Terraform descriptor.** Runs that share a descriptor share one service registration,
  and the first to finish removes it from under the others.

Design and evidence: [`kept-file-edit-by-reference-pattern.md`](../patterns/kept-file-edit-by-reference-pattern.md).

---

## Writing a domain pipeline task

Every example below ran live (2026-10-27 window); copy and change the work, the devices and the sources.

### Anatomy of a good task

- **Title** — the change as work, ending with the protocol token: `Add a syslog host to both lab switches (protocol: network-provisioning)`.
- **Description** — (1) the objective in one or two sentences, naming the targets and "keeping every other line … unchanged"; (2) the
  **source declaration** for the domain; (3) "Read-only harvest, change package only — nothing is applied by this run."
- **Leave out:** test or leg labels, the reason you are running it, pasted credentials, and instructions that steer the agents
  ("approve if…", "skip the review"). POV, phase and stage names describe the work too — the agents read them.
- **One objective per task**; a near-identical objective in the same POV halts at the duplicate check unless you clear it.

### Network: choosing each device's source

```
Add a remote syslog host 192.0.2.50 on both lab switches (ceos1, ceos2), keeping every other line of their configuration unchanged.

## Device sources
ceos1: git-file — service github-service ; paichart/paichart-configs/network/base/ceos1-startup.cfg
ceos2: device-read — service https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json

Read-only harvest, change package only — nothing is applied by this run.
```

| Line for a device | The platform keeps | The package gives you |
|---|---|---|
| `<device>: git-file — service <name or descriptor URL> ; <owner>/<repo>/<path>` | your config file from Git (`main`, or the branch the line names) | edits by reference to `H<n>`, `restore H<n>` rollback |
| `… ; <owner>/<repo>/<path> @ <branch\|tag\|commit>` | that ref — **only if the Git service's pin admits it**; otherwise the device is HELD and the leg needs-revision | as above, or nothing for that device |
| `<device>: device-read — service <name or descriptor URL>` | the device's running configuration, read whole | edits by reference, `restore H<n>` |
| both a `git-file` and a `device-read` line for one device | the Git file (the device read is evidence only) | edits to the Git file + a *Git file vs device configuration* fact listing Git-file lines the device does not have under the same block (some may be rendering differences); when it lists any, that device is applied incrementally (1.27.0) |
| `<device>: live-read — service <name or descriptor URL>` (alone — no other line for that device; 1.26.0) | nothing: the running configuration is read whole as **evidence only** — never kept, never edited. A device the change touches is never `live-read` only (the leg stops); a failed read is reported, not held | nothing for that device; its allocations are checked against the change |
| `<device>: command-package` (alone — no other line for that device) | nothing (no kept file) | **the original method**: candidate configuration as commands, validation steps and a per-device rollback, with no platform-applied edits or rendered diff |

- **Service** — a name uses a service already registered in your hub as-is (never changed or deleted by the run); a descriptor URL is
  registered for the run and removed at the end.
- **When to use `command-package`:** a device with no file source and no readable configuration getter, or a change you want written as
  commands. You lose the kept-file guarantees (the platform does not apply the edits or show you the diff), so prefer `git-file` or
  `device-read` where you can.
- **What stops a leg:** a device with no line, a line the platform cannot parse, a task body that disagrees with a program's contract.
  **Pasted state** (a config pasted into the description) is evidence, never a base — the platform keeps only what it read itself.

#### Which devices to list (read this before writing the block)

- **List every device the leg must SEE, not only the devices it changes.** The Harvester reads only the devices the block names. If
  the change derives a value that must not collide with anything on another device — a NAT pool, an address range, an AS number —
  that other device must be listed too, or its allocations are never read and a colliding value can be chosen. (Live, 2026-11-01: an
  edge leg listed only the switch it changed, never read the second switch, and chose a NAT pool that switch already used. The
  program's integration review caught it; the leg's own review did not.)

  > ⚠️ **Known limitation (accepted 2026-11-05) — an undeclared device is not checked by the leg.** If a device the leg must see is
  > left out of its block, the leg's Reviewer can APPROVE a derived value that collides on that device. This is most likely when
  > the package explains the gap ("that device was not read; the cross-device check belongs to the program integration review") —
  > measured: the Reviewer accepted that explanation in every lab sample, even with the platform naming the undeclared device. The
  > only check left is the program's integration review (it caught the 2026-11-01 case), and a standalone pipeline has none.
  > **The fix is in your hands: list the device.** Once it is listed, the leg reads it (`live-read` / `git-file`) and checks the
  > value against it; if it cannot be read, the Reviewer refuses (measured 3/3). Record of the decision: open register row
  > UNDECLARED-SCOPE-DEVICE-UPSTREAM.
- **A device you only need for information can be declared `live-read` (1.26.0) or `git-file`.** `live-read` checks against what is
  running on the device and keeps nothing. With `git-file` its file is read and its allocations are checked; it is
  kept, but the Author never edits it, so it adds nothing to the package. If its file cannot be read (wrong path, missing file, a
  branch the service does not allow) the leg stops with needs-revision — you learn the evidence is missing instead of getting an
  unchecked value.
- **"Git-only"** describes a device declared with a `git-file` line and no `device-read`: everything the leg knows about it came from
  Git. That works, and is the expected setup for most teams. Its one limit: anything configured on the device but never committed to
  Git cannot be seen without reading the device. The package should say that a value was checked against the Git file only. A
  Git-only device gets **no call to any device service**: its state comes from its Git file. Since network-provisioning 1.27.0 a
  change leg whose declared devices are all Git-only shows `liveEvidence: git-only` on its card (it showed `none-declared` before).
- **A value leg (`(protocol: network-derivation)`, network-derivation ≥ 1.3.0, since 2026-11-06) has its OWN block.** It derives a
  value other legs consume (a free address, an aggregate) and changes nothing. In a program, give it its own `## Device sources`
  section in `requirements.md`; the Program Architect copies it as `deviceSources["network-derivation"]`, separate from the change
  legs' `deviceSources["network-provisioning"]`, so the value leg can list every switch it must see without changing what the change
  legs declare. List every switch whose allocations the value must avoid.
  - `git-file` only (the common case): the value is derived from your committed files. That is allowed and **stated, never blocked**:
    the leg's card reads `liveEvidence: git-only (declared devices)`, the Reviewer records a `NON-BLOCKING WARNING (git-file-only)`
    naming each such switch, and the leg's summary names them. Since network-derivation 1.3.1 that warning is a line of its own,
    starting with the label, and the leg's report lists it (a label written mid-sentence is not read by the platform, so it is not a
    warning). The value leg's brief gives each Git-only switch a line saying no device-service call is made for it. Its limit is the Git-only limit above: an address configured on a
    switch by hand and never committed is not seen, so the value may already be in use on the running switch.
  - `git-file` + `device-read` on the same switch: the value rests on the running configuration (what the change will meet); the
    Git file is evidence, and the platform shows any Git-vs-device difference. The brief limits the narrow reads to that switch.
  - `live-read`: as for a change leg (read whole, evidence only, alone on its switch).
  - No block for the value leg: it reads through its service descriptor exactly as before and reads no Git file. Do not write a note
    in its place — leave the section out.
  - A value leg never holds files: nothing is kept for it, whatever its lines say.
- **Several network change legs can share ONE block** when they need the same lines (e.g. two legs each changing a different switch, each
  needing the other as evidence, both declared `git-file`). Two legs that need DIFFERENT lines for the same switch are not supported
  yet — use one block that serves both.
- Size: every declared `git-file` is kept and shown to the Author. Two to a few switches is nothing; for a large fabric where the
  change touches a few switches, list the evidence devices anyway and tell us if the view runs into size limits.

### Kubernetes / Terraform: name the repo file

```
Set CPU and memory requests and limits on the web Deployment, leaving every other field unchanged.

Source file to read (repo read): owner `acme`, repo `infra-live`, path `k8s/web/deployment.yaml`
```
`main` only (a read naming no branch is read as `main`); one line per file; for Terraform never name state, plan or variables files (`*.tfstate*`, `*.tfplan`, `*.tfvars*`,
`.terraform/`). Live state comes from your read-only cluster / Terraform service (descriptor in the task) and is evidence, never the kept file.

### Observability: the self-provisioned stack

```
Self-provision the read-only MCP service from the descriptor below (register → use → delete); harvest read-only; tear down the
registration afterward. Objective: in the collector's as-deployed config, cap the OTLP gRPC receiver's maximum receive message size at
8 MiB, leaving every other setting unchanged.

Descriptor (verbatim):
<the service descriptor JSON>
```
The collector and ingress files the service returns as deployed are kept and edited by reference; Prometheus rules and dashboards are
written in full.

### A program (several pipelines that depend on each other)

```
Title:  Give each lab switch a new telemetry-exporter loopback on a free address — run 2 (protocol: pov-program)

Program intent: give each of the two lab switches (ceos1, ceos2) a new Loopback14 carrying a telemetry-exporter address from the
exporter pool 10.99.0.0/24 that no device already holds, advertised into BGP; one leg derives the free addresses, the other configures them.

Design artifacts for the Program Architect (fetch ONLY these two URLs):
- topology-as-code: https://…/topology.json
- requirements: https://…/requirements.md
```
The requirements file carries each network leg's `## Device sources` block; the Program Architect copies it into the interface contract
and every leg reads it from there. Put a **run number** in the title, and set the duplicate clearance before re-running (see
`PROGRAM-HARNESS-USER-GUIDE.md` §2).

## Reading a pipeline's result

### What "approved" means — and what it does not

**Approved = reviewed, not applied.** A pipeline produces a change *package* (the configuration change, its validation steps, its rollback,
and how to apply it). `approved` means the package passed its Reviewer and every platform check. **Nothing has been applied** to any
device, cluster, account or file — every pipeline harvests read-only and writes nothing outside pAIchart. Applying is **your** step, done
with your own tooling and change process, after a human decides to release.

Three things no pipeline or agent ever does: **apply** a change, **choose** a configuration source for you (you declare it — e.g. the
network `## Device sources` block), or **approve** a gate on your behalf. `needs-revision` means the package must not be applied as it
stands — read the reasons (the Reviewer's blocking items, or a *forced outcome* above).

### The Facts line on a leg's card

`agent.results` (and the task card) ends with a **Facts:** line — values the platform stamped, not agent opinions. Read it before the prose.

| Fact | What it tells you | Can it block? |
|---|---|---|
| `confidence` | the agent's own score | never a gate input |
| `reviewerVerdict: approved / rejected (N blocking)` | the Reviewer's terminal verdict, transcribed | it is the Reviewer's judgement |
| `chainedContext: N of M chain-capable (degraded D)` | how many predecessor outputs reached this agent (`degraded`/`notChained` = something did not) | a gap blocks a program release |
| `markerPresence: harvested / derived / consumed ✓/✗` | whether the machine-read value blocks were found | indirectly (the checks below need them) |
| `derivationContainment` + `containmentDisposition` | a derived value (e.g. an address picked from a pool) checked against its pool and against what is already allocated; disposition `benign` / `needs-node-c` (a program's Node C decides) / `blocking` | `blocking` blocks a program release |
| `upstreamContainment`, `upstreamDelegated`, `consumedValueCheck` | on a leg that USES another leg's value: was the upstream checked, and does the value used equal it | `NOT green` / a mismatch blocks |
| `rollbackContainment` + `rollbackDisposition` | each line the rollback restores was found in this leg's own harvest (or the rollback is `restore H<n>` of a kept file) | escalates (`needs-node-c`), never blocks alone |
| `dialectLint` | banned tokens / required stanzas from a supplied platform dialect | a violation is a reviewable fact |
| `contractPropagation`, `contractApplicability` | in a program: every child held the interface contract | a starved child is a finding |
| `editApplication`, `heldFiles` | kept files: how many edits applied, which files are held (see *Kept files*) | yes — via the held rule |
| `supersession`, `verdictFresh`, `verdictFreshness` | which run is authoritative after a re-run; whether the review saw the current inputs | a stale verdict is visible, not yet a gate |
| `reviewerWarnings` | labelled non-blocking warnings the Reviewer raised | never |
| `formCheck` | a package-form slip the platform corrected (e.g. a diff header count) | no — it records the correction |
| `errorCategory`, `truncation` | the run failed, or its output hit the length limit | a failed child is not approved |

`NOT checked (<reason>)` is a fact too — it says the check did not apply (no value block, no contract, program tier…), never "passed".
Some facts are stamped but not shown on the card (e.g. `quoteFidelity`, `validationToolCalls`, the network `gitDeviceComparison`); they
reach the Reviewer and the full `agent.results` output.
`quoteFidelity` checks that a quoted configuration matches what the tool returned. It reads a quote by its label: **verbatim** (every
omitted, added or changed line is a finding), **excerpt** (file sources, since v6: the same, except gaps marked `# [elided: …]`, whole
stanzas left out, or comments beside the excerpt), or **unlabelled** (free to narrow; only a changed line is a finding). It flags, never
blocks. Why it matters and what to do when it flags: `docs/READING-A-RUN.md` § "Facts about the package's own text".

### "Presence assertion" in a validation step

A validation step normally gives the exact command and its exact expected output. When the change creates something the device or
system has **never displayed before**, nobody can know its exact rendering in advance (spacing, ordering, defaults) — guessing it would
make a correct change "fail". So the package writes a **presence assertion** instead: the command, the **fields that decide it** (e.g.
"exactly one line containing `logging`, `host` and `192.0.2.50`"), the **volatile fields excluded** (timestamps, counters), and **why no
literal is given**. You check it by running the command and confirming those fields — no more, no less. A literal is still required for
anything already observed (e.g. a pre-change check, or the package's own config lines).

### Why a leg stopped before it started

| What you see | Means | Fix |
|---|---|---|
| a comment "duplicate …" + `metadata.duplicateHalt` | the same objective already ran (see *Re-running* below) | add the clearance, or close the task |
| `metadata.cannotRun` (+ `executionStatus: FAILED`, `AGENT_STAMPED_CANNOT_RUN`) | the harness found the pipeline can never run as configured — e.g. no `## Device sources` block for a network device, a required upstream value missing | fix what it names, then create a fresh task |
| `NAMED_PROTOCOL_NOT_FOUND` / `PROTOCOL_ROW_NOT_ACTIVE` in the execution error | the `(protocol: …)` token in the title names no active protocol (typo, or a retired name) | use a current token (`HOWTO-use-pipeline-harness` lists them) |
| `INTERFACE_CONTRACT_MISSING` | a program leg that needs the plan's interface contract has none | re-run the program's plan step; never hand-copy a contract |
| a question in a comment, nothing else | the objective was ambiguous; the harness asked rather than guessed | answer by editing the task description, then re-run |

These refusals happen **before any agent spends** on the work (the platform ones before any model call).

### Re-running a pipeline and the duplicate check

- **A completed pipeline cannot be re-run in place.** Create a **fresh** PIPELINE task (same wording is fine).
- **The duplicate check.** Before it starts, a pipeline looks for an earlier run with the same (or a near-identical) objective. A
  pipeline checks the stages of its phase; a program found a duplicate in **another phase of the same POV** — treat the check as
  **POV-wide**. A semantic subset ("add X" after "add X and Y") can match too.
- **To re-run on purpose,** set the clearance in the task's metadata BEFORE launching (MCP `task.update`, `parameters.metadata`):
  `duplicateAcknowledged: ["<prior stage id>", …]` — an **array** naming every earlier run's stage: for a pipeline its
  `Pipeline: …` stage (`metadata.pipelineStageId` of the earlier task), for a program its `Program: …` stage **and** each leg's
  `Pipeline: …` stage. A single id when several runs exist will halt again. Check it stored as an array (`jsonb_typeof = 'array'`), then
  launch; a program carries the list onto its legs.
- **Never on a halted program leg:** a leg the platform halted as a duplicate freezes its downstream work; re-run with a fresh task.
- The clearance is task metadata, never words in the description (descriptions are customer-visible).

### Secrets and redaction — what you will see

Device and service output often contains secrets (SNMP communities, password hashes, keys, tokens). pAIchart never needs them and
removes them before anything is saved:

- **What is redacted before saving** (every artifact, comment and kept file): values under credential keys (password, secret, key,
  token, community, pre-shared key, SNMPv3 auth/priv, TACACS/RADIUS keys, Junos `$9$`, IOS type-7 …), the login **username** on a line that
  carries its credential, credential-named fields and keys in structured results (e.g. an SNMP community used as a map key), and any
  later bare repeat of a value already redacted in the same run (echo redaction).
- **What a redacted value looks like:** `<<REDACTED-SECRET>>` in saved output (a terraform harvest may show `<REDACTED-SECRET>`); inside
  a quoted config line an agent writes `<value>`. Both are placeholders, not values.
- **Never apply a line that contains a placeholder** — devices accept it as a literal (a community literally set to
  `<<REDACTED-SECRET>>`). Kept-file packages never anchor an edit on, or write, a redacted line; if a change needs a secret, the package
  references it (e.g. `${env:NAME}`) or states it as an operator step.
- **Limits, stated plainly:** redaction is an accident control, not a defence against deliberate exfiltration — a value that is short,
  split, spaced or encoded can pass. Your service should redact at the source too (the read-only service contract asks for it).

### Connecting your own services

Domain pipelines read your systems through a **read-only MCP service you govern** (your credentials, your scope). Two ways to give a
pipeline that service:

| How | When | What the run does |
|---|---|---|
| **Name a pre-registered service** (in Device sources, or the task) | your team registered it once in the hub | uses it **as-is**; never registers, updates or deletes it |
| **Give a descriptor URL** (or the descriptor inline) | a one-off, or no shared registration | registers it for the run from the descriptor alone, uses it read-only, **deletes its own registration** at the end (on every outcome) |

- **An agent can only change a registration its own run created** — never one a person registered, never another run's, and only rows
  owned by the user who launched the run. A pre-registered service is safe from teardown.
- **Descriptors must pass the hub's register check** (e.g. each tool description ≤ 500 characters) — check one before use with
  `scripts/check-descriptor.ts`; a failing descriptor stops the leg at its first step.
- **Sharing with colleagues:** the service's owner can grant a POV (`heldGrantPovIds`) so colleagues' pipelines in that POV can use it;
  private endpoints (inside your network) need the operator's allowlist. Full rules: `CUSTOMER-INTERNAL-SETUP-GUIDE.md`.

### Cost and time to expect

Measured on real runs (lab rigs), model prices of the day; a guide, not a quote.

| Run | Cost | Time |
|---|---|---|
| Standalone terraform leg | ≈ $1.88 mean (5 legs, 2026-10-22, range $1.78–2.08) | ≈ 7–10 min |
| Standalone kubernetes leg | ≈ $2.21 mean (6 legs, 2026-10-19, range $1.82–2.67) | ≈ 7–10 min |
| Standalone network leg | ≈ $2–3 (window estimates; not yet metered per leg) | ≈ 7–10 min |
| One-leg program (plan + gate + leg + producer + Node C) | ≈ $4.40–4.60 (k8s / terraform) | ≈ 20–40 min + your gate wait |

The change author runs on a larger model (Opus) than the other roles; a leg's cost is mostly that author plus the size of the
configuration it reads. Reliability target (owner): ≥ 90% correct outcomes per domain, **0 false releases** — a correct refusal counts
as a correct outcome.

### Retries and re-runs inside a pipeline (what the platform does on its own)

- **By confidence, per child:** ≥ 70 accepted; **50–69 re-executed once** (never a reviewer — its score is a recorded fact); < 50
  escalated. A re-run is a fresh attempt on the same inputs; if it comes back worse, the platform keeps the better execution and names
  the other as superseded (`supersession` on the card).
- **Stale review:** if a re-run changed what a reviewer reviewed, the reviewer is re-run once on the new package (`verdictFresh: no`).
- **Hard bounds:** one re-execution per child per pipeline run, and no reviewer re-run without a stale verdict; a pipeline re-entered
  too many times ends `FAILED` with "Re-entry budget exhausted". Escalation still runs teardown (e.g. deleting a self-provisioned
  service registration) — it skips the approval, never the cleanup.
- These are automatic; a re-run **you** want is a fresh task (see *Re-running* above).

### What is kept, and for how long

| Data | Kept |
|---|---|
| Artifacts (`result.json`, `report.md`, …) per task | the 10 latest successful + 10 latest failed on completion, settling to **4 + 4** at the daily midnight-UTC sweep; older runs keep their completion comments |
| Kept files (held bytes) | while a stored reference uses them; unreferenced copies are removed by the nightly sweep after a one-day grace |
| Secrets | never stored — redacted before saving (see *Secrets and redaction*) |
| Demo POV data | deleted after 30 days (public `PRIVACY-DEMO.md`) |
| Operator replay snapshots (production copies on an operator's machine) | expire after 24 h (an operator tool, not part of a run) |

Need an old run's evidence later? Copy what matters into your own records — pruning is by count, not by importance.

### Who reads which document

| Reader | Reads |
|---|---|
| **You (running or reviewing pipelines)** | this guide; `PROGRAM-HARNESS-USER-GUIDE.md` for programs |
| **Your AI client** (Claude Desktop, ChatGPT, Claude Code via MCP) | the `HOWTO-*` prompts (`list_prompts()`; e.g. `HOWTO-use-pipeline-harness`) — kept in step with this guide |
| **The pipeline's own agents** | their protocol and role guidance — never this guide |
| **Someone investigating a run** | `PIPELINE-RUN-FORENSICS-GUIDE.md` / `PROGRAM-RUN-FORENSICS-GUIDE.md` |
| **Someone setting up internal services** | `CUSTOMER-INTERNAL-SETUP-GUIDE.md` |
| **Anyone checking our claims** | the public verification pack (`github.com/paichart/paichart/tree/main/verification`) |

## Quick Start

### Option A: PIPELINE Task Type (simplest — auto-assigns harness)

```
// 1. Create a PIPELINE task — harness template auto-assigns
perform(action: "task.create", parameters: {
  povId: "YOUR_POV_ID",
  title: "Assess cloud security posture and produce remediation roadmap",
  stageId: "YOUR_STAGE_ID",
  type: "PIPELINE"
})

// 2. Execute — auto-assign detects PIPELINE type and assigns the harness.
//    waitForCompletion:false returns at once; a bare call can report a spurious timeout on a long run.
perform(action: "agent.execute", parameters: { taskId: "PIPELINE_TASK_ID", waitForCompletion: false })

// 3. Watch progress
perform(action: "agent.status", taskId: "PIPELINE_TASK_ID")
```

This triggers **CREATE mode**: the harness decomposes the objective, creates a new pipeline stage, assigns specialists, and executes.

### Option B: Orchestrate Existing Tasks — DEPRECATED post-2026-04-26

This workflow described a pre-resolver pattern: pre-author work tasks in a parent stage + add a PIPELINE task to the same parent stage + harness "detects siblings" → ORCHESTRATE mode. **It no longer works**. Under `harnessModeResolver.ts`, mode is decided by the harness's own `metadata.pipelineStageId` (pointing at the harness's CHILD stage), not by parent-stage sibling detection. A fresh PIPELINE task with no `pipelineStageId` resolves to CREATE — and the harness creates its own fresh child stage in Step 2, ignoring any pre-authored sibling tasks in its parent stage.

**ORCHESTRATE mode** is now an **interrupted-CREATE recovery mode** — it fires only when `pipelineStageId` is set AND the child stage has tasks but some lack templates or dependencies (e.g., a CREATE was killed mid-flight). It's not user-invocable.

**For the original Option B use case** (user pre-authors tasks, wants harness to orchestrate them):
- Use Option A or Option C instead — give the harness an objective, let it decompose. The harness's CREATE mode is far more capable than the pre-2026-04-26 ORCHESTRATE mode.
- If you genuinely need to bring pre-authored tasks under harness orchestration, do it as a CREATE-mode reference: include the pre-authored task IDs in your PIPELINE task description (e.g., "*Build on the existing Solution Architect deliverable in task `<id>` and the Security Audit in task `<id>`...*"). The harness will pick this up via `task.context` reads + integrate. This is the supported pattern post-rework.

### Option C: Create Mode with Manual Template Assignment

```
// 1. Create a task for the harness
perform(action: "task.create", parameters: {
  povId: "YOUR_POV_ID",
  title: "Assess cloud security posture and produce remediation roadmap",
  stageId: "YOUR_STAGE_ID"
})

// 2. Assign the Pipeline Harness template manually
perform(action: "agent.assign", taskId: "HARNESS_TASK_ID",
  agentTemplateName: "Pipeline Harness")

// 3. Execute
perform(action: "agent.execute", taskId: "HARNESS_TASK_ID")
```

Same as Option A but without the PIPELINE type — useful if the task was created before the type was set.

Each CREATE mode run creates its own stage, so multiple runs are cleanly separated:
```
Review & Validation Phase
  ├── Security Configuration Review (existing)
  ├── Pipeline: Cloud Security Assessment (harness run 1)
  ├── Pipeline: Migration Readiness (harness run 2)
  └── Pipeline: Compliance Audit (harness run 3)
```

### Option D: Manual Pipeline (you control each step)

```
// 1. Create Task A (no dependencies)
perform(action: "task.create", parameters: {
  povId: "...", title: "Design security framework", stageId: "..."
})
// → taskId: "TASK_A"

// 2. Assign a specialist
perform(action: "agent.assign", taskId: "TASK_A",
  agentTemplateName: "Solution Architect")

// 3. Create Task B (depends on Task A)
perform(action: "task.create", parameters: {
  povId: "...", title: "Execute security audit", stageId: "...",
  dependencyIds: ["TASK_A"]
})
// → taskId: "TASK_B"

perform(action: "agent.assign", taskId: "TASK_B",
  agentTemplateName: "Security Analyst")

// 4. Execute Task A
perform(action: "agent.execute", taskId: "TASK_A")
// Wait for completion...

// 5. Execute Task B (context auto-chained from Task A)
perform(action: "agent.execute", taskId: "TASK_B")
// Task B's agent automatically receives Task A's output in its prompt
```

---

## Template Types — Which Specialist for Which Task?

| Type | When the Task Requires | Templates Available |
|------|----------------------|-------------------|
| **ARCHITECT** | Evaluating options, designing solutions | Solution Architect, Technical Consultant |
| **BUILDER** | Writing code, implementing | Senior Software Developer |
| **ANALYST** | Data analysis, business case, ROI | Business Analyst, Data Analyst, Marketing Strategist |
| **REVIEWER** | Testing, auditing, security validation | QA Test Engineer, Security Analyst |
| **OPERATOR** | Deploying, coordinating, timelines | DevOps Engineer, Project Manager |
| **DOCUMENTER** | Documentation, guides | Technical Writer |
| **ORCHESTRATOR** | Calling external MCP services | MCP Service Orchestrator, MCP Workflow Orchestrator |

---

## How Automatic Context Chaining Works

When Task B depends on Task A (`dependencyIds: ["TASK_A"]`):

1. Task A executes and produces `result.json` with `finalResponse`, `confidenceScore`, `qualityMetrics`
2. Before Task B executes, the **context chainer** automatically:
   - Reads Task A's `result.json`
   - Extracts `finalResponse`, `confidenceScore`, `qualityMetrics`
   - Injects them into Task B's `inputContext`
3. Task B's agent sees this in its prompt as **Pipeline Context (§6)**:

```markdown
## Pipeline Context (from previous tasks)

*Pipeline: 1 of 1 predecessor tasks completed.*

### Previous Task: Design security framework
- **Agent Role**: solution_architect
- **Confidence Score**: 92/100

**Output:**
[full deliverable text from the architect]

**Use the above output to inform your work.
Build on what was produced — do not repeat or re-derive it.**
```

**Zero tool turns wasted.** The agent immediately has the full context.

**Design note**: The full predecessor output is injected deliberately — research (Omni-SimpleMem, 2026) found that full text outperforms summaries by 53%. For small pipelines (3-6 tasks) this is the right trade-off. Selective context access (manifest + on-demand fetch) is designed but deferred until pipelines exceed 10 tasks with fan-in dependencies.

---

## Auto-Comments and Artifacts

After every successful agent execution, the engine automatically posts a task comment:

```markdown
## Agent Execution Complete
- **Role**: solution_architect
- **Duration**: 145s
- **Tool Calls**: 9 (9 succeeded, 0 failed)
- **Confidence**: 92/100
- **Artifacts**:
  - result.json → `fetch(id: "artifact-cmxyz123")`
```

**Per-execution artifact policy** (post-2026-04-28 rework, `agentArtifactPolicy.ts:getReportMdDecision`):

| Task type | dependents | metadata signal | JSON artifact | report.md? |
|-----------|-----------|------------------|---------------|------------|
| **PIPELINE** (harness root) | any | `metadata.deliverableSourceTaskId` set + source SUCCESS | `pipeline-index.json` | ✅ — engine extracts source's `finalResponse` (the customer deliverable); on an infra change leg, a platform-rendered **Reviewer warnings (non-blocking)** section is appended when the leg's reviewer labelled any (2026-10-08) |
| **PIPELINE** (harness root) | any | metadata set, source NOT yet SUCCESS | `pipeline-index.json` | ❌ — Option A defense (prevents harness CREATE writing misleading content) |
| **PIPELINE** (harness root) | any | (no metadata) | `pipeline-index.json` | ❌ — pre-existing pipelines or skipped Step 5a |
| Non-PIPELINE, **leaf** | 0 | `metadata.suppressDefaultReportMd: true` | `result.json` | ❌ — leaf is QA gate; harness publishes the deliverable |
| Non-PIPELINE, **leaf** | 0 | (no metadata) | `result.json` | ✅ — `report.md = finalResponse` verbatim |
| Non-PIPELINE, **intermediate** | 1+ | n/a | `result.json` | ❌ — chained context only |

**Artifacts explained:**
- `result.json` — Machine-readable: `finalResponse`, `confidenceScore`, `qualityMetrics`, `toolCalls`, optional `reportMdSource` provenance field, execution metadata
- `report.md` — Human-readable customer deliverable: the LLM's `finalResponse` rendered verbatim (no `## Generated Content` wrapper, no metadata headings). On a harness root it is the source child's `finalResponse`, plus — on an infrastructure change leg or a program root — a platform-rendered **Reviewer warnings (non-blocking)** section listing the lines the reviewer(s) labelled `NON-BLOCKING WARNING (<id>):` (facts only; never a gate input; absent when there are none)
- `pipeline-index.json` — Harness-only: forensic summary (the harness's own `finalResponse`) with quality gates, child roster, deliverable pointer — platform-authored instead when the index carries `postCompletionFailure` (the harness completed its task and a later call in the same run failed before its closing turn)

**The customer-facing deliverable is on the harness root post-rework**: `fetch(id: "artifact-<harness's report.md>")`. Per-child `result.json` files are forensic deep-dive material, not customer-facing.

**To read an artifact:**
```
fetch(id: "artifact-cmxyz123")
```

---

## Confidence Scores and the Completion Loop

Every agent is instructed to end with "Confidence: N/100". The engine parses this and stores it in `result.json`.

### For Manual Pipelines

Check confidence after each execution:
```
perform(action: "agent.results", taskId: "...")
// Look for confidenceScore in the response
```

### For the Pipeline Harness

The harness automates the completion loop:

| Confidence | Harness Action |
|-----------|---------------|
| **>= 70** | Accept result, proceed to next task |
| **50-69** | Re-execute once with feedback comment |
| **< 50** | Escalate to human — post comment asking for review |
| **Failed** | Retry once, then escalate |

Maximum **1 re-execution per task** at the protocol level (per `pipeline-orchestrator-protocol` Step 3: *"Re-execute each child AT MOST ONCE. If a child's re-execution is also < 70, escalate."*). Plus a soft-fail retry on FAILED-status executions before escalation.

**Hypothesis-driven feedback**: When re-executing a low-confidence task, the harness reads the artifact and diagnoses what's specifically weak (e.g., "the risk analysis lacks industry benchmarks") rather than just saying "try again." This produces better second attempts. Empirically observed in Run 2 (2026-04-28, harness `cmohyjjzr0011yxagg4hecbtz`): a Reviewer scored 25/100 was diagnosed by the harness ("Reviewer fabricated critique without reading article"), corrected via a structured `**HARNESS DIAGNOSTIC**` comment, and re-executed to 92/100.

---

## Incomplete Pipeline Handling

If the harness runs out of budget or hits rate limits before finishing all tasks, it will:
1. List which tasks completed and which are still OPEN
2. Explain why (rate limit, budget, error)
3. Provide exact `agent.execute` commands for each remaining task
4. State clearly: "Pipeline incomplete — N of M tasks executed"

It will **not** write a success summary if children are unfinished. This prevents you from thinking the work is done when it isn't.

---

## Dependency Enforcement

If you try to execute a task before its dependencies are complete, you'll get a clear error:

```
Cannot execute — 1 dependency task(s) not yet complete:

  - "Design security framework" (status: OPEN, execution: none)

Execute the dependency tasks first, then retry.
```

This prevents invalid pipeline states.

---

## Managing Dependencies

### Set dependencies at creation time
```
perform(action: "task.create", parameters: {
  ...,
  dependencyIds: ["TASK_A_ID", "TASK_B_ID"]
})
```

### Update dependencies on existing task
```
perform(action: "task.update", taskId: "TASK_C_ID",
  dependencyIds: ["TASK_A_ID", "TASK_B_ID"])
```
This replaces all existing dependencies.

---

## Common Pipeline Patterns

### Security Assessment Pipeline (validated empirically by Run 7, 2026-04-29)
```
ARCHITECT (Solution Architect) → Design assessment framework
    ↓
REVIEWER (Security Analyst) → Execute audit against framework
    ↓
ANALYST (Business Analyst) → Produce remediation roadmap with ROI  ⭐ deliverable producer (Step 5a target — leaf)
```

### Development Pipeline
```
ARCHITECT (Solution Architect) → Design architecture
    ↓
BUILDER (Senior Software Developer) → Implement
    ↓
REVIEWER (QA Test Engineer) → Test and validate  ← may need suppress if Documenter is the customer-facing leaf
    ↓
DOCUMENTER (Technical Writer) → Document  ⭐ deliverable producer (Step 5a target — leaf)
```

### Go-to-Market Pipeline
```
ANALYST (Data Analyst) → Market analysis and sizing
    ↓ (parallel)
ANALYST (Marketing Strategist) → Competitive positioning
    ↓
ANALYST (Business Analyst) → Business case with ROI
    ↓
DOCUMENTER (Technical Writer) → Executive presentation  ⭐ deliverable producer (Step 5a target — leaf)
```

**In default pipelines, the LEAF child is the deliverable producer** (the harness wires `metadata.deliverableSourceTaskId = <leaf id>` AND `metadata.suppressDefaultReportMd = true` on the same leaf). Net effect: customer fetches harness's `report.md` (= leaf's finalResponse extracted by engine), single artifact location instead of two competing report.md files. Validated empirically by Run 7 (Security Assessment, 2026-04-29). For synthesis pipelines (Acquirer → Harvester → Editor → Reviewer), the deliverable producer is the **Editor (intermediate)**, not the leaf — see `artifact-synthesis-protocol` for that shape.

---

## Known Limitations

### Token Budget

The harness uses `claude-sonnet-4-5` with a **1M token/hour budget** and **10M token/day budget** (configurable in `lib/services/llm/types.ts`). Each child task execution consumes tokens for both the harness's orchestration calls AND the child agent's execution.

A 6-task pipeline typically completes in 8-10 minutes and ~400-500K tokens. These limits support ~20 pipeline runs per day during active development.

There is also an **MCP rate limit of 300 requests/minute** (configurable via `MCP_RATE_LIMIT_MAX_REQUESTS` env var). The harness fires many rapid API calls during orchestration — this limit provides headroom.

**What happens**: If budget or rate limits are hit, the harness lists completed and remaining tasks with exact resume commands.

**How to resume**: After the hourly budget resets, execute remaining tasks manually:
```
// Check pipeline status
project(action: "task.list", povId: "...", status: "OPEN")

// Execute remaining tasks in dependency order
perform(action: "agent.execute", taskId: "REMAINING_TASK_ID")
```

Context chaining is automatic — each task will receive its dependency's output even when executed manually.

### Tool Turn Limit

The harness has a **100-turn tool call limit** (configurable via `maxToolTurns` in template metadata). Each child task requires ~4-5 tool calls. A 6-task pipeline needs ~50-60 calls, well within the limit. Pipelines of 10+ tasks may approach the limit.

### Self-Completion Guard Dependency on Tool-Use Mechanism

The self-completion guard (§3.5 in the whitepaper) is a **prompt-level** instruction that tells the harness to call `task.list` and verify all children are COMPLETED before reporting success. This works when the native `tool_use` mechanism is functional. If the LLM is invoked with no tool definitions (e.g., `mcpToolRegistry` empty in the hosting process), the model emits tool calls as text instead of native blocks, and the guard's own verification call is hallucinated — making every prompt-level safety check fail simultaneously. Since Apr 10 2026, an **engine-level hard-fail guard** in `agentExecutionEngine.ts` catches this class of failure before the LLM is ever called: if `getToolDefinitions()` returns empty, the execution throws immediately with a diagnostic error naming the likely cause. This defense-in-depth layer means the prompt-level guard no longer needs to be the last line of defense.

### Artifact Retention

Per-task artifact retention is capped at **10 successful + 10 failed executions** (raised from 5/5 on 2026-04-20 — see comment at `agentExecutionEngine.ts:1840-1841`). Older executions and their artifacts are hard-deleted on every new completion. Auto-comments posted during the pruned execution remain (they are keyed on `taskId`, not `executionId`) but their `fetch(id: "artifact-...")` references become dangling pointers after the artifact is deleted. A design proposal for an `AgentExecutionArchive` model to preserve pruned execution metadata is at `.claude/knowledge/domain/harness/TODO-ARTIFACT-RETENTION-ARCHIVE.md`.

### Re-running a Completed Pipeline

Once a PIPELINE task reaches `status: COMPLETED`, it cannot be re-executed in place. **Before relaunching the same objective, set the duplicate clearance** — see *Re-running a pipeline and the duplicate check* above, or the fresh run halts at its duplicate check. The task status state machine enforces COMPLETED as terminal (`VALID_TASK_TRANSITIONS` in `lib/tasks/services/task.ts:20`), and both the MCP `task.update` and web GUI paths reject the `COMPLETED → OPEN` transition. The only working re-run path is to **create a fresh PIPELINE task** with the same objective — the harness will execute it as a new CREATE-mode run, producing its own fresh child stage.

**Stage reuse is safe under the post-2026-04-26 resolver** (`harnessModeResolver.ts`). Mode is determined by the new harness's own `metadata.pipelineStageId` (absent → CREATE) — NOT by sibling presence in the harness's parent stage. Each fresh PIPELINE task creates its own child stage in CREATE Step 2, so old completed pipelines and new runs cannot cross-contaminate even if both parent PIPELINE tasks live in the same parent stage. The pre-2026-04-26 "stage trap" (sibling-detection flipping mode to ORCHESTRATE on a fresh re-run) is gone.

Enabling in-place re-run on the SAME PIPELINE task is a separately tracked enhancement, deferred after 4-specialist review (82/100 average confidence, below the 85% proceed threshold) due to field leakage at MCP handlers, ~5 hours of cross-domain work, and 5 unanswered semantic questions. See `TODO-PIPELINE-INPLACE-RERUN.md` for the full findings.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Dependencies not created | `dependencyIds` missing from task.create | Verify parameter is included in the MCP call |
| Dependency-only update fails with NO_EFFECT | `dependencyIds` nested inside `parameters` object | Pass `dependencyIds` at the top level: `perform(action: "task.update", taskId: "...", dependencyIds: [...])` |
| Context not chained | Dependency task not marked COMPLETED | Check task status — execution should auto-set COMPLETED |
| Confidence score null | Agent didn't include "Confidence: N/100" in output | §8 instruction should prompt this; check if custom template overrides output rules |
| Task B executed before Task A | Dependency enforcement only applies via MCP agent.execute handler | Direct API calls bypass the check |
| Auto-comment missing | Execution failed before artifact creation | Check agent logs for errors |
| Harness didn't execute all tasks | Token budget or tool turn limit exceeded | See "Known Limitations" — execute remaining tasks manually |
| Orchestrate mode not triggered | Mode is `harnessModeResolver`-driven (post-2026-04-26): ORCHESTRATE only fires when `metadata.pipelineStageId` is set AND the child stage has tasks but some lack templates or dependencies (interrupted-CREATE recovery). It is NOT a user-invocable mode. | If you want a fresh decomposition, ensure `metadata.pipelineStageId` is absent on the PIPELINE task (e.g., create a new PIPELINE task) — that resolves to CREATE. Manual ORCHESTRATE-mode invocation isn't supported. |
| PIPELINE auto-assign didn't work | Task type not set to PIPELINE | Create with `type: "PIPELINE"` or manually assign via `agent.assign` |
| `agent.execute` reports "The operation timed out" | A bare call waits for a long run; the client gives up first — the run has usually STARTED | Pass `parameters: { taskId, waitForCompletion: false }`; on a timeout, check the task's executions before retrying (a retry while the first is active is refused; after it finished, it is a real second run) |
| `agent.execute` on COMPLETED task returns "Invalid task status transition" | COMPLETED is terminal in the state machine — no in-place re-run | Create a fresh PIPELINE task in a NEW stage (not the old one). See "Re-running a Completed Pipeline" and `TODO-PIPELINE-INPLACE-RERUN.md` |
| New PIPELINE task escalates instead of decomposing | Pre-2026-04-26 "stage trap" caused this under the old sibling-detection logic. Post-resolver: shouldn't happen — fresh PIPELINE tasks resolve to CREATE regardless of parent-stage neighbors. | If you observe this post-2026-04-26, check `harnessModeResolver` logs for the resolved mode. Fresh PIPELINE tasks should always resolve to CREATE. |
| Pipeline SUCCESS but zero child tasks created (hallucinated pipeline) | `mcpToolRegistry` empty in the process hosting agent execution — LLM invoked with no tool definitions, emits Cline-style XML text instead of native `tool_use`, engine loop never fires | Verify `initializeMCPServices()` runs at startup in the process hosting agent execution. Since Apr 10 2026 Fix 2 (`e4a9c9ef`), `mcp-server-http-clean.js` calls this. If this regresses, `agentExecutionEngine.ts` will throw: "Agent execution requires MCP tools but none resolved from the tool registry" (Fix 1 `1f1c6477`). |
| Self-completion guard reports all children complete but some are still OPEN | Tool-use mechanism broken (model emitting XML text) — guard's own `task.list` verification call is also hallucinated | This is a deeper failure than the guard can catch alone. Fix 1's engine-level hard-fail on empty tools prevents this scenario from reaching the guard at all. |

---

## Production Performance

From real pipeline runs on production (Apr 2026):

| Metric | Value |
|--------|-------|
| Pipeline decomposition (harness planning) | ~30 seconds |
| Single specialist execution | 30-60 seconds |
| Full 4-task pipeline (create mode) | ~6.8 minutes |
| Full 6-task pipeline (create mode) | ~8.1 minutes |
| **Full 3-task pipeline (orchestrate mode)** | **~3.8 minutes** |
| Template inference accuracy (orchestrate mode) | 100% (10/10 across 3 tests) |
| Confidence score parsing | 100% success rate |
| Context chaining | 100% — both create and orchestrate modes |

---

## Architecture Reference

The harness lifecycle is **three modes plus engine post-processing**, with reactors providing loop closure between modes. The harness itself does NOT execute children — it composes structure (CREATE), then exits. Reactors cascade child execution. The harness re-enters once for SYNTHESIZE when all children are terminal.

### CREATE Mode (user-triggered first run)
```
Human triggers agent.execute on PIPELINE task
    ↓
harnessModeResolver.ts (pre-LLM): metadata.pipelineStageId absent → resolve mode = CREATE
    ↓
Pipeline Harness (sonnet) reads Harness Context block
    ↓ project(action: "pov.details") — POV context
    ↓ stage.create — fresh child stage; engine writes harnessTaskId back-pointer onto stage.metadata
    ↓ task.update self — record metadata.pipelineStageId
    ↓ task.create × N — typed children with dependencyIds
    ↓ agent.assign × N — templates per child
    ↓ task.update self — Step 5a: metadata.deliverableSourceTaskId = <deliverable producer child id>
    ↓ task.update <leaf> — Step 5a: metadata.suppressDefaultReportMd = true
    ↓ task.comment — PIPELINE QUEUED breadcrumb (first-line **Child stage:** id — name)
    ↓
Harness EXITS. pipeline-index.json written by engine (no report.md — Option A).
```

### Cascade Phase (reactor-driven, no harness involvement)
```
taskReadyReactorService queues dep-free children (children with no upstream deps)
    ↓
Each child executes via agentExecutionEngine
    ↓ Child receives §6 Pipeline Context — upstream's result.json.finalResponse auto-injected
    ↓ Child produces finalResponse → result.json (engine wraps)
    ↓ For unsuppressed leaves: also report.md (= finalResponse verbatim)
    ↓
On child completion → reactors fire:
    • maybeQueueReadyDependents — unblocks next children with satisfied deps
    • maybeRetriggerPipelineHarness — checks if all children of harness's child stage are terminal
    ↓
Children cascade until ALL terminal (COMPLETED or FAILED).
```

### SYNTHESIZE Mode (reactor-triggered)
```
pipelineRetriggerReactorService: harness's child stage all-terminal → queue harness execution
    ↓
harnessModeResolver.ts (pre-LLM): pipelineStageId set + all children terminal → resolve mode = SYNTHESIZE
    ↓
Pipeline Harness (sonnet) reads Harness Context block
    ↓ Reads each child's confidenceScore (via task.context or chained context)
    ↓ Applies quality gate: ≥70 accept; 50-69 retry once with diagnostic; <50 escalate
    ↓ Composes synthesis prose: breadcrumb + quality gates table + audit trail + deliverable pointer
    ↓ Pointer uses placeholder: "**📄 Final deliverable:** fetch(id: "artifact-{{HARNESS_REPORT_MD_ID}}")"
    ↓ task.complete (4-point invariant gate at server)
    ↓ task.comment — final SYNTHESIZE comment
    ↓
Harness EXITS.
    ↓
Engine post-processing (still inside same prisma.$transaction):
    ↓ getReportMdDecision — sees decision.source === 'upstream'
    ↓ Extraction: tx.agentArtifact.findFirst on source's result.json (POV-scoped)
    ↓ Writes harness's report.md = source's finalResponse content
    ↓ Substitution: scans pipeline-index.json content for {{HARNESS_REPORT_MD_ID}}
    ↓ Replaces with just-created report.md artifact ID via tx.agentArtifact.update
    ↓ Adds reportMdSource forensic field to result.json
    ↓
Transaction commits. Harness COMPLETED.
Customer fetches: fetch(id: "artifact-<harness's report.md>") → clean prose deliverable.
```

### ORCHESTRATE Mode (rare — interrupted CREATE recovery)

Fires only when `metadata.pipelineStageId` is set AND child stage has tasks but some lack templates or dep wiring (e.g., a CREATE was killed mid-flight by pm2 restart). The harness finishes the partial setup and exits. Same as CREATE for cascade + SYNTHESIZE downstream.

**Key files:**
- `lib/services/agentArtifactPolicy.ts` — `getReportMdDecision()` discriminated-union policy gate (post-2026-04-28)
- `lib/services/harnessModeResolver.ts` — pre-LLM mode resolution (since 2026-04-26)
- `lib/services/agentExecutionEngine.ts` — Execution engine + artifact creation + **engine extraction at lines ~1685-1730** + **substitution at lines ~1810-1851** + **20-min stale-execution watchdog at lines 162-218** + **hard-fail guard on empty tool registry** (Apr 10 2026)
- `lib/services/pipelineRetriggerReactorService.ts` — Auto-fires SYNTHESIZE when all children terminal
- `lib/agents/harness/context-chainer.ts` — Automatic §6 Pipeline Context chaining
- `lib/services/agentTaskService.ts` — Pre-execution chaining hook
- `lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts` — Dependency enforcement at MCP entry
- `lib/services/pipelineProtocolValidator.ts` — Post-execution protocol-step validator (forensic; non-blocking)
- `lib/server-init.ts` — `initializeMCPServices()` — embedded MCP server + tool registry bootstrap
- `mcp-server-http-clean.js` — paichart-mcp entrypoint; **calls `initializeMCPServices()` at startup** since Fix 2 (`e4a9c9ef`, Apr 10 2026)
- `scripts/seed-harness-template.ts` — Pipeline Harness template definition
- `scripts/seed-protocol-prompts.ts` — protocol prose: `pipeline-orchestrator-protocol` v3.7.1, `artifact-synthesis-protocol` v1.3.0

**See also**: `HARNESS-MENTAL-MODEL.md` (concepts), `PIPELINE-DATAFLOW-REFERENCE.md` (per-role I/O), `PIPELINE-OBSERVABILITY-GUIDE.md` (admin runtime investigation).
