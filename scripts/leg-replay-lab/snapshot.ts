/**
 * Leg replay lab — SNAPSHOT: everything a node replay reads, fetched ONCE from production, read-only.
 *
 * One SQL statement per node over `ssh` + `psql` under `PGOPTIONS=-c default_transaction_read_only=on`
 * (the same channel as scripts/replay-form-check.ts). The result is cached as JSON under
 * `scripts/leg-replay-lab/cache/snapshots/<authorExecutionId>.json` so every later step (prompt rebuild, nets,
 * dry runs, fidelity tests) runs offline. Nothing is written to production.
 *
 * WHAT A NODE IS: one persisted Author execution (`config_change_author`, or `requirements_author` since L-R1
 * 2026-10-09), plus the REVIEWER execution that reviewed THAT package: the newest execution, in the stage, of a task
 * whose role is in the shipping `REVIEWER_ROLES` set (`change_reviewer`, `requirements_reviewer`, `derivation_reviewer`)
 * and whose frozen chained Author entry carries this author execution id — never "the newest reviewer", which can have
 * reviewed a different Author run. A node may instead NAME its reviewer (`NodeSpec.reviewerExecutionId`).
 *
 * Rows are taken as `row_to_json(t.*)` so the cache carries the DB column names verbatim (pov_id, stage_id,
 * "agentRole", …); `rebuild.ts` maps them to the Prisma shapes the platform's builders read. Doing the
 * mapping in one place keeps the SQL free of hand-typed column lists that would drift from the schema.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { REVIEWER_ROLES } from '../../lib/agents/harness/parse-verdict';

export const LAB_DIR = __dirname;
export const CACHE_DIR = path.join(LAB_DIR, 'cache');
export const SNAPSHOT_DIR = path.join(CACHE_DIR, 'snapshots');

const REMOTE = 'cd /var/www/paichart-app/current && source .env.production && ' +
  'PGOPTIONS="-c default_transaction_read_only=on" psql "$DATABASE_URL" -At -P pager=off -v ON_ERROR_STOP=1';

export function runReadOnlySql(sql: string): string {
  return execFileSync('ssh', ['<PROD_USER>@<PROD_HOST>', REMOTE], { input: sql, maxBuffer: 1024 * 1024 * 1024 }).toString();
}

/** L-R1 (2026-10-09): pair by the SHIPPING reviewer-role set, not a hard-wired `change_reviewer`. */
export const REVIEWER_ROLE_LIST = [...REVIEWER_ROLES].map((r) => {
  if (!/^[a-z_]+$/.test(r)) throw new Error(`not a role: ${r}`);
  return `'${r}'`;
}).join(', ');

const id = (s: string) => {
  if (!/^[a-z0-9]{20,40}$/.test(s)) throw new Error(`not an id: ${s}`);
  return `'${s}'`;
};

/** The execution side of a node (Author or Reviewer): row, result.json, task + relations, template. */
function execBlock(execIdExpr: string): string {
  return `(SELECT json_build_object(
      'exec', row_to_json(e.*),
      'resultJson', (SELECT a.content FROM agent_artifacts a WHERE a."executionId" = e.id AND a.name = 'result.json' ORDER BY a."createdAt" DESC LIMIT 1),
      'task', row_to_json(t.*),
      'pov', (SELECT row_to_json(p.*) FROM "POV" p WHERE p.id = t.pov_id),
      'phase', (SELECT row_to_json(ph.*) FROM "Phase" ph WHERE ph.id = t.phase_id),
      'stage', (SELECT row_to_json(s.*) FROM stages s WHERE s.id = t.stage_id),
      'team', (SELECT row_to_json(tm.*) FROM "Team" tm WHERE tm.id = t.team_id),
      'assignee', (SELECT json_build_object('id', u.id, 'name', u.name, 'email', u.email) FROM "User" u WHERE u.id = t.assignee_id),
      'parentTask', (SELECT json_build_object('id', pt.id, 'title', pt.title, 'description', pt.description, 'order', pt."order")
                       FROM tasks pt WHERE pt.id = t."parentTaskId"),
      'subTasks', (SELECT coalesce(json_agg(x ORDER BY x."order"), '[]'::json) FROM (
                     SELECT st.id, st.title, st.description, st.status, st."order" FROM tasks st
                     WHERE st."parentTaskId" = t.id ORDER BY st."order" ASC LIMIT 10) x),
      'template', (SELECT row_to_json(tp.*) FROM agent_templates tp WHERE tp.id = coalesce(e."agentTemplateId", t."agentTemplateId"))
    ) FROM agent_executions e JOIN tasks t ON t.id = e."taskId" WHERE e.id = ${execIdExpr})`;
}

export function snapshotSql(authorExecutionId: string, reviewerExecutionId?: string | null): string {
  const a = id(authorExecutionId);
  // The reviewer that reviewed THIS package: its frozen chained context names this author execution.
  const reviewerExpr = reviewerExecutionId ? id(reviewerExecutionId) : `(
    SELECT re.id FROM agent_executions ae JOIN tasks at ON at.id = ae."taskId"
      JOIN tasks rt ON rt.stage_id = at.stage_id AND rt."agentRole" IN (${REVIEWER_ROLE_LIST})
      JOIN agent_executions re ON re."taskId" = rt.id
    WHERE ae.id = ${a}
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof((re.config::jsonb)->'inputContext'->'chainedFrom') = 'array'
                    THEN (re.config::jsonb)->'inputContext'->'chainedFrom' ELSE '[]'::jsonb END) ce
                  WHERE ce->>'executionId' = ae.id)
    ORDER BY re."startTime" DESC LIMIT 1)`;
  return `
WITH au AS (SELECT t.stage_id sid FROM agent_executions e JOIN tasks t ON t.id = e."taskId" WHERE e.id = ${a}),
st AS (SELECT s.* FROM stages s, au WHERE s.id = au.sid),
kids AS (SELECT t.* FROM tasks t, au WHERE t.stage_id = au.sid),
kexec AS (SELECT e.id, e."taskId", e.status, e."createdAt", e."supersededById", e."startTime" FROM agent_executions e JOIN kids k ON k.id = e."taskId")
SELECT json_build_object(
  'fetchedAt', now(),
  'author', ${execBlock(a)},
  'reviewer', ${execBlock(reviewerExpr)},
  'stage', (SELECT row_to_json(st.*) FROM st),
  'leg', (SELECT row_to_json(l.*) FROM tasks l, st WHERE l.id = st.metadata->>'harnessTaskId'),
  'children', (SELECT coalesce(json_agg(json_build_object('id', k.id, 'title', k.title, 'agentRole', k."agentRole", 'type', k.type,
                 'stage_id', k.stage_id, 'created_at', k.created_at, 'description', k.description, 'metadata', k.metadata,
                 'agentTemplateId', k."agentTemplateId", 'status', k.status,
                 'templateType', (SELECT tp."templateType" FROM agent_templates tp WHERE tp.id = k."agentTemplateId")) ORDER BY k.created_at), '[]'::json) FROM kids k),
  'programRoot', (SELECT row_to_json(r.*) FROM tasks r, tasks l, st
                  WHERE l.id = st.metadata->>'harnessTaskId' AND r.type = 'PIPELINE' AND r.metadata->>'pipelineStageId' = l.stage_id LIMIT 1),
  'childExecutions', (SELECT coalesce(json_agg(row_to_json(x.*) ORDER BY x."createdAt"), '[]'::json) FROM kexec x),
  'childArtifacts', (SELECT coalesce(json_agg(json_build_object('executionId', ar."executionId", 'name', ar.name, 'createdAt', ar."createdAt",
                       'content', ar.content)), '[]'::json)
                     FROM agent_artifacts ar JOIN kexec x ON x.id = ar."executionId" WHERE x.status = 'SUCCESS' AND ar.name = 'result.json'),
  'mcpTools', (SELECT coalesce(json_agg(json_build_object('name', m.name, 'capabilities', m.capabilities) ORDER BY m.name), '[]'::json)
               FROM mcp_tools m WHERE m.status = 'ACTIVE')
);`;
}

export interface Snapshot {
  fetchedAt: string;
  author: ExecBlock;
  reviewer: ExecBlock | null;
  stage: Record<string, any> | null;
  leg: Record<string, any> | null;
  /** The PIPELINE that owns the leg's own stage (a program root), when there is one — read by contractApplicability. */
  programRoot: Record<string, any> | null;
  children: Array<Record<string, any>>;
  childExecutions: Array<Record<string, any>>;
  childArtifacts: Array<{ executionId: string; name: string; createdAt: string; content: string }>;
  mcpTools: Array<{ name: string; capabilities: unknown }>;
}

export interface ExecBlock {
  exec: Record<string, any>;
  resultJson: string | null;
  task: Record<string, any>;
  pov: Record<string, any> | null;
  phase: Record<string, any> | null;
  stage: Record<string, any> | null;
  team: Record<string, any> | null;
  assignee: { id: string; name: string | null; email: string } | null;
  parentTask: Record<string, any> | null;
  subTasks: Array<Record<string, any>>;
  template: Record<string, any> | null;
}

/** Production timestamps are `timestamp without time zone` holding UTC; row_to_json renders them with no zone, which
 *  `new Date()` would read as LOCAL time (a 10-11 h shift here). Every lab read of a DB timestamp goes through this. */
export function utc(ts: string | Date | null | undefined): Date {
  if (ts instanceof Date) return ts;
  if (!ts) return new Date(NaN);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`);
}

export function snapshotPath(authorExecutionId: string): string {
  return path.join(SNAPSHOT_DIR, `${authorExecutionId}.json`);
}

/** Load from cache, or fetch (read-only) and cache. `refresh` forces a re-fetch. */
export function loadSnapshot(authorExecutionId: string, opts: { refresh?: boolean; reviewerExecutionId?: string | null } = {}): Snapshot {
  const p = snapshotPath(authorExecutionId);
  if (!opts.refresh && fs.existsSync(p)) {
    const cached = JSON.parse(fs.readFileSync(p, 'utf8')) as Snapshot;
    // A node that NAMES its reviewer must get that reviewer — a cached snapshot paired differently is not silently reused.
    if (opts.reviewerExecutionId && cached.reviewer?.exec.id !== opts.reviewerExecutionId) {
      throw new Error(`snapshot ${authorExecutionId}: cached reviewer ${cached.reviewer?.exec.id ?? 'none'} ≠ the node's reviewerExecutionId ${opts.reviewerExecutionId} — re-fetch with: snapshot --experiment <dir> --refresh`);
    }
    return cached;
  }
  const out = runReadOnlySql(snapshotSql(authorExecutionId, opts.reviewerExecutionId));
  const line = out.split('\n').find((l) => l.trim().startsWith('{'));
  if (!line) throw new Error(`snapshot for ${authorExecutionId}: no row returned`);
  const snap = JSON.parse(line) as Snapshot;
  if (!snap.author) throw new Error(`snapshot for ${authorExecutionId}: no such execution`);
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(snap, null, 1));
  return snap;
}

/** The current production row of each named protocol (read-only). Used for the `prod` text source. */
export function fetchProtocolRows(names: string[]): Array<{ name: string; version: string; status: string; description: string | null; promptText: string; updatedAt: string }> {
  const list = names.map((n) => {
    if (!/^[a-z0-9-]+$/.test(n)) throw new Error(`not a protocol name: ${n}`);
    return `'${n}'`;
  }).join(',');
  const out = runReadOnlySql(`SELECT row_to_json(t) FROM (SELECT name, version, status, description, "promptText", "updatedAt"
    FROM agent_prompt_library WHERE name IN (${list})) t;`);
  return out.split('\n').filter((l) => l.trim().startsWith('{')).map((l) => JSON.parse(l));
}

/** The current production row of each named agent template (read-only), by id. Used to pin TODAY's role guidance
 *  (a reviewer's system base) instead of the copy a past node froze or a stale cached snapshot row. */
export function fetchTemplateRows(ids: string[]): Array<{ id: string; name: string; defaultRole: string | null; status: string; promptTemplate: string; updatedAt: string }> {
  const list = ids.map((i) => {
    if (!/^[a-z0-9]{20,40}$/.test(i)) throw new Error(`not a template id: ${i}`);
    return `'${i}'`;
  }).join(',');
  const out = runReadOnlySql(`SELECT row_to_json(t) FROM (SELECT id, name, "defaultRole", status, "promptTemplate", "updatedAt"
    FROM agent_templates WHERE id IN (${list})) t;`);
  return out.split('\n').filter((l) => l.trim().startsWith('{')).map((l) => JSON.parse(l));
}
