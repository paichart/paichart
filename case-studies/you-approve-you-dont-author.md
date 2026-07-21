# You Approve; You Don't Author — A Case Study in Who Has to Be in the Room

**Audience**: The people who own infrastructure change — architects, network and platform leads, and the buyers who staff and de-risk them. If your changes cross more than one vendor and each one needs its own expert to write the config, this is about what that costs and what removes it.
**What this is**: a case study of who *actually* did what in a real, multi-domain change pAIchart's delivery engine planned — and, more to the point, who *didn't* have to.
**Companion**: this piece is about *what the engine buys you*. Its companion, [*A Coordinated Infrastructure Change, Checked by Machine*](coordinated-infra-change.md), is about *why you can trust it* — the machine checks, the honest failures, the reversibility. Read that one if the question on your mind is "can I trust it near production."
**Reading time**: ~14 minutes. **Self-contained** — no prior reading required.

---

## What this chapter teaches

There is a fixed cost to a multi-vendor infrastructure change that has nothing to do with deciding *what* you want. It's the cost of turning that decision into the specific configuration language of each system it touches — Arista on the switches, Terraform on the cloud, a firewall vendor's syntax at the edge — and of reading each system's live state by hand first, so you have something correct to write against.

That translation is where the expensive people go. You need an expert *per vendor* to author the config, plus a reviewer to approve it. The decision — the intent — was the easy part; the authoring is the labour.

This chapter follows a real change and shows where that labour went: **nowhere a person had to be.** The intent was stated in plain language. The live state was read by machine. Each vendor's config was *generated*. And the one human in the loop did the one thing a machine should not do alone — **approved** it. The claim, stated plainly and defended honestly below: *the expertise a change like this demands shifts from **authoring** across every vendor to **approving** one reviewed result.*

**In the words most banks and carriers already use:** you keep the **High-Level Design** — the *what and why* — and the **change-approval** gate: the RFC and the CAB. The engine takes the **Low-Level Design** — the per-vendor config — off your plate. Your process doesn't change; the expensive middle does.

---

## The engine, in one paragraph

pAIchart's delivery engine turns an objective into an **approved-but-unapplied change package** — candidate config, the exact commands that prove it worked, and a rollback — and never applies it; applying stays a separate, human-gated step. It reads live state through a read-only gateway (a **harvest**), designs the change in domain terms, and only at the very end generates the vendor-specific configuration. It is deliberately *not* a closed-loop controller that reconfigures your fabric on its own — it produces a reviewed change and hands it to a human. That non-actuation is the point: it fits the change process a regulated team already runs, rather than replacing it.

---

## The old way — an expert per vendor

Picture the change without the engine. Two switches need a new loopback and a routing advertisement; a cloud bucket needs a policy authorising exactly the range those loopbacks will use. To do it by hand:

- Someone who knows **Arista EOS** logs into both switches, reads the current interface and address state, picks free addresses, writes the interface and BGP config, and writes the show-commands that prove it.
- Someone who knows **AWS and Terraform** reads the current bucket policy and writes the HCL that authorises the new range — and has to get that range *exactly* right against what the network person chose.
- If a third system were in the path — a **Cisco ASA** or a **Palo Alto** firewall — a third specialist writes *that* vendor's syntax too.
- Then a reviewer checks all of it and signs the change.

Three authoring languages, three people who each know one of them, plus the hand-work of reading each device's live state, plus the coordination to make the pieces line up. That is the cost. Now watch where it goes.

---

## What a person actually provided — two documents, both in plain terms

The engine's whole input was two files, and neither is device configuration:

- **`requirements.md`** — the **intent**, in plain language: *"the two switches export telemetry from new, dedicated addresses; the cloud archive bucket must authorise writes from exactly the range covering those two, no wider."* This is the High-Level Design. A network architect writes it; frankly, so could a product owner who knows what they want.
- **`topology.json`** — the **environment as data**: the nodes (vendor, role, ASN), the links, and the interdependency between the two domains. Structured, but in domain vocabulary — not a single line of vendor CLI. And it's the kind of artifact that often already exists as source-of-truth, or can be generated from an architecture diagram.

That's it. No EOS. No HCL. No firewall syntax. The human said *what* and pointed at *where*.

---

## The language stack — domain terms all the way down, until the last step

Here is the part worth internalising, because it's why the expertise shifts. Every layer between intent and the finished config is in **domain language**, and device-specificity appears **only at the very bottom**:

1. **Intent** (`requirements.md`) — plain language. *What and why.*
2. **The interface contract** — the engine *computes* the binding invariants from intent + topology: the flow, the naming, the derived address range. These are domain facts, and they are **vendor-neutral by construction** — the same contract binds an Arista switch, an AWS policy, and a firewall alike.
3. **The design** — expressed in domain concepts: *"a loopback per switch, advertised into routing"*, *"a policy authorising the aggregate."* Still no vendor syntax.
4. **The generated config** — *only here* does device-specific configuration exist, and it is **produced by the engine, checked, and handed to a human to approve** — never hand-written.

The human lives at the top of that stack (intent) and the bottom of it (approve). Everything in between — the translation that used to need an expert per vendor — is the machine's.

---

## The showpiece — one intent, configuration in several languages, none of it hand-written

From that single intent, the engine produced device configuration in more than one vendor's language. On the real run this study draws from, two of those are genuine generated artifacts:

- **On the switches — Arista EOS.** A per-switch config block: a `Loopback` interface at the chosen `/32`, a BGP `network` statement advertising it, and the exact `show` commands (with expected output) that prove each change took. Nobody typed it.
- **In the cloud — Terraform / AWS.** An `aws_s3_bucket_policy` whose `aws:SourceIp` condition authorises *exactly* the range the network design derived, read verbatim from the network leg's output. Nobody typed that either — and crucially, nobody had to make the two match by hand; the policy took its range from the design's real output.

*(Illustrative, honestly labelled: had the path also crossed a **Cisco ASA** or a **Palo Alto** firewall, the same intent would have generated that vendor's syntax too — an access rule and an object group. We show that leg as a design illustration, not a captured run, because we haven't stood up a live rig for a firewall vendor yet. It's a configuration exercise for the engine, not a change to it — which is exactly why we can say it honestly.)*

The point isn't the specific configs. It's that **one intent produced correct configuration in multiple vendors' languages, and a person wrote none of them.** The three-experts-in-a-room problem became a one-intent-and-an-approver problem.

---

## The harvester — you don't gather the state, either

Authoring isn't the only manual burden the engine removes. Before you can write a correct change, you have to know the current state — which addresses are free, what's already configured. By hand, that's logging into each device and reading it.

The engine's **harvest** step does that through a read-only gateway and normalises what it finds into domain facts — on this run, six pre-existing address allocations across the two switches, enumerated as data, not as raw config dumps. So the human doesn't need to know each system's *read* commands any more than its *write* syntax. And if the devices can't be reached, the engine says so and stops — it never guesses the state (the companion trust study covers that behaviour in full).

---

## What's left for the human — the approval gate

So what *does* a person do? They **approve**. They read the generated change, judge whether it matches the intent they stated, and own the release — the CAB, in change-management terms. Nothing applies until they do.

And approving here is a lighter, sharper job than authoring ever was, because the engine has already done the mechanical checking a human is worst at and slowest at: the subnet arithmetic, the containment against existing allocations, the coverage, the cross-domain consistency — all machine-verified before the change reaches the gate (the companion study is the deep dive on exactly this). The approver isn't re-checking the math. They're doing the one thing that genuinely needs human judgement: *is this what we meant, and are we willing to ship it?*

---

## What it buys you

Line the two worlds up:

| | Author by hand | With the engine |
|---|---|---|
| **State the intent** (HLD / RFC) | a person | a person |
| **Read each system's live state** | a per-vendor engineer | the harvester |
| **Write each vendor's config** (LLD) | an expert *per vendor* | generated |
| **Check the mechanical correctness** | the reviewer, by eye | machine-verified |
| **Approve the change** (CAB) | a reviewer | a person |
| **Apply it** | out-of-band, human-gated | out-of-band, human-gated |

The two ends — state the intent, approve the change — stay human, and should. Everything in the middle, which is where the per-vendor experts and the hand-work lived, moves to the engine. **One domain-literate approver replaces a bench of per-vendor authors.** Your change process is unchanged; the expensive middle of it is automated.

---

## The honest boundary

This is not "you don't need experts." It's a shift in *which* expertise, and it has limits worth stating plainly:

- You still need someone who can **approve** — read the change, judge that it matches intent, and own the release. That is real domain competence. What you no longer need is a config *author* per vendor, or the hand-work of reading each device's state.
- The engine generates a correct package for **the intent you gave it.** If the intent is wrong — the wrong policy, the wrong scope — you get a correct package for the wrong thing. Stating the right intent is still your job, and it's why the approval gate exists.
- Approving well still takes judgement. The engine makes that judgement *cheaper and better-informed* (the mechanical parts are checked, the change is reversible), not unnecessary.

The claim, precisely: **the engine removes the authoring and the state-gathering; it keeps a human on the intent and the approval — the two places judgement actually belongs.**

---

## Who this is for

Reach for this when the shape of your changes matches the cost it removes:

1. **Your changes cross more than one vendor or domain**, and each needs its own config expert to author.
2. **The authoring — not the deciding — is your bottleneck**: the intent is easy to state; turning it into correct per-vendor config, against current live state, is the slow and error-prone part.
3. **Your process already separates the design and the approval** (an HLD/RFC and a CAB) — because the engine slots into exactly that separation: you keep the ends, it takes the middle.

If your changes are single-vendor and small, the arithmetic doesn't favour it — a person authoring one familiar config is fine. The engine earns its place when the authoring burden is multiplied across vendors and repeated against changing live state.

---

## Provenance

The real generated configuration in this study (the Arista EOS switch config and the Terraform / AWS bucket policy) is from actual runs of a sequenced network-provisioning → cloud-IaC program against a live two-switch Arista cEOS lab and a cloud storage tier, July 2026. The firewall leg is an illustration, marked as such. The runs, their machine records, and the independent verification are public:

- **Verification pack** (each claim linked to its proof): <https://github.com/paichart/paichart/tree/main/verification>
- **Companion case study** (why you can trust the generated change): [A Coordinated Infrastructure Change, Checked by Machine](coordinated-infra-change.md) — the same program, seen through the machine checks, the honest failures, and the reversibility.
- **Companion case study** (how it's built — the DAG, the review tiers, and scale, with the internals named): [Inside a Multi-Domain Program](inside-a-multi-domain-program.md)
- **pAIchart**: connect via the hub at <https://paichart.app/mcp> — Claude Desktop signs in with GitHub OAuth (ChatGPT with Microsoft OAuth)

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
