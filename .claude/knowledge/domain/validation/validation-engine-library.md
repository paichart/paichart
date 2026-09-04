# validation-engine-specialist — Domain Library

> **Created 2026-06-11** by the Protocol 12 eviction rollout (wave 1): knowledge depth moved OUT of
> `.claude/agents/validation-engine-specialist.md` per the eviction rule
> (`.claude/knowledge/protocols/specialist-eviction-protocol.md`). The specialist is the router;
> this file is the store — greppable on demand, NOT auto-loaded. Content is verbatim at eviction
> time; dates/commits are provenance. Evicted session blocks are at the end under
> "Evicted session blocks (R3 dispositions in the rollout triage table)".

---

## Recent Major Achievements (2026-02-27)
✅ **BC27 Prototype Pollution Eradication**: Stripped `__proto__`/`constructor`/`prototype` keys from all 38 `.passthrough()` and `z.record(z.any())` sites across 12 validation files. Created `lib/utils/sanitize-keys.ts` with `stripDangerousKeys()` utility and `safePassthrough()`/`safeRecord()` Zod helpers in `lib/validation/zod-helpers.ts`. Defense-in-depth added to `ensureObject()`. Zero unprotected passthrough/record sites remain.

### Code-Review Cleanup (2026-05-14)
✅ **Helper-first canonicalization**: Migrated 37 untyped-passthrough + untyped-record sites in 7 validation files from inline `.transform(stripDangerousKeys)` chains to `safePassthrough()` / `safeRecord()` helper calls (commit `997cb91d`). Typed-object passthrough+strip remains inline — no helper covers `z.object({ a, b, ... }).passthrough()` and adding one would balloon the API surface.
✅ **FIELD_LIMITS adoption**: `input-validation-framework.ts` (commit `cc079f33`) and `mcp-action-validation.ts` helpers (commit `5171592b`) now import `FIELD_LIMITS` instead of hardcoding `.max()` literals.
✅ **InjectionSafeOptional helper**: Local `pov.ts` helper (commit `ee797fd2`) collapses the 8-line `string().max().refine(injection).nullable().optional().transform()` chain to one line at 4 Shape-B sites.

**Pattern after 2026-05-14**: New schemas should reach for `safePassthrough()` / `safeRecord()` first. Inline `.transform(stripDangerousKeys)` is still correct for typed-object passthrough (e.g. `povBaseSchema`) — don't try to force-fit the helper there.

### Earlier Achievements (2025-12-22)
✅ **MCP Validation Parity**: Aligned MCP layer validation with main UI validation - replaced character whitelists with semantic pattern detection
✅ **Validation Parity Checker**: Created `scripts/check-validation-parity.ts` tool to detect MCP vs main validation mismatches
✅ **Unicode/Markdown Support**: MCP now accepts unicode (José, 客户, Москва), emojis (✅⚠🚀), and markdown in descriptions/titles
✅ **Enterprise Security Validation**: Implemented comprehensive input validation framework eliminating critical vulnerabilities
✅ **MCP Ecosystem Security**: Secured 24 MCP tools with unified Zod validation framework across all domains
✅ **Attack Vector Prevention**: Created multi-layer injection prevention (SQL, script, path traversal, DoS attacks)
✅ **Unified Validation Approach**: Standardized validation patterns across MCP task actions and hub tools

### Sprint 3: Validation Schema vs Handler Alignment (Dec 2025) ⭐ NEW
✅ **40 Missing Parameters Fixed**: Audited all 12 MCP action handlers vs validation schemas, found 40 missing params
✅ **Centralized Alias Mapping**: Created `PARAMETER_ALIAS_MAPPINGS` constant and `normalizeAliases()` function
✅ **Enhanced Error Messages**: Added 3 new semantic enum mappings + 17 new example values for better DX
✅ **Discovery #9 Added**: Validation Schema vs Handler Mismatch Audit in quarterly-review-protocol

**Key Pattern**: `optional() + .refine() + .transform(normalizeAliases)` for flexible validation with alias support
**Key Files**:
- `lib/validation/mcp-action-validation.ts` - Centralized alias mappings (lines 99-145)
- `/.claude/knowledge/protocols/quarterly-review-protocol.md` - Discovery #9

### 2026-05-16 MCP Hub Hardening — Patterns Acquired

Two-day session shipped Phase 1 (GS14) + Phase 2 N4 (BC27 extension) + Phase 3 C1 (phantom-canonical eradication). Six patterns to anchor for future audits:

**1. GS14 — Schema Enforcement at the Dispatch Boundary** (Phase 1):
Five MCP dispatchers (`project`, `analytics`, `template`, `services`, `registry`) previously had no dispatch-boundary `safeParse`. Same root cause as pov.update bypass. The fix (post-Phase-1.5): `wrapWithSchema()` from `lib/mcp/server/tools/dispatchers/dispatch-with-schema.js` wraps every consolidated tool at its REGISTRATION site (`embedded-server.ts` 6 calls, `mcp-server-v5.js` 7 incl. prompt_command) and runs `CONSOLIDATED_SCHEMAS[tool].inputSchema.safeParse()` before action routing. **Universal lookup**: `grep -c "wrapWithSchema('" lib/mcp/embedded-server.ts mcp-server-v5.js` (expect 6 and 7). Dispatcher files themselves carry no validate calls (Phase 1.5 lift); workflow-tools-handler.js uses its own `WorkflowHandlerInputSchema` (it never used validateDispatchArgs — corrected 2026-06-11).

**2. Phantom canonical — multiple-site form** (Phase 3 C1, 2026-05-16):
`lib/validation/mcp-hub-validation.ts` declared 10 schemas of which only 2 were wired. The other 8 were canonical-looking but never reached by the dispatcher. **This is the dispatcher-boundary form of [[feedback_phantom_canonical_audit]]** — distinct from the pov.update inline-vs-canonical case at line 191 above. Detection: grep for the validator import + count actual call sites; if N schemas declared but <N callers, the gap is phantom canonical. Phase 3 C1 deleted the file; constraints migrated to L1 `tool-schemas.js`. See `cline_docs/reviews/phase-3-verdict-matrix-2026-05-16/`.

**3. Action-discriminator handler schema** (Phase 2 chunks):
When an L1 cross-action schema is permissive (because actions diverge — e.g. `registry` has 5 actions with different shapes), the L1 schema can't enforce action-specific tightening. Solution: L3 handler-boundary schema per consolidated tool (e.g. `WorkflowHandlerInputSchema`, `ServiceUpdateHandlerInputSchema`). The L3 schema uses `z.discriminatedUnion('action', [...])` to tighten by action. **Sites today**: `service-update-handler.js:79+`, `service-registration-handler.js` (uses L1 directly with action-discriminator transform at `tool-schemas.js:819-821`), `workflow-tools-handler.js`. Pattern reference: `Z:\paichart\tutorials\mcp-tool-layered-architecture-spec.md` Layer 3.

**4. BC76 — handler reads raw args after validatedArgs** (Phase 2 N3):
After `const validatedArgs = validation.validatedData`, any later `args.field` read bypasses Zod's transforms/strips/defaults. Phase 2 N3 found `service-registration-handler.js:285,346` reading `args.authType` raw (schema didn't declare it, Zod stripped it, handler revived from raw). **Sweep grep**: in any handler that uses `validatedArgs`, grep for `args\.` reads AFTER the assignment. Include response builders (R-5 sub-finding). BC76 N3 fan-out test: smoke #61/#62 assert `registry.list/update` don't get `authType` defaulted from a register-only `.default()`.

**5. Triple-pass idempotency** (Phase 1 smoke #14):
When schemas validate at multiple layers (L1 dispatch + L3 handler), every `.transform()` must be idempotent on its own output. `normalizeAliases`, `stripDangerousKeys`, `null→undefined`, `deepStripDangerousKeys` are all idempotent by construction. Custom transforms (string-to-Date, regex coercion) may not be. **Test**: schema.safeParse(schema.safeParse(input).data).data === schema.safeParse(input).data.

**6. Depth-N strip vs shallow** (Phase 2 N4, Phase 3 R3/Q4):
`stripDangerousKeys` (shallow) is fine for top-level user objects that stay in-process. **For cross-trust forwarded fields** (`services.call.arguments`, `services.steps[].arguments` — args forwarded to external services) and **DB-persisted JSON columns** (`capabilities`, `configuration`), use `deepStripDangerousKeys` — shallow strip leaves depth-1+ pollution intact. Discovery prompt §2.6 (extended 2026-05-16) has the audit recipe.

**7. Schema-completeness parity audit** (Phase 2 chunks 2 + 4):
For each consolidated tool, count: (a) action enum members at L1, (b) handler schema actions at L3, (c) router dispatch cases. Must be N/N/N. Phase 2 chunk 4 caught service-registration was 11/11 (correct); workflow handler was 7/7 (correct after fix). Drift = one schema has an action the others don't = silent no-op (R-8 from synthesis: `registry.delete` + `registry.tools` had NO schema at all). **Grep recipe**: `grep -E "action: 'X'" lib/mcp/server/config/tool-schemas.js | wc -l` vs handler files vs router files; counts must match.

### Write-time sanitize utilities (consume + recommend)

| Helper | Location | When you'd recommend it |
|---|---|---|
| `sanitizeForResponse(str)` | `lib/mcp/server/tools/response-sanitizer.js` (JS) | Reviewing handlers that echo user input — single-string sanitize at the output OR write call. |
| `sanitizeMetadataForAudit(obj)` (NEW 2026-05-23) | same file | Reviewing `Activity.create` / `mCPWorkflowExecution.create` / any JSONB write that takes user-controlled metadata. Recursive walker — strings escaped, primitives passed through, prototype-pollution keys stripped. |
| `escapeHtml(text)` | `lib/utils/sanitize.ts` (TS) | Reviewing TS routes (e.g. recommendations route) where task/POV title interpolations land in DB rows. Confirm `safeTitle = escapeHtml(x)` BEFORE the template literal — not after. |

**Schema-side companion**: write-time sanitize is the runtime defense. The schema-side defense is bounds + patterns + discriminated-union default-reject (covered in next section). Both axes needed (BC71 two-axes pattern).

### Schema bounds — always assert (2026-05-23 lesson, R3-B5)

Every Zod schema for user-supplied data should explicitly assert bounds on EVERY field. Missing bounds are the most common pathological-case finding:

| Field type | Required assertion | Canonical example (commit 5fefd455) |
|---|---|---|
| `z.array(...)` | `.max(N)` — DoS cap | `tools: z.array(...).max(200)` on registry.register capabilities (200-tool DoS attack registered live before the cap was added) |
| `z.string()` | `.max(N)` + `.regex(...)` where shape matters | `services.call.tool` had NO regex → `<script>` payload landed in audit metadata (R3-3) |
| `z.number()` | `.min(N).max(N)` explicit bounds | Found via R3-2 negative-retries probe |
| `z.record(z.any())` | chain `.transform(stripDangerousKeys)` (BC27) | covered below |
| `z.object({...}).passthrough()` | wrap with `safePassthrough()` or chain `deepStripDangerousKeys` | covered below |

### Pathological-Case Schema Audit Methodology (2026-05-23)

**When auditing a Zod schema, pre-enumerate 3-5 pathological-case inputs BEFORE running validation tests.**

Boundaries every schema should explicitly assert:
- **Array fields**: `.max(N)` cap on every `z.array(...)` (DoS via unbounded lists). Round 3 found `capabilities.tools[]` had no cap → 200-tool registration accepted.
- **String fields**: `.max(N)` cap + pattern/regex where shape matters (no pattern on `services.call.tool` → `<script>` payload persisted in audit metadata).
- **Number fields**: `.min(0).max(N)` explicit bounds (schema enforced `min:0` on `retries`; negative values rejected).
- **Object fields**: prototype-pollution defense (`__proto__`, `constructor.prototype` keys) via `deepStripDangerousKeys` — BC27 chain on EVERY `.passthrough()` or `z.record(z.any())`.
- **Discriminated unions**: every variant covered; default reject for unknown discriminator.

**Two-axes audit (BC71)**: when one field gets a write-time sanitize fix, sweep sibling fields in the same write path. The 2026-05-23 task.title write-time escape (recommendations route) was the *sibling* of an earlier pov.title fix — same schema, missed at first pass.

**Reference**: [[feedback_pathological_case_framing]] memory + `iterative-test-hardening-protocol.md` Phase 3.

### BC27 Prototype Pollution Defense (Feb 2026)
**Key Files**:
- `lib/utils/sanitize-keys.ts` - `stripDangerousKeys()` and `deepStripDangerousKeys()` utilities
- `lib/validation/zod-helpers.ts` - `safePassthrough()`, `safeRecord()`, `deepSafePassthrough()` helpers
- `lib/utils/ensure-object.ts` - Defense-in-depth (strips keys on all parsed objects)

**Pattern**: Every `.passthrough()` and `z.record(z.any())` must chain `.transform(stripDangerousKeys)` to prevent `__proto__` pollution. Use `safePassthrough()` or `safeRecord()` from zod-helpers for new schemas.


---

## Pino Structured Logging for Validation Events (NEW - Feb 2026)

**Two logging systems coexist** — understand both for validation debugging:

| System | Output | Use Case |
|--------|--------|----------|
| **pino** (domain loggers via `lib/logger.ts`) | PM2 JSON output (stdout) | Server-side structured logging for all domains |
| **OAuth audit logger** (`lib/auth/oauth/oauth-logger.ts`) | `/var/log/paichart/oauth-audit.log` | OAuth-specific audit trail with correlation IDs |

### Validation-Relevant Domain Loggers

```typescript
import { apiLogger, complianceLogger } from '@/lib/logger';

// Validation failure logging (attack detection)
apiLogger.warn({
  type: 'validation_failure',
  schema: 'UpdateAgentTemplateSchema',
  userId: user.userId,
  endpoint: '/api/agent-templates/123',
  errors: validationResult.error.errors.map(e => ({ path: e.path, message: e.message }))
}, 'Validation attack blocked');

// Injection attempt detection
apiLogger.error({
  err: new Error('Prompt injection detected'),
  userId: user.userId,
  patterns: ['INSTRUCTION_OVERRIDE', 'ROLE_SWITCHING'],
  endpoint: '/api/agent-templates/123'
}, 'Security violation: prompt injection blocked');

// Compliance validation events
complianceLogger.info({ action: 'SCHEMA_AUDIT', schemasChecked: 24, passed: 23 }, 'Validation audit complete');
```

### Correct Pino API (CRITICAL)
```typescript
// ✅ CORRECT: Object first, message string second
apiLogger.warn({ schema: 'TaskSchema', errors: [...] }, 'Validation failed');
apiLogger.error({ err: error, userId }, 'Injection blocked');

// ❌ WRONG: These patterns are incorrect
apiLogger.warn('Validation failed', { schema });  // Wrong order
apiLogger.error({ error: err }, 'Blocked');        // Use 'err' not 'error'
```

### Production Validation Event Monitoring
```bash
# Find validation-related warnings in production
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"api\"' | grep -i 'validation\|inject' | jq"

# Find all security-level errors (level 50)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"level\":50' | grep -i 'inject\|attack\|violation' | jq"
```

**Pattern Reference**: `/.claude/knowledge/patterns/pino-structured-logging-pattern.md` (Pattern #43, 96% confidence)
**8 Domain Loggers**: authLogger, mcpLogger, povLogger, taskLogger, apiLogger, dbLogger, complianceLogger, monitorLogger

---

## Core Knowledge and Expertise

### Zod Schema System (776+ usages across 50+ files)
- **Responsibility**: Maintain type-safe validation schemas with comprehensive error handling
- **Key Files**: 
  - `/lib/validation/base.ts` - Base validation classes and ValidationError handling
  - `/lib/validation/pov.ts` - POV, phase, and business entity schemas
  - `/components/pov/creation/validation.ts` - Multi-step form validation with cross-field dependencies
- **Patterns**: BaseValidator abstract class, async parseAsync, structured error formatting
- **Integration Points**: React Hook Form, API routes, service layer validation, database models

### AJV Template Validation (Dual validation approach)
- **Responsibility**: Complex template validation with dependency checking and business rules
- **Key Files**:
  - `/lib/pov/templates/validator.ts` - POV template validation with custom validators
  - `/lib/pov/phase-templates/validator.ts` - Phase template schema validation with circular dependency detection
  - `/lib/utils/template-schema-validator.ts` - Template schema normalization and metadata management
- **Patterns**: Singleton validators, custom validation functions, dependency graph validation
- **Integration Points**: Template builder UI, import/export systems, template execution engine

### API & Service Layer Validation
- **Responsibility**: Request/response validation with consistent error handling and enterprise security
- **Key Files**:
  - `/lib/validation/input-validation-framework.ts` - **NEW**: Comprehensive input validation with injection prevention
  - `/lib/validation/mcp-action-validation.ts` - **NEW**: MCP task action API security validation (24 tools secured)
  - `/lib/validation/mcp-hub-validation.ts` - **NEW**: MCP hub tools unified validation framework
  - `/lib/middleware/validation-middleware.ts` - **NEW**: Reusable validation middleware for API endpoints
  - `/lib/pov/services/validation.ts` - Business logic validation for POV lifecycle
  - `/lib/pov/services/phaseValidation.ts` - Complex timeline and dependency validation using raw SQL
  - `/middleware/error-handler.ts` - Central validation error formatting and HTTP status mapping
- **Patterns**: Service validation methods, status transition validation, business rule enforcement, **multi-layer injection prevention**
- **Integration Points**: Next.js API routes, database transactions, real-time updates, **MCP ecosystem security**

### Unified Error Response Format (2025-10-29 Consistency Enhancement)
- **Responsibility**: Standardized validation error responses across all API endpoints
- **Key Files**: `/lib/types/api-response.ts` (90 lines)
- **Implementation**:
  ```typescript
  export interface APIErrorResponse {
    success: false;
    error: {
      code: string;        // Machine-readable: VALIDATION_ERROR, UNAUTHORIZED, etc.
      message: string;     // Human-readable error message
      fields?: Array<{     // Field-specific validation errors
        field: string;
        message: string;
      }>;
      details?: string;    // Development only (hidden in production)
    };
  }

  // Helper function
  export function createErrorResponse(code, message, fields?, details?) {
    return {
      success: false,
      error: {
        code,
        message,
        ...(fields && { fields }),
        // ✅ Only include details in development
        ...(process.env.NODE_ENV === 'development' && details && { details })
      }
    };
  }
  ```
- **Error Codes Enum** (10 standard codes):
  - Authentication: `UNAUTHORIZED`, `FORBIDDEN`
  - Validation: `VALIDATION_ERROR`, `INVALID_INPUT`
  - Resource: `NOT_FOUND`, `ALREADY_EXISTS`
  - Server: `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`
  - Business: `BUSINESS_RULE_VIOLATION`, `OPERATION_FAILED`
- **Validation Error Format**:
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Invalid request data",
      "fields": [
        { "field": "title", "message": "Title too long" },
        { "field": "status", "message": "Invalid status value" }
      ]
    }
  }
  ```
- **Benefits**:
  - ✅ Consistent parsing: Frontend can handle all errors uniformly
  - ✅ Field-level errors: UI can highlight specific form fields
  - ✅ Machine-readable codes: Error categorization and monitoring
  - ✅ Info leakage prevention: Stack traces hidden in production
- **Applied To**: All 5 P0 endpoints (MCP servers, POV update/create, phase templates, registration)
- **Before**: 4 different error formats (inconsistent client parsing)
- **After**: Single unified format (100% consistency)
- **Integration Points**: All Zod validation failures, API catch blocks, auth/authz errors
- **Confidence**: 88/100 (validation-engine reviewed)

### Form Validation Integration (15+ React Hook Form components)
- **Responsibility**: Seamless form validation with zodResolver integration
- **Key Files**:
  - Components using `zodResolver` with real-time validation
  - Step-wise validation in multi-step forms
  - Custom validation rules for business-specific scenarios
- **Patterns**: Schema-driven forms, conditional validation, cross-field validation
- **Integration Points**: UI components, form state management, API submission validation

### Database Constraint Validation (217+ constraints)
- **Responsibility**: Database-level data integrity through Prisma schema constraints
- **Key Files**: `/prisma/schema.prisma` - Unique constraints, indexes, foreign key relationships
- **Patterns**: Compound unique constraints, cascading deletes, indexed lookups
- **Integration Points**: ORM queries, migration scripts, data consistency checks

### MCP Security Validation System (Plans 7 & 8)
- **Responsibility**: Enterprise-grade security validation for 24 MCP tools across all platform domains
- **Key Files**:
  - `/lib/validation/input-validation-framework.ts` - Comprehensive security patterns and injection prevention (Plan 7)
  - `/lib/validation/mcp-action-validation.ts` - Task action API validation with ALLOWED_MCP_ACTIONS whitelist (Plan 7)
  - `/lib/validation/mcp-hub-validation.ts` - Hub tools validation (6 service management tools)
  - `/app/api/mcp/tasks/action/route.ts` - Integrated validation implementation
  - `/lib/mcp/server/tools/hub-tools-handler.js` - Enhanced with unified validation
- **Patterns**: 
  - Action whitelisting with ALLOWED_MCP_ACTIONS array (Plan 7)
  - Parameter schema validation preventing injection attacks
  - Multi-layer injection detection (SQL, XSS, path traversal)
  - Request size limits (50KB general, 10KB sensitive)
  - Unified error handling with security event logging
- **Integration Points**: MCP task actions, hub service management, agent operations, authentication systems
- **Critical Achievement**: Eliminated complete vulnerability in most-used platform APIs

### Enterprise Trial & Compliance Validation (NEW)
- **Responsibility**: Validation for enterprise trial registration and Anthropic compliance safeguards
- **Key Files**:
  - `/lib/mcp/server/config/service-call-policy.js` - 46 approved tools whitelist, 12 blocked patterns
  - `/lib/mcp/server/config/service-approval-policy.js` - Risk-based service registration evaluation
  - `/lib/mcp/server/config/tool-schemas.js` - 26 tool schemas with Gold Standard descriptions
- **Patterns**:
  - Service call validation with approved tool whitelist
  - Registration risk evaluation (15 high-risk categories, dangerous patterns)
  - Content filtering and sensitive data detection
  - Multi-tier validation (SAFE, MEDIUM, HIGH, CRITICAL risk levels)
- **Integration Points**: Enterprise trial flows, service registration approval, cross-service call validation
- **Compliance**: Ensures 95/100 Anthropic AUP compliance through comprehensive input validation

### Named Workflow Validation (Jan 2026)
- **Responsibility**: Workflow CRUD and execution validation for admin-only REST API
- **Key Files**:
  - `/lib/validation/mcp-hub-validation.ts` - MCPOrchestrationParamsSchema with workflowName support
  - `/app/api/workflows/route.ts` - Workflow list/create with Zod validation
  - `/app/api/workflows/run/route.ts` - Execute workflow by name with parameter validation
- **Patterns**:
  - `workflowName` parameter for named workflow execution (alternative to inline steps)
  - Admin-only validation via `createHandler` with `allowedRoles`
  - Workflow step schema validation (service, tool, params, dependsOn)
- **Discovery**: `grep -r "MCPOrchestrationParams\|MCPWorkflow" lib/validation/ app/api --include="*.ts"`

### OAuth 2.0 Validation Patterns (NEW - Plan 9)
- **Responsibility**: OAuth state validation, provider data validation, token format validation
- **Key Files**:
  - `/lib/auth/oauth/oauth-config.ts` - OAuth state parameter validation with CSRF protection
  - `/lib/auth/oauth/oauth-service.ts` - Provider user data validation and normalization
  - `/lib/auth/enhanced-auth-middleware.ts` - Dual token format validation (oauth2_ vs JWT)
- **Patterns**:
  - OAuth state validation with 15-minute expiration and cryptographic nonces
  - Provider data normalization across Microsoft/Google/GitHub user info formats
  - Token format detection and validation (oauth2_ prefix vs standard JWT)
  - Enterprise role mapping validation (Azure AD/Google roles → pAIchart roles)
- **Integration Points**: OAuth authorization flows, user provisioning, enterprise authentication

### Agent Template Validation System
- **Responsibility**: Comprehensive validation for agent templates with security and performance analysis
- **Key Files**:
  - `/lib/services/agentTemplateBuilder/templateValidationService.ts` - Multi-category validation system
- **Patterns**: Category-based validation scoring, performance impact analysis, security compliance checking
- **Integration Points**: Agent template builder, workflow engine, MCP tool validation

## Key Information

### Critical Validation Patterns (Production-Tested) ⭐ NEW 2025-11-02

**Source**: Week 6 POV validation debugging (commits 18b0193, 2dfd58f)
**Evidence**: Proven in production, prevented 15 validation errors
**Confidence**: 98% (production-validated)

#### Pattern 1: .optional() vs .nullable() vs .nullish() ⭐ CRITICAL

**Discovery**: POV save failed with "Invalid input" even after adding `.optional()`
**Root Cause**: Frontend sends `null` for empty fields, not `undefined`

**Zod Modifiers Explained**:
```typescript
// ❌ WRONG - Only accepts undefined (field missing)
dueDate: z.string().optional()

// ❌ WRONG - Only accepts null (field present but null)
dueDate: z.string().nullable()

// ✅ CORRECT - Accepts both undefined AND null
dueDate: z.string().nullable().optional()

// ✅ ALTERNATIVE - Shorthand for both
dueDate: z.string().nullish()
```

**When to Use Each**:
- `.optional()` alone → API query params (can be missing)
- `.nullable()` alone → Database fields (can be NULL)
- `.nullable().optional()` → **Frontend form fields (can be null OR missing)** ← Most common!
- `.nullish()` → Shorthand when both behaviors needed

**The Gotcha**: Frontend form libraries often send `null` for empty inputs, NOT `undefined`!

**Pattern**: When validating frontend data, ALWAYS use `.nullable().optional()` or `.nullish()`

**Evidence**: Fixed 14 dueDate validation errors in production (Week 6, commit 2dfd58f)

---

#### Pattern 2: .passthrough() vs .strict() ⭐ CRITICAL

**Discovery**: POV save rejected with "Unrecognized key(s)" for 12 UI state fields
**Root Cause**: `.strict()` mode rejects valid UI state fields

**Comparison**:
```typescript
// ❌ WRONG - Rejects UI state fields (projectManager, salesEngineers, etc.)
const Schema = z.object({
  title: z.string(),
  // ... known fields
}).strict()  // This is the DEFAULT if you don't specify!

// ✅ CORRECT - Allows UI state fields, handler strips before Prisma
const Schema = z.object({
  title: z.string(),
  // ... known fields
}).passthrough()  // Allow extra fields from UI

// Handler usage:
const validated = Schema.parse(requestData);
const { title, description, ...uiState } = validated;
// Use only known fields for database, ignore uiState
```

**When to Use Each**:
- `.strict()` → Security-critical schemas (authentication, permissions)
- `.passthrough()` → **UI integration schemas (form data with state fields)** ← Recommended for UI!
- `.strip()` → Explicit removal of unknown fields

**Pattern from MCP Validation (Plan 7)**:
```typescript
// MCP action validation uses .passthrough()
const ActionSchema = z.object({
  action: z.string(),
  // ... known fields
}).passthrough(); // Allow MCP metadata fields

// Handler strips before processing
const { action, taskId, ...metadata } = validated;
```

**The Gotcha**: `.strict()` is the DEFAULT! Must explicitly use `.passthrough()` for UI schemas

**Evidence**: Fixed 12 "Unrecognized key" errors in production (Week 6, commit 18b0193)

---

#### Pattern 3: Union + Transform for Type Coercion ⭐ IMPORTANT

**Discovery**: Revenue validation failed with "Expected number, received string"
**Root Cause**: Frontend sends "2000000" (string from `<input type="number">`), backend expects number

**Pattern**:
```typescript
// ❌ WRONG - Too strict, rejects string numbers
revenue: z.number().min(0).max(100000000).optional()

// ✅ CORRECT - Accept string or number, coerce to number
revenue: z.union([z.string(), z.number()])
  .transform(val => typeof val === 'string' ? parseFloat(val) : val)
  .pipe(z.number().min(0).max(100000000))
  .optional()
```

**When to Use**:
- Frontend sends numbers as strings (HTML form inputs ALWAYS send strings!)
- Backward compatibility with older API clients
- Multi-source data (CSV imports, external APIs)

**Trade-off**:
- ✅ Pro: More forgiving, easier frontend integration
- ✅ Pro: Backward compatible
- ❌ Con: Small performance cost (~0.15ms per field)
- ❌ Con: Hides type mismatches (harder debugging)

**Best Practice**: Fix frontend to send correct types when possible, use coercion only when necessary

**Common Pattern** (financial fields):
```typescript
// Apply to all money fields for consistency
estimatedBudget: z.union([z.string(), z.number()])
  .transform(val => typeof val === 'string' ? parseFloat(val) : val)
  .pipe(z.number().min(0))
  .optional(),

revenue: z.union([z.string(), z.number()])
  .transform(val => typeof val === 'string' ? parseFloat(val) : val)
  .pipe(z.number().min(0))
  .optional(),
```

**Evidence**: Fixed revenue validation error in production (Week 6, commit 2dfd58f)

---

#### Pattern 4: Union for Multiple Input Types ⭐ IMPORTANT

**Discovery**: inputContext validation failed with "Expected string, received object"
**Root Cause**: Agent config sends objects, UI sends strings (multi-source data)

**Pattern**:
```typescript
// ❌ WRONG - Too strict for multi-source data
inputContext: z.string().max(10000).nullable().optional()

// ✅ CORRECT - Accept string or object
inputContext: z.union([z.string().max(10000), z.record(z.any())])
  .nullable()
  .optional()
```

**When to Use**:
- Field accepts multiple valid formats
- Different sources send different types (UI vs agent vs external API)
- Legacy compatibility requirements

**Common Union Patterns**:
```typescript
// Date handling (multiple formats accepted)
dueDate: z.union([z.string(), z.date()]).nullable().optional()

// Number handling (string or number)
amount: z.union([z.string(), z.number()]).transform(parseFloat)

// Complex types (string JSON or parsed object)
config: z.union([z.string(), z.record(z.any())])

// Multiple enum formats (string or native enum)
status: z.union([z.string(), z.nativeEnum(Status)])
```

**Evidence**: Fixed inputContext validation error in production (Week 6, commit 18b0193)

---

#### Pattern 5: Commit Verification Protocol ⭐ CRITICAL GOTCHA

**Discovery**: Commit claimed to fix 5 issues but only fixed 4 → Production bug!
**Root Cause**: Edit tool changes not verified before committing

**The Gotcha**:
```bash
# ❌ WRONG workflow (caused production bug):
1. Use Edit tool to change file
2. Write detailed commit message
3. Commit + push
4. Deploy
5. User reports same error → Bug still exists!

# ✅ CORRECT workflow:
1. Use Edit tool to change file
2. **Re-read file to verify changes applied** ← CRITICAL!
3. **Check git diff matches intentions**
4. Write commit message based on ACTUAL diff (not intentions)
5. Commit + push
6. **Test immediately after deployment**
```

**Verification Commands**:
```bash
# After Edit tool, BEFORE commit:
cat -n file.ts | grep -A 5 "field_changed:"  # Verify change visible
git diff file.ts | grep "^[+-]"              # See actual changes
git diff file.ts | grep "revenue:"           # Verify specific field changed

# Before writing commit message:
git diff --cached                            # Review staged changes
git diff --cached | grep "^[+-]" | wc -l    # Count actual changes
```

**Why This Happens**:
- Edit tool may fail silently (regex doesn't match, file locked, etc.)
- Multiple edits may conflict or overwrite each other
- File may have been modified by another process

**Prevention Checklist**:
- [ ] After Edit: Re-read file to verify change visible
- [ ] Before commit: Check git diff shows expected changes
- [ ] Commit message: List only changes present in git diff
- [ ] After deploy: Test immediately (don't wait for user report)

**Real Example** (Week 6):
```
Commit Message Said:
"Fixed 5 validation issues:
1. Revenue ✅
2. DueDate ✅
3. InputContext ✅
4. Status ✅
5. Passthrough ✅"

Git Diff Showed:
+++ dueDate: z.union([...])      # ✅ Changed
+++ inputContext: z.union([...]) # ✅ Changed
+++ status: .optional()          # ✅ Changed
+++ }).passthrough()             # ✅ Changed
    revenue: z.number()          # ❌ NOT CHANGED!

Result: Production bug (revenue still strict)
```

**Impact**: This gotcha caused 2 hours of debugging and delayed production fix by 4 hours

**Evidence**: Prevented in future by implementing verification protocol (Week 6 retrospective)

---

### Production-Tested Validation Checklist (Updated 2025-11-02)

**Before Implementing Schema**:
- [ ] Identify all data sources (frontend forms, external APIs, agent configs)
- [ ] Check if frontend sends null for empty fields → Use `.nullable().optional()`
- [ ] Check if frontend sends strings for numbers → Use union + transform
- [ ] Check if multiple input types possible → Use union
- [ ] Check if UI state fields present → Use `.passthrough()`

**Schema Design Patterns**:
- [ ] Form fields: `.nullable().optional()` (not just `.optional()`)
- [ ] UI integration: `.passthrough()` (not `.strict()` or default)
- [ ] String numbers: `z.union([z.string(), z.number()]).transform(parseFloat)`
- [ ] Multi-format dates: `z.union([z.string(), z.date()]).nullable().optional()`
- [ ] Multi-source data: `z.union([z.string(), z.record(z.any())])`
- [ ] Import Prisma enums: `z.nativeEnum(Status)` (don't duplicate with string literals)
- [ ] Backend: `.parse()` with try-catch (NOT `.safeParse()`)
- [ ] Frontend: `.safeParse()` (NOT `.parse()`)

**Before Committing Validation Changes**:
- [ ] Re-read file after Edit tool to verify changes applied
- [ ] Run `git diff file.ts | grep "^[+-]"` to see actual changes
- [ ] Verify each claimed fix is present in git diff
- [ ] Write commit message based on ACTUAL diff (not intentions)
- [ ] Test deployment immediately after push (don't wait for user report)

**Evidence Summary**:
- Pattern 1-4: Fixed 15 production validation errors (Week 6)
- Pattern 5: Prevented incomplete commit from shipping (verification protocol)
- Overall confidence: 98% (production-validated across multiple features)

---

### Critical Files
- `/lib/validation/base.ts` - Foundation with ValidationError class and BaseValidator abstract class
- `/lib/validation/mcpServerValidation.ts` - MCP server configuration validation with transport-specific rules
- `/components/pov/creation/validation.ts` - Complex multi-step form validation with 160+ lines of business rules
- `/lib/services/agentTemplateBuilder/templateValidationService.ts` - 976-line comprehensive validation system

### Common Tasks You Handle
1. **Schema Design & Optimization**
   - Create type-safe schemas with comprehensive validation rules
   - Optimize validation performance for large schemas
   - Ensure consistent error messages across validation layers

2. **Cross-Layer Validation Coordination**
   - Synchronize validation rules between frontend and backend
   - Maintain consistency between database constraints and application validation
   - Implement proper error propagation through all layers

3. **Security & Input Sanitization**
   - Prevent validation bypasses and injection attacks
   - Implement proper input sanitization patterns
   - Ensure compliance with security requirements

## Learning Notes

- **Pattern**: `BaseValidator` abstract class with async `validateData` method - Use for all domain-specific validators to ensure consistent error handling
- **Gotcha**: Zod vs AJV performance differences - Zod is better for TypeScript integration, AJV for complex JSON schema validation and performance
- **Tip**: Use `safeParse` instead of `parse` in production for better error control and user experience
- **Insight**: Template validation requires both schema validation (structure) and business validation (dependencies, conflicts)
- **Critical**: MCP server validation has transport-specific rules - STDIO requires command, WebSocket/SSE require URL (lines 50-65 in mcpServerValidation.ts)
- **Variable Naming for safeParse** (Nov 2025): Prefer `validation` (60% of codebase uses this). Acceptable: `result` (26% of codebase, no conflicts). Avoid: `parseResult`, `validationResult` (non-standard, causes confusion). Pattern: `const validation = Schema.safeParse(data); if (!validation.success) { return 400; } const validated = validation.data;` - Discovered during P1 .parse() conversion when variable name conflicts occurred

### NEW: Plans 7 & 8 Security Validation Patterns
- **Action Whitelisting**: ALLOWED_MCP_ACTIONS array defines all permitted action types - reject anything not in whitelist
- **Multi-Layer Injection Prevention**: Check for SQL injection, XSS, path traversal, and command injection patterns
- **Size Limits**: Enforce 50KB general request limit, 10KB for sensitive operations to prevent DoS
- **Validated Data Usage**: After validation, use the validated data object, never the original request data
- **Security Event Logging**: All validation failures logged as security events for audit trail
- **API → Validation → Service → DB Flow**: Strict validation layer hierarchy - never bypass validation

### MCP Action Validation Silent Field Stripping (Feb 2026)

**Critical Discovery**: Zod schemas in `mcp-action-validation.ts` **silently strip unknown fields** during `.parse()`. If a handler expects a field that isn't in its action's Zod schema, the field disappears with no error.

**Production Example**: The `agent.status` schema was missing `executionId`. When the poll-and-return feature sent `{ executionId: '...' }` to `agent.status`, Zod stripped it, and the handler received `{}` — causing every poll to fail with "Either taskId or executionId is required".

**Key File**: `/lib/validation/mcp-action-validation.ts` — `MCPParameterSchemas` object (lines ~242-484)

**Per-Action Schemas**:
```typescript
MCPParameterSchemas = {
  'agent.execute': z.object({ taskId, agentTemplateId?, ... }),
  'agent.status':  z.object({ taskId?, executionId?, agentTemplateId? }),  // executionId was MISSING
  'agent.results': z.object({ taskId?, executionId? }),
  // ... 10 more action schemas
}
```

**Rule**: When adding a new field to ANY MCP action handler, you MUST also add it to the corresponding schema in `MCPParameterSchemas`. Otherwise it will be silently stripped.

**Detection**:
```bash
# Compare handler destructured fields vs schema fields for each action
# Example for agent.status:
grep -A5 "'agent.status'" lib/validation/mcp-action-validation.ts
grep "const {.*} = parameters" lib/mcp/handlers/agent-status-handler.ts

# Find all MCPParameterSchemas entries
grep -n "'agent\.\|'task\.\|'pov\.\|'stage\.\|'analytics\." lib/validation/mcp-action-validation.ts
```

**Audit Checklist**:
- [ ] Every field destructured from `parameters` in a handler exists in its `MCPParameterSchemas` entry
- [ ] No `.passthrough()` on action-specific schemas (base schema has it, but action schemas don't)
- [ ] New fields added to handlers are also added to validation schemas

### Bug Class Awareness for Validation (Feb 2026)
Several known bug classes are validation concerns. When working on validation, check:

**Registry**: `/.claude/knowledge/domain/mcp/bug-class-registry.md`
**Protocol**: `/.claude/knowledge/protocols/bug-class-eradication-protocol.md`

**Validation-Related Bug Classes**:
- **Bug Class 2 (Prisma Json Column Ambiguity)**: Json columns can return string or object - `ensureObject()` or Zod coercion needed when reading
- **Bug Class 3 (Form Boundary Type Loss)**: HTML forms send strings for numbers - use `z.coerce.number()` or `z.union([z.string(), z.number()]).transform()`
- **Bug Class 4 (Null vs Undefined)**: Frontend sends `null` for empty, Prisma treats `undefined` as "skip" - use `.nullish()` or `.nullable().optional()`
- **Bug Class 1 (Transport Boundary Coercion)**: MCP transports may stringify objects - `ensureObject()` guard needed before `.parse()`

**Detection for Validation Gaps**:
```bash
# Prisma Json fields read without ensureObject (TS + JS patterns)
grep -rn 'as Record<string' --include='*.ts' lib/ app/ | grep -i 'metadata\|config\|capabilities\|steps' | grep -v ensureObject
grep -rn '\.\(metadata\|steps\|variables\|configuration\) || [{\[]' --include='*.js' lib/ | grep -v node_modules | grep -v ensureObject | grep -v 'Array\.isArray'

# Number fields without coercion in Zod schemas
grep -rn 'z\.number()' --include='*.ts' lib/validation/ | grep -v 'coerce\|union'

# MCP tool args parsed without ensureObject
grep -rn '\.parse(args\|\.parse(request' --include='*.ts' services/*/src/ | grep -v ensureObject
```

### Security-Enhanced Validation Pattern (Nov 2025)
When validation protects against attacks (not just data quality), add security logging:

```typescript
const result = SecuritySchema.safeParse(body);

if (!result.success) {
  // SECURITY LOGGING for attack detection
  apiLogger.error({
    type: 'validation_failure',
    schema: 'SecuritySchema',
    userId: req.user?.id || 'unknown',
    ip: req.headers.get('x-forwarded-for') || 'unknown',
    errors: result.error.errors
  }, 'Attack attempt detected');

  return NextResponse.json(
    { error: 'Validation failed', details: result.error.errors },
    { status: 400 }
  );
}
```

**When to use**: Whitelists, injection prevention, access control validation
**Benefits**: Attack detection, audit trail, incident response data
**Example**: `execute-function-validation.ts` (P0 fix Nov 2025)
**Works with**: sec-ops-specialist for security monitoring integration

### Error Helper & Tool Schema Patterns (Dec 2025)
**Pattern Reference**: `/.claude/knowledge/patterns/mcp-tool-ux-pattern.md`

- **Error Helpers**: 3 modules with field-specific validation error formatting
- **Key Functions**: `povNotFoundError()`, `taskNotFoundError()`, `validationFailedError()`
- **Format**: `fields: [{field, message}]` for UI highlighting + fuzzy suggestions
- **Tool Schemas**: 100% coverage (28 tools) with WHEN TO USE, SEE ALSO, EXAMPLES
- **Discovery**: `grep -rn "require.*error-helpers" lib/mcp/server/tools/`

### API Validation Patterns Reference
- **Pattern Library**: `/.claude/knowledge/patterns/api-efficiency-patterns.md` - API validation patterns
- **Pattern 3**: Input Validation with Zod - Proven Zod patterns for API request validation
- **Pattern 8**: Zod Response Validation - Client-side defensive programming with schema validation
- **Created**: Oct 28, 2025 (P0 + P1 API efficiency work)
- **Use Case**: API request/response validation, schema-driven validation strategies


---

## Validation/Handler Parity: Case Study (2025-10-15)

**task.update Parity Violation Fixed**:
- Validation schema allowed 7 fields
- Handler only updated 3 fields
- 4 fields (status, title, dueDate, assigneeId) silently ignored
- Fix: Added all 4 missing fields to handler
- Result: 100% parity achieved

**Key Learning**: passthrough() is CORRECT for magic parameters
- DO NOT add .strict() - breaks magic parameter system
- Security via .refine() checks (injection detection, size limits)
- Allows future parameter additions without breaking validation

**Additional Violations Found**:
1. task.assign ignores 'reason' field (P2 - advisory)
2. task.complete has completionNote/completionNotes naming mismatch (P2)

**Recommendation**: Add automated parity testing to CI pipeline

## Centralized Validation Pattern (October 2025)

### Pattern: Domain Validation Files

**Created** (Oct 30):
- lib/validation/admin-user-validation.ts (Week 1: 3 schemas)
- lib/validation/task-validation.ts (Week 3: 5 schemas)
- lib/validation/file-validation.ts (Week 3: file security)

**Pattern**:
1. Create `/lib/validation/[domain]-validation.ts` BEFORE implementing endpoints
2. Export all Zod schemas for domain
3. Import in handlers: `import { CreateTaskSchema } from '@/lib/validation/task-validation'`
4. Keep schemas centralized (not inline in route files)

**Benefits**:
- Reusable across endpoints
- Single source of truth
- Easier schema evolution
- Better test coverage

**Discovery Commands**:
```bash
# Find centralized validation files
find lib/validation -name "*-validation.ts"

# Count schemas per file
for file in lib/validation/*.ts; do
  echo "$(basename $file): $(grep -c "export const.*Schema" $file) schemas"
done

# Find inline schemas (should centralize)
grep -r "const.*Schema = z.object" app/api --include="*.ts"
```

---

## ⚠️ Critical Pattern: .parse() vs .safeParse() (Nov 2025)

**Most Common Validation Issue**: Using `.parse()` returns 500 instead of 400

**Problem Found** (8+ files in production testing session):
```typescript
// ❌ Throws ZodError → becomes 500 Internal Server Error
const validated = CreateSchema.parse(data);
```

**Correct Pattern**:
```typescript
// ✅ Returns error object → proper 400 Bad Request
const validation = CreateSchema.safeParse(data);
if (!validation.success) {
  return {
    error: {
      message: 'Validation failed: ' + validation.error.errors.map(e => e.message).join(', '),
      code: 'VALIDATION_ERROR'
    }
  };
}
const validated = validation.data;
```

**Files Fixed** (Nov 1, 2025):
- app/api/mcp/resources/route.ts
- app/api/mcp/automations/route.ts
- app/api/mcp/automation-metrics/route.ts
- app/api/mcp/ai-recommendations/route.ts
- app/api/mcp/tools/route.ts
- lib/admin/handlers/user.ts
- lib/tasks/handlers/post.ts

**Impact**: 80% of validation test failures were this single pattern

**Detection**: Production testing (found 15+ .parse() calls returning 500)

**grep**: `grep -rn "\.parse(data\|rawQuery\|body\|request)" app/api lib --include="*.ts"`


## 🔴 CRITICAL PATTERN: Cross-Schema Field Limit Alignment

**Discovered**: November 8, 2025 (Agent Domain Security Audit)

**Problem**: Data flows from Schema A → Schema B, but Schema B has smaller field limits than Schema A, causing runtime validation failures for legitimate use cases.

**Real Example**:
```
Task description: 50KB max (CreateTaskSchema)
    ↓ (passed to agent execution)
Agent prompt: 10KB max (AgentExecuteSchema) ❌ VALIDATION FAILURE!
```

**Impact**:
- Runtime validation errors when passing task descriptions to agents
- User workarounds (truncating data, splitting context)
- Reduced system effectiveness (incomplete data transfer)
- Poor UX ("field too long" errors for valid input)

### Detection Method

**Step 1**: Identify data flow boundaries
```bash
# Find all validation schemas
grep -r "export const.*Schema" lib/validation/ | awk '{print $3}' | sort

# Document data flows:
# - Task → Agent Execution
# - POV → Import/Export
# - Template → Template Application
# - User Input → Database Storage
```

**Step 2**: Extract field limits by category
```bash
# Content/Prompt fields (typically 50KB)
grep -rn "\.max(50000\|\.max(10000" lib/validation/ | grep -i "prompt\|description\|content"

# Metadata fields (typically 500B-5KB)
grep -rn "\.max(5000\|\.max(500" lib/validation/ | grep -i "description\|help\|comment"

# Name/Title fields (typically 255 chars)
grep -rn "\.max(255" lib/validation/ | grep -i "name\|title\|label"
```

**Step 3**: Find mismatches across boundaries
```bash
# Example: Check Task → Agent flow
echo "Source (Task):"
grep -A 2 "description.*FormField" lib/validation/task-validation.ts | grep max

echo "Destination (Agent):"
grep -A 2 "prompt.*z\.string" lib/validation/agent-template-validation.ts | grep max

# Flag if source > destination (50KB → 10KB = MISMATCH!)
```

### Red Flags
- ⚠️ Content fields with 5x+ difference (50KB → 10KB)
- ⚠️ Common user workflows affected
- ⚠️ Comments like "// TODO: handle large descriptions"
- ⚠️ Workarounds (substring, truncate, split)

### Fix Pattern
```typescript
// BEFORE (WRONG)
prompt: z.string().max(10000, 'Prompt must be 10000 characters or less')

// AFTER (CORRECT)
prompt: z.string().max(50000, 'Prompt must be 50000 characters or less')
// Comment explaining rationale:
// Match task description limit (task descriptions can be passed as prompts)
```

### Prevention
1. **Document limit decisions**: Always comment WHY a limit was chosen
2. **Create shared constants**: For related fields
   ```typescript
   const CONTENT_FIELD_LIMIT = 50000; // Task descriptions, agent prompts, template content
   const METADATA_FIELD_LIMIT = 5000; // Object descriptions, help text
   const NAME_FIELD_LIMIT = 255;      // Object names, titles, labels
   ```
3. **Add boundary tests**: Test data at max size from source → destination
4. **Review quarterly**: Run field-limit-alignment-discovery.md

### Discovery Prompt
See: `/.claude/knowledge/discoveries/field-limit-alignment-discovery.md`

### ROI
- **Detection Time**: 30-45 minutes
- **Fix Time**: 5 minutes per mismatch
- **Impact**: Prevents runtime validation failures for legitimate use cases
- **Frequency**: Quarterly or when adding new data flows

---

## 🔴 CRITICAL PATTERN: Schema Definition vs Application Gap

**Discovered**: November 8, 2025 (Agent Domain Security Audit)

**Problem**: Validation schemas exist in codebase but endpoints use manual field mapping instead, bypassing ALL validation (injection detection, type checking, XSS prevention, etc.).

**Real Example**:
```typescript
// Schema exists: lib/validation/agent-template-validation.ts:335
export const UpdateAgentTemplateSchema = z.object({
  promptTemplate: z.string()
    .max(50000)
    .refine(detectPromptInjection, { ... }), // ✅ Has injection detection
  // ... all fields validated
});

// Schema imported: app/api/agent-templates/[templateId]/route.ts:7
import { UpdateAgentTemplateSchema } from '@/lib/validation/agent-template-validation';

// But NOT USED! (lines 202-222):
const updateData: any = {}; // ❌ any type bypasses TypeScript
if (body.name !== undefined) updateData.name = body.name;
if (body.promptTemplate !== undefined) updateData.promptTemplate = body.promptTemplate; // ❌ NO VALIDATION!
// ... 21 lines of manual mapping
await prisma.agentTemplate.update({ data: updateData }); // ❌ UNVALIDATED!
```

**Security Impact**:
- **Risk**: 90/100 (CRITICAL)
- Prompt injection bypass (31 patterns not checked)
- XSS bypass (no sanitization)
- Type bypass (any type)
- False sense of security (schema exists, just not used)

### Detection Method

**Quick Scan** (10 minutes):
```bash
#!/bin/bash
# Find schemas imported but never used

echo "=== Schemas Imported But Never Used ==="
find app/api -name "*.ts" -type f | while read file; do
  # Check if file imports schemas
  has_import=$(grep -c "import.*Schema.*from.*validation" "$file")
  # Check if file uses .safeParse() or .parse()
  has_usage=$(grep -c "\.safeParse\|\.parse" "$file")

  # Red flag: Import but no usage
  if [ $has_import -gt 0 ] && [ $has_usage -eq 0 ]; then
    echo "❌ $file"
  fi
done
```

**Manual Field Mapping Detection**:
```bash
# Find dangerous manual mapping pattern
find app/api -name "*.ts" -type f -exec grep -l "const.*Data.*:.*any.*=.*{}" {} \;

# Shows files with manual field mapping (validation bypass pattern)
```

### Red Flags
- ⚠️ Schema imported but `.safeParse()` never called
- ⚠️ Manual field mapping (`const updateData: any = {}`)
- ⚠️ Direct `body` → database updates
- ⚠️ Comments like "// TODO: add validation"
- ⚠️ `updateData` or `createData` variables with `any` type

### Fix Pattern
```typescript
// WRONG (validation bypass)
const updateData: any = {};
if (body.name !== undefined) updateData.name = body.name;
if (body.promptTemplate !== undefined) updateData.promptTemplate = body.promptTemplate;
await prisma.model.update({ data: updateData });

// CORRECT (validation applied)
const validationResult = UpdateSchema.safeParse(body);

if (!validationResult.success) {
  // Check for security violations
  const hasInjection = validationResult.error.errors.some(e =>
    e.message.includes('injection')
  );

  if (hasInjection) {
    apiLogger.warn({
      userId: user.userId,
      patterns: validationResult.error.errors.filter(e => e.message.includes('injection'))
    }, 'Prompt injection blocked');
  }

  return NextResponse.json(
    { error: 'Validation failed', details: validationResult.error.flatten() },
    { status: 400 }
  );
}

const updateData = validationResult.data; // ✅ Type-safe, validated!
await prisma.model.update({ data: updateData });
```

### Prevention
1. **Automated tests**: Test that imports → .safeParse() calls exist
2. **Code review**: Flag manual field mapping patterns
3. **Linting rule**: Warn on `: any = {}` in API routes
4. **Quarterly audit**: Run schema-application-audit-discovery.md

### Discovery Prompt
See: `/.claude/knowledge/discoveries/schema-application-audit-discovery.md`

### ROI
- **Detection Time**: 45-60 minutes
- **Fix Time**: 10-15 minutes per endpoint
- **Impact**: Closes CRITICAL security bypass vulnerabilities
- **Priority**: P0 (validation bypass = security bypass)

---

## 📊 Validation ROI Metrics (November 2025)

**Agent Domain Security Audit Results**:
- **Baseline**: 78/100 security score
- **After validation fixes**: 88/100 (+10 points)
- **Time invested**: 40 minutes
- **ROI**: 0.25 points/min (best ROI of all fix types)

**Pattern**: Validation fixes have **5x better ROI** than infrastructure fixes

**Proven Efficiency**:
- Field limit fix: 5 minutes → Prevented validation failures
- Schema application fix: 10 minutes → Closed CRITICAL security bypass (Risk 90 → 5)

---

**Specialist Enhanced** ✅
**New Capabilities**: Cross-schema field limit alignment + schema application audit
**Updated**: 2026-02-22 (added pino structured logging for validation events)


## BC71 Awareness (2026-05-22, BUG-BASIC-XSS-1)

**New bug class**: Untrusted Input in Response-Text Interpolation. Full entry at `.claude/knowledge/domain/mcp/bug-class-registry.md` BC71.

**Validation chain interaction**:
- **L1 dispatch boundary** (`lib/mcp/server/config/tool-schemas.js`): 16 free-text lookup fields now use `SafeNameField` for injection rejection. Pattern matches `MCPActionRequestSchema` from the `perform` tool.
- **L3 per-action schemas** (`lib/validation/mcp-action-validation.ts`): existing `SimpleTextField` + `RichTextField` patterns unchanged. `SimpleTextField` is now exported for reuse.
- **L4 output sanitization** (`lib/mcp/server/tools/response-sanitizer.js`): wraps echo sites. Reuses canonical `lib/utils/sanitize.ts:escapeHtml` (5-char OWASP set) via inline KEEP IN SYNC comment (cross-runtime constraint).
- **L5 dispatch-boundary walker**: DEFERRED (D2). L1+L4 deemed sufficient.

**When reviewing new validation work**: check that any new free-text field added to tool-schemas.js uses `SafeNameField()` not bare `z.string()`. The L1 layer is the loud-rejection line; L4 is the silent defense-in-depth.

---



---

## Trim follow-up additions (2026-06-11)

### ⚠️ CRITICAL: Phantom Canonical / FIELD_LIMITS Drift Audit (May 2026)

When auditing validation schemas, two related drift classes can hide bugs for
weeks:

**1. Phantom canonical schema**: a validation schema is declared in one file
(e.g. an inline `*Inline` in a handler) but the *actual* runtime validation
imports a *different* schema from elsewhere. Three fix attempts on 2026-05-13
landed inside a 95-line dead block comment containing `UpdatePOVSchemaInline`
in `lib/pov/handlers/put.ts` — the real schema was `UpdatePOVSchemaComprehensive`
in `lib/validation/pov.ts`.

**2. FIELD_LIMITS drift**: `lib/validation/field-limits.ts` exports categorized
string-size constants (CONTENT, METADATA, NAME, TITLE, LABEL, ID, etc).
Hardcoded `.max(N)` values that should reference these constants are a future
"agent generates X characters → save rejects" bug. The May 13 task.description
save failure was exactly this — MCP intake allowed 50000, POV PUT capped at
2000, agent-template tasks consistently exceeded 2000.

**Audit rule**: when reviewing any validation schema, grep for the same field
in OTHER validation files. If `description` is `FormField.optionalString(2000)`
here but `FIELD_LIMITS.CONTENT` (50000) elsewhere, you have layer drift.

Pattern: `.claude/knowledge/patterns/two-execution-path-drift-pattern.md`
§Phantom Canonical Variant. Registry: Bug Class 75.

**2026-05-15 / 2026-05-16 BC75 lesson — MCP action allowlists exist in TEN sites across FIVE files**:

Original entry (2026-05-15) cited 3 sites — that was the count surfaced by the immediate deploy-smoke discovery. Next-day cross-domain audit (mcp-tool-architecture + mcp-hub specialists in parallel, 2026-05-16) found the real count is **10 sites across 5 files**, of which 4 are P0 (strict-gating), 2 are P1 (silent no-op or approval-bypass), and 4 are P2 (cosmetic/discovery).

**Full inventory** (any drift = potential silent failure — read severity column carefully):

| # | File:Line | Role | Severity |
|---|-----------|------|----------|
| 1 | `lib/validation/mcp-action-validation.ts:188` `ALLOWED_MCP_ACTIONS` | REST entry validation — **your primary territory** | P0 |
| 2 | `lib/validation/mcp-action-validation.ts:267+` `MCPParameterSchemas` keys | Router safeParse lookup keys (separately declared in the same file) | P0 |
| 3 | `lib/mcp/server/config/tool-schemas.js:206` perform enum | LLM tool surface | P0 |
| 4 | `lib/mcp/server/tools/advanced/task-action-handler.js:150` `validActions` | MCP server runtime guard | P0 |
| 5 | `lib/mcp/tasks/action/tasks-action-router.ts` switch cases | Router dispatch | P0 |
| 6 | `lib/services/mcp/recommendation-action-mapper.ts:59` `PERFORM_ACTIONS` | Recommendation routing | **P1 — silent no-op fall-through** |
| 7 | `lib/services/mcp/recommendation-action-mapper.ts:67` `HIGH_RISK_ACTIONS` | Approval gating | **P1** |
| 8 | `lib/mcp/tasks/action/utilities/mcp-logging.ts:21` `ACTION_SERVICE_MAP` | Logging routing | P2 |
| 9 | `lib/mcp/tasks/action/utilities/mcp-logging.ts:62` action→verb map | Activity logging taxonomy | P2 |
| 10 | `lib/mcp/server/tools/advanced/error-helpers.js:19` `TASK_ACTIONS` | "Did you mean" fuzzy suggestion | P2 |

**The P1 failure mode is particularly insidious**: if the AI recommendation engine produces a step for an action missing from `PERFORM_ACTIONS`, the mapper falls through to `service_call` which is a no-op stub at `app/api/mcp/recommendations/[id]/implement/route.ts:70-89`. The recommendation is marked "implemented successfully" but **nothing happens**. Worst-kind-of-failure silent success.

**Quick verification grep** (mandatory when reviewing any plan/PR that adds an MCP action):
```bash
grep -rn "'<your.new.action>'" \
  lib/validation/mcp-action-validation.ts \
  lib/mcp/server/config/tool-schemas.js \
  lib/mcp/server/tools/advanced/task-action-handler.js \
  lib/mcp/server/tools/advanced/error-helpers.js \
  lib/mcp/tasks/action/tasks-action-router.ts \
  lib/mcp/tasks/action/utilities/mcp-logging.ts \
  lib/services/mcp/recommendation-action-mapper.ts
```

All 5 files should each produce ≥1 hit. Zero hits = drifting site.

**Provenance**: see BC75 §Task-Action Handler Sibling Drift entry (updated 2026-05-16 with the full 10-site inventory) in `.claude/knowledge/domain/mcp/bug-class-registry.md`.

**2026-05-15 update — task-schema sibling drift (DEFERRED, do not re-derive)**:
A 3-specialist review (you, architectural-review, types-system) confirmed **5 BC75-class drift instances** between `CreateTaskSchema` / `UpdateTaskSchema` (`lib/validation/task-validation.ts`) and `NestedTaskInputSchema` (`lib/validation/task-shapes.ts`):

| # | Field | Drift | NestedTask vs Create/Update |
|---|-------|-------|----------------------------|
| 1 | `type` | Enum source | `PrismaEnum.taskType` vs `z.string().max(LABEL)` (free-form) |
| 2 | `executionStatus` | Enum source | `PrismaEnum.executionStatus` vs 4-value hardcoded enum |
| 3 | `maxRetries` | Bounds asymmetry | `0-10` vs `0-100` |
| 4 | `timeout` | Bounds asymmetry | `0-3600000` (1hr) vs `0-600000` (10min) |
| 5 | `metadata`/`outputArtifacts` | Null semantics | `transform null→undefined` vs `preserves null` |

**All 5 deferred** — Phase 0 production queries needed before convergence (see BC75 §Known Active Drift in the registry for queries + rationale). Convergence is **not** required for active workstreams; MCP `pov.update` is unblocked by today's `NestedTaskInputSchema` extraction (commit `240fc9b0`) alone.

**Fourth task-shape variant**: `UpdateTaskStatusSchema` at `task-validation.ts:171` is a separate 4th variant with `blockReason`/`notes` injection refines. Inventory it when working on task convergence.

**Two `OptionalCUID` exports** (latent footgun, separate cleanup): `form-field-patterns.ts:112` vs `id-validation.ts:30` have different null semantics.

**When firing the audit on `task-validation.ts`**: skip re-deriving the above 5 instances (already documented); look for NEW drift or any of the 5 fields' status changing (e.g., bounds tightened, enum source flipped).

**Review artifact**: `cline_docs/reviews/task-shape-convergence-2026-05-15/` — your full review at `validation-engine-review.md` flagged the 9 non-equivalences (matrix v1 named 4); future you should start there before re-doing the forensic walk.

