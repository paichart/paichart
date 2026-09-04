# Schema Application Audit Discovery
**Purpose**: Detect validation schemas that are defined but never applied
**Category**: Security Validation
**Priority**: CRITICAL
**Time**: 45-60 minutes
**Created**: November 8, 2025 (from Agent Domain Security Audit)

---

## 🎯 What This Discovery Finds

**Problem**: Validation schemas exist in codebase but endpoints use manual field mapping instead, bypassing ALL validation (injection detection, type checking, XSS prevention, etc.).

**Example** (Discovered Nov 8, 2025):
```typescript
// Schema exists in lib/validation/agent-template-validation.ts
export const UpdateAgentTemplateSchema = z.object({
  promptTemplate: z.string()
    .max(50000)
    .refine(detectPromptInjection), // ✅ Has injection detection
  // ... all fields validated
});

// But route uses manual mapping instead!
// app/api/agent-templates/[templateId]/route.ts
const updateData: any = {};
if (body.promptTemplate !== undefined) updateData.promptTemplate = body.promptTemplate; // ❌ NO VALIDATION!
await prisma.agentTemplate.update({ data: updateData }); // ❌ DIRECT TO DATABASE!
```

**Impact**:
- **CRITICAL security bypass** (prompt injection, XSS, SQL injection)
- False sense of security (schema exists, but not used)
- No type safety (any type bypasses TypeScript)
- No error messages (validation never runs)

**Risk**: 90/100 (CRITICAL) - Validation bypass = Security bypass

---

## 📋 Discovery Process

### Step 1: Inventory All Validation Schemas (10 min)

List all exported validation schemas:

```bash
# Find all validation schemas
grep -rn "export const.*Schema.*z\.object" lib/validation/ | \
  awk -F: '{print $1 ":" $2 " " $3}' | \
  sed 's/export const //' | \
  sed 's/ =.*//' | \
  sort > /tmp/all-schemas.txt

echo "Found $(wc -l < /tmp/all-schemas.txt) validation schemas"
cat /tmp/all-schemas.txt
```

**Output**: List of all validation schemas with file locations

**Example**:
```
lib/validation/agent-template-validation.ts:314 CreateAgentTemplateSchema
lib/validation/agent-template-validation.ts:335 UpdateAgentTemplateSchema
lib/validation/agent-template-validation.ts:487 AgentExecuteSchema
lib/validation/task-validation.ts:25 CreateTaskSchema
lib/validation/task-validation.ts:72 UpdateTaskSchema
```

---

### Step 2: Find Schema Imports (15 min)

Check which schemas are imported by API routes:

```bash
# Find all schema imports in API routes
echo "=== Schema Imports in API Routes ===" > /tmp/schema-usage.txt

find app/api -name "*.ts" -type f | while read file; do
  imports=$(grep -h "import.*Schema.*from.*validation" "$file" 2>/dev/null)
  if [ ! -z "$imports" ]; then
    echo "📄 $file" >> /tmp/schema-usage.txt
    echo "$imports" >> /tmp/schema-usage.txt
    echo "" >> /tmp/schema-usage.txt
  fi
done

cat /tmp/schema-usage.txt
```

**Output**: List of routes importing schemas

**Example**:
```
📄 app/api/agent-templates/route.ts
import { CreateAgentTemplateSchema } from '@/lib/validation/agent-template-validation';

📄 app/api/agent-templates/[templateId]/route.ts
import { UpdateAgentTemplateSchema } from '@/lib/validation/agent-template-validation';

📄 app/api/tasks/route.ts
import { CreateTaskSchema } from '@/lib/validation/task-validation';
```

---

### Step 3: Find Schema Usage (.safeParse calls) (15 min)

Check if imported schemas are actually used:

```bash
# For each route that imports schemas, check for .safeParse() usage
echo "=== Schema Usage Analysis ===" > /tmp/schema-application.txt

find app/api -name "*.ts" -type f | while read file; do
  # Check if file imports schemas
  schemas=$(grep "import.*Schema.*from.*validation" "$file" | sed 's/.*{\(.*\)}.*/\1/' | tr ',' '\n' | tr -d ' ')

  if [ ! -z "$schemas" ]; then
    echo "📄 $file" >> /tmp/schema-application.txt

    for schema in $schemas; do
      # Check if schema is used with .safeParse() or .parse()
      if grep -q "${schema}\.safeParse\|${schema}\.parse" "$file"; then
        echo "  ✅ $schema: APPLIED" >> /tmp/schema-application.txt
      else
        echo "  ❌ $schema: IMPORTED BUT NOT USED!" >> /tmp/schema-application.txt
      fi
    done

    echo "" >> /tmp/schema-application.txt
  fi
done

cat /tmp/schema-application.txt
```

**Output**: Schema application status

**Example**:
```
📄 app/api/agent-templates/route.ts
  ✅ CreateAgentTemplateSchema: APPLIED

📄 app/api/agent-templates/[templateId]/route.ts
  ❌ UpdateAgentTemplateSchema: IMPORTED BUT NOT USED!  ← CRITICAL!

📄 app/api/tasks/route.ts
  ✅ CreateTaskSchema: APPLIED
```

---

### Step 4: Detect Manual Field Mapping Pattern (10 min)

Look for manual field mapping (validation bypass pattern):

```bash
# Find manual field mapping patterns
echo "=== Manual Field Mapping Detection ===" > /tmp/manual-mapping.txt

find app/api -name "*.ts" -type f -exec grep -l "const.*Data.*:.*any.*=.*{}" {} \; | while read file; do
  echo "📄 $file" >> /tmp/manual-mapping.txt

  # Show the pattern
  grep -A 10 "const.*Data.*:.*any.*=.*{}" "$file" | head -15 >> /tmp/manual-mapping.txt

  echo "" >> /tmp/manual-mapping.txt
done

cat /tmp/manual-mapping.txt
```

**Red Flag Pattern**:
```typescript
// ❌ DANGEROUS: Manual field mapping bypasses validation
const updateData: any = {};
if (body.name !== undefined) updateData.name = body.name;
if (body.description !== undefined) updateData.description = body.description;
if (body.promptTemplate !== undefined) updateData.promptTemplate = body.promptTemplate;
// ... 20+ lines of manual mapping
await prisma.model.update({ data: updateData });
```

**Safe Pattern**:
```typescript
// ✅ SECURE: Schema validation applied
const validationResult = UpdateSchema.safeParse(body);
if (!validationResult.success) {
  return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
}
const updateData = validationResult.data; // Type-safe, validated data
await prisma.model.update({ data: updateData });
```

---

### Step 5: Cross-Reference and Prioritize (5 min)

Match findings against endpoints to prioritize:

```bash
# Create prioritized fix list
echo "=== CRITICAL: Schemas Imported But Not Applied ===" > /tmp/priority-fixes.txt
echo "" >> /tmp/priority-fixes.txt

# Compare schema imports vs usage
grep "IMPORTED BUT NOT USED" /tmp/schema-application.txt | while read line; do
  file=$(echo "$line" | awk '{print $1}')
  schema=$(echo "$line" | awk '{print $2}' | sed 's/://')

  echo "File: $file" >> /tmp/priority-fixes.txt
  echo "Schema: $schema" >> /tmp/priority-fixes.txt
  echo "Risk: CRITICAL (validation bypass)" >> /tmp/priority-fixes.txt
  echo "Fix: Replace manual mapping with ${schema}.safeParse()" >> /tmp/priority-fixes.txt
  echo "" >> /tmp/priority-fixes.txt
done

cat /tmp/priority-fixes.txt
```

---

## 🔍 Discovery Commands

### Quick Scan (10 minutes)
```bash
#!/bin/bash
# Quick schema application audit

echo "=== Validation Schemas Defined ==="
grep -rh "export const.*Schema" lib/validation/ | wc -l

echo ""
echo "=== Schemas Imported in API Routes ==="
grep -rh "import.*Schema.*from.*validation" app/api/ | wc -l

echo ""
echo "=== Schemas Actually Used (.safeParse calls) ==="
grep -rh "\.safeParse(" app/api/ | wc -l

echo ""
echo "=== CRITICAL: Schemas Imported But Not Used ==="
# This will show files that import schemas but never call .safeParse()
find app/api -name "*.ts" -type f | while read file; do
  has_import=$(grep -c "import.*Schema.*from.*validation" "$file")
  has_usage=$(grep -c "\.safeParse\|\.parse" "$file")

  if [ $has_import -gt 0 ] && [ $has_usage -eq 0 ]; then
    echo "❌ $file"
  fi
done
```

### Comprehensive Audit (60 minutes)
```bash
#!/bin/bash
# Comprehensive schema application audit

OUTPUT="schema-application-audit-$(date +%Y%m%d).md"

cat > $OUTPUT << 'EOF'
# Schema Application Audit
**Date**: $(date)
**Purpose**: Find validation schemas that exist but aren't applied

## Summary

EOF

# Count schemas
echo "**Total Schemas Defined**: $(grep -rh "export const.*Schema" lib/validation/ | wc -l)" >> $OUTPUT
echo "**Total API Routes**: $(find app/api -name "*.ts" | wc -l)" >> $OUTPUT
echo "" >> $OUTPUT

# Find all schemas
echo "## All Validation Schemas" >> $OUTPUT
echo "" >> $OUTPUT
grep -rn "export const.*Schema.*z\.object" lib/validation/ | \
  sed 's/export const //' | \
  sed 's/ = z.object.*//' >> $OUTPUT
echo "" >> $OUTPUT

# Find unused schemas
echo "## ❌ CRITICAL: Schemas Imported But Not Applied" >> $OUTPUT
echo "" >> $OUTPUT

find app/api -name "*.ts" -type f | while read file; do
  schemas=$(grep "import.*Schema.*from.*validation" "$file" | sed 's/.*{\(.*\)}.*/\1/' | tr ',' '\n' | tr -d ' ')

  if [ ! -z "$schemas" ]; then
    for schema in $schemas; do
      if ! grep -q "${schema}\.safeParse\|${schema}\.parse" "$file"; then
        echo "### $file" >> $OUTPUT
        echo "**Schema**: $schema" >> $OUTPUT
        echo "**Status**: ❌ IMPORTED BUT NOT USED" >> $OUTPUT
        echo "**Risk**: CRITICAL (validation bypass)" >> $OUTPUT
        echo "" >> $OUTPUT

        # Show the code pattern
        echo "\`\`\`typescript" >> $OUTPUT
        echo "// Current pattern (likely manual mapping):" >> $OUTPUT
        grep -A 15 "body.*await.*json()" "$file" | head -20 >> $OUTPUT
        echo "\`\`\`" >> $OUTPUT
        echo "" >> $OUTPUT
      fi
    done
  fi
done

# Find manual mapping patterns
echo "## ⚠️ Manual Field Mapping Patterns (Validation Bypass)" >> $OUTPUT
echo "" >> $OUTPUT

find app/api -name "*.ts" -type f | while read file; do
  if grep -q "const.*Data.*:.*any.*=.*{}" "$file"; then
    echo "### $file" >> $OUTPUT
    echo "" >> $OUTPUT
    echo "\`\`\`typescript" >> $OUTPUT
    grep -B 5 -A 20 "const.*Data.*:.*any.*=.*{}" "$file" | head -30 >> $OUTPUT
    echo "\`\`\`" >> $OUTPUT
    echo "" >> $OUTPUT
  fi
done

echo "Audit saved to: $OUTPUT"
cat $OUTPUT
```

---

## 📊 Analysis Criteria

### Schema Application Status

**✅ APPLIED (Secure)**:
```typescript
import { UpdateSchema } from '@/lib/validation/...';

const validationResult = UpdateSchema.safeParse(body);
if (!validationResult.success) {
  return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
}
const data = validationResult.data;
```

**❌ IMPORTED BUT NOT USED (CRITICAL)**:
```typescript
import { UpdateSchema } from '@/lib/validation/...'; // Imported

// But then uses manual mapping instead:
const updateData: any = {};
if (body.field !== undefined) updateData.field = body.field;
// NO .safeParse() call - schema never used!
```

**⚠️ SCHEMA EXISTS BUT NOT IMPORTED (HIGH)**:
```typescript
// Schema exists: lib/validation/foo-validation.ts
export const UpdateFooSchema = z.object({ ... });

// But route doesn't import it:
// app/api/foo/[id]/route.ts
// NO import statement
// Manual field mapping used
```

---

### Red Flag Patterns

**1. Manual Field Mapping (CRITICAL)**:
```typescript
const updateData: any = {}; // ❌ any type bypasses validation
if (body.name !== undefined) updateData.name = body.name;
if (body.email !== undefined) updateData.email = body.email;
// ... 20+ lines of manual mapping
```

**2. Direct Body → Database (CRITICAL)**:
```typescript
const body = await request.json();
await prisma.model.update({
  data: body // ❌ Unvalidated user input directly to database!
});
```

**3. Partial Validation (HIGH)**:
```typescript
const validationResult = Schema.safeParse(body);
// ❌ Continues even if validation fails!
const data = body; // Uses original body, not validated data
await prisma.model.update({ data });
```

**4. Schema Import But Never Called (CRITICAL)**:
```typescript
import { UpdateSchema } from '@/lib/validation/...'; // Imported
// ... 100 lines of code
// ❌ UpdateSchema.safeParse() never called anywhere in file
```

---

## ✅ Success Criteria

### Complete Discovery Includes:
- [ ] All validation schemas inventoried (50+ schemas typical)
- [ ] All schema imports found and mapped to routes
- [ ] All .safeParse() usage documented
- [ ] All manual field mapping patterns identified
- [ ] CRITICAL gaps prioritized (imported but not used)

### Red Flags Found:
- [ ] Schemas imported but .safeParse() never called
- [ ] Manual field mapping (: any = {})
- [ ] Direct body → database updates
- [ ] Comments like "// TODO: add validation"
- [ ] updateData/createData variables with any type

### Security Impact:
- [ ] **CRITICAL**: Validation bypass on authentication endpoints
- [ ] **CRITICAL**: Validation bypass on data modification endpoints
- [ ] **HIGH**: No injection detection (XSS, SQL, prompt injection)
- [ ] **HIGH**: No type safety (TypeScript bypassed with any)
- [ ] **MEDIUM**: Poor error messages (validation never runs)

---

## 🎯 Example Finding

**Discovered**: November 8, 2025 (Agent Domain Security Audit)

### UpdateAgentTemplateSchema Not Applied

**Schema Exists** (lib/validation/agent-template-validation.ts:335):
```typescript
export const UpdateAgentTemplateSchema = BaseAgentTemplateSchema
  .partial()
  .refine((data) => {
    if (data.promptTemplate && data.variables) {
      const placeholders = extractPlaceholders(data.promptTemplate);
      const definedVars = data.variables.map(v => v.name);
      const missing = placeholders.filter(p => !definedVars.includes(p));

      if (missing.length > 0) {
        throw new Error(`Template has undefined variables: ${missing.join(', ')}`);
      }
    }
    return true;
  });
```

**Schema Imported** (app/api/agent-templates/[templateId]/route.ts:7):
```typescript
import { UpdateAgentTemplateSchema } from '@/lib/validation/agent-template-validation';
```

**But NOT USED!** (app/api/agent-templates/[templateId]/route.ts:202-222):
```typescript
// ❌ CRITICAL VALIDATION BYPASS
const updateData: any = {}; // any type bypasses TypeScript

if (body.name !== undefined) updateData.name = body.name;
if (body.description !== undefined) updateData.description = body.description;
if (body.promptTemplate !== undefined) updateData.promptTemplate = body.promptTemplate; // NO INJECTION DETECTION!
if (body.variables !== undefined) updateData.variables = body.variables;
// ... 21 lines of manual mapping

// Direct to database - NO VALIDATION!
const updatedTemplate = await prisma.agentTemplate.update({
  where: { id: templateId },
  data: updateData // Unvalidated data!
});
```

**Security Impact**:
- **Risk**: 90/100 (CRITICAL)
- **Vulnerability**: Prompt injection bypass (31 patterns not checked)
- **Vulnerability**: XSS bypass (no sanitization)
- **Vulnerability**: Type bypass (any type)
- **Vulnerability**: Malformed template accepted (no placeholder validation)

**Fix Applied** (10 minutes):
```typescript
// ✅ SECURE: Use the schema!
const validationResult = UpdateAgentTemplateSchema.safeParse(body);

if (!validationResult.success) {
  const errors = validationResult.error.errors;
  const hasInjection = errors.some(e => e.message.includes('injection'));

  if (hasInjection) {
    apiLogger.warn({
      userId: user.userId,
      templateId,
      patterns: errors.filter(e => e.message.includes('injection'))
    }, 'Prompt injection blocked');
  }

  return NextResponse.json(
    { error: 'Validation failed', details: validationResult.error.flatten() },
    { status: 400 }
  );
}

const updateData = validationResult.data; // Type-safe, validated!
await prisma.agentTemplate.update({ data: updateData });
```

**Result**: Risk reduced from 90 → 5 (-85 points)

---

## 🔄 Quarterly Review Checklist

- [ ] Re-run schema application audit (60 min)
- [ ] Check for new validation schemas added
- [ ] Verify previous fixes still applied
- [ ] Review new API routes for patterns
- [ ] Update validation standards if needed

**Automation Opportunity**:
```typescript
// tests/validation/schema-application.test.ts
describe('Schema Application Audit', () => {
  test('all imported schemas must be used', () => {
    // Automated check: import exists → .safeParse() exists
  });

  test('no manual field mapping patterns', () => {
    // Automated check: no ": any = {}" pattern in API routes
  });
});
```

---

## 📚 Related Discoveries

- `validation-coverage-discovery.md` - Overall validation pattern usage
- `security-logging-discovery.md` - Security event logging patterns
- `boundary-contract-discovery.md` - Cross-boundary validation

---

**Discovery Complete** ✅
**Use Case**: Detect and fix validation bypass vulnerabilities
**Frequency**: Quarterly or when adding new endpoints
**Priority**: CRITICAL (validation bypass = security bypass)
