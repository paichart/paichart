# Authorization Consistency Discovery
**Purpose**: Detect inconsistent authorization patterns across similar operations
**Category**: Security Architecture
**Priority**: HIGH
**Time**: 15 minutes
**Created**: November 7, 2025 (from Task Domain Security Audit)

---

## 🎯 What This Discovery Finds

**Problem**: Similar operations use different authorization systems, causing:
- Permission inconsistencies (can create but not edit)
- User confusion (why can't I manage my own resources?)
- Security gaps (one path validated, another bypassed)

**Example** (Discovered Nov 7, 2025):
```typescript
// Task CREATE (lib/tasks/handlers/task.ts)
const hasPermission = await checkPermission(user, pov, ResourceAction.EDIT);
// Uses role_permissions table (role-based)

// Task UPDATE (app/api/tasks/[taskId]/route.ts)
validatePOVAccess(user, task.pov, { throwOnDeny: true });
// Uses ownership/team check (ownership-based)

// RESULT: Can create tasks but not edit them!
```

**Impact**:
- Broken user workflows (DEMO_USER couldn't edit owned tasks)
- Support burden (users don't understand permission model)
- Architectural confusion (which model to use?)

---

## 📋 Discovery Process

### Step 1: Map Authorization Systems (5 min)

**Identify both systems**:

```bash
# System 1: validatePOVAccess (ownership-based)
grep -r "validatePOVAccess" lib/ app/ --include="*.ts" -l | grep -v "node_modules" | grep -v "cline_docs" | wc -l
# Current: 27 files (POV-scoped operations)

# System 2: checkPermission (role-based)
grep -r "checkPermission" lib/ app/ --include="*.ts" | grep -v "import" | grep -v "export function" | grep "await.*checkPermission" | wc -l
# Current: ~5 calls (system-level operations)

# Document which files use which
echo "=== validatePOVAccess Files ===" > /tmp/auth-usage.txt
grep -r "validatePOVAccess" lib/ app/ --include="*.ts" -l >> /tmp/auth-usage.txt

echo "" >> /tmp/auth-usage.txt
echo "=== checkPermission Files ===" >> /tmp/auth-usage.txt
grep -r "await.*checkPermission" lib/ app/ --include="*.ts" -l >> /tmp/auth-usage.txt
```

---

### Step 2: Detect Dual-Check Patterns (5 min)

**Find files using BOTH systems**:

```bash
# Dual-check detection
echo "=== Dual Authorization Checks ===" > /tmp/dual-checks.txt

for file in $(grep -r "validatePOVAccess" lib/ app/ --include="*.ts" -l); do
  if grep -q "await.*checkPermission" "$file"; then
    echo "⚠️ DUAL CHECK: $file" >> /tmp/dual-checks.txt

    # Show line numbers
    echo "  validatePOVAccess lines:" >> /tmp/dual-checks.txt
    grep -n "validatePOVAccess" "$file" | cut -d: -f1 | tr '\n' ',' >> /tmp/dual-checks.txt
    echo "" >> /tmp/dual-checks.txt

    echo "  checkPermission lines:" >> /tmp/dual-checks.txt
    grep -n "await.*checkPermission" "$file" | cut -d: -f1 | tr '\n' ',' >> /tmp/dual-checks.txt
    echo "" >> /tmp/dual-checks.txt
    echo "" >> /tmp/dual-checks.txt
  fi
done

cat /tmp/dual-checks.txt
```

**Assessment**:
- **0 dual checks**: ✅ Consistent model
- **1-2 dual checks**: ⚠️ Review (may be intentional for sensitive ops)
- **3+ dual checks**: ❌ Inconsistent architecture (needs cleanup)

---

### Step 3: Verify POV Query Completeness (5 min)

**Run automated scan**:

```bash
# Automated tool (created Nov 7, 2025)
./scripts/audit-pov-access-completeness.sh

# Checks:
# - All POV queries include: ownerId, metadata, team.members
# - No incomplete queries (missing fields = authorization fails)

# Expected output:
# Total files scanned: 27
# Complete POV queries: 14 (100%)
# Incomplete POV queries: 0 ✅
# Dual permission checks: 0 ✅
```

**Manual verification** (if scan finds issues):
```bash
# Check specific file
grep -B 5 -A 20 "validatePOVAccess" lib/path/to/file.ts

# Verify POV query includes:
# - id: true (for logging)
# - ownerId: true (CRITICAL - isOwner check)
# - metadata: true (CRITICAL - isDemo/tenantId check)
# - team.members (for isTeamMember check)
```

---

## 🔍 Discovery Commands

### Quick Scan (5 minutes)
```bash
#!/bin/bash
# Quick authorization consistency check

echo "=== Authorization Model Usage ==="
echo "validatePOVAccess files: $(grep -r "validatePOVAccess" lib/ app/ --include="*.ts" -l | grep -v node_modules | wc -l)"
echo "checkPermission calls: $(grep -r "await.*checkPermission" lib/ app/ --include="*.ts" | grep -v "export function" | wc -l)"
echo "Dual checks: $(for file in $(grep -r "validatePOVAccess" lib/ app/ --include="*.ts" -l); do grep -q "await.*checkPermission" "$file" && echo "$file"; done | wc -l)"

echo ""
echo "=== Automated Scan ==="
./scripts/audit-pov-access-completeness.sh 2>&1 | grep -E "Total files|Complete|Incomplete|Dual"
```

### Comprehensive Audit (15 minutes)
```bash
#!/bin/bash
# Comprehensive authorization audit

OUTPUT="authorization-audit-$(date +%Y%m%d).md"

cat > $OUTPUT << 'EOF'
# Authorization Consistency Audit
**Date**: $(date)

## Summary
EOF

# Map both systems
echo "" >> $OUTPUT
echo "## System 1: validatePOVAccess (Ownership-Based)" >> $OUTPUT
grep -r "validatePOVAccess" lib/ app/ --include="*.ts" -l | grep -v node_modules >> $OUTPUT

echo "" >> $OUTPUT
echo "## System 2: checkPermission (Role-Based)" >> $OUTPUT
grep -r "await.*checkPermission" lib/ app/ --include="*.ts" -l | grep -v node_modules >> $OUTPUT

# Find inconsistencies
echo "" >> $OUTPUT
echo "## ⚠️ Dual Authorization Checks" >> $OUTPUT
for file in $(grep -r "validatePOVAccess" lib/ app/ --include="*.ts" -l | grep -v node_modules); do
  if grep -q "await.*checkPermission" "$file"; then
    echo "- $file" >> $OUTPUT
  fi
done

# Run automated scan
echo "" >> $OUTPUT
echo "## Automated Scan Results" >> $OUTPUT
./scripts/audit-pov-access-completeness.sh 2>&1 >> $OUTPUT

echo "Audit saved to: $OUTPUT"
```

---

## 📊 Analysis Criteria

### **Consistency Patterns**

**✅ GOOD (Consistent)**:
- All task operations use validatePOVAccess
- All POV creation uses checkPermission
- Clear separation: resource-level vs system-level

**⚠️ REVIEW (May Be Intentional)**:
- DELETE uses both (dual-layer for sensitive operation)
- EXPORT uses both (compliance requirement)
- Documented in authorization-dual-layer-pattern.md

**❌ BAD (Inconsistent)**:
- Task CREATE uses checkPermission
- Task UPDATE uses validatePOVAccess
- Same resource, different auth models = bug!

---

### **POV Query Completeness**

**✅ COMPLETE**:
```typescript
const pov = await prisma.pOV.findUnique({
  where: { id: povId },
  select: {
    id: true,              // For logging ✅
    ownerId: true,         // CRITICAL - isOwner ✅
    metadata: true,        // CRITICAL - isDemo/tenant ✅
    team: {
      select: {
        members: {
          select: { userId: true } // isTeamMember ✅
        }
      }
    }
  }
});

validatePOVAccess(user, pov, { throwOnDeny: true });
```

**❌ INCOMPLETE** (Authorization will fail):
```typescript
const pov = await prisma.pOV.findUnique({
  where: { id: povId },
  select: {
    ownerId: true,  // Has ownerId ✅
    teamId: true,   // Has teamId
    // MISSING: metadata (isDemo check fails!)
    // MISSING: team.members (isTeamMember check fails!)
  }
});

validatePOVAccess(user, pov, { throwOnDeny: true }); // Will deny incorrectly!
```

---

## ✅ Success Criteria

### Complete Discovery Includes:
- [ ] Both authorization systems mapped (files, usage counts)
- [ ] Dual-check patterns identified and assessed
- [ ] POV query completeness verified (automated scan)
- [ ] Inconsistencies prioritized (which to fix vs which are intentional)
- [ ] Decision matrix documented (when to use which model)

### Red Flags Found:
- [ ] Same resource using different auth models
- [ ] Dual checks without justification
- [ ] Incomplete POV queries (missing fields)
- [ ] Comments like "// TODO: check permissions"
- [ ] Inconsistent error messages (permission vs access denied)

### Architecture Validated:
- [ ] Clear separation: resource-level vs system-level operations
- [ ] Ownership model documented (when it's appropriate)
- [ ] Role-based model documented (when it's appropriate)
- [ ] Dual-layer documented (if used, why it's needed)

---

## 🎯 Example Finding

**Discovered**: November 7, 2025 (Task Domain Security Audit)

### Task Operations Authorization Inconsistency

**Inconsistency**:
```typescript
// CREATE (lib/tasks/handlers/task.ts:60-68)
const hasCreatePermission = await checkPermission(
  { id: user.userId, role: user.role as UserRole },
  { id: povId, type: ResourceType.PoV },
  ResourceAction.EDIT
);
// Checks role_permissions table

// UPDATE (app/api/tasks/[taskId]/route.ts:201)
validatePOVAccess(user, task.pov, { throwOnDeny: true });
// Checks ownership/team membership

// RESULT: DEMO_USER can create (has pov->edit permission)
//         but can't edit (not checking permissions table)
```

**Impact**:
- Users could create tasks but not edit/delete them
- Confusing error messages
- Required manual permission table updates

**Fix**: Aligned all task operations to validatePOVAccess (ownership-based)
- Commits: 8e87af5, 16ed2d4
- Time: 35 minutes
- Result: 100% consistency across 27 files

**Decision Matrix Created**: authorization-dual-layer-pattern.md
- Resource operations → validatePOVAccess
- System operations → checkPermission
- Sensitive operations → Both (if compliance requires)

---

## 🔄 Quarterly Review Checklist

- [ ] Run authorization automated scan (5 min)
- [ ] Check for new dual-check patterns
- [ ] Verify POV query completeness (automated)
- [ ] Review authorization decisions (still appropriate?)
- [ ] Document any new patterns

**Tools**:
- `./scripts/audit-pov-access-completeness.sh` (automated)
- Grep commands above (manual verification)

---

## 📚 Related Resources

**Patterns**:
- `authorization-dual-layer-pattern.md` - When to use which model
- `cross-domain-security-patterns.md` - Pattern 2A (validatePOVAccess)

**Discoveries**:
- `auth-permissions-discovery.md` - Section 2 (authorization model)
- `security-discovery.md` - Section 2 (authorization commands)

**Tools**:
- `scripts/audit-pov-access-completeness.sh` - Automated scan (27 files)

---

**Discovery Complete** ✅
**Use Case**: Ensure consistent authorization model across codebase
**Frequency**: Quarterly or when permission bugs reported
**Priority**: HIGH (prevents subtle permission failures)
