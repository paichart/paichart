/**
 * replay-report-preload.js — give a replay runner a STDOUT-FREE report (register REPLAY-STDOUT-INTERLEAVE, 2026-10-15).
 *
 *   REPLAY_REPORT=<file> npx ts-node -r <abs path>/scripts/replay-report-preload.js scripts/replay-nets.ts <ids…>
 *
 * Every console.log in the process is re-pointed to a synchronous append to $REPLAY_REPORT; stdout keeps the pino logs.
 * pino and console.log are two writers on fd 1, and node splits a long line across pipe writes, so a log line can land in
 * the MIDDLE of a report line — a `grep -v '"level"'` filter then deletes the whole glued line (measured 2026-10-15: half a
 * §6 table row vanished from one of two identical replays). A line lost on BOTH passes is invisible, so the check would
 * audit less than it reports.
 *
 * The same mechanism as `replay-held-variant.ts --report`. It is a PRELOAD rather than a runner flag so that the BASE pass of
 * a byte-identity replay gets it too: the base worktree runs its OWN, older replay-nets.ts, which has no flag. Load it by
 * absolute path from the NEW tree. Unset REPLAY_REPORT ⇒ a no-op (console.log unchanged).
 */
'use strict';
const file = process.env.REPLAY_REPORT;
if (file) {
  const fs = require('fs');
  const util = require('util');
  const fd = fs.openSync(file, 'a');
  console.log = (...a) => { fs.writeSync(fd, util.format(...a) + '\n'); };
}
