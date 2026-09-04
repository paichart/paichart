# Types System Discovery Task

**Last Updated**: 2026-07-12 (pairing-diff scan: added the SDK-0.105 LLM/model type block to close the config↔discovery lag). Prior: 2026-06-11 (health-run: header was a year stale vs the dated blocks below)
**Status**: Enhanced v3.1 - OAuth 2.0 Type System Integration + role-permission Option C
**Confidence**: Very High - Enhanced with OAuth types, enterprise authentication, and Plan 9 implementation
**Last Validated**: 2026-06-11 - 2026-05-26 block re-proven exact (null-id Resource :59, rolePermissions const deleted, RolePermissions type :170); 4/5 file targets live (lib/users/types/index.ts never existed — born-stale template residue, fixed :567)

## 🆕 2026-05-26 Session — Run These Greps FIRST (role-permission Option C)

```bash
# Resource.id is now `string | null` (capability checks pass id:null — "can this role create a
# POV?" has no instance). checkPermission coerces to '*' for cache key + audit.
grep -n "id: string | null" lib/types/auth.ts

# The `rolePermissions` CONSTANT was DELETED from lib/types/auth.ts (dead — checkPermission reads
# the DB role_permissions table, not an in-code constant). The `RolePermissions` TYPE remains (used
# by the admin GUI shape). Don't confuse the two.
grep -nE "export const rolePermissions|export type RolePermissions" lib/types/auth.ts
```

Ref: Batch B `ed74e8ce`. Resource interface at `lib/types/auth.ts:56`.

---

## 🆕 2026-07-12 — LLM/model type system (SDK 0.105, paired to specialist config)

Paired in from the `types-system-specialist` config (the 2026-06-19 drift-sweep updated the runtime-limits
+ boundary discoveries but skipped this one — caught by the quarterly pairing-diff scan).

```bash
# Model registry + picker derivation (dropdowns derive from the registry — NO hardcoded model lists):
grep -nE "anthropicModels|geminiModels|toModelOptions" lib/services/llm/types.ts
# Stop-reason union is DERIVED from the runtime array (single source, can't drift):
grep -nE "LLM_STOP_REASONS|type LLMStopReason" lib/services/llm/types.ts
# Effort + raw content blocks:
grep -nE "EffortLevel|effort\??:|rawContentBlocks: unknown\[\]" lib/services/llm/types.ts
# Model-conditional shaping lives OUTSIDE types.ts, in a fail-loud capability map:
grep -nE "capabilitiesFor|ModelCapabilities|clampEffort" lib/services/llm/model-capabilities.ts
```

**What to look for**:
- `anthropicModels` (incl. `opus-4-8`) + `toModelOptions` — the `/api/llm/models` route and UI pickers READ the
  registry; adding a model = one registry edit (no route/list edit). Use aliases, not dated IDs.
- `LLMStopReason` is a `typeof LLM_STOP_REASONS[number]` union — derived from the runtime array, so the type and
  the accepted-values list cannot drift apart. Don't hand-widen the union; extend the array.
- `capabilitiesFor(model)` is **fail-loud** on an unknown model — the type layer defines the shape, the capability
  map defines per-model behavior (temperature acceptance, thinking mode, effort set, output ceiling).
- Full state: `cline_docs/follow-ups/sdk-upgrade-drift-sweep-plan.md`.

---

## Objective
Map and understand the complete type system in pAIchart, including Prisma schema, TypeScript types, enums, interfaces, and the dual-layer architecture that maintains type safety across the codebase.

## Context
pAIchart uses a sophisticated type system with:
- Prisma as the source of truth for database types
- Dual-layer architecture separating API DTOs from service domain models
- Multiple type definition patterns (types.ts, index.ts, inline exports)
- Strict enum usage to prevent magic strings

Understanding this system is critical for maintaining type safety and preventing runtime errors.

## Discovery Scope

### 1. Type File Locations
- [ ] Map all type definition files (types.ts, */types/*, index.ts with exports)
- [ ] Identify the dual-layer architecture boundaries
- [ ] Find service-specific type files
- [ ] Locate component-specific types
- [ ] Document type barrel exports

### 2. Prisma Schema Analysis
- [ ] Document all models and their key fields
- [ ] List all enums with their values
- [ ] Identify field mappings (@map decorators)
- [ ] Note relationships and cascades
- [ ] Find custom type mappings

### 3. Type Architecture Patterns
- [ ] API layer types (/lib/types/*) - DTOs (narrower by design — wire shape)
- [ ] Service layer types (/lib/*/types/*) - Domain models (canonical for domain logic)
- [ ] Component types (/components/*/types/*) - Component-internal state (may carry rich shapes per dual-layer)
- [ ] Shared types and where they're used
- [ ] Type re-exports and barrel files

**Dual-layer architecture rule** (May 2026): for entities like Task/Stage/POV/Phase,
three locations are intentionally different:
1. `lib/types/<entity>.ts` — API DTO (narrower)
2. `lib/<entity>/types/index.ts` — Domain canonical
3. `components/<module>/context/types/EntityTypes.ts:<Entity>` — Editor state (rich)

These should differ. Don't merge them; that's the architecture working.

### 3a. Local Duplicate Interface Boy-Scout Rule (May 2026)

When auditing or touching a file with a local `interface Task {}` / `interface Stage {}` / etc that duplicates the domain type, the touch-cost includes consolidating it. Apply this decision tree:

```bash
# Find all local duplicate interface declarations
grep -rn "^interface \(Task\|Stage\|Phase\|KPI\)\b" components/ lib/ --include="*.ts" --include="*.tsx"
```

Per duplicate:
- **Uses most fields of the domain type** → replace with `import { Task } from '@/lib/tasks/types'` (canonical)
- **Uses narrow subset (5-6 fields)** → use `type Task = Pick<DomainTask, 'id' | 'title' | 'status' | ...>`. The boilerplate is the point — pins field names to one source.
- **Conceptually different entity** (e.g. admin templates' Task is a *spec*, not a task) → rename to `TaskTemplate` / `TaskSpec` for honesty; don't import canonical.

**Don't run this as a dedicated sweep** unless one of these triggers fires:
1. A Task field rename forces ≥5 file touches
2. A new contributor asks "which Task do I import?"
3. A drift bug ships across >1 of the duplicate sites

Otherwise let opportunistic touches handle it. See `types-system-specialist.md` § Boy-Scout Rule for the full pattern.

### 4. Critical Enums and Constants
- [ ] Task-related enums (TaskStatus, TaskType, TaskPriority)
- [ ] Execution enums (ExecutionStatus, AgentCategory)
- [ ] System enums (UserRole, Priority vs TaskPriority)
- [ ] Token limits and constants (DEFAULT_MAX_TOKENS)
- [ ] Enum naming patterns and conventions

### 5. Type Safety Mechanisms
- [ ] Validation functions and type guards
- [ ] Runtime type checking implementations
- [ ] Type transformation points
- [ ] Areas using 'any' or type assertions
- [ ] Potential type safety gaps

### 6. OAuth 2.0 Type System (NEW - Plan 9)
- [ ] OAuth provider interface definitions (OAuthProvider, OAuthConfig)
- [ ] OAuth user data types (OAuthUserInfo, OAuthTokens, AuthResult)
- [ ] Enhanced User model fields (oauthProvider, oauthProviderId, avatarUrl, organizationDomain)
- [ ] OAuth state management types (OAuthState, PKCE interfaces)
- [ ] Dual authentication types (AuthContext, enhanced middleware types)

### 7. Activity System Types (Jan 2026)
- [ ] TaskActivityAction enum (18 types including WORKFLOW_EXECUTED)
- [ ] ActivityDetails interface with workflow fields
- [ ] Activity visual component types (ActivityWorkflowProps)
- [ ] Workflow execution status types (SUCCESS, FAILED, PARTIAL)

## Search Strategies

### 1. Finding Type Files
```bash
# All type-related files
find . -name "types.ts" -o -name "*types*.ts" -o -path "*/types/index.ts" | grep -v node_modules | sort

# Count of type files by directory
find . -name "types.ts" -o -name "*types*.ts" | grep -v node_modules | xargs dirname | sort | uniq -c

# Files with type exports
grep -r "export.*(interface|type|enum|const)" --include="*.ts" --include="*.tsx" | grep -v node_modules | cut -d: -f1 | sort -u | head -30

# OAuth 2.0 type files (Plan 9)
find ./lib/auth/oauth -name "*.ts" | head -10

# Index files with type exports
find . -name "index.ts" -exec grep -l "export.*\(interface\|type\|enum\)" {} \; | grep -v node_modules | sort

# Barrel exports
grep -r "export \* from" --include="*.ts" | grep -v node_modules | grep types
```

### 2. Prisma Schema Analysis
```bash
# All Prisma enums with values
grep -A 50 "^enum" prisma/schema.prisma | grep -E "^(enum|  \w+|^$)" 

# Count enums in Prisma
grep -c "^enum" prisma/schema.prisma

# All Prisma models
grep "^model" prisma/schema.prisma | awk '{print $2}' | sort

# Models with @map decorators
grep -B 1 "@map" prisma/schema.prisma | grep -E "(model|  \w+.*@map)"

# OAuth 2.0 schema analysis (Plan 9)
echo -e "\n=== OAuth 2.0 Type System Analysis ==="
echo "OAuth User model fields:"
grep -A 15 "# OAuth 2.0 fields" prisma/schema.prisma

echo -e "\nOAuth type definitions:"
find ./lib/auth/oauth -name "*.ts" -exec grep -l "interface\|type\|enum" {} \;

echo -e "\nOAuth configuration types:"
grep -A 5 "OAuthProvider\|OAuthConfig" lib/auth/oauth/oauth-config.ts

echo -e "\nOAuth migration applied:"
ls -la prisma/migrations/ | grep oauth | tail -1

# Activity System Types (Jan 2026)
echo -e "\n=== Activity System Type Analysis ==="
echo "TaskActivityAction enum (18 types):"
grep -A 25 "enum TaskActivityAction" prisma/schema.prisma

echo -e "\nActivityDetails interface:"
grep -A 20 "interface ActivityDetails" lib/tasks/types/ --include="*.ts" 2>/dev/null | head -25

echo -e "\nWorkflow fields in activity:"
grep -rn "workflowId\|workflowType\|workflowStatus\|workflowStepCount\|workflowExecutionTime" lib/tasks/ --include="*.ts" | head -10

echo -e "\nActivity visual component types:"
grep -A 15 "ActivityWorkflowProps\|ActivityVisualType" components/tasks/ --include="*.tsx" | head -20

# Relationships and cascades
grep -E "(onDelete:|onUpdate:)" prisma/schema.prisma -B 2
```

### 3. Critical Enums and Constants
```bash
# TaskStatus enum usage
grep -r "TaskStatus" --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20

# ExecutionStatus variations
grep -r "ExecutionStatus\|execution.*status" --include="*.ts" -i | grep -v node_modules | head -20

# Find DEFAULT_MAX_TOKENS
grep -r "DEFAULT_MAX_TOKENS" --include="*.ts" --include="*.tsx" -n | head -10

# Token limits and constants
grep -r "MAX.*TOKEN\|TOKEN.*LIMIT\|maxTokens" --include="*.ts" | grep -v node_modules | head -20

# Priority enums confusion
grep -r "Priority\|TaskPriority" --include="*.ts" | grep -E "(enum|type|interface)" | head -20
```

### 4. Type Safety Analysis
```bash
# Find 'any' usage
grep -r ":\s*any" --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l
grep -r "as any" --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l

# Type assertions
grep -r "as\s+\w+" --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "as const" | head -20

# @ts-ignore and @ts-expect-error
grep -r "@ts-ignore\|@ts-expect-error" --include="*.ts" --include="*.tsx" | grep -v node_modules

# Potential type violations
grep -r "status.*=.*['\"]" --include="*.ts" | grep -E "(OPEN|COMPLETED|PENDING|IN_PROGRESS)" | head -20
```

### 4.1. TypeScript Build System Issues
```bash
# CRITICAL: TypeScript compilation error patterns discovered
echo "=== TypeScript Compilation Issues ==="
echo "Circular dependency detection:"
grep -r "export.*from.*\./" --include="*.ts" --include="*.tsx" | grep -E "(types|interfaces)" | head -10

echo "ES6 module import/export issues:"
grep -r "import.*=.*require\|export.*=" --include="*.ts" --include="*.js" -B 2 -A 2

echo "Dynamic import patterns that work:"
grep -r "await import\|dynamic.*import" --include="*.ts" --include="*.tsx" -B 2 -A 2

echo "Interface compliance validation:"
grep -r "interface.*extends\|implements.*interface" --include="*.ts" --include="*.tsx" | head -10

# Module resolution configuration
echo "=== Module Resolution Configuration ==="
echo "Next.js webpack module resolution:"
grep -r "moduleResolution\|esModuleInterop\|allowSyntheticDefaultImports" next.config.js tsconfig*.json

echo "TypeScript path mapping validation:"
grep -r "paths\|baseUrl" tsconfig*.json

echo "Node modules and external dependencies:"
grep -r "node_modules.*types\|@types" --include="*.ts" --include="*.json" | head -10
```

### 5. Dual-Layer Architecture
```bash
# API layer imports in service layer
grep -r "from.*lib/types" lib/services --include="*.ts" | head -10

# Service layer imports in API routes
grep -r "from.*lib/.*/types" app/api --include="*.ts" | head -10

# Cross-layer violations
grep -r "from.*app/api" lib/ --include="*.ts" | grep -v test

# Type transformation functions
grep -r "toDTO\|toDomain\|toApi\|fromPrisma" --include="*.ts" | head -20
```

### 6. Type Validation
```bash
# Zod schemas
grep -r "z\." --include="*.ts" | grep -E "(object|string|number|enum)" | head -20

# Validation functions
grep -r "validate\|isValid" --include="*.ts" | grep -E "function|const.*=" | head -20

# Type guards
grep -r "is[A-Z]\w+.*:.*is\s+" --include="*.ts" | head -10

# Runtime type checking
grep -r "typeof.*===\|instanceof" --include="*.ts" | head -20
```

### 7. Type Dependencies
```bash
# Circular import check
find . -name "*.ts" -o -name "*.tsx" | grep -v node_modules | xargs grep -l "import.*from.*types" | sort | uniq -c | sort -nr | head -20

# Type re-exports
grep -r "export.*from.*types" --include="*.ts" | grep -v node_modules | head -20

# Interface extensions
grep -r "interface.*extends" --include="*.ts" | grep -v node_modules | head -20

# Union types
grep -r "type.*=.*\|" --include="*.ts" | grep -v node_modules | head -20
```

### 8. Component Types
```bash
# Component prop types
grep -r "interface.*Props" components/ --include="*.ts" --include="*.tsx" | head -20

# Form types
grep -r "FormData\|FormValues" components/ --include="*.ts" --include="*.tsx" | head -20

# Event handler types
grep -r "onChange\|onClick\|onSubmit.*:" components/ --include="*.tsx" | grep -E ":\s*\(" | head -10
```

### 9. Type Naming Patterns
```bash
# DTO patterns
grep -r "DTO\|Dto" --include="*.ts" | grep -E "(interface|type|class)" | head -20

# Request/Response types
grep -r "Request\|Response" --include="*.ts" | grep -E "(interface|type)" | grep -v node_modules | head -20

# Domain model patterns
grep -r "Domain\|Model" lib/*/types --include="*.ts" | grep -E "(interface|type)" | head -20
```

### 10. Common TypeScript Error Patterns (From Implementation)
```bash
# CRITICAL: TypeScript error patterns discovered during implementation
echo "=== TypeScript Compilation Error Patterns ==="

# Check for ExecutionUpdateEvent interface issues
echo "ExecutionUpdateEvent compliance:"
grep -r "ExecutionUpdateEvent" --include="*.ts" -A 5 -B 5 | head -20

# Check for missing export issues
echo "Missing export patterns:"
grep -r "Cannot find name\|Module.*has no exported member" --include="*.ts" -o -name "*.log" 2>/dev/null | head -10

# Check for circular dependency patterns
echo "Circular dependency detection in security modules:"
find lib/security -name "*.ts" -exec grep -l "import.*\.\." {} \; | head -10

# ES6 module interop issues
echo "ES6 module compatibility issues:"
grep -r "require.*cannot be used\|import.*require" --include="*.ts" --include="*.js" | head -10

echo "=== Build System Validation ==="
# TypeScript compilation success check
echo "TypeScript build validation:"
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "(error|Error)" | wc -l

# Next.js build validation
echo "Next.js build readiness:"
npm run build --dry-run 2>&1 | grep -E "(error|Error|Failed)" | head -5 || echo "✅ Build ready"
```

### 11. System Health Validation
```bash
echo "=== Type System Health Check ==="
echo "1. Type files count: $(find . -name "types.ts" -o -name "*types*.ts" | grep -v node_modules | wc -l)"
echo "2. Prisma enums: $(grep -c "^enum" prisma/schema.prisma 2>/dev/null || echo '0')"
echo "3. Prisma models: $(grep -c "^model" prisma/schema.prisma 2>/dev/null || echo '0')"
echo "4. 'any' usage: $(grep -r ":\s*any\|as any" --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l)"
echo "5. Type assertions: $(grep -r "as\s+\w+" --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "as const" | wc -l)"

# Dual-layer compliance
echo -e "\n=== Dual-Layer Architecture ==="
echo "API→Service violations: $(grep -r "from.*lib/.*/types" app/api --include="*.ts" | wc -l)"
echo "Service→API violations: $(grep -r "from.*app/api" lib/services --include="*.ts" | wc -l)"
echo "Cross-layer imports: $(grep -r "from.*lib/types" lib/services --include="*.ts" | wc -l)"

# Critical type health
echo -e "\n=== Critical Types Health ==="
echo "DEFAULT_MAX_TOKENS defined: $(grep -c "export const DEFAULT_MAX_TOKENS" lib/services/llm/types.ts 2>/dev/null && echo '✅ YES' || echo '❌ NO')"
echo "TaskStatus enum: $(grep -c "enum TaskStatus" prisma/schema.prisma 2>/dev/null && echo '✅ Prisma' || echo '❌ Missing')"
echo "ExecutionStatus enum: $(grep -c "enum ExecutionStatus" prisma/schema.prisma 2>/dev/null && echo '✅ Prisma' || echo '❌ Missing')"

# Type safety indicators
echo -e "\n=== Type Safety Indicators ==="
echo "@ts-ignore usage: $(grep -r "@ts-ignore" --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l)"
echo "Zod validations: $(grep -r "z\." --include="*.ts" | grep -v node_modules | wc -l)"
echo "Type guards: $(grep -r "is[A-Z]\w+.*:.*is\s+" --include="*.ts" | grep -v node_modules | wc -l)"

# TypeScript compilation health from implementation experience
echo -e "\n=== TypeScript Compilation Health ==="
echo "CircularDependency errors: $(find lib -name "*.ts" -exec grep -l "export.*from.*\.\." {} \; | wc -l)"
echo "Interface compliance: $(grep -c "interface.*Event.*{" lib/types/ 2>/dev/null || echo '0')"
echo "ES6 module compatibility: $(grep -c "export.*=" --include="*.ts" lib/ 2>/dev/null || echo '0')"
```

## Expected Outputs

### 1. Type System Map
```
pAIchart Type System
├── Database Layer (Prisma)
│   ├── Models (Task, User, POV, etc.)
│   └── Enums (TaskStatus, ExecutionStatus, etc.)
├── API Layer (/lib/types/*)
│   ├── DTOs (simplified for responses)
│   └── Shared types
├── Service Layer (/lib/*/types/*)
│   ├── Domain models (rich objects)
│   └── Service-specific types
└── Component Layer
    ├── UI types
    └── Form types
```

### 2. Critical Type Locations
- List of all type files with their purpose
- Enum definitions and their usage
- Type transformation points
- Cross-layer dependencies

### 3. Type Safety Analysis
- Areas with strong type safety
- Potential weak points
- Recommendations for improvement
- Migration needs

## Key Questions to Answer

1. Are all string literals that could be enums properly typed?
2. Is the dual-layer architecture consistently enforced?
3. Are there any circular type dependencies?
4. Which files use 'any' and could be made type-safe?
5. Are Prisma types properly utilized throughout?
6. Are there duplicate type definitions?
7. Is there consistency in type naming conventions?
8. Are all API responses properly typed?

## Integration Points

- How do Prisma types flow through the system?
- Where are types transformed between layers?
- How are component props typed?
- Where are runtime validations performed?

## Progress Tracking

Track discovery execution with visual progress indicators:

```markdown
📊 Discovery Progress: Types System Discovery
══════════════════════════════════════════════
Overall Progress: [░░░░░░░░░░] 0%

Section Progress:
□ Section 1: Finding Type Files
□ Section 2: Prisma Schema Analysis
□ Section 3: Critical Enums and Constants
□ Section 4: Type Safety Analysis
□ Section 5: Dual-Layer Architecture
□ Section 6: Type Validation
□ Section 7: Type Dependencies
□ Section 8: Component Types
□ Section 9: Type Naming Patterns

Current Status: 🚀 Starting Discovery
Commands: 0/78 executed
Findings: 0 critical ⚠️ | 0 warnings ⚡ | 0 info ℹ️
⏱️ Time: 0 minutes
```

### Progress Update Pattern
Update after each section completion:
```markdown
✅ Section 1: Type Files [██████████] 100%
   Commands: 10/10 | Found: 47 type files, 12 interfaces
🔄 Section 2: Prisma Schema [███░░░░░░░] 30%
   Commands: 3/8 | Analyzing models...
```

## Visual Handover Protocol

When discoveries require specialist expertise, use this handover format:

```markdown
--- DISCOVERY HANDOVER ---
Current Role: discovery-scout ✅
Discovery Progress: [██████████] 100% Complete

## Discovery Summary:
📊 **Components Found:** 47 type files, Prisma schema ✅
⚠️ **Critical Issues:** 3 type safety violations
🔍 **Areas Investigated:** 
   - ✅ Type files mapped
   - ✅ Prisma schema analyzed
   - ⚠️ API/Service layer mismatches
   - ❌ Component types incomplete

## Context for Specialist:
- Key Finding: Dual-layer architecture working but inconsistent
- Risk Area: API types don't match service layer types
- Focus Needed: Align type layers, complete component types

Delegating to: types-specialist
Reason: Deep TypeScript expertise required
Priority: Fix type mismatches, enforce consistency

--- ACTIVATING TYPES-SPECIALIST ---
```

### Specialist Reception Template
```markdown
--- TYPES-SPECIALIST ACTIVATED ---

## Handover Acknowledged ✅
Inherited from: discovery-scout
Discovery Completeness: [██████████] 100%

## Context Received:
📊 **Components:** 47 type files, Prisma ✅
⚠️ **Issues:** 3 type violations acknowledged
🔍 **Focus Areas:** Layer alignment priority

## My Specialist Analysis Starting:
[░░░░░░░░░░] 0% → Analyzing type hierarchy...
[████░░░░░░] 40% → Reviewing layer separation...
[██████████] 100% → Analysis complete ✅

## Specialist Findings:
1. Align API and service layer types
2. Generate types from single source
3. Add runtime validation at boundaries
```

## Risk Assessment Matrix

| Risk | Severity | Likelihood | Impact | Mitigation |
|------|----------|------------|---------|------------|
| Type mismatches between layers | High | High | Runtime errors, data corruption | Strict DTO/Domain separation, validation at boundaries |
| Excessive 'any' usage | High | Medium | Type safety bypass, hidden bugs | Gradual type refinement, lint rules |
| Missing runtime validation | High | High | Invalid data in system | Zod schemas at API boundaries |
| Prisma type drift | High | Medium | DB/Code mismatch | Regular prisma generate, CI checks |
| Circular type dependencies | Medium | Medium | Build issues, maintenance | Dependency analysis, refactoring |
| Inconsistent enum usage | Medium | High | String literal bugs | Enforce Prisma enums everywhere |
| Duplicate type definitions | Medium | High | Maintenance burden | Type consolidation, barrel exports |
| Poor type naming | Low | High | Developer confusion | Naming convention guide |
| Missing type exports | Low | Medium | Import issues | Barrel file organization |
| Incomplete type coverage | Medium | Medium | Untyped code paths | Type coverage metrics |
| Cross-layer violations | High | Medium | Architecture decay | Import restrictions, lint rules |
| Type assertion abuse | Medium | High | Hidden type issues | Code review, assertion audit |
| Missing type guards | Medium | Medium | Runtime type errors | Implement guards for unions |
| Weak form types | Low | High | Loose validation | Strict form schemas |
| Component prop drift | Low | Medium | UI bugs | Prop type generation |

## Output Format

```markdown
# Types System Discovery Report

## Summary
- Type files found: X
- Prisma models/enums: X/X
- Type safety score: X/100
- Architecture violations: X
- Critical risks: X

## Type System Architecture

### Database Layer (Prisma)
#### Models (X total)
- Model Name: key fields, relationships
- [Complete list with details]

#### Enums (X total)
- EnumName: [values] - usage count
- [Complete list with values]

### API Layer Types (/lib/types/*)
- user.ts: UserDTO, CreateUserRequest (X exports)
- [File-by-file breakdown]

### Service Layer Types (/lib/*/types/*)
- ~~/lib/users/types/index.ts~~ — NEVER existed (unfilled template residue); user types live in lib/types/auth.ts (TokenPayload, UserRole) + Prisma User model
- [Service-by-service breakdown]

### Component Types
- Shared components: X files, X types
- Feature components: X files, X types
- Form types: X definitions

## Architecture Compliance

### ✅ Compliant Patterns
- [List of properly separated concerns]

### ❌ Violations Found
- API→Service: X violations in Y files
- Service→API: X violations in Y files
- Cross-layer: X violations

### Type Transformation Points
- Location: transformation function, direction
- [Complete mapping]

## Type Safety Analysis

### Metrics
- Total 'any' usage: X (X explicit, X assertions)
- Type coverage: X%
- Validated endpoints: X/Y
- Type guards: X implemented

### High-Risk Areas
1. File: line - issue description
2. [Prioritized list]

## Enum Analysis

### Standardized Enums
- TaskStatus: Prisma source, X usages, consistent
- [Complete enum audit]

### String Literal Issues
- Found X string literals that should use enums
- [Specific examples with locations]

## Validation Coverage

### ✅ Validated
- Endpoint: validation method
- [Complete list]

### ❌ Unvalidated
- Endpoint: risk level
- [Gaps identified]

## Recommendations

### 🔴 Critical (Do immediately)
1. Fix X 'any' usages in critical paths
2. Add validation to X unprotected endpoints
3. [Prioritized critical fixes]

### 🟡 Important (Do this sprint)
1. Consolidate X duplicate type definitions
2. Fix X cross-layer violations
3. [Sprint-level improvements]

### 🟢 Nice-to-have (Backlog)
1. Improve type naming in X files
2. Add type guards for X union types
3. [Long-term improvements]

## Migration Plan

### Phase 1: Critical Fixes (1 week)
- [ ] Task: Owner, estimated time
- [ ] [Specific actionable tasks]

### Phase 2: Architecture Cleanup (2 weeks)
- [ ] [Architectural improvements]

### Phase 3: Full Compliance (1 month)
- [ ] [Complete type safety]

## Type Health Monitoring

### Metrics to Track
- 'any' usage trend
- Type coverage percentage
- Validation coverage
- Architecture violation count

### Automated Checks
- [ ] Add type coverage to CI
- [ ] Lint rules for architecture
- [ ] Prisma drift detection
```

## Debugging Helpers

```bash
# Quick type system health check
echo "=== Type System Quick Check ==="
echo "Type files: $(find . -name "types.ts" -o -name "*types*.ts" | grep -v node_modules | wc -l)"
echo "'any' count: $(grep -r ":\s*any\|as any" --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l)"
echo "Validations: $(grep -r "z\." --include="*.ts" | grep -v node_modules | wc -l)"
echo "Cross-layer: $(grep -r "from.*lib/.*/types" app/api --include="*.ts" | wc -l)"

# Find biggest type safety offenders
echo -e "\n=== Top 'any' Offenders ==="
grep -r ":\s*any\|as any" --include="*.ts" --include="*.tsx" | grep -v node_modules | cut -d: -f1 | sort | uniq -c | sort -nr | head -10

# Check specific enum usage
echo -e "\n=== Enum Usage Check ==="
ENUM_NAME="TaskStatus"
echo "Prisma definition: $(grep -A 10 "enum $ENUM_NAME" prisma/schema.prisma | head -15)"
echo "Usage count: $(grep -r "$ENUM_NAME" --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l)"
echo "String literal alternatives: $(grep -r "status.*['\"]OPEN\|COMPLETED\|IN_PROGRESS['\"]" --include="*.ts" | wc -l)"

# Architecture violation check
echo -e "\n=== Architecture Violations ==="
echo "Service importing API types:"
grep -r "from.*app/api" lib/services --include="*.ts" | head -5 || echo "None found ✅"
echo -e "\nAPI importing service internals:"
grep -r "from.*lib/.*/services" app/api --include="*.ts" | head -5 || echo "None found ✅"

# Type transformation audit
echo -e "\n=== Type Transformations ==="
grep -r "toDTO\|toDomain\|toApi\|fromPrisma\|toResponse" --include="*.ts" | grep -E "function|const.*=.*=>" | head -10

# Find untyped API routes
echo -e "\n=== Potentially Untyped Routes ==="
find app/api -name "route.ts" -exec grep -L "Request\|Response\|Body\|Params" {} \; | head -10

# Component prop type check
echo -e "\n=== Component Type Coverage ==="
TOTAL_COMPONENTS=$(find components -name "*.tsx" | wc -l)
TYPED_COMPONENTS=$(grep -r "interface.*Props" components --include="*.tsx" | cut -d: -f1 | sort -u | wc -l)
echo "Components with typed props: $TYPED_COMPONENTS/$TOTAL_COMPONENTS"
```

## Deliverables

1. **Type System Architecture Diagram** - Visual representation of all type layers and flows
2. **Type Safety Scorecard** - Metrics dashboard with trends and targets
3. **Enum Standardization Guide** - How to use Prisma enums consistently
4. **Layer Separation Enforcement Plan** - Lint rules and import restrictions
5. **Runtime Validation Implementation Guide** - Zod schema patterns and examples
6. **Type Migration Roadmap** - Phased approach with timelines and owners
7. **Type Health Dashboard Spec** - Monitoring implementation plan
8. **API Type Coverage Report** - Endpoint-by-endpoint validation audit
9. **Component Type Patterns** - Best practices for React components
10. **Type Debt Reduction Plan** - Strategy to eliminate 'any' usage

## Success Criteria

- ✅ All type files mapped with clear purpose and dependencies
- ✅ Type safety score calculated (target: >90%)
- ✅ All Prisma enums documented with values and usage
- ✅ Cross-layer violations identified and migration planned
- ✅ Runtime validation gaps documented with fix priority
- ✅ Clear 4-week migration path with assigned owners
- ✅ Automated type health monitoring specified
- ✅ Zero critical type safety issues in core paths
- ✅ 100% API endpoint type coverage achieved
- ✅ Component prop type patterns established