# Read-only Kubernetes MCP service for the Phase-4 kind validation rig (E1 reference service).
# Serves the read-only verb-enum surface as streamable-http on $PORT (default 3107; rig runs PORT=3112), non-root.
# Run with --network host so it can reach the kind API server at 127.0.0.1:<port>, and mount a
# READ-ONLY ServiceAccount kubeconfig (never the kind admin kubeconfig):
#   docker run -d --name k8s-mcp --network host \
#     -v /root/kind-k8s-rig/readonly.kubeconfig:/app/kubeconfig:ro \
#     --memory 512m --cpus 0.5 k8s-mcp-readonly:phase4
FROM python:3.12-slim
RUN useradd --create-home --shell /usr/sbin/nologin k8smcp
WORKDIR /app
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py /app/server.py
ENV KUBECONFIG=/app/kubeconfig
RUN chown -R k8smcp:k8smcp /app
USER k8smcp
EXPOSE 3107
CMD ["python", "/app/server.py"]
