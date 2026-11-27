"""pAIchart's read-only network reference service: a minimal MCP server over Nornir + NAPALM.

Written for pAIchart (2026-11-27) to replace a third-party server whose source can no longer be fetched.
It was built from the replaced service's observable interface only (its tools/list and recorded responses),
and answers every call with the same structuredContent and isError, byte for byte (proven by replaying recorded calls).

Exactly three tools, all reads:
  list_devices   the Nornir inventory (no device contact)
  fetch_data     NAPALM getters (structured, read-only by construction)
  show_commands  `show` commands over SSH, ONLY those in SHOW_ALLOWLIST (enforced here, not only by the
                 descriptor: a command outside the list is refused before any device is contacted)

There is no write path: no configure, load, commit, replace, save or reload tool exists in this file.

Results go in structuredContent. The serialized text twin FastMCP would add is replaced by a fixed stub
(TEXT_TWIN_STUB): the twin duplicated every payload in content[0].text and cost pAIchart's pipeline ~30% of
its tool-result bytes; known consumers read structuredContent.
"""
import traceback
from typing import Annotated, Any, Literal

from fastmcp import FastMCP
from nornir import InitNornir
from nornir.core.task import Result, Task
from nornir_napalm.plugins.tasks import napalm_get
from nornir_netmiko.tasks import netmiko_send_command
from pydantic import Field

CONFIG_FILE = "config.yaml"  # read from the process CWD (/app); hosts/groups/defaults are relative to it
TEXT_TWIN_STUB = "(full payload in structuredContent; serialized text twin suppressed)"

# The descriptor's nine read-only state commands. Exact string match: anything else is refused.
SHOW_ALLOWLIST = (
    "show ip route",
    "show ip route ospf",
    "show ip route isis",
    "show ip ospf neighbor",
    "show isis neighbor",
    "show isis hostname",
    "show ip ospf interface brief",
    "show isis database",
    "show isis database detail",
)


def _stub_serializer(data: Any) -> str:
    return TEXT_TWIN_STUB


mcp = FastMCP("Nornir Network Automation", tool_serializer=_stub_serializer)

FilterName = Annotated[str | None, Field(description="Filter by device name in inventory")]
FilterHostname = Annotated[str | None, Field(description="Filter by specific hostname or IP")]
FilterGroup = Annotated[str | None, Field(description="Filter by group membership")]
FilterPlatform = Annotated[str | None, Field(description="Filter by platform (e.g., 'cisco_ios', 'arista_eos')")]


def _nornir():
    # Logging off: the root filesystem is read-only, and the log only repeated each call's arguments.
    return InitNornir(config_file=CONFIG_FILE, logging={"enabled": False})


def _filtered(nr, name, hostname, group, platform):
    """Exact-match filters combined with AND. An empty string is no filter."""

    def keep(host) -> bool:
        if name and host.name != name:
            return False
        if hostname and host.hostname != hostname:
            return False
        if group and group not in [g.name for g in host.groups]:
            return False
        if platform and host.platform != platform:
            return False
        return True

    return nr.filter(filter_func=keep)


def _filter_error(total: int) -> dict:
    return {
        "error": True,
        "code": "filter_error",
        "message": (
            f"No devices matched the provided filters. Original inventory had {total} devices. "
            "Try calling 'list_network_devices' with query_type='devices' to verify available names and platforms."
        ),
    }


def _host_results(filtered, agg) -> dict:
    hosts = {}
    for name in filtered.inventory.hosts:
        multi = agg[name]
        result = multi[0]
        if multi.failed:
            exc = result.exception
            hosts[name] = {
                "success": False,
                "error": {
                    "error": True,
                    "code": "task_failed",
                    "message": "Task failed",
                    "exception": str(exc),
                    "details": {"traceback": "".join(traceback.format_tb(exc.__traceback__))},
                },
            }
        else:
            hosts[name] = {"success": True, "output": result.result}
    return {"hosts": hosts}


def _run(filtered, **kwargs) -> dict:
    try:
        agg = filtered.run(**kwargs)
        return _host_results(filtered, agg)
    finally:
        # Close on failed hosts too (Nornir skips them by default). The replaced service closed nothing, and every
        # show_commands call left an idle SSH session on each switch until the vty lines ran out (2026-11-27).
        filtered.close_connections(on_good=True, on_failed=True)


@mcp.tool(
    name="list_devices",
    description=(
        "List the devices and groups in the service's Nornir inventory. Read-only; contacts no device. "
        "Use details=true for each device's inventory data."
    ),
    tags={"inventory"},
    annotations={"readOnlyHint": True, "openWorldHint": False},
)
def list_network_devices(
    query_type: Annotated[
        Literal["devices", "groups", "all"],
        Field(description="Type of inventory data to return ('devices', 'groups', 'all')"),
    ] = "all",
    details: Annotated[bool, Field(description="Whether to return full inventory attributes (for devices query)")] = False,
    filter_name: FilterName = None,
    filter_hostname: FilterHostname = None,
    filter_group: FilterGroup = None,
    filter_platform: FilterPlatform = None,
) -> dict[str, Any]:
    nr = _nornir()
    filtered = _filtered(nr, filter_name, filter_hostname, filter_group, filter_platform)
    hosts = list(filtered.inventory.hosts.values())
    if not hosts:
        return _filter_error(len(nr.inventory.hosts))

    out: dict[str, Any] = {}
    if query_type in ("devices", "all"):
        out["devices"] = {
            "total_devices": len(hosts),
            "devices": [
                {
                    "name": h.name,
                    "hostname": h.hostname,
                    "platform": h.platform,
                    "groups": [g.name for g in h.groups],
                    "data": dict(h.data) if details else None,
                }
                for h in hosts
            ],
        }
    if query_type in ("groups", "all"):
        groups: dict[str, dict] = {}
        for h in hosts:
            for g in h.groups:
                entry = groups.setdefault(g.name, {"count": 0, "members": []})
                entry["count"] += 1
                entry["members"].append(h.name)
        out["groups"] = {"groups": groups}
    return out


@mcp.tool(
    name="fetch_data",
    description=(
        "Run one or more read-only NAPALM getters (e.g. 'config', 'facts', 'interfaces', 'interfaces_ip', "
        "'bgp_neighbors') on the matching devices. Returns {hosts: {<device>: {success, output|error}}}; the "
        "output is keyed by getter name. getters_options passes per-getter options, e.g. "
        "{'config': {'retrieve': 'running'}}."
    ),
    tags={"monitoring"},
    annotations={"readOnlyHint": True, "openWorldHint": True},
)
def get_structured_data(
    getters: Annotated[list[str], Field(description="NAPALM getter names (e.g., ['facts', 'interfaces', 'bgp_neighbors'])")],
    getters_options: dict[str, Any] | None = None,
    filter_name: FilterName = None,
    filter_hostname: FilterHostname = None,
    filter_group: FilterGroup = None,
    filter_platform: FilterPlatform = None,
) -> dict[str, Any]:
    nr = _nornir()
    filtered = _filtered(nr, filter_name, filter_hostname, filter_group, filter_platform)
    if not filtered.inventory.hosts:
        return {"__global__": _filter_error(len(nr.inventory.hosts))}
    kwargs: dict[str, Any] = {"getters": getters}
    if getters_options:
        kwargs["getters_options"] = getters_options
    return _run(filtered, task=napalm_get, **kwargs)


def send_commands(task: Task, commands: list[str]) -> Result:
    """One netmiko_send_command subtask per command, so a device failure reads
    "Subtask: netmiko_send_command (failed)" exactly as the replaced service's did."""
    output = {}
    for cmd in commands:
        output[cmd] = task.run(task=netmiko_send_command, command_string=cmd).result
    return Result(host=task.host, result=output)


@mcp.tool(
    name="show_commands",
    description=(
        "Run read-only `show` commands over SSH on the matching devices and return the raw CLI text. Only these "
        "commands are accepted: " + "; ".join(SHOW_ALLOWLIST) + ". Any other command refuses the whole call "
        "before a device is contacted."
    ),
    tags={"monitoring"},
    annotations={"readOnlyHint": True, "openWorldHint": True},
)
def run_show_commands(
    commands: Annotated[
        list[str], Field(description="Show commands to execute (e.g., ['show version', 'show ip interface brief'])")
    ],
    filter_name: FilterName = None,
    filter_hostname: FilterHostname = None,
    filter_group: FilterGroup = None,
    filter_platform: FilterPlatform = None,
) -> dict[str, Any]:
    if not commands:
        return {"error": True, "code": "empty_commands", "message": "Command list cannot be empty"}
    refused = [c for c in commands if c not in SHOW_ALLOWLIST]
    if refused:
        return {
            "error": True,
            "code": "command_not_allowed",
            "message": "Only the allowlisted read-only show commands are accepted; no device was contacted.",
            "refused": refused,
            "allowed": list(SHOW_ALLOWLIST),
        }
    nr = _nornir()
    filtered = _filtered(nr, filter_name, filter_hostname, filter_group, filter_platform)
    if not filtered.inventory.hosts:
        return {"__global__": _filter_error(len(nr.inventory.hosts))}
    return _run(filtered, task=send_commands, commands=commands)


@mcp.custom_route("/health", methods=["GET"])
async def health(_request):
    """Process liveness for the container healthcheck. Contacts no device and reads no inventory."""
    from starlette.responses import JSONResponse

    return JSONResponse({"status": "ok"})


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=3107)
