---
name: UI Analytics Refactoring
description: Comprehensive UI component refactoring for analytics dashboards - discovers consolidation opportunities, applies boundary-crossing protocol, delivers business-focused improvements
tags: [ui, analytics, refactoring, boundary-crossing, discovery, mcp]
domain: analytics
estimated_duration: 12-20 hours
confidence_target: 90%
protocols:
  - boundary-crossing-development-protocol.md
  - discovery-first-workflow-guide.md
specialists:
  - architectural-review-specialist
  - boundary-contract-specialist
created: 2025-12-12
version: 1.0
---

# UI Analytics Refactoring - Discovery + Boundary-Crossing

**Objective:** Refactor AI Analytics and dashboard UI components to streamline, reduce overlap, and deliver meaningful business-focused insights leveraging new consolidated analytics endpoints.

**Context:** New consolidated analytics endpoints (5 domains: overview, mcp, agents, team, tasks) provide rich data. UI should be redesigned to maximize value, minimize duplication, and focus on actionable business intelligence.

**Approach:** Two-phase execution combining discovery + systematic boundary-crossing

---

## Phase 1: Discovery - Find Opportunities (2-3 hours)

### Step 1.1: Component Duplication Analysis

**Objective:** Identify overlapping UI patterns, duplicated logic, and consolidation opportunities

**Tasks:**

1. **Map all analytics components:**
   ```
   Search locations:
   - /components/analytics/ (new analytics dashboard)
   - /components/admin/ (admin dashboard)
   - /components/poveditor/pov/sections/ (embedded analytics)
   - /components/poveditor/pov/components/ (POV-specific analytics)
   ```

2. **Analyze component structure:**
   - What components exist?
   - Which ones display similar data?
   - What UI patterns are duplicated? (cards, charts, tables, metrics)
   - What logic is duplicated? (data fetching, calculations, formatting)

3. **Identify shared UI elements:**
   - Metric display cards (value + trend + icon)
   - Chart components (bar, line, pie)
   - Data tables (sortable, filterable)
   - Export buttons
   - Loading skeletons
   - Error displays

**Output:**
```markdown
## Component Inventory
- [Component Name]: [Purpose] - [LOC] - [Duplication %]

## Duplication Findings
- Pattern X duplicated in Y components (Z LOC total)
- Logic X duplicated in Y places

## Consolidation Opportunities
1. [Opportunity]: Extract to shared component, saves X LOC
2. [Opportunity]: Reuse existing component Y instead of Z
```

---

### Step 1.2: Data Utilization Analysis

**Objective:** What data is available vs what's actually used?

**Tasks:**

1. **Map new endpoint capabilities:**
   ```
   For each domain:
   - GET /api/analytics?domain=overview
     Available: povCount, taskCompletionRate, agentSuccessRate, hoursSaved, trends

   - GET /api/analytics?domain=tasks&metrics=performance&metrics=insights
     Available: performance (status, priority, type distribution, completion metrics)
                insights (risks, workload, bottlenecks, recommendations)

   - GET /api/analytics?domain=mcp
     Available: roi, toolPerformance, automation metrics

   - GET /api/analytics?domain=agents&metrics=summary
     Available: totalExecutions, successRate, trends, recentActivity, executionsByAgent

   - GET /api/analytics?domain=team&metrics=activity
     Available: items, analytics (byType, byUser, trends)
   ```

2. **Identify unused/underutilized data:**
   - What data is fetched but not displayed?
   - What insights are available but hidden?
   - What recommendations exist but ignored?
   - What trends calculated but not visualized?

3. **Identify business value gaps:**
   - What questions can't users answer today?
   - What insights would drive decisions?
   - What actionable intelligence is missing?
   - What "aha moments" could we create?

**Output:**
```markdown
## Data Utilization
- Fetched but not used: [List]
- Available but hidden: [List]
- Missing visualizations: [List]

## Business Value Opportunities
1. [Insight]: Users need to see X to make decision Y
2. [Recommendation]: Surface recommendation Z prominently
3. [Trend]: Visualize trend W for proactive management
```

---

### Step 1.3: Business Intelligence Opportunities

**Objective:** What creative, business-focused improvements would maximize value?

**Think like a product manager:**

1. **Executive View** (for leadership):
   - What KPIs matter most? (ROI, time saved, success rates)
   - What trends indicate health/risk? (productivity, bottlenecks)
   - What requires immediate action? (tasks at risk, blocked tasks)

2. **Manager View** (for project managers):
   - Team performance and workload balance
   - Bottleneck identification and resolution
   - Resource allocation optimization
   - Progress tracking and forecasting

3. **Contributor View** (for individual users):
   - Personal productivity metrics
   - Task recommendations (what to work on next)
   - Agent execution results and learnings
   - Collaboration opportunities

4. **Strategic View** (for decision makers):
   - ROI and cost reduction
   - Automation opportunities
   - Risk mitigation priorities
   - Trend analysis and predictions

**Output:**
```markdown
## Business Intelligence Opportunities

### Executive Dashboard
- [Insight 1]: One-number health score (red/yellow/green)
- [Insight 2]: Top 3 risks requiring attention
- [Insight 3]: ROI trending (is automation paying off?)

### Manager Dashboard
- [Insight 1]: Workload imbalance visualization
- [Insight 2]: Bottleneck heatmap (where are we stuck?)
- [Insight 3]: Recommended actions (AI-generated)

### Contributor Dashboard
- [Insight 1]: My productivity vs team average
- [Insight 2]: Suggested next tasks (priority + readiness)
- [Insight 3]: Agent successes to learn from
```

---

### Step 1.4: Consolidation & Improvement Plan

**Synthesize findings into actionable plan:**

```markdown
## Consolidation Opportunities (Reduce Overlap)
1. Metric Card Variants
   - Found: 4 different metric card implementations
   - Consolidate: Single MetricCard with variants (number, percentage, trend, comparison)
   - Savings: ~120 LOC, consistent UX

2. Chart Components
   - Found: Bar charts duplicated in 3 places
   - Consolidate: Shared AnalyticsChart component
   - Savings: ~200 LOC

3. Data Fetching Logic
   - Found: useQuery patterns duplicated
   - Consolidate: useAnalyticsQuery hook (already planned!)
   - Savings: ~80 LOC, type-safe

## Business-Focused Improvements (Add Value)
1. Recommendation Prominence
   - Current: Insights endpoint returns 4 recommendation types, rarely displayed
   - Improve: Surface recommendations prominently with action buttons
   - Value: Users act on AI insights (increase automation adoption)

2. Risk Dashboard
   - Current: tasksAtRisk buried in insights tab
   - Improve: Dedicated "At Risk" widget on Overview
   - Value: Proactive issue resolution (reduce delays)

3. ROI Visualization
   - Current: hoursSaved shown as number
   - Improve: Trend chart + cost savings + comparison to manual effort
   - Value: Prove automation value (justify investment)

4. Workload Rebalancing
   - Current: imbalanceScore calculated but not actionable
   - Improve: Show workload distribution + rebalance suggestions
   - Value: Prevent burnout, optimize team utilization
```

**Discovery Output:** Comprehensive list of what to consolidate + what to improve

---

## Phase 2: Systematic Boundary-Crossing Implementation (10-17 hours)

**Use:** `boundary-crossing-development-protocol.md`

**Apply to each boundary:**

### Boundary 1: API → Component (What data flows in?)

**Discover:**
- New consolidated endpoints provide richer data
- Multiple metrics available in single call
- Recommendations, trends, breakdowns now accessible

**Assess:**
- Which components should consume which domains?
- Can we consolidate API calls? (2-3 instead of 5)
- What new data should be displayed?

**Validate:**
- Consult boundary-contract-specialist
- Ensure data contracts clear
- No field leakage or missing data

**Translate:**
- Use new endpoint structure: `domain=X&metrics=Y&metrics=Z`
- Access nested response: `data.performance`, `data.insights`
- Combine related metrics in single component

**Extract:**
- Pattern: "Multi-metric component pattern" (fetch 2-3 metrics in 1 call)
- Document in knowledge base

---

### Boundary 2: Component → UI (How to visualize data?)

**Discover:**
- Existing visualization patterns (cards, charts, tables)
- Reusable components available (MetricCard, AnalyticsCard)
- Design system constraints (shadcn/ui components)

**Assess:**
- Best visualization for each data type?
  - Numbers → Metric cards with trends
  - Distributions → Bar charts or pie charts
  - Trends → Line charts with predictions
  - Recommendations → Action cards with buttons
  - Risks → Alert cards with severity
  - Workload → Distribution charts with thresholds

**Validate:**
- Consult architectural-review-specialist
- Ensure UI patterns consistent
- Accessibility maintained

**Translate:**
- Metric cards for KPIs (povCount, successRate, hoursSaved)
- Charts for distributions (byStatus, byPriority, byType)
- Alert cards for risks (tasksAtRisk, blockedTasks)
- Action cards for recommendations (with actionItems)
- Trend lines for productivity, success rates

**Extract:**
- Pattern: "Business intelligence card hierarchy"
- Reusable chart configurations

---

### Boundary 3: UI → UX (What's the user journey?)

**Discover:**
- Current navigation flow (tabs, filters, drill-downs)
- User pain points (what's hard to find?)
- Information hierarchy (what's most important?)

**Assess:**
- Executive needs: High-level health at a glance
- Manager needs: Drill into specific areas (team, bottlenecks)
- Contributor needs: Personal metrics and next actions

**Design:**
- Overview tab → Executive view (health score, top risks, ROI)
- Tasks tab → Manager view (workload, bottlenecks, recommendations)
- Agents tab → Automation intelligence (success patterns, learnings)
- Tools tab → MCP performance and opportunities

**Validate:**
- Does information architecture make sense?
- Can users find what they need quickly?
- Are actions clear and accessible?

**Translate:**
- Reorganize tabs if needed
- Add quick actions (bulk reassign, extend deadlines)
- Prominent recommendations (AI-suggested next steps)

**Extract:**
- Pattern: "Analytics dashboard information architecture"
- User journey flows

---

### Boundary 4: Technical → Business (Code to value)

**Discover:**
- What metrics exist? (technical: query counts, execution times)
- What business cares about? (ROI, risk mitigation, efficiency)

**Assess:**
- Translate technical → business language
  - "taskCompletionRate" → "Project Health Score"
  - "imbalanceScore" → "Team Load Balance Risk"
  - "hoursSaved" → "Automation ROI"
  - "recommendations[type=RISK]" → "Urgent Attention Needed"

**Validate:**
- Do labels resonate with business users?
- Are metrics actionable?
- Is value clear?

**Translate:**
- Business-focused labels
- Value-oriented descriptions
- Action-oriented UI ("Fix Now", "Rebalance Team", "Review Recommendations")

**Extract:**
- Pattern: "Technical-to-business translation glossary"

---

### Boundary 5: Instance → Pattern (Extract Reusables)

**Discover:**
- What patterns emerge from improvements?
- What components are reusable?
- What can benefit other dashboards?

**Extract:**
- Enhanced MetricCard variants
- Business intelligence card components
- Chart configuration patterns
- Recommendation action cards
- Risk severity indicators

**Document:**
- Add to `/components/analytics/core/`
- Update component library documentation
- Make available for future dashboards

---

## Recommended Approach

**Option: Use Boundary-Crossing Protocol + Focused Discovery**

```bash
Step 1: Run UI Consolidation Discovery (this prompt's Phase 1)
  ↓ Identifies: Duplication, unused data, business opportunities

Step 2: Use Boundary-Crossing Protocol
  ↓ Systematic improvement across 5 boundaries
  ↓ Specialist validation at each boundary

Step 3: Extract Patterns
  ↓ Document reusable components, patterns for future use
```

**Why this works:**
- Discovery finds WHAT to improve
- Boundary-crossing guides HOW to improve systematically
- Pattern extraction ensures REUSABILITY

**You DON'T need a new protocol** - the combination of:
1. This discovery prompt (finds opportunities)
2. Boundary-crossing protocol (systematic execution)
3. Specialist validation (quality assurance)

...gives you everything you need!

---

**Shall I create this prompt in `.claude/knowledge/prompts/ui_analytics_refactoring.md`?** It will guide the discovery phase, then hand off to boundary-crossing protocol for systematic implementation.