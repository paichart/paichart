## Owner waiver

- **Approver of record:** Steve Terry (steve.terry@paichart.com), POV owner — 2026-10-09
- **Source:** generation 9, task `cmv07axmf00ygyxlr4q0rgizv` (requirements-authoring), Reviewer **APPROVED 94**;
  Author served by `claude-opus-5-5` (execution `modelUsed`).
- **Scope:** the coverage-check ERRORS (1–4) and two write-up items from the human read (5–6), and nothing else. Citation gate: 23/23 verbatim, premise branch present —
  nothing waived there. The draft carries no "NOT RELEASED" banner (approved run).

Each waived finding changes nothing the program is told:

1. **Z17 × 8 — "missing auth row" on `kubernetes-gitops`** (receiver, admitted-principal, principal-unseen, granted-action,
   existing-grant, target-empty, enforcer-absent, collateral). The leg carries `kubernetes-gitops.target-absent` (owner item 16),
   which the registry places only in the authorisation class, so the coverage script infers that class. Item 1 declares the leg
   grants and removes no access; the document lists all eight rows as not-applicable with that reason. Checker/registry gap,
   recurs while item 16 exists.
2. **Author-added row `terraform-iac.policy-managers-multiple`** — "unknown key for a known token". Answers owner item 18
   (several policy-managing resources ⇒ gap, no consolidation), cited verbatim. No registry key exists for it.
3. **Author-added row `terraform-iac.deny-others`** — same. Answers owner item 21 (one Deny for `s3:PutObject` from any other
   address), cited verbatim.
4. **Author-added row `terraform-iac.tag-drift`** — same. Answers owner item 21 (neither leg acts on or changes the tags),
   cited verbatim.
5. **GS-T1 — template Author instruction left in the sequencing section** (report.md lines 100–103: "State *why* the value is
   not knowable up front. The strongest form is an objective test — …"). Author-addressed guidance, not a requirement; the
   section's own answer follows it. Changes nothing a leg is told. Skeleton recurrence — Author retrospective, class E (Z41).
6. **Z38 — owner block written without `- ` bullets.** Every line in it is `not-applicable` (no OPEN, derived or forced row),
   so nothing is asked of anyone; the only effect is that the coverage script reads the block as empty.

Recorded in `.claude/skills/requirements-spec/work/REGISTER.md` (Z17, Z37, Z38, Z41) and the run's `notes.md`.
