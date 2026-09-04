# Verification instruments

Tools that manufacture a condition the system will not produce on its own, so a **negative path** can
be observed. They are test instruments, not part of the product, and nothing here runs in normal
operation.

**Why they exist.** Some gates only matter when something upstream fails. A gate that has never been
observed *failing* is a gate with no evidence — `VT-13` has stayed open for five consecutive rounds
precisely because the system kept working. Waiting for a spontaneous defect means betting on the
agents being wrong, which is the opposite of what we want.

| Script | Manufactures | Serves |
|---|---|---|
| `kind-inject.py` | a derived value of ANY kind — `--kind=` / `--value=` / `--device=` | VT-13 (`--kind=asn`, the default) and VT-14 (`--kind=vlan`) |
| `asn-inject.py` | a derived ASN absent from the harvest | `asn-not-member` blocking direction; VT-13 attribution |
| `vt13-inject.py` | a non-minimal CIDR aggregate | `prefix-not-minimal` blocking direction; VT-13 |

⚠️ **`kind-inject.py` generalises `asn-inject.py`; it does not fork it.** Its defaults reproduce the
VT-13 asn round exactly. A forked injector is a copy that drifts, and BOTH Run-20 and Run-21 defects
were in the shared psql helper — fixing one fork would have left the other broken. Retire
`asn-inject.py` once VT-13's residual is closed; until then they must stay behaviourally identical.

⚠️ **VT-14 has a target constraint the other rounds do not.** `unsupported[]` is reachable only when
BOTH a harvest and a derived block parse, so the injection must land on a leg **whose harvest parses**
(the cEOS network leg). Inject into a consuming leg and it routes into the consuming-leg exception
instead — a different clause — and the round looks like it worked while testing nothing it claims to.

**A generalised instrument needs a generalised self-check.** `kind-inject.py`'s dry-run originally
verified the injected entry with a hardcoded `kind == 'asn'`, so `--kind=vlan` printed
`injected: False` **and exited 0** — a self-check that could not pass for the case it was generalised
to serve, and whose exit code ignored it. Both fixed 2026-08-03; verify a new `--kind` on a known-good
specimen before arming it.

---

## The rule that governs both

> **Inject the mistake, never the verdict.**

Both scripts edit **one value in an agent's own output** — the error a human or an agent could
plausibly make, or that an injected prompt could smuggle in. Everything downstream is the shipping
system: the parse, the arithmetic, the violation class, the lean card, the gate, Node C.

Fabricating the *fact* instead (writing `violations: [...]` directly) would prove only that the gate
reads a field. Fabricating the *input* proves the whole chain.

## The timing is the design, not a detail

Both wait until **every task in the leg's stage is COMPLETED** — i.e. the leg's own reviewer has
already approved the good package — before editing.

VT-13 observable 4 excludes a `programReleasable: false` produced by a red `qualityGate.outcome` or a
rejected Node C: the derivation conjunct must be *visibly load-bearing*. So the leg must still report
APPROVED while containment dissents. Edit earlier and the reviewer catches it, the leg goes red, and
the program blocks for the wrong reason — which is exactly the over-determination that stopped
**Run 18** counting (three sufficient causes attribute to none).

## Running one

Prerequisites: rigs up, the target protocol deployed, and a program task **created but not yet
started** — arm the watcher *before* releasing the gates.

```bash
# 1. deploy to the box (they run there, against the prod DB)
scp scripts/verification/asn-inject.py root@<host>:/root/

# 2. arm it, scoped to ONE program root task id
ssh root@<host> 'cd /var/www/paichart-app/current \
  && set -a && . ./.env.production && set +a \
  && setsid nohup python3 /root/asn-inject.py <programRootTaskId> \
       >/root/asn-inject.log 2>&1 < /dev/null &'

# 3. confirm it armed and is QUIET (no injection yet)
ssh root@<host> 'cat /root/asn-inject.log'
#   [asn] armed HH:MM:SS — waiting for a leg whose reviewer has approved

# 4. now drive the run's gates as normal. Watch:
ssh root@<host> 'tail -f /root/asn-inject.log'
```

⚠️ **Step 2's `ssh` may never return, and that does NOT mean it failed.** The `&` backgrounds the whole
`cd && … && python3` chain, whose subshell keeps the ssh session's stdout open for the watcher's full
3-hour deadline, so ssh waits on a process that is working fine. Observed 2026-08-02 arming Run 21: the
call timed out at 90s while the watcher had armed correctly at 06:20:56.

**Never re-arm on a timeout** — a second watcher would race the first. Step 3 is the authority on
whether it armed; run it, and check the process count too:

```bash
ssh root@<host> 'ps -eo pid,comm,args --no-headers | awk "\$2==\"python3\"" | grep asn-inject'
# expect EXACTLY ONE line, carrying the program task id you armed against
```

⚠️ **Scope it to a program task id.** Without that argument `asn-inject.py` exits. An earlier version
matched any block within a 4-hour window and fired on a **stale artifact from the previous run**,
arming and exiting before the target run had started.

## Reading the outcome

| Log line | Meaning |
|---|---|
| `armed … waiting` | healthy; nothing touched yet |
| `block seen … leg not finished (N of M still open)` | healthy; waiting for the reviewer |
| `INJECTED …` | fired — the run is now an injected round and must be recorded as one |
| `could not locate … artifact=… len=… marker=… fence=…` | **refused**, with evidence. Investigate; do not re-arm blind |
| `DEADLINE reached without injecting` | never fired; the run is CLEAN and must not be recorded as a blocking test |

**Every refusal exits non-zero and touches nothing.** That is deliberate: an inert injection reported
as a successful one would produce a clean run recorded as a blocking-direction test — the worst
available outcome for the VT it serves.

## Two failures that shaped these, worth not repeating

**Run 18 — the watcher was inert and nearly silent.** It split `psql` output on newlines while
artifact content is itself multi-line, so its content variable held one line fragment and the regex
matched nothing. It failed *loudly* only because `m.group(0)` threw on `None`. One line more
defensive and it would have silently never fired and been reported as "injected".

**Run 20 — it selected the wrong block.** It took the most recent artifact carrying
`## Derived Values`. **Three children carry that marker** — Design writes it, the Author carries it
forward verbatim, the Reviewer quotes it — and **Review completes last**. So it picked the reviewer's
prose mention, found no fenced array, and refused. The refusal was right; the selection was not.

Both now select the way `derivation-containment-enrichment.ts:133-140` does: **Author first, then the
other children in protocol order, skipping the harvester.** Injecting into any block *other than the
one the enrichment reads* is inert by construction.

## Before trusting a change to either

1. **Dry-run the selection and parse against a real completed leg** — no `UPDATE`. That is what caught
   the double-escaping (`\n` and `\"` inside `result.json`) and the wrong-child selection. Both looked
   correct by inspection.

   `asn-inject.py` has this built in — **the shipping code path, not a rehearsal copy**, which matters
   because the Run-20 bug was in *selection* and a separate test script presupposes the selection:

   ```bash
   ssh root@<host> 'cd /var/www/paichart-app/current \
     && set -a && . ./.env.production && set +a \
     && python3 /root/asn-inject.py <anyCompletedProgramRootTaskId> --dry-run'
   ```

   One pass, every step except the `UPDATE`, then evidence: which child was selected and why, content
   length, marker/fence/escaping presence, entries in → out, and a **re-parse of the rewritten block**
   so "it would have worked" rests on a parse rather than on inspection. Exit 0 only if the round-trip
   returns the injected entry. ✅ Last verified 2026-08-02 against Run 20
   (`cmsb7fn8i0003yxrgefvnylz4`) — selected the Author child, 3 → 4 entries, `['asn','cidr']` out.
2. **Confirm the entries parse and round-trip** — count in, count out, injected value present on
   re-read.
3. **Check the refusal path prints evidence**, not just a refusal.

## Cleanup

The injected value stays in the artifact — that is the evidence. Do not "undo" it; record the run as
injected in its VT entry instead. Stop any watcher before the next run:

```bash
ssh root@<host> 'pkill -f asn-inject.py'
# verify WITHOUT self-matching — `pgrep -f asn-inject` matches your own command line:
ssh root@<host> 'ps -eo comm,args --no-headers | awk "\$1==\"python3\"" | grep -c asn-inject'
```

## Honesty rules for the round they serve

- An injected round is **labelled injected**, in the VT and in the run's task description.
- A round where the injector **did not fire is a CLEAN round** and must never be recorded as a
  blocking-direction test.
- Injection manufactures the **failure**, never the **pass**. Fabricating a green result would make
  the verification pack worthless, which is the whole point of having one.
