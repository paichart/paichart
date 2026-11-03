# GitHub MCP Service (read-only file source for kept files)

The **file source** for kept files: the platform reads the exact bytes of a config file from **one pinned Git repository**
through GitHub's official MCP server, keeps them, and applies an Author's edits to them by reference. Live reads (cluster,
Terraform state, device) stay evidence. Domains that read it: kubernetes-gitops, terraform-iac, network-provisioning.

**Self-host:** optional, behind the compose profile `git` — `docs/SELF-HOST-RUN-SHEET.md` step 9c (token, pin, start, seed, prove).

## Shape

- **Two containers** (`docker-compose.yml` in production; `docker-compose.self-host.yml`, profile `git`, on a self-host), on their **own bridge network `github-net`** (no sibling container can use the
  token-injecting proxy):
  - `mcp-github-server` (self-host: `paichart-github-server`) — the official `ghcr.io/github/github-mcp-server` v2.0.2, **pinned by digest**, `http` mode,
    `--read-only --tools get_file_contents`, user 65534, read-only filesystem, all capabilities dropped, **no token, no host
    port**.
  - `mcp-github` (self-host: `paichart-github`) — this Caddy proxy (`caddy:2.11.7-alpine`, **pinned by digest**), user 65534, all capabilities dropped (the
    image strips caddy's file capability so it can exec), host `127.0.0.1:3110` → container `8000`.
- **Routes** (everything else is 404): `/livez` (proxy liveness, the container healthcheck) · `/healthz` GET/HEAD only — one
  authenticated `GET /rate_limit` (is the token valid? names no repo), mapped to **200 "ok"** on 2xx and **503** otherwise (the Hub reads any status < 500
  as healthy, so a revoked token must not pass through as 401) · `/mcp` POST/GET/DELETE — token injected per request (the
  server takes it per request in HTTP mode and ignores its environment), every `X-MCP-*` and `Mcp-Param-*` header stripped.
- **Transport**: streamable-http → `http://localhost:3110/mcp`. The server is **stateless** (no `Mcp-Session-Id`).
- **Tool**: `get_file_contents` only. A file read returns `content[0]` (a status line) and an EMBEDDED RESOURCE item
  (`type: 'resource'`) whose `resource.text` is the file, byte-identical to the repo, with a
  `repo://<owner>/<repo>/sha/<commit>/contents/<path>` URI pinning the commit (probed 2026-10-18). A directory path returns a
  listing. Select the file by `type === 'resource'`, never by position.
- **Never** route held reads through `workflow.execute` — `validateServiceResponse` runs only there and can alter the text.

## Access — admin-only, deliberately

Seeded `publicAccess: false`: only admins (and admin-launched pipelines) can call it. **Measured 2026-10-18:** the
fine-grained token READS ANY PUBLIC REPO (`owner`/`repo` are free arguments), and the server does NOT enforce an
`Mcp-Param-Owner/Repo` pin against them. So the repo pin belongs to the platform's held-file descriptor (refuse capture when
owner/repo differ; record the commit sha) — required before any descriptor ships. Flipping `publicAccess` to `true` is an
**owner decision** (every account incl. demo users; one shared 5,000/h quota), not a follow-on step.

## The platform pin, capture and persist

The rules for operators (what the pin means, the branch rule, limits on a self-host) are canonical in
[`docs/SELF-HOST-KEPT-FILES.md`](../../docs/SELF-HOST-KEPT-FILES.md#reading-kept-files-from-git-optional); this section is the mechanism.

- **One pin, two gates.** `lib/mcp/server/config/git-file-source-pin.js` (`GIT_FILE_SOURCE_PINS`): the repo named by the hub's
  `GIT_FILE_SOURCE_PIN=<owner>/<repo>` (unset = the platform's own lab repo; a malformed value stops the hub's MCP server at startup),
  compared lower-cased; `path` required and safe (no `..`/`.`/empty segment, `%`, `\`, control or bidi character); `ref` absent /
  `main` / `refs/heads/main`; `sha` refused. At CALL time `validateServiceCall` refuses a breaking call with `PINNED_ARGUMENT`
  (CRITICAL); at CAPTURE time a breaking read (arguments or the served URI) is a `source-not-pinned` refusal row. The token can
  read any public repo, so the pin — host configuration, never a task or an agent — is the boundary.
- **More than one repo** (a customer's own): register a separate service row whose held-file declaration names its own
  `gitPin` — set only by a human registrant.
- **Capture** (held-bytes descriptor, own entry version 1): only on a leg whose protocol is a Git file source
  (`GIT_FILE_SOURCE_PROTOCOLS`); the file is `content[type=resource].resource.text`; the commit from the URI lands in
  `held_file_refs.sourceRevision`; a directory read holds nothing (`notAFileRead`); a plaintext `kind: Secret`
  (`data`/`stringData`) is refused `secret-manifest`, its bytes never stored.
- **Persist (G-1).** The persisted `toolCalls` never carry a blob id: on a successful call the status line beside the file
  ("…(SHA: …)") and a directory listing are REPLACED at `content[0]` with a placeholder (index kept). The model saw the original.
- **Platform row.** An agent can never `registry` delete or update this row (no `ownerId` ⇒ `PLATFORM_SERVICE_AGENT_MUTATION_REFUSED`
  under `callingExecutionId`); a human admin can.

## Token

A fine-grained personal access token, **read-only**: a public repo needs "Public repositories (read-only)" and no permissions;
a private one needs that one repo with `Contents: Read-only`. It lives only in this service's `.env` (chmod 600, never
committed — `.env.example`); the server container never sees it. The deep health check (`/healthz`) turns 503 when the token
is missing, revoked or expired (it does not prove access to the pinned repo; a lost grant shows on the first read). Rotate by replacing the line and recreating the `github` container.

## Upgrading (server or proxy)

Re-pin by digest only, server and proxy together:
1. `docker pull ghcr.io/github/github-mcp-server:<tag>`; read the release notes and the repo's security advisories; if GitHub
   publishes provenance, `gh attestation verify oci://ghcr.io/github/github-mcp-server@sha256:<new> --owner github`.
2. Read `--help` / `http --help` for new flags; grep the binary's strings for `X-MCP-` and `Mcp-Param-` and confirm the
   proxy's wildcard strips still cover them.
3. Re-run: the header-widening check (one tool listed whatever the headers), the file-read shape probe (resource item,
   byte-identical; status line still at `content[0]`, else re-check the G-1 elision), whether `Mcp-Param-*` is now enforced (it
   was not in v2.0.2), and whether any `structuredContent` with a `sha` key appeared (every file read would then refuse
   `raw-digest-present`, by design — read the capture refusals before relaxing anything).
4. Update the digest in `docker-compose.yml` AND `docker-compose.self-host.yml` (`test-git-file-source-pin-env` P5 pins them equal) (and `Dockerfile` for caddy) and re-pull the schema:
   `python3 scripts/pull-mcp-schemas.py 3110 /tmp/github.json get_file_contents` → `scripts/seed-data/github-service-tools.json`.
5. Never set `GITHUB_MCP_PROFILING_ENABLED`.
