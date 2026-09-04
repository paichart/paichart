#!/usr/bin/env bash
# Memory watchdog for a rig window on the SHARED PROD HOST.
#
# WHY (2026-08-23): the IGP-T1 R6 window ended in a kernel GLOBAL OOM — paichart.app dark, sshd
# refusing handshakes, operator power-cycle required. A lost round is cheap and recoverable; a
# host outage is not. So this sheds the RIG automatically before the host reaches that state.
#
# Two tiers, both measured against MemAvailable:
#   WARN_MB  (default 1500) — emit a warning line per breach (one event per poll).
#   KILL_MB  (default  700) — `docker kill` the cEOS nodes, emit SHED, and exit non-zero.
#                             nornir-mcp and cloudflared are NEVER touched.
#
# Runs FROM THE LOCAL MACHINE over ssh so it keeps working when the host is already too loaded to
# be interactive — the same path that recovered the incident. stdout is deliberately quiet: a line
# is only printed when something happened, so it can drive a Monitor without noise.
#
# Usage:  ./memory-watchdog.sh [interval_seconds]
#   env:  HOST=<PROD_USER>@<PROD_HOST>  WARN_MB=1500  KILL_MB=700  LAB=igp-ceos
set -u
HOST="${HOST:-<PROD_USER>@<PROD_HOST>}"
WARN_MB="${WARN_MB:-1500}"
KILL_MB="${KILL_MB:-700}"
LAB="${LAB:-igp-ceos}"
INTERVAL="${1:-30}"

echo "watchdog: armed on $HOST (warn<${WARN_MB}MB, shed<${KILL_MB}MB, every ${INTERVAL}s, lab=$LAB)"

consecutive_fail=0
while true; do
  avail=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$HOST" \
            "awk '/MemAvailable/{print int(\$2/1024)}' /proc/meminfo" 2>/dev/null)

  if [ -z "$avail" ]; then
    consecutive_fail=$((consecutive_fail + 1))
    # Unreachable is itself the incident signature (sshd refusing handshakes under pressure).
    if [ "$consecutive_fail" -ge 3 ]; then
      echo "UNREACHABLE: $consecutive_fail consecutive probe failures — host may be saturated; attempting emergency shed"
      ssh -o ConnectTimeout=15 "$HOST" "docker kill clab-${LAB}-ceos1 clab-${LAB}-ceos2 clab-${LAB}-ceos3 2>&1" \
        && echo "SHED: cEOS killed on a reachable retry" && exit 2
    fi
    sleep "$INTERVAL"; continue
  fi
  consecutive_fail=0

  if [ "$avail" -lt "$KILL_MB" ]; then
    echo "SHED: MemAvailable ${avail}MB < ${KILL_MB}MB — killing cEOS nodes to protect the host"
    ssh -o ConnectTimeout=15 "$HOST" "docker kill clab-${LAB}-ceos1 clab-${LAB}-ceos2 clab-${LAB}-ceos3 2>&1; sleep 3; awk '/MemAvailable/{print \"after shed: \" int(\$2/1024) \"MB\"}' /proc/meminfo"
    exit 2
  fi

  if [ "$avail" -lt "$WARN_MB" ]; then
    echo "WARN: MemAvailable ${avail}MB < ${WARN_MB}MB (rig window) — $(date -u +%H:%M:%SZ)"
  fi
  sleep "$INTERVAL"
done
