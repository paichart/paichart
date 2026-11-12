#!/usr/bin/env python3
"""Check that a hand-written program spec and its topology.json agree.

WHY (2026-11-11): every program reads TWO inputs, requirements.md and topology.json. The topology file is always written
or copied by hand, no check reads it, and it repeats facts the spec states (devices, file paths, service addresses, address
pools). A decision once entered a program through a topology line that nothing else saw. This check compares the two.

WARN, NOT BLOCK, by default (owner rule): the only error is a topology file that does not parse as JSON, because the
Program Architect cannot plan from one. Every disagreement is a warning. `--strict` turns warnings into a failing exit.

Usage:
  python3 scripts/check-spec-topology.py --spec <requirements.md> --topology <topology.json> [--strict]
  python3 scripts/check-spec-topology.py --self-test
"""
import argparse
import json
import re
import sys

SOURCE_LINE = re.compile(r'^\s*([A-Za-z0-9_.-]+):\s*(git-file|device-read|live-read|command-package)\s+—\s+service\s+(\S+)(?:\s*;\s*(\S+))?')
CIDR = re.compile(r'\b\d{1,3}(?:\.\d{1,3}){3}/\d{1,2}\b')
URL = re.compile(r'https?://[^\s"\'`)>\]]+')
DECISION_KEY = re.compile(r'assum|polic|rule|decision|must|should|prefer|exclude|allow|deny', re.I)
EXPLAINER_KEY = re.compile(r'^(description|name|_.*)$')


def spec_facts(text):
    """Devices, Git files, service addresses and CIDRs the spec states. Sources lines are read inside fenced blocks."""
    devices, git_files, services = set(), set(), set()
    in_fence = False
    for line in text.splitlines():
        if line.strip().startswith('```'):
            in_fence = not in_fence
            continue
        if not in_fence:
            continue
        m = SOURCE_LINE.match(line)
        if not m:
            continue
        device, kind, service, locator = m.groups()
        devices.add(device)
        if service.startswith('http'):
            services.add(service)
        if kind == 'git-file' and locator:
            git_files.add(locator.split('@')[0].strip())
    return {'devices': devices, 'git_files': git_files, 'services': services,
            'cidrs': set(CIDR.findall(text)), 'urls': set(URL.findall(text))}


def walk(node, path=''):
    """Yield (path, key, value) for every scalar in the topology."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f'{path}.{k}' if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f'{path}[{i}]')
    else:
        yield path, path.split('.')[-1].split('[')[0], node


def compare(spec_text, topo_text):
    """Return (errors, warnings, notes)."""
    errors, warnings, notes = [], [], []
    try:
        topo = json.loads(topo_text)
    except json.JSONDecodeError as e:
        return [f'topology does not parse as JSON ({e.msg}, line {e.lineno}): the Program Architect cannot plan from it'], [], []
    spec = spec_facts(spec_text)
    scalars = list(walk(topo))
    strings = [(p, k, v) for p, k, v in scalars if isinstance(v, str)]
    all_text = '\n'.join(v for _, _, v in strings)

    if not spec['devices']:
        notes.append('the spec has no Device sources line inside a fenced block: device, file and service checks were not run')

    # 1. devices
    topo_devices = set()
    for p, k, v in strings:
        if re.search(r'(^|\.)devices\[\d+\]$', p):
            topo_devices.add(v)
    for d in sorted(spec['devices'] - topo_devices):
        if topo_devices:
            warnings.append(f'device "{d}" is in a Device sources block of the spec but not in the topology device list {sorted(topo_devices)}')
    for d in sorted(topo_devices - spec['devices']):
        if spec['devices'] and d not in spec_text:
            warnings.append(f'device "{d}" is in the topology but the spec never names it')
        elif spec['devices']:
            notes.append(f'device "{d}" is in the topology and named in the spec, but no Device sources line declares it')

    # 2. Git files
    repo = topo.get('configRepo') if isinstance(topo, dict) else None
    if isinstance(repo, dict) and spec['git_files']:
        prefix = f"{repo.get('owner', '')}/{repo.get('repo', '')}/"
        topo_files = {prefix + p for p in repo.get('paths', []) if isinstance(p, str)}
        for f in sorted(spec['git_files'] - topo_files):
            warnings.append(f'Git file "{f}" is declared in the spec but not listed under configRepo in the topology')
        for f in sorted(topo_files - spec['git_files']):
            warnings.append(f'Git file "{f}" is listed in the topology but no Device sources line in the spec declares it')
    elif spec['git_files']:
        notes.append('the topology has no configRepo object: Git file paths were not compared')

    # 3. service addresses
    topo_urls = set(URL.findall(all_text))
    for u in sorted(spec['services'] - topo_urls):
        warnings.append(f'service address {u} is in a Device sources block but nowhere in the topology')
    for u in sorted(topo_urls - spec['urls']):
        warnings.append(f'address {u} is in the topology but nowhere in the spec')

    # 4. values
    for c in sorted(set(CIDR.findall(all_text)) - spec['cidrs']):
        warnings.append(f'address range {c} is in the topology but the spec never states it')

    # 5. decisions stated only here
    for p, k, v in strings:
        if EXPLAINER_KEY.match(k):
            continue
        if DECISION_KEY.search(k):
            warnings.append(f'topology key "{p}" reads like a decision. State it in the spec, where the gate reviewers see it; the topology holds facts')
        elif len(v) > 120 and not v.startswith('http'):
            warnings.append(f'topology key "{p}" holds {len(v)} characters of prose. A decision or rule belongs in the spec')
    return errors, warnings, notes


def report(errors, warnings, notes, strict):
    for e in errors:
        print(f'ERROR: {e}')
    for w in warnings:
        print(f'WARNING: {w}')
    for n in notes:
        print(f'NOT CHECKED: {n}')
    if not errors and not warnings:
        print('OK: the spec and the topology agree on devices, Git files, service addresses and address ranges')
    return 1 if errors or (strict and warnings) else 0


SELF_SPEC = '''# t
Pool `10.99.0.0/24`.
```
## Device sources
sw1: git-file — service github-service ; org/repo/base/sw1.cfg
sw1: device-read — service https://example.test/d.json
```
'''
SELF_TOPO = {'fabric': {'devices': ['sw1'], 'pool': '10.99.0.0/24'},
             'configRepo': {'owner': 'org', 'repo': 'repo', 'paths': ['base/sw1.cfg']},
             'readOnlyServices': {'deviceDescriptorUrl': 'https://example.test/d.json'}}


def self_test():
    def run(topo, spec=SELF_SPEC):
        return compare(spec, topo if isinstance(topo, str) else json.dumps(topo))
    cases = []
    cases.append(('clean pair has no finding', run(SELF_TOPO) == ([], [], [])))
    cases.append(('unparseable topology is the one error', len(run('{not json')[0]) == 1))
    t = json.loads(json.dumps(SELF_TOPO)); t['fabric']['devices'] = ['sw2']
    cases.append(('a renamed device warns both ways', len(run(t)[1]) == 2))
    t = json.loads(json.dumps(SELF_TOPO)); t['configRepo']['paths'] = ['base/other.cfg']
    cases.append(('a different Git path warns both ways', len(run(t)[1]) == 2))
    t = json.loads(json.dumps(SELF_TOPO)); t['readOnlyServices']['deviceDescriptorUrl'] = 'https://example.test/x.json'
    cases.append(('a different service address warns both ways', len(run(t)[1]) == 2))
    t = json.loads(json.dumps(SELF_TOPO)); t['fabric']['pool'] = '10.98.0.0/24'
    cases.append(('a range the spec never states warns', len(run(t)[1]) == 1))
    t = json.loads(json.dumps(SELF_TOPO)); t['existenceAssumption'] = 'routes stay'
    cases.append(('a decision-shaped key warns', len(run(t)[1]) == 1))
    t = json.loads(json.dumps(SELF_TOPO)); t['description'] = 'x' * 300
    cases.append(('a long description is not a decision', run(t)[1] == []))
    cases.append(('a spec with no sources block is reported as not checked', len(run(SELF_TOPO, '# t\n10.99.0.0/24 https://example.test/d.json\n')[2]) == 1))
    failed = [name for name, ok in cases if not ok]
    for name, ok in cases:
        print(('PASS ' if ok else 'FAIL ') + name)
    return 1 if failed else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec')
    ap.add_argument('--topology')
    ap.add_argument('--strict', action='store_true')
    ap.add_argument('--self-test', action='store_true')
    a = ap.parse_args()
    if a.self_test:
        sys.exit(self_test())
    if not a.spec or not a.topology:
        ap.error('--spec and --topology are required')
    with open(a.spec, encoding='utf-8') as f:
        spec_text = f.read()
    with open(a.topology, encoding='utf-8') as f:
        topo_text = f.read()
    sys.exit(report(*compare(spec_text, topo_text), a.strict))


if __name__ == '__main__':
    main()
