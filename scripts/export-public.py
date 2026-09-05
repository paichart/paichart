#!/usr/bin/env python3
"""
export-public — project this private repo onto the public one (open-source readiness Phase 5).

  python3 scripts/export-public.py --out /tmp/paichart-export            # scratch projection
  python3 scripts/export-public.py --into ~/paichart                     # MERGE into the public repo's working tree

What it does, in order:
  1. Takes `git ls-files` (tracked files ONLY — .env, keys, build output cannot cross by construction).
  2. Applies scripts/export/public-allowlist.rules (ordered, first match wins) plus one dynamic rule:
     scripts/test-* ships only if wired (referenced by any package.json script, a workflow, or the
     pre-commit hook) — decision 3 in SCRIPT-TRIAGE.md: tests that run nowhere stay private.
  3. Copies the survivors and applies the MECHANICAL sweeps to text files in the COPY (never here):
     prod IP → <PROD_HOST>, root@<PROD_HOST> → <PROD_USER>@<PROD_HOST>, maintainer personal emails →
     <maintainer-email>. These are live operating instructions in the private repo; the scrub lives here.
  4. Runs gitleaks over the copy with this repo's .gitleaks.toml. Any leak = non-zero exit.
  5. Writes <out>/../export-report.md: counts by top dir, sweep tallies, and a RESIDUAL scan (things
     that need judgment, not sed: remaining paichart.app hosts, CUIDs, company emails).
Re-runnable. --out recreates a scratch dir. --into merges into an EXISTING checkout of the public repo
(paichart/paichart, decision 2026-09-04): never overwrites README.md (the front door owns it), replaces
LICENSE (Apache 2.0 decision), UNIONS .gitignore, writes CLAUDE.public.md as CLAUDE.md, and keeps
.export-manifest so a re-export also DELETES files that stopped crossing — but never touches files the
public repo owns (anything not in the previous manifest). Refuses if an export path would overwrite a
repo-owned file. It stages nothing: review `git status` there, then commit.
"""
import argparse, fnmatch, os, re, shutil, subprocess, sys, json
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES = os.path.join(ROOT, 'scripts', 'export', 'public-allowlist.rules')
PROD_IP = '<PROD_HOST>'
PERSONAL = ['<maintainer-email>', '<maintainer-email>', '<maintainer-email>']  # the last is the operator's work address — docs mention it as the prod admin identity
TEXT_EXT = {'.md', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.sh', '.txt', '.toml', '.py', '.sql', '.tf', '.conf', '.env', '.example', '.rules', '.css'}

def glob_to_re(p):
    out = '^'
    i = 0
    while i < len(p):
        c = p[i]
        if p.startswith('**', i):
            out += '.*'; i += 2
            if i < len(p) and p[i] == '/': i += 1
            continue
        if c == '*': out += '[^/]*'
        elif c == '?': out += '[^/]'
        elif c in '.+()[]{}^$|\\': out += '\\' + c
        else: out += c
        i += 1
    return re.compile(out + '$')

def load_rules():
    rules = []
    for line in open(RULES, encoding='utf-8'):
        s = line.strip()
        if not s or s.startswith('#'): continue
        sign, pat = s[0], s[2:].strip()
        assert sign in '+-', f'bad rule: {s}'
        rules.append((sign == '+', pat, glob_to_re(pat)))
    return rules

def ci_wired_tests():
    pkg = json.load(open(os.path.join(ROOT, 'package.json')))['scripts']
    chain = pkg.get('test:all-validation', '')
    names = re.findall(r'npm run ([\w:.-]+)', chain)
    files = set()
    # "wired" = referenced by ANY package.json script (CI chain or manual suite), a workflow, or the hook.
    # Decision 3 excludes tests that run NOWHERE; a test an `npm run` names must cross or the script dangles.
    for v in pkg.values():
        files.update(re.findall(r'scripts/([\w./-]+)', v))
    blob = ''
    for f in os.listdir(os.path.join(ROOT, '.github', 'workflows')):
        blob += open(os.path.join(ROOT, '.github', 'workflows', f), encoding='utf-8').read()
    blob += open(os.path.join(ROOT, '.githooks', 'pre-commit'), encoding='utf-8').read()
    files.update(re.findall(r'scripts/([\w./-]+)', blob))
    return {f'scripts/{f}' for f in files}

def decide(path, rules, wired):
    base = os.path.basename(path)
    if path.startswith('scripts/') and base.startswith('test-') and path not in wired:
        return False, 'not CI-wired (decision 3)'
    for inc, pat, rx in rules:
        if rx.match(path):
            return inc, pat
    return False, '(no rule)'

def is_text(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in TEXT_EXT or os.path.basename(path) in {'pre-commit', 'LICENSE', '.gitignore', '.gitattributes', '.editorconfig', '.env.example'}:
        return True
    return False

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', help='scratch output dir (recreated)')
    ap.add_argument('--into', help='existing checkout of the public repo to merge into')
    ap.add_argument('--init-git', action='store_true', help='git init + initial commit in the output (no push)')
    ap.add_argument('--maintainer-email', default='<maintainer-email>')
    ap.add_argument('--allow-mass-removal', action='store_true', help='permit removing >10%% of the previous manifest')
    a = ap.parse_args()
    if bool(a.out) == bool(a.into):
        sys.exit('pass exactly one of --out or --into')
    # SOURCE GUARD: this must run from the PRIVATE repo. cline_docs/ never crosses, so its absence means we
    # are running from an exported copy — where `git ls-files` would yield ~2 crossable files and the
    # manifest-driven deletion pass would wipe the public tree (observed 2026-09-04 on a scratch clone).
    if not os.path.isdir(os.path.join(ROOT, 'cline_docs')) or not os.path.exists(os.path.join(ROOT, 'CLAUDE.md')):
        sys.exit(f'REFUSING: {ROOT} is not the private source repo (no cline_docs/ + CLAUDE.md) — run from copov15')
    if a.into and os.path.realpath(a.into) == os.path.realpath(ROOT):
        sys.exit('REFUSING: --into target is the source repo')
    into = bool(a.into)
    out = os.path.abspath(a.into or a.out)
    prev_manifest = set()
    owned = set()
    if into:
        if not os.path.isdir(os.path.join(out, '.git')):
            sys.exit(f'--into target is not a git checkout: {out}')
        mp = os.path.join(out, '.export-manifest')
        if os.path.exists(mp):
            prev_manifest = {l.strip() for l in open(mp, encoding='utf-8') if l.strip()}
        tracked_there = subprocess.run(['git', 'ls-files'], cwd=out, capture_output=True, text=True).stdout.split('\n')
        owned = {f for f in tracked_there if f and f not in prev_manifest}
    else:
        if os.path.exists(out): shutil.rmtree(out)
        os.makedirs(out)

    tracked = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, capture_output=True, text=True).stdout.split('\0')
    tracked = [t for t in tracked if t]
    rules = load_rules(); wired = ci_wired_tests()
    kept, dropped, why = [], [], Counter()
    for p in tracked:
        inc, reason = decide(p, rules, wired)
        (kept if inc else dropped).append(p)
        if not inc: why[reason] += 1

    OVERWRITE_OK = {'LICENSE'}          # Apache 2.0 replaces the public repo's MIT (decision 2026-09-04)
    MERGE = {'.gitignore'}              # union of lines
    RENAME = {'CLAUDE.public.md': 'CLAUDE.md'}
    if into:
        clashes = sorted(p for p in kept if RENAME.get(p, p) in owned and RENAME.get(p, p) not in OVERWRITE_OK | MERGE)
        if clashes:
            sys.exit('REFUSING: export would overwrite files the public repo owns: ' + ', '.join(clashes))
    sweeps = Counter(); swept_files = Counter(); written = []
    for p in kept:
        src = os.path.join(ROOT, p); tgt = RENAME.get(p, p); dst = os.path.join(out, tgt)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        written.append(tgt)
        if into and tgt in MERGE and os.path.exists(dst):
            have = open(dst, encoding='utf-8').read().split('\n')
            add = [l for l in open(src, encoding='utf-8').read().split('\n') if l.strip() and l not in have]
            if add:
                with open(dst, 'a', encoding='utf-8') as f: f.write('\n# --- merged from platform export ---\n' + '\n'.join(add) + '\n')
            continue
        if is_text(p):
            try:
                t = open(src, encoding='utf-8').read()
            except UnicodeDecodeError:
                shutil.copy2(src, dst); continue
            n0 = t
            c = t.count(f'root@{PROD_IP}'); t = t.replace(f'root@{PROD_IP}', '<PROD_USER>@<PROD_HOST>'); sweeps['root@ip'] += c
            c = t.count(PROD_IP); t = t.replace(PROD_IP, '<PROD_HOST>'); sweeps['prod-ip'] += c
            for e in PERSONAL:
                c = t.count(e); t = t.replace(e, a.maintainer_email); sweeps['personal-email'] += c
            if t != n0: swept_files[p.split('/')[0]] += 1
            with open(dst, 'w', encoding='utf-8') as f: f.write(t)
            shutil.copymode(src, dst)
        else:
            shutil.copy2(src, dst)

    removed = []
    if into:
        gone = sorted(prev_manifest - set(written))
        if prev_manifest and len(gone) > 0.10 * len(prev_manifest) and not a.allow_mass_removal:
            sys.exit(f'REFUSING: {len(gone)} of {len(prev_manifest)} previously exported files would be removed (>10%). '
                     'If intended (rules changed), re-run with --allow-mass-removal.')
        for old in gone:
            fp = os.path.join(out, old)
            if os.path.exists(fp): os.remove(fp); removed.append(old)
        with open(os.path.join(out, '.export-manifest'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(sorted(written)) + '\n')
        # the manifest is tracked (re-exports need it); the report is scratch — keep it out of the public history
        gi = os.path.join(out, '.gitignore')
        have = open(gi, encoding='utf-8').read() if os.path.exists(gi) else ''
        if '.export-report.md' not in have:
            with open(gi, 'a', encoding='utf-8') as f: f.write('\n# export scratch (regenerated every export)\n.export-report.md\n')

    # residual scan — needs judgment, reported not swept
    resid = Counter(); resid_files = Counter()
    for p in written:
        if not is_text(p): continue
        try: t = open(os.path.join(out, p), encoding='utf-8').read()
        except Exception: continue
        hits = {
            'paichart.app': len(re.findall(r'paichart\.app', t)),
            'cuid': len(re.findall(r'\bc[a-z0-9]{24}\b', t)),
            'company-email': len(re.findall(r'[\w.+-]+@paichart\.com', t)),
            'ssh-cmd': len(re.findall(r'\bssh ', t)),
        }
        for k, v in hits.items():
            if v: resid[k] += v; resid_files[k] += 1

    # gitleaks over the copy
    gl = subprocess.run(['gitleaks', 'dir', out, '--config', os.path.join(ROOT, '.gitleaks.toml'), '--no-banner', '--redact=80', '--exit-code', '1'], capture_output=True, text=True)
    leaks_ok = gl.returncode == 0
    leaks_line = (gl.stderr + gl.stdout).strip().split('\n')[-1] if (gl.stderr or gl.stdout) else ''

    by_dir = Counter(p.split('/')[0] for p in written)
    size = sum(os.path.getsize(os.path.join(out, p)) for p in written if os.path.exists(os.path.join(out, p)))
    report = os.path.join(out if into else os.path.dirname(out), '.export-report.md' if into else 'export-report.md')
    with open(report, 'w', encoding='utf-8') as r:
        r.write(f"# export-public report\n\nsource: {subprocess.run(['git','rev-parse','--short','HEAD'],cwd=ROOT,capture_output=True,text=True).stdout.strip()} · tracked {len(tracked)} · **kept {len(kept)}** · dropped {len(dropped)} · {size/1e6:.1f} MB\n\n")
        r.write("## kept, by top-level entry\n\n| entry | files |\n|---|---|\n" + "".join(f"| `{k}` | {v} |\n" for k, v in by_dir.most_common()))
        r.write("\n## dropped, by rule\n\n| rule | files |\n|---|---|\n" + "".join(f"| `{k}` | {v} |\n" for k, v in why.most_common(40)))
        r.write(f"\n## mechanical sweeps applied in the copy\n\n| sweep | replacements |\n|---|---|\n" + "".join(f"| {k} | {v} |\n" for k, v in sweeps.items()) + "\n files swept by top dir: " + ", ".join(f"{k}={v}" for k, v in swept_files.most_common()) + "\n")
        r.write(f"\n## residual (judgment, NOT swept)\n\n| kind | occurrences | files |\n|---|---|---|\n" + "".join(f"| {k} | {resid[k]} | {resid_files[k]} |\n" for k in resid))
        r.write(f"\n## gitleaks over the copy\n\n{'✅ clean' if leaks_ok else '❌ LEAKS FOUND'} — `{leaks_line}`\n")
        if into:
            r.write(f"\n## --into mode\n\nrepo-owned files preserved: {len(owned)} · previously exported: {len(prev_manifest)} · removed (stopped crossing): {len(removed)}\n" + "".join(f"- removed `{x}`\n" for x in removed))
    print(f"kept {len(kept)} / dropped {len(dropped)} of {len(tracked)} tracked → {out} ({size/1e6:.1f} MB)" + (f"   [into: owned {len(owned)} preserved, removed {len(removed)}]" if into else ''))
    print(f"sweeps: {dict(sweeps)}   residual: {dict(resid)}")
    print(f"gitleaks: {'clean' if leaks_ok else 'LEAKS — see report'}   report: {report}")
    if a.init_git:
        subprocess.run(['git', 'init', '-q', '-b', 'main'], cwd=out, check=True)
        subprocess.run(['git', 'add', '-A'], cwd=out, check=True)
        subprocess.run(['git', '-c', 'user.name=Steve Terry', '-c', 'user.email=<maintainer-email>', 'commit', '-q', '-m', 'pAIchart — initial public release'], cwd=out, check=True)
        print('git: initialised with one commit (no remote, no push)')
    sys.exit(0 if leaks_ok else 1)

if __name__ == '__main__':
    main()
