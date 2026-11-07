#!/usr/bin/env bash
# Protocol 16 § "Optional blind reads" (2026-11-05) — prepare blind copies of a lab run's composed prompts for a blind subagent read. $0.
#
#   scripts/leg-replay-lab/second-read/prepare-second-read.sh --mode fixture|contradiction --run <run folder>
#       [--cells A,B,...] [--roles reviewer[,author,...]] [--out <dir>] [--accept <regex>]
#
# For every <cell>/<arm>/<role>.system.md + <role>.user.md pair in the run folder (a $0 dry run is enough), it writes:
#   <out>/blind/pN.system.md, pN.user.md   the copies, under shuffled blind names (the ONLY files a blind reader may open)
#   <out>/key.tsv                          blind name -> cell/arm/role (kept OUT of blind/; never shown to a reader)
#   <out>/briefs/pN.txt                    the mode's brief with this pair's absolute paths filled in (send verbatim, twice)
# Then it greps the blind copies for lab vocabulary (cell ids and the run label from manifest.json, and harness words such as
# must-block, standing bench, crib, plant, golden, ADDENDUM, lab-sample) and FAILS LOUD on any hit: a copy that says it is a lab cell is
# not blind. Matching is case-sensitive except for the fixed words. A production token that legitimately matches (reviewed by a human)
# can be accepted with --accept '<regex>', which drops matching hit lines.
#
# It spawns nothing and calls no model. Running the blind readers is a separate, owner-approved step (Claude plan usage).
set -euo pipefail

MODE=""; RUN=""; CELLS=""; ROLES="reviewer"; OUT=""; ACCEPT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --run) RUN="$2"; shift 2 ;;
    --cells) CELLS="$2"; shift 2 ;;
    --roles) ROLES="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --accept) ACCEPT="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
case "$MODE" in fixture|contradiction) ;; *) echo "--mode must be fixture or contradiction" >&2; exit 2 ;; esac
[ -n "$RUN" ] && [ -d "$RUN" ] || { echo "--run <run folder> is required and must exist" >&2; exit 2; }
[ -f "$RUN/manifest.json" ] || { echo "$RUN has no manifest.json — not a lab run folder" >&2; exit 2; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIEF="$HERE/brief-$MODE.md"
[ -f "$BRIEF" ] || { echo "missing brief $BRIEF" >&2; exit 2; }
if [ -z "$OUT" ]; then OUT="$(mktemp -d "${TMPDIR:-/tmp}/p16-blind-read.XXXXXX")"; fi
mkdir -p "$OUT/blind" "$OUT/briefs"
[ -z "$(ls -A "$OUT/blind")" ] || { echo "$OUT/blind is not empty — use a fresh --out" >&2; exit 2; }
OUT="$(cd "$OUT" && pwd)"

python3 -I - "$RUN" "$OUT" "$BRIEF" "$MODE" "$CELLS" "$ROLES" "$ACCEPT" <<'PY'
import json, os, random, re, shutil, sys
run, out, brief, mode, cells, roles, accept = sys.argv[1:8]
cells = [c for c in cells.split(',') if c]
roles = [r for r in roles.split(',') if r]
man = json.load(open(os.path.join(run, 'manifest.json'), encoding='utf-8'))
node_ids = list(man.get('nodes', {}).keys()) if isinstance(man.get('nodes'), dict) else [n.get('id') for n in man.get('nodes', []) if isinstance(n, dict)]
pairs = []
for cell in sorted(os.listdir(run)):
    cdir = os.path.join(run, cell)
    if not os.path.isdir(cdir) or (cells and cell not in cells):
        continue
    for arm in sorted(os.listdir(cdir)):
        adir = os.path.join(cdir, arm)
        if not os.path.isdir(adir):
            continue
        for role in roles:
            s, u = os.path.join(adir, f'{role}.system.md'), os.path.join(adir, f'{role}.user.md')
            if os.path.isfile(s) and os.path.isfile(u):
                pairs.append((cell, arm, role, s, u))
if not pairs:
    sys.exit(f'no <cell>/<arm>/<role>.system.md + .user.md pairs found (cells={cells or "all"}, roles={roles})')
random.SystemRandom().shuffle(pairs)
body = open(brief, encoding='utf-8').read().split('\n---\n', 1)[1]
with open(os.path.join(out, 'key.tsv'), 'w', encoding='utf-8') as key:
    key.write('blind\tcell\tarm\trole\tsource_system\tsource_user\tmode\n')
    for i, (cell, arm, role, s, u) in enumerate(pairs, 1):
        b = f'p{i}'
        bs, bu = os.path.join(out, 'blind', f'{b}.system.md'), os.path.join(out, 'blind', f'{b}.user.md')
        shutil.copyfile(s, bs); shutil.copyfile(u, bu)
        key.write(f'{b}\t{cell}\t{arm}\t{role}\t{s}\t{u}\t{mode}\n')
        open(os.path.join(out, 'briefs', f'{b}.txt'), 'w', encoding='utf-8').write(body.replace('{SYSTEM}', bs).replace('{USER}', bu))
# Blindness check: anything that tells the reader it is a lab cell.
fixed = [r'must-block', r'must-approve', r'standing bench', r'\bcrib\b', r'\bplant(ed|s)?\b', r'\bgolden\b', r'\bADDENDUM\b', r'lab[- ]sample',
         r'leg replay', r'\blabref', r'fake-llm', r'experiment\.json', r'\bbench\b']
pats = [re.compile(p, re.I) for p in fixed]
# Case-sensitive: lab execution ids (lab-R-FWA3-…), record names, gate words. `ceos-lab-readonly`, `cEOSLab` and
# `paichart-lab-configs` are PRODUCTION tokens and must not match.
pats += [re.compile(p) for p in (r'lab-[A-Z]', r'\bLAB-[A-Z]', r'\bL-[A-Z]{1,3}\d?-', r'PREREG', r'\bVOID\b')]
pats += [re.compile(r'(?<![\w-])' + re.escape(n) + r'(?![\w-])') for n in node_ids if n and len(n) >= 4]
if man.get('label'):
    pats.append(re.compile(re.escape(man['label'])))
acc = re.compile(accept) if accept else None
hits = []
for f in sorted(os.listdir(os.path.join(out, 'blind'))):
    for ln, line in enumerate(open(os.path.join(out, 'blind', f), encoding='utf-8'), 1):
        for p in pats:
            m = p.search(line)
            if m and not (acc and acc.search(line)):
                hits.append(f'{f}:{ln}: [{p.pattern}] {line.strip()[:160]}')
                break
print(f'{len(pairs)} pair(s) → {out}/blind (key: {out}/key.tsv, briefs: {out}/briefs/, mode {mode})')
if hits:
    print('BLIND CHECK FAILED — the copies carry lab vocabulary (fix the plant/edit, or --accept a reviewed production token):', file=sys.stderr)
    for h in hits[:50]:
        print('  ' + h, file=sys.stderr)
    sys.exit(3)
print('blind check: no lab vocabulary in the copies ✓')
print('next (owner-approved only): 2 blind sonnet subagents per pair, each sent briefs/pN.txt verbatim; then string-test every finding against key.tsv sources')
PY
