/**
 * MCP service seed guards (PLATFORM-HELD-BYTES Stage B push 1, P1-5; hub v3 N-b, 2026-10-14).
 *
 * The gateway now resolves a `targetService` by ID FIRST, then by name (service-call-handler, workflow-tools-handler,
 * service-caller). An id that equals ANOTHER row's name would therefore shadow that row for every caller who names it.
 * Registration refuses such names (registration handler); these guards close the same gap from the seed side:
 *
 *   assertSlugIdFree      before an upsert-by-id seed CREATES its row: refuse when another row already carries that
 *                         slug as its NAME (the new row's id would shadow it). An existing row with that id is the
 *                         update arm and passes.
 *   assertByNameSeedOwnsRow  before a by-name UPDATE seed (findFirst({name}) → update({id})) writes: refuse when the
 *                         row holding that name is not the seed's own (id ≠ the seed's canonical id), so a seed cannot
 *                         overwrite a same-named row someone else registered. The self-match (name = its own id)
 *                         passes, so the seed's own re-seed still works.
 *
 * Scope (plan P1-5): the by-name guard is wired into seed-cloudflare-service.ts and (2026-10-18) seed-github-service.ts —
 * both platform rows carry their canonical id. The other four by-name seeds
 * (weather, eia, eodhd, token-validator) state in their headers that their PRODUCTION row carries an auto-CUID id, so
 * this rule would refuse their own re-seed; they are left unguarded and recorded (STAGE-B-PUSH1-BUILD.md).
 * Defence in depth under id-first resolution, not a uniqueness guarantee.
 */

type FindFirst = (args: { where: Record<string, unknown>; select: { id: true; name: true } }) => Promise<{ id: string; name: string } | null>;
export interface SeedGuardDb { mCPTool: { findFirst: FindFirst } }

/** Refuse to create a row with id `slugId` when another row is NAMED `slugId`. Resolves when safe. */
export async function assertSlugIdFree(db: SeedGuardDb, slugId: string): Promise<void> {
  const own = await db.mCPTool.findFirst({ where: { id: slugId }, select: { id: true, name: true } });
  if (own) return; // the upsert's update arm: the row already exists under this id
  const named = await db.mCPTool.findFirst({ where: { name: slugId }, select: { id: true, name: true } });
  if (named && named.id !== slugId) {
    throw new Error(`seed refused: a service named '${slugId}' already exists (id ${named.id}); creating a row with id '${slugId}' would shadow it under id-first resolution. Rename or remove that service first.`);
  }
}

/** Refuse a by-name update when the row holding `serviceName` is not the seed's own row (id === serviceName). */
export function assertByNameSeedOwnsRow(existing: { id: string; name: string } | null, serviceName: string): void {
  if (existing && existing.id !== serviceName) {
    throw new Error(`seed refused: the service named '${serviceName}' has id ${existing.id}, not the canonical '${serviceName}' — it was not created by this seed, so updating it would overwrite someone else's registration. Resolve it by hand.`);
  }
}
