# Domain Analysis Template for New Specialist Creation

This template guides discovery-scout in gathering comprehensive domain information before creating a new specialist agent.

## Phase 1: Domain Discovery Questions

### 1. Domain Boundaries
- [ ] What is the primary domain/area of responsibility?
- [ ] What are the clear boundaries (what it does vs doesn't do)?
- [ ] What existing specialists might overlap with this domain?
- [ ] What makes this domain unique enough to need its own specialist?

### 2. File System Mapping
```bash
# Commands to run:
find . -type f -name "*[domain]*" | head -20
grep -r "[domain]" --include="*.ts" --include="*.js" | head -20
ls -la /lib/services/*[domain]*
ls -la /app/api/*[domain]*
```

### 3. Core Components Investigation
- [ ] **Primary files**: Which files are central to this domain?
- [ ] **Service layer**: What services exist in `/lib/services/`?
- [ ] **API routes**: What endpoints in `/app/api/`?
- [ ] **Database models**: What Prisma models are involved?
- [ ] **UI components**: What components in `/components/`?
- [ ] **Types/Interfaces**: What type definitions exist?

### 4. Integration Points
- [ ] **Upstream dependencies**: What does this domain depend on?
- [ ] **Downstream consumers**: What depends on this domain?
- [ ] **External integrations**: Third-party services, APIs?
- [ ] **Database relationships**: Foreign keys, joins?

### 5. Common Operations
- [ ] **CRUD operations**: Create, Read, Update, Delete patterns
- [ ] **Business logic**: Core algorithms or processes
- [ ] **Validation rules**: What needs to be validated?
- [ ] **Security concerns**: Auth, permissions, data protection?

### 6. Known Issues & Patterns
```bash
# Search for TODOs, FIXMEs, HACKs in domain
grep -r "TODO\|FIXME\|HACK" --include="*[domain]*"

# Search for error handling
grep -r "throw\|catch\|error" --include="*[domain]*" | head -20

# Search for common patterns
grep -r "async\|await\|Promise" --include="*[domain]*" | head -20
```

## Phase 2: Domain Expertise Synthesis

### Core Knowledge Areas (from investigation)
1. **Primary Area**: [Discovered primary responsibility]
   - Key files: [List critical files found]
   - Main patterns: [Patterns observed]
   - Core responsibilities: [What it manages]

2. **Secondary Area**: [Discovered secondary responsibility]
   - Key files: [List critical files found]
   - Main patterns: [Patterns observed]
   - Core responsibilities: [What it manages]

### Learning Notes Collection
```markdown
# Extract from code comments and patterns:
- **Pattern**: [Observed pattern] - [Why it exists]
- **Gotcha**: [Found issue/quirk] - [How to handle]
- **Tip**: [Performance/efficiency finding] - [Application]
- **Critical**: [Important bug/fix found] - [file:line reference]
```

### Handover Relationships
Based on integration points found:
- **From [other-specialist]**: When [scenario based on dependencies]
- **To [other-specialist]**: When [scenario based on consumers]
- **To discovery-scout**: When [unexplored areas found]

### Collaboration Boundaries
Based on security/ethics findings:
- What authority should this specialist have?
- What should they be empowered to change?
- What should they question or decline?
- What ethical boundaries apply?

## Phase 3: Validation Questions

Before creating the specialist, validate:

1. **Uniqueness Check**
   - Is this domain already covered by existing specialists?
   - Could this be a sub-responsibility of an existing specialist?
   - Is the domain large enough to warrant its own specialist?

2. **Complexity Assessment**
   - Number of files involved: [Count]
   - Lines of code in domain: [Estimate]
   - Number of integration points: [Count]
   - Frequency of changes/updates: [Git history check]

3. **Value Proposition**
   - What specific expertise would this specialist provide?
   - What tasks would become easier/safer with this specialist?
   - What bugs/issues could this specialist prevent?

## Phase 4: Information Gathering Commands

### Comprehensive Domain Analysis Script
```bash
#!/bin/bash
DOMAIN="$1"

echo "=== Domain Analysis for: $DOMAIN ==="

echo "\n--- File Distribution ---"
find . -type f -name "*${DOMAIN}*" -not -path "*/node_modules/*" | wc -l
echo "Total files containing '$DOMAIN' in name"

echo "\n--- Code References ---"
grep -r "$DOMAIN" --include="*.ts" --include="*.js" --include="*.tsx" --exclude-dir=node_modules | wc -l
echo "Total code references"

echo "\n--- Service Layer ---"
ls -la lib/services/*${DOMAIN}* 2>/dev/null || echo "No services found"

echo "\n--- API Routes ---"
find app/api -name "*${DOMAIN}*" -type f 2>/dev/null || echo "No API routes found"

echo "\n--- Database Models ---"
grep -A 10 -B 2 "model.*${DOMAIN}" prisma/schema.prisma 2>/dev/null || echo "No models found"

echo "\n--- Recent Changes ---"
git log --oneline --grep="$DOMAIN" -10 2>/dev/null || echo "No recent commits"

echo "\n--- Error Patterns ---"
grep -r "throw.*Error" --include="*${DOMAIN}*" | head -5

echo "\n--- Test Coverage ---"
find . -name "*.test.*" -o -name "*.spec.*" | xargs grep -l "$DOMAIN" 2>/dev/null | head -5
```

## Phase 5: Domain Knowledge Template

After analysis, fill this template for the specialist's Core Knowledge section:

```markdown
## Core Knowledge and Expertise

### [Primary Domain Area - from Phase 2]
- **Responsibility**: [What this specialist owns]
- **Key Files**: 
  - `[path]` - [purpose discovered]
  - `[path]` - [purpose discovered]
- **Patterns**: [Common patterns found in investigation]
- **Integration Points**: [Discovered connections]

### [Secondary Domain Area - from Phase 2]
- **Responsibility**: [What this specialist owns]
- **Key Files**: 
  - `[path]` - [purpose discovered]
- **Patterns**: [Common patterns found in investigation]
- **Integration Points**: [Discovered connections]

### Specialized Knowledge
- **Unique Expertise**: [What only this specialist would know]
- **Complex Scenarios**: [Difficult situations found]
- **Risk Areas**: [Security/performance concerns discovered]
```

## Usage by Discovery Scout

When creating a new specialist:

1. **Run Phase 1**: Execute all discovery commands with domain keyword
2. **Analyze Phase 2**: Synthesize findings into expertise areas
3. **Validate Phase 3**: Ensure specialist is warranted
4. **Execute Phase 4**: Run comprehensive analysis script
5. **Complete Phase 5**: Fill in the domain knowledge template
6. **Create Specialist**: Use findings to populate gold standard template

This ensures discovery-scout gathers complete domain information before creating any specialist.