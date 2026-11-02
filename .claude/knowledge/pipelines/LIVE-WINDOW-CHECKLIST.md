# Live window checklist (pipeline / program live controls)

> Created 2026-10-19 from the held-k8s step-2 shadow window (`cline_docs/reviews/held-k8s-2026-10-18/WINDOW-RUN-SHEET.md`,
> learnings ledger LL-30..LL-37). Use it for any pre-registered live control or shadow window. Each row is a check, not prose.

## Before the first leg
- [ ] **The POV / phase / stage text describes the WORK, never the test** — agents read it (`project(pov.details)` is a Harvester's
      first call): a description naming the legs or the run sheet reached an Architect's output (held-terraform step-2 window, F-W4). Task titles
      too: no leg labels. *(LL-T-24)*
- [ ] **Non-demo POV** (`metadata.isDemo` absent/false) dedicated to the window. *(LL-32)*
- [ ] **Rig reset to a RECORDED commit** (e.g. lab repo `git rev-parse HEAD` in the run sheet). *(LL-32)*
- [ ] **Distinct objective per leg in one phase** — or pre-set `metadata.duplicateAcknowledged` = an ARRAY of every prior
      `Pipeline:` stage id, verified `jsonb_typeof = 'array'` in the row. *(LL-30)* The duplicate check is SEMANTIC: an objective
      that is a SUBSET of an earlier one ("add an HPA" after "add requests/limits and an HPA") halts too — prefer a dedicated POV/phase
      per window. The clearance can be set through MCP `task.update` (`parameters.metadata`) — it merges; no psql. *(step-4 window, CTRL)*
- [ ] **The duplicate check is POV-WIDE, not per phase** — re-running a program spec in a NEW phase of the same POV halts. Before a
      program re-run set `duplicateAcknowledged` = an ARRAY of the prior PROGRAM stage AND each prior leg's `Pipeline:` stage; the harness
      carries it onto the legs. *(LL-N-41)*
- [ ] **List each fact's triggering shape beside the leg that must exercise it** — a fact only runs on its shape (the Git-file-vs-device
      comparison needs ONE device declaring BOTH sources; no standalone leg had it in J5). *(LL-N-44)*
- [ ] **A refusal leg proves the REASON, not the override** — when the agents refuse for the same cause the carrier records `forced: false`;
      to show the platform overriding an approval, design a leg the agents would approve. *(LL-N-42)*
- [ ] **A program leg's spec topology carries NO `lifecycle` field** (`grep -c '"lifecycle"' topology.json` → 0) — the Architect copies it
      into the contract and Node C refuses a teardown it cannot see (k8s P-K1 refused; terraform P-T1, without it, approved). *(LL-T-30)*
- [ ] **The in-scope direction needs a leg whose change can ONLY be an edit of an existing held line** — an Author may add resources in a new
      file and touch no held file. *(LL-T-28)*
- [ ] **Concurrent legs that self-provision the same service:** run them serially, or accept that the first teardown deletes
      the shared registration (register CONCURRENT-SELF-PROVISION). *(LL-13)*
- [ ] **No battery running on the tree**; if a fix landed, the WHOLE battery re-ran green (the `&&` chain stops at the first
      failure). Check which suites read docs before editing docs mid-battery. *(LL-33)*

- [ ] **Probe the rig read-only first** — MCP `initialize` + `list_devices` + one `facts` getter through the tunnel; record uptime.
      *(LL-N-22)*
- [ ] **A stage must exist before `task.create`** in a fresh POV (`stage.create` under the phase); launch = `task.create` (type
      PIPELINE, `(protocol: …)` in the title) → `agent.assign` Pipeline Harness → `agent.execute` `waitForCompletion:false`.
- [ ] **Plant a contract mismatch through the contract path** (`task.create parameters.interfaceContract`), never by steering a
      Program Architect — deterministic, and the path a program leg receives. *(LL-N-21)*
- [ ] **Never commit on main while the owner runs a lab** (the lab's RULE 7 trips on a moved HEAD). *(LL-N-26)*

## During
- [ ] **Role flips: keep the role for the WHOLE leg** (access is checked live per call); **re-sign-in the MCP session after
      every flip** (invalidation can lag); verify identity (`registry list`) before any write — and again before EVERY launch or
      re-execute while flipped; a failed write may still have landed — read the DB before a retry. *(LL-31)*
- [ ] **Legs sharing a self-provisioned descriptor run ONE AT A TIME** (each launched after the previous is terminal) — decided
      2026-10-19, register CONCURRENT-SELF-PROVISION.
- [ ] **Plant drift only on a leg running ALONE.** *(LL-32)* Desired-state domains: change the live object out of band, then refresh state
      (terraform: `awslocal … put-bucket-tagging` + `terraform apply -refresh-only`, state copied first); reset the rig after. *(LL-T-27)*
- [ ] Launch with `waitForCompletion:false`; read executions before any retry.

## After
- [ ] Tear down / verify **0 leftover registrations**; rig back to the recorded commit. *(LL-32)*
- [ ] MI-13 read: every 🔴 0, controls non-zero.
- [ ] **Hand-read every package and RUN its offline validation steps where you can** (python/jq/git locally) — a stated output the
      command does not print is a finding no gate measures (register STATED-OUTPUT-NOT-PRINTED).
- [ ] **Reconstruct each held candidate** from the BASE + the package's edits, hash it against the held CANDIDATE, and run the domain's offline
      check on it (terraform `fmt -check` in a throwaway container). *(LL-T-26)*
- [ ] **Prove a secret's ABSENCE against the real value**, never a marker: read it from the rig into a shell variable (never printed) and count the
      value, its hash and an 8-char prefix across every artifact, child brief/inputContext and comment. *(LL-T-25)*
- [ ] **Operator base check:** fetch a held blob by the ref's SCOPE (`held_blobs` holds one row per scope) — by sha alone the bytes
      come back twice and the check correctly STOPs `held-text-integrity`.
- [ ] **A refusal you did not expect: read its evidence before accepting it** — an absence-shaped refusal (e.g. Node C's "teardown
      unverified") can be true as a fact and wrong as a conclusion when the evidence never reaches the reviewer (register
      NODE-C-TEARDOWN-UNSEEABLE).

## After an agent-text deploy — the canary (Protocol 16 § The standing no-regression rule, rule 3; added 2026-10-31)
- [ ] **Print the launch plan first:** `npm run report:canary-plan -- --expect <protocol>@<version>` (read-only; the latest released root's
      title, description, spec URLs, POV team, phase and stage, filled in). It creates nothing: run its calls through MCP.
- [ ] **Re-run the latest released program from its PUBLISHED spec** on a fresh stage (a new POV is cleanest: no duplicate clearance, no
      reach-around), with the clearance metadata set if it shares a POV. Latest released program: the telemetry export program (spec
      `program-artifacts/telemetry-export-held/`, released 2026-10-29, root `cmvsyg4t1000oyxb3adp0yvmv`, ≈ $12).
- [ ] **It must come back `programReleasable: true`, and every leg is hand-read**, before the NEXT agent-text batch ships.
- [ ] **Read the verdict mechanically first:** `npm run report:canary -- --root <canary root> --expect <changed protocol>@<new version>
      --control <the change's control>` (read-only, from the server's `current/` or a read-only connection). VOID means the deploy had
      not landed (re-run); UNEXERCISED on a control is an absence, not a pass.
- [ ] **If it does not:** roll back newest first and treat the cause as a finding before anything else ships.
- [ ] **Record it** in the run sheet of the deploy it checks and in the series-cut entry; a passing canary is also a candidate golden case
      (add by owner decision, register NO-REGRESSION-GOLDEN-SET; CANARY 1's legs were hand-read and entered golden v2 on 2026-10-31,
      a near-duplicate leg left out with its reason in the set's `refreezes`).

## Committing the records
- [ ] **Gitleaks on synthetic secret-shaped fixtures:** allowlist EXACT values with a dated comment + a negative control,
      never a pattern. *(LL-34)*
- [ ] **Documented greps avoid `$`** (the audit skips them) and are re-derived when the pinned code string changes. *(LL-35)*
- [ ] **A docs push never carries a code commit:** a code fix rides the next code push as its own local commit; push the docs commit alone
      (`git push origin <sha>:main`) after checking every file is on a deploy-ignored path. *(LL-T-38)*
- [ ] **`*.md`, `cline_docs/**`, `.claude/**` are deploy paths-ignore** — a docs-only push does not deploy; a range with code does. *(LL-36)*
- [ ] **Typecheck the scripts that build a changed type** — `scripts/` is not typechecked by the build. *(LL-37)*
