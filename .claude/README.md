# `.claude/` — for Claude Code

**To install, run or operate pAIchart, start at [`docs/README.md`](../docs/README.md).** This directory is not user documentation.

What is here in the public repository:

| Path | What it is |
|---|---|
| `agents/paichart-operator.md` | An agent that runs a program with you: launches it, explains each gate, reads the result, diagnoses a stopped run. |
| `agents/paichart-spec-writer.md` | An agent that works through the spec checklist with you and writes `requirements.md` and `topology.json`. |
| `knowledge/protocols/` | How this code is developed: when a change needs review, how to sweep its blast radius, how to test it. |
| `knowledge/patterns/` | Implementation patterns used in the code; start at `PATTERN-REGISTRY.md`. |
| `knowledge/pipelines/requirements-authoring/DESIGN-DECISION-QUESTIONS.md` | The registry of design questions the spec checklist draws on. The spec coverage check reads it. |
| `skills/requirements-spec/work/` | Test fixtures. Seven test suites read them. |

To use the two agents from any directory: `mkdir -p ~/.claude/agents && cp .claude/agents/paichart-*.md ~/.claude/agents/`.

**The maintainers' repository holds more than this one.** The protocols, the patterns and comments in the code name specialist
agents, discovery prompts, domain notes (other `.claude/knowledge/…` paths) and decision records (`cline_docs/…`) that are not
in this repository. Read such a path as a citation of where something was decided, not as a file to open.

How Claude Code is told to work here: [`CLAUDE.md`](../CLAUDE.md).
