# MCP Specification Feature Gap Analysis

**Created**: 2026-02-17
**Last Updated**: 2026-05-31 (de-drift audit + v3 tool-loading reconciliation)
**Spec Version**: 2025-11-25 — ⚠️ *currency NOT re-confirmed 2026-05-31; verify at the next Protocol 9 Step 1 (spec-version delta)*
**Our Version**: Pure SDK-Native v5.0
**Purpose**: Identify unrealized MCP features that could enhance pAIchart

> **Status note (2026-05-31)**: a de-drift audit corrected several stale table rows (serverInfo name/title/description/websiteUrl were wrong; tool/prompt counts stale; `instructions` was marked "implemented" while actually **stdio-only** until v3). The 2026-05-31 tool-loading work (`cline_docs/mcp-tool-loading-entry-point-plan-2026-05-31.md`, commit `6d516329`) shipped: `instructions` now on **both** transports, `serverInfo` aligned HTTP↔stdio, two entry-point tools marked `alwaysLoad`. That advances the **Enhanced Server Info** + **instructions** backlog items below (now largely done). The aspirational "Immediate Actions / This Week / This Month" lists further down are stale planning from when this doc was written — treat the table + the Dynamic Instructions plan as the live trackers, not those lists.

> **For SDK upgrade procedure**: see [`protocols/mcp-sdk-upgrade-protocol.md`](protocols/mcp-sdk-upgrade-protocol.md).
> That protocol owns the 6-step upgrade checklist and the live "Tracked Items"
> (30-min session TTL, 2026 stateless transition). This doc is the **backlog** —
> what we haven't implemented yet, ranked by priority.

---

## MCP Feature Comparison Table

| Feature Category | MCP Spec Feature | Status | Implementation | Priority | Benefit | File/Line |
|------------------|------------------|--------|----------------|----------|---------|-----------|
| **Initialization** |
| Protocol Version | ✅ Required | ✅ IMPLEMENTED | SDK handles | N/A | Standard compliance | SDK |
| Server Capabilities | ✅ Required | ✅ IMPLEMENTED | `getEnhancedCapabilities()` | N/A | Feature negotiation | mcp-server-v5.js:328 |
| **Server Info (Enhanced)** |
| serverInfo.name | ✅ Required | ✅ IMPLEMENTED | `'paichart'` (was wrongly recorded as 'paichart-pure-sdk-native') | N/A | Identification | mcp-server-v5.js:136; HTTP aligned to `'paichart'` 2026-05-31 (mcp-core.ts) |
| serverInfo.version | ✅ Required | ✅ IMPLEMENTED | `'5.0.0'` | N/A | Version tracking | mcp-server-v5.js:138; HTTP aligned 2026-05-31 |
| serverInfo.title | ⭐ Optional | ✅ IMPLEMENTED | `'pAIchart - AI-Native Service Orchestration'` | — | User-friendly display name | mcp-server-v5.js:137 (stdio; HTTP omits — flat) |
| serverInfo.description | ⭐ Optional | ✅ IMPLEMENTED | set | — | Server purpose clarity | mcp-server-v5.js:139 (stdio) |
| serverInfo.icons | ⭐ Optional | ❌ NOT USED | - | LOW | Visual branding | mcp-server-v5.js:135-141 |
| serverInfo.websiteUrl | ⭐ Optional | ✅ IMPLEMENTED | `'https://paichart.com'` | — | Documentation link | mcp-server-v5.js:140 (stdio) |
| **Instructions** |
| instructions field | ⭐ Optional | ✅ IMPLEMENTED (**both transports** since 2026-05-31 v3; was stdio-only) | `getServerInstructions()` | — | User guidance | mcp-server-v5.js:485 (source); HTTP surfaces it via mcp-core.ts initialize |
| Dynamic instructions | ⭐ Enhancement | ❌ NOT USED | Static only | **CRITICAL** | Context-aware guidance | See implementation plan |
| **Server Capabilities** |
| tools | ✅ Core | ✅ IMPLEMENTED | 10 consolidated (6 action-routed + 4 standalone; was wrongly "93") | N/A | Core functionality | tool-schemas.js (CONSOLIDATED_SCHEMAS + TOOL_SCHEMAS) |
| resources | ✅ Core | ✅ IMPLEMENTED | Artifacts, executions, Hub | N/A | Data access | mcp-server-v5.js:335-344 |
| resources.subscribe | ⭐ Optional | ⚠️ stdio-only | true (stdio `getEnhancedCapabilities`); HTTP flat per I4 | N/A | Real-time updates | mcp-server-v5.js:336 — *emission unverified; do not advertise on HTTP* |
| resources.listChanged | ⭐ Optional | ⚠️ stdio-only | true (stdio); HTTP flat per I4 | N/A | Change notifications | mcp-server-v5.js:337 — *emission unverified* |
| prompts | ✅ Core | ✅ IMPLEMENTED | 16 MCP prompts (1 built-in + DB-backed; was wrongly "17 built-in") | N/A | Workflow templates | mcp-server-v5.js:345; prompt-registry.js |
| prompts.listChanged | ⭐ Optional | ❌ NOT USED | - | LOW | Dynamic prompt updates | mcp-server-v5.js:345 |
| logging | ⭐ Optional | ✅ IMPLEMENTED | Structured logging | N/A | Debugging | mcp-server-v5.js:331-334 |
| **Advanced Capabilities** |
| completions | ⭐ Optional | ❌ NOT USED | - | **HIGH** | Parameter autocomplete | - |
| tasks | ⭐ NEW (2025-11) | ❌ NOT USED | - | **MEDIUM** | Task-augmented requests | - |
| tasks.list | Sub-capability | ❌ NOT USED | - | **MEDIUM** | Server-side task listing | - |
| tasks.cancel | Sub-capability | ❌ NOT USED | - | MEDIUM | Server-initiated cancellation | - |
| **Client Capabilities (we could request)** |
| elicitation | ⭐ NEW (2025-11) | ❌ NOT USED | - | **HIGH** | Request user input | - |
| elicitation.form | Sub-capability | ❌ NOT USED | - | **HIGH** | Form-based input collection | - |
| elicitation.url | Sub-capability | ❌ NOT USED | - | MEDIUM | URL-based OAuth flows | - |
| sampling | ⭐ Optional | ❌ NOT USED | - | LOW | LLM sampling requests | - |
| roots | ⭐ Optional | ❌ NOT USED | - | LOW | Filesystem roots | - |
| **Utilities** |
| Progress notifications | ⭐ Optional | ❌ NOT USED | - | **MEDIUM** | Long operation updates | - |
| Cancellation | ⭐ Optional | ❌ NOT USED | - | MEDIUM | Request cancellation | - |
| Ping | ⭐ Optional | ✅ IMPLEMENTED | SDK handles | N/A | Health checks | SDK |
| **Experimental (Our Custom)** |
| smartErrorRecovery | Custom | ✅ IMPLEMENTED | Enhanced error messages | N/A | Error handling | mcp-server-v5.js:347-356 |
| contextAwareness | Custom | ✅ IMPLEMENTED | Session context tracking | N/A | Workflow continuity | mcp-server-v5.js:357-366 |
| proactiveSuggestions | Custom | ✅ IMPLEMENTED | Workflow suggestions | N/A | User guidance | mcp-server-v5.js:367 |

---

## Internal Conformance Debt (cross-transport parity) — A1

**Not a spec-feature gap, but a structural reason features silently go missing.** The HTTP path hand-rolls JSON-RPC dispatch (`MCPCoreManager.processRequest`, `mcp-core.ts`) instead of `Server.connect(transport)` — so any spec field the SDK carries for free must be manually mirrored on HTTP or it's silently dropped. 2026-05-31 found `instructions` + `_meta`(alwaysLoad) both absent on HTTP this way (commit `6d516329`).

- **Owner / full record**: `protocols/mcp-sdk-upgrade-protocol.md` → Tracked Item #2 (the HTTP→SDK-transport migration is gated on the stateless transition).
- **Backlog item (here)**: a **parity-assertion test** — fails when stdio↔HTTP `initialize`/`tools/list` shapes drift (serverInfo, instructions, capabilities, `_meta`). Priority **MEDIUM**. Interim defense until the migration; makes the drift self-catching (this round it took a human asking).

---

## Priority Features to Implement

### CRITICAL Priority (Immediate Value)

#### 1. **Dynamic Instructions** ⭐⭐⭐
- **Current**: Static text, same for everyone
- **Spec**: `instructions` field in initialize response (optional)
- **Enhancement**: Make context-aware (user activity, POV status, recent deployments)
- **Impact**: Solves the "missing piece" - anticipates next steps (50% priority)
- **Effort**: 8-13 hours
- **ROI**: Transforms passive tool access → active guidance
- **Implementation**: See `.claude/knowledge/TODO1-dynamic-server-instructions-implementation-plan.md` *(path corrected 2026-05-31 — was a dangling `/cline_docs/` ref)*
- **2026-05-31 update**: now builds on v3 — static `instructions` are live on BOTH transports, so making them dynamic must thread context through the **HTTP initialize** (mcp-core.ts) too, not only the stdio constructor. Carries a **Protocol-10** consideration (instructions injected every session): user-state *facts* (N POVs, M tasks) are safe; *prescriptive* nudges/predictions hit the verdict bar. See that plan.

#### 2. **Argument Completions** ⭐⭐⭐
- **Spec**: Server capability `completions`
- **Purpose**: Provide autocomplete suggestions for tool parameters
- **Use Case**:
  ```javascript
  // User types: services(action: "discover", category:
  // Server suggests: "ai-intelligence" | "data-services" | "automation" ...
  ```
- **Impact**: 50% fewer parameter errors, better discoverability
- **Effort**: 4-6 hours
- **File**: New `/lib/mcp/server/handlers/completion-handler.js`
- **SDK**: Implement `server.setRequestHandler(CompletionRequestSchema, handler)`

#### 3. **Elicitation (Form-Based Input)** ⭐⭐
- **Spec**: Client capability `elicitation` (NEW in 2025-11)
- **Purpose**: Server can request user input via forms
- **Use Case**:
  ```javascript
  // When creating POV, server requests:
  // Form: { title: text, customer: text, country: dropdown }
  // User fills form → POV created with validated data
  ```
- **Impact**: 70% fewer validation errors, guided data entry
- **Effort**: 6-8 hours
- **Spec**: https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation

---

### HIGH Priority (Significant Value)

#### 4. **Enhanced Server Info** — ✅ MOSTLY DONE (2026-05-31)
- **2026-05-31**: `title`, `description`, `websiteUrl` are already set on the stdio SDK Server (`mcp-server-v5.js:137-140`); v3 aligned HTTP `serverInfo` name/version to match. **Remaining**: `icons` (LOW), and surfacing title/description on the *HTTP* initialize (currently flat — minor). This item is no longer a 30-min greenfield task; it's a small finish.
- **Current**: Basic name + version only
- **Spec**: Optional fields: title, description, icons, websiteUrl
- **Enhancement**:
  ```javascript
  serverInfo: {
    name: 'paichart-pure-sdk-native',
    title: 'pAIchart Project Management Platform',  // NEW
    version: '5.0.0',
    description: 'AI-first platform for managing Proof of Value projects...',  // NEW
    icons: [{ src: 'https://paichart.app/icon.svg', ... }],  // NEW
    websiteUrl: 'https://paichart.app'  // NEW
  }
  ```
- **Impact**: Better UX in Claude Desktop, professional appearance
- **Effort**: 30 minutes
- **File**: mcp-server-v5.js:136-139

#### 5. **Progress Notifications**
- **Spec**: Progress reporting for long operations
- **Purpose**: Update client during long-running operations
- **Use Case**:
  ```javascript
  // During agent execution:
  sendProgress({ progress: 50, total: 100, message: "Analyzing code..." })
  ```
- **Impact**: Better UX for multi-minute operations (agent execution, workflows)
- **Effort**: 3-4 hours
- **Files**:
  - Execution streaming already exists (mcp-server-v5.js:159)
  - Need to connect to MCP progress protocol

#### 6. **Tasks Capability** ⭐
- **Spec**: NEW in 2025-11-25
- **Purpose**: Task-augmented requests (server can create tasks in client UI)
- **Use Case**:
  ```javascript
  // Server: "I need to analyze this. Creating task for you to review results"
  // Client UI: Shows task card in interface
  ```
- **Impact**: Server-driven workflow guidance
- **Effort**: Unknown (new feature, need to research)
- **Spec**: https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks

---

### MEDIUM Priority (Nice to Have)

#### 7. **Prompts List Changed Notification**
- **Current**: Static prompt list
- **Spec**: `prompts.listChanged` capability
- **Purpose**: Notify client when prompts are added/removed
- **Impact**: Dynamic prompt discovery
- **Effort**: 2-3 hours

#### 8. **Cancellation Support**
- **Spec**: Request cancellation protocol
- **Purpose**: Allow clients to cancel long-running requests
- **Impact**: Better control for users
- **Effort**: 3-4 hours

---

### LOW Priority (Minimal Value)

#### 9. **Client Roots**
- **Spec**: Filesystem root access points
- **Impact**: Limited (we're not filesystem-focused)

#### 10. **Sampling**
- **Spec**: LLM sampling with tools
- **Impact**: Limited for our use case

---

## Quick Wins (< 1 hour each)

### ✅ Immediate Implementation

**1. Enhanced Server Info** (30 min)
```javascript
// mcp-server-v5.js:136-139
{
  name: 'paichart-pure-sdk-native',
  title: 'pAIchart - AI-First Project Management',  // ADD
  version: '5.0.0',
  description: 'Proof of Value management platform with 93 MCP tools, 17 interactive prompts, and AI agent automation',  // ADD
  websiteUrl: 'https://paichart.app'  // ADD
}
```

**2. Instructions Enhancement** (30 min)
```javascript
// Add to current static instructions:
🎯 YOUR POVS:
• You have N active POVs
• M tasks need attention
💡 Quick start: "List my high priority tasks"
```

---

## Biggest Opportunities

### 🥇 **Dynamic Instructions (CRITICAL)**
- **Solves**: The "missing piece" - makes AI actually anticipatory
- **Addresses**: All 3 priorities (50% + 30% + 20%)
- **Status**: Implementation plan ready
- **Next**: Start with Phase 1 (infrastructure)

### 🥈 **Argument Completions (HIGH)**
- **Solves**: Parameter discovery and validation
- **Reduces**: 50% of parameter errors
- **Status**: Not started
- **Next**: Research SDK completion handler API

### 🥉 **Elicitation (HIGH)**
- **Solves**: Guided data entry with validation
- **Reduces**: 70% of validation errors
- **Status**: New feature in 2025-11 spec
- **Next**: Research client support (does Claude Desktop support it?)

---

## Research Questions

- [ ] Does Claude Desktop support elicitation (form-based input)?
- [ ] Does @modelcontextprotocol/sdk Server class allow updating instructions after initialization?
- [ ] Are there completion handler examples in SDK documentation?
- [ ] What clients support the tasks capability (NEW in 2025-11)?
- [ ] Can we emit progress notifications with current SDK version?

---

## Recommendation

**Immediate Actions** (Today):
1. ✅ Implement enhanced serverInfo (30 min)
2. ✅ Research SDK dynamic instructions support (30 min)
3. ✅ Start Phase 1 of dynamic instructions (2 hours for POV status detection)

**This Week**:
4. Complete dynamic instructions implementation
5. Research and prototype completions
6. Research elicitation client support

**This Month**:
7. Implement completions if SDK supports
8. Implement progress notifications for agent executions
9. Evaluate tasks capability

---

## MCP Spec Sources

- [Lifecycle Specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [Tools Specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [Resources Specification](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
- [Prompts Specification](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts)
- [Completion Specification](https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/completion)
- [Elicitation Specification](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)
- [Tasks Specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)
- [Progress Specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress)

> 2026 roadmap sources (SEPs, stateless transition, etc.) live in
> [`protocols/mcp-sdk-upgrade-protocol.md`](protocols/mcp-sdk-upgrade-protocol.md).

---

## Summary

**Currently Using**: ~core + instructions (both transports) + Enhanced Server Info (mostly) as of 2026-05-31 — the old "6/15 (40%)" tally predates the v3 corrections; recompute against the corrected table above rather than trusting this figure.
**High-Value Opportunities**: 3 features (dynamic instructions [plan exists], completions, elicitation)

**The Big One**: Dynamic instructions solves the core conundrum - making AI actually anticipatory instead of just accessible.
