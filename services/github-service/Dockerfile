# GitHub MCP proxy: Caddy injects the read-only GitHub token and forwards to the official github-mcp-server
# (a separate container, pinned by digest in docker-compose.yml, holding no token). See Caddyfile + README.md.
# Pinned by version + index digest (dev-ops S3 / sec-ops F5): this container HOLDS the token. Re-pin with the server.
FROM caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f

# The caddy binary ships with a cap_net_bind_service FILE capability; with cap_drop ALL the exec is refused ("operation not
# permitted"). We bind :8000 and need no capability, so drop it from the binary instead of adding one back (measured 2026-10-18).
RUN apk add --no-cache libcap && setcap -r /usr/bin/caddy && apk del libcap

COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 8000

# Liveness only (local); the Hub uses the deep /healthz.
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:8000/livez || exit 1
