#!/usr/bin/env python3
"""
VT-13 injection watcher — simulate the Run 15 author error, let the platform detect it genuinely.

WHAT IT DOES
  Polls for the network leg's AUTHOR artifact (the one carrying a `## Derived Values` block with a
  /31 aggregate). Waits until EVERY task in that artifact's stage is COMPLETED — i.e. the leg's own
  REVIEWER has already approved the GOOD package — then widens the aggregate by one bit in the
  artifact only.

WHY THAT TIMING (this is the whole design)
  VT-13 observable 4: a `programReleasable: false` produced by a red `qualityGate.outcome` or a
  rejected Node C verdict does NOT satisfy the VT — the derivation conjunct must be visibly
  load-bearing. So the leg must still report APPROVED while containment flags it. Editing BEFORE the
  reviewer runs would let the reviewer catch the widening, the leg would go red, and the program
  would block for the wrong reason. Editing after it approves reproduces the Run 15 shape exactly:
  five tiers green, one mechanical class dissenting.

  P1's SYNTHESIZE runs the containment enrichment over this artifact at the END of its execution, so
  the edit lands well before it is read.

WHAT IS AND IS NOT FAKED
  Faked: the author's output (one CIDR string) — i.e. the mistake a human/agent could make.
  Real:  the parse, the arithmetic, the violation class, the lean card, the gate, and Node C.

FAIL-SAFE: if it never fires, the run proceeds clean and simply produces another Branch B result.
"""
import json, os, re, subprocess, sys, time

DB = os.environ["DATABASE_URL"]
DEADLINE = time.time() + 3 * 3600  # gates are human-paced


def q(sql, multiline=False):
    """RUN-18 BUG, fixed: the original split stdout on newlines to get rows. Artifact CONTENT is
    itself multi-line, so a content column arrived as one line fragment and every regex over it
    matched nothing. The watcher then died on m.group(0) — loudly, by luck. `multiline=True`
    returns the raw payload untouched for single-column, single-row content reads."""
    r = subprocess.run(["psql", DB, "-t", "-A", "-F", "\x1f", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print("SQL ERROR:", r.stderr.strip()[:300], flush=True)
        return "" if multiline else []
    if multiline:
        return r.stdout
    return [ln.split("\x1f") for ln in r.stdout.strip().split("\n") if ln.strip()]


def widen(cidr):
    """X/31 -> the enclosing /30 (one bit looser). Members are left untouched, so the declared
    aggregate becomes strictly looser than the minimal cover of its own members."""
    ip, pfx = cidr.split("/")
    pfx = int(pfx)
    if pfx <= 24:
        return None
    o = [int(x) for x in ip.split(".")]
    v = (o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]
    newp = pfx - 1
    v &= (0xFFFFFFFF << (32 - newp)) & 0xFFFFFFFF
    return f"{(v>>24)&255}.{(v>>16)&255}.{(v>>8)&255}.{v&255}/{newp}"


print(f"[vt13] armed {time.strftime('%H:%M:%S')} — waiting for the network leg's AUTHOR artifact",
      flush=True)

while time.time() < DEADLINE:
    rows = q("""
        SELECT a.id, e."taskId", t.stage_id
        FROM agent_artifacts a
        JOIN agent_executions e ON e.id = a."executionId"
        JOIN tasks t ON t.id = e."taskId"
        WHERE a.content LIKE '%## Derived Values%'
          AND a.content ~ '10\\.99\\.0\\.[0-9]+/31'
          AND a."createdAt" > now() - interval '4 hours'
        ORDER BY a."createdAt" DESC LIMIT 1;""")
    if rows:
        aid, task_id, stage_id = rows[0][0], rows[0][1], rows[0][2]
        content = q(f"SELECT content FROM agent_artifacts WHERE id = '{aid}';", multiline=True)
        # Gate on the reviewer having finished: every task in this stage terminal.
        st = q(f"SELECT count(*) FILTER (WHERE status <> 'COMPLETED'), count(*) "
               f"FROM tasks WHERE stage_id = '{stage_id}';")
        if st and st[0][0] == "0":
            m = re.search(r"10\.99\.0\.\d+/31", content)
            if not m:
                print(f"[vt13] artifact {aid} has no /31 in content ({len(content)} chars) — "
                      f"NOT injecting; this is the Run-18 failure mode, investigate rather than retry",
                      flush=True)
                sys.exit(2)
            orig = m.group(0)
            new = widen(orig)
            print(f"[vt13] leg complete + reviewer approved. aggregate {orig} -> {new}", flush=True)
            esc = new.replace("'", "''")
            upd = q(f"""UPDATE agent_artifacts
                        SET content = replace(content, '{orig}', '{esc}')
                        WHERE id = '{aid}' RETURNING id;""")
            print(f"[vt13] INJECTED into artifact {aid} (task {task_id}); rows={len(upd)}", flush=True)
            print(f"[vt13] expect P1 SYNTHESIZE to stamp a violation for {new} "
                  f"(prefix-not-minimal, and covered-not-member if the widening swallows a "
                  f"pre-existing allocation)", flush=True)
            sys.exit(0)
        else:
            print(f"[vt13] author artifact seen; leg not finished yet "
                  f"({st[0][0]} of {st[0][1]} tasks still open)", flush=True)
    time.sleep(3)

print("[vt13] DEADLINE reached without injecting — run proceeds clean (Branch B)", flush=True)
