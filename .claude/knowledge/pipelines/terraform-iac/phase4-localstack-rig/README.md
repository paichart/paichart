# Phase-4 Terraform / Cloud-IaC validation rig (LocalStack)

A throwaway rig that validates the `terraform-iac` pipeline end-to-end against **real Terraform state**:
a tiny "prod" estate applied to **LocalStack** (a sandbox AWS), fronted by a **read-only Terraform MCP
service** that implements the customer-half contract (`../TERRAFORM-SERVICE-INTEGRATION-SPEC.md`, WP-D),
tunnelled to a public HTTPS endpoint so a pipeline can self-provision it.

## Files
| File | What |
|---|---|
| `tf-mcp-readonly/server.py` | the read-only Terraform MCP service — `state_list` + `state_pull` only; K1 redaction by the state's own `sensitive_attributes`; arg-confinement; isError denials |
| `tf-mcp-readonly/{Dockerfile,requirements.txt}` | service container (FastMCP) |
| `workspace/main.tf` | the estate — `aws_s3_bucket.app_logs` (LocalStack) + `random_password.db_master` (the in-state secret) |
| `setup.sh` / `teardown.sh` | stand up / tear down (LocalStack + apply + service) |
| `terraform-readonly-descriptor.json` | the self-provision descriptor (also in the public paichart repo, `descriptors/`) |
| `DEMO-RUN-GUIDE.md` | the run guide (objectives, paths, reading the result, caveats) |

## Quick start (on the droplet)
```bash
cd /opt/tf-rig && bash setup.sh         # LocalStack + terraform apply + the service on host :3113
# tunnel: cloudflared service (tf-lab.paichart.app -> localhost:3113, dedicated route since 2026-07-15) — already installed
# then run a (protocol: terraform-iac) PIPELINE task with the descriptor URL (see DEMO-RUN-GUIDE)
bash teardown.sh                        # when done
```

## What it proves (validated 2026-06-29)
- **D1 — the harvest primitive.** `terraform state pull` carries `sensitive_attributes` (proven: `random_password`
  → `[bcrypt_hash, result]`) and `state_list`/`state_pull` are pure, zero-provider reads. The v2 `INV-HARVEST`
  decision (state pull, not live plan) holds.
- **K1 — the moat.** `state_pull` of the secret returns `<<REDACTED-SENSITIVE>>` for `result`/`bcrypt_hash`; the
  password value never leaves the service. The bucket renders fully (no over-redaction).
- **R1/CR-1a/§7.5.** `plan`/`validate`/`apply` do not exist on the surface; a path-traversal `workspace` is
  refused as an isError result (not a throw).
- **pAIchart's own guards.** R9 (`CONNECTED_OUTPUT_SANITIZE_ENABLED`) + R10 (`ARTIFACT_SECRET_REDACT_ENABLED`,
  incl. the JSON-key TF family) enabled in prod for the run.

## Honest caveats
- LocalStack ≠ a real cloud; static creds, not pAIchart's per-user JWKS identity (R2a). Validates the cognition
  pipeline + the read-only floor (verb-enum + arg-confinement + K1), not the production identity contract.
- `plan`/`validate` (the sandboxed drift exception) are deliberately absent here — the rig demonstrates the
  zero-provider harvest path.

See `DEMO-RUN-GUIDE.md` to run it; `../IMPLEMENTATION-PLAN-v2.md` for the build; the 4-specialist review at
`cline_docs/reviews/terraform-iac-design-2026-06-29/REVIEW.md`.
