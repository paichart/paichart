#!/usr/bin/env bash
# Generate an RS256 signing key pair for pAIchart and print the .env lines.
#
# WHY: auth is RS256-only (JWT_ACCESS_SECRET retired 2026-06-05). A fresh install
# needs JWT_PRIVATE_KEY_BASE64 / JWT_PUBLIC_KEY_BASE64 / JWT_KEY_ID, and until
# 2026-09-04 the only instructions lived in a private runbook — the cold-start
# test stalled on the placeholder. This script is the missing step.
#
# Usage:
#   scripts/generate-jwt-keys.sh            # prints the three lines; paste into .env
#   scripts/generate-jwt-keys.sh >> .env    # append directly (remove the placeholders first)
#   scripts/generate-jwt-keys.sh mykid      # custom kid (default: paichart-YYYY-MM)
#
# Rotation (existing installs): keep the OLD pair as JWT_*_PREV_BASE64 / JWT_KEY_ID_PREV
# with JWT_KEY_PREV_EXPIRES ~7 days out, so tokens signed by the old key still verify.
set -euo pipefail
KID="${1:-paichart-$(date -u +%Y-%m)}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
umask 077
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$TMP/priv.pem" 2>/dev/null
openssl rsa -in "$TMP/priv.pem" -pubout -out "$TMP/pub.pem" 2>/dev/null
echo "JWT_PRIVATE_KEY_BASE64=\"$(base64 -w0 "$TMP/priv.pem")\""
echo "JWT_PUBLIC_KEY_BASE64=\"$(base64 -w0 "$TMP/pub.pem")\""
echo "JWT_KEY_ID=\"$KID\""
