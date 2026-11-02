#!/bin/bash
# replay-snapshot-gc.sh — 24-hour retention for the offline nets replay's production copies (NETS-REPLAY-SNAPSHOT-RETENTION).
#
# WHAT IT DELETES (dev machine only; never production): anything older than 24 h (--max-age-hours) among
#   1. SNAPSHOT dirs written by scripts/replay-nets-byte-identity.sh --snapshot <dir> (~315 MB: schema.dump, <table>.copy,
#      <table>.columns, watermarks.copy, base-cache/*.out). Marker: its manifest.json with source "production (read-only)".
#      Age = the manifest's takenAt (the age of the production data, not the dir's mtime — base-cache writes touch that).
#   2. REPLAY OUTPUT dirs (--out <dir>: ids.txt, base.out, new.out, replay.diff, logs.txt). Marker: .nets-replay-out.json,
#      rewritten by every run with the snapshot it read. Age = that snapshot's takenAt.
#   3. local scratch DATABASES named nets_replay_* (~168 MB each). Age = the snapshot id in the database COMMENT (set after
#      a complete load), else the id stamp in the name (YYYYMMDDtHHMMSSz). A nets_replay_* database with neither is KEPT
#      and logged ("age unknown"). Only a local Postgres (host localhost / 127.0.0.1) is ever touched.
#
# HOW IT FINDS THEM — never by guessing paths: the replay script REGISTERS every --snapshot and --out dir it is given
#   (--register, below) in $STATE/registry.tsv; this script visits only registered dirs, and only acts on one that carries
#   its marker. It deletes only the files the replay writes (marker LAST, so an interrupted clean-up retries), then removes
#   the dir if it is empty — a dir holding anything else keeps that and is logged. REFUSED (logged, never touched): a path
#   that is not absolute, is a symlink, is not owned by you, is / or $HOME, or lies inside ANY git work tree (a repository
#   checkout). Databases: only the nets_replay_ prefix, matched exactly.
#
# WHO CALLS IT: (1) a systemd user timer, hourly (install below); (2) the replay script at the START of every run (covers a
#   machine that was off). A replay holds a SHARED lock on $STATE/run.lock for its whole run; a clean-up needs the EXCLUSIVE
#   lock and skips (exit 0, logged) when a replay is running — it never deletes a snapshot under a running pass. A run that
#   crosses 24 h is cleaned at the next hourly tick after it ends.
#
# LOG: every action (and every DRY-RUN "would delete") goes to stdout and is appended to $STATE/gc.log; under the timer stdout
#   is also in the journal (journalctl --user -u nets-replay-gc). Exit 1 when anything could not be deleted or checked.
#
# Usage:
#   scripts/replay-snapshot-gc.sh [--dry-run] [--max-age-hours 24]   # the clean-up
#   scripts/replay-snapshot-gc.sh --register snapshot|out <dir>       # used by replay-nets-byte-identity.sh
#   scripts/replay-snapshot-gc.sh --adopt <dir>                       # register an existing marked dir (e.g. a snapshot
#                                                                     #   taken before this script existed); refused unmarked
#   scripts/replay-snapshot-gc.sh --status                            # registry, databases, timer state
#   scripts/replay-snapshot-gc.sh --state-dir                         # print $STATE
#   $STATE = $NETS_REPLAY_STATE_DIR, else ${XDG_STATE_HOME:-~/.local/state}/paichart-nets-replay (mode 700).
#   Local Postgres admin URL: $NETS_REPLAY_LOCAL_PG, else DATABASE_URL in this checkout's .env (or the main checkout's).
#
# TIMER — install / uninstall (systemd USER units, no root; reversible):
#   scripts/replay-snapshot-gc.sh --install-timer     # writes ~/.config/systemd/user/nets-replay-gc.{service,timer},
#                                                     #   daemon-reload, enable --now (hourly, Persistent=true)
#   scripts/replay-snapshot-gc.sh --uninstall-timer   # disable --now, remove both units, daemon-reload
#   loginctl enable-linger "$USER"                    # OPTIONAL: lets the timer run while you are logged out (without
#                                                     #   it, it runs while you have a session; Persistent=true catches up
#                                                     #   a missed tick at the next start). Undo: loginctl disable-linger.
#   Check: systemctl --user list-timers nets-replay-gc.timer ; journalctl --user -u nets-replay-gc -n 50
#   WHY a systemd user timer and not crontab: Persistent=true runs a tick missed while the machine was off (user cron has
#   no catch-up); output lands in the journal with the unit's exit status (systemctl --user --failed shows a broken one)
#   instead of cron mail; no root. The unit's ExecStart is this file's absolute path — re-install if the checkout moves.
set -u
PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"   # the timer runs with a minimal PATH; psql/python3/git/flock are system binaries
SELF="$(readlink -f "$0")"; REPO="$(cd "$(dirname "$SELF")/.." && pwd)"
STATE="${NETS_REPLAY_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/paichart-nets-replay}"
REG="$STATE/registry.tsv"; LOG="$STATE/gc.log"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"; UNIT=nets-replay-gc
OUT_MARKER=.nets-replay-out.json; TAB=$'\t'
MAX_AGE_H=24; DRY=0; MODE=gc; ARG1=""; ARG2=""
while [ $# -gt 0 ]; do case "$1" in
  --dry-run) DRY=1; shift;;
  --max-age-hours) MAX_AGE_H="$2"; shift 2;;
  --register) MODE=register; ARG1="${2:-}"; ARG2="${3:-}"; shift 3 2>/dev/null || shift $#;;
  --adopt) MODE=adopt; ARG1="${2:-}"; shift 2 2>/dev/null || shift $#;;
  --status) MODE=status; shift;;
  --state-dir) echo "$STATE"; exit 0;;
  --install-timer) MODE=install; shift;;
  --uninstall-timer) MODE=uninstall; shift;;
  *) echo "unknown arg $1"; exit 2;; esac; done
[[ "$MAX_AGE_H" =~ ^[0-9]+$ ]] && [ "$MAX_AGE_H" -ge 1 ] || { echo "--max-age-hours must be a whole number >= 1"; exit 2; }
( umask 077; mkdir -p "$STATE" ) && chmod 700 "$STATE" || { echo "✗ cannot create $STATE"; exit 1; }

ERRORS=0
log() { local line; line="$(date -u +%FT%TZ) $([ "$DRY" = 1 ] && echo 'DRY-RUN ')$*"; echo "$line"; echo "$line" >> "$LOG"; }
err() { log "ERROR $*"; ERRORS=$((ERRORS + 1)); }
now_s() { date -u +%s; }
# epoch seconds of a UTC timestamp "YYYY-MM-DD HH:MM:SS[.frac]" or a snapshot-id stamp "YYYYMMDDtHHMMSSz"; empty if unparsable
epoch_of() {
  local s="$1"
  if [[ "$s" =~ ^([0-9]{4})([0-9]{2})([0-9]{2})[tT]([0-9]{2})([0-9]{2})([0-9]{2})[zZ] ]]; then
    s="${BASH_REMATCH[1]}-${BASH_REMATCH[2]}-${BASH_REMATCH[3]} ${BASH_REMATCH[4]}:${BASH_REMATCH[5]}:${BASH_REMATCH[6]}"
  elif [[ "$s" =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2}[\ T][0-9]{2}:[0-9]{2}:[0-9]{2}) ]]; then s="${BASH_REMATCH[1]}"
  else return 0; fi
  date -u -d "${s/T/ } UTC" +%s 2>/dev/null || true
}
# json_field <file> <key> — a top-level string/number field, empty if absent or unreadable
json_field() { python3 -I -c 'import json,sys
try: v=json.load(open(sys.argv[1])).get(sys.argv[2],"")
except Exception: v=""
print(v if isinstance(v,(str,int,float)) else "")' "$1" "$2"; }

# path_refusal <dir> — prints a reason when the path must never be touched, nothing when it is acceptable
path_refusal() {
  local p="$1"
  case "$p" in /*) ;; *) echo "not an absolute path"; return;; esac
  [ -L "$p" ] && { echo "is a symlink"; return; }
  [ -d "$p" ] || { echo "not a directory"; return; }
  [ -O "$p" ] || { echo "not owned by $(id -un)"; return; }
  local r; r="$(readlink -f "$p")"
  [ "$r" = / ] || [ "$r" = "$(readlink -f "$HOME")" ] && { echo "is / or \$HOME"; return; }
  case "$r/" in "$REPO"/*) echo "inside the repository checkout $REPO"; return;; esac
  git -C "$r" rev-parse --is-inside-work-tree >/dev/null 2>&1 && { echo "inside a git work tree (a repository checkout)"; return; }
  return 0
}
is_snapshot() { [ -f "$1/manifest.json" ] && [ "$(json_field "$1/manifest.json" source)" = "production (read-only)" ]; }
is_out() { [ -f "$1/$OUT_MARKER" ] && [ "$(json_field "$1/$OUT_MARKER" kind)" = "nets-replay-out" ]; }

reg_add() {   # reg_add <kind> <dir> — idempotent; under a short registry lock (never the run lock)
  ( flock -w 60 7 || { echo "✗ registry lock timeout"; exit 1; }
    grep -qxF "$1$TAB$2" "$REG" 2>/dev/null || printf '%s\t%s\n' "$1" "$2" >> "$REG"; chmod 600 "$REG"
  ) 7>>"$STATE/registry.lock"
}

# ── register / adopt ─────────────────────────────────────────────────────────────────────────────────────────────────
if [ "$MODE" = register ] || [ "$MODE" = adopt ]; then
  dir="${ARG2:-$ARG1}"; [ "$MODE" = adopt ] && dir="$ARG1"
  [ -n "$dir" ] && [ -d "$dir" ] || { echo "✗ need an existing directory"; exit 2; }
  dir="$(cd "$dir" && pwd -P)"
  if [ "$MODE" = register ]; then kind="$ARG1"; case "$kind" in snapshot|out) ;; *) echo "--register snapshot|out <dir>"; exit 2;; esac
  elif is_snapshot "$dir"; then kind=snapshot
  elif is_out "$dir"; then kind=out
  else echo "✗ $dir carries no nets-replay marker (manifest.json from production, or $OUT_MARKER) — not adopted"; exit 1; fi
  why="$(path_refusal "$dir")"; [ -n "$why" ] && echo "⚠️  $dir: $why — registered anyway, but the clean-up will REFUSE to delete it" >&2
  reg_add "$kind" "$dir" || exit 1
  [ "$MODE" = adopt ] && log "adopted $kind $dir"
  exit 0
fi

# ── timer install / uninstall ────────────────────────────────────────────────────────────────────────────────────────
if [ "$MODE" = install ]; then
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_DIR/$UNIT.service" <<EOF
[Unit]
Description=Expire nets-replay production snapshots, scratch databases and outputs older than 24 h
Documentation=file://$SELF

[Service]
Type=oneshot
ExecStart=$SELF
EOF
  cat > "$UNIT_DIR/$UNIT.timer" <<EOF
[Unit]
Description=Hourly nets-replay snapshot retention (24 h)

[Timer]
OnCalendar=hourly
RandomizedDelaySec=300
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl --user daemon-reload && systemctl --user enable --now "$UNIT.timer" || { echo "✗ systemctl --user failed"; exit 1; }
  log "installed $UNIT_DIR/$UNIT.service + $UNIT.timer (ExecStart=$SELF)"
  systemctl --user list-timers "$UNIT.timer" --no-pager
  echo "Linger: $(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null) (yes = runs while logged out; 'loginctl enable-linger' to change)"
  exit 0
fi
if [ "$MODE" = uninstall ]; then
  systemctl --user disable --now "$UNIT.timer" 2>/dev/null
  rm -f "$UNIT_DIR/$UNIT.service" "$UNIT_DIR/$UNIT.timer"; systemctl --user daemon-reload
  log "uninstalled $UNIT.timer and $UNIT.service"; exit 0
fi

# ── local Postgres (never production) ────────────────────────────────────────────────────────────────────────────────
ADMIN_DB=""
resolve_local_pg() {
  local url="${NETS_REPLAY_LOCAL_PG:-}" envf main
  if [ -z "$url" ]; then
    main="$(cd "$(git -C "$REPO" rev-parse --git-common-dir 2>/dev/null)/.." 2>/dev/null && pwd)"
    for envf in "$REPO/.env" "${main:-$REPO}/.env"; do
      [ -f "$envf" ] && url=$(grep -E '^DATABASE_URL=' "$envf" | head -1 | cut -d= -f2- | tr -d '"'"'") && break
    done
  fi
  [ -n "$url" ] || { err "no local Postgres URL (set NETS_REPLAY_LOCAL_PG) — databases not checked"; return 1; }
  ADMIN_DB=$(python3 -I -c 'import sys,urllib.parse as p
u=p.urlsplit(sys.argv[1])
if u.hostname not in ("localhost","127.0.0.1","::1"): sys.exit(3)
print(p.urlunsplit((u.scheme,u.netloc,"/postgres","","")))' "$url") \
    || { err "the Postgres URL is not local (localhost/127.0.0.1) — databases not checked"; ADMIN_DB=""; return 1; }
}

if [ "$MODE" = status ]; then
  echo "state: $STATE"; echo "registry:"; sed 's/^/  /' "$REG" 2>/dev/null || echo "  (empty)"
  resolve_local_pg && psql "$ADMIN_DB" -At -F ' | ' -c "SELECT datname, coalesce(shobj_description(oid,'pg_database'),'(no comment)'),
    pg_size_pretty(pg_database_size(oid)) FROM pg_database WHERE datname LIKE 'nets\_replay\_%' ORDER BY 1;" | sed 's/^/  db: /'
  systemctl --user list-timers "$UNIT.timer" --no-pager 2>/dev/null; exit 0
fi

# ── the clean-up ─────────────────────────────────────────────────────────────────────────────────────────────────────
exec 8>>"$STATE/run.lock"
if ! flock -n -x 8; then log "a nets replay is running (run.lock held) — clean-up skipped this time"; exit 0; fi
NOW=$(now_s); MAX_S=$((MAX_AGE_H * 3600))
log "clean-up start (max age ${MAX_AGE_H} h, state $STATE)"

# remove_known <dir> <marker> <glob>... — delete the named files (marker last), then the dir if empty
remove_known() {
  local d="$1" marker="$2" f; shift 2
  for f in "$@"; do
    [ -f "$f" ] || continue
    if [ "$DRY" = 1 ]; then log "  would delete $f"; else rm -f -- "$f" || err "could not delete $f"; fi
  done
  if [ "$DRY" = 1 ]; then log "  would delete $d/$marker"; return 0; fi
  rm -f -- "$d/$marker" || { err "could not delete $d/$marker"; return 1; }
  [ -d "$d/base-cache" ] && { rmdir "$d/base-cache" 2>/dev/null || log "  kept $d/base-cache (holds files this script does not own)"; }
  if rmdir "$d" 2>/dev/null; then log "  removed dir $d"; else log "  kept dir $d (holds files this script does not own): $(ls -A "$d" | head -5 | tr '\n' ' ')"; fi
}

declare -A GONE=()
if [ -s "$REG" ]; then
  while IFS=$'\t' read -r kind dir; do
    [ -n "$dir" ] || continue
    if [ ! -e "$dir" ]; then GONE["$kind$TAB$dir"]=1; continue; fi
    why="$(path_refusal "$dir")"
    if [ -n "$why" ]; then log "REFUSED $kind $dir: $why"; continue; fi
    case "$kind" in
      snapshot)
        is_snapshot "$dir" || { log "skip snapshot $dir: no marker (manifest.json from production) — untouched"; continue; }
        t=$(json_field "$dir/manifest.json" takenAt); ts=$(epoch_of "$t")
        [ -n "$ts" ] || { err "snapshot $dir: unparsable takenAt '$t' — untouched"; continue; }
        age=$((NOW - ts))
        if [ "$age" -lt "$MAX_S" ]; then log "keep snapshot $dir ($((age / 3600)) h old)"; continue; fi
        log "EXPIRED snapshot $dir (taken ${t}Z, $((age / 3600)) h old)"
        shopt -s nullglob
        remove_known "$dir" manifest.json "$dir"/*.copy "$dir"/*.columns "$dir/schema.dump" "$dir/.copy.sql" "$dir"/base-cache/*.out
        shopt -u nullglob
        [ "$DRY" = 0 ] && [ ! -e "$dir" ] && GONE["$kind$TAB$dir"]=1 ;;
      out)
        is_out "$dir" || { log "skip out $dir: no $OUT_MARKER — untouched"; continue; }
        t=$(json_field "$dir/$OUT_MARKER" snapshotTakenAt); ts=$(epoch_of "$t")
        [ -n "$ts" ] || { err "out $dir: unparsable snapshotTakenAt '$t' — untouched"; continue; }
        age=$((NOW - ts))
        if [ "$age" -lt "$MAX_S" ]; then log "keep out $dir (its snapshot is $((age / 3600)) h old)"; continue; fi
        log "EXPIRED out $dir (snapshot taken ${t}Z, $((age / 3600)) h old)"
        remove_known "$dir" "$OUT_MARKER" "$dir/ids.txt" "$dir/base.out" "$dir/new.out" "$dir/replay.diff" "$dir/logs.txt" "$dir/.load.sql"
        [ "$DRY" = 0 ] && [ ! -e "$dir" ] && GONE["$kind$TAB$dir"]=1 ;;
      *) log "skip unknown registry kind '$kind' for $dir";;
    esac
  done < "$REG"
fi

# databases: exact prefix, local server only
if resolve_local_pg; then
  dbs=$(psql "$ADMIN_DB" -At -F $'\t' -c "SELECT datname, coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database
          WHERE left(datname, 12) = 'nets_replay_' ORDER BY 1;" 2>&1) || { err "could not list databases: $dbs"; dbs=""; }
  while IFS=$'\t' read -r db comment; do
    [ -n "$db" ] || continue
    [[ "$db" =~ ^nets_replay_[a-z0-9_]+$ ]] || { log "skip database $db: unexpected characters"; continue; }
    ts=$(epoch_of "$comment"); src=comment
    [ -n "$ts" ] || { ts=$(epoch_of "${db#nets_replay_}"); src=name; }
    [ -n "$ts" ] || { log "keep database $db: age unknown (no snapshot id in its comment or name) — drop it by hand if stale"; continue; }
    age=$((NOW - ts))
    if [ "$age" -lt "$MAX_S" ]; then log "keep database $db ($((age / 3600)) h old, from its $src)"; continue; fi
    if [ "$DRY" = 1 ]; then log "EXPIRED database $db ($((age / 3600)) h old, from its $src) — would DROP"; continue; fi
    out=$(psql "$ADMIN_DB" -q -c "DROP DATABASE \"$db\";" 2>&1) \
      && log "EXPIRED database $db ($((age / 3600)) h old, from its $src) — dropped" \
      || err "could not drop database $db: $out"
  done <<< "$dbs"
fi

# forget registry entries whose dir no longer exists
if [ "$DRY" = 0 ] && [ "${#GONE[@]}" -gt 0 ]; then
  ( flock -w 60 7 || exit 1
    tmp="$REG.tmp.$$"; : > "$tmp"
    while IFS= read -r line; do [ -n "${GONE[$line]+x}" ] || printf '%s\n' "$line" >> "$tmp"; done < "$REG"
    chmod 600 "$tmp"; mv "$tmp" "$REG" ) 7>>"$STATE/registry.lock" || err "could not rewrite $REG"
  log "registry: forgot ${#GONE[@]} entr$([ "${#GONE[@]}" = 1 ] && echo y || echo ies) whose dir is gone"
fi
log "clean-up done ($ERRORS error(s))"
[ "$ERRORS" = 0 ]
