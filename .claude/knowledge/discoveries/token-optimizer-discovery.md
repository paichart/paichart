# Token Economy and Optimization Discovery Task

**Last Updated**: 2026-02-20
**Status**: Enhanced v3.1 - MCP response token optimization added
**Confidence**: Very High - Security and event system overhead documented
**Last Validated**: 2026-02-20 - MCP response optimization validated

## Objective
Perform a comprehensive discovery of the token management system to understand how token limits are enforced, usage is tracked, costs are optimized, and prompts are constructed within token constraints.

## Context
Token management is critical for cost control and execution reliability. The system standardized on DEFAULT_MAX_TOKENS = 24000 (`MCPTokenDefaults.STANDARD_AGENT_LIMIT`; 6000→8000 in a Phase-0 truncation fix, 8000→24000 in truncation-stall R1 2026-07-16; delivered to ALL template rows 2026-08-20 — the seeds' explicit pins had silently overridden it for a month, see cline_docs/reviews/maxtokens-sonnet-flip-2026-08-20/). We need to understand all token-related implementations, optimization strategies, and critical limits including the Claude Desktop MCP response limit of 25,000 tokens, rate limiting constraints, and pagination strategies for managing large responses.

**Plan 6 Event System Impact**: Event-driven architecture eliminates polling token overhead:
- 90% reduction in database-related token usage for status checks
- WebSocket events replace repeated API calls
- Shared connection pool reduces redundant tokens

**Plans 7 & 8 Security Overhead**: Security features add token costs:
- Validation schemas: ~100-200 tokens per request
- Audit logging: ~50-100 tokens per event
- Auth context: ~150-200 tokens for JWT and permissions
- Public tools use fewer tokens (no auth context)

## Discovery Scope

### 1. Token Configuration and Constants
Search for and document:
- The `DEFAULT_MAX_TOKENS` constant and its usage
- Files importing token-related constants
- Legacy token limits (1000, 2000, 4000, 5000, 25000)
- Model-specific token configurations
- Provider-specific token limits

### 2. Token Tracking and Recording
Identify:
- TokenManager service implementation
- Usage recording patterns (`recordUsage`, `TokenUsage`)
- Token calculation methods (input + output)
- Cost calculation logic
- Database storage for token metrics

### 3. Token Budget Management
Find:
- Prompt building with token awareness
- Token allocation strategies (system prompt, context, tools, response)
- Context window management
- Token estimation functions
- Budget checking before execution

### 4. Optimization Strategies
Analyze:
- Prompt compression techniques
- Context selection algorithms
- Tool prioritization based on token budget
- Caching to save tokens
- Model routing based on complexity/cost

### 5. Provider Integration
Locate:
- Anthropic SDK token handling
- OpenAI token handling
- Model-specific configurations
- Token limit enforcement per provider
- Usage response parsing

**Cost facts (WU-10, 2026-07-02)**: Fable 5 = $10/$50 per MTok (Opus 4.8 = $5/$25; Sonnet 5 = $3/$15,
intro $2/$10 through 2026-08-31; Haiku = $1/$5). **Fable refusal-fallback = silent repricing**: the
provider opts Fable into the server-side fallback beta (`capabilitiesFor().serverSideFallback` →
`fallbacks:[claude-opus-4-8]`), so a rescued refusal re-bills at OPUS rates inside the same call —
`metadata.model` reports the SERVING model (Opus on a rescue), which is the audit signal. Sonnet 5
also uses a NEW tokenizer (~30% more tokens for the same text vs Sonnet 4.6) — re-baseline any
per-token cost math, don't reuse Sonnet-4.6 counts.
```bash
grep -n "serverSideFallback\|FALLBACK_MODEL\|SERVER_SIDE_FALLBACK_BETA" lib/services/llm/model-capabilities.ts lib/services/llm/anthropic-sdk-provider.ts | head
```

**Durable token persistence + cost (Phase 1 ✅ 2026-07-02)**: token FACTS are persisted as columns on
`agent_executions` (input/output/cacheRead/cacheCreation + `modelUsed`), written at the terminal update
via the shared `buildTokenUsageColumns()` (both engine + stream paths, SUCCESS + FAILED). **Cost is
DERIVED on read, never stored** (Protocol 10) — `model-pricing.ts`, time-versioned, priced as-of
`startTime`. Analytics: `agents/summary.ts` sums real tokens + cost + `byModel[]`. Known limit: PRUNE-
ON-COMPLETE makes this a ROLLING window (Phase 2 = roll-up). Contract: `TokenUsageSummarySchema`. Tests:
`npm run test:token-usage`.
```bash
grep -n "buildTokenUsageColumns\|costForExecution\|inputTokens\|modelUsed" lib/services/execution-artifacts.ts lib/services/llm/model-pricing.ts app/api/analytics/domains/agents/summary.ts | head
grep -n "inputTokens\|cacheReadTokens\|modelUsed" prisma/schema.prisma   # the agent_executions columns
```

### 6. MCP Response Limits
Find:
- Claude Desktop 25,000 token limit handling
- Response format options (summary/detailed/raw)
- Pagination implementation for large responses
- includeOutput parameter usage
- Progressive disclosure strategies

### 7. Rate Limiting and Resource Management
Identify:
- Download rate limits (per minute/token)
- API call rate limits
- Resource discovery limits (executions/artifacts)
- Cleanup intervals and strategies
- LRU cache configurations

### 8. Event System Token Efficiency (Plan 6)
Analyze:
- Polling elimination savings
- WebSocket vs REST token comparison
- Event-driven update efficiency
- Connection pool token reduction
- Real-time vs batch processing costs

### 9. Security Validation Overhead (Plans 7 & 8)
Measure:
- Zod schema validation token costs
- Audit event generation overhead
- JWT and permission context size
- Public vs authenticated tool costs
- Validation caching opportunities

## Search Strategies

### 1. Token Constants and Configuration
```bash
# Find DEFAULT_MAX_TOKENS and usage
grep -r "DEFAULT_MAX_TOKENS" --include="*.ts" --include="*.tsx" -n
grep -r "maxTokens.*6000\|max_tokens.*6000" --include="*.ts"

# Find all token limit values
grep -r "maxTokens.*:\|max_tokens.*:" --include="*.ts" | grep -E "[0-9]+"

# Legacy token limits
grep -r "1000\|2000\|4000\|5000\|25000" --include="*.ts" | grep -i token
```

### 2. Token Manager and Usage Tracking
```bash
# TokenManager implementation
grep -r "TokenManager\|tokenManager" --include="*.ts" -l
grep -r "class TokenManager\|export.*TokenManager" --include="*.ts"

# Usage recording
grep -r "recordUsage\|recordTokenUsage" --include="*.ts" -A 3
grep -r "tokenUsage\|TokenUsage" --include="*.ts"
grep -r "inputTokens.*outputTokens" --include="*.ts" -B 2 -A 2
```

### 3. Model and Provider Configuration
```bash
# Model-specific configurations
grep -r "modelParameters\|model_parameters" --include="*.ts" -A 5
grep -r "LLMProvider\|llmProvider" --include="*.ts"

# Token configuration patterns
grep -r "config\.maxTokens\|config\.max_tokens" --include="*.ts"
grep -r "maxTokens.*\|\|.*DEFAULT_MAX_TOKENS" --include="*.ts"

# Provider token limits
grep -r "anthropic.*maxTokens\|openai.*max_tokens" --include="*.ts"
```

### 4. Token Estimation and Budget Management
```bash
# Token estimation functions
grep -r "estimateTokens\|calculateTokens\|countTokens" --include="*.ts" -B 2 -A 5
grep -r "tokenCount\|token_count" --include="*.ts"

# Token budget allocation
grep -r "tokenBudget\|token_budget" --include="*.ts"
grep -r "remainingTokens\|availableTokens" --include="*.ts"

# Context window management
grep -r "contextWindow\|context_window" --include="*.ts"
grep -r "maxContextTokens\|max_context_tokens" --include="*.ts"
```

### 5. Cost Calculation and Optimization
```bash
# Cost calculation
grep -r "calculateCost\|tokenCost\|costPerToken" --include="*.ts"
grep -r "pricing\|cost.*token" --include="*.ts"

# Token optimization strategies
grep -r "compressPrompt\|optimizePrompt" --include="*.ts"
grep -r "truncate.*token\|trim.*token" --include="*.ts"

# Caching for token savings
grep -r "cache.*token\|token.*cache" --include="*.ts"
```

### 6. Error Handling and Limits
```bash
# Token limit errors
grep -r "token.*limit.*exceeded\|max.*tokens.*exceeded" --include="*.ts" -i
grep -r "TokenLimitError\|MaxTokensError" --include="*.ts"

# Retry with reduced tokens
grep -r "retry.*token\|reduce.*token" --include="*.ts"

# Streaming token handling
grep -r "stream.*token\|token.*stream" --include="*.ts"
```

### 7. Database and Metrics
```bash
# Token usage storage
grep -r "token_usage\|tokenUsage" prisma/
grep -r "inputTokens\|outputTokens\|totalTokens" prisma/

# Usage queries
grep -r "prisma.*token\|token.*prisma" --include="*.ts"
grep -r "SUM.*token\|COUNT.*token" --include="*.ts" -i
```

### 8. MCP Response Limits and Pagination
```bash
# Claude Desktop limits
grep -r "25000\|25,000" --include="*.ts" --include="*.js" --include="*.md" | grep -i "token\|limit"
grep -r "exceeds.*maximum.*allowed.*tokens" --include="*.ts" --include="*.md"

# Response formats
grep -r "format.*summary\|format.*detailed\|format.*raw" --include="*.ts" --include="*.js"
grep -r "includeOutput.*false\|includeOutput.*true" --include="*.ts" -B 2 -A 2

# Pagination patterns
grep -r "page.*pageSize\|pagination.*limit" --include="*.ts" -B 2 -A 5
grep -r "hasMore.*totalPages\|nextPage" --include="*.ts"
```

### 9. Rate Limiting Implementation
```bash
# Rate limiter configuration
grep -r "rate.*limit\|rateLimiter\|RateLimiter" --include="*.ts" -B 3 -A 5
grep -r "downloads.*per.*minute\|calls.*per.*minute" --include="*.ts" --include="*.js"

# LRU cache settings
grep -r "LRU\|lru-cache\|LRUCache" --include="*.ts" --include="*.js" -B 2 -A 5
grep -r "cache.*size.*10000\|max.*10000" --include="*.ts"

# Resource limits
grep -r "limit.*20\|limit.*50" --include="*.js" | grep -E "execution\|artifact"
grep -r "cleanup.*interval\|5.*minute\|300000" --include="*.js" --include="*.ts"
```

### 10. Token Standardization Implementation
```bash
# Find all files updated with DEFAULT_MAX_TOKENS
grep -r "DEFAULT_MAX_TOKENS" --include="*.ts" --include="*.tsx" -l | sort
grep -r "from.*6000.*to.*DEFAULT_MAX_TOKENS" --include="*.ts" --include="*.md"

# Seed data updates
grep -r "maxTokens.*6000" prisma/seed.ts -B 2 -A 2
grep -r "npm run seed:templates" --include="*.md" --include="*.json"

# Migration patterns
grep -r "4000.*DEFAULT_MAX_TOKENS\|2000.*DEFAULT_MAX_TOKENS" --include="*.ts" -B 2 -A 2
```

### 11. System Health Validation
```bash
echo "=== Token System Health Check ==="
echo "1. DEFAULT_MAX_TOKENS defined: $(grep -c "export const DEFAULT_MAX_TOKENS" lib/services/llm/types.ts || echo '❌ MISSING')"
echo "2. STANDARD_AGENT_LIMIT is 24000: $(grep "STANDARD_AGENT_LIMIT: 24000" lib/services/llm/types.ts && echo '✅ YES' || echo '❌ NO')"  # expect 1 — DEFAULT_MAX_TOKENS = STANDARD_AGENT_LIMIT; raised 8000→24000 (R1 2026-07-16). This grep sat stale-failing for a month (found 2026-08-20) — update it WITH the constant.
echo "3. TokenManager exists: $([ -f lib/services/llm/tokenManager.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "4. Rate limiter configured: $([ -f lib/utils/rate-limiter.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"

# Usage verification
echo -e "\n=== Token Usage Verification ==="
echo "Files using DEFAULT_MAX_TOKENS: $(grep -r "DEFAULT_MAX_TOKENS" --include="*.ts" --include="*.tsx" -l | wc -l)"
echo "Legacy 25000 limits: $(grep -r "25000" --include="*.ts" | grep -i token | wc -l)"
echo "Legacy 4000 limits: $(grep -r "4000" --include="*.ts" | grep -i token | wc -l)"
echo "Legacy 2000 limits: $(grep -r "2000" --include="*.ts" | grep -i token | wc -l)"

# MCP limits check
echo -e "\n=== MCP Response Limits ==="
echo "Claude Desktop limit docs: $(grep -c "25.*000.*token" --include="*.md" -r cline_docs/ || echo '0')"
echo "Pagination support: $(grep -c "page.*pageSize" --include="*.ts" -r . || echo '0') implementations"
echo "Format options: $(grep -c "format.*summary.*detailed.*raw" --include="*.ts" --include="*.js" -r . || echo '0')"

# Rate limiting check
echo -e "\n=== Rate Limiting Configuration ==="
echo "Download rate limit: $(grep "download.*per.*minute" lib/utils/rate-limiter.ts | grep -o "[0-9]*" | head -1 || echo 'Not found')"
echo "API rate limit: $(grep "api.*per.*minute" lib/utils/rate-limiter.ts | grep -o "[0-9]*" | head -1 || echo 'Not found')"
echo "LRU cache size: $(grep "max:.*[0-9]" lib/utils/rate-limiter.ts | grep -o "[0-9]*" || echo 'Not found')"
```

## Output Format

Create a structured report with:

```markdown
# Token Economy Discovery Report

## Summary
- Files using DEFAULT_MAX_TOKENS: X
- Token tracking points: X
- Optimization implementations: X
- Provider integrations: X
- Legacy limits found: X

## Token Configuration

### Constants and Defaults
- DEFAULT_MAX_TOKENS location: `types.ts:1076` (= `MCPTokenDefaults.STANDARD_AGENT_LIMIT`, `:1035`)
- Value: 24000 (6000→8000 Phase-0, 8000→24000 R1 2026-07-16; runtime clamp is model-aware via `maxOutputTokensForModel` — Opus 128K, Sonnet/Haiku 64K)
- Usage points: [list files]
- Legacy values still in use: [if any]

### Model-Specific Limits
#### [Model Name]
- Max tokens: X
- Context window: X
- Cost per 1K tokens: $X
- Where configured: file:line

## Token Flow

### 1. Estimation Phase
- How tokens are estimated pre-execution
- Functions: [list with locations]
- Accuracy assessment

### 2. Allocation Phase
- How token budget is divided
- System prompt: X tokens
- Context: X tokens
- Tools: X tokens
- Response: X tokens

### 3. Execution Phase
- How limits are enforced
- Provider-specific handling
- Error handling for limit exceeded

### 4. Recording Phase
- How usage is captured
- Storage location
- Metrics calculated

## Optimization Implementations

### Context Management
- Selection algorithms found
- Compression techniques used
- Windowing strategies

### Prompt Optimization
- Compression methods
- Template efficiency
- Dynamic adjustment

### Cost Optimization
- Model routing logic
- Caching implementations
- Token recycling

## Risk Areas
- Hardcoded limits
- Missing estimations
- No budget checking
- Inefficient prompts

## Metrics and Monitoring
- Usage tracking implementation
- Cost calculation
- Alerts and limits
- Dashboard/reporting
```

## Special Attention Areas

1. **Edge Cases**: Near-limit behavior (5900+ tokens)
2. **Error Recovery**: What happens when limits exceeded
3. **Streaming**: Token counting during streaming
4. **Retries**: Token usage on retry attempts
5. **Caching**: Token savings from caching
6. **Claude Desktop Limit**: 25,000 token MCP response handling
7. **Rate Limiting**: Download and API call throttling
8. **Pagination**: Large response handling strategies
9. **Response Formats**: summary/detailed/raw implementations
10. **Resource Cleanup**: 5-minute intervals and impact

## Progress Tracking

Track discovery execution with visual progress indicators:

```markdown
📊 Discovery Progress: Token Economy Discovery
═════════════════════════════════════════════
Overall Progress: [░░░░░░░░░░] 0%

Section Progress:
□ Section 1: Token Constants and Configuration
□ Section 2: Token Manager and Usage Tracking
□ Section 3: Model and Provider Configuration
□ Section 4: Token Estimation and Budget Management
□ Section 5: Cost Calculation and Optimization
□ Section 6: Error Handling and Limits
□ Section 7: Database and Metrics
□ Section 8: MCP Response Limits and Pagination
□ Section 9: Rate Limiting Implementation

Current Status: 🚀 Starting Discovery
Commands: 0/84 executed
Findings: 0 critical ⚠️ | 0 warnings ⚡ | 0 info ℹ️
⏱️ Time: 0 minutes
```

### Progress Update Pattern
Update after each section completion:
```markdown
✅ Section 1: Token Constants [██████████] 100%
   Commands: 10/10 | Found: 6 models, 3 providers
🔄 Section 2: Token Manager [███░░░░░░░] 30%
   Commands: 3/12 | Analyzing usage tracking...
```

## Visual Handover Protocol

When discoveries require specialist expertise, use this handover format:

```markdown
--- DISCOVERY HANDOVER ---
Current Role: discovery-scout ✅
Discovery Progress: [██████████] 100% Complete

## Discovery Summary:
📊 **Components Found:** TokenManager, 6 models configured ✅
⚠️ **Critical Issues:** 2 budget overflow risks
🔍 **Areas Investigated:** 
   - ✅ Token limits mapped per model
   - ✅ Cost calculation validated
   - ⚠️ Budget tracking incomplete
   - ❌ Rate limiting not implemented

## Context for Specialist:
- Key Finding: TokenManager tracks usage but lacks enforcement
- Risk Area: Budget can be exceeded without hard stops
- Focus Needed: Implement rate limiting, enforce budgets

Delegating to: token-optimizer
Reason: Token optimization expertise required
Priority: Implement budget enforcement, add rate limiting

--- ACTIVATING TOKEN-OPTIMIZER ---
```

### Specialist Reception Template
```markdown
--- TOKEN-OPTIMIZER ACTIVATED ---

## Handover Acknowledged ✅
Inherited from: discovery-scout
Discovery Completeness: [██████████] 100%

## Context Received:
📊 **Components:** TokenManager, 6 models ✅
⚠️ **Issues:** 2 budget risks acknowledged
🔍 **Focus Areas:** Budget enforcement priority

## My Specialist Analysis Starting:
[░░░░░░░░░░] 0% → Analyzing token usage patterns...
[████░░░░░░] 40% → Reviewing budget tracking...
[██████████] 100% → Analysis complete ✅

## Specialist Findings:
1. Add hard budget limits with fallbacks
2. Implement sliding window rate limiting
3. Use cheaper models for development
```

## Risk Assessment Matrix

| Risk | Severity | Likelihood | Impact | Mitigation |
|------|----------|------------|---------|------------|
| Token limit exceeded | High | Medium | Execution failure | Pre-execution validation, DEFAULT_MAX_TOKENS |
| Cost overrun | High | Low | Budget impact | TokenManager budget tracking, alerts at 80% |
| Inefficient prompts | Medium | High | Increased costs | Prompt optimization, compression strategies |
| No usage tracking | Medium | Low | No cost visibility | **Phase 1 ✅ 2026-07-02**: structured token columns on `agent_executions` (input/output/cacheRead/cacheCreation + `modelUsed`) + derived time-versioned cost (`lib/services/llm/model-pricing.ts`); analytics via `agents/summary.ts`. In-memory `TokenManager` now budget/rate-limit ONLY. Phase 2: durable roll-up before PRUNE (analytics is a rolling window today). |
| Context overflow | High | Medium | Information loss | MCPContextManager strategies |
| MCP 25K limit hit | High | Medium | Tool response fails | Pagination, includeOutput: false |
| Rate limit breach | Medium | High | Service disruption | LRU cache, per-token tracking |
| Legacy limits persist | Medium | High | Inconsistent behavior | Standardization to DEFAULT_MAX_TOKENS (24000) + seed-literal guard (test-seed-model-params-guard) |
| Resource bloat | Low | Medium | Performance degradation | 5-minute cleanup intervals |
| Cache overflow | Low | Low | Memory issues | 10K item limit, TTL expiry |

## Deliverables

1. Complete token flow diagram with decision points
2. Optimization opportunity matrix with ROI estimates
3. Cost analysis by model/task type with trends
4. Token budget recommendation guide with formulas
5. Legacy limit migration plan with risk assessment
6. Token monitoring dashboard specification
7. MCP response limit handling guide with pagination
8. Rate limiting configuration documentation
9. Response format implementation patterns
10. Token standardization impact report (18 files)
11. Resource management strategy with cleanup intervals
12. Best practices for Claude Desktop integration

## Success Criteria

- All token limits identified and documented with usage patterns
- Complete token lifecycle understood from estimation to recording
- Optimization strategies catalogued with effectiveness metrics
- Cost implications calculated per model and task type
- Monitoring capabilities assessed with gap analysis
- Migration path from legacy limits clear with timeline
- Performance impact of token management quantified
- Claude Desktop 25K limit handling strategies documented
- Rate limiting configurations mapped with thresholds
- Pagination implementation verified across all endpoints
- Response format options validated (summary/detailed/raw)
- All 18 standardization files identified and verified
- Resource cleanup intervals confirmed (5-minute cycles)
- System health checks pass with visual indicators
- All 10 risk scenarios have clear mitigation strategies

## Debugging Helpers

```bash
# Quick token system validation
echo "=== Token System Debug ==="
echo "TokenManager budget tracking: $(grep -c "budgetTracking" lib/services/llm/tokenManager.ts || echo '0') references"
echo "MCPContextManager strategies: $(grep -c "strategy.*default\|aggressive\|full" lib/services/mcp/contextManager.ts || echo '0')"
echo "Pagination implementations: $(grep -c "page.*pageSize" --include="*.ts" -r app/api || echo '0')"

# Find token issues
echo -e "\n=== Potential Token Issues ==="
echo "Hardcoded 25000: $(grep -r "25000" --include="*.ts" --include="*.tsx" | grep -v "DEFAULT_MAX_TOKENS" | wc -l)"
echo "Hardcoded 4000: $(grep -r "4000" --include="*.ts" --include="*.tsx" | grep -v "DEFAULT_MAX_TOKENS" | wc -l)"
echo "Missing DEFAULT_MAX_TOKENS: $(grep -r "maxTokens" --include="*.ts" | grep -v "DEFAULT_MAX_TOKENS" | wc -l)"

# MCP response validation
echo -e "\n=== MCP Response Management ==="
echo "includeOutput params: $(grep -c "includeOutput" --include="*.ts" -r app/api/mcp || echo '0')"
echo "Format handlers: $(grep -c "format.*summary\|format.*detailed" --include="*.ts" --include="*.js" -r . || echo '0')"
echo "25K limit handlers: $(grep -c "25000.*token\|25,000.*token" --include="*.md" -r . || echo '0')"

# Rate limit validation
echo -e "\n=== Rate Limiting Health ==="
echo "Rate limiter instances: $(grep -c "new RateLimiter\|rateLimiter =" --include="*.ts" -r . || echo '0')"
echo "LRU cache configs: $(grep -c "LRUCache.*max" --include="*.ts" --include="*.js" -r . || echo '0')"
echo "Cleanup intervals: $(grep -c "setInterval.*300000\|5.*60.*1000" --include="*.js" --include="*.ts" -r . || echo '0')"

# MCP response token optimization (Feb 2026)
echo -e "\n=== MCP Response Token Optimization ==="
echo "evaluationResult stripping: $(grep -c "evaluationResult" lib/mcp/server/tools/public-discovery-filter.js || echo '0')"
echo "Description truncation: $(grep -c "truncateDescription" lib/mcp/server/tools/public-discovery-filter.js || echo '0')"
echo "sanitizeConfiguration: $(grep -c "sanitizeConfiguration" lib/mcp/server/tools/public-discovery-filter.js || echo '0')"
echo "Streaming log checkpoints: $(grep -c "updateExecutionLogs" app/api/pov/agent/execute/stream/route.ts || echo '0') (should be 1 call + 1 definition)"
```