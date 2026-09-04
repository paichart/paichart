"""Read-only Terraform/IaC MCP service — Phase-4 LocalStack validation rig + WP-D reference service.

Exposes a DELIBERATELY read-only surface over a Terraform state file, conforming to
TERRAFORM-SERVICE-INTEGRATION-SPEC.md (the customer-half contract):
  - R1 verb-enum: ONLY state_list + state_pull exist. No plan/validate/apply/destroy/import/
        console/refresh/output/init — those tools DO NOT EXIST here (not "denied at runtime").
        state_list/state_pull RENDER saved state and launch NO provider (zero code-exec, zero lock).
  - CR-1a ARG-CONFINEMENT: `workspace` is a CLOSED enum resolved SERVER-SIDE to a state path; the
        caller never supplies a dir/var/module/path. `address` is regex-validated.
  - K1 (the moat): state_pull redacts every attribute named in the resource instance's OWN
        `sensitive_attributes` (Terraform records these in-state — verified zero-provider, D1) +
        a keyword backstop. Raw state / secret VALUES never leave the service.
  - §7.5 DENIAL CHANNEL: an out-of-policy request returns an MCP isError:true tool result (via
        ToolError), NOT a thrown/transport error — a confined harvest stays success:true and the
        harness does not self-degrade.
  - §8: the service self-defends for ANY caller stage — the verb-enum + arg-confinement are the
        sole gate, enforced identically regardless of which pipeline stage calls.

NOT JWKS-conformant (R2a): for the rig identity is static/absent, not the JWKS-forwarded per-user
identity the spec mandates — the same honest caveat the cEOS/kind rigs carried. This validates the
COGNITION pipeline + R1/CR-1a/K1 enforcement, not the identity contract.

Transport: streamable-http on $PORT (default 3107, container-internal). Host maps 127.0.0.1:3113 → 3107 behind tf-lab.paichart.app (2026-07-15).
"""
import json
import os
import re
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

# ── CR-1a: workspace is a CLOSED enum resolved SERVER-SIDE to a state path. The caller never
# supplies a path/dir/var/module — only this key. (A real service maps the verified identity's
# allowed workspaces; the rig hard-codes one.) ──
WORKSPACES = {
    "prod": os.environ.get("TF_STATE_PATH", "/rig/workspace/terraform.tfstate"),
}
ADDR_RE = re.compile(r'^[A-Za-z0-9_.\[\]"-]+$')  # resource-address characters only
PLACEHOLDER = "<<REDACTED-SENSITIVE>>"
# K1 backstop: even if a provider failed to MARK an attribute sensitive, redact these by name.
SECRET_KEYISH = re.compile(
    r"(password|passwd|secret|token|private_key|access_key|client_secret|credential)", re.I
)

# TWIN SUPPRESSION (2026-08-31, r10-serialized-leaf-blindness follow-up): FastMCP
# spec-compliantly duplicates every structured (dict-returning) tool result into a
# serialized content[0].text block. Measured pipeline cost: ~30% of tool-result payload
# and most Tier-1 truncations (63/73 of this service's recorded calls carried the twin).
# The serializer only shapes the text block; structuredContent keeps the full payload.
def _stub_serializer(data) -> str:
    return "(full payload in structuredContent; serialized text twin suppressed)"


mcp = FastMCP("terraform-readonly", tool_serializer=_stub_serializer)


def _load_state(workspace: str) -> dict:
    if workspace not in WORKSPACES:
        # §7.5: denial as an isError RESULT, not a throw
        raise ToolError(
            f"workspace '{workspace}' is not in the allowlist {sorted(WORKSPACES)}. "
            "(The caller cannot supply a state path/dir — workspace is resolved server-side.)"
        )
    path = WORKSPACES[workspace]
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        raise ToolError(f"state for workspace '{workspace}' not found (rig not applied yet?).")
    except json.JSONDecodeError as e:
        raise ToolError(f"state for workspace '{workspace}' is not valid JSON: {e}")


def _address(res: dict, inst: dict) -> str:
    a = (("module." + res["module"] + ".") if res.get("module") else "")
    a += res["type"] + "." + res["name"]
    idx = inst.get("index_key")
    if idx is not None:
        a += f'["{idx}"]' if isinstance(idx, str) else f"[{idx}]"
    return a


def _redact(inst: dict) -> dict:
    """K1: redact every attribute the state itself marks sensitive (+ a keyword backstop)."""
    attrs = dict(inst.get("attributes") or {})
    redacted = []
    for path in inst.get("sensitive_attributes") or []:
        # a path is a list of steps; the first get_attr step is the top-level attribute name
        if path and isinstance(path, list) and isinstance(path[0], dict) and path[0].get("type") == "get_attr":
            k = path[0].get("value")
            if k in attrs:
                attrs[k] = PLACEHOLDER
                redacted.append(k)
    # keyword backstop (defense in depth for an unmarked secret-shaped string attribute)
    for k in list(attrs):
        if isinstance(attrs[k], str) and attrs[k] != PLACEHOLDER and SECRET_KEYISH.search(k):
            attrs[k] = PLACEHOLDER
            redacted.append(k)
    return {"attributes": attrs, "redacted_attributes": sorted(set(redacted))}


@mcp.tool()
def state_list(workspace: str) -> dict:
    """List resource ADDRESSES in a workspace — addresses only, zero secret material, zero provider."""
    state = _load_state(workspace)
    addrs = []
    for res in state.get("resources", []):
        for inst in res.get("instances", [{}]):
            addrs.append(_address(res, inst))
    return {"workspace": workspace, "addresses": sorted(addrs), "count": len(addrs)}


@mcp.tool()
def state_pull(workspace: str, address: str) -> dict:
    """Pull a resource's current state by ADDRESS, REDACTED by its own sensitive_attributes (K1).
    Renders saved state — launches NO provider, takes NO lock. Never returns secret values or raw state."""
    if not ADDR_RE.match(address or "") or len(address) > 256:
        raise ToolError(f"address '{address}' is not a valid resource address.")
    state = _load_state(workspace)
    for res in state.get("resources", []):
        for inst in res.get("instances", [{}]):
            if _address(res, inst) == address:
                return {
                    "workspace": workspace,
                    "address": address,
                    "type": res["type"],
                    "provider": res.get("provider"),
                    **_redact(inst),
                }
    raise ToolError(
        f"address '{address}' not found in workspace '{workspace}' (use state_list to see addresses)."
    )


# NOTE: there is intentionally NO plan/validate/apply/destroy/import/console/refresh/output tool,
# and NO free-text terraform passthrough. They are not "denied at runtime" — they DO NOT EXIST on
# this surface. That is the R1 read-only floor by construction (TERRAFORM-SERVICE-INTEGRATION-SPEC §3).

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3107"))
    mcp.run(transport="streamable-http", host="0.0.0.0", port=port)
