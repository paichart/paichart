# Inside a Multi-Domain Program — DAGs, Review Tiers, and Scale

**Audience**: Architects, platform and network engineers, and technical evaluators who want to see *how the machine is wired* — not "can an AI write a config," but how a multi-domain change is decomposed, reviewed, gated, and how far the shape scales. This one names the internals.
**What this is**: a walk through the architecture of a pAIchart **program** — a pipeline-of-pipelines — using a real network→cloud change as the running example. It answers three questions in order: how is the work *shaped*, how is it *checked*, and how far does it *scale*.
**Companions**: this is the *how it's built* study. Its two siblings are *[A Coordinated Infrastructure Change, Checked by Machine](coordinated-infra-change.md)* (*can you trust it* — the checks and honest failures) and *[You Approve; You Don't Author](you-approve-you-dont-author.md)* (*what it buys you* — the role shift). Read either of those first if you want the customer-facing framing; this one goes under the hood.
**Reading time**: ~15 minutes. **Self-contained** — the concepts it needs are introduced here.

---

## What this chapter teaches

An AI that writes one config is a demo. An AI you'd let near a change that spans two vendors and two teams is an *architecture* — because the hard part isn't generating the text, it's **decomposing the work so each piece is bounded, checking each piece with something that isn't the model, and composing the pieces without letting an error slip through the seams.**

This chapter takes the real network→cloud change from the companion studies and shows its skeleton:

1. **The DAG** — how the program models the dependency between the legs, and why that shape (not a script) is what makes it safe to run.
2. **The node triad** — the three kinds of reviewer (Architect, per-leg reviewer, integration reviewer), and specifically what the *integration* reviewer catches that no single leg can see.
3. **The three tiers of checking** — deterministic code, independent reviewers, and a release gate — layered so a lower tier can't be overruled by a higher one, and so "couldn't verify" fails closed.
4. **Scale** — how far the shape goes (100 devices, 1000 devices), where the walls are, and what's proven versus reasoned.

The transferable idea: **correctness at scale comes from the *harness*, not the model.** The model is one component inside a structure designed to bound it, check it, and refuse when it can't be sure.

---

## The engine, in one paragraph

pAIchart's delivery engine turns an objective into an **approved change package your team applies** — candidate config, the exact commands that prove it worked, and a rollback — and **never applies it itself**; applying stays a separate, human-gated, idempotent step. A **pipeline** handles one domain as a short chain of specialist agents: *harvest* live state (read-only), *design* the change, *author* the package, *review* it. A **program** is a pipeline whose steps are themselves pipelines — the structure that coordinates a change crossing domains (here: network devices and cloud infrastructure). It is deliberately *not* a closed-loop controller; it produces a reviewed change and hands it to a person. Everything below is the anatomy of one such program.

---

## Beat 1 — The DAG: the shape of the work

A program's legs are wired as a **DAG — a Directed Acyclic Graph.** The name is the whole idea:

- **Graph** — nodes (the legs) with connections between them.
- **Directed** — each connection has a direction: "A must finish before B starts."
- **Acyclic** — no cycles; you can never follow the arrows and loop back to where you began.

The network→cloud change is the minimal DAG — a single edge:

```
[network leg]  ──▶  [cloud leg]
 harvest → design →      reads the derived range,
 author → review         authorises exactly it
```

**Why the direction matters.** The cloud leg needs a value — the exact address range the exporters will use — that *does not exist* until the network leg has run and picked free addresses from the live switches. You cannot fold "the exporter range" into an up-front agreement, because it isn't a constant; it's an *output*. The directed edge is what forces network-first, then cloud, feeding the real derived value across. This is the difference between a **sequenced** program (a dependency edge forces an order) and a **parallel** one (legs with no edge between them run concurrently).

**Why acyclic matters.** Because there are no cycles, the engine can always compute a valid run order and know the program terminates. A cycle — network waits on cloud while cloud waits on network — has no legal starting point; it's a deadlock by construction. DAGs are exactly the class of dependency graphs guaranteed to have a runnable order.

The general shape is richer than a line — it can fan out and rejoin, as long as arrows never loop:

```
        ┌──▶ [firewall leg] ──┐
[network leg]                 ├──▶ [integration review]
        └──▶ [cloud leg] ─────┘
```

Here network must finish first; firewall and cloud have no edge between them, so they run **in parallel**; the integration step waits for both. Still directed, still acyclic. The engine reads the graph to decide what runs when, what runs concurrently, and what must wait — the DAG *is* the coordination, not a hand-written sequence a human has to keep correct.

**The two coordination mechanisms**, precisely:
- **The interface contract** (declarative) — a binding set of shared values every leg must honour: naming, the flow, agreed ranges. Knowable up front.
- **The DAG edge** (runtime) — carries a value one leg *creates* forward to the leg that consumes it. Not knowable up front; that's exactly when you need a sequenced edge instead of a shared constant.

---

## Beat 2 — The node triad: who reviews what

Every program the engine builds has three kinds of node. Two plan-and-review roles bracket the legs, and the third is the one that earns the program its trust.

| Node | Role | What it checks |
|---|---|---|
| **Node A** | **Program Architect** | Designs the program up front — produces the **DAG** and the **interface contract** every leg must honour. |
| **Node B** | **Per-leg reviewer** (one per leg) | Reviews *its own leg's* package against *its own* slice of the contract. "Did I, the network leg, honour the contract I was handed?" — a **per-pipeline** conformance check. |
| **Node C** | **Program integration reviewer** | Runs once, at the end, and reviews **all the legs together against the one shared contract** — the cross-leg checks no single leg's reviewer can see. |

### Why Node C exists

Each leg's own reviewer (Node B) is structurally blind to the *other* legs. The cloud leg's reviewer can confirm "my bucket policy is well-formed and matches the contract I was given" — but it cannot confirm "the range I authorised is the one the network leg actually derived," because it never saw the network leg's output. That **cross-leg conformance** is precisely, and only, Node C's job.

In the network→cloud program, Node C is the node that verifies things like:

- **No drift between the legs** — the cloud leg authorised *exactly* the address range the network leg produced, not a plausible-looking but different one.
- **No cross-pipeline collisions across the composed set** — overlapping IPs, VLANs, or ASNs that only appear when you look at *all* the legs at once. A per-leg reviewer, seeing one leg, can't see a collision that exists *between* two of them.

Node C does this by running the domain's **own validators over the *composed* set** — whole-topology [Batfish](https://batfish.org) rather than one switch's config; `terraform validate`/`plan` and OPA over the whole config set; `kubeconform` over all manifests. Crucially, **it consumes those validators as tools — it does not reimplement them.** The design rule is explicit: *consume the leg; do not build a cross-domain validator.* That's what lets the checking scale (more on that in Beat 4) and keeps the engine out of the business of writing its own network-analysis engine.

### The subtlety that matters

Node C's verdict is **one input to the release decision, not the whole decision.** A program is releasable only if **every leg passed AND Node C approved AND the mechanical checks passed AND coverage is complete** — a deterministic AND. So Node C can correctly say "the legs are mutually consistent" (approved) while the *program* still comes back needs-revision because a leg itself escalated. Both are right; they answer different questions. Node C judges *cross-leg fit*; the gate ANDs that together with each leg's own health. Node C is a necessary conjunct, never a sufficient one.

---

## Beat 3 — The three tiers of checking

Here's the part that separates this from "the AI said it's fine." The checks that gate a release aren't one pass by one reviewer. They run in **three separate tiers, and a lower tier cannot be talked out of its answer by a higher one.**

### Tier 1 — the mechanical net (deterministic code, no model)

Some correctness is pure arithmetic, and arithmetic belongs in code, not in a reviewer's confidence. The **derivation-containment net** is plain deterministic code that checks a derived value (say, a covering CIDR) doesn't swallow any harvested allocation beyond its declared members. It computes two violation kinds:

- **`member-not-covered`** — a value the design *claims* is inside the derived range actually falls outside it (too narrow).
- **`covered-not-member`** — an *already-allocated* address gets swept inside the range that shouldn't be (too wide).

That's the subnet-math catch from the trust study, generalised to set-membership in any domain (addresses, quotas, namespaces, ARNs). It runs at **each leg's synthesize step**, reading the harvest child's own evidence block and the author child's derived-values block directly — never the package's restated copy, which is the surface where a fabricated "verified" entry could hide.

Three properties define this tier, and all three are deliberate:
1. **It reports; it does not block by itself.** Any miss or parse failure records a `checked:false` fact with a *reason* — it never throws, so it can never roll back a leg's committed result. The blocking decision lives in the gate (Tier 3), which reads the fact.
2. **It's deterministic** — same evidence in, same fact out. That's the precondition for the gate being able to trust it.
3. **It's evidence-anchored** — bound to the harvest's own block, so a downstream reviewer or author cannot launder a wrong number past it by restating.

The mechanical net also carries the other machine facts the gate consumes: **coverage** (`chainCapablePredecessors`, `degradedPredecessors`, `notChained` — did every leg's *real* deliverable reach the consumer, or did a fallback summary sneak through?), **contract presence** (`INTERFACE_CONTRACT_MISSING` — a leg can't even begin without its binding contract), and **protocol completeness** (a run that skipped a required step is surfaced, not trusted).

### Tier 2 — the independent reviewers (the node triad)

This is Node B and Node C from Beat 2: an LLM reviewer per leg (against its own contract) and the integration reviewer across all legs (against the shared contract, running the composed-set validators). This tier does the judgement a mechanical check can't — reading a change package as a whole, assessing blast radius, checking a rollback is sound, recomputing derivations against the carried evidence rather than trusting the package's prose.

### Tier 3 — the release gate (deterministic AND, no confidence)

The gate — `programReleasable` — is a deterministic AND over the facts the first two tiers produced:

> every leg approved **AND** no derivation-containment violation **AND** any `checked:false` carries a benign reason **AND** the integration reviewer (Node C) approved **AND** cross-pipeline coverage complete.

There is **no confidence number anywhere in it.** That's not an omission — it's a finding. A controlled calibration study (two byte-identical review runs that scored 45 and 92 on the *same* input) proved that a model's `approved/NN` carries *verdict direction*, not *correctness*. So confidence was demoted to a recorded fact at every tier, and the gate decides on verifiable facts alone.

### Why the layering is the whole point

Two rules make the tiers more than a list:

**Non-bypassable.** A Tier-1 mechanical containment violation blocks the release **regardless of any reviewer approving above it.** A leg reviewer's "looks fine" is *advisory* for derivation-class claims — it never stands in for the mechanical check, and it never satisfies the containment conjunct in the gate. The load-bearing tiers for a derived value are the mechanical fact and Node C's own recomputation, in that order; an approval on top of a wrong number does not rescue it.

**Fail-safe.** A check that *couldn't run* is a **block, not a pass.** The gate reads the `checked:false` *reason*: an infrastructure or parse failure (the evidence wouldn't parse; a stage was missing) blocks; a genuinely benign absence (a leg that derives nothing legitimately has no derived-values block) passes — but *only* on a leg that derives nothing. On a leg that plainly derives, a missing evidence block means the author **dropped** it, and that blocks unless Node C demonstrably caught it. "We couldn't verify it" is never quietly rounded up to "it's fine."

That is the difference between this and pasting a config into a chatbot and applying what comes back: the same underlying model, a completely different trust surface. **The harness around the model is the product; the model is a component.**

---

## Beat 4 — How far does it scale?

The honest starting point: **this is proven at 2 devices and 6 allocations** — a two-switch lab. Everything in this beat is architectural reasoning about where the walls are, not a number off a thousand-device run. With that stated plainly, the shape scales further than the proof — and it's worth seeing exactly how, because the answer is more interesting than "yes" or "no."

### Two axes, two different walls

"1000 devices" can arrive two ways, and they hit different limits:

- **Devices *per leg*** — bounded by **LLM cognition**. The design/author/review stages reason over the harvested state, so the ceiling is context window plus reasoning quality. Bespoke config per device: realistically **low tens** (~10–30) before quality degrades. A *homogeneous* fleet with a templated change goes much higher — **100+ in a leg** — because the cognition is "design one pattern and prove containment over the pool," and the per-device instantiation is mechanical. The model holds one pattern, not N configs.
- **Number of *legs*** — bounded by **orchestration and the integration review**. Legs are database-backed tasks run concurrently by an event-driven reactor; the plumbing handles thousands of rows, and harvesting many devices is a throughput problem (batched, parallel reads), not a cognition one. Fan-out is cheap — **except** that the integration reviewer (Node C) is, today, **flat**: one LLM reasoning across *all* the legs' deliverables. That's the real ceiling.

Note the asymmetry that runs through the whole design: the **mechanical net scales fine either way** — it's `O(devices × allocations)` set-membership in code. It's the *LLM* tiers that cap a single leg's device count, never the checks.

### The verdicts

**100 devices — yes, with sharding, on today's architecture.** Shard the fleet into ~5–15 bounded legs by site, role, or vendor against one shared contract. Every load-bearing tier already scales at that size: harvest (infra throughput), the mechanical net (code), the composed-set validators, and a flat Node C still comfortably reasoning over a modest number of compact change-packages.

**1000 devices — reachable, but not on the flat program shape as it stands.** It needs two changes, and honesty demands naming which is built and which isn't:

1. **Hierarchical integration review** — Node C becomes a *tree*: legs → sub-program reviewers → a top reviewer, where every LLM at every level reviews a *diff or a seam*, never "holds the fleet in context." A flat Node C over ~50 legs is the first thing that breaks. **This is scoped, not yet built.**
2. **Leaning harder on the composed-set validators for the cross-fleet machine check** — and here's the good news, and it's already true: **Batfish routinely models thousands of devices**; `terraform plan` and `kubeconform` scale to large config sets. Because the design *rents these as tools rather than reimplementing them*, the cross-fleet *machine* checking scales natively. You reserve the (bounded, hierarchical) LLM review for the cross-*domain* seams the validators can't model — which are, by design, already the human's advisory verdict, never machine-gated.

### What scales natively vs. what needs work

| Scales to 1000 today | Needs design/hardening for 1000 |
|---|---|
| Harvest (read-only, batched) | Flat integration review → make it **hierarchical** (scoped, not built) |
| Mechanical net (containment/coverage — it's code) | LLM design-per-device → keep legs **bounded or templated** |
| Composed-set validators (Batfish/plan/kubeconform, built for scale) | Reactor last-sibling concurrency → correctness under high concurrent fan-out is a **load-test target**, not just a unit test |
| Determinism, idempotent apply, rollback | — |

### The test worth running first

Not "can it do 1000." The two walls above bend before anything else, so probe them directly: **shard ~200 devices into ~15 legs and watch (a) integration-review context pressure at Node C and (b) reactor correctness under ~15 concurrent last-sibling completions.** If those hold, the rest — harvest throughput, mechanical checks, validators, idempotent apply — is already built for scale.

The bottom line: **the primitives are the right ones** — deterministic sharding, machine validators that already model thousands of devices, idempotent apply. 1000 is a "good architecture" question, not a "wrong architecture" one. The work is keeping every LLM in the system reasoning over a *bounded* slice and pushing fleet-wide truth onto the deterministic and validator tiers — the direction the three-tier design already leans.

---

## The honest bound

Everything above proves *checkable* properties: the DAG runs in a valid order, each leg conforms to its contract, the legs conform to each other, the arithmetic is contained, coverage is complete. It does **not** prove the *objective* was right — ask for the wrong policy and you'll get a well-checked package for the wrong policy — and it can't check a property nobody thought to check. That's why there's a human release gate at the end: `programReleasable: true` means *the machine checks passed*, and it is an **input** to a person's release decision, never the decision itself. And the scale claims are architecture, not benchmarks — proven at two devices, reasoned beyond.

The claim, precisely: a multi-domain change is **decomposed into a valid dependency graph, each piece bounded and checked by code and by independent reviewers, composed under a deterministic gate that fails closed, and applied only by a human** — and the shape is built to shard rather than to be rewritten as the fleet grows.

---

## Who this is for

Reach for this architecture when the shape of your change matches what it's built for:

1. **The change spans more than one system, and one depends on another's *actual output*** — a runtime dependency that up-front coordination can't express (that's the sequenced DAG edge).
2. **Correctness rests on a mechanical step a human skims** — subnet math, quota arithmetic, policy-range matching — and you want that computation in a deterministic check, not a reviewer's confidence.
3. **You're thinking about fleet scale** — and you want an architecture that shards into bounded, independently-checked pieces rather than one that asks a single model to hold the whole fabric in its head.

If your change is single-system, single-vendor, with values all knowable up front, you don't need a program — a single pipeline covers it. The machinery earns its place when a real cross-domain, runtime dependency (or a real fleet) forces it.

---

## Provenance

The running example is drawn from real runs of a sequenced network-provisioning → cloud-IaC program against a live two-switch Arista cEOS lab and a cloud storage tier, July 2026. The architecture (the node triad, the three tiers, the release gate) is the shipped design; the scale analysis is architectural reasoning, explicitly not benchmarked beyond the two-device proof. The runs, their machine records, and the independent verification are public:

- **Verification pack** (each claim linked to its proof): <https://github.com/paichart/paichart/tree/main/verification>
- **Companion studies**: *[Coordinated Infrastructure Change](coordinated-infra-change.md)* (trust) and *[You Approve; You Don't Author](you-approve-you-dont-author.md)* (value).
- **pAIchart**: connect via the hub at <https://paichart.app/mcp> — Claude Desktop signs in with GitHub OAuth (ChatGPT with Microsoft OAuth)

The specific numbers (six harvested allocations, the two-device proof, the 100/1000 estimates) are from this lab and this analysis; they'll differ in another environment, but the *shape* — decompose into a DAG, bound each leg, check in three tiers, gate deterministically, shard to scale — is the reusable part.

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
