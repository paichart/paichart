# Read-only observability harvest MCP — Phase-4 promstack rig.
# Same isolation rationale as the nornir/tf rigs: capped, non-root container.
FROM python:3.12-slim
RUN useradd --create-home --shell /usr/sbin/nologin obs
WORKDIR /app
RUN pip install --no-cache-dir "fastmcp<3" httpx
COPY server.py /app/server.py
RUN chown -R obs:obs /app
USER obs
EXPOSE 3107
CMD ["python", "/app/server.py"]
