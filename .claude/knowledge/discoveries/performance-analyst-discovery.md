# Performance Analysis Discovery Task

**Last Updated**: 2026-02-22 (Added pino structured logging for performance monitoring)
**Status**: Enhanced v2.1 - Pino logging awareness added
**Confidence**: Very High - Revolutionary performance gains documented
**Last Validated**: 2026-02-22 - Pino logging integration verified

## 🆕 2026-05-26 Session — Cache-invalidation-on-mutation (stale-read bug class)

```bash
# Server LRU caches must be invalidated on EVERY mutation, not just create. povListCache (60s) was
# invalidated on POV create but NOT delete/update → stale list "until refresh × N" (dafc46f9 fixed:
# DELETE + PUT invalidate owner+team+actor). When auditing a perf cache, check the DELETE/PUT
# siblings of the cached GET invalidate it — the speed win is moot if reads go stale.
grep -rn "new LRUCache\|invalidatePattern\|invalidatePovListCache" app/api/ lib/ --include="*.ts" | head
```

---

## Objective
Map and understand all performance-critical aspects of the pAIchart system, including database query optimization, API response times, resource usage patterns, token consumption, and execution bottlenecks.

## Context
Performance is critical for user experience and operational costs in pAIchart. The system handles complex workflows with multiple database operations, external API calls, agent executions, and real-time updates. Understanding current performance characteristics and identifying optimization opportunities is essential for maintaining system responsiveness and controlling operational costs.

**Plan 6 Event System Achievement**: Revolutionary 90% database load reduction through:
- PostgreSQL NOTIFY/LISTEN replacing polling patterns
- Shared connection pool reducing connections by 67% (3→1)
- Memory leak prevention with automated cleanup
- Event processing latency <10ms
- Zero connection pool exhaustion incidents

**Plan 7 Performance Targets**: Real-time security with minimal overhead:
- WebSocket auth event broadcasting <25ms latency
- Security event processing <50ms
- Threat detection without performance impact

## Discovery Scope

### 1. Database Performance (PHASE 1 COMPLETE ✅)
- [✅] Map slow query patterns in Prisma operations (Phase 1 Tasks 1-12)
- [✅] Identify missing or inefficient database indexes (Connection pool 3→15) 
- [✅] Document query patterns in services and handlers (99% N+1 reduction achieved)
- [✅] Find N+1 query problems in relations (Fixed in all handlers and services)
- [✅] Map database connection pool usage (Optimized with query-mappers.ts)
- [NEW] Monitor with dev-query-logger.ts (>100ms threshold detection)

### 2. API Response Times
- [ ] Profile API route response times
- [ ] Identify heavy computation endpoints
- [ ] Map data serialization bottlenecks
- [ ] Find inefficient middleware usage
- [ ] Document concurrent request handling

### 3. Agent Execution Performance
- [ ] Map agent execution timing patterns
- [ ] Identify token usage bottlenecks
- [ ] Document context assembly performance
- [ ] Find prompt processing delays
- [ ] Trace MCP tool call latency

### 4. Frontend Performance
- [ ] Profile component render times
- [ ] Identify heavy state operations
- [ ] Map data fetching inefficiencies
- [ ] Find UI update bottlenecks
- [ ] Document bundle size impacts

### 5. Resource Usage Analysis
- [ ] Monitor memory consumption patterns
- [ ] Track CPU usage during operations
- [ ] Measure disk I/O for artifacts
- [ ] Profile network usage patterns
- [ ] Document resource leaks

### 6. Token Economy Performance
- [ ] Map token consumption patterns
- [ ] Identify expensive operations
- [ ] Document context assembly costs
- [ ] Find optimization opportunities
- [ ] Track model usage efficiency

### 7. Real-time Features
- [ ] Profile WebSocket performance
- [ ] Map notification system load
- [ ] Document live update efficiency
- [ ] Find broadcasting bottlenecks
- [ ] Track connection management

### 8. Caching and Optimization
- [ ] Map current caching strategies
- [ ] Identify cache miss patterns
- [ ] Document optimization techniques
- [ ] Find memory usage patterns
- [ ] Track cleanup effectiveness

### 9. Event System Performance (Plan 6) ✅
- [✅] PostgreSQL NOTIFY/LISTEN implementation achieving 90% load reduction
- [✅] Shared connection pool reducing connections by 67%
- [✅] Memory leak prevention with 5-minute cleanup cycles
- [✅] Event processing latency maintained <10ms
- [✅] Connection pool exhaustion eliminated

### 10. Real-time Security Performance (Plan 7)
- [ ] WebSocket auth event broadcasting latency (<25ms target)
- [ ] Security event processor performance (<50ms target)
- [ ] Threat detection pattern matching efficiency
- [ ] Security validation overhead measurement
- [ ] Authentication cache performance

### 11. MCP Workflow Monitoring (Feb 2026)
- [ ] Workflow execution tracking via services(action: "workflow.list")
- [ ] Status monitoring via services(action: "workflow.status")
- [ ] Execution history and success rate analysis

### 12. Pino Structured Logging for Performance Monitoring (NEW - Feb 2026)

**Purpose**: Assess pino domain logger adoption and production log analysis for performance bottleneck detection

```bash
echo "=== PINO PERFORMANCE LOGGING ANALYSIS ==="
echo "--- Domain Logger Usage Across Codebase ---"
# ⚠️ COUNT CAVEAT (verified 2026-06-15): this `$domain\.` grep counts the
# IMPORT SITE, not actual log calls. Many domains are consumed via a `.child()`
# adapter bound to a local var (e.g. `const log = dbLogger.child({...})`), after
# which every real log call reads `log.info(...)` — INVISIBLE to this grep.
# So a LOW count here means "few direct call sites", NOT "under-adopted".
# Confirmed low-but-healthy via child adapters: apiLogger (response-sanitizer.js),
# dbLogger (serialization-retry.ts), monitorLogger (performance-monitor.js).
# To measure true adoption, also grep for `\.child(` bindings and trace the local var.
for domain in apiLogger dbLogger mcpLogger taskLogger povLogger authLogger monitorLogger complianceLogger; do
  direct=$(grep -rn "$domain\." lib/ app/ --include="*.ts" --include="*.js" 2>/dev/null | wc -l)
  child=$(grep -rn "$domain\.child(" lib/ app/ --include="*.ts" --include="*.js" 2>/dev/null | wc -l)
  echo "  $domain: $direct direct refs ($child via .child() adapter)"
done

echo -e "\n--- Performance-Related Log Context ---"
grep -rn "queryTimeMs\|durationMs\|latencyMs\|executionTime\|responseTime" lib/ app/ --include="*.ts" | head -15
echo "Structured timing context in log calls"

echo -e "\n--- Legacy console.log Remnants ---"
echo "  lib/: $(grep -rn 'console\.\(log\|warn\|error\)' lib/ --include="*.ts" --include="*.js" 2>/dev/null | wc -l) calls"
echo "  app/: $(grep -rn 'console\.\(log\|warn\|error\)' app/ --include="*.ts" 2>/dev/null | wc -l) calls"
echo "(Should be zero — all migrated to pino domain loggers)"

echo -e "\n--- Production Error Aggregation by Domain ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 500 --nostream | grep '\"level\":50' | jq -r '.domain' | sort | uniq -c | sort -rn" 2>/dev/null
echo "Error distribution across domains (high counts = performance issues)"

echo -e "\n--- Production Warning Aggregation by Domain ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 500 --nostream | grep '\"level\":40' | jq -r '.domain' | sort | uniq -c | sort -rn" 2>/dev/null
echo "Warning distribution (slow queries, timeouts, threshold breaches)"

echo -e "\n--- Production DB Slow Query Detection ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"db\"' | grep '\"level\":40' | jq '{msg: .msg, table: .table, durationMs: .durationMs}'" 2>/dev/null | tail -10

echo -e "\n--- Production API Response Times ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"api\"' | grep 'queryTimeMs' | jq '{endpoint: .endpoint, timeMs: .queryTimeMs}'" 2>/dev/null | tail -10
```

**Questions to answer**:
- Which domain loggers have the most usage? Are any under-adopted? (⚠️ a low direct-ref count ≠ under-adopted — `.child()`-adapter domains log through a local var; trace the binding before concluding)
- Are timing metrics (queryTimeMs, durationMs) being logged with structured context?
- How many console.log calls remain in lib/ and app/ that should be migrated?
- What is the error distribution across domains in production?
- Are slow queries and slow API responses being captured as warnings (level 40)?
- Can production PM2 JSON logs be used to identify performance bottlenecks?

---

## Key Files to Analyze

### Database Layer (ENHANCED - Phase 1 Optimizations)
- `/lib/services/` - Service implementations with database calls (N+1 eliminated)
- `/lib/*/handlers/` - Handler methods with query patterns (optimized in Tasks 1-6) 
- `/lib/*/prisma/` - Prisma mapper optimizations
- `/lib/database/query-mappers.ts` - **NEW**: Factory, Proxy, Strategy patterns for performance
- `/lib/database/dev-query-logger.ts` - **NEW**: Development performance monitoring
- `/prisma/schema.prisma` - Index definitions and relationships

### Event System Layer (Plan 6)
- `/lib/events/shared-connection-pool.ts` - Unified connection management achieving 67% reduction
- ~~`/lib/events/memory-leak-prevention.ts`~~ — DELETED 2026-06-14 (c5dab442, orphaned with SecurityEventProcessor)
- `/lib/events/base-event-emitter.ts` - Standardized event patterns with <10ms latency
- `/lib/events/execution-events.ts` - Execution event system replacing polling
- `/lib/events/phase-stage-events.ts` - Phase/stage updates via events

### Security Performance Layer (Plan 7)
- ~~`/lib/websocket/auth-event-broadcaster.ts`~~ + ~~`/lib/events/security-event-processor.ts`~~ — Plan-7 threat-detection infra, DELETED (315db03e / c5dab442) as dormant dead code
- `/lib/validation/input-validation-framework.ts` - Security validation overhead analysis

### API Layer
- `/app/api/` - All API route implementations
- `/middleware/` - Request processing middleware
- `/lib/auth/` - Authentication performance
- `/lib/validation/` - Input validation costs

### Agent System
- `/lib/services/agentExecutionEngine.ts` - Agent execution flow
- `/lib/services/llm/` - LLM provider performance
- `/lib/auth/token-manager.ts` - Token minting/verification overhead (old lib/services/tokenManager.ts name)
- `/mcp-server-v5.js` - MCP tool call performance

### Frontend
- `/components/` - React component performance
- `/lib/hooks/` - Custom hook efficiency
- `/lib/stores/` - State management performance
- `/lib/utils/` - Utility function costs

## Performance Metrics to Collect

### Response Times (ENHANCED - Phase 1 Baselines)
- API endpoint latency (p50, p95, p99)
- Database query execution times (baseline: 0.023ms simple, 0.053ms complex)
- Agent execution duration
- UI render times
- **NEW**: N+1 query elimination success rate (achieved: 99% reduction)
- **NEW**: Connection pool optimization impact (3→15 connections)

### Resource Consumption
- Memory usage patterns
- CPU utilization during operations
- Network I/O for external calls
- Disk usage for artifacts

### Throughput Metrics
- Requests per second handling
- Concurrent user capacity
- Agent execution concurrency
- Real-time message throughput

### Cost Metrics
- Token usage per operation
- Model invocation costs
- Infrastructure resource costs
- Optimization ROI calculations

## Investigation Questions

### Critical Questions
1. **Bottleneck Identification**: What are the 3 slowest operations in the system?
2. **Resource Usage**: Which operations consume the most memory/CPU/tokens?
3. **Database Performance**: What queries take longest and why?
4. **Frontend Performance**: What components cause the most render delays?
5. **Token Efficiency**: Where can we reduce token usage without quality loss?

### Deep Dive Questions
6. **Scaling Limits**: At what point do we hit performance walls?
7. **Caching Effectiveness**: How well do our caches work?
8. **Concurrent Load**: How does performance degrade under load?
9. **Optimization Opportunities**: What's the highest-impact optimization?
10. **Monitoring Gaps**: What performance metrics are we missing?

### Integration Questions
11. **External Dependencies**: How do third-party services affect performance?
12. **Real-time Performance**: How efficient are WebSocket operations?
13. **Agent Performance**: What affects agent execution speed most?
14. **Database Scaling**: How well do we handle growing data?
15. **Frontend Bundle**: How does bundle size affect load times?

### 15.1. Performance Split-Brain Architecture Detection
```bash
# CRITICAL: Performance Dual-Path Analysis
echo "=== Performance Split-Brain Detection ==="
echo "Cache duplicate patterns:"
grep -r "cache.*duplicate\|cache.*redundant\|dual.*cache" --include="*.ts" -B 2 -A 2 | head -10

echo "Query dual execution paths:"
grep -r "query.*dual.*path\|slow.*path\|fast.*path.*alternative" --include="*.ts" -B 3 -A 3 | head -10

echo "Performance bypass patterns:"
grep -r "performance.*skip\|optimize.*bypass\|cache.*ignore" --include="*.ts" -B 2 -A 2 | head -5

# Cache Consistency Performance Issues
echo -e "\n=== Cache Performance Inconsistencies ==="
echo "Cache hit vs miss performance:"
grep -r "cache\.set.*slow\|cache\.get.*timeout\|cache.*performance" --include="*.ts" -A 3 | head -10

echo "Stale cache performance impacts:"
grep -r "cache.*stale\|cache.*expired\|cache.*invalid" --include="*.ts" | head -10

echo "Cache warming vs cold start patterns:"
grep -r "cache.*warm\|cache.*cold\|preload.*cache" --include="*.ts" -B 2 -A 2

# MCP Workflow Monitoring (Feb 2026)
echo -e "\n=== MCP Workflow Tools ==="
echo "Workflow execution tools:"
grep -n "workflow.execute\|workflow.status\|workflow.cancel\|workflow.list" lib/mcp/server/config/tool-schemas.js | head -10

echo "Workflow engine implementation:"
grep -rn "WorkflowEngine\|orchestration" lib/services/workflow/ --include="*.ts" | head -10

echo "Recommendations engine:"
grep -A 20 "recommendations.*\[\]" lib/mcp/server/tools/hub-tools-handler.js | head -25

echo "Cache efficiency metrics:"
grep -rn "discoveryCache\|healthCache\|cacheHitRate" lib/mcp/server/ --include="*.js" | head -10

# Database Access Performance Patterns  
echo -e "\n=== Database Performance Split-Brain ==="
echo "Service vs direct DB performance:"
service_calls=$(grep -r "Service.*query\|Manager.*find" --include="*.ts" | wc -l)
direct_calls=$(grep -r "prisma\." --include="*.ts" | grep -v -E "Service|Manager" | wc -l)
echo "  Service calls: $service_calls, Direct calls: $direct_calls (potential performance inconsistency)"

echo "Query optimization bypass:"
grep -r "optimize.*false\|index.*skip\|relation.*ignore" --include="*.ts" -B 2 -A 2

# Resource Loading Performance Splits
echo -e "\n=== Resource Loading Performance Analysis ==="
echo "Lazy vs eager loading inconsistencies:"
grep -r "lazy.*load\|eager.*load\|include.*relation" --include="*.ts" | head -15

echo "Streaming vs batch loading patterns:"
grep -r "stream.*data\|batch.*load\|chunk.*process" --include="*.ts" -B 2 -A 2 | head -10
```

## Expected Artifacts

### Performance Reports
- Database query analysis with timing data
- API endpoint performance profiles
- Agent execution performance metrics
- Frontend performance audit results

### Optimization Recommendations
- Specific performance improvements identified
- Cost-benefit analysis of optimizations
- Implementation priority matrix
- Resource allocation suggestions

### Technical Documentation
- Performance monitoring setup guide
- Optimization implementation plans
- Performance testing procedures
- Bottleneck resolution playbook

### Metrics and Monitoring
- Performance dashboard requirements
- Key metrics tracking setup
- Alert thresholds and conditions
- Performance regression testing

## Validation Steps

1. **Baseline Measurement**: Establish current performance baselines
2. **Load Testing**: Test performance under various load conditions  
3. **Optimization Testing**: Validate improvement impact
4. **Regression Testing**: Ensure optimizations don't break functionality
5. **Cost Analysis**: Verify token usage and infrastructure cost impacts

## Success Criteria

- [ ] Complete inventory of performance bottlenecks
- [ ] Quantified optimization opportunities with ROI estimates
- [ ] Actionable performance improvement roadmap
- [ ] Performance monitoring and alerting setup
- [ ] Cost optimization strategy for token usage
- [ ] Database query optimization recommendations
- [ ] Frontend performance improvement plan
- [ ] Infrastructure scaling recommendations

## Notes

- Focus on user-facing performance impacts first
- Consider both immediate fixes and long-term optimizations
- Balance performance gains against implementation complexity
- Prioritize optimizations by business impact
- Document performance testing procedures for future use

## Phase 1 Database Performance Optimization COMPLETE ✅

### Major Achievements Summary
```bash
# Performance optimization tasks completed
echo "=== Phase 1 Performance Results ==="
echo "Tasks 1-3: ✅ N+1 eliminated in Tasks handlers/services"
echo "Tasks 4-6: ✅ N+1 eliminated in POV handlers/services"  
echo "Tasks 7-8: ✅ N+1 eliminated in Resource Manager/Context Builder"
echo "Tasks 9-12: ✅ N+1 eliminated in Activity History/Search"
echo "Task 13: ✅ Query mappers with Factory/Proxy/Strategy patterns"
echo "Task 14: ✅ Dev query logger with >100ms detection"
echo "Task 15: ✅ Performance validation and baselines"
```

### Performance Benchmarks Established
```bash
# Baseline metrics for future comparison
echo "=== Performance Baselines ==="
echo "Simple queries: 0.023ms average"
echo "Complex queries: 0.053ms average"  
echo "N+1 reduction: 99% elimination rate"
echo "Connection pool: 3 → 15 connections optimized"
echo "Resource discovery: 80% performance improvement"
echo "Activity processing: Batch operations implemented"
```

### New Performance Infrastructure
```bash
# Files created for ongoing performance management
echo "=== New Performance Tools ==="
echo "lib/database/query-mappers.ts - Advanced optimization patterns"
echo "lib/database/dev-query-logger.ts - Development monitoring"  
echo "MinimalSelects patterns - Shared optimization utilities"
echo "Mapper factories - Type-safe performance optimization"
```

### Performance Monitoring Integration
The discovery process should now validate:
- Query mappers usage vs direct includes
- Dev query logger effectiveness (>100ms detection)
- N+1 pattern prevention in new code
- Connection pool utilization efficiency
- Performance regression detection

### Next Phase Performance Focus
Based on Phase 1 completion, Phase 2+ should focus on:
- API endpoint optimization (current scope)
- Agent execution performance (current scope)
- Frontend component optimization (current scope)
- Real-time feature performance (current scope)
- Token economy optimization (current scope)

**Status**: Database performance optimization is complete and provides baselines for all future performance work.