# Post-Change Specialist Review Pattern

**Confidence**: 95% (Production-proven, Feb 2026 session)
**When to use**: After completing significant refactors, cleanups, or multi-file changes
**Results**: Found 4 P1 + 4 P2 issues that manual review missed
**Key insight**: Different specialists catch different categories of issues. A general reviewer finds structural problems; a domain specialist finds semantic problems.

---

## Pattern

After completing a significant change, spawn specialist agents to review your own work before considering it done.

### When to Apply

- Removed or added 2+ components (tools, routes, models)
- Changed security boundaries or authentication flows
- Refactored code across 5+ files
- Deleted significant code (100+ lines)
- Modified configuration that affects multiple systems

### Recommended Review Order

```
Step 1: system-reviewer-specialist (structural integrity)
   ↓ fixes applied
Step 2: domain-specialist (semantic correctness)
   ↓ fixes applied
Step 3: (optional) second domain specialist if cross-cutting
```

### Why Two Passes

| Pass | Specialist | Finds | Misses |
|------|-----------|-------|--------|
| 1st | system-reviewer | Ghost configs, stale counts, dead files, doc drift | Domain-specific dead code, semantic gaps |
| 2nd | domain-specialist | Dead helper methods, broken cross-references, schema mismatches | Structural issues (already fixed) |

### Feb 2026 Results

**system-reviewer-specialist** found:
- P1: 2 ghost annotations for non-existent tools (manage_users, system_config)
- P1: Stale expected counts comment (28 → 26)
- P2: 87KB backup file (dead weight)
- P2: 139 documentation references across 36 files

**mcp-hub-specialist** found:
- P2: 356 lines dead trial code (7 methods with zero callers)
- P2: Test script calling removed tool
- P3: Schema/description mismatch (owner_name in description but not inputSchema)

**Total**: 8 issues found, 6 fixed same session. None would have been caught by the original implementer.

---

## Prompt Template

### For system-reviewer-specialist:
```
Please analyze our session for gaps — whether missed opportunities to improve
or potential bugs. Review the changes we made and check for:
- Orphaned references or stale configurations
- Dead code or unused files
- Documentation drift
- Inconsistent counts or comments
```

### For domain-specialist (e.g., mcp-hub-specialist):
```
Review the current state of [domain] after our changes for:
1. Pipeline alignment — do all layers have the same items?
2. Cross-references — are all references between items valid?
3. Dead code — any methods/imports with zero callers?
4. Handler integrity — clean imports, no unreachable code?
5. Any domain-specific issues a general reviewer would miss?

Please READ the actual files to verify — don't rely on assumptions.
Prioritize findings as P1 (must fix), P2 (should fix), P3 (nice to have).
```

---

## ROI

- Time investment: ~10 minutes (specialist runs autonomously)
- Issues found: 4-8 per major session
- Issues prevented: Ghost tools, dead code in production, broken test scripts
- Confidence boost: From "probably clean" to "verified clean"

This pattern is most valuable when you've been deep in implementation mode and need fresh eyes on the result.
