# Terraform changes: what pAIchart reads, and how it works with your CI plan

**For:** a platform or security team deciding whether to use pAIchart for Terraform changes, and the engineer who runs the
plan-and-apply pipeline (Atlantis, Terraform Cloud, Spacelift, or your own CI).

pAIchart helps you make a change to your Terraform configuration: for example, a new tag, a bucket policy, a lifecycle guard.
It reads the `.tf` files you name, works out the change, has it reviewed, and gives you the exact file edits. **It never runs
`terraform plan` or `terraform apply`, and it never applies anything.** Your own pipeline plans and applies the change.

This page explains what it reads, what it never reads, why it reports no drift, and how its package fits beside your CI plan.
It applies from terraform-iac 1.17.0.

## How pAIchart reaches your configuration

- **Your `.tf` files** are read from your configuration repository, through the platform's read-only Git file source. The
  platform keeps the exact bytes it read (a *kept file*), and the change is written only as edits to that copy.
- **Your Terraform state**, if you want it read at all, is read through a small **read-only service that you run**. It offers
  two operations, `state_list` and `state_pull`, which render saved state and launch no providers. pAIchart stores no cloud
  credentials. Our reference service is in the public repository under `usecases/terraform-lab/`.

State is optional. A run can read your `.tf` files only.

## What it never reads

- **State, plan and variables files in Git.** A path such as `terraform.tfstate`, `prod.tfvars`, `tfplan`, or anything under
  `.terraform/` is refused, on every route. If a spec names one as a Git file, the leg stops before it reads anything.
  Why: a state file is the one file in a Terraform repository that is almost guaranteed to contain secrets, and a raw file
  cannot be reliably scrubbed. If a run needs state, it reads it through your read-only service (above), which is where
  state should be redacted (see "Secret values in state" below).
- **Terraform CLI credentials** (`.terraformrc`, `terraform.rc`, anything under `.terraform.d/`).
- **Password and key files in Git** (since 2026-11-21): a name containing `htpasswd`; a name ending `.key`, `.pem`, `.p12`,
  `.pfx`, `.jks` or `.keystore`; an SSH identity file (`id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`). The read is refused on
  every route. If a spec's `## Config sources` block names one as a Git file, the block is unreadable and the leg ends
  `needs-revision` with the reason `config-sources-unparseable` (problem `path-never-held`). The rule goes by the file NAME:
  a public certificate saved as `.pem` is refused too — keep certificates the change must edit under another name, or leave
  them out of the block. A `.tf` file whose text carries a private-key block is read but never kept, so a leg that declares it
  ends `needs-revision` (`git-file-not-held`).
- **Secret values in state.** Your read-only service should redact by the state's own sensitive markers and never return raw
  state. pAIchart does not verify that it does; its own redaction is a coarse backstop that runs when output is saved.

## What you tell pAIchart: the `## Config sources` block

A Terraform leg reads only what this block declares. A task with no block stops before it reads anything.

```
## Config sources
main-tf: git-file — service github-service ; acme/infra-live/terraform/main.tf
prod-state: live-read — service https://example.com/terraform-readonly-descriptor.json
```

| Line kind | Means |
|---|---|
| `git-file` | a `.tf` file in your repository. It is kept, and edited by reference. Add `@ <branch>` to name a branch your Git source admits; with none, `main` is read |
| `live-read` | your Terraform state, read through your read-only service. It is evidence of what exists; it is never kept and never edited |
| `supplied` | you paste redacted `state pull` output into the task yourself; nothing is read for it |

Leave out the `live-read` line for a Git-only run. The package then says it was designed against the `.tf` files only, and
that existing infrastructure was not read.

In a program, every Terraform leg receives the same block and reads every file it lists. If a declared file could not be read
and kept, the leg returns `needs-revision` with the reason `git-file-not-held`.

## Why there is no drift check

pAIchart does not compare your `.tf` files with your state, and no agent is asked to. Knowing whether they differ needs a
refreshed plan, which launches your providers with your credentials. That belongs in your pipeline.

So a Terraform package never says "no drift found". It says drift was not computed, and that your CI plan is the check. If you
supply a plan output in the task, the design uses it: a difference inside the change is reconciled and called out, and a
difference outside it stops the leg.

## The Plan witness: how the package works with your CI plan

Every Terraform package ends with a **Plan witness**. It states what your plan should show, and nothing more:

```
### Plan witness

- `aws_s3_bucket.archive`: update in place
  - `tags.owner` → "data-platform"
```

followed by this sentence, word for word:

> If the team's CI plan takes any other action on these resources, changes any other attribute or map key of a resource it updates in place — a revert included — or touches any other resource, stop and do not apply: the plan does more than this package changes, and the difference must be explained first (a change made outside this package, a provider or module change, or another merged change).

**How to use it.** Merge the package's edits as a pull request. Your pipeline posts its plan, as Atlantis does on the pull
request. Compare the plan with the Plan witness, line for line. If the plan shows anything the witness does not name, including
a tag or setting being put back to an older value, stop: something changed outside this package, and that needs an explanation
before anyone applies.

The witness names each attribute and map key the change sets, never a whole map with its full value. That is deliberate: a
whole `tags` map would match a plan that quietly reverts a tag someone changed by hand.

**Two limits to know:**

- A document held in one attribute (a `jsonencode(...)` policy, a heredoc) and a list are named whole, by the attribute.
- For a set of sibling nested blocks, the witness names the block added or removed.

## What the platform checks before the review

The platform itself checks the Plan witness against the package's edits. No model does this part.

| Check | If it fails |
|---|---|
| the stop sentence is present, word for word | the leg returns `needs-revision` (`stop-sentence-altered` or `stop-sentence-absent`) |
| every attribute or key the edits set is named in the witness | the leg returns `needs-revision` (`witness-incomplete`) |
| the witness gives no value for a key the edits leave unchanged | the leg returns `needs-revision` (`witness-whole-value`) |
| every resource the edits touch is named | reported to the Reviewer, who blocks on it |

The two middle rows apply where the platform could read every edit. Some edits it cannot read, for example a `lifecycle`,
`count` or `for_each` setting, a `dynamic` block, or a map written on one line. For those it says so, and the Reviewer checks
that part by eye. Lines your formatter only re-spaced are reported as changing no value.

## In short

- **Read-only.** `.tf` files through the Git file source; state, if you choose, through a service you run.
- **Scoped by you:** the `## Config sources` block sets what is read. No block, no read.
- **Never:** state, plan, variables or credentials files; `terraform plan`; `terraform apply`.
- **No drift is computed.** Your CI plan is the check, and the Plan witness tells you exactly what it should show.
- **You stay in control of the change:** pAIchart hands you reviewed edits; your pipeline plans and applies them.
