#!/usr/bin/env python3
"""Leg replay lab — derive a candidate EditSpec from two FULL texts (2026-10-10, Z49 lab gate). $0.

    python3 -I scripts/leg-replay-lab/derive-edits.py --base <baseline file> --target <candidate file> \
        --id <edit id> --applies-to <protocol name | role:<agentRole>> --out <edits/x.json>

When a candidate is already written in full (a committed seed renders it), hand-copying replace ops invites a typo the
anchor check cannot see. This derives the minimal line hunks (difflib), widens each hunk's OLD side by whole context
lines until it occurs exactly once in the baseline, then PROVES the result: applying the ops in order (exactly-once,
literal replacement — the lab's applyEdits) to the baseline must reproduce the target byte for byte, or nothing is
written. The lab's build-candidates re-checks the anchors and the run re-derives the text from these ops.
"""
import argparse, difflib, json, sys


def apply(text, ops):
    for op in ops:
        n = text.count(op['old'])
        if n != 1:
            raise SystemExit(f"anchor occurs {n} times: {op['old'][:90]!r}")
        text = text.replace(op['old'], op['new'], 1)
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', required=True); ap.add_argument('--target', required=True)
    ap.add_argument('--id', required=True); ap.add_argument('--applies-to', required=True); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    base = open(a.base, encoding='utf-8', newline='').read()
    target = open(a.target, encoding='utf-8', newline='').read()
    bl = base.splitlines(keepends=True); tl = target.splitlines(keepends=True)
    ops = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=bl, b=tl, autojunk=False).get_opcodes():
        if tag == 'equal':
            continue
        ctx = 0
        while True:
            lo, hi = max(0, i1 - ctx), min(len(bl), i2 + ctx)
            old = ''.join(bl[lo:hi])
            new = ''.join(bl[lo:i1]) + ''.join(tl[j1:j2]) + ''.join(bl[i2:hi])
            if old and base.count(old) == 1:
                break
            if lo == 0 and hi == len(bl):
                raise SystemExit('could not make a unique anchor')
            ctx += 1
        ops.append({'type': 'replace', 'old': old, 'new': new})
    if not ops:
        raise SystemExit('texts are identical — no edit to derive')
    if apply(base, ops) != target:
        raise SystemExit('derived ops do not reproduce the target — nothing written')
    spec = {'id': a.id, 'appliesTo': [a.applies_to], 'ops': ops,
            'derivedFrom': {'base': a.base, 'target': a.target, 'proof': 'apply(base, ops) == target, byte for byte'}}
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(spec, f, indent=2, ensure_ascii=False); f.write('\n')
    print(f"{a.id}: {len(ops)} op(s), {len(target) - len(base):+d} chars → {a.out}")


if __name__ == '__main__':
    main()
