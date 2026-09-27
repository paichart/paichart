Perfect. Now I'll author the complete HCL change package. Based on the Architect's design from Phase 1 (in my context), I need to produce:

1. **Declarative HCL diff** — the two new resources (versioning + PAB)
2. **Validation facts** — exact terraform validate / tflint commands and expected results
3. **Expected plan output** — the exact plan counts (2 add, 0 change, 0 destroy)
4. **Rollback plan** — how to revert
5. **Change ordering** — recommended sequence
6. **Policy/constraint baseline** — restate the design constraints

---

## HCL Change Package: S3 app_logs Versioning + Public Access Block

### Change Package Summary

This package adds two non-destructive, additive configurations to the existing `aws_s3_bucket.app_logs` resource (bucket: acme-app-logs, workspace: prod, region: us-east-1). The changes enable object versioning for audit trail + recovery capability, and enforce public-access restrictions via a Public Access Block. No existing resources are modified or destroyed.

---

### Part A: Declarative HCL Diff (PR Format)

**File: `terraform/modules/s3-app-logs/main.tf`**

```hcl
# Existing resource (no changes)
resource "aws_s3_bucket" "app_logs" {
  bucket = "acme-app-logs"
  tags = {
    Name                        = "app_logs"
    meridian-fabric-expansion   = "true"
  }
}

# NEW: Enable versioning for audit trail + recovery
resource "aws_s3_bucket_versioning" "app_logs" {
  bucket = aws_s3_bucket.app_logs.id

  versioning_configuration {
    status     = "Enabled"
    mfa_delete = "Disabled"
  }
}

# NEW: Enforce public-access restrictions per security baseline
resource "aws_s3_bucket_public_access_block" "app_logs" {
  bucket = aws_s3_bucket.app_logs.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}
```

**Change Summary:**
- **Lines added:** 20 (two new resource blocks)
- **Lines modified:** 0
- **Lines deleted:** 0
- **Resources created:** 2 (`aws_s3_bucket_versioning.app_logs`, `aws_s3_bucket_public_access_block.app_logs`)
- **Resources modified:** 0
- **Resources destroyed:** 0

---

### Part B: Validation Facts (Deterministic, Runnable Checks)

The following validation commands and expected outputs are the FACTS the team's CI will execute. These are NOT prose verdicts — they are exact, reproducible checks.

#### B.1: Terraform Validate

**Command:**
```bash
terraform validate
```

**Expected Output:**
```
Success! The configuration is valid.
```

**Rationale:** HCL syntax is correct; no interpolation or reference errors.

---

#### B.2: TFLint

**Command:**
```bash
tflint --format compact
```

**Expected Output:**
```
No issues found.
```

**Rationale:** No linting violations (naming conventions, deprecated attributes, best-practice warnings). Both new resources follow AWS provider conventions.

---

#### B.3: Terraform Plan (Exact Counts)

**Command:**
```bash
terraform plan -out=tfplan
```

**Expected Output:**
```
Terraform will perform the following actions:

  # aws_s3_bucket_versioning.app_logs will be created
  + resource "aws_s3_bucket_versioning" "app_logs" {
      + bucket = "acme-app-logs"
      + id     = (known after apply)
      + versioning_configuration {
          + mfa_delete = "Disabled"
          + status     = "Enabled"
        }
    }

  # aws_s3_bucket_public_access_block.app_logs will be created
  + resource "aws_s3_bucket_public_access_block" "app_logs" {
      + block_public_acls       = true
      + block_public_policy     = true
      + bucket                  = "acme-app-logs"
      + id                       = (known after apply)
      + ignore_public_acls      = true
      + restrict_public_buckets = true
    }

Plan: 2 to add, 0 to change, 0 to destroy.
```

**Expected Counts:**
- **Add:** 2 (aws_s3_bucket_versioning.app_logs, aws_s3_bucket_public_access_block.app_logs)
- **Change:** 0 (no modifications to existing resources)
- **Destroy:** 0 (no deletions)

**Rationale:** Both new resources are additive; no in-place modifications or replacements. The existing bucket remains unchanged.

---

#### B.4: Policy Compliance (OPA/Sentinel/Conftest)

**Expected Checks (if customer has OPA/Sentinel/conftest policies):**

| Policy Domain | Check | Expected Result |
|---|---|---|
| S3 Versioning | Versioning enabled on app_logs bucket | **PASS** — status = "Enabled" |
| S3 Public Access | All four PAB blocks enforced | **PASS** — block_public_acls, ignore_public_acls, block_public_policy, restrict_public_buckets all = true |
| Tagging | meridian-fabric-expansion tag present on bucket | **PASS** — inherited from parent aws_s3_bucket.app_logs |
| Encryption | AES256 encryption in place | **PASS** — no changes to encryption; existing baseline preserved |

**Rationale:** The design adheres to the meridian-fabric-expansion security baseline (versioning for audit, PAB for access control). No policy conflicts expected.

---

### Part C: Rollback Plan

**Rollback Objective:** Revert the two new resources and restore the bucket to its pre-change state.

#### C.1: Rollback via HCL Deletion

**Action:** Remove the two new resource blocks from the `.tf` file:

```hcl
# DELETE these blocks:
resource "aws_s3_bucket_versioning" "app_logs" { ... }
resource "aws_s3_bucket_public_access_block" "app_logs" { ... }

# KEEP the existing bucket (no changes):
resource "aws_s3_bucket" "app_logs" { ... }
```

**Command:**
```bash
terraform plan -out=tfplan_rollback
terraform apply tfplan_rollback
```

**Expected Outcome:**
```
Plan: 0 to add, 0 to change, 2 to destroy.

Destroy complete! Resources: 2 destroyed.
```

#### C.2: State Considerations

- **Versioning suspension:** Deleting `aws_s3_bucket_versioning` will suspend versioning on the bucket but will NOT delete existing object versions. Existing versions remain in the bucket and are queryable via the S3 API.
- **PAB removal:** Deleting `aws_s3_bucket_public_access_block` will remove the PAB configuration. The bucket will revert to its previous public-access posture (likely restricted by bucket policy, but PAB will no longer enforce the four blocks).
- **Data preservation:** No object data is deleted during rollback. The bucket and all objects remain intact.

#### C.3: Rollback Verification

**Command:**
```bash
aws s3api get-bucket-versioning --bucket acme-app-logs
```

**Expected Output (post-rollback):**
```json
{
  "Status": "Suspended"
}
```

**Rationale:** Versioning is suspended (not deleted); existing versions are preserved.

---

### Part D: Recommended Change Ordering

**Sequence:**

| Step | Resource | Action | Rationale | Duration |
|------|----------|--------|-----------|----------|
| 1 | `aws_s3_bucket_versioning.app_logs` | Create | Enable versioning first (audit trail enablement is foundational). No inter-resource dependency. | ~5 sec |
| 2 | `aws_s3_bucket_public_access_block.app_logs` | Create | Apply PAB after versioning (logical sequence: audit, then access control). No hard dependency. | ~5 sec |

**Notes:**
- Both resources can be applied in parallel (no inter-resource dependencies).
- Recommended sequential order (versioning → PAB) is a logical flow, not a technical requirement.
- Total apply time: ~10 seconds (minimal, no data movement).

---

### Part E: Maintenance Window & Deployment Notes

**Maintenance Window:** Not required. This is a non-disruptive change.

**Deployment Considerations:**
- **No downtime:** Versioning enablement and PAB attachment do not interrupt S3 operations. Existing requests continue unaffected.
- **No data migration:** No objects are moved or re-encrypted. Existing data remains in place.
- **Backward compatibility:** Existing applications writing to the bucket continue to work. Versioning is transparent to write operations.
- **Read behavior:** Existing reads are unaffected. Version-aware reads (via `VersionId` parameter) become available post-apply.

**Post-Apply Verification:**
```bash
# Verify versioning is enabled
aws s3api get-bucket-versioning --bucket acme-app-logs

# Verify PAB is in place
aws s3api get-public-access-block --bucket acme-app-logs
```

---

### Part F: Policy & Constraint Baseline (Carry-Forward for Reviewer)

**Design Constraints (from Phase 1 Architect):**

| Constraint | Value | Source | Status |
|---|---|---|---|
| **Tags** | meridian-fabric-expansion | POV objective | ✅ Inherited from parent bucket |
| **Workspace** | prod | Task scope | ✅ Confirmed |
| **Region** | us-east-1 | Phase 0 harvest | ✅ Confirmed |
| **Bucket Name** | acme-app-logs | Phase 0 harvest | ✅ Confirmed |
| **Encryption** | AES256 (AWS-managed) | Phase 0 harvest | ✅ Unchanged |
| **Versioning Policy** | Enable for audit trail + recovery | Task requirement | ✅ Implemented |
| **Public Access Policy** | All four PAB blocks enforced | Task requirement | ✅ Implemented |
| **MFA Delete** | Disabled | Task scope (not required) | ✅ Disabled per design |
| **Bucket Ownership Controls** | In use (existing baseline) | Phase 0 harvest | ✅ Unchanged |

**Out-of-Scope Drift Flagged (from Phase 1):**
- Resource `random_password.db_master` was identified in the Phase 0 harvest but is outside the scope of this change package (versioning + PAB only). This resource is NOT included in this HCL diff. The team must address it separately if needed.

---

### Summary for Reviewer (Phase 3)

**Deliverable Readiness:**
✅ Declarative HCL diff (2 new resources, 0 modifications, 0 deletions)
✅ Validation facts (terraform validate, tflint, plan counts, OPA/Sentinel/conftest expectations)
✅ Rollback plan (delete the two new resources; versioning suspension; data preservation)
✅ Change ordering (versioning → PAB; parallel execution possible)
✅ Policy/constraint baseline restated (tags, workspace, encryption, versioning policy, PAB policy)

**Expected Plan Output:**
- **Plan: 2 to add, 0 to change, 0 to destroy** ✅ (matches task expectation)

**No Surprises:**
- No destroy/replace operations
- No in-place modifications to existing bucket
- No policy conflicts
- Fully reversible

**Reviewer Checklist:**
- [ ] Verify HCL syntax is correct (terraform validate passes)
- [ ] Confirm plan counts match expected (2 add, 0 change, 0 destroy)
- [ ] Validate rollback plan is sound (delete new resources, data preserved)
- [ ] Check policy/constraint fit (tags, workspace, encryption baseline)
- [ ] Confirm no out-of-scope drift is absorbed into this package
- [ ] Approve for team's governed `terraform apply` run

---

Confidence: 88 — Solid. The HCL change package is complete and grounded in the Phase 1 Architect's design. All requirements addressed: declarative HCL diff (2 new resources, no mutations), deterministic validation facts (terraform validate, tflint, exact plan counts, OPA/Sentinel/conftest expectations), rollback plan (delete new resources; versioning suspension; data preservation), recommended change ordering (versioning → PAB), and policy/constraint baseline restated (tags, workspace, encryption, versioning policy, PAB policy). One assumption: the team's CI will execute the standard validation suite (validate, tflint, plan) as documented — this is the expected fact set but not yet verified with the team's governance process.