# MCP Domain UX Assessment Guide

**Use this prompt to run UX assessments for any MCP domain**

---

## How to Use This Guide

### Quick Start
1. Update the **Domain Status** table below as you complete assessments
2. Copy the **Continuation Prompt** section for your target domain
3. Paste into a new Claude Code session
4. Follow the step-by-step instructions

### Domain Reference
**Full documentation**: `/.claude/knowledge/domain/mcp/mcp-domain-reference.md`

---

## Domain Status

| Domain | Tools | Error Helper | Status | Parts |
|--------|-------|--------------|--------|-------|
| Basic Tools | 7 | basic | ⏳ Pending | 1-3 |
| Advanced Tools | 4 | advanced | ⏳ Pending | 4-6 |
| ChatGPT Connector | 2 | basic | ⏳ Pending | 7-9 |
| Hub Tools | 11 | hub | ⏳ Pending | 10-12 |
| Browser Automation | 4 | browser | ⏳ Pending | 13-15 |

**Total**: 28 tools across 5 domains

---

## Related Resources

| Resource | Location |
|----------|----------|
| Methodology | `/.claude/knowledge/protocols/mcp-domain-testing-methodology.md` |
| UX Pattern | `/.claude/knowledge/patterns/mcp-tool-ux-pattern.md` |
| Domain Reference | `/.claude/knowledge/domain/mcp/mcp-domain-reference.md` |
| Error Helpers | `lib/mcp/server/tools/*/error-helpers.js` |
| Tool Schemas | `lib/mcp/server/config/tool-schemas.js` |

---

## What Gets Assessed

Each domain assessment covers:
1. **Error Messages** - Clarity, actionability, recovery guidance, emoji format
2. **Tool Descriptions** - WHEN TO USE, EXAMPLES, SEE ALSO coverage
3. **Elicitation** - Next-step suggestions, workflow chaining
4. **Dec 2025 Patterns** - Error helper usage, fuzzy suggestions, format consistency

---

## Domain Details

### Basic Tools (7 tools) - Parts 1-3

**File**: `lib/mcp/server/tools/sdk-native-basic-tools.js`
**Error Helper**: `lib/mcp/server/tools/basic/error-helpers.js`

| Tool | Purpose |
|------|---------|
| project.pov_list | List POVs with filtering |
| project.pov_details | POV details with team/phases |
| project.task_list | List tasks with filtering |
| project.task_context | Task context and history |
| template.list | List agent templates |
| template.details | Template configuration |
| prompt_command | Execute guided prompts |

---

### Advanced Tools (4 tools) - Parts 4-6

**File**: `lib/mcp/server/tools/sdk-native-advanced-tools.js`
**Error Helper**: `lib/mcp/server/tools/advanced/error-helpers.js`

| Tool | Purpose |
|------|---------|
| perform.execute | 14 actions (pov.*, task.*, agent.*, team.*) |
| analytics.recommendations_get | AI-powered suggestions |
| analytics.team_performance | Team analytics |
| perform.agent_results | Agent execution results |

---

### ChatGPT Connector (2 tools) - Parts 7-9

**File**: `lib/mcp/server/tools/chatgpt-connector-tools.js`
**Error Helper**: `lib/mcp/server/tools/basic/error-helpers.js`

| Tool | Purpose |
|------|---------|
| search | Full-text search across resources |
| fetch | Retrieve resource by ID |

---

### Hub Tools (11 tools) - Parts 10-12

**File**: `lib/mcp/server/tools/hub-tools-handler.js`
**Error Helper**: `lib/mcp/server/tools/hub/` (shared patterns)

| Tool | Purpose |
|------|---------|
| registry.register | Register MCP service |
| services.discover | Find services by capability |
| services.health | Check service health |
| services.call | Cross-service communication |
| registry.list | User's registered services |
| registry.tools | Service tool definitions |
| registry.update | Update service metadata |
| registry.delete | Delete service (GDPR) |
| list_prompts | List available prompts |
| services.workflow_execute | Run multi-service workflow |
| services.workflow_status | Check workflow execution |
| services.workflow_cancel | Cancel running workflow |
| services.workflow_list | Workflow history |

---

### Browser Automation (4 tools) - Parts 13-15

**File**: `lib/mcp/server/tools/sdk-native-browser-automation-tools.js`
**Error Helper**: ~~`lib/mcp/server/tools/browser/error-helpers.js`~~ DELETED with tools/browser/ (17185e45; browser automation is a standalone Docker service)

| Tool | Purpose |
|------|---------|
| list_browser_templates | List workflow templates |
| get_browser_template_details | Template configuration |
| validate_browser_template_parameters | Validate params |
| create_browser_automation_task | Create automation task |

---

## Step-by-Step Instructions

### STEP 0: Discovery Verification

Before launching specialists, verify Dec 2025 patterns:

```bash
# Tool schema coverage (should be 28 each)
grep -c "WHEN TO USE" lib/mcp/server/config/tool-schemas.js
grep -c "SEE ALSO" lib/mcp/server/config/tool-schemas.js
grep -c "EXAMPLES" lib/mcp/server/config/tool-schemas.js

# Error helper integration
grep -rn "require.*error-helpers" lib/mcp/server/tools/ --include="*.js" | wc -l
```

---

### STEP 1: Launch 3 Specialists

For each domain, launch 3 specialists in parallel:

```
"Launch 3 specialists to assess [DOMAIN] UX:

1. parameter-normalizer-specialist (use Opus):
   - Assess error message quality for all tools
   - Check: Clarity, Actionability, Examples, Recovery
   - Verify error helpers from /lib/mcp/server/tools/*/error-helpers.js
   - Verify emoji format (❌🔍💡🔧), fuzzy suggestions
   - Deliverables: Error scorecard, error helper coverage

2. mcp-integration-specialist (use Opus):
   - Assess tool descriptions for all tools
   - Check: WHEN TO USE, EXAMPLES, SEE ALSO coverage
   - Verify 100% schema documentation
   - Deliverables: Description scorecard, enhancement list

3. architectural-review-specialist (use Opus):
   - Assess overall domain UX
   - Check: Elicitation, Response format, Workflow, Error recovery
   - Deliverables: UX scorecard, overall grade

Run all 3 in parallel."
```

---

### STEP 2: Create Recommendation Parts

After specialists complete, create 3 parts:

| Part | Content |
|------|---------|
| Part N | Description Enhancements |
| Part N+1 | Elicitation Improvements |
| Part N+2 | Error Message Enhancements |

Save to: `.claude/knowledge/domain/mcp/specialist-recommendations-[domain]-partN.md`

---

### STEP 3: Document in POV (Optional)

```javascript
perform(action: "execute")({
  action: "task.create",
  parameters: {
    title: "UX Assessment: [Domain] - Grade [X]",
    description: "[Assessment summary]",
    povId: "[POV_ID]",
    priority: "HIGH"
  }
})
```

---

### STEP 4: Validation Tests

```bash
npm run test:all-validation
npm run validate:id-format
```

---

### STEP 5: Commit

```bash
git add .claude/knowledge/domain/mcp/specialist-recommendations-*.md
git commit -m "docs(specialists): [Domain] UX assessment - Parts N-N+2"
git push
```

---

## Continuation Prompt

**Copy-paste this into new session**:

```
Run MCP Domain UX Assessment.

Reference: /.claude/knowledge/prompts/mcp-domain-ux-assessment.md

Target Domain: Basic Tools (7 tools)
- project(action: "pov.list"), project(action: "pov.details"), project(action: "task.list"), project(action: "task.context")
- template(action: "list"), template(action: "details"), prompt_command

File: lib/mcp/server/tools/sdk-native-basic-tools.js
Error Helper: lib/mcp/server/tools/basic/error-helpers.js

Please:
1. Run STEP 0 discovery verification
2. Launch 3 specialists (parameter-normalizer, mcp-integration, architectural-review)
   - Include Dec 2025 error helper and tool schema verification
3. Create Parts 1-3 recommendation docs
4. Run validation tests
5. Commit docs

Related:
- UX Pattern: /.claude/knowledge/patterns/mcp-tool-ux-pattern.md
- Domain Reference: /.claude/knowledge/domain/mcp/mcp-domain-reference.md
```

---

## Assessment Order (Recommended)

1. **Basic Tools** (Parts 1-3) - Foundation, most used
2. **Advanced Tools** (Parts 4-6) - Complex, perform(action: "execute")
3. **ChatGPT Connector** (Parts 7-9) - Cross-platform
4. **Hub Tools** (Parts 10-12) - Service registry
5. **Browser Automation** (Parts 13-15) - Specialized

---

## Success Criteria

Per domain:
- [ ] All tools assessed by 3 specialists
- [ ] 3 recommendation parts created
- [ ] Error helper coverage verified
- [ ] Tool schema 100% verified
- [ ] Grade B or better
- [ ] Validation tests pass

Overall:
- [ ] 5 domains completed
- [ ] 15 recommendation parts
- [ ] 28 tools assessed
- [ ] Consistent UX patterns
