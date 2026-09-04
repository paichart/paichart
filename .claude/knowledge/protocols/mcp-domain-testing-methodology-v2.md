# MCP Domain Testing & Improvement Methodology v2

**Type**: Workflow Protocol
**Purpose**: Standardized methodology for iterative MCP domain testing, error analysis, and improvement
**Created**: December 18, 2025
**Updated**: December 22, 2025 (v2.1 - Sprint 3 Learnings)
**Status**: Production - Active methodology for all MCP domains
**Confidence**: 98% (validated through 3 iterations + Sprint 3 smoke tests)

---

## What's New in v2

**Architectural Review Improvements** (Dec 22, 2025):
- **Fixed**: Stage numbering now globally unique (1-11) - no more resets or ".5" stages
- **Added**: Templates section with standardized task documentation formats
- **Added**: Test PASS template (was missing - only had error template)
- **Added**: Gold Standard Pattern reference for UX quality validation
- **Added**: Cross-references to related protocols and patterns
- **Added**: Consistent specialist assignments across all stages
- **Added**: Validation parity and security testing commands

**Review Confidence**: 97% (up from 95% after fixes)

### What's New in v2.1

**Sprint 3 Learnings** (Dec 22, 2025):
- **Added**: Smoke Test Pattern for quick production verification
- **Added**: Bug Naming Convention (BUG-XXX format)
- **Added**: Task Addendum Pattern for documenting fixes
- **Added**: Common Root Causes section (growing list from real bugs)
- **Added**: Cross-Layer Validation considerations (UI/MCP alignment)
- **Updated**: Confidence to 98% after successful smoke tests

### What's New in v2.2

**6-Pilot Sweep Learnings** (May 23, 2026 — across Hub, Basic Tools, Analytics, Registry, Template, Standalone pilots):

After running 6 full pilots with 4 Phase 3 specialist reviews surfacing
~30 specialist-only findings that Phase 2 functional testing missed,
two cross-cutting patterns emerged. Encoded as Refinement 5 (Claim
Verification) and Refinement 6 (Formatter sweep).

**Confidence**: bumped to 99% — the methodology now has explicit prevention for the two highest-yield bug classes (21% of pilot bugs were phantom-canonical-at-UX-layer; another 15% were formatter-drops-promised-fields).

#### **Refinement 5: Claim Verification Audit Pass** (covers #214 + the BUG-TEMPLATE-004 / BUG-STANDALONE-002 / BUG-TEMPLATE-001 class)

**Trigger**: Required during Stage 2 (Test Planning) and again during Stage 6 (Validation Review).

**Rationale**: 21% of all pilot bugs (6 of ~28) were phantom-canonical at the user-facing surface — schema descriptions, hint text, example commands, and enum lists promised behavior the implementation didn't back. Pattern shipped twice in the SAME file at Standalone (search examples + JSDoc claims). Doc claim → real bug → repeat.

**Procedure** — for each tool under test:

1. **Examples audit**: Grep the schema description for `EXAMPLES:` / `prompt_command('/prompt X')` / similar reference values. For each: verify the referenced command/prompt/route ACTUALLY EXISTS in the codebase. If a doc references `/prompt show_available_prompts`, search the prompt registry for that exact name. If it doesn't exist → phantom canonical, fix the docs.

2. **Hint audit**: Grep response shapes for `nextSteps` / `suggestions` / `example` text that suggests a parameter or action. For each: verify the suggested parameter EXISTS in the tool's input schema. If a hint says `use page=2` but the schema has no `page` param → phantom canonical, fix the hint.

3. **Enum literal audit**: For each `z.enum([...])` literal in tool-schemas.js, verify it matches the corresponding Prisma enum if any. Use existing test-analytics-schema-parity.ts pattern. The inverse direction (schema has values Prisma doesn't) crashes findMany with 500. The forward direction (Prisma has values schema doesn't) blocks valid calls.

4. **RETURNS contract**: Compare the schema description's `RETURNS:` block to the formatter's actual output structure. Promised fields must exist in formatter output. Stripped fields should be documented as intentional.

5. **Specialist assignment**: validation-engine-specialist primarily; sec-ops for any access-claim drift.

**Existing CI test that catches schema-vs-enum drift**: scripts/test-analytics-schema-parity.ts. Recommended Refinement 5.1 — extend it to literal-vs-Prisma parity (not just z.nativeEnum).

#### **Refinement 6: Formatter Sweep** (#241 — template-system cross-pilot observation)

**Trigger**: Stage 6 (Validation Review). Add explicit formatter audit.

**Rationale**: Across all 4 Phase 3 reviews (Analytics + Registry + Standalone + Template), `lib/mcp/server/utils/formatters.js` was consistently where bugs hid. Schemas/handlers/routes are well-tested; formatters are under-audited. Pattern:
- Formatters silently drop fields the schema promises
- Formatters miss `sanitizeForResponse` calls on user-controlled fields (BC71 sibling gaps)
- Formatters create token-bloat by inlining fields that don't need to be there

**Procedure** — for each tool with a formatter (formatXxx function):

1. **RETURNS contract verification** (Refinement 5 sub-procedure): the formatter must return what the schema description promises. No dropped fields. No silently-added fields.

2. **BC71 sanitize coverage**: every user-controlled field that flows from DB to response must use `sanitizeForResponse()` or `escapeHtml()`. Sweep the formatter for fields like `template.name`, `pov.title`, `task.description`, `service.description` — all need the sweep.

3. **Templated-output safety**: if the formatter embeds user-controlled data into markdown/templates, ensure no HTML-render path exists. Future MCP clients with markdown→HTML pipelines will exploit any gap.

4. **Specialist assignment**: validation-engine + sec-ops for sanitize sweep; template-system or domain expert for RETURNS contract verification.

**Why this is its own refinement**: formatters live OUTSIDE schemas + handlers + routes (the 3 surfaces Phase 2 tests). They're a separate code layer. Without an explicit sweep step, they accumulate drift between schema promises and runtime behavior.

---

## Quick Reference: Templates

### Test PASS Template
```
Test: [Tool Name] - [Parameter]
Input: [Exact parameters used]
Expected: [What should happen]
Actual: [What actually happened]
Status: PASS
Performance: [Response time if notable]
Notes: [Edge cases discovered, unexpected behaviors]
```

### Test FAIL Template
```
Test: [Tool Name] - [Parameter]
Input: [Exact parameters used]
Expected: [What should happen]
Actual: [What actually happened]
Status: FAIL
Error: [Exact error message]
Next Step: Created ERROR task in Stage 5
```

### ERROR Task Template
```
Error: [Exact error text]
Input: [What parameters caused it]
Expected: [What should happen]
Actual: [What actually happened]
Root Cause: [Technical reason]
Fix Options: [Numbered list of solutions]
Recommendation: [Preferred fix with reasoning]
Status: [Not fixed / Partially fixed / Fixed in commit XYZ]
```

### Implementation Task Template
```
Fix: [Error name or feature name]
Files Modified:
  - [file1.ts]: [changes]
  - [file2.ts]: [changes]
Changes Made: [Summary of code changes]
Testing Performed: [What was tested]
Commit: [hash] - [message]
Status: [COMPLETED when deployed and verified]
```

### Specialist Task Template
```
Specialist: [specialist-name]
Purpose: [What analysis is needed]
Input: [Errors, tools, or issues to analyze]
Output Expected: [Recommendations, report, implementation plan]
Confidence Threshold: [Target confidence from specialist-review-protocol.md]
Result: [Summary of recommendations received]
```

---

## Overview

This protocol defines the complete workflow for testing, analyzing, and improving MCP tools within a specific domain. Each domain gets its own POV following this exact structure, enabling consistent tracking, analysis, and continuous improvement.

**Domains to Test**:
- Basic Tools (project(action: "pov.list"), project(action: "pov.details"), project(action: "task.list"), etc.)
- Agent Automation (agent.configure, agent.execute, agent.status, perform(action: "agent_results"))
- MCP Hub (registry(action: "register"), services(action: "discover"), services(action: "health"), services(action: "call"))
- Browser Automation (list_browser_templates, create_browser_automation_task)
- ChatGPT Connector (search, fetch)
- Prompt Workflows (interactive and auto-execute prompts)

---

## POV Structure Template

### **POV Naming**: "MCP [Domain Name] Testing & Improvement"

**Examples**:
- "MCP Basic Tools Testing & Improvement"
- "MCP Agent Automation Testing & Improvement"
- "MCP Hub Integration Testing & Improvement"

**Duration**: 90 days (default)
**Owner**: Current user (auto-set)
**Priority**: HIGH (testing is critical)
**Customer**: Internal - pAIchart Platform

---

## Stage Overview (11 Stages Total)

| Phase | Stage | Name | Purpose |
|-------|-------|------|---------|
| **PLANNING** (15%) | 1 | Domain and Tool Scope | Define what we're testing |
| | 2 | Test Planning and Stage Design | Prepare success criteria and stage structure |
| | 3 | UX and Message Quality Review | Assess user experience quality |
| **EXECUTION** (70%) | 4 | Tool Testing and Validation | Systematically test each parameter |
| | 5 | Error Discovery and Documentation | Document every error with full analysis |
| | 6 | Validation and Security Review | Ensure validation coverage and security |
| | 7 | Specialist Analysis | Get expert analysis and guidance |
| | 8 | Implementation | Code the fixes and enhancements |
| | 9 | Code Review, Validation, and Deployment | Verify and deploy changes |
| **REVIEW** (15%) | 10 | Post-Deployment Verification and Performance | Confirm fixes and measure performance |
| | 11 | Documentation, Retrospective, and Next Planning | Capture knowledge and plan next iteration |

---

## Phase 1: Planning and Scoping (PLANNING)

**Type**: PLANNING
**Duration**: 15% of total (e.g., 14 days for 90-day POV)
**Purpose**: Scope the domain, identify tools, plan test scenarios

### **Stage 1: Domain and Tool Scope**

**Purpose**: Define what we're testing and understand the tools

**Tasks**:
1. **Select domain for testing iteration**
   - Description: Define the task as action. Create a prompt to read the relevant files using file/path/function/description
   - Priority: HIGH
   - Output: Domain name and justification

2. **Provide context for selected domain**
   - Description: Identify the files/paths/description of all relevant routes, handlers, APIs, normalizers, mappers, validation etc
   - Priority: HIGH
   - Output: List of files/paths/descriptions/functions/APIs

3. **Review JSDoc reference for domain tools**
   - Description: Read `/.claude/knowledge/domain/mcp/mcp-layer-jsdoc-reference.md` for the selected domain. Extract tool names, descriptions, parameters, and return types.
   - Priority: HIGH
   - Output: List of tools in domain with signatures

4. **Identify individual tools with full specifications**
   - Description: For each tool in domain, document: Name, Purpose, Required parameters, Optional parameters, Return structure, Authentication requirements
   - Priority: HIGH
   - Output: Tool specification matrix

5. **Document tool parameters and return types**
   - Description: Create parameter tables showing: Parameter name, Type, Required/Optional, Default value, Validation rules, Examples
   - Priority: MEDIUM
   - Specialist: parameter-normalizer-specialist (for alias consistency)
   - Output: Parameter reference per tool

6. **Identify tool interdependencies and workflow sequences**
   - Description: Map which tools provide IDs/data for other tools. Example: project(action: "pov.details") provides team member IDs for task.create assigneeId parameter
   - Priority: HIGH
   - Output: Tool dependency graph

7. **Create initial test scenarios**
   - Description: Define 3-5 test scenarios covering: Basic usage, Complex workflows, Error conditions, Edge cases
   - Priority: MEDIUM
   - Output: Test scenario list with steps

---

### **Stage 2: Test Planning and Stage Design**

**Purpose**: Prepare for testing with clear success criteria and design stage structure

**Tasks**:
1. **Define success criteria for tool testing**
   - Description: What constitutes successful testing? Coverage percentage, error rate targets, workflow completeness. Reference: `specialist-review-protocol.md` confidence thresholds (75% caution, 90% good, 95% production)
   - Priority: MEDIUM
   - Output: Success metrics and thresholds

2. **Identify tools requiring authentication vs public access**
   - Description: Categorize tools by auth requirements. Note: Most MCP tools require authentication
   - Priority: HIGH
   - Output: Auth requirements matrix

3. **Plan workflow test sequences**
   - Description: Define multi-tool workflows to test. Example: search -> fetch -> project(action: "pov.details") -> perform(action: "execute")
   - Priority: HIGH
   - Output: Workflow test plans (5-8 sequences)

4. **Prepare test data**
   - Description: Gather POV IDs, task IDs, template IDs, team member IDs needed for testing. Use existing POVs or create test POV.
   - Priority: MEDIUM
   - Output: Test data reference sheet

5. **Count total tools and parameters in domain**
   - Description: Review JSDoc for domain. Count: Total tools, Total parameters across all tools, Average parameters per tool. Calculate estimated test tasks.
   - Priority: HIGH
   - Output: Tool and parameter inventory with counts

6. **Design logical tool groupings for Execution phase stages**
   - Description: Group tools by: Functionality (CRUD, List, Analytics), Entity type (POV, Task, Agent), Complexity (simple vs complex), Dependencies (which tools feed into others). Target: 5-6 tasks per stage.
   - Priority: HIGH
   - Output: Stage design with tool assignments

7. **Split large tools into parameter-focused substages**
   - Description: For tools with 9+ parameters (e.g., task.update, perform(action: "execute")), create multiple stages. Example: "task.update - Required params" (2 tasks), "task.update - Status and Assignment" (3 tasks)
   - Priority: HIGH
   - Output: Substage breakdown for complex tools

8. **Create Execution Phase stage structure in POV**
   - Description: Use perform(action: "execute") with action=stage.create to create testing stages. Verify 5-6 task target per stage. If any stage exceeds 8 tasks, split further.
   - Priority: HIGH
   - Output: Complete stage structure created in POV

9. **Document stage-to-tool-to-parameter mapping**
   - Description: Create reference showing: Stage name -> Tools in stage -> Parameters to test per tool. This becomes the blueprint for task creation.
   - Priority: MEDIUM
   - Output: Complete testing blueprint (stage -> tool -> parameter hierarchy)

**Example Design**:

```
Domain: perform(action: "execute") (14 actions, ~50 total parameters)

Stage Design:
Stage 4a: Task Creation and Updates
  - task.create - required params (3 tasks)
  - task.create - optional params (3 tasks)

Stage 4b: Task Status and Assignment
  - task.update - status param (1 task)
  - task.update - assignee param (2 tasks)
  - task.assign (2 tasks)
  - task.complete (1 task)

Stage 4c: Task Comments and Metadata
  - task.comment (2 tasks)
  - task metadata fields (3 tasks)
```

**Critical Success Factor**: Complete this stage BEFORE creating any test tasks!

---

### **Stage 3: UX and Message Quality Review**

**Purpose**: Assess user experience quality before implementation

**Reference Pattern**: `/.claude/knowledge/patterns/mcp-tool-gold-standard-pattern.md` (98% confidence)

**Tasks**:
1. **Assess tools against Gold Standard Pattern**
   - Description: Review each tool against the 9 Gold Standards: Description UX (A+), Workflow Documentation (A), Error Categorization (B+), State-Aware Responses (A-), Decision Tree Documentation (A), Cost/Benefit Messaging, Error Response nextSteps (A), Centralized Error Helpers (A), Success Response _meta (A-)
   - Priority: HIGH
   - Specialist: mcp-integration-specialist
   - Reference: `/.claude/knowledge/patterns/mcp-tool-gold-standard-pattern.md`
   - Output: Gold Standard compliance scorecard

2. **Review error message quality and actionability**
   - Description: Test each tool's error messages. Check: Do errors show what's wrong? Do they suggest fixes? Do they provide examples? Are invalid characters shown exactly? Can users recover without support?
   - Priority: HIGH
   - Specialist: parameter-normalizer-specialist
   - Output: Error message quality scorecard

3. **Review tool descriptions and discoverability**
   - Description: Assess tool descriptions in tool-schemas.js. Check: Are examples provided? Is "when to use" guidance clear? Are workflows documented? Are parameter aliases explained? Can users find the right tool?
   - Priority: HIGH
   - Specialist: mcp-integration-specialist
   - Output: Tool description enhancement plan

4. **Review elicitation prompts and next-step guidance**
   - Description: Check if tools suggest next steps. Verify: Do responses include "Next Steps"? Are suggestions contextual (use actual IDs from response)? Are tool chains documented? Do users know what to do after each tool call?
   - Priority: MEDIUM
   - Specialist: mcp-integration-specialist
   - Output: Elicitation coverage report

5. **Assess parameter naming and consistency**
   - Description: Verify parameter consistency across tools. Check: Are aliases documented (povId vs pov_id)? Are required vs optional clear? Is naming consistent? Do similar tools use similar parameter names?
   - Priority: MEDIUM
   - Specialist: parameter-normalizer-specialist
   - Output: Parameter consistency matrix

6. **Test response format consistency**
   - Description: Verify all tools return consistent formats. Check: Metadata structure (_meta field), error format, success messages, pagination info. Is format predictable?
   - Priority: MEDIUM
   - Specialist: architectural-review-specialist
   - Output: Response format standardization recommendations

---

## Phase 2: Execute Testing and Implementation (EXECUTION)

**Type**: EXECUTION
**Duration**: 70% of total (e.g., 63 days for 90-day POV)
**Purpose**: Test tools, document errors, analyze issues, implement fixes, deploy

### **Stage 4: Tool Testing and Validation**

**Purpose**: Systematically test EACH parameter of EACH tool

**CRITICAL: Create ALL test tasks BEFORE testing begins**

**Task Creation Pattern** (Do this FIRST):

For each tool in domain, review JSDoc and create tasks for:

1. **Test [Tool Name] - [Required Parameter 1]**
   - Description: Test required parameter. Input: [param]=[value]. Expected: [behavior]. Document: Response, errors, edge cases.
   - Priority: HIGH
   - Status: OPEN (will mark IN_PROGRESS when testing)

2. **Test [Tool Name] - [Required Parameter 2]**
   - Same pattern for each required parameter

3. **Test [Tool Name] - [Optional Parameter 1]**
   - Description: Test optional parameter and default behavior when omitted
   - Priority: MEDIUM

4. **Test [Tool Name] - Parameter combinations**
   - Description: Test multiple parameters together. Example: project(action: "pov.list") with status AND customer_name
   - Priority: MEDIUM

5. **Test [Tool Name] - Parameter aliases**
   - Description: Test if aliases work (povId vs pov_id). Verify both accepted.
   - Priority: LOW

6. **Test [Tool Name] - Edge cases**
   - Description: Empty values, null, max length, invalid formats, special characters
   - Priority: MEDIUM

**Example for task.update**:
```
[] Test task.update - taskId (required)
[] Test task.update - title parameter
[] Test task.update - description parameter
[] Test task.update - priority parameter
[] Test task.update - status parameter
[] Test task.update - dueDate parameter
[] Test task.update - assigneeId parameter
[] Test task.update - Multiple parameters combined
[] Test task.update - Edge cases (empty, null, invalid)
```

**Testing Pattern** (After tasks created):
```
For each test task:
  1. Mark task IN_PROGRESS
  2. Execute tool with test parameters
  3. Document result using Test PASS/FAIL Template (see Templates section)
  4. If PASS: Mark COMPLETED
  5. If FAIL: Create ERROR task in Stage 5, keep test task OPEN
```

**Coverage Tracking**:
- **Completion Rate = Test Coverage Percentage**
- Completed tasks / Total tasks = % of parameters tested
- Easy to see what's tested (completed) vs not tested (open)
- **The POV IS the test matrix!**

**Workflow Integration Tests**:

7. **Test Workflow: [Tool Chain Name]**
   - Description: Multi-tool sequence. Example: "Discovery to Creation: project(action: "pov.list") -> project(action: "pov.details") -> task.create"
   - Verify: IDs flow correctly, each step uses previous output
   - Priority: HIGH

**Result Summary**:

8. **Document test coverage summary**
   - Description: Calculate: Total parameters, Parameters tested, Coverage %, Success rate, Errors found
   - Priority: MEDIUM

---

### **Stage 5: Error Discovery and Documentation**

**Purpose**: Document every error with full analysis

**Bug Naming Convention**:
```
Format: BUG-XXX: [Brief description]
Examples:
- BUG-001: Fix template(action: "list") count display
- BUG-002: Investigate prompt_command response size
- BUG-003: Invalid enum causes timeout

Benefits:
- Easy reference in discussions
- Clear ordering and priority
- Searchable across POV
- Links commits to specific issues
```

**Tasks** (Dynamic - one task per error):
1. **BUG-XXX: [Brief description]** or **ERROR: [Exact error message]**
   - Description: Use ERROR Task Template (see Templates section)
   - Priority: Set based on impact (HIGH for blockers, MEDIUM for UX, LOW for edge cases)
   - Status: IN_PROGRESS (errors under investigation)

2. **Categorize errors by type and priority**
   - Description: Group errors: Validation errors, Parameter errors, Auth errors, Response format issues, Performance issues
   - Priority: MEDIUM

3. **Identify error patterns**
   - Description: Look for common themes. Example: "Multiple tools have character validation issues" or "Timeout errors consistent across tools"
   - Priority: MEDIUM

4. **Create error fix priority matrix**
   - Description: Rank errors by: Impact (how many users affected), Frequency (how often occurs), Effort (time to fix)
   - Priority: HIGH

---

### **Stage 6: Validation and Security Review**

**Purpose**: Ensure validation coverage and security before proceeding

**Commands Available**:
```bash
# Run all validation tests (the full suite battery — count drifts as suites grow)
npm run test:all-validation

# Individual test suites
npm run test:form-patterns   # 28 tests - Form field null handling
npm run test:enum-parity     # 25 tests - Prisma enum drift prevention
npm run validate:id-format   # ID format check - CUID enforcement
npm run test:security        # 28 tests - POV domain security validation
```

**Tasks**:
1. **Review validation schema coverage**
   - Description: Check all tool parameters have validation. Verify: Max/min values set, pattern validation correct, required fields enforced, optional fields default properly
   - Priority: HIGH
   - Files: lib/validation/mcp-action-validation.ts, lib/validation/pov.ts
   - Output: Validation coverage report

2. **Test edge cases and boundary conditions**
   - Description: Test with edge inputs: Empty strings, null values, max length strings, negative numbers, special characters, SQL injection patterns, XSS attempts
   - Priority: HIGH
   - Output: Edge case test results matrix

3. **Security validation audit**
   - Description: Verify security controls work. Check: SQL injection prevention, XSS protection, path traversal blocks, DoS prevention (array/string limits), CSRF protection
   - Priority: HIGH
   - Specialist: sec-ops-specialist
   - Reference: `/.claude/knowledge/protocols/endpoint-security-audit-protocol.md`
   - Output: Security audit report with risk assessment

4. **Validate enum parity**
   - Description: Ensure Prisma enums match Zod validation enums. Check: TaskPriority, POVStatus, PhaseType, TaskStatus. Run: npm run test:enum-parity
   - Priority: MEDIUM
   - Output: Enum consistency verification

5. **Test CUID format enforcement**
   - Description: Verify all ID fields use CUID format (not UUID). Check: povId, taskId, phaseId, stageId validation patterns. Run: npm run validate:id-format
   - Priority: LOW
   - Output: ID format compliance report

6. **Cross-layer validation alignment**
   - Description: When MCP truncates or limits fields, verify UI enforces same limits. Check: Does UI show character limits? Are users informed about truncation? Is full content accessible in detail views? Do error messages match across layers?
   - Priority: MEDIUM
   - Example: MCP truncates useCase to 200 chars in list views → UI should show "First 200 chars shown in list views" hint
   - Output: Cross-layer alignment report

---

### **Stage 7: Specialist Analysis and Recommendations**

**Purpose**: Get expert analysis and implementation guidance

**Reference**: `/.claude/knowledge/protocols/specialist-review-protocol.md` - When to run specialists, confidence thresholds

**Confidence Thresholds** (from specialist-review-protocol.md):
- < 75%: NEEDS REVISION
- 75-85%: PROCEED WITH CAUTION
- 85-92%: GOOD TO PROCEED
- 92-100%: PRODUCTION-READY

**Tasks**:
1. **Launch parameter-normalizer-specialist**
   - Description: Analyze parameter validation errors, normalization issues, and suggest improvements to parameter handling
   - Priority: HIGH (if validation errors found)
   - Specialist: parameter-normalizer-specialist
   - Use Template: Specialist Task Template

2. **Launch mcp-integration-specialist**
   - Description: Review tool descriptions, discoverability, UX patterns, and suggest integration improvements
   - Priority: HIGH (if UX issues found)
   - Specialist: mcp-integration-specialist

3. **Launch architectural-review-specialist**
   - Description: Analyze overall architecture, identify structural issues, suggest design improvements
   - Priority: HIGH (always run for architectural perspective)
   - Specialist: architectural-review-specialist

4. **Launch domain-specific specialist if available**
   - Description: Use specialist for specific domain (e.g., auth-permissions-specialist for auth issues, performance-analyst-specialist for speed issues)
   - Priority: MEDIUM
   - Specialist: [domain-specific specialist]

5. **Consolidate specialist recommendations**
   - Description: Compile all specialist reports. Extract: Priority 1 (immediate), Priority 2 (short-term), Priority 3 (long-term) recommendations. Calculate weighted confidence.
   - Priority: HIGH

6. **Create implementation plan**
   - Description: Based on specialist recommendations and error priorities, create detailed implementation plan with: Files to modify, Changes needed, Testing approach, Estimated effort
   - Priority: HIGH

---

### **Stage 8: Implementation**

**Purpose**: Code the fixes and enhancements

**Tasks** (Dynamic - one task per fix):
1. **Fix: [Error name or feature name]**
   - Description: Use Implementation Task Template (see Templates section)
   - Priority: Match error priority
   - Status: IN_PROGRESS while coding, COMPLETED when done

2. **Update validation schemas**
   - Description: Modify validation rules based on findings. File: lib/validation/mcp-action-validation.ts
   - Priority: HIGH (if validation changes needed)

3. **Update tool handlers**
   - Description: Modify tool handler logic. Files: lib/mcp/server/tools/*.js or lib/mcp/tasks/action/handlers/*
   - Priority: HIGH

4. **Update formatters and utilities**
   - Description: Enhance response formatting, error messages, helper functions
   - Priority: MEDIUM

5. **Add new features if applicable**
   - Description: Implement new capabilities identified during testing (e.g., new parameters, enhanced responses)
   - Priority: Varies

---

### **Stage 9: Code Review, Validation, and Deployment**

**Purpose**: Verify changes and deploy to production

**Tasks**:
1. **Run npm run lint**
   - Description: Execute linter to check for TypeScript errors, syntax issues, unused imports
   - Priority: HIGH
   - Expected: No errors (warnings OK)

2. **Fix TypeScript compilation errors**
   - Description: Resolve any compilation errors found by linter. Common issues: Type mismatches, Missing properties, Import errors
   - Priority: HIGH
   - Status: Iterate until build passes

3. **Verify backward compatibility**
   - Description: Ensure changes don't break existing functionality. Check: Optional parameters default correctly, Existing tests pass, API contracts maintained
   - Priority: HIGH

4. **Review code changes for security issues**
   - Description: Scan changes for: SQL injection risks, XSS vulnerabilities, Auth bypasses, Data leakage
   - Priority: HIGH
   - Specialist: sec-ops-specialist (if major security changes)

5. **Test fixes locally if possible**
   - Description: For changes that can be tested locally (validation, formatting), verify before deployment
   - Priority: MEDIUM

6. **Stage all changes**
   - Description: Run git add -A and verify correct files staged with git status
   - Priority: HIGH

7. **Create comprehensive commit message**
   - Description: Write detailed commit message with: What changed, Why changed, Impact, Testing performed, Files modified. Include "Generated with Claude Code" footer.
   - Priority: HIGH
   - Template: feat/fix/refactor(mcp): [Brief description]

8. **Push to main branch**
   - Description: Execute git push origin main. Triggers GitHub Actions deployment workflow.
   - Priority: HIGH

9. **Monitor GitHub Actions deployment**
   - Description: Watch deployment at github.com/steveterryp/copov15/actions. Wait for green checkmark. Check for failures.
   - Priority: HIGH
   - Duration: 5-10 minutes

10. **Verify deployment health check**
    - Description: Call curl https://paichart.app/api/health and verify status healthy
    - Priority: HIGH
    - Specialist: dev-ops-specialist (if deployment fails)

11. **Check production logs for errors**
    - Description: SSH to production and check logs for any errors: tail -50 /var/log/paichart/mcp-error-0.log
    - Priority: MEDIUM
    - Optional: Only if health check fails

---

## Phase 3: Assessment and Iteration (REVIEW)

**Type**: REVIEW
**Duration**: 15% of total (e.g., 13 days for 90-day POV)
**Purpose**: Validate fixes, capture knowledge, plan next iteration

### **Stage 10: Post-Deployment Verification and Performance**

**Purpose**: Confirm fixes work in production and validate performance

**Smoke Test Pattern** (Quick 3-5 minute verification):
```
For each bug fixed:
1. Test the specific bug scenario that was fixed
2. Test one related happy path (ensure no regression)
3. Test one error case (verify error handling still works)

Example from Sprint 3:
- BUG-001: template(action: "list") → verify "Found 10 of 15 total" (was "0 of 0")
- BUG-002: list_prompts → verify useCase truncated with "..."
- BUG-003: project(action: "task.list") with invalid enum → verify instant error (not timeout)

Result: Immediate confidence in 3-5 minutes before deeper verification
```

**Task Addendum Pattern** (Document fixes on completed tasks):
```
After marking task COMPLETED, add comment with:

ADDENDUM (Date):

ROOT CAUSE: Why the bug occurred
FIX: What code changes were made
FILES MODIFIED: List of files changed
LEARNING: Reusable insight for future

Example:
"ROOT CAUSE: extractPagination() didn't handle nested API structures
FIX: Added checks for named arrays (templates, items, tasks, povs)
FILES MODIFIED: lib/mcp/server/utils/metadata-enhancer.js
LEARNING: API response structures vary - check both top-level and nested"
```

**Tasks**:
1. **Re-authenticate to MCP server**
   - Description: Run /mcp authenticate to reconnect with deployed changes. Verify authentication successful.
   - Priority: HIGH

2. **Test fixed errors are resolved**
   - Description: Re-run tests that previously failed. Verify each fix works. Document: Error before, Fix applied, Error after (should be resolved)
   - Priority: HIGH

3. **Test enhanced features work correctly**
   - Description: Test new parameters, improved error messages, enhanced responses. Verify improvements deliver expected UX.
   - Priority: HIGH

4. **Verify no regressions**
   - Description: Test tools that weren't changed. Ensure existing functionality still works. Check: Same inputs produce same outputs, Performance not degraded
   - Priority: HIGH

5. **Measure error reduction percentage**
   - Description: Calculate: Errors before iteration, Errors after iteration, Percentage reduction. Document impact.
   - Priority: MEDIUM

6. **Measure tool response times**
   - Description: Test each tool and record: Response time, Payload size, Database queries, Network calls. Target: <1s for simple tools, <3s for complex tools
   - Priority: MEDIUM
   - Output: Performance baseline metrics

7. **Test with large datasets**
   - Description: Test tools with realistic loads: project(action: "pov.list") with 100+ POVs, project(action: "task.list") with 1000+ tasks, search with large result sets. Verify: Pagination works, timeouts don't occur, memory usage acceptable
   - Priority: MEDIUM
   - Output: Load testing results

8. **Concurrent request testing**
   - Description: Simulate multiple users calling tools simultaneously. Verify: Race conditions handled, atomic operations work, no data corruption, proper locking
   - Priority: LOW
   - Specialist: performance-analyst-specialist
   - Output: Concurrent access report

9. **Database query optimization check**
   - Description: Review queries generated by tools. Check: Proper indexes used, N+1 queries avoided, joins optimized, unnecessary data not fetched
   - Priority: LOW
   - Specialist: database-manager-specialist
   - Files: Check console logs for Prisma queries
   - Output: Query optimization recommendations

---

### **Stage 11: Documentation, Retrospective, and Next Planning**

**Purpose**: Preserve learnings, assess results, and plan next steps

**Tasks**:
1. **Create or update domain testing documentation**
   - Description: Write comprehensive guide for domain. Include: Tools tested, Use cases, Workflows, Error patterns, Best practices
   - Priority: MEDIUM
   - Output: MCP_[DOMAIN]_TESTING_V2.md

2. **Document tool rationalization decisions**
   - Description: Capture decisions on: Which tools to keep/consolidate, Why certain approaches chosen, Tradeoffs considered
   - Priority: LOW
   - Output: Section in domain doc

3. **Capture workflow patterns and best practices**
   - Description: Document discovered patterns: Common tool sequences, Parameter passing patterns, Error recovery approaches
   - Priority: MEDIUM

4. **Update training content if applicable**
   - Description: Add tasks to pAIchart Fundamentals or Use Cases POVs based on learnings
   - Priority: LOW

5. **Assess iteration impact**
   - Description: Measure outcomes: Errors fixed count, Features added, Code changes (files/lines), Error reduction percentage, User experience improvement
   - Priority: HIGH

6. **Review what worked well and what didn't**
   - Description: Retrospective analysis: What accelerated progress, What slowed us down, What would we do differently, What patterns to repeat
   - Priority: MEDIUM

7. **Identify remaining issues for next iteration**
   - Description: List unfixed errors from this iteration. Categorize: Deferred (low priority), Blocked (dependencies), Punted (out of scope)
   - Priority: MEDIUM

8. **Decide: fix remaining issues OR test new domain**
   - Description: Strategic choice: Continue fixing errors in current domain OR Move to new domain and return later. Consider: Error severity, Diminishing returns, Other domain priority
   - Priority: HIGH

9. **Plan next iteration or domain**
   - Description: If continuing same domain: Plan Iteration N+1 fixes. If new domain: Select next domain and create new POV following this template.
   - Priority: HIGH

---

## Usage Instructions

### **Creating a New Domain Testing POV**

**Step 1**: Create POV using pov.create
```javascript
perform(action: "execute")({
  action: "pov.create",
  parameters: {
    title: "MCP [Domain Name] Testing & Improvement",
    description: "Iterative testing enhancement and optimization of [Domain] tools and workflows. Track errors analyze with specialists implement fixes and measure impact.",
    countryName: "Australia",
    duration: 90,
    customerName: "Internal - pAIchart Platform",
    objective: "Achieve 90 percent error reduction in [Domain] and optimize user experience",
    priority: "HIGH"
  }
})
```

**Step 2**: Create 11 stages (using globally unique numbering)

**Phase 1 - Planning and Scoping** (Stages 1-3):
1. Domain and Tool Scope
2. Test Planning and Stage Design
3. UX and Message Quality Review

**Phase 2 - Execute Testing and Implementation** (Stages 4-9):
4. Tool Testing and Validation
5. Error Discovery and Documentation
6. Validation and Security Review
7. Specialist Analysis and Recommendations
8. Implementation
9. Code Review, Validation, and Deployment

**Phase 3 - Assessment and Iteration** (Stages 10-11):
10. Post-Deployment Verification and Performance
11. Documentation, Retrospective, and Next Planning

**Step 3**: Populate with domain-specific tasks using this template

**Step 4**: Execute the workflow, marking tasks as you progress

---

## Workflow Patterns

### **Pattern 1: Systematic Parameter Testing**

**Phase 1: Task Creation** (BEFORE testing):
```
For each tool in domain:
  1. Review JSDoc for tool parameters
  2. Create task for EACH required parameter:
     "Test [tool] - [param1 name] parameter"
  3. Create task for EACH optional parameter:
     "Test [tool] - [param2 name] parameter (optional)"
  4. Create task for parameter combinations:
     "Test [tool] - Multiple parameters"
  5. Create task for edge cases:
     "Test [tool] - Edge cases and boundaries"
  6. All tasks start as OPEN
```

**Phase 2: Test Execution** (AFTER all tasks created):
```
For each test task:
  1. Mark IN_PROGRESS
  2. Execute tool with test parameters
  3. Document result using Test PASS/FAIL Template
  4. If PASS: Mark COMPLETED
  5. If FAIL: Create ERROR task in Stage 5, keep test OPEN
```

**Benefits**:
- **POV completion rate = Test coverage percentage**
- Comprehensive parameter coverage (no missed parameters)
- Clear what's tested (completed) vs not tested (open)
- Errors immediately documented
- No separate test matrix needed
- Native tracking in pAIchart

---

### **Pattern 2: Error Analysis as Tasks**

**Flow**:
```
When error encountered:
  1. Create task: "ERROR: [exact error message]"
  2. Set status: IN_PROGRESS
  3. Document using ERROR Task Template
  4. Leave IN_PROGRESS until fixed
  5. Mark COMPLETED when fix deployed and verified
```

**Benefits**:
- Every error tracked individually
- Full context preserved
- Easy to prioritize and assign
- Clear when resolved

---

### **Pattern 3: Specialist Task Assignment**

**Flow**:
```
When specialists needed:
  1. Create task using Specialist Task Template
  2. Assign agent template if available
  3. Set status: IN_PROGRESS
  4. Execute specialist agent
  5. Capture recommendations in task description or comments
  6. Mark COMPLETED when analysis received
  7. Use recommendations to create Implementation tasks
```

**Confidence Integration** (from specialist-review-protocol.md):
- Target 90%+ confidence for major features
- Document weighted confidence from multiple specialists
- If < 75%, require revision before proceeding

---

### **Pattern 4: Implementation Task per Fix**

**Flow**:
```
For each fix from specialist recommendations:
  1. Create task using Implementation Task Template
  2. Set status: IN_PROGRESS when coding
  3. Update description with actual changes made
  4. Include commit hash when committed
  5. Mark COMPLETED when deployed
```

**Benefits**:
- Every fix tracked separately
- Clear what was changed where
- Commit hashes linked to tasks
- Audit trail for changes

---

## Success Metrics

### **Per Iteration**:
- Tools tested: X/Y (aim for 100% domain coverage)
- Errors found: N errors
- Errors fixed: M errors (aim for 70%+ of found errors)
- Error reduction: Z% (measured pre/post)
- Code changes: Files modified, lines added/removed
- Deployment success: Yes/No
- Time to deploy: Minutes

### **Per Domain**:
- Total iterations: Count
- Total tools tested: X tools
- Total errors found and fixed: N/M
- Overall error reduction: Percentage
- Features added: Count
- User experience improvement: Qualitative assessment

### **Across All Domains**:
- Domains completed: X/6
- Total tool coverage: Percentage of 93 MCP APIs
- Overall platform error rate: Baseline vs current
- Web UI dependency: Percentage eliminated
- AI-first workflows: Count enabled

---

## Template POV Creation Example

**Command**:
```javascript
perform(action: "execute")({
  action: "pov.create",
  parameters: {
    title: "MCP Agent Automation Testing & Improvement",
    description: "Test agent lifecycle tools (configure assign execute status results). Document errors analyze with specialists implement fixes. Goal: Enable complete agent automation via MCP without web UI.",
    countryName: "Australia",
    duration: 90,
    customerName: "Internal - pAIchart Platform",
    objective: "Achieve seamless agent automation through MCP with 90 percent error reduction",
    priority: "HIGH"
  }
})
```

**Then create 11 stages using stage.create following this template**

**Then populate with tasks from each stage section above**

---

## Common Root Causes (Growing List)

This section captures recurring bug patterns discovered during testing. Use this to anticipate issues in new domains.

### 1. Nested API Response Structures
**Symptom**: Pagination shows "0 of 0" or incorrect counts
**Root Cause**: API returns `{ data: { items: [...], pagination: {...} } }` but code expects `{ data: [...], pagination: {...} }`
**Fix Pattern**: Check for named arrays (templates, items, tasks, povs) and nested pagination
**Sprint**: Sprint 3, BUG-001

### 2. Large Field Values in List Responses
**Symptom**: Response sizes 50KB-100KB+, slow rendering
**Root Cause**: Full content (descriptions, useCases) returned in list views
**Fix Pattern**: Truncate to preview length (e.g., 200 chars) for lists, keep full in detail views
**Sprint**: Sprint 3, BUG-002

### 3. Invalid Enum Handling
**Symptom**: Long timeouts (30s+) instead of quick error
**Root Cause**: Invalid enum passed to Prisma, database query runs before failing
**Fix Pattern**: Early validation BEFORE database query with helpful error listing valid values
**Sprint**: Sprint 3, BUG-003

### 4. UI/MCP Limit Misalignment
**Symptom**: Users confused when data truncated unexpectedly
**Root Cause**: MCP truncates but UI allows unlimited input
**Fix Pattern**: UI shows limits with hints ("First 200 chars shown in list views")
**Sprint**: Sprint 3, BUG-002 follow-up

### 5. (Add more as discovered)
**Symptom**: [Description]
**Root Cause**: [Analysis]
**Fix Pattern**: [Solution]
**Sprint**: [Reference]

---

## Anti-Patterns to Avoid

### Don't: Create markdown documents for tracking
**Do**: Create tasks in POV stages

### Don't: Batch error documentation
**Do**: One task per unique error with full analysis

### Don't: Skip specialist analysis
**Do**: Always run specialists for systematic recommendations

### Don't: Deploy without testing locally
**Do**: Run lint and verify compilation before push

### Don't: Create tasks with status OPEN for completed work
**Do**: Set appropriate status (COMPLETED for past, IN_PROGRESS for current, OPEN for future)

### Don't: Use web UI for POV/phase/stage/task creation
**Do**: Use pov.create, stage.create, task.create MCP actions exclusively

### Don't: Skip Gold Standard assessment
**Do**: Review tools against mcp-tool-gold-standard-pattern.md before proceeding

### Don't: Ignore specialist confidence thresholds
**Do**: Reference specialist-review-protocol.md and achieve 90%+ before major changes

---

## Benefits of This Methodology

1. **Consistent**: Same structure for every domain
2. **Trackable**: Completion rates, progress visible
3. **Searchable**: Find any error or fix via search
4. **Analyzable**: Use task_audit_and_planning on testing POVs
5. **Collaborative**: Can assign tasks to team members
6. **Native**: Everything in pAIchart, zero external docs
7. **AI-First**: Leverages MCP tools we're improving
8. **Auditable**: Complete history in tasks and commits
9. **Quality-Focused**: Gold Standard and confidence thresholds integrated

---

## Related Documentation

**Protocols**:
- `/.claude/knowledge/protocols/discovery-first-workflow-guide.md` - Discovery before modification
- `/.claude/knowledge/protocols/specialist-review-protocol.md` - When to run specialists, confidence thresholds
- `/.claude/knowledge/protocols/endpoint-security-audit-protocol.md` - Security audit methodology

**Patterns**:
- `/.claude/knowledge/patterns/mcp-tool-gold-standard-pattern.md` - 9 Gold Standards for tool excellence (98% confidence)
- `/.claude/knowledge/patterns/mcp-tool-ux-pattern.md` - Baseline UX requirements

**Domain Knowledge**:
- `/.claude/knowledge/domain/mcp/mcp-layer-jsdoc-reference.md` - Complete MCP API reference (93 APIs)

**Specialists**:
- `/.claude/agents/parameter-normalizer-specialist.md`
- `/.claude/agents/mcp-integration-specialist.md`
- `/.claude/agents/architectural-review-specialist.md`
- `/.claude/agents/sec-ops-specialist.md`
- `/.claude/agents/performance-analyst-specialist.md`
- `/.claude/agents/database-manager-specialist.md`
- `/.claude/agents/dev-ops-specialist.md`

**Production Operations**:
- `/.claude/knowledge/PRODUCTION_OPERATIONS_GUIDE.md` - Deployment and debugging

---

## Revision History

**v2.1** (2025-12-22): Sprint 3 Learnings
- **Added**: Smoke Test Pattern for quick 3-5 minute production verification
- **Added**: Bug Naming Convention (BUG-XXX format with examples)
- **Added**: Task Addendum Pattern for documenting fixes on completed tasks
- **Added**: Common Root Causes section with 4 patterns from Sprint 3
- **Added**: Cross-Layer Validation task in Stage 6
- **Updated**: Stage 5 to support BUG-XXX naming
- **Updated**: Confidence to 98% after successful smoke tests
- **Validated**: All 3 Sprint 3 bugs fixed and verified in production

**v2.0** (2025-12-22): Architectural Review Improvements
- **Fixed**: Stage numbering now globally unique (1-11)
- **Fixed**: Merged ".5" stages into main stages
- **Fixed**: Updated "9 stages" claim to accurate "11 stages"
- **Added**: Templates section with 5 standardized templates
- **Added**: Test PASS template (was missing)
- **Added**: Gold Standard Pattern reference (Stage 3)
- **Added**: Cross-references to related protocols
- **Added**: Validation commands with npm scripts
- **Added**: Consistent specialist assignments
- **Added**: Confidence threshold references
- **Improved**: Stage Overview table for quick reference
- **Confidence**: 97% (up from 95%)
- **Reviewed by**: architectural-review-specialist

**v1.0** (2025-12-18): Initial methodology created
- Based on 3 successful iterations
- Validated through Basic Tools domain testing
- Confidence: 95%
- Created via: MCP native workflow (no documents used during execution!)

---

**File Location**: `/.claude/knowledge/protocols/mcp-domain-testing-methodology-v2.md`
**Status**: Production-ready protocol (v2.1)
**Confidence**: 98%
**Next**: Apply to Agent Automation, MCP Hub, Browser Automation domains
