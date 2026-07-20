# A Coordinated Infrastructure Change, Checked by Machine — A Case Study

**Audience**: Network, platform, and infrastructure teams weighing whether an AI system can be trusted to *plan* a real configuration change — one that spans more than one device and more than one domain — without inventing facts or making the subtle arithmetic mistakes that are easy for a human to skim past.
**What this is**: a case study of one real change pAIchart's delivery engine planned end to end — two network switches plus a cloud storage policy that had to line up *exactly* with them — including the error the engine caught that a reviewer had waved through.
**What this is not**: a how-to for building the engine. It's a walk-through of what the engine *did* on a real run, why the change was hard to get right, and what the engine does when it *can't* succeed.
**Reading time**: ~15 minutes. **Self-contained** — no prior chapters required; every concept it needs is introduced here.

---

## What this chapter teaches

There's a class of infrastructure change that's easy to *describe* and easy to get *subtly wrong*: a change where one system has to be configured to match a value that doesn't exist yet — a value you can only discover by looking at the live state of *another* system, and that changes every time the environment is rebuilt.

The concrete example in this study: two switches will start exporting telemetry from **new, dedicated addresses**, and a cloud storage bucket must be configured to accept writes from **exactly those addresses and nothing wider**. You cannot write the bucket policy until you know the addresses; you cannot know the addresses until you read the live switches and pick free ones; and the "pick free ones and summarise them into a single range" step is where the arithmetic goes wrong.

We'll follow the engine through it: it reads the live devices, designs the change, coordinates the two domains so the second is built against the first's *actual* output, checks the result with a deterministic recomputation rather than an opinion, and releases only when the machine facts say so. Along the way we'll look hard at the moment it matters most — a subnet-math error a reviewer approved at high confidence, and the mechanical check that rejects it every time.

**The transferable part** isn't the specific addresses or the specific tools. It's the *shape*: harvest ground truth → design against it → coordinate dependent domains → verify with a deterministic check, not a judgement → release on facts, escalate honestly when you can't. If you're evaluating whether to let an AI system near real config, the questions this raises — *what does it check mechanically? what does it do when it's uncertain? does it ever guess?* — are the ones worth asking of any such system, ours included.

---

## The engine, in one paragraph (for readers new to it)

pAIchart's delivery engine turns an objective into an **approved-but-unapplied change package** — candidate config, the exact commands that prove it worked, and a rollback — and never applies it; applying stays a separate, human-gated step. It works in **pipelines**: a pipeline decomposes one objective into a short chain of specialist steps — *harvest* the live state, *design* the change, *author* the package, *review* it — where each step's output feeds the next. A **program** is a pipeline whose steps are themselves pipelines: it's how the engine coordinates a change that crosses domains (here, network devices and cloud infrastructure). It reads live state through an **MCP hub** — a gateway to read-only services for each system (a switch API, a cloud API) — so every design starts from what the devices *actually* say, not from an assumption. Everything below is one program the engine ran against a live two-switch lab and a cloud storage tier.

---

## The change — and why it's easy to get subtly wrong

The objective, stated plainly:

> The two-switch fabric will export telemetry from a new, dedicated loopback address on each switch. The cloud archive bucket must authorise writes from **exactly** the range covering those two addresses — no wider, no narrower.

Three properties make this the hard kind of change:

1. **The value doesn't exist at planning time.** The two exporter addresses aren't decided until someone (or something) reads the switches and picks addresses that are free. The bucket policy depends on a value that is *created* mid-change.
2. **The address pool is messy.** The switches already carry scattered, asymmetric allocations across the address block — some addresses in use on one switch, different ones on the other. You can only find the free addresses by reading the live devices; you can't assume a clean slate.
3. **The summarisation step is arithmetic, and arithmetic is where it breaks.** Once you've picked one free address per switch, you have to express "these two addresses" as a single network range — the *minimal* range that covers both and nothing else. Get the prefix length wrong and you either authorise addresses you shouldn't (too wide) or fail to authorise one of your own (too narrow). This is CIDR subnet math, and it is exactly the kind of small, mechanical, easy-to-skim step that both humans and language models get wrong.

Hold onto point 3. It's the centre of this study.

---

## Step 1 — Harvest: start from the live devices, not an assumption

The program's first move is to read the real state of both switches through the MCP hub's read-only device service. On this run it found **six** pre-existing address allocations across the two switches — three on each, at scattered, non-contiguous positions in the pool. Not a clean slate; a real, lived-in fabric.

This matters for trust in a specific way: the design that follows is built against *these six facts*, enumerated, not against a guess about what the switches probably look like. If the harvest can't reach the devices, the engine does not proceed on assumption — we'll see exactly what it does instead in the honest-failure section below.

---

## Step 2 — Which shape? Why this is a *sequenced* program

Before the engine designs anything, there's a modelling decision: how do the two domains — the switches and the cloud policy — coordinate? pAIchart has three shapes, and picking the right one is the design's first real judgement. They're worth understanding because the choice is the same one *you'd* make planning any multi-part change:

- **One pipeline, multiple devices** — when everything is the same vendor and one team owns it, model the whole thing as a single design that holds every device in view at once. (A few same-vendor switches under one team.)
- **A program with parallel pipelines and a shared contract** — when the parts are different vendors or different teams, but the coordinating values are **knowable up front** (an agreed address scheme, naming, a flow spec). Each part designs against a shared contract, in parallel.
- **A program with sequenced pipelines** — when a downstream part genuinely needs an upstream part's **actual designed output**, not just an agreed constant.

This change is the third shape, and the reason is point 1 above: the bucket policy needs the *specific addresses the switch design picks*, which don't exist until that design is done. You cannot fold "the exporter range" into an up-front contract, because it isn't a constant — it's an output. So the program runs the network design first, then feeds its real result into the cloud design.

| The deciding question | This change |
|---|---|
| Same vendor, one team? | No — network devices *and* cloud infra |
| Coordinating value knowable up front? | No — the range is *created* by the network design |
| Does the downstream need the upstream's actual output? | Yes — the policy must match the derived range exactly |

That combination — different domains, a value that's an output not a constant — is what makes it a **sequenced** program. (If your own change *can* be expressed as up-front constants, prefer the parallel shape; it's simpler and runs the parts at once. Sequence only when the dependency is genuinely runtime.)

---

## Step 3 — The run: network first, then cloud, chained

The program runs as two pipelines in order:

1. **The network pipeline** harvests the fabric (Step 1), **designs** the change — selecting a free address on each switch and deriving the single minimal range that covers both — **authors** the per-switch config package (the loopback config, the routing advertisement, the exact validation commands, the rollback), and has an independent **reviewer** check it.
2. **The cloud pipeline** then reads the network pipeline's *actual deliverable* — not a summary, the real design output — and authors the storage-bucket policy that authorises writes from **exactly** the derived range, copied verbatim. It cannot guess the range or recompute it independently; it has to take the network design's real output, because the whole point is that the two must match.

The engine holds the cloud pipeline until the network pipeline's deliverable is fully written, so the cloud design never builds against a half-finished upstream. This is the "sequenced" mechanism doing its job: the second domain is provably built on the first domain's committed result.

---

## Step 4 — The check: a recomputation, not an opinion

When both pipelines are done, an **integration reviewer** verifies they cohere: the cloud policy authorises the same range the network design derived, that range covers exactly the two chosen addresses, and none of the six pre-existing allocations is swept in. Crucially, it does this by **recomputing** the arithmetic itself against the harvested facts — not by trusting the network pipeline's word that it added up.

Then the program computes a single release verdict — *is this releasable?* — as a deterministic AND over machine facts: every part approved, the mechanical containment check clean, the integration review approved, the coverage complete. On the clean run this study is anchored to, that verdict came back **releasable**, both pipelines approved, with **zero human interventions** between kicking it off and the release facts landing. A human still makes the actual release decision — the engine produces the *input* to that decision, never the decision — but the input is a set of verifiable facts, not a vibe.

There's a deliberate design choice hiding in that last sentence, and it's the heart of what makes this trustworthy. **No confidence score gates the release.** Which brings us to the moment that matters most.

---

## The showpiece — the subnet math a reviewer approved, and the check that won't

Go back to point 3: express "these two addresses" as the single minimal range covering both.

A network range written as `10.99.0.0/31` covers **exactly two** addresses — `10.99.0.0` and `10.99.0.1`. That's what a `/31` *is*: a two-address block. So if a design selects the addresses `.1` and `.2` and then claims `10.99.0.0/31` as the range covering them, it is **wrong** — `.2` is not inside that block. The range is too narrow by one; it fails to authorise one of the fabric's own exporters.

Here's why the engine was even tempted into that mistake, and it's where the harvest from Step 1 earns its keep. The *minimal* range that truly covers `.1` and `.2` is `10.99.0.0/30` — a four-address block spanning `.0` through `.3`. But `.3` was **already in use**: it's one of the six pre-existing allocations the harvest found. So the honest tight range grabs an address that isn't the fabric's to authorise. Caught between a range that's too wide (`/30`, sweeps in `.3`) and a range that's too narrow (`/31`, misses `.2`), the flawed design took the narrow one. Both are wrong; it picked the wrong wrong. The *right* move — the one the clean run made — was to stop forcing a bad range and **re-select**: choose a different free pair, `.4` and `.5`, whose minimal range `10.99.0.4/31` covers exactly those two and sweeps in none of the six existing allocations.

The narrow-range error is a one-character mistake, arithmetically obvious once you write out the two addresses a `/31` spans, and *exactly* the kind of step a busy engineer skims and a reviewer nods through. That is not hypothetical. On earlier runs of this exact change, the design made this precise error — `.1`/`.2` claimed as `10.99.0.0/31` — and a reviewer **approved it at a confidence of 92 out of 100.** On a near-identical run, a reviewer *caught* the same error and scored it 45. Same defect, opposite verdicts, essentially the same inputs. We measured it deliberately: across a corpus of these reviews, the confidence numbers on approvals of *broken* work and approvals of *correct* work fell in the same band — the score carried the reviewer's *direction* (approve vs. block), not the *correctness* of the work. A confidence of 92 was not evidence the math was right. It was the model's way of saying "I approve," which is worth nothing when what it approved was wrong.

So the engine does not let the model — or a human reviewer's confidence — be the thing that certifies the arithmetic. It runs a **deterministic check, in code**: take the addresses the design declared, take the range it derived, and verify by direct computation that every declared address falls inside the range *and* that no pre-existing allocation does. Those are the two failure modes — too narrow (a chosen address falls outside) and too wide (a harvested allocation falls inside) — and the one check catches both. It's a few lines of arithmetic. It rejects the `.1`/`.2 → /31` error every single time, at no confidence, with no judgement, because it's not judging — it's computing. On the clean run, the design selected `.4` and `.5`, derived `10.99.0.4/31`, and the check confirmed — by direct computation against all six harvested allocations — that both chosen addresses were inside it and none of the six were: zero violations. *That* — not a score — is what let the release proceed.

The principle generalises, and it's the one sentence to take to a customer: **the engine lets the model design the change and reason about it, but it never lets the model self-certify what a computer can check.** Subnet arithmetic and a reviewer's own confidence are the same class of thing — both are the model grading its own work — and neither gates a release. Facts a computer can verify do.

---

## The honest part — what it does when it *can't* succeed

Trust in an automated system is decided less by what it does when everything works and more by what it does when it can't. So here's a run where it couldn't.

On one execution, the switches were unreachable — the lab's device API wasn't answering. The harvest step, reading live state, found **nothing**. A system built to please would have proceeded on assumption, or invented plausible addresses, or produced a confident-looking package built on air. This one did the opposite, at every layer:

- The harvest reported zero allocations rather than guessing any.
- The design step refused to design an address it couldn't ground, and escalated.
- The reviewer rejected — there was no change package to review.
- The cloud pipeline, seeing it needed a value the network pipeline never produced, **refused to fabricate it** and stamped itself as unable to run, naming the upstream failure.
- The engine then marked the dead-end terminal and raised a single, attributed escalation: *this program is not releasable; the root cause is the network harvest; the devices were unreachable.* It named the true root, not a symptom, and **invented nothing.**

No output was produced that looked like success. The machine said *no*, said *why*, and pointed at the real cause — which is precisely the behaviour you want from something you're going to let near production, and precisely the behaviour that a system optimising to look helpful will not give you.

---

## So how do you know it's correct?

Step back from the subnet arithmetic — that's one property. The question a serious reviewer should ask of any system like this is broader: how do you know the *whole* change is right? The honest answer is that the engine doesn't claim the AI is correct. It makes the change **checkable and reversible — and checks it with things that aren't the AI.**

Four properties do the work. The change is **grounded** — built on the harvested live state, not an assumption; a plan built on hallucinated state is wrong before it starts. It's **deterministic** — the same harvested state and objective produce the same package, which is the precondition for verifying it at all (a non-deterministic design gives you nothing stable to check). Every property a computer *can* check — range containment, coverage, cross-domain consistency, and syntactic validity through the domain's own validators (`terraform validate`, `terraform plan`, device config parsers) — *is* checked by deterministic code, not by a confidence score. And correctness is defined **operationally**: the package carries the exact validation commands and expected output that prove each change worked, plus a rollback for each device.

Concretely, the checks that gate a release — each a deterministic computation, none a model's opinion:

- **Containment** — every address the design declares sits inside the derived range, and no already-allocated address is swept in (the two `derivationContainment` violation kinds, `member-not-covered` — a chosen address outside — and `covered-not-member` — an existing one inside). The subnet check, generalised.
- **Coverage** — every leg's *real* deliverable reached the consumer, not a fallback summary: the `chainCapablePredecessors`, `degradedPredecessors`, and `notChained` facts. A count that "looks complete" cannot hide a dropped deliverable.
- **Contract presence** — a pipeline cannot even begin without its binding interface contract; its absence is a loud `INTERFACE_CONTRACT_MISSING`, never a silent skip.
- **Protocol completeness** — the run actually performed the steps its mode requires; a clean `SUCCESS` that skipped one is surfaced, not trusted.
- **Verdict as a fact** — a reviewer's terminal verdict is carried forward transcribed verbatim, never re-read from prose by whatever consumes it downstream.
- **The release gate** — a deterministic AND over those facts (`programReleasable`): every leg approved, no containment violation, coverage complete, the integration review approved — with no confidence number anywhere in it.

Under all of it sits the real safety net: **the engine never applies the change.** It emits an approved-but-unapplied plan, which an **idempotent**, convergent executor applies out-of-band — a `terraform apply`, a GitOps reconcile, or a human running the validated commands — driving actual state to desired state and doing nothing when re-run. A deterministic plan, machine-checked, applied idempotently, with a rollback in hand: a wrong plan costs a review cycle, not an outage.

And the bound, because it's what makes the rest credible: the engine proves the *checkable* properties. It does **not** prove the objective itself was right — ask for the wrong policy and you get a correct package for the wrong policy — and it can't check a property nobody thought to check. That's why there's still an independent review and a human release gate. The claim is never "the AI is correct." It's narrower and stronger: the change is grounded, machine-checked on everything checkable, operationally testable, reversible, and it refuses when it can't be sure. That is the whole difference between this and pasting a config into a chatbot and applying what comes back — the same underlying model, a completely different trust surface. The harness around the model is the product; the model is a component.

## What it changes: you approve, you don't author

Look at what a person actually did in this run — and what they didn't. They stated the objective in plain language and pointed the engine at the environment. The two inputs are just **intent** (`requirements.md`) and the **topology as data** (`topology.json`) — neither is device configuration. Everything device-specific (the Arista switch config, the Terraform policy) was *generated*, and the human's role was to **approve** it, not to write it.

In the vocabulary most banks and carriers already run on: you still own the **High-Level Design** — the *what and why* — and the **change-approval** gate: the RFC and the CAB. What the engine takes off your plate is the **Low-Level Design** — the per-vendor config that today needs an Arista expert *and* an AWS expert *and* a Cisco expert to author, plus the legwork of reading each device's live state by hand. One domain-literate approver replaces a bench of per-vendor authors, and their judgement is *sharpened*, not replaced, because the mechanical parts (the subnet math, the containment) are already machine-checked. The honest limit is the same as everywhere here: you still need someone who can *approve* — read it, judge it matches intent, own the release. You no longer need someone who can *write* it, in every vendor's language, or gather the state to write it against. That shift — from authoring to approving — is powerful enough to have [its own study: *You Approve; You Don't Author*](you-approve-you-dont-author.md), the companion to this one.

## When this shape fits your own changes

The specific tools here are pAIchart's. The shape transfers. Reach for this kind of coordinated, machine-checked planning when:

1. **The change spans more than one system, and one depends on the other's actual output.** If a downstream config must match a value an upstream step *creates*, you have a sequencing dependency that up-front coordination can't express.
2. **Correctness rests on a mechanical step a human skims.** Subnet math, quota arithmetic, policy-range matching — anywhere a small deterministic computation gates safety, that computation belongs in a check, not in a reviewer's confidence.
3. **You need to trust the "no" as much as the "yes."** If you're automating planning at all, the system's behaviour under failure — does it escalate honestly, or produce confident nonsense? — is the property to test first.

If your change is single-system, single-vendor, and its coordinating values are all knowable up front, you don't need the sequenced-program shape — a simpler pipeline covers it. The machinery earns its place when a real cross-domain, runtime dependency forces it.

---

## Provenance

This study is drawn from real runs of a sequenced network-provisioning → cloud-IaC program against a live two-switch Arista cEOS lab and a cloud storage tier, during July 2026. The runs, their machine records, and the independent verification write-ups are public:

- **Verification pack** (the claims, each linked to its proof): <https://github.com/paichart/paichart/tree/main/verification>
- **The sequenced-legs run** (a value that didn't exist at plan time, machine-checked against harvested ground truth): <https://github.com/paichart/paichart/blob/main/verification/tests/VT-09-sequenced-legs-evidence-flow.md>
- **The facts-not-confidence release** (the subnet-check regime, the green pass): <https://github.com/paichart/paichart/blob/main/verification/tests/VT-10-confidence-demotion-green-pass.md>
- **Companion case study** (what the engine buys you — the shift from authoring to approving): [You Approve; You Don't Author](you-approve-you-dont-author.md)
- **pAIchart**: <https://paichart.app> · connect via the hub at <https://paichart.app/mcp> — Claude Desktop signs in with GitHub OAuth, ChatGPT with Microsoft OAuth

The specific numbers (six harvested allocations, the 92-vs-45 review scores, the address examples) are from these runs in this lab; they'll differ in another environment, but the *shape* — harvest, design, sequence, mechanically check, release on facts, escalate honestly — is the reusable part.

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
