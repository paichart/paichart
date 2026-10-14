# Owner answers — telemetry-collector-namespace-senders-2026-10-11

Owner: Steve Terry. Source generation: zero-decision run `cmv3i0fnt000oyx17rt47bpad` (draft-zero/report.md).
Each group is recorded when the owner accepts it. Item numbers are stable once written.

### Group A — targets, receiver, population, representation (accepted 2026-10-11)

1. The kubernetes-gitops leg acts on the pods of the Kubernetes namespace `trading`. The permitted senders are drawn from that namespace only.
2. The observability-config leg acts on the ingress proxy in front of the telemetry collector's receiver.
3. The receiver authorised on the observability-config target is the collector's OTLP sender endpoints, gRPC and HTTP, exposed through the proxy. Every proxy block that forwards to one of the collector's OTLP receivers is a sender endpoint, whatever its description says, including any block described as outside the sender allowlist; no forwarding path into an OTLP receiver is exempt. Any other path the proxy forwards into the collector, one that does not reach an OTLP receiver, is not a sender endpoint.
4. A member of the sender population is a pod in the declared namespace whose phase is Running, excluding pods on the host's network and pods whose deletion has been requested. The leg reports, in its own published deliverable (report.md), the literal criterion it applied.
5. The sender set is expressed as a host list: one entry per member pod's address, with no covering prefix.
6. The sender set is point-in-time as of the leg's harvest; the deliverable states the harvest time. Nothing maintains the set after the program.

### Group B — approvers and gate positions (accepted 2026-10-11)

7. The program plan gate is approved by jacob.wilcox@paichart.com.
8. The kubernetes-gitops change gate is approved by josh.allen@paichart.com.
9. The observability-config change gate is approved by steve.terry@paichart.com.
10. The kubernetes-gitops change gate approves the sender set produced by the kubernetes-gitops leg, and sits after that leg and before the observability-config leg (after-producer-before-consumers).
11. The observability-config change gate approves the change package produced by the observability-config leg, and sits after that leg and before its completion (after-leg-before-completion).

### Group C — admitted principal, request path, premise, granted action (accepted 2026-10-11)

12. The observability-config leg admits senders by source address: the member pods' addresses, as the host list in item 5.
13. The admitted senders' requests reach the proxy directly, carrying each pod's own address (direct).
14. If the leg's own harvest cannot confirm that the proxy sees the pods' own addresses, the leg acts anyway (act-regardless). It relies on the owner-declared path in item 13 and states that premise in its deliverable as owner-declared, not observed.
15. Admitted senders may submit telemetry on the collector's OTLP sender endpoints, gRPC and HTTP (item 3), and nothing else on those endpoints.

### Group D — existing allowances, empty and absent cases (accepted 2026-10-11)

16. On every proxy block that forwards to one of the collector's OTLP receivers (item 3), the allowances are replaced by exactly the sender set, followed by a deny for everything else (replace). Blocks that forward other paths into the collector, ones that do not reach an OTLP receiver, are not sender endpoints (item 3); the leg leaves them unchanged and lists each one in its deliverable as unchanged by owner decision (item 3).
17. If no proxy block forwards to the OTLP sender endpoints, the observability-config leg reports a gap and authors nothing (gap).
18. If a block forwarding to the sender endpoints carries no access directives, the observability-config leg adds them to that block (create).
19. If the proxy does not exist, the observability-config leg reports a gap and creates nothing (gap).
20. If no pod in the declared namespace meets item 4, the kubernetes-gitops leg publishes no sender set and reports a gap naming what was absent (gap). If no sender set is published, the observability-config leg makes no change to the proxy and reports the upstream gap; it never writes a deny-everything rule from an empty set.

### Group E — collateral (accepted 2026-10-11)

21. The observability-config change is confined to the forwarding blocks in item 16: senders outside the set are refused there, and no other server block, location, port or forwarded path on the proxy changes. If the leg finds that a sender endpoint shares an access setting with a non-sender path, so the restriction cannot be confined to the sender endpoints, it reports a gap instead of widening the change.

### Group G — sender-endpoint blocks (accepted 2026-10-11, after answered generation 1)

22. A proxy block is a sender endpoint if it forwards to one of the collector's OTLP receivers, whatever its own description says (every-block-forwarding-to-an-OTLP-receiver). A block whose description places it outside the sender allowlist is restricted like every other sender endpoint, and senders that reach the collector through it today and are not members of the sender set are refused there (item 21).

### Group H — enforcer scope (accepted 2026-10-12, attempt 2; group 4 registry row)

23. The observability-config restriction covers every part of the proxy that reaches the collector's OTLP receivers (all-reaching-the-protected-thing).

## Owner rationale

Not part of the objective: the merge stops each group at this heading.

### Owner rationale — Group A
- Item 3: other paths the proxy forwards into the collector are handled under the existing-grant question (Group D), not as sender endpoints.
- Item 4: the shutting-down exclusion was confirmed visible to the cluster's read-only service before acceptance (its per-pod read returns the full pod object, including the deletion marker); the pod list read returns names and labels only, so the leg reads each pod.
- Item 6 answers the Author-invented row `kubernetes-gitops.currency` (register Z56) as a new item.

### Owner rationale — Group B
- All three approvers were already on the POV team (added by the owner in the GUI; confirmed by `pov.details` 2026-10-11), so no `pov.update` was shown or needed.
- The owner releases every gate himself, on the approvers' behalf; each release is recorded as "released by Steve for <name>". Noted: in practice one person then releases all three gates, so the distinct-owner check on the two change gates rests on the declared names, not on who releases them (kept as declared, per the Approvals rule).

### Owner rationale — Group C
- Item 13 was answered by the owner from the registry options alone, with no recommendation (run condition Z55).
- Item 14: the owner verified on 2026-10-11 that a pod's request reaches the proxy under the pod's own address. The leg cannot observe the arrival address from configuration, so it relies on the owner-declared path and states the premise as owner-declared, not observed.
- Pre-launch check carried to the program step: the cluster→collector path on this rig is non-persistent (fit-check caveat), so re-confirm it exists and carries the pods' own addresses before any program run.

### Owner rationale — Group D
- Item 16 carries out the Group A rule on non-sender paths (item 3) and adds that each unchanged block is listed in the deliverable.
- Item 20's second sentence is the owner's addition: an empty set run through item 16 would otherwise lock every sender out.

### Owner rationale — Group E
- The registry's `collateral` options cover Kubernetes only; the enforcer here is a proxy, so the item is free-form (register Z57). Senders admitted today but outside the set being refused is the intended effect, stated so the package names it.

### Owner rationale — Group G and amendments (2026-10-11)
- Item 22 answers `observability-config.sender-blocks`, a question answered generation 1's wider harvest surfaced (register Z60); the zero-decision run could not ask it.
- Items 3 and 16 amended on 2026-10-11 to match item 22: no forwarding path into an OTLP receiver is exempt; item 16's "left unchanged" covers only blocks that do not reach an OTLP receiver.
- Answered generation 1 re-asked four answered decisions under new keys (register Z59); the owner points each at its existing item, no new item: `kubernetes-gitops.maintenance` → item 6 (the Z56 `currency` row, renamed), `observability-config.non-sender-paths` → item 16, `observability-config.shared-access` → item 21, `observability-config.upstream-empty` → item 20. Mapped as pointers in the row → item map.

### Owner rationale — Group H (2026-10-12)

- Asked by group 4's `<token>.enforcer-scope` row, which did not exist when attempt 1 was answered. Same substance as item 22 (every block forwarding to an OTLP receiver is a sender endpoint); stated under the row's own option so the row is declared on the first generation. The kubernetes-gitops leg grants no access, so its enforcer-scope row is not applicable.

## Row → item map

<!-- ROW-ITEM-MAP -->
| row | item |
|---|---|
| `kubernetes-gitops.target` | 1 |
| `observability-config.target` | 2 |
| `observability-config.receiver` | 3 |
| `kubernetes-gitops.population` | 4 |
| `kubernetes-gitops.representation` | 5 |
| `kubernetes-gitops.currency` | 6 |
| `approver.program-plan` | 7 |
| `approver.kubernetes-gitops-change` | 8 |
| `approver.observability-config-change` | 9 |
| `gate.kubernetes-gitops-change.position` | 10 |
| `gate.observability-config-change.position` | 11 |
| `observability-config.admitted-principal` | 12 |
| `observability-config.request-path` | 13 |
| `observability-config.principal-unseen` | 14 |
| `observability-config.granted-action` | 15 |
| `observability-config.existing-grant` | 16 |
| `observability-config.target-empty` | 17 |
| `observability-config.enforcer-absent` | 18 |
| `observability-config.target-absent` | 19 |
| `kubernetes-gitops.inputs-empty` | 20 |
| `observability-config.collateral` | 21 |
| `observability-config.sender-blocks` (added 2026-10-11: surfaced by answered generation 1's harvest, Z60) | 22 |
| `kubernetes-gitops.maintenance` (added 2026-10-11: answered generation 1 renamed `currency`, Z59 — pointer) | 6 |
| `observability-config.non-sender-paths` (added 2026-10-11: restated by answered generation 1, Z59 — pointer) | 16 |
| `observability-config.shared-access` (added 2026-10-11: restated by answered generation 1, Z59 — pointer) | 21 |
| `observability-config.upstream-empty` (added 2026-10-11: restated by answered generation 1, Z59 — pointer) | 20 |
| `observability-config.enforcer-scope` (added 2026-10-12: group 4 registry row) | 23 |
