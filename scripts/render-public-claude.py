#!/usr/bin/env python3
"""
render-public-claude — generate CLAUDE.public.md (exported as CLAUDE.md) from the private CLAUDE.md.
Section ALLOWLIST: the operating protocols, agent map, dev commands and architecture cross; the two
sections that are production procedure (SSH, psql, deploy runbooks, scheduled health-runs) do not.
Then line-level scrubs for anything prod-specific, and a check that every `.claude/…` path it cites
survives the export rules. Regenerate after editing CLAUDE.md; never hand-edit the output.
"""
import re, subprocess, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'CLAUDE.md'), encoding='utf-8').read()
parts = re.split(r'(?m)^(?=## )', src); head, secs = parts[0], parts[1:]
# 2026-11-13 (owner, docs homologation group 5): the public repository ships user agents only and, of `.claude/knowledge`,
# only `protocols/` and `patterns/`. So the public CLAUDE.md is a SHORT self-hoster file: a static head (below), then the three
# sections that describe the code itself. The specialist-agent map, the discovery-first workflow and the per-protocol sections no
# longer cross: they name agents and discovery prompts the public repository does not have.
KEEP = ['## Development Commands', '## Architecture Overview']
# Protocol 5 (forensic investigation) is a production-log runbook — dropped with its section.
kept = [s for s in secs if any(s.startswith(k) for k in KEEP)]
assert head.startswith('# CLAUDE.md\n'), 'the title line moved — update render-public-claude.py'
out = '# CLAUDE.md\n' + ''.join(kept)   # the private head (version table, agent quick-reference) does not cross
# sub-sections that only make sense with the maintainers' guides or agents
out = re.sub(r'(?ms)^### Geographical Data Management\n.*?(?=^### )', '', out)
out = re.sub(r'(?m)^\*\*Discovery-Based Documentation\*\*.*\n?', '', out)
out = re.sub(r'(?ms)^\*\*Quarterly Security Audit\*\*.*?^```[a-z]*\n.*?^```\n', '', out)
out = re.sub(r'(?m)^.*(137\.184\.247\.110|ssh root@|psql "\$DATABASE_URL"|BASE_URL=https://paichart\.app|PAICHART_MONITOR_TOKEN|cline_docs|smoke-tests|phase-3-jwt-deployment-readiness|knowledge/frameworks|knowledge/prompts/|knowledge/templates/|knowledge/TODO).*\n', '', out)  # private paths (Steve, 2026-09-06)
out = re.sub(r'(?m)^\| 5\. Forensic Investigation \|.*\n', '', out)   # summary-table row for the dropped protocol
out = out.replace('**Protocols**: `/.claude/knowledge/protocols/`', '**Protocols**: `/.claude/knowledge/protocols/`')
# Public wording that must survive every regeneration (2026-11-12: the attribution line was hand-edited in the output and the next
# regeneration put the owner's name back; 2026-11-13: the fresh-install reader found this file steering an assistant that was only
# following docs/INSTALL.md into discovery agents and reviews).
PREAMBLE = ("""> **Installing or running pAIchart? Start at [`docs/README.md`](docs/README.md)** ([`docs/INSTALL.md`](docs/INSTALL.md), then
> [`docs/FIRST-RUN.md`](docs/FIRST-RUN.md)). If you were asked to follow one of those guides, follow it exactly as written.

## Working in this repository (for Claude Code)

- **Helping someone run pAIchart.** Two agents are in `.claude/agents/`: `paichart-operator` (launch a program, explain each gate,
  read a result, diagnose a stopped run) and `paichart-spec-writer` (write `requirements.md` and `topology.json` for a change).
  The documents they work from are in `docs/`. Never release an approval gate the person has not approved, and never start
  something that spends their Anthropic credit without saying so first.
- **Use the pAIchart tools first, not the database.** The hub's MCP tools (`project`, `perform`, `template`, `services`,
  `registry`, `search`, `fetch`, `analytics`, `list_prompts`, `prompt_command`) are how you read and change projects, tasks,
  runs, artifacts and workflows. In Claude Code they may be loaded on demand: look each one up by name before concluding it
  is missing, and call `registry(action: 'list')` to see which hub you are on and as whom. Do not query PostgreSQL (`psql`,
  a Prisma script) to answer something a tool can answer, and never write to the database directly: a direct write skips the
  access checks, the audit record and the events that keep a run moving. Read the database only when a guide gives that exact
  command, when the person asks for it, or when the hub is down and you are finding out why. If the tools are not available,
  say so and reconnect (`/mcp`) before reaching for the database.
- **Changing the code.** The maintainers' method is in `.claude/knowledge/protocols/` (when a change needs review, how to sweep
  its blast radius, how to test it) and `.claude/knowledge/patterns/` (start at `PATTERN-REGISTRY.md`). Those documents name
  specialist agents, discovery prompts and records (`cline_docs/…`, other `.claude/knowledge/…` paths) that live in the
  maintainers' private repository. Treat such a reference as unavailable, not as an error, and do not try to recreate it.
- **Before proposing a change:** `npm run lint`, then `npm run test:all-validation`.
- **Commits** are authored solely by the repository owner (the person whose git identity makes the commit). Never add a
  Claude or AI co-author trailer or a "Generated with" line.

""")
# lines that cite a part of the maintainers' repository the public one does not have
out = re.sub(r'(?m)^.*\.claude/(agents/(?!paichart-)|knowledge/(discoveries|domain|guides|toolkits|pipelines|workflows|frameworks)).*\n', '', out)
assert out.count('# CLAUDE.md\n') == 1, 'the title line moved — update render-public-claude.py'
out = out.replace('# CLAUDE.md\n', '# CLAUDE.md\n\n' + PREAMBLE, 1)
banner = ('<!-- PUBLIC VARIANT — generated by scripts/render-public-claude.py from the private CLAUDE.md by section\n'
          '     allowlist, with a static head for self-hosters. The private one carries production procedures and the\n'
          '     maintainers\' agent system, which never cross. Regenerate after editing CLAUDE.md; do not hand-edit this file. -->\n')
open(os.path.join(ROOT, 'CLAUDE.public.md'), 'w', encoding='utf-8').write(banner + out)
# every cited .claude path must survive the export rules
rules = subprocess.run([sys.executable, '-c', '''
import sys; sys.path.insert(0, "scripts"); import importlib.util
spec = importlib.util.spec_from_file_location("x", "scripts/export-public.py"); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
rules = m.load_rules(); wired = set()
import re
cited = sorted(set(p.strip("`/") for p in re.findall(r"`/?\\.claude/[A-Za-z0-9_./-]+`", open("CLAUDE.public.md").read())))
import os
for p in cited:
    if os.path.isdir(p):
        # a directory citation is satisfied if ANY file beneath it (any depth) crosses
        ok = any(m.decide(os.path.join(r, f), rules, wired)[0] for r, _, fs in os.walk(p) for f in fs)
    else:
        ok = os.path.exists(p) and m.decide(p, rules, wired)[0]
    if not ok: print("DANGLING:", p)
'''], cwd=ROOT, capture_output=True, text=True)
print(rules.stdout.strip() or 'all cited .claude paths survive the export rules')
print(f"CLAUDE.public.md: {len(kept)}/{len(secs)} sections, {out.count(chr(10))} lines")
