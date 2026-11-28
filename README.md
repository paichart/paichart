# pAIchart — a high-level design in, a reviewed change package out

[![License: Elastic 2.0](https://img.shields.io/badge/license-Elastic--2.0-blue.svg)](LICENSE)

You describe an infrastructure change in a short requirements file. pAIchart turns it into a **program**: a graph of specialist AI
agents that read your current configuration, work out the change, write it as exact edits, and review it. You get back a change
package with the commands that prove it worked and a rollback. People approve at each gate, and your team applies the package.
**pAIchart never applies a change.**

It covers network devices, Terraform, Kubernetes and observability stacks (Prometheus / Grafana / OpenTelemetry), and reaches
your systems read-only through an open MCP hub.

## Start here

**Watch:** [what pAIchart does](https://www.youtube.com/watch?v=JZ_MSWYvOnc) (6 min) ·
[install it and run your first program](https://www.youtube.com/watch?v=ytUNK9_xPwQ) (18 min).

**Install, the way we recommend: let Claude Code do it from inside the repository.** The repository ships a prepared `CLAUDE.md`
and two agents, so the same Claude session that installs pAIchart can then launch your first program, explain each approval gate
and read you the result.

```bash
git clone https://github.com/paichart/paichart.git ~/paichart && cd ~/paichart
curl -fsSL https://claude.ai/install.sh | bash     # Claude Code, if you do not have it
claude
```

Then say: *"Follow docs/INSTALL.md from step 3, exactly as written. Stop after step 5 and tell me the printed password."*
A few steps are yours, in a browser (your account, your API key). When the install is done, say:
*"Follow docs/FIRST-RUN.md section 2."*

**You need:** an Ubuntu 24.04 machine with about 16 GB RAM, an Anthropic API key (the first run costs about USD 6), a Claude
account that can use Claude Code, and a GitHub account. **About an hour**, most of it the agents working.
The full guide is [docs/INSTALL.md](docs/INSTALL.md); it also has the manual route, command by command.

**Just want to look?** Sign in at [paichart.app](https://paichart.app) and browse finished program runs: every task, the agent
that ran it, the gates a person released and the result. A first sign-in is a read-only demo account
([what it holds](PRIVACY-DEMO.md)).

## Programs: a graph of agents

A **program** is one change, worked by several pipelines called **legs**. Each leg is four agents in a row:

**read** the current state → **design** the change → **write** it as edits → **review** it

```
                    ┌──▶ [firewall leg] ──┐
[network leg] ──────┼──▶ [cloud leg] ─────┼──▶ [final review] ──▶ release
                    └──▶ [k8s leg] ───────┘
   works out a value                         checks every leg against
   the others need                           one shared contract
```

- **Value legs and change legs.** A value leg works out something other legs need, such as a free address range, and changes
  nothing. A change leg writes a change package. Legs with no link between them run in parallel; a link forces order and hands
  the real value forward.
- **The plan and the contract.** A planning agent reads your requirements and draws this graph, with a contract that says what
  each leg must hand the next. Nothing runs until a person approves the plan.
- **Gates.** A gate is a point where the program waits for a person: on the plan, on a value, on a change. The agents are never
  asked to pass a gate. You release it from your AI client or the web app.
- **A final review** checks all the legs together against the contract before anything is called releasable.
- **Every step is a task you can open.** The graph is stored as ordinary tasks in a project, so each agent's input, output and
  checks stay browsable after the run. (In graph terms a program is a directed acyclic graph, a DAG, of reviewed changes.)

More: [programs](docs/PROGRAMS.md) · [pipelines](docs/PIPELINES.md) · [gates](docs/GATES.md) ·
[a whole program, step by step](docs/walkthroughs/PROGRAM-WALKTHROUGH.md) · [glossary](docs/GLOSSARY.md)

## Who says it is safe

Three tiers check a package, and a lower tier cannot be overruled by a higher one.

1. **Arithmetic, in code.** Where a value can be checked mechanically, the platform's own code checks it against what was read
   from your systems: is a derived address range exactly its declared members, is an AS number one your devices already run.
   A check that could not run counts as a block, never as a pass.
2. **Independent reviewers.** One reviewing agent per leg, and one across all legs against the shared contract.
3. **The release rule.** A fixed AND: every leg approved, no arithmetic violation, every unchecked value explained, the final
   review approved, every declared source read. No confidence score is in it.

**We publish the rounds we failed.** The [verification pack](verification/) holds 33 documents, each stating what it expected
before the run and recording what happened. Among them:

- a program that declared itself releasable while widening an authorization. Five checks passed it, so that property is now
  checked in code;
- two identical review runs that scored 45 and 92 on the same input. Confidence is now a recorded fact, not a pass mark;
- three correct packages refused because a reviewer judged something it could not see. The comparison is now computed by the
  platform and handed to the reviewer.

## What it works on

| Domain | You ask for | Read through | More |
|---|---|---|---|
| **Network devices** | "add a loopback per switch and advertise it into BGP" | your Git files, or a read-only device service | [service](docs/NETWORK-SERVICE.md) · [walkthrough](docs/walkthroughs/NETWORK-LEG-WALKTHROUGH.md) · [example](examples/network-provisioning-change-report.md) |
| **Kubernetes** | "let a new client reach this service" | your manifests in Git, and a read-only cluster service | [service](docs/KUBERNETES-SERVICE.md) · [walkthrough](docs/walkthroughs/K8S-LEG-WALKTHROUGH.md) · [example](examples/kubernetes-gitops-change-report.md) |
| **Terraform** | "add versioning and a public-access block to this bucket" | the `.tf` files you declare; state only if you declare it | [service](docs/TERRAFORM-SERVICE.md) · [walkthrough](docs/walkthroughs/TERRAFORM-LEG-WALKTHROUGH.md) · [example](examples/terraform-iac-change-report.md) |
| **Observability** | "restrict which senders may export telemetry" | your config files in Git, and a read-only stack service | [service](docs/OBSERVABILITY-SERVICE.md) · [walkthrough](docs/walkthroughs/OBSERVABILITY-LEG-WALKTHROUGH.md) · [example](examples/observability-config-change-report.md) |

In every domain the result is a change package, never an applied change. Ready-made programs to run or copy are in
[`paichart/paichart-configs`](https://github.com/paichart/paichart-configs); to write your own, see
[writing a spec](docs/WRITING-A-SPEC.md).

## Reaching your systems: the MCP hub

- **Read-only, through services you run.** pAIchart stores no device, cluster or cloud credentials.
- **Every call runs as you.** Each person has their own account and key; there is no shared platform account.
- **An open registry.** Register any MCP service, find services by what they do, and chain them into workflows.
- **Any capable AI client can drive it:** Claude Code, Claude Desktop, ChatGPT, or the web app.

More: [connecting your services](docs/CONNECTING-YOUR-SERVICES.md) · [security](docs/SECURITY.md) ·
[service descriptors](descriptors/SPEC.md)

## Documentation and links

- **All documentation, by what you are doing:** [docs/README.md](docs/README.md)
- **After installing:** [operating](docs/OPERATING.md) · [reading a run](docs/READING-A-RUN.md) ·
  [troubleshooting a run](docs/TROUBLESHOOTING-A-RUN.md)
- **How it is built:** [how it works](docs/HOW-IT-WORKS.md) · [running it](docs/RUNNING.md) ·
  [the agents' instructions](scripts/seed-protocol-prompts.ts), exactly as the agents receive them
- **Case studies:** [checked by machine](case-studies/coordinated-infra-change.md) ·
  [you approve, you don't author](case-studies/you-approve-you-dont-author.md) ·
  [inside a multi-domain program](case-studies/inside-a-multi-domain-program.md)
- **For researchers:** [open questions](verification/OPEN-QUESTIONS.md) ·
  [`@paichart/containment-checks`](packages/containment-checks/), the arithmetic checks as an MIT library
- **Hosted demo:** [paichart.app](https://paichart.app) · **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md) ·
  **Security:** [SECURITY.md](SECURITY.md)

## Licence and credits

Source-available under the **Elastic License 2.0**: use it, modify it, self-host it, including commercially inside your own
organisation, and redistribute it. The one thing you may not do is offer it to third parties as a hosted or managed service.
The hosted service at paichart.app runs this same code.

The network lab's device service uses [Nornir](https://github.com/nornir-automation/nornir) and
[NAPALM](https://github.com/napalm-automation/napalm). Until 2026-11-26 it was built on `nornir-mcp-server` by Syed Asif (MIT
licence); that project is no longer published, and the service is now pAIchart's own.

`mcp` `mcp-hub` `model-context-protocol` `multi-agent-orchestration` `dag` `network-automation` `netdevops` `kubernetes`
`gitops` `terraform` `infrastructure-as-code` `observability` `change-management` `human-in-the-loop` `low-level-design`
