# Pipeline Harness — Domain Knowledge

> **Current Phase**: 2 (ORCHESTRATE mode) → Phase 4 (pipeline templates) recommended next
> **Harness Prompt Version**: 2.1.0 (self-completion guard)
> **Last Updated**: 2026-04-05
> **Token Budget**: 1M/hr, 10M/day | **MCP Rate Limit**: 300 req/min

The Pipeline Harness is pAIchart's goal-directed autonomous orchestration system. It decomposes objectives into typed specialist tasks, assigns templates, wires dependencies, executes with confidence gating, and chains context automatically.

## Documents

### Core (Read These First)
| Document | Purpose | When to Read |
|----------|---------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it works — execution flow, components, data model, cost | Understanding the system internally |
| [PIPELINE-HARNESS-USER-GUIDE.md](../../pipelines/PIPELINE-HARNESS-USER-GUIDE.md) | How to use it — Options A-D, troubleshooting, perf data | Using the harness, onboarding users |
| [CONTINUATION.md](CONTINUATION.md) | Session state — what's built, tested, and next | Starting a development session |

### Strategy
| Document | Purpose | When to Read |
|----------|---------|-------------|
| [PLATFORM-POSITIONING.md](PLATFORM-POSITIONING.md) | Six capabilities, competitive landscape, proof points | External communication, investor/partner context |
| [VISION.md](VISION.md) | Full vision — Phases 0-8, AGI dimension, big ideas | Planning direction, long-term thinking |

### Phase TODOs (Roadmap)
| Document | Phase | Status |
|----------|-------|--------|
| [TODO-PIPELINE-TEMPLATES.md](TODO-PIPELINE-TEMPLATES.md) | 4 — Reusable pipeline definitions | **Recommended next** |
| [TODO-EVENT-DRIVEN-PIPELINES.md](TODO-EVENT-DRIVEN-PIPELINES.md) | 3 — Auto-execution on precondition | Planned |
| [TODO-CASCADING-PIPELINES.md](TODO-CASCADING-PIPELINES.md) | 5 — Cross-stage automation | After Phase 3 |
| [TODO-POV-EXECUTABLE-PROGRAM.md](TODO-POV-EXECUTABLE-PROGRAM.md) | 6 — Single "execute POV" command | After Phase 3+4+5 |
| [TODO-SELECTIVE-CONTEXT-ACCESS.md](TODO-SELECTIVE-CONTEXT-ACCESS.md) | 7 — Manifest + fetch (token savings) | **Deferred** |
| [TODO-AGENT-TO-AGENT-EVALUATION.md](TODO-AGENT-TO-AGENT-EVALUATION.md) | 8 — Customer AI evaluates via MCP | Vision |

### Outreach & Research
| Document | Purpose |
|----------|---------|
| [GUIDE-OUTREACH-RESEARCH.md](GUIDE-OUTREACH-RESEARCH.md) | Methodology for researching individuals before cold outreach |
| [EMAIL-STANFORD-META-HARNESS.md](EMAIL-STANFORD-META-HARNESS.md) | Yoonho Lee + Omar Khattab (Meta-Harness paper) |
| [EMAIL-CISCO-CHARLES-FLEMING.md](EMAIL-CISCO-CHARLES-FLEMING.md) | Charles Fleming (Cisco Outshift, Omni-SimpleMem paper) |
| [EMAIL-CYBERCX-DIMITRI-VEDENEEV.md](EMAIL-CYBERCX-DIMITRI-VEDENEEV.md) | Dimitri Vedeneev (CyberCX Secure AI Lead) |

## Quick Reference

### Two Modes
- **CREATE**: Empty stage → harness decomposes objective → creates tasks → executes
- **ORCHESTRATE**: Stage has tasks → harness reads them → assigns templates → wires deps → executes

### Template Type Hierarchy (dependency inference)
```
ARCHITECT → BUILDER → REVIEWER → ANALYST → DOCUMENTER
(first)                                      (last)
```

### Key Files (Implementation)
| File | What |
|------|------|
| `scripts/seed-harness-template.ts` | Harness prompt definition (seed to DB) |
| `lib/agents/harness/context-chainer.ts` | Automatic output → input chaining |
| `lib/services/agentExecutionEngine.ts` | Execution engine, polling, watchdog |
| `lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts` | PIPELINE auto-assign, dependency enforcement |
| `lib/mcp/tasks/action/handlers/task/task-update-handler.ts` | Dependency wiring (dependencyIds) |
| `lib/services/llm/types.ts` | Token budget limits (MCPTokenDefaults.BUDGET) |
| `lib/services/llm/tokenManager.ts` | Budget tracking, hourly/daily reset logic |
| `lib/auth/mcp-http-middleware.ts` | MCP rate limit (300 req/min, configurable) |

### Vision Progression
```
Phase 0: Template System (8 types, 16 templates)           ✅
Phase 1: CREATE mode (decompose + execute)                  ✅
Phase 2: ORCHESTRATE mode (read + assign + execute)         ✅
Phase 3: Event-driven pipelines (auto-execution)            TODO spec ready
Phase 4: Pipeline Templates (reusable definitions)          TODO spec ready ← Recommended next
Phase 5: Cascading pipelines (stage→stage automation)       TODO spec ready
Phase 6: POV as executable program                          TODO spec ready
Phase 7: Selective context + cross-pipeline learning        DEFERRED
Phase 8: Agent-to-agent evaluation (customer AI via MCP)    TODO spec ready
```

## Related Documents (Outside This Directory)
- `/.claude/knowledge/domain/PLATFORM-POSITIONING.md` — SE-focused competitive positioning (v1 voice)
- `/.claude/knowledge/patterns/PATTERN-REGISTRY.md` — Patterns #49-52 (harness-related)
- `cline_docs/session-continuation-harness-evolution-2026-04-04.md` — Historical: v1 continuation (superseded)
- `cline_docs/session-continuation-harness-v2-2026-04-04.md` — Historical: v2 continuation (superseded)
