#!/usr/bin/env python3
"""Emit the owner's ROW-ITEM map as the JSON the in-run requirements form check reads from the harness task's
`metadata.requirementsRowItemMap` (Steve, 2026-10-09: the owner's map is carried at launch in METADATA, never in the
objective text, so the Author's input does not change).

Shape (version 1): {"version": 1, "source": "answers.md", "items": {"21": ["terraform-iac.collateral"], ...}}
— keys are item numbers as strings; values are the row ids exactly as in the `<!-- ROW-ITEM-MAP -->` table (backticks and
any "(added …)" note stripped), sorted. The parse is the same as check-requirements-clauses.py's row_map().

Usage: python3 scripts/build-row-item-map.py --answers work/<run>/answers.md   (prints JSON; exit 1 if no map found)
"""
import argparse
import json
import os
import sys
import importlib.util

HERE = os.path.dirname(os.path.realpath(__file__))
spec = importlib.util.spec_from_file_location('cl', os.path.join(HERE, 'check-requirements-clauses.py'))
cl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cl)


def build(answers_text):
    m = cl.row_map(answers_text)
    return {'version': 1, 'source': 'answers.md', 'items': {str(k): sorted(v) for k, v in sorted(m.items())}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--answers', required=True)
    a = ap.parse_args()
    out = build(open(a.answers, encoding='utf-8').read())
    if not out['items']:
        print('no <!-- ROW-ITEM-MAP --> rows found', file=sys.stderr)
        return 1
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
