"""L-CS-K (Config sources STEP 2) — a compare-tool RESULT for a stored Kubernetes leg, made by the TOOL'S OWN CODE.

    python3 scripts/leg-replay-lab/k8s-drift-from-recorded.py <author execution id> [--label <git-file label>] [--out <file>]

What it does (offline, $0, no service, no cluster, no model):
  1. Reads the lab cache snapshot of the Author execution (`cache/snapshots/<id>.json`), finds its FROZEN Harvester entry
     (`chainedFrom`, agentRole infra_state_harvester — exactly one) and that Harvester's stored result.json.
  2. The MANIFEST is the text of the Harvester's ONE successful github-service `get_file_contents` read (the bytes the platform
     holds and would send — persisted, so R10 placeholders stand where R10 put them).
  3. The LIVE STATE is the Harvester's own RECORDED reads of the declared cluster's service (`get_resource` objects and
     `list_resources` items). An object the recorded harvest never read is answered ("error", None) — the tool's
     `not-compared: live-read-failed`. The lab cannot know its live state, so it is never stubbed as absent and never as equal.
  4. Calls `compare_manifest` from the rig's `declared_compare.py` (the code the live service runs, method `/2`) with the
     service's own kind table (`server.py` RESOURCE_MAP, cluster kind `Namespace`) and the R10 placeholder as `redactedMarker`.

The output is `{ "result": <compare_manifest's return>, "provenance": {...} }` — the shape config-sources-patch.ts `caller: 'result'`
accepts (it re-checks the shape against the contract fixture and runs the SHIPPING `validateCompareResult`). It is a RESULT in
the tool's shape, never a fact and never a call record: the call record and `gitLiveDrift` are still computed by the shipping
`runPlatformDriftCalls` / `computeGitLiveDrift` inside the lab.

Named limits: a recorded object is the agent-facing read (R10-processed at persist); the read time is the Harvester's, not the
platform's call time (the platform calls synchronously in the Harvester's persist, seconds later — the closest stored witness).
"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
TOOL_DIR = os.path.join(REPO, '.claude', 'knowledge', 'pipelines', 'kubernetes-gitops', 'phase4-kind-rig', 'k8s-mcp-readonly')
sys.path.insert(0, TOOL_DIR)
from declared_compare import compare_manifest, METHOD  # noqa: E402  (the rig's own module)

# server.py's closed allowlist, copied by VALUE and checked against the file below (server.py imports the kubernetes client,
# which this offline script must not need).
RESOURCE_MAP = {
    "pods": ("v1", "Pod"), "services": ("v1", "Service"), "configmaps": ("v1", "ConfigMap"), "endpoints": ("v1", "Endpoints"),
    "resourcequotas": ("v1", "ResourceQuota"), "limitranges": ("v1", "LimitRange"), "serviceaccounts": ("v1", "ServiceAccount"),
    "deployments": ("apps/v1", "Deployment"), "replicasets": ("apps/v1", "ReplicaSet"), "statefulsets": ("apps/v1", "StatefulSet"),
    "daemonsets": ("apps/v1", "DaemonSet"), "ingresses": ("networking.k8s.io/v1", "Ingress"),
    "networkpolicies": ("networking.k8s.io/v1", "NetworkPolicy"), "horizontalpodautoscalers": ("autoscaling/v2", "HorizontalPodAutoscaler"),
    "poddisruptionbudgets": ("policy/v1", "PodDisruptionBudget"),
}
CLUSTER_KINDS = {("v1", "Namespace"): "namespaces"}
PLACEHOLDER = "<<REDACTED-SECRET>>"


def _check_server_table():
    src = open(os.path.join(TOOL_DIR, 'server.py')).read()
    for rt, (av, k) in RESOURCE_MAP.items():
        if f'"{rt}": ("{av}", "{k}")' not in src:
            raise SystemExit(f"server.py RESOURCE_MAP no longer has {rt} -> ({av}, {k}); re-copy the table")
    if '_CLUSTER_COMPARE = {("v1", "Namespace"): "namespaces"}' not in src:
        raise SystemExit("server.py _CLUSTER_COMPARE changed; re-copy it")


def _data(tc):
    """The service's own result object inside the embedded hub's envelope (structuredContent first, else the text block)."""
    try:
        d = tc["result"]["content"][0]["data"]
    except (KeyError, IndexError, TypeError):
        return None
    if not isinstance(d, dict) or not d.get("success"):
        return None
    inner = d.get("result") or {}
    if inner.get("isError"):
        return None
    sc = inner.get("structuredContent")
    if isinstance(sc, dict):
        return sc
    for c in inner.get("content") or []:
        if c.get("type") == "text":
            try:
                return json.loads(c["text"])
            except Exception:  # noqa: BLE001
                return None
    return None


def _args(tc):
    a = tc.get("arguments") or {}
    inner = a.get("arguments")
    if isinstance(inner, str):
        try:
            inner = json.loads(inner)
        except Exception:  # noqa: BLE001
            inner = {}
    return a, inner or {}


def recorded_objects(result, live_service):
    """{(resourceType, namespace, name): (toolCallIndex, object, timestamp)} for every full object a stored Harvester read through the
    live service (get_resource objects, list_resources items). Names-only reads (list_resource_names) carry no fields and are not objects."""
    out = {}
    for i, tc in enumerate(result.get('toolCalls') or []):
        a, inner = _args(tc)
        if a.get('targetService') != live_service:
            continue
        d = _data(tc)
        if not isinstance(d, dict):
            continue
        tool, rt, ts = a.get('tool'), inner.get('resourceType'), str(tc.get('timestamp') or '')
        if tool == 'get_resource' and d.get('metadata'):
            md = d['metadata']; out[(rt, md.get('namespace'), md.get('name'))] = (i, d, ts)
        elif tool == 'list_resources':
            for it in d.get('items') or []:
                md = it.get('metadata') or {}
                out.setdefault((rt, md.get('namespace') or d.get('namespace'), md.get('name')), (i, it, ts))
    return out


def namespaces_read(result, live_service):
    """Namespaces the harvest read successfully IN (a successful namespaced read witnesses that the namespace exists)."""
    ns = set()
    for tc in result.get('toolCalls') or []:
        a, inner = _args(tc)
        if a.get('targetService') == live_service and isinstance(inner.get('namespace'), str) and _data(tc) is not None:
            ns.add(inner['namespace'])
    return ns


def same_reset_witnesses(subject_hid, subject_objs, live_service):
    """Other stored Harvester reads of the SAME cluster state, found in the lab cache: harvests linked to the subject by a shared object
    UID (transitively). A rig reset deletes and re-creates the namespace, so a shared UID proves no reset in between. Returns
    {key: (executionId, toolCallIndex, object, timestamp)} for every object the group recorded, and the chain of links."""
    import glob
    uid = lambda o: (o.get('metadata') or {}).get('uid')
    harvests = {}
    for f in sorted(glob.glob(os.path.join(HERE, 'cache', 'snapshots', '*.json'))):
        try:
            snap = json.load(open(f))
        except Exception:  # noqa: BLE001
            continue
        srcs = [(a.get('executionId'), a.get('content')) for a in snap.get('childArtifacts') or [] if a.get('name') == 'result.json']
        if (snap.get('author') or {}).get('resultJson'):
            srcs.append((snap['author']['exec']['id'], snap['author']['resultJson']))
        for eid, rj in srcs:
            if eid in harvests or not rj:
                continue
            try:
                objs = recorded_objects(json.loads(rj), live_service)
            except Exception:  # noqa: BLE001
                continue
            if objs:
                harvests[eid] = objs
    harvests[subject_hid] = subject_objs
    group, links, frontier = {subject_hid}, [], [subject_hid]
    while frontier:
        cur = frontier.pop()
        cu = {uid(o) for (_, o, _) in harvests[cur].values() if uid(o)}
        for eid in sorted(harvests):
            if eid in group:
                continue
            shared = sorted(cu & {uid(o) for (_, o, _) in harvests[eid].values() if uid(o)})
            if shared:
                group.add(eid); frontier.append(eid); links.append({"from": cur, "to": eid, "sharedUid": shared[0]})
    return {eid: harvests[eid] for eid in sorted(group) if eid != subject_hid}, links


def load(author_id):
    snap = json.load(open(os.path.join(HERE, 'cache', 'snapshots', f'{author_id}.json')))
    cf = snap['author']['exec']['config']['inputContext'].get('chainedFrom') or []
    hits = [e for e in cf if e.get('agentRole') == 'infra_state_harvester']
    if len(hits) != 1:
        raise SystemExit(f"{author_id}: {len(hits)} frozen Harvester entries (want exactly 1)")
    hid = hits[0]['executionId']
    arts = [a for a in snap['childArtifacts'] if a.get('executionId') == hid and a.get('name') == 'result.json']
    if not arts:
        raise SystemExit(f"{author_id}: no stored result.json for Harvester {hid}")
    return hid, json.loads(arts[0]['content'])


def _set_path(obj, dotted, value):
    """`spec.ingress[0].from[0].podSelector.matchLabels.tier` -> set on a COPY's nested dicts/lists (the path must exist up to
    its last key, so a plant can only change a value the recorded read returned, or add one key to an existing map)."""
    import re
    parts = [p for p in re.split(r'\.(?![^\[]*\])', dotted)]
    cur = obj
    for i, part in enumerate(parts):
        m = re.fullmatch(r'([^\[]+)((?:\[\d+\])*)', part)
        if not m:
            raise SystemExit(f"live plant path {dotted!r}: cannot parse {part!r}")
        key, idx = m.group(1), [int(x) for x in re.findall(r'\[(\d+)\]', m.group(2))]
        last = i == len(parts) - 1
        if last and not idx:
            if not isinstance(cur, dict):
                raise SystemExit(f"live plant path {dotted!r}: {key!r} is not under a map")
            cur[key] = value
            return
        if not isinstance(cur, dict) or key not in cur:
            raise SystemExit(f"live plant path {dotted!r}: {key!r} is not in the recorded object")
        cur = cur[key]
        for j, k in enumerate(idx):
            if not isinstance(cur, list) or k >= len(cur):
                raise SystemExit(f"live plant path {dotted!r}: index {k} is not in the recorded object")
            if last and j == len(idx) - 1:
                cur[k] = value
                return
            cur = cur[k]


def _t(ts):
    from datetime import datetime
    try:
        return datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp()
    except Exception:  # noqa: BLE001
        return 0.0


def build(author_id, live_service, label, live_plants=None, own_only=False):
    """`live_plants`: [{"object": "<resourceType>/<namespace>/<name>", "set": {"<dotted path>": <value>}, "why": "..."}] — a PLANT
    on the recorded live state (a bench stimulus, named in the output's provenance), applied to a COPY of the recorded object
    before the tool's code compares. It can only change a recorded object; it cannot create one."""
    _check_server_table()
    hid, result = load(author_id)
    calls = result.get('toolCalls') or []
    manifests, live = [], {}
    for i, tc in enumerate(calls):
        a, inner = _args(tc)
        svc = a.get('targetService')
        if svc == 'github-service' and a.get('tool') == 'get_file_contents':
            try:
                env = tc["result"]["content"][0]["data"]
                blocks = [] if (not env.get("success") or env["result"].get("isError")) else (env["result"].get("content") or [])
            except (KeyError, IndexError, TypeError):
                blocks = []
            for c in blocks:
                if c.get('type') == 'resource' and isinstance(c.get('resource', {}).get('text'), str):
                    manifests.append((i, inner.get('path'), c['resource']['text']))
            continue
        d = _data(tc)
        if d is None:
            continue
        if svc == live_service:
            tool = a.get('tool')
            rt = inner.get('resourceType')
            if tool == 'get_resource' and isinstance(d, dict) and d.get('metadata'):
                md = d['metadata']
                live[(rt, md.get('namespace'), md.get('name'))] = (i, d)
            elif tool == 'list_resources' and isinstance(d, dict):
                for it in d.get('items') or []:
                    md = it.get('metadata') or {}
                    live.setdefault((rt, md.get('namespace') or d.get('namespace'), md.get('name')), (i, it))
    if len(manifests) != 1:
        raise SystemExit(f"{author_id}: {len(manifests)} successful Git file reads (want exactly 1)")
    gi, path, manifest = manifests[0]
    planted = []
    for p in live_plants or []:
        rt, ns, nm = p['object'].split('/')
        key = (rt, None if ns == '-' else ns, nm)
        if key not in live and not own_only:
            # a plant may change an object another same-reset harvest recorded (it is still a recorded object)
            w, _ = same_reset_witnesses(hid, recorded_objects(result, live_service), live_service)
            c = sorted((eid, objs[key]) for eid, objs in w.items() if key in objs)
            if c:
                live[key] = (c[0][1][0], c[0][1][1])
        if key not in live:
            raise SystemExit(f"live plant on {p['object']}: the recorded harvest never read that object (a plant cannot create one)")
        i, obj = live[key]
        obj = json.loads(json.dumps(obj))
        for dotted, value in p['set'].items():
            _set_path(obj, dotted, value)
        live[key] = (i, obj)
        planted.append({"object": p['object'], "set": p['set'], "why": p.get('why', '')})
    used, unread, borrowed, nsWitnessed = [], [], [], []
    subject_ts = max((v[2] for v in recorded_objects(result, live_service).values()), default='')
    witnesses, links = same_reset_witnesses(hid, recorded_objects(result, live_service), live_service) if not own_only else ({}, [])
    nsread = namespaces_read(result, live_service)
    docs = {}
    try:
        import yaml
        for doc in yaml.safe_load_all(manifest):
            if isinstance(doc, dict) and isinstance(doc.get('metadata'), dict):
                docs[(doc.get('kind'), doc['metadata'].get('name'))] = doc
    except Exception:  # noqa: BLE001
        pass

    def get_live(resource_type, _label, namespace, name):
        key = (resource_type, namespace, name)
        hit = live.get(key)
        if hit is not None:
            used.append({"object": f"{resource_type}/{namespace or '-'}/{name}", "toolCallIndex": hit[0]})
            return ("found", hit[1])
        # (1) The SAME cluster state read by another stored Harvester (linked by a shared UID — no reset in between): the copy closest
        #     in time to this harvest. This is what the production tool, which GETs every declared object itself, would have read.
        cands = [(eid, v) for eid, objs in witnesses.items() for k, v in objs.items() if k == key]
        if cands:
            eid, (ti, obj, ts) = min(cands, key=lambda c: (abs(_t(c[1][2]) - _t(subject_ts)), c[0]))
            borrowed.append({"object": f"{resource_type}/{namespace or '-'}/{name}", "fromHarvesterExecutionId": eid, "toolCallIndex": ti, "readAt": ts})
            return ("found", obj)
        # (2) A Namespace whose document declares NO field but its name: the tool compares nothing on it, so its answer is the same for
        #     every live object of that name — only existence matters, and a successful namespaced read in the harvest witnesses it.
        if resource_type == 'namespaces' and namespace is None and name in nsread:
            doc = docs.get(('Namespace', name)) or {}
            if set(doc) <= {'apiVersion', 'kind', 'metadata'} and set(doc.get('metadata') or {}) <= {'name'}:
                nsWitnessed.append(name)
                return ("found", {"metadata": {"name": name}})
        unread.append(f"{resource_type}/{namespace or '-'}/{name}")
        return ("error", None)

    res = compare_manifest(manifest, {v: k for k, v in RESOURCE_MAP.items()}, get_live, redacted_marker=PLACEHOLDER, cluster_kinds=CLUSTER_KINDS)
    assert res['method'] == METHOD
    return {
        "result": res,
        "provenance": {
            "generator": "scripts/leg-replay-lab/k8s-drift-from-recorded.py (the rig's declared_compare.compare_manifest over recorded inputs)",
            "authorExecutionId": author_id, "harvesterExecutionId": hid, "label": label,
            "manifest": {"toolCallIndex": gi, "path": path, "sha256": hashlib.sha256(manifest.encode('utf-8')).hexdigest(), "bytes": len(manifest.encode('utf-8'))},
            "liveService": live_service, "liveReadsUsed": used, "livePlants": planted,
            "sameResetReads": borrowed, "sameResetLinks": links, "namespaceExistenceWitnessed": sorted(set(nsWitnessed)),
            "notReadByTheHarvest": sorted(set(unread)),
            "rule": ("the production tool GETs every declared object itself. Answered, in order: the harvest's own recorded read; else the same "
                     "cluster state read by another stored Harvester linked by a shared object UID (no rig reset in between), the copy closest "
                     "in time; else, for a Namespace that declares nothing but its name, its existence as witnessed by a successful namespaced "
                     "read (the tool compares no field on it); else a failed read (live-read-failed) — never absent, never equal." if not own_only else
                     "own reads only (--own-reads-only): an object the harvest never read is a failed read (live-read-failed)"),
        },
    }


if __name__ == '__main__':
    argv = sys.argv[1:]
    if not argv:
        raise SystemExit(__doc__)
    aid = argv[0]
    label = argv[argv.index('--label') + 1] if '--label' in argv else 'sample-workloads'
    svc = argv[argv.index('--service') + 1] if '--service' in argv else 'k8s-rig-readonly'
    plants = json.load(open(argv[argv.index('--live-plant') + 1])) if '--live-plant' in argv else None
    out = build(aid, svc, label, plants, own_only='--own-reads-only' in argv)
    text = json.dumps(out, indent=2, sort_keys=True) + "\n"
    if '--out' in argv:
        p = argv[argv.index('--out') + 1]
        os.makedirs(os.path.dirname(os.path.abspath(p)), exist_ok=True)
        open(p, 'w').write(text)
    else:
        sys.stdout.write(text)
