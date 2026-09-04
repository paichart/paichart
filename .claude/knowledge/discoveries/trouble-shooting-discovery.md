# Troubleshooting System Discovery Task

**Last Updated**: 2026-02-22 (Added pino structured logging diagnostics)
**Status**: Enhanced v5.0 - Bug Class Awareness Edition  
**Confidence**: Very High - Complete MCP debugging coverage + Universal client compatibility diagnostics
**Last Validated**: 2025-09-10 - MCP breakthrough debugging validated with 10+ tool executions across both clients

## Objective
Map and understand all debugging capabilities, diagnostic tools, testing procedures, and troubleshooting workflows in pAIchart to enable rapid issue resolution and system verification.

## Context
Effective troubleshooting is essential for maintaining system reliability and user satisfaction. pAIchart is a complex system with multiple components (database, APIs, agents, MCP servers, real-time features) that can fail in various ways. Understanding the available diagnostic tools, testing procedures, and debugging workflows enables rapid issue identification and resolution.

**Phase 2 Testing and Validation Context**: The system has validated effective troubleshooting approaches including:
- Webpack build issue identification and resolution techniques
- API testing with curl/psql for comprehensive validation
- Performance validation methodologies for database and caching systems
- Security infrastructure testing approaches for real-world scenarios
- Event-driven system testing with performance metrics validation
- Authentication system validation with security edge cases
- Database query analysis techniques for performance optimization

**Plan 6 Event System Debugging**: New diagnostic capabilities for:
- Shared connection pool monitoring and debugging
- Memory leak detection in event listeners

**🔥 MCP BREAKTHROUGH DEBUGGING (2025-09-10)**: Revolutionary diagnostic discoveries for:
- Protocol violation impact analysis (notifications/initialized → 202 Accepted)
- Manual session management when SDK callbacks fail
- Dual-mode client architecture debugging (persistent vs stateless)
- WebSocket proxy forwarding troubleshooting
- Universal client compatibility validation
- PostgreSQL NOTIFY/LISTEN troubleshooting
- Event processing latency verification (<10ms target)
- Connection exhaustion prevention

**Plan 7 Security Debugging**: Enhanced security diagnostics for:
- WebSocket auth event broadcasting issues (<25ms target)
- Security event processor threat detection
- Validation failure pattern analysis
- Audit log investigation techniques

## Discovery Scope

### 1. Database Diagnostics
- [ ] Map database connection testing procedures
- [ ] Document query debugging techniques
- [ ] Find data integrity checking methods
- [ ] Identify migration troubleshooting tools
- [ ] Map backup and recovery procedures

### 2. API Testing and Verification
- [ ] Document API endpoint testing procedures
- [ ] Map authentication debugging methods
- [ ] Find request/response validation tools
- [ ] Identify rate limiting diagnostics
- [ ] Document error handling verification

### 3. Agent System Debugging
- [ ] Map agent execution monitoring
- [ ] Document execution status tracking
- [ ] Find agent configuration verification
- [ ] Identify prompt debugging tools
- [ ] Map artifact troubleshooting

### 4. MCP Server Diagnostics
- [ ] Document MCP server health checks
- [ ] Map tool registration verification
- [ ] Find resource access debugging
- [ ] Identify connection troubleshooting
- [ ] Map server restart procedures

### 5. Authentication and Authorization
- [ ] Map JWT token debugging
- [ ] Document permission verification
- [ ] Find role assignment checking
- [ ] Identify session troubleshooting
- [ ] Map access control debugging

### 6. Real-time Features
- [ ] Document WebSocket connection testing
- [ ] Map notification system debugging
- [ ] Find event broadcasting verification
- [ ] Identify connection state tracking
- [ ] Map real-time update troubleshooting

### 7. System Health Monitoring
- [ ] Map overall system health checks
- [ ] Document performance monitoring
- [ ] Find error tracking systems
- [ ] Identify log analysis procedures
- [ ] Map alert and notification systems

### 8. Testing and Verification
- [ ] Document automated testing procedures
- [ ] Map manual testing checklists
- [ ] Find integration testing methods
- [ ] Identify regression testing tools
- [ ] Map deployment verification steps

### 9. Event System Debugging (Plan 6)
- [ ] Monitor shared connection pool status
- [ ] Check event listener counts for memory leaks
- [ ] Test PostgreSQL NOTIFY/LISTEN functionality
- [ ] Verify event processing latency (<10ms)
- [ ] Debug connection exhaustion issues

### 10. Security Event Debugging (Plan 7)
- [ ] Monitor WebSocket auth event broadcasting

### 11. Bug Class Regression Detection (Feb 2026)
- [ ] **Transport Boundary Coercion (ERADICATED)**: Verify no new unguarded `callTool` sites
- [ ] **Prisma Json Ambiguity (IDENTIFIED)**: Check for new unsafe casts on Json columns
- [ ] **Form Type Loss (MONITORED)**: Check for new unguarded numeric form fields
- [ ] **Express Body Parser (ERADICATED)**: Verify all Docker services pass `req.body`

```bash
# Bug Class 1: New callTool sites without ensureObject
# NOTE: grep --include does NOT brace-expand, so the old '*.{js,ts}' glob matched
# nothing (count always 0, threshold meaningless). Use two --include flags.
# Bug Class 1 is the INBOUND transport-boundary dispatch; the guard is `ensureObject`.
# The callTool count below is OUTBOUND (us calling other servers) and is NOT the bug
# class — verify the inbound guard is present instead (expect >0; 28 as of 2026-06-17).
echo "=== Bug Class 1: Transport Boundary Coercion ==="
guard=$(grep -rn 'ensureObject' lib/mcp/ --include='*.js' --include='*.ts' | grep -v node_modules | wc -l)
echo "Inbound ensureObject guard sites: $guard (expect >0; 0 = REGRESSION)"
outbound=$(grep -rn '\.callTool(' --include='*.js' --include='*.ts' . | grep -v node_modules | grep -v ensureObject | grep -v '.d.ts' | wc -l)
echo "Outbound callTool sites (informational, not the bug class): $outbound"
if [ "$guard" -eq 0 ]; then
  echo "⚠️ Inbound transport-boundary guard MISSING — Bug Class 1 regression!"
fi

# Bug Class 2: Unsafe casts on Json columns (TS + JS patterns)
echo -e "\n=== Bug Class 2: Prisma Json Column Ambiguity ==="
unsafe_ts=$(grep -rn 'as Record<string' --include='*.ts' lib/ app/ | grep -i 'metadata\|config\|capabilities\|context\|artifacts\|variables\|steps' | grep -v ensureObject | wc -l)
unsafe_js=$(grep -rn '\.\(metadata\|steps\|variables\|configuration\) || [{\[]' --include='*.js' lib/ | grep -v node_modules | grep -v ensureObject | grep -v 'Array\.isArray' | wc -l)
echo "Unsafe Json casts (TS): $unsafe_ts  Unsafe Json reads (JS): $unsafe_js"

# Bug Class 3: Number fields without parsing
echo -e "\n=== Bug Class 3: Form Boundary Type Loss ==="
grep -rn 'body\.\w*[Cc]ount\|body\.\w*[Aa]mount\|body\.\w*[Pp]rice\|body\.\w*[Bb]udget' --include='*.ts' app/api/ | grep -v 'parseInt\|parseFloat\|Number(\|coerce' | head -5

# Bug Class 8: Docker services without req.body
echo -e "\n=== Bug Class 8: Express Body Parser ==="
grep -rn 'handlePostMessage' services/*/src/index.ts | grep -v 'req\.body'
```

**Reference**: `/.claude/knowledge/domain/mcp/bug-class-registry.md`
**Protocol**: `/.claude/knowledge/protocols/bug-class-eradication-protocol.md`

### 12. MCP Universal Compatibility Debugging (BREAKTHROUGH - 2025-09-10)
- [x] ✅ **Protocol Compliance Validation**: Verify notifications/initialized returns 202 Accepted
- [x] ✅ **Client Detection Testing**: Validate claude-code vs Claude-User automatic routing
- [x] ✅ **Method Coverage Verification**: Test tools/list, prompts/list, resources/list all working
- [x] ✅ **Dual-Mode Architecture**: Confirm persistent + stateless modes functional
- [x] ✅ **Production Tool Execution**: Validate 10+ tool executions across both clients
- [x] ✅ **WebSocket Proxy Analysis**: Understand Claude.ai proxy forwarding behavior
- [x] ✅ **Manual Session Management**: Verify SDK callback bypass working
- [x] ✅ **Universal Compatibility**: Confirm Claude Code + Claude.ai browser both functional
- [ ] Check security event processor performance
- [ ] Analyze validation failure patterns
- [ ] Investigate audit log entries
- [ ] Debug threat detection patterns

## Key Files to Analyze

### Testing and Verification
- `/cline_docs/claude/agentTestVerification.md` - Comprehensive agent testing guide
- `/scripts/generate-test-tokens.js` - test token generation (~~generate-final-token.js~~ removed in the scripts rationalization 1c8c2c35; for an RS256 caller token use PAICHART_API_KEY from .env, auto-loaded since 2026-06-11)
- Artifact suites: `npm run test:execution-artifacts-parity` + `npm run test:artifact-viewer-multi-exec` (old test-artifact-download.js ARCHIVED, 1c8c2c35)
- `/scripts/` - Other testing and utility scripts

### Database Tools
- Database connection strings and configuration
- Migration files and procedures
- Seed data and test data setup
- Query optimization and debugging tools

### Event System Debugging (Plan 6)
- `/lib/events/shared-connection-pool.ts` - Shared connection pool monitoring
- ~~`/lib/events/memory-leak-prevention.ts`~~ — DELETED 2026-06-14 (c5dab442)
- `/lib/events/base-event-emitter.ts` - Base event system diagnostics
- `/lib/events/execution-events.ts` - Execution event troubleshooting

### Security Debugging (Plan 7)
- ~~`/lib/websocket/auth-event-broadcaster.ts`~~ + ~~`/lib/events/security-event-processor.ts`~~ — Plan-7 threat infra DELETED (315db03e / c5dab442); live threat detection = login route + audit + fail2ban
- `/lib/validation/mcp-action-validation.ts` - Action validation debugging
- Audit log queries for security investigation

### API Testing
- API route implementations with error handling
- Authentication middleware and debugging
- Request validation and error responses
- Rate limiting and security measures

### Agent System
- Agent execution engine and error handling
- Execution status tracking and monitoring
- Configuration validation procedures
- Artifact creation and retrieval testing

### MCP Integration
- `/mcp-server-v5.js` - MCP server implementation
- MCP client configuration and debugging
- Tool registration and discovery procedures
- Resource management and troubleshooting

### Monitoring and Logs
- Log files and locations
- Error tracking and reporting systems
- Performance monitoring tools
- Health check endpoints and procedures

## Diagnostic Commands and Procedures

### Database Diagnostics
```bash
# Database connection and health
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "\dt"

# Recent executions check
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT id, status, \"createdAt\" FROM \"AgentExecution\" ORDER BY \"createdAt\" DESC LIMIT 5;"

# Task configuration verification
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT id, title, \"agentRole\", \"executionStatus\" FROM \"Task\" WHERE \"agentRole\" IS NOT NULL;"
```

### API Testing (ENHANCED - Phase 2 Validated)
```bash
# Token generation for testing
node scripts/generate-test-tokens.js   # generate-final-token.js removed (1c8c2c35); prefer PAICHART_API_KEY from .env for RS256

# API endpoint testing
export TOKEN="$PAICHART_API_KEY"   # RS256 token auto-loaded from .env (2026-06-11); old generate-final-token.js removed
curl -X POST http://localhost:3000/api/mcp/tasks/action \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "agent.configure", "parameters": {...}}'

# PHASE 2: Performance and Security Testing
echo -e "\n=== Phase 2 Testing Approaches ==="
echo "Testing event-driven performance:"
node test-event-driven-performance.js

echo "Security validation with curl/psql:"
# Test PostgreSQL connection
PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT count(*) FROM \"AgentExecution\";"

# Test API with security headers
curl -v -X GET http://localhost:3000/api/health \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Forwarded-For: 192.168.1.1" 2>&1 | grep -E "(HTTP|Security|Cache)"

echo "WebSocket auth cache testing:"
# Test cache performance
# lib/websocket/test-auth-cache.js DELETED with lib/websocket/ (315db03e)

echo "Database query performance validation:"
# Check for N+1 patterns and performance
grep -r ">100ms" --include="*.log" . || echo "No slow queries detected"
```

### MCP Server Diagnostics
```bash
# MCP server status
claude mcp status paichart

# Resource listing
claude mcp list-resources paichart

# Server restart
claude mcp restart paichart
```

### Pattern Comparison Debugging ⭐ NEW 2025-11-02

**Purpose**: Compare current implementation against proven patterns for 4x faster debugging
**Source**: Week 6 POV validation debugging (30 min vs 2+ hours traditional)
**Evidence**: Found root cause of incomplete commit in 5 minutes

#### When to Use Pattern Comparison Method

**Trigger Situations**:
```bash
# Use this method when:
# - Validation errors persist after "fix" deployed
# - Deployment succeeds but errors unchanged
# - Multiple related errors suggest pattern issue
# - Implementation follows new pattern (not yet proven)
```

#### Pattern Comparison Commands

**Step 1: Collect Proven Patterns (10 min)**
```bash
# Review past successful implementations
echo "=== Collecting Proven Patterns from Weeks 1-6 ==="

# Find validation patterns in implementation plans
for week in {1..6}; do
  echo "=== Week $week Validation Patterns ==="
  grep -A 10 "Pattern:" cline_docs/reviews/week-$week-*/implementation-plan*.md 2>/dev/null | \
    grep -E "\.parse\(|\.safeParse\(|\.optional\(|\.nullable\(|z\.number\(|z\.string\(" | \
    head -5
done

# Extract .parse() vs .safeParse() usage
echo "=== Parse Pattern Across Weeks ==="
for week in {1..6}; do
  echo "Week $week backend:"
  grep "\.parse(" cline_docs/reviews/week-$week-*/implementation-plan*.md 2>/dev/null | head -2
done

# Extract type strictness patterns
echo "=== Type Strictness Patterns ==="
grep -rn "z\.number()\|z\.string()\.datetime()" \
  cline_docs/reviews/week-[1-5]-*/implementation-plan*.md | head -20

# Check if union + transform used in Weeks 1-5
echo "=== Union + Transform Pattern (new in Week 6?) ==="
grep -rn "z\.union.*transform" \
  cline_docs/reviews/week-[1-5]-*/implementation-plan*.md | wc -l
```

**Step 2: Compare Current Implementation (10 min)**
```bash
# Get current validation schema
echo "=== Current Implementation Schema ==="
cat lib/pov/handlers/put.ts | grep -A 100 "UpdatePOVSchema = z\.object"

# Check current patterns
echo "=== Current Pattern Usage ==="
echo ".parse() usage: $(grep "\.parse(" lib/pov/handlers/put.ts | wc -l)"
echo ".safeParse() usage: $(grep "\.safeParse(" lib/pov/handlers/put.ts | wc -l)"
echo "Union types: $(grep "z\.union" lib/pov/handlers/put.ts | wc -l)"
echo ".passthrough(): $(grep "\.passthrough()" lib/pov/handlers/put.ts | wc -l)"
echo ".strict(): $(grep "\.strict()" lib/pov/handlers/put.ts | wc -l)"

# Compare with proven patterns
echo "=== Pattern Compliance Check ==="
echo "✅ Uses .parse()? $(grep -q "\.parse(" lib/pov/handlers/put.ts && echo "YES" || echo "NO")"
echo "⚠️ Uses union+transform? $(grep -q "z\.union.*transform" lib/pov/handlers/put.ts && echo "YES (different from Week 1-5)" || echo "NO")"
echo "⚠️ Uses .passthrough()? $(grep -q "\.passthrough()" lib/pov/handlers/put.ts && echo "YES (different from Week 1-5)" || echo "NO")"
```

**Step 3: Verify Deployment (5 min)**
```bash
# Check recent commits
echo "=== Recent Validation Commits ==="
git log --oneline --grep="validation\|schema" -10

# For a specific commit, verify completeness
echo "=== Commit Verification ==="
COMMIT="18b0193"  # Replace with actual commit

# What commit message claims
echo "Commit Message:"
git show $COMMIT | head -30

# What actually changed
echo "Actual Changes:"
git show $COMMIT --stat

# Line-by-line changes
echo "Detailed Diff:"
git show $COMMIT | grep "^[+-]" | grep -v "^+++" | grep -v "^---"

# Check for incomplete commits (claims 5 fixes, shows 4 changes)
msg_fixes=$(git show $COMMIT | head -20 | grep -oE "Fixed [0-9]+ |[0-9]+ fixes" | grep -oE '[0-9]+')
diff_changes=$(git show $COMMIT | grep "^[+-]" | grep -v "^+++" | grep -v "^---" | wc -l)
echo "Claimed fixes: $msg_fixes"
echo "Actual changes: $diff_changes lines"
if [ -n "$msg_fixes" ] && [ "$diff_changes" -lt "$((msg_fixes * 2))" ]; then
  echo "⚠️ WARNING: Fewer changes than claimed! Verify completeness."
fi
```

**Step 4: Root Cause Decision Tree**
```bash
# Run through decision tree
echo "=== Debugging Decision Tree ==="

# Check 1: Git diff vs commit message
if git show $COMMIT | grep "^[+-]" | grep -q "revenue"; then
  echo "✅ Revenue fix present in commit"
else
  echo "❌ Revenue fix MISSING from commit (incomplete commit!)"
  echo "   Action: Apply missing changes"
fi

# Check 2: Pattern compliance
if grep -q "z\.union.*transform" lib/pov/handlers/put.ts; then
  echo "⚠️ Uses union+transform (different from proven Week 1-5 pattern)"
  echo "   Consider: Is this necessary or should frontend be fixed?"
fi

# Check 3: Deployment status
latest_commit=$(git log --oneline -1 | cut -d' ' -f1)
echo "Latest commit: $latest_commit"
echo "Expected commit: $COMMIT"
if [ "$latest_commit" = "$COMMIT" ]; then
  echo "✅ Commit is deployed"
else
  echo "⚠️ Different commit deployed - check deployment status"
fi
```

---

### Pino Structured Log Diagnostics (NEW - Feb 2026)
```bash
echo "=== Pino Structured Logging Diagnostics ==="

# FIRST DIAGNOSTIC STEP: Check for recent errors across ALL domains
echo "Recent errors (all domains):"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"level\":50' | jq -r '[.time, .domain, .msg] | @tsv'" 2>/dev/null | tail -20

# Error count by domain (quick health overview)
echo -e "\nErrors by domain:"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 500 --nostream | grep '\"level\":50' | jq -r '.domain' | sort | uniq -c | sort -rn" 2>/dev/null

# Targeted domain investigation
echo -e "\nAuth domain logs:"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"auth\"' | jq" 2>/dev/null | tail -20

echo -e "\nMCP domain logs:"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"mcp\"' | jq" 2>/dev/null | tail -20

echo -e "\nDB domain logs:"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"db\"' | jq" 2>/dev/null | tail -20

# Check pino logger coverage in codebase
echo -e "\nDomain logger imports in codebase:"
grep -rn "from.*lib/logger\|require.*lib/logger" lib/ app/ --include="*.ts" --include="*.js" | grep -v node_modules | wc -l

# Legacy console.log regression check.
# AUTHORITY: `npm run validate:logging` — it applies the client-side exclusions
# (lib/hooks, lib/contexts, lib/store), the allowlist (dev-query-logger, test-mappers),
# and skips comments/JSDoc. The raw grep below does NONE of that, so it OVER-COUNTS
# (39 raw hits on 2026-06-17 = 0 real violations: all client hooks, comments, JSDoc,
# or allowlisted). Use the raw grep only as a quick smell test; trust the script.
echo "Legacy console.* (raw, over-counts — see validate:logging for the real number):"
grep -rn "console\.\(log\|warn\|error\)" lib/ app/ --include="*.ts" --include="*.js" | grep -v node_modules | grep -v '.next' | wc -l
echo "Authoritative server-side violation count: run 'npm run validate:logging' (Layer 1)"

# OAuth audit log (separate system — still needed for OAuth debugging)
echo -e "\nOAuth audit log status:"
ssh <PROD_USER>@<PROD_HOST> "tail -5 /var/log/paichart/oauth-audit.log | jq '.action'" 2>/dev/null
```

**Questions to answer**:
- Are pino structured logs flowing across all 8 domains?
- Which domains have the most errors? (Points to problem areas)
- Any console.log regressions? (Server-side migration complete — should be zero)
- Is the OAuth audit log (separate from pino) still active and producing output?

### System Health Checks
```bash
# Process verification
ps aux | grep -E "(node|postgres|mcp)"

# Port usage check
netstat -tlnp | grep -E "(3000|5432)"

# Log file checking — pino JSON logs via PM2 (preferred)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 20 --nostream | jq" 2>/dev/null

# Fallback: Claude Desktop MCP log
tail -f ~/.config/Claude/logs/mcp-server-paichart.log
```

## Investigation Questions

### Critical Questions
1. **System Status**: What are the current health indicators for all system components?
2. **Error Patterns**: What are the most common failure modes and their symptoms?
3. **Diagnostic Coverage**: What diagnostic tools exist for each system component?
4. **Testing Procedures**: What automated and manual testing procedures are available?
5. **Recovery Procedures**: What are the standard recovery procedures for each failure type?

### Deep Dive Questions
6. **Error Tracking**: How are errors logged, tracked, and analyzed?
7. **Performance Monitoring**: What tools monitor system performance and health?
8. **Alert Systems**: What alerting mechanisms exist for critical failures?
9. **Debugging Tools**: What debugging tools are available for each component?
10. **Test Coverage**: How comprehensive are the testing procedures?

### Integration Questions
11. **Component Dependencies**: How do component failures cascade through the system?
12. **External Dependencies**: How do external service failures affect the system?
13. **Recovery Time**: What are the typical recovery times for different failure types?
14. **Monitoring Gaps**: What areas lack adequate monitoring or diagnostics?
15. **Testing Gaps**: What system aspects lack proper testing procedures?

### 15.1. Architectural Health Diagnostics (ENHANCED - Phase 2)
```bash
# CRITICAL: Architectural Health Check
echo "=== Split-Brain Architecture Diagnostic ==="
echo "Checking for architectural inconsistencies that commonly cause issues:"

# Authentication bypass issues
auth_bypasses=$(grep -c "auth.*fallback\|bypass.*auth\|skip.*auth" --include="*.ts" -r .)
echo "Authentication bypasses detected: $auth_bypasses"

# Service layer bypasses
service_bypasses=$(grep -c "Service.*bypass\|direct.*prisma" --include="*.ts" -r .)
echo "Service layer bypasses detected: $service_bypasses"

# Cache inconsistencies
cache_issues=$(grep -c "cache.*key.*format\|cache.*inconsist" --include="*.ts" -r .)
echo "Cache key inconsistencies detected: $cache_issues"

# PHASE 2: Security Infrastructure Health
echo -e "\n=== Phase 2 Security Infrastructure Health ==="
echo "Token blacklist system status:"
blacklist_files=$(find ./lib/websocket/security -name "*.ts" 2>/dev/null | wc -l)
echo "Security infrastructure files: $blacklist_files"

echo "Cache encryption status:"
encryption_impl=$(grep -c "AES-256-GCM\|encrypt.*token" --include="*.ts" -r . 2>/dev/null || echo "0")
echo "Encryption implementations: $encryption_impl"

echo "Security audit logging:"
audit_impl=$(grep -c "audit.*log\|security.*event" --include="*.ts" -r lib/websocket/security 2>/dev/null || echo "0")
echo "Audit implementations: $audit_impl"

# PHASE 2: Event-Driven Architecture Health
echo -e "\n=== Phase 2 Event-Driven System Health ==="
echo "PostgreSQL NOTIFY/LISTEN implementation:"
event_system_files=$(find ./lib/events -name "*.ts" 2>/dev/null | wc -l)
echo "Event system files: $event_system_files"

echo "Database triggers status:"
trigger_migrations=$(ls ./prisma/migrations/ 2>/dev/null | grep -c trigger || echo "0")
echo "Trigger migrations: $trigger_migrations"

echo "Event-driven vs polling patterns:"
event_patterns=$(grep -c "SecureExecutionEvents\|NOTIFY\|LISTEN" --include="*.ts" --include="*.js" -r . 2>/dev/null || echo "0")
polling_patterns=$(grep -c "setInterval.*poll\|poll.*interval" --include="*.ts" -r . 2>/dev/null || echo "0")
echo "Event-driven patterns: $event_patterns, Polling patterns: $polling_patterns"

# PHASE 2: Cache Performance Health
echo -e "\n=== Phase 2 Cache Performance Health ==="
echo "WebSocket auth caching status:"
auth_cache_impl=$(find ./lib/websocket -name "*auth-cache*" 2>/dev/null | wc -l)
echo "Auth cache implementations: $auth_cache_impl"

echo "Dual-layer cache patterns:"
l1_cache=$(grep -c "L1.*cache\|memory.*cache" --include="*.ts" -r . 2>/dev/null || echo "0")
l2_cache=$(grep -c "L2.*cache\|redis.*cache" --include="*.ts" -r . 2>/dev/null || echo "0")
echo "L1 cache patterns: $l1_cache, L2 cache patterns: $l2_cache"

echo "Cache invalidation patterns:"
invalidation=$(grep -c "invalidate.*cache\|cache.*invalid" --include="*.ts" -r . 2>/dev/null || echo "0")
echo "Cache invalidation implementations: $invalidation"

# Environment variable issues
echo -e "\n=== Environment Variable Health Check ==="
for var in JWT_SECRET DATABASE_URL PAICHART_API_KEY MCP_ARTIFACTS_FORCE_DOWNLOAD; do
  if [ -z "${!var}" ]; then
    echo "❌ Missing: $var"
  else
    echo "✅ Set: $var"
  fi
done

# MCP resource access health
echo -e "\n=== MCP Resource Access Health ==="
echo "Testing resource discovery and reading consistency:"
resource_list_count=$(claude mcp list-resources paichart 2>/dev/null | grep "mcp://artifacts" | wc -l)
echo "Discoverable artifacts: $resource_list_count"

# Resource access pattern health
echo -e "\n=== Resource Access Pattern Health ==="
prefixed_usage=$(grep -c "artifact-\${.*}" --include="*.ts" --include="*.js" -r .)
raw_id_usage=$(grep -c "resourceId\|params\.id" --include="*.ts" --include="*.js" -r .)
echo "Prefixed key usage: $prefixed_usage"
echo "Raw ID usage: $raw_id_usage"
if [ "$prefixed_usage" -lt "$raw_id_usage" ]; then
  echo "⚠️ Warning: More raw ID usage than prefixed - potential inconsistency"
fi

# Database connection health
echo -e "\n=== Database Architecture Health ==="
direct_db_calls=$(grep -c "prisma\." --include="*.ts" -r app/api)
service_calls=$(grep -c "Service\|Manager" --include="*.ts" -r app/api)
echo "Direct DB calls in API: $direct_db_calls"
echo "Service layer calls in API: $service_calls"
if [ "$direct_db_calls" -gt "$service_calls" ]; then
  echo "⚠️ Warning: More direct DB calls than service calls - architectural bypass detected"
fi

# Type system health
echo -e "\n=== Type System Health ==="
type_violations=$(grep -c "@ts-ignore\|@ts-expect-error" --include="*.ts" --include="*.tsx" -r .)
echo "Type violations detected: $type_violations"
if [ "$type_violations" -gt 50 ]; then
  echo "⚠️ Warning: High number of type violations - potential type system issues"
fi
```

### 14. Error Helper Pattern Diagnostics (Dec 2025)
```bash
echo "=== MCP Error Helper Pattern Diagnostics ==="

# Check error helper modules exist
echo "=== Error Helper Module Status ==="
for helper in basic/error-helpers.js advanced/error-helpers.js browser/error-helpers.js; do
  if [ -f "lib/mcp/server/tools/$helper" ]; then
    echo "✅ $helper exists"
    grep -c "Error\|throw\|module.exports" "lib/mcp/server/tools/$helper" | xargs -I{} echo "   {} error functions"
  else
    echo "❌ $helper MISSING"
  fi
done

# Check error helper integration in handlers
echo -e "\n=== Error Helper Integration Status ==="
for handler in sdk-native-basic-tools.js advanced/agent-results-handler.js advanced/task-context-handler.js; do
  file="lib/mcp/server/tools/$handler"
  if [ -f "$file" ]; then
    imports=$(grep -c "require.*error-helpers" "$file" 2>/dev/null || echo "0")
    if [ "$imports" -gt 0 ]; then
      echo "✅ $handler: uses error helpers"
    else
      echo "⚠️ $handler: NO error helper import"
    fi
  fi
done

# Verify fuzzy search helper usage
echo -e "\n=== Fuzzy Search Helper Integration ==="
fuzzy_helper="lib/mcp/server/utils/fuzzy-search-helper.js"
if [ -f "$fuzzy_helper" ]; then
  echo "✅ fuzzy-search-helper.js exists"
  usage_count=$(grep -r "fuzzy-search-helper" lib/mcp/server/tools/ --include="*.js" | wc -l)
  echo "   Used in $usage_count handler files"
else
  echo "❌ fuzzy-search-helper.js MISSING"
fi

# Check for legacy inline error patterns (should be migrated)
echo -e "\n=== Legacy Error Patterns (should be migrated) ==="
legacy_patterns=$(grep -rn "throw new Error.*not found\|throw new Error.*No .* found" lib/mcp/server/tools/ --include="*.js" | grep -v "error-helpers" | wc -l)
echo "Legacy inline 'not found' errors: $legacy_patterns"
if [ "$legacy_patterns" -gt 0 ]; then
  echo "⚠️ Consider migrating these to use error helpers"
  grep -rn "throw new Error.*not found\|throw new Error.*No .* found" lib/mcp/server/tools/ --include="*.js" | grep -v "error-helpers" | head -5
fi

# Tool schema pattern validation
echo -e "\n=== Tool Schema Pattern Validation ==="
schema_file="lib/mcp/server/config/tool-schemas.js"
if [ -f "$schema_file" ]; then
  total_tools=$(grep -c '"name":' "$schema_file")
  when_to_use=$(grep -c 'WHEN TO USE:' "$schema_file")
  see_also=$(grep -c 'SEE ALSO:' "$schema_file")
  examples=$(grep -c 'EXAMPLES:' "$schema_file")

  echo "Tool schema coverage:"
  echo "  Total tools: $total_tools"
  echo "  WHEN TO USE: $when_to_use ($(( when_to_use * 100 / total_tools ))%)"
  echo "  SEE ALSO: $see_also ($(( see_also * 100 / total_tools ))%)"
  echo "  EXAMPLES: $examples ($(( examples * 100 / total_tools ))%)"

  if [ "$when_to_use" -eq "$total_tools" ] && [ "$see_also" -eq "$total_tools" ] && [ "$examples" -eq "$total_tools" ]; then
    echo "✅ 100% pattern coverage achieved"
  else
    echo "⚠️ Pattern coverage incomplete"
  fi
fi
```

### 15. /prompt Command Troubleshooting
```bash
echo "=== Testing Prompt Commands ==="
# Test basic /prompt functionality
test_prompt_help() {
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"prompt_command","arguments":{"command":"/prompt help"}}}' | \
  node mcp-server-v5.js 2>/dev/null | grep -q '"text"' && echo "✅ /prompt help works" || echo "❌ /prompt help failed"
}

test_prompt_list() {
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"prompt_command","arguments":{"command":"/prompt list"}}}' | \
  node mcp-server-v5.js 2>/dev/null | grep -q 'Available MCP Prompts' && echo "✅ /prompt list works" || echo "❌ /prompt list failed"
}

# Run tests if server is available
if [ -f mcp-server-v5.js ]; then
  test_prompt_help
  test_prompt_list
else
  echo "❌ MCP server not found"
fi

# Debug prompt initialization
echo -e "\n=== Prompt System Initialization ==="
grep -A 5 -B 5 "PromptRegistry" mcp-server-v5.js | head -15
grep -A 5 -B 5 "promptCommandHandler" mcp-server-v5.js | head -15

# Check for prompt-related errors
echo -e "\n=== Prompt Error Detection ==="
grep -r "Error.*prompt" --include="*.log" 2>/dev/null | tail -5 || echo "No prompt errors in logs"
journalctl -u mcp-server --since "1 hour ago" 2>/dev/null | grep -i prompt | tail -5 || echo "No systemd logs available"

# Verify prompt command detection
echo -e "\n=== Command Detection Verification ==="
echo "isPromptCommand checks: $(grep -c 'isPromptCommand' mcp-server-v5.js)"
echo "handleIfPromptCommand calls: $(grep -c 'handleIfPromptCommand' mcp-server-v5.js)"
echo "Prompt command patterns: $(grep -c 'commandPattern.*prompt' lib/mcp/server/tools/prompt-command-handler.js 2>/dev/null || echo '0')"

# Test specific prompts
echo -e "\n=== Testing Specific Prompts ==="
if [ -f test-prompt-commands.js ]; then
  echo "Running prompt command tests..."
  timeout 10 node test-prompt-commands.js 2>/dev/null | grep "✅" | head -5 || echo "Test execution failed or timed out"
fi
```

## Expected Artifacts

### Diagnostic Tools Inventory
- Complete list of available diagnostic commands and procedures
- Database troubleshooting command reference
- API testing procedure documentation
- Agent system debugging guide

### Testing Procedures
- Automated testing setup and execution guide
- Manual testing checklists and procedures
- Integration testing methodology
- Regression testing procedures

### Troubleshooting Playbooks
- Common failure scenarios and resolution steps
- Component-specific troubleshooting guides
- Error message interpretation guide
- Recovery procedure documentation

### Monitoring and Alerting
- System health monitoring setup
- Error tracking and analysis procedures
- Alert configuration and management
- Performance monitoring dashboard setup

## Validation Steps

1. **Tool Verification**: Test all diagnostic commands and procedures
2. **Scenario Testing**: Verify troubleshooting procedures with real issues
3. **Recovery Testing**: Test all recovery procedures in safe environment
4. **Documentation Review**: Ensure all procedures are clearly documented
5. **Team Training**: Validate that procedures can be followed by team members

## Success Criteria

- [ ] Complete inventory of all diagnostic and testing tools
- [ ] Documented troubleshooting procedures for all major components
- [ ] Automated testing procedures for critical system functions
- [ ] Error tracking and monitoring system fully mapped
- [ ] Recovery procedures tested and validated
- [ ] Performance monitoring and alerting configured
- [ ] Team-accessible troubleshooting documentation
- [ ] Incident response procedures established

## Troubleshooting Categories

### Agent Execution Issues
- Agent not starting or hanging
- Execution status not updating
- Configuration errors
- Tool call failures
- Timeout handling

### Database Issues
- Connection failures
- Query performance problems
- Data consistency issues
- Migration problems
- Backup and recovery

### API Problems
- Authentication failures
- Request validation errors
- Rate limiting issues
- Response format problems
- Timeout handling

### MCP Integration Issues
- Server connection problems
- Tool registration failures
- Resource access issues
- Communication timeouts
- Server restart procedures

### Real-time Feature Problems
- WebSocket connection failures
- Notification delivery issues
- Event broadcasting problems
- Connection state management
- Performance degradation

## Notes

- Focus on procedures that can be executed by team members
- Ensure all diagnostic procedures are safe to run in production
- Document both immediate fixes and root cause investigation methods
- Include escalation procedures for complex issues
- Maintain procedures that work across different environments