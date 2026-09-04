"""Read-only Kubernetes MCP service — Phase-4 kind validation rig + E1 reference service.

Exposes a DELIBERATELY read-only surface over a kind cluster, conforming to
K8S-SERVICE-INTEGRATION-SPEC.md (the customer-half contract):
  - R1: a CLOSED resourceType allowlist (bare kinds; no `secrets`, no subresource arg,
        no raw path, no exec/log/proxy/etc. — those tools simply do not exist here).
  - K1: secrets reachable ONLY via list_secret_names (names + key names, NEVER values).
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
    if not NS_RE.match(namespace or "") or len(namespace) > 253:
        raise ToolError(f"namespace '{namespace}' is not a valid single RFC1123 name (no -A / wildcards).")
    if name is not None and (not NS_RE.match(name) or len(name) > 253):
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
