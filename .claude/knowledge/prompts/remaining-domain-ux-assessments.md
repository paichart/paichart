# Remaining Domain UX Assessments - Continuation Prompt

**Use this prompt to complete UX assessments for any MCP domain**

---

## How to Use This Prompt

### Quick Start
1. Copy the **Continuation Prompt** section (at the end of this document)
2. Paste into a new Claude Code session
3. Follow the step-by-step instructions

### Domain Reference
**Full domain documentation**: `/.claude/knowledge/domain/mcp/mcp-domain-reference.md`

| Domain | Tools | Status | Parts |
|--------|-------|--------|-------|
| ChatGPT Connector | 2 | ✅ Assessed | 7-9 |
| Basic Tools | 7 | ✅ Assessed | 1-3 |
| Advanced Tools | 4 | ✅ Assessed | 4-6 |
| **Hub Tools** | 11 | ⏳ Pending | 10-12 |
| **Browser Automation** | 4 | ⏳ Pending | 13-15 |

### Related Resources
- **Methodology**: `/.claude/knowledge/protocols/mcp-domain-testing-methodology.md`
- **UX Pattern**: `/.claude/knowledge/patterns/mcp-tool-ux-pattern.md`
- **Error Helpers**: `lib/mcp/server/tools/*/error-helpers.js`
- **Tool Schemas**: `lib/mcp/server/config/tool-schemas.js`

### What Gets Assessed
Each domain assessment covers:
1. **Error Messages** - Clarity, actionability, recovery guidance
2. **Tool Descriptions** - WHEN TO USE, EXAMPLES, SEE ALSO coverage
3. **Elicitation** - Next-step suggestions, workflow chaining
4. **Dec 2025 Patterns** - Error helper usage, fuzzy suggestions

---

## Context from Previous Session

We've completed **UX assessments for 3 domains**:

### ✅ **Basic Tools** (6 tools) - B+ Grade
- **Assessed**: project(action: "pov.list"), project(action: "pov.details"), project(action: "task.list"), project(action: "task.context"), template(action: "list"), prompt_command
- **Specialists**: 3 (parameter-normalizer, mcp-integration, architectural-review)
- **Grades**: Error Messages B+ (7.85/10), Descriptions B+ (8.5/10), Overall UX B+ (7.75/10)
- **Recommendations**: Parts 1-3 created (11 improvements, 7-9 hours effort)

### ✅ **Advanced Tools** (5 tools) - B- to A- Mixed
- **Assessed**: perform(action: "execute") (14 actions), project(action: "task.context"), perform(action: "agent_results"), analytics(action: "recommendations.get"), analytics(action: "team.performance")
- **Specialists**: 3 (all using Opus)
- **Grades**: Error Messages A- (87/100), Descriptions B- (78/100), Elicitation 6/10
- **Recommendations**: Parts 4-6 created (14 improvements, 6 hours effort)

### ✅ **ChatGPT Connector** (2 tools) - A- Grade
- **Assessed**: search, fetch
- **Specialists**: 3 (all using Opus)
- **Grades**: Error Messages B+, Descriptions A- (8.9/10), Overall UX A- (93/100)
- **Recommendations**: Parts 7-9 created (6 improvements, 75 minutes effort)

---

## Remaining Domains to Assess

### ⏳ **Hub Tools** (10 tools) - NOT ASSESSED
**Tools**:
1. registry(action: "register") - Register MCP service in hub
2. services(action: "discover") - Find services by capability
3. services(action: "health") - Check service health
4. services(action: "call") - Cross-service communication
5. registry(action: "update") - Update service metadata
6. registry(action: "list") - List user's services
7. registry(action: "delete") - Delete service (GDPR)
8. list_prompts - List available prompts
9. services(action: "workflow.execute") - Run multi-service workflow
10. services(action: "workflow.status") - Check workflow execution

**Complexity**: Highest tool count, service registry functionality

### ⏳ **Browser Automation** (4 tools) - NOT ASSESSED
**Tools**:
1. list_browser_templates - List workflow templates
2. get_browser_template_details - Template configuration
3. validate_browser_template_parameters - Validate params
4. create_browser_automation_task - Create automation task

**Complexity**: Specialized domain, on-demand browser processes

---

## Your Mission: Complete UX Assessments

Use the **proven specialist assessment pattern** from previous session:

1. Run discovery prompts first (Dec 2025 addition)
2. Launch 3 specialists per domain (parameter-normalizer, mcp-integration, architectural-review)
3. Wait for results
4. Create Parts 10-12 (Hub) and Parts 13-15 (Browser) recommendation docs
5. Document findings as tasks in POV
6. Run validation tests
7. Commit recommendations

---

## Step-by-Step Instructions

### **STEP 0: Discovery-First & Pre-Assessment Verification**

Before launching specialists, run discoveries to map current state:

```bash
# 1. Verify Dec 2025 tool schema documentation (100% coverage)
echo "=== Tool Schema Coverage (should be 28 each) ==="
grep -c "WHEN TO USE" lib/mcp/server/config/tool-schemas.js
grep -c "SEE ALSO" lib/mcp/server/config/tool-schemas.js
grep -c "EXAMPLES" lib/mcp/server/config/tool-schemas.js

# 2. Check error helper integration for Hub Tools
echo "=== Hub Tools Error Helper Usage ==="
grep -rn "require.*error-helpers" lib/mcp/server/tools/hub*.js --include="*.js"

# 3. Check error helper integration for Browser Tools
echo "=== Browser Tools Error Helper Usage ==="
# tools/browser/ DELETED (17185e45) — browser automation error handling lives in services/browser-automation-service/
grep -rn "require.*error-helpers" lib/mcp/server/tools/*browser*.js --include="*.js"

# 4. Verify fuzzy search helper integration
echo "=== Fuzzy Search Helper ==="
grep -rn "getScoredSuggestions\|findBestMatch" lib/mcp/server/tools/*.js | head -5
```

**Expected Results**:
- Tool schema coverage: 28/28/28 (100%)
- Error helpers: Should be integrated in handlers
- Fuzzy search: Used for name-based lookups

---

### **Hub Tools Stage Design** (Per Methodology Stage 2.5)

Split Hub's 10 tools into logical groups (5-6 tasks per stage max):

| Stage | Tools | Focus |
|-------|-------|-------|
| **A: Service Lifecycle** | registry(action: "register"), registry(action: "update"), registry(action: "list"), registry(action: "delete"), services(action: "health") | Registration and management |
| **B: Discovery & Communication** | services(action: "discover"), services(action: "call"), registry(action: "tools"), list_prompts | Finding and using services |
| **C: Workflow Orchestration** | services(action: "workflow.execute"), services(action: "workflow.status"), services(action: "workflow.cancel"), services(action: "workflow.list") | Multi-service workflows |

This prevents overwhelming single assessment with 10+ findings.

---

### **STEP 1: Hub Tools UX Assessment**

Launch 3 specialists with Opus model:

```
"Please launch 3 specialists to assess Hub Tools domain UX:

1. parameter-normalizer-specialist (use Opus):
   - Assess error message quality for all 10 Hub tools
   - Check: Clarity, Actionability, Examples, Recovery
   - Focus: Service registration errors, discovery errors, health check errors
   - Files: lib/mcp/server/tools/hub/*.js (11 modules)
   - **NEW Dec 2025**: Verify error helpers from `/lib/mcp/server/tools/*/error-helpers.js` are used
   - **NEW Dec 2025**: Check fuzzy suggestions via `getScoredSuggestions()` integration
   - **NEW Dec 2025**: Verify emoji format (❌🔍💡🔧), recovery steps, next actions
   - Deliverables: Error scorecard, top 3 best/worst, error helper coverage report

2. mcp-integration-specialist (use Opus):
   - Assess tool descriptions for all 10 Hub tools
   - Check: Discoverability, When-to-Use, Examples, Workflow, Parameters
   - Focus: Is service lifecycle clear? Are hub concepts explained?
   - Files: lib/mcp/server/config/tool-schemas.js (Hub sections)
   - **NEW Dec 2025**: Verify 100% coverage of WHEN TO USE, SEE ALSO, EXAMPLES sections
   - **NEW Dec 2025**: Check [PARAMETERS] documentation for magic parameter tools
   - Deliverables: Description scorecard, enhancement priority list, schema coverage report

3. architectural-review-specialist (use Opus):
   - Assess overall Hub domain UX
   - Check: Elicitation, Response format, Workflow, Error recovery, Learning curve
   - Focus: Service registry workflow, cross-service calls, hub ecosystem
   - **NEW Dec 2025**: Verify consistent error format across all Hub tools
   - Deliverables: UX scorecard, workflow analysis, overall grade

Run all 3 in parallel for efficiency."
```

**Expected Runtime**: 2-3 minutes
**Expected Grades**: Unknown (new domain, not yet tested)

---

### **STEP 2: Review Hub Assessment Results**

After specialists complete:

```
"Please review the Hub tools specialist findings and create:

1. Part 10: Hub Tools Description Enhancements
   - List all tools needing WHEN TO USE sections
   - Provide before/after code for each
   - Prioritize by usage frequency

2. Part 11: Hub Tools Elicitation Improvements
   - Identify which Hub tools need next-step guidance
   - Focus on service lifecycle workflow
   - State-aware suggestions for registration → discovery → health → call

3. Part 12: Hub Tools Error Message Enhancements
   - List error gaps found
   - Provide before/after code
   - Focus on service-specific errors

Save to:
- .claude/knowledge/domain/mcp/specialist-recommendations-hub-tools-part10.md
- .claude/knowledge/domain/mcp/specialist-recommendations-hub-tools-part11.md
- .claude/knowledge/domain/mcp/specialist-recommendations-hub-tools-part12.md"
```

---

### **STEP 3: Browser Automation UX Assessment**

Launch 3 specialists:

```
"Please launch 3 specialists to assess Browser Automation domain UX:

1. parameter-normalizer-specialist (use Opus):
   - Assess error messages for 4 browser automation tools
   - Focus: Template validation errors, parameter validation, browser config errors
   - Files: lib/mcp/server/tools/sdk-native-browser-automation-tools.js
   - ~~Verify `/lib/mcp/server/tools/browser/error-helpers.js`~~ DELETED with tools/browser/ (17185e45)
   - **NEW Dec 2025**: Check for `templateNotFoundError()`, `validationFailedError()`, `browserProcessError()`
   - Deliverables: Error scorecard, error helper coverage report

2. mcp-integration-specialist (use Opus):
   - Assess tool descriptions for 4 browser tools
   - Focus: Is on-demand browser lifecycle clear? Cost optimization explained?
   - Check: Template types, workflow types, parameter validation flow
   - **NEW Dec 2025**: Verify WHEN TO USE, SEE ALSO, EXAMPLES sections present
   - Deliverables: Description scorecard, schema coverage report

3. architectural-review-specialist (use Opus):
   - Assess browser automation workflow UX
   - Focus: Template selection → validation → task creation → execution
   - Check: Cost optimization messaging, on-demand process lifecycle
   - **NEW Dec 2025**: Verify error format consistency with other domains
   - Deliverables: Workflow assessment, overall grade"
```

---

### **STEP 4: Review Browser Automation Results**

Create final 3 recommendation docs:

```
"Create Parts 13-15 for Browser Automation recommendations:

Part 13: Browser Tools Description Enhancements
Part 14: Browser Tools Elicitation
Part 15: Browser Tools Error Messages

Save to .claude/knowledge/domain/mcp/specialist-recommendations-browser-tools-partXX.md"
```

---

### **STEP 5: Document All Findings in POV**

Create tasks in POV documenting assessment results:

```javascript
perform(action: "execute")({
  action: "task.create",
  parameters: {
    title: "UX Assessment: Hub Tools - Grade [X]",
    description: "Hub tools assessment results: [summary]",
    povId: "cmjbthi5i0001yxwlpmvhl96u",
    phaseName: "Assessment and Validation",
    stageName: "Documentation and Knowledge Capture",
    priority: "HIGH"
  }
})

// Repeat for Browser Automation
```

---

### **STEP 6: Validation Tests**

Run validation tests to verify assessment findings:

```bash
# Run all validation tests (the full suite battery — count drifts as suites grow)
npm run test:all-validation

# Check ID format compliance (CUID enforcement)
npm run validate:id-format

# Verify enum parity (Prisma enums match Zod schemas)
npm run test:enum-parity
```

**Expected**: All tests pass. If failures, document as additional findings.

---

### **STEP 7: Final Commit**

Commit all recommendation docs:

```bash
git add .claude/knowledge/domain/mcp/specialist-recommendations-*.md
git commit -m "docs(specialists): Complete UX assessments for Hub and Browser domains

Hub Tools Assessment (Parts 10-12):
- 10 tools assessed
- Grades: [X]
- Recommendations: [count]

Browser Automation Assessment (Parts 13-15):
- 4 tools assessed
- Grades: [X]
- Recommendations: [count]

Complete domain coverage: 5 domains, 27 tools, 9 specialists, 15 parts"

git push origin main
```

---

## Quick Reference: What We've Done

**Domains Assessed**: 3 of 5
**Specialists Run**: 9 (3 per domain)
**Recommendation Parts**: 9 (3 per domain)
**Total Recommendations**: 31
**Implementation Effort**: ~16 hours total
**Average Grade**: B+ to A- (improving!)

**Pattern Validated**:
- 3 specialists per domain (parameter-normalizer, mcp-integration, architectural-review)
- All using Opus model for quality
- Create 3 parts per domain (descriptions, elicitation, errors)
- Document as tasks in POV
- Commit to knowledge base

---

## Success Criteria for Remaining Domains

### Hub Tools Success:
- ✅ All 10 tools assessed
- ✅ Service registry workflow clarity evaluated
- ✅ Cross-service communication UX reviewed
- ✅ Grade B or better
- ✅ Recommendations documented

### Browser Automation Success:
- ✅ All 4 tools assessed
- ✅ On-demand process lifecycle clarity
- ✅ Cost optimization messaging evaluated
- ✅ Grade B or better
- ✅ Recommendations documented

---

## Continuation Prompt for Claude

**Copy-paste this into new session**:

```
Continue UX assessment work from previous session.

Context:
- We assessed 3 domains: Basic Tools (B+), Advanced Tools (B- to A- mixed), ChatGPT Connector (A-)
- Created 9 recommendation parts documenting 31 improvements
- Validated methodology with 9 specialists
- Everything tracked in POV: pAIchart MCP Server Improvements Q1 2025 (ID: cmjbthi5i0001yxwlpmvhl96u)
- Dec 2025: Error helper pattern (3 modules) and tool schema documentation (100% coverage) now complete

Remaining work:
- Hub Tools domain (13 tools): registry(action: "register"), services(action: "discover"), services(action: "health"), registry(action: "tools"), services(action: "call"), registry(action: "list"), registry(action: "update"), registry(action: "delete"), list_prompts, services(action: "workflow.execute"), services(action: "workflow.status"), services(action: "workflow.cancel"), services(action: "workflow.list")
- Browser Automation domain (4 tools): list_browser_templates, get_browser_template_details, validate_browser_template_parameters, create_browser_automation_task

Please:
1. Run STEP 0 discovery verification first (tool schema coverage, error helper integration)
2. Launch 3 specialists for Hub Tools (parameter-normalizer, mcp-integration, architectural-review, all use Opus)
   - Include Dec 2025 error helper and tool schema verification in assessment
3. Wait for results and create Parts 10-12 recommendation docs
4. Launch 3 specialists for Browser Automation (include Dec 2025 checks)
5. Create Parts 13-15 recommendation docs
6. Document findings as tasks in POV (phaseName: "Assessment and Validation", stageName: "Documentation and Knowledge Capture")
7. Run validation tests (npm run test:all-validation)
8. Commit all docs

Reference documents:
- Methodology: /.claude/knowledge/protocols/mcp-domain-testing-methodology.md
- Error helpers: lib/mcp/server/tools/*/error-helpers.js (3 modules)
- Tool schemas: lib/mcp/server/config/tool-schemas.js (100% coverage)
- Basic Tools: Parts 1-3 in .claude/knowledge/domain/mcp/
- Advanced Tools: Parts 4-6 in same location
- ChatGPT: Summary in same location
- Use same pattern for Hub (10-12) and Browser (13-15)

Goal: Complete all 5 domains with comprehensive UX recommendations including Dec 2025 patterns!
```

---

## Files You'll Create

**Hub Domain**:
- specialist-recommendations-hub-tools-part10.md (Descriptions)
- specialist-recommendations-hub-tools-part11.md (Elicitation)
- specialist-recommendations-hub-tools-part12.md (Errors)

**Browser Domain**:
- specialist-recommendations-browser-tools-part13.md (Descriptions)
- specialist-recommendations-browser-tools-part14.md (Elicitation)
- specialist-recommendations-browser-tools-part15.md (Errors)

**Total**: 6 more parts to complete the set (15 parts total)

---

## Expected Outcomes

**By end of next session**:
- ✅ All 5 domains assessed (27 tools total)
- ✅ 15 recommendation parts created
- ✅ ~40-50 total recommendations documented
- ✅ Complete UX baseline for all MCP tools
- ✅ Implementation backlog prioritized
- ✅ Ready to achieve A grades across all domains

**Time Estimate**: 1-2 hours for both assessments + documentation

---

**Ready for next session to complete the UX assessment trilogy!** 🚀
