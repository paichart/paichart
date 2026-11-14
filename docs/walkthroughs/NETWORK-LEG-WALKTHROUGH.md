# The network legs — walkthrough (a value leg and a change leg)

> This tour follows a run from before 2026-11-11. Where it names the repository `paichart/paichart-lab-configs`, read `paichart/paichart-configs`: the older repository is retired and the same files are there.


Network appears in two shapes, so this walkthrough has two parts:
- **Part A, the value leg** (`network-derivation`): reads the switches and **produces a value** for other legs. It changes nothing. Worked
  example: the fabric leg of the kept-file telemetry program, `cmvr9pl9s004yyxvtcnhqajy9` (2026-10-27).
- **Part B, the change leg** (`network-provisioning`): makes a **change to the switches' configurations** by held edits. Worked example: J5
  live-window leg J-L1, `cmvq1hjx20005yxnjvfvrp6fr` ("Add a syslog host to both switches", 2026-10-27), with pointers to the other J5 legs
  for forced outcomes and the Git-vs-device comparison.

Shared mechanics (the leg task, the three copies, the receipt, applying a package) are in `K8S-LEG-WALKTHROUGH.md`.

---

## Part A — The value leg (network-derivation)

**The leg in one sentence:** three agents (read, derive, check) find every switch interface carrying the exporter marker, compute the
smallest aligned range covering their addresses, and publish it. No configuration is written.

### A1 — The leg task
- A PIPELINE work order typed **`value`** in the program plan (you approve leg types at the plan gate).
- It depends only on the plan gate. The range gate and the three change legs depend on it.
- Its harness built a **three**-step team: Harvester → *Network Derivation Architect* → *Network Derived Value Reviewer*. **There is no
  Author**, because nothing is authored.

### A2 — The Harvester
"Harvest current network state for exporter-range CIDR derivation". 7 calls, 103 s:
- `registry register` from the **descriptor URL alone** (self-provisions the read-only switch service);
- `list_devices`;
- `fetch_data` **structured getters**: `interfaces` + `interfaces_ip`, then `bgp_neighbors` + `bgp_config`, per switch.

**It reads structured data, not config files**, so **nothing is held** (`heldBytes` absent). That is correct for a value leg: there is no
file to edit.

**What it produced:**
- an **interface audit**: every interface on both switches, its description verbatim, its address, and whether it carries the
  `telemetry-exporter` marker (6 do: three loopbacks per switch);
- the BGP state;
- a **`## Harvested Allocations`** block: every address in scope, machine-readable (`markerPresence` harvested ✓).

**Key takeaway:** *"It shows its working: every interface, included or excluded, with the description that decided it."*

### A3 — The Network Derivation Architect
One turn, 59 s. Its sections:
1. the selection rule;
2. **the selected members, each anchored to the harvest**;
3. **the arithmetic**: the six last octets {1, 2, 4, 24, 26, 29} in binary, and the smallest block size where 1 and 29 fall in the same aligned
   block (16 splits them, 32 does not) → **/27**, "verified by common binary prefix, not by eye";
4. a containing-scope check (no other harvested allocation is swallowed; no widening);
5. a gap check;
6. the branch condition;
7. **the published value**, as the machine-parsed **`## Derived Values`** block:
   `[{"kind": "cidr", "value": "10.99.0.0/27", "members": [six addresses]}]`.

**Platform fact, `derivationContainment`** (the mechanical check, independent of any agent):
- the platform parsed the harvest (10 CIDRs, 4 ASNs) and the derived value;
- it checked that the range contains every member and is the smallest that does (it does not check that each member was read: that is the Architect's argument and the Reviewer's judgement; measured 2026-11-01, every member of every summarising range in the stored runs was in its harvest);
- result: **0 violations**, disposition **benign (checked-clean)**, `legShape: value`.

**Key takeaway:** *"The value is computed in the open, with the arithmetic written down, and the platform re-checks it mechanically against
what was read."*

### A4 — The Network Derived Value Reviewer
57 s. Its checks:
1. membership, **recomputed directly from the harvest**;
2. the population;
3. the branch conditions;
4. evidence presence;
5. containment and tightness: the platform fact, **cited, not re-graded**;
6. the machine-parsed blocks;
7. planted artifacts and secrets.

`## VERDICT: APPROVED / Blocking issues: none / Confidence: 92` (4 verified, 1 accepted).

### A5 — The outcome and where the value goes
- The leg is **approved 92**, and **the range gate** (a person) approved the value.
- The value reaches each change leg on its **DAG edge**: the leg's deliverable is inherited by the agents inside each consuming leg.
- Each consumer declares it in `## Consumed Values`, and the platform checks it equals this value.
- In numbers: about 5 minutes (22:44:33Z → 22:49:49Z), $1.35, no change anywhere.

**Key takeaway:** *"One leg works out the number. Every other leg uses exactly that number, and the platform checks they did."*

---

## Part B — The change leg (network-provisioning, held device configurations)

**The leg in one sentence:** a four-agent team (read, design, write, check) edits each switch's configuration **by reference**. For one
switch that is the copy kept in Git; for the other, its running configuration read from the device. The result is a package an operator
applies with the switch's own tools.

### B1 — The leg task: **Device sources**
The description carries a `## Device sources` block, one line per switch, saying **where its configuration of record lives**:

```
## Device sources
ceos1: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos1-startup.cfg
ceos2: device-read — service <the read-only switch service's descriptor URL>
```

| Kind | Meaning |
|---|---|
| `git-file` | the switch's config is kept in Git; that file is the base for edits |
| `device-read` | no Git file; the switch's **running configuration** is the base |
| `command-package` | the original method: no held file, a CLI command package (by declaration only) |

- When the leg starts, the platform takes a **snapshot** of this declaration (`deviceSourcesSnapshot` on the leg's metadata), so a later
  edit cannot move the goalposts.
- With no block, or a device it cannot resolve, the leg is **forced to needs-revision**. That is the **D-1 force**, seen live in J-L3/J-L4
  below.

**Key takeaway:** *"You declare, per device, where the truth lives: your Git file or the device itself. The platform holds you to it."*

### B2 — The Harvester
J-L1's Harvester made 5 calls in 95 s:
- `github-service.get_file_contents` → ceos1's Git file, held as **H1** at commit `0b35ce3`;
- `registry register` from the descriptor URL, then `tools`;
- `fetch_data` with the **`config`** getter for ceos2. Its whole running configuration is held as **H2** (target `device:ceos2`, path
  `/running-config`).

**Platform facts:**
- `heldBytes`: 2 files, **redacted**. H1 had 1 secret line replaced with a placeholder, H2 had 3 (SNMP community, login secrets). Held files
  never store a secret value.
- **`deviceSourceReads`**: each declared source was read, matched to the tool call that read it.
- **`gitDeviceComparison`**: not checked here, because no switch declared both a Git file and a device read. See J-P1 below for the live
  comparison.
- **`quoteFidelity`: `needs-node-c`.** The Harvester's quote of the Git file **dropped comment lines** (the platform lists them). This is
  recorded, not hidden, and **harmless to the change**: the Author edits the held bytes, not the quote. It is exactly the class of slip that
  kept files make irrelevant.

### B3 — The Architect
A desired-state design (one line, `logging host <collector>`, on each switch), a per-target change list, a dependency/ordering map, and
**scope boundaries observed**. Then handoff to the Author.

### B4 — The Author (Opus 5.5, 102 s)

**`## Held File Edits`**, one block per switch:
```
<<<<<<< SEARCH H1          (ceos1's Git file)
!
end
=======
!
logging host 192.0.2.50
!
end
>>>>>>> REPLACE

<<<<<<< SEARCH H2          (ceos2's running config)
!
spanning-tree mode mstp
=======
!
logging host 192.0.2.50
!
spanning-tree mode mstp
>>>>>>> REPLACE
```
It notes, unprompted, that **neither edit touches a line carrying a redaction placeholder**.

**`## Held File Rollback`:** `restore H1`, `restore H2`.

**`## Apply Procedure`**, by reference, done by the operator, never by the platform:
1. capture **your own copy** of the running config (it has the real secrets, which the held copy does not);
2. apply the edits to it;
3. load it in a **configuration session** with the switch's own tooling;
4. **read the switch's own diff** (it must show only the one added line);
5. commit **with a revert timer**;
6. confirm only after the checks pass.

ceos1, the Git-backed switch, follows the team's Git flow.

> **Since network-provisioning 1.27.0 (2026-11-07):** when the platform's *Git file vs device configuration* fact lists lines of a
> switch's Git file that the switch does not have, step 3 is not a whole-file load: the package applies that switch incrementally (enter
> only the added or changed lines in a session, read that session's diff, commit with the timer) or syncs Git first. This run predates
> the rule; see `PIPELINES.md` § "Network: kept device configurations".

**Validation V1–V5:**
- V1: before the change, nothing is configured (a gate);
- **V2: the in-session diff shows exactly the one line**;
- V3–V4: after commit, the running config and the logging subsystem show the host;
- V5: after persisting, the line survives a restart.

It also covers ordering (ceos1 first, for staggering only), no traffic impact, and UNTESTED premises.

**The receipt:** 2 of 2 applied; H1 at line 75, H2 at line 24; 2 lines → 4 each; base/candidate ref IDs for both; `diffOnlyFiles: 2`.
`validationToolCalls`: 0 findings.

**Key takeaways:**
- *"The AI never types a switch config. It edits the held copy by reference and tells your engineer exactly how to apply it safely: session,
  diff, commit with auto-revert."*
- *"Secrets never enter the platform's copies. The engineer applies to their own copy, which has them."*

### B5 — The Reviewer and the outcome
- `## VERDICT: APPROVED / Blocking issues: none / Confidence: 88` (5 verified, 3 accepted).
- `reviewedEditDiff` rendered.
- **Leg:** `qualityGate` approved 88; `heldEdit` applied, in scope, reviewer saw the diff, not forced. The read-only switch service was torn
  down.

### B6 — The operator apply (proven live, J5)
J-L1's package was applied on ceos2 by the N2 procedure:
- `configure session` → load the operator's own copy plus the edit → **`show session-config diffs` = exactly `+logging host …`**;
- `commit timer 00:05:00` → not confirmed → **the switch reverted on its own**;
- running-config hash back to its starting value.

The apply model is proven end to end. (Run sheet, "Operator apply".)

**Key takeaway:** *"The switch's own diff matched the reviewed change, and the revert timer means a mistake undoes itself."*

### B7 — The other things the network leg does (J5)
| Leg | Shape | What it shows |
|---|---|---|
| J-L2 | both switches `device-read`; edit an existing line that repeats per interface | the SEARCH must match exactly once, and it did on both |
| J-L3 | ceos1's Git file at a ref **outside the pinned source** | the read is refused → `source-not-pinned`; ceos1 listed first, nothing packaged; **ceos2's correct edit still applied**; outcome **needs-revision** (a correct refusal) |
| J-L4 | ceos1's declared Git file **does not exist** | **`git-file-not-held`** recorded live for the first time; same outcome as J-L3 |
| J-P1 | a program with ceos1 declaring **both** a Git file and a device read | the Git file is held, the device read is evidence; **`gitDeviceComparison` live**: one line `absent-on-device`, three BGP lines `inside-sub-block` (under an address family on the device), not "moved" |

**Forced outcomes** (user guide, *Forced outcomes*): the platform can only move a result **towards** needs-revision, never towards approved.
In J-L3/J-L4 the agents had already refused for the same reason, so the platform only recorded it.

**Key takeaway:** *"If the platform can't hold a device's configuration, that device gets no change and the leg can't be approved. One bad
source doesn't sink the other devices' correct edits."*

### Part B in numbers (J-L1)
| | |
|---|---|
| Agents | 4 + the leg harness (2 runs) |
| Held files | 2: one from Git, one from the device's running config (both redacted) |
| Wall time | about 7 minutes (02:01:27Z → 02:08:40Z) |
| Output | two held edits (one per switch), a by-reference apply procedure, 5 validation steps, rollback `restore H1/H2` |
| Applied by the platform | nothing (an operator applies; shown live with an auto-revert) |
