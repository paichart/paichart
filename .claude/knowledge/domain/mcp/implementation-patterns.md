# MCP Implementation Patterns

**Version**: 1.0
**Created**: 2025-11-17
**Based On**: MCP Pagination Exposure (Sprint 1)
**Confidence**: 95% (production-tested)
**Audience**: AI agents and developers

---

## Performance Optimization

### Scoping Queries

**Always scope to smallest necessary context**:

**Bad** (Global query):
```
project(action: "task.list", status="OPEN")
→ Returns 500+ tasks across ALL POVs
→ Slow query, large response
```

**Good** (Scoped query):
```
project(action: "task.list", pov_name="MyProject", status="OPEN")
→ Returns 15 tasks for specific POV
→ Fast query, complete results
```

---

### Using Name-Based Filters

**All name-based filters support partial matching**:

```javascript
// Partial POV name
project(action: "task.list", pov_name="Demo")  // Matches "Demo Retail", "Demo Finance", etc.

// Partial assignee name
project(action: "task.list", assignee_name="John")  // Matches "John Smith", "John Doe", etc.

// Partial phase name
project(action: "task.list", phase_name="Plan")  // Matches "Planning", "Implementation Plan", etc.
```

**Benefits**:
- No need to know exact names
- Case-insensitive
- Reduces query steps (no ID lookup needed)

---

### Limit Sizing

**Default limits** (optimized for most use cases):
- project(action: "task.list"): 100 (max: 200)
- project(action: "pov.list"): 100 (max: 200)
- template(action: "list"): 50 (max: 200)
- services(action: "discover"): 20 (max: 200)

**When to adjust**:
- Small scope: Lower limit (limit=20) for faster response
- Complete dataset: Higher limit (limit=200) to reduce pagination
- Large exports: Use pagination instead of single large query

---

## Scoping Best Practices

### Hierarchical Scoping

**Most efficient to least efficient**:

1. **Task-level**: Get specific task by ID
   ```
   project(action: "task.context", taskId="cm3...")
   ```

2. **POV-level**: Get tasks for specific project
   ```
   project(action: "task.list", pov_name="MyProject")
   ```

3. **Team-level**: Get tasks for team
   ```
   project(action: "task.list", team_name="Engineering")
   ```

4. **Global**: Get all accessible tasks
   ```
   project(action: "task.list", status="OPEN")
   ```

**Use narrowest scope that meets your needs**

---

### Multi-Filter Combinations

**Combine filters for precise results**:

```javascript
// POV + Status + Priority
project(action: "task.list")(
  pov_name="Critical Project",
  status="IN_PROGRESS",
  priority="HIGH"
)

// POV + Phase + Assignee
project(action: "task.list")(
  pov_name="Migration",
  phase_name="Implementation",
  assignee_name="Alice"
)
```

**Benefits**:
- More precise results
- Smaller result sets (complete data)
- Faster queries

---

## Common Patterns

### Pattern 1: Workflow Navigation

**Start broad, then narrow**:

```
1. project(action: "pov.list")() → See all accessible POVs
2. project(action: "pov.details", pov_name="X") → Get team, phases
3. project(action: "task.list", pov_name="X") → Get all tasks for POV
4. project(action: "task.context", task_name="Y") → Get specific task details
```

---

### Pattern 2: Status Monitoring

**Check project health**:

```
1. project(action: "task.list", status="BLOCKED") → Find blocked tasks
2. project(action: "task.list", priority="HIGH", status="OPEN") → Find urgent work
3. project(action: "task.list", assignee_name="Me", status="IN_PROGRESS") → My active work
```

---

### Pattern 3: Audit and Overview

**Use prompts for aggregated views**:

```
1. /prompt audit_all_tasks → Complete overview across all POVs
2. project(action: "task.list", pov_name="X") → Drill into specific POV
3. project(action: "task.context", taskId="Y") → Investigate specific task
```

**Prompts provide**:
- Aggregated summaries
- Multi-POV views
- Completeness indicators
- Guided next steps

**Tools provide**:
- Filtered data
- Specific queries
- Detailed information

---

### Pattern 4: Name-Based Discovery

**When you don't know IDs**:

```
1. project(action: "pov.list", customer_name="Acme") → Find POVs for customer
2. project(action: "pov.details", pov_name="Acme") → Get POV details
3. project(action: "task.list", pov_name="Acme", assignee_name="John") → Filtered tasks
```

**No ID lookups needed!** All filters accept names with partial matching.

---

## Quick Reference

### All List Tools with Pagination

| Tool | Default Limit | Max Limit | Supports Pagination |
|------|---------------|-----------|---------------------|
| project.task_list | 100 | 200 | ✅ Yes |
| project.pov_list | 100 | 200 | ✅ Yes |
| template.list | 50 | 200 | ✅ Yes |
| services.discover | 20 | 200 | ✅ Yes |
| list_browser_templates | 20 | 200 | ✅ Yes |

### All Name-Based Filters

| Filter | Tool | Matches On | Case-Sensitive? |
|--------|------|-----------|-----------------|
| pov_name | project(action: "task.list"), project(action: "pov.details") | title, customerName | No |
| assignee_name | project.task_list | name, email | No |
| phase_name | project.task_list | phase.name | No |
| stage_name | project.task_list | stage.name | No |
| team_name | project.task_list | team.name | No |
| customer_name | project.pov_list | customerName | No |
| owner_name | project.pov_list | owner.name | No |
| agent_template_name | template.list | name | No |

**All support partial matching** (contains, case-insensitive)

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

- **User Guide**: `/.claude/knowledge/domain/mcp/user-guide.md`
- **API Reference**: `/.claude/knowledge/domain/mcp/api-reference.md`
- **Migration Guide**: `/.claude/knowledge/domain/mcp/migration-guide.md`

---

**Document Version**: 1.0
**Created**: 2025-11-17 (extracted from best-practices.md)
**Production Validated**: November 2025 (Sprint 1)
**Referenced By**: mcp-integration-specialist, chatgpt-connector-specialist, mcp-hub-specialist
