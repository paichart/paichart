#!/usr/bin/env python3
"""Splice the canonical writing rules into a produced requirements.md — and verify they survived.

WHY (2026-09-21): the writing rules must reach the produced document VERBATIM, because
change-package authors read that document and never the template. Three independent authoring
passes over the same template each altered them while transcribing, and no two broke the same
thing:

  * one loosened rule 1's permitted forms ("or a named property" — a phrase absent from the
    template) and dropped rule 5 entirely, then hardcoded the value rule 5 forbids;
  * one deleted acceptance check 3, shifting its content into slot 4 — the precise defect the
    carried rule 14 exists to prevent;
  * one dropped the rule NUMBERING, then cited "Writing rules #1 and #2" — unresolvable.

Each run fixed its predecessor's fault and broke something new. A model asked to transcribe a rule
that constrains it is marking its own homework, so the rules are inserted MECHANICALLY and the
model is told to emit a marker instead.

  --check  FILE   exit 1 if FILE's writing-rules section is not byte-identical to canonical
  --insert FILE   overwrite that section with canonical, in place; reports whether it had to

Both are idempotent. --insert is the repair path and deliberately does NOT trust the marker: it
replaces whatever occupies the section, so a model that emitted the rules anyway is corrected and
the correction is reported rather than silently applied.
"""
import sys, os, difflib

HEADING = '## Writing rules'
CANON = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     '..', 'program-artifacts', '_TEMPLATE', 'writing-rules.md')


def bounds(lines):
    """(start, end) of the writing-rules section: its heading to the next top-level heading."""
    start = next((i for i, l in enumerate(lines) if l.startswith(HEADING)), None)
    if start is None:
        return None, None
    end = next((i for i in range(start + 1, len(lines)) if l_top(lines[i])), len(lines))
    return start, end


def l_top(line):
    return line.startswith('## ') and not line.startswith('###')


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ('--check', '--insert'):
        print(__doc__); return 2
    mode, path = sys.argv[1], sys.argv[2]
    canon = open(CANON).read().rstrip('\n').split('\n')
    doc = open(path).read().split('\n')

    s, e = bounds(doc)
    if s is None:
        print(f"✗ {path}: no '{HEADING}' section found — cannot place the rules.")
        print("  The produced document must carry the heading and the <!-- WRITING-RULES --> marker.")
        return 1

    present = [l for l in doc[s:e] if l.strip()]
    expect = [l for l in canon if l.strip()]
    if present == expect:
        print(f"✓ {path}: writing rules are byte-identical to canonical ({len(expect)} non-blank lines).")
        return 0

    marker_only = any('<!-- WRITING-RULES -->' in l for l in doc[s:e]) and len(present) < 15
    if mode == '--check':
        print(f"✗ {path}: writing-rules section DIFFERS from canonical.")
        if marker_only:
            print("  (section holds the marker — run --insert to splice the rules in)")
        else:
            d = [x for x in difflib.unified_diff(expect, present, 'canonical', path, lineterm='', n=0)][:14]
            print("  first differences:")
            for x in d:
                print("   ", x[:150])
            print("  ⚠️  a re-emitted rule that reads correct can still be altered — diff, do not skim.")
        return 1

    out = doc[:s] + canon + [''] + doc[e:]
    open(path, 'w').write('\n'.join(out))
    if marker_only:
        print(f"✓ {path}: rules spliced at the marker ({len(expect)} non-blank lines).")
    else:
        print(f"⚠️  {path}: the section was AUTHORED, not marked — overwritten with canonical.")
        print("   The model emitted rules instead of the marker. That is the failure this tool exists")
        print("   for; the document is now correct, but the authoring step did not follow the template.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
