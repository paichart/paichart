# Change Package: `aws_s3_bucket_policy.app_logs` — Two Independent Exporter-Class Authorizations

**Target:** `aws_s3_bucket_policy.app_logs` (new resource, attached to existing `aws_s3_bucket.app_logs`) — workspace `prod`, LocalStack rig, bucket `acme-app-logs`.
**Scope:** Restrict `s3:PutObject` to the two network-leg-derived exporter aggregates, expressed as two distinct `aws:SourceIp` condition entries — no merge.

## Consumed Values

Both aggregates were present in chained §6 context (Network Pipeline harness `## Derived Values`, via the Architect's restatement). No HALT triggered. Copied verbatim from what is applied in the HCL below:

```json
[
  {"kind": "cidr", "value": "10.99.0.30/31"},
  {"kind": "cidr", "value": "10.99.0.40/31"}
]
```

No `## Derived Values` / evidence-carry section is authored in this package — this leg consumes both aggregates verbatim and derives no new value.

## Policy / Constraint Baseline (restated from Architect Phase 1, for independent Reviewer verification)

| Item | Value |
|---|---|
| Workspace | `prod` (LocalStack rig) |
| Target bucket | `acme-app-logs` — ARN `arn:aws:s3:::acme-app-logs`, region `us-east-1` |
| Plan bounds | Exactly **one** new resource (`aws_s3_bucket_policy.app_logs`); no other resource in state touched |
| OPA/Sentinel/conftest policies | **None found** in harvested state — explicitly stated, not invented |
| Tag/naming standards | None found |
| Provider quotas | None found |
| Existing tags on `aws_s3_bucket.app_logs` | `env=prod`, `team=platform` — preserved as-is, not modified by this change. (Two anomalous tags were flagged by the Architect as out-of-scope findings — not restated here; not touched by this resource.) |
| Existing policy on bucket | None (`state_list` confirms no `aws_s3_bucket_policy` resource; bucket's inline `policy` attribute is empty) — greenfield authorship |

## Candidate Configuration — HCL Diff (PR)

```diff
--- a/prod/s3_app_logs_policy.tf
+++ b/prod/s3_app_logs_policy.tf
@@ -0,0 +1,24 @@
+resource "aws_s3_bucket_policy" "app_logs" {
+  bucket = aws_s3_bucket.app_logs.id
+
+  policy = jsonencode({
+    Version = "2012-10-17"
+    Statement = [
+      {
+        Sid       = "RestrictPutObjectToExporterAggregates"
+        Effect    = "Allow"
+        Principal = "*"
+        Action    = "s3:PutObject"
+        Resource  = "arn:aws:s3:::acme-app-logs/*"
+        Condition = {
+          IpAddress = {
+            "aws:SourceIp" = [
+              "10.99.0.30/31",
+              "10.99.0.40/31"
+            ]
+          }
+        }
+      }
+    ]
+  })
+}
```

**Named assumption (Principal):** the Architect flagged the IAM `Principal` as an unresolved gap (not specified in task or harvested state). `Principal = "*"` scoped by the `aws:SourceIp` condition is the standard idiom for source-IP-restricted `PutObject` from on-prem/lab exporters that do not assume an AWS IAM identity (matches the LocalStack/cEOS lab topology, where writers are network devices, not IAM principals). This is a gap-fill, not a harvested or derived fact — flagged for Reviewer/customer confirmation, not asserted as verified.

## Validation Steps

### 1. `terraform validate` (config-syntax, deterministic tool-documented literal)
```
terraform validate
```
**Expected output:**
```
Success! The configuration is valid.
```

### 2. `tflint` (lint, no ruleset/plugin config found in harvested state per baseline above — core ruleset only)
```
tflint
```
**Expected output:**
```
No issues found.
```
*Basis: this is tflint's documented default-ruleset behavior with zero findings, not a locally-witnessed capture — no `.tflint.hcl`/AWS plugin was found in harvested state, so only the core HCL-syntax ruleset applies to this single-resource addition, and it introduces no deprecated syntax.*

### 3. `terraform plan` (expected counts — harvester fact: greenfield, single additive resource; Author does not execute plan)
```
terraform plan
```
**Expected output (summary line only; full resource diff omitted as non-deterministic formatting):**
```
Plan: 1 to add, 0 to change, 0 to destroy.
```

### 4. Policy-as-code (OPA/Sentinel/conftest)
No OPA/Sentinel/conftest artifacts were found in the harvested state (Architect baseline: "none found"). **No policy-as-code check applies to this change** — this is stated as a fact, not an omission to be filled with an invented check.

### 5. First post-apply check (team CI, out-of-band — comparison shape, no produced rendering exists yet since the policy has never existed on this bucket)
```
aws s3api get-bucket-policy --bucket acme-app-logs --query Policy --output text
```
**Comparison to perform (no literal predicted — feature does not exist yet, nothing has ever rendered it):**
- Parse the returned `Policy` document as JSON.
- Confirm exactly one statement with `Sid = "RestrictPutObjectToExporterAggregates"`.
- Confirm `Condition.IpAddress["aws:SourceIp"]` is an array containing **exactly** `"10.99.0.30/31"` and `"10.99.0.40/31"` as two distinct entries (not a merged/single value).
- Confirm `Action = "s3:PutObject"` and `Resource = "arn:aws:s3:::acme-app-logs/*"`.

## Rollback Plan

Declarative — revert via HCL, not imperative CLI:

```diff
--- a/prod/s3_app_logs_policy.tf
+++ /dev/null
@@ -1,24 +0,0 @@
-resource "aws_s3_bucket_policy" "app_logs" {
-  ...
-}
```

Removing the resource block and running the team's governed apply performs a clean `aws_s3_bucket_policy` **delete** (Terraform's standard "resource removed from config → destroy" behavior). This is safe: the resource is additive-only and standalone — no other resource depends on it, and deleting it does not affect `aws_s3_bucket.app_logs` itself or its existing tags/attributes.

## Recommended Change Ordering

Single-resource change graph — no fan-out:

1. `aws_s3_bucket.app_logs` — already exists in state (Phase 0 harvest confirmed); no change; satisfies the implicit dependency.
2. `aws_s3_bucket_policy.app_logs` — create.

One apply step; no staged/phased rollout needed within this leg.

## Apply-Governance Note

- **Plan shape:** Additive only — `Plan: 1 to add, 0 to change, 0 to destroy.` Nothing is replaced or destroyed; the existing bucket resource is untouched.
- **State-lock contention:** Minimal — a single new resource creation holds the workspace state lock only briefly; no concurrent `prod` workspace operations are anticipated for this change.
- **Disruption while running:** None. Adding a bucket policy does not affect existing bucket reads/writes from already-authorized paths; it only narrows future `PutObject` callers to the two source-IP ranges once applied.
- **No maintenance window required** — reason: the change is purely additive (one new resource, zero replace/destroy), and altering an S3 bucket policy takes effect atomically on the next request with no interruption to the bucket's other operations (versioning, SSE, existing objects).
- **First post-apply check:** validation step 5 above — confirm the two distinct `aws:SourceIp` entries are present verbatim in the live bucket policy document.

---
*Apply is a separate, human/team-gated `terraform apply` run against this PR — this package is the candidate change plus its validation and rollback; no command in this package has been executed against the `prod` workspace or LocalStack rig.*

Confidence: 88 — Both consumed aggregates verified present in chained context and applied verbatim as two distinct condition entries; plan/validate/tflint expectations grounded in documented, stable tool output and the harvester-established greenfield fact (no existing policy). One named assumption carried from the Architect (IAM Principal `"*"` scoped by source-IP, since no principal was specified anywhere upstream) and one gap (post-apply check is a comparison, not a literal, since the policy has never existed on this bucket).