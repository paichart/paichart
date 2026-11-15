"""Unit test of server.py `_get_live` — the ONE live read behind compare_declared_fields (sec-ops C4, 2026-11-16).

Runs with no cluster and without `fastmcp` / `kubernetes` installed: both are replaced by stubs before server.py is imported, and
the dynamic client is a recorder. It pins what the compare tool may ask the API server, and what it passes back:
  - an invalid name, or `namespaces` WITH a namespace, never reaches the API ("invalid", no call);
  - a Namespace is fetched cluster-scoped, by name, with NO namespace argument; any other kind needs a valid namespace;
  - a resource type outside the allowlist (incl. `secrets`) is never fetched;
  - an API refusal passes on only its HTTP status ("api status 403"); 404 is "absent"; anything else names no detail.

Run: python3 test_get_live.py   (from this folder)
"""
from __future__ import annotations

import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ── stubs for the two libraries server.py imports ─────────────────────────────────────────────────────────────────────────
fastmcp = types.ModuleType("fastmcp")
fastmcp_exc = types.ModuleType("fastmcp.exceptions")


class _FastMCP:
    def __init__(self, *_a, **_k):
        pass

    def tool(self, *_a, **_k):
        return lambda f: f

    def run(self, *_a, **_k):
        raise AssertionError("the test never runs the server")


class ToolError(Exception):
    pass


fastmcp.FastMCP = _FastMCP
fastmcp_exc.ToolError = ToolError


class ApiException(Exception):
    def __init__(self, status=None):
        super().__init__(f"status {status}")
        self.status = status


class ConfigException(Exception):
    pass


k8s = types.ModuleType("kubernetes")
k8s_client = types.ModuleType("kubernetes.client")
k8s_rest = types.ModuleType("kubernetes.client.rest")
k8s_config = types.ModuleType("kubernetes.config")
k8s_dynamic = types.ModuleType("kubernetes.dynamic")
k8s_client.ApiClient = lambda *a, **k: object()
k8s_client.CoreV1Api = lambda *a, **k: object()
k8s_rest.ApiException = ApiException
k8s_config.ConfigException = ConfigException
k8s_config.load_incluster_config = lambda: (_ for _ in ()).throw(ConfigException())
k8s_config.load_kube_config = lambda: None
k8s_dynamic.DynamicClient = lambda *_a, **_k: None
k8s.client, k8s.config, k8s.dynamic = k8s_client, k8s_config, k8s_dynamic
k8s_client.rest = k8s_rest
for name, mod in {"fastmcp": fastmcp, "fastmcp.exceptions": fastmcp_exc, "kubernetes": k8s, "kubernetes.client": k8s_client,
                  "kubernetes.client.rest": k8s_rest, "kubernetes.config": k8s_config, "kubernetes.dynamic": k8s_dynamic}.items():
    sys.modules[name] = mod

import server  # noqa: E402  (after the stubs, by design)

# ── a recording dynamic client ────────────────────────────────────────────────────────────────────────────────────────────
calls: list = []


class _Obj:
    def __init__(self, d):
        self._d = d

    def to_dict(self):
        return dict(self._d)


class _Res:
    def __init__(self, api_version, kind, behaviour):
        self.api_version, self.kind, self.behaviour = api_version, kind, behaviour

    def get(self, **kwargs):
        calls.append(("get", self.api_version, self.kind, tuple(sorted(kwargs.items()))))
        b = self.behaviour
        if isinstance(b, BaseException):
            raise b
        return _Obj({"kind": self.kind, "metadata": {"name": kwargs.get("name"), "managedFields": ["x"]}})


class _Resources:
    def __init__(self, behaviour):
        self.behaviour = behaviour

    def get(self, api_version, kind):
        calls.append(("resource", api_version, kind))
        return _Res(api_version, kind, self.behaviour)


class _Dyn:
    def __init__(self, behaviour=None):
        self.resources = _Resources(behaviour)


results: list = []


def case(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" :: {detail}"))


def run(behaviour, *args):
    calls.clear()
    server._dyn = _Dyn(behaviour)
    return server._get_live(*args)


# 1 — `namespaces` WITH a namespace is not a cluster-scoped read and is not on the allowlist: invalid, no API call
r = run(None, "namespaces", "v1/Namespace", "trading", "trading")
case("namespaces with a namespace set ⇒ invalid, nothing sent to the API", r == ("invalid", None) and calls == [], (r, calls))

# 2 — an invalid or empty name never reaches the API (an empty name on the dynamic client would be a LIST)
for bad in ["", None, "Bad", "a" * 254, "x\n", "../x", "a/b"]:
    r = run(None, "namespaces", "v1/Namespace", None, bad)
    case(f"name {bad!r} ⇒ invalid, nothing sent to the API (cluster-scoped)", r == ("invalid", None) and calls == [], (r, calls))
    r = run(None, "deployments", "apps/v1/Deployment", "trading", bad)
    case(f"name {bad!r} ⇒ invalid, nothing sent to the API (namespaced)", r == ("invalid", None) and calls == [], (r, calls))

# 3 — the cluster-scoped read: v1/Namespace, by name, NO namespace argument; managedFields stripped
r = run(None, "namespaces", "v1/Namespace", None, "trading")
case("a Namespace is ONE get of v1/Namespace by name with no namespace argument",
     r[0] == "found" and calls == [("resource", "v1", "Namespace"), ("get", "v1", "Namespace", (("name", "trading"),))], calls)
case("the returned object carries no managedFields", "managedFields" not in r[1].get("metadata", {}), r)

# 4 — a namespaced read passes the namespace; a namespaced kind without a namespace never reaches the API
r = run(None, "deployments", "apps/v1/Deployment", "trading", "orders-api")
case("a Deployment is ONE get with name AND namespace",
     calls == [("resource", "apps/v1", "Deployment"), ("get", "apps/v1", "Deployment", (("name", "orders-api"), ("namespace", "trading")))], calls)
r = run(None, "deployments", "apps/v1/Deployment", None, "orders-api")
case("a namespaced kind with no namespace ⇒ invalid, nothing sent", r == ("invalid", None) and calls == [], (r, calls))
for bad_ns in ["Bad", "a" * 254, "x\n", ""]:
    r = run(None, "deployments", "apps/v1/Deployment", bad_ns, "orders-api")
    case(f"namespace {bad_ns!r} ⇒ invalid, nothing sent", r == ("invalid", None) and calls == [], (r, calls))

# 5 — only the allowlist (plus the one cluster-scoped Namespace) is ever fetched
for rt in ["secrets", "clusterroles", "nodes", "pods/log", "serviceaccounts/token"]:
    r = run(None, rt, "x", "trading", "name")
    case(f"resource type {rt!r} (not on the allowlist) ⇒ invalid, nothing sent", r == ("invalid", None) and calls == [], (r, calls))
    r = run(None, rt, "x", None, "name")
    case(f"resource type {rt!r} cluster-scoped ⇒ invalid, nothing sent", r == ("invalid", None) and calls == [], (r, calls))

# 6 — failures: only an HTTP status is passed on; 404 is absent; any other failure carries no detail
case("403 ⇒ exactly ('error', 'api status 403')", run(ApiException(403), "namespaces", "v1/Namespace", None, "trading") == ("error", "api status 403"))
case("404 ⇒ ('absent', None)", run(ApiException(404), "namespaces", "v1/Namespace", None, "trading") == ("absent", None))
case("an ApiException with no status ⇒ ('error', None)", run(ApiException(None), "deployments", "apps/v1/Deployment", "trading", "a") == ("error", None))
case("an ApiException with a non-HTTP status ⇒ ('error', None)", run(ApiException(7), "deployments", "apps/v1/Deployment", "trading", "a") == ("error", None))
case("any other exception (TLS, connection — it can name the host) ⇒ ('error', None)",
     run(RuntimeError("connect to 10.1.2.3:6443 failed"), "deployments", "apps/v1/Deployment", "trading", "a") == ("error", None))

# 7 — the compare tool passes ONLY Namespace as cluster-scoped; the agent-facing allowlist does not hold namespaces
case("_CLUSTER_COMPARE is exactly {v1/Namespace: namespaces}", server._CLUSTER_COMPARE == {("v1", "Namespace"): "namespaces"})
case("namespaces is NOT in RESOURCE_MAP (no agent-facing tool lists or fetches a namespace)", "namespaces" not in server.RESOURCE_MAP)

print(f"\n{sum(results)} of {len(results)} passed")
sys.exit(0 if all(results) else 1)
