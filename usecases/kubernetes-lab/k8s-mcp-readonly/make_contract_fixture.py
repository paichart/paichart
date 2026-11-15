"""The CONTRACT fixture between the compare tool (Python, this folder) and the platform's validator (TypeScript,
lib/agents/harness/git-live-drift.ts): one real result of `compare_manifest`, written to scripts/fixtures/git-live-drift/.

    python3 <this file>            # prints the fixture JSON
    python3 <this file> --check    # exit 1 when the committed fixture differs (run by test_declared_compare.py)
    python3 <this file> --write    # rewrite the committed fixture (a deliberate contract change: move both sides)

The fixture covers every object state and every difference kind, so a change to the tool's output shape reds BOTH suites.
"""
import json
import os
import sys

from declared_compare import compare_manifest

KINDS = {("apps/v1", "Deployment"): "deployments", ("v1", "Service"): "services", ("v1", "ConfigMap"): "configmaps"}
MANIFEST = """\
apiVersion: apps/v1
kind: Deployment
metadata: { name: orders-api, namespace: trading, labels: { app.kubernetes.io/name: orders } }
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: orders-api
          image: nginx:1.27-alpine
          ports: [{ containerPort: 80 }]
          env:
            - { name: FEED_URL, value: "http://feed:8080" }
            - { name: API_TOKEN, value: "<<REDACTED-SECRET>>" }
---
apiVersion: v1
kind: Service
metadata: { name: orders-api, namespace: trading }
spec: { ports: [{ port: 80, targetPort: 80 }] }
---
apiVersion: v1
kind: ConfigMap
metadata: { name: gone, namespace: trading }
data: { k: v }
---
apiVersion: v1
kind: Secret
metadata: { name: s, namespace: trading }
stringData: { p: x }
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources: [a.yaml]
---
apiVersion: v1
kind: Namespace
metadata:
  name: trading
  labels: { team: orders, pod-security.kubernetes.io/enforce: restricted }
"""
LIVE = {
    ("deployments", "trading", "orders-api"): {
        "metadata": {"labels": {"app.kubernetes.io/name": "orders-v2"}},
        "spec": {"replicas": 3, "template": {"spec": {"containers": [
            {"name": "orders-api", "image": "nginx:1.27-alpine", "ports": [{"containerPort": "80"}],
             "env": [{"name": "API_TOKEN", "value": "live"}]}]}}}},
    ("services", "trading", "orders-api"): {"spec": {"ports": [{"port": 80, "targetPort": 80}]}},
    # cluster-scoped: fetched by name, no namespace — one declared label has drifted live
    ("namespaces", None, "trading"): {"metadata": {"name": "trading", "labels": {"team": "orders", "pod-security.kubernetes.io/enforce": "baseline",
                                                                                   "kubernetes.io/metadata.name": "trading"}}},
}
CLUSTER_KINDS = {("v1", "Namespace"): "namespaces"}


def get(resource_type, _label, namespace, name):
    v = LIVE.get((resource_type, namespace, name))
    return ("found", v) if v else ("absent", None)


def build():
    return {"manifest": MANIFEST, "redactedMarker": "<<REDACTED-SECRET>>",
            "result": compare_manifest(MANIFEST, KINDS, get, redacted_marker="<<REDACTED-SECRET>>", cluster_kinds=CLUSTER_KINDS)}


def _fixture_path():
    """The repository's scripts/fixtures/git-live-drift/compare-result.json, found by walking UP from this file — the tool lives at a
    different depth in the private repository (the rig folder) and in the public one (usecases/kubernetes-lab). None when no
    ancestor carries the fixtures folder (a copy of this folder on its own, e.g. on the rig host)."""
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(10):
        cand = os.path.join(d, "scripts", "fixtures", "git-live-drift")
        if os.path.isdir(cand):
            return os.path.join(cand, "compare-result.json")
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    return None


PATH = _fixture_path()

if __name__ == "__main__":
    text = json.dumps(build(), indent=2, sort_keys=True) + "\n"
    if PATH is None and ("--write" in sys.argv or "--check" in sys.argv):
        print("no scripts/fixtures/git-live-drift folder above this file — nothing to check here")
        sys.exit(3)   # 3 = not applicable in this tree (the caller skips); never read as "the fixture is current"
    if "--write" in sys.argv:
        open(PATH, "w").write(text)
    elif "--check" in sys.argv:
        sys.exit(0 if os.path.exists(PATH) and open(PATH).read() == text else 1)
    else:
        sys.stdout.write(text)
