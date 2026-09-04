# UI/UX Rationalization Protocol

> **Last Updated**: December 2025
> **Status**: Production - Proven in Dashboard & Bloomberg Terminal Rationalization
> **Confidence**: 99%

## Overview

This protocol provides a systematic workflow for auditing, rationalizing, and improving UI/UX across the application. It was developed during the Dashboard Rationalization project (Dec 2025) and enhanced during Bloomberg Terminal Design Implementation which successfully:
- Identified 4 recommendation sources (was thought to be 3)
- Removed mock data components (-2,296 lines)
- Restructured 4 tabs into logical groupings
- Created 4 comprehensive knowledge documents
- **NEW**: Created shared style constants for consistency
- **NEW**: Achieved pixel-perfect design inheritance from reference pages
- **NEW**: Added shared constants validation workflow (prevents drift)
- **NEW**: Documented screenshot workflow for specialist consultations
- **NEW**: Added post-implementation audit and follow-up review phases
- **NEW**: Added data visualization assessment (cards vs charts vs tables)
- **NEW**: Proven card→dense list pattern (3x visibility improvement)

## When to Use

- Cleaning up duplicate or overlapping features
- Consolidating scattered functionality
- Identifying mock vs real data sources
- Planning tab/section restructuring
- Improving information architecture
- Cross-page consistency audits
- **NEW**: Inheriting design language from reference pages
- **NEW**: Creating shared style systems
- **NEW**: Optimizing component types (cards vs charts vs tables)
- **NEW**: Improving information density and scanability

## Protocol Modes

### Mode A: Single Page Audit
Focus on one page/tab at a time for deep analysis.

### Mode B: Cross-Page Comparison
Compare two pages to identify overlaps, inconsistencies, or consolidation opportunities.

### Mode C: Design Inheritance (NEW)
Inherit design language from a reference page to a target page while maintaining distinct information contexts. Use when:
- A reference page has proven design patterns (e.g., Bloomberg Terminal style)
- Target page needs visual consistency with reference
- Multiple components need shared styling

---

## Important: Screenshot Workflow

**CRITICAL**: Take all screenshots BEFORE consulting specialists.

**Why**: Specialists (especially frontend-provocateur-specialist) cannot access Chrome MCP tools directly. You must capture screenshots first, then provide them when launching the specialist.

**Workflow**:
1. Use Chrome MCP tools to navigate and screenshot pages
2. Save screenshot references/paths
3. Launch specialist with screenshot context
4. Specialist analyzes provided screenshots

**Example**:
```
# 1. Take screenshots first
mcp__claude-in-chrome__computer (action: screenshot) at /dashboard
mcp__claude-in-chrome__computer (action: screenshot) at /pov/list

# 2. Then launch specialist with context
Task tool → frontend-provocateur-specialist
Prompt: "Review screenshots I captured: [screenshot refs]..."
```

---

## Phase 1: Visual Capture & Initial Inventory

### Step 1.1: Screenshot Capture

```
Tool: mcp__claude-in-chrome__computer (action: screenshot)
```

Capture the current state of the page(s):
- Full page screenshot
- Each major section if page is long
- Both pages if doing cross-page comparison

### Step 1.2: Section Inventory

Create a visual map of what you see:

```markdown
## Page: [Page Name]
### Sections Identified:
1. [Section Name] - [Brief description of what it shows]
2. [Section Name] - [Brief description]
3. ...

### UI Components:
- Cards: [count]
- Tables: [count]
- Charts: [count]
- Action buttons: [list]
```

### Step 1.3: Initial Questions

Document first impressions:
- What seems duplicated?
- What seems out of place?
- What's the apparent purpose of each section?
- Are there similar-looking components doing different things?

---

## Phase 2: Technical Audit

### Step 2.1: Component Mapping

For each section identified, find the source:

```bash
# Find the component file
Grep: [SectionName]
Glob: **/*[ComponentName]*.tsx
```

Create mapping table:

| Section | Component File | Lines | Data Source |
|---------|---------------|-------|-------------|
| [Name] | `path/to/file.tsx` | ~XXX | [API endpoint] |

### Step 2.2: Data Source Analysis

For each component, determine:

```markdown
### [Component Name]
- **API Endpoint**: `/api/...`
- **Data Type**: ✅ Real (Prisma) | ❌ Mock (hardcoded) | ⚠️ Hybrid
- **Query Method**: useQuery / fetch / static
- **Stale Time**: [caching strategy]
```

**Critical**: Distinguish between:
- **Real data**: Queries Prisma/database
- **Mock data**: Hardcoded values, static arrays
- **Hybrid**: Mix of stored + generated

### Step 2.3: Backend Handler Audit

Read each API endpoint:

```bash
Read: /app/api/[endpoint]/route.ts
```

Document:
- What Prisma models are queried?
- Any business logic/calculations?
- Is it truly dynamic or returning static data?

---

## Phase 2.5: Style Consistency Audit (NEW)

> **Critical Learning**: Style inconsistencies between pages create jarring UX. Always compare exact styles when inheriting design.

### Step 2.5.1: Reference Design Extraction

If inheriting from a reference page, extract exact patterns:

```markdown
## Reference: [Page Name]
### Status Symbols
| Status | Symbol | Color Class |
|--------|--------|-------------|
| IN_PROGRESS | ● | text-emerald-400 |
| STALLED | ‖ | text-gray-400 |
| VALIDATION | ◐ | text-amber-400 |
| ... | ... | ... |

### Typography
- Font: [font-mono / font-sans]
- Header size: [text-xs / text-sm]
- Body size: [text-xs]

### Spacing
- Cell padding: [px-3 py-1.5]
- Header padding: [px-3 py-2]
- Section gap: [space-y-0 / space-y-6]

### Color Palette
- Accent: [text-amber-400]
- Success: [text-green-400]
- Warning: [text-yellow-400]
- Error: [text-red-400]
```

### Step 2.5.2: Target Design Comparison

Compare target page styles against reference:

| Element | Reference | Target | Match? |
|---------|-----------|--------|--------|
| STALLED symbol | ‖ | ◐ | ❌ Fix |
| STALLED color | text-gray-400 | text-orange-400 | ❌ Fix |
| Header font | font-mono | font-sans | ❌ Fix |
| Cell padding | px-3 py-1.5 | p-2 | ❌ Fix |

### Step 2.5.3: Shared Constants Assessment

**Key Question**: Should we create shared constants?

Create shared constants when:
- ✅ Same style patterns used in 2+ components
- ✅ Design language should be consistent across pages
- ✅ Future maintenance would benefit from single source of truth

**Shared Constants Location**: `lib/constants/[design-system].ts`

Example structure:
```typescript
// lib/constants/bloomberg-styles.ts
export const STATUS_SYMBOLS = {
  IN_PROGRESS: { symbol: '●', color: 'text-emerald-400' },
  STALLED: { symbol: '‖', color: 'text-gray-400' },
  // ...
};

export const BLOOMBERG_SPACING = {
  cellPadding: 'px-3 py-1.5',
  headerPadding: 'px-3 py-2',
};
```

### Step 2.5.4: Shared Constants Validation (NEW)

**Critical Learning**: After creating shared constants, verify BOTH reference and target pages use them. Don't assume the reference page is already using constants just because you extracted styles from it.

**Validation Checklist**:
- [ ] Grep for duplicate inline styles in reference page
- [ ] Grep for duplicate inline styles in target page
- [ ] Refactor any found duplicates to use shared constants

**Commands**:
```bash
# Find inline status symbol definitions
grep -rn "STALLED.*symbol\|IN_PROGRESS.*●" components/ app/

# Find inline color definitions
grep -rn "text-amber-400.*text-emerald-400" components/ app/

# Find duplicate getStatusSymbol functions
grep -rn "function getStatusSymbol" components/ app/
```

**Example from Bloomberg Implementation**:
```markdown
Problem Found:
- Created bloomberg-styles.ts from /pov/list reference
- Applied to /dashboard ✅
- But /pov/list STILL had inline getStatusSymbol() ❌

Solution:
- Refactored POVBloombergView.tsx → import from bloomberg-styles
- Refactored POVTimelineView.tsx → import from bloomberg-styles
- Result: 100% style consistency across both pages ✅
```

**Why**: Prevents style drift between pages that should share design language.

---

## Phase 3: Feature Comparison

### Step 3.1: Feature Matrix

Create comprehensive comparison:

| Feature | Component A | Component B | Overlap? |
|---------|-------------|-------------|----------|
| [Feature 1] | ✅ | ❌ | - |
| [Feature 2] | ✅ | ✅ | Yes |
| [Feature 3] | ❌ | ✅ | - |

### Step 3.2: Data Source Comparison

| Aspect | Source A | Source B |
|--------|----------|----------|
| Data origin | Real/Mock | Real/Mock |
| Update frequency | [time] | [time] |
| User interaction | [actions] | [actions] |
| Unique value | [what only this provides] | [what only this provides] |

### Step 3.3: Business Logic Comparison

For components with similar purposes:

```markdown
### [Component A] Business Logic
- Queries: [list of Prisma queries]
- Calculations: [algorithms, scoring]
- Output: [what it produces]

### [Component B] Business Logic
- Queries: [list]
- Calculations: [algorithms]
- Output: [what it produces]

### Overlap Analysis
- Shared queries: [list]
- Unique to A: [list]
- Unique to B: [list]
```

---

## Phase 3.5: Data Completeness Verification (NEW)

> **Critical Learning**: Missing data sources are easy to overlook. Always verify all intended metrics/data are included before finalizing.

### Step 3.5.1: Reference Data Sources

If inheriting from reference, list all data shown:

```markdown
## Reference Page Data Sources
1. Health Score - tasks completion rate
2. Completion Rate - completed/total tasks
3. Overdue % - overdue/total tasks
4. Agent Success Rate - agent_execution success/total  ← OFTEN MISSED!
5. POV counts - prisma.pOV.count()
6. ...
```

### Step 3.5.2: Target Data Verification

Check target page includes ALL intended data:

| Data Source | In Reference? | In Target? | Action |
|-------------|---------------|------------|--------|
| Health Score | ✅ | ✅ | - |
| Agent Success | ✅ | ❌ | Add to API + UI |
| POV Counts | ✅ | ✅ | - |

### Step 3.5.3: Future-Proofing

For data that currently has no entries (e.g., 0 rows in database):

**Include it anyway if**:
- ✅ Data WILL exist in the future (e.g., agent_execution table)
- ✅ Schema/table exists and is being populated
- ✅ Users will expect to see this metric

**Approach**:
- Show 0% or "N/A" initially
- No code changes needed when data appears
- UI is "future-ready"

```markdown
### Example: Agent Executions
- Current state: 0 rows in agent_execution table
- Decision: Include anyway (shows 0%)
- Rationale: Will populate as agents run
- Implementation: API returns 0, UI shows "0%"
```

---

## Phase 3.6: Data Visualization Assessment (NEW)

> **Critical Learning**: Component type (cards, charts, tables, lists) dramatically impacts information density and scanability. Always evaluate optimal visualization format for the data type.

**Purpose**: Determine the most effective way to present each data type following Bloomberg Terminal principles: **maximum information density, scanability, and purposeful design**.

### Step 3.6.1: Component Type Evaluation

For each section, evaluate optimal visualization:

| Data Type | Current | Candidate Visualizations | Recommended | Reason |
|-----------|---------|-------------------------|-------------|--------|
| Summary metrics (4+ items) | Cards | Header bar, Cards | **Header bar** | Bloomberg density, inline format |
| List of items with actions | Cards | Table, Dense list, Cards | **Dense list** | Row numbers, scanability, 3x more visible |
| Trends over time | Static number | Line chart, Sparkline | **Line chart** | Shows trajectory, not just point-in-time |
| Single KPI | Large card | Inline metric, Card | **Inline metric** | Terminal style, no wasted space |
| Hierarchical data | Nested cards | Table with expand, Tree | **Table + expand** | Scanable + detail on demand |

### Step 3.6.2: Bloomberg Terminal Decision Matrix

**When to Use Each Visualization:**

**Header Bar** (Dense inline metrics):
- ✅ Summary metrics (3-8 values)
- ✅ Top-level KPIs that rarely need details
- ✅ Metrics that benefit from color coding
- ❌ Complex nested data
- ❌ Items requiring individual actions

**Dense List/Table** (Striped rows with expand):
- ✅ List of similar items (recommendations, POVs, tasks)
- ✅ Data with multiple attributes (type, status, priority, etc.)
- ✅ Items requiring actions (implement, dismiss, details)
- ✅ When scanning/comparison is primary use case
- ❌ Few items (< 5) where cards don't waste space
- ❌ Rich media content (images, complex nested structures)

**Charts** (Line, bar, timeline):
- ✅ Trends over time (health score, time saved)
- ✅ Comparisons between multiple metrics
- ✅ Data where trajectory matters
- ❌ Static point-in-time values
- ❌ Highly volatile data (use sparkline instead)

**Cards** (Traditional card component):
- ✅ Rich media content requiring space
- ✅ Complex nested hierarchical data
- ✅ When whitespace enhances comprehension
- ❌ Lists of similar items (use dense list instead)
- ❌ Summary metrics (use header bar instead)

### Step 3.6.3: Visualization Conversion Assessment

**Evaluation Questions:**

1. **How many items are typically shown?**
   - < 5 items: Cards acceptable
   - 5-20 items: Dense list/table preferred
   - 20+ items: Table with pagination

2. **What's the primary user action?**
   - Scan/compare: Dense list/table
   - Drill into details: Cards with expand
   - Track trends: Chart

3. **Does this data have temporal dimension?**
   - Yes + static value: Add trend chart
   - Yes + showing trend: Line chart
   - No: Current visualization may be fine

4. **Are there 3+ attributes per item?**
   - Yes: Table format (columns per attribute)
   - No: List format acceptable

5. **Is this a summary or detail view?**
   - Summary: Header bar / inline metrics
   - Detail: Appropriate to content (table/chart/cards)

### Step 3.6.4: Conversion Decision Table

Document conversion decisions with rationale:

| Component | Current Type | New Type | Rationale | Lines Removed | Visibility Gain |
|-----------|--------------|----------|-----------|---------------|-----------------|
| Summary metrics | 4 cards | Header bar | Bloomberg density, inline | ~60 lines | N/A (same data) |
| Recommendations | Cards | Dense list | 3x more visible, scanability | ~100 lines | 3-4 → 10-12 items |
| Time saved | Static text | (Future) Chart | Show trend over time | TBD | Better insight |

### Step 3.6.5: Proven Patterns from Production

**Admin Intelligence Tab** (Dec 2025):
- Summary cards → Bloomberg header ✅
- Recommendation cards → Dense list ✅
- Result: 78% → 90% confidence, better scanability

**Automation Tab** (Dec 2025):
- Summary cards → Bloomberg header ✅
- Recommendation cards → Dense list ✅
- Pattern: Identical conversion, consistent design

**Learnings**:
- Card-based lists are **anti-Bloomberg** for data with actions
- Header bars work for 3-8 summary metrics
- Dense lists provide 3x more information in same viewport
- Row numbers enable verbal reference ("Check row 05")
- Striped rows improve scanability without borders

---

## Phase 4: Rationalization Decisions

### Step 4.1: Decision Framework

For each component/section, decide:

| Decision | Criteria |
|----------|----------|
| **KEEP** | Real data, unique value, well-architected |
| **REMOVE** | Mock data, no unique value, orphaned |
| **MERGE** | Overlapping with another, consolidation improves UX |
| **MOVE** | Good component, wrong location |
| **ENHANCE** | Keep but add features from removed component |

### Step 4.2: Decision Table

| Component | Decision | Rationale | Target Location |
|-----------|----------|-----------|-----------------|
| [Name] | KEEP | Real data, unique insights | [Current] |
| [Name] | REMOVE | Mock data, replaced by X | N/A |
| [Name] | MERGE | Overlaps with Y | Into Y |
| [Name] | MOVE | Better fit in Z tab | Z tab |

### Step 4.3: Impact Assessment

For each decision:
- Files to modify: [list]
- Files to delete: [list]
- New files needed: [list]
- Breaking changes: [any API changes?]

---

## Phase 5: Cross-Page Comparison (Mode B Only)

### Step 5.1: Side-by-Side Analysis

```markdown
## Page A: [Name]
Purpose: [What this page is for]
Audience: [Who uses this]
Key question answered: "[Question]"

## Page B: [Name]
Purpose: [What this page is for]
Audience: [Who uses this]
Key question answered: "[Question]"
```

### Step 5.2: Overlap Detection

| Element | Page A | Page B | Recommendation |
|---------|--------|--------|----------------|
| [Similar section] | [Location] | [Location] | Consolidate to [X] |
| [Shared data] | [How shown] | [How shown] | Deduplicate |

### Step 5.3: Consistency Check

- Visual consistency: Same patterns for same data?
- Naming consistency: Same terms used?
- Interaction consistency: Same actions work the same way?

---

## Phase 6: Implementation

### Step 6.1: Create Todo List

```markdown
1. [ ] [Action 1 - e.g., Delete mock API]
2. [ ] [Action 2 - e.g., Move section to new tab]
3. [ ] [Action 3 - e.g., Update imports]
4. [ ] Create shared constants (if applicable)
5. [ ] Build and test
6. [ ] Commit and push
```

### Step 6.2: Execute Changes

Order of operations:
1. **Create shared constants** (if needed) - do this FIRST
2. **Delete** unused components/APIs
3. **Move** components to new locations
4. **Update** imports to use shared constants
5. **Modify** remaining components
6. **Test** build compiles
7. **Verify** in browser

### Step 6.2.5: Create Shared Constants (NEW)

If Phase 2.5 identified need for shared constants:

```bash
# Create constants file
Write: lib/constants/[design-system]-styles.ts
```

Include:
- Status symbols and colors
- Priority display mappings
- Color palette constants
- Spacing constants
- Typography settings
- Helper functions (getStatusSymbol, getPriorityDisplay)

**Benefit**: Single source of truth, easy maintenance, consistent styling.

### Step 6.3: Validation

- [ ] Build succeeds
- [ ] No TypeScript errors
- [ ] Visual inspection matches plan
- [ ] No console errors
- [ ] Data still loads correctly
- [ ] **NEW**: All data sources included (Phase 3.5 verification)
- [ ] **NEW**: Styles match reference exactly (Phase 2.5 verification)
- [ ] **NEW**: Shared constants used (no inline duplicate styles)

### Step 6.4: Post-Implementation Consistency Audit (NEW)

**Critical**: After implementation, audit for leftover inline styles.

**Audit Commands**:
```bash
# Find any remaining inline status symbols
grep -rn "function getStatusSymbol\|const.*STALLED.*symbol" components/ app/

# Find any remaining inline color definitions
grep -rn "switch.*status.*case.*PROJECTED" components/ app/

# Find any remaining inline priority mappings
grep -rn "CRITICAL.*text-red\|HIGH.*text-orange" components/ app/
```

**Action on Findings**:
- Refactor any found inline implementations to use shared constants
- Update imports to include shared helpers
- Re-run build and validation

**Example**: After Bloomberg implementation, found POVBloombergView and POVTimelineView still had inline styles → refactored both to use bloomberg-styles.ts

**Time**: ~10 minutes
**Risk Prevented**: Style drift, duplicate maintenance
**Confidence Gain**: +5-7%

---

## Phase 7: Documentation

### Step 7.1: Knowledge Document Creation

For each significant component/system, create:

```markdown
# [System Name]

> **Last Updated**: [Date]
> **Status**: Production
> **Confidence**: [X]%

## Overview
[What it does, why it exists]

## Architecture
[Files, data flow diagram]

## API
[Endpoints, parameters, response schema]

## Business Logic
[Key algorithms, calculations]

## Dependencies & Considerations
[What it relies on, edge cases]

## Related Documentation
[Links to related docs]
```

### Step 7.2: Update Existing Docs

- Update cross-references
- Mark deprecated items
- Add "moved to" notes

### Step 7.3: Specialist Follow-up Review (NEW)

**Purpose**: Get updated confidence score and validate improvement impact.

After implementing improvements from initial specialist review, consult the same specialist for:

**Follow-up Review Checklist**:
- [ ] Provide specialist with summary of fixes implemented
- [ ] Request updated confidence score
- [ ] Ask for validation of specific improvements
- [ ] Identify any remaining issues

**Example Request**:
```
Please review the implemented improvements:
- Converted recommendation cards to dense list ✅
- Reduced timeline chart height to 140px ✅
- Added inline progress bars ✅
- Refactored shared constants usage ✅

Provide:
1. Updated confidence score
2. Validation of fixes
3. Any remaining issues
```

**Example Result**:
```
Confidence: 78% → 95% (+17%)
Fixes validated: All 4 implemented correctly
Remaining issues: 0
Ready for production: ✅
```

**ROI**: Validates improvement impact, catches regressions, documents progress

**Time**: ~15 minutes
**Confidence Gain**: +10-15%

---

## Quick Reference Checklist

### Single Page Audit
- [ ] Screenshot captured
- [ ] Sections inventoried
- [ ] Components mapped to files
- [ ] Data sources identified (real/mock)
- [ ] API endpoints audited
- [ ] **Visualization assessment** (Phase 3.6 - cards vs charts vs tables)
- [ ] Decisions documented
- [ ] Changes implemented
- [ ] Knowledge docs created

### Cross-Page Comparison
- [ ] Both pages screenshotted
- [ ] Both pages inventoried
- [ ] Overlap matrix created
- [ ] Consistency issues noted
- [ ] Consolidation opportunities identified
- [ ] Decisions documented
- [ ] Changes implemented
- [ ] Knowledge docs updated

### Design Inheritance (Mode C)
- [ ] **Screenshot BEFORE specialist** - Take reference and target screenshots first
- [ ] Screenshot reference page
- [ ] Screenshot target page
- [ ] Extract exact styles (Phase 2.5.1)
- [ ] Compare target vs reference (Phase 2.5.2)
- [ ] Create shared constants (Phase 2.5.3)
- [ ] **Validate both pages use shared constants** (Phase 2.5.4)
- [ ] **Visualization assessment** (Phase 3.6 - evaluate cards vs charts vs tables)
- [ ] Apply constants to target page
- [ ] **Post-implementation audit** (Step 6.4)
- [ ] Refactor reference page if needed
- [ ] **Specialist follow-up review** (Step 7.3)
- [ ] Document confidence improvement

---

## Common Pitfalls

Based on production experience (Dec 2025 Bloomberg Terminal Implementation):

### Pitfall 1: Creating Shared Constants Without Validation
❌ **Bad**: Create constants from reference, apply to target only
✅ **Good**: Create constants, validate and refactor BOTH reference AND target

**Why**: Reference page often still has inline styles you extracted from it.

**Example**: Created `bloomberg-styles.ts` from /pov/list, applied to /dashboard, but /pov/list still had inline `getStatusSymbol()` function.

**Fix**: Run Step 2.5.4 (Shared Constants Validation)

---

### Pitfall 2: Assuming Reference Page Uses What It Displays
❌ **Bad**: "This page looks Bloomberg-style, must be using constants"
✅ **Good**: Grep for inline styles, verify imports, run audit

**Commands**:
```bash
grep -rn "function getStatusSymbol" components/
grep -rn "import.*bloomberg-styles" components/
```

**Time Cost**: 5 minutes
**Risk Prevented**: Style drift, duplicate maintenance

---

### Pitfall 3: No Post-Implementation Verification
❌ **Bad**: Implement changes, commit, done
✅ **Good**: Run Step 6.4 audit, get specialist follow-up review

**Why**: Catches leftover inline styles, validates improvement impact

**ROI**: 10-15% confidence gain from follow-up review

---

### Pitfall 4: Screenshots After Specialist Launch
❌ **Bad**: Launch specialist, then try to use Chrome MCP tools
✅ **Good**: Take screenshots FIRST, then launch specialist with context

**Why**: Specialists cannot access Chrome MCP tools directly

**Workflow**: See "Important: Screenshot Workflow" section above

---

## Example Session Prompt

### Starting a Single Page Audit

```
I'd like to do a UI/UX rationalization audit of the [PAGE NAME] page.

Please follow the ui-ux-rationalization-protocol:
1. Take a screenshot of the page
2. Inventory all sections and components
3. Audit data sources (identify real vs mock)
4. Create comparison tables if there are overlapping features
5. Make rationalization recommendations
```

### Starting a Cross-Page Comparison

```
I'd like to compare [PAGE A] and [PAGE B] for potential consolidation.

Please follow the ui-ux-rationalization-protocol in Mode B:
1. Screenshot both pages
2. Create side-by-side inventory
3. Identify overlaps and inconsistencies
4. Recommend consolidation opportunities
5. Create implementation plan
```

---

## Proven Results

### Dashboard Rationalization (Dec 2025)

| Metric | Before | After |
|--------|--------|-------|
| Recommendation sources | 4 (unclear) | 4 (documented) |
| Mock data components | 2 | 0 |
| Lines removed | - | 2,296 |
| Knowledge docs | 1 | 4 |
| Tab structure | Confusing | Logical |

### Key Discoveries Made
- AI-Generated Recommendations was 100% mock data
- MCPRecommendationManager was orphaned (no imports)
- Execution Performance belonged in Operations, not Admin Intelligence
- MCP Tool existed but wasn't documented

---

## Related Documentation

- `/.claude/knowledge/domain/mcp/INTELLIGENT-TASK-AUTOMATION.md`
- `/.claude/knowledge/domain/mcp/PORTFOLIO-INTELLIGENCE.md`
- `/.claude/knowledge/domain/mcp/AGENT-EXECUTION-PERFORMANCE.md`
- `/.claude/knowledge/domain/mcp/MCP-TOOL-GET-AI-RECOMMENDATIONS.md`
- `/cline_docs/dashboard-rationalization.md`
