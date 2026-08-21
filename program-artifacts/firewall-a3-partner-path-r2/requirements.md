# Program Requirements
- POV: Autonomous Delivery Use Cases
- Phase: Firewall Rules Change
- Iteration: FW-A3.2 (three-domain path, **SEQUENCED**, transitive chaining) · 2026-08-21

> **Revision FW-A3.2 (2026-08-21)** — corrections after Round A3.1, which the leg reviewer correctly
> blocked (NEEDS-REVISION): the ACL had no interface binding because the round's topology mapped the
> untrust zone onto a port that did not exist. The lab now exposes bindable policy ports with
> role-bearing descriptions (topology.json `policyInterfaces`); every hop's rule MUST be bound to its
> named interface, and an unbindable rule is grounds to block, exactly as A3.1's reviewer did. A3.1
> also showed the edge package omitted its `## Derived Values` block, leaving the pool verified by
> prose recomputation only — the block is part of the deliverable contract; omitting it is a defect.

---

## Writing rules — read before authoring, they are the expensive part

These govern how you write **every other section**. All were earned by a failed or false-passing run.

1. ⚠️ **"Deterministic validation" means a reviewer can run it and compare, without judgement.**
   Every validation step is an **exact command** plus its **exact expected output** — the literal text
   or count you expect back. Prose like *"verify the ACL is applied"* or *"check the policy is
   correct"* is a **REJECTABLE defect**, not a validation step: two reviewers could disagree on
   whether it passed. *Earned: Run 13's network leg was blocked for exactly this.*

2. ⚠️ **Ship every artefact your validation cites.** If a step invokes a policy/rule file (OPA,
   Conftest, tflint config, a test fixture), the change package must include that file's **complete,
   runnable contents**. Citing a check you did not ship is unrunnable, so it is not validation.
   *Earned: Run 10 was blocked for naming OPA/Conftest checks without shipping the rule files.*

3. 🔴 **State what must be TRUE. Do NOT name the measure that reports it.** Where a requirement can be
   written as a **property**, write the property — not the stamp shape, not the reason code, not the
   violation class. Every agent reads this file, so a machine pass-condition written here becomes **a
   target an agent can aim at instead of the requirement**. Let the platform own the string.
   *Earned: Run 15 — a leg met a published pass condition weaker than the requirement beside it, and
   shipped a defect.*

4. ⚠️ **Expected values stated in this document are reference data, NEVER evidence.** A tier must
   retrieve the **actual** value and construct its own finding. *Earned: Run 15 — Node C asserted a
   field's expected value, quoting the requirements, for a field absent from the artifact entirely.*

5. **Write properties, not hardcoded values**, wherever the environment can be rebuilt. The lab's
   allocation scatter re-randomizes on every rebuild; a magic expected string makes the round fail
   for the wrong reason.

---

## Program scope

- **3** delivery domains, executed **IN SEQUENCE** along the traffic path
  `partner-internet → ceos1 (edge) → dmz-sg (cloud) → ceos2 (core) → internal-app`:
  1. **Network provisioning — EDGE** (UPSTREAM) on `ceos1`, described in `topology.json`: the
     partner-facing permit rule + the source-NAT pool selection.
  2. **Cloud IaC (Terraform) — DMZ** (MIDSTREAM) on the `dmz-sg` security group: ingress restricted
     to the post-NAT pool.
  3. **Network provisioning — CORE** (DOWNSTREAM) on `ceos2`: the dmz→inside rule matching the
     post-NAT pool.
- The existing eBGP fabric between ceos1 and ceos2 (the 10.0.12.0/30 link, ASNs 65001/65002) is
  explicitly **out of scope** — no routing changes, no renumbering.
- Applying any change to any device or cloud resource is **out of scope** — this program produces
  approved change packages only.

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — applied explicitly:

> Is every value the downstream domains need **knowable before the upstream domain runs**?
> **No.** The dmz and core hops must match the traffic's **post-NAT source** — the NAT pool the edge
> design selects. That pool is chosen from addresses **free in the fabric's 10.99.0.0/24 allocation
> pool at design time**, and the existing allocations are scattered, asymmetric across the two
> switches, and **re-randomized on every lab rebuild** — so the pool cannot be pinned in a static
> artifact or agreed in a contract, and the Program Architect (which reads only `topology.json` +
> this file, with **no live state access**) structurally cannot know it. It is an **output** of the
> edge design.

Consequence: the three pipelines are DAG-sequenced (edge → dmz → core), and each downstream leg
consumes the upstream leg's actual deliverable. If someone guessed the pool up front, the guessed
addresses would collide with live allocations on some rebuilds and the downstream rules would match
traffic that never exists — the exact silent-hole class this program exists to prevent.

**Design order is edge-first. Apply order is the REVERSE (core → dmz → edge)**: the innermost hop
must be provisioned before the outer hop opens, so partner traffic is never admitted toward a hop
that cannot yet police it. The program deliverable must state both orders explicitly and distinguish
them — conflating design order with apply order is a known error class for sequenced security paths.

## Approvals — one gate per domain, plus the program plan gate

Team provisioned for this POV:
- Network security lead is Steve Terry steveterry66@gmail.com
- Cloud platform lead is Steve Terry steveterry66@gmail.com
- Core network lead is Steve Terry steveterry66@gmail.com

- The **edge (ceos1) change** requires its own approval before that pipeline may run.
- The **dmz (Terraform) change** requires its own approval before that pipeline may run.
- The **core (ceos2) change** requires its own approval before that pipeline may run.
- Sequenced: each downstream pipeline waits on **BOTH** its own gate **AND** the upstream pipeline
  (the DAG edge). The dmz leg waits on the edge pipeline; the core leg waits on the dmz pipeline.

## Pipeline 1 objective — Network provisioning, EDGE (ceos1) (UPSTREAM)

- Harvest ceos1 AND ceos2 **read-only** (both — pool freedom is fabric-wide). Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
- Author the edge policy change package for ceos1:
  - bind the partner ingress rule to the PARTNER-UPLINK interface named in topology.json `policyInterfaces` (Ethernet3, untrust zone);
  - an ingress rule permitting **exactly** tcp/443 from the partner CIDR `203.0.113.0/24` (the
    pre-NAT source — the edge is the ONLY hop that may match it) to the internal app `10.20.0.10/32`;
  - a source-NAT translating the partner CIDR to the **selected pool** (tag `PARTNER-SNAT-2026`);
  - an explicit default deny with deny-logging;
  - rule tag `PARTNER-HTTPS-2026`.
- **The derivation**: select a free, aligned **/31 or /30** from the 10.99.0.0/24 pool as the NAT
  pool, colliding with **no existing allocation on either switch** (interface addresses and BGP
  network statements both reveal allocations — harvest both).
- **The deliverable MUST publish, explicitly and prominently**: the selected NAT pool and the
  reasoning for the choice (which candidates were considered, why this one). This is the input BOTH
  downstream legs depend on.

### ⚠️ This leg DERIVES a value the downstream legs consume — every line below is an incident

- **Show the computation** in the deliverable: the inputs (the harvested allocation set), the
  selection, and the result's coverage.
- **Minimality, or the equivalent tightest-correct property.** A pool larger than the requirement
  needs is a **REJECTABLE defect even when it violates nothing else**, because it authorizes
  addresses no translated flow will ever use. *Earned: Run 15 shipped a `/30` where `/31` was
  minimal — mechanically clean, and a REJECT.*
- **Re-selection FIRST, escalation LAST.** If a candidate block collides, that rules out *that
  candidate* — not the whole pool. Select another and recompute. Escalate only after establishing
  that no valid block exists **anywhere in the pool**, naming which candidates you tested.
  *"Impossible" concluded from a handful of candidates is a **defect, not an escalation**.*
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
- ⚠️ **Verify by arithmetic, never by eyeballing.** CIDR trap: a `/31` covers an **aligned** pair
  only — `.1/.2` are adjacent but straddle a boundary; their minimal cover is a `/30` that swallows
  neighbours. Alignment: a /31 starts on an even fourth octet; a /30 on a multiple of 4.
  *Earned: Runs 5 and 6 lost on this directly; Run 12 compounded it.*
- **Verify member-by-member** before publishing: every address the pool authorizes is genuinely
  free on BOTH switches, and nothing allocated falls inside it.
- 🔴 **The machine check is a FLOOR, not the bar.** A clean mechanical result is **not** evidence the
  derivation is correct. **Satisfy the requirements; do not target the checker.**

## Pipeline 2 objective — Terraform IaC, DMZ security group (MIDSTREAM)

- Harvest the Terraform estate **read-only**. Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- Author the `aws_security_group.dmz_app` change package:
  - ingress permitting **exactly** tcp/443 from the **post-NAT pool** — consumed **as chained** from
    the edge leg's deliverable. This leg does **not** re-derive the pool and is forbidden from
    recomputing it. Containment for the pool is discharged **upstream** and re-verified at the
    program tier.
  - egress permitting exactly tcp/443 to `10.20.0.10/32`;
  - **no** `0.0.0.0/0` in any direction, and **no rule matching the partner CIDR `203.0.113.0/24`** —
    that is the pre-NAT source, which does not exist at this hop; a rule matching it would be a
    wrong-stage match that never fires on real traffic.
- Deliverable: HCL diff + plan evidence + rollback, and it MUST re-publish the consumed pool
  prominently (it is the value the core leg consumes transitively).

## Pipeline 3 objective — Network provisioning, CORE (ceos2) (DOWNSTREAM)

- Harvest ceos2 **read-only** (same descriptor as Pipeline 1).
- Author the core policy change package for ceos2:
  - bind the rule to the DMZ-SEGMENT interface named in topology.json `policyInterfaces` (Ethernet2, dmz zone);
  - a dmz→inside rule permitting **exactly** tcp/443 from the **post-NAT pool** (consumed **as
    chained** via the dmz leg — same non-recomputation rule as Pipeline 2) to `10.20.0.10/32`;
  - explicit default deny with deny-logging; rule tag `PARTNER-HTTPS-2026`;
  - **no rule matching the partner CIDR** (wrong-stage match, as above).

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before any leg runs):
- flow intent: src `203.0.113.0/24` at ingress only, dst `10.20.0.10/32`, tcp/443, permit
- default action: deny, with deny-logging, at every hop
- naming: rule tag `PARTNER-HTTPS-2026`, NAT pool tag `PARTNER-SNAT-2026`
- zone map: untrust=partner side, dmz=middle segment, inside=internal-app side
- apply order (human, out-of-band): core → dmz → edge — the reverse of design order

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- the **NAT pool** — produced by the edge leg, chained into the dmz leg's §6, then via the dmz
  leg's deliverable into the core leg's §6, each settled before the consumer starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing
  rules* #1 and #2) and a rollback plan restoring the pre-change policy exactly.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the pool each consuming leg applied exactly equals what the edge leg produced — the chained
   value, not a guess, not a recomputation;
2. every address the pool authorizes is inside the fabric allocation pool and collides with no
   harvested allocation on either switch;
2b. the tightest-correct property of the pool — recompute it; do not take the stated size on trust;
3. no hop widens the flow: no `0.0.0.0/0`, no port beyond 443, no destination beyond the app /32,
   and no return-path hole beyond established/related;
4. **chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
   `notChained []` — i.e. each downstream leg received its upstream leg's **real** deliverable, not
   a fallback and not nothing;
5. **no wrong-stage match**: the pre-NAT partner CIDR `203.0.113.0/24` appears in the edge leg's
   ingress rule and **nowhere else** in any hop's match criteria;
6. the program deliverable states BOTH orders — design order (edge → dmz → core) and apply order
   (core → dmz → edge) — and distinguishes them.

- 🔴 ⚠️ **THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE.** They are referenced by
  number from elsewhere; renumbering, merging, or substituting one **silently deletes it**. If a new
  requirement needs a number, it **APPENDS** (7, 8, …). *Earned: Run 15 — a new clause was
  renumbered into slot 2b, deleting the minimality check; a non-minimal result shipped.*
- These checks are **properties, not hardcoded values** — they stay valid when the lab is rebuilt.

### Consuming-leg attribution — the dmz and core legs legitimately cannot self-check

The dmz and core legs consume a pool they cannot verify against their own harvested state (the
Terraform estate and ceos2 alone cannot see fabric-wide freedom). Their SATISFIED condition is a
property: (1) the edge leg's derivation was machine-checked with no defect, (2) the program-tier
checks above pass on the chained value, and (3) chaining coverage confirms the real deliverable was
received. A consuming leg in this state is a legitimate state to land in — never a bar it failed.

### Validation-round scope note (honesty)

This round validates the PROGRAM machinery on live rigs — transitive inter-pipeline chaining,
settledness, gate composition, and the seam checks above. The cEOS lab's dataplane NAT behaviour is
NOT a claim of this round; the change packages are approved-but-unapplied, and any optional apply is
a separate human decision.
