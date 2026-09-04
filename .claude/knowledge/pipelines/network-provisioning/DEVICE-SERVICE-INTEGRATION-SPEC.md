# Device-Service Integration Spec (WS4) — DRAFT v0.1

> **Status**: DRAFT, 2026-06-24 · **Audience**: a customer integrating a **device MCP service** with a pAIchart **network-provisioning** pipeline.
> **What this is**: the normative contract your device service implements so a network-provisioning pipeline can use it **safely and autonomously**. pAIchart **publishes** this contract; **you implement and self-certify it through your own change management** — pAIchart does not certify your service.
> **Keywords**: MUST / MUST NOT / SHOULD per RFC 2119.

---

## 0. The model in one paragraph

A pAIchart network-provisioning pipeline produces an **approved-but-unapplied change package** — it **never actuates** a device (apply is out-of-band/human-gated). The pipeline reaches your devices **only** through a **read-only device MCP service you run and govern**. At run time the pipeline's **Network State Harvester** self-provisions your service from a **descriptor** you hand it (register → read-only calls → teardown), harvests current state, and removes the registration when the run completes. pAIchart stores **no** device credentials. The split of responsibility:

| Concern | Owner |
|---|---|
| **R1** read-only command guard + typed args · **R2a** device-credential resolution · **R8** device-scope authZ · **R10** vendor-aware secret redaction | **Your device service** (this spec) |
| **R9** sanitize device output before pAIchart's reasoner reads it · **R10-backstop** redact secrets from pAIchart's *own* persisted artifacts · **never actuate** · **JWKS identity + per-service audience** | **pAIchart** (shipped) |

pAIchart hardens its **own** reasoner and artifacts regardless of your service's conformance; **your** half is yours to enforce and self-certify. *Conformance is your governance, not pAIchart's verdict.*

---

## 1. The descriptor (your device service, as a JSON file)

Your device MCP service is described by **a JSON file you author once** (in your repo — e.g. a GitHub raw URL) that carries **everything `registry(register)` needs to define the service**: `name`, `endpoint`, `category`, and `capabilities` (the read-only tools, with their schemas). The **task just points at it** (the URL, or the JSON inline); the pipeline fetches it and **passes its fields straight to `registry(register)`** — the descriptor *is* the registration payload, no live capability discovery required.

```json
{
  "name": "acme-net-readonly",
  "description": "Read-only Arista/IOS network-state harvest: running-config, interfaces, BGP, etc. Read-only by construction; your device creds; your device scope.",
  "endpoint": "https://devices.acme.example/mcp",
  "category": "automation",
  "capabilities": {
    "tools": [
      { "name": "get_running_config",
        "description": "Return the device's running configuration (read-only)",
        "inputSchema": { "type": "object", "required": ["device"],
          "properties": { "device": { "type": "string", "description": "device id / hostname" } } } },
      { "name": "get_interfaces",
        "description": "List interfaces and status (read-only)",
        "inputSchema": { "type": "object", "required": ["device"],
          "properties": { "device": { "type": "string" } } } }
    ]
  }
}
```

> **RECOMMENDED — scope read tools per-target, and prefer per-target over group/fleet parameters.**
> Each tool result is capped (~8 KB) before the harvester's reasoner sees it, and a config getter
> typically returns multiple variants (running/startup/candidate) per device. A tool that accepts a
> *group/fleet* filter (return all devices in one call) bundles every device's config into one
> response and truncates everything past the first device from the reasoner's view (live incident
> 2026-07-08 — recovered from the forensic tier, but the harvest reasoned on a partial view). Design
> read tools to take a **single `device`/target** (as above) and, for large objects, to support
> section/field projection — so each call returns one target, complete, under the cap. The harvester
> role guidance mandates per-target reads, but the *tool surface* is your lever: don't offer a
> group-wide config read the model can reach for.

- The descriptor **IS the registration payload** — author it once in your repo; the task only references the location (URL) or carries it inline.
- `description` is **REQUIRED** (registry `register` rejects a payload without one — min 10 chars). Omitting it makes the Harvester's first self-provision attempt fail with "description required" and retry with a synthesized string (observed in the 2026-06-26 real-device run). Author a stable description; treat it as API docs (what it does / how it auths / what the caller needs).
- `endpoint` **MUST** be an external **HTTPS (SSE/Streamable-HTTP)** MCP endpoint. A device service **MUST NOT** be registered on pAIchart's internal lane (`internal://` / `type:'internal'`) — that lane skips input validation and is reserved for pAIchart's own first-party services.
- `capabilities.tools` **MUST** list **read-only** tools only (see R1). **Declare each as a full object (`name` + `description` + `inputSchema`)**, not a bare name — full schemas register as **schemaVersion 2 / grade A**, so the pipeline calls them with correct typed args (bare names are schemaVersion 1, lower-fidelity; the live `eia-service` is the grade-A reference).
- `category` — pick the registry category that fits (`automation` / `data-services`); it governs auto-approval vs admin approval at registration. *(Open: a dedicated device/network category — WS4 review item.)*
- The registration is **transient**: the pipeline deletes it at the end of the run. Your service's authorization (R8) — not the registration's lifetime — is the access control.

---

## 2. Identity & trust — what pAIchart sends, what you verify (JWKS + per-service audience)

pAIchart authenticates **each call** to your service with a **short-lived, first-party RS256 JWT** it mints per call — **no shared secret** is ever exchanged.

**The token** (minted by `mintMcpToken`):
- **Header**: `alg: RS256`, `kid: <key id>`.
- **Claims**: `iss: "https://paichart.app"`, `aud: <your service's audience>` (per-service, RFC 8707 — required, no default), `sub: <pAIchart user id>`, `email`, `role`, `azp: <client>`, `scope`, `iat`, `exp` (~15-min TTL), `jti`.

**Your service MUST verify, on every call:**
1. **Signature** — against pAIchart's **JWKS** public keys at `https://paichart.app/api/auth/jwks` (select the key by the token's `kid`; cache JWKS and refresh on unknown `kid` — keys rotate ~90-day). **MUST** pin `alg: RS256` (reject `none`/HS256).
2. **`iss` === `https://paichart.app`**.
3. **`aud` === your service's own audience identity** (reject a token minted for a different service — this is the per-service blast-radius isolation; a token leaked from service A is useless at service B).
4. **`exp`** not passed (and `iat`/`nbf` sane).

**Then** read `sub` (the requesting pAIchart user), `email`, `role`, `azp` to drive R2a and R8. There is **no fallback identity** — if verification fails, the call **MUST** be rejected (401), never served with a default identity.

---

## 3. R1 — Read-only command guard + typed arguments (MUST)

The pipeline is read-only by construction (Phase 0 harvest only) — but your service is the **enforcement boundary**, so it MUST stand on its own:

- Expose **only read-only tools** — a **closed verb-enum** (e.g. `get_running_config`, `get_interfaces`). **MUST NOT** expose any tool that mutates device state (`configure`, `write`, `commit`, `reload`, `copy`, `clear`, `delete`, `enable`-into-exec), and **MUST NOT** expose a generic "run this command" / free-text passthrough.
- **Typed arguments only.** Each tool's `inputSchema` **MUST** declare typed, constrained parameters (device id, interface name as an enum/pattern, etc.) and your handler **MUST** call its own validator (`.parse()` / equivalent) at the top — **MUST NOT** string-concatenate arguments into a device CLI/API call. (pAIchart validates the *outer* MCP envelope; only **you** can validate the device-semantic args.)
- On any input that fails the schema, **reject** — do not coerce, do not best-effort.

> Threat closed: a poisoned task or a steered LLM cannot get your service to run a mutating or free-text command, because the verb set is a closed read-only enum and the args are typed.

## 4. R2a — Downstream credential resolution (MUST)

- Resolve the **device credentials** for the call from the **verified `sub`/`email`/`role` identity** in the token, against **your own** secret store / vault — **pAIchart stores no device credentials**.
- **No fallback / no shared service account.** If the identity maps to no device credential, **reject** — **MUST NOT** fall back to a default, shared, or admin credential.
- Credentials **MUST NOT** appear in tool output, errors, or logs returned to the pipeline (see R10).

## 5. R8 — Device-scope authorization (MUST)

- Authorize the **verified identity** against the **device scope** it is allowed to read (which devices / sites / roles). Enforce this in **your** service — pAIchart does not know your device topology or RBAC.
- A user authorized to *launch a pipeline* is **not** automatically authorized to read *every* device — R8 is your per-identity, per-device gate. Reject out-of-scope reads.

## 6. R10 — Vendor-aware secret redaction (MUST)

Redact secrets **at your boundary**, before output leaves your service — you know your config-secret syntax; pAIchart's backstop (below) is coarse.

- **Token-in-place**: replace only the secret **token** with a placeholder, preserving the directive/line structure so the change package's diffs and rollback stay byte-faithful. **MUST NOT** redact whole lines.
- **Fail-safe default**: redact-by-default on an unrecognized `secret`/`password`/`key`-shaped directive rather than leaking it.
- **Coverage** (non-exhaustive — implement for your platforms; see Appendix A): IOS `enable secret/password`, type-7/8/9, `username … secret/password`, `snmp-server community`, `tacacs/radius … key`, `crypto isakmp key` / `pre-shared-key`, `key-string`, OSPF/EIGRP `message-digest-key … md5`, BGP `neighbor … password`, SNMPv3 `auth-password`/`priv-password`, NX-OS `$5$/$6$`, **Junos `$9$` / `encrypted-password`**, `wpa-psk`, API bearer tokens.
- **Self-certified round-trip** (you certify; pAIchart can't): every placeholder you emit **MUST** be resolvable at apply time, and a rollback built from the redacted package + your vault **MUST** be byte-equivalent to the original. Test this in your own pipeline.

---

## 6.5. Denial channel — report denials as `isError`, NOT a thrown error (MUST)

*(Added 2026-08-16, cross-port review ⑤: this spec predates its k8s (§6.5) and Terraform (§7.5)
siblings, which both carry this section — the denial channel was added to them later and never
back-ported here. The rationale text is domain-neutral and is mirrored near-verbatim.)*

When your service rejects an out-of-policy call (a mutating or free-text verb, a schema failure, an
out-of-scope device, a credential-resolution refusal), it **MUST** return an MCP tool result flagged
**`isError: true`** with a short reason in the content — it **MUST NOT** surface the denial as a
JSON-RPC protocol error / transport throw.

> Why this is normative: a denial is the **read-only guard doing its job** — the expected outcome of
> a correctly-confined harvest. pAIchart's harness records an `isError` tool result as a *successful*
> call (it does not throw), so the Harvester continues with the reads it *can* make and **does not**
> read the denial as a harvest failure or lower its confidence (the loop treats it as non-degrading
> **by construction**). A *thrown* error, by contrast, looks like a real failure and would wrongly
> degrade the run. Keep the denial **reason text free of any secret value** (it reaches pAIchart's
> reasoner; R9 sanitizes it, but don't put secrets there).

> **Reference-rig honesty note**: the cEOS validation rig (`ceos-lab-readonly`) does **not** conform
> to this section — it is unmodified upstream nornir restricted by *descriptor omission* (undeclared
> tools), not by an active verb-enum, so no denial ever fires on it. That is a stated
> non-conformance of the rig, not a precedent. A conformant service enforces R1 server-side and
> reports refusals per this section.

---

## 7. What pAIchart provides (so you don't have to) — and what it does NOT

**Provides (shipped, on by default for the device path):**
- **R9** — sanitizes everything your service returns *before* pAIchart's reasoner reads it (neutralizes prompt-injection patterns, strips zero-width/ANSI/control chars, quarantines the content structurally). So a poisoned device banner can't steer pAIchart's LLM — *regardless* of your service.
- **R10-backstop** — a coarse secret redactor over pAIchart's **own** persisted artifacts (`report.md` / `result.json`), as defense-in-depth. **Not** a substitute for your R10 — it's coarse and yours is vendor-aware.
- **Never actuates** — the pipeline produces an approved-but-unapplied change package; apply is out-of-band/human-gated. Your service is never asked to write.
- **JWKS identity + per-service audience** — §2.

**Does NOT provide:**
- **Conformance certification.** pAIchart does **not** verify or attest that your service meets this spec — that would be a certification/change-management authority pAIchart is not. **You** self-certify conformance through your own governance.

---

## 8. Honest residual (Protocol 10 — fact vs. verdict)

pAIchart's `approved` verdict is over **change-package quality**, **not** over the truthfulness of your device's reported state. A compromised or buggy device service returning **fabricated** state can steer pAIchart into a confidently-wrong `approved` package a human then acts on. This is a **named, accepted trust assumption in your trust domain** — it cannot be out-engineered from the orchestration layer. Your R1/R2a/R8/R10 + your operational integrity are what bound it.

---

## 9. Conformance checklist (self-certify)

- [ ] Endpoint is external HTTPS MCP (SSE/Streamable-HTTP); **not** internal-lane.
- [ ] Every tool is read-only; closed verb-enum; **no** free-text/mutating tool.
- [ ] Every tool validates typed args (`.parse()`); no string-concat into device calls.
- [ ] Verifies RS256 signature via JWKS (`/api/auth/jwks`, by `kid`), `iss`, **per-service `aud`**, `exp`; pins `alg:RS256`; rejects on failure with no fallback identity.
- [ ] Resolves device credentials from the verified identity; **no** shared/default fallback; creds never in output/logs.
- [ ] Authorizes the identity against device scope (R8); rejects out-of-scope.
- [ ] Redacts secrets token-in-place, fail-safe-default, vendor-aware (Appendix A); placeholder round-trip self-certified byte-equivalent.
- [ ] Redaction coverage explicitly includes the **routing-auth families**: BGP `neighbor … password`, OSPF/EIGRP `message-digest-key … md5` + `authentication-key`, ISIS `password`, SNMPv3 `auth-password`/`priv-password`, Junos `$9$`/`encrypted-password` (§6 coverage list / Appendix A — these live in the exact `show run | section router bgp|ospf` reads the pipeline commands).
- [ ] Out-of-policy calls (a mutating/free-text verb, a schema failure, an out-of-scope device) return **`isError: true`** tool results with a secret-free reason — never a thrown/protocol error (§6.5).

---

## Appendix A — Secret-redaction pattern families (normative minimum, non-exhaustive)

| Family | Examples |
|---|---|
| Cisco IOS enable/user | `enable secret 5 …`, `enable password 7 …`, `username X secret/password [type] …` |
| Type-encoded | type-5/7/8/9 hashes; NX-OS `$5$`/`$6$`; **Junos `$9$`**, `encrypted-password "$9$…"` |
| SNMP | `snmp-server community …`, SNMPv3 `auth-password`/`priv-password` |
| AAA | `tacacs-server key …`, `radius-server key …`, `key 7 …` |
| Crypto/VPN | `crypto isakmp key …`, `pre-shared-key …`, `key-string …`, `wpa-psk …` |
| Routing auth | OSPF/EIGRP `message-digest-key N md5 …`, BGP `neighbor X password …` |
| API / tokens | `Authorization: Bearer …`, vendor API keys |

**Rule**: redact the token (the value), keep the directive. When in doubt on an unknown `secret`/`key`/`password`-shaped directive, **redact** (fail-safe).

---

> **Open for this draft** (resolve before publishing): the exact descriptor `category` guidance (which registry categories are appropriate for a device service); whether to ship a **reference conformant service** as a worked example; and where this spec is **published** (the public `paichart` repo / docs site). Reviewers: oauth-multi-provider (identity §2), mcp-hub (descriptor/registration §1), sec-ops (R1/R2a/R8/R10), boundary-contract (the claim-name + redaction boundary).
