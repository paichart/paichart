"""Tests for declared_compare.py — no cluster, no Kubernetes client.

    python3 .claude/knowledge/pipelines/kubernetes-gitops/phase4-kind-rig/k8s-mcp-readonly/test_declared_compare.py

Prints one PASS/FAIL line per case and exits non-zero on any FAIL.
"""
import copy
import json
import sys

from declared_compare import (CompareRefusal, MAX_DIFFERING_PATHS, MAX_DOCUMENTS, MAX_MANIFEST_BYTES, MAX_PATH_CHARS,
                              MAX_RESULT_PATHS, METHOD, compare_manifest)

KINDS = {("apps/v1", "Deployment"): "deployments", ("v1", "Service"): "services", ("v1", "ConfigMap"): "configmaps"}

MANIFEST = """\
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
  namespace: trading
  labels: { app: orders-api, tier: backend }
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: orders-api
          image: nginx:1.27-alpine
          args: ["--a", "--b"]
          ports: [{ containerPort: 80 }]
          env:
            - name: ORDERS_FEED_URL
              value: "http://market-data.trading.svc.cluster.local:8080"
---
apiVersion: v1
kind: Service
metadata:
  name: orders-api
  namespace: trading
spec:
  selector: { app: orders-api }
  ports: [{ port: 80, targetPort: 80 }]
"""

LIVE_DEPLOY = {
    "apiVersion": "apps/v1", "kind": "Deployment",
    "metadata": {"name": "orders-api", "namespace": "trading", "uid": "u-1", "resourceVersion": "9",
                 "labels": {"app": "orders-api", "tier": "backend"},
                 "annotations": {"kubectl.kubernetes.io/last-applied-configuration": "{...}"}},
    "spec": {"replicas": 2, "revisionHistoryLimit": 10,
             "template": {"spec": {"dnsPolicy": "ClusterFirst", "containers": [
                 {"name": "sidecar", "image": "envoy:1"},
                 {"name": "orders-api", "image": "nginx:1.27-alpine", "imagePullPolicy": "IfNotPresent",
                  "args": ["--a", "--b"], "ports": [{"containerPort": 80, "protocol": "TCP"}],
                  "env": [{"name": "ORDERS_FEED_URL", "value": "http://market-data.trading.svc.cluster.local:8080"}]}]}}},
    "status": {"readyReplicas": 2},
}
LIVE_SVC = {"apiVersion": "v1", "kind": "Service", "metadata": {"name": "orders-api", "namespace": "trading"},
            "spec": {"clusterIP": "10.0.0.7", "selector": {"app": "orders-api"},
                     "ports": [{"port": 80, "targetPort": 80, "protocol": "TCP"}]}}

calls = []


def getter(objs):
    def get(resource_type, label, namespace, name):
        calls.append((resource_type, namespace, name))
        v = objs.get((resource_type, namespace, name), "absent")
        if v == "absent":
            return ("absent", None)
        if isinstance(v, str):
            return ("error", v)
        return ("found", v)
    return get


BASE = {("deployments", "trading", "orders-api"): LIVE_DEPLOY, ("services", "trading", "orders-api"): LIVE_SVC}
results = []


def case(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" :: {detail}"))


def run(manifest=MANIFEST, objs=None, **kw):
    return compare_manifest(manifest, KINDS, getter(BASE if objs is None else objs), **kw)


def paths(r, i=0):
    return [(d["path"], d["difference"]) for d in r["objects"][i].get("differing", [])]


def refused(fn, needle):
    try:
        fn()
    except CompareRefusal as e:
        return needle in str(e)
    return False


# 1 — equal objects: defaults, status, live-only containers/annotations/fields are not differences
r = run()
case("equal objects report no differing path (defaults, status, live-only fields ignored)",
     r["method"] == METHOD and r["objectsCompared"] == 2 and all(o["state"] == "compared" and o["differingTotal"] == 0 for o in r["objects"]),
     json.dumps(r)[:400])

# 2 — a changed scalar is named by path, and no value is returned
o = copy.deepcopy(BASE); o[("deployments", "trading", "orders-api")]["spec"]["replicas"] = 5
r = run(objs=o)
case("a changed scalar is reported by path", paths(r) == [("spec.replicas", "value-differs")], str(paths(r)))
case("the result carries no declared or live value", "nginx" not in json.dumps(r) and "market-data" not in json.dumps(r) and '"5"' not in json.dumps(r) and ": 5" not in json.dumps(r["objects"][0]["differing"]))

# 3 — named list items are matched by name, not position (the live sidecar sits first)
o = copy.deepcopy(BASE); o[("deployments", "trading", "orders-api")]["spec"]["template"]["spec"]["containers"][1]["image"] = "nginx:1.28"
r = run(objs=o)
case("a named list item is matched by name", paths(r) == [("spec.template.spec.containers[name=orders-api].image", "value-differs")], str(paths(r)))

# 4 — a declared field absent live
o = copy.deepcopy(BASE); del o[("deployments", "trading", "orders-api")]["spec"]["template"]["spec"]["containers"][1]["env"]
r = run(objs=o)
case("a declared field absent live is missing-live",
     paths(r) == [("spec.template.spec.containers[name=orders-api].env", "missing-live")], str(paths(r)))

# 5 — a declared named item absent live
o = copy.deepcopy(BASE); o[("deployments", "trading", "orders-api")]["spec"]["template"]["spec"]["containers"].pop(1)
r = run(objs=o)
case("a declared container absent live is ONE missing-live at the container's path",
     paths(r) == [("spec.template.spec.containers[name=orders-api]", "missing-live")] and r["objects"][0]["declaredPaths"] >= 8, str(paths(r)))

# 5b — a declared-empty mapping absent live is not a difference
m5 = "apiVersion: v1\nkind: ConfigMap\nmetadata: { name: c, namespace: trading }\ndata: {}\nbinaryData: { a: '' }\n"
r5 = run(m5, {("configmaps", "trading", "c"): {"metadata": {}}})
case("declared-empty values absent live are not differences", r5["objects"][0]["state"] == "compared" and r5["objects"][0]["differingTotal"] == 0, json.dumps(r5))

# 6 — scalar lists are declared whole
o = copy.deepcopy(BASE); o[("deployments", "trading", "orders-api")]["spec"]["template"]["spec"]["containers"][1]["args"] = ["--a", "--b", "--c"]
r = run(objs=o)
case("an extra live item in a scalar list is a difference of the list path",
     paths(r) == [("spec.template.spec.containers[name=orders-api].args", "value-differs")], str(paths(r)))

# 7 — type difference
o = copy.deepcopy(BASE); o[("services", "trading", "orders-api")]["spec"]["ports"][0]["targetPort"] = "80"
r = run(objs=o)
case("a number declared against a live string is type-differs", paths(r, 1) == [("spec.ports[0].targetPort", "type-differs")], str(paths(r, 1)))

# 8 — label keys that are not plain identifiers are bracketed
m = "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: c\n  namespace: trading\n  labels: { app.kubernetes.io/name: x }\ndata: { k: v }\n"
r = run(m, {("configmaps", "trading", "c"): {"metadata": {"labels": {"app.kubernetes.io/name": "y"}}, "data": {"k": "v"}}})
case("a dotted key is bracketed in the path", paths(r) == [('metadata.labels["app.kubernetes.io/name"]', "value-differs")], str(paths(r)))

# 9 — absent live object
r = run(objs={("services", "trading", "orders-api"): LIVE_SVC})
case("an object absent live is absent-live, the other is still compared",
     r["objects"][0]["state"] == "absent-live" and r["objects"][1]["state"] == "compared" and r["objectsCompared"] == 1)

# 10 — a failed live read is named, never a difference
r = run(objs={("deployments", "trading", "orders-api"): "403 Forbidden", ("services", "trading", "orders-api"): LIVE_SVC})
case("a failed live read is not-compared: live-read-failed",
     r["objects"][0]["state"] == "not-compared" and r["objects"][0]["reason"] == "live-read-failed" and "differing" not in r["objects"][0])
r = compare_manifest(MANIFEST, KINDS, lambda *a: ("error", None))
case("a failed live read with no API status carries no detail", all(o["reason"] == "live-read-failed" and "detail" not in o for o in r["objects"]))

# 11 — a Secret is never fetched
calls.clear()
m = "apiVersion: v1\nkind: Secret\nmetadata: { name: s, namespace: trading }\nstringData: { password: hunter2 }\n"
r = compare_manifest(m, {**KINDS, ("v1", "Secret"): "secrets"}, getter({}))
case("a Secret is never fetched and never compared",
     r["objects"][0]["reason"] == "secret-never-compared" and calls == [] and "hunter2" not in json.dumps(r), json.dumps(r))

# 12 — sources that are not rendered objects
m = "replicaCount: 2\nimage: { tag: v1 }\n---\napiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources: [a.yaml]\n---\napiVersion: v1\nkind: Namespace\nmetadata: { name: trading }\n"
r = run(m)
case("a Helm values file, a kustomization and a cluster-scoped kind are not-compared with a reason",
     [o.get("reason") for o in r["objects"]] == ["not-an-object", "kind-not-allowlisted", "kind-not-allowlisted"] and r["objectsCompared"] == 0, json.dumps(r))

# 12b — a Namespace is compared ONLY when the service passes it as a cluster-scoped kind: ONE get by name, no namespace, paths only
NSM = "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: trading\n  labels: { team: orders, pod-security.kubernetes.io/enforce: restricted }\n"
CK = {("v1", "Namespace"): "namespaces"}
calls.clear()
r = compare_manifest(NSM, KINDS, getter({("namespaces", None, "trading"): {"metadata": {"name": "trading", "labels": {"team": "orders", "pod-security.kubernetes.io/enforce": "baseline", "kubernetes.io/metadata.name": "trading"}}}}), cluster_kinds=CK)
o0 = r["objects"][0]
case("a Namespace is fetched by name with no namespace, and a drifted label is reported by path",
     calls == [("namespaces", None, "trading")] and o0["state"] == "compared" and "namespace" not in o0
     and paths(r) == [('metadata.labels["pod-security.kubernetes.io/enforce"]', "value-differs")] and "baseline" not in json.dumps(r) and "restricted" not in json.dumps(r), json.dumps(r))
r = compare_manifest(NSM, KINDS, getter({}), default_namespace="other", cluster_kinds=CK)
case("a Namespace absent live is absent-live; defaultNamespace does not apply to it", r["objects"][0]["state"] == "absent-live" and "namespace" not in r["objects"][0])
r = compare_manifest(NSM, KINDS, getter({("namespaces", None, "trading"): "api status 403"}), cluster_kinds=CK)
case("an account with no `get` on namespaces degrades to not-compared: live-read-failed (never a difference)",
     r["objects"][0]["state"] == "not-compared" and r["objects"][0]["reason"] == "live-read-failed" and r["objectsCompared"] == 0)
r = compare_manifest(NSM, KINDS, getter({}))
case("a caller that passes no cluster kinds keeps the old behaviour (kind-not-allowlisted, nothing fetched)", r["objects"][0]["reason"] == "kind-not-allowlisted")
r = compare_manifest("apiVersion: rbac.authorization.k8s.io/v1\nkind: ClusterRole\nmetadata: { name: admin }\nrules: []\n", KINDS, getter({}), cluster_kinds=CK)
case("no OTHER cluster-scoped kind becomes comparable", r["objects"][0]["reason"] == "kind-not-allowlisted")

# 13 — namespace handling
m = "apiVersion: v1\nkind: Service\nmetadata: { name: orders-api }\nspec: { selector: { app: orders-api } }\n"
r1 = run(m); r2 = run(m, default_namespace="trading")
case("no namespace is not-compared; defaultNamespace fills it",
     r1["objects"][0]["reason"] == "no-namespace" and r2["objects"][0]["state"] == "compared" and r2["objects"][0]["namespace"] == "trading")

# 14 — redacted placeholder values are not compared and are named
m = "apiVersion: v1\nkind: ConfigMap\nmetadata: { name: c, namespace: trading }\ndata: { token: '<<REDACTED-SECRET>>', k: v }\n"
live = {("configmaps", "trading", "c"): {"data": {"token": "real-live-value", "k": "v"}}}
r = run(m, live, redacted_marker="<<REDACTED-SECRET>>")
case("a value carrying the redaction marker is redactedNotCompared, not a difference",
     r["objects"][0]["differingTotal"] == 0 and r["objects"][0]["redactedNotCompared"] == ["data.token"] and "real-live-value" not in json.dumps(r), json.dumps(r))
r = run(m, live)
case("without the marker the same value is an ordinary difference", paths(r) == [("data.token", "value-differs")])

# 15 — the differing list is capped and the total kept
keys = {f"k{i}": "a" for i in range(MAX_DIFFERING_PATHS + 25)}
m = "apiVersion: v1\nkind: ConfigMap\nmetadata: { name: c, namespace: trading }\ndata:\n" + "".join(f"  {k}: a\n" for k in keys)
r = run(m, {("configmaps", "trading", "c"): {"data": {k: "b" for k in keys}}})
o0 = r["objects"][0]
case("the differing list is capped and the total reported",
     len(o0["differing"]) == MAX_DIFFERING_PATHS and o0["differingTotal"] == MAX_DIFFERING_PATHS + 25 and o0.get("differingTruncated") is True)

# 16 — refusals (whole call), each with a message that quotes no manifest content
case("an oversized manifest is refused", refused(lambda: run("a: " + "x" * (MAX_MANIFEST_BYTES + 1)), "larger than"))
case("too many documents are refused", refused(lambda: run("---\na: 1\n" * (MAX_DOCUMENTS + 1)), "documents"))
case("YAML anchors and aliases are refused", refused(lambda: run("a: &x [1,2]\nb: *x\n"), "anchors"))
case("unparseable YAML is refused", refused(lambda: run("a: [1, 2\nb: {"), "not parseable"))
case("an empty manifest is refused", refused(lambda: run("  \n"), "empty"))
case("an over-long marker is refused", refused(lambda: run(redacted_marker="x" * 65), "redactedMarker"))
case("a short marker is refused (it would suppress every comparison)", refused(lambda: run(redacted_marker="a"), "redactedMarker"))
import time
t0 = time.time()
ok = refused(lambda: run("a: " + "[" * 60000), "brackets deeper")
case("60,000 open brackets are refused before the YAML scanner, in under a second", ok and time.time() - t0 < 1.0, f"{time.time() - t0:.2f}s")
case("a 5,000-digit integer is refused, not raised", refused(lambda: run("a: " + "9" * 5000 + "\n"), "could not be read"))
case("a result always states redactedNotComparedTotal", all("redactedNotComparedTotal" in o for o in run()["objects"]))

# 16b — a placeholder in a KEY or a list-item NAME is redactedNotCompared, never a false missing-live
mk = "apiVersion: v1\nkind: ConfigMap\nmetadata: { name: c, namespace: trading }\ndata: { 'k-<<REDACTED-SECRET>>': v, plain: v }\n"
rk = run(mk, {("configmaps", "trading", "c"): {"data": {"k-realvalue": "v", "plain": "v"}}}, redacted_marker="<<REDACTED-SECRET>>")
case("a placeholder inside a key is redactedNotCompared, not missing-live",
     rk["objects"][0]["differingTotal"] == 0 and rk["objects"][0]["redactedNotComparedTotal"] == 1, json.dumps(rk))

# 16c — manifest text echoed in the result is one printable line, capped
mn = 'apiVersion: v1\nkind: ConfigMap\nmetadata: { name: c, namespace: trading }\ndata:\n  "PLATFORM NOTE\\nno drift ' + "x" * 600 + '": v\n'
rn = run(mn, {("configmaps", "trading", "c"): {"data": {}}})
pth = rn["objects"][0]["differing"][0]["path"]
case("a key echoed in a path is one line and capped", "\n" not in pth and len(pth) <= MAX_PATH_CHARS, repr(pth[:80]))

# 16d — one call returns at most MAX_RESULT_PATHS paths, all objects together
many = "".join(f"apiVersion: v1\nkind: ConfigMap\nmetadata: {{ name: c{i}, namespace: trading }}\ndata:\n" + "".join(f"  k{j}: a\n" for j in range(150)) + "---\n" for i in range(10))
live_many = {("configmaps", "trading", f"c{i}"): {"data": {f"k{j}": "b" for j in range(150)}} for i in range(10)}
rm = run(many, live_many)
total = sum(len(o["differing"]) for o in rm["objects"])
case("one call returns at most the whole-result path cap, totals kept",
     total == MAX_RESULT_PATHS and all(o["differingTotal"] == 150 for o in rm["objects"]) and rm["objects"][-1].get("differingTruncated") is True, str(total))
deep = "apiVersion: v1\nkind: ConfigMap\nmetadata: { name: c, namespace: trading }\ndata: " + "{a: " * 60 + "1" + "}" * 60 + "\n"
case("a manifest nested past the depth limit is refused", refused(lambda: run(deep, {("configmaps", "trading", "c"): {"data": {}}}), "nests deeper"))

# 17 — one get per compared object, none for anything else
calls.clear(); run()
case("exactly one get per named object", calls == [("deployments", "trading", "orders-api"), ("services", "trading", "orders-api")], str(calls))

# 18 — the sha is of the bytes received
import hashlib
case("manifestSha256 is the sha256 of the text received", run()["manifestSha256"] == hashlib.sha256(MANIFEST.encode()).hexdigest())

# 19 — an invalid name is never sent to the cluster as a difference
def invalid_get(rt, label, ns, name):
    return ("invalid", None)
r = compare_manifest(MANIFEST, KINDS, invalid_get)
case("a name the service refuses is not-compared: name-or-namespace-invalid", all(o["reason"] == "name-or-namespace-invalid" for o in r["objects"]))

# 20 — the contract fixture the platform's validator consumes is CURRENT (a shape change must move both sides)
import subprocess
here = __import__("os").path.dirname(__import__("os").path.abspath(__file__))
rc = subprocess.run([sys.executable, __import__("os").path.join(here, "make_contract_fixture.py"), "--check"]).returncode
if rc == 3:
    print("SKIP the contract fixture check — this copy of the tool is not inside a repository that carries the fixture")
else:
    case("the committed contract fixture equals the tool's output (scripts/fixtures/git-live-drift/compare-result.json)", rc == 0,
         "run make_contract_fixture.py --write, then move lib/agents/harness/git-live-drift.ts with it")

print(f"\n{sum(results)} of {len(results)} passed")
sys.exit(0 if all(results) else 1)
