# pAIchart documentation

Everything you need to install, run and operate pAIchart starts on this page. Pick the heading that matches what you are doing.

The `.claude/` directory is the knowledge base the Claude agents use to maintain the code. You do not need it to install or run
pAIchart; the documents you do need from it are linked below.

## Install

| Document | What it gives you |
|---|---|
| [INSTALL.md](INSTALL.md) | Every command, in order, from a bare Ubuntu 24.04 machine to Claude Code talking to your own pAIchart. About 40 minutes. |
| [FIRST-RUN.md](FIRST-RUN.md) | See a finished run, run the same one on your install with nothing but the configs repository, then a bigger example. |
| [RUNNING.md](RUNNING.md) | What each install step does and why: the two processes, roles, `APP_BASE_URL`, production notes. |
| [VERIFYING-SELF-HOST.md](VERIFYING-SELF-HOST.md) | Checks that prove your install owns its identity: every token and OAuth document comes from your own `APP_BASE_URL`. |

## See a run before you run one

Sign in at [paichart.app](https://paichart.app). A Claude client signs in with GitHub; a ChatGPT client signs in with Microsoft. A
first sign-in has demo access, which is read-only. Open **Dashboard > Projects** and open **Fabric Telemetry Expansion**: a completed
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
| [Operator runbook](../.claude/knowledge/pipelines/OPERATOR-RUNBOOK.md) | Run a program from start to finish: launch, check the plan, release gates, read the result. |
| [Gate playbook](../.claude/knowledge/pipelines/PROGRAM-OPERATOR-GATE-PLAYBOOK.md) | What to check before you release each kind of gate, and what a refusal means. |
| [Program guide](../.claude/knowledge/pipelines/PROGRAM-HARNESS-USER-GUIDE.md) | Programs: several pipelines coordinated as one change, with values passed between them. |
| [Pipeline guide](../.claude/knowledge/pipelines/PIPELINE-HARNESS-USER-GUIDE.md) | A single pipeline: harvest, design, author, review. |
| [Reading a run](../.claude/knowledge/pipelines/walkthroughs/READING-A-RUN.md) | How to read a completed run and decide whether to trust it. |
| [Walkthroughs](../.claude/knowledge/pipelines/walkthroughs/README.md) | One guided tour per domain (network, Kubernetes, Terraform, observability) and one of a whole program. |

## Write a spec

| Document | What it gives you |
|---|---|
| [Program spec checklist](../.claude/knowledge/pipelines/PROGRAM-SPEC-CHECKLIST.md) | What a hand-written `requirements.md` must answer, and the checks to run on it before a launch. |
| [paichart-configs](https://github.com/paichart/paichart-configs) | The configuration files of record and the released use cases; copy the shape of one. |
| [Use cases](../usecases/README.md) | The lab environments and use cases that ship in this repository. |

## Contribute and extend

| Document | What it gives you |
|---|---|
| [CONTRIBUTING.md](../CONTRIBUTING.md) · [SECURITY.md](../SECURITY.md) | How to contribute, and how to report a vulnerability. |
| [CLAUDE.md](../CLAUDE.md) | How Claude Code works in this repository: the specialist agents, protocols and commands. |
| [Add a pipeline domain](../.claude/knowledge/pipelines/ADD-A-PIPELINE-HARNESS-AGENT.md) | The procedure for a new domain or specialist agent. |
| [Design a pipeline use case](../.claude/knowledge/pipelines/PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md) · [Design a program](../.claude/knowledge/pipelines/PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md) | From "could pAIchart do this?" to a validated use case. |
| [Pattern registry](../.claude/knowledge/patterns/PATTERN-REGISTRY.md) | The implementation patterns the code follows. |
| [Descriptor spec](../descriptors/SPEC.md) | How a service you host is described to the hub. |

## Published as-is

- [Verification pack](../verification/README.md) — what each claim was tested against, including the rounds that failed.
- [Protocols](../protocols/README.md) — the agent-facing contracts, published verbatim.
- [Examples](../examples/README.md) — change reports the pipelines produced.
- [Case studies](../case-studies/README.md) · [Tutorials](../tutorials/README.md)
- [Demo privacy statement](../PRIVACY-DEMO.md)
