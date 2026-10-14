#!/usr/bin/env python3
"""Z49 lab gate — BYTES BEFORE SPEND (Protocol 16 rule 4). $0, reads files only.

    python3 -I scripts/leg-replay-lab/inputs/2026-10-10-z49-request-path/bytes-proof.py <runDir> <renderDir@452dfe15> <renderDir@0bcbfd7f>

renderDir = the output of `render-requirements-texts.ts --commit <c> --out <dir>` (the seed's own composition at that commit).
Every check prints PASS/FAIL; exit 1 on any FAIL.

 P1  the base arm IS today's production: the pinned production rows == the seed render at 452dfe15 (origin/main), and every
     base cell's protocol.md / author.template.md / reviewer.template.md == those pinned rows.
 P2  the z49 arm IS the Phase A text: every z49 cell's protocol.md / author.template.md / reviewer.template.md == the seed
     render at 0bcbfd7f (protocol 1.9.0).
 P3  the candidate text is VERBATIM in every rendered z49 prompt and ABSENT from every base prompt: for each op of each edit,
     its full NEW text is in the z49 system prompt of the role it targets and not in the base one; its OLD text is in the base
     prompt and not in the z49 one. Protocol ops are checked in the Author AND the Reviewer system prompts (both inject it).
     Plus the key sentences, by name.
 P4  the arms differ in nothing else: author.user.md is byte-identical across arms per node (the input edit applies to both).
 P5  the input edit reached what it should and nothing else: on A21 item 21 is in the Author's and the Reviewer's §1 brief
     exactly once; on Z0 it is absent; the owner map and the objective-of-record-only text ('Phase 0 is REQUIRED') reach
     no prompt.
"""
import json, os, sys

run, r_pre, r_z49 = sys.argv[1:4]
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
base_proto = rd(os.path.join(EXP, exp['baseline']['protocols']['requirements-authoring-protocol']['file']))
tpl = {t['role']: rd(os.path.join(EXP, t['file'])) for t in exp['baseline']['templates'].values()}
pre = {'protocol': rd(os.path.join(r_pre, 'requirements-authoring-protocol.md')),
       'requirements_author': rd(os.path.join(r_pre, 'requirements-author.template.md')),
       'requirements_reviewer': rd(os.path.join(r_pre, 'requirements-reviewer.template.md'))}
z49 = {'protocol': rd(os.path.join(r_z49, 'requirements-authoring-protocol.md')),
       'requirements_author': rd(os.path.join(r_z49, 'requirements-author.template.md')),
       'requirements_reviewer': rd(os.path.join(r_z49, 'requirements-reviewer.template.md'))}
nodes = [n['id'] for n in exp['nodes']]

print('P1 base arm == today\'s production')
check(base_proto == pre['protocol'], 'pinned production protocol row (1.8.0) == seed render at 452dfe15')
check(tpl['requirements_author'] == pre['requirements_author'], 'pinned production Requirements Author row == seed render at 452dfe15')
check(tpl['requirements_reviewer'] == pre['requirements_reviewer'], 'pinned production Requirements Reviewer row == seed render at 452dfe15')
for n in nodes:
    d = os.path.join(run, n, 'base')
    check(rd(os.path.join(d, 'protocol.md')) == base_proto, f'{n}/base protocol.md == pinned production row')
    check(rd(os.path.join(d, 'author.template.md')) == tpl['requirements_author'], f'{n}/base author.template.md == pinned production row')
    check(rd(os.path.join(d, 'reviewer.template.md')) == tpl['requirements_reviewer'], f'{n}/base reviewer.template.md == pinned production row')

print('P2 z49 arm == the Phase A text (seed render at 0bcbfd7f)')
for n in nodes:
    d = os.path.join(run, n, 'z49')
    check(rd(os.path.join(d, 'protocol.md')) == z49['protocol'], f'{n}/z49 protocol.md == render at 0bcbfd7f (1.9.0)')
    check(rd(os.path.join(d, 'author.template.md')) == z49['requirements_author'], f'{n}/z49 author.template.md == render at 0bcbfd7f')
    check(rd(os.path.join(d, 'reviewer.template.md')) == z49['requirements_reviewer'], f'{n}/z49 reviewer.template.md == render at 0bcbfd7f')

print('P3 candidate text verbatim in every z49 prompt, absent from every base prompt')
edits = {'protocol': 'edits/z49-protocol.json', 'requirements_author': 'edits/z49-author-guidance.json', 'requirements_reviewer': 'edits/z49-reviewer-guidance.json'}
prompts = {'protocol': ['author.system.md', 'reviewer.system.md'], 'requirements_author': ['author.system.md'], 'requirements_reviewer': ['reviewer.system.md']}
for kind, f in edits.items():
    spec = json.load(open(os.path.join(EXP, f)))
    for n in nodes:
        for pf in prompts[kind]:
            b = rd(os.path.join(run, n, 'base', pf)); z = rd(os.path.join(run, n, 'z49', pf))
            for i, op in enumerate(spec['ops']):
                check(op['new'] in z and op['new'] not in b and op['old'] in b and op['old'] not in z,
                      f"{n} {pf}: {spec['id']} op {i + 1} NEW in z49 only, OLD in base only")
KEY = {
    'author.system.md': ['An exemplar stanza conditions on the attribute the declared path carries and never forbids it',
                         '| {{LEG_TOKEN}}.request-path |'],
    'reviewer.system.md': ['| {{LEG_TOKEN}}.request-path |', 'request-path'],
}
for n in nodes:
    for pf, keys in KEY.items():
        for k in keys:
            z = rd(os.path.join(run, n, 'z49', pf)); b = rd(os.path.join(run, n, 'base', pf))
            check(k in z and k not in b, f'{n} {pf}: "{k[:70]}" in z49, not in base')

print('P4 arms differ only in the lever')
for n in nodes:
    check(rd(os.path.join(run, n, 'base', 'author.user.md')) == rd(os.path.join(run, n, 'z49', 'author.user.md')), f'{n}: author.user.md byte-identical across arms')

print('P5 the input edit')
item21 = exp['z49']['item21']
omap = json.load(open(os.path.join(EXP, 'owner-maps/log-archive-read-answered-z49.row-item-map.json')))
for n in nodes:
    for v in ('base', 'z49'):
        au = rd(os.path.join(run, n, v, 'author.user.md'))
        rs = os.path.join(run, n, v, 'reviewer.user.md')
        want = 1 if n == 'A21' else 0
        check(au.count(item21) == want, f'{n}/{v}: item 21 in the Author brief {want}x')
        allp = au + rd(os.path.join(run, n, v, 'author.system.md')) + rd(os.path.join(run, n, v, 'reviewer.system.md'))
        check('Phase 0 is REQUIRED' not in allp, f'{n}/{v}: the objective-of-record-only text reaches no prompt')
        check('requirementsRowItemMap' not in allp and json.dumps(omap['items']) not in allp, f'{n}/{v}: the owner map reaches no prompt')
reviewer_desc_edit = json.load(open(os.path.join(EXP, 'node-inputs/item-21-request-path.json')))
check('reviewer-task:description' in reviewer_desc_edit['appliesTo'], 'A21: the Reviewer brief copy is edited too (its reading copy of the items)')

print(f"\n{'✅ all bytes proofs PASS' if not fails else f'❌ {fails} FAIL'}")
sys.exit(1 if fails else 0)
