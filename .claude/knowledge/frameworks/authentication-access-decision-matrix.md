# Authentication Access Decision Matrix

**Purpose**: Systematic framework for deciding whether tools/functions should require authentication
**Usage**: Apply to any tool categorization or access control decision
**Based on**: Plan 11 semantic conflict learnings

## Decision Framework Structure

### Option A: Require Authentication ✅
**Decision Criteria:**
1. **Semantic Consistency** (Weight: 40%) - Tool name implies ownership or identity
2. **Data Security** (Weight: 30%) - Tool accesses personal or sensitive data  
3. **Write Operations** (Weight: 20%) - Tool modifies data or executes actions
4. **Audit Requirements** (Weight: 10%) - Operations require accountability trail

### Option B: Allow Public Access ❌  
**Decision Criteria:**
1. **Onboarding Value** (Weight: 35%) - Tool helps users explore platform
2. **Pure Read-Only** (Weight: 30%) - Tool only retrieves public information
3. **No Personal Context** (Weight: 25%) - Tool works without user identity
4. **Business Value** (Weight: 10%) - Revenue/conversion impact of public access

## Decision Process

### Step 1: Semantic Analysis
**Question**: What does the tool name/function imply about user context?

```bash
# Check for identity-requiring language
TOOL_NAME="[TOOL_NAME]"
echo "Semantic Analysis for: $TOOL_NAME"

# Identity markers
if [[ $TOOL_NAME =~ .*my_.* ]]; then echo "🚨 'MY' implies user ownership - requires identity"; fi
if [[ $TOOL_NAME =~ .*your_.* ]]; then echo "🚨 'YOUR' implies user context - requires identity"; fi  
if [[ $TOOL_NAME =~ .*user_.* ]]; then echo "🚨 'USER' implies user-specific - requires identity"; fi
if [[ $TOOL_NAME =~ .*personal_.* ]]; then echo "🚨 'PERSONAL' implies private data - requires identity"; fi

# Status/ownership patterns
if [[ $TOOL_NAME =~ get_.*_status ]]; then echo "⚠️ Status check may be user-specific - validate"; fi
if [[ $TOOL_NAME =~ list_.*_by_user ]]; then echo "🚨 User filtering - requires identity"; fi
```

**Semantic Rule**: If tool name implies ownership, identity, or personal context → **REQUIRES AUTHENTICATION**

### Step 2: Data Sensitivity Assessment  
**Question**: What type of data does this tool access?

| Data Type | Authentication Required | Rationale |
|-----------|------------------------|-----------|
| Public catalog data | ❌ No | Available to all users for exploration |
| Aggregated analytics | ❌ No | No personal information exposed |
| System status/health | ❌ No | Operational transparency beneficial |
| **Personal data** | ✅ **Yes** | Privacy and ownership protection |
| **User-specific records** | ✅ **Yes** | Data belongs to authenticated user |
| **Sensitive business data** | ✅ **Yes** | Security and compliance requirement |

### Step 3: Operation Type Classification
**Question**: What does this tool actually do?

| Operation Category | Auth Required | Examples |
|--------------------|---------------|----------|
| **Pure Read** | ✅ Yes | `services(action: "discover")`, `list_prompts`, `registry(action: "list")` |
| **Write Operations** | ✅ Yes | `registry(action: "register")`, `perform(action: "execute")` |
| **Service Execution** | ✅ Yes | `services(action: "call")`, `registry(action: "update")` |

> **Phase 3 (Jan 31, 2026)**: All 26 tools require authentication. PUBLIC_TOOLS is empty.

### Step 4: Business Value vs Security Trade-off
**Question**: What's the business impact of this access decision?

#### High Business Value for Public Access:
- ✅ Enables platform exploration without signup friction
- ✅ Demonstrates platform value to potential customers  
- ✅ Reduces abandoned onboarding flows
- ✅ Allows content marketing and demos

#### High Security Value for Protected Access:
- ✅ Protects user data privacy and ownership
- ✅ Enables proper audit trails and accountability
- ✅ Prevents data leakage and inference attacks
- ✅ Maintains compliance with data protection regulations

### Decision Framework

Apply this decision tree:

```
1. Does tool name imply ownership/identity? (my_, your_, user_specific)
   └─ YES → Require Authentication (SEMANTIC CONSISTENCY)
   └─ NO → Continue to Step 2

2. Does tool access personal/user-specific data?
   └─ YES → Require Authentication (DATA PROTECTION)  
   └─ NO → Continue to Step 3

3. Does tool modify data or execute external actions?
   └─ YES → Require Authentication (WRITE PROTECTION)
   └─ NO → Continue to Step 4

4. Is this tool valuable for unauthenticated exploration?
   └─ YES → Allow Public Access (ONBOARDING VALUE)
   └─ NO → Default to Require Authentication (SECURITY DEFAULT)
```

## Application Examples

### Plan 11 Corrections Applied

| Tool | Original Category | Semantic Analysis | Correct Category | Rationale |
|------|------------------|-------------------|------------------|-----------|
| `registry(action: "list")` | ❌ Public | "MY" requires identity | ✅ Protected | Cannot show "my" without knowing who "I" am |
| `registry(action: "register")` | ❌ Public | Creates owned data | ✅ Protected | Service ownership requires identity |
| `services(action: "discover")` | ✅ Public → AUTH | Phase 3 moved behind auth | ✅ Authenticated | All tools require auth (Phase 3) |

> **Note**: `request_company_trial` and `get_trial_status` tools were removed (Feb 2026 cleanup).

### Common Patterns

#### All Tools Authenticated (Phase 3 - Jan 31, 2026)
All 26 tools require authentication. Examples:
- `project(action: "pov.list")` - Browse project templates
- `services(action: "discover")` - Service catalog browsing
- `registry(action: "list")` - Personal service ownership (Gold Standard A)
- `perform(action: "execute")` - Modifies user data
- `registry(action: "register")` - Creates user-owned records
- `services(action: "call")` - Executes actions on behalf of user

## Integration with Quality Gates

This decision matrix is automatically applied by:

1. **semantic_gate.sh**: Enforces semantic consistency rules
2. **security_ux_gate.sh**: Validates business vs security trade-offs  
3. **cross_system_gate.sh**: Ensures no breaking changes to auth flow

## Common Mistakes to Avoid

### ❌ Plan 11 Type Errors:
- Categorizing identity-requiring functions as public
- Ignoring semantic implications of tool names
- Not considering the "MY/YOUR" language patterns
- Missing the authentication context requirement

### ✅ Best Practices:
- Apply semantic analysis first (tool name matters)
- Consider user mental models ("my" needs identity)
- Document business decisions explicitly  
- Provide clear alternative paths for onboarding

## Decision Documentation Template

When making access control decisions:

```markdown
## Tool Access Decision: [TOOL_NAME]

### Semantic Analysis:
- Tool name pattern: [analysis]
- Ownership language: [my/your/user/none]
- Identity requirement: [yes/no/unclear]

### Data Sensitivity:  
- Data type: [public/personal/sensitive]
- Privacy implications: [none/moderate/high]
- Compliance requirements: [none/GDPR/SOX/etc]

### Operation Classification:
- Read/Write: [read-only/write/execute/mixed]
- Scope: [single-record/bulk/system-wide]
- Side effects: [none/notifications/external-calls]

### Business Trade-off Analysis:
- Onboarding value if public: [high/medium/low]
- Security risk if public: [high/medium/low]  
- Alternative exploration tools: [available/limited/none]

### Final Decision: [REQUIRE AUTH / ALLOW PUBLIC]
**Rationale**: [Primary deciding factor and reasoning]
**Alternatives Considered**: [Other options evaluated]
**Mitigation**: [How risks are addressed]
```

This matrix ensures every access control decision is systematic, documented, and prevents semantic inconsistencies like those found in Plan 11.