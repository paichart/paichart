# Terraform lab — a sandbox cloud to run the IaC pipeline against

LocalStack standing in for AWS, a small Terraform workspace with real state, and the **read-only MCP
service** the pipeline harvests through. Free software; no cloud account, no credentials, no spend.

Pairs with: [`protocols/terraform-iac-protocol.md`](../../protocols/terraform-iac-protocol.md) ·
[`descriptors/terraform-readonly-descriptor.json`](../../descriptors/terraform-readonly-descriptor.json) ·
worked output in [`examples/terraform-iac-change-report.md`](../../examples/terraform-iac-change-report.md).

## Prerequisites

`docker` and `curl`. Everything else is pulled by the script.

## Bring-up

```bash
bash setup.sh
```

That does three things: starts LocalStack with S3, runs `terraform init` + `apply` against it so
`workspace/terraform.tfstate` holds **real state**, and builds and runs the read-only service on
`127.0.0.1:3113`.

Liveness: a bare `GET /mcp` returns 406 or 400 depending on the MCP library version — both mean
*alive, wrong headers*. The real check is an `initialize` call.

## What makes this service read-only, and why it matters more here than elsewhere

Terraform is the domain where "read-only" is easiest to get wrong. The service renders **saved state**
— `state list` for addresses, a scoped `state pull` for one resource. It **launches no providers and
takes no state lock**, which is the sharp edge: a naive "read-only" Terraform integration that shells
out to `plan` does both, and can mutate a lock table while claiming to be read-only.

The state file is mounted **`:ro`**, and the service re-exposes only resource shape and addresses.

## Secret-density — read this before pointing it at anything real

A real `.tfstate` is **secret-dense**: it can contain database passwords, private keys, and access
tokens in plain text. This lab's state is deliberately boring. If you adapt this service for your own
state, **your service is responsible for redacting by the state's own `sensitive_attributes`** — the
platform's artifact redaction is a coarse backstop applied when an artifact is written, not a
guarantee about what your service hands over. pAIchart does not verify that your service redacts.

## Point a pipeline at it

Copy `descriptors/terraform-readonly-descriptor.json`, set `endpoint` to wherever **your hub** can
reach the service, and put that URL in the task description.

A good first objective against this workspace: add versioning and a public-access-block to the bucket.
The deliverable is an HCL change package — a PR — with `validate` / `plan` / `tflint` / OPA facts
stated as *expected* output, because the authoring agent never runs `plan` itself.

## Teardown

```bash
bash teardown.sh
```

## Honest scope

LocalStack is not AWS; provider behaviour can differ. This exercises the cognition pipeline, the
read-only floor, and the platform's output guards against real Terraform state — not a real cloud.
