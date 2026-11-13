# Kept-File (Edit-by-Reference) Pattern

**Status: PRODUCTION — Confidence 95%** (raised 2026-10-22, TF-CLOSEOUT; 90% at K8S-CLOSEOUT 2026-10-19). Proven end to end in FOUR
domains: observability-config (PLATFORM-HELD-BYTES, deployed 2026-10-17: lab 25/25 edits applied, five live legs every operator base check
MATCH, live controls C-1…C-3, an applied edit inside a program), **kubernetes-gitops on a Git file source** (held-k8s, 1.18.0 deployed
2026-10-19: L-K2 SHIP; step-4 window 7 legs all PASS) and **terraform-iac on the same Git file source** (held-terraform, 1.15.0 deployed
2026-10-21: L-T2 every gate; step-4 window 5 standalone legs + a releasable one-leg program, 3/3 in-scope edits applied first time, a
one-resource held file with planted drift applied, every operator Git base check MATCH, 0 packages wrongly forced) and **network-provisioning**
(held-network, 1.25.0 deployed 2026-10-27: L-N2 SHIP 19/19; J5 window 6/6 correct, 0 false releases — a Git-file base, device-read bases,
both-declared devices (device read = evidence only), contract-carried sources inside a releasable program, the D-1 force reasons recorded
live, and an operator apply on a lab switch whose device diff equalled the package's change and auto-reverted byte-identical). The 90% cap is gone:
**the G-4 force (a refused off-pin read forces needs-revision) fired LIVE** on terraform (T-L4) — on k8s the protocol text had refused
before the pin. Not 100: the reflection-pass arbitration (F-T2-1 (b)) is fixture-proven only (no live coincidence), and the network force's override direction (Reviewer approves, platform forces) is fixture-proven only — the live refusal legs
refused at the agents first. Network is proven on ONE platform family (EOS lab). Owner: pipeline-harness-specialist. Register: PLATFORM-HELD-BYTES, HELD-GIT-MCP-K8S-TERRAFORM.
---

## Pattern Overview

**Problem.** A pipeline Author that must change a configuration file is shown the file through a Harvester's quote and writes the
changed file back out whole. Both steps are retyping, and retyping loses bytes: in 28 of 42 observability harvests the Harvester
dropped lines from a quote it labelled verbatim, and in three it changed a word (`$remote_addr` → `$remote_actor`, which fails
`nginx -t`). Every downstream check compared against the same bad copy, so no reviewer caught it.

**Solution.** Two halves, the aider unified-diff lesson applied to config files:
1. **The model writes edits, not files.** The Author writes only SEARCH/REPLACE blocks against a file handle it is shown (`H2`), and
   a rollback as `restore H2`.
2. **The platform keeps the bytes and applies the edits.** The platform stores the exact bytes the read-only file source returned,
   applies each edit (a SEARCH must match exactly once, else it is refused), keeps the result, and gives the Reviewer **the platform's
   diff** — not the Author's description of it. A gate fact records what happened; a package whose held edit was not applied is
   forced to needs-revision whatever the Reviewer said.

**Results (observability, 2026-10-14 → 10-17).** Edits applied 25/25 in the lab; every live leg's base check MATCH; the same
objective run twice produced a byte-identical candidate (`ccf3ce9c…`); an applied edit inside a program released. The retyping
failure class cannot occur on a held file: the bytes never pass through the model.

**Quote fidelity is the problem this removes — for the files being EDITED.** Quotes used as EVIDENCE (device reads, unheld files, a
Harvester's narrative) still pass through the model, and `quoteFidelity` (execution-facts) is the fact that checks them: verbatim
and, since v6, excerpt-labelled file-lane quotes are read strictly; an unlabelled quote may narrow freely. Users: docs/READING-A-RUN.md
§ "Facts about the package's own text".

---

## When to Use This Pattern

Use it when ALL hold:
- An agent must **change** a file an operator owns, and the changed file is what gets deployed.
- A **read-only file source** can return **the file the operator writes** — not a rendering of it. (An API rendering of running
  config, a live cluster object, or Terraform **state** is EVIDENCE, never a held file. State is never held — the terraform moat.)
- Exact bytes matter (comments, ordering, whitespace, quoting).

Do NOT use it for: value derivation (use the derivation-containment net), reading evidence, or text an agent only quotes.

---

## The Pattern

### 1. Prerequisite — a file source (one per domain, or shared)

The file source must be read-only and return raw file text at a stable place in the tool result. Probe it before designing on it
(feedback: verify the primary observable): record the tool name, WHERE the text sits (field, embedded resource, base64?), the path,
and what a directory or a missing file returns. A probe settles the capture work: raw text at a stable field ⇒ a descriptor only;
an array element / embedded resource / base64 ⇒ a selector-grammar or decode change in `held-bytes/extract.ts`.
Reference source: **Addendum A (GitHub)**.

### 2. The mechanism (domain-agnostic code — reuse, never re-implement)

| Piece | Where | What it guarantees |
|---|---|---|
| Descriptor (which tool result is a file, its target + path) | `lib/agents/harness/held-bytes/descriptors.ts` (closed-world per service) | capture is descriptor-driven, not protocol-driven |
| Capture (raw tool-call record → held blob + ref, R10-redacted) | `held-bytes/extract.ts`, `lib/services/held-bytes-capture.ts`, `held-bytes-store.ts` | reads the IN-MEMORY raw record (before truncation/R9); never R9's fields |
| View + handles shown to the Author | `held-bytes/view.ts`, `handles.ts`, `render-held.ts` | the Author edits against a handle, never retypes |
| Edit grammar + applier + whole-file detector | `held-bytes/edits.ts`, `apply.ts`, `whole-file.ts` | SEARCH matches exactly once or is refused; a fenced block covering ≥ 0.90 of a held file and adding a line is refused (`held-file-written-whole`) |
| The ONE scope predicate | `held-bytes/scope.ts` | which packages are held-in-scope; SIX readers, one rule |
| Carrier (sole writer of `qualityGate.heldEdit`) | `lib/agents/harness/held-edit-carrier.ts` (+ `lib/services/held-edit-step.ts`) | forces needs-revision on an in-scope package whose held edit was not applied |
| Held-capable set | `held-bytes/variant.ts` `HELD_JOIN_VERSIONS` (→ `HELD_CAPABLE_PROTOCOLS` = its keys; MI-13 `_heldjoin` mirrors it, CI-pinned) | held is a CAPABILITY of a protocol, not a variant protocol |
| Selector grammar | `descriptors.ts` `FileSpec.select`: `seg ('.' seg)* ('.*')?`, a seg is a key or **`name[field=literal]`** (exactly ONE matching element; 0 ⇒ `directoryWhenNone`, ≥ 2 ⇒ ambiguous) | a file inside an array (an MCP resource item) is selected by TYPE; the stored ref keeps the resolved positional JSON Pointer |
| Git file source (held-k8s) | descriptor `gitPin` + `legScope: 'git-file-source'`; `variant.ts` `GIT_FILE_SOURCE_PROTOCOLS`; ONE pin module `lib/mcp/server/config/git-file-source-pin.js` used at BOTH gates (call time `PINNED_ARGUMENT`, capture `source-not-pinned`) | a Git read is held only on a leg allowed to read one, only from the pinned repo/ref/path, with its commit in `held_file_refs.sourceRevision` |
| Persist hygiene (held-k8s G-1) | `held-bytes/git-status-elision.ts`, first step of the result.json toolCalls builder | a Git source's blob ids (status line, directory listing) never persist; replaced in place so positional selectors still resolve |
| Operator base check | `scripts/held-base-check.ts` (private): host-file mode, and `--git` mode (operator's own `gh`; blob id at the recorded commit, ancestor of head, unchanged at head / PR base) | the held base is what is deployed — checked independently of the capture path |

### 3. Joining a new domain (the procedure — PHASE10-PLAN §10.6 / architectural-review "lens 1" items 1–13)

Run a Phase 0 inventory first (the stop rule applies: > 5 h, > 4 specialists, > 5 files). Check each item against the CURRENT tree
— some were folded in Phase 10, so the list is a checklist, not a backlog. **Re-verify the inventory after the PREVIOUS domain closes and grep
the shared code paths the join touches** (seeds, the correction arbitration, the carrier, `ROLLBACK_FACT_LANES`) — the two worst k8s→terraform
gaps were found only in code *(LL-T-36)*. **Keep a learnings ledger and append at EVERY step close**, ids citable by the next plan *(LL-T-35;
`held-terraform-2026-10-19/LEARNINGS-LEDGER.md`)*:
1. **File source + descriptor** for that service; for terraform a TEST that no descriptor ever names `state_pull` / `state_list`.
2. **ONE row in `HELD_JOIN_VERSIONS`** (canonical protocol name → the version that carries the held text; `HELD_CAPABLE_PROTOCOLS`
   is derived from its keys) **plus the same pair as a literal in MI-13's `_heldjoin`** — `test-held-bytes-store` fails if they differ.
   *(corrected by the k8s join: it was "add the name to `HELD_CAPABLE_PROTOCOLS`")*
3. **Protocol text** via the SHARED held constants (`HELD_FILES_SECTION`, `HELD_EDIT_CLAUSE`, the SYNTHESIZE/Author fragments) —
   never re-authored inline; its worked example must not be another domain's file. Text change ⇒ Protocol 16 lab. The example anchors its SEARCH
   on the line that names the object (`resource "<type>" "<name>" {`, a container's `- name:`), and its test plants the repetition *(LL-T-09)*.
4. **Template constraints** (`HELD_AUTHOR_CONSTRAINT` / `HELD_REVIEWER_CONSTRAINT`) spread in the domain's OWNING seed; reseed. **Refactor the owning
   seed FIRST** (export `TEMPLATES` + `buildTemplateRow`, guard `main()`): the two-way pin `require()`s it, and a seed that runs on import seeds the
   DB from a test; prove the refactor a no-op against prod *(LL-T-01)*.
5. **Node C** wording keyed on the card fact (`editApplication`), not a domain name.
6. **Rollback-lane precedence** — decided at the k8s join (K-4): a desired-state lane (terraform, kubernetes) NEVER reaches the content
   arms of `rollback-containment-enrichment.ts`; a held-capable desired-state leg gets the held-first branch. Joining also makes EVERY
   Reviewer of that domain receive a chained `rollbackContainment` fact (`ROLLBACK_FACT_LANES` derives from the held-capable set) — an
   input change for that domain's reviewer series.
7. **MI-13** arm (or a structural key on `editApplication`), `reviewer-warnings-enrichment.ts` protocol lists, the
   `test-variant-protocol-sites.ts` ledger.
8. **Caps + small-file detector re-measured** for the domain's file sizes (`caps.ts`; network files are 20–100 KB), or
   `view-over-budget` becomes the dominant state.
9. **ONE call-shape constant** for the agent-facing read, built from the descriptor table and pinned to it by a test (text naming a
   service capture does not key on = silent zero captures). *(held-k8s LL-02)*
10. **ONE pin module per file source** owns every control: call-time pin, capture pin, workflow refusal, delivery strip. *(LL-03)* **Normalise inside the ONE check function and forward the object it checked** — an absent `ref` means the repo's DEFAULT branch, so it is checked AS `main` and forwarded/echoed as `ref:'main'`; a normalisation applied after the check, or only to the forwarded copy, forwards an unchecked value. *(Config-sources push 0, LL-CS-02)*
11. **Close EVERY route to the source, not only `services.call`** — enumerate by code search: workflow steps (both callers), named DB
    workflows, REST workflow run, batch; refuse on the RESOLVED name. *(LL-04)*
12. **Strip what the reasoner must never hold at DELIVERY, not only at persist** (a persist-only elision leaves it in-loop), matching the
    credential not its spelling (case, `\u0026`/`&amp;`/`;`/`#`, `%3D`) with a fail-closed residual tripwire. *(LL-05, LL-06)*
13. **Decide directory reads explicitly** — never held, delivered stripped, and the protocol says read each named path once and never list
    to find a file. *(LL-07)*
14. **Shared self-provisioned services: SEQUENCE** (decided 2026-10-19): never two legs on one descriptor at once — same name ⇒ one row,
    the first teardown deletes it under the rest; a per-run name is impossible (name AND endpoint are unique). Reference-counted teardown is
    the build when a program runs parallel legs on one descriptor (register CONCURRENT-SELF-PROVISION). *(LL-13)*
15. **Probe the source's REAL shapes before designing on them** (served URI spelling, status line, not-found text, listing shape) — the
    fixture's byte-proof (G-FIXTURE-ID) covers file, directory and missing cases. *(LL-08, LL-23)*
16. **Measure R10 on the domain's file shapes, including CODE** (Rego/Go/HCL/Makefile assignments, expression right-hand sides); a
    redactor change follows the full discipline (own version, append-only fingerprint rows, exact-output pins both ways, adversarial
    probes, replay + a storage shape count, sec-ops review, series cut). *(LL-09, LL-10, LL-11)*
17. **Check which mechanical checks are domain-scoped vs role-scoped** before assuming coverage (the package form check runs on every
    `config_change_author`, but its correction triggers on some hit kinds only). *(LL-16)*
18. **The ONE reflection pass between corrections** (added by the terraform join, F-T2-1 (b)): a package can carry a form fault on an
    unheld diff AND a refused held edit; the shipped order spent the pass on the form fix and the carrier then forced a package one
    correction from correct. The arbitration (`arbitrateReflectionPass`, `held-edit-step.ts`) gives the pass to the held-edit correction —
    and **every caller of the post-loop sequence must call the SAME helper**: the leg replay lab carried its own copy of the order, so a
    production-only fix never reached the lab (the A-T-MIXED fixture caught it). *(held-terraform step 3)*
19. **Sweep the tests that use the joining domain as "the non-held example"** — the terraform join broke four suites that way (a
    constant list, a title string, a fixture world, a leg literal) and a text-search sweep found only one; run the held suites, then the
    whole battery. Move the example to a domain that stays non-held. *(held-terraform step 3)*
20. **A domain whose OTHER files are diffs** (terraform: unified diffs, new files, labelled complete blocks) must scope those rules to
    files the platform does not hold, in the domain paragraph — "a unified diff of a held file is not an edit" — never by editing the
    shared held text (owner rule at the terraform join). *(held-terraform step 3)*
21. **What must NEVER be held is refused at BOTH gates by ONE predicate** — call gate (before any byte) and capture, by name anywhere in the
    path and by CONTENT (terraform: state/plan/variables/CLI-credentials files and state/plan JSON under any name; name lists are CLOSED, LL-T-05), recorded as its own refusal
    (`state-file` / `tfvars-file` / `credentials-file`), never `source-not-pinned`, so it never trips the G-4 force *(LL-T-03)*.
    **Key the call-gate predicate on the TOOL, not the pin** — inside the pin branch it never runs for an unpinned service, which text naming
    "the service the line names" makes the honest route (`NEVER_READ_PATH`, Config-sources push 0, LL-CS-04).
22. **Platform refusal TEXT is agent input and passes an HTML escape** (BC71, joined text capped at 200): static policy messages carry no
    `& < > " '` (caller values stay escaped); a wording change reaches EVERY caller, external MCP clients included — name it in the series
    cut *(LL-T-06)*.
23. **One code commit for the join**, so the rollback is a single revert; rehearse it on the local DB over every prompt row and the domain's
    template rows, and compare prod's pre-state rows to the rehearsed pre-state before the push *(LL-T-15)*.

### 4. Proof gates (in order)

0. **Net byte-identity replay at EVERY step that touches shared code** (`scripts/replay-nets-byte-identity.sh`, base = the deployed
   commit, `--since` the held era; read-only, $0): every OTHER held domain's facts byte-identical on real stored legs; the joining
   domain's movers named. The golden proves the texts, the replay proves the facts. At the JOIN the joining domain's STORED legs move by
   construction (held capability keys on the protocol name; terraform: 12 of 158 tasks, all terraform); read the diff per task; after a later
   shared-code change the new pass must equal the previous new pass *(LL-T-14)*. *(The k8s join replayed at step 1 only; its step 3 —
   carrier, rollback lanes, grammar, all shared with obs — was first replayed 2026-10-20.)*
1. **Lab** (Protocol 16, pre-registered rule) — edits applied rate, refusals read by hand.
2. **Live window** with the **operator base check** (`scripts/held-base-check.ts`): the held base still equals what is deployed
   (MATCH) and the candidate is applicable with 0 placeholders — before anyone applies it.
3. **Series cut** recorded at the deploy (series-cut ledger, `.claude/knowledge/pipelines/SERIES-CUT-LEDGER.md`), every series keyed STRUCTURALLY (protocol `delta.version`, fact presence),
   never on time.
4. **Controls in BOTH directions of the scope rule**: an out-of-scope package (touches no held file) is NOT forced (C-1); an
   in-scope applied edit releases (C-2); the program path is exercised with an applied edit (C-3 re-run).
5. **Domain-shape controls** the second join added: a ONE-object held file with in-scope drift (a correct package must not read as a
   whole-file write), and a NON-ADMIN launch (the file source refuses; the leg must not be forced).
6. **The G-4 positive, live** (terraform window T-L4): a task naming another ref — whether the harness copies it into the brief and the
   Harvester calls it (terraform: forced `source-not-pinned`, the owner-decided outcome) or declines in prose (k8s B-K6: built without the
   file). Record which; both are safe. **And keep the test design out of agent-read text** — the POV description, titles and stage names are
   read by agents (`pov.details`); a description naming the window's legs reached an Architect's output (step-2 window F-W4).

---

## Anti-patterns (each already paid for)
- **Renaming a parameter so a reader-guard grep stops matching** — a pin that guards who reads a fact (G5 no-gate) fired correctly on a new
  reader; record the reader as a decision with its reason instead *(LL-T-12)*.
- **A scripted doc edit without asserting the line count and the original ending** — one truncated the terraform inventory 224 → 89 lines and
  was committed *(LL-T-37)*.

- **Retyping a file "verbatim"** — the class this pattern exists to remove; a label is not a guarantee.
- **A guard blind to what it guards** — a check that reads the same copy the defect lives in (CHECK-DESIGN-DISCIPLINE §5b).
- **Holding a rendering or state** — the held file must be the file the operator writes; everything else is evidence.
- **Several "in scope" rules** — one predicate (`scope.ts`), six readers; derive, never restate.
- **Selecting the file by position** in a tool result — select by type/field; a re-pin can reorder content.
- **Unscoped series** — a rise across a deploy is a cut, not a trend.
- **A variant protocol** — held is a capability folded into the domain protocol (Phase 10 retired the variant row; a variant
  cannot be released by a program, whose Architect writes only sanctioned tokens).
- **Grading on an unverified premise** — the lab repo was graded "public" for a whole step; it was private. *(LL-01)*
- **Claiming "every form unchanged" without probing** — a redactor narrowing introduced a self-masking leak and lost coverage. *(LL-09)*
- **A domain-only edit inside a cross-domain byte-pinned clause** — put the rule in the domain section the clause refers to. *(LL-14)*
- **Rewording tested bytes to satisfy a scanner** — exempt the domain term with a reason instead (`metadata.uid`). *(LL-15)*
- **Operator notes and bait names inside a file agents quote** — comments are agent input. *(LL-17)*
- **Fixing a recurring refusal one VARIANT at a time** — G1 forgave numbered headings, L-K2 then found `## (a) Held File Edits`; each
  variant cost a paid lab and the correction turn cannot rewrite a heading. When a refusal class recurs with a new variant, restate the
  rule as the PROPERTY (the title identifies the heading; one ≤ 5-char label containing a non-letter is decoration) and prove it against
  every recorded sample before shipping (L-K2: 133 re-applied, 7 movers, all pre-explained). *(LL-29)*

---

## Addendum A — Reference file source: GitHub (live 2026-10-18)

Install and operate it from **`services/github-service/README.md`** (deploy, rollback, upgrade, token rotation) — this addendum
states only the PROPERTIES a GitHub (or any Git) file source must have, so a reviewer can check them. Review:
`cline_docs/reviews/github-service-2026-10-18/SYNTHESIS.md`. Generic Docker shape: gold standard v2 "image-only sidecar".

| # | Property | Why (measured) |
|---|---|---|
| A1 | **Read-only at two independent layers**: server flag (`--read-only --tools get_file_contents`) AND a fine-grained token, `Contents: Read-only`, one repo | writes verified 403 at the token; the server flag alone is one control |
| A2 | **The third-party server holds no token and has no host port**; a proxy injects the token per request | the official server takes the token per request in HTTP mode |
| A3 | **Per-request configuration headers stripped** (`X-MCP-*`, `Mcp-Param-*`); only `/livez`, GET `/healthz`, `/mcp` routed | flags cap the surface today; stripping keeps flags the only configuration a caller reaches |
| A4 | **Health maps to 200/503**, never passes a 4xx through, and the seed sets **`healthCheckPath`** | the Hub reads any status < 500 as healthy and never reads `healthCheck` — a revoked token would read green |
| A5 | **Select the file by `type === 'resource'`** (`resource.text`), never by position; a directory returns a listing, no resource item | probed: `content[1]` today, a status line in `content[0]` |
| A6 | **Pin owner + repo in the DESCRIPTOR and refuse capture on mismatch; record the commit sha** from `repo://…/sha/<commit>/…` | the token reads ANY public repo and the server does NOT enforce an `Mcp-Param-*` pin — otherwise a prompt-injected Harvester makes an attacker's file the held base |
| A7 | **Never read held files through `workflow.execute`** | `validateServiceResponse` runs only there and can alter the text |
| A8 | **`publicAccess` is a decision, not a default** (seeded admin-only) | true admits every account incl. demo users to public GitHub on one shared 5,000/h quota |
| A9 | **Repo is the source of truth; rigs deploy from it**, real credentials stripped before the first commit, gitleaks with named bait as the only expected findings | otherwise the base check reads drift as MISMATCH |
| A10 | **The served URI ECHOES the caller's spelling** (`repo://PaiChart/…` for `owner: PaiChart`), so URI ↔ argument agreement is a CONSISTENCY check, never proof of what GitHub served; owner/repo compared lower-cased, ASCII only | probed 2026-10-18; the independent check is the operator's Git base check (K-8) |
| A11 | **A bare `sha` key is a digest family** (GitHub names blob ids exactly `sha`) — a server upgrade adding one must refuse `raw-digest-present`, never hold silently | found in the 1b build: `digestFamily` matched only `sha<digits>` |
| A12 | **The hub's compliance gate already blocks a literal `../`**; `..%2F` passes it but GitHub reads it literally (not found). The pin refuses `%`, `\`, control/bidi characters and `.`/`..`/empty segments anyway | probed 2026-10-18 |
| A13 | **A directory read holds nothing** (no row, `stats.notAFileRead`); MI-13 🔴 9/10 exempt it by the same rule | its `content[0]` is a JSON listing, no resource item |
| A14 | **Never persist the source's blob ids** (owner G-1 c): the status line beside a file and a directory listing are replaced at persist | a blob id of the RAW bytes beside the R10-redacted text is a dictionary oracle on exactly the files that held a secret |
| A15 | **A base is Git-checkable only when it IS the committed bytes**: `redactedCount = 0` and no canonical fold (no CR, no BOM — the legacy text path refuses both); otherwise the check reads NOT-APPLICABLE, never MISMATCH | `git hash-object` over a redacted or folded text cannot equal the blob |
| A16 | **A private repo's directory listing mints a read credential per entry** (`download_url ?token=`) — stripped at delivery, never followed | L-K1 G-FIXTURE-ID, F2 *(LL-05, LL-07)* |
| A17 | **A non-admin's read is refused** (`publicAccess:false`): `isError` "Access Denied", one `is-error` refusal row, 0 CAPTURE, drift not-performed | shadow window CTRL *(K-10)* |
| A18 | **The Git base check MATCHes when the held blob = the committed bytes** (one blob shared by every leg that read the file at one commit) | shadow window wave 1 |
| A19 | **Concurrent legs share one self-provisioned registration**; the first teardown deletes it | shadow window wave 1 *(LL-13)* |
| A20 | **A Git-sourced desired-state leg performs real drift** on DECLARED fields; a live-object annotation (`last-applied-configuration`) can show the cause | shadow window A-K5 *(LL-12)* |

---

**Join-time learnings (held-k8s step 3, 2026-10-19 — live-proven in the step-4 window; `cline_docs/reviews/held-k8s-2026-10-18/STEP3-BUILD.md`):**
- **Held-capability keys on the protocol NAME, not its version** (`HELD_JOIN_VERSIONS` records the version for MI-13 only) — so the join
  deploy needs NO legs of that domain in flight, and the seed → reseed minute is excluded from every series.
- **A refused file-source read must FORCE, not degrade.** A read off the pin leaves no base, so the package reads `no-base` (out of scope)
  and would silently fall back to retyping. The carrier forces `needs-revision` on a `source-not-pinned` refusal of the leg's
  AUTHORITATIVE Harvester execution, even out of scope (never an older execution's refusal).
- **Template constraints are pinned in BOTH directions** — an owning seed carries the held constraints IFF its protocol is held-capable
  (`test:held-variant-protocol`), so a join cannot forget the seed and a non-held domain cannot acquire them.
- **The operator check reads its coordinates from the held ref** (`held.get` emits `target`/`path` on a Git ref; a typed one must agree),
  never from what the operator types (SF-5).
- **A shared section takes the domain's worked example as a parameter**; domain-only facts (a held file is a repo file, never a live
  object; git revert only for non-held files) go in a domain paragraph beside it, never into the shared text (LL-14).

**Live-window learnings (held-k8s step 4, 2026-10-19; `WINDOW-RUN-SHEET.md` "STEP 4"):**
- **The protocol text is the first defence and can pre-empt the platform backstop.** A read named off-pin was refused BY THE HARVESTER (it
  quoted the default-branch rule) before any call reached the pin, so the G-4 force could not fire live. A backstop that correct agents never
  reach is proven by fixtures; do not spend live legs trying to provoke it.
- **With no base, a good Author does not reconstruct** — it writes a NEW file that patches by reference (a kustomize overlay) and says why
  there is no held section. Read that as correct, not as a gap.
- **A one-object file with in-scope drift was NOT forced** — the "quote drifted fields only" mitigation held (n = 1).
- **The structured contract corrects the leg brief**: a leg harness briefed its Author with the create-a-new-file form; the Author followed
  the contract's "append to this file" and said so. Carry the shape in the contract, not only in prose.
- **`held_blobs` holds one row PER SCOPE** — an operator fetching a blob by sha alone gets the bytes twice and the base check correctly STOPs
  `held-text-integrity`; fetch by the ref's scope.
- **Not held, found on the program leg:** Node C cannot see a leg's teardown (recorded only in the leg harness's own synthesis) — register
  NODE-C-TEARDOWN-UNSEEABLE; do not carry a `lifecycle` line from a spec topology into the contract.

Live-window operations for a join (POV, rig reset, distinct objectives, role flips, teardown): `.claude/knowledge/pipelines/LIVE-WINDOW-CHECKLIST.md` *(LL-30..37)*.

## Addendum B — Network devices (held-network join, steps 0–3, 2026-10-22…27; LIVE since 2026-10-27, 1.25.0)

- **Declare the source per device, never infer it:** `## Device sources` — `git-file` (a Git file is the base), `device-read` (the
  device's running config, read whole once), `command-package` (no held source). A missing declaration stops the leg at the harness.
  In a program, the interface contract carries `deviceSources[...]`; a mismatch with the task body stops the leg.
- **A Git file and a device read are both evidence; the model never compares them** — the platform compares mechanically (step 3,
  parent-context aware). Most customers have only the file.
- **A device whose declared source cannot be read is HELD:** listed first, nothing packaged, leg outcome needs-revision.
- **The harness brief must carry a positive whole-config instruction per device-read device** — a negative rule did not survive the brief.
- **Secrets:** inside any quote a secret is `<value>`; R10 v8 (keyed + echo) is the persisting control; network secret families are R10 v7 (current version `paichart.r10/10`, + login username).
- **Platform guards the join needed:** the register-schema check for descriptors (≤ 500-char tool descriptions), run-scope stamping so an
  agent can only delete its own leg's service (SF-1), R10 echo redaction, and the internal-setup rules (IF-2/IF-3).
- **Step 3 (live 2026-10-27):** the declaration is snapshotted at the leg's first execution (an agent cannot rewrite its own declaration);
  a device's held base is its declared Git file, else its device-read running config (structured getter, `device:<host>` /
  `/running-config`); a device that declares a Git file never holds its device read (evidence only, no handle); the platform forces
  needs-revision on `git-file-not-held` / `device-read-not-held` / `device-sources-*`; an unheld entry the package does not NAME no longer
  sinks the package (F-N2-1, shared applier); the Git-vs-device comparison is a warning fact with `inside-sub-block` for a device's
  sub-block normalisation (shape-only, vendor-neutral).
- **Apply model (MVP, no declaration):** the operator applies the edits to their OWN copy (never the held candidate — it carries
  placeholders), loads it with the device's tooling in a session (whole-config replace), checks the device's own diff equals the package,
  and commits with a revert-unless-confirmed timer. Proven live on the lab switch (J5). Declared apply capability per device = post-MVP
  (register NETWORK-APPLY-MODEL-DECLARED). Vendor-general claim waits on a second platform family (NETWORK-SECOND-VENDOR-RIG).
  Ledger: `cline_docs/reviews/held-network-2026-10-22/LEARNINGS-LEDGER.md` (LL-N-01…44).

## Related Patterns

- `seed-time-artifact-carrier-pattern.md` — delivering VERBATIM text TO an agent (the other half of the verbatim problem).
- `zero-by-construction-check-with-control-pattern.md` — how the MI-13 held lines are built (every 🔴 0 by construction + a ⚪ control).
- `shadow-validation-observation-window.md` — Stage A shadow capture before any agent-visible change.
- `docker-mcp-service-gold-standard-v2.md` — the file-source service shape (image-only sidecar + token-injecting proxy).
- `.claude/knowledge/pipelines/CHECK-DESIGN-DISCIPLINE.md` §5b–5f — guard blindness, triggers, unit scoping.

**Validation source:** `cline_docs/reviews/platform-held-bytes-2026-10-13/` (STAGE-A/B builds, G1–G3 lab results, PHASE10-PLAN,
phase10-panel), the live controls in PHASE10-PLAN §10.10–10.14, the GitHub file-source review + prod probe (2026-10-18), and the held-k8s
steps 1–2 records + learnings ledger (`cline_docs/reviews/held-k8s-2026-10-18/LEARNINGS-LEDGER.md`, LL ids cited above; 2026-10-19),
and the held-k8s step-3 build + L-K2 result + step-4 live window (`STEP3-BUILD.md`, `LAB-RESULT-L-K2.md`, `WINDOW-RUN-SHEET.md`).
