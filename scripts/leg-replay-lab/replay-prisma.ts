/**
 * Leg replay lab — a READ-ONLY, IN-MEMORY Prisma stand-in built from a node snapshot.
 *
 * WHY: the mechanical nets' enrichments (rollback containment, dialect lint, derivation containment, …) read the
 * stage's children and their authoritative result.json through Prisma. Production is reachable only through a
 * read-only psql channel, and the replayed Author output exists nowhere in any database. So the SHIPPING
 * enrichments run against this stub, whose tables are the snapshot rows with ONE substitution: the replayed
 * Author execution (and, after the review, the replayed Reviewer execution) is added as the newest SUCCESS
 * execution of its task, so `selectAuthoritativeExecution` picks it exactly as it would pick a fresh run.
 *
 * SCOPE, STATED: it implements only the query shapes the nets issue — equality, `in`, `contains`, `not`,
 * `AND`/`OR`, JSON `path`+`equals`, `select` projection (incl. nested relation selects it can resolve),
 * `orderBy`, `take`. ANY other shape THROWS `ReplayStubUnsupported`, never returns a guess: the registry then
 * stamps that net's `errorFact`, and the lab reports the net as `stub-unsupported` rather than as a fact.
 * A stub that silently answered "nothing" to an unknown filter would reproduce the silent-skip class this
 * domain exists to prevent.
 */
import { utc, type Snapshot, type ExecBlock } from './snapshot';

export class ReplayStubUnsupported extends Error {
  constructor(what: string) { super(`replay stub: unsupported query shape — ${what}`); this.name = 'ReplayStubUnsupported'; }
}

type Row = Record<string, any>;

/** Snapshot column names → the Prisma field names the enrichments filter and select on. */
export function taskRowToPrisma(r: Row): Row {
  return {
    id: r.id, title: r.title, description: r.description ?? null, agentRole: r.agentRole ?? null, type: r.type ?? null,
    stageId: r.stage_id ?? r.stageId ?? null, createdAt: utc(r.created_at ?? r.createdAt), metadata: r.metadata ?? null,
    inputContext: r.inputContext ?? null, status: r.status ?? null, agentTemplateId: r.agentTemplateId ?? null,
    parentTaskId: r.parentTaskId ?? null, povId: r.pov_id ?? null,
  };
}

function getPath(obj: any, p: string[]): any {
  let cur = obj;
  for (const k of p) { if (cur == null || typeof cur !== 'object') return undefined; cur = cur[k]; }
  return cur;
}

function matchField(value: any, cond: any, field: string, rels: RelResolver, row: Row): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond !== 'object') return value === cond;
  const keys = Object.keys(cond);
  if (keys.includes('path')) {
    if (!keys.every((k) => k === 'path' || k === 'equals')) throw new ReplayStubUnsupported(`json filter ${JSON.stringify(cond)}`);
    return getPath(value, cond.path) === cond.equals;
  }
  // A relation filter (e.g. agentTemplate: { templateType: 'REVIEWER' }) is resolved through the relation resolver.
  if (rels.isRelation(field)) {
    const target = rels.resolve(field, row);
    if (!target) return false;
    return matchWhere(target, cond, rels);
  }
  for (const k of keys) {
    const c = cond[k];
    switch (k) {
      case 'equals': if (value !== c) return false; break;
      case 'in': if (!Array.isArray(c) || !c.includes(value)) return false; break;
      case 'notIn': if (!Array.isArray(c) || c.includes(value)) return false; break;
      case 'contains': if (typeof value !== 'string' || !value.includes(c)) return false; break;
      case 'startsWith': if (typeof value !== 'string' || !value.startsWith(c)) return false; break;
      case 'not': if (c === null ? (value === null || value === undefined) : matchField(value, c, field, rels, row)) return false; break;
      default: throw new ReplayStubUnsupported(`operator ${k} on ${field}`);
    }
  }
  return true;
}

interface RelResolver { isRelation(f: string): boolean; resolve(f: string, row: Row): Row | null }

function matchWhere(row: Row, where: any, rels: RelResolver): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'AND') { if (!(v as any[]).every((w) => matchWhere(row, w, rels))) return false; continue; }
    if (k === 'OR') { if (!(v as any[]).some((w) => matchWhere(row, w, rels))) return false; continue; }
    if (k === 'NOT') { if (matchWhere(row, v, rels)) return false; continue; }
    if (!matchField(row[k], v, k, rels, row)) return false;
  }
  return true;
}

function order(rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows;
  const specs: Array<[string, 'asc' | 'desc']> = [];
  for (const o of Array.isArray(orderBy) ? orderBy : [orderBy]) {
    for (const [k, d] of Object.entries(o)) {
      if (typeof d !== 'string') throw new ReplayStubUnsupported(`orderBy relation ${k}`);
      specs.push([k, d as 'asc' | 'desc']);
    }
  }
  const cmp = (a: any, b: any) => (a instanceof Date ? a.getTime() : a) < (b instanceof Date ? b.getTime() : b) ? -1 : (a instanceof Date ? a.getTime() : a) > (b instanceof Date ? b.getTime() : b) ? 1 : 0;
  return [...rows].sort((x, y) => {
    for (const [k, d] of specs) { const c = cmp(x[k], y[k]); if (c) return d === 'asc' ? c : -c; }
    return 0;
  });
}

/**
 * Postgres `jsonb::text` rendering of a non-string value, as `->>` returns it: object keys in jsonb order (shorter key
 * first, then bytewise) and `", "` / `": "` separators. The consumers JSON.parse it, so only key ORDER can leak through
 * — and it does leak into a re-serialized hoist, which is why it is emulated rather than approximated.
 */
export function jsonbText(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(jsonbText).join(', ')}]`;
  const keys = Object.keys(v as object).sort((a, b) => {
    const la = Buffer.byteLength(a); const lb = Buffer.byteLength(b);
    return la !== lb ? la - lb : Buffer.compare(Buffer.from(a), Buffer.from(b));
  });
  return `{${keys.map((k) => `${JSON.stringify(k)}: ${jsonbText((v as Record<string, unknown>)[k])}`).join(', ')}}`;
}

export interface ReplaySubstitution {
  /** Task whose output is replaced, and the replayed text (stored as a result.json with the stamped facts). */
  taskId: string;
  executionId: string;
  resultJson: Record<string, unknown>;
}

/**
 * Build the stub. `subs` adds a replayed execution as the newest SUCCESS execution of its task.
 * `queries` records every call, so a report can show what the nets actually read.
 */
export function buildReplayPrisma(snap: Snapshot, subs: ReplaySubstitution[] = []) {
  const queries: string[] = [];
  const tasks: Row[] = [];
  const seen = new Set<string>();
  const addTask = (r: Row | null | undefined) => { if (r && !seen.has(r.id)) { seen.add(r.id); tasks.push(taskRowToPrisma(r)); } };
  for (const c of snap.children) addTask(c);
  addTask(snap.leg);
  addTask(snap.programRoot);
  for (const b of [snap.author, snap.reviewer] as Array<ExecBlock | null>) if (b) addTask(b.task);
  // The author/reviewer rows carry the FULL task (incl. inputContext); prefer them over the children projection.
  for (const b of [snap.author, snap.reviewer] as Array<ExecBlock | null>) {
    if (!b) continue;
    const i = tasks.findIndex((t) => t.id === b.task.id);
    if (i >= 0) tasks[i] = taskRowToPrisma(b.task);
  }

  const stages: Row[] = snap.stage ? [{ id: snap.stage.id, metadata: snap.stage.metadata ?? null }] : [];
  const execs: Row[] = snap.childExecutions.map((e) => ({
    id: e.id, taskId: e.taskId, status: e.status, createdAt: utc(e.createdAt), supersededById: e.supersededById ?? null,
  }));
  const artifacts: Row[] = snap.childArtifacts.map((a) => ({ executionId: a.executionId, name: a.name, createdAt: utc(a.createdAt), content: a.content }));
  const latest = execs.reduce((m, e) => Math.max(m, e.createdAt.getTime()), Date.now());
  subs.forEach((s, i) => {
    const at = new Date(latest + 1000 * (i + 1));
    execs.push({ id: s.executionId, taskId: s.taskId, status: 'SUCCESS', createdAt: at, supersededById: null });
    artifacts.push({ executionId: s.executionId, name: 'result.json', createdAt: at, content: JSON.stringify(s.resultJson) });
  });

  const templateTypeById = new Map<string, string | null>();
  for (const c of snap.children) if (c.agentTemplateId && 'templateType' in c) templateTypeById.set(c.agentTemplateId, c.templateType ?? null);
  for (const b of [snap.author, snap.reviewer] as Array<ExecBlock | null>) if (b?.template) templateTypeById.set(b.template.id, b.template.templateType ?? null);

  const taskRels: RelResolver = {
    isRelation: (f) => f === 'agentTemplate',
    resolve: (f, row) => {
      if (f !== 'agentTemplate' || !row.agentTemplateId) return null;
      if (!templateTypeById.has(row.agentTemplateId)) throw new ReplayStubUnsupported(`agentTemplate relation for a template not in the snapshot (${row.agentTemplateId})`);
      return { id: row.agentTemplateId, templateType: templateTypeById.get(row.agentTemplateId) };
    },
  };
  const noRels: RelResolver = { isRelation: () => false, resolve: () => null };

  const project = (row: Row, select: any, table: 'task' | 'other'): Row => {
    if (!select) return { ...row };
    const out: Row = {};
    for (const [k, v] of Object.entries(select)) {
      if (!v) continue;
      if (k === '_count' && table === 'task') {
        const sel = (v as any).select ?? {};
        out._count = {};
        if (sel.executions) out._count.executions = execs.filter((e) => e.taskId === row.id).length;
        for (const kk of Object.keys(sel)) if (kk !== 'executions') throw new ReplayStubUnsupported(`_count.${kk}`);
        continue;
      }
      if (v !== true) {
        if (table === 'task' && k === 'agentTemplate') { out[k] = taskRels.resolve(k, row); continue; }
        throw new ReplayStubUnsupported(`nested select ${k}`);
      }
      if (!(k in row)) throw new ReplayStubUnsupported(`select of column not in snapshot: ${k}`);
      out[k] = row[k];
    }
    return out;
  };

  const table = (name: string, rows: Row[], rels: RelResolver, kind: 'task' | 'other') => ({
    async findMany(args: any = {}) {
      queries.push(`${name}.findMany ${JSON.stringify(args.where ?? {})}`);
      let r = rows.filter((x) => matchWhere(x, args.where, rels));
      r = order(r, args.orderBy);
      if (args.skip) r = r.slice(args.skip);
      if (args.take != null) r = r.slice(0, args.take);
      return r.map((x) => project(x, args.select, kind));
    },
    async findFirst(args: any = {}) {
      queries.push(`${name}.findFirst ${JSON.stringify(args.where ?? {})}`);
      const r = order(rows.filter((x) => matchWhere(x, args.where, rels)), args.orderBy);
      return r.length ? project(r[0], args.select, kind) : null;
    },
    // `count` with a where (reviewer-warnings-enrichment's in-flight probe); a select/cursor shape is not served.
    async count(args: any = {}) {
      for (const k of Object.keys(args)) if (k !== 'where') throw new ReplayStubUnsupported(`${name}.count ${k}`);
      queries.push(`${name}.count ${JSON.stringify(args.where ?? {})}`);
      return rows.filter((x) => matchWhere(x, args.where, rels)).length;
    },
    async findUnique(args: any = {}) {
      queries.push(`${name}.findUnique ${JSON.stringify(args.where ?? {})}`);
      const r = rows.filter((x) => matchWhere(x, args.where, rels));
      return r.length ? project(r[0], args.select, kind) : null;
    },
  });

  const refuse = (op: string) => async () => { throw new ReplayStubUnsupported(`write ${op} (the lab is read-only)`); };
  const client: any = {
    task: table('task', tasks, taskRels, 'task'),
    stage: table('stage', stages, noRels, 'other'),
    agentExecution: table('agentExecution', execs, noRels, 'other'),
    agentArtifact: table('agentArtifact', artifacts, noRels, 'other'),
    // readAuthoritativeResultField's result.json literal projections, and nothing else (authoritative-result-read.ts).
    // `reviewerVerdict` added 2026-10-08 for the leg-arm reviewerWarnings net. The program arm's `reviewerWarnings`
    // read targets pipeline-index.json, which no snapshot holds — it stays unsupported and throws (never a guess).
    // `toolCalls` added 2026-10-13: E1 (rollbackContainment) and quoteFidelity's Author point read the leg Harvester's
    // raw tool results through it; without it both nets stamped their errorFact on every replayed Author (D1 went red).
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Array.from(strings ?? []).join('$?').replace(/\s+/g, ' ').trim();
      const m = sql.match(/^SELECT \(content::jsonb\)->>'(finalResponse|rollbackContainment|derivationContainment|reviewerVerdict|toolCalls)' AS v FROM agent_artifacts WHERE name = 'result\.json' AND content LIKE '\{%' AND "executionId" = \$\? ORDER BY "createdAt" DESC LIMIT 1$/);
      if (!m || values.length !== 1) throw new ReplayStubUnsupported(`$queryRaw ${sql.slice(0, 120)}`);
      queries.push(`$queryRaw ->>${m[1]} executionId=${String(values[0])}`);
      const art = order(artifacts.filter((a) => a.name === 'result.json' && a.executionId === values[0] && String(a.content).startsWith('{')), { createdAt: 'desc' })[0];
      if (!art) return [];
      let parsed: any;
      try { parsed = JSON.parse(art.content); } catch { throw new ReplayStubUnsupported('result.json that JSON.parse rejects (Postgres would cast or error differently)'); }
      const v = parsed[m[1]];
      return [{ v: v === undefined || v === null ? null : typeof v === 'string' ? v : jsonbText(v) }];
    },
    $transaction: refuse('$transaction'),
  };
  for (const t of ['task', 'stage', 'agentExecution', 'agentArtifact']) {
    for (const op of ['create', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany', 'createMany']) client[t][op] = refuse(`${t}.${op}`);
  }
  return { client, queries };
}
