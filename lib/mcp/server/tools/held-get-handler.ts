/**
 * PLATFORM-HELD-BYTES Stage B V-7 — `project({ action: 'held.get' })`: an OPERATOR reads a held file's bytes (plan
 * STAGE-B-PLAN.md v4.1 §3 V-7; owner decision D-B: one gated MCP read action, owner/team/admin, an Activity row with no hash,
 * body-only). The ONE place a held blob leaves the platform as text.
 *
 * PRINCIPAL FIRST (tree-verified 2026-10-15):
 *   - transport 'http' (the dispatcher built by mcp-core): allowed iff `context.user.authMethod` is a non-empty string — set on
 *     every authenticated HTTP user by populateReqUser. The HTTP process's GLOBAL fallback context carries `authMethod` at the
 *     TOP level, never on `user`, so it can never satisfy this (pinned); a session user rehydrated WITHOUT authMethod is REFUSED
 *     (A21 — never default authMethod to make it pass).
 *   - transport 'stdio' (a dispatcher built by the stdio entry point): the local single-operator trust model (stated in Stage C's
 *     self-host text) — the user is the configured one.
 *   - transport 'embedded' (the in-process agent tool server) and any context naming a `callingExecutionId`: REFUSED,
 *     `HELD_GET_REFUSED_AGENT_CALLER`. Agents also never SEE the action (stripped from their tool definitions, serverManager).
 *   DEMO users and demo POVs are refused.
 * Access: the POV is taken from the REF ROW (never from a parameter), then `validatePOVAccess`; a missing ref and a denied one
 * answer the SAME `not-found`. The Activity row is written BEFORE any content (an insert failure refuses); its metadata is
 * `{ povId, executionId, refId, kind, redactorVersion }` — never a hash, never content.
 * Response: JSON metadata (full blobSha256 — this is the operator's integrity check) + the VERBATIM text, after checking
 * sha256(utf8(text)) === blobSha256.
 */
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { HELD_REF_SELECT, readHeldBlobText } from '@/lib/services/held-bytes-store';
import { harvesterHandles } from '@/lib/agents/harness/held-chain';
import { EDIT_APPLICATION_MANIFEST_NAME } from '@/lib/agents/harness/held-bytes/edit-manifest';
import { countPlaceholders } from '@/lib/agents/harness/held-bytes/canonical-text';

export type HeldGetTransport = 'http' | 'stdio' | 'embedded';
export const HELD_GET_REFUSED_AGENT_CALLER = 'HELD_GET_REFUSED_AGENT_CALLER';

type Ctx = { user?: { id?: string; userId?: string; role?: string; authMethod?: unknown } | null; callingExecutionId?: unknown } | null | undefined;
const err = (text: string) => ({ content: [{ type: 'text', text }], isError: true });
const NOT_FOUND = () => err('❌ held.get: not-found');

/** The principal rule, exported for its pin. Returns a refusal reason, or null when the caller may proceed. */
export function heldGetPrincipalRefusal(context: Ctx, transport: HeldGetTransport): string | null {
  if (transport === 'embedded') return HELD_GET_REFUSED_AGENT_CALLER;
  if (context && typeof context === 'object' && (context as { callingExecutionId?: unknown }).callingExecutionId) return HELD_GET_REFUSED_AGENT_CALLER;
  const user = context?.user;
  if (!user || typeof user !== 'object') return 'HELD_GET_REFUSED_UNAUTHENTICATED';
  if (transport === 'http' && !(typeof user.authMethod === 'string' && user.authMethod !== '')) return 'HELD_GET_REFUSED_UNAUTHENTICATED';
  if (user.role === 'DEMO_USER') return 'HELD_GET_REFUSED_DEMO';
  return null;
}

type Db = typeof prisma;

async function resolveRef(db: Db, p: { refId?: string; executionId?: string; handle?: string; kind?: string }) {
  if (p.refId) return db.heldFileRef.findUnique({ where: { id: p.refId }, select: HELD_REF_SELECT });
  if (p.kind === 'CAPTURE') {
    const refs = await db.heldFileRef.findMany({ where: { executionId: p.executionId as string, kind: 'CAPTURE' }, select: HELD_REF_SELECT });
    const refusals = await db.heldCaptureRefusal.findMany({ where: { executionId: p.executionId as string }, select: { toolCallIndex: true, selector: true, target: true, path: true } });
    // The SAME numbering the chain hands the Author (HUB-P2-4): one helper, so a handle can never name a different file here.
    const h = harvesterHandles(refs as never, refusals).find((x) => x.handle === p.handle);
    return h?.refId ? refs.find((r) => r.id === h.refId) ?? null : null;
  }
  const art = await db.agentArtifact.findFirst({ where: { executionId: p.executionId as string, name: EDIT_APPLICATION_MANIFEST_NAME }, select: { content: true }, orderBy: { createdAt: 'desc' } });
  if (!art) return null;
  let manifest: { files?: Array<{ handle: string; baseRefId?: string; candidateRefId?: string }> };
  try { manifest = JSON.parse(art.content); } catch { return null; }
  const rec = (manifest.files ?? []).find((f) => f.handle === p.handle);
  const id = p.kind === 'BASE' ? rec?.baseRefId : rec?.candidateRefId;
  return id ? db.heldFileRef.findUnique({ where: { id }, select: HELD_REF_SELECT }) : null;
}

export async function handleHeldGet(
  params: { refId?: string; executionId?: string; handle?: string; kind?: string },
  context: Ctx,
  opts: { transport: HeldGetTransport; db?: Db },
) {
  const refusal = heldGetPrincipalRefusal(context, opts.transport);
  if (refusal) return err(`❌ held.get refused: ${refusal}`);
  const db = opts.db ?? prisma;
  const user = context!.user!;
  const userId = String(user.userId ?? user.id ?? '');
  const ref = await resolveRef(db, params);
  if (!ref) return NOT_FOUND();
  const pov = await db.pOV.findUnique({ where: { id: ref.scope }, select: { id: true, ownerId: true, metadata: true, team: { select: { members: { select: { userId: true } } } } } });
  if (!pov) return NOT_FOUND();
  if ((pov.metadata as Record<string, unknown> | null)?.isDemo === true) return NOT_FOUND();
  const allowed = validatePOVAccess({ userId, role: user.role } as never, pov as never, { logContext: 'held.get' });
  if (!allowed) return NOT_FOUND();
  try {
    await db.activity.create({ data: { userId, action: 'held.get', type: 'held-bytes',
      metadata: { povId: pov.id, executionId: ref.executionId, refId: ref.id, kind: ref.kind, redactorVersion: ref.redactorVersion } } });
  } catch {
    return err('❌ held.get refused: the access record could not be written');
  }
  const text = await readHeldBlobText(db as never, ref.scope, ref.blobSha256);
  if (text === null) return NOT_FOUND();
  if (createHash('sha256').update(text, 'utf8').digest('hex') !== ref.blobSha256) return err('❌ held.get: stored bytes failed their integrity check');
  const placeholders = countPlaceholders(text);
  const meta = {
    kind: ref.kind, refId: ref.id, blobSha256: ref.blobSha256, redactorVersion: ref.redactorVersion, redactedCount: ref.redactedCount,
    lineCount: ref.lineCount, newline: ref.newline, bom: ref.bom, finalNewline: ref.finalNewline,
    mode: placeholders === 0 ? 'replace-file' : 'diff-only', applicable: placeholders === 0, untrustedConnectedOutput: true,
    // K-3: emitted only when non-null, so an observability ref's metadata stays byte-identical (SYNTHESIS v3 R9).
    ...(typeof ref.sourceRevision === 'string' ? { sourceRevision: ref.sourceRevision } : {}),
    // held-k8s step 3 (sec-ops step-1 SF-5): a Git ref also names WHAT it holds, so the operator's base check reads its repo and path
    // from the ref instead of typing them (a typed path could vouch for the wrong file). Git refs only — obs metadata unchanged.
    ...(typeof ref.sourceRevision === 'string' ? { target: ref.target, path: ref.path } : {}),
  };
  return { content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }, { type: 'text', text }] };
}
