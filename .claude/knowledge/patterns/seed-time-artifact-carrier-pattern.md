# Seed-Time Artifact Carrier Pattern

**Confidence: 85%** — mechanically verified end-to-end and live-proven once (2026-09-21,
requirements-authoring V3). One domain, one run; the *eliminations* below are mechanical and
domain-independent, the *pattern* has n=1. Graded 85 rather than 90+ for that reason alone.

## Pattern Overview

**Problem**: an agent must receive a **verbatim artifact** — a template, a schema, a canonical
stanza, a reference document — that it fills, transcribes or checks against. The artifact is
authored elsewhere, often in another repo, and its exact bytes matter.

**The naive answers all fail**, and they fail *mechanically*, not stylistically. This pattern is
what survives eliminating them.

**Solution**: read the artifact from a **vendored file at SEED TIME** and bake it into the
**protocol body**, which reaches the model as system-prompt text. Split the artifact by *property*
across surfaces chosen for their fidelity guarantee and reseed cadence.

---

## The elimination chain — why the obvious routes are dead

Do not re-derive these. Each was verified independently, by a different specialist, against the tree.

| route | why it dies | mechanism |
|---|---|---|
| **Harness writes it into the child's task description** | an **LLM transcribes it** | measured: **3 of 4** authoring passes altered text they were told to reproduce — numbering lost twice, one rule's permitted forms loosened, one acceptance check deleted, and one asserted verbatim splicing of text it had retyped |
| **§6 chained context** | crosses **R9**, which rewrites while reporting it did not | `sanitizeChainedOutput` NFKC-normalizes (`…` → `...`) and stamps **`sanitized: false`** — so a byte-exact payload is silently altered *and* the fact says otherwise |
| **MCP resource** | **not on the engine surface at all** | `resources/read` is a transport *method*, not a tool, so it can never become a function definition; the embedded server registers exactly six tools and `callTool` throws for anything else |
| **Artifact store** | **no input mode** | artifacts cannot exist without an execution (FK-required, all write sites post-LLM), agents have no artifact-read tool, and the one channel that carries artifact content into a prompt carries an LLM's `finalResponse` — and rewrites it in transit |

> **Protocol injection is the only path with no sanitizer, no renderer, no truncator and no model
> in it** — precisely *because* it never enters the machinery those criteria are about.

⚠️ A **new** artifact-read tool is not the escape hatch. It would be **R9-free by omission** (site A
gates on `toolCall.name === 'services'`), which is worse than crossing the screen.

---

## The Complete Pattern

### 1. Split the artifact by PROPERTY, not by convenience

| half | goes to | because |
|---|---|---|
| **STRUCTURE** (headings, slots, shape) — must arrive byte-exact | **protocol body**, via seed-time file read | auto-reseeds every deploy; a stale verbatim copy is a *wrong* copy, so it belongs where staleness cannot accumulate |
| **OBLIGATIONS** (how to fill it well) — must arrive semantically | **role guidance** | a distillation has no upstream original, so it *cannot* become a wrong copy; its only failure mode is being out of date with the library, which `report:template-freshness` measures **by name** |
| **TEXT that must reach the PRODUCT byte-identically** | **nowhere agent-facing** | spliced deterministically by a human/script at publish time; the agent emits a marker |

> **The routing principle**: *the thing that can go stale-against-a-source goes where it is
> auto-reseeded; the thing that cannot goes where it is measured.*

#### How to actually perform the split — the discriminator

Asserting "split by property" is easy; deciding which half a given line falls in is the work. The
tested question is **who is the addressee, and WHEN does the instruction bind?**

| the line… | is | goes to |
|---|---|---|
| binds the agent **at the moment it writes** | an **OBLIGATION** | role guidance, in the role's own voice |
| tells a **later reader of the product** how to treat what they find | **document TEXT** | the spliced artifact |
| is a war-story / provenance for a rule | **TEXT by construction** | the artifact — it is evidence for the reader, not an instruction |

Worked example (requirements-authoring, 15 rules): **12 moved, 2 stayed, 1 rerouted.** Two rules
collapsed into one because the second was only the first's *scope*. One stayed because it addresses a
later **editor** of the document rather than a first authoring pass.

🔴 **An obligation may bind a DIFFERENT role than the one you are writing for — check the addressee,
never assume it is the producer.** In the worked example one rule was about how to read a
`[NEUTRALIZED-…]` injection marker. That addressee is not the author; it is the **reviewer**, whose
chained context carries such markers. It would have been written into the wrong role's guidance and
been silently useless there, while the role that needed it had nothing.

🔴 **Write an obligation so it fires at the moment of writing: name the TRIGGER and the
SUBSTITUTE.** This is not style advice — it was measured, and the measurement **refuted the obvious
explanation.**

Two obligations, same document, same model, same run:

| | obligation A | obligation B |
|---|---|---|
| **trigger** | *"the moment you are about to type a computed value"* | **none** |
| **substitute** | *"write how to obtain it and how to know it is right"* + worked example | **none** — it stated what a step *is*, not what to write instead |
| force, in ROLE GUIDANCE | *"NEVER the literal answer"* | declarative, and a second weaker restatement saying *"prefer"* |
| force, in the PROTOCOL | **none — no protocol statement at all** | **a clean `MUST`, with a discriminator AND a negative example** |
| **outcome** | **defect vanished — 33 occurrences → 0** | **violated on 2 of 4 sections; the reviewer blocked** |

🔴 **Read the bottom two rows together.** The obligation that was obeyed had **no `MUST` anywhere in
the prompt**. The one that was violated had a `MUST` *and* a discriminator *and* a worked negative
example, in an injected protocol the agent demonstrably loads.

> **So FORCE is not the binding mechanism. TRIGGER + SUBSTITUTE is.**
> **"Write `MUST` everywhere" is the remedy this evidence does NOT support** — the `MUST` was
> already there.

Hedged force is an **aggravator**, not the cause: obligation B was stated *twice within one entry*
with divergent force — a MUST and a "prefer" — and **the nearest, role-voiced restatement was the
hedged one**. Two statements of one rule is a split-source at sentence scale; when they disagree
about strength, the weaker and closer one is what gets obeyed.

⚠️ **The trap is the bulk pass.** When one rule is the proof case and gets the careful treatment,
the rest get a batch edit — and at least one will lack a trigger while *looking* fine, because it
carries a MUST. **Audit for trigger and substitute**, not for strength.

⚠️ **Preserve genuine exceptions while you do it.** Obligation B has a real carve-out: a mechanical
check is impossible where post-change state cannot be witnessed before the run. Strengthening it
into a blanket rule would make a *correct* section fail — a false block is not the safe direction,
it is a different defect. Bound the exception instead: *"merely tedious, multi-step, or one you have
not yet thought of a command for is NOT unwitnessable"*, and require the agent to state the REASON,
so a reviewer judges a stated reason rather than an unstated one.

---

## Canonical example — `requirements-authoring-protocol` (2026-09-21)

Template (public repo) → `--skeleton` strips author-addressed blocks → vendored
`scripts/seed-data/requirements-skeleton.tmpl` → `readFileSync` at seed → protocol body. The
canonical **writing rules live in a SIBLING FILE** (`_TEMPLATE/writing-rules.md`), reach **no agent
surface at all**, and are spliced into the finished product at publish time: the Author emits
`<!-- WRITING-RULES -->` and a human runs `--insert`.

⚠️ **Sizes are deliberately not written here.** They moved on the first maintenance pass and an
exact literal rots as a direct consequence of healthy work (CLAUDE.md's floors rule). Re-measure:

```bash
# template / skeleton / rules / protocol-body sizes, all four, current
wc -c ~/paichart/program-artifacts/_TEMPLATE/requirements.template.md \
      ~/paichart/program-artifacts/_TEMPLATE/writing-rules.md \
      scripts/seed-data/requirements-skeleton.tmpl
```
At 2026-09-22 (protocol v1.0.1) that was template 383 lines / skeleton 287 lines — **25% stripped** —
and a 37,310-char protocol body carrying a 20,115-char skeleton, with 20,193 chars of rules reaching
no agent.

**Live result**: marker emitted, **zero rules text leaked** — a rule that had failed **3 of 4**
hand-run tests passed on its first live outing.

---

## Maintaining a baked artifact — the chain an edit MUST complete

The pattern above is a design-time decision. This section is what it costs afterwards, and it was
written from executing the chain (2026-09-22) rather than from theory — the first template edit
after the pattern shipped found none of it documented.

**A baked artifact is protocol CONTENT.** The skeleton is not fetched at run time; it is read at
seed time and becomes literal text inside the protocol body. So editing the template is editing the
protocol, and every consequence follows from that one fact.

| # | step | why it is not optional |
|---|---|---|
| 1 | edit the **source template** (public repo) | the vendored copy is generated; editing it directly is overwritten by step 2 and the parity test will say so |
| 2 | regenerate the vendored skeleton — `python3 ~/paichart/scripts/requirements-rules.py --skeleton > scripts/seed-data/requirements-skeleton.tmpl` | the seed reads the VENDORED file, not the template |
| 3 | `npm run test:requirements-skeleton-parity` | proves the vendored copy is byte-identical to a fresh emit, and re-checks the invariants (no author-addressed blocks, no generic placeholders, no front matter, NFKC-stable, the three-way marker pin, and the canonical rules file) |
| 4 | **bump the protocol version** in `scripts/seed-protocol-prompts.ts` | the protocol's text changed; a content change under an unchanged version is how a consumer concludes nothing moved |
| 5 | local reseed — `npx ts-node --transpile-only scripts/seed-protocol-prompts.ts` | the DB row is the source of truth for the public render, and the render script FAILS if the seed file is newer than the row |
| 6 | re-render the public mirror — `npx ts-node --transpile-only scripts/render-public-protocols.ts` | the mirror is published and customer-facing; it goes stale silently, and `test:protocol-public-parity` is out-of-CI so nothing else catches it |
| 7 | `npm run test:protocol-dependence-anchors` + `npm run test:protocol-stamp-guards` | textual dependences between base and delta are pinned; a skeleton edit can cross one |

**Prod needs no manual step** — `blue-green-deploy.sh` runs `npm run seed:protocols` on every
deploy. Protocols are the *one* thing the deploy seeds; templates and services stay manual, which
is the asymmetry `report:template-freshness` exists to measure.

### The failure mode this section exists to prevent

Not a broken build — **a correction that gets lost**. On 2026-09-22 a defect was found in a
published spec's header, fixed by hand in that artifact, and then reproduced verbatim the next time
a document was generated, because the fix lived in the product and not in the carrier. The same day,
an NFKC sweep of the template missed the sibling rules file and shipped four rewritable codepoints
into every document the splice touched.

**Both have the same shape: the fix landed on the instance, not on the thing that produces
instances.** When a baked artifact produces a defect, the question is never "which file do I patch"
— it is *which of the three surfaces produces this, and does my fix reach the next generation?*

### What is NOT covered by any of the above

The **splice-time** half. `writing-rules.md` is not baked, not seeded and not version-pinned: an
edit to it reaches every subsequently published document with no version bump and no reseed, and
`--check` will then report older published documents as divergent-from-canonical — correctly, and
with no mechanism that tells you which. If that file starts changing often, it needs its own
version line before it needs anything else.

## When NOT to use this

- **The artifact does not need to be verbatim.** If semantic delivery suffices, role guidance is
  simpler and has no cross-repo pin.
- **The artifact is per-run data**, not a stable reference. This bakes at seed time; anything that
  varies per execution belongs in the task's own channels.
- **You would be the second copy.** If the content already exists verbatim in N protocols, adding an
  N+1st is a duplication problem, not a delivery problem.
- **It is large enough to move published cost numbers.** Protocol bodies are the prompt preamble;
  measured production range is ~24–60 KB, and an edit silently changes the published
  cache-cost figures. Re-measure if you approach the top of that range.

---

## 🟢 Known gap — VALIDATED 2026-09-22 (one run), with a partial finding

**A rule the agent never sees is a rule the agent can violate.** In the canonical example the rules
text is (correctly) withheld, and the live run then produced a document violating writing-rule 5
(*"write properties, not hardcoded values"*) — it hardcoded a derived value **33 times** where the
human-authored reference contains it zero times and specifies the derivation.

**Transcription fidelity was bought with a compliance gap.** Both halves are real.

**Discharged 2026-09-22 (F-V3-1)** by doing step 1's OBLIGATIONS row properly: all 15 rules audited
with the discriminator above, 12 obligations written into role guidance in the role's own voice.
The artifact's rules text was **not** put back into the protocol — that would rebuild the
transcription surface this pattern removes.

✅ **VALIDATED by re-run, and in the form that was owed**: the derived value went **33 occurrences
→ 0**, and the SUBSTITUTE appeared in its place (`derivation` ×13, `recompute` ×3). Absence alone
would only have meant the document got vaguer; the substitute is what shows the obligation landed.

⚠️ **One run, fresh inputs, non-deterministic model — this reads as *the defect did not recur under
the new guidance*, never as *the guidance prevents the defect*.** The distinction is worth keeping:
it is the difference between evidence and a guarantee.

🔴 **The same run showed the fix was PARTIAL, and that is the more useful half.** A second obligation
moved in the same batch was violated on 2 of 4 sections — the one written as a *preference* rather
than an obligation (see the force/trigger/substitute table above). **The obligations split is the
only part of this pattern that cannot be checked mechanically, so it is the part most likely to be
done shallowly — and a bulk pass over the non-proof-case rules is exactly how that happens.**

Record: `cline_docs/follow-ups/requirements-generator-v3-fixes-2026-09-21.md` ·
`cline_docs/reviews/requirements-generator-v3-2026-09-21/RESULT.md`.

---

## Common pitfalls

- **Assuming the strip rule covers everything addressed to the author.** A source document's *front
  matter* is author-addressed but often sits outside any block its own rule can see. Live instance:
  a generated spec opened by telling its reader to *"replace every `{{PLACEHOLDER}}`"* (F-V3-2).
- **Generic placeholder tokens.** `{{...}}` / `{{PLACEHOLDER}}` are instructions *about* slots, not
  slots. If the source says "the authoritative list is the placeholders", an unnamed token cannot be
  on that list. Both live defects caught by this pin were this shape.
- **Trusting `tsc -p tsconfig.json` over the seed path.** Where `scripts/**` is excluded from the
  project typecheck, the project check **fails open** and the ts-node seed invocation **fails
  closed**. Do not "strengthen" with a CI typecheck that is blind; do not add `--transpile-only`.
- **Raw backticks / `${}` in text added to a protocol or role-guidance template literal.** Escape
  them; the seed path typechecks and will catch it, but only if you run it.
- **Forgetting the manual reseed.** Protocols auto-reseed on deploy; **role guidance does not.** A
  correct fix can sit in the library while agents run the old text.
