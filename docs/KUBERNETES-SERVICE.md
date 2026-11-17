# Connecting a Kubernetes cluster: what pAIchart reads, and what your service must offer

**For:** a platform or security team deciding whether to connect a cluster, and the engineer who runs the read-only service.

pAIchart helps you make a change to your cluster: for example, letting a new client reach a service, or tightening a network
policy. It reads what is running, works out the change, has it reviewed, and gives you the exact file edits. **It never applies
anything.** Your own process (your deployment pipeline, or a person) applies the change.

This page explains what it reads, what it never reads, how you control the boundary, and what a Kubernetes service must offer
if you run your own instead of ours.

## How pAIchart reaches your cluster

pAIchart does not connect to your cluster directly and stores no cluster credentials. It talks to a small **read-only service
that you run**, in your own environment, using a **service account you create**. The service offers a fixed set of read
operations and nothing else: no write, no exec into a container, no logs, no port-forwarding, no raw API access.

So there are two limits, and you own both:

- **The service account's permissions:** the hard boundary. The Kubernetes API itself refuses anything outside them.
- **The service's own allowlist:** a second layer. It exposes only the read operations listed below, even where your
  permissions would allow more.

Our reference service and its example permissions file are in the public repository: `usecases/kubernetes-lab/k8s-mcp-readonly/`
and `usecases/kubernetes-lab/readonly-rbac.yaml`. Your platform team can read exactly what is granted, verb by verb.

## What it reads

| Operation | What it returns | Used for |
|---|---|---|
| List or get an object of an allowed kind (Deployments, Services, ConfigMaps, NetworkPolicies, Ingresses and similar), **in a namespace you name** | the object, with internal bookkeeping fields removed | understanding the current state before writing a change |
| List the names of Secrets in a namespace you name | each Secret's **name and key names** | knowing which secrets exist, without their contents |
| Compare a manifest file with what is running | **which declared fields differ**, as field paths only, never a value | the drift check between your Git file and your cluster |

Every read names its namespace. There is no "all namespaces" read, and the service cannot list your namespaces.

pAIchart masks credential-shaped values in the reports it stores. The comparison returns field paths only. The read step
returns the objects your change concerns in full (minus Secret values), because writing a correct change needs the real
current state.

## What it never reads

- **Secret values.** The service never returns them. Kubernetes has no permission that lists Secret names without their
  contents, so the service account does receive them; the service drops the values before anything leaves it, and only names
  and key names are returned. If you prefer not to grant this, remove the Secrets rule. The only loss is that pAIchart cannot see
  which secrets exist.
  **Credentials in objects that are not Secrets:** what a run keeps has the value of a credential-named environment
  variable, a `Bearer`/`Basic` token and a `--password=…`-style argument redacted, in the object and in its
  `kubectl.kubernetes.io/last-applied-configuration` annotation. A few shapes are still not redacted; see
  [SECURITY.md](SECURITY.md), "The two output guards".
- **Container logs, a shell inside a container, or a port-forward.** No operation exists for them, and the permissions file
  does not grant them.
- **Your list of namespaces.** See the next section.

## Why only a namespace you name

A **namespace** is a named partition of the cluster; teams, applications or customers usually each have their own. The list of
namespaces is sensitive in itself: the names give away customers, codenames and which teams exist, and namespace labels decide
which network policies apply and which Pod Security level is enforced.

Kubernetes separates **list** (every namespace) from **get** (this one, by name). pAIchart is given **get only**, for one purpose:
when one of your manifest files describes a Namespace object (for example, to set its labels), the comparison reads that one
Namespace, by the name the file gives, to check its labels match. It never lists namespaces.

This permission is **optional**. Without it, that one Namespace document is reported as *not compared* and everything else works.
You can narrow it to just the namespaces your files describe, using `resourceNames`.

## How to keep the boundary tight

The example permissions file grants its read access across the whole cluster, which suits a lab. For your cluster:

1. **Bind per namespace.** Grant the read rules with a RoleBinding in each namespace your changes touch, rather than a
   ClusterRoleBinding. Every other namespace becomes unreadable to the service.
2. **Grant the Namespace `get` separately, if at all**, narrowed with `resourceNames`, or leave it out.
3. **Leave out what you do not need.** The service never uses the `watch` verb. Drop the Secrets rule if you do not want
   secret names read.
4. **Prove it, rather than trusting the file.** With the service account's kubeconfig, a read in a granted namespace should work,
   and a delete, a Secret `get` and a namespace list should all be refused:
   ```bash
   KUBECONFIG=readonly.kubeconfig kubectl -n <namespace> get deploy <name>                       # works
   KUBECONFIG=readonly.kubeconfig kubectl -n <namespace> delete deploy <name> --dry-run=server    # Forbidden
   KUBECONFIG=readonly.kubeconfig kubectl -n <namespace> get secret <name>                       # Forbidden
   KUBECONFIG=readonly.kubeconfig kubectl auth can-i list namespaces                             # no
   ```

## What you tell pAIchart: the `## Config sources` block

Each Kubernetes leg of a spec carries a `## Config sources` block. It names every place that leg reads, one line each:

```
## Config sources
sample-workloads: git-file — service github-service ; <owner>/<repo>/k8s/sample-workloads.yaml
cluster: live-read — service https://<your host>/k8s-readonly-descriptor.json
```

- **`git-file`** — a manifest file in your Git repository. pAIchart keeps the exact bytes it read, and the change is written as
  edits to that kept copy. It must be in the repository your install's Git file source is pinned to.
- **`live-read`** — your cluster, read through your read-only service (a registered service name, or the URL of its descriptor).
  This is evidence only: nothing in the cluster is edited.
- **`supplied`** — you pasted the cluster state into the task; nothing is read.

**A Kubernetes leg with no `## Config sources` block stops** before it reads anything, rather than guess its sources. A block
with `git-file` lines and no `live-read` line is a **Git-only** run: no cluster is read, there is no drift check, and the package
says so. The topology file (`topology.json`) beside the spec holds facts only: the cluster, the namespace(s) the change touches,
the workload, your repository and paths, and your service's descriptor URL. It needs no map of your cluster. A worked example:
`usecases/telemetry-export-net-k8s-r2/` in the public configs repository [`paichart/paichart-configs`](https://github.com/paichart/paichart-configs/tree/main/usecases/telemetry-export-net-k8s-r2) (a `git-only/` and a `git-live/` variant).

## The drift check: what it is and what it tells you

When a leg declares both a `git-file` and a `live-read` line, **pAIchart itself** (never an agent) sends your kept file to your
service's compare tool and records the answer as a fact on the leg. The agents read that fact; they never compare files and live
objects themselves. Each file reads one of:

| State | Means |
|---|---|
| **compared — no differences** | every declared field of every object in the file matches what is running |
| **compared — differences** | some declared fields differ; the paths are listed (never the values) |
| **compared — with gaps** | compared, but some objects or fields could not be compared (each is named) |
| **not checked** — with a reason | no comparison was made; the reason says why (table below) |

A difference in a field **the change touches** is reconciled in the package with a callout. A difference in a field the change
does **not** touch, in a file the change edits, **stops the leg for a person**: applying the file would silently revert what is
running. A file the change does not edit is listed and does not stop the leg.

**Why a file is "not checked":**

| Reason (as shown) | What to do |
|---|---|
| no live-read source is declared (a Git-only run) | nothing — this is what a Git-only run means |
| more than one live-read source is declared | a leg can compare against one cluster only; declare one `live-read` line per leg |
| the declared live-read service was not registered in this run | check the service is reachable and its descriptor URL is correct |
| the service declares no compare tool | your service does not offer `compare_declared_fields` (next section) — the reads still work |
| the file is not held | the leg could not keep the Git file (path, ref or repository outside the pin) — fix the line |
| the file is larger than the compare limit | over 256 KB; split the file |
| secret redaction is switched off on this install, so the file is not sent | turn secret redaction back on (see the self-host kept-files guide) |
| the declared service is not owned by the run owner | register the service as the user who runs the program |
| the time allowed for this leg's comparisons ran out | retry; check the service's response time |
| the platform call was refused | the hub refused the call (policy or rate limit); its log names the reason |
| the platform call failed | check the service is up and answering |
| the service refused the comparison | read the service's own error (often a limit below) |
| the result could not be read | your service's result does not match the contract below |
| the service did not compare the held bytes | your service returned a `manifestSha256` for other bytes (contract below) |
| source is not the rendered object | the file is a kustomization, a Helm values file or a kind that is not compared |
| the per-leg call limit was reached | more than 20 files in one leg; split the leg |
| no platform call was recorded | no comparison was planned for this leg — usually a run from before your install had the drift check; launch again |

## If you run your own Kubernetes service

The reads work with any read-only service that offers get/list tools. **The drift check needs one more tool**, which our reference
service implements (`declared_compare.py`); add the same to yours:

- **Tool name:** `compare_declared_fields`. pAIchart calls it itself; agents are refused it.
- **Arguments:** `manifest` (the file's text, with any secret replaced by a marker), `defaultNamespace` (optional),
  `redactedMarker` (the marker string, so a redacted field is reported as not compared rather than as a difference).
- **Behaviour:** GET each object the manifest names (never list, never write), and compare **only the fields the manifest
  declares**. Never fetch or compare a `Secret`. Quantities (resource requests and limits) compare by value, so `1000m` equals `1`.
- **Result:** `{ "method": "k8s-declared-field-compare/2", "manifestSha256": <sha256 of the manifest text>, "objects": [...] }`.
  Each object carries its `kind`, `name`, `namespace` and a `state`: `compared` (with `declaredPaths`, `differingTotal`,
  `differing: [{ path, difference }]` where `difference` is `value-differs`, `type-differs` or `missing-live`, and
  `redactedNotComparedTotal`), `absent-live`, or `not-compared` with a reason. **Paths only, never a value.**
- **pAIchart refuses** a result with another method string, or a `manifestSha256` that is not the sha256 of the bytes it sent.

**Limits** (pAIchart enforces its side; the reference service enforces the rest):

| Limit | Value |
|---|---|
| manifest size per call | 256 KB (262,144 bytes) |
| objects per file | 50 |
| differing paths the service returns per object | 200 (the total is always given) |
| differing paths pAIchart keeps per file | 40 (the total is always kept) |
| files compared per leg | 20 calls; 40 files recorded |
| time per leg for all comparisons | 120 seconds |

## In short

- **Read-only**, through a service you run, with a service account you create. pAIchart stores no cluster credentials.
- **Scoped by you:** the permissions you grant set the hard limit, and your `## Config sources` block sets what is read.
- **Never:** secret values, logs, shells, writes, or a list of your namespaces.
- **The drift check is pAIchart's own, and reports paths, not values.**
- **You stay in control of the change:** pAIchart hands you reviewed edits, and your process applies them. If a change would be
  unsafe, pAIchart stops and tells you why instead of producing it.
