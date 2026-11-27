#!/usr/bin/env bash
# Start the cEOS rig's device service, hardened (same flags as docker-compose.yml). pAIchart's own read-only server since
# 2026-11-26.
#   ./run-hardened.sh                          # the 2-node lab: network clab-np, image nornir-mcp-rig:latest
#   ./run-hardened.sh clab-igp nornir-mcp-rig:igp   # the IGP triangle (igp-triangle/README.md)
set -euo pipefail
NET="${1:-clab-np}"
IMAGE="${2:-nornir-mcp-rig:latest}"
docker rm -f nornir-mcp >/dev/null 2>&1 || true
docker run -d --name nornir-mcp --restart unless-stopped --network "$NET" -p 127.0.0.1:3107:3107 \
  --read-only --tmpfs /tmp:size=16m,mode=1777 --security-opt no-new-privileges:true --cap-drop ALL \
  --cpus 0.5 --memory 256m --log-opt max-size=10m --log-opt max-file=3 \
  --health-cmd "python -c \"import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:3107/health', timeout=5).status == 200 else 1)\"" \
  --health-interval 30s --health-timeout 10s --health-retries 3 --health-start-period 15s \
  "$IMAGE"
