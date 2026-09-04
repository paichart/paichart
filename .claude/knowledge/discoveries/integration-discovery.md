# Integration Systems Discovery

**Last Updated**: 2026-02-22
**Status**: Enhanced v3.2 - Added pino structured logging for integrations
**Confidence**: Very High - Integration patterns + Plans 6-8 enhancements
**Last Validated**: 2026-02-20 - File references verified

## Purpose
Comprehensive discovery of all integration patterns, systems, and architectures within pAIchart. Focus on external service integrations, real-time communication, API clients, webhook handlers, event-driven architectures, and cross-system communication patterns. Enhanced with Plans 6-8 security and event system improvements.

**Plan 6 Event System Context**: The system achieved revolutionary performance through:
- 90% database load reduction via PostgreSQL NOTIFY/LISTEN patterns
- 67% connection reduction through unified connection pooling
- Memory leak prevention with automated cleanup every 5 minutes
- Shared connection pool architecture (`/lib/events/shared-connection-pool.ts`)

**Plan 8 MCP Security Context**: The system implements foundational security for services:
- Service authorization with checkServiceAccess() validation
- Audit logging for SERVICE_CALL and UNAUTHORIZED_SERVICE_ACCESS events
- Public vs private service boundaries
- Rate limiting: 10/min for service calls, 100/min for discovery
- Data filtering to hide sensitive fields from public users

## Phase 1: Integration Architecture Discovery

### CRM Integration Systems
```bash
# Search for CRM-related integrations
find . -type f -name "*.ts" -o -name "*.js" | xargs grep -l -i "crm" | head -20
find . -path "*crm*" -type f | head -15

# Examine CRM configuration and settings
ls -la ./app/api/admin/crm/
find . -name "*CRM*" -type f

# Look for sync and mapping functionality  
grep -r "sync\|mapping\|integration" ./app/api/admin/crm/ --include="*.ts" --include="*.js"
```

### WebSocket Real-time Integration
```bash
# Examine WebSocket server and broadcasting
ls -la ./lib/websocket/
find . -name "*websocket*" -o -name "*ws-server*"

# Search for real-time activity broadcasting patterns
grep -r "broadcast\|activity\|websocket" ./lib/websocket/ --include="*.ts"
```

### API Client and HTTP Integration Patterns
```bash
# Find HTTP/fetch usage patterns
grep -r "fetch\|axios\|http\." ./lib/services/ --include="*.ts" | head -20
find . -name "*client*" -type f | grep -E "\.(ts|js)$" | head -15

# Look for API handler patterns
ls -la ./lib/api-handler.ts
find . -name "*handler*" -type f | grep -v node_modules | head -10
```

### MCP Integration Systems
```bash
# MCP service integration patterns
ls -la ./lib/services/mcp/
ls -la ./lib/services/llm/mcp-integration.ts

# Search for MCP client and server patterns
find . -name "*mcp*" -type f | grep -E "\.(ts|js)$" | head -15
```

### Workflow Engine Integration
```bash
# Examine workflow and handler integrations
ls -la ./lib/services/workflow/
find . -path "*workflow*" -name "*.ts" | head -10

# Look for workflow handlers
find . -path "*handlers*" -type f | head -10
```

## Phase 2: Integration Patterns Analysis

### Rate Limiting and Throttling
```bash
# Examine rate limiting patterns
find . -name "*rate-limit*" -o -name "*throttle*"
grep -r "circuit.*breaker\|breaker.*circuit" . --include="*.ts" --include="*.md"
```

### Error Handling and Retry Logic
```bash
# Search for retry patterns
grep -r "retry\|Retry\|circuit\|Circuit" ./lib/services/ --include="*.ts" | head -10

# Look for error handling in integrations
grep -r "catch\|error\|Error" ./lib/services/llm/mcp-integration.ts | head -10
```

### Event-Driven Architecture (ENHANCED - Plans 6 & 8)
```bash
# PLAN 6: Unified Event System with Connection Pooling
echo "=== Plan 6: Unified Event System ==="
echo "Shared connection pool:"
ls -la ./lib/events/shared-connection-pool.ts
grep -c "getInstance\|connection.*pool" ./lib/events/shared-connection-pool.ts 2>/dev/null || echo "0"

# memory-leak-prevention.ts DELETED 2026-06-14 (c5dab442 — orphaned with SecurityEventProcessor).
# Bounded-cache reference impls now: lib/auth/cache.ts, lib/auth/oauth/session-store.ts.

echo "PostgreSQL NOTIFY/LISTEN implementation:"
grep -r "NOTIFY\|LISTEN\|postgresql.*event" --include="*.ts" --include="*.js" | head -10

echo "Performance improvement metrics:"
grep -r "90%.*reduction\|67%.*connection" --include="*.md" --include="*.ts" | head -5

# PLAN 8: MCP Hub Service Security
echo -e "\n=== Plan 8: Service Security Integration ==="
echo "Service authorization:"
grep -r "checkServiceAccess\|services.*auth" ./lib/mcp/server/tools/ --include="*.js" | head -5

echo "Audit logging integration:"
grep -r "SERVICE_CALL\|UNAUTHORIZED_SERVICE_ACCESS" --include="*.js" --include="*.ts" | head -5

echo "Public discovery filtering:"
ls -la ./lib/mcp/server/tools/public-discovery-filter.js
grep -c "filterPublicServiceData" ./lib/mcp/server/tools/public-discovery-filter.js 2>/dev/null || echo "0"

echo "Rate limiting for services:"
grep -r "rate.*limit.*service\|10.*per.*minute" --include="*.js" | head -5

# Traditional event patterns (existing)
echo -e "\n=== Traditional Event Patterns ==="
grep -r "EventEmitter\|event\|Event" ./lib/ --include="*.ts" | head -15
find . -name "*event*" -type f | grep -E "\.(ts|js)$" | head -10
```

### Database Integration Patterns
```bash
# Examine Prisma and database integrations
grep -r "prisma\." ./lib/services/ --include="*.ts" | head -10
find . -name "*prisma*" -type f | head -5
```

## Phase 3: External Service Integration Analysis

### Third-party API Patterns
```bash
# Search for external API configurations
grep -r "api.*url\|apiUrl\|API_URL" . --include="*.ts" --include="*.env*" | head -10

# Look for authentication patterns in integrations
grep -r "api.*key\|apiKey\|API_KEY" . --include="*.ts" --include="*.env*" | head -10
```

### Browser Integration Services
```bash
# Examine browser automation integration
ls -la ./lib/services/browser/
find . -name "*browser*" -type f | grep -E "\.(ts|js)$" | head -10
```

### Template and POV Integration
```bash
# Template service integration patterns
ls -la ./lib/pov/integration/
find . -path "*integration*" -name "*template*"
```

## Phase 4: Integration Health and Monitoring

### Integration Monitoring
```bash
# Look for health check patterns
find . -name "*health*" -type f | grep -E "\.(ts|js)$"

# Search for monitoring and metrics
grep -r "monitor\|metric\|health" ./lib/services/ --include="*.ts" | head -10
```

### Integration Testing Patterns
```bash
# Find integration test files
find . -name "*test*integration*" -o -name "*integration*test*"
find . -name "*test*" -type f | grep integration
```

### Configuration Management
```bash
# Examine config patterns for integrations
find . -name "*config*" -type f | grep -E "\.(ts|js)$" | head -15
grep -r "config\|Config" ./lib/services/ --include="*.ts" | head -10
```

## Phase 5: Integration Security and Authentication

### Authentication in Integrations
```bash
# Look for auth patterns in services
grep -r "auth\|Auth\|token\|Token" ./lib/services/ --include="*.ts" | head -15

# Examine JWT and bearer token usage
grep -r "Bearer\|JWT\|jwt" ./lib/services/ --include="*.ts" | head -10
```

### API Security Patterns
```bash
# Search for API security implementations
grep -r "authorization\|Authorization" ./lib/api-handler.ts
grep -r "cors\|CORS" . --include="*.ts" | head -5

# OAuth 2.0 Enterprise Integration Analysis (Plan 9)
echo -e "\n=== OAuth 2.0 Enterprise Integration Discovery ==="
echo "OAuth provider integrations:"
ls -la ./lib/auth/oauth/

echo -e "\nOAuth API endpoint integration:"
find ./app/api/auth/oauth -name "*.ts" | head -10

echo -e "\nEnterprise provider API integration:"
grep -r "microsoftonline\|googleapis\|github.*api" --include="*.ts" | head -5

echo -e "\nOAuth workflow integration:"
grep -r "oauth.*workflow\|enterprise.*integration\|team.*sync" --include="*.ts" | head -5

echo -e "\nOAuth state and session management:"
grep -r "oauth.*state\|PKCE\|code_challenge" --include="*.ts" | head -5
```

## Phase 6: Pino Structured Logging for Integrations

### 6.1 Audit Integration Logging Adoption
```bash
# Check apiLogger usage in integration files
grep -rn "apiLogger" --include="*.ts" --include="*.js" ./lib/services/ | head -20
grep -rn "apiLogger" --include="*.ts" ./lib/api-handler.ts

# Check mcpLogger usage in MCP integration files
grep -rn "mcpLogger" --include="*.ts" --include="*.js" ./lib/services/mcp/
grep -rn "mcpLogger" --include="*.ts" --include="*.js" ./lib/services/llm/mcp-integration.ts

# Check authLogger in OAuth integration files
grep -rn "authLogger" --include="*.ts" ./lib/auth/oauth/
grep -rn "authLogger" lib/auth/oauth/auth-manager.ts | head -5   # enhanced-auth-middleware.ts DELETED dead (4c27ff28); AuthManager.createMiddleware is the auth middleware

# Check monitorLogger for integration health monitoring
grep -rn "monitorLogger" --include="*.ts" --include="*.js" ./lib/services/ | head -10
```

### 6.2 Detect Legacy console.log in Integration Files
```bash
# Find console.log in integration service files (should be zero)
grep -rn "console\.\(log\|error\|warn\|info\)" --include="*.ts" --include="*.js" ./lib/services/mcp/
grep -rn "console\.\(log\|error\|warn\|info\)" --include="*.ts" ./lib/api-handler.ts
grep -rn "console\.\(log\|error\|warn\|info\)" --include="*.ts" ./lib/auth/oauth/

# Count legacy vs pino usage across integration files
echo "Legacy console calls in services:"
grep -rc "console\.\(log\|error\|warn\)" --include="*.ts" --include="*.js" ./lib/services/ | grep -v ":0$" | head -20
echo "Pino logger calls in services:"
grep -rc "apiLogger\|mcpLogger\|authLogger\|monitorLogger" --include="*.ts" --include="*.js" ./lib/services/ | grep -v ":0$" | head -20
```

### 6.3 Verify Correct pino API Usage
```bash
# Check for WRONG pino API (message-first pattern) in integration files
grep -rn "\(apiLogger\|mcpLogger\|authLogger\)\.\(info\|warn\|error\|debug\)('[^']*'" --include="*.ts" --include="*.js" ./lib/services/ | head -10

# Check for CORRECT pino API (object-first pattern)
grep -rn "\(apiLogger\|mcpLogger\|authLogger\)\.\(info\|warn\|error\|debug\)({" --include="*.ts" --include="*.js" ./lib/services/ | head -10

# Check error serialization uses { err: error } (not { error: error })
grep -rn "{ error:" --include="*.ts" --include="*.js" ./lib/services/ | grep -v "errorCount\|errorMessage\|isError\|node_modules" | head -10
grep -rn "{ err:" --include="*.ts" --include="*.js" ./lib/services/ | head -10
```

### 6.4 Production Log Analysis for Integrations
```bash
# External API integration events
pm2 logs paichart --lines 200 --nostream | grep '"domain":"api"' | jq 'select(.service != null)'

# MCP transport and protocol events
pm2 logs paichart --lines 200 --nostream | grep '"domain":"mcp"' | jq 'select(.transport != null)'

# OAuth integration events
pm2 logs paichart --lines 200 --nostream | grep '"domain":"auth"' | jq 'select(.provider != null)'

# Integration health monitoring
pm2 logs paichart --lines 200 --nostream | grep '"domain":"monitor"' | jq 'select(.integration != null)'

# Integration errors across all domains
pm2 logs paichart --lines 500 --nostream | jq 'select(.level >= 50 and (.domain == "api" or .domain == "mcp" or .domain == "auth"))'
```

## Discovery Questions for Integration Analysis

1. **Integration Architecture**:
   - What are the main external systems integrated with pAIchart?
   - How is the CRM integration implemented and what sync patterns are used?
   - What real-time communication patterns exist (WebSocket, SSE, polling)?

2. **API Integration Patterns**:
   - What HTTP client patterns are used throughout the system?
   - How is error handling and retry logic implemented in integrations?
   - What authentication mechanisms are used for external services?

3. **Event-Driven Architecture**:
   - What event-driven patterns exist in the system?
   - How are cross-service communications handled?
   - What pub/sub or message queue patterns are implemented?

4. **Integration Health & Monitoring**:
   - How is integration health monitored?
   - What fallback mechanisms exist for failed integrations?
   - How are integration metrics collected and analyzed?

5. **Security & Compliance**:
   - How is data secured in transit between integrations?
   - What authentication/authorization patterns are used?
   - How are API keys and secrets managed in integrations?

## Success Criteria

- [ ] Comprehensive map of all integration points
- [ ] Understanding of CRM and WebSocket systems
- [ ] Documentation of API client patterns and error handling
- [ ] Analysis of MCP integration architecture
- [ ] Identification of event-driven communication patterns
- [ ] Review of integration security and monitoring
- [ ] Discovery of retry logic and circuit breaker patterns
- [ ] Assessment of workflow engine integration capabilities

This discovery will provide foundation for creating comprehensive integration-specialist expertise.