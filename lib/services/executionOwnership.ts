/**
 * Execution ownership — who is actually running a RUNNING execution.
 *
 * WHY THIS EXISTS (2026-07-31, Run 17 incident):
 * The startup orphan cleanup used ROW AGE as a proxy for "is this execution abandoned?".
 * It is a bad proxy in both directions:
 *
 *   - Too slow: an execution killed 22 seconds after it started (pm2 bounce from
 *     `needrestart` after an openssl patch) was younger than the 2-minute guard, so startup
 *     skipped it. It then sat RUNNING until the periodic reaper's ~105-minute threshold,
 *     blocking its task the whole time — `agent.execute` refuses while one is active.
 *   - Too blunt if simply removed: pm2 runs TWO processes that both host the execution
 *     engine (`paichart-web` via server.ts → server-init.ts, `paichart-mcp` via
 *     mcp-server-http-clean.js). If only one restarts, a blanket "fail all RUNNING at
 *     startup" would reap the live sibling's in-flight work.
 *
 * Age cannot separate those cases because it is not a fact about the OWNER. So we record
 * the owner at claim time and ask the real question at startup: is that process still alive?
 *
 * The stamp lives in `agent_executions.context._owner` — no schema change, and rows claimed
 * by an older release simply have no stamp, which callers handle as `unknown` (fall back to
 * the age rule) rather than guessing.
 *
 * Fail-safe direction: when we cannot prove a process is dead, we do NOT reap. A missed
 * orphan lingers until the periodic reaper (recoverable, and no worse than the old
 * behaviour); a falsely-reaped live run destroys work in flight and writes a false terminal
 * fact that fires dependent reactors. Those costs are not symmetric.
 *
 * Follow-up: cline_docs/follow-ups/startup-cleanup-blind-window-2026-07-31.md
 */

import { readFileSync } from 'fs';
import { hostname } from 'os';

export interface ExecutionOwner {
  /** OS process id that claimed the execution. */
  pid: number;
  /** os.hostname() of the claiming process. */
  host: string;
  /** Linux boot id, or null off Linux. Distinguishes "same pid after a reboot". */
  bootId: string | null;
  /** Epoch ms at claim time. Used to disambiguate pid reuse. */
  claimedAt: number;
}

export interface ProcessIdentity {
  pid: number;
  host: string;
  bootId: string | null;
  /** Epoch ms at which THIS process started. */
  startedAtMs: number;
}

/**
 * 'orphaned'  — the owning process is provably gone; safe to reap.
 * 'alive'     — the owner is (or may be) a live process; must NOT reap.
 * 'unknown'   — no ownership stamp; caller decides (age fallback for pre-stamp rows).
 */
export type OwnerVerdict = 'orphaned' | 'alive' | 'unknown';

function readBootId(): string | null {
  try {
    // Shared with the host inside containers, which is what we want: it changes on reboot,
    // not on container restart, and a reboot is exactly the case pid liveness cannot see.
    return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() || null;
  } catch {
    return null; // non-Linux, or /proc not mounted
  }
}

const BOOT_ID = readBootId();

/** Identity of the current process. `startedAtMs` is derived from process uptime. */
export function currentProcessIdentity(): ProcessIdentity {
  return {
    pid: process.pid,
    host: hostname(),
    bootId: BOOT_ID,
    startedAtMs: Date.now() - Math.round(process.uptime() * 1000),
  };
}

/** The value stamped into `context._owner` when an execution is claimed. */
export function currentOwnerStamp(): ExecutionOwner {
  return { pid: process.pid, host: hostname(), bootId: BOOT_ID, claimedAt: Date.now() };
}

/** Narrow an untyped `context->'_owner'` payload to an ExecutionOwner, or null if unusable. */
export function parseOwner(raw: unknown): ExecutionOwner | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.pid !== 'number' || !Number.isInteger(o.pid) || o.pid <= 0) return null;
  if (typeof o.host !== 'string' || o.host.length === 0) return null;
  return {
    pid: o.pid,
    host: o.host,
    bootId: typeof o.bootId === 'string' && o.bootId.length > 0 ? o.bootId : null,
    claimedAt: typeof o.claimedAt === 'number' ? o.claimedAt : 0,
  };
}

/** Default liveness probe: signal 0 tests existence without delivering a signal. */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM = the process exists but belongs to another user. Alive, and not ours to judge.
    return (err as NodeJS.ErrnoException)?.code === 'EPERM';
  }
}

/**
 * Decide whether the owner of an execution is still running.
 *
 * Pure and injectable so the decision table is unit-testable without spawning processes.
 * Order matters — each rule below is the only one that can answer its case:
 */
export function classifyOwner(
  owner: ExecutionOwner | null,
  self: ProcessIdentity,
  pidAlive: (pid: number) => boolean = isPidAlive
): OwnerVerdict {
  // No stamp: claimed before this feature shipped, or by a path that does not stamp.
  if (!owner) return 'unknown';

  // Another machine owns it. We cannot probe its process table, and its liveness is none of
  // our business — a multi-host deployment must not have hosts reaping each other's work.
  if (owner.host !== self.host) return 'alive';

  // The machine rebooted since the claim: every pid from before the reboot is gone,
  // regardless of what the current process table says. pid liveness alone would be fooled
  // here by an unrelated process that happens to hold the same pid now.
  if (owner.bootId && self.bootId && owner.bootId !== self.bootId) return 'orphaned';

  // The stamp names OUR pid, but the claim predates our start — so it was written by a
  // previous process that held this pid before us (pm2 delete+recreate can reuse pids).
  // Without this, a reused pid looks alive forever and the row never gets reaped.
  if (owner.pid === self.pid && owner.claimedAt > 0 && owner.claimedAt < self.startedAtMs) {
    return 'orphaned';
  }

  return pidAlive(owner.pid) ? 'alive' : 'orphaned';
}
