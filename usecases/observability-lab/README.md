# Observability lab — a live monitoring stack to run the config pipeline against

Prometheus + Grafana + an OpenTelemetry collector, plus the **read-only MCP service** the pipeline
harvests through. Free software; no account needed.

Pairs with: [`protocols/observability-config-protocol.md`](../../protocols/observability-config-protocol.md) ·
[`descriptors/observability-readonly-descriptor.json`](../../descriptors/observability-readonly-descriptor.json) ·
worked output in [`examples/observability-config-change-report.md`](../../examples/observability-config-change-report.md).

## Prerequisites

`docker` with Compose v2.

## Bring-up

```bash
cp .env.example .env     # then edit BOTH values — compose fails loudly if either is unset
docker compose up -d --build
```

Check all three are up, and that Prometheus parses its own config:

```bash
curl -s -o /dev/null -w "prometheus:%{http_code}\n" http://127.0.0.1:9090/-/ready
curl -s -o /dev/null -w "grafana:%{http_code}\n"    http://127.0.0.1:3001/api/health
docker exec obs-prometheus promtool check config /etc/prometheus/prometheus.yml | tail -1
```

## The two credentials, and why they are separate

Grafana **forces an admin password change at first GUI login**, and a service that inherited the
admin credential breaks silently at that moment — a live 401 mid-run, which is exactly how we found
it. So the harvest service authenticates as a dedicated **Viewer** service account (`obs-harvest`),
decoupled from the human login. If you reset Grafana state (`docker compose down -v`), recreate it:

```bash
curl -u admin:"$GRAFANA_ADMIN_PASSWORD" -H 'Content-Type: application/json' \
  http://127.0.0.1:3001/api/admin/users \
  -d "{\"name\":\"Observability Harvest Service\",\"login\":\"obs-harvest\",\"password\":\"$OBS_HARVEST_PASSWORD\"}"
```

## What the pipeline can witness — and the distinction that matters

| Artifact | Witnessed via | Quotable as a rollback source? |
|---|---|---|
| Prometheus config | the **running** config API | Yes — but it is a NORMALIZED rendering (comments stripped, defaults expanded), not your file bytes |
| OTel collector config | the as-deployed **file** (the collector has no config API) | Yes — the file *is* the artifact |
| Grafana dashboard | the API model (the server injects `id`/`version`) | **No** — review evidence only; roll back from the prior file |
| Grafana datasources | the API, **deliberately redacted** | **Never** — placeholders would enter a "verbatim" restore |

That table is the domain's load-bearing design decision, and it was settled by byte-comparing the API
rendering against the file rather than by assuming they matched.

**Secret hygiene, stated honestly**: this baseline carries no credentials, so the Prometheus config is
safe to read as-is. A real stack's `remote_write` auth **would** appear in that API's output — the
service scrubs Grafana payloads but does not scrub Prometheus config, and the platform's artifact
redaction is a coarse backstop, not a guarantee.

## Point a pipeline at it

Copy `descriptors/observability-readonly-descriptor.json`, set `endpoint` to wherever **your hub** can
reach the service, and put that URL in the task description.

Objectives with real gaps here: add a scrape job; add a recording or alerting rule; provision a
dashboard; add a `memory_limiter` processor to the collector. All four have been run end to end —
the collector one is the published example, and it was applied to a live stack afterwards.

## Teardown

```bash
docker compose down          # add -v to wipe Grafana state too
```

## Honest scope

A local stack is not your production monitoring platform, and the service authenticates with a lab
credential rather than a per-user identity.
