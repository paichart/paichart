#!/usr/bin/env python3
r"""Pre-publish gate for a generated requirements.md: string-test every declared citation, and check premise branches.

Stands in for the planned `citationFidelity` fact until it ships (convergence panel 2026-09-30,
cline_docs/reviews/requirements-author-convergence-2026-09-30/SYNTHESIS.md): the Reviewer's quote check has 100% precision
but ~31% recall, so an APPROVED verdict alone is not publishable. Run it on any draft before publishing; a failure means
NOT publishable, whatever the verdict.

What it checks (the rule as of requirements-authoring 1.7.3):
  1. every `(declared — item N: "<quote>")` (parentheses optional): item N exists in the objective; the quote is ONE contiguous span (no `…` or
     `...` join, no `{{…}}` placeholder); it appears in item N allowing only dash variants, backticks, the case of its first
     letter, and one trailing sentence-ending mark (. ; ,); a Markdown-escaped backtick (\\`) counts as a backtick.
  2. declared rows IN THE DESIGN DECISIONS TABLE with no quote (e.g. "same as above") — failing. A bare `(declared —
     item N)` reference in leg prose is not a table citation and is not checked.
  2b. a table with declared rows but 0 parsed citations — the form drifted; never report that as clean.
  3. every authorisation leg that has an `admitted-principal` row also has a `<token>.principal-unseen` citation OUTSIDE
     the Design decisions table (its premise branch).
NOT checked (a judgement the Reviewer keeps): whether the quote selects the same option as the whole item.

Usage: python3 scripts/check-requirements-citations.py --objective <objective.txt> --draft <requirements.md>
Exit 0 = clean; 1 = findings listed. Pure stdlib.
"""
import argparse
import re
import sys

CITE = re.compile(r'\(?declared — item (\d+)(?::\s*"([^"]*)")?\)?')  # parentheses optional: regen 4 (2026-09-30) dropped them and the strict form matched 0
TOKENS = ('network-provisioning', 'kubernetes-gitops', 'terraform-iac', 'observability-config')


def norm(s: str) -> str:
    return ' '.join(s.replace('\\`', '`').replace('`', '').replace('—', '-').replace('–', '-').split())  # a Markdown-escaped backtick is a backtick


def items_of(objective: str) -> dict:
    out = {}
    for m in re.finditer(r'(?ms)^\s*(\d{1,2})\.\s(.*?)(?=^\s*\d{1,2}\.\s|\n\n|\Z)', objective):
        out.setdefault(int(m.group(1)), norm(m.group(2)))
    return out


def quote_ok(quote: str, item: str) -> str | None:
    """None if the quote passes; else the reason."""
    if '{{' in quote:
        return 'template placeholder inside the quote'
    if '…' in quote or '...' in quote:
        return 'ellipsis join (a quote must be one contiguous span)'
    q = norm(quote)
    q = re.sub(r'[.;,]$', '', q)  # one trailing sentence-ending mark may differ
    if not q:
        return 'empty quote'
    hay = item
    if q in hay:
        return None
    if q[:1].lower() + q[1:] in hay or q[:1].upper() + q[1:] in hay:
        return None
    return 'not a verbatim span of the item'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--objective', required=True)
    ap.add_argument('--draft', required=True)
    a = ap.parse_args()
    objective = open(a.objective, encoding='utf-8').read()
    draft = open(a.draft, encoding='utf-8').read()
    items = items_of(objective)

    findings, total, ok = [], 0, 0
    t0 = draft.find('## Design decisions')
    t1 = draft.find('\n## ', t0 + 5) if t0 >= 0 else -1
    for m in CITE.finditer(draft):
        in_table = t0 >= 0 and t0 <= m.start() < (t1 if t1 > 0 else len(draft))
        if m.group(2) is None and not in_table:
            continue  # a bare item reference in leg prose is not a table citation; the quote rule governs the table
        total += 1
        n, quote = int(m.group(1)), m.group(2)
        line = draft.count('\n', 0, m.start()) + 1
        if n not in items:
            findings.append(f'line {line}: item {n} does not exist in the objective')
        elif quote is None:
            findings.append(f'line {line}: item {n} cited with no quote')
        else:
            why = quote_ok(quote, items[n])
            if why:
                findings.append(f'line {line}: item {n} — {why}: "{quote[:90]}"')
            else:
                ok += 1

    # Every item NUMBER the document uses must exist (2026-10-09, S-cit / Z18): gen 4 cited a non-existent "item 22" as a
    # SECOND citation in one cell (no "declared —" prefix, so CITE never saw it) and wrote "items 1–22" in the owner
    # block. Scan every `item N` / `items N–M` before the Writing rules, and string-test any extra `item N: "…"` quote.
    w = draft.find('## Writing rules')
    body = draft[:w] if w >= 0 else draft
    top = max(items) if items else 0
    seen_bad = set()
    for m in re.finditer(r'\bitems?\s+(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?\b', body):
        for g in (m.group(1), m.group(2)):
            if g and int(g) not in items and (int(g), m.start()) not in seen_bad:
                seen_bad.add((int(g), m.start()))
                findings.append(f'line {body.count(chr(10), 0, m.start()) + 1}: item {g} is referenced but the objective has items 1–{top}')
    for m in re.finditer(r'(?<!declared — )\bitem (\d+):\s*"([^"]*)"', body):
        n = int(m.group(1))
        if n in items:
            why = quote_ok(m.group(2), items[n])
            if why:
                findings.append(f'line {body.count(chr(10), 0, m.start()) + 1}: item {n} (extra citation) — {why}: "{m.group(2)[:90]}"')

    # premise branches, outside the Design decisions table
    s = draft.find('## Design decisions')
    e = draft.find('\n## ', s + 5) if s >= 0 else -1
    table = draft[s:e] if s >= 0 and e > 0 else ''
    rest = draft[:s] + draft[e:] if s >= 0 and e > 0 else draft
    premise = {}
    for t in TOKENS:
        if f'{t}.admitted-principal' in table:
            has = f'{t}.principal-unseen' in rest
            premise[t] = has
            if not has:
                findings.append(f'{t}: authorisation leg with no premise branch citing `{t}.principal-unseen` outside the table')

    declared_rows = len(re.findall(r'(?m)^\|[^|\n]+\|.*\bdeclared\b', table))
    if total == 0 and declared_rows:
        findings.append(f'{declared_rows} declared row(s) in the Design decisions table but 0 citations parsed — the citation form drifted; a zero here is NOT clean')
    print(f'citations: {total} total, {ok} verbatim, {total - ok} failing')
    print('premise branches: ' + (', '.join(f'{t} {"✓" if v else "✗"}' for t, v in premise.items()) or 'no authorisation legs found'))
    if findings:
        print(f'❌ NOT publishable — {len(findings)} finding(s):')
        for f in findings:
            print(f'  - {f}')
        return 1
    print('✅ citation + premise gate clean (the Reviewer still owns: does each quote select the same option as the item?)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
