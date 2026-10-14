#!/usr/bin/env python3
"""Python half of the requirements form-check PARITY test (2026-10-09). Driven by
scripts/test-requirements-form-check-parity.ts; not meant to be run by hand.

  harvest            print, as JSON, every input the Python test suites feed their checker (coverage, citations,
                     clauses in copov15; the --lint suite in ~/paichart) — captured by wrapping the checker, so the
                     fixtures are the suites' OWN, never a re-typed copy that could drift from them
  run MANIFEST       run the Python CLIs over every case in MANIFEST and print their stdout + exit codes as JSON
  registry           print the Python `load_registry` result (the TS generated constant is compared to it)

Read-only apart from the program-view file each case's manifest names (a temp dir the TS side owns).
"""
import contextlib
import importlib.util
import io
import json
import os
import runpy
import subprocess
import sys

HERE = os.path.dirname(os.path.realpath(__file__))
PUBLIC = os.environ.get('PAICHART_PUBLIC_REPO', os.path.expanduser('~/paichart'))
COVERAGE = os.path.join(HERE, 'check-requirements-coverage.py')
CITATIONS = os.path.join(HERE, 'check-requirements-citations.py')
CLAUSES = os.path.join(HERE, 'check-requirements-clauses.py')
RULES = os.path.join(PUBLIC, 'scripts', 'requirements-rules.py')
SUITES = [os.path.join(HERE, 'test-requirements-coverage.py'), os.path.join(HERE, 'test-requirements-citations.py'),
          os.path.join(HERE, 'test-requirements-clauses.py'), os.path.join(PUBLIC, 'scripts', 'test-requirements-rules-lint.py')]


def run_cli(script, argv):
    """Run a script as __main__ in-process; return (stdout, exit code). This IS the CLI path (argparse, main())."""
    buf = io.StringIO()
    old = sys.argv
    sys.argv = [script] + argv
    code = 0
    try:
        with contextlib.redirect_stdout(buf):
            try:
                runpy.run_path(script, run_name='__main__')
            except SystemExit as e:
                code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
    finally:
        sys.argv = old
    return buf.getvalue(), code


def harvest():
    cases = []
    seen = set()

    def add(kind, **kw):
        key = json.dumps([kind, kw], sort_keys=True)
        if key not in seen:
            seen.add(key)
            cases.append({'kind': kind, **kw})

    real_spec = importlib.util.spec_from_file_location
    real_run = subprocess.run

    def spec_wrapper(name, path, *a, **k):
        spec = real_spec(name, path, *a, **k)
        loader = spec.loader
        real_exec = loader.exec_module
        base = os.path.basename(str(path))

        def exec_module(module):
            real_exec(module)
            if base == 'check-requirements-coverage.py':
                orig = module.check
                module.check = lambda text, reg, _o=orig: (add('coverage', draft=text), _o(text, reg))[1]
            elif base == 'check-requirements-clauses.py':
                orig = module.check
                module.check = lambda o, a, d, _o=orig: (add('clauses', objective=o, answers=a, draft=d), _o(o, a, d))[1]
            elif base == 'requirements-rules.py':
                orig = module.lint
                module.lint = lambda lines, allowed, _o=orig: (add('lint', draft='\n'.join(lines), declared=allowed), _o(lines, allowed))[1]
        loader.exec_module = exec_module
        return spec

    def run_wrapper(args, *a, **k):
        if isinstance(args, (list, tuple)) and len(args) > 1 and os.path.basename(str(args[1])) == 'check-requirements-citations.py':
            o = open(args[args.index('--objective') + 1], encoding='utf-8').read()
            d = open(args[args.index('--draft') + 1], encoding='utf-8').read()
            add('citations', objective=o, draft=d)
        return real_run(args, *a, **k)

    importlib.util.spec_from_file_location = spec_wrapper
    subprocess.run = run_wrapper
    counts = {}
    try:
        for suite in SUITES:
            if not os.path.exists(suite):
                counts[suite] = 'SKIPPED (not present)'
                continue
            before = len(cases)
            out, code = run_cli(suite, [])
            counts[suite] = {'exit': code, 'cases': len(cases) - before}
    finally:
        importlib.util.spec_from_file_location = real_spec
        subprocess.run = real_run
    print(json.dumps({'suites': counts, 'cases': cases}))


def run(manifest_path):
    manifest = json.load(open(manifest_path, encoding='utf-8'))
    out = []
    for c in manifest:
        r = {'id': c['id']}
        f = c['files']
        if 'coverage' in c['checks']:
            r['coverage'] = run_cli(COVERAGE, ['--draft', f['draft'], '--json'])
        if 'citations' in c['checks']:
            r['citations'] = run_cli(CITATIONS, ['--objective', f['objective'], '--draft', f['draft']])
        if 'clauses' in c['checks']:
            r['clauses'] = run_cli(CLAUSES, ['--objective', f['objective'], '--answers', f['answers'], '--draft', f['draft'], '--json'])
        if 'lint' in c['checks']:
            argv = ['--lint', f['draft']] + (['--declared', f['declared']] if f.get('declared') else [])
            r['lint'] = run_cli(RULES, argv)
        if 'size' in c['checks']:
            r['programView'] = run_cli(RULES, ['--program-view', f['draft'], f['view']])
            r['view'] = open(f['view'], encoding='utf-8').read() if r['programView'][1] == 0 else None
            r['sizeView'] = run_cli(RULES, ['--size-check', f['view']]) if r['view'] is not None else None
            r['sizeRaw'] = run_cli(RULES, ['--size-check', f['draft']])
        out.append(r)
    print(json.dumps(out))


def probes(path):
    """Python's answer for each semantics probe: regex matches, split/strip, json.dumps length, repr, len, f'{n:,}'."""
    import re
    out = []
    for p in json.load(open(path, encoding='utf-8')):
        op = p['op']
        if op == 'finditer':
            fl = (re.I if 'i' in p['flags'] else 0) | (re.M if 'm' in p['flags'] else 0) | (re.S if 's' in p['flags'] else 0)
            out.append([[m.group(0), list(m.groups())] for m in re.finditer(p['pattern'], p['text'], fl)])
        elif op == 'split':
            out.append(p['text'].split())
        elif op == 'strip':
            out.append(p['text'].strip() if p.get('chars') is None else p['text'].strip(p['chars']))
        elif op == 'dumps':
            out.append(len(json.dumps(json.dumps(p['text']))))
        elif op == 'len':
            out.append(len(p['text']))
        elif op == 'repr':
            out.append(repr(p['text']))
        elif op == 'commas':
            out.append(f"{p['n']:,}")
    print(json.dumps(out))


def registry():
    spec = importlib.util.spec_from_file_location('cov', COVERAGE)
    cov = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cov)
    print(json.dumps(cov.load_registry(cov.DEFAULT_REGISTRY)))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'harvest':
        harvest()
    elif cmd == 'run' and len(sys.argv) == 3:
        run(sys.argv[2])
    elif cmd == 'probes' and len(sys.argv) == 3:
        probes(sys.argv[2])
    elif cmd == 'registry':
        registry()
    else:
        print(__doc__)
        sys.exit(2)
