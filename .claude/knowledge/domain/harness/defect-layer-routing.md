# Routing a pipeline defect to the layer that owns it

**What this is**: the method we actually use when a live run refuses something, and the reason the
platform gets more portable every time a new rig or domain is stood up.
**When**: any forensic investigation of a pipeline/program run. Pairs with
`PIPELINE-RUN-FORENSICS-GUIDE.md` (how to read the evidence) — this is what to DO with it.
**Worked example throughout**: the 2026-09-23 harvest-scope arc, `cline_docs/reviews/harvest-scope-2026-09-23/`.

---

## The premise: a refusal is a signal, and the defect is usually assembled from correct steps

The instinct on seeing a refused run is to find who was careless. In a mature pipeline that instinct
is almost always wrong. On 2026-09-23 five roles were examined — harvester, orchestrator, architect,
author, reviewer — and **every one complied with what it was told**. The harvester executed its brief
exactly; the orchestrator wrote that brief while reading a protocol that instructed the narrowing;
the architect self-certified against its role guidance correctly; the reviewer caught the result and
cited the governing clause by date.

The defect was real. Nobody caused it. **That is the normal case**, and it is why "who should have
known better" produces bad fixes and "which layer could have made this impossible" produces good ones.

**Corollary**: the layer where the symptom appears is rarely the layer that owns the cause. The
symptom appeared at the author. The cause was a service that could not return a small enough answer.

---

## STEP 0, before anything else: does a control already exist?

**If a control for this property already ships, you do not owe a frequency measurement — you owe its
COMPLIANCE RATE.** Different question, different population, different remedy.

Skipping this is not a missed check; it *causes* the error. On 2026-09-23 a spec reached a
four-specialist panel proposing a clause that had shipped eleven days earlier, in the same domain,
for the same defect, in stronger wording — and the proposal was WEAKER than what it duplicated (the
shipped clause FORBADE; the proposal MANDATED, and the defective package would have satisfied it).
A second panel then found the *same class* one layer up. Three pre-existing controls, found by
asking.

```bash
grep -rn "<the property, in 2-3 phrasings>" scripts/seed-protocol-prompts.ts \
  lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts \
  scripts/seed-*-templates.ts lib/agents/universal-agent-rules.ts
git log -S "<a distinctive phrase>" --oneline -- <the file>   # → ship date, then measure compliance
```

Full practice: `.claude/knowledge/discoveries/execution-facts-discovery.md` §§ STEP 0, STEP 0b.

---

## The six layers, and the question that routes to each

Ask them **in this order**. The first YES is usually the right home.

| # | Layer | Owns | Route here when | Cost of getting it wrong |
|---|---|---|---|---|
| 1 | **Service / descriptor** (the rig, the customer's MCP service) | what can be OBSERVED at all | **the agent could not have complied** — no tool returns what the obligation demands | Every rule above it is an unsatisfiable predicate, and an unsatisfiable obligation reads exactly like an ignored one |
| 2 | **Domain protocol** (`kubernetes-gitops`, `network-provisioning`, …) | what THIS domain's objective CLASS requires | the requirement is domain-shaped and applies to every run of that domain | Wrong domain gets a rule meaningless to it; three other domains stay exposed |
| 3 | **Orchestrator base protocol** | what EVERY pipeline must do regardless of domain | domain-neutral, and about decomposition/briefs/modes | Platform-wide blast radius — a wrong rule here reaches every customer |
| 4 | **Role guidance** (`ROLE_GUIDANCE_LIBRARY`) | how a ROLE behaves across every domain it serves | the property is about the role's CRAFT, not the domain's subject matter | Shared keys fan out to 4+ templates; a domain-ism here ships to domains it makes no sense in |
| 5 | **Mechanical net / stamped fact** | a machine-decidable property a consumer ACTS on | machine-decidable **AND** something already reads it | A false-block refuses correct work; a fact with no reader is storage, not detection |
| 6 | **Requirements document** | what THIS run must achieve | genuinely run-specific, true of no other run | Per-run and memory-dependent: helps nobody else, rots immediately |

### The routing questions, in order

1. **Could the agent have complied at the moment it was asked?** If no → **layer 1**. Nothing above
   it can work. Ship the tool, *then* the clause.
2. **Is the property about what the OBJECTIVE CLASS needs, or about this run?** Class → 2/3. This run
   → 6.
3. **Does it hold in every domain?** Yes → 3 or 4. No → 2.
4. **Is it about the role's craft or the domain's subject?** Craft → 4. Subject → 2.
   (*"Quote evidence you actually witnessed"* is craft. *"A namespace census bounds a selector"* is subject.)
5. **Is it machine-decidable AND does a consumer exist today?** Both → 5. **Either missing → not 5.**
6. **Which role can DISCHARGE it?** Put the obligation where it can be satisfied, not where the
   symptom surfaced. An obligation on a role that cannot act is the same defect as no obligation.

---

## Five disciplines that decide whether the fix holds

**1. Detection binds; production binds only when the action is cheap and available.**
Measured: a clause shipped to two roles — the AUTHOR half failed 1-in-8, the REVIEWER half fired on
the first live instance and named its own precedent. The reviewer carries the rule while its job IS
checking; the author carries it as one of ~44 directives while its job is producing.
⚠️ **But the qualifier matters and was earned the same day**: the author-side clause demanded evidence
that, in that domain, *could not be obtained* — the narrowest read available was 3.4× the tool-result
cap. Once a tool made it obtainable, the production obligation bound **first attempt, unaided**.
**So: prefer detection; and if you must put it on the producer, make sure the action is possible.**

**2. Prefer amending a rule that is obeyed over adding one that is not.**
If compliance with the existing control is high (measured 97.1% across 210 briefs), the defect is in
what the rule SAYS, not in whether it is followed. Amending is cheaper, smaller, and lands on a
behaviour already demonstrated.

**3. Name the PROPERTY, never our environment.** See the section below — this is the portability rule
and it is enforced at commit time by `npm run test:no-rig-identifiers`.

**4. A fact with no consumer is storage.** Do not stamp a signal because it is measurable. Build the
reader first, or park the fact with a trigger. (`resultTruncatedForLlm` has been stamped per-call for
months and nothing outside the tool loop reads it.)

**5. Verify the proxy before trusting the number.** Read two artifacts your query calls positive and
two it calls negative. On 2026-09-23 a single review produced **fourteen** confident wrong numbers
across five people; five of them were **zeros**, which read as clean results and therefore survive
review unchallenged.

---

## Why a NEW RIG or a NEW DOMAIN improves the platform — the part worth telling a customer

Standing up a new environment is not just coverage. **It is a forcing function**, because a new
environment cannot comply with a rule that was secretly about ours. Each one surfaces four classes of
latent defect that no amount of internal review finds:

**1. Obligations that were never satisfiable.** A rule can be correct, well-written, injected and
obeyed nowhere — because the tool surface cannot deliver what it asks. Kubernetes carried a
well-written clause for eleven days at 1-in-8 compliance; the cause was that the narrowest available
read returned 3.4× what the model could receive. **No new domain tolerates this. The rule either
becomes satisfiable or it is exposed as decoration.**

**2. Obligations that named OUR lab instead of a property.** A protocol that says *"call
`get_scrape_targets`"* works perfectly on the rig it was written against and teaches an agent to call
something that does not exist on yours. Found on 2026-09-23 in three shipped protocols — and in a
clause added that same morning. **The platform now fails the commit rather than shipping it.** The
distinction is not cosmetic: *"`terraform state list`"* is platform vocabulary every customer has;
*"`state_list`"* is our example service's tool name.

**3. Duplicated obligations nobody noticed.** Domains accrete rules. Three separate pre-existing
controls were found in one day by asking *"does this already ship?"* before writing anything.

**4. Ambiguities our environment resolved by accident.** A two-device lab makes an expensive read look
cheap; a two-pod namespace makes a full-object listing look survivable. Different scale in a new
environment turns a silent assumption into a visible one.

**The claim this supports, which is stronger than "we tested it":** every domain we add makes the
existing domains more portable, because the obligations they share must be re-stated as properties
rather than as facts about one lab. The four-domain protocol corpus is not four copies of a rule — it
is a rule that has survived four different tool surfaces, four different scales, and four different
vocabularies, and been corrected each time it turned out to be about us instead of about the work.

---

## The 2026-09-23 arc, routed

| finding | routed to | why |
|---|---|---|
| The narrowest pod read was 3.4× the cap | **1 — service** | The agent could not comply. Everything else was blocked on it |
| A named target was scoping the HARVEST, not just the change | **2 — domain protocol** (Phase 0) | Domain-shaped: the containing population differs per domain |
| A brief may not narrow below the protocol's scope | **3 — orchestrator base** | Domain-neutral, and about brief-writing |
| Depth-vs-breadth conflated in the harvester's own guidance | **4 — role guidance** | Craft, not subject: it is about how to read, in any domain |
| An unevidenced set bound | **not 5** | Machine-decidable only in part, and no consumer exists. Parked with triggers |
| ~~A new `config_change_author` paragraph~~ | **WITHDRAWN** | Duplicated a shipped clause and was weaker than it |
