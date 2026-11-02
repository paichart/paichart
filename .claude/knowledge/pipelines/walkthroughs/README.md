# Run walkthroughs — what a program run used and produced, stop by stop

**Audience:** someone preparing to demo or explain a run (a sales engineer, a customer's network or platform engineer). They have the GUI and
the repo, but not the internals.

**Shape:** every walkthrough uses the same stops. At each stop it gives:
- **where** to click;
- **what you see**;
- **what it means**;
- a **key takeaway** (one line you can say to a customer);
- what the platform recorded on top (the "facts").

Each walks one real run as its worked example, so every number can be checked. Internals are named only where a demo needs them.

**Worked example:** the kept-file telemetry program, root `cmvr9hd78000uyxvn32ctl8xc`, POV "Telemetry Export Authorisation — Kept Files"
(2026-10-27/28). Records: `cline_docs/reviews/telemetry-held-program-2026-10-28/` (RUN-SHEET.md has every number). Demo prep list:
`cline_docs/follow-ups/kept-file-program-demo-prep-2026-10-28.md`.

| Walkthrough | Covers | Status |
|---|---|---|
| `PROGRAM-WALKTHROUGH.md` | requirements.md, the program task (3 runs), Program Architect and plan, gates, the value leg, producer, Node C, program synthesis and the release AND; leg task vs the agents inside it | done (draft 2026-10-28) |
| `K8S-LEG-WALKTHROUGH.md` | the kubernetes-gitops leg: harness, Harvester, Architect, Author, Reviewer, leg synthesis | done (draft 2026-10-28) |
| `TERRAFORM-LEG-WALKTHROUGH.md` | the terraform-iac leg (state never held, planted artifacts and injection, plan-based validation) | done (draft 2026-10-28) |
| `OBSERVABILITY-LEG-WALKTHROUGH.md` | the observability-config leg (service-held files, not Git; existing grant replaced; a non-blocking warning) | done (draft 2026-10-28) |
| `NETWORK-LEG-WALKTHROUGH.md` | the network legs: A. value (derivation, arithmetic, containment); B. change (Device sources, Git and device bases, redaction, apply procedure, forced outcomes, Git-vs-device comparison) | done (draft 2026-10-28) |

**Start here for the idea underneath every tour:** `READING-A-RUN.md` — facts versus verdicts, the list of signals a run records (what each proves and cannot prove), how a release is composed, the hand-read checklist, and what nothing checks.

**Companion guides (the reference, not the tour):** `../PIPELINE-HARNESS-USER-GUIDE.md` (how to run, read results, forced outcomes, applying
a kept-file package) · `../PROGRAM-HARNESS-USER-GUIDE.md` · `../PIPELINE-RUN-FORENSICS-GUIDE.md` / `../PROGRAM-RUN-FORENSICS-GUIDE.md` (how to
investigate a run from its stored records).
