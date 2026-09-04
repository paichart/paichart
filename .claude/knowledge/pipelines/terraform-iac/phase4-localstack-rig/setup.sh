#!/usr/bin/env bash
# Phase-4 Terraform rig — stand up LocalStack + apply the workspace + run the read-only service.
# Run on the droplet from this directory:  bash setup.sh
set -euo pipefail
cd "$(dirname "$0")"
NET=tf-rig-net
TFIMG=hashicorp/terraform:latest

docker network create "$NET" 2>/dev/null || true

echo "== 1. LocalStack (sandbox AWS, s3) =="
docker rm -f localstack >/dev/null 2>&1 || true
docker run -d --name localstack --network "$NET" -p 4566:4566 -e SERVICES=s3 localstack/localstack:3 >/dev/null
echo -n "waiting for localstack"
for i in $(seq 1 40); do
  curl -sf http://localhost:4566/_localstack/health >/dev/null 2>&1 && break
  echo -n "."; sleep 1
done; echo " ready"

echo "== 2. terraform init + apply against LocalStack (writes workspace/terraform.tfstate) =="
docker run --rm --network "$NET" -v "$PWD/workspace":/wk -w /wk "$TFIMG" init -no-color >/dev/null
docker run --rm --network "$NET" -v "$PWD/workspace":/wk -w /wk "$TFIMG" apply -auto-approve -no-color | tail -2

echo "== 3. read-only Terraform MCP service on host :3113 (dedicated port since 2026-07-15) =="
docker rm -f tf-readonly >/dev/null 2>&1 || true
docker build -q -t tf-readonly ./tf-mcp-readonly >/dev/null
docker run -d --name tf-readonly --network "$NET" -p 127.0.0.1:3113:3107 \
  -e PORT=3107 -e TF_STATE_PATH=/rig/workspace/terraform.tfstate \
  -v "$PWD/workspace":/rig/workspace:ro tf-readonly >/dev/null

echo "== rig up =="
docker ps --filter name=localstack --filter name=tf-readonly --format "  {{.Names}}: {{.Status}}"
echo "  read-only service: http://localhost:3113/mcp  (public: https://tf-lab.paichart.app/mcp — dedicated route)"
