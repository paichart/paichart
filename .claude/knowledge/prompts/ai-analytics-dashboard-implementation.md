# AI Analytics Dashboard Implementation - Continuation Prompt

**Session Date**: 2025-12-11
**Context**: Follow-up to POV audit and security fixes session
**Goal**: Rationalize dashboards and create comprehensive AI Analytics page

---

## 🎯 Project Goal

**Rationalize and enhance analytics across the application**:

1. **Repurpose `/dashboard`** → Admin-only dashboard (remove POV-scopable analytics)
2. **Create AI Analytics Page** → POV-scopable analytics from sidenav "AI Analytics" item
3. **Extract Common Patterns** → Reusable analytics components for POV-scoped views
4. **Consolidate APIs** → Identify and optimize analytics/performance/summary endpoints

---

## 📊 Known Analytics Endpoints (From Session 2025-12-11)

### **Working Endpoints** ✅

**Agent Execution Analytics**:
- `GET /api/agent-executions?povId={id}&dateRange=30d&limit=20`
  - **Purpose**: Agent execution history
  - **POV-scoped**: Yes (context-aware: optional povId)
  - **Used in**: AnalyticsSection.tsx (POV view page)
  - **Status**: ✅ Fixed today (null→undefined, taskId='global' support)

- `GET /api/agent-executions/summary?povId={id}&timeRange=7d`
  - **Purpose**: Agent execution summary stats
  - **POV-scoped**: Yes (context-aware)
  - **Used in**: AgentHistoryView.tsx
  - **Status**: ✅ Fixed today

**Task Analytics** (unified endpoint — old `/api/tasks/analytics/*` wrappers removed at sunset 2026-06-12):
- `GET /api/analytics?domain=tasks&metrics=performance&povId={id}&timeRange=30d`
  - **Purpose**: Task completion %, status distribution, top performers
  - **POV-scoped**: Yes (required filter)
  - **Used in**: AnalyticsSection.tsx (POV view page)
  - **Response shape**: `{ data: { performance: {...} } }` (metric nested under its key)

- `GET /api/analytics?domain=tasks&metrics=insights&povId={id}&timeRange=30d`
  - **Purpose**: AI-generated insights and recommendations
  - **POV-scoped**: Yes
  - **Used in**: AnalyticsSection.tsx
  - **Response shape**: `{ data: { insights: {...} } }`

**Activity Analytics**:
- `GET /api/tasks/activities?povId={id}&dateRange=90d&limit=10`
  - **Purpose**: Recent activity feed
  - **POV-scoped**: Yes
  - **Used in**: AnalyticsSection.tsx
  - **Status**: Working

**Global Analytics** (Cross-POV):
- `GET /api/tasks/global/activities?dateRange=7d`
  - **Purpose**: All task activities across accessible POVs
  - **POV-scoped**: No (user-scoped: owner/team/demo)
  - **Used in**: TaskActivityTimeline.tsx (Dashboard)
  - **Status**: Working

---

## 🧩 Existing Dashboard Components

### **Current `/dashboard` Page** (`app/(authenticated)/dashboard/page.tsx`)

**5 Tabs**:
1. **Analytics & Insights** - Executive analytics (MCPAnalyticsDashboard)
2. **AI & Automation** - Task automation (IntelligentTaskAutomation)
3. **Activity & Performance** - Monitoring (AgentHistoryView, TaskActivityTimeline)
4. **Tools & Servers** - Infrastructure (MCPToolDashboard, MCPServerManager)
5. **MCP Intelligence** - MCP status (MCPIntelligenceStatus)

**Components Used**:
- `ActivePoVs` - POV list widget
- `TeamStatus` - Team activity widget
- `SuccessRate` - Success metrics
- `RiskOverview` - Risk assessment
- `ResourceUsage` - Resource metrics
- `Milestones` - Milestone tracking
- `GeoDistribution` - Geographic distribution
- `MCPAnalyticsDashboard` - MCP analytics
- `IntelligentTaskAutomation` - AI recommendations
- `AgentHistoryView` - Agent execution history (uses taskId='global')
- `TaskActivityTimeline` - Task activities (uses taskId='global')
- `MCPToolDashboard` - MCP tool monitoring
- `MCPServerManager` - Server management
- `MCPIntelligenceStatus` - MCP intelligence

---

### **Current POV View Analytics Tab** (`/pov/view/[povId]`)

**Component**: `AnalyticsSection.tsx`

**Features**:
- Task completion metrics (completion %)
- Team activity metrics
- Timeline status
- **Performance Analytics Widget** (React Query):
  - API: `/api/tasks/analytics/performance?povId=...`
  - Data: Task distribution by status/priority/type
- **Insights & Recommendations Card** (React Query):
  - API: `/api/tasks/analytics/insights?povId=...`
  - Data: AI-generated recommendations
- **Agent Executions Summary** (React Query):
  - API: `/api/agent-executions?povId=...`
  - Data: Agent execution history (client-side filtered)
- **Recent Activity Feed** (React Query):
  - API: `/api/tasks/activities?povId=...`
  - Data: Recent task activities

---

## 🔍 Discovery Tasks (CRITICAL - Do This First!)

**Before implementing**, use the **discovery-first workflow**:

### **Discovery 1: Analytics Endpoint Audit**

**Goal**: Map ALL analytics/performance/summary endpoints

**Commands**:
```bash
# Find all analytics endpoints
find app/api -type f -name "route.ts" | xargs grep -l "analytics\|performance\|summary\|insights\|metrics"

# Find all React Query usage (analytics data fetching)
grep -r "useQuery.*analytics\|useQuery.*performance\|useQuery.*summary" components/ --include="*.tsx"

# Find MCP analytics tools
grep -r "mcp.*analytics\|analytics.*mcp" --include="*.ts" --include="*.tsx"
```

**Output Needed**:
- Complete list of analytics endpoints with:
  - URL pattern
  - Query parameters
  - POV-scoped or user-scoped
  - Response data structure
  - Currently used by which components

### **Discovery 2: Component Inventory**

**Goal**: Map all analytics-related components

**Search Patterns**:
```bash
# Find all dashboard widgets
find components/dashboard/widgets -name "*.tsx"

# Find all analytics sections
find components -name "*Analytics*" -o -name "*Performance*" -o -name "*Metrics*"

# Find all React Query usage
grep -r "useQuery\|useMutation" components/ --include="*.tsx" | grep -i "analytics\|performance\|summary"
```

**Output Needed**:
- Component file paths
- What data they display
- Which APIs they call
- POV-scoped vs global
- Reusability assessment

### **Discovery 3: Sidenav AI Analytics Item**

**Goal**: Find where AI Analytics is defined and what it currently renders

**Commands**:
```bash
# Find sidenav configuration
grep -r "AI Analytics\|ai-analytics" --include="*.tsx" --include="*.ts"

# Find route/page for AI Analytics
find app -type f -name "page.tsx" | xargs grep -l "analytics\|Analytics"
```

**Output Needed**:
- Current sidenav item configuration
- Current page/route (if exists)
- What it's supposed to show

---

## 📋 Proposed Implementation Plan

### **Phase 1: Discovery & Audit** (2-3 hours)

**Step 1**: Run Discovery 1-3 (use discovery-scout specialist)
**Step 2**: Create inventory spreadsheet:
```
| Endpoint/Component | POV-Scoped | Admin-Only | Shared | Target Location |
|--------------------|------------|------------|--------|----------------|
| /api/agent-executions | Yes | No | Yes | AI Analytics |
| ActivePoVs widget | No | Yes | No | Admin Dashboard |
```

**Step 3**: Identify reusable patterns:
- Chart components (bar, line, pie)
- Metric cards (completion %, success rate)
- Activity feeds
- Data fetching hooks

### **Phase 2: Architecture Design** (1-2 hours)

**Use Specialist Review Protocol**:
- **architectural-review-specialist**: Overall design validation
- **api-efficiency-specialist**: API consolidation opportunities
- **boundary-contract-specialist**: Data flow validation

**Design Questions**:
1. Should AI Analytics be POV-scoped (select POV dropdown) or user-scoped (all POVs)?
2. Which widgets belong in Admin Dashboard vs AI Analytics?
3. Can we create reusable analytics components?
4. Should we consolidate similar endpoints?

### **Phase 3: Implementation** (4-6 hours)

**Step 1**: Create AI Analytics page structure
- Route: `/app/(authenticated)/ai-analytics/page.tsx`
- Layout: Similar to dashboard (tabs or cards)
- POV selector: Dropdown or breadcrumb

**Step 2**: Extract POV-scopable components
- Move from Dashboard → AI Analytics
- Make them POV-aware (pass povId prop)
- Keep admin-only in Dashboard

**Step 3**: Create reusable analytics components
- `<MetricCard>` - Generic metric display
- `<AnalyticsChart>` - Configurable chart component
- `<ActivityFeed>` - Generic activity timeline
- `<InsightsPanel>` - AI recommendations display

**Step 4**: Update Admin Dashboard
- Remove POV-scopable content
- Keep admin-only features:
  - User management widgets
  - System health
  - Global metrics (all POVs)
  - Infrastructure monitoring

### **Phase 4: Testing & Validation** (1-2 hours)

**Test Checklist**:
- [ ] AI Analytics loads with POV selection
- [ ] All charts/metrics display correctly
- [ ] Admin Dashboard shows admin-only content
- [ ] No 400 errors in console
- [ ] POV filtering works correctly
- [ ] Mobile responsive
- [ ] Performance (React Query caching works)

---

## 🔑 Key Context from 2025-12-11 Session

### **Security Patterns Applied**

**Context-Aware povId**:
```typescript
// Optional povId for dual-mode queries
povId: z.string().cuid().optional()

// API handler:
if (query.povId) {
  // Single-POV query (validate access)
  const pov = await prisma.pOV.findUnique({ where: { id: query.povId } });
  validatePOVAccess(user, pov, { throwOnDeny: true });
  taskWhereClause = { povId: query.povId };
} else {
  // Cross-POV query (user-based filtering)
  taskWhereClause = {
    pov: {
      OR: [
        { ownerId: user.userId },
        { team: { members: { some: { userId: user.userId } } } },
        { metadata: { path: ['isDemo'], equals: true } }
      ]
    }
  };
}
```

**Query Parameter Handling**:
```typescript
// ✅ CORRECT: Convert null to undefined
const queryParams = {
  povId: searchParams.get('povId') || undefined,
  dateRange: searchParams.get('dateRange') || undefined
};
```

**Prisma groupBy Limitation**:
```typescript
// ❌ WRONG: Nested relation in groupBy
await prisma.taskActivity.groupBy({
  where: { task: where }
});

// ✅ CORRECT: Two-step query
const taskIds = (await prisma.task.findMany({ where, select: { id: true } })).map(t => t.id);
await prisma.taskActivity.groupBy({
  where: { taskId: { in: taskIds } }
});
```

### **Components with POV-Scoped Analytics**

**AnalyticsSection.tsx** (`/components/poveditor/pov/sections/AnalyticsSection.tsx`):
- Uses 4 React Query hooks
- All APIs use `povId` parameter
- Stale times: 30s-60s
- Displays: metrics, charts, insights, activity feed

**AgentHistoryView.tsx** (`/components/poveditor/pov/components/AgentHistoryView.tsx`):
- Optional `povId` prop (context-aware)
- Uses `/api/agent-executions` and `/api/agent-executions/summary`
- Filters, search, pagination
- Used in both Dashboard (no povId) and POV view (with povId)

---

## 🎨 UI/UX Considerations

### **POV Selector Design Options**

**Option A: Dropdown in Header**
```tsx
<div className="flex items-center gap-4">
  <h1>AI Analytics</h1>
  <Select value={selectedPOVId} onValueChange={setSelectedPOVId}>
    {/* User's accessible POVs */}
  </Select>
</div>
```

**Option B: Sidebar Navigation**
```tsx
<div className="grid grid-cols-[250px_1fr]">
  <aside>{/* POV list */}</aside>
  <main>{/* Analytics for selected POV */}</main>
</div>
```

**Option C: Tab-Based**
```tsx
<Tabs>
  <TabsList>
    {povs.map(pov => <TabsTrigger value={pov.id}>{pov.title}</TabsTrigger>)}
  </TabsList>
</Tabs>
```

### **Dashboard Rationalization**

**Admin Dashboard** (keep):
- User management
- System health
- MCP server management
- Global metrics (all POVs aggregated)
- Infrastructure monitoring

**AI Analytics** (POV-scoped, move here):
- Task performance metrics (per POV)
- Agent execution history (per POV)
- AI insights & recommendations (per POV)
- Team performance (per POV)
- Activity timeline (per POV)

---

## 🔧 Implementation Checklist

### **Before Starting**

- [ ] Run discovery-scout for analytics audit
- [ ] Review existing dashboard components
- [ ] Map all analytics endpoints
- [ ] Check sidenav AI Analytics current state

### **Discovery Phase**

- [ ] Complete Discovery 1: Analytics Endpoint Audit
- [ ] Complete Discovery 2: Component Inventory
- [ ] Complete Discovery 3: Sidenav AI Analytics Item
- [ ] Create component-to-endpoint mapping
- [ ] Identify reusable patterns

### **Design Phase**

- [ ] Consult architectural-review-specialist
- [ ] Consult api-efficiency-specialist
- [ ] Decide on POV selector UI pattern
- [ ] Design AI Analytics page layout
- [ ] Design Admin Dashboard simplification

### **Implementation Phase**

- [ ] Create AI Analytics route/page
- [ ] Extract POV-scopable components
- [ ] Create reusable analytics components
- [ ] Update Admin Dashboard (remove POV-scoped)
- [ ] Add POV selector to AI Analytics
- [ ] Wire up all APIs with povId

### **Testing Phase**

- [ ] Test AI Analytics with multiple POVs
- [ ] Test Admin Dashboard admin-only features
- [ ] Test POV view page (ensure no regression)
- [ ] Run validation tests (npm run test:all-validation)
- [ ] Check for 400 errors in console
- [ ] Performance testing (React Query caching)

---

## 🚨 Known Issues to Avoid

### **From 2025-12-11 Session**

**1. Query Parameter Null Handling**:
```typescript
// ❌ WRONG: Causes "received null" validation errors
const queryParams = {
  povId: searchParams.get('povId')  // Returns null if missing
};

// ✅ CORRECT: Convert to undefined
const queryParams = {
  povId: searchParams.get('povId') || undefined
};
```

**2. Optional vs Required povId**:
- Use **optional** for context-aware endpoints
- Validate when provided, user-filter when omitted
- Document clearly in schema `.describe()`

**3. Prisma groupBy with Relations**:
- Can't use nested relations (`task: where`)
- Must use two-step query (get IDs → filter by IDs)

**4. Special Values**:
- `taskId='global'` requires union type: `z.union([z.literal('global'), z.string().cuid()])`

**5. React Query Keys**:
- Include `povId` in query keys for proper cache invalidation
- Example: `['task-analytics-performance', povId]`

---

## 📁 Key Files to Review

### **Current Dashboard**
- `app/(authenticated)/dashboard/page.tsx` - Main dashboard (5 tabs)
- `components/dashboard/widgets/*.tsx` - Dashboard widgets

### **POV Analytics**
- `components/poveditor/pov/sections/AnalyticsSection.tsx` - POV analytics tab
- `components/poveditor/pov/components/AgentHistoryView.tsx` - Agent history

### **Navigation**
- Find sidenav configuration (likely in `components/` or `app/layout.tsx`)
- Find "AI Analytics" menu item definition

### **Analytics APIs**
- `app/api/agent-executions/route.ts` - Agent execution queries
- `app/api/agent-executions/summary/route.ts` - Agent execution summary
- `app/api/tasks/analytics/performance/route.ts` - Task performance
- `app/api/tasks/analytics/insights/route.ts` - AI insights
- `app/api/tasks/activities/route.ts` - Activity feed
- `app/api/tasks/global/activities/route.ts` - Global activities

### **MCP Components**
- `components/mcp/MCPAnalyticsDashboard.tsx`
- `components/mcp/MCPToolDashboard.tsx`
- `components/admin/MCPAnalyticsDashboard.tsx`

---

## 🎓 Patterns to Reuse

### **React Query Pattern** (from AnalyticsSection.tsx)

```tsx
const { data, isLoading, error } = useQuery({
  queryKey: ['analytics-key', povId],
  queryFn: async ({ signal }) => {
    const response = await fetch(
      `/api/endpoint?povId=${povId}&param=value`,
      { signal }
    );
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const raw = await response.json();
    return SomeSchema.parse(raw);  // Validate response
  },
  staleTime: 60000,  // 60s
  enabled: !!povId
});
```

### **Context-Aware Component Pattern**

```tsx
interface ComponentProps {
  povId?: string;  // Optional for flexibility
  // ... other props
}

export function Component({ povId }: ComponentProps) {
  // Adapt behavior based on povId presence
  const queryParams = povId
    ? `povId=${povId}&dateRange=30d`
    : `dateRange=30d`;  // Cross-POV mode

  // Fetch data...
}
```

---

## 🎯 Success Criteria

### **AI Analytics Page**

- [ ] Accessible from sidenav "AI Analytics" item
- [ ] POV selector (dropdown or sidebar)
- [ ] Shows analytics for selected POV:
  - [ ] Task performance metrics
  - [ ] Agent execution history
  - [ ] AI insights & recommendations
  - [ ] Team performance
  - [ ] Activity timeline
- [ ] Responsive design
- [ ] Fast loading (< 2s for charts)
- [ ] Proper error handling
- [ ] No console errors

### **Admin Dashboard**

- [ ] Simplified to admin-only features
- [ ] Removed POV-scopable analytics
- [ ] Kept infrastructure monitoring
- [ ] Kept global aggregations
- [ ] Clear purpose: System administration

### **Code Quality**

- [ ] Reusable components created
- [ ] No code duplication
- [ ] Consistent API patterns
- [ ] All validation tests pass
- [ ] TypeScript compiles cleanly
- [ ] Security patterns followed

---

## 🚀 Recommended Approach

### **Session Start**:

```
I need to implement an AI Analytics dashboard page. This is a follow-up to the
2025-12-11 POV audit session.

Please read:
/.claude/knowledge/prompts/ai-analytics-dashboard-implementation.md

Then use the discovery-scout specialist to run all 3 discovery tasks before we
start implementation.
```

### **After Discovery**:

1. Review findings with me
2. Propose AI Analytics page design
3. Get approval on component extraction plan
4. Implement with specialist reviews
5. Test thoroughly
6. Deploy

---

## 📚 Related Documentation

**From This Session**:
- `cline_docs/security-audit-pov-bypass-2025-12-11.md` - Security audit results
- Validation test architecture (100% passing, 395 tests)
- Context-aware povId pattern
- Field filtering patterns

**Protocols to Follow**:
- `/.claude/knowledge/protocols/discovery-first-workflow-guide.md`
- `/.claude/knowledge/protocols/specialist-review-protocol.md`
- `/.claude/knowledge/protocols/boundary-crossing-development-protocol.md`

**Relevant Specialists**:
- `discovery-scout` - For running discovery prompts
- `architectural-review-specialist` - Design validation
- `api-efficiency-specialist` - API consolidation
- `boundary-contract-specialist` - Component→API data flow
- `performance-analyst-specialist` - Query optimization

---

## 🎁 Bonus: Potential Enhancements

### **Advanced Analytics Features**

**AI-Powered Insights**:
- Trend analysis (task completion over time)
- Anomaly detection (unusual activity patterns)
- Predictive analytics (forecast completion dates)
- Resource optimization recommendations

**Interactive Visualizations**:
- Drill-down charts (click status → see tasks)
- Time series comparisons
- Team performance comparisons
- Agent execution success rate trends

**Export Capabilities**:
- PDF reports
- CSV exports
- Scheduled email reports
- Dashboard sharing

---

## ⚡ Quick Start Command

**For Next Session**:

```bash
# Read this prompt
cat .claude/knowledge/prompts/ai-analytics-dashboard-implementation.md

# Start discovery
"Use discovery-scout to run analytics endpoint audit, component inventory,
and sidenav AI Analytics investigation. Create a comprehensive mapping
before we start implementation."
```

---

## 📊 Expected Outcomes

**AI Analytics Page**:
- Modern, insightful analytics dashboard
- POV-scoped views
- Reusable component library
- Fast, efficient API usage

**Admin Dashboard**:
- Simplified, focused on administration
- System health monitoring
- User management
- Infrastructure oversight

**Code Quality**:
- Reduced duplication
- Better separation of concerns
- Comprehensive test coverage
- Clean, maintainable codebase

---

**Created**: 2025-12-11
**Session**: POV Audit and Security Fixes
**Commits**: 9 deployed (fde8fc1 → cabc2d0)
**Status**: Ready for implementation in new session
