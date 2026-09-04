# Agent Registry

This registry is maintained by discovery-scout when creating new specialist agents.
It ensures no duplicates and tracks all available specialists in the system.

## Active Specialists

| Agent Name | Emoji | Domain | Discovered Insights | Tools | Created | Discovery Prompt |
|------------|-------|--------|---------------------|-------|---------|------------------|
| discovery-scout | 🔍 | System investigation and agent creation | Discovered: Frontend architecture - 313 React components, 1.1GB node_modules, recharts/reactflow heavy dependencies, Bundle optimization targets: Chart.tsx (recharts), GraphView.tsx (reactflow), POVList.tsx (re-render), DataTable.tsx (virtualization), 9 Phase 3 optimization tasks mapped + Oct 27, 2025: Created api-efficiency-specialist capturing POV-scoped activity filtering breakthrough, integrated with comprehensive 583-line discovery prompt, coordinated 6-specialist review achieving 95% confidence, identified phase duplication bug (INITIALIZE_STATE merge vs replace), mapped MCP tools for analytics integration | Read, Grep, Glob, LS, Edit, Write, Bash | Initial | Multiple discovery prompts |
| architectural-review-specialist | 🏗️ | Systematic architectural review, conflict detection, and design decision validation to prevent semantic inconsistencies | Discovered: Plan 11 semantic conflicts (identity-requiring tools in unauthenticated categories), quality gate system with 3 automated scripts, decision framework templates, specialist coordination protocols for complex architectural trade-offs + Oct 27, 2025: Validation fix review - recommended Option A (simple optimistic clearing, 2 lines) over Option C (debounced validation, 15 lines) achieving 95% architectural fit vs 76%, enforced "Simple & Reliable" codebase principle, prevented complexity creep, identified 6-specialist review pattern achieving 90% → 95% confidence jump | Read, Edit, Write, Grep, Glob, Bash | 2025-08-29 | architectural-review-discovery.md |
| auth-permissions-specialist | 🔒 | Authentication and authorization | Discovered: OAuth 2.0 hybrid implementation with Microsoft/Google/GitHub providers, PKCE security, 4-tier fallback (OAuth→JWT→API key→Session), multi-server JWT architecture with Bearer token extraction, database schema with oauth_provider/oauth_id fields, enterprise role mapping. + Found (August 2025): HTTP authentication context flow fixed - initializeAuthContext() on startup, full context passing to all 14+ tool handlers with authenticated flag, inverted auth logic corrected. + Phase 3 (Jan 31, 2026): All 26 tools require authentication (PUBLIC_TOOLS empty), enhanced error messages with multi-method auth guidance + CRITICAL OAuth Deployment (2025-09-20): GitHub secret naming restrictions (GITHUB_CLIENT_ID blocked), build vs runtime environment variables, ENTERPRISE_ROLE_MAPPING export issues, complete OAuth environment requirements for production | Read, Edit, Write, Grep, Glob, Bash | Initial | auth-permissions-discovery.md |
| browser-automation-specialist | 🌐 | On-demand browser automation | - | Read, Edit, Write, Bash, Grep, Glob | Initial | browser-automation-discovery.md |
| mcp-artifacts-specialist | 📄 | Artifact lifecycle management | - | Read, Edit, Write, Bash, Grep, Glob, LS | Initial | artifacts-system-discovery.md |
| mcp-hub-specialist | 🌟 | MCP Hub service registry, cross-service orchestration, and AI service ecosystem management | Discovered: OAuth 2.0 enterprise authentication with Microsoft/Google/GitHub providers, dual HTTP transport (SSE + Streamable HTTP) for universal client support, 10 consolidated tools (Phase 3), Parameter Normalizer integration, 4+ production services including Sentry MCP, clean server architecture preventing resource validation loops, 100% Anthropic Directory compliance achieved, Gold Standard A grade for registry(action: 'list'), workflow orchestration tools | Read, Edit, Write, Grep, Glob, Bash | 2025-08-17 | mcp-hub-discovery.md |
| parameter-normalizer-specialist | 🔀 | Parameter transformation, session context management, Claude Desktop compatibility | Discovered: Dual-layer system (normalization + intelligence), shared instance architecture, session context persistence, 881-line restoration from git history, snake_case to camelCase mapping, value normalization (urgent → HIGH), context tracking across tool calls | Read, Edit, Write, Grep, Glob, Bash | 2025-08-27 | parameter-normalizer-discovery.md |
| mcp-integration-specialist | 🔌 | MCP tool integration | Discovered: Dual-server architecture (embedded + v5), 2 external servers (claude-code, browser-use), unified tool registry with metadata tracking, static tool fallback system replacing direct executor + Plan 11B: Updated tool security boundaries with 17 public tools for unauthenticated access, 8 auth-required tools, dynamic filtering implementation, enhanced error messages with multi-method authentication guidance | Read, Edit, Write, Bash, Grep | Initial | mcp-integration-discovery.md |
| mcp-protocol-debug-specialist | 🐛 | MCP protocol debugging | - | Read, Edit, Write, Bash, Grep, Glob | Initial | mcp-protocol-debug-discovery.md |
| performance-analyst-specialist | 📊 | Performance optimization, caching strategy, React Query configuration | Discovered (Oct 27, 2025): Analytics caching optimization - validated React Query staleTime (60s optimal for analytics), identified Array.includes() O(n) → Set.has() O(1) performance improvement (2-5ms gain on large POVs), recommended parallel API execution (3 calls @ ~500ms vs 1500ms sequential), verified zero overhead when component unmounted, 98% confidence on analytics performance architecture, cache hit rate projections (80-90% with proper staleTime) | Read, Grep, Bash, Glob | Initial | performance-analyst-discovery.md |
| phase-stage-specialist | 📈 | Phase and stage lifecycle, event-driven cache invalidation, workflow integration | Discovered: Task order field bug - frontend normalization fallback (task.order || 0) overwrites proper 1000-increment pattern, POV save handler correctly includes order field, but frontend calculation overrides it with 0, backend ordering logic correct (createTask: maxOrder+1000, reorder: (index+1)*1000) + Oct 27, 2025: Analytics review - identified Phase.status field doesn't exist in Prisma (only Phase.type PLANNING/EXECUTION/REVIEW), prevented runtime errors, recommended event-driven cache invalidation for real-time analytics (<1s updates vs 60s stale cache), identified stage-level analytics gap (stages have status field but not displayed), 92% confidence on workflow integration + Oct 30, 2025: Complete route architecture discovery - 15 endpoints mapped (7 phase, 8 stage), POV-scoped pattern confirmed (/api/pov/[povId]/phase/[phaseId]/stage/...), validatePOVAccess security pattern in 15/15 routes, smart ordering capabilities discovered (afterStage, beforeStage, position, atomic transactions), query param anti-pattern identified (stage UPDATE/DELETE use ?stageId vs path params), PhaseService with 14 methods (6 phase, 6 stage, 2 task operations), stage validation caching (<75ms target), logical phase sorting (PLANNING→EXECUTION→REVIEW), MCP handleStageCreate integration, event emission for real-time updates, all CRUD operations exist (no blockers for Week 4), P1 refactoring recommended for RESTful compliance. Week 4 implementation (10.7h): Atomic transactions with FOR UPDATE NOWAIT deployed (prevents race conditions in order calculation), PhaseStageEventEmitter integrated (100% coverage, 12 endpoints), 3-tier rate limiting (300/hr mutation, 50/hr reorder), audit logging to admin/audit page, phase.status→phase.type Prisma fix applied. 96% confidence achieved | Read, Edit, Write, Grep, Glob, Bash | 2025-01-12 | phase-stage-discovery.md |
| prompt-construction-specialist | ✍️ | Agent prompt engineering | Discovered: Database prompt execution issue - async getPrompt() called synchronously, missing await in test scripts, MCP server loads 19 prompts (10 built-in + 9 database), /prompt command system fully functional after async fix | Read, Edit, Write, Grep, Glob, Bash | 2025-08-20 | prompt-construction-discovery.md |
| resource-manager-specialist | 📦 | Resource management | - | Read, Edit, Grep, Glob, Bash | Initial | resource-manager-discovery.md |
| system-reviewer-specialist | 🔍 | System health and review | Discovered: 3 moderate security vulnerabilities, 96 direct + 21 dev dependencies (778 node_modules), 176 API routes (0 PATCH), 43 models with 62 relations, 4 TypeScript errors, 388 TODO items, no CI/CD setup, 30 discovery prompts, strict mode enabled, large files (1.8MB+ resource manager) | Read, Grep, Glob, LS | Initial | system-reviewer-discovery.md |
| task-dependency-specialist | 🔗 | Dependency graph management | - | Read, Edit, Write, Grep, Glob, Bash | Initial | task-dependency-discovery.md |
| task-services-specialist | ⚙️ | Triple-layer task architecture | - | Read, Edit, Write, Grep, Glob, Bash | Initial | task-services-discovery.md |
| template-system-specialist | 📋 | Agent template system | Week 5 discovery (Oct 30): Mapped 3 distinct template systems - POV Templates (/api/pov-templates, 5 endpoints, admin-only, LOW risk), Phase Templates (/api/phase-templates, 9 endpoints, workflow JSON, MEDIUM risk), Agent Templates (/api/agent-templates, 11 endpoints, variable injection {{variableName}}, CRITICAL risk CVSS 9.8). Week 5 scope corrected from POV→Agent due to 6 P0 vulnerabilities. Variable system uses direct string replacement (unsafe before fix). Agent Templates secured with prompt injection prevention library (25+ patterns). Discovery prevented 10+ hours waste on wrong system | Read, Edit, Write, Grep, Glob | Initial | template-system-discovery.md |
| token-optimizer-specialist | 💰 | Token usage optimization | - | Read, Edit, Grep, Glob | Initial | token-optimizer-discovery.md |
| trouble-shooting-specialist | 🛠️ | Debugging and diagnostics | - | Read, Bash, Grep, Glob | Initial | trouble-shooting-discovery.md |
| types-system-specialist | 🏷️ | Type system, Prisma schema, Zod validation, TypeScript type safety | Discovered (Oct 27, 2025): Analytics schema validation - found AgentExecution Zod schema mismatch (expected 8 task fields, API returns 4), 100% validation failure prevented. Identified Date type handling gaps (z.string() vs Date objects requiring z.union), nullable vs optional pattern verification (user.nullable() correct for API nulls), enum constraint gaps (recommendation.type as string should be enum). Verified POV form countryId field as required in Prisma (NOT NULL) vs optional in EditorState (type mismatch), 92% confidence on schema correctness, prevented runtime crashes from type mismatches + Week 4 (Oct 30): Phase.status→Phase.type Prisma alignment - Phase model has 'type' field (PhaseType enum), not 'status'. Fixed in PhaseStageEventEmitter.emitPhaseEvent() and UI component. Created /lib/types/stage.ts for API layer consistency (matching Phase DTO pattern). Removed duplicate StageStatus enum in phase-templates/types.ts (now imports from @prisma/client for type safety). Verified no Prisma schema changes needed (Phase/Stage models production-ready) | Read, Grep, Glob, Edit | Initial | types-system-discovery.md |
| database-manager-specialist | 🗄️ | Database management, Prisma schema, migrations, query optimization | Discovered: 43+ models, 179 direct usage points, complex transaction patterns, enhanced pgbouncer pooling | Read, Edit, Write, Grep, Glob, Bash | 2025-01-10 | database-management-discovery.md |
| sec-ops-specialist | 🔐 | Comprehensive security expert managing authentication, authorization, security vulnerabilities, and security best practices | Discovered: JWT HS256 implementation with 2029 usages, RBAC with 2994 references, 5 unprotected API routes, 11 env bypass patterns, comprehensive audit system, 6538 Zod validations. Phase 2 Analysis: CRITICAL WebSocket vulnerabilities - 0 security controls, token encryption needed, blacklist system required + Week 5 (Oct 30): Prompt injection prevention library - 25+ attack patterns (INSTRUCTION_OVERRIDE, ROLE_SWITCHING, JAILBREAK, SYSTEM_MANIPULATION), multi-layer security (detection→sanitization→validation→audit), fixed CVSS 9.8/9.1 vulnerabilities (no auth on /apply, no injection prevention). Pattern: applyTemplateSafe() with strictMode, detectPromptInjection() with 0-100 risk scoring, ADMIN-ONLY authorization for template mutations. File: /lib/security/prompt-injection-prevention.ts (807 lines), integrated in AgentTemplateService | Read, Edit, Write, Grep, Glob, Bash | 2025-01-10 | security-discovery.md |
| integration-manager-specialist | 🔄 | External service integrations, API clients, real-time communication, CRM systems, webhooks, and cross-system communication patterns | Discovered: CRM sync with auto-retry (3 attempts, 30min intervals), WebSocket JWT auth, MCP SDK integration, workflow engine with browser automation, rate limiting (5x LLM, 3x MCP, 2x templates), 67+ integration files | Read, Edit, Write, Grep, Glob, Bash | 2025-01-10 | integration-discovery.md |
| validation-engine-specialist | 🧪 | Comprehensive validation expert managing multi-layer schema validation, form validation, API validation, and database constraints | Discovered: 776+ Zod usages across 50+ files, dual AJV template systems, 15+ React Hook Form integrations, 217+ database constraints, BaseValidator pattern, multi-step validation with cross-field dependencies, complex template validation with circular dependency detection + Oct 27, 2025: POV form validation fix - identified 13 validation path mismatches (entities.phases vs phases), recommended Option A (optimistic clearing) with 94% confidence, created client-side response validation pattern for analytics APIs, error message sanitization requirements, 97% confidence on validation architecture after revisions + Week 5 (Oct 30): Zod schemas with integrated injection detection - VariableValueSchema with detectPromptInjection() in .refine() validators, 7 schemas created (ApplyTemplateRequestSchema with cross-field validation, CreateAgentTemplateSchema with placeholder-variable consistency), variable limits (2000 chars, 100 vars max), combined risk score checks. Pattern: BaseSchema→.refine()→CreateSchema pattern for complex cross-validation. File: /lib/validation/agent-template-validation.ts (400+ lines) | Read, Edit, Write, Grep, Glob, Bash | 2025-01-10 | validation-discovery.md |
| dev-ops-specialist | 🚀 | Expert in multi-server deployment architecture, production readiness, environment configuration, and deployment strategies | Discovered: 3-server architecture (HTTP/WebSocket/MCP), 57 deployment-related files, 394 production code references, 19 critical env vars, complex initialization sequence, graceful shutdown with SIGINT/SIGTERM handlers, embedded MCP server registration, pgbouncer pooling strategy + CRITICAL GitHub Actions Deployment (2025-09-20): YAML syntax issues with nested heredocs in SSH blocks, variable escaping patterns (\$ vs $), GitHub secret naming restrictions, PM2 --update-env flag requirements, production git stash/pull operations, directory structure patterns | Read, Edit, Write, Grep, Glob, Bash | 2025-01-10 | deployment-discovery.md |
| mcp-session-consistency-specialist | 🚦 | MCP server session management, prompt persistence, and execution consistency across different connection types for the chameleon platform | - | Read, Edit, Write, Grep, Glob, Bash | 2025-08-20 | mcp-session-consistency-discovery.md |
| event-system-specialist | ⚡ | Event-driven architecture management, PostgreSQL NOTIFY/LISTEN patterns, connection pooling optimization | Discovered: Revolutionary 90% database load reduction via event-driven architecture, 67% connection reduction through unified connection pooling, 4 active event systems (execution, phase-stage, prompt-registry, security), shared connection pool eliminating resource exhaustion, base class standardization preventing pattern inconsistencies, 761+ event references across codebase | Read, Edit, Write, Grep, Glob, Bash | 2025-08-22 | event-system-discovery.md |
| anthropic-mcp-sdk-guru-specialist | 🧠 | Elite MCP SDK implementation expert with definitive knowledge of Anthropic's official patterns, SDK architecture, transport protocols, and production deployment strategies | - | Read, Edit, Write, Grep, Glob, Bash | 2025-09-09 | anthropic-mcp-sdk-discovery.md |
| chatgpt-connector-specialist | 🤖 | OpenAI MCP connector compatibility expert specializing in search and fetch tools for ChatGPT integration with pAIchart resources | Discovered: 765-line connector implementation with direct JSON response format compliance, PostgreSQL GIN indices for 10-50x search performance, PUBLIC_TOOLS security configuration, cross-platform AI compatibility (ChatGPT, Claude, Gemini), response format validation 100% OpenAI spec compliant, full-text search optimization with tsvector patterns | Read, Edit, Write, Grep, Glob, Bash | 2025-09-25 | chatgpt-connector-discovery.md |
| oauth-multi-client-specialist | 🔐 | Multi-client OAuth coordination, provider-specific patterns (GitHub, Microsoft, Google), stateless vs stateful token management, cross-client authentication flows for AI platforms (Claude Desktop, ChatGPT, Gemini) | - | Read, Edit, Write, Grep, Glob, Bash | 2025-10-13 | oauth-multi-client-discovery.md |
| metadata-tenant-preservation-specialist | 🏛️ | Metadata preservation across multi-tenant boundaries using 7-layer architecture and validatePOVAccess integration patterns | Discovered: 7-layer preservation architecture (Database retrieval → Access validation → Merge strategy → Prisma update → API response → API client → Frontend normalization), hybrid multi-tenant strategy (row-level userId/teamId + metadata flags like isDemo), 8 common pitfalls documented with solutions, pizza test pattern for validation (create → update → verify), successful isDemo preservation fixes in commits 647fb35, 873274f, 9e20d47, b0ebb65, a282a77 | Read, Edit, Write, Grep, Glob, Bash | 2025-10-18 | metadata-tenant-preservation-discovery.md |
| oauth-multi-provider-specialist | 🔑 | OAuth 2.0 multi-provider expertise with first-party token minting, provider-specific integrations (GitHub, Microsoft, Google), RFC 8707 resource parameters, JWT/JWKS infrastructure, and MCP OAuth for AI clients | Discovered (2025-10-19): 10+ hours ChatGPT Microsoft OAuth breakthrough - first-party token minting with exact scope string-for-string matching, azp claim binding, RFC 8707 resource parameter support, JWKS/JWT infrastructure complete. Critical patterns: GitHub passthrough vs Microsoft/Google first-party tokens, scope capture by state, provider-specific quirks (GitHub special case), token lifecycle 900s TTL. Implemented: mintMcpToken function, RS256 JWT signing, public key JWKS distribution, protected resource metadata, OAuth discovery with jwks_uri. References: /mcp-server-http-clean.js (lines 804-841 token minting, 1409-1439 JWKS, 1067-1087 token exchange, 535-576 validation), chatgpt-oauth-final-status-report.md (9+ hours testing), oauth-architecture-clarification.md (dual OAuth systems) | Read, Edit, Write, Grep, Glob, Bash | 2025-10-19 | oauth-multi-provider-discovery.md |
| api-efficiency-specialist | 🚀 | API design, RESTful patterns, query optimization, and efficient data access strategies with focus on query scoping (POV/team/user), response optimization, N+1 prevention, and backward compatibility | Discovered (2025-10-28): POV-scoped activity filtering breakthrough (Oct 27, 2025) - 5-line backend change achieving 50-90% data reduction, scaling from 1 to 10,000 POVs. Pattern: Optional povId parameter for backward compatibility, server-side WHERE clause filtering, guaranteed relevant results vs random client-side filtering. Key patterns documented: POV-scoping (optional scope parameters), backward compatibility (? for new parameters), batch queries (WHERE IN vs N+1), index verification (every filter needs index). Applied to Analytics activity feed: GET /api/tasks/activities?povId={id}&dateRange=90d&limit=10. Test verified (Oct 28): /api/tasks endpoint is gold standard with 7-batch N+1 prevention, name-based lookups, complete index coverage + Week 4-5 (Oct 30): Response optimization via expand parameter - 90% bandwidth reduction (50KB→5KB default, ?expand=true for full), 50% query reduction via HTTP cache headers (max-age=30, stale-while-revalidate=300), N+1 prevention via includeStages parameter (2 requests→1). Applied to 3 Phase/Stage GET endpoints. Pattern files: /app/api/pov/[povId]/phases/route.ts, /app/api/pov/[povId]/phase/[phaseId]/route.ts | Read, Edit, Write, Grep, Glob, Bash | 2025-10-28 | api-efficiency-discovery.md |
| boundary-contract-specialist | 🔗 | Data completeness validation across system boundaries to prevent field leakage bugs (JWT ↔ User, MCP ↔ API, DB ↔ Code boundaries) | Discovered (Oct 27, 2025): Analytics API response validation - identified null safety gaps (performer.user can be null for deleted users, task.task can be null, averageWorkload can be null), client-side filtering boundary risk (exec.taskId without null checks), recommended Zod .nullable() pattern for deleted entity handling. Applied 5-minute comparative analysis protocol to analytics schemas, found 3 critical type guard gaps, 4 missing null checks. Recommended client-side Zod validation as defensive programming layer (validates API responses in browser), error message sanitization (prevent technical detail leakage), 95% confidence after null safety fixes applied | Read, Edit, Write, Grep, Glob, Bash | 2025-10-21 | boundary-contract-discovery.md |
| multi-tenancy-specialist | 🏢 | Multi-tenant architecture, POV isolation, tenant-scoped queries, validatePOVAccess integration, domain-based OAuth tenant assignment | Discovered (Oct 28, 2025): Task model tenant isolation audit - CRITICAL security vulnerability detected (8.2/10 risk score): Task model completely lacks tenantId column (not JSON, not column), related models (Comment, Attachment, TaskActivity) also unprotected, cross-tenant data leak vulnerability if task IDs enumerated. Found prerequisite chain: User.tenantId → POV.tenantId → Task.tenantId implementation order required. Multi-Tenant v4.0 plan exists (23-hour implementation) but NOT IMPLEMENTED. Identified 5-model isolation pattern (User/POV/Task/Phase/Stage), domain-based tenant derivation from organizationDomain (GitHub/Microsoft/Google OAuth), validatePOVAccess exists but checks metadata.tenantId (JSON) not column-based tenantId. 85% confidence on v4.0 implementation path with 3 prerequisite phases | Read, Edit, Write, Grep, Glob, Bash | 2025-10-28 | multi-tenant-discovery.md (to be created) |
| workflow-orchestration-specialist | 🎯 | High-level workflow coordination that achieves goals from minimal input through systematic discovery, analysis, and scope reduction | Discovered (Nov 15, 2025): Meta-pattern extraction from successful session achieving 15x ROI through systematic scope reduction (11 features → 4 essential, 368 hours → 43 hours). Implements autonomous-goal-execution-protocol with proven patterns: leverage existing over build new, parallel reviews prevent groupthink, root cause fixes scale better, evidence beats speculation, scope reduction multiplies ROI. Signature capability: finding 20% of work delivering 80% of value through intelligent orchestration, ROI calculation framework, and adaptive decision making | Read, Edit, Write, Grep, Glob, Bash | 2025-11-15 | autonomous-goal-execution-protocol.md |
| frontend-provocateur-specialist | 🎨 | Opinionated UI/UX design specialist who challenges generic patterns and pushes for fresh, memorable interfaces inspired by sources beyond typical tech design | - | Read, Edit, Write, Grep, Glob, Bash, Browser Tools | 2025-12-24 | frontend-design-discovery.md |
| agent-execution-specialist | 🔥 | Agent execution engine, transaction atomicity patterns, SSE streaming architecture, execution lifecycle, LLM integration | Discovered: 1465-line EventEmitter engine with 3 $transaction blocks, dual execution paths (fire-and-forget + SSE streaming), 10 SSE event types, 3 error paths with atomic consistency, updateExecutionStatus cannot accept tx parameter (must inline), nested setTimeout TODO for BullMQ, SSE-after-commit pattern, log optimization (9 writes -> 1 checkpoint), 7920 total lines across 11 domain files | Read, Edit, Write, Grep, Glob, Bash | 2026-02-20 | agent-execution-discovery.md |
| mcp-tool-architecture-specialist | 🔧 | MCP tool registration, schema systems, dispatcher architecture, consolidation mapping, internal-vs-external name boundary | Discovered (2026-03-07): Two-tier schema system (CONSOLIDATED_SCHEMAS + TOOL_SCHEMAS), 4 dispatchers + direct perform binding, LEGACY_TOOL_MAP sync across 3 locations, 14->5 consolidation mapping, internal-vs-external name boundary rules, getToolCapabilities() bug (only iterated TOOL_SCHEMAS), agentExecutionEngine hub guidance regression (checked legacy name), 349 legacy refs triaged (6 user-facing fixed, rest internal/expected) | Read, Edit, Write, Grep, Glob, Bash | 2026-03-07 | tool-architecture-discovery.md |
| pipeline-harness-specialist | 🧬 | Coordinating specialist for the Pipeline Harness subsystem (Layer 2 of autonomous-delivery stack) — three-mode execution model (CREATE/ORCHESTRATE/SYNTHESIZE), template+protocol split, metadata-based child-stage linkage, reactor integration, anti-fabrication three-layer defense | Shipped (2026-04-14): End-to-end inner loop validated — harness COMPLETED with confidence 84/100, 4 specialists executed in dependency order, all reactors fired, no manual nudges. Two reactors deployed (pipelineRetriggerReactorService + taskReadyReactorService). 5 reactor call sites wired. Handler 3-point invariant gates completion in both task-complete and task-update paths. Engine + stream route both skip status=COMPLETED for PIPELINE type. stream-route MAX_TOOL_TURNS fix (commit e008aba2) unblocked 100-turn harness budget. Unique child-stage naming (timestamped) prevents cross-run collisions. Three modes auto-detected from metadata.pipelineStageId + child-stage state | Read, Edit, Write, Grep, Glob, Bash | 2026-04-15 | pipeline-harness-discovery.md |

## Emoji Registry (Used)
- 🔍 - discovery-scout, system-reviewer-specialist (duplicate - should be fixed)
- 🏗️ - architectural-review-specialist
- 🔒 - auth-permissions-specialist
- 🌐 - browser-automation-specialist
- 📄 - mcp-artifacts-specialist
- 🔌 - mcp-integration-specialist
- 🐛 - mcp-protocol-debug-specialist
- 📊 - performance-analyst-specialist
- 📈 - phase-stage-specialist
- ✏️ - prompt-construction-specialist
- 📦 - resource-manager-specialist
- 🔗 - task-dependency-specialist, boundary-contract-specialist (shared - both about connections/contracts)
- ⚙️ - task-services-specialist
- 📋 - template-system-specialist
- 💰 - token-optimizer-specialist
- 🛠️ - trouble-shooting-specialist
- 🏷️ - types-system-specialist
- 🗄️ - database-manager-specialist
- 🔐 - sec-ops-specialist, oauth-multi-client-specialist (shared - both security-related)
- 🔄 - integration-manager-specialist
- 🧪 - validation-engine-specialist
- 🚦 - mcp-session-consistency-specialist
- ⚡ - event-system-specialist
- 🌟 - mcp-hub-specialist
- 🔀 - parameter-normalizer-specialist
- 🧠 - anthropic-mcp-sdk-guru-specialist
- 🤖 - chatgpt-connector-specialist
- 🏛️ - metadata-tenant-preservation-specialist
- 🔑 - oauth-multi-provider-specialist
- 🚀 - api-efficiency-specialist
- 🏢 - multi-tenancy-specialist
- 🎯 - workflow-orchestration-specialist
- 🧬 - pipeline-harness-specialist
- 🎨 - frontend-provocateur-specialist
- 🔥 - agent-execution-specialist

- 🔧 - mcp-tool-architecture-specialist

## Available Emojis (Suggested)
- 💡 - For innovation/ideas specialists
- 📐 - For architecture specialists
- 📡 - For API/communication specialists
- 📝 - For documentation specialists
- 🌍 - For localization/global specialists

## Naming Conventions
1. Always use format: `[domain]-specialist.md`
2. Domain should be lowercase with hyphens
3. Must end with `-specialist.md`
4. Discovery prompt should match: `[domain]-discovery.md`

## Update Instructions

### When Creating New Agent
Discovery-scout should:
1. Add entry to Active Specialists table
2. Mark emoji as used in Emoji Registry
3. Update CLAUDE.md with new agent
4. Update this file's Last Updated timestamp

### When Running Discovery for Existing Agent
Discovery-scout should:
1. Run the specialist's discovery prompt
2. Synthesize key findings and insights
3. Update the "Discovered Insights" column with new findings
4. Append to existing insights (don't replace)
5. Update Last Updated timestamp

### Format for Discovered Insights
- Keep concise but informative
- Use format: `[existing] + Found: [new insight]`
- Include critical bugs, patterns, metrics
- Example: `+ Found: 47 files, cache bug line 234, EventEmitter pattern`

Last Updated: 2026-02-20 - Agent Execution Specialist Created:

**New Specialists Created** (1):
1. agent-execution-specialist (🔥) - Expert in EventEmitter-based execution engine, transaction atomicity patterns (#37), SSE streaming architecture with 10 event types, dual execution paths (fire-and-forget + streaming), LLM service integration, and execution lifecycle management. Covers 7920 lines across 11 files. Key knowledge: updateExecutionStatus cannot accept tx parameter, SSE-after-commit pattern, log optimization (9 writes -> 1 checkpoint), nested setTimeout TODO for BullMQ migration.

Previous Update: 2025-12-24 - Frontend Provocateur Specialist Created:

**New Specialists Created** (1):
1. frontend-provocateur-specialist (🎨) - Opinionated UI/UX design expert who challenges generic B2B SaaS patterns with references from magazine layouts, brutalist architecture, Swiss poster design, Teenage Engineering, Bloomberg Terminal density, and other non-tech sources. Asks uncomfortable questions ("Why is this a card grid at all?"), uses "fresh" as north star, actively avoids homogenized shadcn/Tailwind defaults, includes browser tool access for UI analysis.

**Previous Update (2025-10-31)** - POV Team Management Discovery:

**New Specialists Created** (1):
1. team-management-specialist (👥) - POV team lifecycle management, Week 6 scope validation

**Previous Update (2025-10-28)** - Major registry update incorporating October 27-28, 2025 session learnings:

**New Specialists Created** (2):
1. api-efficiency-specialist (🚀) - API design, query optimization, POV-scoping patterns
2. multi-tenancy-specialist (🏢) - Multi-tenant architecture, tenant isolation, validatePOVAccess integration

**Specialists Updated** (7 with Oct 27-28 achievements):
- discovery-scout: Created api-efficiency-specialist, coordinated 6-specialist review
- architectural-review-specialist: Validation fix review (Option A vs C), 95% architectural fit
- performance-analyst-specialist: React Query optimization, Array→Set performance gain
- phase-stage-specialist: Phase.status field detection, event-driven cache invalidation
- types-system-specialist: AgentExecution schema mismatch (8 fields vs 4), Date type handling
- validation-engine-specialist: 13 validation path fixes, client-side response validation pattern
- api-efficiency-specialist: Test verified /api/tasks as gold standard (7-batch N+1 prevention)

**New Entry** (previously missing):
- boundary-contract-specialist (🔗) - Added with Oct 27 analytics validation findings

**Session Achievements**:
- POV-scoped activity filtering breakthrough (50-90% data reduction)
- 6-specialist review pattern (90% → 95% confidence)
- Comprehensive analytics implementation (5 widget rows, 3 APIs integrated)
- 11 commits, 3 critical bugs fixed, 2 major features delivered
- 6,500+ lines of documentation created
- Multi-tenant v4.0 security gap identified (23-hour remediation path documented)