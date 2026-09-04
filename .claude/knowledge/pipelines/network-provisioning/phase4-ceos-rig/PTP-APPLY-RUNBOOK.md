# PTP Boundary-Clock — Out-of-Band Apply Runbook (cEOS rig)

> **Source (verbatim)**: the APPROVED change package from pipeline task `cmque7cws002myxg4raocb6kd`
> (Meridian / "Provision PTP boundary-clock time synchronization", Run 20260701-b6kd, Reviewer 92/100) —
> artifact `cmr1ey0v2002fyxrofii00hit` (`report.md`, the Author's package). This runbook is the **human-gated
> apply step** the pipeline deliberately does not perform.
>
> **Why apply it now (2026-07-08)**: it is the sequentially-next unapplied approved change (Loopback0+BGP was
> applied earlier), and applying it **grows the running-config** on both devices — which is what makes the
> follow-on provisioning run (the OPEN multicast-VLAN task `cmque7ho8002qyxg425q8lmoh`) a meaningful live test
> of the harvest scoped-read discipline + the 2026-07-08 truncation auto-nudge (Test B in the truncation-fix
> verification plan).
>
> **Prereq**: rig rebuilt per `README.md` Steps 2–3 + the DEMO-RUN-GUIDE pre-flight (`serverInfo.name` must be
> `Nornir Network Automation` — the `:3107` tunnel is shared with the terraform rig).

## ⚠️ Operator note — cEOS syntax caveat (read before pasting)

The package is the pipeline's approved deliverable, quoted **verbatim** below per the integrity rule. Two
adaptation risks on containerized cEOS 4.32.2.1F (the package targets the 7130 design):
1. EOS enables boundary-clock via **`ptp mode boundary`** — the package's global stanza omits it; add it first
   if the `ptp priority1` etc. lines are rejected without a mode.
2. The interface stanza `ptp port 1 role master|slave` may need the cEOS form (`ptp enable` + `ptp role …`
   on some builds). Apply interactively; adapt syntax in place and note deviations.
Remember the purpose ordering: (a) grow the running-config for Test B, (b) best-effort PTP state. cEOS may
accept the config but not converge PTP dataplane state — that's acceptable for (a); record whatever
`show ptp clock` actually returns.

## Access

```bash
ssh <PROD_USER>@<PROD_HOST>
docker exec -it ceos1 Cli   # then: enable, configure
docker exec -it ceos2 Cli
```

## Step 1+2 — ceos1 (Grandmaster BC) — package (a), Device 1 [verbatim]

```
ptp clock-identity 00:11:22:33:44:55:66:77
ptp priority1 128
ptp priority2 128
ptp clock-class 6
ptp clock-accuracy 0x20
ptp domain 0
ptp announce-interval -3
ptp sync-interval -4
ptp delay-req-interval -4
ptp one-step true
ptp profile ieee802.1as

interface Ethernet1
   ptp port 1 role master
```
Then `end` + `write memory`.

## Step 3+4 — ceos2 (Slave BC) — package (a), Device 2 [verbatim]

```
ptp clock-identity 00:11:22:33:44:55:66:88
ptp priority1 129
ptp priority2 129
ptp clock-class 7
ptp clock-accuracy 0x21
ptp domain 0
ptp announce-interval -3
ptp sync-interval -4
ptp delay-req-interval -4
ptp one-step true
ptp profile ieee802.1as

interface Ethernet1
   ptp port 1 role slave
```
Then `end` + `write memory`.

**Ordering rationale (package (d))**: ceos1 global → ceos1 master port → ceos2 global → ceos2 slave port —
upstream-BC-first avoids a timing flap; total window ~11 min incl. validation; no reboot required.

## Step 5 — Validation (package (b), 6 deterministic steps)

| # | Where | Command | Key expected facts |
|---|-------|---------|--------------------|
| 1 | ceos1 | `show ptp clock` | GM ID == own clock ID `…66:77`, class 6, steps-removed 0 |
| 2 | ceos2 | `show ptp clock` | GM ID == `…66:77` (ceos1), class 7, steps-removed 1, offset < 1 µs |
| 3 | ceos1 | `show ptp port` | Ethernet1 state MASTER, sync interval -4 (16 ms), one-step |
| 4 | ceos2 | `show ptp port` | Ethernet1 state SLAVE, sync interval -4, one-step |
| 5 | ceos2 | `show ptp parent` | Parent GM `…66:77`, steps-removed 1, mean path delay < 100 ns |
| 6 | both  | `show ptp clock` ×12 over 60 s | GM ID / steps-removed / offset stable — no election flap |

(Full expected-output blocks are in the package artifact — `fetch(id: "artifact-cmr1ey0v2002fyxrofii00hit")`.)

## Rollback (package (c)) — if validation fails or timing flaps

On **each** device (ceos1 first, then ceos2):
```
configure
no ptp clock-identity
no ptp priority1
no ptp priority2
no ptp clock-class
no ptp clock-accuracy
no ptp domain
no ptp announce-interval
no ptp sync-interval
no ptp delay-req-interval
no ptp one-step
no ptp profile
interface Ethernet1
   no ptp port 1 role master    ! (ceos2: … role slave)
end
write memory
```
Post-rollback: `show ptp clock` / `show ptp port` → "PTP is not configured" / empty.

## After apply — Test B

Rig now carries Loopback0+BGP **and** PTP config (bigger running-config). Execute the OPEN multicast-VLAN
pipeline task `cmque7ho8002qyxg425q8lmoh` (`perform(agent.execute, …)` per DEMO-RUN-GUIDE Path B) and check the
harvester child's `result.json.toolCalls`:
- scoped reads (multiple different NAPALM getters), and
- `resultTruncatedForLlm` present on every entry (`true` on any capped read — if true, verify the agent
  re-read narrower, paged the tail via `read_more`, or flagged the gap, per the C1 auto-nudge). See
  `.claude/knowledge/domain/harness/harvest-truncation-safety.md` §6.
