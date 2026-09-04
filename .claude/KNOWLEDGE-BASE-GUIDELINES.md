# Claude Code Knowledge Base Guidelines

**Version**: 1.0
**Created**: 2025-10-30
**Purpose**: Define organization and decision criteria for `.claude/knowledge/` base
**Audience**: Claude Code AI assistants, developers, specialist creators

---

## Executive Summary

The `.claude/knowledge/` directory contains **permanent, reusable reference material** that agents consume during their work. This is distinct from `cline_docs/` which contains **session-specific artifacts**.

**Quick Decision**: "Is this permanent agent knowledge or temporary session artifact?"

---

## Knowledge Base Structure

```
.claude/
├── agents/                  # Specialist agent configurations (36 files)
├── templates/               # Generation templates (handover, progress tracking)
└── knowledge/              # ← PERMANENT REFERENCE MATERIAL
    ├── patterns/           # Production-tested implementation patterns
    ├── discoveries/        # Discovery prompts for systematic investigation
    │   ├── quality_gates/  # Executable validation scripts (4 .sh files)
    │   └── [domain]-discovery.md files (40+)
    ├── protocols/          # Workflow and process protocols
    ├── frameworks/         # Decision matrices and methodologies
    └── domain/            # Domain-specific deep knowledge
        ├── oauth/
        ├── testing/
        └── [other-domains]/
```

---

## Category Definitions

### `patterns/` - Implementation Pattern Libraries

**Purpose**: Production-validated code patterns that solve recurring problems

**Criteria for Inclusion**:
- ✅ Production-tested (deployed and validated)
- ✅ Confidence score ≥ 90% (specialist-reviewed)
- ✅ Zero critical bugs in first 48 hours
- ✅ Contains code examples (before/after)
- ✅ Reusable across multiple scenarios
- ✅ Has anti-patterns documented

**Examples**:
- `api-efficiency-patterns.md` (94% confidence, 14 patterns, Oct 27-28 validated)
- `security-patterns.md` (95% confidence, security test checklists, gold standard patterns)

**Format Requirements**:
```markdown
# [Domain] Patterns

**Version**: X.X
**Created**: YYYY-MM-DD
**Based On**: [Session/project that validated these]
**Confidence**: XX% (specialist-reviewed)
**Production Validated**: [Date or session]

## Pattern 1: [Name]
### Overview
**Problem**: [What this solves]
**Solution**: [Approach]
**Impact**: [Performance/security/quality gain]

### When to Use
[Scenarios where this applies]

### Implementation
[Before/after code examples]

### Anti-Pattern
[What NOT to do]

[... repeat for each pattern]
```

**Integration**: Reference in specialist agent config:
```markdown
## My Pattern Library
/.claude/knowledge/patterns/[domain]-patterns.md
```

---

### `discoveries/` - Discovery Prompts

**Purpose**: Systematic investigation commands for understanding codebase areas

**Criteria for Inclusion**:
- ✅ Contains bash/grep/find commands
- ✅ Defines investigation questions
- ✅ Produces structured audit output
- ✅ Reusable for similar investigations
- ✅ Referenced by at least one specialist

**Examples**:
- `api-efficiency-discovery.md` (API endpoint audit, query pattern analysis)
- `security-discovery.md` (Security vulnerability scanning, auth audit)
- `architectural-review-discovery.md` (Pattern consistency, semantic validation)
- **`quality_gates/`** - Executable validation scripts (4 .sh files):
  - `semantic_gate.sh` - Identity and ownership language validation
  - `security_ux_gate.sh` - Security vs UX trade-off analysis
  - `cross_system_gate.sh` - Breaking change and integration analysis
  - `boundary_contract_gate.sh` - Data completeness validation
  - Used by: architectural-review-specialist, boundary-contract-specialist

**Format Requirements**:
```markdown
# [Domain] Discovery

**Last Updated**: YYYY-MM-DD
**Status**: vX.X
**Confidence**: [Level]

## Executive Summary
Run this discovery to understand:
- [Goal 1]
- [Goal 2]

## Discovery Commands

### Step 1: [Investigation Area]
```bash
# Commands to run
find ... | grep ...
```

### Step 2: [Another Area]
[More commands]

## Investigation Questions
1. [Critical question]
2. [Another question]

## Expected Artifacts
[What this discovery produces]

## Success Criteria
- [ ] [Completion criteria]
```

**Integration**: Reference in specialist agent config:
```markdown
## My Discovery Prompt
/.claude/knowledge/discoveries/[domain]-discovery.md
```

---

### `protocols/` - Workflow Protocols

**Purpose**: Repeatable processes and workflows for development activities

**Criteria for Inclusion**:
- ✅ Defines a step-by-step process
- ✅ Used across multiple sessions
- ✅ Has clear success criteria
- ✅ Includes checklists
- ✅ Proven effective (used successfully 3+ times)

**Examples**:
- `specialist-review-protocol.md` (How to run multi-specialist reviews)
- `discovery-first-workflow-guide.md` (Discovery-before-implementation workflow)
- `collaboration-principles.md` (Claude Code collaboration guidelines)

**Format Requirements**:
```markdown
# [Protocol Name]

**Version**: X.X
**Updated**: YYYY-MM-DD
**Success Rate**: [X sessions successfully completed]

## When to Use
[Scenarios where this protocol applies]

## Protocol Steps

### Step 1: [Phase]
[Detailed instructions]
**Duration**: [Time estimate]
**Success Criteria**: [How to know this step is complete]

[... repeat for each step]

## Success Criteria
[Overall completion criteria]

## Common Pitfalls
[What to avoid]
```

**Integration**: Reference in relevant agent configs or CLAUDE.md workflows

---

### `frameworks/` - Decision Matrices & Methodologies

**Purpose**: Analytical frameworks for making complex decisions

**Criteria for Inclusion**:
- ✅ Provides decision-making structure
- ✅ Has multiple decision points
- ✅ Includes examples/case studies
- ✅ Reusable for similar decisions
- ✅ Reduces decision time significantly

**Examples**:
- `authentication-access-decision-matrix.md` (Who can access what and when)
- `debugging-methodology-boundary-contracts.md` (5-minute boundary debug protocol)
- `meta-pattern-recognition-framework.md` (How to recognize cross-cutting patterns)

**Format Requirements**:
```markdown
# [Framework Name]

**Purpose**: [What decisions this helps make]
**Success Metric**: [Time saved, accuracy improved]

## Decision Matrix

| Scenario | Condition 1 | Condition 2 | Decision | Rationale |
|----------|-------------|-------------|----------|-----------|
| [Case 1] | [Value] | [Value] | [Outcome] | [Why] |

## Methodology Steps
1. [Step]
2. [Step]

## Examples
[Real cases where this was applied]

## Success Metrics
[How to measure effectiveness]
```

**Integration**: Reference in specialist descriptions or CLAUDE.md

---

### `domain/[domain-name]/` - Domain-Specific Deep Knowledge

**Purpose**: Comprehensive domain knowledge requiring multiple related documents

**Criteria for Inclusion**:
- ✅ Domain has 3+ related documents
- ✅ Contains architecture, implementation, AND learnings
- ✅ Represents significant investment (10+ hours)
- ✅ Contains breakthrough insights
- ✅ Referenced by domain specialists

**Examples**:
- `domain/oauth/` (5 files: architecture, boundaries, ChatGPT breakthrough, analysis, implementation)
- `domain/testing/` (agent test verification procedures)

**Structure Per Domain**:
```
domain/[domain-name]/
├── architecture.md          # System architecture and design
├── implementation-guide.md  # How to implement
├── breakthrough-insights.md # Key learnings from complex work
├── troubleshooting.md       # Common issues and fixes
└── reference.md             # Quick reference
```

**Integration**: Reference in domain specialist agent configs

---

## Decision Flowchart

When creating a new document, follow this flowchart:

```
Created New Document
    ↓
Q1: Is this session-specific?
    ├─ YES → cline_docs/ (reviews, plans, session notes)
    └─ NO ↓
Q2: Is this production-validated or proven?
    ├─ NO → cline_docs/ (until validated)
    └─ YES ↓
Q3: Do agents reference this?
    ├─ NO → cline_docs/ (human docs)
    └─ YES ↓
Q4: What type is it?
    ├─ Code patterns → .claude/knowledge/patterns/
    ├─ Investigation commands → .claude/knowledge/discoveries/
    ├─ Workflow process → .claude/knowledge/protocols/
    ├─ Decision framework → .claude/knowledge/frameworks/
    └─ Deep domain knowledge (3+ docs) → .claude/knowledge/domain/[name]/
```

---

## Assessment Rubric

### For Pattern Libraries

**Confidence Score Criteria**:
- **95-100%**: Multiple sessions validated, zero bugs, specialist consensus
- **90-94%**: Production-tested, specialist-reviewed, minor issues
- **85-89%**: Tested but needs refinement
- **< 85%**: Not ready for knowledge base (keep in cline_docs until improved)

**Production Validation Requirements**:
- [ ] Deployed to production
- [ ] Monitored for 48+ hours
- [ ] Zero critical bugs
- [ ] Performance metrics validated
- [ ] Specialist-reviewed (90%+ confidence)

**Anti-Pattern Documentation**:
- [ ] At least 3 anti-patterns documented
- [ ] Each has explanation of why it's wrong
- [ ] Each has correct alternative shown

---

### For Discovery Prompts

**Completeness Criteria**:
- [ ] Investigation commands (bash/grep/find)
- [ ] Investigation questions (5-15 questions)
- [ ] Expected artifacts (what discovery produces)
- [ ] Success criteria (how to know it's complete)
- [ ] Validation steps (how to verify findings)

**Reusability Requirements**:
- [ ] Used successfully in 2+ sessions
- [ ] Generic enough for domain (not project-specific)
- [ ] Commands work on fresh codebase
- [ ] Questions applicable to similar situations

---

### For Protocols

**Proven Effectiveness Criteria**:
- [ ] Used successfully 3+ times
- [ ] Success rate ≥ 90%
- [ ] Time savings documented (vs ad-hoc approach)
- [ ] Clear success/failure criteria

**Checklist Requirements**:
- [ ] Each step has checklist
- [ ] Success criteria per step
- [ ] Common pitfalls documented
- [ ] Time estimates included

---

### For Frameworks

**Decision Support Criteria**:
- [ ] Reduces decision time by 50%+
- [ ] Increases decision accuracy
- [ ] Has worked examples/case studies
- [ ] Clear decision outcomes

**Matrix Requirements**:
- [ ] At least 2 decision dimensions
- [ ] Clear outcomes for each scenario
- [ ] Rationale documented
- [ ] Edge cases covered

---

### For Domain Knowledge

**Domain Qualification Criteria**:
- [ ] 3+ related documents
- [ ] Represents 10+ hours of work
- [ ] Contains breakthrough insights
- [ ] Has architecture + implementation + learnings
- [ ] Referenced by domain specialist

**Organization Requirements**:
- [ ] Architecture document (system design)
- [ ] Implementation guide (how to build)
- [ ] Breakthrough insights (key learnings)
- [ ] Troubleshooting guide (common issues)

---

## Integration Workflow

### When Creating New Specialist

**Step 1: Create Discovery Prompt**
```bash
# Create in cline_docs first (draft)
touch cline_docs/[domain]-discovery-draft.md

# Validate through use (run discovery 2-3 times)
# Refine based on learnings

# When proven effective, migrate:
mv cline_docs/[domain]-discovery-draft.md .claude/knowledge/discoveries/[domain]-discovery.md
```

**Step 2: Create Pattern Library** (if domain has recurring patterns)
```bash
# After 2-3 implementations, extract patterns
touch cline_docs/[domain]-patterns.md

# Document patterns with:
# - Code examples from successful implementations
# - Before/after comparisons
# - Anti-patterns encountered

# When confidence ≥ 90%, migrate:
mv cline_docs/[domain]-patterns.md .claude/knowledge/patterns/
```

**Step 3: Update Agent Config**
```markdown
## My Discovery Prompt
/.claude/knowledge/discoveries/[domain]-discovery.md

## My Pattern Library (if exists)
/.claude/knowledge/patterns/[domain]-patterns.md ([X]% confidence)
```

---

### When Creating Session Artifacts

**Reviews** → Always `cline_docs/reviews/[feature]-YYYY-MM-DD/`
- Specialist review outputs
- Confidence assessments
- Implementation plans with specialist fixes
- Session-specific, not reusable

**Refactoring Plans** → Always `cline_docs/reviews/[feature-name]-YYYY-MM-DD/`
- Week 1-7 refactoring plans (stored in their review directories)
- Implementation roadmaps
- Project-specific, temporary (within review directories)

**Session Notes** → Always `cline_docs/`
- session-learnings-YYYY-MM-DD.md
- p0-fixes-implementation-plan.md
- Quick notes, insights, decisions
- Valuable but session-specific

---

## Quality Gates for Knowledge Base Inclusion

### Gate 1: Permanence Test
**Question**: Will this be relevant in 6 months?
- ✅ YES → Knowledge base candidate
- ❌ NO → cline_docs (ephemeral)

**Examples**:
- ✅ api-efficiency-patterns.md (permanent - patterns don't change)
- ❌ week-1-admin-user-management.md (temporary - specific to Phase 4 project)

---

### Gate 2: Validation Test
**Question**: Is this production-tested or proven?
- ✅ YES (90%+ confidence) → Knowledge base
- ⏸️ IN PROGRESS (< 90%) → cline_docs until validated
- ❌ NO (draft, theoretical) → cline_docs

**Validation Evidence Required**:
- [ ] Deployed to production, OR
- [ ] Used successfully in 3+ sessions, OR
- [ ] Specialist-reviewed ≥ 90% confidence, OR
- [ ] Zero critical bugs in first usage

---

### Gate 3: Reusability Test
**Question**: Can this be used across multiple projects/sessions?
- ✅ HIGH → Knowledge base (generic patterns)
- ⏸️ MEDIUM → cline_docs (might extract patterns later)
- ❌ LOW → cline_docs (project-specific)

**Reusability Indicators**:
- No hard-coded project names/IDs
- Generic enough for similar situations
- Patterns applicable to different codebases
- Not tied to specific implementation

---

### Gate 4: Agent Reference Test
**Question**: Do agents need to reference this?
- ✅ YES (in agent config) → Knowledge base
- ❌ NO (human documentation) → cline_docs

**Agent Reference Types**:
- Discovery prompts (agents run these)
- Pattern libraries (agents apply these)
- Protocols (agents follow these)
- Frameworks (agents use for decisions)

---

## Confidence Score Requirements

### For Pattern Libraries

**90-100%**: Ready for knowledge base
- Production-validated
- Specialist consensus (avg ≥ 90%)
- Zero critical bugs
- Complete code examples

**80-89%**: Needs refinement
- Keep in cline_docs
- Apply in 1-2 more sessions
- Get specialist review
- Fix identified issues

**< 80%**: Not ready
- Keep in cline_docs
- Significant issues to resolve
- Need more validation

**Evidence Required**:
- [ ] Specialist review scores documented
- [ ] Production deployment date
- [ ] Bug count in first 48 hours
- [ ] Performance metrics (before/after)

---

### For Discovery Prompts

**Completeness Score**:
- **100%**: All sections complete (commands, questions, artifacts, criteria)
- **90-99%**: Minor gaps (missing some validation steps)
- **< 90%**: Incomplete (missing major sections)

**Proven Effectiveness**:
- Used successfully 2+ times
- Produces expected artifacts
- Investigation complete in estimated time
- Questions lead to actionable insights

---

## Examples and Counter-Examples

### ✅ Examples of Knowledge Base Material

**api-efficiency-patterns.md**:
- Why: Production-validated (Oct 27-28), 94% confidence, 14 patterns, zero bugs
- Category: `patterns/`
- Referenced by: api-efficiency-specialist
- Confidence: 94%

**specialist-review-protocol.md**:
- Why: Used in 5+ review sessions, 90%+ success rate, clear process
- Category: `protocols/`
- Referenced by: All specialists (review workflow)
- Proven: Infrastructure review, fuzzy-search review, week 1-7 reviews

**oauth-architecture-clarification.md**:
- Why: 10+ hours deep work, breakthrough insights, permanent architecture
- Category: `domain/oauth/`
- Referenced by: oauth-multi-provider-specialist
- Scope: OAuth domain requires 5 related docs

---

### ❌ Counter-Examples (Stay in cline_docs)

**week-1-admin-user-management.md**:
- Why: Project-specific (Phase 4), temporary (once implemented, obsolete)
- Location: `cline_docs/reviews/[feature-name]-YYYY-MM-DD/` (within review directories)
- Reusability: Low (specific to this project's 3 admin endpoints)
- Permanence: No (useful only until Week 1 implemented)

**infrastructure-p1-remaining-2025-10-29/ (review directory)**:
- Why: Session artifact (Oct 29 review session)
- Location: `cline_docs/reviews/`
- Reusability: Low (specific findings for specific implementation)
- Permanence: No (historical record, not reference material)

**session-learnings-2025-10-27.md**:
- Why: Session-specific insights, date-specific
- Location: `cline_docs/`
- Reusability: Medium (patterns might be extracted later)
- Permanence: No (session snapshot)

---

## Migration Workflow

### For Existing Documents

**Step 1: Assess Each Document**

Run through 4 quality gates:
1. Permanence test → Relevant in 6 months?
2. Validation test → Production-tested or proven?
3. Reusability test → Applicable to multiple scenarios?
4. Agent reference test → Do agents need this?

**Step 2: Determine Category**

If passes all 4 gates, determine category:
- Has code patterns? → `patterns/`
- Has investigation commands? → `discoveries/`
- Defines a process? → `protocols/`
- Decision framework? → `frameworks/`
- Deep domain knowledge (3+ docs)? → `domain/[name]/`

**Step 3: Move and Update**

```bash
# Move file
mv cline_docs/[old-path] .claude/knowledge/[category]/[new-name]

# Update agent configs
sed -i 's|cline_docs/[old-path]|.claude/knowledge/[category]/[new-name]|g' .claude/agents/*.md

# Verify
grep "[new-name]" .claude/agents/*.md
```

**Step 4: Update Cross-References**

If discovery prompt, update with pattern library reference:
```markdown
## Pattern Library Reference
/.claude/knowledge/patterns/[domain]-patterns.md
```

If pattern library, update with anti-patterns from reviews.

---

### For New Documents

**When Creating New Supporting Documents**:

**During Creation, Ask**:
```
I've created [document-name] for [domain].

Assessment:
- Reusability: [High/Medium/Low]
- Validation: [Production-tested/Specialist-reviewed/Draft]
- Confidence: [X]%
- Agent Reference: [Yes/No]
- Type: [Pattern/Discovery/Protocol/Framework/Domain]

Based on assessment:
✅ Recommend: .claude/knowledge/[category]/
⏸️ Suggest: cline_docs/ until validated
❌ Keep in: cline_docs/ (session-specific)

Should I add to knowledge base now?
```

**User Decides**:
- Add now (if high confidence)
- Add later (after validation)
- Keep in cline_docs (ephemeral)

---

## Maintenance Guidelines

### When to Update Knowledge Base Documents

**Update Immediately**:
- Critical bug fix in pattern (security issue)
- Proven improvement to pattern (new session validates better approach)
- Discovery prompt command improvement (more efficient investigation)
- Protocol refinement (higher success rate)

**Update Quarterly**:
- Review all pattern libraries for relevance
- Archive obsolete patterns
- Update confidence scores
- Add new patterns from recent sessions

**Version Updates**:
- **Major** (2.0): Breaking changes, complete rewrite
- **Minor** (1.1): New patterns added, significant improvements
- **Patch** (1.0.1): Bug fixes, clarifications

---

## Antipatterns (What NOT to Put in Knowledge Base)

### ❌ Antipattern 1: Session-Specific Reviews
**Wrong**: Moving `cline_docs/reviews/infrastructure-p1-2025-10-29/` to knowledge base
**Why**: Tied to specific session, not reusable
**Keep**: In cline_docs/reviews/ as historical record

### ❌ Antipattern 2: Work-In-Progress Plans
**Wrong**: Moving draft refactoring plans before validation
**Why**: Confidence < 90%, needs specialist review first
**Keep**: In cline_docs/ until validated, then decide

### ❌ Antipattern 3: Project-Specific Roadmaps
**Wrong**: Moving `PHASE-4-IMPLEMENTATION-ROADMAP.md` to knowledge base
**Why**: Specific to Phase 4 project, temporary
**Keep**: In cline_docs/ (useful now, obsolete after Phase 4)

### ❌ Antipattern 4: Unvalidated Patterns
**Wrong**: Moving patterns with < 85% confidence to knowledge base
**Why**: Not production-ready, might have issues
**Keep**: In cline_docs/ until confidence ≥ 90%

### ❌ Antipattern 5: Single-Use Documents
**Wrong**: Moving one-off analysis docs to knowledge base
**Why**: Not reusable
**Keep**: In cline_docs/ or archive

---

## Knowledge Base README (Auto-Generated)

**Create**: `.claude/knowledge/README.md`

```markdown
# Claude Code Knowledge Base

**Purpose**: Permanent reference material for AI assistants
**Organization**: By type (patterns, discoveries, protocols, frameworks, domain)
**Quality Standard**: 90%+ confidence, production-validated

## Quick Navigation

### By Use Case
- **Implementing APIs**: patterns/api-efficiency-patterns.md
- **Security hardening**: patterns/security-patterns.md
- **Auditing codebase**: discoveries/[domain]-discovery.md
- **Running reviews**: protocols/specialist-review-protocol.md
- **Making decisions**: frameworks/[decision-type]-decision-matrix.md
- **Domain deep-dive**: domain/[domain-name]/

### By Specialist
- **api-efficiency-specialist**: patterns/api-efficiency-patterns.md + discoveries/api-efficiency-discovery.md
- **sec-ops-specialist**: patterns/security-patterns.md + discoveries/security-discovery.md
- **architectural-review-specialist**: discoveries/architectural-review-discovery.md + frameworks/
- [... list all specialists]

## Statistics
- **Patterns**: 2 libraries, 94%+ confidence avg
- **Discoveries**: 40+ prompts
- **Protocols**: 3 workflows
- **Frameworks**: 4 decision matrices
- **Domain Knowledge**: 2 domains, 6 documents

**Last Updated**: [Auto-updated on each addition]
```

---

## Integration with Claude Code Behavior

### Suggested Prompt Addition (for Claude Code)

When Claude Code creates supporting documents during specialist work:

**After Creating Document**:
```
[Document created: /path/to/document.md]

Knowledge Base Assessment:
- Type: [Pattern/Discovery/Protocol/Framework/Domain/Session]
- Confidence: [X]% (based on [validation])
- Reusability: [High/Medium/Low]
- Production-Tested: [Yes/No]

Recommendation:
[✅ Add to .claude/knowledge/[category]/ | ⏸️ Keep in cline_docs/ until validated | ❌ Keep in cline_docs/ (session-specific)]

Would you like me to add this to the knowledge base?
```

This allows the user to make informed decisions about knowledge base inclusion during active work.

---

## Changelog

**Version 1.0** (2025-10-30):
- Initial guidelines created
- 5 categories defined (patterns, discoveries, protocols, frameworks, domain)
- 4 quality gates established
- Assessment rubric for each category
- Integration workflow with specialists
- Auto-assessment prompt for Claude Code

---

## References

- **Migration Plan**: `/cline_docs/KNOWLEDGE-BASE-MIGRATION-PLAN.md`
- **Pattern Assessment**: `/cline_docs/reviews/api-efficiency-patterns-assessment.md`
- **Specialist Review Protocol**: `/cline_docs/specialist-review-protocol.md` (to be moved)

---

**Guidelines Status**: ✅ Ready for use
**Next Step**: Execute knowledge base migration per migration plan
