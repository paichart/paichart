#!/usr/bin/env bash
# Tear down the Phase-4 Terraform rig (LocalStack + the read-only service + the network).
# The cloudflared connector (if installed as a service) is left alone — manage it separately.
set -uo pipefail
docker rm -f localstack tf-readonly 2>/dev/null || true
docker network rm tf-rig-net 2>/dev/null || true
echo "rig torn down (localstack + tf-readonly removed). cloudflared service untouched."
