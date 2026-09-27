/**
 * authoritative-result-read — the ONE way a mechanical net reads a leg child's `result.json` field
 * (RWF Stage 1 Wave B, 2026-09-26; spec: cline_docs/reviews/rwf-stage1-2026-09-26/execution-facts-review.md §3 B-1/B-2).
 *
 * THE RULE: a net reads exactly the execution the context chainer handed the Reviewer. Before Wave B the
 * four net reads (derivation harvest/Author/fallback, dialect-lint Author, rollback leaf-persist harvest,
 * rollback leg-synthesize hoist) each took "the newest result.json whose CONTENT carries this taskId". The
 * chainer takes selectAuthoritativeExecution with the R8 floor. The two agree today (1,203 of 1,203 archived
 * leg children) only because no leg child has yet been superseded or re-run to an empty deliverable. The
 * moment one is — which is what leg retry does routinely — the Reviewer would judge one package and the
 * gate would be stamped from another: the `mechanical-nets.ts` invariant "the Reviewer and the gate can
 * never see different numbers", broken silently.
 *
 * Three decisions a later edit must not undo:
 *  1. The selection options are CHAIN_SELECTION_OPTIONS, the SAME constant the chainer passes — never an
 *     inline literal (source-pinned by test-authoritative-result-read F6).
 *  2. The field is projected by Postgres `(content::jsonb)->>'<field>'`, never `JSON.parse(content)[field]`.
 *     jsonb stores object keys re-ordered; the hoisted `rollbackContainment` stamp's SERIALIZED KEY ORDER is
 *     that rendering, and the equivalence gate compares bytes. JSON.parse would return insertion order and
 *     change every hoisted stamp — a behavioural change wearing a refactor's clothes.
 *  3. `field` is a CLOSED union with one LITERAL query per member — no Prisma.raw, no bound field name — so
 *     the SQL stays static and reviewable.
 *
 * A PLAIN module on purpose (not the nets' shared `ctx`): the enrichments take a client, not a ctx, so the
 * replay runners and branch suites can call them directly.
 *
 * `executionId` is returned but stamped NOWHERE in Wave B — adding it to a fact is a deliberate byte change
 * that belongs in its own commit (C.2 freshness needs it).
 */

import type { Prisma } from '@prisma/client';
import { selectAuthoritativeExecution, CHAIN_SELECTION_OPTIONS } from '../../services/execution-selection';

export type ResultField = 'finalResponse' | 'rollbackContainment';

export type AuthoritativeReadClient = Pick<Prisma.TransactionClient, 'agentExecution' | 'agentArtifact' | '$queryRaw'>;

export interface AuthoritativeRead {
  /** The field's jsonb text rendering, or null when there is no selectable execution / no such field. */
  value: string | null;
  /** The execution read — the same one the chainer chains. Null ⇔ nothing selectable. */
  executionId: string | null;
}

export async function readAuthoritativeResultField(
  client: AuthoritativeReadClient,
  taskId: string,
  field: ResultField,
): Promise<AuthoritativeRead> {
  const { execution } = await selectAuthoritativeExecution(
    client as unknown as Prisma.TransactionClient, taskId, CHAIN_SELECTION_OPTIONS);
  if (!execution) return { value: null, executionId: null };
  const executionId = execution.id;

  let rows: Array<{ v: string | null }>;
  switch (field) {
    case 'finalResponse':
      rows = await client.$queryRaw<Array<{ v: string | null }>>`
        SELECT (content::jsonb)->>'finalResponse' AS v FROM agent_artifacts
        WHERE name = 'result.json' AND content LIKE '{%'
          AND "executionId" = ${executionId}
        ORDER BY "createdAt" DESC LIMIT 1`;
      break;
    case 'rollbackContainment':
      rows = await client.$queryRaw<Array<{ v: string | null }>>`
        SELECT (content::jsonb)->>'rollbackContainment' AS v FROM agent_artifacts
        WHERE name = 'result.json' AND content LIKE '{%'
          AND "executionId" = ${executionId}
        ORDER BY "createdAt" DESC LIMIT 1`;
      break;
    default: {
      const never: never = field;
      throw new Error(`readAuthoritativeResultField: unknown field ${String(never)}`);
    }
  }
  return { value: rows[0]?.v ?? null, executionId };
}
