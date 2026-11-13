/**
 * Database liveness for a long-running process (HUB-DEAF-TO-DATABASE, 2026-11-13).
 *
 * WHY. On a fresh self-host's first program the hub's Prisma engine was left permanently unusable ("Response from the Engine was
 * empty", then "Engine is not yet connected" on every call) while the process stayed alive: `systemctl is-active` said active,
 * `/health` said 200, the run sat IN_PROGRESS forever, and ten minutes later the client was told to "sign in again". The cause of
 * THAT instance is fixed (a helper disconnected the shared client — `test:shared-prisma-disconnect`). This module is the safety net
 * for any OTHER cause of the same state.
 *
 * MEASURED before it was designed: a stuck client cannot be healed in place — `$connect()` resolves and queries still fail,
 * `$disconnect()` throws. Only a new process recovers. So:
 *   - the engine being gone (`engine-dead`) for `engineDeadExitAfter` consecutive probes ⇒ log fatal and EXIT, so the supervisor
 *     (systemd on a self-host, pm2 on the hosted service) starts a healthy process;
 *   - the database being unreachable (`unreachable` — PostgreSQL restarting, a network fault) NEVER exits: the pool reconnects by
 *     itself when the database returns, and surviving a PostgreSQL restart is a verified property (VERIFYING-SELF-HOST,
 *     Supervision). It is reported, not acted on.
 * Facts, not verdicts (Protocol 10): the state says what the last probes observed; `/health` reports it.
 *
 * Kill switch: `DATABASE_LIVENESS_EXIT=false` keeps the probe and the report and never exits.
 */

export type DatabaseFailureKind = 'engine-dead' | 'unreachable';
export type DatabaseLivenessStateName = 'unknown' | 'ok' | DatabaseFailureKind;

export interface DatabaseLivenessState {
  /** `unknown` until the first probe returns. */
  state: DatabaseLivenessStateName;
  lastCheckedAt: string | null;
  lastOkAt: string | null;
  consecutiveFailures: number;
}

const ENGINE_DEAD = /Engine is not yet connected|Response from the Engine was empty/i;
const UNREACHABLE = /Can't reach database server|ECONNREFUSED|ECONNRESET|ETIMEDOUT|Connection terminated|the database system is (starting up|shutting down)|Timed out fetching a new connection/i;
const UNREACHABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

/**
 * What kind of database failure an error is, or null when it is not one (a validation error, a missing row, a bad token …).
 * Walks `cause`, because callers wrap. Keyed on the engine's own message text: Prisma gives these two failures no error code.
 */
export function classifyDatabaseError(err: unknown): DatabaseFailureKind | null {
  for (let e: unknown = err, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    if (typeof e !== 'object') continue;
    const o = e as { name?: unknown; code?: unknown; message?: unknown; constructor?: { name?: unknown } };
    const name = String(o.name ?? o.constructor?.name ?? '');
    const message = typeof o.message === 'string' ? o.message : '';
    if (name === 'PrismaClientRustPanicError' || ENGINE_DEAD.test(message)) return 'engine-dead';
    if (name === 'PrismaClientInitializationError' || (typeof o.code === 'string' && UNREACHABLE_CODES.has(o.code)) || UNREACHABLE.test(message)) return 'unreachable';
  }
  return null;
}

let current: DatabaseLivenessState = { state: 'unknown', lastCheckedAt: null, lastOkAt: null, consecutiveFailures: 0 };
let timer: ReturnType<typeof setInterval> | null = null;
let exiting = false;

export function getDatabaseLiveness(): DatabaseLivenessState {
  return { ...current };
}

/** True once a probe has FAILED and none has succeeded since. `unknown` (no probe yet) is not down. */
export function isDatabaseDown(): boolean {
  return current.state === 'engine-dead' || current.state === 'unreachable';
}

interface Log { warn: (o: object, m: string) => void; fatal: (o: object, m: string) => void; info: (o: object, m: string) => void }

export interface DatabaseLivenessOptions {
  /** One cheap query on the process's shared client, e.g. () => prisma.$queryRaw`SELECT 1`. */
  probe: () => Promise<unknown>;
  logger: Log;
  intervalMs?: number;
  timeoutMs?: number;
  /** Consecutive `engine-dead` probes before the process exits. */
  engineDeadExitAfter?: number;
  /** What "exit" does. Default: process.exit(1). Injected in tests. */
  onFatal?: (state: DatabaseLivenessState) => void;
  now?: () => Date;
}

/** One probe. Exported for tests; the timer calls it. Never throws. */
export async function probeDatabaseOnce(opts: DatabaseLivenessOptions): Promise<DatabaseLivenessState> {
  const now = (opts.now ?? (() => new Date()))().toISOString();
  const timeoutMs = opts.timeoutMs ?? 5_000;
  let handle: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      opts.probe(),
      new Promise((_, reject) => { handle = setTimeout(() => reject(new Error(`ETIMEDOUT: database probe exceeded ${timeoutMs} ms`)), timeoutMs); }),
    ]);
    if (current.state !== 'ok' && current.state !== 'unknown') opts.logger.info({ was: current.state, failures: current.consecutiveFailures }, 'database reachable again');
    current = { state: 'ok', lastCheckedAt: now, lastOkAt: now, consecutiveFailures: 0 };
  } catch (err) {
    // An error the classifier does not recognise is still a failed probe: report it as unreachable (never an exit).
    const kind: DatabaseFailureKind = classifyDatabaseError(err) ?? 'unreachable';
    const failures = current.state === kind ? current.consecutiveFailures + 1 : 1;
    current = { state: kind, lastCheckedAt: now, lastOkAt: current.lastOkAt, consecutiveFailures: failures };
    opts.logger.warn({ kind, consecutiveFailures: failures, lastOkAt: current.lastOkAt, err: err instanceof Error ? err.message.split('\n').filter((l) => l.trim() && !l.startsWith('Backtrace') && !l.startsWith('Invalid `')).pop() ?? err.message.slice(0, 200) : String(err) }, 'database probe failed');
    const exitAfter = opts.engineDeadExitAfter ?? 2;
    if (kind === 'engine-dead' && failures >= exitAfter && !exiting) {
      if (process.env.DATABASE_LIVENESS_EXIT === 'false') {
        opts.logger.fatal({ ...current }, 'the database engine in this process is gone and cannot be recovered in place — DATABASE_LIVENESS_EXIT=false, so NOT exiting; restart this process');
      } else {
        exiting = true;
        opts.logger.fatal({ ...current }, 'the database engine in this process is gone and cannot be recovered in place — exiting so the supervisor starts a healthy process (runs in flight in this process stop)');
        (opts.onFatal ?? (() => process.exit(1)))({ ...current });
      }
    }
  } finally {
    if (handle) clearTimeout(handle);
  }
  return { ...current };
}

/** Start probing. Idempotent: a second call replaces the first timer. The timer never keeps the process alive. */
export function startDatabaseLiveness(opts: DatabaseLivenessOptions): void {
  stopDatabaseLiveness();
  const intervalMs = opts.intervalMs ?? 15_000;
  void probeDatabaseOnce(opts);
  timer = setInterval(() => { void probeDatabaseOnce(opts); }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
}

/** Stop probing (graceful shutdown disconnects the client; a probe after that would read as a failure). */
export function stopDatabaseLiveness(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Tests only. */
export function __resetDatabaseLivenessForTests(): void {
  stopDatabaseLiveness();
  current = { state: 'unknown', lastCheckedAt: null, lastOkAt: null, consecutiveFailures: 0 };
  exiting = false;
}
