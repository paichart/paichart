#!/usr/bin/env python3
"""Group 4 lab gate — BYTES BEFORE SPEND (Protocol 16 rule 4; LAB-PREREG P1-P5). $0, reads files only.

    python3 -I scripts/leg-replay-lab/inputs/2026-10-12-g4-registry/bytes-proof.py <baseDryRunDir> <g4DryRunDir> <render@3f8603a4> <render@G>

The base dry run comes from the BASE tree (release code), the g4 dry run from the main tree (G + L). renderDir = the
output of `render-requirements-texts.ts --commit <c> --out <dir>`. Every check prints PASS/FAIL; exit 1 on any FAIL.

 P1  base = production: the pinned production rows == the seed render at 3f8603a4 (protocol 1.9.0), and every base cell's
     protocol.md / author.template.md / reviewer.template.md == those pinned rows.
 P2  g4 = the build: every g4 cell's three texts == the seed render at the g4 text commit (g4.protocolVersion; 1.10.1 since the trim).
 P3  every edit op's NEW text is in the g4 system prompt(s) it targets and in no base one; its OLD text in base and not g4
     (protocol ops checked in the Author AND the Reviewer prompts); plus the pre-registered key strings, by role.
 P4  author.user.md is byte-identical across arms per node (the input edit applies to both).
 P5  item 22 is in LA's Author brief exactly once and in no TZ/TA prompt; the owner maps reach no prompt. (The objective
     of record and the Reviewer brief copy are proven by the dry run's input-edit report and suite test GR2.)
"""
import json, os, sys

base_run, g4_run, r_base, r_g4 = sys.argv[1:5]
EXP = os.path.dirname(os.path.abspath(__file__))
fails = 0


def rd(p):
    with open(p, encoding='utf-8', newline='') as f:
        return f.read()


def check(ok, what):
    global fails
    print(f"  {'PASS' if ok else 'FAIL'}  {what}")
    if not ok:
        fails += 1


exp = json.load(open(os.path.join(EXP, 'experiment.json')))
pinned_proto = rd(os.path.join(EXP, exp['baseline']['protocols']['requirements-authoring-protocol']['file']))
pinned = {t['role']: rd(os.path.join(EXP, t['file'])) for t in exp['baseline']['templates'].values()}
rb = {'protocol': rd(os.path.join(r_base, 'requirements-authoring-protocol.md')),
      'requirements_author': rd(os.path.join(r_base, 'requirements-author.template.md')),
      'requirements_reviewer': rd(os.path.join(r_base, 'requirements-reviewer.template.md'))}
rg = {'protocol': rd(os.path.join(r_g4, 'requirements-authoring-protocol.md')),
      'requirements_author': rd(os.path.join(r_g4, 'requirements-author.template.md')),
      'requirements_reviewer': rd(os.path.join(r_g4, 'requirements-reviewer.template.md'))}
vb = json.load(open(os.path.join(r_base, 'versions.json'))); vg = json.load(open(os.path.join(r_g4, 'versions.json')))
nodes = [n['id'] for n in exp['nodes']]

print('P1 base arm == production (seed render at 3f8603a4)')
pv = exp['g4'].get('protocolVersion', {'base': '1.9.0', 'g4': '1.10.0'})   # 1.10.1 since the trim (cb723f3b)
check(vb['protocolVersion'] == pv['base'] and vg['protocolVersion'] == pv['g4'], f"render versions {vb['protocolVersion']} / {vg['protocolVersion']} (expected {pv['base']} / {pv['g4']})")
check(pinned_proto == rb['protocol'], 'pinned production protocol row (1.9.0) == seed render at 3f8603a4')
check(pinned['requirements_author'] == rb['requirements_author'], 'pinned production Requirements Author row == seed render at 3f8603a4')
check(pinned['requirements_reviewer'] == rb['requirements_reviewer'], 'pinned production Requirements Reviewer row == seed render at 3f8603a4')
for n in nodes:
    d = os.path.join(base_run, n, 'base')
    check(rd(os.path.join(d, 'protocol.md')) == pinned_proto, f'{n}/base protocol.md == pinned production row')
    check(rd(os.path.join(d, 'author.template.md')) == pinned['requirements_author'], f'{n}/base author.template.md == pinned production row')
    check(rd(os.path.join(d, 'reviewer.template.md')) == pinned['requirements_reviewer'], f'{n}/base reviewer.template.md == pinned production row')

print(f"P2 g4 arm == the build (seed render at the g4 text commit, protocol {pv['g4']})")
for n in nodes:
    d = os.path.join(g4_run, n, 'g4')
    check(rd(os.path.join(d, 'protocol.md')) == rg['protocol'], f"{n}/g4 protocol.md == render ({pv['g4']})")
    check(rd(os.path.join(d, 'author.template.md')) == rg['requirements_author'], f'{n}/g4 author.template.md == render')
    check(rd(os.path.join(d, 'reviewer.template.md')) == rg['requirements_reviewer'], f'{n}/g4 reviewer.template.md == render')

print('P3 candidate text verbatim in every g4 prompt, absent from every base prompt')
edits = {'protocol': 'edits/g4-protocol.json', 'requirements_author': 'edits/g4-author-guidance.json', 'requirements_reviewer': 'edits/g4-reviewer-guidance.json'}
prompts = {'protocol': ['author.system.md', 'reviewer.system.md'], 'requirements_author': ['author.system.md'], 'requirements_reviewer': ['reviewer.system.md']}
for kind, f in edits.items():
    spec = json.load(open(os.path.join(EXP, f)))
    for n in nodes:
        for pf in prompts[kind]:
            b = rd(os.path.join(base_run, n, 'base', pf)); g = rd(os.path.join(g4_run, n, 'g4', pf))
            for i, op in enumerate(spec['ops']):
                check(op['new'] in g and op['new'] not in b and op['old'] in b and op['old'] not in g,
                      f"{n} {pf}: {spec['id']} op {i + 1} NEW in g4 only, OLD in base only")
KEY = {
    'author.system.md': ['asks WHICH PARTS of the enforcer', "keyed by the item's NUMBER", 'EMPTY-upstream branch',
                         'NOT CONFIRMED AND NOT CONTRADICTED', 'If it arrives EMPTY', 'confined-to-block']
                        + (['written as the key itself', 'a placeholder stands only for a value the leg derives at run time']
                           if exp['g4'].get('rerun2') else []),   # the stanza literal-key fix (2c55baae, rerun 2)
    'reviewer.system.md': ['If it arrives EMPTY', 'confined-to-block', 'A row `<token>.item-<N>` records an owner item no key asks',
                           'empty-upstream branch that cites'],
}
for pf, keys in KEY.items():
    for k in keys:
        for n in nodes:
            g = rd(os.path.join(g4_run, n, 'g4', pf)); b = rd(os.path.join(base_run, n, 'base', pf))
            check(k in g and k not in b, f'{n} {pf}: "{k}" in g4, absent from base')

print('P4 author.user.md identical across arms')
for n in nodes:
    check(rd(os.path.join(base_run, n, 'base', 'author.user.md')) == rd(os.path.join(g4_run, n, 'g4', 'author.user.md')), f'{n} author.user.md base == g4')

print('P5 item 22 placement; owner maps in no prompt')
item22 = exp['g4']['item22']
for n in nodes:
    for run, arm in ((base_run, 'base'), (g4_run, 'g4')):
        u = rd(os.path.join(run, n, arm, 'author.user.md'))
        want = 1 if n == 'LA' else 0
        check(u.count(item22) == want, f'{n}/{arm} author.user.md carries item 22 {want}x')
        for pf in ('author.system.md', 'author.user.md', 'reviewer.system.md'):
            t = rd(os.path.join(run, n, arm, pf))
            check('requirementsRowItemMap' not in t and '"items": {' not in t, f'{n}/{arm} {pf}: no owner map')
m = json.load(open(os.path.join(g4_run, 'manifest.json')))
rep = json.dumps(m.get('nodes', {}).get('LA', {}))
check('item-22-enforcer-scope' in rep and 'reviewer-task:description' in rep and 'leg:description' in rep, 'LA input-edit report names the objective of record and both briefs')

print(f"\n{'❌ ' + str(fails) + ' FAIL' if fails else '✅ all bytes proofs PASS'}")
sys.exit(1 if fails else 0)
