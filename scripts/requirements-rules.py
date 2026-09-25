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

  --check    FILE   exit 1 if FILE's writing-rules section is not byte-identical to canonical
  --insert   FILE   overwrite that section with canonical, in place; reports whether it had to
  --lint     FILE [--declared OBJECTIVE]
                    PRE-FILTER for harvested state: list every address, abbreviated address, port, ARN,
                    bucket literal or count-of-harvested-things in FILE (Writing rules section excluded)
                    that appears in neither the template nor the OBJECTIVE file. Exit 1 if any. A hit is a
                    candidate to READ, not a verdict; a zero does not replace the full human read.
  --skeleton        emit the TEMPLATE's skeleton on stdout: the template minus every block the
                    template itself addresses to the author. Deterministic; no arguments.

Both are idempotent. --insert is the repair path and deliberately does NOT trust the marker: it
replaces whatever occupies the section, so a model that emitted the rules anyway is corrected and
the correction is reported rather than silently applied.
"""
import sys, os, re, difflib

TEMPLATE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        '..', 'program-artifacts', '_TEMPLATE', 'requirements.template.md')

# The template STATES this rule about itself, and this function is that sentence executed:
#   "A block headed **🗑 AUTHORING NOTE** is addressed to *you* and must be gone before the run:
#    `grep -c '^> \*\*🗑' requirements.md` must return 0. Everything else is the document itself."
# So the skeleton is NOT a judgement about which prose matters — it is the document's own
# acceptance check applied ahead of time. Do not widen it to "prose that looks like guidance":
# the template's other blockquotes are binding content (⚠️ clauses), and the same sentence says so.
STRIP_HEAD = re.compile(r'^> \*\*🗑')


def skeleton(lines):
    """The template minus every author-addressed block. Measured 2026-09-21: strips 59 of 370
    lines (17%), keeping all 13 headings and 72 of 73 placeholders.

    ⚠️ 17%, not the 81% a line-classifier suggested. That figure counted a template line as
    'brief' when it appeared in none of 25 authored documents — but 19 of those 25 PREDATE this
    template, so a newer line scores zero because it is new, not because an author deleted it.
    The template's own contract is the measure that does not rot."""
    out, i = [], 0
    while i < len(lines):
        if STRIP_HEAD.match(lines[i]):
            while i < len(lines) and lines[i].startswith('>'):
                i += 1
            while i < len(lines) and lines[i].strip() == '':   # and its trailing blank
                i += 1
            continue
        out.append(lines[i]); i += 1
    return out

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


# ── The draft-status footer (2026-09-23) ────────────────────────────────────────────────────────
# The Author is told to close the document by stating it is "structurally incomplete until a person
# splices the writing rules in". That is TRUE when the Author writes it and FALSE the moment this
# tool runs — and nothing was updating it, so every spliced document shipped asserting that its own
# splice was still outstanding. Live 2026-09-23: a Program Architect read the published spec, hit
# that footer, could not verify it from where it stood, and correctly escalated it to the human at
# the plan gate. The document was complete; the claim about the document was not.
#
# The fix belongs HERE, not in the authoring instruction: the Author's sentence is correct at
# authoring time, and deleting it would remove a true warning from a genuinely incomplete draft.
# The tool that falsifies the claim is the tool that should retire it.
CLAIM = re.compile(
    r'It is structurally incomplete until a person splices the writing rules into the section above\s*'
    r'\(`requirements-rules\.py --insert`\) and runs the corresponding conformance check;\s*'
    r'the program it describes is launched separately, by a person, after that and after '
    r'the plan gate above is cleared\.')
RETIRED = ('The writing rules in the section above were spliced in mechanically '
           '(`requirements-rules.py --insert`); run `requirements-rules.py --check` to confirm they '
           'are still canonical. The program it describes is launched separately, by a person, '
           'after the plan gate above is cleared.')


def retire_draft_claim(lines):
    """Replace the pre-splice claim with its post-splice truth. Returns (lines, status).

    Deliberately NOT a blanket 'structurally incomplete' search-and-replace: that phrase also
    appears in prose ABOUT the pipeline, and rewriting those would be the tool editing sentences
    it has no business touching. Match the whole claim or report absent.
    """
    if any(RETIRED in l for l in lines):
        return lines, 'already'
    out, hit = [], False
    for l in lines:
        new = CLAIM.sub(RETIRED, l)
        hit = hit or new != l
        out.append(new)
    return out, ('rewritten' if hit else 'absent')



# ── --lint (2026-09-26, harvested-state trigger fired: a generated spec carried a harvested bucket name, then a
# harvested port). A PRE-FILTER, never the check: it lists state-SHAPED tokens (addresses, abbreviated addresses,
# ports, ARNs, bucket literals, counts of harvested things) that the document did not get from a source allowed to
# supply them. The allowlist is PRINCIPLED, not a list of exceptions: a token is fine when it appears in the
# TEMPLATE (its synthetic worked examples) or in the OBJECTIVE (a value the owner DECLARED, e.g. a port). Everything
# else is a candidate for a human to read. Its known blind spots, by construction: harvested NAMES that carry no
# state shape (a workload or resource name), and state paraphrased into prose. A zero is not "clean".
_IPV4 = re.compile(r'(?<![\w.])\d{1,3}(?:\.\d{1,3}){3}(?:/\d{1,2})?(?![\w.])')
_ABBREV = re.compile(r'(?<![\w.\d])\.\d{1,3}(?:\s*(?:,|/|and|or)\s*\.\d{1,3})+')
_PORT = re.compile(r'(?i)(?:\bport\s+|\b(?:tcp|udp)[\s/:]+|(?<=[a-z0-9\]]):)(\d{2,5})\b')
_ARN = re.compile(r'\barn:aws[\w-]*:[^\s`\'")|]+')
_BUCKET = re.compile(r'(?:--bucket\s+|s3://)([a-z0-9][a-z0-9.-]{2,62})')
_COUNT = re.compile(r'(?i)\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+'
                    r'(?:harvested\s+|exporter\s+|existing\s+|live\s+)?'
                    r'(exporters?|addresses|loopbacks|pods|devices|interfaces|members|workloads|servers|blocks|buckets|namespaces)\b')


def lint(doc_lines, allowed_text):
    s, e = bounds(doc_lines)
    scan = doc_lines if s is None else doc_lines[:s] + [''] * (e - s) + doc_lines[e:]
    hits = []
    in_example = False
    for n, line in enumerate(scan, 1):
        # The template DESIGNATES one slot for a synthetic worked example — the "Verify by arithmetic" bullet — and its
        # own rule says the example must be synthetic. Authors rewrite it with their own synthetic addresses, so that
        # bullet (to the next bullet or blank line) is exempt. Anywhere else, the same address is a candidate.
        if 'Verify by arithmetic' in line:
            in_example = True
        elif in_example and (not line.strip() or line.lstrip().startswith('- ')):
            in_example = False
        if in_example:
            continue
        for kind, rx, grp in (('address', _IPV4, 0), ('abbreviated address', _ABBREV, 0), ('port', _PORT, 1),
                              ('ARN', _ARN, 0), ('bucket', _BUCKET, 1), ('count', _COUNT, 0)):
            for m in rx.finditer(line):
                tok = m.group(grp)
                # Universal constants are not state (they are what a Forbidden list names), and a token built from a
                # <PLACEHOLDER> is a shape, not a value.
                if tok in ('0.0.0.0/0', '0.0.0.0') or '<' in tok:
                    continue
                if tok and tok not in allowed_text:
                    hits.append((n, kind, tok, line.strip()[:140]))
    return hits

def main():
    if len(sys.argv) == 2 and sys.argv[1] == '--skeleton':
        out = skeleton(open(TEMPLATE).read().split('\n'))
        residual = sum(1 for l in out if STRIP_HEAD.match(l))
        if residual:                       # fail LOUD: a silent partial strip is the whole defect
            print(f"skeleton: {residual} author-addressed block(s) survived the strip",
                  file=sys.stderr)
            return 1
        sys.stdout.write('\n'.join(out))
        return 0
    if len(sys.argv) >= 3 and sys.argv[1] == '--lint':
        path = sys.argv[2]
        allowed = open(TEMPLATE).read()
        if len(sys.argv) == 5 and sys.argv[3] == '--declared':
            allowed += '\n' + open(sys.argv[4]).read()
        elif len(sys.argv) != 3:
            print(__doc__); return 2
        else:
            print("⚠️  no --declared objective given: values the owner declared will be listed too.")
        hits = lint(open(path).read().split('\n'), allowed)
        if not hits:
            print(f"✓ {path}: 0 state-shaped tokens outside the template and the declared objective.")
            print("  A pre-filter only — it cannot see harvested names or paraphrased state. Read the whole draft.")
            return 0
        print(f"✗ {path}: {len(hits)} state-shaped token(s) the document did not get from the template or the objective:")
        for n, kind, tok, ctx in hits:
            print(f"  line {n:>4}  {kind:<20} {tok!r:<22} {ctx}")
        print("  Each is a CANDIDATE — read it. A harvested value belongs nowhere in the document: regenerate, never hand-edit.")
        return 1
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
        # ⚠️ DO NOT return here on --insert without retiring the claim. "Rules already canonical" is
        # PRECISELY the state in which the draft-status footer is stale: the rules are in, and the
        # footer still says they are not. An early return made the retirement unreachable on the one
        # path that needs it most — every already-spliced document. Caught by running the tool, not
        # by reading the patch (2026-09-23).
        if mode == '--insert':
            out, claim_status = retire_draft_claim(doc)
            if claim_status == 'rewritten':
                open(path, 'w').write('\n'.join(out))
                print(f"✓ {path}: draft-status footer retired — it no longer claims its own splice is outstanding.")
            elif claim_status == 'absent':
                print(f"⚠️  {path}: no draft-status claim found to retire.")
                print("   If this document states anywhere that the writing rules are not yet spliced,")
                print("   that statement is now FALSE and nothing here will fix it. Check by hand.")
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
    out, claim_status = retire_draft_claim(out)
    open(path, 'w').write('\n'.join(out))
    if claim_status == 'rewritten':
        print(f"\u2713 {path}: draft-status footer retired \u2014 it no longer claims its own splice is outstanding.")
    elif claim_status == 'absent':
        # LOUD, never silent: a document that still asserts the splice is pending will be escalated
        # by the next agent that reads it, and the escalation will be correct.
        print(f"\u26a0\ufe0f  {path}: no draft-status claim found to retire.")
        print("   If this document states anywhere that the writing rules are not yet spliced,")
        print("   that statement is now FALSE and nothing here will fix it. Check by hand.")
    if marker_only:
        print(f"✓ {path}: rules spliced at the marker ({len(expect)} non-blank lines).")
    else:
        print(f"⚠️  {path}: the section was AUTHORED, not marked — overwritten with canonical.")
        print("   The model emitted rules instead of the marker. That is the failure this tool exists")
        print("   for; the document is now correct, but the authoring step did not follow the template.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
