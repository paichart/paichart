# Dockerized sydasif/nornir-mcp-server for the Phase-4 cEOS validation rig.
# Serves the read-only NAPALM getter surface as streamable-http on :3107, non-root, isolated.
# Isolation rationale (Steve, 2026-06-26): run this unaudited third-party dep tree in a capped,
# non-root container rather than as a host process next to live paichart.
FROM python:3.12-slim

RUN useradd --create-home --shell /usr/sbin/nologin nornir

WORKDIR /app

# Install the third-party MCP server + deps from a source tarball (no git needed in the image).
# Pinned to main for this lab; pin a commit SHA for anything longer-lived.
RUN pip install --no-cache-dir \
    "https://github.com/sydasif/nornir-mcp-server/archive/refs/heads/main.tar.gz"

# streamable-http launcher (repo defaults to stdio; this overrides transport without editing the repo)
COPY run_http.py /app/run_http.py

# Nornir inventory — _get_nornir() reads `config.yaml` from the process CWD (/app);
# hosts/groups/defaults are referenced relatively from it.
COPY config.yaml hosts.yaml groups.yaml defaults.yaml /app/

RUN chown -R nornir:nornir /app
USER nornir

EXPOSE 3107
CMD ["python", "/app/run_http.py"]
