# Browser Automation Service — MCP Server

Playwright-based browser automation for the pAIchart hub: scrape pages with CSS selectors (with
pagination), fill forms, click elements, take screenshots, generate PDFs, run page scripts, record
traces. **pAIchart programs use `scrape_page` through this service to fetch their design artifacts
(`requirements.md`, `topology.json`) from a URL** — the hub has no generic URL-fetch tool by design;
the fetch runs here, in a container, not in the hub process.

- Transport: MCP over SSE — `GET /sse` + `POST /message`; `GET /health`; `GET /tools` (the schemas).
- Port: `BROWSER_SERVICE_PORT` (default `3100`). The self-host compose binds it to **127.0.0.1 only**.
- Image: `mcr.microsoft.com/playwright:v1.57.0-jammy` (Playwright is Apache-2.0; 1.5 GB download, ~3 GB on disk).
- Env: only `BROWSER_SERVICE_PORT`. No keys, no secrets. (Browser pool size is fixed at 3 in code.)

## Run it (self-host)
```bash
docker compose -f docker-compose.self-host.yml up -d --build    # from the repo root
curl -s localhost:3100/health
```
Then `npm run seed:browser-service` (from the repo root, `.env` present) registers it in the hub as a first-party
service — its name is reserved, so it is seeded rather than registered. `docs/SELF-HOST-RUN-SHEET.md` step 9b.

## Tools
`scrape_page`, `fill_form`, `click_element`, `take_screenshot`, `generate_pdf`, `run_script`, `trace_session`
— parameter schemas: `GET /tools`, or `registry(action: 'tools', service_name: 'browser-automation-service')`
once registered.

## Develop
```bash
npm install && npm run build && BROWSER_SERVICE_PORT=3100 node dist/index.js
```
