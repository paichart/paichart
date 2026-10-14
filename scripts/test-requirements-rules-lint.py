#!/usr/bin/env python3
"""Tests for `requirements-rules.py --lint` (the harvested-state pre-filter) — the two 2026-10-09 changes (Z39, Z40).

  python3 scripts/test-requirements-rules-lint.py            # against scripts/requirements-rules.py
  RULES=<path> python3 scripts/test-requirements-rules-lint.py   # against another copy (old code, a mutant)

Each case says which wrong implementation it exists to catch; every one was run red against that implementation.
Pure stdlib. Exit 1 on any failure.
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.realpath(__file__))
spec = importlib.util.spec_from_file_location('rules', os.environ.get('RULES', os.path.join(HERE, 'requirements-rules.py')))
rules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rules)

# The objective the cases lint against: it DECLARES the bucket name, nothing else.
DECLARED = "3. The target bucket is the Terraform resource in workspace `prod` (bucket `acme-app-logs`); it is the log archive."


def tokens(doc):
    return sorted(tok for _, _, tok, _ in rules.lint(doc.split('\n'), DECLARED))


CASES = [
    # Z39 — the designated synthetic slot written as INDENTED sub-bullets is exempt (old code: the first sub-bullet
    # ended the exemption, so the slot's own synthetic addresses were candidates).
    ('slot with indented sub-bullets is exempt',
     "- ⚠️ **Verify by arithmetic, never by eyeballing.** Synthetic documentation addresses only:\n"
     "  - `198.51.100.4` and `198.51.100.5` are an aligned pair whose minimal cover is `198.51.100.4/31`.\n"
     "  - their minimal cover, `198.51.100.4/30`, would admit two addresses no pod holds.\n",
     []),
    # Z39 known positive — a harvested address in a SIBLING bullet after an indented synthetic example is still a
    # candidate (catches an exemption that runs past the slot, e.g. one that ends only at a blank line).
    ('sibling bullet after an indented slot is still scanned',
     "- ⚠️ **Verify by arithmetic.** Synthetic:\n"
     "  - `198.51.100.4` and `198.51.100.5`.\n"
     "- **Verify member-by-member**: the exporter today is 10.250.7.9 on leaf1.\n",
     ['10.250.7.9']),
    # Z39 known positive — the slot nested one level down ends at a sibling at ITS indent, not only at column 0.
    ('nested slot ends at its own sibling',
     "- Derivation notes:\n"
     "  - ⚠️ Verify by arithmetic. Synthetic `192.0.2.10`.\n"
     "    - `192.0.2.11` and `192.0.2.12`.\n"
     "  - Harvested: 10.250.7.9.\n",
     ['10.250.7.9']),
    # Z40 — an S3 ARN built from the DECLARED bucket name is not a candidate (old code: every such ARN was).
    ('S3 ARN of the declared bucket is allowed',
     '"Resource": "arn:aws:s3:::acme-app-logs/*",\nand the bucket itself: arn:aws:s3:::acme-app-logs\n',
     []),
    # Z40 known positive — an S3 ARN with an UNDECLARED bucket name is still a candidate (catches "allow any S3 ARN").
    ('S3 ARN of an undeclared bucket is a candidate',
     '"Resource": "arn:aws:s3:::harvested-other-bucket/*",\n',
     ['arn:aws:s3:::harvested-other-bucket/*']),
    # Z40 known positive — a bucket name that only appears INSIDE a declared name is not declared (catches a substring
    # match: "app-logs" is inside "acme-app-logs").
    ('bucket inside a longer declared name is a candidate',
     '"Resource": "arn:aws:s3:::app-logs/*",\n',
     ['arn:aws:s3:::app-logs/*']),
    # Z40 known positive — only S3 ARNs get the bucket rule (catches a rule keyed on any ARN's last component).
    ('a non-S3 ARN is still a candidate',
     'Principal: arn:aws:iam::123456789012:role/acme-app-logs\n',
     ['arn:aws:iam::123456789012:role/acme-app-logs']),
    # 2026-10-09 (stage A) — a block the document DECLARES synthetic is exempt like the slot (old code: gen 7's synthetic
    # table outside the "Verify by arithmetic" slot read as 10 candidates).
    ('a block declared synthetic is exempt',
     "  The rule worked on synthetic inputs (reference data only):\n\n  | pod | podIP |\n  |---|---|\n  | `a` | `192.0.2.10` |\n\n  Result: `192.0.2.10/32`.\n",
     []),
    # known positive — the next sibling bullet after a synthetic block is scanned again.
    ('a sibling bullet after a synthetic block is a candidate',
     "- Worked on synthetic inputs: `192.0.2.10`.\n- The harvested pod is 10.244.0.5.\n",
     ['10.244.0.5']),
    # Z53 (2026-10-10) — a LIST introduced by a colon-ended synthetic lead-in at the same indent is exempt (old code:
    # its first bullet ended the exemption; answered run 3 drew 2 hits on its own synthetic pod address).
    ('a list under a colon-ended synthetic lead-in is exempt',
     "  Synthetic self-check, with three pods:\n  - A: `Running`, `192.0.2.10`.\n  - B: `Pending`.\n\n  Check 1 prints only `192.0.2.10`.\n- Next rule.\n",
     []),
    # Z53 known positive — after the list's blank line, a sibling bullet ends the block and is scanned again.
    ('a sibling bullet after the synthetic list blank line is a candidate',
     "  Synthetic self-check, with one pod:\n  - A: `192.0.2.10`.\n\n  - The harvested pod is 10.244.0.5.\n",
     ['10.244.0.5']),
    # known positive — a documentation-range address NOT declared synthetic is a candidate (rigs use these ranges as
    # real values: the firewall specs' partner CIDR is 203.0.113.0/24).
    ('a documentation-range value not declared synthetic is a candidate',
     "- The partner CIDR is `203.0.113.0/24`.\n",
     ['203.0.113.0/24']),
    # 2026-10-09 (stage A) — "item 21 blocks …" is an owner item number, not a count (old code: a count candidate).
    ('an item number followed by a verb is not a count',
     "The Deny of item 21 blocks every other writer.\n",
     []),
    # known positive — a real count of harvested things is still a candidate.
    ('a count of harvested pods is a candidate',
     "The harvest found 21 harvested pods in the namespace.\n",
     ['21 harvested pods']),
    # 2026-10-12 (lab L11 rerun 2) — the DELIVERABLE'S OWN two blocks: "MUST publish … two blocks" whose sub-bullets name
    # the input block and the result block is the template's structure, not a harvest (old code: a count candidate).
    ('the deliverable\'s own two blocks (input + result named under it) are not a count',
     "- **The deliverable MUST publish, explicitly and prominently**, two blocks.\n"
     "  - **The host list**: the result block, one entry per line.\n"
     "  - **The input block:** the pod list as read.\n",
     []),
    # known positive — "two blocks" whose own lines do not name both blocks is still a candidate (catches an exemption
    # keyed on the words "two blocks" alone).
    ('two blocks without the input/result pair under it is a candidate',
     "- The proxy has two blocks forwarding to the collector.\n"
     "  - the result block is computed later.\n",
     ['two blocks']),
    # known positive — the pair named in a SIBLING bullet does not exempt (catches a window that runs past the bullet).
    ('the input/result pair in a sibling bullet does not exempt',
     "- The deliverable publishes two blocks.\n"
     "- The input block and the result block are the design's.\n",
     ['two blocks']),
    # known positive (execution-facts review L1) — the pair on the count's OWN line does not exempt: a harvested count
    # and a mention of the deliverable's blocks in one sentence (catches a search that includes the count's line).
    ('the input/result pair on the count\'s own line does not exempt',
     "- The listener harvest shows two blocks; the deliverable carries the input block and the result block.\n",
     ['two blocks']),
    # known positive — any other count of blocks stays a candidate even with the pair named.
    ('six blocks is a candidate even with the pair named under it',
     "- The deliverable publishes six blocks.\n"
     "  - the input block and the result block.\n",
     ['six blocks']),
]


def main():
    failed = 0
    for name, doc, want in CASES:
        got = tokens(doc)
        ok = got == sorted(want)
        failed += not ok
        print(f"  {'✓' if ok else '✗'} {name}" + ('' if ok else f"\n      want {sorted(want)}\n      got  {got}"))
    print(f"{len(CASES) - failed}/{len(CASES)} passed")
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
