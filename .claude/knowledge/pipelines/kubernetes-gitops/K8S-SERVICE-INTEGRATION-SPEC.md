# Kubernetes Service Integration Spec (the k8s WS4 analog) — DRAFT v0.1

> **Status**: DRAFT, 2026-06-28 · **Audience**: a customer integrating a **read-only Kubernetes MCP service** with a pAIchart **kubernetes-gitops** pipeline.
> **What this is**: the normative contract your k8s service implements so a kubernetes-gitops pipeline can harvest cluster state **safely and autonomously**. pAIchart **publishes** this contract; **you implement and self-certify it through your own change management** — pAIchart does not certify your service.
> **Sibling**: `../network-provisioning/DEVICE-SERVICE-INTEGRATION-SPEC.md` (same shape, device domain).
> **Keywords**: MUST / MUST NOT / SHOULD per RFC 2119.

---

## 0. The model in one paragraph

A pAIchart kubernetes-gitops pipeline produces an **approved-but-unapplied, declarative GitOps change package** (manifests / kustomize overlay / Helm-values diff) — it **never actuates** a cluster (apply is out-of-band: an Argo CD / Flux reconcile or a human-gated `kubectl apply`). The pipeline reaches your cluster **only** through a **read-only Kubernetes MCP service you run and govern**. At run time the pipeline's **Cluster State Harvester** self-provisions your service from a **descriptor** you hand it (register → read-only calls → teardown), harvests current state via many narrow scoped reads, and removes the registration when the run completes. pAIchart stores **no** cluster credentials. The split of responsibility:

| Concern | Owner |
|---|---|
| **R1** read-only `(resource,verb,subresource)` allowlist + typed args · **R2** read-only ServiceAccount + credential resolution · **R8** namespace/cluster-scope authZ · **R10** k8s-aware secret redaction · **denial channel** (`isError`, §6.5) | **Your k8s service** (this spec) |
| **R9** sanitize cluster output before pAIchart's reasoner reads it · **R10-backstop** redact secrets from pAIchart's *own* persisted artifacts · **never actuate** · **JWKS identity + per-service audience** | **pAIchart** (shipped) |

pAIchart hardens its **own** reasoner and artifacts regardless of your service's conformance; **your** half is yours to enforce and self-certify. *Conformance is your governance, not pAIchart's verdict.*

---

## 1. The descriptor (your k8s service, as a JSON file)

Your k8s MCP service is described by **a JSON file you author once** (in your repo — e.g. a GitHub raw URL) carrying **everything `registry(register)` needs**: `name`, `endpoint`, `category`, and `capabilities` (the read-only tools with their schemas). The **task just points at it** (URL, or inline JSON); the pipeline fetches it and **passes its fields straight to `registry(register)`** — the descriptor *is* the registration payload.

```json
{
  "name": "acme-k8s-readonly",
  "description": "Read-only Kubernetes state harvest: get/list/describe on workloads + config + helm values + argo app get. Read-only by construction (verb-enum AND RBAC). Your kubeconfig/ServiceAccount; your namespace scope.",
  "endpoint": "https://k8s.acme.example/mcp",
  "category": "automation",
  "capabilities": {
    "tools": [
      { "name": "get_resource",
        "description": "Get/describe a single namespaced resource (read-only)",
        "inputSchema": { "type": "object", "required": ["resourceType", "namespace", "name"], "additionalProperties": false,
          "properties": {
            "resourceType": { "type": "string", "enum": ["pods","deployments","statefulsets","daemonsets","services","configmaps","ingresses","horizontalpodautoscalers","networkpolicies","poddisruptionbudgets","resourcequotas","limitranges"] },
            "namespace": { "type": "string", "pattern": "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", "maxLength": 253 },
            "name": { "type": "string", "pattern": "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", "maxLength": 253 } } } },
      { "name": "list_resources",
        "description": "List a resource kind in a namespace (read-only)",
        "inputSchema": { "type": "object", "required": ["resourceType", "namespace"], "additionalProperties": false,
          "properties": {
            "resourceType": { "type": "string", "enum": ["pods","deployments","statefulsets","daemonsets","services","configmaps","ingresses","horizontalpodautoscalers","networkpolicies","poddisruptionbudgets","resourcequotas","limitranges"] },
            "namespace": { "type": "string", "pattern": "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", "maxLength": 253 },
            "labelSelector": { "type": "string", "maxLength": 256 } } } },
      { "name": "list_secret_names",
        "description": "List Secret NAMES and keys in a namespace — metadata only, never values (read-only)",
        "inputSchema": { "type": "object", "required": ["namespace"], "additionalProperties": false,
          "properties": { "namespace": { "type": "string", "pattern": "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", "maxLength": 253 } } } }
    ]
  }
}
```

- The descriptor **IS the registration payload** — author it once; the task references the URL or carries it inline.
- `description` is **REQUIRED** (registry `register` rejects a payload without one — min 10 chars; omitting it makes the Harvester's first self-provision attempt fail + retry, observed in the network 2026-06-26 run). Treat it as API docs.
- `endpoint` **MUST** be an external **HTTPS (SSE/Streamable-HTTP)** MCP endpoint. **MUST NOT** be registered on pAIchart's internal lane (`internal://` / `type:'internal'`) — that lane skips input validation and is reserved for pAIchart's first-party services. **This matters more for k8s**: the internal lane also bypasses the policy injection-regex, so your service's own validation (§3) is the *sole* runtime guard regardless — the external lane is non-negotiable.
- `capabilities.tools` **MUST** list **read-only** tools only (§3). Declare each as a full object (`name`+`description`+`inputSchema`) → **schemaVersion 2 / grade A**. **Note:** `capabilities.tools` is **discovery/ergonomics metadata, NOT a security boundary** — what your service actually permits is enforced by your in-handler Zod/`.parse()` (§3) + RBAC (§4), never by the advertised schema. A grade-A descriptor is registry *fidelity*, not a runtime gate.

---

## 2. Identity & trust — what pAIchart sends, what you verify (JWKS + per-service audience)

pAIchart authenticates **each call** with a **short-lived, first-party RS256 JWT** minted per call (`mintMcpToken`) — **no shared secret** is exchanged.

**The token**: Header `alg: RS256`, `kid`; Claims `iss: "https://paichart.app"`, `aud: <your service's audience>` (per-service, RFC 8707 — required, no default), `sub: <pAIchart user id>`, `email`, `role`, `azp`, `scope`, `iat`, `exp` (~15-min TTL), `jti`.

**Your service MUST verify, on every call:**
1. **Signature** against pAIchart's **JWKS** at `https://paichart.app/api/auth/jwks` (select by `kid`; cache + refresh on unknown `kid`; keys rotate ~90-day). **MUST** pin `alg: RS256` (reject `none`/HS256).
2. **`iss` === `https://paichart.app`**.
3. **`aud` === your service's own audience** (reject a token minted for a different service — per-service blast-radius isolation).
4. **`exp`** not passed (and `iat`/`nbf` sane).

Then read `sub`/`email`/`role`/`azp` to drive R2 and R8. **No fallback identity** — verification failure ⇒ reject (401), never a default identity.

---

## 3. R1 — Read-only surface: a `(resource, verb, subresource)` ALLOWLIST, not a verb-set (MUST)

The pipeline is read-only by construction (Phase 0 harvest only) — but your service is the **enforcement boundary**, and in k8s "read-only" is **not** the naive read verbs. Actuation/leak primitives ride *through* allowed verbs.

- Expose a **closed verb-enum of read tools** (`get_resource`, `list_resources`, `list_secret_names`, + optionally `helm_get_values`, `argo_app_get`). **MUST NOT** expose a generic "run kubectl" / free-text passthrough.
- **`resourceType` MUST be a closed `enum` of bare resource KINDS** (pods, deployments, configmaps, …) with **no `subresource` field anywhere** — subresources are denied by default.
- **`secrets` MUST NOT be in the resource enum.** Secret access is **only** via `list_secret_names` (names/keys, metadata only). **MUST NOT** return Secret `data`/`stringData` values, and **MUST NOT** offer a caller-controllable output format (`-o yaml`/`-o json`) that would dump values.
- **MUST NOT** accept a raw/path argument (`--raw`, `rawPath`, `apiPath`) — a raw API path is a universal bypass to `…/exec`, `…/secrets`, anything RBAC permits.
- **MUST exclude** (at the verb-enum AND in RBAC, §4) these read-adjacent actuation/leak primitives: `pods/log` (streams secrets), `pods/ephemeralcontainers` (`kubectl debug`), `exec`/`attach`/`cp`, `nodes/proxy` + `services/proxy` + `pods/proxy`, `serviceaccounts/token` (tokenrequest), CSR `approve`, RBAC `escalate`/`bind`, `impersonate`/`--as`, `eviction`, `scale`, `watch`.
- **Typed arguments only.** Each `inputSchema` is `additionalProperties:false` (`.strict()`), with `namespace`/`name` RFC1123-pattern-validated and `labelSelector` length-capped; your handler **MUST** call its own validator (`.parse()`) at the top. **MUST NOT** string-concatenate args into a shell `kubectl` — use the typed API client (client-go / official client), or if you exec `kubectl`, pass argv as an **array**, never a built string.
- **`namespace` is required, single-valued, RFC1123-validated** — **no implicit all-namespaces** (`-A`). A cluster-wide read is an explicit, reviewed carve-out, never the default.
- On any input that fails the schema or hits an excluded verb, **reject** (see §6.5 for *how* to report it).

> Threats closed: `kubectl debug`/`exec`, `--raw` path traversal, `pods/log` and Secret-value leaks, impersonation, and command-chaining all fail a strict `(resource,verb,subresource)` allowlist with typed args — even against a poisoned task or a steered LLM.

## 4. R2 — Read-only ServiceAccount + credential resolution (MUST)

Defense-in-depth: **RBAC ∧ the verb-enum** — even a verb-enum hole cannot exec/write if the ServiceAccount lacks the verb.

- The service authenticates to the cluster with a **least-privilege read-only ServiceAccount** — RBAC bound to `get`/`list` on **only** the scoped resource types; **no `secrets` get** (use the metadata path), **no `pods/exec`**, no `impersonate`/`escalate`/`bind`, namespace-scoped where possible (a `Role`, not a `ClusterRole`, unless cluster-scope is required).
- Resolve the cluster credential / SA from the **verified `sub`/`email`/`role`** against **your own** store — **pAIchart stores no kubeconfig/SA tokens**. **No fallback / no shared admin SA** — unmapped identity ⇒ reject.
- The SA token / kubeconfig **MUST NOT** appear in tool output, errors, or logs (see R10).

## 5. R8 — Namespace / cluster-scope authorization (MUST)

- Authorize the **verified identity** against the **namespaces/clusters** it may read. Enforce in **your** service — pAIchart does not know your cluster topology or RBAC.
- A user authorized to *launch a pipeline* is **not** automatically authorized to read *every* namespace — R8 is your per-identity, per-namespace gate. Reject out-of-scope reads.

## 6. R10 — k8s-aware secret redaction (MUST)

Redact at your boundary, before output leaves your service. K1 (harvest metadata not values, §3) keeps most secret *values* out by construction, so this is the backstop for the values that legitimately appear in **non-Secret** objects:

- **Token-in-place**: replace only the secret value with a placeholder; preserve the YAML key/structure so the change package's diffs/rollback stay faithful. **MUST NOT** redact whole lines.
- **Coverage** (non-exhaustive — Appendix A): base64 `Secret.data` values (if ever returned — should not be, per §3), `password:`/`token:`/`apiKey:`/`client_secret:` in ConfigMap `data` / Helm values / inline `env[].value`, container `args`/`command` (`--password=`), `kubectl.kubernetes.io/last-applied-configuration` (re-leaks the above), kubeconfig contents, SA/bearer/JWT tokens, connection strings/DSNs, cloud keys (`AKIA…`).
- **Self-certified round-trip**: every placeholder you emit **MUST** be resolvable at apply time, and a rollback built from the redacted package + your store **MUST** be byte-equivalent. Test it in your own pipeline.

## 6.5. Denial channel — report denials as `isError`, NOT a thrown error (MUST)

When your service rejects an out-of-policy call (an excluded verb, a Secret-value read, an RBAC denial, a schema failure), it **MUST** return an MCP tool result flagged **`isError: true`** with a short reason in the content — it **MUST NOT** surface the denial as a JSON-RPC protocol error / transport throw.

> Why this is normative: a denial is the **read-only allowlist doing its job** — the expected outcome of a correctly-confined harvest. pAIchart's harness records an `isError` tool result as a *successful* call (it does not throw), so the Harvester continues with the reads it *can* make and **does not** read the denial as a harvest failure or lower its confidence (the loop treats it as non-degrading **by construction**). A *thrown* error, by contrast, looks like a real failure and would wrongly degrade the run. Keep the denial **reason text free of any secret value** (it reaches pAIchart's reasoner; R9 sanitizes it, but don't put secrets there).

---

## 7. What pAIchart provides (so you don't have to) — and what it does NOT

**Provides (shipped; enable the redactor for k8s/cloud engagements):**
- **R9** — sanitizes everything your service returns *before* pAIchart's reasoner reads it (neutralizes prompt-injection, strips zero-width/ANSI/control chars). A poisoned annotation/ConfigMap/log string can't steer pAIchart's LLM — *regardless* of your service. **Reached only via the `services` gateway** (which the descriptor model guarantees). *(R9 ships flag-gated; its global-enable gate is a platform item.)*
- **R10-backstop** — a coarse secret redactor over pAIchart's **own** persisted artifacts (`report.md`/`result.json`), with k8s families (YAML `key:value`/env `KEY=value` + `AKIA…`). Defense-in-depth, **not** a substitute for your vendor-aware R10. Enable it (`ARTIFACT_SECRET_REDACT_ENABLED`) for k8s engagements — non-Secret GETs leak past RBAC.
- **Never actuates** — the pipeline produces an approved-but-unapplied package; apply is out-of-band (Argo/Flux reconcile or human `kubectl apply`). Your service is never asked to write.
- **JWKS identity + per-service audience** — §2.

**Does NOT provide:**
- **Conformance certification.** pAIchart does **not** verify or attest that your service meets this spec — that would be a certification/change-management authority pAIchart is not. **You** self-certify through your own governance.

---

## 8. Honest residual (Protocol 10 — fact vs. verdict)

pAIchart's `approved` verdict is over **change-package quality**, **not** over the truthfulness of your cluster's reported state. A compromised or buggy k8s service returning **fabricated** state can steer pAIchart into a confidently-wrong `approved` package a human/reconciler then acts on. This is a **named, accepted trust assumption in your trust domain** — it cannot be out-engineered from the orchestration layer. Your R1/R2/R8/R10 + your operational integrity bound it.

---

## 9. Conformance checklist (self-certify)

- [ ] Endpoint is external HTTPS MCP (SSE/Streamable-HTTP); **not** internal-lane.
- [ ] Read surface is a `(resource,verb,subresource)` **allowlist**: `resourceType` a closed enum of bare kinds; **no** `subresource` field; **no** `--raw`/path arg; **no** `secrets` in the enum (metadata-only `list_secret_names`).
- [ ] Excludes `pods/log`, `ephemeralcontainers`, `exec`/`attach`/`cp`, node/service/pod `proxy`, `serviceaccounts/token`, CSR `approve`, RBAC `escalate`/`bind`, `impersonate`, `eviction`/`scale`/`watch` — at the verb-enum **and** in RBAC.
- [ ] Args `additionalProperties:false`, RFC1123-validated, selector-capped, validated with `.parse()`; typed client / argv-array, **no** shell concat; `namespace` required + single-valued.
- [ ] Verifies RS256 via JWKS (by `kid`), `iss`, **per-service `aud`**, `exp`; pins `alg:RS256`; rejects with no fallback identity.
- [ ] Read-only least-privilege ServiceAccount (RBAC ∧ verb-enum); credentials from the verified identity; **no** shared/admin fallback; creds never in output/logs.
- [ ] Authorizes the identity against namespace/cluster scope (R8); rejects out-of-scope.
- [ ] Redacts secrets token-in-place, k8s-aware (Appendix A); placeholder round-trip self-certified byte-equivalent.
- [ ] **Reports denials as `isError: true`, never a thrown error** (§6.5); denial text carries no secret values.

---

## Appendix A — k8s secret-redaction families (normative minimum, non-exhaustive)

| Family | Examples |
|---|---|
| YAML secret keys | `password: …`, `token: …`, `apiKey:`/`api_key:`, `client_secret:`, `private_key:`, `bearer: …`, `dsn:`/`connection_string:` |
| Env literals | container `env[].value` / `KEY=value` for `*PASSWORD*`/`*SECRET*`/`*TOKEN*`/`*API_KEY*`, `DATABASE_URL=…` |
| k8s Secret | base64 `Secret.data` values (should not be returned per §3; redact if they are) |
| Re-leak vectors | `kubectl.kubernetes.io/last-applied-configuration` annotation; container `args`/`command` (`--password=`) |
| Helm | `helm get values` output (user-supplied values — Helm's password home) |
| Cloud / tokens | `AKIA…` AWS keys, kubeconfig contents, SA/bearer/JWT tokens, `Authorization: Bearer …` |

**Rule**: redact the value, keep the key. When in doubt on an unknown secret-shaped key, **redact** (fail-safe).

---

> **Open for this draft** (resolve before publishing): the descriptor `category` guidance for a k8s service; whether to ship a **reference conformant read-only k8s service** as a worked example (doubles as the Phase-4 kind/minikube rig); and where this spec is **published** (public `paichart` repo / docs). Reviewers: oauth-multi-provider (identity §2), mcp-hub (descriptor §1), sec-ops (R1/R2/R8/R10 + §6.5), boundary-contract (the denial channel + redaction boundary).
