# MCP Tool Gold Standard Pattern — pAIchart Implementation Reference

**Type**: Implementation reference for the gold standards, applied to pAIchart's specific codebase
**Confidence**: 98% (production-validated Dec 2025)
**Status**: pAIchart-specific implementation guidance
**Created**: December 20, 2025
**Updated**: 2026-05-05 (refocused as implementation reference; universal spec extracted to `mcp-tool-gold-standards-spec.md`)

---

## What this document is (and isn't)

**This document is**: the pAIchart-specific implementation reference for the **ten UX gold standards** (GS1–GS10). It contains concrete file paths, real code from this codebase, the dispatcher pattern that ties our consolidated tool surface together, and "which file in our tree to copy from" guidance for each standard. The five plumbing standards (GS11–GS15) live in `mcp-tool-gold-standards-spec.md` — they're universal patterns whose pAIchart implementations are referenced from elsewhere in this codebase (dispatcher schema enforcement in `lib/mcp/server/tools/dispatchers/dispatch-with-schema.js` for GS14; `qualityAssessment` field in `lib/mcp/server/tools/hub/service-tools-handler.js` for GS15).

**This document is NOT**: the universal specification of the standards themselves. For that, see the companion:

- **Universal spec**: [`mcp-tool-gold-standards-spec.md`](./mcp-tool-gold-standards-spec.md) — definitions, success criteria, failure modes, grading rubric, self-audit. Domain-agnostic. This is what Claude consults when grading any MCP tool.
- **Tutorial introduction**: [Chapter 2 — Ten UX + Three Plumbing Standards](https://github.com/paichart/paichart/blob/main/tutorials/02-the-ten-gold-standards.md) — narrative introduction for external readers.

The split: spec defines the standards, pattern doc shows how we apply them, tutorial introduces them. All three derive from the same definitions; the pattern doc is the only one that mentions pAIchart's specific filenames.

---

## Plumbing standards (GS11–13) — see spec

GS11 (Three-Layer Parameter Update), GS12 (Parameter Normalisation at Transport Boundary), and GS13 (JSDoc as Source of Truth) are defined in the [universal spec](./mcp-tool-gold-standards-spec.md#part-b--the-three-plumbing-standards). pAIchart-specific implementation notes:

- **GS11** — three layers in this codebase are: `lib/mcp/server/config/tool-schemas.js` (Layer 1) → `lib/validation/mcp-action-validation.ts` (Layer 2) → `lib/mcp/tasks/action/handlers/<domain>/<action>-handler.ts` (Layer 3). When adding a parameter, all three must be updated; Zod's default strip will silently remove anything missing from Layer 2.
- **GS12** — implemented via `ensureObject()` in `lib/utils/ensure-object.ts` (called at transport boundaries) plus `PARAMETER_ALIAS_MAPPINGS` in `lib/validation/mcp-action-validation.ts`. Format-level normalisation (stripping `pov-`/`task-`/etc. prefixes from CUIDs) is applied at handler entry — see `handleListTasks` in `sdk-native-basic-tools.js` for the canonical example as of 2026-05-04.
- **GS13** — handler JSDoc convention enforced via `lib/mcp/tasks/action/handlers/`; see `task-create-handler.ts` for the canonical example.

---

## Cross-cutting rule: `content.text` mirrors `_meta.nextSteps`

This rule is defined in the universal spec; pAIchart implementation notes:

- **Site of original violation**: `formatTaskList` in `lib/mcp/server/utils/formatters.js` returned bare `'No tasks found.'` while the handler built rich `_meta.nextSteps`. Fixed 2026-05-04.
- **Audit**: any formatter in `lib/mcp/server/utils/formatters.js` whose signature takes only the data array (no metadata/context) is suspect.

---

## Original pattern overview (preserved)

This pattern captures the **best-of-breed implementations** discovered during the comprehensive 28-tool MCP assessment and subsequent UX enhancement work. Each gold standard was identified as the highest-performing example in its category.

**10 Gold Standards**:
1. Description UX (A+) - ChatGPT Connector
2. Workflow Documentation (A) - Browser Automation
3. Error Categorization (B+) - Hub Tools
4. State-Aware Responses (A-) - Browser Automation
5. Decision Tree Documentation (A) - Advanced Tools
6. Cost/Benefit Messaging - Browser Automation
7. Error Response nextSteps (A) - Basic Tools, ChatGPT *(NEW Dec 21)*
8. Centralized Error Helpers (A) - All domains *(NEW Dec 21)*
9. Success Response _meta (A-) - Advanced Tools *(NEW Dec 21)*
10. Action Handler Response Structure (A) - All handlers *(NEW Dec 22)*

**Use this pattern to**:
1. Upgrade tools from "good" to "excellent"
2. Review tools against gold standards
3. Implement new tools at gold standard level

**Prerequisite**: Baseline compliance with `mcp-tool-ux-pattern.md` (WHEN TO USE, EXAMPLES, SEE ALSO, 4-emoji errors)

---

## Gold Standard 1: Description UX (A+ Standard)

**Source**: ChatGPT Connector (100% score)
**Apply to**: All tool descriptions in `tool-schemas.js`

### What Makes It Gold Standard

ChatGPT Connector descriptions are exemplary because they:
1. Start with a clear one-sentence purpose
2. Include complete WHEN TO USE with both ✅ and ❌ cases
3. Provide multiple realistic EXAMPLES with → results
4. Cross-reference related tools in SEE ALSO
5. Include WORKFLOW progression showing tool sequence
6. Add [TIP] or [PARAMETERS] sections for complex tools

### Gold Standard Example

```javascript
// From ChatGPT Connector - search tool
description: `Search across Projects (Proof of Value), tasks, agent activities, and templates for comprehensive research. Returns results in ChatGPT-compatible format for natural language queries.

WHEN TO USE:
✅ Natural language discovery across all resource types
✅ Don't know exact POV/task name but know keywords
✅ Quick exploration ("find email gateway projects")
❌ Need structured filters (use project(action: "pov.list") instead)
❌ Already have resource ID (use fetch instead)

EXAMPLES:
• search("CyberDefense") → All CyberDefense resources (POVs, tasks, templates)
• search("validation security") → Security-related validation work
• search("QA testing") → Testing tasks and templates

WORKFLOW:
1. search("keywords") → Discover resources
2. fetch("pov-xyz") → Get full details for interesting result
3. perform → Perform operations

RETURNS:
Format: {results: [{id, title, url, ...}, ...]}
Note: search returns wrapped object {results: [...]}, fetch returns direct object

SEE ALSO:
• project(action: "pov.list") - Structured POV filtering by status/region
• fetch - Get details for specific resource ID`
```

### Before/After Comparison

**Before** (B- grade):
```javascript
description: `List POVs with filtering options.

EXAMPLES:
• project(action: "pov.list")() → All POVs

SEE ALSO: project(action: "pov.details")`
```

**After** (A+ grade):
```javascript
description: `List all Projects (Proof of Value) with name-based filtering.

WHEN TO USE:
✅ Need structured filtering (status, geography, customer)
✅ Manager weekly portfolio reviews
✅ Regional reporting and analytics
✅ First step before project(action: "pov.details")
❌ Natural language search (use search instead)
❌ Already know POV name (use project(action: "pov.details") directly)

EXAMPLES:
• project(action: "pov.list", status: 'VALIDATION', limit: 20) → POVs ready to close
• project(action: "pov.list", customer_name: 'CyberDefense') → Customer's projects
• project(action: "pov.list", theatre_name: 'NORTH_AMERICA', status: 'IN_PROGRESS') → Regional active work
• project(action: "pov.list", owner_name: 'Jerry Jones') → Owned projects

FILTERS (all optional):
• status - PROJECTED, IN_PROGRESS, STALLED, VALIDATION, WON, LOST
• customer_name - Partial matching, case-insensitive
• owner_name - Partial matching
• theatre_name - APJ, EMEA, NORTH_AMERICA, LAC
• limit - Default: 100, max: 200

WORKFLOW:
1. project(action: "pov.list", filters) → Discover POVs
2. project(action: "pov.details", povId) → Get team IDs and full structure
3. perform(action: "task.create") → Create tasks with team member IDs

SEE ALSO:
• search - Natural language cross-resource discovery
• project(action: "pov.details") - Get full POV details after filtering

TIP: Use includeAccessReason=true to see why you have access to each POV.`
```

### Checklist

- [ ] One-sentence purpose at start
- [ ] WHEN TO USE with 3+ ✅ cases
- [ ] WHEN TO USE with 2+ ❌ cases pointing to alternatives
- [ ] EXAMPLES with 3+ realistic patterns showing → results
- [ ] WORKFLOW showing tool progression (current → next → then)
- [ ] SEE ALSO with 2-4 related tools
- [ ] [TIP] or [PARAMETERS] for complex tools

---

## Gold Standard 2: Workflow Documentation (A Standard)

**Source**: Browser Automation (4-step workflow in all tools)
**Apply to**: Tools that are part of a multi-step workflow

### What Makes It Gold Standard

Browser Automation tools excel because:
1. Every tool shows the same complete workflow
2. Current position marked with "(you are here)"
3. Explicit step numbering (1. 2. 3. 4.)
4. All related tools referenced in sequence

### Gold Standard Example

```javascript
// From Browser Automation - all 4 tools show this
WORKFLOW (follow these steps):
1. list_browser_templates() → Discover templates (you are here)
2. get_browser_template_details(templateId) → Review required parameters
3. validate_browser_template_parameters(templateId, params) → Validate before creation
4. create_browser_automation_task(...) → Create and execute

// In get_browser_template_details, same workflow but different marker:
WORKFLOW:
1. list_browser_templates() → Choose template
2. get_browser_template_details(templateId) → Review parameters (you are here)
3. validate_browser_template_parameters(templateId, params) → Validate before creation
4. create_browser_automation_task(...) → Create task
```

### Before/After Comparison

**Before** (no workflow):
```javascript
SEE ALSO:
• project(action: "pov.details")
• project(action: "task.list")
```

**After** (gold standard):
```javascript
WORKFLOW:
1. project(action: "pov.list", filters) → Discover POVs
2. project(action: "pov.details", povId) → Get team IDs and structure (you are here)
3. perform(action: "task.create") → Create tasks with assignee IDs
4. project(action: "task.list", povId) → View created tasks

SEE ALSO:
• project(action: "pov.list") - Browse POVs with filters
• perform - Create or modify tasks
• project(action: "task.list") - See all tasks in POV
```

### Checklist

- [ ] Numbered steps (1. 2. 3. 4.)
- [ ] "(you are here)" marker on current tool
- [ ] Same workflow shown in all related tools
- [ ] → arrow showing what each step returns/does
- [ ] Complete sequence from start to end

---

## Gold Standard 3: Error Categorization (B+ Standard)

**Source**: Hub Tools (CONFIGURATION/DATABASE/PERMISSION pattern)
**Apply to**: All error helpers and inline error handling

### What Makes It Gold Standard

Hub Tools error handling excels because:
1. Errors are categorized by type (not just generic)
2. Each category has specific recovery steps
3. Valid parameters are listed in error
4. Working examples are provided in error
5. Tips for next actions included

### Gold Standard Example

```javascript
// From Hub Tools - service-discovery-handler.js
try {
  // ... operation
} catch (error) {
  const errorMsg = error.message || String(error);
  let errorType = 'UNKNOWN';
  let suggestion = 'Unexpected error. Please try again.';
  let recovery = [];

  // Categorize errors for better user guidance
  if (errorMsg.includes('ENOENT') || errorMsg.includes('Cannot find module')) {
    errorType = 'CONFIGURATION';
    suggestion = 'Service registry may not be properly configured.';
    recovery = [
      'Check that the MCP Hub service is running',
      'Verify database connection',
      'Restart the MCP server'
    ];
  } else if (errorMsg.includes('database') || errorMsg.includes('prisma')) {
    errorType = 'DATABASE';
    suggestion = 'Database connection error occurred.';
    recovery = [
      'Check database connection',
      'Verify PostgreSQL is running',
      'Check DATABASE_URL environment variable'
    ];
  } else if (errorMsg.includes('permission') || errorMsg.includes('EACCES')) {
    errorType = 'PERMISSION';
    suggestion = 'Permission error.';
    recovery = [
      'Check file/directory permissions',
      'Verify user role',
      'Authenticate if needed'
    ];
  } else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
    errorType = 'TIMEOUT';
    suggestion = 'Operation timed out.';
    recovery = [
      'Check network connectivity',
      'Try again with smaller payload',
      'Increase timeout if possible'
    ];
  }

  throw new Error(
    `❌ ${operation} failed: ${errorMsg}\n\n` +
    `🔍 Error Type: ${errorType}\n` +
    `💡 Suggestion: ${suggestion}\n\n` +
    `Valid Parameters:\n` +
    validParams.map(p => `• ${p}`).join('\n') + '\n\n' +
    `Examples:\n` +
    examples.map(e => `• ${e}`).join('\n') + '\n\n' +
    `🔧 Recovery Steps:\n` +
    recovery.map(r => `• ${r}`).join('\n') + '\n\n' +
    `Tip: ${tip}`
  );
}
```

### Error Categories Reference

| Category | Trigger Patterns | Typical Recovery |
|----------|-----------------|------------------|
| CONFIGURATION | ENOENT, Cannot find module, missing config | Check files exist, restart server |
| DATABASE | database, prisma, ECONNREFUSED | Check DB connection, verify env vars |
| PERMISSION | permission, EACCES, 401, 403 | Check permissions, authenticate |
| TIMEOUT | timeout, ETIMEDOUT | Check network, reduce payload |
| VALIDATION | invalid, required, missing | Fix input, see examples |
| NOT_FOUND | not found, 404, doesn't exist | Use list tool, check spelling |
| AUTHENTICATION | auth, unauthorized, token | Login, refresh token |
| SEARCH_FAILURE | search failed, query error | Retry with simpler terms, use list_* |
| FETCH_FAILURE | fetch failed, resource error | Verify ID exists, check access |
| MISSING_ID | missing id, no id provided | Use search() to find IDs |
| INVALID_FORMAT | invalid format, parse error | Check expected format in docs |

### Before/After Comparison

**Before** (generic error):
```javascript
throw new Error(`Failed to discover services: ${error.message}`);
```

**After** (gold standard):
```javascript
throw new Error(
  `❌ Service discovery failed: ${error.message}\n\n` +
  `🔍 Error Type: ${errorType}\n` +
  `💡 Suggestion: ${suggestion}\n\n` +
  `Valid Parameters:\n` +
  `• capability: Filter by service capability\n` +
  `• category: Filter by category\n\n` +
  `Examples:\n` +
  `• services(action: "discover")() → All active services\n` +
  `• services(action: "discover", { capability: "monitoring" })\n\n` +
  `🔧 Recovery Steps:\n` +
  recovery.map(r => `• ${r}`).join('\n') + '\n\n` +
  `Tip: Use services(action: "discover")() to see available categories.`
);
```

### Checklist

- [ ] Error categorized (CONFIGURATION, DATABASE, PERMISSION, etc.)
- [ ] Category-specific recovery steps
- [ ] Valid parameters listed
- [ ] Working examples included
- [ ] Tip for next action
- [ ] 4-emoji format (❌🔍💡🔧)

---

## Gold Standard 4: State-Aware Responses (A- Standard)

**Source**: Browser Automation (nextSteps adapt based on outcome)
**Apply to**: Tools with multiple outcome states

### What Makes It Gold Standard

Browser Automation responses adapt nextSteps based on:
1. Validation result (valid vs invalid)
2. Execution mode (immediate vs queued)
3. Result count (found vs empty)
4. Error type (recoverable vs fatal)

### Gold Standard Example

```javascript
// From Browser Automation - validate_browser_template_parameters
return createSuccessResponse({
  validation: { isValid, errors, warnings },

  // nextSteps ADAPT based on validation result
  nextSteps: validation.isValid
    ? [
        "✅ Parameters validated successfully!",
        "No errors found" + (warnings.length > 0 ? ` (${warnings.length} warnings)` : ""),
        "Ready to create automation task:",
        `create_browser_automation_task({...})`
      ]
    : [
        `❌ Validation failed with ${errors.length} errors`,
        "Fix the errors listed above and validate again",
        "Common issues:",
        "  • Missing required fields",
        "  • Wrong data types",
        "Need help? Use get_browser_template_details for schema"
      ],

  recommendation: validation.isValid ? 'proceed_to_create' : 'fix_errors_and_retry'
});

// From Browser Automation - create_browser_automation_task
nextSteps: executeImmediately && agentExecutionId
  ? [
      "✅ Task created and execution started",
      `Monitor progress: perform(action: "agent.results", agentExecutionId: "${agentExecutionId}")`,
      "Execution typically completes in 30-120 seconds"
    ]
  : [
      "✅ Task created and queued for execution",
      `Execute now: perform(action: "agent.execute", taskId: "${taskId}")`,
      `Check status: project(action: "task.context", taskId: "${taskId}")`
    ]
```

### States to Handle

| State Type | Examples | nextSteps Adaptation |
|------------|----------|---------------------|
| Success/Failure | Validation passed/failed | Show proceed vs fix guidance |
| Found/Empty | Results found/no results | Show details vs search tips |
| Immediate/Queued | executeImmediately true/false | Monitor vs execute guidance |
| Authenticated/Guest | User logged in/anonymous | Full actions vs limited actions |

### Before/After Comparison

**Before** (static nextSteps):
```javascript
nextSteps: [
  "Check results",
  "Use perform(action: "agent.results") to see output"
]
```

**After** (state-aware):
```javascript
nextSteps: results.length > 0
  ? [
      `Found ${results.length} results`,
      `Top result: ${results[0].title}`,
      "Use fetch(id) to get full details",
      "Or refine search with more specific terms"
    ]
  : [
      "No results found for your query",
      "Suggestions:",
      "  • Try broader search terms",
      "  • Check spelling",
      "  • Use project(action: "pov.list")() to see all available"
    ]
```

### Checklist

- [ ] Identify all possible outcome states
- [ ] Create distinct nextSteps for each state
- [ ] Include state-specific guidance (not generic)
- [ ] Add workflow object with current/next/recommendation
- [ ] Use ✅/❌ emojis to indicate success/failure

---

## Gold Standard 5: Decision Tree Documentation (A Standard)

**Source**: Advanced Tools (perform with 14 actions)
**Apply to**: Tools with multiple action types or modes

### What Makes It Gold Standard

perform's description excels because:
1. Clear "which action do I use?" decision tree
2. Actions grouped by category
3. Common confusion addressed explicitly
4. Parameter tips with examples

### Gold Standard Example

```javascript
// From Advanced Tools - perform
description: `Execute task management operations across 14 actions in 6 categories.

[WHICH ACTION DO I USE?]

Want to CREATE something?
  → pov.create - New POV with team and phases (ADMIN or USER; DEMO blocked — table-governed)
  → task.create - New task (povId REQUIRED!)
  → stage.create - New stage in phase

Want to MODIFY a task?
  → task.update - Change ANY field (status, assignee, priority, title)
  → task.assign - Change assignee only (OR use task.update)
  → task.complete - Mark done (optionally add completionNotes)
  → task.comment - Add comment to task

Want to use AGENTS for automation?
  1. agent.assign - Attach template to task (required first step!)
  2. (optional) agent.configure - Customize agent role and prompt
  3. agent.execute - Run the agent
  4. agent.status - Check if still running
  5. agent.results - Get output and artifacts

[IMPORTANT] Common Confusion:
• task.update handles ALL field changes including assignee - use this for most cases
• task.assign is specialized for assignee-only changes (optional alternative)
• agent.configure is optional - you can skip to agent.assign with template defaults

[COMMON ERRORS] - How to Fix:

❌ Error: "parameters.phaseId: Required (you sent 'phaseName')"
✅ Solution: Use phaseName directly - auto-lookup works!
   Example: { phaseName: 'Business activities', name: 'Setup' }

❌ Error: "parameters.name: Contains invalid characters"
✅ Solution: Replace & with 'and'
   Wrong: "Process Discovery & Alignment"
   Right: "Process Discovery and Alignment"

❌ Error: "parameters.priority: Must be one of: HIGH, MEDIUM, LOW"
✅ Solution: Use UPPERCASE values
   Example: { priority: 'HIGH' } not { priority: 'urgent' }`
```

### Before/After Comparison

**Before** (action list):
```javascript
description: `Execute task actions.

Actions: task.create, task.update, task.complete, agent.execute...`
```

**After** (decision tree):
```javascript
description: `Execute task management operations.

[WHICH ACTION DO I USE?]

Want to CREATE?
  → task.create - New task (povId REQUIRED!)

Want to MODIFY?
  → task.update - Change any field
  → task.complete - Mark done

[COMMON ERRORS]:
❌ "Missing povId"
✅ Always include povId when creating tasks`
```

### Checklist

- [ ] [WHICH ACTION DO I USE?] section with decision questions
- [ ] Actions grouped by intent (CREATE/MODIFY/DELETE)
- [ ] → arrows pointing to correct action
- [ ] [IMPORTANT] section addressing common confusion
- [ ] [COMMON ERRORS] with ❌/✅ pairs

---

## Gold Standard 6: Cost/Benefit Messaging (Unique)

**Source**: Browser Automation
**Apply to**: Tools with significant cost or performance implications

### Gold Standard Example

```javascript
// From Browser Automation - all tools mention this
COST BENEFIT:
On-demand browser processes eliminate $200-400/month waste from persistent servers.
Achieve 70-80% cost savings while maintaining full automation capabilities.

// In response nextSteps
nextSteps: [
  "✅ Task created and execution started",
  "Execution typically completes in 30-120 seconds",
  "Cost savings: 70-80% vs persistent browser server"
]
```

### When to Apply

- Tools that spawn expensive processes
- Tools that replace manual work
- Tools with performance optimizations
- Tools that reduce API calls

---

## Gold Standard 7: Error Response nextSteps (A Standard)

**Source**: Basic Tools, ChatGPT Connector (Dec 2025 UX Assessment)
**Apply to**: All catch blocks and error returns

### What Makes It Gold Standard

Error responses with nextSteps excel because:
1. Users know exactly what to try next
2. Recovery options are specific to the error context
3. Alternative tools are suggested
4. Reduces user frustration and support requests

### CRITICAL: Return MCP Content, Don't Throw

**Bug class (Mar 2026)**: `throw new Error()` produces JSON-RPC errors that Claude mobile hides as `"Error occurred during tool execution"`. User-facing errors in tool handlers MUST be **returned** as `{content: [...], isError: true}`, not thrown. See `mcp-tool-ux-pattern.md` Pattern 2 for the full rule and decision table.

### Gold Standard Example

```javascript
// From Basic Tools - sdk-native-basic-tools.js
} catch (error) {
  return {
    content: [{ type: "text", text: `❌ Error in project(action: "pov.list"): ${error.message}` }],
    isError: true,
    _meta: {
      tool: 'project',
      action: 'pov.list',
      timestamp: new Date().toISOString(),
      sdkNative: true,
      nextSteps: [
        'Try: project(action: "pov.list")() without filters',
        'Check: status values are PROJECTED, IN_PROGRESS, STALLED, VALIDATION, WON, LOST',
        'Alternative: search("pov name") for natural language search'
      ]
    }
  };
}

// From ChatGPT Connector - resource not found with suggestions
if (!document) {
  const suggestions = await this.getFuzzySuggestions(type, resourceId, 5);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        error: "Resource not found",
        id: id,
        resourceType: type,
        message: `No ${type} found with ID: ${resourceId}`,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        _meta: {
          tool: 'fetch',
          errorType: 'NOT_FOUND',
          // NOTE (F-SWEEP-4/6, 2026-07-17): this example previously showed
          // `recoverable: true` here — REMOVED, do not copy it into new tools.
          // It was an unearned hardcoded VERDICT (Protocol 10) with zero
          // consumers, and on NOT_FOUND it was actively wrong (retrying the
          // same ID cannot recover). errorType is the fact; nextSteps is the
          // route; ship those.
          nextSteps: [
            `Use search("${resourceId.substring(0, 8)}...") to find similar resources`,
            type === 'pov' ? 'Use project(action: "pov.list")() to see available POVs' : null,
            type === 'task' ? 'Use project(action: "task.list")() to see available tasks' : null
          ].filter(Boolean)
        }
      })
    }],
    isError: true
  };
}
```

### nextSteps Templates by Error Type

| Error Type | nextSteps Template |
|------------|-------------------|
| NOT_FOUND | `Use search()`, `Use list_*()`, `Check spelling` |
| VALIDATION | `Check valid values`, `See examples`, `Use get_*_details` |
| PERMISSION | `Authenticate`, `Check role`, `Request access` |
| EMPTY_RESULT | `Try without filters`, `Broaden search`, `Check spelling` |
| MISSING_PARAM | `Required: param_name`, `Example: {...}`, `See docs` |

### Checklist

- [ ] All catch blocks have _meta.nextSteps array
- [ ] nextSteps are specific to the error type
- [ ] At least 2-3 actionable suggestions
- [ ] Include alternative tools when applicable
- [ ] Use tool syntax in suggestions (e.g., `project(action: "pov.list")()`)

---

## Gold Standard 8: Centralized Error Helpers (A Standard)

**Source**: All domains (Dec 2025 UX Assessment)
**Apply to**: Any domain with 3+ error types

### What Makes It Gold Standard

Centralized error helpers excel because:
1. Consistent error format across entire domain
2. Single source of truth for error messages
3. Easy to update all errors at once
4. Enforces 4-emoji format compliance
5. Reduces code duplication by 60-70%

### Gold Standard Example

```javascript
// From Hub Tools - error-helpers.js
/**
 * Enhanced operation error with categorization, recovery steps, and examples
 * Gold standard error format for MCP tools
 */
function enhancedOperationError(operation, error, options = {}) {
  const { validParams = [], examples = [], tips = [] } = options;
  const errorMsg = error.message || String(error);

  // Auto-categorize based on error patterns
  let errorType = 'UNKNOWN';
  let suggestion = 'Unexpected error. Please try again.';
  let recovery = [];

  if (errorMsg.includes('database') || errorMsg.includes('prisma')) {
    errorType = 'DATABASE';
    suggestion = 'Database connection error.';
    recovery = ['Check database connection', 'Verify PostgreSQL is running'];
  } else if (errorMsg.includes('permission') || errorMsg.includes('403')) {
    errorType = 'PERMISSION';
    suggestion = 'Permission error.';
    recovery = ['Check user role', 'Authenticate if needed'];
  }
  // ... more categories

  // Build 4-emoji format error
  const parts = [
    `❌ ${operation} failed: ${errorMsg}`,
    '',
    `🔍 Error Type: ${errorType}`,
    `💡 Suggestion: ${suggestion}`,
    ''
  ];

  if (validParams.length > 0) {
    parts.push('Valid Parameters:');
    validParams.forEach(p => parts.push(`  • ${p}`));
  }

  if (examples.length > 0) {
    parts.push('Examples:');
    examples.forEach(e => parts.push(`  • ${e}`));
  }

  parts.push('🔧 Recovery Steps:');
  recovery.forEach(r => parts.push(`  • ${r}`));

  return new Error(parts.join('\n'));
}

module.exports = { enhancedOperationError, notFoundError, validationError, ... };
```

### Usage Pattern

```javascript
// In handler file
const { enhancedOperationError } = require('./error-helpers');

try {
  // ... operation
} catch (error) {
  throw enhancedOperationError('Service discovery', error, {
    validParams: ['capability: Filter by capability', 'category: Filter by category'],
    examples: ['services(action: "discover")() → All services', 'services(action: "discover", { capability: "ai" })'],
    tips: ['Use services(action: "discover")() for available categories']
  });
}
```

### Error Helper Modules by Domain

| Domain | File | Helpers |
|--------|------|---------|
| Basic | `tools/basic/error-helpers.js` | povNotFoundError, taskNotFoundError, invalidEnumError, etc. (7) |
| Advanced | `tools/advanced/error-helpers.js` | invalidActionError, missingPOVContextError, etc. (8) |
| Browser | ~~`tools/browser/error-helpers.js`~~ | DELETED with tools/browser/ (17185e45 — browser moved to standalone Docker service) |
| Hub | `tools/hub/error-helpers.js` | enhancedOperationError, notFoundError, authRequiredError, etc. (6) |

### When to Use Helpers vs Inline Patterns

**Use Error Helpers when:**
- Standard error types (NOT_FOUND, VALIDATION, PERMISSION, AUTH_REQUIRED)
- Multiple handlers share the same error patterns
- You want consistent 4-emoji format automatically
- Error categorization should be automatic

**Use Inline Patterns when:**
- Response structure differs from helper output (e.g., different field names)
- Error needs handler-specific context not supported by helpers
- Helper would require extensive customization

**Fuzzy Matching Enhancement (Dec 2025):**

The `notFoundError` helper now supports optional fuzzy suggestions with match scores:

```javascript
// BEFORE: Simple list of available options
throw notFoundError('Service', 'weathr', availableNames, 'service_name');
// Output: "Available services: weather-api, sentry-mcp..."

// AFTER: Fuzzy suggestions with confidence scores (preferred for name lookups)
const suggestions = getScoredSuggestions(services, searchTerm, 'name', 3);
throw notFoundError('Service', 'weathr', availableNames, 'service_name', suggestions);
// Output: "Did you mean: "weather-api" (92%), "weather-v2" (85%)?"
```

**When to use fuzzy suggestions:**
- Name-based lookups (service names, template names, prompt names)
- User might misspell or partially type the name
- Limited set of options (< 100) makes fuzzy matching meaningful

**When NOT to use fuzzy suggestions:**
- ID-based lookups (CUIDs are exact matches)
- Open-ended searches (use search() tool instead)
- Very large option sets (performance concern)

### Checklist

- [ ] Domain has dedicated error-helpers.js file
- [ ] All error helpers use 4-emoji format (❌🔍💡🔧)
- [ ] Helpers are imported in handler files
- [ ] Inline errors replaced with helper calls where appropriate
- [ ] Error categorization is automatic (pattern matching)
- [ ] Name-based lookups use notFoundError with fuzzy suggestions

---

## Gold Standard 9: Success Response _meta (A- Standard)

**Source**: Advanced Tools, ChatGPT Connector (Dec 2025 UX Assessment)
**Apply to**: All tool success responses

### What Makes It Gold Standard

Consistent _meta in success responses excels because:
1. AI clients can parse tool metadata uniformly
2. nextSteps guide users to logical next actions
3. Timestamp aids debugging and logging
4. sdkNative flag identifies response source

### Gold Standard Example

```javascript
// From Advanced Tools - task-action-handler.js
return {
  content: [{ type: "text", text: formattedText }],
  isError: false,
  _meta: {
    tool: 'perform',
    action: action,
    timestamp: new Date().toISOString(),
    sdkNative: true,
    nextSteps: actionNextSteps[action] || [
      `Action "${action}" completed successfully`,
      `View task: project(action: "task.context", taskId: '${resultId}')`
    ]
  }
};

// Context-aware nextSteps by action type
const actionNextSteps = {
  'task.create': [
    'Task created successfully',
    `View task: project(action: "task.context", taskId: '${resultId}')`,
    `Assign agent: perform(action: 'agent.assign', taskId: '${resultId}', ...)`
  ],
  'agent.execute': [
    'Agent execution started',
    `Check status: perform(action: 'agent.status', taskId: '${resultId}')`,
    `Get results when complete: perform(action: "agent.results", taskId: '${resultId}')`
  ]
};
```

### _meta Structure Standard

```javascript
_meta: {
  // Required fields
  tool: 'tool_name',           // Tool that generated response
  timestamp: new Date().toISOString(),  // When response was generated

  // Recommended fields
  nextSteps: [...],            // Array of actionable next steps
  sdkNative: true,             // True if SDK-native implementation

  // Context-specific fields
  action: 'action_name',       // For action-based tools
  resourceType: 'pov',         // For resource-based tools
  resultCount: 5,              // For list/search tools
  cached: false,               // For cached responses
  cacheAge: 1500               // Cache age in ms (if cached)
}
```

### Resource-Type-Aware nextSteps

```javascript
// From ChatGPT Connector - getNextStepsForResource()
getNextStepsForResource(type, document) {
  switch(type) {
    case 'pov':
      return [
        `Retrieved POV: "${document.title}"`,
        `List tasks: project(action: "task.list", povId: '${document.id}')`,
        `Get full details: project(action: "pov.details", povId: '${document.id}')`
      ];
    case 'task':
      return [
        `Retrieved task: "${document.title}"`,
        `Get context: project(action: "task.context", taskId: '${document.id}')`,
        `Run agent: perform(action: 'agent.execute', taskId: '${document.id}')`
      ];
    case 'template':
      return [
        `Retrieved template: "${document.name}"`,
        `Assign to task: perform(action: 'agent.assign', agentTemplateId: '${document.id}', ...)`
      ];
  }
}
```

### Checklist

- [ ] All success responses have _meta object
- [ ] _meta includes tool, timestamp, nextSteps
- [ ] nextSteps are context-aware (not generic)
- [ ] nextSteps include actual IDs from response
- [ ] Resource-type tools have type-specific guidance

### CRITICAL implementation rule: content.text must mirror _meta.nextSteps for empty/error states

**Bug class** (May 2026): a handler can be structurally compliant with GS3, GS4, GS7, and GS9 — populating `_meta.nextSteps` correctly for every state — and still ship a dead-end user experience if the formatter that builds `content.text` discards the empty-state guidance. Many MCP clients render `content[].text` prominently and treat `_meta` as hidden plumbing. A response with `content.text: "No tasks found."` and `_meta.nextSteps: ["Adjust filters", "Create task: ..."]` looks compliant in code review and broken in production.

**Discovered in**: `formatTaskList` at `lib/mcp/server/utils/formatters.js` returning the bare string `'No tasks found.'` while `handleListTasks` correctly built rich `_meta.nextSteps` and stuffed them in metadata that the formatter ignored. Real-world failure: a malformed `pov-`-prefixed CUID produced "No tasks found." with no corrective hint — even though the handler had detected the empty result and put recovery guidance in `_meta`.

**Rule**: For every empty-state, error-state, or recoverable-failure response:

- The handler builds `_meta.nextSteps` (per GS4, GS7, GS9).
- The formatter (or whichever code constructs `content.text`) MUST surface those `nextSteps` in the human-readable text — typically as a `💡 Suggestions:\n  • <step>\n  • <step>` block appended to the base message.
- A formatter that builds `content.text` independently of `_meta.nextSteps` is a defect, regardless of how clean each side looks in isolation.

**How to audit**: for each formatter function in your codebase that produces empty-state text, confirm it accepts the metadata/context object and uses `nextSteps` from it. A formatter signature that takes only the data array (no metadata) is a smell.

**Pair with**: a smoke test that issues a deliberately-failing call, asserts on `content[0].text` directly (not `_meta`), and confirms the corrective hint is present in the human-readable channel.

---

## Implementation Priority

When upgrading a tool to gold standard:

| Priority | Standard | Impact | Effort |
|----------|----------|--------|--------|
| P0 | Action Handler Response (GS10) | Critical | 5-10 min |
| P1 | Error Categorization (GS3) | High | 30-45 min |
| P2 | Centralized Error Helpers (GS8) | High | 1-2 hrs (one-time per domain) |
| P3 | Error Response nextSteps (GS7) | High | 15-30 min |
| P4 | Success Response _meta (GS9) | High | 20-30 min |
| P5 | State-Aware Responses (GS4) | Medium | 30-45 min |
| P6 | Description UX (GS1) | Medium | 20-30 min |
| P7 | Workflow Documentation (GS2) | Medium | 15-20 min |
| P8 | Decision Tree (GS5, if applicable) | Medium | 30-45 min |
| P9 | Cost/Benefit (GS6, if applicable) | Low | 10 min |

---

## Grading Rubric

Use this to assess tools against gold standards (10 total):

| Grade | Description | Criteria |
|-------|-------------|----------|
| A+ | Exemplary | All 10 gold standards met + innovative enhancements |
| A | Excellent | 8-9 gold standards met |
| A- | Very Good | 7 gold standards met |
| B+ | Good | 5-6 gold standards met |
| B | Acceptable | 4 gold standards + baseline compliance |
| B- | Needs Work | 3 gold standards + baseline compliance |
| C+ | Below Standard | 1-2 gold standards + baseline compliance |
| C | Poor | Baseline compliance only |
| D | Failing | Major gaps in baseline (GS10 missing = auto D for handlers) |

---

## Quick Reference: Which Domain to Copy From

| Need | Copy From | File/Location |
|------|-----------|---------------|
| GS1: A+ Description | ChatGPT Connector | chatgpt-connector-handler.js |
| GS2: 4-Step Workflow | Browser Automation | tool-schemas.js (browser tools) |
| GS3: Error Categorization | Hub Tools | hub/error-helpers.js (enhancedOperationError) |
| GS4: State-Aware Responses | Browser Automation | sdk-native-browser-automation-tools.js |
| GS5: Decision Tree | Advanced Tools | tool-schemas.js (perform) |
| GS6: Cost Messaging | Browser Automation | tool-schemas.js (browser tools) |
| GS7: Error nextSteps | Basic Tools | sdk-native-basic-tools.js (catch blocks) |
| GS8: Error Helpers | Hub Tools | hub/error-helpers.js |
| GS9: Success _meta | Advanced Tools | task-action-handler.js |
| GS10: Action Handler Response | All Handlers | stage-create-handler.ts, task-create-handler.ts |
| Resource-Aware nextSteps | ChatGPT Connector | chatgpt-connector-handler.js (getNextStepsForResource) |

---

## Gold Standard 10: Action Handler Response Structure (A Standard)

**Source**: stage-create-handler, task-create-handler (Dec 2025)
**Apply to**: All perform handlers (pov.create, task.create, stage.create, agent.*, etc.)
**Bug Fixed**: Dec 22, 2025 - pov.create was returning wrong format, showing "undefined" in output

### What Makes It Gold Standard

Action handlers return a consistent response structure that:
1. Includes `actionId` for tracking and debugging
2. Includes `action` to identify which action was executed
3. Includes `status` to indicate completion state
4. Wraps response data in `result` object
5. Enables MCP output formatter to display proper feedback

### Gold Standard Example

```typescript
// From stage-create-handler.ts (correct format)
return {
  actionId,                    // Required: tracking ID passed to handler
  action: 'stage.create',      // Required: action name for display
  status: 'completed',         // Required: 'completed' | 'failed' | 'pending'
  result: {                    // Required: wrap all response data
    stage: {
      id: stage.id,
      name: stage.name,
      // ... stage details
    },
    message: `Stage "${name}" created successfully via MCP`,
    created: true
  }
};

// From task-create-handler.ts (correct format)
return {
  actionId,
  action: 'task.create',
  status: 'completed',
  result: {
    task: { id, title, status, priority, ... },
    message: `Task "${title}" created successfully`,
    created: true
  }
};
```

### Before/After Comparison

**Before** (wrong format - causes "undefined" in output):
```typescript
// ❌ pov-create-handler.ts BEFORE fix (Dec 22, 2025)
return {
  success: true,
  pov: { id, title, status, priority, teamId, phaseCount },
  message: successMessage
};
// Output showed: Action: undefined, Status: undefined, Action ID: undefined
```

**After** (correct format):
```typescript
// ✅ pov-create-handler.ts AFTER fix
return {
  actionId,
  action: 'pov.create',
  status: 'completed',
  result: {
    success: true,
    pov: { id, title, status, priority, teamId, phaseCount },
    message: successMessage
  }
};
// Output shows: Action: pov.create, Status: completed, Action ID: mcp-action-xxx
```

### Response Structure Standard

```typescript
interface ActionHandlerResponse {
  // Required fields (shown in MCP output header)
  actionId: string;           // Unique tracking ID (from handler params)
  action: string;             // Action name: 'task.create', 'pov.create', etc.
  status: 'completed' | 'failed' | 'pending';

  // Required wrapper for response data
  result: {
    // Success indicators
    success?: boolean;
    created?: boolean;
    updated?: boolean;

    // Resource data (varies by action)
    task?: object;
    stage?: object;
    pov?: object;

    // Human-readable message
    message: string;

    // Optional: Additional context
    warnings?: string[];
    metadata?: object;
  };
}
```

### Status Values

| Status | When to Use | Example |
|--------|-------------|---------|
| `completed` | Action succeeded | Task created, stage updated |
| `failed` | Action failed (after catch) | Validation error, not found |
| `pending` | Action queued for later | Agent execution started |

### Handler Template

```typescript
export async function handleMyAction(
  parameters: any,
  user: TokenPayload,
  actionId: string  // ← Always passed to handler
): Promise<any> {
  try {
    // ... perform action ...

    return {
      actionId,                    // ← Use actionId from params
      action: 'my.action',         // ← Hardcode action name
      status: 'completed',         // ← Set appropriate status
      result: {
        // ... response data wrapped in result ...
        message: 'Action completed successfully'
      }
    };
  } catch (error) {
    // Option 1: Re-throw for centralized error handling
    throw error;

    // Option 2: Return error response
    return {
      actionId,
      action: 'my.action',
      status: 'failed',
      result: {
        success: false,
        error: error.message,
        message: 'Action failed'
      }
    };
  }
}
```

### Checklist

- [ ] Handler returns `actionId` (from function params)
- [ ] Handler returns `action` with action name string
- [ ] Handler returns `status` ('completed', 'failed', or 'pending')
- [ ] Response data wrapped in `result` object
- [ ] `result.message` provides human-readable summary
- [ ] Error responses also follow this structure

### Files to Check

All handlers in `/lib/mcp/tasks/action/handlers/`:
- `pov/pov-create-handler.ts` ✅ (fixed Dec 22, 2025)
- `task/task-create-handler.ts` ✅
- `task/task-update-handler.ts` ✅
- `stage/stage-create-handler.ts` ✅
- `agent/agent-*.ts` ✅

---

## Related Resources

- `mcp-tool-ux-pattern.md` - Baseline pattern (prerequisite)
- `mcp-domain-reference.md` - Domain assessment results
- `mcp-integration-specialist` - Can apply these standards
- `cline_docs/*-assessment-fixes.md` - Per-domain implementation checklists

---

**Pattern Status**: Production-validated
**Last Updated**: 2026-05-22 (note: this file covers GS1–GS10 UX standards in detail; GS11–GS15 plumbing standards live in `mcp-tool-gold-standards-spec.md`)
**Confidence**: 98%
**Gold Standards in scope of this file**: 10 UX standards (GS1–GS10)
**Cross-references**: `mcp-tool-gold-standards-spec.md` (universal spec, GS1–GS15) · `paichart/tutorials/02-the-ten-gold-standards.md` (tutorial chapter)
