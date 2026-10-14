# work/ — one folder per objective run, plus the skill's register

**`REGISTER.md`** (this folder, not per run) is where the skill files generator defects, waivers and outcomes. If it
is missing, recreate it with a header saying what it holds, that the open register indexes it, and the entry format
(`- [ ] <ID> (<run folder>, <date>) <what> — <evidence> — <Reviewer CAUGHT|MISSED|n/a> — <what closes it>`).


Name: `<objective-slug>-<YYYY-MM-DD>/` (e.g. `log-archive-podrange-2026-10-12/`). Inside, as the skill writes them:

| file | what | committed |
|---|---|---|
| `objective-zero.txt` | the zero-decision objective (goal, DRAFT line, descriptors, scope rule — no decisions) | yes |
| `draft-zero/` | `fetch` output of the zero-decision generation (report.md, objective.txt, run-summary.tsv) | yes |
| `coverage-zero.txt` | the coverage-check output, and what was filed from it | yes |
| `answers.md` | the owner's answers: `### Group X` numbered items + `<!-- ROW-ITEM-MAP -->` — **the owner's record** | yes |
| `objective-answered.txt` | `build-answered-objective.py` output | yes |
| `draft-answered/` | `fetch` output of the regeneration | yes |
| `gates.txt` | coverage + citation output on the regenerated draft | yes |
| `waiver.md` | only if the owner waived write-up slips (named, dated) | yes |
| `notes.md` | deviations found, filings, the §2 human read, decisions and who made them | yes |

Never put credentials here. Harvested state appears only inside `draft-*/` (the generator's own output, kept as evidence)
— never in an objective or answers file.

Exception to the knowledge-base rule that session artifacts live in `cline_docs/`: Steve asked for the skill packaged as
one directory including its working folder (2026-10-08).
