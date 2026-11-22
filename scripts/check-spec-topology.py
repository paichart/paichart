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

# Every source-line KIND the platform's two source grammars know (the Device and the Config one) — pinned EQUAL to the shipping kind
# tables by scripts/test-spec-topology-parity.ts (STEP 3 P5: this list had no `service-held` and nothing compared it with the tables).
# A `supplied` line names no service, so the line pattern below never matches it; it is listed because it is a kind.
SOURCE_KINDS = ('git-file', 'device-read', 'live-read', 'command-package', 'service-held', 'supplied')
SOURCE_LINE = re.compile(r'^\s*([A-Za-z0-9_.-]+):\s*(' + '|'.join(k for k in SOURCE_KINDS if k != 'supplied') + r')\s+—\s+service\s+(\S+)(?:\s*;\s*(\S+))?')
CIDR = re.compile(r'\b\d{1,3}(?:\.\d{1,3}){3}/\d{1,2}\b')
HOST = re.compile(r'(?<![\w./-])\d{1,3}(?:\.\d{1,3}){3}(?![\w/-]|\.\d)')  # not a version (4.32.2.1F), not a CIDR
EMAIL = re.compile(r'[^\s|@]+@[^\s|@]+\.[^\s|@]+')
URL = re.compile(r'https?://[^\s"\'`)>\]]+')
DECISION_KEY = re.compile(r'assum|polic|rule|decision|must|should|prefer|exclude|allow|deny', re.I)
EXPLAINER_KEY = re.compile(r'^(description|name|_.*)$')
LEG_HEADING = re.compile(r'^(#{2,4})\s.*\(([a-z0-9-]+),\s*(change|value)\)', re.I)
VALUE_MARK = re.compile(r'changes nothing', re.I)


PLAN_FILE_NAMES = ('tfplan', 'tfplan.out', 'plan.out', 'tfplan.json', 'tfplan.binary')
CLI_CREDENTIALS_FILE_NAMES = ('.terraformrc', 'terraform.rc', 'credentials.tfrc.json')
NORNIR_INVENTORY_FILE_NAMES = ('hosts.yaml', 'hosts.yml', 'groups.yaml', 'groups.yml', 'defaults.yaml', 'defaults.yml')
NORNIR_INVENTORY_DIRS = ('nornir', 'inventory')
# Password and key files — never read or kept since Config sources STEP 3 P1 (2026-11-21).
KEY_MATERIAL_FILE_SUFFIXES = ('.key', '.pem', '.p12', '.pfx', '.jks', '.keystore')
SSH_IDENTITY_FILE_NAMES = ('id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519')


def never_held(path):
    """The platform's never-held path rule, restated (lib/mcp/server/config/git-file-source-pin.js `heldPathRefusal`). A Terraform
    state, plan, variables or CLI-credentials path, a device inventory, and a password or key file are never read or held: a
    `git-file` line naming one is refused when the leg resolves its sources, and the leg stops. Returns the reason or None.
    PINNED EQUAL to the shipping function, path by path, by scripts/test-spec-topology-parity.ts — every list above included
    (STEP 3 P5: this restatement lacked the inventory rule of 2026-10-23 and the key-file names of 2026-11-21, and nothing noticed)."""
    segs = [x for x in path.lower().split('/') if x]
    if not segs:
        return None
    name = segs[-1]
    if any(x in ('.terraform', 'terraform.tfstate.d') for x in segs) or '.tfstate' in name or '.tfplan' in name or name in PLAN_FILE_NAMES:
        return 'a Terraform state or plan path'
    if '.tfvars' in name:
        return 'a Terraform variables file'
    if '.terraform.d' in segs or name in CLI_CREDENTIALS_FILE_NAMES:
        return 'a Terraform CLI credentials path'
    if name in NORNIR_INVENTORY_FILE_NAMES and any(x in NORNIR_INVENTORY_DIRS for x in segs[:-1]):
        return 'a device inventory file'
    if 'htpasswd' in name:
        return 'a password file'
    if name.endswith(KEY_MATERIAL_FILE_SUFFIXES) or name in SSH_IDENTITY_FILE_NAMES:
        return 'a key file'
    return None


def leg_type_marks(text):
    """Warnings where a leg section's stated type and the value-leg phrase disagree (2026-11-12). The planner reads "Changes
    nothing." as the mark of a value leg, so the phrase inside a change leg's section can turn it into a value leg, and a value leg
    without it may be planned as a change leg. Only the leg's own section is read (to the next heading of the same or a higher level):
    a success criterion elsewhere that says "Pipeline 2 changes nothing beyond …" is not a leg section."""
    warnings, lines = [], text.splitlines()
    for i, line in enumerate(lines):
        m = LEG_HEADING.match(line)
        if not m:
            continue
        level, kind = len(m.group(1)), m.group(3).lower()
        body = []
        for nxt in lines[i + 1:]:
            h = re.match(r'^(#{1,6})\s', nxt)
            if h and len(h.group(1)) <= level:
                break
            body.append(nxt)
        has = bool(VALUE_MARK.search('\n'.join(body)))
        title = line.strip()[:90]
        if kind == 'change' and has:
            warnings.append(f'leg section "{title}" is a change leg but says "changes nothing": the planner reads that phrase as a value leg. Reword it')
        if kind == 'value' and not has:
            warnings.append(f'leg section "{title}" is a value leg but never says "Changes nothing.": the planner may plan it as a change leg')
    return warnings


def approver_marks(text):
    """Warnings for a gate-table row whose approver cell has no email (2026-11-13). The program matches approvers by email:
    a name alone gives an unassigned gate."""
    warnings, col = [], None
    for line in text.splitlines():
        if not line.strip().startswith('|'):
            col = None
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if col is None:
            idx = [i for i, c in enumerate(cells) if c.lower().startswith('approver')]
            col = idx[0] if idx else -1
            continue
        if col < 0 or col >= len(cells) or set(cells[col]) <= set('-: '):
            continue
        if not EMAIL.search(cells[col]):
            warnings.append(f'gate "{cells[0]}": the approver "{cells[col]}" has no email. The program matches approvers by email; a name alone gives an unassigned gate')
    return warnings


def spec_facts(text):
    """Devices, Git files, service addresses and CIDRs the spec states. Sources lines are read inside fenced blocks."""
    # A fenced block is a Device sources block (network: each label is a DEVICE) or a Config sources block (Kubernetes: each
    # label names a FILE or the cluster, never a device). Both declare Git files and service addresses, which are checked alike.
    devices, git_files, services, config_git_files = set(), set(), set(), set()
    in_fence, block, source_lines = False, None, 0
    for line in text.splitlines():
        if line.strip().startswith('```'):
            in_fence, block = not in_fence, None
            continue
        if not in_fence:
            continue
        if re.match(r'^\s*##\s+Config sources\s*$', line):
            block = 'config'
            continue
        if re.match(r'^\s*##\s+Device sources\s*$', line):
            block = 'device'
            continue
        m = SOURCE_LINE.match(line)
        if not m:
            continue
        source_lines += 1
        device, kind, service, locator = m.groups()
        if block != 'config':
            devices.add(device)
        if service.startswith('http'):
            services.add(service)
        if kind == 'git-file' and locator:
            git_files.add(locator.split('@')[0].strip())
            if block == 'config':
                config_git_files.add(locator.split('@')[0].strip())
    return {'devices': devices, 'git_files': git_files, 'services': services, 'source_lines': source_lines,
            'config_git_files': config_git_files,
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

    if not spec['source_lines']:
        notes.append('the spec has no sources line inside a fenced block: device, file and service checks were not run')

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
            warnings.append(f'Git file "{f}" is listed in the topology but no sources line in the spec declares it')
    elif spec['git_files']:
        notes.append('the topology has no configRepo object: Git file paths were not compared')

    # 3. service addresses
    topo_urls = set(URL.findall(all_text))
    for u in sorted(spec['services'] - topo_urls):
        warnings.append(f'service address {u} is in a sources block but nowhere in the topology')
    for u in sorted(topo_urls - spec['urls']):
        warnings.append(f'address {u} is in the topology but nowhere in the spec')

    # 4. values
    for c in sorted(set(CIDR.findall(all_text)) - spec['cidrs']):
        warnings.append(f'address range {c} is in the topology but the spec never states it')

    for h in sorted(set(HOST.findall(URL.sub(' ', all_text)))):
        if not re.search(r'(?<![\d.])' + re.escape(h) + r'(?![\d]|\.\d)', spec_text):
            warnings.append(f'address {h} is in the topology but the spec never states it')

    # 5. decisions stated only here
    for p, k, v in strings:
        if EXPLAINER_KEY.match(k):
            continue
        if DECISION_KEY.search(k):
            warnings.append(f'topology key "{p}" reads like a decision. State it in the spec, where the gate reviewers see it; the topology holds facts')
        elif len(v) > 120 and not v.startswith('http'):
            warnings.append(f'topology key "{p}" holds {len(v)} characters of prose. A decision or rule belongs in the spec')
    # 6. leg type vs the value-leg phrase (spec only)
    warnings.extend(leg_type_marks(spec_text))
    # 7. a gate approver with no email (spec only)
    warnings.extend(approver_marks(spec_text))
    # 8. a declared Git file the platform never reads or holds (spec only; Terraform state, plan, variables, CLI credentials)
    for f in sorted(spec['git_files']):
        why = never_held(f)
        if why:
            warnings.append(f'the spec declares "{f}" as a git-file: it is {why}, which the platform never reads or holds. '
                            'The leg stops when it resolves its sources. Declare the configuration files; Terraform state is a live-read or supplied line, and a secret is referenced, never kept in a file the leg reads')
    # 9. a Terraform leg with no declared .tf file (spec only). From terraform-iac 1.17.0 a Terraform leg reads only what a
    #    `## Config sources` block declares, and stops before it reads anything when its task carries no block.
    if re.search(r'\bterraform-iac\b', spec_text) and not any(f.lower().endswith(('.tf', '.tf.json')) for f in spec['config_git_files']):
        warnings.append('the spec names a terraform-iac leg, but no "## Config sources" block inside a fenced block declares a .tf file as a '
                        'git-file line. That leg stops before it reads anything. Add the block (docs/WRITING-A-SPEC.md)')
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
    legs = SELF_SPEC + '## Pipeline 1 objective — pick (network-derivation, value)\nWorks out one address. Changes nothing.\n' \
        '## Pipeline 2 objective — add (network-provisioning, change)\nAdds a loopback.\n## Success criteria\nPipeline 2 changes nothing beyond it.\n'
    cases.append(('correctly marked legs (and the phrase in another section) give no finding', run(SELF_TOPO, legs) == ([], [], [])))
    cases.append(('the phrase inside a change leg warns', len(run(SELF_TOPO, legs.replace('Adds a loopback.', 'Adds a loopback; changes nothing else.'))[1]) == 1))
    cases.append(('a value leg without the phrase warns', len(run(SELF_TOPO, legs.replace(' Changes nothing.', ''))[1]) == 1))
    t = json.loads(json.dumps(SELF_TOPO)); t['fabric']['server'] = '10.50.0.20'
    cases.append(('a bare host address the spec never states warns', len(run(t)[1]) == 1))
    cases.append(('a bare host address the spec states (also as a /32) gives no finding', run(t, SELF_SPEC + 'Server 10.50.0.20/32.\n')[1] == []))
    t = json.loads(json.dumps(SELF_TOPO)); t['readOnlyServices']['other'] = 'http://192.0.2.7:3000/x'
    cases.append(('an address inside a URL is not a bare host address', len(run(t)[1]) == 1))
    gates = SELF_SPEC + '| gate | approves | approver |\n|---|---|---|\n| plan | the plan | Dana W, dana@example.com |\n| change | the change | Sam Ortega |\n'
    cases.append(('an approver with no email warns, one with an email does not', len(run(SELF_TOPO, gates)[1]) == 1))
    # Config sources (Kubernetes): labels are files and the cluster, never devices; their Git files and services are still checked.
    k8s = SELF_SPEC + '```\n## Config sources\nworkloads: git-file \u2014 service github-service ; org/repo/k8s/w.yaml\n' \
        'cluster: live-read \u2014 service https://example.test/k.json\n```\n'
    tk = json.loads(json.dumps(SELF_TOPO)); tk['configRepo']['paths'] = ['base/sw1.cfg', 'k8s/w.yaml']
    tk['readOnlyServices']['clusterDescriptorUrl'] = 'https://example.test/k.json'
    cases.append(('Config sources labels are not read as devices', run(tk, k8s) == ([], [], [])))
    tk2 = json.loads(json.dumps(tk)); tk2['configRepo']['paths'] = ['base/sw1.cfg']
    cases.append(('a Config sources Git file missing from the topology still warns', len(run(tk2, k8s)[1]) == 1))
    k8s_only = '# t\n```\n## Config sources\nworkloads: git-file \u2014 service github-service ; org/repo/k8s/w.yaml\n```\n'
    tk3 = {'configRepo': {'owner': 'org', 'repo': 'repo', 'paths': ['k8s/w.yaml']}}
    cases.append(('a Kubernetes-only spec is checked (no "no sources line" note)', run(tk3, k8s_only) == ([], [], [])))
    # Terraform (terraform-iac 1.17.0): a Terraform leg needs a declared .tf file; a state, plan or variables path is never held.
    tf_block = '```\n## Config sources\nmain-tf: git-file \u2014 service github-service ; org/repo/terraform/main.tf\n' \
        'prod-state: live-read \u2014 service https://example.test/tf.json\n```\n'
    ttf = {'configRepo': {'owner': 'org', 'repo': 'repo', 'paths': ['terraform/main.tf']}, 'readOnlyServices': {'tf': 'https://example.test/tf.json'}}
    cases.append(('a Terraform leg with a declared .tf file gives no finding', run(ttf, '# t\nLeg token terraform-iac.\n' + tf_block) == ([], [], [])))
    cases.append(('a Terraform leg with no Config sources block warns', sum('terraform-iac leg' in w for w in run(ttf, '# t\nLeg token terraform-iac.\n')[1]) == 1))
    k8s_for_tf = '# t\nLeg token terraform-iac.\n```\n## Config sources\nworkloads: git-file \u2014 service github-service ; org/repo/k8s/w.yaml\n```\n'
    cases.append(('a Kubernetes block does not satisfy a Terraform leg', len(run({'configRepo': {'owner': 'org', 'repo': 'repo', 'paths': ['k8s/w.yaml']}}, k8s_for_tf)[1]) == 1))
    cases.append(('a spec that never names terraform-iac is not asked for a .tf file', run(tk3, k8s_only) == ([], [], [])))
    state_line = tf_block.replace('prod-state: live-read \u2014 service https://example.test/tf.json', 'state: git-file \u2014 service github-service ; org/repo/terraform/terraform.tfstate')
    tst = json.loads(json.dumps(ttf)); tst['configRepo']['paths'].append('terraform/terraform.tfstate'); del tst['readOnlyServices']
    cases.append(('a state file declared as a git-file warns', len(run(tst, '# t\nLeg token terraform-iac.\n' + state_line)[1]) == 1))
    held = [never_held(x) is None for x in ('terraform/main.tf', 'docs/tfstate-notes.md', 'modules/vpc/variables.tf')]
    refused = [never_held(x) is not None for x in ('a/terraform.tfstate', 'a/terraform.tfstate-old', 'a/prod.tfvars.example', 'a/tfplan', 'a/plan.out',
                                                    'a/.terraform/modules/x.tf', 'a/terraform.tfstate.d/prod/x', 'home/.terraformrc', 'a/.terraform.d/credentials.tfrc.json')]
    cases.append(('the never-held rule: plain .tf paths are holdable; state, plan, variables and credentials paths are not', all(held) and all(refused)))
    keys = [never_held(x) for x in ('nginx/.htpasswd', 'tls/server.key', 'a/cert.PEM', '.ssh/id_ed25519', 'nornir/hosts.yaml', 'inventory/x/defaults.yml')]
    plain = [never_held(x) for x in ('nginx/otlp-ingress.conf', 'helm/defaults.yaml', 'docs/keys.md', 'k8s/hosts.yaml')]
    cases.append(('the never-held rule: password, key and device-inventory files are not holdable; a look-alike name outside those rules is', all(keys) and not any(plain)))
    held_line = '# t\n```\n## Config sources\nobs-ingress.otlp-ingress.conf: service-held \u2014 service https://example.test/obs.json\n```\n'
    cases.append(('a service-held line is read as a source line (its service is compared with the topology)', 'https://example.test/obs.json' in spec_facts(held_line)['services']))
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
    ap.add_argument('--rules-json', action='store_true', help='print this check\'s own source kinds and its never-held verdict for each path given as a JSON list on stdin (the parity test reads it)')
    a = ap.parse_args()
    if a.self_test:
        sys.exit(self_test())
    if a.rules_json:
        paths = json.load(sys.stdin)
        print(json.dumps({'kinds': sorted(SOURCE_KINDS), 'neverHeld': {x: never_held(x) is not None for x in paths}}))
        sys.exit(0)
    if not a.spec or not a.topology:
        ap.error('--spec and --topology are required')
    with open(a.spec, encoding='utf-8') as f:
        spec_text = f.read()
    with open(a.topology, encoding='utf-8') as f:
        topo_text = f.read()
    sys.exit(report(*compare(spec_text, topo_text), a.strict))


if __name__ == '__main__':
    main()
