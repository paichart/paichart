# The published otel/opentelemetry-collector-contrib:0.116.0 image is BROKEN as pulled here
# (verified 2026-09-10): its binary is DYNAMICALLY linked (readelf: interpreter
# /lib64/ld-linux-x86-64.so.2 — ldd misreports it as static) while the image ships no filesystem,
# so exec fails ENOENT in any container. Repack the same pinned binary onto a glibc base.
FROM otel/opentelemetry-collector-contrib:0.116.0 AS src
FROM debian:bookworm-slim
COPY --from=src /otelcol-contrib /otelcol-contrib
ENTRYPOINT ["/otelcol-contrib"]
