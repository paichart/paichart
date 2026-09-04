# MCP User Guide

**Version**: 1.0
**Last Updated**: 2025-11-17
**Audience**: AI Clients (ChatGPT, Claude Desktop, Gemini) and End Users

---

## 📋 Table of Contents

- [Understanding Pagination](#understanding-pagination)
- [Working with Completeness Indicators](#working-with-completeness-indicators)
- [Troubleshooting](#troubleshooting)
- [Support](#support)

---

## Understanding Pagination

### What is Pagination?

**Pagination** splits large result sets into smaller pages for better performance and usability.

**Example**:
```
Total tasks: 534
Returned: 100
Page: 1 of 6
```

This means you're viewing 100 out of 534 total tasks, and there are 5 more pages available.

---

### How to Recognize Paginated Results

**Look for completeness headers**:

```markdown
Found 100 of 534 total tasks (page 1 of 6)
📄 More results available - use page=2 to continue
```

**Indicators**:
- ✅ **"X of Y total"** - Shows how many results you have vs total
- 📄 **"More results available"** - Additional data exists
- ✅ **"(complete results)"** - You have all data

---

### How to Navigate Paginated Results

**Method 1: Use page parameter** (if supported)
```
project(action: "task.list", status="OPEN", page=2)
```

**Method 2: Adjust filters to narrow results**
```
# Instead of getting all 534 tasks
project(action: "task.list", status="OPEN")  # Returns 100 of 534

# Narrow by POV to get complete results
project(action: "task.list", pov_name="MyProject", status="OPEN")  # Returns 15 of 15 ✅
```

**Method 3: Increase limit** (if needed)
```
project(action: "task.list", status="OPEN", limit=200)  # Get more per page
```

---

### Metadata in Responses

All list tools return metadata in the `_meta` object:

```json
{
  "content": [{ "type": "text", "text": "..." }],
  "_meta": {
    "tool": "project(action: "task.list")",
    "itemCount": 100,
    "pagination": {
      "total": 534,
      "returned": 100,
      "hasMore": true,
      "currentPage": 1,
      "totalPages": 6,
      "nextPage": 2
    }
  }
}
```

**Use this metadata to**:
- Know if results are complete
- Calculate how many more pages exist
- Decide whether to continue fetching

---

## Working with Completeness Indicators

### Reading Completeness Messages

**Complete Results** ✅:
```
Found 15 of 15 total tasks (complete results)
```
→ You have ALL data, no need for additional queries

**Partial Results** 📄:
```
Found 100 of 534 total tasks (page 1 of 6)
📄 More results available - use page=2 to continue
```
→ You have 18.7% of data, 5 more pages available

**Empty Results**:
```
No tasks found.
```
→ Zero results match your filters

---

### When to Fetch More Data

**Scenario 1: Exploring data**
- Completeness: 20 of 200 tasks
- **Action**: Adjust filters to narrow scope (pov_name, assignee_name, etc.)
- **Reason**: Filtering is faster than pagination

**Scenario 2: Exporting all data**
- Completeness: 100 of 534 tasks
- **Action**: Use pagination (page=2, page=3, etc.)
- **Reason**: Need complete dataset

**Scenario 3: Quick overview**
- Completeness: 50 of 500 tasks
- **Action**: Work with current results
- **Reason**: Partial data sufficient for overview

---

## Troubleshooting

### "No results found" but I know data exists

**Check 1: Spelling**
```
pov_name="Retail"  # Correct
pov_name="Retial"  # Typo - no match
```

**Check 2: Partial vs Exact**
```
pov_name="Demo"  # Matches "Demo Retail Solutions"
pov_name="Demo Retail Solutions - Advanced..."  # Full name works too
```

**Check 3: Access Control**
- You can only see POVs you own or are team member of
- DEMO_USER role: Also sees demo POVs (metadata.isDemo = true)
- ADMIN role: Sees all POVs

---

### Results show "More available" but I want all data

**Option 1: Use pagination**
```
project(action: "task.list", status="OPEN", page=1)  # First 100
project(action: "task.list", status="OPEN", page=2)  # Next 100
# Continue until no more results
```

**Option 2: Narrow filters**
```
# Instead of all OPEN tasks (534)
project(action: "task.list", status="OPEN", pov_name="MyProject")  # Only 15 ✅
```

**Option 3: Increase limit**
```
project(action: "task.list", status="OPEN", limit=200)  # Get 200 per page instead of 100
```

---

### Performance is slow

**Diagnosis**:
- Global queries (no POV/team scope): Slow
- Scoped queries (specific POV): Fast

**Fix**:
```
# Slow (global)
project(action: "task.list", status="OPEN")  # Queries all accessible POVs

# Fast (scoped)
project(action: "task.list", pov_name="MyProject", status="OPEN")  # Single POV scope
```

---

### Confusion about pagination vs completeness

**Pagination**: Technical mechanism (pages of data)
**Completeness**: User-facing indicator (have all data?)

**Both work together**:
```
Found 100 of 534 total tasks (page 1 of 6)
📄 More results available

^ This tells you:
  - Pagination: Page 1 of 6 exists
  - Completeness: You have 100/534 (18.7%) - incomplete
```

---

## Support

**Documentation**:
- **User Guide** (this document): How to use MCP tools effectively
- **Implementation Patterns**: `/.claude/knowledge/domain/mcp/implementation-patterns.md`
- **API Reference**: `/.claude/knowledge/domain/mcp/api-reference.md`
- **Migration Guide**: `/.claude/knowledge/domain/mcp/migration-guide.md`

**Help**:
- Use `/prompt` command to list available prompts
- Use `services(action: "discover")` tool for MCP Hub overview
- Contact: support@paichart.com

---

**Document Version**: 1.0
**Created**: 2025-11-17 (extracted from best-practices.md)
**Related**: MCP Pagination Exposure (Sprint 1)
