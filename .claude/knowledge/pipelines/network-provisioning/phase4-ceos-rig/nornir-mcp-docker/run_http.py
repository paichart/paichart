"""Launch sydasif/nornir-mcp-server over streamable-http.

The upstream repo entrypoint (`nornir_mcp.server:main`) calls `mcp.run()` with no
args, which defaults to STDIO. We import the fully-registered FastMCP instance (tool
decorators run at import time) and run it with an explicit HTTP transport instead —
no edit to the third-party repo. FastMCP streamable-http default path is `/mcp`,
matching the cloudflared route (ceos-lab.paichart.app/mcp) and the descriptor endpoint.

TWIN SUPPRESSION (2026-08-31, r10-serialized-leaf-blindness follow-up): FastMCP
spec-compliantly serializes every structured tool result into a duplicate
content[0].text block ("SHOULD also return unstructured content"). Measured cost on
the pAIchart pipeline: 29.5% of tool-result payload, 88% of harvester Tier-1
truncations, and half the read_more page budget spent re-reading duplicate bytes
(R19 P4 pagination exhaustion). Each Tool consults its .serializer field AT CALL
TIME (fastmcp 2.13.3, tools/tool.py FunctionTool.run), and structuredContent is
built from the raw result independently of it — so a post-import swap suppresses
the text twin while keeping the full parsed payload. Any text-only MCP client of
this service sees the stub; known consumers (pAIchart engine, operators) read
structuredContent.
"""
from typing import Any

from nornir_mcp.server import mcp


def _stub_serializer(data: Any) -> str:
    return "(full payload in structuredContent; serialized text twin suppressed)"


for _tool in mcp._tool_manager._tools.values():
    _tool.serializer = _stub_serializer

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=3107)
