# Discovery Prompt Generator

**Last Updated**: 2025-01-07  
**Status**: Enhanced v2.1  
**Confidence**: Very High - Incorporates enhanced progress tracking and handover protocols
**Last Validated**: Never - Meta tool

## v2.1 Enhancements
- **Visual Progress Tracking**: Real-time discovery execution monitoring
- **Visual Handover Protocol**: Seamless specialist transitions
- **Specialist Reception Templates**: Standardized handover acknowledgment

## Purpose
Generate focused discovery prompts for specific services, components, or features by analyzing their implementation and relationships.

## Usage
Point me to a service file, component directory, or feature area, and I'll create a tailored discovery prompt.

## Generation Process

### Step 1: Initial Analysis
When given a service or component path, I will:

1. **Read the primary file** to understand:
   - Core purpose and responsibilities
   - Public methods and interfaces
   - Dependencies and imports
   - Data structures used

2. **Identify patterns**:
   - Naming conventions
   - File organization
   - Integration points
   - Error handling patterns

3. **Trace relationships**:
   - What calls this service/component?
   - What does it call?
   - What data does it manage?
   - How does it fit in the architecture?

### Step 2: Discovery Prompt Creation

Based on the analysis, I'll create a discovery prompt with:

```markdown
# [Service/Component Name] Discovery Task

**Last Updated**: [current date]
**Status**: Current
**Confidence**: [High/Medium/Low] - [reason for confidence level]
**Last Validated**: Never - Needs validation run

## Objective
[Specific goal based on the service's purpose]

## Context
[Why this discovery matters, based on the service's role]

## Discovery Scope

### 1. [Core Functionality Area]
- [ ] [Specific items to discover]
- [ ] [Key patterns to identify]
- [ ] [Integration points to map]

### 2. [Related Systems]
- [ ] [Dependencies to trace]
- [ ] [Data flows to document]

## Search Strategies

### 1. [Primary Pattern Category]
```bash
# Executable bash commands
grep -r "pattern" --include="*.ts" -B 2 -A 5
find . -name "*pattern*" | grep -v node_modules
```

### 2. [Secondary Pattern Category]
```bash
# More executable commands
grep -r "import.*ServiceName" --include="*.ts"
```

[Continue with 5-10 search strategy sections]

## Special Attention Areas

1. **[Risk Area 1]**: [What to look for and why]
2. **[Risk Area 2]**: [Potential issues]
[5-7 special attention items]

## Risk Assessment Matrix

| Risk | Severity | Likelihood | Impact |
|------|----------|------------|---------|
| [Risk 1] | High | Medium | [Impact description] |
| [Risk 2] | Medium | High | [Impact description] |

## Expected Outputs

### 1. Component Inventory
```markdown
## [Service Name] Components

### Core Files
- [Primary file] - [Purpose]
- [Secondary files] - [Purpose]

### Integration Points
- [Service A] - [How it integrates]
- [Service B] - [How it integrates]
```

### 2. Data Flow Analysis
[Structured flow diagram or description]

### 3. Performance Metrics
[Key metrics to collect]

## Output Format

```markdown
# [Service Name] Discovery Report

## Summary
- Total files: X
- Integration points: Y
- Risk areas: Z
[Additional summary metrics]

## Detailed Findings
[Structured sections based on discovery]

## Recommendations
1. [Critical - Immediate action]
2. [Important - Near-term]
3. [Nice to have - Future]

## Test Scenarios
1. [Key scenario to validate]
2. [Edge case to test]
```

## Deliverables

1. [Complete inventory of X]
2. [Analysis of Y]
3. [Recommendations for Z]
[7-10 specific deliverables]

## Success Criteria

- [Measurable outcome 1]
- [Measurable outcome 2]
[5-7 success criteria]
```

## Examples

### For a Service
```bash
"Please analyze /lib/services/agentTemplateService.ts and create a discovery prompt"
```

I would examine:
- CRUD operations
- Data transformations
- Validation logic
- Integration with other services
- Database queries

### For a UI Component
```bash
"Please analyze /components/admin/templates/ and create a discovery prompt"
```

I would examine:
- Component hierarchy
- State management
- API interactions
- User workflows
- Event handling

### For a Feature Area
```bash
"Please analyze the token management system and create a discovery prompt"
```

I would examine:
- All files with 'token' in the name
- Token-related imports
- Configuration patterns
- Usage tracking

## Quick Start Commands

### Service Discovery
```markdown
Create a discovery prompt for [service path]. Focus on:
- Data flow
- Integration points  
- Error handling
- Performance patterns
```

### Component Discovery
```markdown
Create a discovery prompt for [component path]. Focus on:
- User interactions
- State management
- API calls
- Component relationships
```

### Feature Discovery
```markdown
Create a discovery prompt for [feature name]. Focus on:
- Implementation spread
- Configuration options
- Usage patterns
- Extension points
```

## Enhanced Discovery Standards (v2.0)

### Key Enhancements for 10/10 Quality

1. **Executable Commands**: All search strategies must include copy-paste bash commands
2. **Risk Assessment Matrix**: Identify and prioritize potential issues
3. **Special Attention Areas**: 5-7 specific risk areas to investigate
4. **Structured Output Format**: Detailed report template with sections
5. **Clear Deliverables**: 7-10 specific outputs expected
6. **Success Criteria**: Measurable completion indicators
7. **Validation Tracking**: "Last Validated" field for freshness

### Additional v2.0 Features

1. **Multi-File Relationship Tracking**: Commands to map dependencies
2. **Configuration Discovery**: Environment variables and settings
3. **Test Coverage Analysis**: Find related tests
4. **Performance Profiling**: Size and complexity metrics
5. **Validation Commands**: Health check scripts
6. **Debugging Helpers**: Next-step suggestions

## Benefits of Enhanced Approach

1. **Contextual**: Discovery prompts match the actual implementation
2. **Focused**: Only includes relevant search patterns
3. **Maintainable**: Easy to regenerate as code evolves
4. **Flexible**: Can be broad or narrow as needed
5. **Actionable**: Executable commands reduce manual work
6. **Risk-Aware**: Proactively identifies potential issues
7. **Comprehensive**: Covers all aspects from code to configuration

## Sub-Agent Creation

When your discovery reveals a complex area that would benefit from specialized expertise:

1. **Assess Complexity**: Does this area have unique patterns, frequent changes, or specialized knowledge requirements?
2. **Create Sub-Agent**: Use the template at `/.claude/sub-agents/sub-agent-collaboration-template.md`
3. **Include Collaboration**: Ensure the sub-agent has:
   - Collaboration Note with domain-specific empowerments
   - Task Handover Protocol for working with other specialists
   - Clear guidance on when to speak up or decline tasks
4. **Document Expertise**: Define what makes this sub-agent unique

## When to Use

- **Before refactoring**: Generate discovery for the specific area
- **Debugging**: Create targeted discovery for problem areas
- **Feature addition**: Understand existing patterns first
- **Code review**: Generate discovery to understand changes

## Advanced Usage

### Comparative Discovery
```markdown
Create a discovery prompt comparing:
- Old implementation: [path]
- New implementation: [path]
Focus on migration risks
```

### Cross-Service Discovery
```markdown
Create a discovery prompt for data flow between:
- Service A: [path]
- Service B: [path]
Focus on integration points
```

### Performance Discovery
```markdown
Create a discovery prompt for [service path] focusing on:
- Database queries
- Caching patterns
- Batch operations
- Resource usage
```

## Recommended Approach: Service-Based Discovery

### Why Service-Based Discovery Works Better

1. **Natural Boundaries**: Your codebase already has logical separations
   - Services encapsulate business logic
   - Components encapsulate UI behavior
   - API routes define external interfaces
   - Each has distinct patterns and concerns

2. **AI Learning**: By examining actual code, the AI learns:
   - Your naming conventions
   - Your error handling patterns
   - Your data flow preferences
   - Your architectural decisions

3. **Focused Investigation**: Narrow scope means:
   - Faster discovery execution
   - More detailed findings
   - Actionable results
   - Less noise in reports

4. **Progressive Understanding**: Build knowledge incrementally:
   ```markdown
   Day 1: "Create discovery for agentExecutionEngine.ts"
   Day 7: "Expand discovery to include integrated services"
   Day 14: "Create cross-service discovery for execution flow"
   ```

### Natural Entry Points in Your Codebase

Use these directories as starting points:

1. **Core Services** (`/lib/services/*`)
   - Business logic and orchestration
   - Start here for feature understanding
   - Example: `agentExecutionEngine.ts`, `agentTemplateService.ts`

2. **UI Components** (`/components/*`)
   - User interaction and state management
   - Start here for UI/UX issues
   - Example: `/components/admin/templates/`, `/components/poveditor/`

3. **API Routes** (`/app/api/*`)
   - External interfaces and data contracts
   - Start here for integration issues
   - Example: `/app/api/agent-templates/`, `/app/api/mcp/tasks/`

4. **MCP System** (`/lib/mcp/*`)
   - Tool integration and protocol handling
   - Start here for MCP-related features
   - Example: `embedded-server.ts`, `mcpService.ts`

### Practical Workflow Examples

#### Debugging Workflow
```markdown
1. Identify problem area: "Execution updates not showing"
2. Request: "Create discovery for execution-streaming.js"
3. Run discovery → Find subscription management issue
4. Fix issue
5. Request: "Update discovery to verify fix"
```

#### Feature Addition Workflow
```markdown
1. New feature: "Add execution retry mechanism"
2. Request: "Create discovery for agentExecutionEngine.ts focusing on error handling"
3. Run discovery → Understand current patterns
4. Implement following discovered patterns
5. Request: "Create discovery to verify retry integration"
```

#### Refactoring Workflow
```markdown
1. Goal: "Refactor agent template storage"
2. Request: "Create discovery for agentTemplateService.ts"
3. Run discovery → Map all touchpoints
4. Request: "Create impact analysis discovery for template refactoring"
5. Refactor safely with full context
```

### Composing Discoveries

Build comprehensive understanding by combining focused discoveries:

```markdown
# For Complete Feature Understanding
1. Service discovery: Backend logic
2. API discovery: External interfaces  
3. Component discovery: UI interactions
4. Integration discovery: How they connect

# Example: Agent Templates
- Discovery 1: agentTemplateService.ts
- Discovery 2: /api/agent-templates/*
- Discovery 3: /components/admin/templates/*
- Combine: Full template system understanding
```

### When to Use Master Discovery

Reserve comprehensive discovery for:
- Initial system onboarding
- Major architectural reviews
- Security audits
- Performance optimization across system

### Discovery Prompt Maintenance

Keep discoveries current:

```markdown
# Version 1: Initial discovery
"Create discovery for agentExecutionEngine.ts"

# Version 2: After adding streaming
"Update execution discovery to include streaming integration"

# Version 3: After performance optimization
"Update execution discovery focusing on performance patterns"
```

Track discovery evolution:
```bash
git commit -m "discovery: Update execution discovery for streaming feature"
```

## Best Practices for Discovery Generation

### Core Principles
1. **Start Specific**: Begin with one file or service
2. **Expand Gradually**: Add scope as needed
3. **Keep History**: Save discovery outputs for comparison
4. **Update Regularly**: Regenerate after major changes
5. **Share Results**: Discovery outputs are valuable documentation

### v2.1 Standards Checklist (Enhanced)
When generating a discovery prompt, ensure it includes:

- [ ] **Header Block**: Last Updated, Status, Confidence, Last Validated
- [ ] **Clear Objective**: Specific, measurable goal
- [ ] **Context Section**: Why this discovery matters
- [ ] **Structured Scope**: Numbered sections with checkboxes
- [ ] **15+ Search Strategies**: Executable bash commands
- [ ] **Progress Tracking Section**: Visual progress indicators with `[░░░░░░░░░░]` style
- [ ] **Visual Handover Protocol**: Discovery handover and specialist reception templates
- [ ] **Special Attention Areas**: 5-7 risk areas
- [ ] **Risk Assessment Matrix**: Table format
- [ ] **Expected Outputs**: Multiple structured sections
- [ ] **Comprehensive Output Format**: Full report template
- [ ] **10+ Deliverables**: Specific, actionable items
- [ ] **Success Criteria**: 5-7 measurable outcomes
- [ ] **Validation Helpers**: Health check commands
- [ ] **Debugging Next Steps**: Actionable suggestions

### Search Strategy Categories to Include
1. **Core Component Patterns**: Primary service/component searches
2. **Multi-File Relationships**: Dependency mapping
3. **Configuration Discovery**: Settings and environment
4. **API/Route Mapping**: Endpoint discovery
5. **Test Coverage**: Related test files
6. **Performance Profiling**: Size and complexity
7. **Error Patterns**: Exception handling
8. **Data Flow Visualization**: Transformation points
9. **Integration Points**: Cross-service connections
10. **Validation Commands**: Component health checks

## Anti-Patterns to Avoid

### Discovery Generation Anti-Patterns
1. **Too Broad**: "Create discovery for entire system" → Information overload
2. **Too Vague**: "Create discovery for bugs" → Unfocused results
3. **Never Updating**: Using outdated discoveries → Missing new patterns
4. **Not Sharing**: Keeping discoveries private → Team knowledge gaps

### v2.0 Quality Anti-Patterns
5. **Non-Executable Commands**: Providing only search patterns without bash commands
6. **Missing Risk Assessment**: No consideration of what could go wrong
7. **Vague Deliverables**: "Understand the system" vs specific outputs
8. **No Success Criteria**: Unclear when discovery is complete
9. **Flat Structure**: Everything at same level vs hierarchical organization
10. **No Validation**: Missing health check commands

## Example: Enhanced Discovery Generation

### Input Request
```markdown
Create a discovery prompt for /lib/services/newFeatureService.ts
```

### Enhanced Generation Process

1. **Analyze the Service**
   - Read primary file
   - Identify imports/exports
   - Find calling patterns
   - Check for tests

2. **Generate Search Strategies**
   ```bash
   # Example generated commands
   grep -r "newFeatureService" --include="*.ts" -l
   grep -r "import.*newFeature" --include="*.ts" -B 2 -A 2
   find . -name "*newFeature*.test.ts" | head -10
   ```

3. **Identify Risks**
   - Performance bottlenecks
   - Security vulnerabilities
   - Integration failures
   - Data consistency issues

4. **Structure Output Format**
   - Service inventory
   - Integration map
   - Risk assessment
   - Recommendations

5. **Define Success Criteria**
   - All files mapped
   - Integration points documented
   - Risks assessed
   - Performance analyzed

## v2.0 Discovery Template (Enhanced with Progress Tracking & Handover)

Copy and customize this template when generating new discoveries:

```markdown
# [Name] Discovery Task

**Last Updated**: YYYY-MM-DD  
**Status**: Current  
**Confidence**: High - [Reason]
**Last Validated**: Never - Needs validation run

## Objective
[One sentence clear goal]

## Context
[2-3 sentences on why this matters]

## Discovery Scope

### 1. [Primary Focus Area]
- [ ] [Specific discovery task]
- [ ] [Another specific task]
- [ ] [Pattern to identify]

### 2. [Secondary Focus Area]
- [ ] [Related discovery task]
- [ ] [Integration to map]

### 3. [Configuration and Setup]
- [ ] [Environment variables]
- [ ] [Configuration files]
- [ ] [Dependencies]

## Search Strategies

### 1. Core Component Discovery
```bash
# Main component patterns
grep -r "ComponentName" --include="*.ts" --include="*.tsx" -l
grep -r "class ComponentName\|function ComponentName" --include="*.ts"

# Imports and usage
grep -r "import.*ComponentName" --include="*.ts" -B 1 -A 1
grep -r "new ComponentName\|ComponentName\." --include="*.ts"
```

### 2. Configuration and Environment
```bash
# Environment variables
grep -r "process\.env\." --include="*.ts" | grep -i component
grep -r "COMPONENT_\|_COMPONENT" .env* 2>/dev/null

# Config files
find . -name "*.config.*" -o -name "config.*" | xargs grep -l component 2>/dev/null
```

### 3. API and Routes
```bash
# API endpoints
find app/api -name "*.ts" | xargs grep -l component
grep -r "/api.*component" --include="*.ts" --include="*.tsx"

# Route handlers
grep -r "router.*component\|app.*component" --include="*.ts"
```

### 4. Database and Storage
```bash
# Database queries
grep -r "prisma.*component" --include="*.ts" -B 2 -A 2
grep -r "select.*from.*component\|insert.*into.*component" --include="*.ts" -i

# Storage patterns
grep -r "localStorage.*component\|sessionStorage.*component" --include="*.ts"
```

### 5. Error Handling and Logging
```bash
# Error patterns
grep -r "throw.*Error.*component\|catch.*component" --include="*.ts" -B 2 -A 2
grep -r "ComponentError\|component.*error" --include="*.ts" -i

# Logging
grep -r "console\.\|logger\." --include="*.ts" | grep -i component
```

### 6. Test Coverage
```bash
# Test files
find . -name "*.test.ts" -o -name "*.spec.ts" | grep -i component
grep -r "describe.*Component\|test.*Component" --include="*.test.ts" --include="*.spec.ts"

# Mock patterns
grep -r "mock.*Component\|jest\.mock.*component" --include="*.ts"
```

### 7. Performance and Optimization
```bash
# Size analysis
find . -name "*component*.ts" -exec wc -l {} \; | sort -n
grep -r "useMemo\|useCallback\|memo(" --include="*.tsx" | grep -i component

# Async patterns
grep -r "async.*component\|await.*component" --include="*.ts" -C 2
```

### 8. Integration Mapping
```bash
# Service dependencies
grep -l "ComponentService" --include="*.ts" | xargs grep -h "import.*from" | sort -u

# Event emitters/listeners
grep -r "emit.*component\|on.*component" --include="*.ts" -B 1 -A 1
```

### 9. Validation and Health Checks
```bash
echo "=== Component Health Check ==="
echo "1. Main file exists: $([ -f path/to/component.ts ] && echo '✅ YES' || echo '❌ NO')"
echo "2. Test coverage: $(find . -name "*component*.test.ts" | wc -l) test files"
echo "3. Type safety: $(grep -c ": any" path/to/component.ts 2>/dev/null || echo '0') any types"
```

## Progress Tracking

Track discovery execution with visual progress indicators:

```markdown
📊 Discovery Progress: [Component Name] Discovery
═══════════════════════════════════════════════
Overall Progress: [░░░░░░░░░░] 0%

Section Progress:
□ Section 1: Core Component Discovery
□ Section 2: Configuration and Environment
□ Section 3: API and Routes
□ Section 4: Database and Storage
□ Section 5: Error Handling and Logging
□ Section 6: Test Coverage
□ Section 7: Performance and Optimization
□ Section 8: Integration Mapping
□ Section 9: Validation and Health Checks

Current Status: 🚀 Starting Discovery
Commands: 0/X executed
Findings: 0 critical ⚠️ | 0 warnings ⚡ | 0 info ℹ️
⏱️ Time: 0 minutes
```

### Progress Update Pattern
Update after each section completion:
```markdown
✅ Section 1: Core Component [██████████] 100%
   Commands: X/X | Found: [key findings]
🔄 Section 2: Configuration [███░░░░░░░] 30%
   Commands: X/X | Analyzing environment...
```

## Visual Handover Protocol

When discoveries require specialist expertise, use this handover format:

```markdown
--- DISCOVERY HANDOVER ---
Current Role: discovery-scout ✅
Discovery Progress: [██████████] 100% Complete

## Discovery Summary:
📊 **Components Found:** X/Y components ✅
⚠️ **Critical Issues:** N issues found
🔍 **Areas Investigated:** 
   - ✅ [Completed investigation]
   - ⚠️ [Issue found]
   - ❌ [Incomplete area]

## Context for Specialist:
- Key Finding: [main discovery]
- Risk Area: [critical risk]
- Focus Needed: [priority action]

Delegating to: [appropriate-specialist]
Reason: [specific expertise needed]
Priority: [what to focus on]

--- ACTIVATING [SPECIALIST-NAME] ---
```

### Specialist Reception Template
```markdown
--- [SPECIALIST-NAME] ACTIVATED ---

## Handover Acknowledged ✅
Inherited from: discovery-scout
Discovery Completeness: [██████████] 100%

## Context Received:
📊 **Components:** X/Y received ✅
⚠️ **Issues:** N issues acknowledged
🔍 **Focus Areas:** Priority acknowledged

## My Specialist Analysis Starting:
[░░░░░░░░░░] 0% → Starting analysis...
[████░░░░░░] 40% → Processing...
[██████████] 100% → Analysis complete ✅

## Specialist Findings:
1. [Finding 1]
2. [Finding 2]
3. [Finding 3]
```

## Special Attention Areas

1. **[Performance Risk]**: Look for [specific pattern]
2. **[Security Risk]**: Check [specific area]
3. **[Data Integrity]**: Verify [specific validation]
4. **[Integration Risk]**: Ensure [specific compatibility]
5. **[Maintenance Risk]**: Watch for [code smell]

## Risk Assessment Matrix

| Risk | Severity | Likelihood | Impact |
|------|----------|------------|---------|
| [Specific risk 1] | High | Medium | [Impact description] |
| [Specific risk 2] | Medium | High | [Impact description] |
| [Specific risk 3] | Low | Low | [Impact description] |

## Expected Outputs

### 1. Component Inventory
```markdown
## Component Structure
- Main files: [List]
- Supporting files: [List]
- Test files: [List]
- Total LOC: X
```

### 2. Integration Map
```markdown
## Dependencies
- Imports from: [List]
- Imported by: [List]
- API endpoints: [List]
- Database tables: [List]
```

### 3. Configuration Analysis
```markdown
## Configuration
- Environment variables: [List]
- Config files: [List]
- Default values: [List]
```

## Output Format

```markdown
# [Component] Discovery Report

## Summary
- Total files: X
- Lines of code: Y
- Test coverage: Z%
- Integration points: W
- Risk areas: V

## Detailed Findings

### Architecture Overview
[Component structure and relationships]

### Key Functionalities
[What the component does]

### Integration Analysis
[How it connects to other systems]

### Performance Profile
[Metrics and bottlenecks]

### Security Assessment
[Vulnerabilities and safeguards]

### Technical Debt
[Areas needing improvement]

## Recommendations
1. [Critical - Immediate action]
2. [Important - Short term]
3. [Nice to have - Long term]

## Test Scenarios
1. [Primary functionality test]
2. [Integration test]
3. [Edge case test]

## Next Steps
1. [Specific action with command]
2. [Follow-up investigation]
3. [Monitoring setup]
```

## Deliverables

1. Complete file inventory with categorization
2. Dependency graph showing all connections
3. Configuration documentation
4. Performance baseline metrics
5. Security vulnerability assessment
6. Test coverage analysis
7. Technical debt inventory
8. Integration test scenarios
9. Monitoring recommendations
10. Refactoring roadmap (if needed)

## Success Criteria

- All component files identified and categorized
- Integration points fully mapped with data flows
- Configuration completely documented
- Performance baseline established
- Security risks assessed and prioritized
- Test coverage gaps identified
- Clear action plan created
```