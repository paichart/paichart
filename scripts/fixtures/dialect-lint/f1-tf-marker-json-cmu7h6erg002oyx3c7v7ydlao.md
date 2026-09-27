## Change Package: `aws_s3_bucket.app_logs` Write-Authorisation Bucket Policy (workspace: `prod`)

### 1. Declarative HCL/Module Diff (PR — not applied)

```hcl
# --- NEW FILE: app_logs_write_authz.tf ---

data "aws_iam_policy_document" "app_logs_write_authz" {
  statement {
    sid     = "AllowWriteFromExporterPool"
    effect  = "Allow"
    actions = ["s3:PutObject"]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    resources = ["arn:aws:s3:::acme-app-logs/*"]

    condition {
      test     = "IpAddress"
      variable = "aws:SourceIp"
      values   = ["10.99.0.0/27"]
    }
  }

  statement {
    sid     = "DenyWriteOutsideExporterPool"
    effect  = "Deny"
    actions = ["s3:PutObject"]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    resources = ["arn:aws:s3:::acme-app-logs/*"]

    condition {
      test     = "NotIpAddress"
      variable = "aws:SourceIp"
      values   = ["10.99.0.0/27"]
    }
  }
}

resource "aws_s3_bucket_policy" "app_logs_write_authz" {
  bucket = aws_s3_bucket.app_logs.id
  policy = data.aws_iam_policy_document.app_logs_write_authz.json
}
```

**Scope note:** `aws_s3_bucket.app_logs` itself is referenced only (`.id`), never modified. `random_password.db_master` (the neighbouring secret-bearing resource) is not referenced, read, or included anywhere in this diff, per instruction.

### 2. Expected Validation Facts (not run by this task — team CI runs these against the PR)

```
terraform validate
```
**Expected output (prod workspace):**
```
Success! The configuration is valid.
```
*(This is Terraform CLI's fixed, deterministic success string — not a prediction of tool-specific content, since the config introduces no invalid syntax per the design's HCL grammar review.)*

```
tflint
```
**Expected output (prod workspace):**
```
(no stdout output)
```
Exit code: `0`
*(Documented tflint behaviour: no findings ⇒ silent exit 0. No custom `.tflint.hcl` ruleset was found in harvested state, so default ruleset applies.)*

```
terraform plan
```
**Expected result (prod workspace, run by team CI only — not run here):**
```
Plan: 1 to add, 0 to change, 0 to destroy.
```
Resource-level expectation: `aws_s3_bucket_policy.app_logs_write_authz` — create. `data.aws_iam_policy_document.app_logs_write_authz` — read (data source, not counted in add/change/destroy). `aws_s3_bucket.app_logs` — no diff. No `-` or `-/+` line anywhere in the plan is expected; any appearance of one is a blocking anomaly for the Reviewer.

**OPA / Sentinel / conftest checks:**
No policy-as-code framework, OPA/Sentinel/conftest binding, or evaluation reference was found anywhere in the harvested `prod` workspace state (per Phase 1 design's constraint-baseline restatement). No OPA check applies to this change; this is a restated harvested fact, not an assumption.

### 3. Rollback Plan

```hcl
# Revert: delete app_logs_write_authz.tf entirely (or revert the PR commit)
```
Effect: removes `aws_s3_bucket_policy.app_logs_write_authz` on next apply (Terraform destroys the standalone policy attachment resource) and reverts `aws_s3_bucket.app_logs` to its prior state — no bucket policy attached, matching the confirmed pre-change harvest (`policy = ""`). No state manipulation (`state rm`/`state mv`) is required: this is a clean create/destroy pair with no import history. `random_password.db_master` and `aws_s3_bucket.app_logs`'s own configuration are untouched by either the forward change or the rollback.

### 4. Recommended Change Ordering + Apply-Governance Note

**Ordering:** Single-target, additive change — no multi-resource staging required. `data.aws_iam_policy_document.app_logs_write_authz` resolves implicitly before `aws_s3_bucket_policy.app_logs_write_authz` (standard Terraform data-source-before-resource evaluation); no explicit `depends_on` needed.

**Apply-governance note:**
- **Operational requirement:** a normal state-locked `terraform apply` in the `prod` workspace (team-gated CI run, out of scope for this package).
- **Replacements vs additive:** **Purely additive.** Zero resources are replaced or destroyed by this plan — only one new resource (`aws_s3_bucket_policy.app_logs_write_authz`) is created. `aws_s3_bucket.app_logs` shows no diff.
- **State-lock contention:** Standard single-writer state lock for the duration of the apply (expected sub-minute for a single new resource); no known concurrent writers to this workspace's state are indicated by the harvest. No cross-workspace lock dependency.
- **What it disrupts while running:** Nothing. No existing bucket policy exists to be replaced (`policy` attribute is `""` pre-change), so there is no window where writes that were previously allowed become blocked mid-apply — the policy simply does not exist until the single `PutObject` API call to attach it completes.
- **Maintenance-window declaration:** **No window is required.** Reason: the change is a single net-new, non-destructive resource creation with no interruption to any existing bucket capability (the bucket previously had no write policy at all, so no client's current access path is altered by adding this restriction unless that client was already writing from outside `10.99.0.0/27` — an out-of-scope behavioural change the Reviewer should confirm against real traffic patterns, not a technical outage).
- **First post-apply check:** confirm the policy is attached and takes the expected form:
```
terraform state show aws_s3_bucket_policy.app_logs_write_authz
```
**Expected result:** the resource exists in state with `bucket = aws_s3_bucket.app_logs.id` and a non-empty `policy` attribute containing both `AllowWriteFromExporterPool` and `DenyWriteOutsideExporterPool` statement Sids with `10.99.0.0/27` as the sole `aws:SourceIp` value in each condition block. *(This is a comparison-shape check on the applied state's own rendering — not a prediction of literal JSON text, since the exact key-ordering/whitespace `aws_iam_policy_document` renders has never been captured for this workspace.)*

### 5. Policy / Constraint Baseline Restated (from Phase 1 harvest — for independent Reviewer verification)

| Baseline item | Finding |
|---|---|
| OPA/Sentinel/conftest policies | None found in harvested `prod` workspace state |
| Tag/naming standards | None found — no tagging-policy resource or standard discoverable from state |
| Provider quotas | None found / not applicable — single new resource, no quota-relevant type |
| Target workspace | `prod` |
| Terraform address | `aws_s3_bucket.app_logs` |
| Pre-existing bucket policy | None (`policy = ""`, no `aws_s3_bucket_policy` in `state_list`) — clean-slate add |
| Expected plan bound | 1 to add / 0 to change / 0 to destroy |

## Consumed Values

```json
[{"kind": "cidr", "value": "10.99.0.0/27"}]
```

Confidence: 85 — The HCL, validation facts, rollback, and governance note are fully derived from the confirmed clean-slate harvest and the Phase 1 design with no invented state; held below 90 because two items are named assumptions, not observed facts: (1) `terraform validate`/`tflint` expected outputs use each tool's documented standard behaviour rather than a workspace-specific captured rendering, since no prior validate/tflint run exists in the harvest to quote from; (2) whether any client currently writes to the bucket from outside `10.99.0.0/27` (which would make the new Deny statement behaviourally disruptive despite being technically non-destructive) is outside this task's harvest scope and is flagged for the Reviewer to confirm against real traffic.