#!/usr/bin/env python3
"""Tests for scripts/publish-generated-spec.py `prepare` (2026-10-08). Offline; dry runs only (never --write).

Source = the PUBLISHED t1zero-v2 requirements.md (rules already spliced; --insert is idempotent), objective + waiver from
scripts/fixtures/publish-spec/. T1 proves the pass is idempotent on a published spec (re-staged files byte-identical);
T2–T7 each prove one refusal. The full source rebuild (fetch cmunrlf23 → prepare → 3 files byte-identical to the
published directory) was run once on 2026-10-08 and is recorded in the register (it needs a prod read).
Skips cleanly when ~/paichart is absent.
"""
import os, re, subprocess, sys, tempfile, glob

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.expanduser('~/paichart/program-artifacts/telemetry-export-genspec-t1zero-v2')
OBJ = os.path.join(HERE, 'fixtures', 'publish-spec', 'objective-t1zero-v2.txt')
WAIVER = os.path.join(HERE, 'fixtures', 'publish-spec', 'waiver-t1zero-v2.md')
SCRIPT = os.path.join(HERE, 'publish-generated-spec.py')
BANNER = ('> ⚠ **NOT RELEASED — quality gate: needs-revision**\n> This document is the composed draft deliverable exactly '
          'as produced; the run\'s release gate did not clear it. The verdict and its blocking reasons are stamped on '
          'the pipeline task (quality-gate metadata and final comment).\n\n')
passed = failed = 0

if not os.path.isdir(PUB):
    print('skipped: ~/paichart not present'); sys.exit(0)
SRC = open(os.path.join(PUB, 'requirements.md'), encoding='utf-8').read()


ANSWERS = os.path.join(HERE, 'fixtures', 'publish-spec', 'answers-no-map.md')


def prepare(src_text, name='test-publish-dryrun', waiver=True, record='{"attempted": false}', pre=None,
            objective=OBJ, answers=ANSWERS, extra=()):
    """Stages the source the way `fetch` leaves it: report.md + author-correction.json (+ the pre-correction draft)."""
    d = tempfile.mkdtemp(prefix='publish-src-')
    src = os.path.join(d, 'report.md')
    open(src, 'w', encoding='utf-8').write(src_text)
    if record is not None:
        open(os.path.join(d, 'author-correction.json'), 'w', encoding='utf-8').write(record)
    if pre is not None:
        open(os.path.join(d, 'requirements.pre-correction.md'), 'w', encoding='utf-8').write(pre)
    cmd = ['python3', SCRIPT, 'prepare', '--source', src, '--objective', objective, '--answers', answers, '--name', name,
           '--topology-from', 'telemetry-export-genspec-t1zero', *extra]
    if waiver:
        cmd += ['--waiver', WAIVER]
    p = subprocess.run(cmd, capture_output=True, text=True)
    import shutil; shutil.rmtree(d, ignore_errors=True)
    return p.returncode, p.stdout + p.stderr


def t(name, fn):
    global passed, failed
    try:
        fn(); passed += 1; print(f'  ✅ {name}')
    except AssertionError as e:
        failed += 1; print(f'  ❌ {name}\n     {str(e)[:400]}')


def t1():
    code, out = prepare(BANNER + SRC + '\nConfidence: 88\n')
    assert code == 0, out[-600:]
    d = re.search(r'DRY RUN — staged in (\S+)', out).group(1)
    for f in ('requirements.md', 'topology.json'):
        assert open(os.path.join(d, f), 'rb').read() == open(os.path.join(PUB, f), 'rb').read(), f'{f} differs'
    # Group 3a (2026-10-12): the program view's reading notes gained one sentence (the not-applicable owner rows are
    # listed only in the full copy). A published view is frozen, so the rebuild differs from it by exactly that.
    new, old = (open(os.path.join(x, 'requirements.program.md'), encoding='utf-8').read() for x in (d, PUB))
    added = ', except that the\nrows of *Decisions needed from the owner* ruled not applicable are listed only there.'
    assert new.replace(added, '.') == old, 'requirements.program.md differs from the published view beyond the 3a reading-notes sentence'


def refuses(src, needle, **kw):
    def fn():
        code, out = prepare(src, **kw)
        assert code == 1 and needle in out, f'expected exit 1 with "{needle}", got {code}: {out[-500:]}'
    return fn


t('T1 banner + Confidence stripped under waiver; staged files byte-identical to the published spec', t1)
t('T2 banner without a waiver ⇒ refused', refuses(BANNER + SRC, 'publishable only under an owner waiver', waiver=False))
t('T3 an existing (published) directory name ⇒ refused', refuses(SRC, 'never edit a published spec',
                                                                  name='telemetry-export-genspec-t1zero-v2'))
t('T4 a harvested-looking address in the body ⇒ lint stops it',
  refuses(SRC.replace('## Program scope', '## Program scope\n\nThe exporter is 10.250.7.9.\n', 1), 'harvested-state pre-filter'))
t('T5 an OPEN decision in the owner block ⇒ refused',
  refuses(re.sub(r'(## Decisions needed from the owner\n\n)none[^\n]*', r'\1- terraform-iac.collateral — q — options: a · b — governs: P3 — tier: blocking', SRC, count=1),
          'never publishable'))
t('T6 banner text not in the platform\'s exact shape ⇒ refused, never stripped by guess',
  refuses(SRC.replace('## Program scope', '> NOT RELEASED — quality gate: needs-revision (edited)\n\n## Program scope', 1),
          'never strip by guess'))
t('T7 coverage ERROR without a waiver ⇒ refused', refuses(SRC, 'coverage check has ERRORS', waiver=False))

def t8():
    k = os.path.join(HERE, '..', '.claude', 'skills', 'requirements-spec')
    links = [os.path.join(k, sub, f) for sub in ('scripts', 'docs') for f in os.listdir(os.path.join(k, sub))
             if f != '__pycache__']   # Python's bytecode cache (git-ignored) appears when a linked script is imported
    assert len(links) == 9, f'expected 9 links in the skill folder, found {len(links)}'
    for l in links:
        assert os.path.islink(l), f'{l} must be a symlink (never a copy — copies drift)'
        assert os.path.exists(l), f'{l} is a broken link — re-point it in the same commit as the move'
    assert os.path.isdir(os.path.join(k, 'work')), 'work/ missing'


t('T8 the packaged skill folder: 9 links, all symlinks, none broken; work/ present', t8)

# ── Phase 4 group 1 (2026-10-12): the enforced READS — both directions ──────────────────────────────────────────
OBJ99 = tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8')
OBJ99.write(open(OBJ, encoding='utf-8').read().rstrip('\n') + '\n99. The package states the zebra quotient.\n'); OBJ99.close()
ANS99 = tempfile.NamedTemporaryFile('w', suffix='.md', delete=False, encoding='utf-8')
ANS99.write('<!-- ROW-ITEM-MAP -->\n| `kubernetes-gitops.collateral` | 99 |\n'); ANS99.close()
FLAG = dict(objective=OBJ99.name, answers=ANS99.name)


def passes(src, needle, **kw):
    def fn():
        code, out = prepare(src, **kw)
        assert code == 0 and needle in out, f'expected exit 0 with "{needle}", got {code}: {out[-700:]}'
    return fn


t('T9 no correction record beside --source (a hand-copied report.md) ⇒ refused', refuses(SRC, 'author-correction.json is missing', record=None))
t('T10 a dropped-clause flag not named ⇒ refused (READ it; a real drop means regenerate)', refuses(SRC, 'must each be READ', **FLAG))
t('T11 the same flag named exactly in --clause-read (item:leg:anchor) ⇒ passes, recorded', passes(SRC, 'dropped clauses: 1 flag(s), each READ', extra=('--clause-read', '99:kubernetes-gitops:zebra quotient'), **FLAG))
t('T11b the item:leg alone (no anchor) does not name the flag ⇒ refused', refuses(SRC, 'must each be READ', extra=('--clause-read', '99:kubernetes-gitops'), **FLAG))
t('T11c a DIFFERENT anchor on the same item:leg is a new read ⇒ refused', refuses(SRC, 'must each be READ', extra=('--clause-read', '99:kubernetes-gitops:zebra other'), **FLAG))
t('T12 --waiver never clears a clause flag (T10 runs WITH the waiver)', refuses(SRC, 'must each be READ', waiver=True, **FLAG))
t('T13 a stale --clause-read name with no flag ⇒ refused', refuses(SRC, 'remove the stale names', extra=('--clause-read', '99:kubernetes-gitops:zebra quotient')))
PAD = '\n' + '\n'.join(f'- Filler obligation line {i}: the leg keeps this sentence for the test.' for i in range(260)) + '\n'
BIG = SRC.replace('## Pipeline 2 objective', PAD + '\n## Pipeline 2 objective', 1)
REC_ADOPTED = '{"attempted": true, "adopted": true}'
t('T14 an ADOPTED size correction that shrank a leg ⇒ refused until the shrunk section is READ',
  refuses(SRC, 'shrank these sections', record=REC_ADOPTED, pre=BIG))
t('T15 the shrunk section named in --correction-diff-read ⇒ passes, recorded',
  passes(SRC, 'correction diff read: 1 shrunk section(s) READ', record=REC_ADOPTED, pre=BIG,
         extra=('--correction-diff-read', 'Pipeline 1 objective')))
t('T16 a NOT-adopted correction (the delivered text IS the original) needs no diff read',
  passes(SRC, 'dropped clauses: 0 flags', record='{"attempted": true, "adopted": false}', pre=SRC))
t('T17 --correction-diff-read with no adopted correction ⇒ refused', refuses(SRC, 'no in-run correction was adopted', extra=('--correction-diff-read', 'Approvals')))
# Z66 review F2: an adopted correction whose citation count FELL (rule 4: a merged duplicate row) needs the diff read
# too, with the Design decisions table in scope; a size-fitting draft, so only the citation arm can trigger it.
DD_PRE = SRC.replace('## Design decisions\n', '## Design decisions\n\n| `kubernetes-gitops.merged-away` | a row the correction merged | — | a | (declared) |\n', 1)
assert DD_PRE != SRC
REC_CIT_FELL = '{"attempted": true, "adopted": true, "measuresBefore": {"citationsTotal": 27}, "measuresAfter": {"citationsTotal": 26}}'
t('T14b an ADOPTED correction whose citation count fell, Design decisions shrank ⇒ refused until READ',
  refuses(SRC, 'with fewer citations (27 → 26) and shrank these sections', record=REC_CIT_FELL, pre=DD_PRE))
t('T15b Design decisions named in --correction-diff-read ⇒ passes, recorded',
  passes(SRC, 'correction diff read: 1 shrunk section(s) READ', record=REC_CIT_FELL, pre=DD_PRE,
         extra=('--correction-diff-read', 'Design decisions')))
t('T15c the same shrink with the citation count unchanged (no size failure) ⇒ no read owed',
  passes(SRC, 'dropped clauses: 0 flags', record=REC_CIT_FELL.replace('"citationsTotal": 26', '"citationsTotal": 27'), pre=DD_PRE))
t('T18 attempted, but the pre-correction draft missing ⇒ refused', refuses(SRC, 'is missing — re-run `fetch`', record='{"attempted": true}'))

OWNER_COMMENT = ('<!-- one line per row that is not simply declared:\n<row id> — <question> — options: <enum> — governs: '
                 '<which leg clause> — tier: blocking | confirm | default | not-applicable -->\n')
_OWN = re.search(r'^## Decisions needed from the owner\n\n', SRC, re.M)


def _with_owner_comment(comment):
    assert _OWN, 'fixture has no owner block heading'
    return SRC[:_OWN.end()] + comment + SRC[_OWN.end():]


def t19():
    code, out = prepare(_with_owner_comment(OWNER_COMMENT))
    assert code == 0, out[-600:]
    assert 'removed the template\'s format comment' in out, out[-600:]
    d = re.search(r'DRY RUN — staged in (\S+)', out).group(1)
    staged = open(os.path.join(d, 'requirements.md'), encoding='utf-8').read()
    assert '<!-- one line per row' not in staged and 'tier: blocking |' not in staged, 'comment survived'


t('T19 the template\'s owner-block format comment ⇒ removed, not read as a blocking row (Z65)', t19)
t('T20 any OTHER comment in the owner block ⇒ refused, never stripped by guess',
  refuses(_with_owner_comment('<!-- tier: blocking -->\n'), 'never strip by guess'))
for f in (OBJ99.name, ANS99.name):
    os.unlink(f)

for d in glob.glob('/tmp/publish-test-publish-dryrun-*'):
    subprocess.run(['rm', '-rf', d])
print(f'\n✅ Passed: {passed}')
if failed:
    print(f'❌ Failed: {failed}'); sys.exit(1)
