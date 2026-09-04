# TODO: Document Service Response Filtering/Validation

**Created**: 2026-01-18
**Priority**: Low (Future documentation)
**Origin**: Quarterly Workflow Security Review - Fix 9 context
**Specialist**: mcp-hub-specialist, sec-ops-specialist

## Context

During the quarterly workflow security review, Fix 9 recommended validating/filtering service responses in the orchestration handler. Investigation revealed that `validateServiceResponse()` already exists in `service-call-policy.js` and is used in `workflow-tools-handler.js`.

However, this security feature is not well-documented. This TODO captures the need to document how service responses are filtered to prevent data leakage and ensure compliance.

## Current Implementation

### Location
`lib/mcp/server/config/service-call-policy.js`

### Function
```javascript
function validateServiceResponse(response) {
  // Filters sensitive data from service responses
  // Returns: { data: filteredResponse, warnings: [...] }
}
```

### Usage
`lib/mcp/server/tools/hub/workflow-tools-handler.js:426`
```javascript
// SECURITY: Filter sensitive data from response
const filteredResponse = validateServiceResponse(response);
```

## Documentation Needed

### 1. What Gets Filtered

Document the specific patterns and fields that are filtered:
- PII patterns (emails, phone numbers, SSNs)
- API keys and tokens
- Internal URLs and endpoints
- Credentials and secrets
- Other sensitive data patterns

### 2. Filter Configuration

Document how to configure filtering:
- Are patterns configurable?
- Can services opt-out of certain filters?
- How to add new filter patterns

### 3. Warning Generation

Document how warnings are generated:
- When does filtering generate a warning vs silent removal?
- How are warnings surfaced to users?
- Logging and audit trail

### 4. Integration Points

Document where filtering is applied:
- `workflow-tools-handler.js` - MCP workflow execution
- `service-call-handler.js` - Direct service calls
- Any other integration points

## Discovery Commands

```bash
# Find validateServiceResponse implementation
grep -A 50 "function validateServiceResponse" lib/mcp/server/config/service-call-policy.js

# Find all usages
grep -rn "validateServiceResponse" lib/mcp/server/

# Find filter patterns
grep -A 20 "FILTER_PATTERNS\|PII_PATTERNS\|SENSITIVE" lib/mcp/server/config/service-call-policy.js

# Check for configuration options
grep -B 5 -A 10 "filterConfig\|responseFilter" lib/mcp/server/config/
```

## Documentation Location

Add to: `/.claude/knowledge/domain/mcp/mcp-hub-integration-guide.md`

Or create new: `/.claude/knowledge/domain/mcp/service-response-security.md`

## Suggested Documentation Structure

```markdown
## Service Response Security

### Overview
How pAIchart filters and validates responses from external MCP services.

### Filtered Patterns
| Pattern Type | Example | Action |
|--------------|---------|--------|
| API Keys | `sk-...`, `api_key=...` | Redacted |
| PII | Email, Phone, SSN | Redacted |
| Internal URLs | `localhost`, `127.0.0.1` | Removed |

### Configuration
[How to configure filtering]

### Warnings
[When warnings are generated]

### Audit Trail
[How filtering is logged]
```

## Acceptance Criteria

- [ ] Document what data is filtered from service responses
- [ ] Document filter configuration options (if any)
- [ ] Document warning generation and logging
- [ ] Add section to mcp-hub-integration-guide.md or create dedicated doc
- [ ] Include discovery grep commands for future reference

## Related Files

- `lib/mcp/server/config/service-call-policy.js` - Filter implementation
- `lib/mcp/server/tools/hub/workflow-tools-handler.js` - Usage in workflows
- `lib/mcp/server/tools/hub/service-call-handler.js` - Usage in direct calls
- `/.claude/knowledge/domain/mcp/mcp-hub-integration-guide.md` - Integration docs
