# Owner answers — log-archive-namespace-read-2026-10-09

Owner: Steve Terry (POV owner). Source generation: task `cmv0g162e000iyxmca3ydv6n2` (run 1, zero-decision).
Each group is recorded as soon as the owner accepts it.

### Group A — what to act on (accepted 2026-10-09)

1. The cluster leg acts on the Kubernetes namespace `trading`.
2. The cloud leg acts on the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`); the restriction is written on the bucket's own policy.
3. The restriction governs the whole bucket.
4. The pods that count are the pods in the declared namespace whose phase is Running at the time of the leg's read; readiness is not a criterion; pods on the host's network are excluded; the leg reports, in its report.md, the literal criterion it applied and the time of the read.
5. The published set is a host list.

### Group B — who approves and when (accepted 2026-10-09)

6. The program plan gate is approved by steve.terry@paichart.com.
7. The cluster (`kubernetes-gitops`) change gate is approved by josh.allen@paichart.com.
8. The cloud (`terraform-iac`) change gate is approved by jacob.wilcox@paichart.com.
9. The cluster gate's position is before-leg: it approves the method (which namespace, which pods count, how the list is derived) before the cluster leg runs.
10. The cloud gate's position is after-producer-before-consumers: it approves the host list produced by the cluster leg, once it exists, before the cloud leg uses it.

### Group C — who is admitted, and what they may do (accepted 2026-10-09)

11. The cloud leg's admitted principal is source-address-range: the pods' addresses, as the host list of item 5; no identity and no network path is admitted.
12. The admitted pods may perform `s3:GetObject` only.
13. The cluster leg is read-and-publish: it reads the pods' addresses and publishes them, and writes nothing to the cluster.
14. Where the cloud leg's own harvest cannot confirm that the bucket sees the pods' addresses on their request path, the cloud leg acts regardless (act-regardless): the policy is written, and the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path, is recorded as UNTESTED in the cloud leg's package.

### Group D — how the change behaves (accepted 2026-10-09)

15. Existing allowances on the bucket's policy are preserve-bounded: every existing statement is preserved unchanged; the bound is an explicit Deny of `s3:GetObject` (and only that action) for any request whose source address is not in the host list of item 5 — the same list the Allow uses. If more than one Terraform resource manages the bucket's policy, the cloud leg reports a gap and does not consolidate them.
16. If no policy governs the bucket, the cloud leg will create one: it creates a policy holding only the Allow and the Deny of item 15.
17. If the declared bucket does not exist, the outcome is gap: the cloud leg reports the gap and creates nothing.
18. If the bucket holds no objects, the cloud leg will act: an empty bucket still gets the restriction, because logs arrive later.
19. If no running pod remains after the exclusions of item 4 (none is found, or every one is excluded), the outcome is gap: the cluster leg publishes a gap report and no host list, and the cloud leg, having no host list, writes no policy.

### Group E — side effects (accepted 2026-10-09)

20. No exception is made for any other reader; the effect is stated, not worked around. The Deny of item 15 stops every other reader of the bucket's objects from using `s3:GetObject` — other roles and users, administrators and the account root, and services that read objects on someone's behalf; it does not affect writes, listing, or changing the policy, so access can always be restored by editing the policy. The cloud leg names this effect in its package and lists the existing statements whose `s3:GetObject` the Deny now overrides. The bucket's existing tags are known drift, triaged by the owner: synthetic test fixtures, out of scope for this change, accepted; neither leg acts on or changes them.

### Group C addendum — request path (accepted 2026-10-10)

21. The pods' requests reach the bucket through a private endpoint of the storage service (private-endpoint): the bucket sees each pod's own address in the attribute that path carries.

## Owner rationale

- **Group A** (Steve, 2026-10-09; arrived as a paste, confirmed by the owner in his own words the same turn): accepted the
  recommendations for receiver (whole bucket) and representation (host list); added "readiness is not a criterion" to
  the population rule; declined the optional terminating-pod exclusion (pods shutting down stay in the population while
  their phase reads Running). The names `trading`, `aws_s3_bucket.app_logs`, `prod`, `acme-app-logs` are the owner's own
  knowledge of the rig, not taken from the run-1 draft or harvest. `kubernetes-gitops.carrier` (Z45) deferred to Group C.
- **Group B** (Steve, 2026-10-09; arrived as a paste, confirmed by the owner in his own words): no shared assignments.
  The produced value is approved by the team that consumes it, not the team that produced it; the actual bucket policy is
  still reviewed by a human at apply, which is out-of-band. Both positions differ from the recommendation (cluster
  after-producer-before-consumers / cloud after-leg-before-completion); owner's call. Stated consequence, accepted by the
  owner: no gate inside the program sees the final bucket-policy package; the only human review of the policy text is at
  apply. Approvers verified on the POV team (Josh Allen, Jacob Wilcox — SALES_ENGINEER; added by the owner) — no
  pov.update needed.
- **Group C** (Steve, 2026-10-09; arrived as a paste, confirmed by the owner): accepted admitted-principal
  (source-address-range, the host list of item 5), granted-action (`s3:GetObject` only) and carrier (read-and-publish;
  answers the Author-invented row Z45). principal-unseen = act-regardless, against the recommendation (gap): the cloud
  leg's Terraform harvest can never see the request path, so "gap" would fire on every run and the program would never
  produce a policy; the premise is made visible instead, at Jacob's gate and at apply.
- **Group D** (Steve, 2026-10-09; arrived as a paste, confirmed by the owner): existing-grant preserve-bounded with every
  existing statement preserved unchanged (recommendation was to remove/narrow other read statements) — consistent with
  "nothing wider" because the explicit Deny overrides any preserved Allow of `s3:GetObject` outside the host list; the
  multi-resource-policy gap rule is the owner's addition. enforcer-absent create (Allow + Deny only); target-absent gap;
  target-empty act, read by the owner as an empty bucket (no objects) — logs arrive later; inputs-empty gap, with the
  cloud leg's consequence stated in the same item.
- **Group E** (Steve, 2026-10-09, in his own words — not a paste): accepted the collateral recommendation as written, and
  added the tags sentence word for word to the same item. Why: without it the cloud leg halts on the planted tags at
  program time (2026-10-07).
- **Group C addendum** (Steve, 2026-10-10; wording proposed by Claude from the Z49 lab, confirmed by the owner — "item 21
  wording is fine"): answers the new registry row `terraform-iac.request-path` (Z49), added after the run-1 answers were
  recorded. The owner's knowledge of the path, not taken from any harvest. Item 14 (act-regardless) still applies: the
  cloud leg's harvest cannot confirm the path, so the premise stays UNTESTED.
- **Zero run 3 rows** (Steve, 2026-10-10, both as recommended): the Author-invented rows of zero run 3 are answered by
  existing items, no new decision — `kubernetes-gitops.host-network-member` by item 4 (host-network pods are excluded;
  register Z51) and `terraform-iac.out-of-policy-grants` by item 20 (in-scope, achieved by item 15's explicit Deny, which
  overrides an Allow from any other policy; register Z52).

## Row → item map

<!-- ROW-ITEM-MAP -->
| row | item |
|---|---|
| `kubernetes-gitops.target` | 1 |
| `terraform-iac.target` | 2 |
| `terraform-iac.receiver` | 3 |
| `kubernetes-gitops.population` | 4 |
| `kubernetes-gitops.representation` | 5 |
| `approver.program-plan` | 6 |
| `approver.kubernetes-gitops-change` | 7 |
| `approver.terraform-iac-change` | 8 |
| `gate.kubernetes-gitops-change.position` | 9 |
| `gate.terraform-iac-change.position` | 10 |
| `terraform-iac.admitted-principal` | 11 |
| `terraform-iac.granted-action` | 12 |
| `kubernetes-gitops.carrier` | 13 |
| `terraform-iac.principal-unseen` | 14 |
| `terraform-iac.existing-grant` | 15 |
| `terraform-iac.enforcer-absent` | 16 |
| `terraform-iac.target-absent` | 17 |
| `terraform-iac.target-empty` | 18 |
| `kubernetes-gitops.inputs-empty` | 19 |
| `terraform-iac.collateral` | 20 |
| `terraform-iac.request-path` (added 2026-10-10: registry row Z49, after run 1) | 21 |
| `kubernetes-gitops.host-network-member` (added 2026-10-10: Author-invented in zero run 3, Z51) | 4 |
| `terraform-iac.out-of-policy-grants` (added 2026-10-10: Author-invented in zero run 3, Z52) | 20 |
