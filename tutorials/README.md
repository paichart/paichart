# MCP Tool Excellence

A series of tutorials on building MCP tools that AI clients can reliably call without external documentation.

## Audience

Engineers maintaining or building MCP servers. Each chapter assumes familiarity with the MCP tool definition shape (`name`, `description`, `inputSchema`, handler) and that the reader has shipped at least one MCP tool.

## Chapters

| # | Title | Status | Reading time |
|---|---|---|---|
| 1 | Tools that teach themselves | Planned | ~10 min |
| 2 | [Ten UX + Three Plumbing Standards](02-the-ten-gold-standards.md) | **Published** | ~20 min |
| 3 | [Smoke tests for MCP tools](03-smoke-tests-as-living-documentation.md) | **Published** | ~12 min |
| 4 | The silent parameter stripping bug — and the three-layer rule | Planned | ~10 min |
| 5 | Transport boundaries are where types go to die | Planned | ~12 min |
| 6 | Designing and evolving tools: JSDoc + the 7-layer lifecycle | Planned | ~15 min |
| 7 | From single tool to multi-service hub *(optional)* | Planned | ~15 min |

## Reading paths

- **"I have ten minutes"** — Read Chapter 2 only. It carries the highest signal density.
- **"I'm building a tool tomorrow"** — Read Chapter 2 → Chapter 4 → Chapter 6.
- **"I want to understand the philosophy"** — Read in order.

## Status

Chapters 2 and 3 are published. Chapter 2 is the spine of the series; Chapter 3 is its testable companion. Remaining chapters are in drafting; this README will be updated as each lands.

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
