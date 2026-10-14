# /requirements-spec — step by step (the plain-English guide)

You need: Claude Code open in `~/copov15`, the lab rigs up, and about an hour across two waits.
Claude does the work; you do four kinds of thing — **say OK**, **answer questions**, **check**, and **wait**.
Nothing reaches production or the public repo without you saying yes.

---

## Before you start (5 minutes)

1. **Which systems?** Decide which systems your objective touches. Each one is reached through a read-only
   *descriptor* (a file in `~/paichart/descriptors/`: cluster, observability stack, network devices, Terraform, …).
   Name them in your opening line, or let Claude list them and pick with you — it will not pick silently.
2. **Are they up — and connected the way the objective needs?** Ask Claude for a read-only pre-flight on THOSE
   systems. Expect: the services answer, no leftover rig services in the registry, nothing running. If the objective
   relies on something the services cannot show (for example, that one system can reach another, or that addresses
   arrive untranslated), **you** confirm it — Claude records it as your premise. (2026-10-11: an objective passed the
   fit check on paper while no path existed between its two systems.)
3. **Where will it run?** Claude creates a POV for the objective with two phases — **Requirements** (where the spec
   is generated) and **Program** (where the program later runs) — or tell it which existing POV to use. You start as
   the only team member; Claude offers to add your named approvers right after you answer Group B.
4. **Who's on the team?** Add the people who will approve (or stand in for approvers) to the POV before the
   questions about approvers, and pick a project manager. Claude can do it for you with your "yes".
5. **Cost:** about $2–3 per generation; expect two (plus one if it needs regenerating). The program run that USES
   the spec is separate and later.

---

## Will this work for my objective? (check first — 2 minutes)

**Why this check exists:** the process turns your objective into questions whose answers can be checked from what the
program's legs read. If that isn't possible, a generated spec would *look* answered without being checkable — so a
person writes the requirements.md by hand instead. Claude runs this check before anything else and stops if it fails.

| works | does not work → a human architect writes the spec |
|---|---|
| **Restrict**: "only these pods may write to this bucket" — the bucket's own policy shows the answer | **Grant only**: "also let these pods write" — who else can write depends on things no leg reads, so "nothing wider" can't be checked |
| Targets you can **name** (this namespace, this bucket) | "every bucket", "whatever needs access" |
| Members picked by a **rule** ("pods in phase Running") | a hand-picked or judgement list |
| Changing **existing** policies, deriving values — on systems that actually have them, connected as the objective needs | designing new infrastructure first (an endpoint, a role, a network path) |

Learned on the 2026-10-09 trial: the grant version could not be made checkable; the restrict version could, and passed.

## The steps

**Step 1 — Start it.** Type `/requirements-spec` and your objective in one or two plain sentences:
what must be achieved, which systems (their descriptors — or let Claude list them), what "nothing wider" means. Use
your own verb (*restrict*, *grant*, *remove*): Claude carries it word for word. **No design decisions. No current values**
(no addresses, names, counts) — the flow asks the decisions, and current values are harvested.

**Step 2 — Check the draft objective.** Claude reads the three procedures, then shows you a *zero-decision objective*.
Check two things: it states the goal, the descriptors and the harvest scope; it decides nothing and contains no current
values. Reply **"ok"** or tell it what to change.

**Step 3 — Say yes to the launch.** Claude shows the new POV (Requirements + Program phases) and the first
launch together — or uses the POV you name. Reply **"yes"**.

**Step 4 — Wait** (~10–15 min). Say **"check"** now and then. When it finishes, Claude fetches the draft and runs the
**coverage check**. You'll see:
- *errors* — problems in the generator. Claude files them. **One kind still needs you:** an *unknown key* error is a
  question the Author added because the registry has no row for it (see *Why the draft asks things the registry
  doesn't*, below). Claude shows the row and its options. You either point it at an answer you have already given
  (*"item 4 covers it"*) or answer it as a new item. The options were written by the Author and are untested, so your
  real answer may be none of them (*"exclude"* was the answer to a row that offered only *gap* or *admit*).
- *read items* — e.g. "does this leg grant access / change routes / derive a value?". Answer **yes/no** for each leg.

**Step 5 — Answer the questions.** This is the main event. Claude shows ONE group at a time (A what to act on ·
B who approves and when · C who is admitted and what they may do · D how the change behaves · E side effects ·
F routing). Each row has a recommendation and **why**. Reply **"accept"** or change any row
(*"C: make it act-regardless"*). Claude writes each group down immediately — your answers are the record.
Each table keeps its cells short and gives every reason in full underneath, in plain words. Questions that affect each
other (for example *how requests reach the enforcer* and *what to do if that can't be confirmed*) come as ONE table:
*if you answer · what the program can do · likely outcome · recommendation* — ask **"why?"** whenever an outcome isn't clear.
Pasted replies are read back to you before they are recorded.
Before Group B, Claude shows the POV team and asks who else belongs on it and who is project manager; Group B then
offers the team as a pick list. Say whether each approver releases their own gate or you release it for them.

**Step 6 — Check the merged objective.** Claude merges your answers into the objective (a script refuses if any
question is unanswered) and shows it. Reply **"ok"**.
If the registry gained a question AFTER your zero-decision run (a new row, shipped later), Claude asks it as one more
numbered item and marks its row *added*, so the merge counts it as asked — no new zero-decision run is needed for that.

**Step 7 — Regenerate.** Claude shows the second launch; reply **"yes"**. **Wait** again; say **"check"**.

**Step 8 — Gates.** Claude runs the coverage check and the citation check on the new draft.
- Clean and APPROVED → carry on.
- NEEDS-REVISION on small write-up slips → Claude shows each one with the exact text. **You decide**: waive it (it
  changes nothing the program is told) or regenerate. Claude never decides a waiver.
- **Two READS that are never waivers** (since 2026-10-12): every *dropped-clause* flag is shown with the leg's text —
  you confirm it is a checker miss (it is named and recorded) or it is a real drop (regenerate). Each flag is read on
  its own words: the same item can be flagged again with different words, and that is a new read, not one you have
  already done. And if the Author's
  in-run correction was kept to fit the size limit, Claude shows what it removed from each leg, Approvals and
  Acceptance — you confirm no obligation was deleted. The publish tool will not go on until both are done.

**Step 9 — Your read.** Claude walks you through the human read: no current addresses, names or **counts** anywhere,
the worked example is made up, and the population matches your objective's words. Reply **"ok"** when satisfied.

**Step 10 — Publish.** Claude runs the publish pass (dry run first, then for real), then shows you the push to the
public repo. Reply **"yes"**. It then checks the published URLs until they answer and match.

**Step 11 — The program task (optional, can be later).** Claude shows the program task it would create from the
published spec, in the same POV's **Program** phase. Before it launches, Claude asks you to re-confirm, in words, any
premise you declared that the services cannot see (it never checks your infrastructure directly). Reply **"yes"** to
create it, or **"later"**.

---

## Why the draft asks things the registry doesn't
The registry (`DESIGN-DECISION-QUESTIONS.md`) is the list of questions every spec must answer. It is a floor, not a
ceiling: the Author is told to add a row for any further decision the spec relies on, so a zero-decision draft can ask
a question the registry has no key for. That is useful — it is how registry gaps are found (a question that keeps
coming back on objectives that have not answered it is admitted to the registry). Three things to know:
- **Two kinds.** Some re-ask something you already answered, under a new name — Claude points them at your item.
  Others ask a **new** decision your answers don't cover (2026-10-11: which proxy blocks count as sender endpoints) —
  those need your answer, and they are how the registry grows.
- **They vary between runs.** Two zero-decision runs of the same objective can add different rows, and name the
  gates differently. That is why Claude merges against one draft and records which.
- **Their options are untested.** Read the question, not just the menu.
- **In an answered draft they block.** A row your items do not cover is OPEN there, and the Reviewer will not approve.
  Covering it in your answers (step 5, or the step-4 note above) is what prevents that.

## Words that help
- **"check"** — how's the run going?
- **"accept"** — take the recommendation for this group.
- **"why?"** — show the evidence behind a recommendation.
- **"stop"** — stop before the next step; nothing is lost (everything is in `work/`).

## Things it will never do
Answer a design question for you · edit a spec by hand · waive a finding · push, launch or create anything without your
"yes" · put current values into the objective.

## If something looks wrong
Say so. Every file is in `.claude/skills/requirements-spec/work/<objective>-<date>/`, and a run can always be repeated.

---

## Worked examples — kept OUT of this folder on purpose

The skill reads this file, so anything here is something the skill knows. A worked example carries the
reference spec's answers, and a run that has read them proves nothing. Owner-side answer keys live under
`cline_docs/reviews/` and are **never** named to a skill session. Your opening line: what must be achieved,
which systems (descriptor URLs), "nothing wider" — and nothing else. Give the harvest scope only when asked.
