# Connecting an observability stack: what pAIchart reads, and what your service must offer

**For:** a platform or security team deciding whether to connect a monitoring stack (Prometheus, Grafana, an OpenTelemetry
collector and the ingress in front of it), and the engineer who runs the read-only service.

pAIchart helps you make a change to your observability configuration: for example, restricting which senders may export
telemetry, adding a processor to the collector, or adding a scrape job or an alerting rule. It reads what is deployed, works out
the change, has it reviewed, and gives you the exact file edits. **It never applies anything, and it never reloads a component.**
Your own process (your deployment pipeline, or a person) applies the change.

This page explains what it reads, what it never reads, how you name the service in a spec, and what the comparison between your
Git file and the deployed copy tells you. The `## Config sources` block it describes applies from observability-config 1.12.0.

## How pAIchart reaches your stack

pAIchart does not connect to Prometheus, Grafana or the collector directly and stores no monitoring credentials. It talks to a
small **read-only service that you run**, in your own environment. The service offers a fixed set of read tools and nothing
else: there is no reload, apply, write, delete or admin tool on it, and Prometheus's lifecycle endpoint is never passed through.
These tools do not exist on the service; they are not merely refused.

So there are two limits, and you own both:

- **What the service can reach:** the hard boundary. The reference service reads Grafana as a dedicated **Viewer** account, and
  reads the collector and ingress files from **read-only mounts**, at paths fixed when it is built. No caller can give it a URL
  or a path.
- **The service's own tool list:** a second layer. It exposes only the read tools listed below.

Our reference service, its stack and its descriptor are in the public repository: `usecases/observability-lab/` (the service
is `obs-mcp-readonly/`) and `descriptors/observability-readonly-descriptor.json`. Your platform team can read exactly what each
tool does.

## What it reads

| Tool | What it returns | Used for |
|---|---|---|
| `stack_health` | whether Prometheus, Grafana and the collector are up | a first check before anything else is read |
| `get_prometheus_config` | the **running** Prometheus configuration as the server reports it, and the path of its config file | understanding the scrape and rule setup. It is a rendering (comments removed, defaults filled in), not your file's bytes |
| `get_scrape_targets` | each active target's job, instance, health and last error | seeing what is scraped today |
| `get_rules` | the loaded recording and alerting rule groups | seeing which rules exist before adding one |
| `query_metric` | an instant PromQL query, at most 512 characters, at most 50 series back | checking a value the change depends on |
| `get_grafana_datasources` | the provisioned datasources, **with every credential-named field redacted** | knowing which datasources exist |
| `list_grafana_dashboards` | each dashboard's uid, title and folder | finding a dashboard |
| `get_grafana_dashboard` | one dashboard's JSON model, by uid | review evidence. Roll a dashboard back from your own file, not from this |
| `get_otel_config` | the collector's configuration **file as deployed** (the collector has no config API) | the base for a collector change |
| `get_ingress_config` | **every** ingress config file in front of the collector's receivers, together | the base for a change to which senders may export |

`get_ingress_config` takes no arguments: it always returns all the ingress files at once, and the service refuses a call that
passes any.

## What it never reads

- **Anything it was not built to read.** There is no tool that takes a path, a URL or a shell command.
- **Grafana credentials.** Datasource and dashboard payloads have every field whose name looks like a password, token, secret
  or key replaced before they leave the service.
- **Password and key files in Git** (since 2026-11-21). A file whose name contains `htpasswd`, ends `.key`, `.pem`, `.p12`,
  `.pfx`, `.jks` or `.keystore`, or is an SSH identity file is never read from your Git repository and never kept. If a line of
  the `## Config sources` block names one (for example `obs-ingress.htpasswd`), the block is unreadable and the leg ends
  `needs-revision` with the reason `config-sources-unparseable`. A config file whose text carries a private-key block is read
  but never kept, so a leg that declares it ends `needs-revision`.

**One thing the service does not scrub:** the Prometheus configuration is returned as Prometheus reports it. If your
`remote_write` or scrape settings carry credentials inline, they appear in that read. pAIchart masks credential-shaped values in
what it stores, but that is a coarse backstop. Reference secrets from files or the environment rather than writing them into
the config.

## How to keep the boundary tight

1. **Give the service its own Grafana account, with the Viewer role.** Do not reuse an admin login: Grafana forces the admin
   password to change at first sign-in, and a service holding it then fails mid-run.
2. **Mount the collector and ingress files read-only** into the service, and nothing else from the host.
3. **Keep the service on a private network** that only your pAIchart hub can reach.
4. **Prove it, rather than trusting the description.** List the service's tools from the hub (`services(action:'discover')`)
   and check that only the ten above are offered.

## Running the reference service

The lab in `usecases/observability-lab/` starts the stack and the service together with Docker Compose; its README gives the
commands, the two credentials it needs, and the bring-up checks. Once it is up:

- **Health:** call `stack_health`. Each component reads `up`, or `DOWN` with the reason. From the hub,
  `services(action:'health', service_name:'observability-readonly')` checks the service itself.
- **The descriptor:** the published descriptor at
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/observability-readonly-descriptor.json` points at a
  service on the same machine as the hub. To run yours elsewhere, copy the descriptor, set its `endpoint` to where your hub can
  reach your service, publish it where the hub can fetch it, and use that URL instead. Registered from a descriptor, the
  service's name is `observability-readonly`.

## How you name the service in a spec

A line that reads your stack names the service one of two ways ([Connecting your own services](CONNECTING-YOUR-SERVICES.md),
section 3):

- **One observability leg: give the descriptor URL.** The run registers the service from that URL, uses it, and removes the
  registration at its end. Register it no other way for that run: the platform cannot tie a hand registration to the line.
- **Two or more observability legs in one program: name the pre-registered service** by its registered name,
  `observability-readonly`, and give the spec's README a setup step: register the service once, from its descriptor URL,
  before launching, and remove it after the program ends. The reason: with a URL, each leg registers the service and deletes
  its own registration when it finishes, so the first leg to finish removes the service under a leg still running.

A released example of the second form: the `otlp-ingress-three-leg` use case
([`git-live/`](https://github.com/paichart/paichart-configs/tree/main/usecases/otlp-ingress-three-leg)) in the configs
repository, where three legs each change one file of the stack.

## What you tell pAIchart: the `## Config sources` block

The block is **optional**. A leg with no block keeps the collector and ingress files the service returns as deployed and edits
them by reference. With a block, the leg keeps **only** the files its lines name:

```
## Config sources
obs-otelcol: git-file — service github-service ; <owner>/<repo>/observability/otelcol/config.yaml
obs-otelcol: live-read — service https://<your host>/observability-readonly-descriptor.json
obs-ingress.otlp-ingress.conf: service-held — service https://<your host>/observability-readonly-descriptor.json
```

- **Each label names one file.** `obs-otelcol` is the collector's config; `obs-ingress.<file name>` is one file of the ingress
  (for example `obs-ingress.otlp-ingress.conf`). Any other label stops the leg. Prometheus config, targets, rules and dashboards
  are never declared: every leg reads them as before.
- **`git-file`** — the file in your Git repository. pAIchart keeps the exact bytes it read, and the change is written as edits
  to that copy. It must be in the repository your install's Git file source is pinned to.
- **`service-held`** — the file as your service returns it (as deployed), kept and edited by reference. Your service's copy is
  then the base, so use a service you govern.
- **`live-read`** — only under a `git-file` line of the same label: the served copy, read as evidence only. Nothing in the stack
  is edited.

There is no `supplied` line on an observability leg. A `git-file` line with no `live-read` line is Git-only for that file, and
the package says so.

**Several observability legs.** Every observability leg of a program reads and keeps every line of the program's shared block,
so put a file in it only if a leg needs it, and give each leg a title and objective that name the one file it changes. The
platform places a short read rule directly after the block in each observability Harvester's brief: a brief may limit what a
leg changes, never which declared lines it reads. More detail: [PIPELINES.md](PIPELINES.md), "Observability: kept files from Git
or from your service".

## The comparison: what it is and what it tells you

When a file has both a `git-file` and a `live-read` line, **pAIchart itself** (never an agent) compares the kept Git file with the
served copy, line by line after secret redaction, and records the answer as the Harvester's `gitLiveDrift` fact. The leg's
Architect and Reviewer are shown it; they never compare files themselves. Each file reads one of:

| State | Means |
|---|---|
| **identical** | the two copies are the same bytes |
| **equal-except-redacted** | they differ only where a secret was redacted |
| **same-lines-bytes-differ** | the same lines, but the two files' bytes are not identical |
| **differs** | some lines differ; the differing lines are shown |
| **not-checked** — with a reason | no comparison was made (for example, no `live-read` line, or the served copy could not be read) |

Lines that are only in the served copy are removed when you apply the Git file; the design says so and leaves keeping them to
you. Before a differing line is shown, the platform redacts the secret shapes it knows and withholds any line that looks like a
credential: [SECURITY.md](SECURITY.md), "What a file comparison can quote".

> ⚠️ **Known limitation:** a false "matches what is deployed" statement written inside a list in the package's apply notes can be
> approved. Read the apply notes against the `gitLiveDrift` fact yourself before you apply
> ([PIPELINES.md](PIPELINES.md), "Observability: kept files from Git or from your service").

## In short

- **Read-only**, through a service you run, with a Viewer account and read-only mounts you set up. pAIchart stores no
  monitoring credentials.
- **Ten read tools, nothing else:** no reload, apply, write or admin tool exists on the service.
- **Scoped by you:** what the service can reach sets the hard limit, and your `## Config sources` block sets which files are kept.
- **Name the service** by descriptor URL for one observability leg; by its registered name, registered once, for two or more.
- **The comparison is pAIchart's own**, and withholds credential-shaped lines.
- **You stay in control of the change:** pAIchart hands you reviewed edits, and your process applies them. If a change would be
  unsafe, pAIchart stops and tells you why instead of producing it.
