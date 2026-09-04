#!/usr/bin/env python3
"""
randomize-t6-seed.py — regenerate the T6 telemetry-exporter scatter in ceos{1,2}-startup.cfg.

WHY THIS EXISTS
---------------
T6 (the sequenced-program validation round) rests on ONE load-bearing claim: the value the
terraform leg consumes — the exporter aggregate the network design derives — is *unarguably*
runtime, because it CHANGES ON EVERY RIG REBUILD. That claim is only true if we actually
re-randomize. This script makes doing so a one-liner, so the claim stays honest.

WHAT A VALID SCATTER MUST SATISFY (this is the whole point — a random scatter is NOT enough)
-------------------------------------------------------------------------------------------
  1. Addresses unique FABRIC-WIDE (they are advertised /32s; a duplicate is a real BGP conflict).
  2. THE NAIVE ANSWER MUST FAIL: the two lowest free addresses must summarize into an aggregate
     that COVERS a taken address (an authorization widening the design must reject). Without
     this, "lowest free" wins and the dependency degenerates into a guessable lookup — exactly
     the arguability T6 was redesigned to eliminate.
  3. A CLEAN PAIR MUST EXIST: at least one (a on ceos1, b on ceos2) whose smallest covering
     aggregate covers NOTHING taken. Without this the correct design outcome is "escalate",
     which is a legitimate behaviour but cannot validate T6's happy path.

Property 2 is what makes the leg REASON over harvested state; property 3 is what makes the
round completable. The script rejects scatters that fail either and retries.

USAGE
-----
    python3 randomize-t6-seed.py            # show a candidate scatter + the answer, write nothing
    python3 randomize-t6-seed.py --write    # rewrite the loopback/network stanzas in both cfgs
    python3 randomize-t6-seed.py --seed 42  # deterministic (for reproducing a specific rig build)

Then REBUILD the rig (startup-configs are only applied at containerlab deploy) — see
DEMO-RUN-GUIDE.md "Rebuilding the rig (required for T6)".
"""
import argparse
import ipaddress
import random
import re
import sys
from pathlib import Path

POOL = ipaddress.ip_network("10.99.0.0/24")
# Keep allocations in a small realistic window; the design only ever needs a handful.
CANDIDATES = [POOL.network_address + i for i in range(1, 31)]
PER_DEVICE = 3  # existing allocations seeded per switch
HERE = Path(__file__).parent


def smallest_aggregate(a, b):
    """The smallest prefix covering both a and b."""
    for plen in range(32, -1, -1):
        net = ipaddress.ip_network(f"{a}/{plen}", strict=False)
        if b in net:
            return net
    raise AssertionError("unreachable — /0 covers everything")


def covers_any(net, addrs):
    return any(x in net for x in addrs)


def clean_pairs(free, taken):
    """Pairs (a, b) whose covering aggregate covers nothing already allocated."""
    out = []
    for i, a in enumerate(free):
        for b in free[i + 1:]:
            if not covers_any(smallest_aggregate(a, b), taken):
                out.append((a, b, smallest_aggregate(a, b)))
    return out


def naive_is_widening(free, taken):
    """Property 2: the two lowest free addresses must summarize into a widening aggregate."""
    if len(free) < 2:
        return False
    return covers_any(smallest_aggregate(free[0], free[1]), taken)


def generate(rng, attempts=4000):
    for _ in range(attempts):
        picked = rng.sample(CANDIDATES, PER_DEVICE * 2)
        ceos1, ceos2 = sorted(picked[:PER_DEVICE]), sorted(picked[PER_DEVICE:])
        taken = sorted(picked)
        free = [a for a in CANDIDATES if a not in taken]
        if not naive_is_widening(free, taken):
            continue                      # naive answer would win -> puzzle doesn't bite
        pairs = clean_pairs(free, taken)
        if not pairs:
            continue                      # no clean answer -> leg would (correctly) escalate
        return ceos1, ceos2, taken, free, pairs
    sys.exit("could not generate a valid scatter — widen CANDIDATES or lower PER_DEVICE")


def stanzas(addrs):
    ifaces = "\n!\n".join(
        f"interface Loopback1{i}\n"
        f"   description telemetry-exporter (existing allocation)\n"
        f"   ip address {a}/32"
        for i, a in enumerate(addrs, start=1)
    )
    nets = "\n".join(f"   network {a}/32" for a in addrs)
    return ifaces, nets


IFACE_BLOCK = re.compile(
    r"(?ms)^interface Loopback1\d\n   description telemetry-exporter.*?ip address [\d.]+/32\n(?:!\n)?"
)
NET_BLOCK = re.compile(r"(?m)^   network 10\.99\.0\.\d+/32\n")


def rewrite(path, addrs):
    src = path.read_text()
    ifaces, nets = stanzas(addrs)
    if not IFACE_BLOCK.search(src) or not NET_BLOCK.search(src):
        sys.exit(f"{path.name}: expected T6 loopback/network stanzas not found — cfg drifted; "
                 "fix by hand and re-check the regexes in this script")
    src = IFACE_BLOCK.sub("", src, count=PER_DEVICE)
    src = src.replace("! eBGP toward", ifaces + "\n!\n! eBGP toward", 1) if "! eBGP toward" in src \
        else src.replace("router bgp", ifaces + "\n!\nrouter bgp", 1)
    first = True

    def _net(m):
        nonlocal first
        if first:
            first = False
            return nets + "\n"
        return ""
    src = NET_BLOCK.sub(_net, src)
    path.write_text(src)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="rewrite ceos{1,2}-startup.cfg in place")
    ap.add_argument("--seed", type=int, help="deterministic scatter (reproduce a rig build)")
    args = ap.parse_args()
    rng = random.Random(args.seed)

    ceos1, ceos2, taken, free, pairs = generate(rng)
    naive_agg = smallest_aggregate(free[0], free[1])
    best = min(pairs, key=lambda p: (int(p[0]), int(p[1])))

    print(f"ceos1 existing : {', '.join(str(a) for a in ceos1)}")
    print(f"ceos2 existing : {', '.join(str(a) for a in ceos2)}")
    print(f"free           : {', '.join(str(a) for a in free[:10])} ...")
    print(f"\nnaive lowest-free ({free[0]} + {free[1]}) -> {naive_agg}  "
          f"COVERS TAKEN -> widening, correctly rejected  ✓ (puzzle bites)")
    print(f"a clean answer    ({best[0]} + {best[1]}) -> {best[2]}  covers nothing taken  ✓")
    print(f"{len(pairs)} clean pair(s) exist — the design must justify one.")
    print("\nNOTE: the aggregate above is what the terraform leg must authorize verbatim. It is NOT "
          "an expected value to hardcode — T6's checks are properties, not literals.")

    if args.write:
        rewrite(HERE / "ceos1-startup.cfg", ceos1)
        rewrite(HERE / "ceos2-startup.cfg", ceos2)
        print("\nWROTE ceos1-startup.cfg + ceos2-startup.cfg. "
              "Rebuild the rig for it to take effect (see DEMO-RUN-GUIDE.md).")
    else:
        print("\n(dry run — pass --write to update the cfgs)")


if __name__ == "__main__":
    main()
