# Real-Device Validation — Fresh-Session Kickoff Prompt (PROVEN)

> **Proven artifact.** Pasted into a fresh Claude Desktop session 2026-06-25 — provisioned an
> Arista cEOS lab one-shot and ran the network-provisioning protocol against it; **R9 + R10
> validated against real EOS output** (R10 coverage extended for the EOS `secret sha512 $6$…`
> syntax). Kept here as the worked example of a fresh-session kickoff prompt
> (cf. `SPECIALIST-REVIEW-PROMPT.md`, the review-gate equivalent). The generic anatomy of such
> a prompt is the appendix of `../PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md`.

```
Continue the network-provisioning work: set up an Arista cEOS test rig for REAL-DEVICE
VALIDATION (roadmap Phase 4) of the network-provisioning protocol.

CONTEXT (see memory project_network_provisioning_spike + cline_docs/network-provisioning-promotion/ROADMAP.md):
The whole capability is SHIPPED + LIVE on prod — WS1 (R9 sanitizer) + WS2 (R10 redactor)
shipped/reviewed/flag-gated; WS3 dropped (out-of-lane change management); the
network-provisioning-protocol + 4 templates + role-guidance promoted to production and
SEEDED on prod (2026-06-25); HOWTO done; UC01 honest; WS4 device-service integration spec
drafted at .claude/knowledge/pipelines/network-provisioning/DEVICE-SERVICE-INTEGRATION-SPEC.md.
The spike only validated the cognition layer against a context7 STAND-IN — now validate it
against a real (simulated) device.

DECIDED APPROACH (Arista cEOS — Cisco ruled out: no Cisco account + CSR1000v needs ~4GB/KVM):
- 2-node Arista cEOS topology in Docker on prod via containerlab (kind: arista_ceos).
  cEOS is a true container (~1-2GB/node, no KVM/cgroups-v1 needed) — fits prod's ~6GB usable.
- Drive it with the Nornir MCP server (sydasif/nornir-mcp-server): NAPALM-eos read-only
  getters over eAPI (get_config/get_interfaces/get_facts/get_bgp_neighbors) = our Phase-0
  read-only harvest surface. Netmiko config tools = apply; our protocol never calls them.
- Register the read-getter set as a pAIchart device SERVICE; the descriptor (per the WS4
  spec) carries name/endpoint/category + read-only capabilities.tools. Then run a
  "(protocol: network-provisioning)" PIPELINE task pointed at it.

PROD FACTS (<PROD_HOST>, ssh root@ works in-session): Docker 29.5.2, /dev/kvm present
(cEOS doesn't need it), cgroups v2, ~6GB usable RAM, 4 vCPU, 48G disk/13G free. Running a
sim on the prod host is Steve's choice — watch RAM (an OOM would hit paichart-mcp/web).

PREREQ (Steve's, before we wire it): a FREE Arista account → download cEOS-lab-<ver>.tar.xz →
`docker image import ...tar ceos:<ver>` on prod. Ask Steve if this is done before assuming.

DELIVERABLES to draft (mostly copy-paste once the cEOS image is on prod):
1. 2-node containerlab topology file (arista_ceos, ceos:<ver>, linked).
2. cEOS startup-config enabling eAPI (`management api http-commands` + a mgmt user/IP).
3. Nornir MCP devices.json/inventory for the two cEOS nodes (platform=eos, eAPI).
4. The pAIchart descriptor JSON (read-only EOS getters as capabilities.tools, full
   name+description+inputSchema for schemaVersion-2/grade-A) per the WS4 spec §1.

HONEST CAVEAT: the Nornir MCP authenticates to the device with static creds, NOT the
JWKS-forwarded identity our WS4 spec mandates (R2a) — so it is NOT WS4-conformant. That's
fine for validating the COGNITION pipeline (harvest → design → change-package against real
EOS output). Full WS4 conformance (JWKS) is a later layer.

Start by confirming with Steve whether the cEOS image is on prod yet, then draft the 4
deliverables. Standing constraints still apply (no Claude co-author trailers; commit direct
to main; prefer MCP over psql; verify file:line before citing).
```
