# pAIchart documentation

Everything you need to install, run and operate pAIchart starts on this page. Pick the heading that matches what you are doing.
A word you do not know: [GLOSSARY.md](GLOSSARY.md).

The `.claude/` directory holds two agents for Claude Code and the maintainers' development method (protocols and patterns). You do
not need it to install or run pAIchart.

## Install

| Document | What it gives you |
|---|---|
| [INSTALL.md](INSTALL.md) | Every command, in order, from a bare Ubuntu 24.04 machine to Claude Code talking to your own pAIchart. About an hour. |
| [FIRST-RUN.md](FIRST-RUN.md) | See a finished run, run the same one on your install with nothing but the configs repository, then a bigger example. |
| [RUNNING.md](RUNNING.md) | Reference for how pAIchart runs: the two processes, roles, `APP_BASE_URL`, registering services on your own network, production notes — and a short development-mode quick start. |
| [VERIFYING-SELF-HOST.md](VERIFYING-SELF-HOST.md) | Checks that prove your install owns its identity: every token and OAuth document comes from your own `APP_BASE_URL`. |

## See a run before you run one

Sign in at [paichart.app](https://paichart.app). A Claude client signs in with GitHub; a ChatGPT client signs in with Microsoft. A
first sign-in is a demo account: you can browse the demo projects and use any public MCP service. Until the account is promoted
to a standard user, you cannot create or edit projects or run agents. Choose **Explore Dashboard**, then **Projects** in the left sidebar, and open **Fabric Telemetry Expansion**: a completed
program in which one pipeline works out a free address and a second writes the switch change that uses it. It is the same use case
you can run on your own install: [FIRST-RUN.md](FIRST-RUN.md) gives every call. It is
[`loopback-ceos2/git-only`](https://github.com/paichart/paichart-configs/tree/main/usecases/loopback-ceos2) in the configs
repository, and needs nothing but the files in that repository.

## Administer

| Document | What it gives you |
|---|---|
| [OAUTH-SETUP.md](OAUTH-SETUP.md) | Register your own GitHub, Google or Microsoft sign-in apps. Optional: password sign-in works without them. |
| [SELF-HOST-KEPT-FILES.md](SELF-HOST-KEPT-FILES.md) | How pAIchart reads configuration files from your Git repository, keeps their exact bytes, and changes them only by edits. |
| [INSTALL.md, step 9](INSTALL.md#9-your-first-external-service--a-remote-mcp-server-through-the-hub) | Connect your own services to the hub: a remote MCP server, the browser service, the GitHub file source. |
| [systemd/](systemd/) | The two service units the install guide uses to keep pAIchart running across reboots. |

## Operate

| Document | What it gives you |
|---|---|
| [Operator runbook](OPERATING.md) | Run a program from start to finish: launch, check the plan, release gates, read the result. |
| [Gates](GATES.md) | What to check before you release each kind of gate, and how to apply a change package. |
| [Connecting your own services](CONNECTING-YOUR-SERVICES.md) | Register your team's device, Git and cloud services, share them, and name them in a task or a spec. |
| [How a pipeline works](HOW-IT-WORKS.md) | A short account of how one pipeline runs, what cannot go wrong by construction, and what you can change without code. |
| [Security](SECURITY.md) | What protects a run, the two output guards you control, and the security properties of agents handing work to each other. |
| [Program shapes](PROGRAM-SHAPES.md) | Which shape of program suits which change: one leg, parallel legs, sequenced legs, grouped legs. |
| [Designing a program](design/DESIGNING-A-PROGRAM.md) | The procedure for turning a multi-system objective into a program, from the domains that exist. |
| [Firewall policy use case](design/FIREWALL-POLICY-USE-CASE.md) | A worked decision: one pipeline, parallel legs or sequenced legs for a change across several devices. |
| [Programs](PROGRAMS.md) | Reference on programs: several pipelines coordinated as one change, with values passed between them. |
| [Pipelines](PIPELINES.md) | Reference on a single pipeline: kept files, writing a task, where each device's configuration is read from, reading a result. |
| [Reading a run](READING-A-RUN.md) | How to read a completed run and decide whether to trust it. |
| [Troubleshooting a run](TROUBLESHOOTING-A-RUN.md) | A run has stopped, or you cannot tell whether it has: where it is, why, and what to do. |
| [GLOSSARY.md](GLOSSARY.md) | Every term these documents use, in plain words. |
| [Walkthroughs](walkthroughs/README.md) | One guided tour per domain (network, Kubernetes, Terraform, observability) and one of a whole program. |

## Two agents that help (Claude Code)

| Agent | What it does |
|---|---|
| `paichart-operator` | Runs a program with you: launches it, explains each gate and what to check, reads the result, and diagnoses a run that has stopped. |
| `paichart-spec-writer` | Works through the spec checklist with you and writes `requirements.md` and `topology.json` for a change of your own. It never decides for you and never launches a run. |

They are in the clone's `.claude/agents/`. To use them from any directory: `mkdir -p ~/.claude/agents && cp ~/paichart/.claude/agents/paichart-*.md ~/.claude/agents/`, then start Claude Code and say, for example, *"use the paichart-operator agent: where is my run?"*

## Write a spec

| Document | What it gives you |
|---|---|
| [Program spec checklist](WRITING-A-SPEC.md) | What a hand-written `requirements.md` must answer, and the checks to run on it before a launch. |
| [paichart-configs](https://github.com/paichart/paichart-configs) | The configuration files of record and the released use cases; copy the shape of one. |
| [Use cases](../usecases/README.md) | The lab environments and use cases that ship in this repository. |

## Contribute and extend

| Document | What it gives you |
|---|---|
| [CONTRIBUTING.md](../CONTRIBUTING.md) · [SECURITY.md](../SECURITY.md) | How to contribute, and how to report a vulnerability. |
| [CLAUDE.md](../CLAUDE.md) | How Claude Code is told to work in this repository, and the development commands. |
| [Protocols](../.claude/knowledge/protocols/) | How this code is developed: when a change needs review, how to sweep it, how to test it. They name agents and records the maintainers keep privately. |
| [Design a program](design/DESIGNING-A-PROGRAM.md) | From "could pAIchart do this?" to a validated use case. |
| [Pattern registry](../.claude/knowledge/patterns/PATTERN-REGISTRY.md) | The implementation patterns the code follows. |
| [Descriptor spec](../descriptors/SPEC.md) | How a service you host is described to the hub. |

## Published as-is

- [Verification pack](../verification/README.md) — what each claim was tested against, including the rounds that failed.
- [Protocols](../scripts/seed-protocol-prompts.ts) — the agent-facing contracts are in the platform seed script, exactly as the agents receive them.
- [Examples](../examples/README.md) — change reports the pipelines produced.
- [Case studies](../case-studies/README.md)
- [Academic project briefs](../academic/README.md) — project proposals offered to universities and their students.
- [Demo privacy statement](../PRIVACY-DEMO.md)
