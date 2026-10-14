#!/usr/bin/env python3
"""Dropped-clause scorer for a generated requirements.md: does every clause of every owner item reach the leg it governs?

Why (2026-10-09, Author retrospective, ME A3 / TS B-1): in the blind trial item 21's second clause ("its package states
what else, if anything, the change affects") reached the Design-decisions ROW but not the leg's text — twice (Z13, Z14),
and the Reviewer blocked one and approved the other. A row citation is not enough: the gen-2 leg clause CITED item 21 and
still dropped half of it. This checks each CLAUSE of an item, not the item number.

Method (mechanical, no model):
  * items come from the objective's numbered DESIGN DECISIONS; the item → rows map from the owner's answers.md
    (`<!-- ROW-ITEM-MAP -->` table); an item governs the legs whose token prefixes its rows (approver/gate rows: skipped —
    they live in Approvals, not a leg section);
  * an item's OBLIGATIONS are its state / list / report / publish / record / name verbs; each obligation's ANCHOR is the
    first two content words of the verb's object (determiners, prepositions, pronouns, copulas and linking words
    dropped; a participle "naming …" opens a nested obligation of its own; a location phrase "in its deliverable" is
    dropped when two content words remain without it); it
    reaches a leg if both anchor stems appear within 6 words of each other in that leg's
    `## Pipeline N objective — <token>` section (stems fold plurals and verb forms);
  * an item mapped ONLY to rows the draft lists not-applicable is skipped (the leg was ruled out of that class).
It sees OMISSION only. An added or narrowed condition (Z15) and an invented option are invisible to it (ME A3).

Usage: python3 scripts/check-requirements-clauses.py --objective O --answers answers.md --draft report.md [--json]
Exit 0 = every clause reaches its leg; 1 = dropped clauses listed. Pure stdlib.
"""
import argparse
import json
import re
import sys

TOKENS = ('network-provisioning', 'kubernetes-gitops', 'terraform-iac', 'observability-config')
STOP = set('''the a an and or of to in on for with by from at as is are be it its this that these those which who whom
whose not no nor only any each every all both either never also than then there their them they he she we you your our
was were has have had will would shall should may might must can could does did done do into onto over under after
before between within without about above below per via leg legs item items rule rules value values when where while
if else what whatever whose own same other another such more most less least one two first second'''.split())


def norm(s):
    return ' '.join(s.replace('`', '').replace('–', '-').split())


def items_of(objective):
    out = {}
    for m in re.finditer(r'(?ms)^\s*(\d{1,2})\.\s(.*?)(?=^\s*\d{1,2}\.\s|\n\n|\Z)', objective):
        out.setdefault(int(m.group(1)), norm(m.group(2)))
    return out


def row_map(answers):
    i = answers.find('ROW-ITEM-MAP')
    m = {}
    for line in answers[i:].split('\n'):
        r = re.match(r'^\|\s*`([^`]+)`[^|]*\|\s*(\d+)\s*\|', line)
        if r:
            m.setdefault(int(r.group(2)), set()).add(r.group(1))
    return m


def words(s):
    return [w for w in re.findall(r'[a-z0-9][a-z0-9-]{3,}', s.lower()) if w not in STOP]


def leg_sections(draft):
    out = {}
    for m in re.finditer(r'(?m)^## Pipeline \d+ objective\b.*$', draft):
        head = m.group(0)
        tok = next((t for t in TOKENS if t in head), None)
        if not tok:
            continue
        end = draft.find('\n## ', m.end())
        out[tok] = out.get(tok, '') + draft[m.end():end if end > 0 else len(draft)]
    return out


def not_applicable(draft):
    s = draft.find('## Decisions needed from the owner')
    e = draft.find('\n## ', s + 5)
    block = draft[s:e] if s >= 0 else ''
    return set(re.findall(r'(?m)^\s*(?:[-*]\s+)?`?([a-z0-9-]+\.[a-z0-9.-]+)`?\s*—.*\btier:\s*`?not-applicable', block))


# B-1's class (retrospective TS rank 3): an item that obliges a package/deliverable/leg to STATE, LIST, REPORT, PUBLISH,
# RECORD or NAME something. The OBJECT of that verb is the anchor — a phrase the leg text must carry. Measured negative
# (2026-10-09): a general word-overlap version flagged 2–12 clauses per draft, nearly all paraphrase; this narrow form is
# the one that is mechanical.


# Z48 / Z49 lab L10 (2026-10-10): three paraphrase false positives, each a mechanical misread, not a judgement.
# (1) a PRONOUN object ("publishes them") has no anchor of its own — it is not mechanically checkable, so it is skipped;
# (2) a preposition kept in the anchor ("effect IN") demanded a function word the leg need not write — anchors are
#     content words; (3) "list"/"record"/"name"/"report"/"state" after a determiner or modifier is a NOUN ("the same
#     list the Allow uses"), not an obligation. Only prepositions and pronouns are dropped here — never the wider STOP
#     set: item 21's real catch anchors on "what else", and both words are in STOP.
ANCHOR_FUNCTION_WORDS = {'in', 'on', 'at', 'to', 'of', 'for', 'with', 'by', 'from', 'into', 'onto', 'them', 'it',
                         'they', 'these', 'those', 'him', 'her', 'us',
                         # checker fix 2: a copula carries no content ("what WAS absent" anchors "what absent")
                         'is', 'are', 'was', 'were', 'be', 'been'}
NOUN_BEFORE = {'the', 'a', 'an', 'same', 'that', 'this', 'host', 'address', 'each', 'every', 'its', 'their', 'whose',
               'our', 'your', 'one', 'no'}


def noun_use(text, start):
    """True when the obligation verb at `start` is really a noun: the word before it is a determiner or modifier."""
    prev = re.search(r"([A-Za-z]+)\W*$", text[:start])
    return bool(prev) and prev.group(1).lower() in NOUN_BEFORE


# Checker fix 2 (2026-10-12, lab L11): the PARTICIPLE of an obligation verb ("reports a gap NAMING what was absent")
# opens a NESTED obligation. The outer object ends where it begins, and the nested one is checked with its own object.
# Not after a NOUN_BEFORE word (execution-facts review C1): "publishes the RECORDING rules" is a noun phrase, the same
# test as `noun_use`; ending the object there emptied it, and the obligation vanished unchecked.
PARTICIPLES = r'stating|listing|reporting|publishing|recording|naming'
_NOT_AFTER_DETERMINER = ''.join(rf'(?<!\b{w})' for w in sorted(NOUN_BEFORE))
OBLIGATION = re.compile(r"(?<!host )\b(states?|lists?|reports?|publish(?:es)?|records?|names?|" + PARTICIPLES + r")\b"
                        r"(?:,? in [^,]*,)?\s+(?:as \w+ )?([^;.(),]+?)"
                        r"(?=\s+and\s|" + _NOT_AFTER_DETERMINER + r"\s+(?:" + PARTICIPLES + r")\b|[;.(),]|$)", re.I)


# Group 2 (2026-10-11, Phase 4 attempt 1, Z61): three more mechanical misreads, each a paraphrase the leg wrote correctly.
# (4) "one" in "each one" is a determiner, not a content word ("lists each one in its deliverable" → anchor
#     "deliverable unchanged", not "one deliverable"); (5) LINKING words carry no obligation of their own ("reports a gap
#     instead of widening" ↔ "do not widen": "instead"/"rather" are not anchored); (6) word FORMS are one word
#     ("naming" = "names" = "named"; "widening" = "widen") — folded in `stem`. Proven both ways on every stored draft:
#     the three real "what else" catches (Z13/Z14, gen 5) still fire.
ANCHOR_DETERMINERS = ('the', 'a', 'an', 'this', 'and', 'its', 'own', 'as', 'each', 'every', 'any', 'that', 'one')
ANCHOR_LINKING_WORDS = {'instead', 'rather'}


def named_legs(text, start):
    """Group 2 (2026-10-11): the leg tokens named in the SENTENCE that holds the obligation at `start`. An item can
    span legs ("… the kubernetes-gitops leg … reports a gap naming what was absent. … the observability-config leg …
    reports the upstream gap"); a sentence that names a leg obliges THAT leg only. Empty set = the sentence names no
    leg, so the obligation applies to every leg the item maps to (unchanged behaviour)."""
    a = max(text.rfind('. ', 0, start), text.rfind('; ', 0, start))
    b = min([i for i in (text.find('. ', start), text.find('; ', start)) if i >= 0] or [len(text)])
    sentence = text[a + 1 if a >= 0 else 0:b]
    return {t for t in TOKENS if t in sentence}


# Checker fix 2 (2026-10-12, lab L11): a LOCATION phrase ("lists each one IN ITS DELIVERABLE as unchanged by owner
# decision") says WHERE the leg writes, not WHAT; a leg may name the place differently ("listed as unchanged by owner
# decision", "in report.md"). It is dropped from the anchor, but only when the object still yields two content words
# without it: a one-word anchor is near-vacuous (the reason "gap" is never anchored), so "names this effect in its
# package" keeps "effect package" ("effect" alone is in every terraform stanza).
# A location is one or more determiners + a DOCUMENT place (execution-facts review C3): "the change IN MEMBERSHIP" and
# "in the audit log" are part of WHAT is reported, not where.
LOCATION = re.compile(r"\b(?:in|into|inside|within)\s+(?:(?:its|their|the|a|an|own|published|each|every)\s+)+"
                      r"(?:deliverable|package|report(?:\.md)?|section|output|pr|notes?)\b", re.I)


def _anchor_words(obj):
    toks = [w for w in re.findall(r"[a-z0-9][a-z0-9'-]*", obj.lower()) if w not in ANCHOR_DETERMINERS]
    return [w for w in toks if not re.fullmatch(r'\d+|item|items|gap', w) and w not in ANCHOR_FUNCTION_WORDS
            and w not in ANCHOR_LINKING_WORDS]


def object_anchor(obj):
    """The first two content words of the obligation's object ("what else", "literal criterion"); for "the X that …"
    only the head noun X (the that-clause is the leg's to paraphrase)."""
    obj = re.split(r'\bthat\b', obj, maxsplit=1)[0]
    toks = _anchor_words(obj)
    unlocated = _anchor_words(LOCATION.sub(' ', obj))
    if len(unlocated) >= 2:
        toks = unlocated
    return ' '.join(toks[:2])


def stem(w):
    """6-char stem, possessive and plural folded ("pods'" = "pods" = "pod"), and since group 2 the common verb forms
    ("naming" = "names" = "named" = "name"; "widening" = "widen"): strip -ing / -ed / -es / -s, then a trailing -e, never
    below 3 characters. Applied to BOTH the anchor and the leg text, so any over-folding is symmetric."""
    w = w.rstrip("'")
    for suf in ('ing', 'ed', 'es'):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            w = w[:-len(suf)]
            break
    else:
        if len(w) > 3 and w.endswith('s') and not w.endswith('ss'):
            w = w[:-1]
    if len(w) > 3 and w.endswith('e'):
        w = w[:-1]
    return w[:6]


# False-alarm fixes (2026-10-12, size plan step 2; lab L11 + reruns): two CLOSED sets of words that name one thing, folded
# on both sides like a word form. (1) EXACTNESS: "literal" = "verbatim" = "exact" ("states verbatim the criterion"
# reaches "the literal criterion"). A leg that drops the qualifier altogether is still flagged. (2) THE LEG'S OWN OUTPUT
# has three names: "package" = "deliverable" = "report.md" ("report.md carries `## Effect on other readers`" reaches
# "names this effect in its package"). Not "report" alone (a verb in every leg), not "section" or "output" ("Expected
# output" sits beside every `.Effect` check, which would make "effect package" unfailable on a terraform leg).
# WHOLE WORDS only, folded before `stem` (execution-facts review, 2026-10-12): on the stem, "delivered" / "delivery"
# would have counted as the package.
SAME_WORD = {'verbatim': 'literal', 'exact': 'literal',
             'deliverable': 'package', 'deliverables': 'package', "deliverable's": 'package'}


def fold(words):
    """Whole words with the closed synonym sets folded; `report` followed by `md` (report.md) is the package."""
    out = [SAME_WORD.get(w, w) for w in words]
    return ['package' if w == 'report' and i + 1 < len(out) and out[i + 1] == 'md' else w for i, w in enumerate(out)]


def near(anchor, text, window=6):
    """Both anchor words (6-char stems) within `window` words of each other, either order — the leg may add a word
    ("literal MEMBERSHIP criterion") or reorder ("each pod EXCLUDED") without dropping the clause."""
    parts = [stem(w) for w in fold(anchor.split())]
    toks = [stem(w) for w in fold(re.findall(r"[a-z0-9][a-z0-9'-]*", text))]
    if len(parts) == 1:
        return parts[0] in toks
    a, b = parts
    pa = [i for i, w in enumerate(toks) if w == a]
    pb = [i for i, w in enumerate(toks) if w == b]
    # Two anchor words that fold onto one word still need two places in the text (review): one word alone is the
    # one-word anchor fix 2 forbids.
    return any(abs(i - j) <= window and (a != b or i != j) for i in pa for j in pb)


def check(objective, answers, draft):
    items, rmap, legs, na = items_of(objective), row_map(answers), leg_sections(draft), not_applicable(draft)
    df = {}
    for t in items.values():
        for w in set(words(t)):
            df[w] = df.get(w, 0) + 1
    dropped, checked = [], 0
    for n, text in sorted(items.items()):
        rows = rmap.get(n, set())
        leg_rows = {r for r in rows if r.split('.')[0] in TOKENS}
        live = {r for r in leg_rows if r not in na}
        if not live:
            continue
        obligations = [(m.group(1), m.group(2), named_legs(text, m.start())) for m in OBLIGATION.finditer(text)
                       if not noun_use(text, m.start())]
        if not obligations:
            continue
        for tok in sorted({r.split('.')[0] for r in live}):
            sect = legs.get(tok)
            low = norm(sect).lower() if sect is not None else ''
            for verb, obj, named in obligations:
                if named and tok not in named:
                    continue
                anchor = object_anchor(obj)
                if not anchor:
                    continue
                checked += 1
                if sect is None or not near(anchor, low):
                    dropped.append({'item': n, 'leg': tok, 'clause': f'{verb} {obj}'[:140], 'anchor': anchor,
                                    'missing': ['no leg section'] if sect is None else [anchor]})
    return dropped, checked


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--objective', required=True)
    ap.add_argument('--answers', required=True)
    ap.add_argument('--draft', required=True)
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    dropped, checked = check(open(a.objective, encoding='utf-8').read(), open(a.answers, encoding='utf-8').read(),
                             open(a.draft, encoding='utf-8').read())
    if a.json:
        print(json.dumps({'checked': checked, 'dropped': dropped}, indent=1))
    else:
        print(f'clauses: {checked} checked, {len(dropped)} dropped')
        for d in dropped:
            print(f"  ❌ item {d['item']} → {d['leg']}: \"{d['clause']}\" — missing {d['missing']}")
    return 1 if dropped else 0


if __name__ == '__main__':
    sys.exit(main())
