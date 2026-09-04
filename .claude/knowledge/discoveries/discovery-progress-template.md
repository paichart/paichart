# Discovery Progress Tracking Template

When executing any v2.0 discovery, use this progress tracker to ensure completeness:

## Progress Tracker Format

```markdown
📊 Discovery Progress: [Discovery Name]
═══════════════════════════════════════

Section Progress:
□ Section 1: [Name] - Not Started
□ Section 2: [Name] - Not Started  
□ Section 3: [Name] - Not Started
[...continue for all sections]

Current Status: Executing Section [X]
Commands Run: [X/Y]
Findings: [X critical, Y warnings, Z info]

⏱️ Time Elapsed: [X] minutes
```

## During Execution

Update the tracker as you progress:
```markdown
✅ Section 1: Complete (5 commands, 2 findings)
🔄 Section 2: In Progress (3/8 commands)
□ Section 3: Pending
```

## Completion Summary

```markdown
Discovery Completion Report
══════════════════════════
Total Sections: [X]
Completed: [Y] (Z%)
Critical Findings: [List]
Time Taken: [X] minutes
Specialist Handoffs: [List]
```

## Usage Instructions

1. Copy this template when starting a discovery
2. Update progress after each section
3. Mark sections with:
   - □ Not Started
   - 🔄 In Progress  
   - ✅ Complete
   - ⏭️ Skipped (with reason)
4. Include in final report