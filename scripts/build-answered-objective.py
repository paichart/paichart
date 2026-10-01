#!/usr/bin/env python3
r"""Build the answered objective for a requirements regeneration, and prove every owner question is answered.

Owner-answer session (`.claude/knowledge/pipelines/requirements-authoring/OWNER-ANSWER-SESSION.md`): a zero-decision
generation returns an owner block of questions; the owner answers them as numbered items in an answers file; this script
merges those items into the base objective as its DESIGN DECISIONS block. It FAILS rather than emit an objective that
leaves a question unanswered - that check is the point: "every question answered" becomes a set comparison, not a read.

Usage:
  python3 scripts/build-answered-objective.py --base <objective.txt> --answers <answers.md> --draft <generation draft.md> [--out <file>]

  --base     the zero-decision objective the generation ran from (no DESIGN DECISIONS block)
  --answers  the answers file: numbered items `N. ...` under `### Group ...` headings, plus a `<!-- ROW-ITEM-MAP -->`
             table `| \`row id\` | item |` (item = a number, or `forced` on target-absent / inputs-empty only); a row
             written `| \`row id\` (added <date>: <why>) | item |` is a question the registry gained after the source
             generation ran, answered like any other
  --draft    the generation's requirements.md (its `## Decisions needed from the owner` block is the question set)

Exit 0 and the objective on stdout (or --out); exit 1 with every problem listed. Pure stdlib, no network.
"""
import argparse
import re
import sys

HEADER = ("DESIGN DECISIONS - DECLARED, NOT INFERRED. Each item below is a choice made by the POV owner. Transcribe each "
          "one; do not substitute a different choice, and do not treat any of them as a description of current state - "
          "the program's legs observe current state for themselves.\n\n")
ANCHOR = 'This is a DRAFT SPECIFICATION for human review. Do not launch a program.\n\n'
FORCED_ELIGIBLE = ('target-absent', 'inputs-empty')  # the Reviewer's closed list (check 8.3)


def items_from(answers: str) -> list:
    """Numbered items `N. ...` that appear under a `### Group` heading, in file order (continuation lines kept)."""
    out = []
    for block in re.split(r'(?m)^(?=### )', answers):
        if not block.startswith('### Group'):
            continue
        block = block.split('\n## ', 1)[0]  # a group ends at the next `##` section (the file also quotes the objective)
        for m in re.finditer(r'(?ms)^(\d{1,2})\. (.*?)(?=^\d{1,2}\. |^#{2,3} |\Z)', block):
            out.append((int(m.group(1)), f'{m.group(1)}. {m.group(2).rstrip()}\n'))
    return out


def row_map_from(answers: str) -> dict:
    i = answers.find('<!-- ROW-ITEM-MAP -->')
    if i < 0:
        return {}
    rows = {}
    for line in answers[i:].splitlines()[1:]:
        if not line.startswith('|'):
            if rows:
                break
            continue
        m = re.match(r'^\|\s*`([^`]+)`(\s*\(added[^)]*\))?\s*\|\s*([0-9]+|forced)\s*\|', line)
        if m:
            rows[m.group(1)] = m.group(3)
            if m.group(2):
                ADDED.add(m.group(1))
    return rows


# Row ids marked `(added <date>: <why>)` in the map: questions the registry gained AFTER the source generation ran, so
# its owner block could not ask them. They count as asked — the owner answers them like any other row.
ADDED: set = set()
NOT_APPLICABLE: list = []  # deleted rows (tier not-applicable): listed, never answered


def owner_row_ids(draft: str) -> list:
    s = draft.find('## Decisions needed from the owner')
    if s < 0:
        return []
    e = draft.find('\n## ', s + 5)
    section = draft[s:e if e > 0 else len(draft)]
    rows = re.findall(r'(?ms)^- ([a-z][a-z-]*(?:\.[a-z<>-]+)+) —(.*?)(?=^- |\Z)', section)
    # A `not-applicable` row is a DELETED row listed for the owner to check its reason; it needs no answer.
    NOT_APPLICABLE.extend(rid for rid, rest in rows if 'tier: not-applicable' in rest)
    return [rid for rid, rest in rows if 'tier: not-applicable' not in rest]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', required=True)
    ap.add_argument('--answers', required=True)
    ap.add_argument('--draft', required=True)
    ap.add_argument('--out')
    a = ap.parse_args()
    base, answers, draft = (open(p, encoding='utf-8').read() for p in (a.base, a.answers, a.draft))

    problems = []
    items = items_from(answers)
    nums = [n for n, _ in items]
    if nums != list(range(1, len(nums) + 1)):
        problems.append(f'items must run 1..N with no gap or repeat; found {nums}')
    if 'DESIGN DECISIONS' in base:
        problems.append('the base objective already carries a DESIGN DECISIONS block - use the zero-decision objective')
    if base.count(ANCHOR) != 1:
        problems.append('the base objective does not contain the DRAFT SPECIFICATION line exactly once (merge anchor)')

    rows = row_map_from(answers)
    questions = owner_row_ids(draft) + sorted(ADDED)
    if not questions:
        problems.append('no owner-block row ids found in the draft (missing `## Decisions needed from the owner`?)')
    if not rows:
        problems.append('no ROW-ITEM-MAP table found in the answers file')
    unanswered = [q for q in questions if q not in rows]
    extra = [r for r in rows if r not in questions]
    if unanswered:
        problems.append(f'{len(unanswered)} owner question(s) with no answer: {", ".join(unanswered)}')
    if extra:
        problems.append(f'{len(extra)} map row(s) the draft never asked (typo, or a different draft?): {", ".join(extra)}')
    for rid, it in rows.items():
        if it == 'forced':
            if not rid.endswith(FORCED_ELIGIBLE):
                problems.append(f'{rid}: `forced` is legal only on {" / ".join(FORCED_ELIGIBLE)}')
        elif int(it) not in nums:
            problems.append(f'{rid}: maps to item {it}, which does not exist')
    unused = [n for n in nums if str(n) not in rows.values()]
    if unused:
        problems.append(f'item(s) {unused} answer no owner question - remove them or map the row they answer')

    if problems:
        print(f'❌ {len(problems)} problem(s) - no objective written:', file=sys.stderr)
        for p in problems:
            print(f'  - {p}', file=sys.stderr)
        return 1

    out = base.replace(ANCHOR, ANCHOR + HEADER + ''.join(t for _, t in items) + '\n')
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(out)
    else:
        sys.stdout.write(out)
    if NOT_APPLICABLE:
        print(f'ℹ {len(NOT_APPLICABLE)} not-applicable row(s) need no answer — the owner checks their reason: {", ".join(NOT_APPLICABLE)}', file=sys.stderr)
    print(f'✅ {len(questions)} owner questions ({len(ADDED)} added after the source generation) answered by {len(nums)} items ('
          f'{sum(1 for v in rows.values() if v == "forced")} forced default accepted)', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
