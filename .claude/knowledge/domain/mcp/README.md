# MCP Domain Knowledge

**Created**: 2025-11-17
**Last Updated**: 2025-11-17
**Domain Specialists**: mcp-integration-specialist, chatgpt-connector-specialist, mcp-hub-specialist, anthropic-mcp-sdk-guru-specialist

---

## Overview

This directory contains comprehensive knowledge about the Model Context Protocol (MCP) implementation in pAIchart, including:
- API specifications and technical reference
- Implementation patterns (production-tested)
- User guidance for AI clients (ChatGPT, Claude Desktop, Gemini)
- Migration guides and historical context

---

## Documents

### 1. api-reference.md

**Type**: Technical reference
**Audience**: Developers, AI agents
**Content**:
- Response structure (pagination metadata, filters, performance)
- List tools API (project(action: "task.list"), project(action: "pov.list"), template(action: "list"), services(action: "discover"), list_browser_templates)
- Prompts API (audit_all_tasks)
- Type coercion for cross-platform compatibility
- Error responses and recovery

**When to Use**: When you need technical details about MCP API structure

---

### 2. implementation-patterns.md

**Type**: Production-tested patterns
**Audience**: AI agents, developers
**Confidence**: 95% (Sprint 1 validated)
**Content**:
- Performance optimization (scoping queries, name-based filters, limit sizing)
- Scoping best practices (hierarchical scoping, multi-filter combinations)
- Common patterns (workflow navigation, status monitoring, audit/overview, name-based discovery)
- Quick reference tables

**When to Use**: When implementing MCP tool calls or optimizing queries

---

### 3. user-guide.md

**Type**: User-facing documentation
**Audience**: End users (ChatGPT, Claude Desktop, Gemini users)
**Content**:
- Understanding pagination
- Working with completeness indicators
- Troubleshooting common issues
- Support resources

**When to Use**: When explaining MCP behavior to users or troubleshooting user issues

---

### 4. migration-guide.md

**Type**: Historical reference
**Audience**: Developers, architects
**Content**:
- What changed (November 2025 pagination enhancement)
- Migration checklist (100% backward compatible)
- Common migration scenarios
- Testing procedures
- Timeline and phases

**When to Use**: When understanding why system works this way or planning future migrations

---

### 5. tool-permission-management.md

**Type**: Security architecture guide
**Audience**: Developers, security specialists, AI agents
**Confidence**: 100% (production-validated December 2025)
**Content**:
- Three-tier tool security (PUBLIC: 8, AUTHENTICATED: 20, ADMIN: 3)
- Two-layer auth model (method-level + tool-level)
- Step-by-step tool movement procedures
- Security best practices for tool categorization
- Testing and verification procedures
- Recent changes (browser automation tools moved to ADMIN - Dec 9, 2025)

**When to Use**: When modifying tool permissions, conducting security audits, or implementing new MCP tools

**Key Files**:
- `/lib/mcp/server/config/tool-security.js` - Tool category definitions
- `mcp-server-http-clean.js` lines 3065-3074 - Enforcement logic

---

### 6. tool-architecture-reference.md ⭐ NEW

**Type**: Comprehensive tool catalog and architecture guide
**Audience**: Developers, AI agents, architects
**Confidence**: 95% (production-validated January 2026)
**Content**:
- Complete catalog of all 26 MCP tools across functional categories
- File locations for schemas, handlers, and routing
- Handler pattern documentation (Gold Standard pattern)
- Architecture diagrams (definition → security → handler → server layers)
- New tool implementation checklist
- Category-specific documentation (ChatGPT, POV, Task, AI, Prompt, Agent, Browser, Hub tools)

**When to Use**: When adding new tools, understanding tool organization, or finding handler implementations

**Key Files**:
- `/lib/mcp/server/config/tool-schemas.js` - All tool definitions
- `/lib/mcp/server/tools/hub-tools-handler.js` - Hub tool orchestration
- `/lib/mcp/server/tools/hub/*.js` - Individual tool handlers

---

## Key Concepts

### Pagination Metadata

All MCP list tools return `_meta.pagination` with:
- `total`: Total items available
- `returned`: Items in this response
- `hasMore`: More results available?
- `currentPage`, `totalPages`, `nextPage`, `prevPage`

### Completeness Indicators

Text responses include:
- "Found X of Y total" (completeness info)
- "📄 More results available" (when paginated)
- "(complete results)" (when all data returned)

### Name-Based Filtering

All filters support partial, case-insensitive matching:
- `pov_name="Demo"` matches "Demo Retail Solutions"
- `assignee_name="John"` matches "John Smith"
- No ID lookups needed!

### Hierarchical Scoping

**Most efficient → Least efficient**:
1. Task-level (specific ID)
2. POV-level (project scope)
3. Team-level (team scope)
4. Global (all accessible data)

---

## Production Validation

**Sprint 1** (November 2025):
- ✅ 30 pagination tests (all passing)
- ✅ Cross-platform compatibility (ChatGPT, Claude Desktop, Gemini)
- ✅ Type coercion for parameter handling
- ✅ Backward compatible (100%)
- ✅ Zero production bugs

**Confidence**: 95% (production-tested)

---

## Related Specialists

### mcp-integration-specialist
- Uses: implementation-patterns.md, api-reference.md
- Expertise: MCP tool integration, SDK compliance

### chatgpt-connector-specialist
- Uses: implementation-patterns.md, api-reference.md, user-guide.md
- Expertise: OpenAI compatibility, search/fetch tools

### mcp-hub-specialist
- Uses: all documents
- Expertise: Service registry, cross-service orchestration

### anthropic-mcp-sdk-guru-specialist
- Uses: api-reference.md, implementation-patterns.md
- Expertise: SDK architecture, protocol compliance

---

## Migration History

**November 15, 2025**: Initial pagination exposure
- Added pagination metadata to project(action: "task.list"), services(action: "discover"), list_browser_templates
- Created audit_all_tasks prompt
- MetadataEnhancer utility

**November 17, 2025**: Complete pagination rollout
- Extended to project(action: "pov.list"), template(action: "list")
- Added pov_name filtering
- Added POV status filtering
- Type coercion helper created
- 70 total tests

**November 18, 2025**: Documentation migration
- Created domain/mcp/ directory
- Split best-practices.md into implementation-patterns.md + user-guide.md
- Migrated api-reference.md and migration-guide.md
- Created domain README

---

## Future Work

**Potential Enhancements**:
- [x] Add search/fetch patterns for ChatGPT compatibility ✅ (tool-architecture-reference.md)
- [x] Document MCP Hub orchestration patterns ✅ (tool-architecture-reference.md)
- [ ] Add OAuth multi-provider coordination examples
- [ ] Create troubleshooting decision tree

**Knowledge Updates**:
- [x] Document all 35 tools with handlers ✅ (Jan 2026)
- [ ] Update when new MCP tools added
- [ ] Document breaking changes (if any)
- [ ] Add new patterns as discovered

---

**Last Updated**: 2026-01-03
**Status**: ✅ Production-ready
**Referenced By**: 5 specialist agents

**Recent Additions**:
- **January 2026**: Tool architecture reference (35 tools, 8 categories, handler patterns)
- **December 2025**: Tool permission management guide, security architecture documentation

## 🔒 Three-Tier Security Model (Dec 9, 2025)

pAIchart implements consistent 3-tier security for tools and prompts:

**PUBLIC** (Unauthenticated): 8 tools, 3 prompts - OAuth discovery, onboarding
**AUTHENTICATED** (USER/DEMO_USER): 16 tools, all non-admin prompts - Normal operations  
**ADMIN** (ADMIN/SUPER_ADMIN): 7 tools (incl. browser automation), admin-tagged prompts - System admin

**Files**: tool-security.js (tools), prompt-registry.js (prompts)  
**Details**: See `tool-permission-management.md`

