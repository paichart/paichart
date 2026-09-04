# Security policy

## Reporting a vulnerability
Email **security@paichart.com** (the same contact published at `/.well-known/security.txt`).
Please include steps to reproduce and the version or commit. You will get an acknowledgement within
three business days and a fix or a mitigation plan as quickly as severity warrants; we ask that you
give us reasonable time before public disclosure.

## Scope
- This repository (the platform: web app + MCP server).
- The hosted service at paichart.app is a separate deployment of this code; findings there are
  welcome at the same address.

## What is *not* a vulnerability
- Anything reachable only by an account the operator has made `SUPER_ADMIN` (that role bypasses the
  permission table by design; see `docs/RUNNING.md` → Roles).
- Self-host misconfiguration that the documented verification steps would have caught
  (`docs/VERIFYING-SELF-HOST.md`) — though a clearer error message is always a welcome issue.

## Supported versions
The `main` branch. There are no maintained release lines yet.
