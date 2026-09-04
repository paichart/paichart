# MCP API Reference

**Version**: 1.0
**Last Updated**: 2025-11-17
**Protocol**: MCP 2025-03-26
**Server**: pAIchart MCP Server v5

---

## Overview

This document describes the enhanced pagination metadata structure returned by pAIchart MCP tools.

**Enhancement Date**: November 2025 (MCP Pagination Exposure)
**Affected Tools**: All list tools (project(action: "task.list"), project(action: "pov.list"), template(action: "list"), services(action: "discover"), list_browser_templates)

---

## Response Structure

### Standard MCP Response

All tools return SDK-compliant responses:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 100 of 534 total tasks...\n\n• Task 1\n• Task 2..."
    }
  ],
  "isError": false,
  "_meta": {
    "tool": "project(action: "task.list")",
    "timestamp": "2025-11-17T12:34:56.789Z",
    "sdkNative": true,
    "itemCount": 100,
    "pagination": { ... },
    "filters": { ... }
  }
}
```

---

## Pagination Metadata (_meta.pagination)

### Structure

```typescript
interface PaginationMetadata {
  total: number;        // Total items available
  returned: number;     // Items in this response
  hasMore: boolean;     // More results available?
  currentPage: number;  // Current page number
  totalPages: number;   // Total pages available
  nextPage: number | null;  // Next page number (or null)
  prevPage: number | null;  // Previous page number (or null)
}
```

### Example

```json
{
  "pagination": {
    "total": 534,
    "returned": 100,
    "hasMore": true,
    "currentPage": 1,
    "totalPages": 6,
    "nextPage": 2,
    "prevPage": null
  }
}
```

---

## Filter Metadata (_meta.filters)

### Structure

```typescript
interface FilterMetadata {
  [key: string]: string;  // Applied filters
}
```

### Example

```json
{
  "filters": {
    "status": "OPEN",
    "pov_name": "Demo Retail",
    "priority": "HIGH",
    "limit": "100"
  }
}
```

**Purpose**: Shows which filters were applied to the query

---

## Performance Metadata (_meta.performance)

### Structure (If Available)

```typescript
interface PerformanceMetadata {
  queryTimeMs: number;   // Query execution time
  optimized: boolean;    // N+1 prevention applied?
  queriesUsed: number;   // Number of database queries
}
```

### Example

```json
{
  "performance": {
    "queryTimeMs": 45,
    "optimized": true,
    "queriesUsed": 7
  }
}
```

**Note**: Not all tools expose performance metadata (depends on API response)

---

## List Tools API

### project(action: "task.list")

**Description**: List tasks with flexible filtering

**Parameters**:
```typescript
{
  povId?: string;          // POV ID
  pov_name?: string;       // POV name (partial match)
  phaseId?: string;        // Phase ID
  phase_name?: string;     // Phase name (partial match)
  stageId?: string;        // Stage ID
  stage_name?: string;     // Stage name (partial match)
  status?: TaskStatus;     // OPEN, IN_PROGRESS, COMPLETED, BLOCKED
  assigneeId?: string;     // Assignee user ID
  assignee_name?: string;  // Assignee name (partial match)
  teamId?: string;         // Team ID
  team_name?: string;      // Team name (partial match)
  priority?: TaskPriority; // HIGH, MEDIUM, LOW
  limit?: number;          // Max results (default: 100, max: 200)
}
```

**Response**:
```json
{
  "content": [{ "type": "text", "text": "Found 59 of 59 total tasks..." }],
  "_meta": {
    "tool": "project(action: "task.list")",
    "itemCount": 59,
    "pagination": {
      "total": 59,
      "returned": 59,
      "hasMore": false,
      "currentPage": 1,
      "totalPages": 1
    },
    "filters": {
      "pov_name": "BlackEye",
      "status": "IN_PROGRESS",
      "limit": "100"
    }
  }
}
```

---

### project(action: "pov.list")

**Description**: List Projects (Proof of Value) with name-based filtering

**Parameters**:
```typescript
{
  status?: POVStatus;      // PROJECTED, IN_PROGRESS, STALLED, VALIDATION, WON, LOST
  customer_name?: string;  // Customer name (partial match)
  owner_name?: string;     // Owner name (partial match)
  country_name?: string;   // Country name (partial match)
  region_name?: string;    // Region name (partial match)
  theatre_name?: string;   // Theatre name (APJ, EMEA, NORTH_AMERICA, LAC)
  limit?: number;          // Max results (default: 100, max: 200)
}
```

**Response**: Same structure as project(action: "task.list") with POV data

---

### template(action: "list")

**Description**: List agent templates with filtering

**Parameters**:
```typescript
{
  agent_template_name?: string;  // Template name (partial match)
  agent_category?: AgentCategory; // GENERAL, DEVELOPMENT, TESTING, etc.
  status?: string;                // ACTIVE, INACTIVE, DEPRECATED, DRAFT
  limit?: number;                 // Max results (default: 50, max: 200)
}
```

**Response**: Same structure with agent template data

---

### services(action: "discover")

**Description**: Find MCP services in the hub

**Parameters**:
```typescript
{
  capability?: string;       // Service capability filter
  category?: string;         // Service category filter
  minSuccessRate?: number;   // Minimum success rate %
  maxResponseTime?: number;  // Maximum response time (ms)
  status?: string;           // ACTIVE, INACTIVE, ALL
  limit?: number;            // Max results (default: 20, max: 200)
}
```

**Response**: Service list with pagination metadata

---

### list_browser_templates

**Description**: List browser automation workflow templates

**Parameters**:
```typescript
{
  category?: BrowserCategory;  // WEB_SCRAPING, UI_INTERACTION, FORM_SUBMISSION, BROWSER_AUTOMATION
}
```

**Response**: Template list with pagination metadata

---

## Prompts API

### audit_all_tasks

**Description**: Audit all tasks across all accessible POVs

**Parameters**:
```typescript
{
  status?: string;          // Comma-separated task statuses (default: OPEN,IN_PROGRESS)
  povStatus?: string;       // Comma-separated POV statuses (default: IN_PROGRESS)
  includeCompleted?: boolean; // Include COMPLETED tasks (default: false)
  maxPerPOV?: number;       // Max tasks per POV (default: 200)
  showAssignees?: boolean;  // Show assignee info (default: true)
  showPhaseInfo?: boolean;  // Show phase/stage info (default: true)
}
```

**Response**: Markdown string with aggregated task audit

**Example Usage**:
```
/prompt audit_all_tasks povStatus=IN_PROGRESS,STALLED status=OPEN
```

---

## Completeness Detection

### How Tools Determine Completeness

**Complete Results** (hasMore = false):
```javascript
returned === total  // All data in response
```

**Partial Results** (hasMore = true):
```javascript
returned < total    // More data available
```

### How Formatters Display Completeness

**In Text Response**:
```markdown
Found 100 of 534 total tasks (page 1 of 6)
📄 More results available - use page=2 to continue
```

**In Metadata**:
```json
{
  "pagination": {
    "hasMore": true,
    "nextPage": 2
  }
}
```

---

## Type Coercion

### Cross-Platform Compatibility

Different AI clients serialize parameters differently:

**ChatGPT / Gemini**: String serialization
```json
{ "limit": "100", "showAssignees": "false" }
```

**Claude Desktop**: Native types
```json
{ "limit": 100, "showAssignees": false }
```

**pAIchart MCP Server**: Handles both automatically
- Numbers: `parseInt(value, 10)` with defaults
- Booleans: String 'false' → false (special case)
- Enums: Case-insensitive matching

---

## Error Responses

### Standard Error Format

```json
{
  "content": [{
    "type": "text",
    "text": "❌ Error in project(action: "task.list"): Invalid parameter 'status'\n\n💡 Suggestions:\n• Valid values: OPEN, IN_PROGRESS, COMPLETED, BLOCKED"
  }],
  "isError": true,
  "_meta": {
    "tool": "project(action: "task.list")",
    "timestamp": "2025-11-17T12:34:56.789Z",
    "errorRecovery": {
      "suggestions": [...]
    }
  }
}
```

### Smart Error Recovery

When enabled, the server provides:
- **Suggestions**: Valid parameter values
- **Examples**: Correct usage patterns
- **Auto-fix attempts**: Close matches ("URGENT" → "HIGH")

---

## Migration Notes

### From Pre-November 2025

**What Changed**:
- Added: `_meta.pagination` object (all list tools)
- Added: Completeness headers in text responses
- Added: "More results available" hints
- Added: Performance metadata (some tools)

**Backward Compatibility**:
- ✅ Existing calls work unchanged
- ✅ Text format enhanced (still markdown)
- ✅ New metadata is additive (doesn't break parsers)

**No Action Required**: All changes are backward compatible

---

## Best Practices Summary

1. **Scope queries** to smallest necessary context (POV → Phase → Task)
2. **Use name-based filters** instead of looking up IDs
3. **Check completeness** before assuming you have all data
4. **Combine filters** for precise results
5. **Adjust limits** based on use case (small scope = lower limit)
6. **Use prompts** for overviews, **use tools** for filtered data

---

## Related Documentation

- **Best Practices**: `/docs/mcp/best-practices.md`
- **Migration Guide**: `/docs/mcp/migration-guide.md`
- **MCP Hub Info**: Call `services(action: "discover")` or `registry(action: "list")` tools

---

**Document Version**: 1.0
**Last Updated**: 2025-11-17
**Contact**: support@paichart.com
