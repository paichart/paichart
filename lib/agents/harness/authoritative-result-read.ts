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

export type ResultField = 'finalResponse' | 'rollbackContainment' | 'derivationContainment' | 'reviewerVerdict' | 'reviewerWarnings' | 'toolCalls'
  | 'editApplication' | 'reviewedEditDiff' | 'heldBytes' | 'gitDeviceComparison' | 'liveEvidence';

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
    // value-chain build B4 (2026-10-02): the value-leg hoist reads the Derivation Architect's leaf stamp from the
    // execution the Reviewer was chained — same rule, same jsonb projection, one more literal query.
    case 'derivationContainment':
      rows = await client.$queryRaw<Array<{ v: string | null }>>`
        SELECT (content::jsonb)->>'derivationContainment' AS v FROM agent_artifacts
        WHERE name = 'result.json' AND content LIKE '{%'
          AND "executionId" = ${executionId}
        ORDER BY "createdAt" DESC LIMIT 1`;
      break;
    // WARNINGS-INVISIBLE (2026-10-08): the leg-synthesize `reviewerWarnings` net reads each leg reviewer's STAMPED
    // verdict (never re-parses its prose) from the execution the chainer would hand on — same rule, one more literal.
    case 'reviewerVerdict':
      rows = await client.$queryRaw<Array<{ v: string | null }>>`
        SELECT (content::jsonb)->>'reviewerVerdict' AS v FROM agent_artifacts
        WHERE name = 'result.json' AND content LIKE '{%'
          AND "executionId" = ${executionId}
        ORDER BY "createdAt" DESC LIMIT 1`;
      break;
    // …and its PROGRAM arm reads each child LEG's stamped leg fact. A PIPELINE leg writes pipeline-index.json, never
    // result.json (CC2); the selection is still the chainer's, so the program report lists exactly what Node C chains.
    case 'reviewerWarnings':
      rows = await client.$queryRaw<Array<{ v: string | null }>>`
        SELECT (content::jsonb)->>'reviewerWarnings' AS v FROM agent_artifacts
        WHERE name = 'pipeline-index.json' AND content LIKE '{%'
          AND "executionId" = ${executionId}
        ORDER BY "createdAt" DESC LIMIT 1`;
      break;
    // VERBATIM-QUOTE-OMISSION (2026-10-13): the Harvester's RAW tool results — the witness `rollbackContainment` (E1)
    // and `quoteFidelity`'s Author point compare against. Its jsonb rendering re-orders object keys; both readers walk
    // string VALUES only, so the order is immaterial to them (and never stamped).
    case 'toolCalls':
      rows = await client.$queryRaw<Array<{ v: string | null }>>`
        SELECT (content::jsonb)->>'toolCalls' AS v FROM agent_artifacts
        WHERE name = 'result.json' AND content LIKE '{%'
          AND "executionId" = ${executionId}
        ORDER BY "createdAt" DESC LIMIT 1`;
      break;
    // PLATFORM-HELD-BYTES Stage B V-5f / V-9 (2026-10-15): the variant leg's Author edit stamp and its Reviewer's
    // reviewed-diff stamp — read from the execution the chainer hands on, so the hoist, V-6 and the carrier judge the
    // SAME Author and Reviewer the leg's agents saw. One more literal each.
    case 'editApplication':
      rows = await client.$queryRaw<Array<{ v: string | null }>>`
        SELECT (content::jsonb)->>'editApplication' AS v FROM agent_artifacts
        WHERE name = 'result.json' AND content LIKE '{%'
          AND "executionId" = ${executionId}
        ORDER BY "createdAt" DESC LIMIT 1`;
      break;
    case 'reviewedEditDiff':
      rows = await client.$queryRaw<Array<{ v: string | null }>>`
        SELECT (content::jsonb)->>'reviewedEditDiff' AS v FROM agent_artifacts
        WHERE name = 'result.json' AND content LIKE '{%'
          AND "executionId" = ${executionId}
        ORDER BY "createdAt" DESC LIMIT 1`;
      break;
    // held-k8s step 3 (G-4): the Harvester's held-bytes stamp — the carrier needs only the authoritative execution id it rides on.
    case 'heldBytes':
      rows = await client.$queryRaw<Array<{ v: string | null }>>`
        SELECT (content::jsonb)->>'heldBytes' AS v FROM agent_artifacts
        WHERE name = 'result.json' AND content LIKE '{%'
          AND "executionId" = ${executionId}
        ORDER BY "createdAt" DESC LIMIT 1`;
      break;
    // held-network step 3 batch 2b (P5): the network Harvester's Git-file vs device comparison, TRANSCRIBED (never recomputed) at
    // the Author's persist so the chainer carries it to the leg Reviewer — read from the execution the chainer hands on.
    case 'gitDeviceComparison':
      rows = await client.$queryRaw<Array<{ v: string | null }>>`
        SELECT (content::jsonb)->>'gitDeviceComparison' AS v FROM agent_artifacts
        WHERE name = 'result.json' AND content LIKE '{%'
          AND "executionId" = ${executionId}
        ORDER BY "createdAt" DESC LIMIT 1`;
      break;
    // Config-sources network push 1a: the network Harvester's live-evidence fact — TRANSCRIBED at the Author's persist (the
    // Reviewer chains the Author only) and HOISTED at the leg's SYNTHESIZE, both from the execution the chainer hands on.
    case 'liveEvidence':
      rows = await client.$queryRaw<Array<{ v: string | null }>>`
        SELECT (content::jsonb)->>'liveEvidence' AS v FROM agent_artifacts
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
