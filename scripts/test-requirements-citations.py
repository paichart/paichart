#!/usr/bin/env python3
"""Tests for scripts/check-requirements-citations.py (2026-10-09; created with the S-cit / Z18 extension).

Each S-cit case is red on the script before the extension (it saw only `declared — item N` citations).
Run: npm run test:requirements-citations
"""
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.realpath(__file__))
SCRIPT = os.path.join(HERE, 'check-requirements-citations.py')
TRIAL = os.path.join(HERE, '..', '.claude', 'skills', 'requirements-spec', 'work', 'log-archive-namespace-write-2026-10-09')
passed = failed = 0

OBJ = 'Objective.\n\nDESIGN DECISIONS\n\n1. The target namespace is `trading`.\n2. The bucket leg adds Allow statements only.\n\nPhase 0.\n'


def run(draft, objective=OBJ):
    with tempfile.TemporaryDirectory() as d:
        o, f = os.path.join(d, 'o.txt'), os.path.join(d, 'r.md')
        open(o, 'w').write(objective)
        open(f, 'w').write(draft)
        p = subprocess.run([sys.executable, SCRIPT, '--objective', o, '--draft', f], capture_output=True, text=True)
        return p.returncode, p.stdout


def doc(cell2='(declared — item 2: "The bucket leg adds Allow statements only")', prose=''):
    return ('# Spec\n\n## Design decisions\n\n| id | q | o | r | source |\n|---|---|---|---|---|\n'
            '| kubernetes-gitops.target | q | — | r | (declared — item 1: "The target namespace is `trading`") |\n'
            f'| terraform-iac.collateral | q | — | r | {cell2} |\n\n## Pipeline 1 objective\n\n{prose}\n')


def t(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print(f'  ✅ {name}')
    except AssertionError as e:
        failed += 1
        print(f'  ❌ {name}: {e}')


def clean():
    rc, out = run(doc())
    assert rc == 0, out


def nonexistent_extra_citation():
    rc, out = run(doc('(declared — item 2: "The bucket leg adds Allow statements only"); item 3: "Neither leg acts"'))
    assert rc == 1 and 'item 3 is referenced' in out, out


def nonexistent_range():
    rc, out = run(doc(prose='Every row traces to items 1–3.'))
    assert rc == 1 and 'item 3 is referenced' in out, out


def extra_citation_ellipsis():
    rc, out = run(doc('(declared — item 2: "The bucket leg adds Allow statements only"); item 1: "The target... trading"'))
    assert rc == 1 and 'extra citation' in out and 'ellipsis' in out, out


def existing_range_is_clean():
    rc, out = run(doc(prose='Every row traces to items 1–2.'))
    assert rc == 0, out


def writing_rules_section_ignored():
    rc, out = run(doc() + '\n## Writing rules\n\n<!-- WRITING-RULES -->\nSee item 9 of the checklist.\n')
    assert rc == 0, out


def regression_gen4_z18():
    d = os.path.join(TRIAL, 'draft-answered-3')
    rc, out = run(open(os.path.join(d, 'report.md')).read(), open(os.path.join(d, 'objective.txt')).read())
    assert rc == 1 and 'item 22 is referenced' in out, out


def regression_gen9_clean():
    d = os.path.join(TRIAL, 'draft-answered-8')
    rc, out = run(open(os.path.join(d, 'report.md')).read(), open(os.path.join(d, 'objective.txt')).read())
    assert rc == 0, out


ZERO_TABLE = ('# Spec\n\n## Design decisions\n\n| id | q | o | r | source |\n|---|---|---|---|---|\n'
              '| terraform-iac.target-absent | the declared target itself does not exist | gap · create-target | unanswered | '
              'OPEN — what the leg does if the bucket does not exist; options: gap · create-target |\n'
              '| terraform-iac.inputs-empty | q | gap | gap | forced (structural — no declared item exists to cite) → gap |\n'
              '\n## Pipeline 1 objective\n\nx\n')


def zero_draft_question_text_is_not_a_declaration():
    # 2026-10-11: the registry's own `target-absent` question reads "the declared target …", and a forced row's reason
    # can say "no declared item exists"; neither is a declared SOURCE cell. Old code: "1 declared row(s) … form drifted".
    rc, out = run(ZERO_TABLE)
    assert rc == 0 and 'form drifted' not in out, out


def drifted_declared_source_still_caught():
    # known positive — a SOURCE cell that declares, in a form the citation parser cannot read, still trips the drift check.
    rc, out = run(doc(cell2='declared, see item 2').replace('(declared — item 1: "The target namespace is `trading`")', 'declared per item 1'))
    assert rc == 1 and '2 declared row(s)' in out and 'form drifted' in out, out


def regression_trial_zero_clean():
    d = os.path.join(TRIAL, 'draft-zero')
    rc, out = run(open(os.path.join(d, 'report.md')).read(), open(os.path.join(d, 'objective.txt')).read())
    assert rc == 0, out


def public_mirror_identical():
    pub = os.path.expanduser('~/paichart/scripts/check-requirements-citations.py')
    if not os.path.exists(pub):
        print('     (skipped: public repo not present)')
        return
    assert open(pub, 'rb').read() == open(SCRIPT, 'rb').read(), 'the public mirror ~/paichart/scripts/check-requirements-citations.py differs — re-copy it (README: byte-mirrored)'


for n, f in [('clean draft passes', clean),
             ('non-existent item in an extra citation (Z18 shape) fails', nonexistent_extra_citation),
             ('non-existent item in a range ("items 1–3") fails', nonexistent_range),
             ('extra citation with an ellipsis join (Z19 shape) fails', extra_citation_ellipsis),
             ('an existing range is clean', existing_range_is_clean),
             ('the Writing rules section is not scanned', writing_rules_section_ignored),
             ('regression: trial gen 4 — the fabricated item 22 is found', regression_gen4_z18),
             ('regression: trial gen 9 is clean', regression_gen9_clean),
             ('a zero draft: question text and a forced reason saying "declared" are not declarations',
              zero_draft_question_text_is_not_a_declaration),
             ('a declared source cell in a drifted form is still caught', drifted_declared_source_still_caught),
             ('regression: trial zero draft is clean (was 6 false "declared" rows)', regression_trial_zero_clean),
             ('public byte-mirror is identical', public_mirror_identical)]:
    t(n, f)

print(f'\n✅ Passed: {passed}')
if failed:
    print(f'❌ Failed: {failed}')
    sys.exit(1)
