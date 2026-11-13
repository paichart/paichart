# Pipelines

A **pipeline** takes one objective for one system and produces a reviewed deliverable: for a change, a change package a person
can apply. It runs as a small team of agents (read the current state, design, write the package, review it), each started by
the platform when the one before it finishes. A **program** is several pipelines coordinated as one change
([PROGRAMS.md](PROGRAMS.md)); each of its legs is a pipeline, so everything here applies to each leg.

This page covers kept files and how a change is written against them, how to write a pipeline task, how to declare where each
device's configuration is read from, and how to read a result. How a pipeline works inside is in
[HOW-IT-WORKS.md](HOW-IT-WORKS.md). Terms are in [GLOSSARY.md](GLOSSARY.md).

## Starting a single pipeline

Most changes run as a program ([OPERATING.md](OPERATING.md)). To run one pipeline on its own, create a task of type `PIPELINE`
whose title ends with the protocol for its domain, for example `(protocol: network-provisioning)`, and whose description
states the objective and names the service or files to read ("Writing a domain pipeline task" below). Then start it:

```
perform(action: "task.create", parameters: { povId: "<pov id>", stageId: "<stage id>", type: "PIPELINE",
  title: "<objective> (protocol: network-provisioning)", description: "<the task>" })
perform(action: "agent.execute", parameters: { taskId: "<the new task id>", waitForCompletion: false })
```

`agent.execute` attaches the *Pipeline Harness* template to a `PIPELINE` task that has none; assigning it first (`agent.assign`) is optional. `project(action: 'task.list', povId: …)` shows
progress. Starting a pipeline spends your Anthropic credit.

**What you get at the end.** A pipeline has no gate of its own: it runs through and finishes. On the pipeline task you will find:

- **`report.md`: the deliverable.** For a change pipeline this is the change package. The platform takes it from the final
  answer of the agent that wrote it (the Author), so it is that text, not a retelling, and adds its own lines where it has
  something to say: an outcome it forced, warnings.
- **`pipeline-index.json`: the pipeline's own summary.** A table of each agent's result, the reviewer's verdict, and the outcome
  (`approved`, `needs-revision` or `escalated`).
- **A final comment** naming the outcome and pointing to the deliverable.

Each agent's task also keeps its own `result.json` (its full answer and the facts the platform recorded about it) and usually a
`report.md`. The Author's `result.json` is where to look for the package together with its recorded facts.

`approved` means the reviewer found nothing blocking; it does not mean applied. Read the result as in "Reading a pipeline's
result" below, then apply the package yourself ([GATES.md](GATES.md), "Applying a package").

## Kept files — edits by reference

*Available in **observability-config**, **kubernetes-gitops**, **terraform-iac** and **network-provisioning** — k8s and terraform with files from a Git config repo, network with
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

A forced needs-revision is a fact, not a judgement: do not hand-edit the package to "fix" it. For a pipeline on its own, run a fresh task; for a leg of a program, launch a new run of the program ("run a fresh leg" in the table below means exactly that).

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

A completed leg cannot be re-run in place: create a fresh PIPELINE task (see "Re-running a pipeline and the duplicate check" below).

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
3. **Apply** the candidate (the Kubernetes, Terraform and Network sections below say how — copy into place, or a pull request), run the package's validators
   and post-apply checks. Rollback = the `restore` in the package (the kept original).

The base check is an operator tool, run from a copy of this repository.

**Files kept from a Git repository** (the file source for kubernetes-gitops): the
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

### Terraform: kept `.tf` files from your config repo

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

### Network: kept device configurations

- **Declare each device's source** in a `## Device sources` block ("Network: choosing each device's source" below): `git-file` (your config file in a Git
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
  differences rather than real drift: for example, a top-level BGP `network` line in the Git file is shown by the device under
  `address-family ipv4`. The incremental apply is still the safe shape for that device.
- **Markers on new members.** When the change adds a member to a population the objective, the contract or the existing members
  identify by a marker (for example the description every existing exporter interface carries), the new member carries the same
  marker, in plain ASCII, so a later value leg that selects by it sees the new member. Known cosmetic case: when the existing
  descriptions carry an extra note (for example `telemetry-exporter (existing allocation)`), the new member may copy the whole
  description, note included.
- **Proven on one platform family** (Arista EOS); other vendors are designed for but not yet live-proven.

### Limits worth knowing

- A file the platform could not keep (too large, a redacted credential it cannot hold, no file source) falls back to the
  old way: written in full and reviewed in full. The card says which.
- Only files read through a **declared file source** are kept. A file merely pasted into the task is not.
- Credentials never belong in an edit — reference them (`${env:NAME}`) or state an operator step.
- **Run one pipeline at a time per cluster or Terraform descriptor.** Runs that share a descriptor share one service registration,
  and the first to finish removes it from under the others.

Design and evidence: [`kept-file-edit-by-reference-pattern.md`](../.claude/knowledge/patterns/kept-file-edit-by-reference-pattern.md).

---

## Writing a domain pipeline task

Every example below has run live; copy and change the work, the devices and the sources.

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
  that other device must be listed too, or its allocations are never read and a colliding value can be chosen. (This has happened: an
  edge leg listed only the switch it changed, never read the second switch, and chose a NAT pool that switch already used. The
  program's integration review caught it; the leg's own review did not.)

  > ⚠️ **Known limitation — an undeclared device is not checked by the leg.** If a device the leg must see is
  > left out of its block, the leg's Reviewer can APPROVE a derived value that collides on that device. This is most likely when
  > the package explains the gap ("that device was not read; the cross-device check belongs to the program integration review") —
  > measured: the Reviewer accepted that explanation in every lab sample, even with the platform naming the undeclared device. The
  > only check left is the program's integration review (it has caught such a case), and a standalone pipeline has none.
  > **The fix is in your hands: list the device.** Once it is listed, the leg reads it (`live-read` / `git-file`) and checks the
  > value against it; if it cannot be read, the Reviewer refuses.
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
- **A value leg (`(protocol: network-derivation)`) has its OWN block.** It derives a
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
  change touches a few switches, list the evidence devices anyway.

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
and every leg reads it from there. In a project that already holds a run, put a **run number** in the title and set the duplicate clearance
([TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md), "Launching again in the same project").

## Reading a pipeline's result

### What "approved" means — and what it does not

**Approved = reviewed, not applied.** A pipeline produces a change *package* (the configuration change, its validation steps, its rollback,
and how to apply it). `approved` means the package passed its Reviewer and every platform check. **Nothing has been applied** to any
device, cluster, account or file — every pipeline harvests read-only and writes nothing outside pAIchart. Applying is **your** step, done
with your own tooling and change process, after a human decides to release.

Two things no pipeline or agent ever does: **apply** a change, or **choose** a configuration source for you (you declare it — e.g. the
network `## Device sources` block). And none is asked to **approve** a gate: gates wait for a person ([GATES.md](GATES.md), "Who can
release a gate"). `needs-revision` means the package must not be applied as it
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
omitted, added or changed line is a finding), **excerpt** (file sources: the same, except gaps marked `# [elided: …]`, whole
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
| a comment "duplicate …" + `metadata.duplicateHalt` | the same objective already ran (see *Re-running* below) | launch a new task with the clearance set ([TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md), "Launching again in the same project"); a stopped task is not started again |
| `metadata.cannotRun` (+ `executionStatus: FAILED`, `AGENT_STAMPED_CANNOT_RUN`) | the harness found the pipeline can never run as configured — e.g. no `## Device sources` block for a network device, a required upstream value missing | fix what it names, then create a fresh task |
| `NAMED_PROTOCOL_NOT_FOUND` / `PROTOCOL_ROW_NOT_ACTIVE` in the execution error | the `(protocol: …)` token in the title names no active protocol (typo, or a retired name) | use a current token (`HOWTO-use-pipeline-harness` lists them) |
| `INTERFACE_CONTRACT_MISSING` | a program leg that needs the plan's interface contract has none | launch the program again; never hand-copy a contract |
| a question in a comment, nothing else | the objective was ambiguous; the harness asked rather than guessed | answer by editing the task description, then start the task again |

These refusals happen **before any agent spends** on the work (the platform ones before any model call).

### Re-running a pipeline and the duplicate check

- **A completed pipeline cannot be re-run in place.** Create a **fresh** PIPELINE task with a run number in its title: a task with
  the same title in the same stage is not created again.
- **The duplicate check.** Before it starts, a pipeline looks for an earlier run with the same (or a near-identical) objective. A
  pipeline checks the stages of its phase; a program found a duplicate in **another phase of the same POV** — treat the check as
  **POV-wide**. A semantic subset ("add X" after "add X and Y") can match too.
- **To re-run on purpose,** set the clearance in the task's metadata BEFORE launching (MCP `task.update`, `parameters.metadata`):
  `duplicateAcknowledged: ["<prior stage id>", …]` — an **array** naming every earlier run's stage: for a pipeline its
  `Pipeline: …` stage (`metadata.pipelineStageId` of the earlier task), for a program its `Program: …` stage **and** each leg's
  `Pipeline: …` stage. A single id when several runs exist will halt again. Then
  launch; a program carries the list onto its legs. `project(action: 'pov.details', povId: …)` lists the stages.
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
  private endpoints (inside your network) need the operator's allowlist. Full rules: [CONNECTING-YOUR-SERVICES.md](CONNECTING-YOUR-SERVICES.md).

### Cost and time to expect

Measured on real runs (lab rigs), model prices of the day; a guide, not a quote.

| Run | Cost | Time |
|---|---|---|
| Standalone terraform leg | ≈ $1.88 mean (5 legs, range $1.78–2.08) | ≈ 7–10 min |
| Standalone kubernetes leg | ≈ $2.21 mean (6 legs, range $1.82–2.67) | ≈ 7–10 min |
| Standalone network leg | ≈ $2–3 (window estimates; not yet metered per leg) | ≈ 7–10 min |
| One-leg program (plan + gate + leg + producer + Node C) | ≈ $4.40–4.60 (k8s / terraform) | ≈ 20–40 min + your gate wait |

The change author runs on a larger model (Opus) than the other roles; a leg's cost is mostly that author plus the size of the
configuration it reads. Reliability target: ≥ 90% correct outcomes per domain, **0 false releases** — a correct refusal counts
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

Need an old run's evidence later? Copy what matters into your own records — pruning is by count, not by importance.

### Who reads which document

| Reader | Reads |
|---|---|
| **You (running or reviewing pipelines)** | this guide; `PROGRAMS.md` for programs |
| **Your AI client** (Claude Desktop, ChatGPT, Claude Code via MCP) | the `HOWTO-*` prompts (`list_prompts()`; e.g. `HOWTO-use-pipeline-harness`) — kept in step with this guide |
| **The pipeline's own agents** | their protocol and role guidance — never this guide |
| **Someone whose run has stopped** | [TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md) |
| **Someone setting up internal services** | [CONNECTING-YOUR-SERVICES.md](CONNECTING-YOUR-SERVICES.md) |
| **Anyone checking our claims** | the [verification pack](../verification/README.md) |
