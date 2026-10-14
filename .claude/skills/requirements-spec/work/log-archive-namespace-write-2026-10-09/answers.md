# Owner answers — log-archive-namespace-write (2026-10-09)

Owner of record: Steve Terry. Source generation: task `cmuzydt90000iyxlrje18iy6k` (zero-decision, `draft-zero/report.md`).
Each group is recorded the turn the owner accepts it. Item numbers are what the regenerated spec cites — keep them stable.

## Leg classes (owner, 2026-10-09)
- kubernetes-gitops: a PRODUCER only — derives a value from the namespace's pods for terraform-iac; grants and changes nothing.
- terraform-iac: an authorisation leg; derives no consumed value. The bucket is the only enforcer.
- Neither leg is a routing leg.

### Group A — what to act on (accepted 2026-10-09)

1. The cluster leg grants and removes no access and changes nothing; it only derives, from the namespace's pods, the value the cloud leg consumes. The bucket is the only enforcer.
2. The target namespace is `trading`.
3. The target bucket is the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`); it is the log archive.
4. On the bucket, the authorised resource is its objects, with no key-prefix limit.
5. The derivation's population is every pod in the namespace of item 2 whose phase is Running; readiness is not a criterion; a pod with hostNetwork: true is excluded, because its address is its node's, and the leg lists each excluded pod in its deliverable; the leg reports, in its own published deliverable (report.md), the literal criterion it applied.

### Group B — who approves, and when (accepted 2026-10-09)

6. The program plan gate is approved by steve.terry@paichart.com.
7. The kubernetes-gitops change gate is approved by josh.allen@paichart.com.
8. The terraform-iac change gate is approved by jacob.wilcox@paichart.com.
9. The kubernetes-gitops change gate sits before the cluster leg (before-leg): it approves the method - which namespace, which pods count, how the value is derived - before the cluster leg runs.
10. The terraform-iac change gate sits after the producer and before the consumers (after-producer-before-consumers): it approves the produced value, once it exists, before the bucket leg uses it.

### Group C — who is admitted, what they may do (accepted 2026-10-09)

11. The bucket admits by source address (source-address-range): the admitted principal is the source-address value the cluster leg produces (items 1 and 5); any requester whose request arrives from a listed address is admitted, under any identity or none — this is intended. No VPC endpoint is declared.
12. When the bucket leg's own harvest cannot confirm that the bucket sees the admitted attribute on the pods' path, the leg acts regardless (act-regardless) and records as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path.
13. The admitted pods may perform s3:PutObject only.
14. The derived value is expressed as a host list - each running pod's address exactly.

### Group D — how the change behaves (accepted 2026-10-09)

15. If no running pod remains after the exclusions of item 5 — none is found, or every one is excluded — the cluster leg reports a gap and produces no value (gap).
16. If the namespace of item 2 does not exist, the cluster leg reports a gap (gap); it never creates the namespace.
17. If the bucket of item 3 does not exist, the bucket leg reports a gap (gap); it never creates the bucket.
18. Existing statements on the bucket policy are preserved, bounded (preserve-bounded): the leg changes no existing statement, and the Deny of item 21 bounds them — after the change, s3:PutObject is allowed only from a listed address. If more than one Terraform resource manages the bucket's policy, the bucket leg reports a gap and does not consolidate them.
19. If the bucket has no policy yet, the leg creates one (create) holding only the statements of item 21.
20. If the bucket holds no objects, the bucket leg still authors against the receiver of item 4 (act).

### Group E — side effects (accepted 2026-10-09)

21. The bucket leg adds one Allow statement for s3:PutObject from the listed addresses and one Deny statement for s3:PutObject from any other address; every other writer of the bucket loses write access, and the bucket leg's change package states this and what else, if anything, the change affects. The bucket's existing tags are known drift, triaged by the owner: synthetic test fixtures, out of scope for this change, accepted; neither leg acts on or changes them.

## Row → item map

<!-- ROW-ITEM-MAP -->
| row | item |
|---|---|
| `kubernetes-gitops.receiver` | 1 |
| `kubernetes-gitops.admitted-principal` | 1 |
| `kubernetes-gitops.principal-unseen` | 1 |
| `kubernetes-gitops.granted-action` | 1 |
| `kubernetes-gitops.existing-grant` | 1 |
| `kubernetes-gitops.target-empty` | 1 |
| `kubernetes-gitops.enforcer-absent` | 1 |
| `kubernetes-gitops.collateral` | 1 |
| `kubernetes-gitops.target` | 2 |
| `terraform-iac.target` | 3 |
| `terraform-iac.receiver` | 4 |
| `kubernetes-gitops.population` | 5 |
| `approver.plan` | 6 |
| `approver.kubernetes-gitops-change` | 7 |
| `approver.terraform-iac-change` | 8 |
| `gate.kubernetes-gitops-change.position` (added 2026-10-09: the zero draft mislabelled this registry row not-applicable, defect Z1 - it is asked of every gate except the plan gate) | 9 |
| `gate.terraform-iac-change.position` (added 2026-10-09: the zero draft mislabelled this registry row not-applicable, defect Z1 - it is asked of every gate except the plan gate) | 10 |
| `terraform-iac.admitted-principal` | 11 |
| `terraform-iac.principal-unseen` | 12 |
| `terraform-iac.granted-action` | 13 |
| `kubernetes-gitops.representation` | 14 |
| `kubernetes-gitops.inputs-empty` | 15 |
| `kubernetes-gitops.target-absent` | 16 |
| `terraform-iac.target-absent` | 17 |
| `terraform-iac.existing-grant` | 18 |
| `terraform-iac.enforcer-absent` | 19 |
| `terraform-iac.target-empty` (added 2026-10-09: the zero draft deleted this authorisation-leg row as not-applicable, defect Z3) | 20 |
| `terraform-iac.collateral` | 21 |
| `kubernetes-gitops.population-all-excluded` (added 2026-10-09: an OPEN row generation 8's Author raised for the case item 5's exclusion created - answered by extending item 15) | 15 |

## Owner rationale (not objective text — kept out of the numbered items)
- B4/B5 (Steve, 2026-10-09): the produced value is approved by the team that consumes it, not the team that produced it — a gate the producing team can release itself is not a gate.
- B1–B3: no shared assignments — three different people (all on the POV team, verified 2026-10-09).
- C4: the owner's answer read "host list ... (or your choice)"; recorded as host list — the operator does not take a delegated design decision (SKILL rule 1).
- Owner line on the bucket's tags (Steve, 2026-10-09): placed as an UNNUMBERED line in `objective-base.txt`, outside DESIGN DECISIONS (answers no registry row; the merge refuses unmapped items).
- Items 5 and 21 REWORDED (Steve, 2026-10-09) after answered run 2 (Z15: population narrowed to Running+Ready; Z14: item 21's disclosure twice not reaching the leg). Item 5 = phase Running only, readiness not a criterion; item 21 addressed to the bucket leg's change package. Z16: decide only if it recurs.
- Item 21 EXTENDED (Steve, 2026-10-09, after answered run 3 / Z18): the tags line is folded into item 21 (numbered, so it can be cited); the unnumbered line is removed from objective-base.txt.
- Items 5, 11, 18 EXTENDED (Steve, 2026-10-09, after generation 5): 5 excludes hostNetwork pods and lists them (Open question 2); 11 states open-identity admission from listed addresses is intended (Open question 1); 18 declares the multi-resource policy case → gap, no consolidation (Z23). Z22 waivable; Z24 NOT waivable.
- Generation 7 design change (Steve, 2026-10-09): goal paragraph (objective-base.txt) now restricts writes — "and nothing else may" / "restricts writes to that bucket to that namespace's pods"; item 18 → preserve-bounded (the Deny of item 21 bounds existing statements); item 19 → creates a policy holding the statements of item 21; item 21 → one Allow for s3:PutObject from the listed addresses + one Deny for s3:PutObject from any other address; every other writer loses write access. Owner's stated aim: the generated spec specifies the same program as the reference.
- Item 15 EXTENDED (Steve, 2026-10-09, after generation 8): every-Running-pod-excluded ⇒ gap, not publish-empty (an empty host list would make an Allow admitting nobody and a Deny blocking every writer). Row `kubernetes-gitops.population-all-excluded` mapped to item 15 with the (added …) marker.
