# Event System Architecture Discovery

This discovery prompt provides comprehensive investigation of the pAIchart event-driven architecture, focusing on the revolutionary performance achievements and architectural patterns that have delivered 90% database load reduction and 67% connection reduction.

## 🆕 2026-07-16 — forward cone EXTRACTED (prisma-free) + truncation persist-tx anchor

The program-leg terminalization/escalation machinery is event-anchored on the leg's own persist tx
(no timer — VT-03). The forward-cone walk MOVED out of `task-can-never-run-persist.ts`.
```bash
grep -c "WITH RECURSIVE cone" lib/services/mark-forward-cone.ts   # EXPECT 1 — cone walk now lives HERE (shared by handleCanNeverRunTask + the R4 truncation branch + the F17 duplicate-halt fold); ORDER BY t.id = deterministic lock order (db P-DB-1, avoids concurrent-walk deadlock)
grep -c "from '@/lib/prisma'" lib/services/mark-forward-cone.ts   # EXPECT 0 — PRISMA-FREE by design (type-only @prisma/client). A value-import of a lib/prisma-importing module drags Prisma into every mock persist test → exit 1 behind a GREEN pass-count (only the process EXIT / full battery reveals it)
grep -c "TRUNCATION_STALL_TERMINALIZED" lib/services/execution-terminal-persist.ts   # EXPECT 1 — R4 Layer-2: a SYNTHESIZE persisting TRUNCATED_NO_OUTPUT + IN_PROGRESS is marked FAILED in-tx; the EXISTING post-commit maybeRetriggerPipelineHarness escalates (no new event machinery)
```
`cline_docs/reviews/{f16-frozen-cone,nonterminal-family,truncation-r4}-2026-07-16/`.

## 🆕 2026-05-27 Session — Run These Greps FIRST (SSE authz lifetime + caps)

```bash
# SSE/streaming authz is a LIFETIME concern — long-lived streams must RE-authorize (not connect-only):
grep -nE "reauthInterval|validatePOVAccess|maxAgeTimeout|sseConnCounts|checkRateLimit" "app/api/tasks/[taskId]/subscribe/route.ts"

# Any OTHER long-lived stream (NOTIFY/LISTEN consumer, llm proxy) — does it re-auth + cap + throttle?
grep -rlnE "ReadableStream|text/event-stream|setInterval" app/api --include="*.ts"

# ⚠️ GREP-GAP TRAP (re-confirmed 2026-06-15): throttling is NOT one marker. The subscribe
# route uses checkRateLimit; pov/agent/execute/stream uses agentExecutionLimiter (10/min per IP);
# llm/proxy/stream uses checkRateLimit. Grepping only "checkRateLimit" yields a FALSE "no throttle"
# on the execute stream. Always grep BOTH markers before concluding a stream is unthrottled:
grep -rnE "checkRateLimit|agentExecutionLimiter|agentOperationsLimiter" app/api/pov/agent/execute/stream/route.ts app/api/llm/proxy/stream/route.ts
# Also: execute/stream's `setInterval` is a 15s HEARTBEAT, not re-auth; and validatePOVAccess(requireWrite:true)
# makes it NON-demo-reachable. Full analysis (Finding A, deferred-tracked) lives in
# cline_docs/follow-ups/agent-execute-stream-hardening-2026-06-13.md — read it before re-flagging this route.
```

Pentest G-3 (5-min re-auth — stale window 60→5min) + G-4 (per-user conn-cap + throttle). Ref: [[prelaunch-pentest-2026-05-26]].

---

## Overview

The pAIchart platform has achieved revolutionary performance through event-driven architecture:
- **90% Database Load Reduction** via PostgreSQL NOTIFY/LISTEN patterns
- **67% Connection Reduction** through unified connection pooling  
- **Standardized Event Patterns** using base class architecture
- **Real-time Performance** with enterprise-grade reliability

## Phase 1: Event System Inventory and Performance Validation

### 1.1 Core Event Systems Discovery
```bash
# Map all event-related files
find /home/steve/copov15 -type f -name "*event*" -not -path "*/node_modules/*" | sort

# Count event references across codebase  
grep -r "event" --include="*.ts" --include="*.js" --exclude-dir=node_modules /home/steve/copov15 | wc -l

# Identify event emitter implementations
grep -r "EventEmitter" --include="*.ts" --include="*.js" --exclude-dir=node_modules /home/steve/copov15

# Map PostgreSQL NOTIFY/LISTEN usage
grep -r "NOTIFY\|LISTEN" --include="*.ts" --include="*.js" --exclude-dir=node_modules /home/steve/copov15
```

### 1.2 Performance Achievement Validation
```bash
# Validate 90% database performance gains preservation
grep -r "90.*percent\|90%" --include="*.ts" --include="*.js" --include="*.md" /home/steve/copov15

# Check connection pool efficiency 
grep -r "connection.*pool\|shared.*connection" --include="*.ts" --include="*.js" /home/steve/copov15

# Verify performance benchmarks
grep -r "performance.*gains\|database.*load.*reduction" --include="*.md" /home/steve/copov15
```

### 1.3 Event System Architecture Analysis
```bash
# Analyze event system hierarchy
ls -la /home/steve/copov15/lib/events/

# Check base class implementation
grep -r "BaseEventEmitter\|extends.*Event" --include="*.ts" /home/steve/copov15

# Map event channel usage
grep -r "execution_events\|phase_events\|stage_events\|prompt_registry" --include="*.ts" /home/steve/copov15
```

## Phase 2: Connection Management and Resource Optimization

### 2.1 Connection Pool Analysis
```bash
# Analyze shared connection pool implementation
cat /home/steve/copov15/lib/events/shared-connection-pool.ts | head -50

# Count PostgreSQL Client instantiations
grep -r "new Client\|Client.*connection" --include="*.ts" /home/steve/copov15/lib/events/

# Check connection sharing patterns
grep -r "getInstance\|singleton\|shared.*pool" --include="*.ts" /home/steve/copov15/lib/events/
```

### 2.2 Resource Management Validation
```bash
# Check for memory leak prevention patterns
grep -r "removeAllListeners\|disconnect\|cleanup" --include="*.ts" /home/steve/copov15/lib/events/

# Analyze connection lifecycle management
grep -r "gracefulDisconnect\|end.*connection\|pool.*close" --include="*.ts" /home/steve/copov15/lib/events/

# Validate error handling and reconnection
grep -r "reconnect\|handleConnectionError\|scheduleReconnect" --include="*.ts" /home/steve/copov15/lib/events/
```

## Phase 3: Event Pattern Standardization Assessment

### 3.1 Base Class Architecture Analysis
```bash
# Examine base event emitter implementation
cat /home/steve/copov15/lib/events/base-event-emitter.ts

# Check which systems use base class
grep -r "extends BaseEventEmitter" --include="*.ts" /home/steve/copov15

# Validate pattern consistency
grep -r "validateAndEmitEvent\|emitDatabaseEvent" --include="*.ts" /home/steve/copov15/lib/events/
```

### 3.2 Event Processing Pattern Analysis
```bash
# Check event validation patterns
grep -r "validateEvent\|sanitizeEventData\|eventData.*validation" --include="*.ts" /home/steve/copov15

# Analyze event emission consistency
grep -r "emit.*Event\|handleDatabaseNotification" --include="*.ts" /home/steve/copov15/lib/events/

# Map event listener management
grep -r "setMaxListeners\|listenerCount\|on.*notification" --include="*.ts" /home/steve/copov15/lib/events/
```

### 3.2b Born-ready reactor semantics — shared satisfaction predicate (NEW — 2026-07-18, gap e)

`maybeQueueIfDepFree` no longer blanket-skips tasks with deps: non-PIPELINE tasks whose deps are ALL
already satisfied queue at create/assign/update ("born-ready"), judged by the ONE shared predicate
the dep-completion scan also uses — the definition of "satisfied" (incl. the F18 PIPELINE-settledness
clause) can never drift between its consumers. Since 2026-07-24 (completion-path unification) there are
THREE: the dep-completion scan, the born-ready check, and the human completion dep-guard
(complete-task-terminally.ts via the exported hasUnsatisfiedDeps wrapper — "may a human complete this"
and "will the machine queue its dependents" share ONE predicate). Fail-closed; PIPELINE-with-deps keeps the skip (CC6).
```bash
echo "=== SHARED PREDICATE — single definition, two consumers ==="
grep -c "function unsatisfiedDepExistsSql" lib/services/taskReadyReactorService.ts   # EXPECT 1 — sole definition repo-wide (F18 clause lives INSIDE it)
grep -c "unsatisfiedDepExistsSql" lib/services/taskReadyReactorService.ts            # EXPECT 6 — def + jsdoc + column form (dep-completion scan, t.id) + param form (born-ready, ${taskId}) + the hasUnsatisfiedDeps wrapper (completion-path P1-C1, 2026-07-24); a 7th+ hit or an inline EXISTS copy = drift
grep -rn "unsatisfiedDepExistsSql" lib/ --include='*.ts' | grep -v taskReadyReactorService   # EXPECT empty — the RAW predicate is never exported/copied; external consumers use the exported hasUnsatisfiedDeps/listUnsatisfiedDeps wrappers (the completion dep-guard is the THIRD consumer)
echo "=== pin suite ==="
npm run test:reactor-race-guard   # EXPECT 45 pass — E1.1-E1.8 (shared predicate, CC6, fail-closed) + E2.1-E2.5 (task.update door, FAILED frozen-cone guard)
```
Review record: `cline_docs/reviews/born-ready-gap-e-2026-07-18/` (event-system verdicts: base 93,
delta 91 — the delta's F7 cross-stage mid-window residual is documented in
automation-loop-closure-architecture.md's born-ready row, deferred with trigger).

### 3.3 Reactor Skip Counter + reactorSource Labels (NEW — Apr 2026)
```bash
echo "=== REACTOR SKIP COUNTER ==="
# L3 introduced a shared helper that escalates P2002/duplicate-skip log
# entries from debug → info on first-per-source, every 100th, or first past
# the hour. Keeps baseline noise low while surfacing regression signal.
ls lib/services/reactor-skip-counter.ts
grep -n 'ReactorSource\|ESCALATE_EVERY\|ESCALATE_HOURLY' lib/services/reactor-skip-counter.ts

echo "--- reactorSource labels across reactor paths ---"
# Each reactor emits a distinct label so triage can grep-distinguish which
# reactor leaked. Canonical labels: 'task-ready-depfree',
# 'task-ready-depcompletion', 'pipeline-retrigger'.
# NOTE (2026-06-15): the label is the FIRST POSITIONAL arg to the log helpers,
# NOT a `reactorSource:` object key — grep the call sites, not a keyed pattern.
grep -rnE "logReactor(Duplicate|Budget|Mismatch)Skip\('" lib/services/ --include='*.ts' | grep -v 'reactor-skip-counter.ts'

echo "--- Consumers of logReactorDuplicateSkip ---"
grep -rn "logReactorDuplicateSkip(" lib/services/ --include='*.ts'
```

### 3.4 Reactor State-Space Enumeration Pattern (Apr 2026 L2 review)
```bash
echo "=== STATE-SPACE ENUMERATION PATTERN ==="
# The L2 review established a reusable rigor pattern: enumerate every cell
# of the state-space (e.g., task.executionStatus × active-agent_executions-row?)
# and verify zero misbehavior in each cell. 9-cell tables in review docs
# are exemplars — reuse the shape for state-transition correctness arguments.
grep -rn '9-cell state-space\|state-space enumeration' cline_docs/reviews/
```

### 3.4a Reactor retrigger-chain depth — generation budget (D-4 SHIPPED 2026-06-14 `148e321a`)
```bash
# Reactor wiring is co-owned here; the retrigger-chain DEPTH guard belongs to the
# harness domain. The auto-retrigger chain WAS depth-unbounded ("arbitrary reactor-chain
# depth", pipelineRetriggerReactorService.ts:281) — D-4 added Guard 8, a per-harness
# generation budget. Concurrency was already bounded (engine poller take:5); depth is
# now bounded too. Wiring note for THIS domain: the budget-exceeded skip routes through
# reactor-skip-counter.ts (logReactorBudgetSkip, ${source}:budget key, NO securityEvent —
# benign runaway-guard, mirrors logReactorDuplicateSkip). Counter monotonicity depends on
# BC67 (one active execution per harness task). Full check: harness-discovery §4.6a.
grep -n 'logReactorBudgetSkip' lib/services/reactor-skip-counter.ts | head -1
# Expect: present (the third reactor-skip kind). If absent → D-4 regressed.
```

### 3.5 Event-emitter patterns — `BaseEventEmitter` lazy-init FIXED (Finding C, 2026-06-14)
```bash
echo "=== EMITTER HIERARCHY: 2 patterns (was 3 — MemoryManagedEventEmitter deleted 2026-06-14) ==="
# HISTORY: BaseEventEmitter was once the laggard (eager init + BC34 leak) vs the
# raw-EventEmitter lazy emitters. Finding C (59235f0c, 2026-06-14) made BaseEventEmitter
# lazy too — extending it is fine again; the 3 bugs are FIXED (regression-guard below).
grep -rn "class.*extends \(BaseEventEmitter\|EventEmitter\|MemoryManagedEventEmitter\)" lib/events/ --include="*.ts"

echo "--- GOLD STANDARD: lazy init (connect()/initialize() + initPromise + BC34 handler refs) ---"
# execution-events.ts + prompt-registry-events.ts — pre-warmed in server-init
grep -n "lazy initialization\|initPromise\|_connectedHandler\|_errorHandler" lib/events/execution-events.ts lib/events/prompt-registry-events.ts
grep -n "initializeExecutionEvents\|initializePromptRegistryEvents" lib/server-init.ts

echo "--- BaseEventEmitter lazy-init + BC34 FIX (Finding C 59235f0c — regression guard) ---"
# Fixed: (1) eager init REMOVED from ctor; (2) public initialize() + initPromise guard;
# (3) BC34 leak closed — disconnect() removeListener's the pool handlers by stored ref.
grep -n "public async initialize\|private initPromise\|_connectedHandler\|removeListener('connected'" lib/events/base-event-emitter.ts
# Expect: all 4 present. Then confirm the ctor does NOT eager-connect (regression check):
grep -c "this.initializeWithSharedPool()" lib/events/base-event-emitter.ts
#   Expect: 1 (the call inside initialize() ONLY). 2 = eager init regressed in the constructor.
grep -n "getPhaseStageEventEmitter().initialize()" lib/server-init.ts   # Expect: present (pre-warm of the sole live subclass)
# Pinned by scripts/test-base-event-emitter-lazy.ts (in test:all-validation).

echo "--- Who instantiates the base-class consumers (eager-init blast radius)? ---"
# (2026-06-14) authentication-events DELETED (dormant; c5dab442), + SecurityEventProcessor
# / MemoryManagedEventEmitter deleted. So "3 patterns" above is now 2, and phase-stage-events
# is the SOLE live BaseEventEmitter subclass (POV/phase/stage path — NOT auth).
grep -rn "getPhaseStageEventEmitter" --include="*.ts" lib/ app/ | grep -v "lib/events/"
```
**Fix = Option 2** (Finding C). **Re-graded LOW 2026-06-14**: the auth-path risk is GONE after the
auth-event-subsystem deletions (`df757b44` + `c5dab442`) — `phase-stage-events` is the sole live
subclass (non-auth). Scoped in `cline_docs/follow-ups/agent-execute-stream-hardening-2026-06-13.md`.
The 3 bugs remain LATENT (getters post-startup, singletons never disconnect); the review shrinks to
**event-system-only** (auth-permissions no longer needed). NOT implemented as of 2026-06-14.

## Phase 4: Real-time Performance and Integration Points

### 4.1 Real-time Event Processing
```bash
# Check WebSocket integration with events
grep -r "WebSocket.*event\|event.*WebSocket" --include="*.ts" /home/steve/copov15

# Analyze event broadcasting patterns
grep -r "broadcast.*event\|emit.*update\|real.*time" --include="*.ts" /home/steve/copov15

# Map UI update mechanisms
grep -r "execution.*update\|phase.*change\|prompt.*registry" --include="*.ts" --include="*.tsx" /home/steve/copov15/components/
```

### 4.2 Event Security and Validation
```bash
# Security event processing: SecurityEventProcessor + authentication-events DELETED 2026-06-14
# (c5dab442 — dormant dead code, never ran in prod). LIVE security controls are elsewhere:
# app/api/auth/login/route.ts (rate-limit + anomaly), lib/auth/audit.ts (trackActivity),
# fail2ban (paichart-auth jail), refresh-token revocation.
grep -rn "recordAttempt\|checkUserRateLimit\|trackActivity" app/api/auth/login/route.ts

# Analyze event payload security
grep -r "sanitizeEventData\|validateEventSource\|security.*event" --include="*.ts" /home/steve/copov15

# Map audit logging for events
grep -r "audit.*event\|event.*audit\|securityAudit" --include="*.ts" /home/steve/copov15
```

## Phase 5: Performance Impact and Scaling Analysis

### 5.1 Database Performance Analysis
```bash
# Check performance improvement documentation
cat /home/steve/copov15/cline_docs/performance-improvement-plan6.md | grep -A 10 -B 10 "90%\|connection.*pool\|performance.*gains"

# Validate event processing efficiency
grep -r "eventCount\|processingTime\|latency\|performance" --include="*.ts" /home/steve/copov15/lib/events/

# Check connection reduction achievements
grep -r "connection.*reduction\|67.*percent\|3.*separate.*connections" --include="*.md" /home/steve/copov15
```

### 5.2 Event System Audit and Testing
```bash
# Run event system audit tool
ls -la /home/steve/copov15/scripts/event-system-audit.js

# Check for event system tests
find /home/steve/copov15 -name "*test*" -o -name "*spec*" | xargs grep -l "event\|Event" 2>/dev/null || echo "No event tests found"

# Analyze performance monitoring patterns
grep -r "getStats\|metrics\|monitoring" --include="*.ts" /home/steve/copov15/lib/events/
```

## Phase 6: Integration and Cross-System Coordination

### 6.1 MCP Integration with Events
```bash
# Check MCP server event integration  
grep -r "mcp.*event\|event.*mcp" --include="*.ts" /home/steve/copov15

# Analyze prompt registry event synchronization
cat /home/steve/copov15/lib/events/prompt-registry-events.ts | grep -A 5 -B 5 "mcp\|prompt.*registry"

# Map cross-session event coordination
grep -r "session.*event\|event.*session\|consistency" --include="*.ts" /home/steve/copov15
```

### 6.2 Event-Driven Architecture Dependencies
```bash
# Map services that depend on events
grep -r "getPhaseStageEventEmitter\|getPromptRegistryEventEmitter\|SecureExecutionEvents" --include="*.ts" /home/steve/copov15

# Check API integration with events
find /home/steve/copov15/app/api -name "*.ts" | xargs grep -l "event\|Event" 2>/dev/null

# Analyze component event subscriptions
find /home/steve/copov15/components -name "*.tsx" | xargs grep -l "event.*emit\|on.*event\|subscribe" 2>/dev/null | head -10
```

## Phase 7: Architecture Evolution and Future Scaling

### 7.1 Event System Extensibility
```bash
# Check base class extensibility patterns
grep -r "abstract.*Event\|extends.*BaseEvent" --include="*.ts" /home/steve/copov15

# Analyze new event system creation patterns
grep -r "new.*Event.*Emitter\|create.*Event" --include="*.ts" /home/steve/copov15

# Map configuration and initialization patterns
grep -r "EventConfig\|initialize.*Event\|setup.*Event" --include="*.ts" /home/steve/copov15
```

### 7.2 Performance Scaling Considerations
```bash
# Check event queue management
grep -r "queue.*event\|event.*queue\|batch.*process" --include="*.ts" /home/steve/copov15

# Analyze high-load patterns
grep -r "high.*load\|concurrent.*event\|throttle\|rate.*limit" --include="*.ts" /home/steve/copov15

# Map scalability preparation
grep -r "scaling\|scale.*event\|event.*volume" --include="*.md" --include="*.ts" /home/steve/copov15
```

## Phase 8: Pino Structured Logging for Event System Operations

### 8.1 Audit Event System Logging Adoption
```bash
# NOTE (2026-06-15): lib/events emitters use a pino CHILD adapter, not the bare
# domain loggers — e.g. execution-events.ts: `import { logger as pinoLogger }
# from '@/lib/logger'` then `this.logger = pinoLogger.child({ module: '...' })`.
# So the bare-name greps below return EMPTY despite correct pino usage. To audit
# real adoption, grep `pinoLogger.child(` + `this.logger` call sites too.
grep -rn "pinoLogger.child(\|this.logger\." --include="*.ts" /home/steve/copov15/lib/events/ | head

# Check monitorLogger usage in event system files
grep -r "monitorLogger" --include="*.ts" --include="*.js" /home/steve/copov15/lib/events/
# (security-event-processor.ts DELETED 2026-06-14 c5dab442 — was dormant dead code)

# Check dbLogger usage for PostgreSQL connection events
grep -r "dbLogger" --include="*.ts" --include="*.js" /home/steve/copov15/lib/events/

# Check apiLogger usage for event-triggered notifications
grep -r "apiLogger" --include="*.ts" --include="*.js" /home/steve/copov15/lib/events/
```

### 8.2 Detect Legacy console.log in Event System
```bash
# 2026-07-28: the naive grep that stood here was REMOVED, not fixed. It matched
# console.* inside JSDoc EXAMPLE blocks (prompt-registry-events.ts:270,272) and so
# reported 2 against an "should be zero" expectation. Its corrected successor was
# already on the next line — the file carried both, and the audit picked up the wrong
# one. Also dropped the absolute /home/steve/... path, which resolves on one machine.
grep -rn "console\." lib/events/ --include="*.ts" | grep -v " \* "   # expect 0 active (lib/websocket/ deleted 315db03e)

# Count remaining legacy vs pino usage
echo "Legacy console calls in events:"
grep -rc "console\.\(log\|error\|warn\)" --include="*.ts" --include="*.js" /home/steve/copov15/lib/events/ | grep -v ":0$"
echo "Pino logger calls in events:"
grep -rc "monitorLogger\|dbLogger\|apiLogger" --include="*.ts" --include="*.js" /home/steve/copov15/lib/events/ | grep -v ":0$"
```

### 8.3 Verify Correct pino API Usage
```bash
# Check for WRONG pino API (message-first pattern)
grep -rn "monitorLogger\.\(info\|warn\|error\|debug\)('[^']*'" --include="*.ts" --include="*.js" /home/steve/copov15/lib/events/
grep -rn "dbLogger\.\(info\|warn\|error\|debug\)('[^']*'" --include="*.ts" --include="*.js" /home/steve/copov15/lib/events/

# Check for CORRECT pino API (object-first pattern)
grep -rn "monitorLogger\.\(info\|warn\|error\|debug\)({" --include="*.ts" --include="*.js" /home/steve/copov15/lib/events/
grep -rn "dbLogger\.\(info\|warn\|error\|debug\)({" --include="*.ts" --include="*.js" /home/steve/copov15/lib/events/

# Check error serialization uses { err: error } (not { error: error })
grep -rn "{ error:" --include="*.ts" --include="*.js" /home/steve/copov15/lib/events/ | grep -v "node_modules"
grep -rn "{ err:" --include="*.ts" --include="*.js" /home/steve/copov15/lib/events/
```

### 8.4 Production Log Analysis for Event System
```bash
# Event system monitoring logs
pm2 logs paichart --lines 200 --nostream | grep '"domain":"monitor"' | jq 'select(.eventSystem != null)'

# PostgreSQL connection pool events
pm2 logs paichart --lines 200 --nostream | grep '"domain":"db"' | jq 'select(.channel != null or .poolId != null)'

# Event system errors
pm2 logs paichart --lines 500 --nostream | grep '"domain":"monitor"' | jq 'select(.level >= 50)'

# Connection pool reconnection warnings
pm2 logs paichart --lines 300 --nostream | grep '"domain":"db"' | jq 'select(.level == 40 and .reconnectAttempt != null)'
```

## Key Discovery Questions

### Performance Excellence
1. **Are the 90% database performance gains being maintained?**
2. **Is the 67% connection reduction still effective under load?**
3. **What is the current event processing latency?**
4. **Are there any performance regressions in the event systems?**

### Architecture Consistency  
1. **Are new event systems using the gold-standard lazy-init pattern?** (NOT the deprecated `BaseEventEmitter` — see §3.5 below. The base class is the laggard, not the target.)
2. **Is connection sharing working properly across all emitters?**
3. **Are event patterns consistent for error handling and recovery?**
4. **Is memory management preventing leaks in event listeners?**

### Security and Reliability
1. **Are event payloads being properly validated and sanitized?**
2. **Is the security event system functioning correctly?**
3. **Are audit trails complete for security-related events?**
4. **Is graceful degradation working during connection failures?**

### Integration and Scaling
1. **How well are events integrated with WebSocket broadcasting?**
2. **Is cross-session synchronization working reliably?**
3. **Are UI updates responsive to real-time events?**
4. **Can the event architecture scale to handle increased load?**

## Success Criteria

### Performance Maintenance
- 90% database load reduction preserved
- 67% connection reduction maintained
- <10ms average event processing latency
- Zero connection pool exhaustion incidents

### Architecture Quality
- New event systems use the gold-standard lazy-init pattern (deprecated `BaseEventEmitter` still backs 2 emitters pending Option 2 upgrade — see §3.5)
- Consistent error handling and recovery
- Proper memory management and cleanup
- Secure event validation and processing

### Reliability Metrics
- 99.9% event delivery success rate
- Sub-second real-time update propagation
- Complete audit trail for security events
- Graceful handling of database failures

## Implementation Notes

### Performance Priority
Always prioritize maintaining the revolutionary 90% database performance gains. Any changes that could impact this achievement must be carefully validated.

### Connection Efficiency
The shared connection pool architecture that achieved 67% connection reduction is critical for preventing resource exhaustion under concurrent load.

### Pattern Consistency
⚠️ **CORRECTION (2026-06-13)**: `BaseEventEmitter` was once positioned as the standard, but the discovery health-run found it is the OLDEST/buggiest pattern (eager constructor init → SCRAM footgun; no initPromise guard; BC34 shared-pool listener leak in `disconnect()`). The gold standard is the LAZY pattern used by `execution-events.ts` + `prompt-registry-events.ts` (raw EventEmitter + `connect()`/`initialize()` + initPromise guard + stored handler-ref cleanup, pre-warmed in `lib/server-init.ts`). See §3.5 below and `cline_docs/followups/agent-execute-stream-hardening-2026-06-13.md` (Option 2).

### Security Integration
Event security validation and real-time security event processing are essential for enterprise-grade reliability.

---

**Discovery Focus**: Map the current state of the revolutionary event-driven architecture, validate performance achievements, and identify optimization opportunities while preserving the proven patterns that have delivered enterprise-grade results.

**Critical Success Factor**: Maintain 90% database performance gains while ensuring scalable, secure, and consistent event processing across all systems.