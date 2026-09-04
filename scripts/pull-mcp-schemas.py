#!/usr/bin/env python3
"""Pull live tool schemas from a localhost MCP (streamable-http) server and extract a curated subset.

Usage (run on the prod box):  python3 pull-mcp-schemas.py <port> <out.json> <tool_name> [tool_name ...]
Writes  [{name, description, inputSchema}, ...]  for the curated names — ready to drop into a seed's
capabilities.tools. Servers expose schemas regardless of credential validity (tools/list doesn't call
the upstream), so this works even on placeholder creds.
"""
import json
import sys
import urllib.request
import urllib.error

port = sys.argv[1]
out = sys.argv[2]
curated = sys.argv[3:]
BASE = f"http://localhost:{port}/mcp"


def post(body, sid=None):
    data = json.dumps(body).encode()
    req = urllib.request.Request(BASE, data=data, method="POST")
    req.add_header("content-type", "application/json")
    req.add_header("accept", "application/json, text/event-stream")
    if sid:
        req.add_header("mcp-session-id", sid)
    try:
        resp = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError:
        return None, None
    sid_out = resp.headers.get("mcp-session-id")
    raw = resp.read().decode()
    s = raw.lstrip()
    payload = None
    if s.startswith("{"):
        payload = json.loads(s)
    else:
        for line in raw.splitlines():
            if line.startswith("data:"):
                payload = json.loads(line[5:].strip())
                break
    return payload, sid_out


_init, sid = post({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                   "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                              "clientInfo": {"name": "schema-puller", "version": "0"}}})
try:
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid)
except Exception:
    pass

tools = []
cursor = None
for _ in range(20):
    params = {} if cursor is None else {"cursor": cursor}
    r, _s = post({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": params}, sid)
    res = (r or {}).get("result", {})
    tools += res.get("tools", [])
    cursor = res.get("nextCursor")
    if not cursor:
        break

print("TOTAL TOOLS ON SERVER:", len(tools))
found = {t["name"]: t for t in tools}
outlist = []
for n in curated:
    t = found.get(n)
    if not t:
        print("  MISSING on server:", n)
        continue
    sch = t.get("inputSchema", {}) or {}
    print(f"  {n}: props={list((sch.get('properties') or {}).keys())} required={sch.get('required', [])}")
    outlist.append({"name": t["name"], "description": t.get("description", ""), "inputSchema": sch})

json.dump(outlist, open(out, "w"), indent=2)
print("WROTE", out, "with", len(outlist), "tools")
