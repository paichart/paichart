# Protect the application log bucket from deletion, in the file the team keeps in Git

One domain, one leg, one file. Read this before questioning the shape: it is deliberately small.

## What must happen

The application log bucket `acme-app-logs` (resource `aws_s3_bucket.app_logs` in the prod workspace)
can today be destroyed by any plan that drops or replaces it. Make Terraform refuse to destroy it:
add a `lifecycle` block with `prevent_destroy = true` to that resource. Nothing else about the bucket
changes.

The team keeps the configuration in a Git repository. The change is a change to the file in that
repository — the Terraform state is read only to see what exists.

## Why this is a program and not one pipeline

It is a program so the plan, the interface contract and the integration review run over a change to
a file the platform holds. The single leg is the whole change.

## Approval gates

| gate | approves | approver |
|---|---|---|
| program plan | the plan and the interface contract, before the leg runs | Steve Terry |

## Pipeline 1 objective — infrastructure (terraform-iac, change)

Read the configuration-repository file named in `topology.json` (`configRepo`) and harvest the prod
workspace read-only. Author the `lifecycle` block as a change to the `aws_s3_bucket.app_logs`
resource in that file — not a new file. Never applied by this run.

The leg's task description must name the configuration-repository file exactly as `topology.json`
gives it — owner, repository and path — and the read-only Terraform service descriptor URL.

## Node C — integration review (facts only)

Check numbering is FIXED and referenced by number elsewhere. A new requirement APPENDS (4, 5, …).

1. The package adds exactly one `lifecycle` block, with `prevent_destroy = true`, to the
   `aws_s3_bucket.app_logs` resource.
2. No other resource, and no other attribute of `aws_s3_bucket.app_logs`, is changed.
3. The change is to the named configuration-repository file.

## Validation shape

Governed by the leg's own active protocol, not by this file. This document does not restate, weaken
or override a protocol clause.

## Connection surfaces

The leg reaches the Terraform state only through a self-provisioned read-only MCP service, named by the
descriptor URL in `topology.json` `readOnlyServices`, and reads the configuration-repository file only
through the platform's file source. `topology.json` declares no endpoint, category or tools of its own.
