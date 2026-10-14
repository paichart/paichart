#!/usr/bin/env python3
"""Tests for scripts/check-requirements-clauses.py (2026-10-09). Calibration on the blind trial's 8 answered drafts is
the known-answer set (ME A3): fires on gens 2 and 3 (Z13/Z14) and gen 6 (an unrecorded drop, verified by hand); silent
on gens 4, 5, 7, 8, 9. Run: npm run test:requirements-clauses
"""
import os
import sys

HERE = os.path.dirname(os.path.realpath(__file__))
sys.path.insert(0, HERE)
import importlib.util
spec = importlib.util.spec_from_file_location('cl', os.path.join(HERE, 'check-requirements-clauses.py'))
cl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cl)

TRIAL = os.path.join(HERE, '..', '.claude', 'skills', 'requirements-spec', 'work', 'log-archive-namespace-write-2026-10-09')
ANSWERS = open(os.path.join(TRIAL, 'answers.md'), encoding='utf-8').read()
passed = failed = 0


def t(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print(f'  ✅ {name}')
    except AssertionError as e:
        failed += 1
        print(f'  ❌ {name}: {e}')


def run(d):
    p = os.path.join(TRIAL, d)
    return cl.check(open(os.path.join(p, 'objective.txt')).read(), ANSWERS, open(os.path.join(p, 'report.md')).read())


EXPECT = {'draft-answered': {21}, 'draft-answered-2': {21}, 'draft-answered-3': set(), 'draft-answered-4': set(),
          'draft-answered-5': {21}, 'draft-answered-6': set(), 'draft-answered-7': set(), 'draft-answered-8': set()}
for d, want in EXPECT.items():
    def fn(d=d, want=want):
        dropped, checked = run(d)
        got = {x['item'] for x in dropped}
        assert checked >= 3 and got == want, f'expected items {want}, got {dropped}'
    t(f'calibration: {d} drops {sorted(want) or "nothing"}', fn)

OBJ = '1. The target is `x`.\n2. The bucket leg adds Allow statements only, and the package states what else, if anything, the change affects.\n\n'
ANS = '<!-- ROW-ITEM-MAP -->\n| `terraform-iac.target` | 1 |\n| `terraform-iac.collateral` | 2 |\n'


def doc(p2):
    return f'# S\n\n## Design decisions\n\n## Decisions needed from the owner\n\nnone\n\n## Pipeline 1 objective — terraform-iac\n\n{p2}\n\n## Acceptance\n'


def synthetic_drop():
    d, _ = cl.check(OBJ, ANS, doc('Adds an Allow only (item 2).'))
    assert [x['item'] for x in d] == [2], d


def synthetic_reach_reordered():
    d, _ = cl.check(OBJ, ANS, doc('Adds an Allow only. The package has a section on what, if anything, else the change affects.'))
    assert d == [], d


def host_list_is_not_a_verb():
    d, _ = cl.check('1. The value is expressed as a host list - each address.\n\n', '<!-- ROW-ITEM-MAP -->\n| `kubernetes-gitops.representation` | 1 |\n',
                    doc('').replace('terraform-iac', 'kubernetes-gitops'))
    assert d == [], d


# Z48 / Z49 lab L10 (2026-10-10): the three paraphrase false positives, each red on the old scorer.
OBJ_Z48 = ('1. The cluster leg is read-and-publish: it reads the pods\' addresses and publishes them, and writes nothing.\n'
           '2. The bound is a Deny for any address not in the host list — the same list the Allow uses.\n'
           '3. The cloud leg names this effect in its package.\n\n')
ANS_Z48 = ('<!-- ROW-ITEM-MAP -->\n| `kubernetes-gitops.target` | 1 |\n| `terraform-iac.existing-grant` | 2 |\n'
           '| `terraform-iac.collateral` | 3 |\n')


def doc2(p1, p2):
    return (f'# S\n\n## Design decisions\n\n## Decisions needed from the owner\n\nnone\n\n'
            f'## Pipeline 1 objective — kubernetes-gitops\n\n{p1}\n\n## Pipeline 2 objective — terraform-iac\n\n{p2}\n\n## Acceptance\n')


def z48_pronoun_object_not_anchored():
    d, _ = cl.check(OBJ_Z48, ANS_Z48, doc2('Reads the pods and publishes the host list.', 'The package contains a section headed Effect on other readers. Deny outside the same list.'))
    assert not [x for x in d if x['item'] == 1], d


def z48_noun_list_not_an_obligation():
    d, _ = cl.check(OBJ_Z48, ANS_Z48, doc2('Publishes the host list.', 'The package names the effect. A Deny for addresses not in that list.'))
    assert not [x for x in d if x['item'] == 2], d


def z48_preposition_not_in_anchor():
    d, _ = cl.check(OBJ_Z48, ANS_Z48, doc2('Publishes the host list.', 'The package contains a section headed `Effect on other readers`.'))
    assert not [x for x in d if x['item'] == 3], d


def z48_real_drop_still_caught():
    d, _ = cl.check(OBJ_Z48, ANS_Z48, doc2('Publishes the host list.', 'Writes the Deny.'))
    assert [x['item'] for x in d] == [3], d


# Group 2 (2026-10-11, Phase 4 attempt 1, Z61): the four paraphrase false positives of runs 2-3, each red on the old
# scorer, and the same obligations really dropped, which must still be caught.
OBJ_G2 = ('1. If no pod qualifies, the kubernetes-gitops leg reports a gap naming what was absent. If no sender set is '
          'published, the observability-config leg reports the upstream gap.\n'
          '2. The leg lists each one in its deliverable as unchanged by owner decision.\n'
          '3. If a block is shared, it reports a gap instead of widening the change.\n\n')
ANS_G2 = ('<!-- ROW-ITEM-MAP -->\n| `kubernetes-gitops.inputs-empty` | 1 |\n| `observability-config.upstream-empty` | 1 |\n'
          '| `observability-config.existing-grant` | 2 |\n| `observability-config.collateral` | 3 |\n')


def doc3(p1, p2):
    return (f'# S\n\n## Design decisions\n\n## Decisions needed from the owner\n\nnone\n\n'
            f'## Pipeline 1 objective — kubernetes-gitops\n\n{p1}\n\n## Pipeline 2 objective — observability-config\n\n{p2}\n\n## Acceptance\n')


def g2_paraphrases_reach():
    d, _ = cl.check(OBJ_G2, ANS_G2, doc3('It publishes a gap report that names what was absent.',
                                         'Blocks are left unchanged and listed in the deliverable as unchanged by owner decision. '
                                         'Report a gap for that endpoint and do not widen the change. '
                                         'Make no change and report the upstream gap.'))
    assert d == [], d


def g2_real_drops_still_caught():
    d, _ = cl.check(OBJ_G2, ANS_G2, doc3('Publishes nothing.', 'Replaces the blocks.'))
    got = sorted((x['item'], x['leg']) for x in d)
    assert got == [(1, 'kubernetes-gitops'), (1, 'observability-config'), (2, 'observability-config'),
                   (3, 'observability-config')], got


def g2_sentence_naming_a_leg_obliges_that_leg_only():
    d, checked = cl.check(OBJ_G2, ANS_G2, doc3('It publishes a gap report that names what was absent.',
                                               'Make no change and report the upstream gap.'))
    assert checked == 4 and not [x for x in d if x['item'] == 1], (checked, d)


# Checker fix 2 (2026-10-12, lab L11): the paraphrases that refused good size corrections (stored TA pairs, g4 + base
# arms), each red on the group-2 scorer, and the same obligations really dropped, which must still be caught.
OBJ_CF2 = ('1. If no pod qualifies, the kubernetes-gitops leg publishes no sender set and reports a gap naming what was '
           'absent.\n'
           '2. Blocks that forward other paths are left unchanged; the leg lists each one in its deliverable as unchanged '
           'by owner decision.\n'
           '3. The cloud leg names this effect in its package.\n\n')
ANS_CF2 = ('<!-- ROW-ITEM-MAP -->\n| `kubernetes-gitops.inputs-empty` | 1 |\n| `observability-config.non-sender-paths` | 2 |\n'
           '| `terraform-iac.collateral` | 3 |\n')


def doc4(p1, p2, p3):
    return (f'# S\n\n## Design decisions\n\n## Decisions needed from the owner\n\nnone\n\n'
            f'## Pipeline 1 objective — kubernetes-gitops\n\n{p1}\n\n## Pipeline 2 objective — observability-config\n\n{p2}\n\n'
            f'## Pipeline 3 objective — terraform-iac\n\n{p3}\n\n## Acceptance\n')


STANZA = 'Effect = "Deny"\nPrincipal = "*"'


def cf2_nested_participle_and_location_reach():
    d, _ = cl.check(OBJ_CF2, ANS_CF2, doc4('Publish no sender set, and report what was absent and what would have to exist.',
                                           'Non-sender blocks are left unchanged and listed as "unchanged by owner decision".',
                                           'report.md carries a section on the effect, in the package. ' + STANZA))
    assert d == [], d


def cf2_real_drops_still_caught():
    d, _ = cl.check(OBJ_CF2, ANS_CF2, doc4('Publish no sender set and report a gap.', 'Replaces the blocks.', STANZA))
    got = sorted((x['item'], x['leg']) for x in d)
    assert got == [(1, 'kubernetes-gitops'), (2, 'observability-config'), (3, 'terraform-iac')], got


def cf2_location_kept_when_object_is_one_word():
    # "effect" alone is in every terraform stanza: dropping "in its package" would make item 3 unfailable there.
    d, _ = cl.check(OBJ_CF2, ANS_CF2, doc4('Publish no sender set; report what was absent.', 'Listed as unchanged by owner decision.',
                                           'report.md carries a section on other readers. ' + STANZA))
    assert [(x['item'], x['anchor']) for x in d] == [(3, 'effect package')], d


# Execution-facts review of checker fix 2 (2026-10-12): the class BOUNDARIES. A participle after a determiner is a noun
# (C1) and an "in" phrase that is not a document place is part of what is reported (C3); each of these, really dropped,
# was caught before checker fix 2, passed silently under 664bd7d6, and must be caught again.
OBJ_CF2B = ('1. The observability-config leg publishes the recording rules for the sender set.\n'
            '2. The observability-config leg records the naming convention for each exporter.\n'
            '3. The observability-config leg states its reporting interval in seconds.\n'
            '4. The observability-config leg reports the change in membership since the last harvest.\n'
            '5. The observability-config leg records the decision in the audit log.\n\n')
ANS_CF2B = '<!-- ROW-ITEM-MAP -->\n' + ''.join(f'| `observability-config.r{i}` | {i} |\n' for i in range(1, 6))


def cf2_boundary_real_drops_caught():
    d, checked = cl.check(OBJ_CF2B, ANS_CF2B, doc3('Nothing.', 'Configure exporters for the metrics pipeline.'))
    got = sorted((x['item'], x['anchor']) for x in d)
    assert checked == 5 and got == [(1, 'recording rules'), (2, 'naming convention'), (3, 'reporting interval'),
                                    (4, 'change membership'), (5, 'decision audit')], (checked, got)


def cf2_boundary_paraphrases_reach():
    d, _ = cl.check(OBJ_CF2B, ANS_CF2B, doc3('Nothing.', 'It ships recording rules over the sender set, documents the '
                                             'exporter naming convention, gives the reporting interval, reports how '
                                             'membership changed since the last harvest, and writes the decision to '
                                             'the audit log.'))
    assert d == [], d


# False-alarm fixes (2026-10-12, size plan step 2): two CLOSED synonym sets. Each paraphrase below refused or flagged a
# good correction in lab L11 / its reruns and is red on checker fix 2 (4eb153c6); the real drops stay caught.
OBJ_FAF = ('1. The kubernetes-gitops leg reports, in its report.md, the literal criterion it applied.\n'
           '2. The terraform-iac leg names this effect in its package.\n\n')
ANS_FAF = ('<!-- ROW-ITEM-MAP -->\n| `kubernetes-gitops.population` | 1 |\n| `terraform-iac.collateral` | 2 |\n')


def doc5(p1, p2):
    return (f'# S\n\n## Design decisions\n\n## Decisions needed from the owner\n\nnone\n\n'
            f'## Pipeline 1 objective — kubernetes-gitops\n\n{p1}\n\n## Pipeline 2 objective — terraform-iac\n\n{p2}\n\n## Acceptance\n')


def faf_synonyms_reach():
    d, _ = cl.check(OBJ_FAF, ANS_FAF, doc5('report.md states verbatim the criterion applied.',
                                           'report.md carries `## Effect on other readers`.'))
    assert d == [], d
    d, _ = cl.check(OBJ_FAF, ANS_FAF, doc5('The exact criterion is quoted.', 'The deliverable states the effect.'))
    assert d == [], d


def faf_real_drops_still_caught():
    # the qualifier dropped; "report" as a VERB and "Expected output" beside a stanza's Effect are not the package
    d, _ = cl.check(OBJ_FAF, ANS_FAF, doc5('report.md states the criterion applied.',
                                           'The leg reports the gap.\nEffect = "Deny"\nExpected output: Effect Deny'))
    assert sorted((x['item'], x['anchor']) for x in d) == [(1, 'literal criterion'), (2, 'effect package')], d
    # execution-facts review P1/P2: the VERB "deliver" and the noun "delivery" are not the package (whole words only)
    for leg in ('- Effect `Allow` for the range delivered by Pipeline 1 via §6.',
                '- Effect = "Allow"; delivery of the policy is out-of-band.'):
        d, _ = cl.check(OBJ_FAF, ANS_FAF, doc5('report.md states the literal criterion applied.', leg))
        assert [(x['item'], x['anchor']) for x in d] == [(2, 'effect package')], (leg, d)


def faf_folded_anchor_needs_two_places():
    # review 1b: an anchor whose two words fold onto ONE word ("exact verbatim" -> literal, literal) is not satisfied by
    # that word once; it needs two places, or it would be the one-word anchor fix 2 forbids.
    obj = '1. The kubernetes-gitops leg states the exact verbatim text.\n\n'
    ans = '<!-- ROW-ITEM-MAP -->\n| `kubernetes-gitops.population` | 1 |\n'
    d, _ = cl.check(obj, ans, doc5('The leg writes literal text only.', 'Nothing.'))
    assert [(x['item'], x['anchor']) for x in d] == [(1, 'exact verbatim')], d
    d, _ = cl.check(obj, ans, doc5('The leg writes the exact text, verbatim.', 'Nothing.'))
    assert d == [], d


def not_applicable_item_skipped():
    draft = doc('Nothing.').replace('none', 'terraform-iac.collateral — q — options: — — governs: P1 — tier: not-applicable — no access granted')
    d, _ = cl.check(OBJ, ANS, draft)
    assert d == [], d


for n, f in [('synthetic: an obligation clause missing from its leg is dropped', synthetic_drop),
             ('synthetic: the anchor words reordered / separated still reach', synthetic_reach_reordered),
             ('"host list" is a noun, not the verb "list"', host_list_is_not_a_verb),
             ('Z48: a pronoun object ("publishes them") is not anchored', z48_pronoun_object_not_anchored),
             ('Z48: "the same list the Allow uses" — list is a noun, not an obligation', z48_noun_list_not_an_obligation),
             ('Z48: the anchor drops the preposition ("effect in" → "effect package")', z48_preposition_not_in_anchor),
             ('Z48: a real drop of the same obligation is still caught', z48_real_drop_still_caught),
             ('an item mapped only to not-applicable rows is skipped', not_applicable_item_skipped),
             ('group 2: "each one", "naming"/"names", "instead of widening"/"do not widen" reach their leg', g2_paraphrases_reach),
             ('group 2: the same obligations really dropped are still caught', g2_real_drops_still_caught),
             ('group 2: a sentence naming a leg is checked against that leg only', g2_sentence_naming_a_leg_obliges_that_leg_only),
             ('checker fix 2: a nested "naming what was absent" and a location-free "listed as unchanged by owner decision" reach',
              cf2_nested_participle_and_location_reach),
             ('checker fix 2: the same obligations really dropped are still caught', cf2_real_drops_still_caught),
             ('checker fix 2: a location phrase stays in a one-word object\'s anchor ("effect package")',
              cf2_location_kept_when_object_is_one_word),
             ('review C1/C3: "the recording rules", "the change in membership", "in the audit log" really dropped are caught',
              cf2_boundary_real_drops_caught),
             ('review C1/C3: the same obligations paraphrased reach their leg', cf2_boundary_paraphrases_reach),
             ('false-alarm fixes: "verbatim"/"exact" = "literal"; "report.md"/"deliverable" = "package"', faf_synonyms_reach),
             ('false-alarm fixes: the qualifier dropped, "report" as a verb, "output" by a stanza, "delivered"/"delivery", is still caught',
              faf_real_drops_still_caught),
             ('false-alarm fixes: an anchor folded onto one word needs two places', faf_folded_anchor_needs_two_places)]:
    t(n, f)

def row_item_map_json():
    spec2 = importlib.util.spec_from_file_location('rim', os.path.join(HERE, 'build-row-item-map.py'))
    rim = importlib.util.module_from_spec(spec2)
    spec2.loader.exec_module(rim)
    out = rim.build(ANSWERS)
    assert out['version'] == 1 and out['source'] == 'answers.md', out
    assert out['items']['21'] == ['terraform-iac.collateral'], out['items']['21']
    assert out['items']['9'] == ['gate.kubernetes-gitops-change.position'], out['items']['9']   # "(added …)" note stripped
    assert sorted(out['items']['15']) == ['kubernetes-gitops.inputs-empty', 'kubernetes-gitops.population-all-excluded']
    assert len(out['items']) == 21


t('build-row-item-map: the metadata JSON (version 1; notes stripped; one item → several rows)', row_item_map_json)

print(f'\n✅ Passed: {passed}')
if failed:
    print(f'❌ Failed: {failed}')
    sys.exit(1)
