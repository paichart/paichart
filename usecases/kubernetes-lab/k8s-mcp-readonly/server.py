"""Read-only Kubernetes MCP service — Phase-4 kind validation rig + E1 reference service.

Exposes a DELIBERATELY read-only surface over a kind cluster, conforming to
K8S-SERVICE-INTEGRATION-SPEC.md (the customer-half contract):
  - R1: a CLOSED resourceType allowlist (bare kinds; no `secrets`, no subresource arg,
        no raw path, no exec/log/proxy/etc. — those tools simply do not exist here).
  - K1: secrets reachable ONLY via list_secret_names (names + key names, NEVER values).
  - compare_declared_fields (Config sources STEP 2): GET only; returns differing declared field PATHS, never values;
        a Secret manifest is never fetched. The pure logic is declared_compare.py (tested without a cluster).
  - §6.5 DENIAL CHANNEL: an out-of-policy request returns an MCP `isError:true` tool
        result (via ToolError), NOT a thrown/transport error — so a confined harvest
        stays success:true and the harness does not self-degrade.
  - R2 (defence in depth): the service authenticates to the cluster with a least-privilege
        read-only ServiceAccount (readonly-rbac.yaml). Even a bug here cannot write/exec/read
        secret values, because the SA lacks those verbs.

NOT JWKS-conformant (R2a): for the rig the SA token is static, not the JWKS-forwarded
per-user identity the spec mandates — same honest caveat the cEOS rig carried. This
validates the COGNITION pipeline + R1/R2 enforcement, not the identity contract.

Transport: streamable-http on $PORT (default 3107). The rig runs it with PORT=3112 behind the dedicated k8s-lab.paichart.app route (2026-07-15).
Runtime integration points to confirm on first boot (cf. the cEOS rig README pattern):
  (a) the FastMCP ToolError -> isError-result mapping (not a JSON-RPC throw);
  (b) in-cluster vs kubeconfig auth (load_incluster_config when run as a pod, else kubeconfig).
"""
import os
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from kubernetes import client, config
from kubernetes.client.rest import ApiException
from kubernetes.dynamic import DynamicClient

from declared_compare import CompareRefusal, compare_manifest

# ── R1: the CLOSED resourceType allowlist (bare kinds → (api_version, kind)) ──
# `secrets` is intentionally ABSENT (use list_secret_names). No subresources, no raw path.
RESOURCE_MAP = {
    "pods": ("v1", "Pod"),
    "services": ("v1", "Service"),
    "configmaps": ("v1", "ConfigMap"),
    "endpoints": ("v1", "Endpoints"),
    "resourcequotas": ("v1", "ResourceQuota"),
    "limitranges": ("v1", "LimitRange"),
    "serviceaccounts": ("v1", "ServiceAccount"),
    "deployments": ("apps/v1", "Deployment"),
    "replicasets": ("apps/v1", "ReplicaSet"),
    "statefulsets": ("apps/v1", "StatefulSet"),
    "daemonsets": ("apps/v1", "DaemonSet"),
    "ingresses": ("networking.k8s.io/v1", "Ingress"),
    "networkpolicies": ("networking.k8s.io/v1", "NetworkPolicy"),
    "horizontalpodautoscalers": ("autoscaling/v2", "HorizontalPodAutoscaler"),
    "poddisruptionbudgets": ("policy/v1", "PodDisruptionBudget"),
}
NS_RE = __import__("re").compile(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")  # RFC1123


def _load_k8s():
    try:
        config.load_incluster_config()           # when run as a pod
    except config.ConfigException:
        config.load_kube_config()                # when run with a mounted kubeconfig
    return DynamicClient(client.ApiClient()), client.CoreV1Api()


_dyn, _core = _load_k8s()
mcp = FastMCP("k8s-readonly")


def _validate(resource_type: str, namespace: str, name: str | None = None):
    if resource_type not in RESOURCE_MAP:
        # §6.5: denial as an isError RESULT, not a throw
        raise ToolError(
            f"resourceType '{resource_type}' is not in the read-only allowlist. "
            f"Allowed: {sorted(RESOURCE_MAP)}. (secrets -> use list_secret_names; "
            f"no exec/log/proxy/raw/subresource access exists.)"
        )
    if not NS_RE.fullmatch(namespace or "") or len(namespace) > 253:
        raise ToolError(f"namespace '{namespace}' is not a valid single RFC1123 name (no -A / wildcards).")
    if name is not None and (not NS_RE.fullmatch(name) or len(name) > 253):
        raise ToolError(f"name '{name}' is not a valid RFC1123 name.")


@mcp.tool()
def list_resources(resourceType: str, namespace: str, labelSelector: str | None = None) -> dict:
    """List a resource KIND in a namespace (read-only). resourceType must be in the allowlist."""
    _validate(resourceType, namespace)
    if labelSelector and len(labelSelector) > 256:
        raise ToolError("labelSelector too long (max 256).")
    api_version, kind = RESOURCE_MAP[resourceType]
    try:
        res = _dyn.resources.get(api_version=api_version, kind=kind)
        items = res.get(namespace=namespace, label_selector=labelSelector or "").items
        return {"resourceType": resourceType, "namespace": namespace,
                "items": [_strip(i.to_dict()) for i in items]}
    except ApiException as e:
        raise ToolError(f"k8s API error ({e.status}): {e.reason}")  # isError, not a throw


@mcp.tool()
def get_resource(resourceType: str, namespace: str, name: str) -> dict:
    """Get a single namespaced resource (read-only). resourceType must be in the allowlist."""
    _validate(resourceType, namespace, name)
    api_version, kind = RESOURCE_MAP[resourceType]
    try:
        res = _dyn.resources.get(api_version=api_version, kind=kind)
        return _strip(res.get(name=name, namespace=namespace).to_dict())
    except ApiException as e:
        raise ToolError(f"k8s API error ({e.status}): {e.reason}")


@mcp.tool()
def list_resource_names(resourceType: str, namespace: str, labelSelector: str | None = None) -> dict:
    """List a resource KIND's NAMES + labels + count in a namespace — METADATA ONLY, never specs.

    The CAP-SAFE way to bound a population. `list_resources` returns full unprojected objects:
    measured 2026-09-23, an unscoped pod listing peaked at 149,030 chars against the ~8 KB Tier-1
    tool-result cap (18.6x) and truncated 12 of 13 times even WITH a labelSelector, which is the
    narrowest pod read this service previously offered. The read_more pager tops out near 50,000
    chars, so a namespace past roughly a dozen pods could not be enumerated at any turn budget.
    Names + labels run ~70 chars/item, so the same namespace returns ~1-3 KB and always fits.

    Labels are load-bearing, not decoration: without them a caller cannot work out WHICH of the
    listed names a selector matches, which is the whole point of bounding a set-valued change.
    Strictly less exposure than list_resources, which already returns labels plus everything else.
    """
    _validate(resourceType, namespace)
    if labelSelector and len(labelSelector) > 256:
        raise ToolError("labelSelector too long (max 256).")
    api_version, kind = RESOURCE_MAP[resourceType]
    try:
        res = _dyn.resources.get(api_version=api_version, kind=kind)
        items = res.get(namespace=namespace, label_selector=labelSelector or "").items
        return {"resourceType": resourceType, "namespace": namespace,
                "count": len(items),
                "items": [{"name": i.metadata.name,
                           "labels": dict(i.metadata.labels or {})} for i in items]}
    except ApiException as e:
        raise ToolError(f"k8s API error ({e.status}): {e.reason}")  # isError, not a throw

@mcp.tool()
def list_secret_names(namespace: str) -> dict:
    """List Secret NAMES + their key names in a namespace — METADATA ONLY, never values."""
    _validate("configmaps", namespace)  # reuse the namespace validation (configmaps is allowlisted)
    try:
        secs = _core.list_namespaced_secret(namespace)
        return {"namespace": namespace, "secrets": [
            {"name": s.metadata.name, "type": s.type,
             "keys": sorted((s.data or {}).keys())}  # KEY NAMES ONLY — values never read out
            for s in secs.items]}
    except ApiException as e:
        raise ToolError(f"k8s API error ({e.status}): {e.reason}")


# ── Config sources STEP 2 (Group K1): the declared-field compare. GET only — no list, no patch, no dry-run. ──
# (apiVersion, kind) -> resourceType, derived from the SAME closed allowlist; `Secret` is absent from it and is also
# refused by name inside the compare, so a Secret manifest is never fetched.
_KIND_TO_RESOURCE = {v: k for k, v in RESOURCE_MAP.items()}
# The ONE cluster-scoped kind the compare may fetch, BY NAME (the manifest supplies it). Deliberately NOT in RESOURCE_MAP: the
# agent-facing tools (list_resources / get_resource / list_resource_names) still cannot list or fetch a namespace, and nothing here
# can enumerate them. The ServiceAccount needs `get` on namespaces for this — never `list` (readonly-rbac.yaml). Without it the API
# answers 403 and the document is `not-compared: live-read-failed`, exactly as an un-allowlisted kind read before.
_CLUSTER_COMPARE = {("v1", "Namespace"): "namespaces"}


def _get_live(resource_type: str, _label: str, namespace: str, name: str):
    """ONE get for the compare. Never raises: ("found", obj) | ("absent", None) | ("invalid", None) | ("error", text)."""
    if not NS_RE.fullmatch(name or "") or len(name) > 253:
        return ("invalid", None)
    cluster = resource_type == "namespaces" and namespace is None
    if not cluster and (not NS_RE.fullmatch(namespace or "") or len(namespace) > 253 or resource_type not in RESOURCE_MAP):
        return ("invalid", None)
    api_version, kind = ("v1", "Namespace") if cluster else RESOURCE_MAP[resource_type]
    try:
        res = _dyn.resources.get(api_version=api_version, kind=kind)
        obj = res.get(name=name) if cluster else res.get(name=name, namespace=namespace)
        return ("found", _strip(obj.to_dict()))
    except ApiException as e:
        if e.status == 404:
            return ("absent", None)
        # sec-ops F5: only an HTTP status from the API server is passed on — never a client/TLS message (it can name the host)
        status = e.status if isinstance(e.status, int) and 400 <= e.status <= 599 else None
        return ("error", f"api status {status}" if status else None)
    except Exception:  # noqa: BLE001 — the compare names the failure; it never becomes a difference
        return ("error", None)


@mcp.tool()
def compare_declared_fields(manifest: str, defaultNamespace: str | None = None,
                            redactedMarker: str | None = None) -> dict:
    """Compare a manifest file's DECLARED fields with the live objects it names (read-only: one get per object).

    Returns, per object, the declared field PATHS whose live value differs — never a value, declared or live.
    Fields the manifest does not state are not read out. A Secret is never fetched. A kustomization, a Helm values
    file or a non-allowlisted kind is `not-compared` with a reason. `redactedMarker`: a declared string containing
    it is listed as `redactedNotCompared` instead of compared.
    """
    if defaultNamespace is not None and (not NS_RE.fullmatch(defaultNamespace) or len(defaultNamespace) > 253):
        raise ToolError(f"defaultNamespace '{defaultNamespace}' is not a valid single RFC1123 name.")
    try:
        return compare_manifest(manifest, _KIND_TO_RESOURCE, _get_live,
                                default_namespace=defaultNamespace, redacted_marker=redactedMarker,
                                cluster_kinds=_CLUSTER_COMPARE)
    except CompareRefusal as e:
        raise ToolError(f"compare refused: {e}")  # §6.5: a denial is an isError RESULT, never a throw
    except Exception:  # noqa: BLE001 — sec-ops F1: nothing the manifest holds may escape as a transport error
        raise ToolError("compare refused: the manifest could not be compared")


def _strip(obj):
    """Defence in depth: drop managedFields noise and any stray Secret data that should never appear."""
    if isinstance(obj, dict):
        obj.pop("managedFields", None)
        md = obj.get("metadata")
        if isinstance(md, dict):
            md.pop("managedFields", None)
        # belt-and-braces: never emit base64 Secret payloads even if a kind slipped through
        if obj.get("kind") == "Secret":
            obj["data"] = {k: "<<redacted-metadata-only>>" for k in (obj.get("data") or {})}
            obj.pop("stringData", None)
    return obj


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3107"))
    mcp.run(transport="streamable-http", host="0.0.0.0", port=port)
