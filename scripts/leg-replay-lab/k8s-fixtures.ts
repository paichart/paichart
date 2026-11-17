/**
 * Leg replay lab — the k8s CLUSTER tier (L-CS-K, 2026-11-16, owner stop item 3). $0: no service, no cluster, no model.
 *
 * The first L-CS-K runs served a Harvester's cluster reads only when they matched a STORED call exactly; every other read of the
 * read-only service got the lab's "tool calls are not executed" notice (7–13 per sample). Those samples measured nothing on a live read,
 * and the notice leaked lab vocabulary (register LAB-UNSERVED-NOTICE-LEAK). This tier answers EVERY call to the cluster's read-only
 * service from a RECORDED CLUSTER STATE (k8s-cluster-fixture.py: the subject harvest + same-reset harvests linked by a shared UID),
 * through the same tool semantics the service implements (`server.py`):
 *
 *   list_resources     the complete listing of that kind in that namespace, filtered by the label selector — when the state knows the
 *                      kind's complete membership AND every member's full object; else `k8s API error (403): Forbidden`
 *   list_resource_names  names + labels (+ count), filtered — when the membership is known; else 403
 *   get_resource       the recorded object; a name the complete membership does not contain ⇒ `k8s API error (404): Not Found`; an object
 *                      the state cannot establish ⇒ 403
 *   list_secret_names  the recorded listing (names, types, key names — never values); else 403
 *   anything else      (incl. `compare_declared_fields`, which the 1.19.0 text forbids an agent to call) ⇒ 403
 * The service's own argument checks run first, with its own text (allowlist, RFC1123 namespace / name, selector length).
 * NOTHING IS INVENTED: an answer the recorded state cannot establish is a refusal in the service's own words, never a made-up object
 * and never the lab notice. Every serve is logged (`cluster-state` / `cluster-refused`).
 */
import * as fs from 'fs';
import type { RecordedToolServer, ServeLogEntry } from './recorded-tools';

export interface K8sClusterState {
  service: string;
  objects: Record<string, { object: Record<string, any>; fromHarvesterExecutionId: string; readAt: string }>;
  membership: Record<string, { names: Record<string, Record<string, string>>; fromHarvesterExecutionId: string; readAt: string }>;
  secretNames: Record<string, { secrets: unknown[]; fromHarvesterExecutionId: string; readAt: string }>;
  envelope: Record<string, any>;
  subject?: unknown; harvesters?: string[];
}
export function loadK8sClusterState(file: string): K8sClusterState {
  const s = JSON.parse(fs.readFileSync(file, 'utf8')) as K8sClusterState;
  if (!s.service || !s.objects || !s.membership || !s.envelope) throw new Error(`${file} is not a k8s cluster state (k8s-cluster-fixture.py)`);
  return s;
}

/** server.py's closed allowlist (k8s-drift-from-recorded.py pins the same table against server.py). */
export const K8S_RESOURCE_TYPES = ['configmaps', 'daemonsets', 'deployments', 'endpoints', 'horizontalpodautoscalers', 'ingresses', 'limitranges',
  'networkpolicies', 'poddisruptionbudgets', 'pods', 'replicasets', 'resourcequotas', 'serviceaccounts', 'services', 'statefulsets'] as const;
const NS_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
class ToolError extends Error {}
const API = (status: number, reason: string) => new ToolError(`k8s API error (${status}): ${reason}`);

function validate(rt: unknown, ns: unknown, name?: unknown) {
  if (typeof rt !== 'string' || !(K8S_RESOURCE_TYPES as readonly string[]).includes(rt)) {
    throw new ToolError(`resourceType '${String(rt)}' is not in the read-only allowlist. Allowed: ['${[...K8S_RESOURCE_TYPES].sort().join("', '")}']. (secrets -> use list_secret_names; no exec/log/proxy/raw/subresource access exists.)`);
  }
  if (typeof ns !== 'string' || !NS_RE.test(ns) || ns.length > 253) throw new ToolError(`namespace '${String(ns)}' is not a valid single RFC1123 name (no -A / wildcards).`);
  if (name !== undefined && (typeof name !== 'string' || !NS_RE.test(name) || name.length > 253)) throw new ToolError(`name '${String(name)}' is not a valid RFC1123 name.`);
}

/** Kubernetes label-selector matching: equality (`k=v`, `k==v`, `k!=v`), existence (`k`, `!k`) and set terms (`k in (a,b)`,
 *  `k notin (a,b)`). An unparseable selector ⇒ the API server's 400. */
export function selectorMatches(selector: string | undefined | null, labels: Record<string, string>): boolean {
  if (!selector) return true;
  const terms: string[] = []; let depth = 0, cur = '';
  for (const ch of selector) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { terms.push(cur); cur = ''; } else cur += ch; }
  terms.push(cur);
  return terms.every((raw) => {
    const t = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^([\w./-]+)\s+(in|notin)\s+\(([^)]*)\)$/.exec(t))) {
      const vals = m[3].split(',').map((x) => x.trim()); const has = m[1] in labels && vals.includes(labels[m[1]]);
      return m[2] === 'in' ? has : !has;
    }
    if ((m = /^([\w./-]+)\s*(==|=|!=)\s*([\w./-]*)$/.exec(t))) return m[2] === '!=' ? labels[m[1]] !== m[3] : labels[m[1]] === m[3];
    if ((m = /^!([\w./-]+)$/.exec(t))) return !(m[1] in labels);
    if ((m = /^([\w./-]+)$/.exec(t))) return m[1] in labels;
    throw API(400, 'Bad Request');
  });
}

export interface K8sClusterServer extends RecordedToolServer { clusterLog: Array<{ tool: string; args: Record<string, unknown>; outcome: string }> }

/** Answers `services(action:'call', targetService: <state.service>, …)`; every other call goes to `fallback` (the recorded tier). */
export function createK8sClusterServer(state: K8sClusterState, fallback: RecordedToolServer | null, stub: unknown): K8sClusterServer {
  const log: ServeLogEntry[] = fallback ? fallback.log : [];
  const clusterLog: K8sClusterServer['clusterLog'] = [];
  const asObj = (v: unknown): Record<string, any> | null => { if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, any>; if (typeof v === 'string') { try { const p = JSON.parse(v); return p && typeof p === 'object' ? p : null; } catch { return null; } } return null; };
  const envelope = (args: Record<string, unknown>, tool: string, result: Record<string, unknown>) => {
    const e = JSON.parse(JSON.stringify(state.envelope));
    const d = e.content[0].data;
    d.arguments = args; d.tool = tool; d.targetService = state.service; d.result = result;
    if (e.content[0].annotations) { e.content[0].annotations = { ...e.content[0].annotations, itemCount: Object.keys(result).length }; }
    return e;
  };
  const answer = (tool: string, args: Record<string, any>): Record<string, unknown> => {
    switch (tool) {
      case 'list_resources': case 'list_resource_names': {
        validate(args.resourceType, args.namespace);
        if (typeof args.labelSelector === 'string' && args.labelSelector.length > 256) throw new ToolError('labelSelector too long (max 256).');
        const mem = state.membership[`${args.resourceType}/${args.namespace}`];
        if (!mem) throw API(403, 'Forbidden');
        const names = Object.entries(mem.names).filter(([, labels]) => selectorMatches(args.labelSelector, labels)).map(([n]) => n).sort();
        if (tool === 'list_resource_names') return { resourceType: args.resourceType, namespace: args.namespace, count: names.length, items: names.map((n) => ({ name: n, labels: mem.names[n] })) };
        const objs = names.map((n) => state.objects[`${args.resourceType}/${args.namespace}/${n}`]?.object);
        if (objs.some((o) => !o)) throw API(403, 'Forbidden');
        return { resourceType: args.resourceType, namespace: args.namespace, items: objs };
      }
      case 'get_resource': {
        validate(args.resourceType, args.namespace, args.name);
        const o = state.objects[`${args.resourceType}/${args.namespace}/${args.name}`];
        if (o) return o.object;
        const mem = state.membership[`${args.resourceType}/${args.namespace}`];
        if (mem && !(String(args.name) in mem.names)) throw API(404, 'Not Found');
        throw API(403, 'Forbidden');
      }
      case 'list_secret_names': {
        validate('configmaps', args.namespace);
        const s = state.secretNames[String(args.namespace)];
        if (!s) throw API(403, 'Forbidden');
        return { namespace: args.namespace, secrets: s.secrets };
      }
      default:
        throw API(403, 'Forbidden');
    }
  };
  return {
    log, clusterLog,
    async getToolDefinition(name: string) { return fallback ? fallback.getToolDefinition(name) : { serverName: 'paichart-embedded-mcp', tool: { name } }; },
    async executeToolOnServer(server: string, tool: string, args: unknown) {
      const a = asObj(args);
      if (tool !== 'services' || a?.action !== 'call' || a?.targetService !== state.service) {
        if (fallback) return fallback.executeToolOnServer(server, tool, args);
        log.push({ tool, action: typeof a?.action === 'string' ? a.action : null, innerTool: typeof a?.tool === 'string' ? a.tool : null, fileTool: false, tier: 'unserved', storedIndex: null });
        return stub;
      }
      const inner = asObj(a.arguments) ?? {};
      const innerTool = typeof a.tool === 'string' ? a.tool : '';
      const entry: ServeLogEntry = { tool, action: 'call', innerTool, fileTool: false, tier: 'cluster-state', storedIndex: null };
      log.push(entry);
      try {
        const r = answer(innerTool, inner);
        clusterLog.push({ tool: innerTool, args: inner, outcome: 'served' });
        return envelope(inner, innerTool, { content: [{ type: 'text', text: JSON.stringify(r) }], structuredContent: r, isError: false });
      } catch (e) {
        if (!(e instanceof ToolError)) throw e;
        entry.tier = 'cluster-refused';
        clusterLog.push({ tool: innerTool, args: inner, outcome: e.message });
        return envelope(inner, innerTool, { content: [{ type: 'text', text: e.message }], isError: true });
      }
    },
  };
}
