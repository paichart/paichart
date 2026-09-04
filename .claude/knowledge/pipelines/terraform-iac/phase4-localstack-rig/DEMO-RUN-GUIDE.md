# Terraform / Cloud-IaC Pipeline — Demo Run Guide

> Phase-4 validation rig for the `terraform-iac` pipeline. A read-only Terraform MCP service over a real
> Terraform state (applied against LocalStack — a sandbox AWS), tunnelled to a public HTTPS endpoint so a
> pipeline can self-provision it. Sibling of `../../kubernetes-gitops/phase4-kind-rig/DEMO-RUN-GUIDE.md`.
>
> **State as of 2026-08-02**: rig **DOWN** — torn down after Runs 19 and 20 with `/opt/tf-rig/teardown.sh` (removes localstack + tf-readonly + the network). cloudflared untouched and still serving the other rigs' routes; images kept. Bring up with `setup.sh`.
>
> 🔴 **DO NOT PUSH TO `main` WHILE THIS RIG IS UP.** `next build` runs on the production box and so does this rig — the same finite RAM. On 2026-08-02 one deploy with the rigs up saturated a 7.9 GB host and two deploys failed; teardown freed 2.9 GB and the same deploy then succeeded first try. It LOOKS like an outage from outside (curl 000, ICMP loss, SSH banner timeouts) but production kept serving throughout — check `uptime` and `pm2 list` before concluding otherwise. Recurrence of the 2026-07-24 incident; serialization fixed stacking, not the collision. `cline_docs/follow-ups/deploy-builds-on-the-rig-host-2026-08-02.md`.
>
> Re-run the pre-flight before any demo regardless — a state banner is a claim about the moment it was written, and the host has
> taken several unexplained power-cycles (four between 2026-07-21 and 2026-07-28). If the containers are
> merely **Exited**, `docker start localstack tf-readonly` is sufficient here (see "Restarting a STOPPED
> rig"); reach for `setup.sh` only when they are gone.

## The story this demo tells

One natural-language objective — *"harden the prod log bucket: add versioning + block public access"* — becomes
an **approved-but-unapplied HCL change package (a PR)**, produced by a team of specialist agents that:
1. **self-provision** a read-only Terraform service from a descriptor URL (register → read-only call → teardown);
2. **harvest** the real `prod` state — `state_list` for the addresses, `state_pull` per resource — where a
   captured DB password lives inline in state but **never leaves the service** (redacted by the state's own
   `sensitive_attributes` — the K1 moat);
3. **design + author** the HCL change (an `aws_s3_bucket_versioning` + `aws_s3_bucket_public_access_block`)
   with **expected** validation facts (the Author never runs `plan`/`validate` — state lock + provider code-exec);
4. **independently review** it (policy-compliant? plan diff-bounded — no surprise destroy/replace? rollback sound?).

The two things that make it trustworthy: **it never actuates** (apply is the team's governed `terraform apply` run),
and **secret-dense state never enters the LLM** (only shape + addresses do).

## Live rig facts

| Thing | Value |
|---|---|
| Sandbox cloud | **LocalStack** (s3) on `:4566` — no real AWS, dummy creds |
| Workspace | **prod** — `aws_s3_bucket.app_logs` (`acme-app-logs`, no versioning/PAB yet) + `random_password.db_master` (the in-state secret) |
| Read-only service | `terraform-readonly` (FastMCP, streamable-http) on host `:3113` (container-internal :3107; dedicated port since 2026-07-15), tools **`state_list` + `state_pull`** only |
| Public endpoint | **`https://tf-lab.paichart.app/mcp`** (cloudflared tunnel → `localhost:3113`) — DEDICATED route since 2026-07-15; all three rigs can run concurrently |
| Descriptor URL | `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json` |
| Rig location (droplet) | `/opt/tf-rig` (`setup.sh` / `teardown.sh`) |

## Pre-flight checklist

```bash
# 1. Rig hot? (initialize through the tunnel returns serverInfo.name = terraform-readonly)
curl -s -m 12 https://tf-lab.paichart.app/mcp -X POST \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"p","version":"0"}}}' | head -c 200
# 2. Registry clean? registry(action:"list") -> terraform-rig-readonly should NOT be present (the pipeline self-provisions it)
# 3. Descriptor live? curl -sI <descriptor URL> -> 200
# 4. Containers up AND localstack HEALTHY? (presence is not readiness — localstack carries a healthcheck)
ssh root@<droplet> 'docker ps --format "{{.Names}}\t{{.Status}}" --filter name=localstack --filter name=tf-readonly'
#    expect BOTH Up, and localstack's status to include "(healthy)"
```

> 🔴 **Check 1 does not prove the rig can READ.** `initialize` is answered by `tf-readonly` alone — it
> will return `serverInfo.name: terraform-readonly` even if LocalStack is down or the `prod` state is
> unreadable, so a harvest can still fail on a fully green check 1. That is why check 4 asserts
> **healthy**, not merely present. (The cEOS sibling learned this the hard way on 2026-07-26: containers
> Up and the tunnel answering, while the data plane was dead — see that guide's step 1b.)

## Restarting a STOPPED rig

Unlike the cEOS rig, **`docker start` is sufficient here** — verified 2026-07-26. These are plain
containers on a docker network (`tf-rig-net`), not containerlab nodes, so there are no veth pairs to lose
when they stop:

```bash
ssh root@<droplet> 'docker start localstack tf-readonly'
# then re-run the pre-flight — expect localstack "(healthy)" and the tunnel to answer terraform-readonly
```

⚠️ **Do not carry the cEOS `--reconfigure` habit over to this rig.** There, `docker start` silently
leaves the inter-switch link missing and a redeploy is required; here it genuinely restores the rig.
Reach for `setup.sh` only when the containers are **gone** (torn down), not merely exited.

## Pick an objective

Put `(protocol: terraform-iac)` in the title for deterministic routing, and carry the descriptor URL in the body:

> **Add versioning and a public-access-block (deny public ACLs) to the `acme-app-logs` S3 bucket in the prod workspace (protocol: terraform-iac)**

Other good ones against this state: *"add `team`/`cost-center` tag standards to every resource in prod"*; *"reconcile
any drift on `aws_s3_bucket.app_logs` and report it."*

## Path A — Claude Desktop / ChatGPT (recorded demo)

1. *(run `/mcp` once if you just re-seeded — the HOWTO is cached)*
2. Create a PIPELINE task with the objective above; paste the **descriptor URL** in the task body.
3. Watch: the harness decomposes into IaC State Harvester → Infrastructure Architect → HCL Rollback Author → Plan
   Policy Reviewer; the Harvester self-provisions `terraform-rig-readonly`, runs `state_list` then `state_pull`,
   and the change package + verdict come back. The DB password is redacted everywhere in the harvest.

## Path B — API / MCP tools (off-camera dry run)

```text
# 1. POV/stage — pick or create one
# 2. PIPELINE task (descriptor URL in the description, protocol tag in the title)
perform(action:"task.create", type:"PIPELINE",
        title:"Add versioning + public-access-block to acme-app-logs (protocol: terraform-iac)",
        description:"Harden the prod log bucket. Read-only Terraform service descriptor: <descriptor URL>")
# 3. Execute + poll + fetch the report.md (the Author's HCL package) + result.json (the Reviewer verdict)
# full report body: read agent_artifacts on prod (the connector condenses report.md)
```

## Reading the result

The **report.md** is the Author's change package: the new HCL (`aws_s3_bucket_versioning` +
`aws_s3_bucket_public_access_block` for `app_logs`), the **expected** `terraform plan` counts (+2 add, 0 change,
0 destroy), `terraform validate` / `tflint` / OPA checks to run, a rollback (revert the PR + apply), and the
restated policy/workspace baseline. The **result.json** is the Reviewer's verdict (approved / needs-revision + confidence).

### Verify the design beats (good demo)
- The harvest shows `app_logs` **lacks** versioning + a public-access-block → the change adds exactly those.
- The DB password is **`<<REDACTED-SENSITIVE>>`** everywhere it appears in the harvest (grep the artifacts — the
  real value is never present). This is the moat, on camera.
- The Author ships **expected** validation facts — it never ran `plan`/`validate` (no state lock, no provider launch).
- The Reviewer confirms the expected plan is **add-only** (no surprise destroy/replace).

## Honest caveats (state them in the demo)
- **Validated against LocalStack**, a sandbox AWS — not a real cloud account. It exercises the full cognition
  pipeline + the read-only floor (verb-enum + arg-confinement + K1) against **real Terraform state**.
- The service authenticates with **static/absent creds**, not pAIchart's per-user JWKS identity (R2a) — the
  same honest caveat the cEOS/kind rigs carried. The JWKS contract is the production identity bar.
- `plan`/`validate` are deliberately **absent** from this surface (state_list/state_pull only) — the rig
  demonstrates the zero-provider harvest path, not the sandboxed-plan exception.

## Rig shutdown (teardown)

```bash
ssh root@<droplet> 'cd /opt/tf-rig && bash teardown.sh'   # removes localstack + tf-readonly + the network
# ⚠️ cloudflared stays installed AND running — the ONE tunnel serves all three rigs (ceos-lab:3107 /
#    k8s-lab:3112 / tf-lab:3113 since 2026-07-15); stopping it kills the other rigs' endpoints too
# keep images for re-runs: localstack/localstack:3, hashicorp/terraform, tf-readonly
```

## See also
- `../TERRAFORM-SERVICE-INTEGRATION-SPEC.md` — the customer-half contract this service implements (WP-D).
- `../IMPLEMENTATION-PLAN-v2.md` — the build; `../../PIPELINE-DOMAIN-FIT-CATALOG.md` §Terraform — the triage.
- `cline_docs/reviews/terraform-iac-design-2026-06-29/REVIEW.md` — the 4-specialist review.
