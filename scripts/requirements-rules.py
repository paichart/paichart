#!/usr/bin/env python3
"""Splice the canonical writing rules into a produced requirements.md — and verify they survived.

WHY (2026-09-21): the writing rules must reach the produced document VERBATIM.

NOT because change-package authors read that document — measured the same day, that is FALSE and
always was: 0 of 197 author legs ever received requirements.md on the brief or chained-context
channel. The PROGRAM ARCHITECT reads it verbatim (66 of 92 executions), is the only role that does,
and composes every brief from what it reads. So an altered rule does not mislead one agent; it
propagates into prompts nobody inspects.

Three independent authoring passes over the same template each altered the rules while
transcribing, and no two broke the same thing:

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
import sys, os, re, difflib

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

    # "Marker only" means the section holds the marker and NONE of the canonical rule text.
    # This used to be `len(present) < 15`, which misfired on the template itself: the section
    # legitimately carries a 17-line DO-NOT-AUTHOR blockquote alongside the marker, so a clean
    # copy-and-insert was reported as "the section was AUTHORED" — a confident false finding on
    # the correct path. Test for canonical CONTENT, not for length.
    # ⚠️ Compare against canonical BODY, never canon[0]: the heading is present in both a
    # marker-only section and a fully-spliced one, so including it makes marker_only ALWAYS false
    # and the correct path reports "AUTHORED". (I broke it that way on 2026-09-21 while editing
    # this function, one commit after it was fixed.)
    canon_body = {l.strip() for l in canon[1:] if len(l.strip()) > 40}
    marker_only = (any('<!-- WRITING-RULES -->' in l for l in doc[s:e])
                   and not any(l.strip() in canon_body for l in doc[s:e]))

    # OUTDATED is not ALTERED. Canonical carries a `Rules version: N` line that travels with the
    # splice, so a document produced against an older canonical can be told apart from one whose
    # rules were tampered with. Without this the tool reports both as "DIFFERS", and the whole point
    # of it is detecting alteration — a check that cannot distinguish the two is a check you learn
    # to ignore. (Earned 2026-09-21: correcting a measured-false claim in rule 3 would otherwise have
    # made all 6 existing produced documents read as defective.)
    def ver(block):
        for l in block:
            if 'Rules version:' in l:
                return l.split('Rules version:')[1].split('—')[0].strip(' *.,')
        return None
    v_doc, v_canon = ver(doc[s:e]), ver(canon)

    # ⚠️ An ABSENT version line is the common case, not an edge case: measured 2026-09-21, ALL SIX
    # produced documents carrying a rules section predate versioning, so `v_doc is None` covers the
    # entire population this distinction was built for. Keying only on `v_doc != v_canon` left all
    # six reporting as ALTERED — the exact outcome the version line was added to prevent.
    # A DELETED version line looks identical from here. One case IS decidable on evidence: if
    # restoring the version phrase would make the section match canonical exactly, the line was
    # deleted and nothing else changed — ALTERED. Otherwise the classification is a BEST GUESS and
    # the output says so, because "version deleted AND a rule altered" is indistinguishable from
    # "genuinely older text" without a version to compare. A check that cannot separate two cases
    # must name the limit rather than pick one silently.
    # ⚠️ Strip the version PHRASE, do not drop the line: canonical carries it INLINE, prefixed to a
    # sentence that continues after it. A line-dropping filter therefore compared a real sentence
    # against nothing and called a deleted version line "pre-versioned" — the one edit that makes an
    # altered document look merely old, mis-classified. Caught by the mutation case, not by review.
    strip_ver = lambda ls: [re.sub(r'\*Rules version:[^*]*\*\s*', '', l).strip() for l in ls]
    pre_versioned = False
    if v_doc is None and v_canon is not None:
        pre_versioned = strip_ver(present) != strip_ver(expect)

    if mode == '--check':
        print(f"✗ {path}: writing-rules section DIFFERS from canonical.")
        if marker_only:
            print("  (section holds the marker — run --insert to splice the rules in)")
        elif pre_versioned:
            print(f"  PRE-VERSIONED: this section predates the `Rules version` line")
            print(f"  (canonical is v{v_canon}). An archived run legitimately carries the rules that")
            print("  were canonical when it was produced. Re-splice only if you intend to change what")
            print("  that run was held to. Diff below is against CURRENT canonical, not against the")
            print("  text this run was actually held to — read it as a version gap, not as tampering.")
            print(f"  ⚠️  BEST GUESS, and here is its limit: with no version line, older text and")
            print("     older-text-that-was-also-altered look identical. If this document SHOULD")
            print("     carry a version, treat it as ALTERED and diff it properly.")
            d = [x for x in difflib.unified_diff(expect, present, 'canonical', path, lineterm='', n=0)][:6]
            for x in d:
                print("   ", x[:150])
            return 1
        elif v_doc is None and v_canon is not None:
            print(f"  ALTERED: the `Rules version` line was REMOVED and nothing else differs")
            print(f"  (canonical is v{v_canon}). That is the one edit that makes an altered document")
            print("  look merely old. Re-splice with --insert.")
            return 1
        elif v_doc and v_canon and v_doc != v_canon:
            print(f"  OUTDATED, not altered: document carries rules v{v_doc}, canonical is v{v_canon}.")
            print("  An archived run legitimately carries the rules that were canonical when it was")
            print("  produced. Re-splice only if you intend to change what that run was held to.")
            return 1
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
