# Device-Service Descriptor Specification

**Status**: v1.0 · 2026-08-16 · JSON Schema: [`descriptor.schema.json`](./descriptor.schema.json)

A **descriptor** is a small JSON document that tells a pAIchart pipeline how to reach *your*
read-only MCP service for the duration of one run. You govern the service — your credentials, your
device scope, your redaction. The descriptor is the handoff: the pipeline's harvester
**self-provisions** the service from it (register → read-only calls → teardown), so pAIchart never
stores your device or cloud credentials, and the registration does not outlive the run.

The four `*.json` files in this directory are conforming, production-exercised examples — network
devices ([cEOS](./ceos-lab-readonly-descriptor.json)), Kubernetes
([kind](./k8s-readonly-descriptor.json)), Terraform
([LocalStack](./terraform-readonly-descriptor.json)), and a docs service
([context7](./context7-descriptor.json)).

Validate yours before a run:

```bash
npx ajv-cli validate -s descriptor.schema.json -d my-descriptor.json
```

---

## Lifecycle — what the platform does with it

1. **You hand it over** — inline in the pipeline task body, or as a URL the harvester fetches.
   Any fetchable location works; a **raw** GitHub URL (`raw.githubusercontent.com/...`) is the
   common case. The harvester retrieves URL-hosted descriptors through the browser service (the raw
   URL must render the JSON as page text), then parses it.
2. **Register** — the harvester calls `registry(action: 'register')` with the descriptor's `name`,
   `endpoint`, `category`, and `capabilities.tools`. An auto-approving category lands the service
   `ACTIVE` and callable immediately; a manually-approved category blocks the harvest until an
   admin approves — for an unattended run, use an auto-approving category.
3. **Harvest** — read-only tool calls only, drawn from the tools the descriptor declares.
4. **Teardown** — `registry(action: 'delete')` at the end of the run, **whether the run approved
   or escalated**. A revision run re-provisions from the same descriptor.

## Fields

| Field | Required | Constraint | Notes |
|---|---|---|---|
| `name` | **yes** | 1–100 chars, `^[a-z0-9-]+$` (lowercase kebab) | Must be unique in the registry at run time; reserved first-party names are rejected. Pick something collision-safe (`acme-eos-readonly`, not `network`). |
| `endpoint` | **yes** | valid URL, `https://`, `http://`, or `mcp://` scheme | Your MCP service's endpoint. Use `https://` — the platform reaches it from the internet, and SSRF policy blocks private/metadata addresses. |
| `description` | recommended | free prose | What the service exposes and — importantly — what it deliberately does not (see the examples). Surfaced verbatim to discovering agents. |
| `category` | recommended | `ai-intelligence` \| `data-services` \| `automation` \| `monitoring` \| `communication` \| `security` | Drives the approval path (step 2 above). |
| `version` | optional | semver `^\d+\.\d+\.\d+$` | Defaults to `1.0.0`. |
| `capabilities.tools` | **yes** (for a harvest service) | array of MCP tool definitions: `{ name, description, inputSchema }` | **Declare only the read-only subset.** See "The read-only contract" below. |
| `capabilities.transport` | optional | e.g. `streamable-http` | Informative; the platform derives transport from the endpoint scheme. |
| `authType` | optional | `API_KEY` \| `BEARER_TOKEN` \| `OAUTH2` \| `HMAC` \| `NONE` | How callers authenticate to *your* service. |
| `_comment` | optional | free prose | Provenance, caveats, rig notes. Encouraged — the cEOS example shows the honest-caveat style. |

Unknown extra fields are tolerated (forward compatibility), but prototype-pollution keys
(`__proto__`, `constructor`, `prototype`) are stripped at the platform boundary — don't rely on them.

## The read-only contract — and an honest boundary

Three rules, in decreasing order of what they guarantee:

1. **The service must be read-only by construction.** A verb-enum allowlist, least-privilege
   credentials (RBAC ServiceAccount, NAPALM getters, zero-provider `state pull`), server-side.
   This is the only rule that is *enforcement*.
2. **The descriptor declares only the read-only subset.** If your service also physically exposes
   mutating tools, leave them out of `capabilities.tools` — the pipeline never sees or offers what
   the descriptor doesn't declare. **Be honest about what this is**: a restriction of the offer
   surface, not an authorization boundary. Rule 1 is what actually stops a mutation; rule 2 is what
   stops it being *attempted*. The cEOS example does exactly this (declares `list_devices` +
   `fetch_data`; the underlying service also exposes `apply_config`, undeclared).
3. **Out-of-policy calls return `isError`, not a protocol error.** When a caller asks for something
   your allowlist refuses (a secret *value*, an exec, a mutating verb), return an MCP tool result
   with `isError: true` and a plain-prose reason — do not throw. The pipeline treats an `isError`
   refusal as a **non-degrading expected outcome** (the allowlist doing its job); a thrown error is
   treated as service failure and degrades the run's quality signals. The k8s and Terraform
   examples state this contract in their descriptions.

## Secret hygiene (service-side, yours)

- **Metadata, never values**: secret *names* and key names may surface; values never leave your
  side (`list_secret_names` in the k8s example).
- **Redact by your own source of truth**: the Terraform example redacts by the state's
  `sensitive_attributes` and never returns raw state — secret-dense `.tfstate` never enters an LLM.
- pAIchart hardens its own side independently (treats your service's output as untrusted before its
  reasoner reads it; keeps a secret-redaction backstop on persisted artifacts) — but that is a
  backstop, not a substitute for redacting at your boundary.

## What a descriptor never carries

**Credentials.** Device passwords, kubeconfigs, cloud keys, tokens — none of it. Your service holds
its own credentials; the descriptor only says where the service is and what it offers. This is the
property that makes the whole lifecycle work: a descriptor is safe to host in a public repo (these
four are), and pAIchart has nothing to store, rotate, or leak.

## Authoring checklist

- [ ] `name` is kebab-case, unique, and specific to you
- [ ] `endpoint` is `https://` and internet-reachable
- [ ] `category` is auto-approving if the run is unattended
- [ ] `capabilities.tools` lists **only** read-only tools, each with a real `inputSchema`
      (enums and `additionalProperties: false` where you can — a tight schema is itself a guard)
- [ ] The service refuses out-of-policy calls with `isError`, not a throw
- [ ] Secret values cannot leave the service, by construction
- [ ] `description` says what is deliberately absent, not just what is present
- [ ] Validated: `npx ajv-cli validate -s descriptor.schema.json -d my-descriptor.json`
