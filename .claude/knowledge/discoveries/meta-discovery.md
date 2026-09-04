# Meta-Discovery Prompt: Discovering What Needs to Be Discovered

**Last Updated**: 2025-01-23  
**Status**: Enhanced v2.0 - Plan 8 + Phase 2 Integration Complete  
**Confidence**: Very High - Updated with enterprise compliance, parameter intelligence, and trial systems
**Last Validated**: 2025-01-23 - During Phase 2 UX enhancement implementation with 5 specialist updates

## Purpose
This meta-discovery prompt helps identify which areas of the codebase need investigation before starting any task. It's the "discovery of discoveries" - determining what you don't know that you need to know.

## When to Use This
- Starting any new task without clear domain boundaries
- When multiple specialists might be involved
- Before creating new features that could impact multiple systems
- When the scope of change is unclear
- As the first step in any discovery-first workflow

## Meta-Discovery Process

### Phase 1: Task Decomposition
Break down the user's request to understand:

```bash
# 1. What is the core intent?
echo "Task: [USER_TASK]"
echo "Primary Goal: [WHAT_THEY_WANT_TO_ACHIEVE]"
echo "Success Criteria: [HOW_WE_KNOW_IT'S_DONE]"

# 2. What domains might be involved?
echo "Potential Domains:"
```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:
- [ ] Authentication/Permissions
- [ ] Database/Schema
- [ ] Task Management
- [ ] Template System
- [ ] Browser Automation
- [ ] MCP Integration
- [ ] Performance
- [ ] Deployment
- [ ] Types/Validation
- [ ] Enterprise Trials (NEW)
- [ ] Compliance & Security (Plan 8)
- [ ] Parameter Intelligence (Phase 2A)
- [ ] Prompt Enhancement (Phase 2B)
- [ ] Claude Desktop Compatibility
- [ ] Other: [SPECIFY]


### Phase 2: Domain Boundary Analysis

For each potential domain, assess involvement level:

```bash
# Check file patterns that might be affected
echo "=== Domain Touch Points ==="

# Authentication touches
grep -r "auth\|permission\|rbac\|jwt\|session" . --include="*.ts" --include="*.tsx" | wc -l

# Database touches  
grep -r "prisma\|schema\|migration\|transaction" . --include="*.ts" | wc -l

# Task system touches
grep -r "task\|bulkService\|taskService" . --include="*.ts" | wc -l

# Template touches
grep -r "template\|agentTemplate\|workflowTemplate" . --include="*.ts" | wc -l

# Browser automation touches
grep -r "browser\|playwright\|automation\|workflow" . --include="*.ts" | wc -l

# Enterprise trial touches
grep -r "trial\|enterprise.*registration\|company.*trial" . --include="*.ts" --include="*.js" | wc -l

# Compliance and security touches (Plan 8)
grep -r "compliance\|anthropic\|safeguard\|tool.*security" . --include="*.ts" --include="*.js" | wc -l

# Parameter intelligence touches (Phase 2A)
grep -r "parameter.*intelligence\|contextual.*hint\|smart.*default" . --include="*.ts" --include="*.js" | wc -l

# Claude Desktop compatibility touches
grep -r "claude.*desktop\|parameter.*extraction\|top.*level.*param" . --include="*.ts" --include="*.js" | wc -l
```

### Phase 3: Dependency Web Discovery

Identify interconnections between domains:

```bash
# Find cross-domain imports
echo "=== Cross-Domain Dependencies ==="

# Which services import from multiple domains?
find lib/services -name "*.ts" -exec sh -c 'echo "File: $1"; grep -h "^import.*from" "$1" | grep -E "(auth|prisma|task|template|browser)" | head -5' _ {} \;

# Which API routes touch multiple systems?
find app/api -name "*.ts" -exec sh -c 'echo "Route: $1"; grep -h "import.*from" "$1" | grep -E "(services|prisma|auth)" | wc -l' _ {} \;
```

### Phase 4: Risk Assessment Matrix

Build a risk profile for the task:

```markdown
## Risk Assessment

### High Risk Areas (Need Deep Discovery)
- [ ] Changes to authentication flow
- [ ] Database schema modifications  
- [ ] Cross-service transaction boundaries
- [ ] Performance-critical paths
- [ ] Security-sensitive operations

### Medium Risk Areas (Need Standard Discovery)
- [ ] New API endpoints
- [ ] UI component changes
- [ ] Configuration updates
- [ ] New integrations

### Low Risk Areas (Light Discovery)
- [ ] Documentation updates
- [ ] Styling changes
- [ ] Log additions
- [ ] Test additions
```

### Phase 5: Specialist Selection Matrix

Based on findings, determine which specialists are needed:

```markdown
## Specialist Requirements

### Primary Specialists Needed
| Specialist | Confidence | Reason |
|------------|------------|--------|
| [specialist-name] | [0-100]% | [why needed] |

### Supporting Specialists
| Specialist | Confidence | Reason |
|------------|------------|--------|
| [specialist-name] | [0-100]% | [why might be needed] |

### Specialists to Create
| Domain | Justification |
|--------|---------------|
| [new-domain] | [why no existing specialist covers this] |
```

### Phase 6: Discovery Prompt Selection

Select which discovery prompts to run:

```bash
# List all available discovery prompts
ls -la ./cline_docs/discovery-prompts/*.md

# Check for /prompt command system coverage
echo "=== Prompt System Coverage ==="
echo "MCP Integration includes prompts: $(grep -c 'prompt_command\|PromptCommandHandler' cline_docs/discovery-prompts/mcp-integration-discovery.md)"
echo "Prompt Construction includes /prompt: $(grep -c '\/prompt\|PromptCommandHandler' cline_docs/discovery-prompts/prompt-construction-discovery.md)"
echo "System Review checks accessibility: $(grep -c 'Prompt Command Accessibility' cline_docs/discovery-prompts/system-reviewer-discovery.md)"
echo "Troubleshooting covers prompts: $(grep -c 'prompt Command Troubleshooting' cline_docs/discovery-prompts/trouble-shooting-discovery.md)"

# Categorize by relevance
echo "=== Essential Discoveries ==="
```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:
- [ ] [discovery-prompt-1.md] - Critical for [reason]
- [ ] [discovery-prompt-2.md] - Critical for [reason]

```bash
echo "=== Recommended Discoveries ==="
```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:
- [ ] [discovery-prompt-3.md] - Helpful for [reason]
- [ ] prompt-construction-discovery.md - Now includes /prompt command system
- [ ] mcp-integration-discovery.md - Now includes prompt_command tool

```bash
echo "=== Optional Discoveries ==="
```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:
- [ ] [discovery-prompt-4.md] - Might reveal [insight]


### Phase 7: Execution Order Planning

Determine the optimal sequence:

```markdown
## Execution Plan

### Discovery Sequence
1. **Meta-discovery** (this prompt) - ✅ Complete
2. **[First domain discovery]** - Most critical path
3. **[Second domain discovery]** - Dependencies on first
4. **[Third domain discovery]** - Parallel possible

### Specialist Activation Sequence
1. **discovery-scout** - Orchestrate overall workflow
2. **[Primary specialist]** - Core implementation
3. **[Support specialist]** - Handle integrations
4. **[Review specialist]** - Validate changes

### Parallelization Opportunities
- Can run simultaneously: [discovery-A], [discovery-B]
- Must be sequential: [discovery-C] → [discovery-D]

### Phase Orchestration Patterns (From Implementation Experience)
Based on Phase 1 & 2 implementation, key orchestration patterns:
- **Multi-specialist coordination**: Up to 6+ specialists working together
- **Discovery prompt updates**: Update prompts based on implementation learnings
- **Gold standard template creation**: Systematic specialist creation process
- **Registry maintenance**: Keep AGENT-REGISTRY.md current with discoveries
- **Performance validation**: Validate that changes work before handover
```

## Meta-Discovery Output Template

After running this meta-discovery, provide:

```markdown
# Meta-Discovery Results

## Task Understanding
- **Core Intent**: [what user really wants]
- **Complexity Level**: [Low/Medium/High/Very High]
- **Estimated Scope**: [X domains, Y specialists, Z discoveries]

## Domains Requiring Investigation
1. **[Domain 1]**: [High/Medium/Low] involvement
2. **[Domain 2]**: [High/Medium/Low] involvement

## Recommended Discovery Sequence
1. Run [discovery-1] because [reason]
2. Run [discovery-2] because [reason]
3. Consider [discovery-3] if [condition]

## Specialist Coordination Plan
- **Lead**: [specialist-name]
- **Support**: [specialist-names]
- **Review**: [specialist-name]

## Risk Mitigation
- **Highest Risk**: [what could go wrong]
- **Mitigation**: [how we prevent it]

## Success Metrics
- [ ] All critical paths discovered
- [ ] Dependencies mapped
- [ ] Risks identified
- [ ] Specialists selected
- [ ] Execution plan created

## Next Immediate Action
→ Run [specific-discovery.md] to begin mapping [domain]
```

## Meta Patterns to Watch For

### Indicators You Need Deeper Discovery
- Multiple "I'm not sure" moments
- Cross-domain imports exceed 3 systems
- The word "refactor" appears in task description
- Performance or security implications
- Database schema changes required

### Indicators You Can Proceed Quickly
- Single domain, single specialist
- Well-documented existing patterns
- Isolated component changes
- Clear success criteria
- Recent similar changes exist

### When to Create New Specialists
- No existing specialist covers >50% of domain
- Unique expertise required repeatedly
- Complex domain with 10+ files
- Critical business logic needing ownership

### Discovery Prompt Update Patterns (From Implementation)
Key patterns for updating discovery prompts based on implementation learnings:
- **TypeScript Error Patterns**: Add compilation error detection commands
- **Build System Issues**: Include webpack/Next.js troubleshooting patterns
- **Environment Configuration**: Add critical .env.local requirements
- **Authentication Patterns**: Include JWT/API key configuration discoveries
- **Performance Validation**: Add commands to verify optimizations work
- **Multi-specialist Coordination**: Update with handover patterns that work
- **Registry Maintenance**: Include commands to update AGENT-REGISTRY.md
- **Gold Standard Usage**: Reference gold standard template for specialist creation

## Recent Updates

### /prompt Command System (2025-01-13)
The following discovery prompts have been enhanced to include the new `/prompt` command system:
- **mcp-integration-discovery.md**: Added Section 15 for prompt_command tool discovery
- **prompt-construction-discovery.md**: Added Section 10 for /prompt command system discovery
- **system-reviewer-discovery.md**: Added Section 12 for prompt command accessibility checks
- **trouble-shooting-discovery.md**: Added Section 14 for /prompt command troubleshooting

This enables MCP prompts to be accessible in Claude Desktop through the `/prompt` command interface.

## Remember: Think About Thinking

This meta-discovery is about:
1. **Knowing what you don't know** - Identifying knowledge gaps
2. **Preventing unknown unknowns** - Discovering hidden dependencies
3. **Optimizing discovery effort** - Don't over-discover simple tasks
4. **Coordinating complexity** - Planning multi-specialist workflows
5. **Reducing rework** - Finding issues before implementation

The goal is not to discover everything, but to discover everything that matters for the task at hand.