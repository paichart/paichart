#!/usr/bin/env python3
"""docs-inventory — evidence and ratchet for the public repo's documentation (2026-11-12). READ-ONLY.

  python3 scripts/docs-inventory.py --public ~/paichart --out <dir>             # write inventory.csv, refs-broken.csv, SUMMARY.md
  python3 scripts/docs-inventory.py --public ~/paichart --write-baseline <json> # record today's counts
  python3 scripts/docs-inventory.py --public ~/paichart --check <json>          # WARN when a count grew (--strict: exit 1)
  python3 scripts/docs-inventory.py --public ~/paichart --user-docs             # R1–R3 over docs/**/*.md (WARN; --strict: exit 1)
  python3 scripts/docs-inventory.py --self-test

For every markdown file TRACKED in the public repo it records mechanical signals only (facts, no judgement):
  reachable — from a USER entry point (README.md, CONTRIBUTING.md, SECURITY.md, docs/*.md), never passing THROUGH CLAUDE.md or an
              agent file: by clickable markdown links only (`user_clicks`), and by any named path (`user_named`); and from ANY
              entry point (those plus CLAUDE.md and .claude/agents/*.md). A LINK to a directory reaches every doc under it; a
              directory only named in prose reaches none on the user walk.
  cited by  — other docs, agent files (and CLAUDE.md), non-markdown files (code, tests, scripts, workflows) that name its path;
              a BARE filename counts when the citing doc sits in the same directory (siblings cite each other that way).
  refs out  — the repo paths it names, and how many are absent from the public repo: `private-only` (tracked in the private repo)
              or `in-neither` (stale).
  size, age — lines; date of the last commit that touched it (private repo, or the public repo for public-owned files).

What a "reference" is: a relative markdown link, or a path-shaped token starting at a known top-level directory. A token counts as
PRESENT when it exists at the repo root, OR relative to the citing file's directory (`tests/VT-01.md` inside verification/README.md),
OR when a tracked path starts with it (an import path without its extension; the stem of a glob). Tokens with placeholders
(<x>, *, {x}, $X, …) and package names (`@prisma/client`) are skipped. Lenient on purpose: "missing" must mean missing.

Corrections folded 2026-11-12 (FRAME.md §12): the user walk no longer continues through CLAUDE.md / agent files and now follows
directory links; "unreachable" replaces "named by nothing"; file-relative tokens; bare sibling filenames; `@scope/` packages.
"""
import argparse, bisect, csv, json, os, re, subprocess, sys, tempfile
from collections import Counter, defaultdict, deque

ROOTS = ('.claude/', 'docs/', 'scripts/', 'lib/', 'app/', 'cline_docs/', 'prisma/', 'services/', 'usecases/', 'verification/',
         'tutorials/', 'protocols/', 'examples/', 'program-artifacts/', 'components/', 'tests/', 'test/', '.github/', 'pipelines/',
         'case-studies/', 'academic/', 'descriptors/', 'config/', 'types/', 'middleware/', 'public/', 'data/')
TOKEN = re.compile(r'(?<![\w./@-])/?((?:' + '|'.join(re.escape(r) for r in ROOTS) + r')[\w./@+-]*[\w/])')
LINK = re.compile(r'\]\(([^)\s#]+)(?:#[^)]*)?\)')
ROOT_FILES = re.compile(r'(?<![\w./-])(README\.md|CLAUDE\.md|CONTRIBUTING\.md|SECURITY\.md|NOTICE|LICENSE)(?![\w/-])')
BARE_MD = re.compile(r'(?<![\w./-])([A-Za-z0-9][\w.-]*\.md)(?![\w/-])')
SKIP = re.compile(r'[<>*{}$…\\]|\.\.\.')
USER_ENTRY = ('README.md', 'CONTRIBUTING.md', 'SECURITY.md')
BINARY = ('.png', '.jpg', '.svg', '.ico', '.mp4', '.lock', '.woff2', '.gif', '.pdf')
COUNT_KEYS = ('private_only_refs', 'in_neither_refs', 'agent_files_with_missing_paths', 'docs_unreachable_from_any_entry')


def git(cwd, *a):
    return subprocess.run(['git', *a], cwd=cwd, capture_output=True, text=True, check=True).stdout


def clean(tok):
    return re.sub(r'(:\d+(-\d+)?)+$', '', tok).rstrip('.')


def refs_of(path, text):
    """(links, tokens): repo-relative targets of clickable relative links; path-shaped tokens as written."""
    links, tokens, base = set(), set(), os.path.dirname(path)
    for m in LINK.finditer(text):
        t = m.group(1)
        if re.match(r'^[a-z][a-z0-9+.-]*:', t, re.I) or SKIP.search(t):
            continue
        links.add(t.lstrip('/') if t.startswith('/') else os.path.normpath(os.path.join(base, t)))
    for m in TOKEN.finditer(text):
        t = clean(m.group(1))
        if not SKIP.search(m.group(0)) and '/' in t:
            tokens.add(t)
    for m in ROOT_FILES.finditer(text):
        tokens.add(m.group(1))
    links.discard(path); tokens.discard(path)
    return links, tokens


class Tree:
    def __init__(self, root):
        self.root = root
        self.files = [p for p in git(root, 'ls-files', '-z').split('\0') if p]
        self.set = set(self.files)
        self.sorted = sorted(self.set)
        d = {os.path.dirname(p) for p in self.files}
        self.dirs = d | {x[:i] for x in d for i in range(len(x)) if x[i] == '/'}

    def has(self, r, base=''):
        """Present at the repo root, relative to `base`, or as the prefix of a tracked path."""
        for c in ((r,) if not base else (r, os.path.normpath(os.path.join(base, r)))):
            c = c.rstrip('/')
            if c in self.set or c in self.dirs:
                return True
            i = bisect.bisect_left(self.sorted, c)
            if i < len(self.sorted) and self.sorted[i].startswith(c):
                return True
        return False


def measure(pub_root, priv_root=None):
    pub = Tree(pub_root)
    priv = Tree(priv_root) if priv_root else None
    mds = [p for p in pub.files if p.endswith('.md')]
    md_set = set(mds)
    links, tokens, lines, text_of = {}, {}, {}, {}
    for p in mds:
        try:
            t = open(os.path.join(pub_root, p), encoding='utf-8', errors='replace').read()
        except OSError:
            continue
        links[p], tokens[p] = refs_of(p, t)
        lines[p], text_of[p] = t.count('\n') + 1, t

    def resolve(src, r, dirs=True):
        """The markdown docs a reference from `src` reaches: the file itself, or (dirs=True) every doc under a directory."""
        for c in (r, os.path.normpath(os.path.join(os.path.dirname(src), r))):
            c = c.rstrip('/')
            if c in md_set:
                return [c]
            if dirs and c in pub.dirs:
                return [m for m in mds if m.startswith(c + '/')]
        return []

    code_cites = Counter()
    for p in pub.files:
        if p.endswith('.md') or os.path.splitext(p)[1] in BINARY:
            continue
        full = os.path.join(pub_root, p)
        try:
            if os.path.getsize(full) > 2_000_000:
                continue
            t = open(full, encoding='utf-8', errors='ignore').read()
        except OSError:
            continue
        for r in {clean(m.group(1)) for m in TOKEN.finditer(t)}:
            if r in md_set:
                code_cites[r] += 1
    is_agent = lambda p: p == 'CLAUDE.md' or p.startswith('.claude/agents/')
    doc_cites, agent_cites = Counter(), Counter()
    by_dir = defaultdict(set)
    for p in mds:
        by_dir[os.path.dirname(p)].add(os.path.basename(p))
    for p in links:
        cited = set()
        for r in links[p] | tokens[p]:
            cited.update(t for t in resolve(p, r) if t in md_set and (r.rstrip('/') == t or os.path.normpath(os.path.join(os.path.dirname(p), r)) == t))
        for m in BARE_MD.finditer(text_of[p]):  # bare sibling filename
            b = m.group(1)
            if b in by_dir[os.path.dirname(p)] and b != os.path.basename(p):
                cited.add(os.path.join(os.path.dirname(p), b) if os.path.dirname(p) else b)
        cited.discard(p)
        for t in cited:
            (agent_cites if is_agent(p) else doc_cites)[t] += 1

    def walk(entry, edges, stop=lambda p: False, token_dirs=True):
        hops, q = {p: 0 for p in entry}, deque(entry)
        while q:
            p = q.popleft()
            if stop(p) and hops[p] > 0:
                continue                      # reached, but the walk does not continue through it
            for r in edges(p):
                # a LINK to a directory opens its listing, so it reaches the docs under it; a directory merely NAMED in prose
                # (`.claude/`) points at no particular doc and, on the user walk, reaches none
                for t in resolve(p, r, dirs=token_dirs or r in links.get(p, ())):
                    if t not in hops:
                        hops[t] = hops[p] + 1
                        q.append(t)
        return hops

    user_entry = [p for p in mds if p in USER_ENTRY or (p.startswith('docs/') and p.count('/') == 1)]
    any_entry = user_entry + [p for p in mds if p == 'CLAUDE.md' or (p.startswith('.claude/agents/') and p.count('/') == 2)]
    h_click = walk(user_entry, lambda p: links.get(p, ()), is_agent)
    h_named = walk(user_entry, lambda p: links.get(p, set()) | tokens.get(p, set()), is_agent, token_dirs=False)
    h_any = walk(any_entry, lambda p: links.get(p, set()) | tokens.get(p, set()))
    h_index = walk([p for p in mds if p == 'docs/README.md'], lambda p: links.get(p, ()), is_agent)

    rows, broken = [], []
    for p in sorted(links):
        base = os.path.dirname(p)
        miss_priv, miss_none = [], []
        for r in sorted(links[p] | tokens[p]):
            if pub.has(r, base if r in tokens[p] else ''):
                continue
            (miss_priv if priv and (priv.has(r, base if r in tokens[p] else '') or r == 'CLAUDE.md') else miss_none).append(r)
        broken += [(p, r, 'private-only') for r in miss_priv] + [(p, r, 'in-neither') for r in miss_none]
        rows.append(dict(path=p, group=group(p), lines=lines[p], user_clicks=h_click.get(p, ''), user_named=h_named.get(p, ''),
                         any_entry=h_any.get(p, ''), index_clicks=h_index.get(p, ''), cited_by_docs=doc_cites[p], cited_by_agents=agent_cites[p], cited_by_code=code_cites[p],
                         refs_out=len(links[p] | tokens[p]), broken_private_only=len(miss_priv), broken_in_neither=len(miss_none)))
    counts = dict(
        markdown_files=len(rows),
        user_reachable_by_clicks=sum(1 for r in rows if r['user_clicks'] != ''),
        user_reachable_by_clicks_under_claude=sum(1 for r in rows if r['user_clicks'] != '' and r['path'].startswith('.claude/')),
        user_reachable_by_named_path=sum(1 for r in rows if r['user_named'] != ''),
        docs_unreachable_from_any_entry=sum(1 for r in rows if r['any_entry'] == ''),
        private_only_refs=sum(1 for b in broken if b[2] == 'private-only'),
        in_neither_refs=sum(1 for b in broken if b[2] == 'in-neither'),
        readme_links_index=int('docs/README.md' in links.get('README.md', ())),
        agent_files=sum(1 for r in rows if r['path'].startswith('.claude/agents/')),
        agent_files_with_missing_paths=sum(1 for r in rows if r['path'].startswith('.claude/agents/') and r['broken_private_only'] + r['broken_in_neither']),
        agent_files_with_private_only_paths=sum(1 for r in rows if r['path'].startswith('.claude/agents/') and r['broken_private_only']),
    )
    return rows, broken, counts


def group(p):
    s = p.split('/')
    if len(s) == 1:
        return '(root)'
    if s[0] == '.claude':
        return '/'.join(s[:3]) if len(s) > 3 else '/'.join(s[:2])
    return s[0] if len(s) == 2 else '/'.join(s[:2]) if s[0] in ('docs', 'usecases', 'verification') else s[0]


def write_pack(out, pub_root, priv_root, rows, broken, counts):
    def age(p):
        src = 'CLAUDE.public.md' if p == 'CLAUDE.md' else p
        in_priv = priv_root and subprocess.run(['git', 'ls-files', '--error-unmatch', src], cwd=priv_root, capture_output=True).returncode == 0
        return git(priv_root if in_priv else pub_root, 'log', '-1', '--format=%cs', '--', src if in_priv else p).strip() or '?'
    os.makedirs(out, exist_ok=True)
    for r in rows:
        r['last_commit'] = age(r['path'])
    with open(os.path.join(out, 'inventory.csv'), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator='\n'); w.writeheader(); w.writerows(rows)
    with open(os.path.join(out, 'refs-broken.csv'), 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n'); w.writerow(['from', 'names', 'kind']); w.writerows(broken)
    g = defaultdict(list)
    for r in rows:
        g[r['group']].append(r)
    o = [f"# Docs inventory — public repo at `{git(pub_root, 'rev-parse', '--short', 'HEAD').strip()}`\n",
         f"Markdown files tracked: **{counts['markdown_files']}** ({sum(r['lines'] for r in rows):,} lines).\n",
         f"- a reader starting at README.md / CONTRIBUTING.md / SECURITY.md / `docs/*.md` reaches **{counts['user_reachable_by_clicks']}** files by clickable links ({counts['user_reachable_by_clicks_under_claude']} under `.claude/`), **{counts['user_reachable_by_named_path']}** by any named path — the walk never continues through CLAUDE.md or an agent file",
         f"- unreachable from ANY entry point (those plus CLAUDE.md and the agent files): **{counts['docs_unreachable_from_any_entry']}**",
         f"- references to paths absent from the public repo: **{len(broken)}** — private-only {counts['private_only_refs']}, in neither repo {counts['in_neither_refs']}",
         f"- agent files naming a path a self-host does not have: **{counts['agent_files_with_missing_paths']} of {counts['agent_files']}** ({counts['agent_files_with_private_only_paths']} with a private-only path)\n",
         '## By directory\n\n| directory | files | lines | user: clicks | user: named | any entry | cited by agents | unreachable | missing refs out | oldest / newest touch |\n|---|---|---|---|---|---|---|---|---|---|']
    for k in sorted(g, key=lambda k: -len(g[k])):
        v = g[k]; d = sorted(r['last_commit'] for r in v)
        o.append(f"| `{k}` | {len(v)} | {sum(r['lines'] for r in v):,} | {sum(1 for r in v if r['user_clicks'] != '')} | {sum(1 for r in v if r['user_named'] != '')} | {sum(1 for r in v if r['any_entry'] != '')} | {sum(1 for r in v if r['cited_by_agents'])} | {sum(1 for r in v if r['any_entry'] == '')} | {sum(r['broken_private_only'] + r['broken_in_neither'] for r in v)} | {d[0]} / {d[-1]} |")
    o.append('\n## CLAUDE.md and the agent files — paths a self-host does not have\n\n| file | paths named | private-only | in neither repo |\n|---|---|---|---|')
    for r in sorted((r for r in rows if r['path'] == 'CLAUDE.md' or r['group'] == '.claude/agents'), key=lambda r: -(r['broken_private_only'] + r['broken_in_neither'])):
        if r['broken_private_only'] + r['broken_in_neither']:
            o.append(f"| `{r['path']}` | {r['refs_out']} | {r['broken_private_only']} | {r['broken_in_neither']} |")
    allt = Counter()
    for _, r_, k_ in broken:
        s = r_.split('/'); allt[(s[0] + '/' if len(s) > 1 else s[0]) + ' — ' + k_] += 1
    o.append('\n## Where missing paths point\n\n| target | count |\n|---|---|')
    o += [f'| `{k}` | {v} |' for k, v in allt.most_common(15)]
    o.append('\n## What a reader reaches by clicking (hops from a user entry point)\n')
    for r in sorted((r for r in rows if r['user_clicks'] != ''), key=lambda r: (r['user_clicks'], r['path'])):
        o.append(f"- {r['user_clicks']}: `{r['path']}` ({r['lines']} lines)")
    open(os.path.join(out, 'SUMMARY.md'), 'w').write('\n'.join(o) + '\n')
    print('\n'.join(o[:6]))


def check(counts, baseline_path, strict):
    base = json.load(open(baseline_path))['counts']
    grew = [(k, base[k], counts[k]) for k in COUNT_KEYS if counts[k] > base.get(k, 0)]
    for k in COUNT_KEYS:
        print(f"  {'GREW ' if counts[k] > base.get(k, 0) else 'ok   '} {k}: baseline {base.get(k)} → now {counts[k]}")
    if grew:
        print(f"WARNING: {len(grew)} docs count(s) grew past the baseline ({baseline_path}). Fix the new references, or re-baseline with --write-baseline and say why in the commit.")
    return 1 if grew and strict else 0


OWN_URL = re.compile(r'https://(?:github\.com/paichart/(paichart|paichart-configs)/(?:blob|tree)/main/|raw\.githubusercontent\.com/paichart/(paichart|paichart-configs)/main/)([\w./@+-]*[\w/])')


def user_docs_check(pub_root, rows, broken, counts, configs_root=None):
    """R1–R3 over the USER docs (every tracked `docs/**/*.md`). Returns a list of findings (strings); empty = green.
    R1 every path, relative link and own-repo URL a user doc names exists · R2 no user doc names a private-only path ·
    R3 every user doc is reachable from docs/README.md in ≤ 2 clicks, and README.md links docs/README.md."""
    out, pub = [], Tree(pub_root)
    cfg = Tree(configs_root) if configs_root and os.path.isdir(os.path.join(configs_root, '.git')) else None
    user = [r for r in rows if r['path'].startswith('docs/')]
    names = {r['path'] for r in user}
    for f, r, kind in broken:
        if f in names:
            out.append(f"{'R2' if kind == 'private-only' else 'R1'} {f}: names `{r}` — {'a private-only path' if kind == 'private-only' else 'not in this repository'}")
    for r in user:
        t = open(os.path.join(pub_root, r['path']), encoding='utf-8', errors='replace').read()
        for m in OWN_URL.finditer(t):
            repo, path = m.group(1) or m.group(2), m.group(3).rstrip('/')
            tree = pub if repo == 'paichart' else cfg
            if tree is None:
                continue                      # no local clone of the configs repo: not checked, said once below
            if not (path in tree.set or path in tree.dirs):
                out.append(f"R1 {r['path']}: URL into {repo} names `{path}` — not in that repository")
        if r['path'] != 'docs/README.md' and not t.startswith('# Moved') and (r['index_clicks'] == '' or r['index_clicks'] > 2):  # a "# Moved" stub is exempt
            out.append(f"R3 {r['path']}: not reachable from docs/README.md in 2 clicks")
    if not counts['readme_links_index']:
        out.append('R3 README.md does not link docs/README.md')
    if not any(r['path'] == 'docs/README.md' for r in user):
        out.append('R3 docs/README.md (the index) does not exist')
    if cfg is None:
        print('  (URLs into paichart-configs not checked: no local clone given with --configs)')
    return out


def self_test():
    def repo(files):
        d = tempfile.mkdtemp()
        for p, t in files.items():
            os.makedirs(os.path.dirname(os.path.join(d, p)) or d, exist_ok=True)
            open(os.path.join(d, p), 'w').write(t)
        subprocess.run('git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm t', cwd=d, shell=True, check=True)
        return d
    pub = repo({
        'README.md': 'See [docs](docs/INSTALL.md), [proofs](verification/) and CLAUDE.md.\n',
        'docs/INSTALL.md': 'Install. Uses `@prisma/client` and `lib/logger`. Records: `cline_docs/reviews/x/PLAN.md`. Old: `lib/gone.ts`.\n',
        'CLAUDE.md': 'Agents: `.claude/agents/a.md`.\n',
        '.claude/agents/a.md': 'Read `.claude/knowledge/k.md` and `scripts/private-only.sh`.\n',
        '.claude/knowledge/k.md': 'k\n', '.claude/knowledge/orphan.md': 'o\n',
        'verification/README.md': 'Tests: `tests/VT-01.md`.\n', 'verification/tests/VT-01.md': 'vt\n',
        'pipelines/A.md': 'See B.md for the rest.\n', 'pipelines/B.md': 'b\n',
        'lib/logger.ts': 'x\n', 'prisma/schema.prisma': 'x\n',
    })
    priv = repo({'cline_docs/reviews/x/PLAN.md': 'p\n', 'scripts/private-only.sh': 'x\n', 'CLAUDE.public.md': 'c\n'})
    rows, broken, c = measure(pub, priv)
    by = {r['path']: r for r in rows}
    cases = [
        ('the user walk reaches CLAUDE.md but does not continue through it', by['CLAUDE.md']['user_named'] == 1 and by['.claude/agents/a.md']['user_named'] == '' and by['.claude/knowledge/k.md']['user_named'] == ''),
        ('a directory link reaches the docs under it', by['verification/tests/VT-01.md']['user_clicks'] == 1),
        ('clickable reach excludes a path that is only named', by['CLAUDE.md']['user_clicks'] == ''),
        ('unreachable counts only docs no entry point reaches', c['docs_unreachable_from_any_entry'] == 3 and by['.claude/knowledge/orphan.md']['any_entry'] == ''),
        ('a token relative to the citing file is present', not any(b[0] == 'verification/README.md' for b in broken)),
        ('a bare sibling filename is a citation', by['pipelines/B.md']['cited_by_docs'] == 1),
        ('a scoped package name is not a path', not any('prisma/client' in b[1] for b in broken)),
        ('an import path without its extension is present', not any(b[1] == 'lib/logger' for b in broken)),
        ('private-only and in-neither are told apart', ('docs/INSTALL.md', 'cline_docs/reviews/x/PLAN.md', 'private-only') in broken and ('docs/INSTALL.md', 'lib/gone.ts', 'in-neither') in broken),
        ('agent files with missing paths are counted', c['agent_files_with_missing_paths'] == 1 and c['agent_files'] == 1),
    ]
    f = user_docs_check(pub, rows, broken, c, None)
    cases += [
        ('R2 flags a private-only path in a user doc', any(x.startswith('R2 docs/INSTALL.md') for x in f)),
        ('R1 flags a stale path in a user doc', any(x.startswith('R1 docs/INSTALL.md') and 'lib/gone.ts' in x for x in f)),
        ('R3 flags a missing index and a README that does not link it', any('index' in x and 'does not exist' in x for x in f) and any('README.md does not link' in x for x in f)),
    ]
    good = repo({'README.md': 'Docs: [index](docs/README.md).\n', 'docs/README.md': '[Install](INSTALL.md) [Ops](ops/RUN.md)\n', 'docs/INSTALL.md': 'See `lib/x.ts` and https://github.com/paichart/paichart/blob/main/lib/x.ts\n', 'docs/ops/RUN.md': 'run\n', 'lib/x.ts': 'x\n'})
    r2, b2, c2 = measure(good, priv)
    cases.append(('a clean user-docs set is green', user_docs_check(good, r2, b2, c2, None) == []))
    base = os.path.join(tempfile.mkdtemp(), 'b.json')
    json.dump({'counts': c}, open(base, 'w'))
    more = dict(c, private_only_refs=c['private_only_refs'] + 1)
    import io, contextlib
    with contextlib.redirect_stdout(io.StringIO()):
        cases += [('check passes at the baseline', check(c, base, True) == 0), ('check warns on growth and fails only when strict', check(more, base, False) == 0 and check(more, base, True) == 1)]
    for name, ok in cases:
        print(('PASS ' if ok else 'FAIL ') + name)
    return 0 if all(ok for _, ok in cases) else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--public')
    ap.add_argument('--private', default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument('--out'); ap.add_argument('--check'); ap.add_argument('--write-baseline')
    ap.add_argument('--strict', action='store_true'); ap.add_argument('--self-test', action='store_true')
    ap.add_argument('--user-docs', action='store_true', help='run R1–R3 over docs/**/*.md (warn; --strict exits 1)')
    ap.add_argument('--configs', default=os.path.expanduser('~/paichart-configs'))
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    if not a.public:
        ap.error('--public is required')
    pub = os.path.expanduser(a.public)
    rows, broken, counts = measure(pub, a.private)
    if a.out:
        write_pack(a.out, pub, a.private, rows, broken, counts)
    if a.write_baseline:
        json.dump({'public_head': git(pub, 'rev-parse', '--short', 'HEAD').strip(), 'counts': counts}, open(a.write_baseline, 'w'), indent=2)
        print(f'baseline written: {a.write_baseline}')
    rc = 0
    if a.user_docs:
        f = user_docs_check(pub, rows, broken, counts, a.configs)
        for x in f:
            print('  WARNING ' + x)
        print(f"user docs (docs/**/*.md): {'R1–R3 green' if not f else str(len(f)) + ' finding(s)'}")
        rc = 1 if f and a.strict else 0
    if a.check:
        return max(rc, check(counts, a.check, a.strict))
    if a.user_docs:
        return rc
    if not (a.out or a.write_baseline):
        print(json.dumps(counts, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
