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
                    bucket literal, Terraform resource address, count-of-harvested-things, or number inside a
                    `(derived — basis: ...)` answer in FILE (Writing rules section excluded)
                    that appears in neither the template nor the OBJECTIVE file. Exit 1 if any. A hit is a
                    candidate to READ, not a verdict; a zero does not replace the full human read.
  --skeleton        emit the TEMPLATE's skeleton on stdout: the template minus every block the
                    template itself addresses to the author. Deterministic; no arguments.
  --program-view FILE [OUT]
                    write the PROGRAM VIEW of a published spec (default OUT: FILE with .md -> .program.md):
                    the same document with the Writing rules section replaced by a short READING NOTES block.
                    Opt-in per run (point the program's task at the program-view URL). See SPEC-SIZE below.
  --size-check FILE [TOPOLOGY]
                    exit 1 unless each file, as DELIVERED (JSON-escaped + envelope), fits one document's read
                    limit (8,000 + 6 pages x 7,000 = 50,000) and all files together need <= 8 read_more pages;
                    WARN under 5,000 headroom. Run on the file(s) the program will FETCH.

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
# A Terraform-style resource ADDRESS (provider_type.name). Added 2026-09-26: a harvested resource the program never
# touches was named in the out-of-scope list of 4 of 8 generated drafts — a NAME, which the other shapes cannot see.
_TF_ADDR = re.compile(r'\b(?:aws|azurerm|azuread|google|random|kubernetes|helm|null|local|tls|time|cloudflare|github)_[a-z0-9_]+\.[a-z0-9_-]+\b')
_COUNT = re.compile(r'(?i)\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+'
                    r'(?:harvested\s+|exporter\s+|existing\s+|live\s+)?'
                    r'(exporters?|addresses|loopbacks|pods|devices|interfaces|members|workloads|servers|blocks|buckets|namespaces)\b')
# A NUMBER inside a `(derived — basis: ...)` answer (2026-09-28, decision surfacing Phase 1). The template's answer grammar
# says a derived basis is "a pointer and a property, never a harvested name or value" — and a basis is the one place a
# generator is TOLD to cite a harvest, so it is where a count leaks first. `_COUNT` cannot see it: it needs the number
# next to a known noun, and a basis reads "shows two OTLP blocks" or "shows one bucket" (both from the design's own
# worked example). Any number word or bare integer inside the basis is a candidate; `Phase 0` is the pointer, not state.
_DERIVED = re.compile(r'\(derived\s+—\s+basis:([^)]*)\)')
_BASIS_NUM = re.compile(r'(?i)(?<!phase )\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|single|\d+)\s+([\w./:-]+)')


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
                              ('ARN', _ARN, 0), ('bucket', _BUCKET, 1), ('resource address', _TF_ADDR, 0),
                              ('count', _COUNT, 0)):
            for m in rx.finditer(line):
                tok = m.group(grp)
                # Universal constants are not state (they are what a Forbidden list names), and a token built from a
                # <PLACEHOLDER> or a shell variable ($BUCKET, ${BUCKET}) is a shape, not a value — a validation command
                # that resolves the value at run time is exactly what the rules ask for (2026-09-26, genspec Rev12).
                if tok in ('0.0.0.0/0', '0.0.0.0') or '<' in tok or re.search(r'\$\{?[A-Za-z_]', tok):
                    continue
                if tok and tok not in allowed_text:
                    hits.append((n, kind, tok, line.strip()[:140]))
        for d in _DERIVED.finditer(line):
            for m in _BASIS_NUM.finditer(d.group(1)):
                tok = m.group(0)
                if tok not in allowed_text:
                    hits.append((n, 'count in derived basis', tok, line.strip()[:140]))
    return hits

# ── SPEC-SIZE (2026-10-02) ──────────────────────────────────────────────────────────────────────
# Program Run 14 (2026-10-01): the Program Architect read 50,000 of a 67,093-char requirements.md and
# stopped. Its read budget is one 8,000-char window per fetch plus a per-run read_more budget of
# min(8, 25% of tool turns) pages of <= 8,000 chars (agentic-tool-loop.ts) — about 72K across BOTH
# design artifacts; topology (13K) + requirements (67K) needed 80K, impossible even read perfectly.
# The unread tail was the Writing rules section (20.8K, the largest in the document; LAST by design).
#
# The PROGRAM VIEW keeps every section a program plans from and replaces the Writing rules with a
# short block. It is OPT-IN per run (a run uses it only if its task points at the program-view URL),
# so every existing run and published spec is unchanged. The full requirements.md stays the human /
# editor copy and keeps passing --check.
# ⚠️ Not free: the Program Architect DOES read the rules today and composes briefs from what it reads
# (see the module docstring). Whether a program view loses anything a brief needs is a review
# question, recorded in the SPEC-SIZE batch — not an assumption made here.
# Budget is in DELIVERED characters, not raw: the fetch result reaches the agent JSON-escaped (measured on Run 14:
# requirements raw 63,435 -> seen 67,093; topology raw 10,222 -> seen 12,932). delivered_estimate() = doubly
# JSON-escaped length + an envelope allowance per file; on Run 14 it estimated 69.5K / 13.3K (conservative both).
# The read MECHANISM (agentic-tool-loop.ts; keep these in step with it): each fetch returns an 8,000-char first window
# (MAX_TOOL_RESULT_LENGTH); read_more serves windows of at most 7,000 (READ_MORE_WINDOW_BOUNDS.max), at most 6 pages
# per fetched document (READ_MORE_PAGES_PER_ORIGIN) and min(8, 25% of tool turns) pages per run. So ONE document is
# readable to 8,000 + 6 x 7,000 = 50,000 — exactly where Run 14 stopped — and the run can spend 8 pages in all.
# (Corrected 2026-10-02 by the prompt-construction review: a single combined budget passed files that cannot be read.)
FIRST_WINDOW, PAGE_MAX, PAGES_PER_DOC, PAGES_PER_RUN = 8000, 7000, 6, 8
PER_FILE_MAX = FIRST_WINDOW + PAGES_PER_DOC * PAGE_MAX      # 50,000
WARN_HEADROOM = 5000
ENVELOPE = 2500


def delivered_estimate(text):
    import json
    return len(json.dumps(json.dumps(text))) - 2 + ENVELOPE
READING_NOTES = """## Writing rules — omitted from this program view

*Program view.* This section is omitted deliberately — it is not a truncated read. The Writing
rules bind this document's author and reviewer; they are published in full in the companion
`requirements.md`, which is not an input to this run. Every other section is byte-identical to it.
Where a section cites a rule by number: #1 and #2 (deterministic validation; shipping every cited
artefact) are obligations of each leg's own protocol; #6 means an existence assumption is a BRANCH
decided by the leg's own harvest, never a statement of today's state.

Two properties of this document carry over:

1. **Expected values stated here are reference data, never evidence.** They describe intent; what
   is true is what a run's own harvest observes.
2. **A value that crosses between legs is the value its named producing leg derives at run time**,
   never a literal written here. A crossing value or scope word that can be read two ways producing
   different work is an ambiguity in this document, not a decision."""
GLOSSED_RULES = {1, 2, 6}   # the rule numbers READING_NOTES explains; C3 refuses a view citing any other


def program_view(doc_lines):
    """(out_lines, removed_chars) — FILE with the Writing rules section replaced by READING_NOTES."""
    s, e = bounds(doc_lines)
    if s is None:
        return None, 0
    removed = sum(len(l) + 1 for l in doc_lines[s:e])
    return doc_lines[:s] + READING_NOTES.split('\n') + [''] + doc_lines[e:], removed


def main():
    if len(sys.argv) in (3, 4) and sys.argv[1] == '--program-view':
        src = sys.argv[2]
        dst = sys.argv[3] if len(sys.argv) == 4 else re.sub(r'\.md$', '', src) + '.program.md'
        if os.path.abspath(dst) == os.path.abspath(src):
            print("✗ refusing: OUT is FILE — the full requirements.md is the human copy and must not be overwritten.")
            return 2
        body = open(src).read()
        cited = {int(n) for n in re.findall(r'Writing rules\*?\s*#\s*(\d+)', body)}
        cited |= {int(n) for m in re.findall(r'Writing rules\*?\s*#\s*\d+(?:\s*(?:,|and)\s*#?\s*\d+)+', body)
                  for n in re.findall(r'\d+', m)}
        stray = sorted(cited - GLOSSED_RULES)
        if stray:
            print(f"✗ {src}: the body cites Writing rules #{stray} — READING_NOTES glosses only #{sorted(GLOSSED_RULES)}.")
            print("  Extend READING_NOTES (and GLOSSED_RULES) before writing a program view, or the citation dangles.")
            return 1
        out, removed = program_view(body.split('\n'))
        if out is None:
            print(f"✗ {src}: no '{HEADING}' section found — nothing to replace.")
            return 1
        open(dst, 'w').write('\n'.join(out))
        n = len('\n'.join(out))
        print(f"✓ {dst}: program view written — {n:,} chars (removed {removed:,} chars of writing rules).")
        return 0
    if len(sys.argv) >= 3 and sys.argv[1] == '--size-check':
        args = sys.argv[2:]
        if not 1 <= len(args) <= 2:
            print(__doc__); return 2
        import math
        fail, warn, pages = False, False, 0
        for p in args:
            t = open(p).read(); d = delivered_estimate(t)
            need = max(0, math.ceil((d - FIRST_WINDOW) / PAGE_MAX))
            pages += need
            head = PER_FILE_MAX - d
            flag = '✗' if d > PER_FILE_MAX else ('⚠️' if head < WARN_HEADROOM else '✓')
            fail |= d > PER_FILE_MAX; warn |= 0 <= head < WARN_HEADROOM
            print(f"  {flag} raw {len(t):>7,}  delivered~{d:>7,}  pages {need}/{PAGES_PER_DOC}  headroom {head:>7,}  {p}")
        print(f"  run pages {pages}/{PAGES_PER_RUN}")
        if fail or pages > PAGES_PER_RUN:
            print(f"✗ a Program Architect cannot read all of this: each file must be <= ~{PER_FILE_MAX:,} delivered chars")
            print(f"  ({FIRST_WINDOW:,} + {PAGES_PER_DOC} pages x {PAGE_MAX:,}) and all files together <= {PAGES_PER_RUN} read_more pages.")
            print("  Use the program view, or shorten the document — never raise a cap to fit one document.")
            return 1
        if warn:
            print(f"⚠️  fits, but a file has under {WARN_HEADROOM:,} chars of headroom: trim author-facing prose from the body first;")
            print("   raising the per-document page cap is the reserve lever (token-optimizer review).")
        print("✓ readable within the Program Architect's read budget.")
        return 0
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
