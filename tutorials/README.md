# MCP Tool Excellence

A series of tutorials on building MCP tools that AI clients can reliably call without external documentation.

## Audience

Engineers maintaining or building MCP servers. Each chapter assumes familiarity with the MCP tool definition shape (`name`, `description`, `inputSchema`, handler) and that the reader has shipped at least one MCP tool.

## Chapters

| # | Title | Status | Reading time |
|---|---|---|---|
| 1 | [Tools that teach themselves](01-tools-that-teach-themselves.md) | **Published** | ~10 min |
| 2 | [Ten UX + Three Plumbing Standards](02-the-ten-gold-standards.md) | **Published** | ~20 min |
| 3 | [Smoke tests for MCP tools](03-smoke-tests-as-living-documentation.md) | **Published** | ~12 min |
| 4 | [The silent parameter stripping bug — and the three-layer rule](04-three-layer-parameter-rule.md) | **Published** | ~12 min |
| 5 | [Transport boundaries are where types go to die](05-transport-boundaries.md) | **Published** | ~12 min |
| 6 | [Designing and evolving tools: JSDoc + the 7-layer lifecycle](06-jsdoc-and-seven-layer-lifecycle.md) | **Published** | ~15 min |
| 7 | [Tool consolidation: a case study (28 tools → 10)](07-tool-consolidation-case-study.md) | **Published** | ~13 min |
| 8 | [From single tool to multi-service hub](08-from-tool-to-hub.md) *(optional)* | **Published** | ~13 min |
| 9 | [Hardening MCP tools: when schema definition isn't schema enforcement](09-hardening-mcp-tools.md) | **Published** | ~18 min |

## Reference

| Document | Purpose |
|---|---|
| [Gold Standards Specification](gold-standards-spec.md) | The universal spec for the fourteen standards. Definitions, success criteria, failure modes, grading rubric (A+ through F), self-audit checklist. Use this to grade your own tools or to teach a team the criteria without going through the tutorial chapters. Companion to Chapters 2 and 9; same definitions, reference shape rather than narrative. |

## Reading paths

- **"I have ten minutes"** — Read Chapter 2 only. It carries the highest signal density.
- **"I'm building a tool tomorrow"** — Read Chapter 2 → Chapter 4 → Chapter 6.
- **"I'm about to ship to production"** — Read Chapter 2 → Chapter 9 → Chapter 3. Hardening before smoke before release.
- **"I'm fighting silent failures"** — Chapters 4 and 5 are the bug-class pair; Chapter 9 is the runtime-enforcement counterpart.
- **"I want to redesign my tool surface"** — Chapter 6 (architecture) → Chapter 7 (consolidation case study).
- **"I want to understand the philosophy"** — Read in order.

## Status

All 9 chapters are published. Chapter 1 is the gentle entry point; Chapter 2 is the spine; Chapter 3 is its testable companion; Chapters 4 and 5 cover the two silent-failure bug classes; Chapter 6 is the architectural overview; Chapter 7 is a worked case study of pAIchart's own consolidation; Chapter 8 (optional) covers the transition from a single MCP server to a multi-service hub; Chapter 9 closes the most subtle gap in multi-path MCP servers — schema defined but not runtime-enforced on every entry path.

## Conventions used in this series

- **Tone**: neutral-technical. Code samples are real production code (or close adaptations), not synthetic illustrations.
- **Domain substrate**: code samples use a project-management domain (`pov`, `task`, `project`) as concrete examples. Each chapter includes a "How to read the examples" preamble that explains the translation rule.
- **Standards are observed, not invented**: the patterns in this series are extracted from a 28-tool production audit and a separate cleanup that uncovered cross-layer drift. The contribution is the *curation* — naming the patterns so they can be audited.

## License

Tutorial content (the markdown files in this directory) is published under the Creative Commons Attribution 4.0 International License. See [LICENSE-DOCS](LICENSE-DOCS) for the full notice. Code samples embedded in the chapters fall under the repository's main [LICENSE](../LICENSE).

## About pAIchart

These standards were extracted from pAIchart's own MCP server and remain in continuous use there. pAIchart is an AI-native service-orchestration platform that lets agents discover MCP services by capability, chain multi-service workflows at runtime, and authenticate per-user via JWKS / External OAuth.

- Project: <https://paichart.app>
- Source: <https://github.com/paichart/paichart>
