# Hub Tools: Magic Parameter Analysis & Implementation Plan

**Created**: 2025-10-14
**Purpose**: Apply magic parameter pattern learnings to MCP Hub tools
**Based on**: Successful implementation for 6 core workflow tools
**Status**: Analysis complete, ready for implementation after testing core tools

---

## 🎯 Objective

Apply the magic parameter pattern to Hub tools (service discovery, health, configuration) to enable name-based lookup instead of requiring exact service IDs.

**User Experience Goal**:
```
Instead of: services(action: "health", serviceId: "cm3xyz123...")
Enable: services(action: "health", service_name: "sentry-mcp")
```

---

## 🔍 Hub Tools Inventory

**Total Hub Tools**: 7 tools

### **Service Discovery Tools** (1 tool)
1. **services(action: "discover")** - Find services by capability/category

### **Service Management Tools** (5 tools)
3. **registry(action: "register")** - Register new MCP service
4. **services(action: "health")** - Check service health/performance ⭐ CANDIDATE
5. **registry(action: "update")** - Update service configuration ⭐ CANDIDATE
6. **get_service_config** - Generate config files ⭐ CANDIDATE
7. **services(action: "call")** - Use another MCP service ⭐ CANDIDATE
8. **registry(action: "list")** - List user's services

---

## 📊 Magic Parameter Candidates

### **HIGH PRIORITY: Service Lookup** (4 tools need this)

**Current State**:
- Tools require exact `serviceId` (UUID format)
- Users must call services(action: "discover") first to get IDs
- Extra step, harder workflow

**Magic Pattern** (like pov_name, task_name):
- Accept `serviceId` OR `service_name`
- Handler performs lookup (exact → partial match)
- Helpful errors if not found

**Tools That Would Benefit**:

#### **1. services(action: "health")** 🔥 HIGH VALUE
**Current**:
```javascript
inputSchema: z.object({
  serviceId: z.string().min(1).describe("Service ID to check"),
  includeDiagnostics: z.boolean().default(false)
})
```

**With Magic**:
```javascript
inputSchema: z.object({
  serviceId: z.string().optional().describe("Service ID if known"),
  service_name: z.string().optional().describe("Service name for lookup (partial matching)"),
  includeDiagnostics: z.boolean().default(false)
}).refine(data => data.serviceId || data.service_name, {
  message: "Either serviceId or service_name is required"
})
```

**Handler Addition** (similar to project(action: "pov.details")):
```javascript
// If service_name provided, look up service
if (!finalServiceId && service_name) {
  const services = await apiClient.get('/api/mcp/services', {});

  // Try exact match
  let found = services.find(s => s.name.toLowerCase() === service_name.toLowerCase());

  // Try partial match
  if (!found) {
    found = services.find(s => s.name.toLowerCase().includes(service_name.toLowerCase()));
  }

  if (found) {
    finalServiceId = found.id;
  } else {
    const available = services.map(s => s.name);
    throw new Error(`Service not found: "${service_name}". Available: ${available.join(', ')}`);
  }
}
```

**Benefit**: `services(action: "health")(service_name: "sentry-mcp")` works directly!

---

#### **2. registry(action: "update")** 🔥 HIGH VALUE
**Current**: Requires exact serviceId
**With Magic**: Same pattern as services(action: "health")
**Benefit**: `registry(action: "update")(service_name: "sentry-mcp", updates: {...})` works!

---

#### **3. get_service_config** 🔥 MEDIUM-HIGH VALUE
**Current**:
```javascript
serviceId: z.string().min(1).describe("Service ID or name to generate config for")
```

**Already mentions "or name"!** But does handler implement it?

**Need to check**: Does this tool already have magic, or is description aspirational?

---

#### **4. services(action: "call")** 🔥 MEDIUM VALUE
**Current**:
```javascript
targetService: z.string().min(1).describe("Target service name or ID")
```

**Already mentions "name or ID"!** Likely already has magic.

**Need to check**: Handler implementation

---

## 🔧 Implementation Plan

### **Phase 1: Discovery** (10 minutes)

Read handlers for Hub tools to verify:
- [ ] Does get_service_config already support service names?
- [ ] Does services(action: "call") already support service names?
- [ ] Where are Hub tool handlers? (likely in hub-tools-handler.js)
- [ ] What does the service lookup API look like?

**Files to Read**:
- `/lib/mcp/server/tools/hub-tools-handler.js` - Hub tool handlers
- API endpoints for service management (likely /api/mcp/services)

---

### **Phase 2: Handler Implementation** (15 minutes per tool)

For tools WITHOUT magic currently:

**services(action: "health")**:
- [ ] Add service_name parameter to schema
- [ ] Add lookup logic to handler (copy from project(action: "pov.details") pattern)
- [ ] Update validation in mcp-action-validation.ts (if exists)
- [ ] Update description with magic parameter guidance

**registry(action: "update")**:
- [ ] Add service_name parameter to schema
- [ ] Add lookup logic to handler
- [ ] Update description

**Files to Modify**:
- `/lib/mcp/server/config/tool-schemas.js` - Schema updates
- `/lib/mcp/server/tools/hub-tools-handler.js` - Handler logic
- Validation files (if they exist for hub tools)

---

### **Phase 3: Schema & Elicitation Updates** (5 minutes per tool)

Update descriptions following core tools pattern:

**Template**:
```javascript
description: `[Tool purpose]

[PARAMETERS] Flexible service lookup:
• service - Service ID or name (accepts: serviceId, service_name)
  Example: service_name: 'sentry-mcp' finds service by name
  Search: exact match → partial match, case-insensitive

[WORKFLOW] Common usage:
1. By name: tool_name(service_name: 'sentry-mcp') - no ID needed!
2. OR by ID: tool_name(serviceId: '...') after services(action: "discover")

[TIP] Service names are easier than IDs. Fuzzy search finds matches automatically.`
```

---

## 📋 Detailed Checklist

### **services(action: "health")**

**Schema Changes** (`tool-schemas.js`):
- [ ] Change serviceId from required to optional
- [ ] Add service_name parameter
- [ ] Add .refine() for "one of serviceId or service_name required"
- [ ] Add transform to handle service_name → serviceId lookup

**Handler Changes** (`hub-tools-handler.js`):
- [ ] Extract service_name from args
- [ ] Add service lookup logic (if service_name provided)
- [ ] Get all services, search by name (exact → partial)
- [ ] Set finalServiceId from found service
- [ ] Helpful error with available service names

**Description Update**:
- [ ] Add [PARAMETERS] section showing flexible lookup
- [ ] Add [WORKFLOW] showing name-based usage
- [ ] Add [TIP] about fuzzy search
- [ ] Token estimate: +100 tokens

---

### **registry(action: "update")**

**Schema Changes**: Same pattern as services(action: "health")
**Handler Changes**: Same pattern as services(action: "health")
**Description Update**: Same pattern as services(action: "health")

---

### **get_service_config** ⚠️ CHECK FIRST

**Action**: Verify if magic already exists
- Description says "Service ID or name"
- Does handler actually implement name lookup?
- If YES: Just improve description
- If NO: Add handler logic

---

### **services(action: "call")** ⚠️ CHECK FIRST

**Action**: Verify if magic already exists
- Parameter is "targetService" (not serviceId)
- Description says "name or ID"
- Likely already implemented
- If YES: Just improve description
- If NO: Add handler logic

---

## 🎓 Learnings from Core Tools (Apply to Hub)

### **Learning 1: Consolidate Parameters**

**Before** (confusing):
```
• serviceId - Service ID if known
• service_name - Service name for lookup
```

**After** (simpler):
```
• service - Service ID or name (accepts: serviceId, service_name)
```

### **Learning 2: Show Examples First**

**Before**:
```
Parameters: serviceId (string)
```

**After**:
```
[PARAMETERS]
• service - Service ID or name
  Example: service_name: 'sentry-mcp'
```

### **Learning 3: Explain Fuzzy Search**

**Add to each tool**:
```
[TIP] Fuzzy search: exact match first, then partial match, case-insensitive.
If multiple matches, you'll get a list to choose from.
```

### **Learning 4: Reduce Prerequisites**

**Before**:
```
[WORKFLOW]
1. Call services(action: "discover") to get service ID
2. Call services(action: "health") with serviceId
```

**After**:
```
[WORKFLOW]
1. Call services(action: "health", service_name: 'sentry-mcp') directly!
2. OR use services(action: "discover") first for filtering/discovery
```

---

## 🚀 Expected Benefits

**If we add magic to 4 Hub tools**:

| Benefit | Impact |
|---------|--------|
| **Reduced workflow steps** | -50% (skip services(action: "discover") for known services) |
| **Natural language queries** | Users can say service names, not IDs |
| **Consistency** | Same pattern as POV/task/template tools |
| **Error reduction** | Fuzzy search finds close matches |
| **Token cost** | +400 tokens total (~$1.20/year) |

**User scenarios enabled**:
- ✅ "Check health of sentry service" → services(action: "health", service_name: "sentry")
- ✅ "Update the weather service" → registry(action: "update", service_name: "weather", ...)
- ✅ "Generate config for database service" → get_service_config(service_name: "database")
- ✅ "Call the monitoring service" → services(action: "call", targetService: "monitoring", ...)

---

## 📝 Testing Plan (Before Implementation)

**Test current core tools first**:
- [ ] Test project(action: "task.list") with pov_name filter
- [ ] Test project(action: "pov.details") with pov_title search
- [ ] Test perform(action: "execute") task.update with assignee name
- [ ] Test perform(action: "agent_results") with task_name lookup
- [ ] Verify all fuzzy searches work as expected

**If core tools work well**:
- [ ] Proceed with Hub tools implementation
- [ ] Use same patterns (proven to work)
- [ ] Estimate: 1-2 hours for 4 Hub tools

---

## 🎯 Implementation Priority

**AFTER testing core tools**:

### **Tier 1: MUST HAVE** (2 tools)
1. services(action: "health") - Most commonly used, clear UX benefit
2. registry(action: "update") - Configuration management, name-based is clearer

### **Tier 2: SHOULD HAVE** (2 tools)
3. get_service_config - Config generation, already mentions "name or ID"
4. services(action: "call") - Service routing, already mentions "name or ID"

### **Tier 3: NICE TO HAVE** (0 tools)
- services(action: "discover"): Already searches by name (capability, category filters)
- registry(action: "register"): Creates new service (no lookup needed)
- registry(action: "list"): No ID needed (user-scoped)
- registry(action: "list"): No parameters (user-scoped)

---

## 📐 Code Template (Ready to Use)

**When implementing Hub tools, use this template**:

### **Schema Addition**:
```javascript
toolName: {
  title: "...",
  description: `...

[PARAMETERS] Flexible service lookup:
• service - Service ID or name (accepts: serviceId, service_name)
  Example: service_name: 'sentry-mcp'
  ...`,

  inputSchema: z.object({
    serviceId: z.string().optional(),
    service_name: z.string().optional(),
    // ... other params
  }).refine(data => data.serviceId || data.service_name, {
    message: "Either serviceId or service_name is required"
  })
}
```

### **Handler Addition**:
```javascript
const { serviceId, service_name, ...otherParams } = args;
let finalServiceId = serviceId;

// Service name lookup
if (!finalServiceId && service_name) {
  const services = await apiClient.get('/api/mcp/services', {});

  let found = services.find(s =>
    s.name.toLowerCase() === service_name.toLowerCase()
  );

  if (!found) {
    found = services.find(s =>
      s.name.toLowerCase().includes(service_name.toLowerCase())
    );
  }

  if (found) {
    finalServiceId = found.id;
    this.logger.info(`Found service: "${found.name}" (${found.id})`);
  } else {
    const available = services.map(s => s.name);
    throw new Error(`Service not found: "${service_name}". Available: ${available.join(', ')}`);
  }
}

if (!finalServiceId) {
  throw new Error('Either serviceId or service_name is required');
}

// Continue with finalServiceId...
```

---

## 🔬 Discovery Questions (To Answer During Implementation)

**Q1**: Where are Hub tool handlers?
- File: `/lib/mcp/server/tools/hub-tools-handler.js` (found in grep)
- Need to read structure

**Q2**: What's the service list API?
- Likely: `/api/mcp/services` or `/api/mcp-tools`
- Need to verify endpoint

**Q3**: Do any Hub tools already have magic?
- get_service_config says "ID or name"
- services(action: "call") says "name or ID"
- Need to check if handlers implement it or just description

**Q4**: Service ID format?
- POV/Task use cuid (cm3abc...)
- Do services use same format or different?
- Affects validation regex

---

## 📊 Comparison: Core Tools vs Hub Tools

| Aspect | Core Tools (Done) | Hub Tools (Planned) |
|--------|-------------------|---------------------|
| **Magic Types** | 7 types (pov, task, assignee, phase, stage, team, template) | 1 type (service) |
| **Tools Affected** | 6 tools | 4 tools |
| **Complexity** | Medium (multiple parameter types) | Low (single parameter type) |
| **Handler Pattern** | Varies (some in handler, some in API) | Likely consistent (all in handler) |
| **User Benefit** | HIGH (eliminates confusion, reduces steps) | MEDIUM-HIGH (clearer service management) |
| **Estimated Effort** | 50 minutes (completed) | 30 minutes (estimated) |

---

## 🎯 Success Criteria

**After Hub tools magic implementation**:

**User can say**:
- ✅ "Check health of sentry service" → Works by name
- ✅ "Update database service settings" → Works by name
- ✅ "Get config for weather service" → Works by name
- ✅ "Call the monitoring service" → Works by name

**Technical**:
- ✅ All 4 Hub tools support serviceId OR service_name
- ✅ Fuzzy search (exact → partial)
- ✅ Helpful errors with available services
- ✅ Consistent with core tools pattern
- ✅ Descriptions updated with [PARAMETERS], [WORKFLOW], [TIP]

**Metrics**:
- ✅ Token increase: +400 tokens across 4 tools (~$1.20/year)
- ✅ Workflow reduction: Skip services(action: "discover") for known services
- ✅ Error reduction: Fuzzy search finds close matches

---

## 📝 Next Steps

**Immediate** (before implementing Hub tools):
1. ✅ Test core tools magic parameters work correctly
2. ✅ Validate user scenarios ("Show me results from Setup Email task")
3. ✅ Get user feedback on UX improvement

**Then** (Hub tools implementation):
1. Read hub-tools-handler.js to understand structure
2. Verify which tools already have magic
3. Implement missing magic (copy from core tools pattern)
4. Update descriptions (use same template)
5. Test Hub tools
6. Commit and deploy

**Estimated Timeline**:
- Core tools testing: 15 minutes
- Hub tools discovery: 10 minutes
- Hub tools implementation: 30 minutes
- Total: ~1 hour

---

## 🔗 Related Documents

- `/cline_docs/tool-schema-discovery.md` - Core tools discovery process
- `/cline_docs/magic-parameter-implementation-v2.md` - Detailed implementation for 6 core tools
- `/cline_docs/execute-task-action-discovery.md` - Complex tool analysis

---

## ✅ Ready for Implementation

**Status**: Analysis complete
**Blocking**: Test core tools first
**Owner**: Awaiting user testing and approval
**Estimated ROI**: HIGH (service management is common operation)

---

---

## ✅ VERIFICATION COMPLETE (2025-10-14)

**Database Verification** (schema.prisma):
- ✅ MCPTool model has `name` field (line 891)
- ✅ Services are stored with names
- ✅ Can query by name using Prisma

**Handler Verification** (hub-tools-handler.js):

| Tool | Handler Line | Magic Status | Finding |
|------|--------------|--------------|---------|
| **services(action: "call")** | 505-512 | ✅ ALREADY HAS MAGIC | Uses OR [id, name] query |
| **services(action: "health")** | 357 | ❌ NO MAGIC | findUnique by ID only |
| **registry(action: "update")** | 621 | ❌ NO MAGIC | findUnique by ID only |
| **get_service_config** | N/A | 🐛 NO HANDLER | Tool broken - REMOVED from schema |

**services(action: "discover") Verification** (lines 285-299):
- ✅ Returns capabilities (tools, resources, prompts)
- ✅ Returns configuration (endpoint, category, etc.)
- ✅ Already provides all config info get_service_config would return

**Conclusion**:
- ✅ services(action: "call") works - just needs elicitation update
- ❌ services(action: "health") needs OR [id, name] implementation
- ❌ registry(action: "update") needs OR [id, name] implementation
- 🐛 get_service_config removed (broken, redundant)

---

## 🔧 IMPLEMENTATION PLAN (Updated)

**PRIORITY 1: Just Update Elicitation** (5 min)
1. **services(action: "call")** - Magic already works, update description to emphasize it

**PRIORITY 2: Add Name Lookup** (15 min each)
2. **services(action: "health")** - Add OR [id, name] query (copy from services(action: "call") pattern)
3. **registry(action: "update")** - Add OR [id, name] query (same pattern)

**Total Effort**: 35 minutes (reduced from 1-2 hours!)

---

**Last Updated**: 2025-10-14 (VERIFIED)
**Tools Analyzed**: 7 Hub tools
**Tools With Magic**: 1 (services(action: "call"))
**Tools Needing Magic**: 2 (services(action: "health"), registry(action: "update"))
**Tools Removed**: 1 (get_service_config - broken)
**Implementation Ready**: Yes (verified against code)
