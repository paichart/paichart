# MCP Domain Testing & Improvement Methodology

**Type**: Workflow Protocol
**Purpose**: Standardized methodology for iterative MCP domain testing, error analysis, and improvement
**Created**: December 18, 2025
**Status**: Production - Active methodology for all MCP domains
**Confidence**: 95% (validated through 3 iterations)

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

## Phase 1: Planning and Scoping (PLANNING)

**Type**: PLANNING
**Duration**: 15% of total (e.g., 14 days for 90-day POV)
**Purpose**: Scope the domain, identify tools, plan test scenarios

### **Stage 1: Domain and Tool Scope**

**Purpose**: Define what we're testing and understand the tools

**Tasks**:
1. **Select domain for testing iteration**
   - Description: Define the task as action. create a prompt to read the relevant files using file/path/function/description
   - Priority: HIGH
   - Output: Domain name and justification

2. **Provide context for selected domain**
   - Description: Identify the files/paths/description of all relevant routes, handlers, api's, normalizers, mappers, validation etc
   - Priority: HIGH
   - Output: List of files/paths/descriptions/functions/api's

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

### **Stage 2: Test Planning**

**Purpose**: Prepare for testing with clear success criteria

**Tasks**:
1. **Define success criteria for tool testing**
   - Description: What constitutes successful testing? Coverage percentage, error rate targets, workflow completeness
   - Priority: MEDIUM
   - Output: Success metrics and thresholds

2. **Identify tools requiring authentication vs public access**
   - Description: Categorize tools by auth requirements. Note: Most MCP tools require authentication
   - Priority: HIGH
   - Output: Auth requirements matrix

3. **Plan workflow test sequences**
   - Description: Define multi-tool workflows to test. Example: search → fetch → project(action: "pov.details") → perform(action: "execute")
   - Priority: HIGH
   - Output: Workflow test plans (5-8 sequences)

4. **Prepare test data**
   - Description: Gather POV IDs, task IDs, template IDs, team member IDs needed for testing. Use existing POVs or create test POV.
   - Priority: MEDIUM
   - Output: Test data reference sheet

5. **Document expected vs actual behavior framework**
   - Description: Create template for documenting: Tool called, Input parameters, Expected output, Actual output, Status (pass/fail), Notes
   - Priority: LOW
   - Output: Test result documentation template

---

### **Stage 2.5: Stage and Task Design**

**Purpose**: Design logical stage groupings to keep test tasks manageable (5-6 per stage)

**CRITICAL**: Prevents overwhelming single-stage with 100+ test tasks

**Tasks**:
1. **Count total tools and parameters in domain**
   - Description: Review JSDoc for domain. Count: Total tools, Total parameters across all tools, Average parameters per tool. Calculate estimated test tasks.
   - Priority: HIGH
   - Output: Tool and parameter inventory with counts

2. **Design logical tool groupings for stages**
   - Description: Group tools by: Functionality (CRUD, List, Analytics), Entity type (POV, Task, Agent), Complexity (simple vs complex), Dependencies (which tools feed into others). Target: 5-6 tasks per stage.
   - Priority: HIGH
   - Output: Stage design with tool assignments

3. **Split large tools into parameter-focused substages**
   - Description: For tools with 9+ parameters (e.g., task.update, perform(action: "execute")), create multiple stages. Example: "task.update - Required params" (2 tasks), "task.update - Status and Assignment" (3 tasks), "task.update - Metadata and Dates" (3 tasks).
   - Priority: HIGH
   - Output: Substage breakdown for complex tools

4. **Create Execution Phase stage structure**
   - Description: Define stage names and purposes. Example: Stage 1 "Task CRUD Testing" (6 tasks), Stage 2 "Agent Lifecycle Testing" (5 tasks), Stage 3 "Integration Workflows" (6 tasks). Use perform(action: "execute") with action=stage.create to create these stages.
   - Priority: HIGH
   - Output: Complete stage structure created in POV

5. **Verify 5-6 task target per stage**
   - Description: Review designed stages. Check each has 5-6 tasks maximum. If any stage exceeds 8 tasks, split further. If any stage has only 1-2 tasks, consider merging.
   - Priority: MEDIUM
   - Output: Balanced stage design (all stages 4-7 tasks)

6. **Document stage-to-tool-to-parameter mapping**
   - Description: Create reference showing: Stage name → Tools in stage → Parameters to test per tool. This becomes the blueprint for task creation.
   - Priority: MEDIUM
   - Output: Complete testing blueprint (stage → tool → parameter hierarchy)

**Example Design**:

```
Domain: perform(action: "execute") (14 actions, ~50 total parameters)

Stage 1: Task CRUD Testing
  - task.create (6 params to test)
  - task.update (6 params to test)
  = 12 tasks total → SPLIT!

Better Design:
Stage 1: Task Creation and Updates
  - task.create - required params (3 tasks)
  - task.create - optional params (3 tasks)

Stage 2: Task Status and Assignment
  - task.update - status param (1 task)
  - task.update - assignee param (2 tasks)
  - task.assign (2 tasks)
  - task.complete (1 task)

Stage 3: Task Comments and Metadata
  - task.comment (2 tasks)
  - task metadata fields (3 tasks)
```

**Benefits**:
- Manageable task counts (5-6 per stage)
- Logical groupings aid understanding
- Progress visible stage-by-stage
- Easier to parallelize testing
- Clear completion milestones

**Critical Success Factor**: Do this BEFORE creating any test tasks!

---

### **Stage 3: UX and Message Quality Review**

**Purpose**: Assess user experience quality before implementation

**Tasks**:
1. **Review error message quality and actionability**
   - Description: Test each tool's error messages. Check: Do errors show what's wrong? Do they suggest fixes? Do they provide examples? Are invalid characters shown exactly? Can users recover without support?
   - Priority: HIGH
   - Specialist: parameter-normalizer-specialist
   - Output: Error message quality scorecard

2. **Review tool descriptions and discoverability**
   - Description: Assess tool descriptions in tool-schemas.js. Check: Are examples provided? Is "when to use" guidance clear? Are workflows documented? Are parameter aliases explained? Can users find the right tool?
   - Priority: HIGH
   - Specialist: mcp-integration-specialist
   - Output: Tool description enhancement plan

3. **Review elicitation prompts and next-step guidance**
   - Description: Check if tools suggest next steps. Verify: Do responses include "Next Steps"? Are suggestions contextual (use actual IDs from response)? Are tool chains documented? Do users know what to do after each tool call?
   - Priority: MEDIUM
   - Specialist: mcp-integration-specialist
   - Output: Elicitation coverage report

4. **Assess parameter naming and consistency**
   - Description: Verify parameter consistency across tools. Check: Are aliases documented (povId vs pov_id)? Are required vs optional clear? Is naming consistent? Do similar tools use similar parameter names?
   - Priority: MEDIUM
   - Output: Parameter consistency matrix

5. **Test response format consistency**
   - Description: Verify all tools return consistent formats. Check: Metadata structure (_meta field), error format, success messages, pagination info. Is format predictable?
   - Priority: LOW
   - Specialist: architectural-review-specialist
   - Output: Response format standardization recommendations

---

## Phase 2: Execute Testing and Implementation (EXECUTION)

**Type**: EXECUTION
**Duration**: 70% of total (e.g., 63 days for 90-day POV)
**Purpose**: Test tools, document errors, analyze issues, implement fixes, deploy

### **Stage 1: Tool Testing and Validation**

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
□ Test task.update - taskId (required)
□ Test task.update - title parameter
□ Test task.update - description parameter
□ Test task.update - priority parameter
□ Test task.update - status parameter
□ Test task.update - dueDate parameter
□ Test task.update - assigneeId parameter
□ Test task.update - Multiple parameters combined
□ Test task.update - Edge cases (empty, null, invalid)
```

**Testing Pattern** (After tasks created):
```
For each test task:
  1. Mark task IN_PROGRESS
  2. Execute tool with test parameters
  3. Document result in task description
  4. If PASS: Mark COMPLETED
  5. If FAIL: Create ERROR task in Stage 2, keep test task OPEN
```

**Coverage Tracking**:
- **Completion Rate = Test Coverage Percentage**
- Completed tasks / Total tasks = % of parameters tested
- Easy to see what's tested (✅) vs not tested (⏳)
- **The POV IS the test matrix!**

**Workflow Integration Tests**:

7. **Test Workflow: [Tool Chain Name]**
   - Description: Multi-tool sequence. Example: "Discovery to Creation: project(action: "pov.list") → project(action: "pov.details") → task.create"
   - Verify: IDs flow correctly, each step uses previous output
   - Priority: HIGH

**Result Summary**:

8. **Document test coverage summary**
   - Description: Calculate: Total parameters, Parameters tested, Coverage %, Success rate, Errors found
   - Priority: MEDIUM

**Critical**: By creating ALL parameter test tasks upfront, you ensure comprehensive coverage and the POV completion rate directly reflects test coverage.

---

### **Stage 2: Error Discovery and Documentation**

**Purpose**: Document every error with full analysis

**Tasks** (Dynamic - one task per error):
1. **ERROR: [Exact error message or condition]**
   - Description template:
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

### **Stage 2.5: Validation and Security Review**

**Purpose**: Ensure validation coverage and security before proceeding

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
   - Output: Security audit report with risk assessment

4. **Validate enum parity**
   - Description: Ensure Prisma enums match Zod validation enums. Check: TaskPriority, POVStatus, PhaseType, TaskStatus. Run npm run test:enum-parity if available.
   - Priority: MEDIUM
   - Output: Enum consistency verification

5. **Test CUID format enforcement**
   - Description: Verify all ID fields use CUID format (not UUID). Check: povId, taskId, phaseId, stageId validation patterns.
   - Priority: LOW
   - Output: ID format compliance report

---

### **Stage 4: Specialist Analysis and Recommendations**

**Purpose**: Get expert analysis and implementation guidance

**Tasks**:
1. **Launch parameter-normalizer-specialist**
   - Description: Analyze parameter validation errors, normalization issues, and suggest improvements to parameter handling
   - Priority: HIGH (if validation errors found)
   - Agent: Assign parameter-normalizer-specialist

2. **Launch mcp-integration-specialist**
   - Description: Review tool descriptions, discoverability, UX patterns, and suggest integration improvements
   - Priority: HIGH (if UX issues found)
   - Agent: Assign mcp-integration-specialist

3. **Launch architectural-review-specialist**
   - Description: Analyze overall architecture, identify structural issues, suggest design improvements
   - Priority: HIGH (always run for architectural perspective)
   - Agent: Assign architectural-review-specialist

4. **Launch domain-specific specialist if available**
   - Description: Use specialist for specific domain (e.g., auth-permissions-specialist for auth issues, performance-analyst-specialist for speed issues)
   - Priority: MEDIUM
   - Agent: Assign domain specialist

5. **Consolidate specialist recommendations**
   - Description: Compile all specialist reports. Extract: Priority 1 (immediate), Priority 2 (short-term), Priority 3 (long-term) recommendations
   - Priority: HIGH

6. **Create implementation plan**
   - Description: Based on specialist recommendations and error priorities, create detailed implementation plan with: Files to modify, Changes needed, Testing approach, Estimated effort
   - Priority: HIGH

---

### **Stage 5: Implementation**

**Purpose**: Code the fixes and enhancements

**Tasks** (Dynamic - one task per fix):
1. **Fix: [Error name or feature name]**
   - Description: Implement fix for specific error or enhancement. Include: Files modified, Changes made, Code snippets, Testing performed
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

### **Stage 6: Code Review and Validation**

**Purpose**: Verify changes before deployment

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
   - Use: sec-ops-specialist if major security changes

5. **Test fixes locally if possible**
   - Description: For changes that can be tested locally (validation, formatting), verify before deployment
   - Priority: MEDIUM

---

### **Stage 7: Deployment**

**Purpose**: Deploy to production and monitor

**Tasks**:
1. **Stage all changes**
   - Description: Run git add -A and verify correct files staged with git status
   - Priority: HIGH

2. **Create comprehensive commit message**
   - Description: Write detailed commit message with: What changed, Why changed, Impact, Testing performed, Files modified. Include "Generated with Claude Code" footer.
   - Priority: HIGH
   - Template: feat/fix/refactor(mcp): [Brief description]

3. **Push to main branch**
   - Description: Execute git push origin main. Triggers GitHub Actions deployment workflow.
   - Priority: HIGH

4. **Monitor GitHub Actions deployment**
   - Description: Watch deployment at github.com/steveterryp/copov15/actions. Wait for green checkmark. Check for failures.
   - Priority: HIGH
   - Duration: 5-10 minutes

5. **Verify deployment health check**
   - Description: Call curl https://paichart.app/api/health and verify status healthy
   - Priority: HIGH

6. **Check production logs for errors**
   - Description: SSH to production and check logs for any errors: tail -50 /var/log/paichart/mcp-error-0.log
   - Priority: MEDIUM
   - Optional: Only if health check fails

---

## Phase 3: Assessment and Iteration (REVIEW)

**Type**: REVIEW
**Duration**: 15% of total (e.g., 13 days for 90-day POV)
**Purpose**: Validate fixes, capture knowledge, plan next iteration

### **Stage 1: Post-Deployment Verification**

**Purpose**: Confirm fixes work in production

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

---

### **Stage 1.5: Performance and Load Testing**

**Purpose**: Validate performance under realistic conditions

**Tasks**:
1. **Measure tool response times**
   - Description: Test each tool and record: Response time, Payload size, Database queries, Network calls. Target: <1s for simple tools, <3s for complex tools
   - Priority: MEDIUM
   - Output: Performance baseline metrics

2. **Test with large datasets**
   - Description: Test tools with realistic loads: project(action: "pov.list") with 100+ POVs, project(action: "task.list") with 1000+ tasks, search with large result sets. Verify: Pagination works, timeouts don't occur, memory usage acceptable
   - Priority: MEDIUM
   - Output: Load testing results

3. **Concurrent request testing**
   - Description: Simulate multiple users calling tools simultaneously. Verify: Race conditions handled, atomic operations work, no data corruption, proper locking
   - Priority: LOW
   - Specialist: performance-analyst-specialist
   - Output: Concurrent access report

4. **Database query optimization check**
   - Description: Review queries generated by tools. Check: Proper indexes used, N+1 queries avoided, joins optimized, unnecessary data not fetched
   - Priority: LOW
   - Files: Check console logs for Prisma queries
   - Output: Query optimization recommendations

5. **Memory and resource usage profiling**
   - Description: Monitor server resource usage during tool calls. Check: Memory leaks, connection pool exhaustion, file handle limits
   - Priority: LOW
   - Output: Resource usage profile

---

### **Stage 2: Documentation and Knowledge Capture**

**Purpose**: Preserve learnings for future use

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

5. **Create v2 comprehensive guide**
   - Description: Compile all learnings into comprehensive v2 document with: Real workflow examples, Prompt execution patterns, Performance metrics, Recommendations
   - Priority: MEDIUM

---

### **Stage 3: Iteration Retrospective and Next Planning**

**Purpose**: Assess results and decide next steps

**Tasks**:
1. **Assess iteration impact**
   - Description: Measure outcomes: Errors fixed count, Features added, Code changes (files/lines), Error reduction percentage, User experience improvement
   - Priority: HIGH

2. **Review what worked well and what didn't**
   - Description: Retrospective analysis: What accelerated progress, What slowed us down, What would we do differently, What patterns to repeat
   - Priority: MEDIUM

3. **Identify remaining issues for next iteration**
   - Description: List unfixed errors from this iteration. Categorize: Deferred (low priority), Blocked (dependencies), Punted (out of scope)
   - Priority: MEDIUM

4. **Decide: fix remaining issues OR test new domain**
   - Description: Strategic choice: Continue fixing errors in current domain OR Move to new domain and return later. Consider: Error severity, Diminishing returns, Other domain priority
   - Priority: HIGH

5. **Plan next iteration or domain**
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

**Step 2**: Create 9 stages (3 per phase)

**Phase 1 - Planning and Scoping**:
1. Domain and Tool Scope
2. Test Planning

**Phase 2 - Execute Testing and Implementation**:
3. Tool Testing and Validation
4. Error Discovery and Documentation
5. Specialist Analysis and Recommendations
6. Implementation
7. Code Review and Validation
8. Deployment

**Phase 3 - Assessment and Iteration**:
9. Post-Deployment Verification
10. Documentation and Knowledge Capture
11. Iteration Retrospective and Next Planning

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

**Example - task.update creates 9 test tasks**:
```
1. Test task.update - taskId (required)
2. Test task.update - title parameter
3. Test task.update - description parameter
4. Test task.update - priority parameter
5. Test task.update - status parameter
6. Test task.update - dueDate parameter
7. Test task.update - assigneeId parameter
8. Test task.update - Multiple parameters combined
9. Test task.update - Edge cases
```

**Phase 2: Test Execution** (AFTER all tasks created):
```
For each test task:
  1. Mark IN_PROGRESS
  2. Execute tool with test parameters
  3. Document result in task description:
     - Input: [exact parameters]
     - Output: [response or error]
     - Status: PASS/FAIL
     - Notes: [observations]
  4. If PASS: Mark COMPLETED
  5. If FAIL: Create ERROR task in Stage 2, keep test OPEN
```

**Benefits**:
- **POV completion rate = Test coverage percentage**
- Comprehensive parameter coverage (no missed parameters)
- Clear what's tested ✅ vs not tested ⏳
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
  3. Document in description:
     - Error text
     - Input that caused it
     - Expected behavior
     - Actual behavior
     - Root cause analysis
     - Fix options (numbered)
     - Recommended fix
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
  1. Create task: "Launch [specialist-name]"
  2. Assign agent template if available
  3. Set status: IN_PROGRESS
  4. Execute specialist agent
  5. Capture recommendations in task description or comments
  6. Mark COMPLETED when analysis received
  7. Use recommendations to create Implementation tasks
```

**Benefits**:
- Specialist work tracked
- Recommendations preserved
- Easy to refer back

---

### **Pattern 4: Implementation Task per Fix**

**Flow**:
```
For each fix from specialist recommendations:
  1. Create task: "Fix: [error or feature name]"
  2. Description: Files to modify, changes needed, testing approach
  3. Set status: IN_PROGRESS when coding
  4. Update description with actual changes made
  5. Include commit hash when committed
  6. Mark COMPLETED when deployed
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

**Then create 9 stages using stage.create following this template**

**Then populate with tasks from each stage section above**

---

## Anti-Patterns to Avoid

### ❌ **Don't**: Create markdown documents for tracking
**Do**: Create tasks in POV stages

### ❌ **Don't**: Batch error documentation
**Do**: One task per unique error with full analysis

### ❌ **Don't**: Skip specialist analysis
**Do**: Always run specialists for systematic recommendations

### ❌ **Don't**: Deploy without testing locally
**Do**: Run lint and verify compilation before push

### ❌ **Don't**: Create tasks with status OPEN for completed work
**Do**: Set appropriate status (COMPLETED for past, IN_PROGRESS for current, OPEN for future)

### ❌ **Don't**: Use web UI for POV/phase/stage/task creation
**Do**: Use pov.create, stage.create, task.create MCP actions exclusively

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

---

## Related Documentation

**Protocols**:
- `/.claude/knowledge/protocols/discovery-first-workflow-guide.md` - Discovery before modification
- `/.claude/knowledge/protocols/specialist-review-protocol.md` - When to run specialists

**Domain Knowledge**:
- `/.claude/knowledge/domain/mcp/mcp-layer-jsdoc-reference.md` - Complete MCP API reference

**Specialists**:
- `/.claude/agents/parameter-normalizer-specialist.md`
- `/.claude/agents/mcp-integration-specialist.md`
- `/.claude/agents/architectural-review-specialist.md`

**Production Operations**:
- `/.claude/knowledge/PRODUCTION_OPERATIONS_GUIDE.md` - Deployment and debugging

---

## Revision History

**v1.0** (2025-12-18): Initial methodology created
- Based on 3 successful iterations
- Validated through Basic Tools domain testing
- Confidence: 95%
- Created via: MCP native workflow (no documents used during execution!)

---

**File Location**: `/.claude/knowledge/protocols/mcp-domain-testing-methodology.md`
**Status**: Production-ready protocol
**Next**: Apply to Agent Automation, MCP Hub, Browser Automation domains
