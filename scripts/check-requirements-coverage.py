#!/usr/bin/env python3
"""Coverage check for a generated requirements.md — OWNER-ANSWER-SESSION step 2, made mechanical.

WHY (2026-10-08). The owner-answer session calls the coverage check "the real test of the generator": once answers
exist, a question the draft never asked is invisible — the regenerated spec is complete by construction for whatever was
asked. Until now it was done by eye. This script does the exact parts of the Reviewer's checks 8.1 / 8.2 (form only) /
8.6 against the canonical registry, and reports — never guesses — the one judgement in them: which CLASS a leg is in
(does its work grant/remove access? add a covering route or suppress routes? derive a value?).

Usage:
  python3 scripts/check-requirements-coverage.py --draft <requirements.md or the Author's draft> [--registry <path>] [--json]
Exit 1 when any ERROR is found; READ items never fail the run (they need a person). Read-only; no network, no model.

What it checks (rule source in brackets):
  ERROR  a known leg has no `<token>.target` row                                        [8.1 every leg]
  ERROR  a leg carries SOME keys of a class but not all (row or `not-applicable` line)  [8.1 every key of its class]
  ERROR  an authorisation leg lists any authorisation key `not-applicable`              [8.1 deleting ANY auth row on a leg that grants]
  ERROR  `must-stay-reachable` listed `not-applicable`                                   [registry: never deleted on a routing leg]
  ERROR  a gate without `approver.<gate>`, or a non-plan gate without `gate.<gate>.position`  [8.1 every gate]
  ERROR  a row keyed on an unknown token or shape                                        [8.1 leg tokens are exactly …]
  ERROR  an invented key (neither a registry key nor `item-<N>`) on a known token, sorted (B-2 / R2, 2026-10-12):
         `restates item N` (declared, leading citation item N — re-key it `<token>.item-<N>`) or `asks a decision no
         key or item asks` (anything else — the owner's to answer, a registry candidate)
  ERROR  an item row `<token>.item-<N>` that is not declared, cites another item first, has options other than `—`,
         or is listed not-applicable                                                    [registry § Item rows]
  ERROR  a duplicate row id
  ERROR  a row whose source is not one of the four forms (declared/derived/forced/OPEN) [8.2 — FORM only, never the quote]
  ERROR  `forced` on a key other than target-absent / inputs-empty                       [8.3 closed list]
  ERROR  owner block ≠ (OPEN ∪ derived ∪ forced ∪ deleted) as sets, or a wrong tier     [8.6]
  READ   a leg with NO keys at all of the producer / authorisation / routing class — confirm the leg's work is outside
         that class (the script cannot see the work; a person or the Reviewer decides)
  READ   an item row for an item that a registry row of the same leg also cites (owed only where no row cites it)
  READ   every `not-applicable` line with its reason — a reason that states today's state ("none exist") is a defect
  READ   a leg token with no `approver.<token>`-style gate is NOT flagged: gate names are free text (one gate per
         domain is a convention, not a rule)

The registry (`.claude/knowledge/pipelines/requirements-authoring/DESIGN-DECISION-QUESTIONS.md`, REGISTRY-TABLE) is
read at run time, so a key added there is enforced here without editing this file.
"""
import argparse
import json
import os
import re
import sys

LEG_TOKENS = ('network-provisioning', 'kubernetes-gitops', 'terraform-iac', 'observability-config')
FORCE_ELIGIBLE = ('target-absent', 'inputs-empty')
TIER_FOR = {'open': 'blocking', 'derived': 'confirm', 'forced': 'default'}
ITEM_KEY = re.compile(r'^item-(\d+)[a-z]?$')   # B-2 item row: `<token>.item-<N>` (a letter suffix: two decisions)
LEAD_ITEM = re.compile(r'^[(*\s]*declared\s+—\s+items?\s+(\d+)', re.I)   # the clause scorer's LEAD_CITE, declared only
OWNER_LINE = re.compile(r'^\s*(?:[-*]\s+)?`?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+)`?\s*—(.*)$')
TIER_RE = re.compile(r'\btier:\s*`?(blocking|confirm|default|not-applicable)\b`?')
DEFAULT_REGISTRY = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..', '.claude', 'knowledge', 'pipelines',
                                'requirements-authoring', 'DESIGN-DECISION-QUESTIONS.md')
CLASS_CRITERION = {
    'producer': 'the leg derives no value another leg consumes',
    'auth': 'the leg neither grants nor removes access on its target (no sender/principal is allowed, denied, '
            'admitted or restricted, and no chained value lands in a source/allow/admit/policy/selector field)',
    'routing': 'the leg adds no advertised covering route and suppresses, filters, withdraws or replaces no routes',
}


def load_registry(path):
    """Return {class: [keys]} for the leg-scoped classes, from the REGISTRY-TABLE."""
    text = open(path, encoding='utf-8').read()
    start = text.index('REGISTRY-TABLE')
    classes = {}
    for line in text[start:].split('\n'):
        m = re.match(r'^\|\s*`([^`]+)`\s*\|\s*([a-z]+)\s*\|', line)
        if not m:
            if classes and line.strip() == '':
                break
            continue
        rid, cls = m.group(1), m.group(2)
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) >= 4:
            classes.setdefault('_options', {})[rid.split('.')[-1] if cls == 'gate' else rid.split('.', 1)[1]] = cells[3]
        if cls == 'gate':
            continue
        key = rid.split('.', 1)[1]
        classes.setdefault(cls, []).append(key)
    if not classes.get('leg') or not classes.get('auth') or not classes.get('_options'):
        raise SystemExit(f'registry parse failed: {path} (classes found: {sorted(classes)})')
    return classes


def section(text, heading_re):
    m = re.search(heading_re, text, re.M)
    if not m:
        return None
    rest = text[m.end():]
    n = re.search(r'^## ', rest, re.M)
    return rest[:n.start()] if n else rest


def source_form(cell):
    c = cell.strip().strip('*').strip()
    if re.match(r'^\(\s*declared\b', c, re.I):
        return 'declared'
    if re.match(r'^\(\s*derived\b', c, re.I):
        return 'derived'
    if re.match(r'^\(\s*forced\b', c, re.I):
        return 'forced'
    if re.match(r'^OPEN\b', c):
        return 'open'
    return 'other'


ROW_ID = re.compile(r'^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$')


def parse_table_rows(dd):
    rows = []
    for line in dd.split('\n'):
        if not line.lstrip().startswith('|'):
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if not cells:
            continue
        rid = cells[0].strip('`').strip()
        if not ROW_ID.match(rid):
            continue
        rows.append({'id': rid, 'source': cells[-1], 'form': source_form(cells[-1]),
                     'options': cells[2] if len(cells) >= 5 else None})
    return rows


def parse_owner_block(ob):
    """Return (lines, is_none). Each line: {id, tier, reason}."""
    if ob is None:
        return None, False
    body = ob.strip()
    if re.match(r'^\*?none\b', body, re.I):
        return [], True
    out = []
    for line in ob.split('\n'):
        # 2026-10-09 (retrospective TS §4.1): the CANONICAL owner-block line carries NO bullet
        # (`<row id> — … — tier: …`, role guidance + registry + skeleton), and a not-applicable line carries its
        # reason AFTER the tier (`— tier: not-applicable — <why>`). The old parser required a bullet and an
        # end-anchored tier, so it never read a real not-applicable line. Bullet optional; id must be dotted
        # (a prose line cannot match); tier is the first `tier: <known>` on the line; the reason is what follows.
        m = OWNER_LINE.match(line)
        if not m:
            continue
        t = TIER_RE.search(m.group(2))
        reason = m.group(2)[t.end():].strip(' —-') if t else ''
        out.append({'id': m.group(1), 'tier': t.group(1) if t else None, 'reason': reason, 'line': line.strip()})
    return out, False


def check(draft_text, registry):
    errors, read = [], []
    dd = section(draft_text, r'^## Design decisions\b.*$')
    ob = section(draft_text, r'^## Decisions needed from the owner\b.*$')
    if dd is None:
        return [{'what': 'no "## Design decisions" section'}], [], {}
    rows = parse_table_rows(dd)
    owner, owner_none = parse_owner_block(ob)
    if owner is None:
        errors.append({'what': 'no "## Decisions needed from the owner" section'})
        owner = []

    by_id = {}
    for r in rows:
        if r['id'] in by_id:
            errors.append({'what': 'duplicate row', 'id': r['id']})
        by_id[r['id']] = r
    na = {o['id']: o for o in owner if o['tier'] == 'not-applicable'}

    leg_keys = {k for cls in ('leg', 'producer', 'auth', 'routing') for k in registry.get(cls, [])}
    legs, gates = set(), set()
    for rid in list(by_id) + list(na):
        parts = rid.split('.')
        if parts[0] == 'approver' and len(parts) == 2:
            gates.add(parts[1])
        elif parts[0] == 'gate' and len(parts) == 3 and parts[2] == 'position':
            gates.add(parts[1])
        elif parts[0] in LEG_TOKENS and len(parts) == 2:
            legs.add(parts[0])
            item = ITEM_KEY.match(parts[1])
            r = by_id.get(rid)
            if item:
                if r is None:   # an item row listed not-applicable: item rows are never deleted
                    errors.append({'what': 'item row listed not-applicable', 'id': rid})
                else:
                    lead = LEAD_ITEM.match(r['source'].strip())
                    if r['form'] != 'declared':
                        errors.append({'what': 'item row is not declared', 'id': rid, 'form': r['form']})
                    elif not lead or int(lead.group(1)) != int(item.group(1)):
                        errors.append({'what': 'item row cites another item', 'id': rid})
                    if (r.get('options') or '').strip().strip('`*').strip()[:1] not in ('—', ''):
                        errors.append({'what': 'item row options are not "—"', 'id': rid})
            elif parts[1] not in leg_keys:
                # B-2 / R2 (2026-10-12): an invented key is sorted mechanically. A declared row whose leading citation
                # is item N is an item row under another name (the Author re-keys it); anything else asks a decision
                # no key or item asks (the owner's to answer, and a registry candidate).
                lead = r is not None and r['form'] == 'declared' and LEAD_ITEM.match(r['source'].strip())
                if lead:
                    errors.append({'what': f'invented key restates item {lead.group(1)} — key it '
                                           f'{parts[0]}.item-{lead.group(1)}', 'id': rid})
                else:
                    errors.append({'what': 'invented key asks a decision no key or item asks (owner decision; registry '
                                           'candidate)', 'id': rid})
        else:
            errors.append({'what': 'row keyed on an unknown token or shape', 'id': rid})
    # An item row for an item that a registry row of the same leg also cites: a READ, not an ERROR. (The original reason
    # — the correction's no-fall guard on citationsTotal would refuse deleting the row — no longer holds since adoption
    # rule 4, Z66: the guard is per (leg, item, covered item words), so deleting the item row is neutral when the
    # registry row's quote covers the same item words, and refused when it does not. READ vs ERROR is re-opened as an
    # owner question: register Z68.)
    reg_cites = {}
    for rid, r in by_id.items():
        parts = rid.split('.')
        if parts[0] in LEG_TOKENS and len(parts) == 2 and parts[1] in leg_keys and r['form'] == 'declared':
            lead = LEAD_ITEM.match(r['source'].strip())
            if lead:
                reg_cites.setdefault((parts[0], int(lead.group(1))), []).append(rid)
    for rid in by_id:
        parts = rid.split('.')
        item = ITEM_KEY.match(parts[1]) if parts[0] in LEG_TOKENS and len(parts) == 2 else None
        if item and (parts[0], int(item.group(1))) in reg_cites:
            read.append({'what': 'item row for an item a registry row of that leg also cites — confirm it records a '
                                 'decision that row does not', 'id': rid, 'rows': reg_cites[(parts[0], int(item.group(1)))]})
    for t in LEG_TOKENS:  # a leg whose objective heading names the token but has no row at all
        if re.search(rf'^## Pipeline \d+ objective\b.*\b{re.escape(t)}\b', draft_text, re.M | re.I):
            legs.add(t)

    def accounted(rid):
        return rid in by_id or rid in na

    absent = {}
    for leg in sorted(legs):
        if not accounted(f'{leg}.target'):
            errors.append({'what': 'missing row', 'leg': leg, 'key': 'target'})
        for cls in ('producer', 'auth', 'routing'):
            keys = registry.get(cls, [])
            have = [k for k in keys if accounted(f'{leg}.{k}')]
            if not have:
                absent.setdefault(cls, []).append(leg)
                continue
            for k in keys:
                if not accounted(f'{leg}.{k}'):
                    errors.append({'what': f'missing {cls} row', 'leg': leg, 'key': k})
            if cls == 'auth':
                real = [k for k in keys if f'{leg}.{k}' in by_id]
                deleted = [k for k in keys if f'{leg}.{k}' in na]
                # Z49 (2026-10-10): `request-path` is asked only when `admitted-principal` admits by address. It may be
                # listed not-applicable ONLY when the leg's admitted-principal row is DECLARED and its source names no
                # address and no combination (an OPEN or derived principal still requires the question).
                ap = by_id.get(f'{leg}.admitted-principal')
                if 'request-path' in deleted and ap and ap['form'] == 'declared' \
                        and not re.search(r'address|combination', ap['source'], re.I):
                    deleted = [k for k in deleted if k != 'request-path']
                if real and deleted:
                    errors.append({'what': 'authorisation leg lists authorisation rows not-applicable (8.1: deleting ANY is blocking)',
                                   'leg': leg, 'keys': deleted})
        # Only a ROUTING leg (one with a real routing row) may never delete must-stay-reachable; a leg that changes no
        # routes lists every routing key not-applicable, correctly (latent false positive while the parser read none).
        is_routing = any(f'{leg}.{k}' in by_id for k in registry.get('routing', []))
        if is_routing and f'{leg}.must-stay-reachable' in na:
            errors.append({'what': 'must-stay-reachable is never deleted on a routing leg', 'leg': leg})

    for cls in ('producer', 'auth', 'routing'):
        if absent.get(cls):
            read.append({'what': f'no {cls} rows — confirm for each leg: {CLASS_CRITERION[cls]}', 'legs': absent[cls]})
    for g in sorted(gates):
        if not accounted(f'approver.{g}'):
            errors.append({'what': 'gate without approver row', 'gate': g})
        if 'plan' not in g and not accounted(f'gate.{g}.position'):
            errors.append({'what': 'non-plan gate without position row', 'gate': g})
    if not any('plan' in g for g in gates):
        errors.append({'what': 'no program plan gate approver row (approver.<…plan…>)'})

    # Options cell == the registry's options (2026-10-09, retrospective TS §3 / Z5, Z22): the Author replaced or
    # invented option lists in 3 of 9 trial generations and the Reviewer missed every one. Enumerated options must
    # be the registry's set (order-free); a "—" registry cell must stay "—"; "per enforcer" cells are not compared.
    opts = registry.get('_options', {})
    for r in rows:
        parts = r['id'].split('.')
        key = parts[-1] if parts[0] == 'gate' else (parts[1] if len(parts) == 2 else None)
        reg, got = opts.get(key), (r.get('options') or '').strip().strip('`*').strip()
        if reg is None or r.get('options') is None or reg.startswith('per enforcer'):
            continue
        if reg.startswith('—'):
            if not got.startswith('—'):
                errors.append({'what': 'options cell differs from the registry', 'id': r['id'], 'registry': reg, 'got': got[:80]})
        else:
            head = lambda x: re.sub(r'\s*\(.*\)\s*$', '', x.strip().strip('`').strip())   # "preserve-bounded (state the bound)"
            want = {head(x) for x in reg.split('·')}
            have = {head(x) for x in got.split('·')}
            if want != have:
                errors.append({'what': 'options cell differs from the registry', 'id': r['id'], 'registry': reg, 'got': got[:80]})

    for r in rows:
        if r['form'] == 'other':
            errors.append({'what': 'source is not one of the four forms', 'id': r['id'], 'source': r['source'][:120]})
        if r['form'] == 'forced' and r['id'].split('.')[-1] not in FORCE_ELIGIBLE:
            errors.append({'what': 'forced on an ineligible key (8.3)', 'id': r['id']})

    # 8.6 — owner block vs table, as sets, with tiers
    expected = {r['id']: TIER_FOR[r['form']] for r in rows if r['form'] in TIER_FOR}
    got = {o['id']: o['tier'] for o in owner if o['tier'] != 'not-applicable'}
    if owner_none and expected:
        errors.append({'what': 'owner block reads "none" but the table has non-declared rows', 'ids': sorted(expected)})
    for rid, tier in expected.items():
        if rid not in got and not owner_none:
            errors.append({'what': 'non-declared row missing from the owner block', 'id': rid, 'expected_tier': tier})
        elif rid in got and got[rid] != tier:
            errors.append({'what': 'wrong tier in owner block', 'id': rid, 'expected': tier, 'got': got[rid]})
    for rid in got:
        if rid not in expected:
            if rid in by_id and by_id[rid]['form'] == 'other':
                continue  # already reported once: its source is not one of the four forms
            why = 'declared in the table' if rid in by_id else 'no such row in the table'
            errors.append({'what': f'owner-block line not owed ({why})', 'id': rid})
    for rid, o in na.items():
        if rid in by_id:
            errors.append({'what': 'row is both in the table and listed not-applicable', 'id': rid})
        read.append({'what': 'not-applicable — read the reason (a reason stating today\'s state is a defect)', 'id': rid,
                     'line': o['line'][:200]})

    stats = {'legs': sorted(legs), 'gates': sorted(gates), 'rows': len(rows),
             'forms': {f: sum(1 for r in rows if r['form'] == f) for f in ('declared', 'derived', 'forced', 'open', 'other')},
             'owner_block': 'none' if owner_none else len(owner), 'not_applicable': len(na)}
    return errors, read, stats


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--draft', required=True)
    ap.add_argument('--registry', default=DEFAULT_REGISTRY)
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    registry = load_registry(a.registry)
    errors, read, stats = check(open(a.draft, encoding='utf-8').read(), registry)
    if a.json:
        print(json.dumps({'errors': errors, 'read': read, 'stats': stats}, indent=1))
    else:
        print(f"coverage — {a.draft}")
        print(f"  legs {stats.get('legs')} · gates {stats.get('gates')} · rows {stats.get('rows')} {stats.get('forms')} · "
              f"owner block {stats.get('owner_block')} · not-applicable {stats.get('not_applicable')}")
        for e in errors:
            print('  ❌ ' + ' · '.join(f'{k}: {v}' for k, v in e.items()))
        for r in read:
            print('  👁  ' + ' · '.join(f'{k}: {v}' for k, v in r.items()))
        print(f"  {len(errors)} error(s), {len(read)} to read")
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
