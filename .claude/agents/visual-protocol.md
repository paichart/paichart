---
name: visual-protocol
description: Shared visual feedback and handover protocols for all agents to maintain consistent user experience
---

## Visual Feedback Standards

All agents should follow these visual feedback patterns for consistency:

### Agent Activation
```
--- [AGENT-NAME] ACTIVATED ---
Role: [agent-name] [emoji]
Status: [Ready/Initializing/Continuing]
Task: [brief description]
Inherited: [if handed over from another agent]
```

### Progress Tracking
Use progress bars for multi-step operations:
```
[██████░░░░] 60% - [current action]
```

Use counters for discrete items:
```
📊 Processed: 15/25 files
✅ Completed: 8/10 tasks
⚠️ Issues: 3 found
```

### Status Indicators
- ✅ Success/Complete
- ⚠️ Warning/Issue found
- ❌ Error/Failed
- 🔄 In progress
- 🔍 Investigating
- 📊 Analyzing
- 🔧 Fixing
- 📝 Documenting

### Agent Handover Protocol
```
--- AGENT HANDOVER ---
From: [current-agent] ✅
To: [next-agent]
Reason: [why delegating]
Context Passed:
  - [key finding 1]
  - [key finding 2]
Progress: [██████░░░░] 60% overall
--- DELEGATING TO [NEXT-AGENT] ---
```

### Completion Protocol
```
--- [AGENT-NAME] COMPLETE ---
Role: [agent-name] ✅
Duration: [if relevant]
📊 Summary:
  - [metric 1]: [value]
  - [metric 2]: [value]
  
Next Steps:
  1. [recommendation]
  2. [recommendation]
```

### Multi-Agent Coordination
When multiple agents work together:
```
=== MULTI-AGENT WORKFLOW ===
1. discovery-scout     [██████████] ✅ Complete
2. template-specialist [████░░░░░░] 🔄 Active
3. token-optimizer     [░░░░░░░░░░] ⏳ Queued
Overall Progress: [████████░░] 80%
```

## Implementation Guidelines

1. **Always announce activation** - Users should know which agent is active
2. **Show progress for long operations** - Any task over 5 seconds needs progress indicators
3. **Use consistent emojis** - Stick to the defined set for clarity
4. **Maintain context during handovers** - Pass relevant findings to next agent
5. **Summarize on completion** - Always provide clear results and next steps

## Example Usage

```typescript
// In agent execution
console.log("--- TEMPLATE-SPECIALIST ACTIVATED ---");
console.log("Role: template-specialist 📋");
console.log("Status: Ready to analyze templates");
console.log("Task: Migrate v1 templates to v2 format");

// During processing
console.log("[████░░░░░░] 40% - Analyzing template structure...");

// On handover
console.log("--- AGENT HANDOVER ---");
console.log("From: template-specialist ✅");
console.log("To: token-optimizer");
console.log("Reason: Templates need token optimization");
```

This protocol ensures users always understand:
- Which agent is active
- What it's doing
- How much progress has been made
- What happens next