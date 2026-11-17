"""L-CS-K (2026-11-16, owner stop item 3) — a RECORDED CLUSTER STATE for the k8s Harvester cells. $0, offline, no service.

    python3 -I scripts/leg-replay-lab/k8s-cluster-fixture.py <author execution id whose frozen Harvester is the subject> --out <file>

Why: on the first L-CS-K runs 7-13 of each Harvester's k8s-rig-readonly calls got the lab's "tool calls are not executed" notice (the
recorded tier serves only the exact stored calls). A Harvester that asks another narrow read then measures nothing on a live read, and
the notice leaks lab vocabulary (register LAB-UNSERVED-NOTICE-LEAK).

What it writes (consumed by k8s-fixtures.ts, the cluster tier):
  - `objects`: every full object the SAME cluster state recorded — the subject harvest's own reads plus the reads of other stored
    Harvesters linked to it by a shared object UID (k8s-drift-from-recorded.same_reset_witnesses: a rig reset re-creates the namespace,
    so a shared UID proves no reset in between); per object, the copy closest in time to the subject harvest.
  - `membership`: for each (resourceType, namespace) the COMPLETE name set where some harvest of the group listed it WITHOUT a label
    selector (`list_resources` or `list_resource_names`), with each name's labels. Only then can a list, or a not-found, be answered.
  - `secretNames`: `list_secret_names` results (names, types, key names; never values).
  - `envelope`: one recorded success envelope of the service (its hub metadata), so served results look exactly as the hub returns.
Nothing is invented: an object, a list or a secret listing the recorded state cannot establish is answered by the TIER with the service's
own error text (k8s-fixtures.ts), never with a made-up object.
"""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('kdr', os.path.join(HERE, 'k8s-drift-from-recorded.py'))
kdr = importlib.util.module_from_spec(spec); spec.loader.exec_module(kdr)

SERVICE = 'k8s-rig-readonly'


def harvest_results(hid):
    """Every cached copy of a Harvester execution's result.json (first found)."""
    import glob
    for f in sorted(glob.glob(os.path.join(HERE, 'cache', 'snapshots', '*.json'))):
        try:
            snap = json.load(open(f))
        except Exception:  # noqa: BLE001
            continue
        for a in snap.get('childArtifacts') or []:
            if a.get('executionId') == hid and a.get('name') == 'result.json':
                return json.loads(a['content'])
        if (snap.get('author') or {}).get('exec', {}).get('id') == hid and snap['author'].get('resultJson'):
            return json.loads(snap['author']['resultJson'])
    return None


def listings(result):
    """(resourceType, namespace) -> {name: labels} from UNFILTERED list reads; secret listings; one success envelope."""
    members, secrets, envelope = {}, {}, None
    for tc in result.get('toolCalls') or []:
        a, inner = kdr._args(tc)
        if a.get('targetService') != SERVICE:
            continue
        d = kdr._data(tc)
        if not isinstance(d, dict):
            continue
        if envelope is None:
            envelope = json.loads(json.dumps(tc['result']))
        tool, rt, ns = a.get('tool'), inner.get('resourceType'), inner.get('namespace')
        if tool in ('list_resources', 'list_resource_names') and not inner.get('labelSelector') and rt and ns:
            m = {}
            for it in d.get('items') or []:
                if tool == 'list_resources':
                    md = it.get('metadata') or {}; m[md.get('name')] = md.get('labels') or {}
                else:
                    m[it.get('name')] = it.get('labels') or {}
            members[f'{rt}/{ns}'] = (str(tc.get('timestamp') or ''), m)
        if tool == 'list_secret_names' and inner.get('namespace'):
            secrets[inner['namespace']] = (str(tc.get('timestamp') or ''), d.get('secrets') or [])
    return members, secrets, envelope


def build(author_id):
    hid, result = kdr.load(author_id)
    own = kdr.recorded_objects(result, SERVICE)
    witnesses, links = kdr.same_reset_witnesses(hid, own, SERVICE)
    subject_ts = max((v[2] for v in own.values()), default='')
    group = {hid: result}
    for eid in witnesses:
        r = harvest_results(eid)
        if r is not None:
            group[eid] = r
    objects, members, secrets, envelope = {}, {}, {}, None
    for eid, r in group.items():
        for (rt, ns, name), (i, obj, ts) in kdr.recorded_objects(r, SERVICE).items():
            k = f'{rt}/{ns or "-"}/{name}'
            cur = objects.get(k)
            if cur is None or abs(kdr._t(ts) - kdr._t(subject_ts)) < abs(kdr._t(cur['readAt']) - kdr._t(subject_ts)):
                objects[k] = {'object': obj, 'fromHarvesterExecutionId': eid, 'toolCallIndex': i, 'readAt': ts}
        m, sec, env = listings(r)
        if envelope is None and eid == hid:
            envelope = env
        for k, (ts, names) in m.items():
            if k not in members or abs(kdr._t(ts) - kdr._t(subject_ts)) < abs(kdr._t(members[k]['readAt']) - kdr._t(subject_ts)):
                members[k] = {'names': names, 'fromHarvesterExecutionId': eid, 'readAt': ts}
        for ns, (ts, lst) in sec.items():
            if ns not in secrets or abs(kdr._t(ts) - kdr._t(subject_ts)) < abs(kdr._t(secrets[ns]['readAt']) - kdr._t(subject_ts)):
                secrets[ns] = {'secrets': lst, 'fromHarvesterExecutionId': eid, 'readAt': ts}
    # A full object read of a kind whose membership is known must be IN that membership (else the two reads disagree: not one state).
    for k, o in objects.items():
        rt, ns, name = k.split('/')
        mk = f'{rt}/{ns}'
        if mk in members and name not in members[mk]['names']:
            raise SystemExit(f'{k} was read as an object but is absent from the {mk} listing — the group is not one cluster state')
    return {'service': SERVICE, 'subject': {'authorExecutionId': author_id, 'harvesterExecutionId': hid, 'readAt': subject_ts},
            'sameResetLinks': links, 'harvesters': sorted(group), 'objects': objects, 'membership': members, 'secretNames': secrets,
            'envelope': envelope}


if __name__ == '__main__':
    argv = sys.argv[1:]
    if not argv or '--out' not in argv:
        raise SystemExit(__doc__)
    out = build(argv[0])
    p = argv[argv.index('--out') + 1]
    os.makedirs(os.path.dirname(os.path.abspath(p)), exist_ok=True)
    open(p, 'w').write(json.dumps(out, indent=2, sort_keys=True) + '\n')
    print(f"cluster state: {len(out['objects'])} object(s), {len(out['membership'])} complete listing(s), {len(out['secretNames'])} secret listing(s) from {len(out['harvesters'])} harvest(s) -> {p}")
