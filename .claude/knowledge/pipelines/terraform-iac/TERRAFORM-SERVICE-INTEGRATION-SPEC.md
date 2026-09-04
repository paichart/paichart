# Terraform Service Integration Spec (the IaC WS4 analog) — DRAFT v0.1

> **Status**: DRAFT, 2026-06-29 · **Audience**: a customer integrating a **read-only Terraform/IaC MCP service** with a pAIchart **terraform-iac** pipeline.
> **What this is**: the normative contract your IaC service implements so a terraform-iac pipeline can harvest cloud/IaC state **safely and autonomously**. pAIchart **publishes** this contract; **you implement and self-certify it through your own change management** — pAIchart does not certify your service.
> **Siblings**: `../kubernetes-gitops/K8S-SERVICE-INTEGRATION-SPEC.md`, `../network-provisioning/DEVICE-SERVICE-INTEGRATION-SPEC.md` (same shape).
> **Keywords**: MUST / MUST NOT / SHOULD per RFC 2119. Folds the 4-specialist review (`cline_docs/reviews/terraform-iac-design-2026-06-29/REVIEW.md`).

---

## 0. The model in one paragraph

A pAIchart terraform-iac pipeline produces an **approved-but-unapplied HCL change package** (a module/`.tf` diff as a **PR**, + expected `plan`, policy facts, rollback) — it **never actuates** (apply is out-of-band: the team's governed `terraform apply` / Atlantis / Terraform Cloud-Enterprise / Spacelift run). The pipeline reaches your state **only** through a **read-only Terraform MCP service you run and govern**. At run time the pipeline's **IaC State Harvester** self-provisions your service from a **descriptor** you hand it (register → read-only calls → teardown), harvests current state via many narrow scoped reads, and removes the registration when the run completes. pAIchart stores **no** cloud/state credentials. The split of responsibility:

| Concern | Owner |
|---|---|
| **R1** read-only verb-enum + **arg-confinement** + the **code-exec deny-set** · **R-runner** sandboxed plan/validate · **K1** state-secret default-deny · **R8** workspace/state authZ · **R10** TF-aware redaction · **denial channel** (`isError`, §7.5) | **Your IaC service** (this spec) |
| **R9** sanitize harvested output before pAIchart's reasoner reads it · **R10-backstop** redact secrets from pAIchart's *own* persisted artifacts (incl. JSON-key TF family) · **never actuate** · **JWKS identity + per-service audience** | **pAIchart** (shipped) |

pAIchart hardens its **own** reasoner and artifacts regardless of your service's conformance; **your** half is yours to enforce and self-certify. *Conformance is your governance, not pAIchart's verdict.*

---

## 1. The descriptor (your IaC service, as a JSON file)

A **JSON file you author once** (in your repo — e.g. a GitHub raw URL) carrying everything `registry(register)` needs: `name`, `description` (**REQUIRED**, min 10 chars), `endpoint`, `category`, `capabilities`. The task points at it; the pipeline fetches it and passes its fields straight to `registry(register)` — the descriptor *is* the registration payload.

```json
{
  "name": "acme-terraform-readonly",
  "description": "Read-only Terraform state harvest: state pull (redacted) + state list (addresses). Drift via sandboxed plan is opt-in. Read-only by construction (verb-enum AND read-only cloud creds). Your backend; your workspace scope.",
  "endpoint": "https://tf.acme.example/mcp",
  "category": "automation",
  "capabilities": {
    "tools": [
      { "name": "state_list",
        "description": "List resource ADDRESSES in a workspace (read-only, zero-provider)",
        "inputSchema": { "type": "object", "required": ["workspace"], "additionalProperties": false,
          "properties": { "workspace": { "type": "string", "enum": ["prod","staging","dev"] } } } },
      { "name": "state_pull",
        "description": "Pull current state for a resource address, REDACTED by the state's own sensitive_attributes (read-only, zero-provider)",
        "inputSchema": { "type": "object", "required": ["workspace", "address"], "additionalProperties": false,
          "properties": {
            "workspace": { "type": "string", "enum": ["prod","staging","dev"] },
            "address": { "type": "string", "pattern": "^[A-Za-z0-9_.\\[\\]\"-]+$", "maxLength": 256 } } } }
    ]
  }
}
```

- The descriptor **IS the registration payload** — author once; the task references the URL or carries it inline.
- `endpoint` **MUST** be an external **HTTPS (SSE/Streamable-HTTP)** MCP endpoint. **MUST NOT** be on pAIchart's internal lane (`internal://`/`type:'internal'`) — that lane skips input validation; your service's own validation (§3) is the *sole* runtime guard regardless, so the external lane is non-negotiable.
- `capabilities.tools` is **discovery metadata, NOT a security boundary** — what your service permits is enforced by your in-handler `.parse()` (§3) + the sandbox (§4) + read-only creds, never by the advertised schema.
- **Do not advertise `plan`/`validate` as default tools.** If you offer drift detection, expose it as an explicit opt-in tool that runs *only* in the §4 sandbox — never as a routine harvest verb.

---

## 2. Identity & trust — what pAIchart sends, what you verify (JWKS + per-service audience)

pAIchart authenticates **each call** with a **short-lived, first-party RS256 JWT** minted per call (`mintMcpToken`) — **no shared secret**.

**The token**: Header `alg: RS256`, `kid`; Claims `iss: "https://paichart.app"`, `aud: <your service's audience>` (per-service, RFC 8707 — required, no default), `sub`, `email`, `role`, `azp`, `scope`, `iat`, `exp` (~15-min TTL), `jti`.

**Your service MUST verify, on every call:** (1) **Signature** against pAIchart's **JWKS** `https://paichart.app/api/auth/jwks` (select by `kid`; cache + refresh on unknown `kid`; ~90-day rotation); **MUST** pin `alg: RS256` (reject `none`/HS256). (2) **`iss` === `https://paichart.app`**. (3) **`aud` === your service's own audience** (per-service blast-radius isolation). (4) **`exp`** not passed. Then read `sub`/`email`/`role` to drive R8. **No fallback identity** — verification failure ⇒ reject (401).

---

## 3. R1 — Read-only surface: verb-enum + arg-confinement + the code-exec deny-set (MUST)

⛔ **In Terraform, the verb-enum does NOT, by itself, contain code execution** — and this is the make-or-break. `plan`/`validate`/`init` execute **arbitrary code on your runner** through surfaces *orthogonal to the verb*: a `data "external"` source runs a program at plan; a malicious **module `source`** (init pulls + runs its code); a malicious **provider `source`** (init downloads a binary that `plan`/`validate` **launch** — the cleanest RCE); `templatefile()`/`file()` read arbitrary files; `-chdir`/`-var-file`/`-target` redirect what's planned. *(Provisioners run at apply, not plan — out of scope; the harness never applies.)* Containment is four controls, not "we only allow plan":

- **Closed verb-enum of read tools.** Default surface = **`state_pull`** (redacted) + **`state_list`** (addresses) — both **zero-provider, zero-init, zero-lock** (they render saved state, launching nothing). Optionally `validate`/`plan` for drift — **opt-in, §4-sandboxed only**. **MUST NOT** expose a generic "run terraform" / free-text passthrough.
- **Deny-set (MUST exclude at the verb-enum AND via read-only creds):** `apply`, `destroy`, `import`, `state rm`, `state mv`, `taint`, `untaint`, `force-unlock`, `console` (expression-eval), **`refresh`** (it *writes* state), `state push`, `replace-provider`, `workspace new`/`delete`, `output` (secret-bearing), `graph`. **`init`/`get` are service-internal only** (they pull + run code) — **never caller-invokable**.
- **⛔ Arg-confinement (the inner guard).** Each verb's `inputSchema` is `additionalProperties:false` (`.strict()`); your handler calls its own `.parse()` at the top. **MUST forbid** `chdir`, `working_dir`, `path`, `var`, `var_file`, module-`source`/override, `target`, `parallelism`, raw passthrough, and any `TF_*`/env injection. The **workspace/config-root is resolved server-side from the verified `sub`** — **never** from caller/LLM input. (`wrapWithSchema` on pAIchart's side validates the *envelope* only; inner args reach you unvalidated — your `.parse()` is the sole gate.)
- **The config you read is YOUR trusted, version-pinned workspace** — never caller-supplied HCL, working dir, module source, or var-file.
- On any input that fails the schema or hits a denied verb, **reject** (see §7.5 for *how*).

> Threats closed: provider/module/`external`-data RCE, `console` eval, `refresh` state-write, `--var`/`-chdir` arg-injection, and raw passthrough all fail a closed verb-enum + `.strict()` args + server-side workspace binding — even against a poisoned task or a steered LLM. What's left (a legit `external`/module data source in *your own* trusted config) is bounded by §4.

## 4. R-runner — sandboxed execution for any `plan`/`validate` (MUST, if offered)

If — and only if — you offer the opt-in `plan`/`validate` drift path, it **MUST** run in a contained runner (the default `state_pull`/`state_list` path needs none — it launches nothing):

- **Ephemeral** (per-call, torn down after) and **network-egress-restricted** to the provider registry + state backend **only** — no general internet.
- **Least-privilege read-only cloud credentials** (the provider refresh/data-sources can only read).
- **Modules + providers pinned/vendored** — `-plugin-dir` against a private mirror, `init -upgrade=false`, a module allowlist — so even your own trusted config can't pull an unreviewed source.
- **`-lock=false` (or a state read-replica)** so a drift harvest can't block the team's CI `apply`. *(`plan` never writes state — the lock is a consistency guard, not a write — so `-lock=false` is safe; it's the floor, a replica is not mandatory.)*

> This bounds the blast radius of the §3 residual: if your trusted config legitimately contains an `external`/module data source, it executes inside a no-egress, read-only-credentialed, throwaway sandbox.

## 5. K1 — state-secret default-deny: the moat (MUST)

`.tfstate` embeds secret **values** inline (passwords, keys, certs, connection strings) — the densest secret surface of any domain. **The moat is that this never reaches pAIchart's LLM.**

- **Harvest by `state pull`** (raw state JSON, zero-provider) and **redact by the state's own `sensitive_attributes`** markers (Terraform records, per resource instance, which attributes are sensitive — in-state, no provider needed). Emit resource **shape + addresses + drift**, **never** a `sensitive`/`sensitive_attributes` **value** or raw state.
- **`output` is denied** (§3) — it is secret-bearing.
- **K1 is the SOLE state defense.** pAIchart's R10 backstop (§9) is a `report.md`-prose net only — it **cannot** catch an arbitrary state secret value (a JSON leaf that has lost its key directive). If K1 leaks a value, nothing downstream re-catches it. Get this right or the moat collapses.
- **Self-certified round-trip**: every placeholder you emit **MUST** resolve at apply time; a rollback from the redacted package + your store **MUST** be byte-equivalent.

## 6. R8 — workspace / state authorization (MUST)

- Authorize the **verified identity** against the **workspaces/state** it may read. Enforce in **your** service — pAIchart does not know your backend topology.
- A user authorized to *launch a pipeline* is **not** automatically authorized to read *every* workspace — R8 is your per-identity, per-workspace gate. Reject out-of-scope reads.

## 7. R10 — TF-aware secret redaction (MUST)

Backstop for any secret value that legitimately appears outside the `sensitive_attributes` net (non-sensitive-marked attrs, module outputs surfaced in prose):

- **Token-in-place**: replace only the value with a placeholder; preserve the HCL/JSON key + structure (diffs/rollback stay faithful). **MUST NOT** redact whole lines.
- **Coverage** (Appendix A): `password`/`token`/`secret_key`/`access_key`/`client_secret`/`private_key` in HCL, `*.tfvars`, and `state pull` JSON; provider creds; `AKIA…`; connection strings.

## 7.5. Denial channel — report denials as `isError`, NOT a thrown error (MUST)

When your service rejects an out-of-policy call (a denied verb, an arg-confinement failure, an RBAC/R8 denial, a schema failure), it **MUST** return an MCP tool result flagged **`isError: true`** with a short reason — it **MUST NOT** surface the denial as a JSON-RPC protocol error / transport throw.

> Why normative: a denial is the **read-only allowlist doing its job** — the expected outcome of a correctly-confined harvest. pAIchart's harness records an `isError` result as a *successful* call (it does not throw), so the Harvester continues with the reads it *can* make and **does not** lower its confidence (non-degrading **by construction**). A *thrown* error looks like a real failure and would wrongly degrade the run. Keep the denial **reason text free of any var/state value** (R9 sanitizes it, but don't put secrets there).

## 8. The service self-defends for ANY caller stage (MUST)

**Do not rely on "only the Harvester calls me."** pAIchart tool access is **user-scoped, not template-scoped** — within a run window, the Architect/Author/Reviewer stages *can* reach your registered service. Your R1/arg-confinement/§4/K1/R8 are the **sole** gate, enforced identically regardless of which stage calls. Never gate on the calling persona.

---

## 9. What pAIchart provides — and what it does NOT

**Provides (shipped; enable for IaC engagements):**
- **R9** — sanitizes everything your service returns *before* pAIchart's reasoner reads it (prompt-injection neutralized, zero-width/ANSI/control stripped). Reached only via the `services` gateway (the descriptor model guarantees it). Tag/output/module-source strings are attacker-influenceable — R9 covers them regardless of your service.
- **R10-backstop** — a coarse secret redactor over pAIchart's **own** persisted artifacts, **with a JSON-quoted-key TF family** (`"key":"value"`) for state-shaped prose. Defense-in-depth, **not** a substitute for your K1/R10. Enable `ARTIFACT_SECRET_REDACT_ENABLED`.
- **Never actuates** — the pipeline produces a PR; apply is the team's out-of-band governed run. Your service is never asked to write.
- **JWKS identity + per-service audience** — §2.

**Does NOT provide:** **Conformance certification.** pAIchart does not verify or attest your service meets this spec. **You** self-certify through your own governance.

---

## 10. Honest residual (Protocol 10 — fact vs. verdict)

pAIchart's `approved` verdict is over **change-package quality**, **not** over the truthfulness of your reported state. A compromised or buggy IaC service returning **fabricated** state (or a torn read from a `-lock=false` harvest taken mid-`apply`) can steer pAIchart into a confidently-wrong `approved` package a human then merges. This is a **named, accepted trust assumption in your domain** — it cannot be out-engineered from the orchestration layer. Your R1/§4/K1/R8 + operational integrity bound it; prefer a state snapshot over a live mid-apply read.

---

## 11. Conformance checklist (self-certify)

- [ ] Endpoint is external HTTPS MCP (SSE/Streamable-HTTP); **not** internal-lane.
- [ ] Default surface is `state_pull` (redacted) + `state_list` only — **zero-provider, zero-lock**; `plan`/`validate` are opt-in and §4-sandboxed.
- [ ] Deny-set excluded at the verb-enum AND via read-only creds: `apply`/`destroy`/`import`/`state rm`/`state mv`/`taint`/`force-unlock`/`console`/`refresh`/`state push`/`replace-provider`/`workspace new`+`delete`/`output`/`graph`; `init`/`get` service-internal only.
- [ ] Args `additionalProperties:false`, `.parse()`-validated; **forbids** `chdir`/`working_dir`/`path`/`var`/`var_file`/`source`/`target`/`parallelism`/`TF_*`; workspace resolved **server-side from `sub`**, never caller input.
- [ ] Any `plan`/`validate` runs in an ephemeral, egress-restricted (registry+backend only), read-only-credentialed sandbox with pinned/vendored modules+providers; `-lock=false`/replica.
- [ ] **K1**: harvest by `state pull`, redact by the state's `sensitive_attributes`; never raw state or sensitive values; `output` denied.
- [ ] Verifies RS256 via JWKS (by `kid`), `iss`, **per-service `aud`**, `exp`; pins `alg:RS256`; no fallback identity.
- [ ] Authorizes the identity against workspace/state scope (R8); rejects out-of-scope.
- [ ] Redacts secrets token-in-place, TF-aware (Appendix A); placeholder round-trip self-certified byte-equivalent.
- [ ] **Self-defends for ANY caller stage** (§8); gates identically regardless of persona.
- [ ] **Reports denials as `isError: true`, never a thrown error** (§7.5); denial text carries no var/state values.

---

## Appendix A — Terraform secret-redaction families (normative minimum, non-exhaustive)

| Family | Examples |
|---|---|
| State sensitivity | every attribute named in a resource instance's `sensitive_attributes` (the primary K1 mechanism) |
| HCL / tfvars keys | `password`, `token`, `secret_key`, `access_key`, `client_secret`, `private_key`, `passphrase`, `connection_string` as `key = "…"` |
| JSON (`state pull`) | the same keys as `"key": "value"` (machine output is JSON — the quoted-key form) |
| Provider creds | AWS `AKIA…` / `aws_secret_access_key`, Azure `client_secret`/`sas_token`, GCP SA key JSON, `ARM_*`/`GOOGLE_CREDENTIALS` |
| Re-leak vectors | module `outputs` surfaced into prose; `templatefile()`-rendered values |

**Rule**: redact the value, keep the key. When in doubt on an unknown secret-shaped attribute, **redact** (fail-safe). For state, prefer the `sensitive_attributes` allowlist over keyword-guessing.

---

> **Open for this draft** (resolve before publishing): whether `terraform state pull` reliably carries `sensitive_attributes` for the redactor and is truly zero-provider in practice (**Phase-4 empirical check, D1**); the concrete §4 sandbox (LocalStack vs ephemeral runner — **D2**); whether to ship a **reference conformant read-only TF service** (doubles as the Phase-4 rig); and where this spec is **published**. Reviewers: sec-ops (R1/§4/K1 + §7.5), oauth-multi-provider (identity §2), mcp-hub (descriptor §1), boundary-contract (denial channel + redaction boundary).
