# Terraform / Cloud IaC Provisioning — Pipeline Use-Case Design

> **Status:** Phase 1 (fit-triage) ✅ GO + Phase 2 (decomposition) DONE 2026-06-29. **Next gate: Phase 3
> (required work).** Target buyer: the **governed team / regulated org**. Fit-triage: `../PIPELINE-DOMAIN-FIT-CATALOG.md` §Terraform.
> **Role-reuse headline:** all 4 personas reuse the **already-neutralized shared roles** the k8s work
> created (`infra_state_harvester`, `infra_change_architect`, `config_change_author`, `change_reviewer`) —
> only the templates (names + `metadata.protocol`) and the protocol document are new. No new roles.

## Objective (Phase 1 — the seam)

Terraform change is the **cleanest harness fit of any domain so far**, and the strongest moat.

- **Cognition (→ harness):** read-only harvest of current IaC + **real deployed state** (`terraform plan`
  refresh-only = drift-aware, `terraform show -json` redacted, `state list`, provider `describe`, repo HCL)
  → design the change against an objective (add/right-size a resource, an SG/firewall rule, a tag/policy
  standard, reconcile drift) → author it as **declarative HCL** (module/`.tf` diff, a PR) with **validation
  facts** (`validate`, `tflint`, expected `plan` add/change/destroy, OPA/conftest/Sentinel) and a **rollback**.
  Idempotent.
- **Actuation (→ OUT of loop):** `terraform apply` — the **native convergent executor** (plan→apply, retries,
  reports) with native rollback. Or the team's governed run (**Atlantis / Terraform Cloud-Enterprise /
  Spacelift**).
- **Terminus:** an approved-but-unapplied **PR to the IaC repo** (HCL diff + expected plan + policy facts +
  rollback); the team's apply run converges it. **The harness never runs apply/destroy.** Terraform's own
  plan/apply seam *is* the cognition/actuation seam.
- **The moat:** secret-dense `.tfstate` **never enters an LLM** — the harvest takes metadata/shape, not values.

---

## Design (Phase 2 — decomposition)

### Persona set (mirror the shipped 4-stage shape; ALL roles reused)

| # | Template (persona) | Role/type (REUSED) | Tool surface | Produces | Depends-on |
|---|--------------------|--------------------|--------------|----------|------------|
| 0 | **IaC State Harvester** | ORCHESTRATOR · `infra_state_harvester` | read-only Terraform service ONLY (verb-enum: `plan`/`show`/`stateList`/`validate`) | structured state snapshot for the target scope: resource inventory + **addresses**, **drift** (declared-vs-actual from plan), module/workspace map, the policy/Sentinel/OPA + tag/naming baseline, **sensitive *metadata* (which attrs are sensitive) — NOT values** | — (entry; **conditional** — drops out if the caller supplies current state/plan) |
| 1 | **Infrastructure Architect** | ARCHITECT · `infra_change_architect` | none (pure reasoning over the snapshot) | the desired-state design: which resources change/add, **drift: reconcile or flag** (first-class, not noise), constraints honored (policy, quotas, naming/tag standards), blast radius + a destroy-risk call | Harvester |
| 2 | **HCL & Rollback Author** | DOCUMENTER · `config_change_author` | none (authoring); *optionally* a **local-only** `terraform validate` / `tflint` | **the deliverable** — declarative **HCL/module diff (a PR)** + validation facts (expected `plan` counts, `validate`, `tflint`, OPA/Sentinel) + rollback (revert-HCL+apply / state rollback) + **a restatement of the harvested policy/constraint baseline & the plan bounds** (the k8s NEEDS-REVISION lesson — so the Reviewer can verify fit from the package). `metadata.deliverableSourceTaskId` → `report.md` | Architect |
| 3 | **Plan & Policy Reviewer** | REVIEWER · `change_reviewer` | none | QA verdict: meets objective? policy-compliant? **plan diff-bounded — no surprise destroys/replacements?** rollback sound? drift handled? score vs threshold. `suppressDefaultReportMd` → `result.json` only — the **gate** | Author |

### DAG

`Harvester → Architect → Author → Reviewer` (linear, like network/k8s). The Harvester (Phase 0) is the only **conditional** node.

### Producer / QA-gate split (Editor/Reviewer pattern)

- **Producer** = the Author (stage 2) — `metadata.deliverableSourceTaskId`; its HCL change package becomes `report.md`.
- **Gate** = the Reviewer (stage 3) — `suppressDefaultReportMd`; `result.json` only; gates on the package (returns needs-revision below threshold).
- Keep producer and gate **separate**.

### Tool / credential surface (the Terraform-specific sharp edges — most of the real work)

1. **Only the Harvester reaches the IaC backend. Read-only, structured verb-enum, NOT free-text.** A
   free-text `terraform …` string is bypassable (`;`, newline, `--`, `-chdir`); the service needs its own
   **Zod verb-enum** (`plan`/`show`/`stateList`/`validate` only). `wrapWithSchema` validates the envelope
   only — inner args reach the service unvalidated.
2. **⛔ "Read-only" in Terraform is NOT side-effect-free — the sharpest R1 surface of any domain.**
   `terraform plan` takes a **state lock** + calls provider **refresh/data-source** APIs. The verb-enum MUST
   exclude `apply`/`destroy`/`import`/`state rm`/`state mv`/`taint`/`untaint`/`force-unlock`. Run plan
   `-lock=false` (or against a **state read-replica**) so a harvest can't block a real apply. "Read-only" = *no
   infra writes*, not *no side effects* — document that contract explicitly.
3. **⛔ Don't harvest state SECRET VALUES — this IS the moat, make-or-break.** `.tfstate` embeds secret
   values inline (passwords, keys, certs, connection strings) — the densest secret surface of any domain.
   Harvest via `show -json` **with redaction** + `state list` (addresses) — the resource **shape + addresses +
   drift**, never `sensitive`/`sensitive_attributes` values or raw state. K1 = metadata/shape, not values. Get
   this right → "your state never touches an LLM" is true; get it wrong → the moat collapses.
4. **Confinement caveat (hard-won, playbook Phase 2.4):** tool access is **user-scoped, not template-scoped**;
   an empty `mcpTools` list silently grants all consolidated tools. To truly confine the IaC service to the
   Harvester, every other sibling needs an explicit `mcpTools` omitting it + a CI invariant — OR accept the
   cooperative model (as network/k8s did). Decide in Phase 3.
5. **Deliverable shape: declarative > imperative.** Emit an HCL/module **diff as a PR** for the team's apply
   run — never imperative `terraform apply -target` / CLI mutations. HCL is natively declarative (no
   kubectl-patch-style risk), but the deliverable must be repo-committable, not a command.
6. **Drift is a first-class design INPUT** (unlike network/k8s where current ≈ declared): `plan` surfaces
   declared-vs-actual — the Architect must reconcile or explicitly flag it, and the Reviewer checks it was handled.
7. **R9/R10 inherited** (platform guards, validated): R9 sanitizes harvested output (resource names, tags,
   outputs, module sources are attacker-influenceable); **R10 needs Terraform secret families** — HCL
   `sensitive`, state `sensitive_attributes`, provider creds, `*.tfvars` — a Phase-3 item (only relevant if (3)
   ever permits any value harvest; default-deny keeps the surface near-zero).
8. **Harvest scoping** — a real estate's plan/state ≫ a lab; scope by **workspace/module/resource-address**
   to stay under the 8 KB tool-result cap (chunked, address-scoped reads — sharper here than k8s).
9. **Plan-as-both-fact:** `terraform plan` is uniquely **harvest fact AND validation fact** — the same
   read-only call grounds the design (real diff) and proves the change (what apply will do). Lean on it.

---

## Next: Phase 3 (required work) — NOT yet done

Per the playbook, Phase 3 designs the build: the **security floor** (⛔ trio: R1 verb-enum + the
`-lock=false`/read-replica state contract + K1 state-secret default-deny — these define what "read-only"
*means* for Terraform and gate everything), the inherited-platform confirm/extend (R9/R10 TF families,
`metadata.protocol` injection, the chained-context discipline), the functional/deliverable design (the
`terraform-iac-protocol` document + the 4 templates reusing the roles above), and the build items. Then
Phase 4 (a real-backend validation rig — a throwaway Terraform workspace + a read-only IaC MCP service,
analogous to the cEOS/kind rigs). **Stop here until Phase 3 is prioritized.**
