# Kubernetes lab — a disposable cluster to run the GitOps pipeline against

A single-node `kind` cluster with a workload that has real, checkable gaps, plus the **read-only MCP
service** the pipeline harvests through. Everything here is free software; no account needed.

Pairs with: the `kubernetes-gitops-protocol` text in [`scripts/seed-protocol-prompts.ts`](../../scripts/seed-protocol-prompts.ts) ·
[`descriptors/k8s-readonly-descriptor.json`](../../descriptors/k8s-readonly-descriptor.json) ·
worked outputs in [`examples/`](../../examples/kubernetes-gitops-change-report.md).

## Prerequisites

`docker`, [`kind`](https://kind.sigs.k8s.io/docs/user/quick-start/#installation), `kubectl`.

## Bring-up

```bash
kind create cluster --name k8s-rig --config kind-config.yaml
kubectl apply -f readonly-rbac.yaml
kubectl apply -f sample-workloads.yaml
kubectl -n trading get deploy,svc,cm,secret        # orders-api, 2 replicas, no HPA, no limits, no PDB
```

## Build the READ-ONLY credential — and prove it is read-only

The service must never hold the cluster-admin kubeconfig. Build a ServiceAccount one instead:

```bash
# The SA token secret takes a moment to populate after the cluster is created. If TOKEN is empty,
# wait a few seconds and re-run — an empty token yields a kubeconfig that silently prompts for a
# username, which is a confusing failure we hit ourselves.
TOKEN=$(kubectl -n kube-system get secret readonly-harvester-token -o jsonpath='{.data.token}' | base64 -d)
SERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
CA=$(kubectl -n kube-system get secret readonly-harvester-token -o jsonpath='{.data.ca\.crt}')
cat > readonly.kubeconfig <<YAML
apiVersion: v1
kind: Config
clusters: [{ name: k8s-rig, cluster: { server: ${SERVER}, certificate-authority-data: ${CA} } }]
users: [{ name: readonly, user: { token: ${TOKEN} } }]
contexts: [{ name: ro, context: { cluster: k8s-rig, user: readonly } }]
current-context: ro
YAML
```

**Then prove it, rather than trusting the RBAC file:**

```bash
KUBECONFIG=readonly.kubeconfig kubectl -n trading get deploy orders-api                    # works
KUBECONFIG=readonly.kubeconfig kubectl -n trading delete deploy orders-api --dry-run=server # Forbidden
KUBECONFIG=readonly.kubeconfig kubectl -n trading get secret orders-api-creds               # Forbidden
```

Two independent limits are doing work here: the service exposes a **verb allowlist** (`list_resources`,
`get_resource`, `list_secret_names` — there is no write, exec, log or secret-value verb to call), and
the ServiceAccount behind it **cannot** write or read secret values even if the service had a bug.

## The compare tool

The service also offers `compare_declared_fields`. Give it the text of a manifest file and it reports, for each
object the file names, which **declared** fields differ from the live object.

- It makes one `get` per object. It does not list, patch or dry-run anything.
- It returns field **paths** only (for example `spec.replicas`), never a value, declared or live.
- A field the manifest does not state is not read out, so cluster defaults and status are not compared.
- A `Secret` is never fetched. A kustomization, a Helm values file, or a kind the service does not allow is
  reported as *not compared*, with the reason.
- A `Namespace` object is compared too: it is fetched by the name the manifest gives it, never listed. Its labels
  matter (they decide which NetworkPolicies select it and which Pod Security level applies). This needs one extra
  permission, `get` on `namespaces` (in `readonly-rbac.yaml`, no `list`, no `watch`). The grant is **optional**:
  without it that document reads *not compared: live-read-failed* and everything else works. To narrow it, list
  only the namespaces your manifests name under `resourceNames`. Other cluster-scoped kinds (a `ClusterRole`, for
  example) are not compared.
- What a caller can learn through the tool, and why it is accepted: whether a namespace of a given name exists
  (the existing `get_resource` already answers that), and whether a declared Namespace label or annotation matches
  — a label with few possible values can be confirmed by guessing. Labels are not secrets; values are never returned.
- Limits: 262,144 bytes of manifest, 50 objects, 200 differing paths per object. Anything over a limit is
  refused or counted, never guessed.

The logic is `k8s-mcp-readonly/declared_compare.py`, which imports no Kubernetes client, so its tests run without
a cluster:

```bash
python3 k8s-mcp-readonly/test_declared_compare.py     # needs PyYAML
```

Quantities are compared by value where the field is a quantity (resource requests and limits, pod overhead,
`emptyDir.sizeLimit`, ResourceQuota `spec.hard`, LimitRange limits, HPA metric targets): `1000m` in the file equals `1`
live, and `1Gi` equals `1024Mi`, but `1G` and `1Gi` differ. A value that is not a valid quantity is compared as written.

Known noise, reported as a difference although the cluster treats both sides as equal: a list whose items have no
`name` (compared by position), and an unquoted number or date in a string field.

## Run the service

```bash
docker build -t k8s-mcp-readonly ./k8s-mcp-readonly
docker run -d --name k8s-mcp --network host -e PORT=3112 \
  -v "$PWD/readonly.kubeconfig:/app/kubeconfig:ro" --memory 512m --cpus 0.5 k8s-mcp-readonly
```

Liveness: a bare `GET /mcp` returns **406 or 400** depending on the MCP library version — both mean
*alive, wrong headers*. The real check is an `initialize` call, which returns a JSON-RPC result.

## Point a pipeline at it

Copy `descriptors/k8s-readonly-descriptor.json`, set `endpoint` to wherever **your hub** can reach this
service, and put that descriptor URL in the task description. The pipeline self-provisions the service
for the run and tears the registration down afterwards — pAIchart stores no cluster credentials.

Objectives with genuine gaps in this cluster: add an HPA and resource requests/limits; add a
PodDisruptionBudget; add a default-deny NetworkPolicy. All three are absent by design.

## Teardown

```bash
docker rm -f k8s-mcp
kind delete cluster --name k8s-rig
```

## Honest scope

A disposable single-node cluster is not your production cluster, and the service authenticates with a
static ServiceAccount token rather than a per-user identity. It exercises the full cognition pipeline
and the read-only floor against real cluster state — not an identity contract.
