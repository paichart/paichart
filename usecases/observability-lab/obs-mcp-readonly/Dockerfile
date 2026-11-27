# Read-only observability harvest MCP — Phase-4 promstack rig.
# Same isolation rationale as the nornir/tf rigs: capped, non-root container.
# Hardening (2026-11-27): exact pins (requirements.txt = the running
# image's pip freeze); the read-only root, tmpfs, capabilities, CPU cap, logs and healthcheck are in docker-compose.yml.
FROM python:3.12-slim
RUN useradd --create-home --shell /usr/sbin/nologin obs
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY server.py /app/server.py
RUN chown -R obs:obs /app
USER obs
# Never write .pyc files: the root filesystem is read-only at run time.
ENV PYTHONDONTWRITEBYTECODE=1
EXPOSE 3107
CMD ["python", "/app/server.py"]
