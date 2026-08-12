# Masters Project Brief — An MCP Server for Network Devices

**Proposed by**: pAIchart · **Status**: open, unclaimed · **Last updated**: 2026-08-12
**Suggested duration**: one masters project cycle (indicatively 6–9 months part-time)
**Industry contact**: see [Supervision and support](#supervision-and-support)

---

## Summary

Build an **MCP (Model Context Protocol) server that exposes network devices to AI systems, safely**.

The project starts from an existing open-source implementation, analyses why it cannot be used against
a production-grade AI platform, and delivers a design that closes those gaps — with the security
half treated as a first-class requirement rather than an afterthought.

The student ends with a working, deployable server; a comparative analysis of the vendor-abstraction
and transport options; and a defensible evaluation against a published integration contract.

---

## Background

AI agents are increasingly used to *design* infrastructure change — reading live device state,
proposing configuration, and reviewing it before a human applies it. To read that state, the agent
needs a way to reach the devices.

**MCP** (Model Context Protocol) is the emerging open standard for exposing tools and data to AI
systems. An MCP *server* publishes a set of callable tools; an AI platform acts as the *client*.

For network infrastructure, this creates an unusual security situation. The MCP server sits inside the
operator's network, holds credentials to production devices, and is called by a system driven by a
language model. Everything that model reads — including text an attacker may have planted in a device
banner or interface description — becomes input to its reasoning. The server is therefore not merely
an API wrapper; it is a **trust boundary**.

### The gap

At the time of writing there is **no publicly available, production-grade MCP server for network
devices**. Existing open-source efforts are useful proofs of concept but are not deployable against a
real platform. This project addresses a genuine and currently unfilled need.

---

## Aims and objectives

**Aim** — to design, build and evaluate an MCP server that allows an AI platform to read state from
multivendor network devices, under a security model appropriate to production infrastructure.

**Objectives**

1. **Survey** the current landscape: existing MCP servers for network infrastructure, and the Python
   automation ecosystem beneath them (NAPALM, Nornir, netmiko, NETCONF/RESTCONF, vendor-native APIs).
2. **Analyse** the gap between an existing implementation and the requirements of a real integration
   target — transport, identity, authorization, credential handling, and output safety.
3. **Design** a server that closes those gaps, justifying the vendor-abstraction choice against
   alternatives rather than assuming one.
4. **Implement** it, targeting at least one vendor platform end-to-end and demonstrating the
   abstraction across at least two.
5. **Evaluate** it against the stated conformance contract, and report honestly on what is and is not
   satisfied.

Objective 2 is the analytical core of the project and is expected to form its strongest chapter.

---

## Starting point

[`sydasif/nornir-mcp-server`](https://github.com/sydasif/nornir-mcp-server) is a working open-source
MCP server built on Nornir and NAPALM. It is a reasonable point of departure — and its limitations are
the project's problem statement.

**A worked deficiency, as an illustration.** Its entry point calls `mcp.run()` with no arguments,
which defaults to the **stdio** transport — usable only by a client on the same machine. A remote AI
platform needs an HTTP transport. That single line is the difference between a local demo and a
deployable service, and finding the rest of that class of gap is the student's task.

Other dimensions worth examining: whether callers are authenticated at all; where device credentials
come from and whether they are shared; whether any authorization exists between a caller and the
devices they may read; whether tool output is checked before being returned; and whether the exposed
tool set can be made to mutate device state.

> The student is **not** expected to adopt this codebase. Forking it, wrapping it, or replacing it are
> all legitimate outcomes — provided the choice is argued.

### The vendor-abstraction question

**NAPALM** is the suggested starting point. It provides a normalized read API across vendor platforms —
`get_interfaces()` returns the same structure from an Arista switch as from a Juniper router — with
drivers for Arista EOS (`eos`), Cisco IOS/IOS-XE (`ios`), Cisco NX-OS (`nxos`) and Juniper Junos
(`junos`).

That normalization is what makes a *single* server multivendor. It should nonetheless be evaluated,
not assumed. Relevant trade-offs include coverage of the normalized model versus vendor-native data,
the quality gap between core and community drivers, transport differences between platforms, and
whether a NETCONF/YANG-native approach would serve better for some vendors.

⚠️ **Note for scoping**: NAPALM's driver object also exposes configuration-*writing* methods
(`load_replace_candidate`, `commit_config`, `rollback`) and an arbitrary-command method (`cli`).
Keeping these unreachable is a design requirement, not an implementation detail — see R1 below.

---

## The integration contract

The server must be callable by an AI platform that treats it as an untrusted component. The following
requirements are drawn from pAIchart's device-service integration specification, which will be
supplied in full by the industry contact. They define what "correct" means for the evaluation.

| Ref | Requirement |
|---|---|
| **Identity** | Verify a signed token on **every** call: RS256 signature against the platform's published JWKS keys (selected by key id, with rotation handled), plus issuer, audience and expiry. Pin the algorithm; reject `none` and symmetric algorithms. **No fallback identity** — a failed verification is rejected, never served with a default. |
| **R1 — Read-only surface** | Expose read-only tools only, as a **closed verb enumeration**. No mutating tool, and no free-text "run this command" passthrough. Every tool declares a typed schema and validates its arguments; arguments are never string-concatenated into a device call. |
| **R2a — Credential resolution** | Resolve device credentials from the **verified caller identity**, against the operator's own secret store. No shared service account and no fallback credential. Credentials never appear in output, errors or logs. |
| **R8 — Device-scope authorization** | Authorize the verified identity against the devices it may read. A user permitted to *use the platform* is not automatically permitted to read *every device*. |
| **R10 — Secret redaction** | Redact secrets from output before it leaves the server, with **vendor-aware** patterns (Cisco type-5/7/8/9, Juniper `$9$`, SNMP communities, TACACS/RADIUS keys, pre-shared keys, routing-protocol authentication…). Replace only the secret **token**, preserving the surrounding directive so that diffs and rollbacks remain faithful. Default to redacting an unrecognised secret-shaped directive rather than leaking it. |

A **conformance checklist** derived from these requirements is supplied with the full specification and
is recommended as the project's evaluation instrument.

### An honest limitation, worth discussing in the thesis

None of the above prevents a *compromised or faulty* server from returning **fabricated** device state,
which could steer an AI platform into a confidently wrong result. This cannot be engineered away from
the platform side — it is a named, accepted trust assumption. A thoughtful treatment of where that
boundary sits, and what operational controls bound it, would strengthen the work considerably.

---

## Lab environment

Two routes, solving **different** problems. The first proves the architecture; the second proves the
multivendor claim. They are best sequenced in that order.

### Route A — containers on a laptop (recommended start)

Arista **cEOS-lab** is a free download and runs under
[containerlab](https://containerlab.dev). A two-node fabric stands up in roughly two minutes on an
ordinary laptop, with no hardware, budget request or lab booking. pAIchart can supply a working
topology file and device startup configurations.

This is sufficient for the entire contract above — transport, identity, authorization, redaction — and
removes the most common way projects of this kind stall: no device to test against.

### Route B — multivendor

Needed only once Route A works, and largely achievable **virtually**:

| Platform | Vendor | NAPALM driver |
|---|---|---|
| cEOS-lab | Arista | `eos` |
| vJunos-switch / vJunos-router | Juniper | `junos` |
| Nexus 9000v | Cisco | `nxos` |
| SR Linux | Nokia | *(community)* |

All are containerlab-supported. **Verify current licensing and availability directly with each
vendor** — terms change.

**The practical constraint is memory, not licensing.** cEOS is light (≈2 GB); the full VM platforms
want 4–5 GB each. A three-vendor lab therefore wants 16–32 GB of RAM — which is a much easier request
to a university IT department than borrowing physical switches.

### Route C — physical devices

If a teaching lab can lend real equipment, this materially strengthens the work: hardware validation
surfaces timing, transport and platform-output behaviour that virtual platforms hide.

> ⚠️ **Safety requirement.** Read-only intent must be enforced **on the device**, not only in the
> server's code. The server's verb allowlist is application-layer and, at this stage, unproven — while
> reading a full running configuration on some platforms requires a high-privilege account, which is
> precisely the credential that could cause damage through a defect in that allowlist. The device
> account should be **incapable** of entering configuration mode, enforced by AAA / RBAC / privilege
> level and verified by attempting it and failing.
>
> **Teaching-lab equipment only.** Never point this at a network carrying live traffic.
>
> This is not an aside — it is the project's own security argument in miniature: two independent
> controls, at different layers, that fail independently. Having actually done it makes for a much
> better answer at the defence.

---

## Deliverables

1. **Software** — the MCP server, with source, tests, and instructions to build and run it.
2. **Conformance evaluation** — a run of the checklist with results stated honestly, including any
   requirement not met and why.
3. **Reproducible lab** — topology and configuration allowing an examiner to stand up the environment.
4. **Thesis** — following the analytical spine below.

### Suggested thesis structure

| Chapter | Content |
|---|---|
| 1. Background | MCP, agentic infrastructure automation, the security framing |
| 2. Survey | Existing servers; the Python network-automation ecosystem |
| **3. Gap analysis** | **Deficiencies of the current state against a real integration contract — the evaluative core** |
| 4. Design | Architecture and the vendor-abstraction decision, with alternatives considered and rejected |
| 5. Implementation | The build |
| 6. Evaluation | Conformance results; multivendor validation; limitations |
| 7. Conclusions | Findings, and what a production deployment would still require |

---

## Indicative milestones

| # | Milestone | Why here |
|---|---|---|
| 1 | Survey and gap analysis complete | Sets the requirements the rest is judged against |
| 2 | Lab running; a single read tool reachable over HTTP transport end-to-end | Proves the transport gap is closed |
| 3 | **Identity verification enforced**: calls with no token, a wrong-audience token, and an expired token all rejected | See the risk note below |
| 4 | Authorization + credential resolution from verified identity | Completes the security half |
| 5 | Secret redaction with a test corpus | The most reusable single artefact |
| 6 | Second vendor platform demonstrated | Substantiates the multivendor claim |
| 7 | Conformance evaluation + thesis | — |

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| **The security half arrives last, as a stub.** Device tooling is gratifying; JWKS validation is not. This is the most likely way the project under-delivers. | Milestone 3 is placed deliberately early and should be treated as a gate, not a stretch goal. |
| **MCP specification churn.** The transport story has already moved once (SSE → streamable HTTP). Writing against a moving target costs weeks. | Pin a specification version at the outset and record subsequent changes as a *finding* — integrating with an evolving protocol is a legitimate observation. |
| **Scope creep across vendors.** Every additional platform is tempting and none is free. | Two platforms proven beats five attempted. Depth over breadth. |
| **No device access.** The classic stall. | Route A removes this entirely — start there. |
| **Intellectual property.** Some institutions claim ownership of student work, which can complicate open-sourcing. | Check the university's IP policy **before** starting, not at submission. |

---

## Learning outcomes

- The Model Context Protocol, and the design of tool surfaces for AI consumers
- Applied security engineering: token verification, authorization, credential handling, and output
  sanitisation, in a setting where each has a concrete adversary
- Multivendor network automation and the trade-offs of abstraction layers
- Integrating against a live external platform and an externally-imposed contract
- Evaluating one's own work against a specification written by someone else — a skill much closer to
  professional practice than a self-defined success criterion

---

## Supervision and support

pAIchart offers, at no cost and with no claim on the outcome:

- The **full device-service integration specification** and its conformance checklist
- A **working containerlab topology** and device startup configurations (Route A)
- A **platform account** and a registered service, so identity forwarding can be tested end-to-end
  against a real hub rather than a mock
- **Technical review** at each milestone, from the engineers who built the platform side
- A **published, worked example** of a conformant service descriptor:
  [`descriptors/ceos-lab-readonly-descriptor.json`](../descriptors/ceos-lab-readonly-descriptor.json)

**What we do not ask for.** No IP assignment, no exclusivity, no obligation to deliver anything to us.
pAIchart is building its own implementation independently; this project is **not** on our delivery
path, and the student is under no pressure from it. Publish the result, keep the copyright, and
license it however the university prefers.

The one thing we would genuinely value is a copy of the **gap analysis** — an outside assessment of
where our integration contract is unclear, unreasonable, or wrong is worth more to us than the code.

---

## References

- Model Context Protocol — <https://modelcontextprotocol.io>
- NAPALM — <https://github.com/napalm-automation/napalm>
- Nornir — <https://github.com/nornir-automation/nornir>
- `sydasif/nornir-mcp-server` — <https://github.com/sydasif/nornir-mcp-server>
- containerlab — <https://containerlab.dev>
- pAIchart architecture and verification record — [`../verification/`](../verification/)
