/**
 * program-protocol.ts — protocol IDENTITY resolution + program-TIER membership.
 *
 * ONE definition, two consumers (F12 prepare-task-for-execution, F10 complete-task-terminally),
 * plus the execute-time stamp writer. Since WS2 Phase A (2026-08-17) the module answers TWO
 * distinct questions the pre-stamp code fused (WS2 Phase A panel, QA1 — 5/5):
 *
 *   IDENTITY — which protocol is this task bound to?  → DATA: `task.metadata.protocol`, the
 *     CANONICAL library-row name (long form, `pov-program-protocol`), resolved ONCE from the
 *     title token at the execute-time chokepoint and stamped write-if-absent, paired with
 *     `metadata.protocolResolvedAt`. Growing sets of program AND leg protocols need zero code
 *     change here — every resolvable token is stamped, leg names included (foreclosure FC1).
 *   TIER — is that protocol a PROGRAM protocol (F12 contract belt + F10 programConfidence)?
 *     → CODE: `PROGRAM_PROTOCOL_NAMES`, evaluated at READ time against the stamped name. A
 *     library-row flag was rejected on evidence (deploy re-seed clobbers it, GUI-droppable =
 *     fails OPEN, no prompt-library freshness detector exists, and the live `research-program`
 *     row is DB-ONLY with no durable source). Read-time evaluation keeps the
 *     register-early-while-DRAFT pattern retroactive: registering a name covers already-stamped
 *     tasks the moment the name lands.
 *
 * ⚠️ NO LIBRARY I/O IN THIS MODULE, EVER (foreclosure FC3). Tier membership and stamp resolution
 * must work with the `agent_prompt_library` row DRAFT or entirely absent — the §6b
 * author-in-DRAFT lifecycle and the DB-only research-program row depend on it, and I/O in a
 * guard predicate adds a fail-open failure mode the pure name-set cannot have.
 *
 * HISTORY, kept because every clause carries its incident:
 *   - Before 2026-08-08 each consumer carried its own inline substring test with NO CLOSING
 *     PAREN — a prefix match failing BOTH directions: fails-CLOSED (`(protocol: student-program)`
 *     silently lost F12+F10) and fails-OPEN (`(protocol: pov-program-lite)` silently INHERITED
 *     them — a programConfidence stamped on a non-confidence-bearing protocol is a wrong verdict
 *     presented as an engine-computed fact, Protocol 10). Anchoring fixed the collision
 *     (`a947df55`); it could not fix the channel.
 *   - Before WS2 Phase A the discriminator READ the user-editable title at guard time, so a
 *     harness holding `task.update` could rename its own task and disable its own F12/F10 —
 *     no error, no log (the 2026-08-08 MEDIUM finding). THE STAMP RETIRES THAT: the title is a
 *     CREATE-TIME INPUT consumed once at first execution; renaming afterwards moves nothing
 *     (a title/stamp disagreement warns), and a task-path write to `metadata.protocol` returns
 *     400 `PROTOCOL_STAMP_IMMUTABLE`. Before first execution the title is still an unconsumed
 *     input — editing it IS the legitimate re-route channel; after, delete-and-recreate (or the
 *     admin backfill script, which is also the protocol-rename recovery path).
 *
 * TRANSITIONAL TITLE DISJUNCT (remove-by-gate, never quietly): tasks created before Phase A have
 * no stamp, and an in-flight program's parent may never re-execute to receive one — so both
 * consumers currently read `stamp OR title`. The disjunct may be removed ONLY after a recorded,
 * verified backfill (scripts/backfill-protocol-stamps.ts); `test-program-protocol-token.ts`
 * carries a gate pin that fails if the disjunct disappears without that record. The residual
 * fails-OPEN direction while it exists (retitling a non-program pipeline INTO a program token)
 * is the same pre-stamp exposure, no worse.
 *
 * Adding a program protocol: add its SHORT name here AND (eventually) seed the protocol. Seeding
 * is NOT a precondition for registration — `research-program` was registered 2026-08-08 while its
 * row was DRAFT and deliberately absent from the seed (register EARLY: cheap to register, silent
 * to forget). A warn-only reconciliation check (health-run) reports `domain:program`-tagged rows
 * missing from this list.
 */

/**
 * SHORT names of protocols whose PIPELINE task is a PROGRAM harness (a pipeline of pipelines).
 * Program harnesses get the F12 structural contract belt and the F10 programConfidence stamp;
 * leg harnesses correctly get neither. Compared CANONICALLY (see canonicalProtocolName), so both
 * short and long forms test true.
 */
export const PROGRAM_PROTOCOL_NAMES: readonly string[] = [
  'pov-program',
  // Registered 2026-08-08 while its protocol row is still DRAFT (not injected) and DB-only
  // (removed from the seed during authoring). Deliberate: registering only once it goes live
  // would mean every run before that had NO F12 contract belt and NO F10 programConfidence
  // stamp, silently. Read-time tier evaluation makes early registration RETROACTIVE over
  // already-stamped tasks — the whole point of registering early.
  'research-program',
];

/** Kebab-case protocol-name grammar (matches every library row name and the token grammar). */
const PROTOCOL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Canonical (library-row, long-form) protocol name. Pure SUFFIX rule — deliberately NO library
 * lookup (FC3): `pov-program` → `pov-program-protocol`; an already-suffixed name passes through.
 * The stamp always carries this form (foreclosure FC2 — a short-form stamp would make Phase C's
 * `findFirst({ name })` miss and throw NAMED_PROTOCOL_NOT_FOUND on correctly-configured tasks).
 * Canonical↔seed parity is pinned as source-text (test-program-protocol-token.ts), not runtime.
 */
export function canonicalProtocolName(name: string): string {
  return name.endsWith('-protocol') ? name : `${name}-protocol`;
}

/** The canonical, ANCHORED title token for a SHORT protocol name — closing paren included. */
export function programProtocolToken(name: string): string {
  return `(protocol: ${name})`;
}

/** Every anchored token that marks a program harness (TRANSITIONAL title-disjunct consumers). */
export function programProtocolTokens(): string[] {
  return PROGRAM_PROTOCOL_NAMES.map(programProtocolToken);
}

/** Anchored token extractor: strict `(protocol: <kebab>)` — same grammar the tokens emit. */
const TOKEN_RE = /\(protocol: ([a-z0-9]+(?:-[a-z0-9]+)*)\)/g;

export interface ProtocolStampResolution {
  /** Canonical (long-form) protocol name, or null when the title carries no valid token. */
  protocol: string | null;
  /** How many valid tokens the title carried (>1 ⇒ first-wins; the stamp site warns). */
  tokenCount: number;
}

/**
 * Resolve a title to its protocol stamp. PURE — text in, fact out. First token wins.
 * A malformed token (unterminated, non-kebab, wrong spacing) is not a token — the anchoring
 * lesson, now at resolution time: `(protocol: pov-program` (unterminated) resolves to null,
 * and `pov-program-lite` resolves to ITSELF (canonicalized), never to `pov-program`.
 */
export function resolveProtocolStamp(title: string | null | undefined): ProtocolStampResolution {
  if (!title) return { protocol: null, tokenCount: 0 };
  const matches = [...title.matchAll(TOKEN_RE)];
  if (matches.length === 0) return { protocol: null, tokenCount: 0 };
  return { protocol: canonicalProtocolName(matches[0][1]), tokenCount: matches.length };
}

/**
 * TIER predicate: is this (stamped) protocol name a PROGRAM protocol?
 * Accepts short or long form; null/undefined/'' are not programs. NO I/O — a DRAFT or absent
 * library row must not change the answer (pinned).
 */
export function isProgramProtocol(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string' || !PROTOCOL_NAME_RE.test(name)) return false;
  const canonical = canonicalProtocolName(name);
  return PROGRAM_PROTOCOL_NAMES.some((n) => canonicalProtocolName(n) === canonical);
}

/**
 * Does this task title mark a PROGRAM harness? TRANSITIONAL — the title half of the
 * stamp-OR-title disjunct (see the header). Anchored on both sides by construction.
 */
export function isProgramProtocolTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return programProtocolTokens().some((token) => title.includes(token));
}

/** How a task's protocol identity was resolved (feeds the injection ladder + the stampSource fact). */
export type TaskProtocolSource = 'stamp' | 'title-fallback' | 'none';

export interface TaskProtocolResolution {
  /** Canonical (long-form) protocol name, or null (stamped-null OR unresolvable). */
  protocol: string | null;
  /**
   * 'stamp'          — metadata.protocol key present (value may be null: resolution ran, no token);
   * 'title-fallback' — key ABSENT, title token resolved (re-runs the stamp writer's pure function,
   *                    so a stale pre-stamp snapshot converges with the DB by construction — the
   *                    WS1 Phase C F1 fix: the stream injects from a route-edge task fetch taken
   *                    BEFORE createAgentExecution writes the stamp);
   * 'none'           — key absent AND no title token.
   */
  source: TaskProtocolSource;
}

/**
 * THE ladder head: resolve a task's protocol identity. Stamp wins whenever the KEY is present
 * (including `protocol: null` — resolution ran and found no token; it does NOT fall through to
 * the title, the R1 closure). Title-fallback ONLY when the key is absent — the ONE place the
 * transitional disjunct lives for in-memory consumers (F10 + Phase C injection), so its removal
 * stays a single edit behind the backfill gate. Covers the never-stamp paths too
 * (SCHEDULED / skipChaining executions that bypass the stamp writer).
 */
export function resolveTaskProtocol(task: {
  title?: string | null;
  metadata?: unknown;
}): TaskProtocolResolution {
  const meta = (task.metadata ?? null) as Record<string, unknown> | null;
  if (meta && 'protocol' in meta) {
    const stamped = typeof meta.protocol === 'string' && PROTOCOL_NAME_RE.test(meta.protocol)
      ? canonicalProtocolName(meta.protocol)
      : null;
    return { protocol: stamped, source: 'stamp' };
  }
  // TRANSITIONAL: unstamped (pre-Phase-A / never-stamp-path) tasks fall back to the title token.
  const { protocol } = resolveProtocolStamp(task.title);
  return protocol !== null
    ? { protocol, source: 'title-fallback' }
    : { protocol: null, source: 'none' };
}

/**
 * THE F10 predicate: is this task a program harness? Thin wrapper over resolveTaskProtocol —
 * ONE ladder shared with the Phase C injection path, so stamp-authority and the transitional
 * title-fallback cannot drift between consumers (a post-stamp rename must not move the guard).
 */
export function isProgramHarnessTask(task: {
  title?: string | null;
  metadata?: unknown;
}): boolean {
  return isProgramProtocol(resolveTaskProtocol(task).protocol);
}

/**
 * THE F12 query fragment: Prisma filter matching a PROGRAM-harness parent row. Stamp-equals
 * disjuncts first (Prisma has NO `in` for JSON paths — an OR of `equals` is the only shape),
 * then the TRANSITIONAL title-contains disjuncts. The call site MUST compose this under
 * `AND: [...]` with its other `metadata` path filter — two `metadata` keys in one object
 * literal is last-writer-wins and silently matches the wrong harness (pinned).
 */
export function programHarnessProtocolFilter(): { OR: Array<Record<string, unknown>> } {
  return {
    OR: [
      ...PROGRAM_PROTOCOL_NAMES.map((n) => ({
        metadata: { path: ['protocol'], equals: canonicalProtocolName(n) },
      })),
      // TRANSITIONAL title disjunct — remove with the gate (see header).
      ...programProtocolTokens().map((token) => ({ title: { contains: token } })),
    ],
  };
}
