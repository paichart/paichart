# Browser Automation Service — MCP Server

Playwright-based browser automation for the pAIchart hub: scrape pages with CSS selectors (with
pagination), fill forms, click elements, take screenshots, generate PDFs, run page scripts, record
traces. **pAIchart programs use `scrape_page` through this service to fetch their design artifacts
(`requirements.md`, `topology.json`) from a URL** — the hub has no generic URL-fetch tool by design;
the fetch runs here, in a container, not in the hub process.

- Transport: MCP over SSE — `GET /sse` + `POST /message`; `GET /health`; `GET /tools` (the schemas).
- Port: `BROWSER_SERVICE_PORT` (default `3100`). The self-host compose binds it to **127.0.0.1 only**.
- Image: `mcr.microsoft.com/playwright:v1.57.0-jammy` (Playwright is Apache-2.0; the image is ~1.5 GB).
- Env: `BROWSER_POOL_SIZE` (default 3; 2 in the self-host compose), `BROWSER_POOL_TIMEOUT` ms, `BROWSER_MAX_PAGES`.
  No keys, no secrets.

## Run it (self-host)
```bash
docker compose -f docker-compose.self-host.yml up -d --build    # from the repo root
curl -s localhost:3100/health
```
Then allowlist `127.0.0.1:3100` for the hub and register it from
`descriptors/browser-automation-descriptor.json` — `docs/SELF-HOST-RUN-SHEET.md` step 9b has the exact steps.

## Tools
`scrape_page`, `fill_form`, `click_element`, `take_screenshot`, `generate_pdf`, `run_script`, `trace_session`
— parameter schemas: `GET /tools`, or `registry(action: 'tools', service_name: 'browser-automation-service')`
once registered.

## Develop
```bash
npm install && npm run build && BROWSER_SERVICE_PORT=3100 node dist/index.js
```
