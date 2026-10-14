#!/usr/bin/env python3
"""Tests for scripts/check-requirements-coverage.py (2026-10-08).

Each case starts from a minimal CLEAN draft (0 errors) and applies ONE mutation that must produce exactly the expected
error — so every rule is proven to fire, and the clean baseline proves it does not fire spuriously. Plus two
regressions on real documents: the worked-example zero-decision draft (the hand-recorded deviations of
OWNER-ANSWER-SESSION step 3) and, when the public repo is present, the published t1zero-v2 spec (its 2026-10-01
owner-waiver finding #2, found mechanically).
Run: python3 scripts/test-requirements-coverage.py   (exit 1 on any failure)
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('cov', os.path.join(HERE, 'check-requirements-coverage.py'))
cov = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cov)
REG = cov.load_registry(cov.DEFAULT_REGISTRY)
AUTH = REG['auth']

passed = failed = 0


def t(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print(f'  ✅ {name}')
    except AssertionError as e:
        failed += 1
        print(f'  ❌ {name}\n     {e}')


def row(rid, src, options=None):
    # options default to the registry's own cell for the key, so a clean fixture is clean on the options check too
    if options is None:
        parts = rid.split('.')
        key = parts[-1] if parts[0] == 'gate' else (parts[1] if len(parts) == 2 else '')
        options = REG.get('_options', {}).get(key, '—')
    return f'| {rid} | q | {options} | r | {src} |'


DECL = '(declared — item 1: "x")'


def clean_rows():
    rows = [row('network-provisioning.target', DECL), row('network-provisioning.population', DECL),
            row('network-provisioning.representation', DECL),
            row('network-provisioning.inputs-empty', '(forced — item 2 rules out a substitute) → gap'),
            row('terraform-iac.target', DECL)]
    rows += [row(f'terraform-iac.{k}', DECL) for k in AUTH]
    rows += [row('approver.program-plan', DECL), row('approver.value-gate', DECL),
             row('gate.value-gate.position', DECL)]
    return rows


def build(rows, owner):
    return ('# Spec\n\n## Design decisions\n\n| id | question | options | rule | source |\n|---|---|---|---|---|\n'
            + '\n'.join(rows) + '\n\n## Decisions needed from the owner\n\n' + owner + '\n\n## Pipeline 1 objective — '
            'network-provisioning (UPSTREAM)\n\n## Pipeline 2 objective — terraform-iac\n')


OWNER_CLEAN = '- network-provisioning.inputs-empty — q — options: gap — governs: P1 — tier: default'


def errs(text):
    e, r, s = cov.check(text, REG)
    return e, r


def whats(e):
    return [x['what'] for x in e]


def baseline():
    e, r = errs(build(clean_rows(), OWNER_CLEAN))
    assert e == [], f'clean draft must have 0 errors, got {e}'


t('clean baseline: 0 errors', baseline)


def mut(name, rows_fn, owner, expect_substr, n=1):
    def fn():
        e, _ = errs(build(rows_fn(clean_rows()), owner))
        hits = [x for x in e if expect_substr in x['what']]
        assert len(hits) == n and len(e) == n, f'expected exactly {n} × "{expect_substr}", got {e}'
    t(name, fn)


mut('missing target row', lambda r: [x for x in r if '| terraform-iac.target |' not in x], OWNER_CLEAN, 'missing row')
mut('partial auth block (one key dropped)', lambda r: [x for x in r if 'terraform-iac.collateral' not in x],
    OWNER_CLEAN, 'missing auth row')
mut('partial producer block', lambda r: [x for x in r if 'network-provisioning.representation' not in x],
    OWNER_CLEAN, 'missing producer row')
mut('non-plan gate without position', lambda r: [x for x in r if 'gate.value-gate.position' not in x],
    OWNER_CLEAN, 'without position')
mut('gate without approver', lambda r: [x for x in r if 'approver.value-gate' not in x], OWNER_CLEAN,
    'without approver')
mut('no plan gate', lambda r: [x for x in r if 'approver.program-plan' not in x], OWNER_CLEAN, 'no program plan gate')
mut('unknown token', lambda r: r + [row('fabric.target', DECL)], OWNER_CLEAN, 'unknown token')
# B-2 / R2 (2026-10-12): an invented key is sorted mechanically — a declared restatement of item N, or a new decision.
mut('invented key, declared: restates item N', lambda r: r + [row('terraform-iac.colour', DECL)], OWNER_CLEAN,
    'invented key restates item 1 — key it terraform-iac.item-1')
mut('invented key, OPEN: asks a decision no key or item asks', lambda r: r + [row('terraform-iac.colour', 'OPEN — which colour; options: a · b', 'a · b')],
    OWNER_CLEAN + '\nterraform-iac.colour — which colour — options: a · b — governs: P2 — tier: blocking', 'invented key asks a decision')
mut('invented key, OPEN, MENTIONING an item in its question: still a new decision (Z60 shape)',
    lambda r: r + [row('terraform-iac.sender-blocks', 'OPEN — item 3 names one block; which blocks are in scope; options: a · b', 'a · b')],
    OWNER_CLEAN + '\nterraform-iac.sender-blocks — q — options: a · b — governs: P2 — tier: blocking', 'invented key asks a decision')
mut('item row, well-formed: clean', lambda r: r + [row('terraform-iac.item-7', '(declared — item 7: "x")', '—')], OWNER_CLEAN,
    'item row', 0)
mut('item row with a letter suffix, well-formed: clean', lambda r: r + [row('terraform-iac.item-7b', '(declared — item 7: "x")', '—')],
    OWNER_CLEAN, 'item row', 0)
mut('item row OPEN: error', lambda r: r + [row('terraform-iac.item-7', 'OPEN — q; options: —', '—')],
    OWNER_CLEAN + '\nterraform-iac.item-7 — q — options: — — governs: P2 — tier: blocking', 'item row is not declared')
mut('item row citing another item first: error', lambda r: r + [row('terraform-iac.item-7', '(declared — item 8: "x")', '—')],
    OWNER_CLEAN, 'item row cites another item')
mut('item row with options other than "—": error', lambda r: r + [row('terraform-iac.item-7', '(declared — item 7: "x")', 'a · b')],
    OWNER_CLEAN, 'item row options are not')
mut('item row listed not-applicable: error', lambda r: r,
    OWNER_CLEAN + '\nterraform-iac.item-7 — q — options: — — governs: P2 — tier: not-applicable — no reason', 'item row listed not-applicable')


def item_row_overlap_is_read():
    # Q4 (2026-10-12): an item row for an item a registry row of the same leg also cites is a READ, never an error —
    # deleting it would remove a citation, which the correction's no-fall guard refuses. Another leg's citation is not overlap.
    rows = clean_rows() + [row('terraform-iac.item-1', DECL, '—'), row('network-provisioning.item-1', '(declared — item 1: "y")', '—'),
                           row('terraform-iac.item-9', '(declared — item 9: "z")', '—')]
    e, r = errs(build([x.replace(DECL, '(declared — item 5: "x")') if 'network-provisioning.' in x and '.item-' not in x else x for x in rows], OWNER_CLEAN))
    assert e == [], e
    hits = [x for x in r if x['what'].startswith('item row for an item a registry row')]
    assert [x['id'] for x in hits] == ['terraform-iac.item-1'], r
    assert 'terraform-iac.target' in hits[0]['rows'], hits


t('item row overlapping a registry row of the same leg is a READ, not an ERROR (Q4)', item_row_overlap_is_read)
mut('duplicate row', lambda r: r + [row('terraform-iac.target', DECL)], OWNER_CLEAN, 'duplicate row')
mut('source not one of the four forms', lambda r: [x.replace(DECL, 'fixed by gate kind') if 'gate.value-gate' in x else x for x in r],
    OWNER_CLEAN, 'four forms')
mut('forced on an ineligible key', lambda r: [x.replace(DECL, '(forced — item 2) → gap') if 'terraform-iac.collateral' in x else x for x in r],
    OWNER_CLEAN + '\n- terraform-iac.collateral — q — options: x — governs: P2 — tier: default', 'ineligible', 1)
mut('OPEN row missing from owner block', lambda r: [x.replace(DECL, 'OPEN — q; options: a · b') if 'terraform-iac.existing-grant' in x else x for x in r],
    OWNER_CLEAN, 'missing from the owner block')
mut('wrong tier', lambda r: r, OWNER_CLEAN.replace('tier: default', 'tier: blocking'), 'wrong tier')
mut('owner line for a declared row', lambda r: r,
    OWNER_CLEAN + '\n- terraform-iac.target — q — options: — — governs: P2 — tier: blocking', 'not owed')
mut('owner "none" with a forced row', lambda r: r, 'none — every row is declared.', 'reads "none"')
mut('auth row listed not-applicable on an authorisation leg', lambda r: [x for x in r if 'terraform-iac.collateral' not in x],
    OWNER_CLEAN + '\n- terraform-iac.collateral — q — options: — — governs: P2 — tier: not-applicable', 'deleting ANY')
mut('must-stay-reachable listed not-applicable',
    lambda r: r + [row('network-provisioning.covered-routes', DECL)],
    OWNER_CLEAN + '\n- network-provisioning.must-stay-reachable — q — options: — — governs: P1 — tier: not-applicable',
    'never deleted')


def na_counts_as_accounted():
    rows = clean_rows() + [row('network-provisioning.must-stay-reachable', DECL)]
    owner = OWNER_CLEAN + '\n- network-provisioning.covered-routes — q — options: — — governs: P1 — tier: not-applicable'
    e, r = errs(build(rows, owner))
    assert e == [], f'covered-routes not-applicable + must-stay-reachable row must be clean, got {e}'
    assert any('not-applicable' in x['what'] for x in r), 'the not-applicable line must be listed to read'


t('not-applicable accounts for a routing key and is listed to read', na_counts_as_accounted)


def class_absent_is_read_not_error():
    e, r = errs(build(clean_rows(), OWNER_CLEAN))
    assert e == [] and any('no routing rows' in x['what'] for x in r), f'routing absence must be READ, got {e} {r}'


t('a class with no rows at all is READ, never an error', class_absent_is_read_not_error)


def regression_run2():
    # Fixture copy (2026-10-14): the original lives in cline_docs/follow-ups/, which never exports, so public CI failed
    # on it. Byte-identical copy; the original stays as the owner-answer guide's worked example.
    p = os.path.join(HERE, 'fixtures', 'requirements-coverage', 'telemetry-export-t1zero-run2-draft.md')
    e, _ = errs(open(p, encoding='utf-8').read())
    w = whats(e)
    assert w.count('missing auth row') == 9, w            # principal-unseen ×3 + request-path ×3 + enforcer-scope ×3, all added after this run
    assert sum(1 for x in e if x.get('key') == 'request-path') == 3, e   # Z49 (2026-10-10): one per authorisation leg
    assert sum(1 for x in e if x.get('key') == 'enforcer-scope') == 3, e   # group 4 (2026-10-12): one per authorisation leg, by construction
    assert w.count('source is not one of the four forms') == 4, w   # the four gate positions "fixed by gate kind"
    assert w.count('wrong tier in owner block') == 2, w   # representation (hybrid) + inputs-empty ("OPEN structurally")
    assert len(e) == 15, w


t('regression: worked-example zero-decision draft (the step-3 deviations, found mechanically)', regression_run2)


def regression_published():
    p = os.path.expanduser('~/paichart/program-artifacts/telemetry-export-genspec-t1zero-v2/requirements.md')
    if not os.path.exists(p):
        print('     (skipped: public repo not present)')
        return
    e, _ = errs(open(p, encoding='utf-8').read())
    # Z49 (2026-10-10) and group 4 (2026-10-12): the spec predates `request-path` and `enforcer-scope` — one missing row
    # each per authorisation leg, nothing else new.
    pre = [x for x in e if not (x['what'] == 'missing auth row' and x.get('key') in ('request-path', 'enforcer-scope'))]
    assert len(e) - len(pre) == 6, e
    assert whats(pre) == ['owner block reads "none" but the table has non-declared rows'], e


t('regression: published t1zero-v2 — the 2026-10-01 waiver finding #2, found mechanically', regression_published)


# ── 2026-10-09 parser fix (retrospective TS §4.1): the CANONICAL owner-block line has no bullet and carries its
# reason AFTER the tier. Each test below is red on the old parser (bullet required, tier end-anchored).
CANON_NA = 'terraform-iac.collateral — what else changes — options: — — governs: P2 — tier: not-applicable — reason here'


def canonical_unbulleted_na_is_read():
    rows = [x for x in clean_rows() if 'terraform-iac.collateral' not in x]
    e, r = errs(build(rows, OWNER_CLEAN + '\n' + CANON_NA))
    assert any('deleting ANY' in x['what'] for x in e), f'an unbulleted not-applicable line with a reason must be read, got {e}'


t('canonical owner line (no bullet, reason after the tier) is read', canonical_unbulleted_na_is_read)


def bulleted_na_with_reason_is_read():
    rows = [x for x in clean_rows() if 'terraform-iac.collateral' not in x]
    e, r = errs(build(rows, OWNER_CLEAN + '\n- ' + CANON_NA))
    assert any('deleting ANY' in x['what'] for x in e), f'a bulleted not-applicable line with a reason must be read, got {e}'


t('bulleted owner line with a reason after the tier is read', bulleted_na_with_reason_is_read)


def unbulleted_default_tier_is_read():
    e, r = errs(build(clean_rows(), 'network-provisioning.inputs-empty — q — options: gap — governs: P1 — tier: default'))
    assert e == [], f'an unbulleted default line must satisfy the forced row, got {e}'


t('canonical unbulleted default-tier line satisfies its row', unbulleted_default_tier_is_read)


def must_stay_reachable_na_on_non_routing_leg_is_clean():
    owner = (OWNER_CLEAN + '\n- network-provisioning.covered-routes — q — options: — — governs: P1 — tier: not-applicable — no routes'
             + '\n- network-provisioning.must-stay-reachable — q — options: — — governs: P1 — tier: not-applicable — no routes')
    e, r = errs(build(clean_rows(), owner))
    assert e == [], f'a non-routing leg may list must-stay-reachable not-applicable, got {e}'


t('must-stay-reachable not-applicable on a NON-routing leg is not an error (latent FP)',
  must_stay_reachable_na_on_non_routing_leg_is_clean)

def options_replaced_is_error():
    rows = [x for x in clean_rows() if 'network-provisioning.representation' not in x]
    rows.append(row('network-provisioning.representation', DECL, 'one named identity · a set of named identities'))
    e, _ = errs(build(rows, OWNER_CLEAN))
    assert whats(e) == ['options cell differs from the registry'], e


t('options cell replaced (Z5 class) is an error', options_replaced_is_error)


def options_annotated_is_clean():
    rows = [x for x in clean_rows() if 'terraform-iac.existing-grant' not in x]
    rows.append(row('terraform-iac.existing-grant', DECL, 'replace · preserve · preserve-bounded (state the bound)'))
    e, _ = errs(build(rows, OWNER_CLEAN))
    assert e == [], e


t('options cell with the skeleton\'s annotation is clean', options_annotated_is_clean)


def options_dash_where_enumerated_is_error():
    rows = [x for x in clean_rows() if 'terraform-iac.target-empty' not in x]
    rows.append(row('terraform-iac.target-empty', DECL, '—'))
    e, _ = errs(build(rows, OWNER_CLEAN))
    assert whats(e) == ['options cell differs from the registry'], e


t('an enumerated row written with "—" options is an error', options_dash_where_enumerated_is_error)


TRIAL = os.path.join(HERE, '..', '.claude', 'skills', 'requirements-spec', 'work', 'log-archive-namespace-write-2026-10-09')


def regression_trial_gen9():
    e, r = errs(open(os.path.join(TRIAL, 'draft-answered-8', 'report.md'), encoding='utf-8').read())
    w = whats(e)
    # R1 → B-2 (2026-10-12): the three Author-added rows now read as restatements of items 18, 21, 21 (each a declared
    # row whose leading citation is that item), not "unknown key"; and enforcer-scope (group 4) adds one missing auth
    # row per authorisation leg by construction (2 legs).
    assert [x for x in w if x.startswith('invented key')] == ['invented key restates item 18 — key it terraform-iac.item-18',
                                                              'invented key restates item 21 — key it terraform-iac.item-21',
                                                              'invented key restates item 21 — key it terraform-iac.item-21'], w
    assert sum(1 for x in e if x.get('key') == 'enforcer-scope') == 2, e
    assert sum('deleting ANY' in x for x in w) == 1, w                 # the one real Z17 (target-absent infers auth)
    assert sum(1 for x in e if x['what'] == 'missing auth row' and x.get('key') == 'request-path') == 2, e  # Z49: predates the key
    assert len(e) == 8, w
    assert sum('not-applicable — read' in x['what'] for x in r) == 12, r   # all 12 not-applicable lines now read


t('regression: trial generation 9 — 3 restatements + Z17 + 2 request-path + 2 enforcer-scope, 12 not-applicable lines read', regression_trial_gen9)


def regression_trial_zero():
    e, _ = errs(open(os.path.join(TRIAL, 'draft-zero', 'report.md'), encoding='utf-8').read())
    w = whats(e)
    assert w.count('row is both in the table and listed not-applicable') == 3, w   # Z1 ×2 (gate positions) + Z3
    assert any('deleting ANY' in x for x in w), w                                  # Z3: auth row deleted on an auth leg


t('regression: trial zero draft — Z1 and Z3 found mechanically (were invisible to the old parser)', regression_trial_zero)

def merge_reads_the_canonical_bare_owner_block():
    # Z46 (2026-10-09; fixed 2026-10-11): build-answered-objective.py had its own owner-block parser that required a
    # `- ` bullet, so the canonical bare form was refused ("no owner-block row ids found"). It now uses THIS script's
    # parser. Pinned on the draft that was refused: the bare and the hand-bulleted copies must merge to the same bytes,
    # and those bytes are the answered objective the Z49 Phase D run actually used.
    import subprocess
    import tempfile
    w = os.path.join(HERE, '..', '.claude', 'skills', 'requirements-spec', 'work', 'log-archive-namespace-read-2026-10-09')
    outs = []
    for draft in ('report.md', 'report.owner-block-bulleted.md'):
        with tempfile.TemporaryDirectory() as d:
            o = os.path.join(d, 'o.txt')
            p = subprocess.run([sys.executable, os.path.join(HERE, 'build-answered-objective.py'),
                                '--base', os.path.join(w, 'objective-base.txt'), '--answers', os.path.join(w, 'answers.md'),
                                '--draft', os.path.join(w, 'draft-zero', draft), '--out', o], capture_output=True, text=True)
            assert p.returncode == 0, (draft, p.stderr)
            outs.append(open(o, encoding='utf-8').read())
    assert outs[0] == outs[1], 'bare and bulleted owner blocks merged differently'
    assert outs[0] == open(os.path.join(w, 'objective-answered.txt'), encoding='utf-8').read(), 'merge differs from the published answered objective'


t('Z46: the merge script reads the canonical bare owner block (one parser, shared)', merge_reads_the_canonical_bare_owner_block)


def merge_refuses_non_item_lines_inside_a_group():
    # Z58 (2026-10-11; fixed 2026-10-12): rationale under `####` inside a group and a map table after the last group were
    # merged INTO items 6/11/15/20/21 with a ✅. Now refused, line named. Built from the canonical log-archive answers
    # (which still merges — the first assertion) by moving its rationale and map into the groups, as the trap file did.
    import subprocess
    import tempfile
    w = os.path.join(HERE, '..', '.claude', 'skills', 'requirements-spec', 'work', 'log-archive-namespace-read-2026-10-09')
    good = open(os.path.join(w, 'answers.md'), encoding='utf-8').read()

    def merge(answers):
        with tempfile.TemporaryDirectory() as d:
            ap = os.path.join(d, 'a.md'); open(ap, 'w', encoding='utf-8').write(answers)
            return subprocess.run([sys.executable, os.path.join(HERE, 'build-answered-objective.py'), '--base',
                                   os.path.join(w, 'objective-base.txt'), '--answers', ap, '--draft',
                                   os.path.join(w, 'draft-zero', 'report.md')], capture_output=True, text=True)
    assert merge(good).returncode == 0, 'the canonical answers file must still merge'
    trap = good.replace('## Owner rationale', '#### Owner rationale').replace('## Row → item map\n', '')
    p = merge(trap)
    assert p.returncode == 1 and 'sits after an item and would be merged into it' in p.stderr, p.stderr[-600:]
    assert '#### Owner rationale' in p.stderr and '<!-- ROW-ITEM-MAP -->' in p.stderr, p.stderr[-600:]


t('Z58: a heading, table row or comment inside a group is refused, never merged into an item', merge_refuses_non_item_lines_inside_a_group)

print(f'\n✅ Passed: {passed}')
if failed:
    print(f'❌ Failed: {failed}')
    sys.exit(1)
