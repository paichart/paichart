#!/usr/bin/env python3
"""
ASN injection watcher — exercise `asn-not-member` live, and VT-13's attribution, in one run.

WHAT IT DOES
  Polls for the network leg's `## Derived Values` block. Waits until EVERY task in that block's
  stage is COMPLETED — i.e. the leg's own REVIEWER has already approved the GOOD package — then adds
  ONE non-harvested ASN entry to the block.

WHY THAT TIMING (unchanged from the VT-13 design, and it is the whole point)
  VT-13 observable 4 excludes a `programReleasable:false` produced by a red `qualityGate.outcome` or
  a rejected Node C — the derivation conjunct must be visibly load-bearing. So the leg must still
  report APPROVED while containment dissents. Editing before the reviewer runs lets the reviewer
  catch it, the leg goes red, and the program blocks for the wrong reason — which is exactly the
  over-determination that stopped Run 18 counting.

WHAT IS AND IS NOT FAKED
  Faked: one entry in the author/design block — i.e. the mistake an agent could make, or the value an
         injected prompt could smuggle in.
  Real:  the parse, the membership arithmetic, the violation class, the lean card, the gate, Node C.

WHY 65100 SPECIFICALLY
  It must fire EXACTLY ONE class, or the observation cannot attribute (Register 06 Pattern 3).
    - not 65001/65002 → not in the harvest → `asn-not-member` FIRES (the provenance property)
    - inside 64512-65534 (RFC 6996 private) → `asn-reserved-range` does NOT fire
    - `public` is computed but deliberately never blocking
  So a single violation, of a single class, attributable to a single cause.

RUN-19 LESSON BAKED IN: the block may live on the DESIGN child, not the Author. This searches for
whichever child carries it — the same discipline the enrichment now uses.

FAIL-SAFE: if it cannot find the block or the entry, it exits NON-ZERO without touching anything. An
inert injection reported as a successful one is the worst available outcome for this test.

RUN-20 REFUSAL — ROOT-CAUSED AND FIXED (2026-08-02). Kept because the wrong diagnosis is instructive.
It armed, correctly waited for the reviewer, then refused with "could not locate the fenced array".
The same regex matched the same content offline, so the pattern was exonerated and the investigation
went looking for a READ difference — psql encoding, output wrapping, raw-mode framing. All wrong.

  Actual cause: it selected the wrong CHILD. It took the most recent artifact carrying the marker,
  and THREE children carry it (Design writes it, the Author carries it forward verbatim, the Reviewer
  quotes it) — and REVIEW COMPLETES LAST. It was reading the reviewer's prose mention, which
  genuinely has no fenced array. The refusal was correct; the selection was not.

  The offline check that "exonerated" the regex is what hid this: it was run against a hand-picked
  task id, so it tested the pattern on the RIGHT artifact while the watcher ran it on the WRONG one.
  A component test cannot clear a selection bug — it presupposes the selection.

  Fixed by mirroring derivation-containment-enrichment.ts:133-140: Author first, then the other
  children in protocol order, skipping the harvester. Anything else is inert by construction.

DRY-RUN VERIFIED 2026-08-02 against Run 20's banked artifacts (program cmsb7fn8i0003yxrgefvnylz4):
selected the AUTHOR child (task cmsb7r00x0049yxrgi58osm9q, role config_change_author — earlier notes
called this the Design child, wrongly), regex matched, parse and re-parse round-tripped 3 -> 4
entries with the injected ASN present. Run with `--dry-run` to repeat it; it issues no UPDATE.
"""
import json, os, re, subprocess, sys, time

DB = os.environ["DATABASE_URL"]
DEADLINE = time.time() + 3 * 3600
# SCOPE TO ONE PROGRAM. Without this the watcher matched the most recent Derived Values block
# anywhere in a 4-hour window and fired on a STALE artifact from the previous run — arming and
# exiting before the target run had even started (observed 2026-08-02).
args = [a for a in sys.argv[1:] if not a.startswith("--")]
# DRY RUN: one pass, every step EXCEPT the UPDATE, then print evidence and exit. The point is that
# the selection/regex/parse under test is the SHIPPING code path — a separate rehearsal script can
# drift from the real one, which is how an injector gets "verified" and still fires inert.
DRY = "--dry-run" in sys.argv
PROGRAM_TASK = args[0] if args else None
if not PROGRAM_TASK:
    print("usage: asn-inject.py <programRootTaskId> [--dry-run]", flush=True)
    sys.exit(2)
INJECT_ASN = "65100"          # see module docstring — chosen to fire exactly one class
INJECT_DEVICE = "ceos1"


def q(sql, raw=False):
    # ROWS ARE SEPARATED BY \x1e, NOT BY NEWLINE. Splitting rows on "\n" breaks the moment ANY field
    # contains one — an LLM-authored task title is enough — and the fragments then have fewer columns
    # than the caller indexes. That crashed the watcher mid-run on 2026-08-02 (Run 21, IndexError on
    # k[2]) and killed it silently: the leg carried on, and nothing would have been injected.
    # This is the SAME defect the Run-18 postmortem recorded for the CONTENT read; the fix was applied
    # there and never to this helper, which is why it survived to bite a second time.
    args = ["psql", DB, "-t", "-A", "-F", "\x1f"]
    if not raw:
        args += ["-R", "\x1e"]
    r = subprocess.run(args + ["-c", sql], capture_output=True, text=True)
    if r.returncode != 0:
        print("SQL ERROR:", r.stderr.strip()[:300], flush=True)
        return "" if raw else []
    if raw:
        return r.stdout
    # ⚠️ -R prints the separator BETWEEN records, not after the last one, so a SINGLE-ROW result
    # comes back as "value\n" with no \x1e anywhere — the trailing newline then rides along on the
    # last field and every id built from it matches nothing. Silently: the caller sees an empty
    # result, which is indistinguishable from "not ready yet". That is how the Run-21 window was
    # missed. Strip newlines per record; embedded ones inside a field are preserved.
    return [ln.strip("\n").split("\x1f") for ln in r.stdout.split("\x1e") if ln.strip()]


print(f"[asn] {'DRY RUN — no UPDATE will be issued' if DRY else 'armed'} "
      f"{time.strftime('%H:%M:%S')} — waiting for a leg whose reviewer has approved", flush=True)

while time.time() < DEADLINE:
    # Find the most recent artifact carrying a Derived Values block, on ANY child (Run-19 lesson).
    # SELECT THE SAME BLOCK THE PLATFORM WILL READ — Author first, then the other children in
    # protocol order, skipping the harvester. Mirrors derivation-containment-enrichment.ts:133-140.
    #
    # THE 2026-08-02 BUG: this used to take the most recent artifact carrying the marker, anywhere in
    # the leg. THREE children carry it (Design writes it, Author carries it forward, Review quotes
    # it), and REVIEW COMPLETES LAST — so it selected the reviewer's prose mention, found no fenced
    # array there, and refused. The refusal was correct; the selection was not. Injecting anywhere
    # other than the block the enrichment reads would be inert by construction.
    legs = q(f"""
        SELECT leg."metadata"->>'pipelineStageId' FROM tasks leg
        WHERE leg.stage_id = (SELECT "metadata"->>'pipelineStageId' FROM tasks WHERE id = '{PROGRAM_TASK}')
          AND leg.type = 'PIPELINE' AND leg."metadata"->>'pipelineStageId' IS NOT NULL;""")
    rows = []
    for (leg_stage,) in [(r[0],) for r in legs]:
        kids = q(f"""SELECT id, title, coalesce("agentRole", '') FROM tasks
                     WHERE stage_id = '{leg_stage}' ORDER BY created_at ASC;""")
        if not kids:
            continue
        author = [k for k in kids if 'author' in k[2].lower() or k[1].lower().startswith('author')]
        harvest = {k[0] for k in kids if 'harvest' in k[2].lower() or k[1].lower().startswith('harvest')}
        ordered = author + [k for k in kids if k[0] not in harvest and k not in author]
        for k in ordered:
            got = q(f"""SELECT a.id, e."taskId", t.stage_id FROM agent_artifacts a
                        JOIN agent_executions e ON e.id = a."executionId"
                        JOIN tasks t ON t.id = e."taskId"
                        WHERE e."taskId" = '{k[0]}' AND a.name = 'result.json'
                          AND a.content LIKE '%## Derived Values%'
                        ORDER BY a."createdAt" DESC LIMIT 1;""")
            if got:
                rows = got
                break
        if rows:
            break

    if rows:
        aid, task_id, stage_id = rows[0][0], rows[0][1], rows[0][2]
        st = q(f"SELECT count(*) FILTER (WHERE status <> 'COMPLETED'), count(*) "
               f"FROM tasks WHERE stage_id = '{stage_id}';")
        if st and st[0][0] == "0":
            content = q(f"SELECT content FROM agent_artifacts WHERE id = '{aid}';", raw=True)
            # psql -t -A terminates its single row with a newline of its OWN. Strip exactly one, or
            # the write-back lengthens the artifact by a byte it never contained. Harmless to the
            # parse, but this artifact is EVIDENCE — an instrument that silently edits what it
            # measures is the thing a verification pack cannot afford. (Found 2026-08-02 by the
            # dry-run reporting len=9536 against a stored length of 9535.)
            if content.endswith("\n"):
                content = content[:-1]
            if "## Derived Values" not in content:
                print(f"[asn] artifact {aid} lost its marker between queries — NOT injecting", flush=True)
                sys.exit(2)
            # The block is a fenced JSON array after the marker. Add one entry to the LAST one.
            m = re.search(r'(## Derived Values.*?```(?:json)?\s*\\n)(\[.*?\])(\\n```)', content, re.S)
            if not m:
                # SELF-DIAGNOSING REFUSAL. "I could not find it" and "it is not there" are the same
                # message otherwise — the exact unmeasured-zero shape this project keeps relearning.
                print(f"[asn] could not locate the fenced array — NOT injecting. "
                      f"artifact={aid} task={task_id} len={len(content)} "
                      f"marker={'## Derived Values' in content} fence={'```json' in content} "
                      f"escaped_nl={chr(92)+'n' in content}", flush=True)
                sys.exit(2)
            arr_text = m.group(2)
            # The block lives inside result.json, so it is DOUBLE-escaped: newlines are the two
            # characters \n and quotes are \". Unescape both to parse, re-escape both to write.
            # (A dry-run against Run 19's real artifact is what caught this — the regex matched and
            # the parse failed, which is the difference between a working injector and an inert one.)
            try:
                arr = json.loads(arr_text.replace('\\n', '\n').replace('\\"', '"'))
            except Exception as e:
                print(f"[asn] array did not parse ({e}) — NOT injecting", flush=True)
                sys.exit(2)
            arr.append({"kind": "asn", "value": INJECT_ASN, "device": INJECT_DEVICE})
            new_arr = json.dumps(arr, indent=2).replace('"', '\\"').replace('\n', '\\n')
            new_content = content.replace(arr_text, new_arr, 1)
            if new_content == content:
                print("[asn] replacement was a no-op — NOT injecting", flush=True)
                sys.exit(2)
            if DRY:
                # Round-trip proof: re-read the entries back OUT of the rewritten content using the
                # same regex, so "it would have worked" rests on a parse, not on inspection.
                m2 = re.search(r'(## Derived Values.*?```(?:json)?\s*\\n)(\[.*?\])(\\n```)',
                               new_content, re.S)
                back = json.loads(m2.group(2).replace('\\n', '\n').replace('\\"', '"')) if m2 else None
                print(f"[asn] DRY RUN OK — would inject into artifact {aid} on task {task_id}\n"
                      f"      selected  : {'AUTHOR' if k in author else 'non-author child'} "
                      f"({k[1][:48]!r}, role={k[2] or 'none'})\n"
                      f"      content   : len={len(content)} marker=True "
                      f"fence={'```json' in content} escaped_nl={chr(92)+'n' in content}\n"
                      f"      entries   : {len(arr) - 1} in -> {len(arr)} out\n"
                      f"      round-trip: {'PARSED ' + str(len(back)) + ' entries' if back else 'FAILED'}\n"
                      f"      injected  : "
                      f"{any(e.get('kind') == 'asn' and e.get('value') == INJECT_ASN for e in (back or []))}\n"
                      f"      kinds out : {sorted({e.get('kind', '?') for e in (back or [])})}",
                      flush=True)
                sys.exit(0 if back and len(back) == len(arr) else 2)
            esc = new_content.replace("'", "''")
            upd = q(f"UPDATE agent_artifacts SET content = '{esc}' WHERE id = '{aid}' RETURNING id;")
            print(f"[asn] INJECTED asn {INJECT_ASN} (device {INJECT_DEVICE}) into artifact {aid} "
                  f"on task {task_id}; rows={len(upd)}", flush=True)
            print(f"[asn] expect EXACTLY ONE violation: asn-not-member for {INJECT_ASN}. "
                  f"asn-reserved-range must NOT fire ({INJECT_ASN} is RFC 6996 private).", flush=True)
            sys.exit(0)
        else:
            print(f"[asn] block seen on task {task_id}; leg not finished "
                  f"({st[0][0]} of {st[0][1]} still open)", flush=True)
    if DRY:
        print(f"[asn] DRY RUN — single pass complete; nothing selectable yet "
              f"(legs={len(legs)} artifact_found={bool(rows)}). Not a pass.", flush=True)
        sys.exit(2)
    time.sleep(3)

print("[asn] DEADLINE reached without injecting — run proceeds clean", flush=True)
sys.exit(1)
