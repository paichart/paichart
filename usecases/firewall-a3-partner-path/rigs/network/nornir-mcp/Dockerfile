# pAIchart's read-only network reference service (server.py) for the Phase-4 cEOS validation rig.
# Serves list_devices / fetch_data / show_commands as streamable-http on :3107 (/mcp), non-root.
# Replaces the third-party server the image used to pip-install from a GitHub tarball (that account is gone, so the
# image could no longer be built). Same Python and the same library pins as the image it replaces, so NAPALM/Nornir/
# netmiko answer with the same bytes (proven by replaying recorded calls against both).
#
# Build context = this folder plus the four inventory files from ../nornir/ (or a variant's ./nornir/):
#   cp ../nornir/{config,hosts,groups,defaults}.yaml . && docker build -t nornir-mcp-rig:<tag> .
FROM python:3.12.14-slim

RUN useradd --create-home --shell /usr/sbin/nologin nornir

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt && pip check

COPY server.py /app/server.py

# Nornir inventory: server.py reads `config.yaml` from the process CWD (/app); hosts/groups/defaults are relative to it.
COPY config.yaml hosts.yaml groups.yaml defaults.yaml /app/

# Root-owned and read-only to the service user: the process writes nothing (Nornir logging is off).
RUN chmod -R a-w /app
USER nornir

EXPOSE 3107
CMD ["python", "/app/server.py"]
