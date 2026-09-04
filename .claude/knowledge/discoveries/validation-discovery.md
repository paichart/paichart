# Validation Discovery Prompt

**Last Updated**: 2026-02-27 (Added BC27 prototype pollution discovery)
**Status**: Enhanced v4.2 - Prototype pollution defense added
**Confidence**: Very High - Production-tested security validation + MCP parity
**Last Validated**: 2026-02-27 - BC27 eradication verified (38 sites, 12 files)

## 🆕 2026-05-27 Session — Run These Greps FIRST (enum-param + reserved-metadata)

```bash
# Enum query params MUST be validated before a Prisma enum where (raw/cast value → 500). Use parseEnumParam:
grep -rnE "searchParams\.get\('(status|priority|type|category)'\)" app/api --include="*.ts" | grep -v "parseEnumParam"
grep -rn "parseEnumParam\|sanitizePovMetadata" lib/ app/ --include="*.ts"

# Freeform JSON metadata write sites need reserved-key guards (isDemo/tenantId admin-only):
grep -rnE "metadata:\s*(safeRecord|FormField)" lib/validation/pov.ts
```

M-2 (enum→500) + MA-1 (metadata mass-assign) eradicated; both pinned in `scripts/test-security-invariants.ts`. Most list endpoints already safeParse (audit before applying). Ref: [[prelaunch-pentest-2026-05-26]].

---

## 🆕 2026-05-26 Session — Run These Greps FIRST (POV-save validation drift)

```bash
# outputArtifacts is an ARRAY of artifact refs, NOT an object (agentExecutionEngine writes
# createdArtifacts.map(...); 100% of prod rows are arrays). PHANTOM-CANONICAL: the POV-update
# route validates tasks[] via NestedTaskInputSchema (task-shapes.ts), NOT task-validation.ts.
# Grep ALL schema sites, then fix the one the FAILING route imports (not the canonically-named one):
grep -rn "outputArtifacts" lib/validation/ lib/pov/ --include="*.ts"
grep -nE "NestedTaskInputSchema|UpdatePOVSchemaComprehensive" lib/validation/pov.ts lib/validation/task-shapes.ts

# OptionalCUID now coerces ''/blank → undefined BEFORE .cuid() (forms send '' for empty selects,
# e.g. projectManager). An optional CUID field must not reject empty string:
grep -nE "OptionalCUID|preprocess" lib/validation/form-field-patterns.ts
```

Lesson: phantom-canonical applies to VALIDATION schemas too (error field-path prefix `tasks.N.x` → nested route schema). Commits `56daff3b` (wrong schema first) → `4ed400f0` (real). Ref: [[Phantom canonical audit]] memory.

---

## Overview
This discovery investigates the comprehensive multi-layer validation architecture in the pAIchart platform, including schema validation, form validation, API validation, database constraints, security validation patterns from Plans 7 & 8, and MCP layer validation parity checking.

**MCP Parity Context (Dec 2025)**: Critical discovery that MCP layer validation must align with main UI validation:
- Whitelist patterns (SAFE_NAME, SAFE_TEXT) block unicode/markdown - use for lookup keys ONLY
- Semantic patterns (RichTextField, SimpleTextField, detectPromptInjection) allow legitimate content while blocking LLM attacks
- Parity checker tool: `scripts/check-validation-parity.ts`

**Plan 7 Security Context**: The system implements comprehensive input validation:
- ALLOWED_MCP_ACTIONS whitelist for action validation
- Multi-layer injection prevention (SQL, XSS, path traversal)
- Request body size limit: **`express.json({ limit: '10mb' })`** on the MCP/Express
  layer ONLY (`lib/mcp/server/express-setup.ts:90,97`). Next.js App Router routes
  (`app/api/**`) have **no body-size cap** — bounded only by per-field Zod caps
  (`FIELD_LIMITS.CONTENT` 50000, bulk array caps) and the upstream proxy. The older
  "50KB general / 10KB sensitive" claim was **never implemented** (verified absent
  2026-06-17 runtime-limits sweep — sec-ops); an explicit Next.js/edge body cap is a
  LOW-MEDIUM defense-in-depth backlog item, not a shipped control.
- Security event logging for validation failures

**Plan 8 Context**: Enhanced validation across MCP ecosystem:
- Unified validation framework for 24 MCP tools
- Validated data usage patterns (never use original request)
- API → Validation → Service → DB strict flow

## Phase 1: Core Validation Infrastructure

### 1.1 Zod Schema System Discovery
```bash
# Find all Zod-based validation files
find . -name "*.ts" -o -name "*.tsx" | xargs grep -l "import.*zod" | head -20

# Count total Zod usages in codebase
grep -r "z\." . --include="*.ts" --include="*.tsx" | wc -l

# Discover core validation schemas
ls -la ./lib/validation/
find . -path "*/validation/*" -name "*.ts"
```

### 1.1a Discriminated-Union API Boundary Schemas (NEW — Apr 2026)
```bash
echo "=== DISCRIMINATED-UNION API SHAPES ==="
# Pattern: API responses with variant-dependent fields must use
# z.discriminatedUnion(...) at the boundary, NOT loose optional fields.
# TS then enforces role↔field coherence at compile time and Zod
# enforces it at runtime (via .safeParse before NextResponse.json).
#
# Canonical instance: lib/validation/pipeline-context-schemas.ts
# (PipelineContextResponse: HARNESS | CHILD | NONE)

grep -rn 'z\.discriminatedUnion' lib/validation/
echo "Discriminated-union schemas"

echo "--- Runtime Schema.safeParse at API response boundaries ---"
grep -rn 'Schema\.safeParse(\|Schema\.parse(' app/api/ --include='*.ts' | head -10
echo "Response-shape validation sites (server-side — catches shape drift in dev before prod)"
```

### 1.1b Test:all-validation Chain (NEW — Apr 2026)
```bash
echo "=== TEST:ALL-VALIDATION CHAIN INVENTORY ==="
# The test:all-validation npm script runs the full Layer-1 pattern battery
# across every domain. Entries must follow the naming convention test:<domain>
# and each suite must have a deliberate-regression sanity check (verify
# sabotaging one line correctly fails the suite).

grep -oE 'test:[a-z0-9-]+' package.json | sort -u
echo "All test:<domain> scripts"

echo "--- Scripts in the test:all-validation chain ---"
grep -oE 'npm run test:[a-z0-9-]+' package.json | sort -u
echo "These run together via: npm run test:all-validation"

echo "--- Layer-1 pattern-test scripts (file-scan regression guards) ---"
ls scripts/test-*.ts | head -20
echo "Pattern test suites (Layer-1 = grep-based source-code assertions)"
```

### 1.2 AJV Validation Patterns Discovery
```bash
# Find AJV usage patterns
find . -name "*.ts" | xargs grep -l "ajv" | head -10
grep -r "ajv\|Ajv" ./lib --include="*.ts" | head -20
```

### 1.3 Form Validation Discovery  
```bash
# Find React Hook Form with Zod integration
find . -name "*.tsx" | xargs grep -l "zodResolver" | head -15
grep -r "useForm(" ./components --include="*.tsx" | wc -l
```

## Phase 2: Validation Architecture Mapping

### 2.1 Multi-Layer Validation Structure
```bash
# API route validation patterns
grep -r "\.parse\|\.safeParse" ./app/api --include="*.ts" | head -10
find ./app/api -name "*.ts" | xargs grep -l "validation"

# Service layer validation
ls -la ./lib/services/*/validation* 2>/dev/null || echo "No service validation found"
find ./lib -name "*validation*" -type f
```

### 2.2 Template & Schema Validation
```bash
# Template validation system
find . -name "*validator*" -type f
grep -r "validateTemplate\|validateSchema" ./lib --include="*.ts"
```

### 2.3 Database Constraint Validation
```bash
# Database schema constraints
grep -c "@unique\|@@unique\|@@index\|@default" ./prisma/schema.prisma
grep -A5 -B5 "@@unique\|@@index" ./prisma/schema.prisma | head -30
```

### 2.4 MCP Security Validation (Plans 7 & 8)
```bash
# Plan 7: Input validation framework
echo "=== Plan 7: Security Validation Framework ==="
ls -la ./lib/validation/input-validation-framework.ts
# 2026-07-28: was `grep -c "detectInjection\|validateSize"`, which returned 0 — neither
# symbol exists anywhere in lib/validation or lib/security. The FILE is present; only the
# grep was stale, so this read as "framework absent" when it is not. Note the
# `|| echo "0"` makes a missing file and a genuine zero indistinguishable — the same
# false-clean shape that made three log greps unreadable on 2026-07-28. Match what the
# module actually exports:
grep -nE "^export const (ValidationPatterns|ValidationSchemas)" ./lib/validation/input-validation-framework.ts
# Expected: 2 hits. Zero means the module was gutted or renamed — check before assuming
# the validation framework is gone.

# MCP action validation with whitelist
ls -la ./lib/validation/mcp-action-validation.ts
grep "ALLOWED_MCP_ACTIONS" ./lib/validation/mcp-action-validation.ts -A 15

# Hub tools validation (Phase 3 C1, 2026-05-16: lib/validation/mcp-hub-validation.ts
# DELETED — constraints migrated to the L1 MCP dispatch boundary in tool-schemas.js)
ls -la ./lib/mcp/server/config/tool-schemas.js
grep -c "registry:\|services:" ./lib/mcp/server/config/tool-schemas.js 2>/dev/null || echo "0"

# Security patterns in validation
echo "=== Security Validation Patterns ==="
grep -r "SQL.*injection\|XSS\|path.*traversal" ./lib/validation/ --include="*.ts" | head -10

# Request body size limit — the ONLY real one is the Express/MCP layer (NOT in lib/validation/):
grep -n "express.json\|limit:" ./lib/mcp/server/express-setup.ts   # → limit: '10mb' (MCP layer only)
# Next.js App Router routes have no body cap — this grep over lib/validation/ finds only the
# RichTextField FIELD cap (50KB per-field), which is NOT a request-body limit:
grep -r "FIELD_LIMITS\|50000" ./lib/validation/ --include="*.ts" | head -5

# Validated data usage
grep -r "validated.*data\|validatedData" ./lib/validation/ --include="*.ts" | head -10

# Security event logging
grep -r "security.*event\|validation.*failure.*log" ./lib/validation/ --include="*.ts" | head -5
```

### 2.5 Bug Class Validation Gaps (Feb 2026)
```bash
# Validation-related bug classes from registry
echo "=== Bug Class 2: Prisma Json Column Ambiguity ==="
echo "Json columns that may return string instead of object:"
echo "TS pattern (as Record<string casts):"
grep -rn 'as Record<string' --include='*.ts' lib/ app/ | grep -i 'metadata\|config\|capabilities\|context\|artifacts\|variables\|steps' | grep -v ensureObject | head -10
echo "JS pattern (.field || {} without guard):"
grep -rn '\.\(metadata\|steps\|variables\|configuration\) || [{\[]' --include='*.js' lib/ | grep -v node_modules | grep -v ensureObject | grep -v 'Array\.isArray' | head -10

echo -e "\n=== Bug Class 3: Form Boundary Type Loss ==="
echo "Zod number schemas without coercion (may reject string numbers from forms):"
grep -rn 'z\.number()' --include='*.ts' lib/validation/ | grep -v 'coerce\|union\|transform' | head -10

echo -e "\n=== Bug Class 4: Null vs Undefined ==="
echo "Form coercion patterns (|| null) that may conflict with Prisma behavior:"
grep -rn '|| null' --include='*.tsx' components/ | head -10

echo -e "\n=== Bug Class 1: Transport Boundary (at validation layer) ==="
echo "MCP tool args parsed without ensureObject guard:"
grep -rn '\.parse(args\|\.parse(request' --include='*.ts' services/*/src/ | grep -v ensureObject | head -5
```

**Reference**: `/.claude/knowledge/domain/mcp/bug-class-registry.md`
**Protocol**: `/.claude/knowledge/protocols/bug-class-eradication-protocol.md`

### 2.6 BC27: Prototype Pollution via Passthrough Validation (Feb 2026; extended 2026-05-16 Phase 2 N4)
```bash
echo "=== BC27: Prototype Pollution — Unprotected Sites ==="

# CRITICAL: Scope MUST include both lib/validation/ AND lib/mcp/server/config/
# (dispatch-boundary schemas live in tool-schemas.js — they got missed by the
# Feb 2026 audit which only scanned lib/validation/. See Phase 2 N4 retrospective:
# Phase 1's F5 grep returned 13 sites; the actual count including dispatch was 17.
# Per [[feedback_phantom_canonical_audit]] — broaden scope before grepping.)
PATHS="lib/validation/ lib/mcp/server/config/"

# Find .passthrough() without stripDangerousKeys transform
echo "--- Unprotected .passthrough() sites ---"
grep -rn '\.passthrough()' $PATHS --include='*.ts' --include='*.js' | grep -v 'stripDangerousKeys' | grep -v 'safePassthrough'

# Find z.record(z.any()) without stripDangerousKeys transform
echo "--- Unprotected z.record(z.any()) sites ---"
grep -rn 'z\.record(z\.any())' $PATHS --include='*.ts' --include='*.js' | grep -v 'stripDangerousKeys' | grep -v 'safeRecord'

# Phase 2 N4 addition (2026-05-16) — JSON-string transform branch.
# Phase 1's F5 grep MISSED these: `z.string().transform((str, ctx) => JSON.parse(str))`
# returns a raw parsed object without strip. Found at tool-schemas.js:752,778,803
# in the capabilities-as-JSON-string branches. Both validation-engine AND sec-ops
# Phase 2 N4 cross-review caught this convergently.
echo "--- Unprotected JSON-string transform branches (Phase 2 N4 pattern) ---"
grep -rnE 'z\.string\(\)\.transform.*JSON\.parse' $PATHS --include='*.ts' --include='*.js' | grep -v 'stripDangerousKeys' | grep -v 'deepStripDangerousKeys'

# Depth-N audit recipe (2026-05-16) — when to swap shallow strip for deep.
# `deepStripDangerousKeys` is needed for:
#   (a) Cross-trust forwarded fields — args/payloads that get forwarded to
#       external services (`services.call.arguments`, `services.steps[].arguments`)
#   (b) DB-persisted JSON columns — fields like `capabilities`, `configuration`
#       where depth-1+ pollution survives shallow strip
# Shallow `stripDangerousKeys` is fine for: top-level user-input objects that
# stay in-process and don't get re-spread downstream.
echo "--- Depth-N candidate sites (cross-trust + DB-persisted JSON) ---"
echo "z.record/passthrough sites WITHOUT deepStrip — review for cross-trust/DB-persisted use:"
grep -rnE '(\.passthrough\(\)|z\.record\(z\.any\(\)\))' $PATHS --include='*.ts' --include='*.js' | grep -v 'deepStripDangerousKeys' | grep -v 'deepSafePassthrough'

echo "--- KEEP IN SYNC drift check (TS canonical vs JS inlined copy) ---"
echo "deepStripDangerousKeys is duplicated in tool-schemas.js (JS) and sanitize-keys.ts (TS)."
echo "DANGEROUS_KEYS constants must match between them:"
grep -nE "DANGEROUS_KEYS|deepStripDangerousKeys" lib/utils/sanitize-keys.ts lib/mcp/server/config/tool-schemas.js | head -10
echo "(Smoke test #21 in scripts/test-mcp-phase1-smoke.ts asserts equality.)"

# Verify sanitize-keys utility exists
echo "--- Sanitize-keys utility ---"
ls -la lib/utils/sanitize-keys.ts
grep -c 'stripDangerousKeys\|deepStripDangerousKeys' lib/utils/sanitize-keys.ts

# Verify zod-helpers has safe wrappers
echo "--- Zod safe wrappers ---"
grep -n 'safePassthrough\|safeRecord\|deepSafePassthrough' lib/validation/zod-helpers.ts

# Verify ensureObject defense-in-depth
echo "--- ensureObject defense-in-depth ---"
grep -n 'stripDangerousKeys' lib/utils/ensure-object.ts

# Count protected vs total sites
# Protection = inline .transform(stripDangerousKeys) OR helper call (safePassthrough/safeRecord)
echo "--- Protection coverage ---"
echo "Total .passthrough(): $(grep -r '\.passthrough()' lib/validation/ --include='*.ts' | wc -l)"
echo "Protected .passthrough() (inline + helper): $(grep -rE '\.passthrough\(\)|safePassthrough\(\)' lib/validation/ --include='*.ts' | grep -E 'stripDangerousKeys|safePassthrough' | wc -l)"
echo "Total z.record(z.any()) + safeRecord(): $(grep -rE 'z\.record\(z\.any\(\)\)|safeRecord\(\)' lib/validation/ --include='*.ts' | wc -l)"
echo "Protected (inline + helper): $(grep -rE 'z\.record\(z\.any\(\)\)\.transform\(stripDangerousKeys|safeRecord\(\)' lib/validation/ --include='*.ts' | wc -l)"

# Boy-scout opportunities — inline transforms that could collapse to the helper
echo "--- Boy-scout: inline-transform sites that could use helpers ---"
echo "z.record(z.any()).transform(stripDangerousKeys) sites:"
grep -rEn 'z\.record\(z\.any\(\)\)\.transform\(stripDangerousKeys\)' lib/validation/ --include='*.ts' | grep -v zod-helpers.ts
echo "z.object({}).passthrough().transform(stripDangerousKeys) sites (empty-object only — typed objects keep inline form):"
grep -rEn 'z\.object\(\{\}\)\.passthrough\(\)\.transform\(stripDangerousKeys\)' lib/validation/ --include='*.ts' | grep -v zod-helpers.ts
```

**Pattern**: Chain `.transform(stripDangerousKeys)` after every `.passthrough()` and `z.record(z.any())`. For new schemas, use `safePassthrough()` or `safeRecord()` from `lib/validation/zod-helpers.ts`.

**Key files**:
- `lib/utils/sanitize-keys.ts` — Strips `__proto__`, `constructor`, `prototype` keys
- `lib/validation/zod-helpers.ts` — `safePassthrough()`, `safeRecord()`, `deepSafePassthrough()`
- `lib/utils/ensure-object.ts` — Defense-in-depth (strips on all parsed JSON)

### 2.7 BC76: Post-safeParse Raw-Body Read (2026-05-14)
```bash
echo "=== BC76: safeParse callers that read raw input instead of validation.data ==="

# Inventory: every safeParse call in routes and handlers
echo "--- safeParse call sites ---"
grep -rln "\.safeParse(" app/api/ lib/ --include="*.ts" > /tmp/safeparse-callers.txt
wc -l /tmp/safeparse-callers.txt

# Heuristic suspects: files where .safeParse count exceeds .data-use count.
# Caveats: false positives expected (.data at end-of-line is missed; type
# guards using only .success show up; multi-handler files trip the count).
# Treat output as a triage list — confirm by reading the file.
echo "--- Heuristic suspects ---"
for f in $(cat /tmp/safeparse-callers.txt); do
  safeparse_count=$(grep -cE "\.safeParse\(" "$f")
  data_use_count=$(grep -cE "\.data!?[^a-zA-Z]|validatedData\b|validatedBody\b|parsedData\b" "$f")
  if [ "$data_use_count" -lt "$safeparse_count" ]; then
    echo "SUSPECT (safeParse: $safeparse_count, .data: $data_use_count): $f"
  fi
done

# Canonical anti-pattern shapes (direct grep)
echo "--- Anti-pattern: filteredData / body / 'as any' near safeParse ---"
grep -rnE "\.safeParse\([^)]*\)" app/api/ lib/ --include="*.ts" -A 25 \
  | grep -E "= filteredData\b|= body\s*[);]|safeData = .*as any|filteredData as any"
```

**Pattern**: After `Schema.safeParse(input)`, downstream code MUST read from `validation.data`, never from the raw `body` / `filteredData` / request input. Reading raw bypasses every `.refine()`, `.transform()`, and unknown-key strip in the schema. See `.claude/knowledge/domain/mcp/bug-class-registry.md` § Bug Class 76 (3 confirmed instances, all ERADICATED 2026-05-14, 93 dual-layer tests locking the bug class).

**Coupled trap**: when fixing a BC76 site, the route may read fields that aren't declared in the schema's top level. Swapping `body` → `validation.data` will silently drop them (Zod's default unknown-key strip). Always audit the schema's declared field set against everything the handler actually reads — fixes ship atomically. Example: `objective` was persisting in production *only* because of the bypass at `app/api/pov/route.ts:546`.

## Phase 3: Cross-Layer Integration Analysis

### 3.1 Error Handling & Middleware
```bash
# Validation error handling
find . -name "*error*" -type f | grep -i valid
grep -r "ValidationError" ./lib --include="*.ts"
```

### 3.2 Security & Sanitization Patterns
```bash
# Input sanitization patterns  
find . -name "*.ts" -o -name "*.tsx" | xargs grep -l -i "sanitiz" | head -10
grep -r -i "DOMPurify\|sanitizeHtml\|xss" . --include="*.ts" --include="*.tsx"
```

## Phase 4: Performance & Optimization

### 4.1 Validation Performance Analysis
```bash
# Large schema analysis
find . -name "*.ts" | xargs grep -l "z\.object" | head -10
grep -r "schema\.parse\|safeParse" . --include="*.ts" | wc -l
```

### 4.2 Validation Dependencies
```bash
# Package dependencies for validation
grep -A10 -B5 "zod\|ajv" ./package.json
```

## Phase 5: Production-Tested Validation Patterns ⭐ NEW 2025-11-02

**Source**: Week 6 POV validation debugging (commits 18b0193, 2dfd58f)
**Purpose**: Discover validation patterns that prevent production bugs
**Evidence**: Proven to fix 15 production validation errors

### 5.1 Optional vs Nullable vs Nullish Pattern Discovery
```bash
# Find fields with only .optional() (potentially missing .nullable())
echo "=== Fields with .optional() but NOT .nullable() (potential issue) ==="
grep -rn "\.optional()" lib/validation/ app/api/ lib/*/handlers/ \
  --include="*.ts" | grep -v "\.nullable()" | grep -v "\.nullish()" | head -20

# Find fields with .nullable().optional() (correct pattern for form data)
echo "=== Fields with .nullable().optional() (correct form pattern) ==="
grep -rn "\.nullable()\.optional()" lib/validation/ app/api/ lib/*/handlers/ \
  --include="*.ts" | head -20

# Find fields with .nullish() (shorthand for both)
echo "=== Fields with .nullish() (shorthand pattern) ==="
grep -rn "\.nullish()" lib/validation/ app/api/ lib/*/handlers/ \
  --include="*.ts" | head -20

# Analysis: Compare counts
echo "=== Pattern Usage Statistics ==="
echo "Only .optional(): $(grep -r "\.optional()" lib/validation/ --include="*.ts" | grep -v "\.nullable()" | grep -v "\.nullish()" | wc -l)"
echo ".nullable().optional(): $(grep -r "\.nullable()\.optional()" lib/validation/ --include="*.ts" | wc -l)"
echo ".nullish(): $(grep -r "\.nullish()" lib/validation/ --include="*.ts" | wc -l)"
```

### 5.2 Passthrough vs Strict Mode Discovery
```bash
# Find schemas with .passthrough() (UI integration pattern)
echo "=== Schemas with .passthrough() (allows UI state fields) ==="
grep -rn "\.passthrough()" lib/validation/ app/api/ lib/*/handlers/ \
  --include="*.ts" -B 10 | grep "const.*Schema" | head -20

# Find schemas with .strict() (security-critical pattern)
echo "=== Schemas with .strict() (rejects unknown fields) ==="
grep -rn "\.strict()" lib/validation/ app/api/ lib/*/handlers/ \
  --include="*.ts" -B 10 | grep "const.*Schema" | head -20

# Find schemas without either (implicit strict - potential issue)
echo "=== Schemas without .passthrough() or .strict() (implicit strict) ==="
grep -rn "= z\.object({" lib/validation/ app/api/ lib/*/handlers/ \
  --include="*.ts" -A 30 | grep "})" | head -20

# Analysis: Which pattern is dominant?
echo "=== Mode Usage Statistics ==="
echo ".passthrough(): $(grep -r "\.passthrough()" lib/validation/ app/api/ --include="*.ts" | wc -l)"
echo ".strict(): $(grep -r "\.strict()" lib/validation/ app/api/ --include="*.ts" | wc -l)"
echo "Neither (implicit): Check schemas above"
```

### 5.3 Union + Transform Pattern Discovery (Type Coercion)
```bash
# Find string-to-number coercion patterns
echo "=== String-to-Number Coercion Patterns ==="
grep -rn "z\.union.*z\.string.*z\.number.*transform" lib/validation/ \
  app/api/ lib/*/handlers/ --include="*.ts" -A 3 | head -30

# Find parseFloat/parseInt usage in transforms
echo "=== ParseFloat/ParseInt Transform Usage ==="
grep -rn "transform.*parseFloat\|transform.*parseInt" \
  lib/validation/ app/api/ lib/*/handlers/ --include="*.ts" -A 2 | head -20

# Find pipe() usage after transform
echo "=== Transform + Pipe Pattern (type coercion with validation) ==="
grep -rn "\.transform.*\.pipe" lib/validation/ app/api/ lib/*/handlers/ \
  --include="*.ts" -A 3 | head -20

# Analysis: Count union + transform usage
echo "=== Union + Transform Statistics ==="
echo "Total: $(grep -r "z\.union.*transform" lib/validation/ app/api/ --include="*.ts" | wc -l)"
```

### 5.4 Centralized Validation File Discovery
```bash
# Find all centralized validation files
echo "=== Centralized Validation Files ==="
find lib/validation/ -name "*-validation.ts" -o -name "validation.ts"

# Count schemas per centralized file
echo "=== Schemas Per Validation File ==="
for file in lib/validation/*-validation.ts lib/validation/validation.ts; do
  if [ -f "$file" ]; then
    count=$(grep -c 'export const.*Schema = z\.' "$file" || echo 0)
    echo "$(basename $file): $count schemas"
  fi
done

# Find validation defined in handlers (anti-pattern)
echo "=== Validation Defined in Handlers (should be centralized) ==="
grep -rn "const.*Schema = z\.object" app/api/ lib/*/handlers/ \
  --include="*.ts" | head -20
```

### 5.5 Date Validation Pattern Discovery
```bash
# Find strict datetime validation (Week 1-5 pattern)
echo "=== Strict Datetime Validation (z.string().datetime()) ==="
grep -rn "\.datetime()" lib/validation/ app/api/ lib/*/handlers/ \
  --include="*.ts" | head -20

# Find flexible date validation (Week 6 pattern)
echo "=== Flexible Date Validation (union of string/date) ==="
grep -rn "z\.union.*z\.string.*z\.date\|z\.union.*z\.date.*z\.string" \
  lib/validation/ app/api/ lib/*/handlers/ --include="*.ts" | head -20

# Analysis: Which pattern is more common?
echo "=== Date Pattern Statistics ==="
echo "Strict .datetime(): $(grep -r "\.datetime()" lib/validation/ app/api/ --include="*.ts" | wc -l)"
echo "Flexible union: $(grep -r "z\.union.*z\.date" lib/validation/ app/api/ --include="*.ts" | wc -l)"
```

### 5.6 Parse vs SafeParse Usage Discovery
```bash
# Backend should use .parse() with try-catch
echo "=== Backend .parse() Usage (in API routes/handlers) ==="
grep -rn "\.parse(" app/api/ lib/*/handlers/ --include="*.ts" | \
  grep -v "safeParse" | head -30

# Frontend should use .safeParse()
echo "=== Frontend .safeParse() Usage (in components) ==="
grep -rn "\.safeParse(" components/ app/ --include="*.tsx" --include="*.ts" | \
  head -30

# Find any backend using .safeParse() (potential issue)
echo "=== Backend .safeParse() Usage (should use .parse() instead) ==="
grep -rn "\.safeParse(" app/api/ lib/*/handlers/ --include="*.ts" | head -20

# Analysis: Pattern compliance
echo "=== Parse Pattern Statistics ==="
echo "Backend .parse(): $(grep -r "\.parse(" app/api/ lib/*/handlers/ --include="*.ts" | grep -v "safeParse" | wc -l)"
echo "Backend .safeParse(): $(grep -r "\.safeParse(" app/api/ lib/*/handlers/ --include="*.ts" | wc -l)"
echo "Frontend .safeParse(): $(grep -r "\.safeParse(" components/ --include="*.tsx" | wc -l)"
```

### 5.7 Proven Pattern Comparison (Weeks 1-6)
```bash
# Collect validation patterns from past implementations
echo "=== Collecting Proven Patterns from Weeks 1-6 ==="

# Week 1-6: Find .parse() usage
for week in {1..6}; do
  echo "Week $week .parse() usage:"
  grep "\.parse(" cline_docs/reviews/week-$week-*/implementation-plan*.md 2>/dev/null | \
    head -2
done

# Week 1-6: Find type strictness
echo "=== Type Strictness Patterns Across Weeks ==="
grep -rn "z\.number()\|z\.string()\.datetime()" \
  cline_docs/reviews/week-[1-5]-*/implementation-plan*.md | head -20

# Week 6: Find union + transform introduction
echo "=== Union + Transform Pattern (Week 6 New Pattern) ==="
grep -rn "z\.union.*transform" \
  cline_docs/reviews/week-6-*/implementation-plan*.md | head -10
```

### 5.8 Commit Verification Discovery
```bash
# Find recent validation commits
echo "=== Recent Validation-Related Commits ==="
git log --oneline --grep="validation\|schema\|zod" -20

# Check for incomplete commits (message vs diff mismatch)
echo "=== Checking Recent Commits for Completeness ==="
for commit in $(git log --oneline -10 | cut -d' ' -f1); do
  msg_fixes=$(git show $commit | head -20 | grep -oE "Fixed [0-9]+ |[0-9]+ fixes" | grep -oE '[0-9]+')
  diff_changes=$(git show $commit | grep "^[+-]" | grep -v "^+++" | grep -v "^---" | wc -l)
  if [ -n "$msg_fixes" ] && [ "$diff_changes" -lt "$((msg_fixes * 2))" ]; then
    echo "$commit: Claims $msg_fixes fixes but only $diff_changes lines changed (verify!)"
  fi
done
```

---

## Key Files to Investigate

### Core Validation Infrastructure
- `/lib/validation/base.ts` - Base validation classes and error handling
- `/lib/validation/pov.ts` - POV-specific validation schemas  
- `/lib/validation/mcpServerValidation.ts` - MCP server configuration validation
- `/lib/utils/template-schema-validator.ts` - Template schema normalization

### Service Layer Validation
- `/lib/pov/services/validation.ts` - POV business logic validation
- `/lib/pov/services/phaseValidation.ts` - Phase timeline and dependency validation
- `/lib/services/agentTemplateBuilder/templateValidationService.ts` - Agent template comprehensive validation

### Security Validation (Plans 7 & 8 + BC27)
- `/lib/validation/input-validation-framework.ts` - Comprehensive input validation with injection prevention
- `/lib/validation/mcp-action-validation.ts` - MCP action validation with ALLOWED_MCP_ACTIONS whitelist
- `/lib/mcp/server/config/tool-schemas.js` - Hub tools validation at the L1 MCP dispatch boundary (replaced the DELETED `/lib/validation/mcp-hub-validation.ts`, Phase 3 C1 2026-05-16); workflow orchestration schemas at `/lib/services/workflow/types/orchestration-params.ts`
- `/lib/middleware/validation-middleware.ts` - Reusable validation middleware for APIs
- `/lib/utils/sanitize-keys.ts` - Prototype pollution prevention (`stripDangerousKeys`, `deepStripDangerousKeys`)
- `/lib/validation/zod-helpers.ts` - Safe Zod wrappers (`safePassthrough`, `safeRecord`, `objectOrJsonString`)

### Form & Component Validation
- `/components/pov/creation/validation.ts` - Multi-step POV creation validation
- `/components/admin/templates/phase-builder/utils/validation.ts` - Template builder validation
- `/components/admin/templates/views/utils/validationService.ts` - Template view validation

### Template Validation Systems
- `/lib/pov/templates/validator.ts` - AJV-based POV template validation
- `/lib/pov/phase-templates/validator.ts` - AJV-based phase template validation

### Middleware & Error Handling
- `/middleware/error-handler.ts` - Central validation error formatting
- Package dependencies: Zod v3.24.2, AJV v8.17.1, @hookform/resolvers v3.10.0

## Investigation Commands

Run these commands to understand the validation system comprehensively:

```bash
# Get validation file counts and patterns
echo "=== VALIDATION SYSTEM ANALYSIS ==="
echo "Zod imports: $(find . -name "*.ts" -o -name "*.tsx" | xargs grep -l "import.*zod" | wc -l)"
echo "Zod usages: $(grep -r "z\." . --include="*.ts" --include="*.tsx" | wc -l)"
echo "AJV files: $(find . -name "*.ts" | xargs grep -l "ajv" | wc -l)"
echo "Form validation: $(find . -name "*.tsx" | xargs grep -l "zodResolver" | wc -l)"
echo "API validation: $(grep -r "\.parse\|\.safeParse" ./app/api --include="*.ts" | wc -l)"
echo "DB constraints: $(grep -c "@unique\|@@unique\|@@index\|@default" ./prisma/schema.prisma)"
echo "Validation files: $(find . -name "*validation*" -type f | wc -l)"
echo "Validator files: $(find . -name "*validator*" -type f | wc -l)"

# ⭐ Nov 2025: Find potential .parse() issues (should be safeParse)
echo "=== VALIDATION ERROR HANDLING ==="
echo "Using .parse() (potential 500 errors): $(grep -r "\.parse(data\|rawQuery\|body\|request)" app/api lib --include="*.ts" | wc -l)"
echo "Using .safeParse() (correct pattern): $(grep -r "\.safeParse(" app/api lib --include="*.ts" | wc -l)"

# List files still using .parse() (need review)
echo "Files using .parse():"
grep -rn "\.parse(data\|rawQuery\|body\|request)" app/api lib --include="*.ts" | cut -d: -f1 | sort -u

# Find validation schemas
echo "Validation schemas by file:"
for file in lib/validation/*.ts; do
  echo "  $(basename $file): $(grep -c "export const.*Schema" $file) schemas"
done
```

## Expected Findings

Based on initial scans, expect to discover:

1. **Comprehensive Zod Schema System**: 776+ Zod usages across 50+ files with structured validation layers
2. **AJV Template Validation**: Dual validation system using both Zod and AJV for different use cases
3. **Multi-Layer Architecture**: API → Service → Database validation with consistent error handling
4. **Form Integration**: React Hook Form + Zod resolver integration across 15+ components
5. **Template Systems**: Specialized validation for POV templates, phase templates, and agent templates
6. **Database Constraints**: 217+ database-level constraints (unique, indexes, defaults) in Prisma schema
7. **Error Centralization**: Unified error handling through middleware with typed error responses
8. **Performance Considerations**: Large schemas and validation optimization patterns
9. **MCP Validation Parity**: Aligned MCP layer validation (RichTextField/SimpleTextField) with main UI validation (detectPromptInjection) - blocks LLM attacks while allowing unicode/markdown
10. **Prototype Pollution Defense (BC27)**: All 38 `.passthrough()` and `z.record(z.any())` sites protected with `stripDangerousKeys()` transform — zero unprotected sites

## Phase 6: MCP Validation Parity Discovery (Dec 2025) ⭐ NEW

**Source**: Dec 22, 2025 - MCP task.update blocking legitimate markdown/unicode
**Purpose**: Detect and fix validation parity issues between MCP layer and main UI validation
**Tool**: `scripts/check-validation-parity.ts`

### 6.1 Run Parity Checker Tool
```bash
# Run the automated parity checker (finds MCP vs main validation mismatches)
npx ts-node scripts/check-validation-parity.ts

# Expected output:
# ✅ No parity issues found! - MCP and main validation aligned
# OR
# 🔴 HIGH SEVERITY: Field X - MCP uses whitelist but main uses semantic
```

### 6.2 Whitelist vs Semantic Pattern Discovery
```bash
# Find restrictive whitelist patterns (SAFE_NAME, SAFE_TEXT, COMMENT_TEXT)
# These block unicode, emojis, markdown - use for lookup keys ONLY
echo "=== Restrictive Whitelist Patterns (potential issues for user content) ==="
grep -rn "ValidationSchemas\.SAFE_NAME\|ValidationSchemas\.SAFE_TEXT\|ValidationSchemas\.COMMENT_TEXT" \
  lib/validation/mcp-*.ts

# Find semantic patterns (RichTextField, SimpleTextField, detectPromptInjection)
# These allow unicode/markdown while blocking LLM attacks - use for user content
echo "=== Semantic Patterns (correct for user content) ==="
grep -rn "RichTextField\|SimpleTextField\|detectPromptInjection" \
  lib/validation/mcp-*.ts

# Count usage of each pattern type
echo "=== Pattern Usage Statistics ==="
echo "Whitelist patterns: $(grep -r "ValidationSchemas\.SAFE" lib/validation/mcp-*.ts | wc -l)"
echo "Semantic patterns: $(grep -r "RichTextField\|SimpleTextField" lib/validation/mcp-*.ts | wc -l)"
```

### 6.3 Field-by-Field Parity Check
```bash
# Compare specific fields across MCP and main validation
echo "=== Description Field Comparison ==="
echo "MCP layer:"
grep -n "description:" lib/validation/mcp-action-validation.ts | head -5
echo "Main validation:"
grep -n "description:" lib/validation/task-validation.ts | head -5

echo "=== Title Field Comparison ==="
echo "MCP layer:"
grep -n "title:" lib/validation/mcp-action-validation.ts | head -5
echo "Main validation:"
grep -n "title:" lib/validation/task-validation.ts | head -5

# Find all text fields in MCP validation
echo "=== All Text Fields in MCP Validation ==="
grep -En "(description|title|comment|reason|note|prompt|role):" \
  lib/validation/mcp-action-validation.ts
```

### 6.4 Helper Function Discovery
```bash
# Find RichTextField helper (for long content: descriptions, prompts)
echo "=== RichTextField Helper (50KB max, markdown/emoji allowed) ==="
grep -A 10 "const RichTextField" lib/validation/mcp-action-validation.ts

# Find SimpleTextField helper (for short content: titles, names)
echo "=== SimpleTextField Helper (255 chars, unicode allowed) ==="
grep -A 10 "const SimpleTextField" lib/validation/mcp-action-validation.ts

# Check if detectPromptInjection is imported
echo "=== Security Import Check ==="
grep "import.*detectPromptInjection" lib/validation/mcp-action-validation.ts
```

### 6.5 Field Categorization Guide
```bash
# Find lookup key fields (should use SAFE_NAME - restrictive is correct)
echo "=== Lookup Key Fields (SAFE_NAME correct) ==="
grep -En "(phaseName|stageName|countryName|afterStage|beforeStage|assigneeName):" \
  lib/validation/mcp-action-validation.ts

# Find user content fields (should use SimpleTextField or RichTextField)
echo "=== User Content Fields (should allow unicode) ==="
grep -En "(title|customerName|opportunityName|objective|description|comment|reason|prompt):" \
  lib/validation/mcp-action-validation.ts

# Verify user content fields use semantic patterns
echo "=== User Content Using Correct Patterns ==="
for field in title customerName opportunityName objective description comment reason prompt; do
  echo "Field: $field"
  grep -A 1 "$field:" lib/validation/mcp-action-validation.ts | grep -E "RichTextField|SimpleTextField"
done
```

### 6.6 Integration Testing Commands
```bash
# Test MCP validation with unicode content (should pass)
echo "=== Test Unicode Title ==="
# Use MCP tool: task.update with title containing unicode

# Test MCP validation with markdown content (should pass)
echo "=== Test Markdown Description ==="
# Use MCP tool: task.update with markdown description

# Test MCP validation with emoji content (should pass)
echo "=== Test Emoji Content ==="
# Use MCP tool: task.update with emojis in title/description
```

---

**Key Discoveries from Dec 2025**:
1. **Whitelist vs Semantic**: MCP layer used COMMENT_TEXT (character whitelist: `a-zA-Z0-9\s\-_.`) while main validation used `detectPromptInjection` (31 semantic patterns)
2. **Impact**: Legitimate content (José, 客户, ✅, markdown) blocked by MCP layer
3. **Fix**: Created RichTextField/SimpleTextField helpers using semantic detection
4. **Pattern**: Lookup keys (phaseName) → SAFE_NAME (restrictive); User content (title, description) → SimpleTextField/RichTextField (semantic)

---

## Phase 7: Centralized Alias Mapping Discovery (Dec 2025 Sprint 3) ⭐ NEW

**Source**: Sprint 3 MCP Advanced Tools Testing (Dec 22, 2025)
**Purpose**: Discover centralized parameter alias mapping system for MCP action validation
**Impact**: 40 missing parameters fixed across 9 schemas

### 7.1 Centralized Alias Mapping System
```bash
# Find the PARAMETER_ALIAS_MAPPINGS constant (14 aliases)
echo "=== Centralized Alias Mappings ==="
grep -A 25 "const PARAMETER_ALIAS_MAPPINGS" lib/validation/mcp-action-validation.ts

# Find the normalizeAliases function
echo "=== normalizeAliases Function ==="
grep -A 20 "function normalizeAliases" lib/validation/mcp-action-validation.ts

# Find all schemas using normalizeAliases (5 schemas currently)
echo "=== Schemas Using Centralized Aliases ==="
grep -n "normalizeAliases" lib/validation/mcp-action-validation.ts

# Find context-specific aliases (e.g., stageName → name only for stage.create)
echo "=== Context-Specific Aliases ==="
grep -n "normalizeAliases.*{" lib/validation/mcp-action-validation.ts
```

### 7.2 Semantic Enum Mappings
```bash
# Find semantic enum mappings (6 fields)
echo "=== SEMANTIC_ENUM_MAPPINGS (user-friendly → valid) ==="
grep -A 50 "const SEMANTIC_ENUM_MAPPINGS" lib/validation/mcp-action-validation.ts

# Fields covered: priority, status, workflowType, position, type, analysisType
# Examples: urgent → HIGH, active → IN_PROGRESS, START → first
```

### 7.3 Error Message Enhancement
```bash
# Find example values for error messages (29 examples)
echo "=== Example Values for Error Messages ==="
grep -A 40 "const exampleValues" lib/validation/mcp-action-validation.ts

# Check error formatting with "you sent X but expected Y" pattern
echo "=== Helpful Error Message Pattern ==="
grep -n "you sent" lib/validation/mcp-action-validation.ts
```

### 7.4 Handler vs Schema Parity Audit
```bash
# Discovery #9: Find handler parameters not in schema
echo "=== Handler Parameter Extraction ==="
for handler in lib/mcp/tasks/action/handlers/*/*.ts; do
  echo "--- $handler ---"
  grep -A 30 "const {" "$handler" | grep -E "^\s+\w+," | head -20
done

# Compare with validation schema parameters
echo "=== Validation Schema Parameters ==="
grep -A 30 "'task.update':" lib/validation/mcp-action-validation.ts | head -35

# Reference: /.claude/knowledge/protocols/quarterly-review-protocol.md - Discovery #9
```

### Key Pattern: optional() + refine() + transform()
```typescript
// Sprint 3 Pattern for flexible validation with aliases
z.object({
  taskId: ValidationSchemas.TASK_ID.optional(),
  task_name: SimpleTextField(500).optional(),  // Alias accepted
  taskName: SimpleTextField(500).optional(),   // Canonical name
}).refine(
  data => data.taskId || data.task_name || data.taskName,
  { message: "Either taskId or task_name/taskName required" }
).transform(data => normalizeAliases(data))  // Centralized normalization
```

### Discovery Questions
1. Are all handler parameters covered by validation schemas?
2. Are alias mappings consistent with parameter-normalizer.js runtime layer?
3. Are error messages helpful with examples and suggestions?

---

## Step 5.9: Pino Structured Logging for Validation Events (NEW - Feb 2026)

**Purpose**: Assess pino logger adoption for validation failure and security event logging

```bash
echo "=== PINO VALIDATION LOGGING ANALYSIS ==="
echo "--- apiLogger Usage for Validation Failures ---"
grep -rn "apiLogger\.\(warn\|error\)" lib/ app/ --include="*.ts" | grep -i "validat\|inject\|attack\|schema" | head -20
echo "Validation failure logging via apiLogger"

echo -e "\n--- complianceLogger Usage for Audit Events ---"
grep -rn "complianceLogger\.\(info\|warn\|error\)" lib/ app/ --include="*.ts" | head -10
echo "Compliance audit logging"

echo -e "\n--- Security Event Context in Validation Code ---"
grep -rn "apiLogger\|complianceLogger" lib/validation/ --include="*.ts" | head -10
echo "Logger usage inside validation modules"

echo -e "\n--- Legacy console.log in Validation Code ---"
grep -rn "console\.\(log\|warn\|error\)" lib/validation/ --include="*.ts" | wc -l
echo "Legacy console.log calls in validation code (should be zero)"

echo -e "\n--- Validation Failure Logging Pattern Check ---"
grep -rn "safeParse" app/api/ lib/*/handlers/ --include="*.ts" -A 5 | grep -i "apiLogger\|complianceLogger\|warn\|error" | head -15
echo "Are validation failures (.safeParse) followed by pino logging?"

echo -e "\n--- Production Validation-Related Warnings ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"api\"' | grep -i 'validat\|inject' | jq" 2>/dev/null | tail -10

echo -e "\n--- Production Security Violations ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"level\":50' | grep -i 'inject\|attack\|violation' | jq" 2>/dev/null | tail -10
```

**Questions to answer**:
- Are validation failures being logged via `apiLogger.warn()` with structured context (schema name, endpoint, errors)?
- Are injection attempts (prompt, SQL, XSS) logged at error level with attack type?
- Is complianceLogger being used for validation audit events?
- Are there remaining console.log calls in validation modules?
- Can production PM2 JSON logs identify validation attack patterns?

---

## Step 6: Error Helper Pattern Discovery (Dec 2025)

Error helpers provide consistent validation error formatting across MCP tools.

```bash
echo "=== Error Helper Modules ==="
# Find error helper modules (validation error formatting)
ls -la lib/mcp/server/tools/basic/error-helpers.js
ls -la lib/mcp/server/tools/advanced/error-helpers.js
# tools/browser/ DELETED (17185e45 — browser automation moved to standalone Docker service); expect no browser error-helpers under lib/mcp

# Check error helper function signatures
echo "=== Error Helper Functions ==="
grep -n "^function\|^const.*Error\|module\.exports" lib/mcp/server/tools/basic/error-helpers.js | head -20

# Find validation-specific error functions
echo "=== Validation Error Functions ==="
grep -rn "validationError\|ValidationFailed" lib/mcp/server/tools/*/error-helpers.js

# Check field-level error formatting
echo "=== Field-Level Error Format ==="
grep -A 10 "fields:\|field:" lib/mcp/server/tools/basic/error-helpers.js

# Verify error helper usage in validation contexts
echo "=== Error Helper Integration ==="
grep -rn "require.*error-helpers" lib/mcp/server/tools/ --include="*.js" | wc -l
echo "handlers using error helpers"

# Check consistency with tool schema documentation
echo "=== Tool Schema Error Documentation ==="
grep -c "WHEN TO USE\|SEE ALSO\|EXAMPLES" lib/mcp/server/config/tool-schemas.js
echo "tools with complete documentation"
```

**Validation Integration**:
- Error helpers format validation failures with field-specific guidance
- Format: `fields: [{field: 'title', message: 'Required'}]` for UI highlighting
- Fuzzy suggestions help when ID/name lookups fail validation
- Emoji prefixes (❌🔍💡) provide visual categorization

**Key Functions**:
- `povNotFoundError()` - POV validation failures with suggestions
- `taskNotFoundError()` - Task validation failures with suggestions
- `validationFailedError()` - Generic validation with field details

**Discovery Questions**:
1. Are validation errors formatted with field-level details?
2. Do error helpers provide fuzzy suggestions for not-found errors?
3. Is error format consistent with unified error response format?

## Step 8: Named Workflow Validation Discovery (Jan 2026)

Discover workflow CRUD and execution validation for the admin-only REST API:

```bash
echo "=== NAMED WORKFLOW VALIDATION DISCOVERY ==="

# NOTE (2026-06-17 doc-drift fix): lib/validation/mcp-hub-validation.ts was DELETED
# in Phase 3 C1 (2026-05-16, phantom-canonical eradication — 10 schemas declared, only
# 2 wired). The workflow orchestration schemas now live in TWO canonical places:
#   - Engine-side source of truth: lib/services/workflow/types/orchestration-params.ts
#     (MCPOrchestrationParamsSchema, WorkflowStepSchema, the WORKFLOW_*_BOUNDS constants)
#   - MCP dispatch boundary (services action: "workflow.execute"): the inlined
#     WORKFLOW_* constants + steps[] schema in lib/mcp/server/config/tool-schemas.js:143-152,884-929
#   - Named-workflow REST CRUD (admin): lib/workflows/schemas.ts (re-exports WorkflowStepSchema)
# Alignment between engine + dispatch-boundary copies is enforced by
# scripts/test-workflow-schema-alignment.ts (build fails on drift).

echo "--- Workflow Orchestration Schema (engine source of truth) ---"
grep -A 30 "MCPOrchestrationParamsSchema" lib/services/workflow/types/orchestration-params.ts

echo "--- workflowName Parameter Support ---"
grep -rn "workflowName" lib/validation/ lib/workflows/ lib/services/workflow/ app/api --include="*.ts"

echo "--- Workflow Step Schema ---"
grep -A 20 "WorkflowStepSchema" lib/services/workflow/types/orchestration-params.ts

echo "--- Workflow REST API Validation ---"
ls -la app/api/workflows/*.ts app/api/workflows/**/*.ts 2>/dev/null
grep -n "safeParse\|parse" app/api/workflows/*.ts app/api/workflows/**/*.ts 2>/dev/null

echo "--- Admin-Only Validation Pattern ---"
grep -rn "allowedRoles.*ADMIN" app/api/workflows --include="*.ts"

echo "--- Workflow Model Schema (Prisma) ---"
grep -A 20 "model MCPWorkflow" prisma/schema.prisma
```

**Expected Findings**:
- `MCPOrchestrationParamsSchema` with optional `workflowName` for named execution
- `WorkflowStepSchema` for validating step structure (service, tool, params, dependsOn)
- Admin-only endpoint protection via `createHandler` with `allowedRoles`
- Workflow uniqueness constraint on `name` field

**Key Validation Pattern**:
```typescript
// Workflow execution can use either inline steps OR named workflow
const MCPOrchestrationParamsSchema = z.object({
  workflowName: z.string().optional(),  // Named workflow reference
  steps: z.array(WorkflowStepSchema).optional(),  // Inline steps
}).refine(
  data => data.workflowName || data.steps,
  { message: "Either workflowName or steps required" }
);
```

---

## Step 9: Centralized Validation Discovery

Identify validation file organization and coverage:

```bash
echo "=== CENTRALIZED VALIDATION ==="
echo "--- Validation Files ---"
find lib/validation -name "*-validation.ts"
wc -l lib/validation/*.ts

echo "--- Inline Schemas (Should Be Centralized) ---"
grep -r "const.*Schema = z.object" app/api --include="*.ts" | wc -l
echo "inline schemas (consider centralizing)"

echo "--- Schema Coverage by Domain ---"
for file in lib/validation/*.ts; do
  echo "$(basename $file): $(grep -c "export const.*Schema" $file) schemas"
done

echo "--- Validation Imports (Usage) ---"
grep -r "from '@/lib/validation/" app lib --include="*.ts" | wc -l
echo "files importing centralized validation"
```

This discovery provides the foundation for comprehensive validation system expertise.