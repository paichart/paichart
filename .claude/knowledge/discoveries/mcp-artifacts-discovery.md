# Artifacts System Discovery Task

**Last Updated**: 2026-06-11 (health-run: phantom paths purged, archived test script retargeted)
**Status**: Enhanced v4.0 — Post-Deliverable-Contract refactor (Apr 2026), policy-driven artifact creation, harnessModeResolver integration
**Confidence**: Very High - Aligned with comprehensive architecture documentation
**Last Validated**: 2026-04-27 — full sweep against `agentArtifactPolicy.ts`, `harnessModeResolver.ts`, and the four Apr 2026 contract commits (`d652a630`, `d0c0f2d8`, `04fb7630`, `ff5a6bf0`)

## Objective
Perform a comprehensive discovery of the artifact system implementation to understand how agent execution outputs are captured, stored, retrieved, and utilized throughout the pAIchart platform, including database storage patterns, MCP resource serving, and UI presentation.

## Context
The artifact system is critical for audit trails, debugging, and context enrichment. We need to understand the complete lifecycle from creation to consumption, including all integration points and usage patterns.

**Artifact policy (Apr 2026)** — `lib/services/agentArtifactPolicy.ts` gates artifact creation by task type and dependent count:

| Task type | dependents | JSON artifact | report.md? |
|-----------|-----------|---------------|------------|
| `PIPELINE` (harness) | any | `pipeline-index.json` | ❌ |
| Non-PIPELINE | 0 (leaf) | `result.json` | ✅ — `report.md = finalResponse` verbatim |
| Non-PIPELINE | 1+ (intermediate) | `result.json` | ❌ |

Error paths create `error.json`. raw_response.txt was removed Feb 2026 (duplicated content in report.md).

**Deliverable Contract (Apr 2026)**: `finalResponse` is the canonical deliverable channel. `report.md = finalResponse` verbatim (no `## Generated Content` wrapper, no metadata headings); downstream specialists read upstream `result.json.finalResponse` as chained context. `task.comment` is coordination only — never the delivery channel. Tool execution forensics live ONLY in `result.json.toolCalls` (structured); they are NOT concatenated onto `finalResponse`/`report.md` (engine + stream both fixed in commit `d652a630`).

Retrieval mechanisms include API, MCP tools, and MCP resources with format options (preview/full/metadata/download), signed URLs, rate limiting, and cross-platform support.

## Discovery Scope

### 1. Artifact Creation Pipeline

Search for and document:
- Where artifacts are generated in the execution flow
- Files containing `agentArtifact.create`, `AgentArtifact`, or `createArtifacts`
- Three artifact types under the policy: `result.json` (intermediate + leaf non-PIPELINE), `pipeline-index.json` (PIPELINE harness), `report.md` (leaf non-PIPELINE only)
- Error artifact creation (`error.json`) in failure paths
- Content assembly logic for each artifact type
- Error handling during artifact creation

**Transaction Atomicity (Feb 2026)**: Verify artifact creation is inside `$transaction`:

```bash
# Find all artifact creation sites and verify they're inside transactions
grep -n "agentArtifact.create\|agentArtifact.createMany" \
  lib/services/agentExecutionEngine.ts \
  app/api/pov/agent/execute/stream/route.ts

# Verify transaction blocks contain artifact + execution + task updates
grep -n "\$transaction" \
  lib/services/agentExecutionEngine.ts \
  app/api/pov/agent/execute/stream/route.ts
```

**Artifact Policy Gate (2026-04-28)** — verify the deliverable-extraction policy is reached from BOTH execution paths. 6-anchor block (catches function rename, upstream-fetch removal, forensic-log removal, protocol-prose drift, A.3 cleanup regression):

```bash
echo "=== Policy file: ReportMdDecision type + getReportMdDecision function ==="
grep -nE "type ReportMdDecision|export (async )?function getReportMdDecision|source: 'upstream'|source: 'self'" \
  lib/services/agentArtifactPolicy.ts

echo "=== Both execution paths: extraction logic anchors ==="
grep -nE "getReportMdDecision\(|decision\.source === 'upstream'|decision\.sourceTaskId|reportMdSource" \
  lib/services/agentExecutionEngine.ts \
  app/api/pov/agent/execute/stream/route.ts

echo "=== Both execution paths: extraction fetches upstream artifact (POV-scoped) ==="
grep -nE "tx\.agentArtifact\.findFirst.*name: 'result\.json'|status: 'SUCCESS'|task: \{ povId: thisPovId \}" \
  lib/services/agentExecutionEngine.ts \
  app/api/pov/agent/execute/stream/route.ts

echo "=== Both execution paths: forensic warn log on extraction ==="
grep -nE "Failed to parse upstream source result\.json|No upstream source artifact found|Upstream source result\.json was truncated|Upstream finalResponse is suspiciously short" \
  lib/services/agentExecutionEngine.ts \
  app/api/pov/agent/execute/stream/route.ts

echo "=== Metadata field consumption: harness CREATE-mode prose (Step 5a) ==="
grep -nE "deliverableSourceTaskId|suppressDefaultReportMd" \
  scripts/seed-protocol-prompts.ts

echo "=== No agent-driven artifact.create resurfaces ==="
grep -nE "artifact\.create" \
  scripts/seed-protocol-prompts.ts \
  lib/services/pipelineProtocolValidator.ts || echo "✓ no artifact.create references (correct)"

echo "=== Pointer substitution: placeholder + engine substitution (2026-04-29) ==="
grep -nE "HARNESS_REPORT_MD_ID|Substituted harness report.md ID|pipeline-index\.json missing.*placeholder" \
  lib/services/agentExecutionEngine.ts \
  app/api/pov/agent/execute/stream/route.ts \
  scripts/seed-protocol-prompts.ts
```

**Deliverable Contract Anti-Leak Audit (Apr 2026)** — these patterns MUST return zero matches in either execution path. If they reappear, the engine-side tool-dump leak from before commit `d652a630` is back, and `report.md` will once again carry raw `## Tool Execution (Turn N)` blocks:

```bash
# Should be ZERO matches in both files
grep -nE "## Tool Execution \(Turn|finalResponse = \(finalResponse \|\| ''\) \+ toolMarkdown|generatedText \+= toolResultText" \
  lib/services/agentExecutionEngine.ts \
  app/api/pov/agent/execute/stream/route.ts || echo "✓ no leak markers"

# Forensic data MUST still be emitted in structured form (these MUST exist)
grep -nE "toolCalls:\s|qualityMetrics:|toolCallSuccess:|mcpToolsProvided:|toolLoop:" \
  lib/services/agentExecutionEngine.ts \
  app/api/pov/agent/execute/stream/route.ts
```

**Mode-resolver integration (Apr 2026)** — the harness's `pipeline-index.json` carries `resolvedMode` + `resolvedReasonCode` from `harnessModeResolver.ts`. Verify both execution paths populate these fields:

```bash
# Resolver invocation + resultJson injection
grep -n "harnessContext\|resolvedMode\|resolvedReasonCode\|resolveHarnessMode" \
  lib/services/agentExecutionEngine.ts \
  app/api/pov/agent/execute/stream/route.ts \
  lib/services/harnessModeResolver.ts
```

### 2. Storage and Schema
Identify:
- Prisma schema definition for AgentArtifact
- Database relationships (AgentExecution → AgentArtifact)
- Storage patterns and constraints
- Any indexes or performance optimizations
- Migration files affecting artifacts

### 3. Retrieval and Display
Find:
- API routes that return artifact data
- Components that display artifacts
- The `agent.results` MCP tool implementation
- How `includeOutput` parameter affects retrieval
- Artifact content transformation or formatting

### 4. Usage Patterns
Analyze:
- How artifacts are used for debugging
- Context enrichment from previous executions
- Cross-task learning implementations
- Performance analysis using artifacts
- Any caching mechanisms

### 5. Integration Points
Locate:
- AgentExecutionEngine artifact creation
- MCP tool result inclusion in artifacts
- API endpoints for artifact access
- UI components for artifact viewing
- WebSocket/real-time artifact updates

### 6. MCP Resource Implementation
Document the sophisticated resource system:
- SimpleResourceManager and MCPResourceManager implementations
- Resource URI patterns (mcp://artifacts/{id})
- **CRITICAL**: Cache key format MUST use `buildResourceKey('artifact', id)` from `resource-manager-shared.js` — never hardcode
- Lazy loading and on-demand fetching
- Resource validation and cleanup (daily-midnight-UTC by task — status-aware keep-4S/4F; daily by age >90d)
- Both managers implement `IResourceManager` interface
- Format options (preview/full/metadata/download)
- Verify resource discovery in `setupDatabaseResourceIntegration()` method
- Confirm async initialization with `resourcesReady` promise pattern

### 7. Security and Performance
Analyze:
- Signed URL generation with HMAC-SHA256
- Rate limiting implementation (10/min per token)
- LRU cache for performance (10K items max)
- Periodic cleanup strategies (5-minute intervals)
- Audit logging for access tracking
- Cross-platform compatibility (Windows/Ubuntu)

## Search Strategies

### 1. Core Artifact Patterns
```bash
# Artifact creation and storage
grep -r "AgentArtifact\|agentArtifact" --include="*.ts" --include="*.tsx"
grep -r "createArtifacts\|generateArtifacts" --include="*.ts"
grep -r "prisma\.agentArtifact" --include="*.ts"

# Artifact types
grep -r "result\.json\|report\.md" --include="*.ts"
grep -r "artifactType.*json\|artifactType.*markdown" --include="*.ts"
```

### 2. Storage and Retrieval Patterns
```bash
# Database queries
grep -r "include:.*artifacts" --include="*.ts"
grep -r "select:.*artifacts" --include="*.ts"
grep -r "where:.*executionId" --include="*.ts" | grep artifact

# Retrieval with includeOutput
grep -r "includeOutput\|include_output" --include="*.ts"
grep -r "artifacts\.map\|artifacts\.filter" --include="*.ts"
```

### 3. API and MCP Integration
```bash
# API routes
find app/api -path "*artifact*" -name "*.ts"
grep -r "/api.*artifact" --include="*.ts" --include="*.tsx"

# MCP tool integration
grep -r "agent\.results\|agent_results" --include="*.ts"
grep -r "mcp.*artifact\|artifact.*mcp" --include="*.ts"

# Tool handlers
grep -r "handleAgentResults\|getAgentResults" --include="*.ts"
```

### 4. UI Components and Display
```bash
# Component discovery
grep -r "ArtifactView\|ArtifactDisplay" components/ --include="*.tsx"
grep -r "artifacts.*\.map.*=>" components/ --include="*.tsx"
grep -r "<pre.*artifact\|<code.*artifact" components/ --include="*.tsx"

# Artifact content rendering
grep -r "formatArtifact\|parseArtifact" --include="*.ts" --include="*.tsx"
grep -r "JSON\.stringify.*artifact\|JSON\.parse.*artifact" --include="*.ts"
```

### 5. Error Handling and Validation
```bash
# Error patterns
grep -r "artifact.*error\|error.*artifact" --include="*.ts"
grep -r "ArtifactNotFound\|NoArtifacts" --include="*.ts"

# Validation
grep -r "validateArtifact\|isValidArtifact" --include="*.ts"
grep -r "artifact.*null\|!artifact" --include="*.ts"
```

### 6. Performance and Optimization
```bash
# Large artifact handling
grep -r "artifact.*size\|artifact.*length" --include="*.ts"
grep -r "truncate.*artifact\|slice.*artifact" --include="*.ts"

# Caching patterns
grep -r "artifactCache\|cachedArtifact" --include="*.ts"
grep -r "memo.*artifact" --include="*.ts" --include="*.tsx"
```

### 7. Cross-Reference Discovery
```bash
# Find all artifact-related files
find . \( -name "*artifact*.ts" -o -name "*artifact*.tsx" \) | grep -v node_modules | grep -E "(lib|app|components)"

# Execution to artifact relationships
grep -r "execution\.artifacts\|execution\?.artifacts" --include="*.ts" --include="*.tsx"
grep -r "artifacts\?\.\.\.\.execution" --include="*.ts"
```

### 8. MCP Resource Patterns
```bash
# Resource managers
grep -r "SimpleResourceManager\|MCPResourceManager" --include="*.js" --include="*.ts" -B 3 -A 10
grep -r "discoverArtifactResources" --include="*.js" --include="*.ts" -B 5 -A 15
grep -r "mcp://artifacts" --include="*.js" --include="*.ts" -B 2 -A 5

# Resource lifecycle
grep -r "getResource.*artifact\|artifact.*resource" --include="*.js" --include="*.ts" -B 3 -A 10
grep -r "lazy.*load.*resource\|on-demand.*fetch" --include="*.js" --include="*.ts" -B 3 -A 5

# CRITICAL: Cache key format verification — must use shared helpers
echo "=== Checking cache key patterns ==="
grep -r "buildResourceKey\|RESOURCE_KEY_PREFIX" --include="*.js" --include="*.ts" | grep artifact | head -10
grep -r "resources\.set\|resources\.get" lib/mcp/simple-resource-manager.js

# Verify no hardcoded artifact key strings (regression check)
echo "=== Hardcoded Key Regression ==="
grep -c "startsWith('artifact-')" lib/mcp/simple-resource-manager.js lib/services/mcp/resourceManager.ts || echo "0 (good)"
```

### 9. Format Options Discovery
```bash
# Format handling
grep -r "format=preview\|format=metadata\|format=download" --include="*.ts" --include="*.js" -B 3 -A 5
grep -r "getAgentArtifactContent" --include="*.ts" -B 5 -A 20
grep -r "formatOptions\|artifact.*format" --include="*.ts" -B 2 -A 5

# First 1000 chars preview
grep -r "slice.*1000\|substring.*1000" --include="*.ts" --include="*.js" | grep -i artifact -B 2 -A 2
```

### 10. Security Implementation
```bash
# POV Access Validation (NEW - 2025-10-10)
grep -n "export function validatePOVAccess" lib/auth/validate-pov-access.ts -A 30
grep -rn "validatePOVAccess" app/api --include="*.ts" | head -20
grep -rn "import.*validatePOVAccess" app/api --include="*.ts"

# Artifact endpoint security
grep -n "validatePOVAccess.*Artifact" app/api/pov/agent/artifacts/ --include="*.ts" -B 3 -A 3
grep -n "validatePOVAccess.*Download" app/api/artifacts/ --include="*.ts" -B 3 -A 3

# POV context in database queries
grep -n "include:.*pov.*team.*members" app/api/pov/agent/artifacts --include="*.ts" -B 5 -A 10
grep -n "metadata.*isDemo" app/api --include="*.ts" | grep artifact

# Signed URLs and rate limiting
grep -r "ARTIFACT_SIGNING_KEY\|signUrl\|verifySignature" --include="*.ts" -B 3 -A 10
grep -r "RateLimiter.*artifact\|LRUCache.*download" --include="*.ts" --include="*.js" -B 5 -A 10
grep -r "rate.*limit.*download\|download.*throttle" --include="*.ts" -B 3 -A 5

# Audit logging
grep -r "audit.*artifact\|artifact.*audit" --include="*.ts" -B 3 -A 5
grep -r "download.*log\|access.*log.*artifact" --include="*.ts" -B 2 -A 3
```

### 11. Performance Optimizations
```bash
# Caching implementations
grep -r "LRUCache\|lru-cache" --include="*.js" --include="*.ts" -B 3 -A 5
grep -r "artifact.*cache\|cache.*artifact" --include="*.ts" --include="*.js" -B 3 -A 10
grep -r "cleanup.*artifact\|artifact.*cleanup" --include="*.ts" --include="*.js" -B 5 -A 10

# Periodic tasks
grep -r "setInterval.*artifact\|cron.*artifact" --include="*.ts" --include="*.js" -B 3 -A 10
grep -r "5.*minute\|300000" --include="*.js" | grep -i artifact -B 2 -A 2
```

### 12. System Health Validation
```bash
echo "=== Artifact System Health Check ==="
echo "1. Core files: $([ -f lib/services/agentExecutionEngine.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "2. Resource managers: $(find . -name "*resource-manager*" | grep -v node_modules | wc -l) files"
echo "3. MCP integration: $(grep -c "mcp://artifacts" --include="*.js" --include="*.ts" -r . 2>/dev/null || echo '0') references"
echo "4. Security config: $(grep -c "ARTIFACT_SIGNING_KEY" --include="*.ts" -r . 2>/dev/null || echo '0') uses"
echo "5. Format options: $(grep -c "format=preview\|format=download" --include="*.ts" --include="*.js" -r . 2>/dev/null || echo '0') implementations"

# Component verification
echo -e "\n=== Critical Components ==="
echo "SimpleResourceManager: $([ -f lib/mcp/simple-resource-manager.js ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "Download endpoint: $([ -f app/api/artifacts/[id]/download/route.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "Parity tests: $([ -f scripts/test-execution-artifacts-parity.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"   # test-artifact-download.js ARCHIVED (1c8c2c35) to scripts/archive/testing/; live suites: npm run test:execution-artifacts-parity + test:artifact-viewer-multi-exec

# Configuration check
echo -e "\n=== Configuration ==="
echo "LRU Cache installed: $(npm list lru-cache 2>/dev/null | grep -c "lru-cache@" || echo '❌ NOT INSTALLED')"
echo "Rate limiter configs: $(grep -c "rateLimiter\|RateLimiter" --include="*.ts" --include="*.js" -r . 2>/dev/null || echo '0')"
```

## Special Attention Areas

1. **POV Access Validation** ⭐ **NEW (2025-10-10)**: DRY shared utility replacing 14 duplicate inline checks
   - `validatePOVAccess()` in `/lib/auth/validate-pov-access.ts`
   - 3 artifact endpoints now using shared utility
   - DEMO_USER additive access (owned + team + demo flag)
   - 56% code reduction (~800 lines → ~350 lines)
2. **Content Size Management**: Look for truncation, streaming, or pagination of large artifacts
3. **Null Handling**: How the system handles executions without artifacts
4. **Format Consistency**: Ensuring JSON validity, markdown rendering
5. **Access Control**: Who can view which artifacts (now POV-based)
6. **Performance Impact**: Query optimization with large artifact sets
7. **Real-time Updates**: WebSocket integration for live artifact streaming
8. **MCP Resource Discovery**: Dual-server architecture (paichart vs paichart-embedded-mcp)
9. **Lazy Loading**: On-demand resource fetching to prevent "not found" errors
10. **Format Options**: Token-efficient preview mode (1000 chars) vs full content
11. **Security Features**: POV validation, signed URLs, rate limiting, audit logging
12. **Cross-Platform**: Windows binary targets, remote Claude Desktop support
13. **Cleanup Strategies**: 5-minute intervals, LRU cache management

## Progress Tracking

Track discovery execution with visual progress indicators:

```markdown
📊 Discovery Progress: Artifacts System
═══════════════════════════════════════
Overall Progress: [░░░░░░░░░░] 0%

Section Progress:
□ Section 1: Core Artifact Patterns
□ Section 2: Storage and Retrieval Patterns
□ Section 3: API and MCP Integration
□ Section 4: UI Components and Display
□ Section 5: Error Handling and Validation
□ Section 6: Performance and Optimization
□ Section 7: Cross-Reference Discovery
□ Section 8: MCP Resource Patterns
□ Section 9: Format Options Discovery

Current Status: 🚀 Starting Discovery
Commands: 0/52 executed
Findings: 0 critical ⚠️ | 0 warnings ⚡ | 0 info ℹ️
⏱️ Time: 0 minutes
```

### Progress Update Pattern
Update after each section completion:
```markdown
✅ Section 1: Core Patterns [██████████] 100%
   Commands: 8/8 | Found: 3 artifact types, sync mechanism
🔄 Section 2: Storage [███░░░░░░░] 30%
   Commands: 3/10 | Analyzing retrieval patterns...
```

## Visual Handover Protocol

When discoveries require specialist expertise, use this handover format:

```markdown
--- DISCOVERY HANDOVER ---
Current Role: discovery-scout ✅
Discovery Progress: [██████████] 100% Complete

## Discovery Summary:
📊 **Components Found:** Artifact service, MCP resources ✅
⚠️ **Critical Issues:** 2 sync failures detected
🔍 **Areas Investigated:** 
   - ✅ Artifact lifecycle mapped
   - ✅ MCP resource conversion working
   - ⚠️ Task sync race condition found
   - ❌ Cleanup strategy incomplete

## Context for Specialist:
- Key Finding: Dual execution paths both sync to task.outputArtifacts
- Risk Area: Race condition in artifact.waitForComplete()
- Focus Needed: Fix sync timing, implement cleanup strategy

Delegating to: artifacts-specialist
Reason: Deep artifact system expertise required
Priority: Fix race condition, complete cleanup implementation

--- ACTIVATING ARTIFACTS-SPECIALIST ---
```

### Specialist Reception Template
```markdown
--- ARTIFACTS-SPECIALIST ACTIVATED ---

## Handover Acknowledged ✅
Inherited from: discovery-scout
Discovery Completeness: [██████████] 100%

## Context Received:
📊 **Components:** Artifact service, MCP resources ✅
⚠️ **Issues:** 2 sync failures acknowledged
🔍 **Focus Areas:** Race condition priority

## My Specialist Analysis Starting:
[░░░░░░░░░░] 0% → Analyzing sync patterns...
[████░░░░░░] 40% → Reviewing lifecycle hooks...
[██████████] 100% → Analysis complete ✅

## Specialist Findings:
1. Add mutex lock for artifact sync
2. Implement 5-minute cleanup interval
3. Use LRU cache for resource management
```

## Expected Outputs

### 1. Component Inventory
```markdown
## Artifact System Components

### Core Files
- `/lib/services/agentExecutionEngine.ts` - Artifact creation logic (the doc's old `agentExecution.ts` name never existed)
- `/app/api/artifacts/*` - API endpoints
- [Additional files found]

### Database Schema
- Model: AgentArtifact
- Fields: [id, executionId, type, content, createdAt]
- Relationships: AgentExecution (1:many)

### UI Components
- [Component path] - Artifact display
- [Component path] - Artifact list

### Integration Points
- MCP Tool: perform(action: 'agent.results')
- API: /api/agent-executions + /api/artifacts/[id]/download
- Events: PostgreSQL NOTIFY/LISTEN (no WebSocket — removed Jan 2026)

### MCP Resource Components
- SimpleResourceManager: Resource discovery and management
- MCPResourceManager: Embedded server resources
- Format handlers: preview/full/metadata/download

### Security Components
- ARTIFACT_SIGNING_KEY: Environment variable
- Rate limiter: LRU cache-based
- Audit logger: Download tracking
```

### 2. Data Flow Analysis
```
Artifact Lifecycle:
1. Execution: Agent completes → generateArtifacts()
2. Creation: Build JSON/MD/TXT → validate content
3. Storage: prisma.agentArtifact.createMany()
4. Retrieval: API/MCP request → query with filters
5. Display: Transform → render in UI
```

### 3. Performance Metrics
- Average artifact size: [JSON: X KB, MD: Y KB, TXT: Z KB]
- Query patterns: Include vs Select optimization
- Caching strategy: [If implemented]
- Large artifact handling: [Truncation/streaming]

## Risk Assessment Matrix

| Risk | Severity | Likelihood | Impact | Mitigation |
|------|----------|------------|---------|------------|
| Large artifact storage | High | Medium | Database bloat, slow queries | Size limits, compression |
| Missing artifacts | High | Low | Debugging impossible | Validation, backup retention |
| Invalid JSON content | Medium | Medium | Parser errors, UI breaks | Content validation, error handling |
| No cleanup strategy | Medium | High | Unbounded growth | 5-minute cleanup intervals |
| Access control gaps | High | Low | Data exposure | Auth checks, signed URLs |
| Resource discovery failure | High | Medium | Artifacts invisible in MCP | Lazy loading implementation |
| Stale resource cache | Medium | High | 404 errors on valid artifacts | Resource validation on access |
| Rate limit bypass | High | Low | Download abuse, DoS | LRU cache, token tracking |
| Signed URL expiration | Low | High | User inconvenience | 1-hour expiration, refresh |
| Cross-platform issues | Medium | Medium | Remote Claude Desktop fails | Windows binary targets |
| LRU cache overflow | Low | Medium | Memory issues | 10K item limit |

## Output Format

```markdown
# Artifacts System Discovery Report

## Summary
- Total files found: X
- Creation points: X
- Retrieval points: X  
- Display components: X
- Performance concerns: X
- MCP resource implementations: X
- Security features: X
- Format options: X

## Detailed Findings

### Core Components
#### /lib/services/agentExecutionEngine.ts (CORRECTED 2026-06-11 — `agentExecution.ts` and `/app/api/agent/results/route.ts` never existed at any commit; the old entries were unfilled template residue with bracketed placeholders)
- **Purpose**: Central artifact creation (policy-driven via `agentArtifactPolicy.ts`)
- **Dependencies**: Prisma, execution context, harnessModeResolver

### Retrieval Surfaces (real)
- MCP: `perform(action: 'agent.results')` → agent-results-handler.js
- REST: `/app/api/agent-executions/` + `/app/api/artifacts/[id]/download/route.ts`
- Resources: `mcp://artifacts/{id}` via simple-resource-manager.js

### Artifact Types (policy-driven by `agentArtifactPolicy.ts`, Apr 2026)
- **result.json**: Machine-readable metadata for non-PIPELINE tasks. Top-level keys: `taskId`, `taskTitle`, `agentRole`, `generatedAt`, `modelUsed`, `finalResponse` (pure LLM prose — no tool dumps as of `d652a630`), `confidenceScore`, optional `executionDegradation`/`errorCategory`, optional `protocolValidation`, optional `resolvedMode`/`resolvedReasonCode`, optional `templateScopeMismatch`, `qualityMetrics`, `executionTime`, `tokensUsed`, `mcpToolsProvided`, `toolCalls`, `toolLoop`. Created for ALL non-PIPELINE successful executions.
- **pipeline-index.json**: Machine-readable record for PIPELINE harness tasks ONLY. Same key set as result.json plus `protocolValidation` (LLM-detected mode if validator ran) and authoritative `resolvedMode`/`resolvedReasonCode` (pre-execution from `harnessModeResolver.ts`). Created INSTEAD OF result.json for `task.type === 'PIPELINE'`.
- **report.md**: Customer-facing deliverable for LEAF non-PIPELINE tasks ONLY (zero downstream dependents). Content equals `finalResponse` verbatim — no `## Generated Content` wrapper, no metadata headings. Whatever the agent wrote as its last assistant message IS report.md.
- **error.json**: Created on execution failure inside the same `$transaction` that sets execution status to FAILED. Single artifact, all paths.
- ~~**raw_response.txt**~~: Removed Feb 2026 (duplicated LLM response in report.md). Legacy rows render fine; consumers are type-based.

### Per-execution artifact count
- PIPELINE (harness): **1 artifact** (`pipeline-index.json`)
- Leaf non-PIPELINE (zero dependents): **2 artifacts** (`result.json` + `report.md`)
- Intermediate non-PIPELINE (1+ dependents): **1 artifact** (`result.json` only)
- Failed execution (any type): **1 artifact** (`error.json`)

### Performance Analysis
- **Query Optimization**: [Current strategies]
- **Bottlenecks**: [Large artifact retrieval]
- **Improvements**: [Pagination, lazy loading]

### Security Analysis  
- **Access Control**: [Task-based permissions]
- **Validation**: [Content sanitization]
- **Vulnerabilities**: [If any found]
- **Signed URLs**: [HMAC-SHA256, expiration]
- **Rate Limiting**: [10/min per token, LRU cache]
- **Audit Logging**: [Download tracking]

## Integration Map
```
Agent Execution
    ↓
Artifact Creation (2 types)
    ↓
Database Storage (AgentArtifact)
    ↓
┌────────────────┬─────────────────┬──────────────────┐
│   API Routes   │   MCP Tools     │   MCP Resources  │
│  /api/agent    │ agent.results   │ mcp://artifacts  │
│  /results      │ embedded-server │ /executionId     │
│  /download     │                 │ ?format=options  │
└────────────────┴─────────────────┴──────────────────┘
    ↓                  ↓                   ↓
UI Display      Tool Response      Claude Desktop
                                  Resource Access
```

## Recommendations
1. [Critical - Implement artifact size limits]
2. [Important - Add cleanup/retention policy]  
3. [Important - Optimize includeOutput queries]
4. [Nice to have - Add artifact search]
5. [Nice to have - Implement caching layer]

## Test Scenarios
1. [Large artifact creation/retrieval]
2. [Concurrent artifact access]
3. [Missing artifact handling]
4. [Invalid content validation]
```


## Deliverables

1. Complete artifact lifecycle documentation with flow diagrams
2. Performance bottleneck identification with metrics
3. Security assessment for artifact access patterns
4. Optimization recommendations with implementation priority
5. Missing functionality gaps and feature proposals
6. Artifact retention and cleanup strategy
7. MCP resource implementation documentation
8. Format options usage guide (preview/full/metadata/download)
9. Security implementation details (signed URLs, rate limiting)
10. Cross-platform compatibility notes
11. Resource discovery and caching architecture
12. Audit logging and monitoring strategy

## Success Criteria

- All artifact creation points identified with code references
- Complete understanding of storage patterns and schema
- All retrieval methods documented (API, MCP, direct)
- Usage patterns clearly mapped with frequency data
- Performance implications understood with metrics
- Security considerations noted with risk assessment
- Clear migration path for improvements identified
- MCP resource discovery fully mapped (both servers)
- Format options documented with use cases
- Security features verified (signing, rate limiting, audit)
- Cross-platform support confirmed
- Resource lifecycle and caching understood
- Cleanup strategies and intervals documented
- All 11 risk scenarios have mitigation strategies
- System health checks pass validation

## Debugging Helpers

```bash
# Quick artifact system validation
echo "=== Artifact System Debug ==="
echo "Total artifacts in DB: $(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM \"AgentArtifact\"" 2>/dev/null || echo 'DB ERROR')"
echo "Resource discovery: $(grep -B5 -A5 "discoverArtifactResources" lib/mcp/simple-resource-manager.js | grep -c "prisma" || echo 'Not found')"
echo "Format handlers: $(grep -c "case.*format" lib/mcp/embedded-server.ts || echo '0')"

# Find issues
echo -e "\n=== Potential Issues ==="
echo "Missing signing key: $([ -z "$ARTIFACT_SIGNING_KEY" ] && echo '❌ NOT SET' || echo '✅ SET')"
echo "Cleanup frequency: $(grep -o "setInterval.*[0-9]*" mcp-server-v5.js | grep -o "[0-9]*" | head -1 || echo 'Not found') ms"

# Format validation
echo -e "\n=== Format Options ==="
echo "Preview format: $(grep -c "format.*preview.*1000" --include="*.ts" --include="*.js" -r . || echo '0') implementations"
echo "Download format: $(grep -c "format.*download.*sign" --include="*.ts" -r . || echo '0') implementations"

# Resource validation
echo -e "\n=== Resource Health ==="
echo "Lazy loading: $(grep -c "lazy.*load\|on-demand" lib/mcp/simple-resource-manager.js || echo '0') references"
echo "Resource validation: $(grep -c "validateResource\|resource.*exists" --include="*.js" -r lib/mcp || echo '0') checks"
```