#!/usr/bin/env python3
"""Publish pass for a generated requirements.md — PUBLISH-GENERATED-SPEC.md §1, §3, §4 as one command (2026-10-08).

Three subcommands. None of them commits, pushes, or writes production; the public push is printed for a person.

  fetch   --task <generation task id> --out <dir>
          READ-ONLY prod: saves the SYNTHESIZE report.md (the document to publish), the task description (the
          objective of record), a run summary (children, executions, truncation, reviewer verdict) for §1, and the
          requirements Author's correction record (author-correction.json) plus its operator artifacts
          (requirements.pre-correction.md, requirements.correction-not-adopted.md) when they exist.
  prepare --source <report.md> --objective <objective.txt> --answers <answers.md> --name <new dir>
          --topology-from <published dir> [--waiver <waiver.md>] [--lint-read <line>:<token>,…]
          [--clause-read <item>:<leg>:<anchor>,…] [--correction-diff-read <section>,…] [--repo ~/paichart] [--write]
          Dry run by default (stages in a temp dir); --write creates program-artifacts/<name>/. In order:
            refuse an existing directory (a published spec is a run's input of record — never edited)
            refuse the "NOT RELEASED" banner unless --waiver (the waiver, not the operator, releases it)
            strip the Author's trailing `Confidence: NN` line
            copy topology.json byte-identical (cmp)
            requirements-rules.py --lint --declared <objective>  (any hit ⇒ STOP: read it; harvested ⇒ regenerate;
                                                    one read and found NOT harvested ⇒ name it in --lint-read, recorded)
            requirements-rules.py --insert, then --check         (byte-identical to canonical)
            the §3 step-4 checks (🗑 notes, {{ }}, Confidence, marker, a stale "not yet spliced" claim, Writing rules last)
            remove the template's owner-block format comment (exact shape only; any other comment there ⇒ STOP)
            check-requirements-coverage.py                       (any ERROR ⇒ STOP; READ items printed)
            owner block: any `tier: blocking` line ⇒ STOP (an OPEN decision is never publishable)
            check-requirements-citations.py --objective           (a finding ⇒ STOP unless --waiver lists it)
            check-requirements-clauses.py                          (a flag ⇒ STOP until READ and named in --clause-read;
                                                    a real drop ⇒ regenerate; --waiver NEVER clears a clause flag)
            in-run correction (from fetch's author-correction.json; STOP if the fetched run directory lacks it):
              an ADOPTED correction that cleared size ⇒ STOP until every shrunk leg / Approvals / Acceptance section's
              removed text is READ and named in --correction-diff-read (owner decision P2 = c', 2026-10-12)
            requirements-rules.py --size-check; on failure writes the program view and size-checks THAT
            PUBLISH-NOTES.md skeleton (source, checks run, waiver text if given) — fill the human parts before commit
          Prints the exact git commands for ~/paichart and the verify command.
  verify  --name <dir> [--files requirements.md,topology.json] [--repo ~/paichart]
          GETs each raw.githubusercontent.com URL exactly as the Architect will and cmp's it with the local file
          (§4: raw caches ~5 min; a 404 fetched before the push can be cached — retry until 200 + identical).

What it deliberately does NOT do: read the draft for harvested NAMES or paraphrase, judge the derivation population,
or decide a waiver. Those are §2's human read and the owner's call; this script runs every check that is mechanical.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.realpath(__file__))
PROD = '<PROD_USER>@<PROD_HOST>'
RAW = 'https://raw.githubusercontent.com/paichart/paichart/main/program-artifacts'
# The platform's verdict banner (execution-terminal-persist.ts runTerminalSuccessTx): exactly two quoted lines + a blank
# line, prepended at the very top. Matched in that exact shape, anchored to the start — never a loose pattern.
BANNER = re.compile(r'\A> ⚠ \*\*NOT RELEASED — quality gate: [^*\n]+\*\*[^\n]*\n'
                    r"> This document is the composed draft deliverable exactly as produced; [^\n]*\n\n")
BANNER_ANYWHERE = re.compile(r'NOT RELEASED — quality gate', re.I)
# Z65 (2026-10-12): the template's own format comment inside *Decisions needed from the owner*. An Author that keeps it
# leaves `tier: blocking | confirm | …` in the owner block, which reads as an OPEN row. Removed ONLY in this exact shape
# (template residue, like the banner); any OTHER HTML comment in the owner block is refused — never stripped by guess.
OWNER_FORMAT_COMMENT = re.compile(r'^<!-- one line per row that is not simply declared:\n<row id> — <question> — options: '
                                  r'<enum> — governs: <which leg clause> — tier: blocking \| confirm \| default \| '
                                  r'not-applicable -->\n', re.M)
CONF = re.compile(r'\n+Confidence: \d{1,3}\b[^\n]*\n*\Z')
STALE_CLAIM = re.compile(r'structurally incomplete until a person splices', re.I)
# The checks no publish path can waive — size STOPs below with no recourse. The in-run adoption rule's
# REQUIREMENTS_ADOPTION_UNWAIVABLE_CHECKS must equal this (cross-file pin in scripts/test-requirements-form-correction.ts).
NON_WAIVABLE = ('size',)
CORRECTION_RECORD = 'author-correction.json'
PRE_CORRECTION = 'requirements.pre-correction.md'
NOT_ADOPTED = 'requirements.correction-not-adopted.md'
DIFF_SECTIONS = re.compile(r'^(Pipeline \d+ objective|Approvals|Acceptance)\b')
# Z66 review F2 (2026-10-12): adoption rule 4 lets a correction that LOWERED the citation count adopt (a merged duplicate
# row). Its diff read adds the Design decisions table, where the merge happened.
DIFF_SECTIONS_CITATIONS = re.compile(r'^(Pipeline \d+ objective|Approvals|Acceptance|Design decisions)\b')


# item:leg:anchor (execution-facts review of checker fix 2, 2026-10-12): a READ dismisses ONE flag, so a different anchor
# on the same item and leg (a nested obligation, or a re-anchored flag) is a NEW read, never covered by habit.
def clause_key(d):
    return f"{d['item']}:{d['leg']}:{d['anchor']}"


def section_key(title):
    """'Pipeline 1 objective — kubernetes-gitops (UPSTREAM)' → 'Pipeline 1 objective'; 'Approvals — …' → 'Approvals'."""
    return re.split(r'\s+—\s+|\s+\(', title.strip(), maxsplit=1)[0]


def h2_sections(text):
    """{section key: body} for every `## ` section (body excludes the heading line)."""
    out, cur, buf = {}, None, []
    for line in text.split('\n'):
        if line.startswith('## ') and not line.startswith('###'):
            if cur is not None:
                out[cur] = '\n'.join(buf)
            cur, buf = section_key(line[3:]), []
        elif cur is not None:
            buf.append(line)
    if cur is not None:
        out[cur] = '\n'.join(buf)
    return out


def normalized(text):
    text = BANNER.sub('', text, count=1)
    return CONF.sub('\n', text).strip()


def die(msg):
    print(f'⛔ {msg}')
    sys.exit(1)


def run(cmd, check=False):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if check and p.returncode != 0:
        die(f'{" ".join(cmd)} failed:\n{p.stdout}{p.stderr}')
    return p


# ── fetch ────────────────────────────────────────────────────────────────────────────────────────
def psql(sql):
    remote = ("cd /var/www/paichart-app/current && source .env.production && "
              "PGOPTIONS='-c default_transaction_read_only=on' psql \"$DATABASE_URL\" -At -F $'\\t' -f -")
    p = subprocess.run(['ssh', PROD, remote], input=sql, capture_output=True, text=True)
    if p.returncode != 0:
        die(f'prod read failed: {p.stderr.strip()}')
    return p.stdout


def cmd_fetch(a):
    if not re.fullmatch(r'cm[a-z0-9]{23}', a.task):
        die('task id must be a cuid')
    os.makedirs(a.out, exist_ok=True)
    t = a.task
    desc = psql(f"SELECT description FROM tasks WHERE id='{t}';")
    report = psql(f"""SELECT a.content FROM agent_artifacts a JOIN agent_executions e ON e.id=a."executionId"
      WHERE e."taskId"='{t}' AND a.name='report.md'
      AND EXISTS (SELECT 1 FROM agent_artifacts b WHERE b."executionId"=e.id AND b.name='pipeline-index.json')
      ORDER BY e."startTime" DESC LIMIT 1;""")
    if not report.strip():
        die('no SYNTHESIZE report.md (an execution carrying both report.md and pipeline-index.json) on that task')
    summary = psql(f"""SELECT c."agentRole", count(e.id) AS executions,
        bool_or(coalesce(((a.content::jsonb)->'toolLoop'->>'truncationRetryUsed')::bool,false)) AS truncation_retry,
        max((a.content::jsonb)->'reviewerVerdict'->>'approved') AS reviewer_approved
      FROM tasks p JOIN tasks c ON c.stage_id=p.metadata->>'pipelineStageId'
      LEFT JOIN agent_executions e ON e."taskId"=c.id
      LEFT JOIN agent_artifacts a ON a."executionId"=e.id AND a.name='result.json' AND a.content LIKE '{{%'
      WHERE p.id='{t}' GROUP BY 1 ORDER BY 1;""")
    # Phase 4 group 1 (2026-10-12): the requirements Author's correction record and operator artifacts, from its newest
    # execution carrying a result.json. `prepare` reads them for PROVENANCE and for the correction diff read — never as
    # a gate input of their own; it STOPs when the record is missing, so a hand-copied report.md cannot skip the reads.
    author_exec = psql(f"""SELECT e.id FROM tasks p JOIN tasks c ON c.stage_id=p.metadata->>'pipelineStageId'
      JOIN agent_executions e ON e."taskId"=c.id
      JOIN agent_artifacts a ON a."executionId"=e.id AND a.name='result.json' AND a.content LIKE '{{%'
      WHERE p.id='{t}' AND c."agentRole"='requirements_author' ORDER BY e."startTime" DESC LIMIT 1;""").strip()
    correction = '{"attempted": false}'
    saved = []
    if author_exec:
        rec = psql(f"""SELECT (a.content::jsonb)->'toolLoop'->'requirementsFormCheck'->'correction' FROM agent_artifacts a
          WHERE a."executionId"='{author_exec}' AND a.name='result.json';""").strip()
        if rec:
            correction = rec
        for name in (PRE_CORRECTION, NOT_ADOPTED):
            body = psql(f"SELECT content FROM agent_artifacts WHERE \"executionId\"='{author_exec}' AND name='{name}';")
            if body.strip():
                open(os.path.join(a.out, name), 'w', encoding='utf-8').write(body.rstrip('\n') + '\n')
                saved.append(name)
    open(os.path.join(a.out, CORRECTION_RECORD), 'w', encoding='utf-8').write(correction + '\n')
    open(os.path.join(a.out, 'report.md'), 'w', encoding='utf-8').write(report.rstrip('\n') + '\n')
    open(os.path.join(a.out, 'objective.txt'), 'w', encoding='utf-8').write(desc.rstrip('\n') + '\n')
    open(os.path.join(a.out, 'run-summary.tsv'), 'w', encoding='utf-8').write(
        'role\texecutions\ttruncation_retry\treviewer_approved\n' + summary)
    print(f'saved {a.out}/report.md, objective.txt, run-summary.tsv, {CORRECTION_RECORD}' + ''.join(f', {n}' for n in saved))
    print('§1 — prefer a run with ONE execution per child, no truncation retry, reviewer approved:')
    print(summary.strip())


# ── prepare ──────────────────────────────────────────────────────────────────────────────────────
def cmd_prepare(a):
    repo = os.path.expanduser(a.repo)
    rules = os.path.join(repo, 'scripts', 'requirements-rules.py')
    if not os.path.exists(rules):
        die(f'{rules} not found — is --repo the public paichart checkout?')
    final_dir = os.path.join(repo, 'program-artifacts', a.name)
    if os.path.exists(final_dir):
        die(f'{final_dir} exists — never edit a published spec; choose a NEW name')
    topo_src = os.path.join(repo, 'program-artifacts', a.topology_from, 'topology.json')
    if not os.path.exists(topo_src):
        die(f'{topo_src} not found')
    out = final_dir if a.write else tempfile.mkdtemp(prefix=f'publish-{a.name}-')
    os.makedirs(out, exist_ok=True)
    req = os.path.join(out, 'requirements.md')
    log = []

    def ok(msg):
        log.append(f'✅ {msg}')
        print(f'✅ {msg}')

    text = open(a.source, encoding='utf-8').read()
    if BANNER_ANYWHERE.search(text) and not BANNER.match(text):
        die('a "NOT RELEASED" banner is present but not in the platform\'s exact top-of-document shape — read it; never strip by guess')
    if BANNER.match(text):
        if not a.waiver:
            die('report.md carries the "NOT RELEASED" banner — publishable only under an owner waiver (--waiver, '
                'OWNER-ANSWER-SESSION step 8); otherwise regenerate')
        text = BANNER.sub('', text, count=1)
        ok('removed the NOT RELEASED banner under the owner waiver')
    text, n = CONF.subn('\n', text)
    if n:
        ok("removed the Author's trailing Confidence line")
    text, n = OWNER_FORMAT_COMMENT.subn('', text, count=1)
    if n:
        ok("removed the template's format comment left in the owner block (template residue, Z65)")
    open(req, 'w', encoding='utf-8').write(text)
    shutil.copyfile(topo_src, os.path.join(out, 'topology.json'))
    if run(['cmp', '-s', topo_src, os.path.join(out, 'topology.json')]).returncode != 0:
        die('topology copy is not byte-identical')
    ok(f'topology.json copied byte-identical from {a.topology_from}')

    lint = run(['python3', rules, '--lint', req, '--declared', a.objective])
    if lint.returncode != 0:
        print(lint.stdout + lint.stderr)
        # --lint-read (2026-10-10, owner decision, Z49 Phase D): the lint is a PRE-FILTER whose hits are CANDIDATES to
        # read. A person who has read a hit and found it NOT harvested names it here as <line>:<token>; it is recorded in
        # PUBLISH-NOTES. EVERY hit must be named, and every name must match a hit — an unnamed hit still stops, and a
        # stale name (a line that moved, a token that changed) stops too. A harvested hit is never named: regenerate.
        hits = re.findall(r"^\s*line\s+(\d+)\s+.+?\s+'([^']+)'", lint.stdout, re.M)
        if not hits or not a.lint_read:
            die('harvested-state pre-filter has hits — READ each; a harvested one means REGENERATE, never hand-edit '
                '(a hit read and found NOT harvested may be named with --lint-read <line>:<token>,…)')
        named = {tuple(x.strip().split(':', 1)) for x in a.lint_read.split(',') if x.strip()}
        found = set(hits)
        if found != named:
            die(f'--lint-read must name every hit exactly: unnamed {sorted(found - named)}, not a hit {sorted(named - found)}')
        ok(f'harvested-state pre-filter: {len(hits)} hit(s), each READ and named NOT harvested by the operator '
           f'(--lint-read {a.lint_read}) — the reason belongs in the waiver/notes')
    else:
        ok('harvested-state pre-filter: 0 hits (a pre-filter only — the §2 full read is still owed)')

    ins = run(['python3', rules, '--insert', req], check=True)
    chk = run(['python3', rules, '--check', req])
    if chk.returncode != 0:
        die(f'writing rules not canonical after --insert:\n{chk.stdout}{chk.stderr}')
    ok('writing rules spliced; --check byte-identical to canonical' + (' (' + ins.stdout.strip().splitlines()[-1] + ')' if ins.stdout.strip() else ''))

    body = open(req, encoding='utf-8').read()
    checks = {
        '🗑 authoring notes': len(re.findall(r'^> \*\*🗑', body, re.M)),
        '{{ placeholders': body.count('{{'),
        'Confidence lines': len(re.findall(r'^Confidence: [0-9]', body, re.M)),
        'WRITING-RULES marker': body.count('<!-- WRITING-RULES -->'),
        'stale "not yet spliced" claim': len(STALE_CLAIM.findall(body)),
    }
    bad = {k: v for k, v in checks.items() if v}
    if bad:
        die(f'§3 checks not zero: {bad}')
    tops = [l for l in body.split('\n') if l.startswith('## ')]
    if not tops or not tops[-1].startswith('## Writing rules'):
        die(f'"## Writing rules" is not the last section (last: {tops[-1] if tops else None})')
    ok('§3 checks: 0 🗑 · 0 {{ · 0 Confidence · 0 marker · 0 stale claim · Writing rules last')

    cov = run(['python3', os.path.join(HERE, 'check-requirements-coverage.py'), '--draft', req])
    print(cov.stdout.rstrip())
    owner = re.search(r'^## Decisions needed from the owner\b(.*?)(?=^## )', body, re.M | re.S)
    if owner and '<!--' in owner.group(1):
        die('an HTML comment is left in "Decisions needed from the owner" that is not the template\'s format comment — '
            'read it; never strip by guess')
    blocking = re.findall(r'tier:\s*blocking', owner.group(1)) if owner else []
    if blocking:
        die(f'{len(blocking)} owner-block line(s) at tier blocking — an OPEN decision is never publishable')
    if cov.returncode != 0:
        if not a.waiver:
            die('coverage check has ERRORS — regenerate, or publish only under an owner waiver that names each one')
        ok('coverage ERRORS present and accepted ONLY because --waiver was given — the waiver must name each one')
    else:
        ok('coverage: 0 errors (READ items above still need a person)')

    cit = run(['python3', os.path.join(HERE, 'check-requirements-citations.py'), '--objective', a.objective, '--draft', req])
    print(cit.stdout.rstrip())
    if cit.returncode != 0:
        if not a.waiver:
            die('citation gate has findings — not publishable unless an owner waiver names each one')
        ok('citation findings present and accepted ONLY because --waiver was given — the waiver must name each one')
    else:
        ok('citation gate: 0 findings')

    # ── Phase 4 group 1 (2026-10-12): the in-run correction record, then the two enforced READS ──────────────────
    src_dir = os.path.dirname(os.path.abspath(a.source))
    rec_path = os.path.join(src_dir, CORRECTION_RECORD)
    if not os.path.exists(rec_path):
        die(f'{CORRECTION_RECORD} is missing beside --source — run `fetch` into that directory (a hand-copied report.md '
            'would skip the correction reads)')
    import json
    rec = json.load(open(rec_path, encoding='utf-8')) or {}
    newly = {clause_key(d) for d in (rec.get('clausesNewlyDropped') or [])}
    pre_path = os.path.join(src_dir, PRE_CORRECTION)
    pre = open(pre_path, encoding='utf-8').read() if os.path.exists(pre_path) else None
    if rec.get('attempted') and pre is None:
        die(f'the correction record says a correction was attempted but {PRE_CORRECTION} is missing — re-run `fetch`')

    # The CLAUSE READ (owner decision 1a, 2026-10-11): every dropped-clause flag on the text being published is READ and
    # named — "dismissed as a checker miss" — or the spec is regenerated. A waiver never clears one.
    cl = run(['python3', os.path.join(HERE, 'check-requirements-clauses.py'), '--objective', a.objective,
              '--answers', a.answers, '--draft', req, '--json'])
    try:
        flags = json.loads(cl.stdout).get('dropped', [])
    except ValueError:
        die(f'dropped-clause check did not run:\n{cl.stdout}{cl.stderr}')
    if flags:
        for d in flags:
            tag = '  ← INTRODUCED BY THE IN-RUN CORRECTION' if clause_key(d) in newly else ''
            print(f"  ❓ clause {clause_key(d)}: \"{d['clause']}\" — anchor '{d['anchor']}' not found in the leg{tag}")
            if pre is not None and tag:
                words = [w for w in d['anchor'].split() if len(w) > 2]
                for line in pre.split('\n'):
                    if words and all(w[:5] in line.lower() for w in words):
                        print(f'       original draft had: {line.strip()[:200]}')
        found = {clause_key(d) for d in flags}
        named = {x.strip() for x in (a.clause_read or '').split(',') if x.strip()}
        if found != named:
            die(f'dropped-clause flags must each be READ: a checker miss is named in --clause-read <item>:<leg>:<anchor>,…; a real '
                f'drop means REGENERATE. Unnamed {sorted(found - named)}, not a flag {sorted(named - found)}')
        ok(f'dropped clauses: {len(flags)} flag(s), each READ and dismissed as a checker miss by the operator '
           f'(--clause-read {a.clause_read})')
    else:
        if a.clause_read:
            die(f'--clause-read names {a.clause_read} but the dropped-clause check flags nothing — remove the stale names')
        ok('dropped clauses: 0 flags')

    # The CORRECTION DIFF READ (owner decision P2 = c'): an ADOPTED correction (the pre-correction draft exists and
    # differs from the delivered text) that CLEARED size (the original's program view was over the read limit) — every
    # leg / Approvals / Acceptance section it shrank is read for a deleted obligation, which no check can see. Since
    # Z66 review F2 also one whose record shows the citation count FELL (rule 4 adopts a merged row), with the Design
    # decisions section read too.
    # Adopted ⇔ the delivered text does not begin with the original draft: a NOT-adopted correction delivers the
    # original (the platform may append a section after it, e.g. reviewer warnings), an adopted one delivers new text.
    if pre is not None and not normalized(text).startswith(normalized(pre)):
        pre_file = os.path.join(out, '.pre-correction-for-size.md')
        open(pre_file, 'w', encoding='utf-8').write(pre)
        pv_pre = run(['python3', rules, '--program-view', pre_file, pre_file + '.view'])
        size_pre = run(['python3', rules, '--size-check', pre_file + '.view' if pv_pre.returncode == 0 else pre_file])
        for f in (pre_file, pre_file + '.view'):
            if os.path.exists(f):
                os.unlink(f)
        mb_, ma_ = rec.get('measuresBefore') or {}, rec.get('measuresAfter') or {}
        cit_fell = (rec.get('adopted') is True and isinstance(mb_.get('citationsTotal'), int)
                    and isinstance(ma_.get('citationsTotal'), int) and ma_['citationsTotal'] < mb_['citationsTotal'])
        if size_pre.returncode != 0 or cit_fell:
            import difflib
            before, after = h2_sections(pre), h2_sections(text)
            sections = DIFF_SECTIONS_CITATIONS if cit_fell else DIFF_SECTIONS
            why = ' and '.join(x for x, c in (('to fit the read limit', size_pre.returncode != 0),
                                              (f"with fewer citations ({mb_.get('citationsTotal')} → {ma_.get('citationsTotal')})", cit_fell)) if c)
            shrunk = [k for k in before if sections.match(k) and k in after and len(after[k]) < len(before[k])]
            # Shown so a person can actually read it (Phase 4 step 5 replay, 2026-10-12: a plain diff printed 136 lines
            # for ONE correction, nearly all rewordings). Each removed line is matched to its closest line in the new
            # section: NO COUNTERPART (< 0.5 similar) in full — where a deletion hides; REWORDED (0.5–0.85) as
            # before → after; near-identical (≥ 0.85) counted only. A line can be "no counterpart" and still survive
            # merged elsewhere — check, then name the section; a real deletion means regenerate.
            for k in shrunk:
                new_lines = [l.strip() for l in after[k].split('\n') if l.strip()]
                removed = [l[2:].strip() for l in difflib.ndiff(before[k].split('\n'), after[k].split('\n'))
                           if l.startswith('- ') and l[2:].strip()]
                gone, reworded, near = [], [], 0
                for l in removed:
                    best = max(new_lines, key=lambda x: difflib.SequenceMatcher(None, l, x).ratio()) if new_lines else ''
                    r = difflib.SequenceMatcher(None, l, best).ratio() if best else 0.0
                    if r >= 0.85:
                        near += 1
                    elif r >= 0.5:
                        reworded.append((l, best))
                    else:
                        gone.append(l)
                print(f'  ✂ {k}: {len(before[k]):,} → {len(after[k]):,} chars — {len(gone)} line(s) with NO counterpart, '
                      f'{len(reworded)} reworded, {near} near-identical')
                for l in gone:
                    print(f'      ✗ {l[:300]}')
                for o_, n_ in reworded:
                    print(f'      ~ {o_[:160]}\n        → {n_[:160]}')
            named = {x.strip() for x in (a.correction_diff_read or '').split(',') if x.strip()}
            if set(shrunk) != named:
                die(f'an in-run correction was ADOPTED {why} and shrank these sections — READ each one\'s removed '
                    'lines for a deleted obligation; none deleted ⇒ name it in --correction-diff-read "<section>,…"; one '
                    f'deleted ⇒ REGENERATE. Unnamed {sorted(set(shrunk) - named)}, not shrunk {sorted(named - set(shrunk))}')
            ok(f'correction diff read: {len(shrunk)} shrunk section(s) READ, no obligation deleted (--correction-diff-read '
               f'{a.correction_diff_read})')
        elif a.correction_diff_read:
            die('--correction-diff-read given, but the adopted correction neither cleared a size failure nor lowered the '
                'citation count — remove it')
    elif a.correction_diff_read:
        die('--correction-diff-read given, but no in-run correction was adopted on this draft — remove it')

    topo = os.path.join(out, 'topology.json')
    size = run(['python3', rules, '--size-check', req, topo])
    fetch = 'requirements.md'
    if size.returncode != 0:
        print(size.stdout.rstrip())
        run(['python3', rules, '--program-view', req], check=True)
        pv = os.path.join(out, 'requirements.program.md')
        s2 = run(['python3', rules, '--size-check', pv, topo])
        print(s2.stdout.rstrip())
        if s2.returncode != 0:
            die('even the program view is over the read limit (size is NON_WAIVABLE) — trim author-facing prose and regenerate; never raise a cap to fit')
        fetch = 'requirements.program.md'
        ok('size: requirements.md over the read limit → program view written and fits; the program fetches requirements.program.md')
    else:
        ok('size check passed for requirements.md + topology.json')

    notes = [f'# Publish notes — {a.name}', '',
             '**Not a program input.** The program reads `' + fetch + '` and `topology.json` only.', '',
             f'- **Source:** <generation task id> — <title>, <date>, requirements-authoring protocol <version>.',
             f'- **Verdict:** <APPROVED | NEEDS-REVISION> (Reviewer <score>). **Owner decisions left:** <none | …>.',
             f'- **`topology.json`** byte-identical to `{a.topology_from}/topology.json`.', '']
    if a.waiver:
        notes += [open(a.waiver, encoding='utf-8').read().rstrip(), '']
    notes += ['## Checks run before publishing (publish-generated-spec.py)'] + [f'- {l[2:]}' for l in log] + [
        '- §2 full human read for harvested state (names, counts, worked example, preconditions): <done by — date>',
        '- Derivation POPULATION matches the objective\'s noun: <done by — date>', '']
    open(os.path.join(out, 'PUBLISH-NOTES.md'), 'w', encoding='utf-8').write('\n'.join(notes))

    print(f'\n{"WROTE" if a.write else "DRY RUN — staged in"} {out}')
    print('Before committing: fill the <…> parts of PUBLISH-NOTES.md, and do the §2 full read of requirements.md by hand.')
    if a.write:
        files = ' '.join(f'program-artifacts/{a.name}/{f}' for f in sorted(os.listdir(out)))
        print(f'\nThen (public repo — a person runs this):\n  cd {repo} && git add {files} && '
              f'git commit -m "program-artifacts: {a.name} (generated spec, published)" && git push origin main')
        print(f'  python3 {os.path.relpath(__file__)} verify --name {a.name} --files {fetch},topology.json')
    else:
        print('\nRe-run with --write to create the directory.')


# ── verify ───────────────────────────────────────────────────────────────────────────────────────
def cmd_verify(a):
    repo = os.path.expanduser(a.repo)
    bad = 0
    for f in a.files.split(','):
        url = f'{RAW}/{a.name}/{f}'
        local = os.path.join(repo, 'program-artifacts', a.name, f)
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                code, data = r.status, r.read()
        except urllib.error.HTTPError as e:
            code, data = e.code, b''
        same = os.path.exists(local) and data == open(local, 'rb').read()
        print(f'{f}: HTTP {code} · {"identical" if same else "DIFFERS"}')
        bad += (code != 200) or not same
    if bad:
        die('not ready — raw caches ~5 min (a pre-push 404 can be cached); retry before launching the program')
    print('✅ every file the Architect will fetch is served and identical')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    f = sub.add_parser('fetch'); f.add_argument('--task', required=True); f.add_argument('--out', required=True)
    p = sub.add_parser('prepare')
    for k in ('--source', '--objective', '--answers', '--name', '--topology-from'):
        p.add_argument(k, required=True)
    p.add_argument('--waiver'); p.add_argument('--lint-read', help='<line>:<token>,… — lint hits READ and found NOT harvested')
    p.add_argument('--clause-read', help='<item>:<leg>:<anchor>,… (the anchor exactly as printed) — dropped-clause flags READ and found to be checker misses')
    p.add_argument('--correction-diff-read', help='<section>,… — sections an adopted correction shrank, READ, nothing deleted')
    p.add_argument('--repo', default='~/paichart'); p.add_argument('--write', action='store_true')
    v = sub.add_parser('verify'); v.add_argument('--name', required=True)
    v.add_argument('--files', default='requirements.md,topology.json'); v.add_argument('--repo', default='~/paichart')
    a = ap.parse_args()
    {'fetch': cmd_fetch, 'prepare': cmd_prepare, 'verify': cmd_verify}[a.cmd](a)


if __name__ == '__main__':
    main()
