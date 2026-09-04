# Deployment Discovery Prompt

**Last Updated**: 2026-03-10 (Docker services: production-first guidance, 6 services)
**Status**: Blue-Green Deployment v5.0 - Zero-downtime with Docker MCP Services
**Confidence**: Very High - Production-tested blue-green + Docker orchestration
**Last Validated**: 2026-03-10 - All 6 Docker MCP services healthy on production
**Production Server**: <PROD_HOST> (paichart.app)

## 🆕 2026-09-04 — Cold-Start Health (self-host readiness; replayable)

```bash
# Static tripwires — the template drift the 2026-09-04 cold-start found, pinned so it cannot silently return.
grep -c '^APP_BASE_URL=' .env.example                          # expect 1 — it was defined TWICE (prod first; dotenv keeps the first → self-hosts advertised paichart.app as OAuth issuer)
grep -c 'paichart\.app' .env.example                           # expect 0 — the template must point at localhost; prod values come from the deploy workflow
grep -c 'DATABASE_URL=' package.json                           # expect 0 — mcp:http:dev used to hardcode one and silently ignore .env
grep -c '"jwt:keys"' package.json                              # expect 1 — the RS256 generator a stranger needs (scripts/generate-jwt-keys.sh)
ls docs/RUNNING.md docs/OAUTH-SETUP.md | wc -l                 # expect 2 — stranger-facing docs (every npm script they cite must exist)
grep -c 'migrate dev' scripts/seed-database.ts                 # expect 0 — D7 CLOSED 2026-09-04: db:seed is db push + idempotent seeds; a 'migrate dev' reappearing here re-opens the drift class
```

```bash
# Template ↔ code parity (every key in .env.example must be read by SOME entrypoint; audit against ALL of them —
# a lib/app-only scan wrongly flagged MCP_HTTP_PORT, which only mcp-server-http-clean.js reads).
python3 - <<'PY'
import re,subprocess
cmd="grep -rhoE 'process\\.env\\.[A-Z][A-Z0-9_]+' lib app components server.ts server.js dev-server.js mcp-server-v5.js mcp-server-http-clean.js ecosystem.config.js scripts/*.ts scripts/*.js 2>/dev/null"
used=set(re.findall(r'process\.env\.([A-Z][A-Z0-9_]+)',subprocess.run(cmd,shell=True,capture_output=True,text=True).stdout))
keys=re.findall(r'^([A-Z][A-Z0-9_]+)=',open('.env.example').read(),re.M)
print("unread template keys:",[k for k in keys if k not in used] or "none")   # expect none
PY
```

**Replay procedure** (manual, ~10 min; run after changes to `.env.example`, npm scripts, seeds, or the auth/OAuth
boot path — record the result in `cline_docs/reviews/open-source-readiness-2026-09-03/PHASE3-COLDSTART.md`):

```bash
git clone -q "$PWD" /tmp/cold-start && cd /tmp/cold-start
createdb copov15_coldstart                      # EMPTY — the point is the empty-DB path
cp .env.example .env && sed -i 's#^DATABASE_URL=.*#DATABASE_URL="postgresql://…/copov15_coldstart"#' .env
npm run jwt:keys >> .env                        # then delete the two placeholder JWT_*_BASE64 lines
npm ci && npx prisma db push && npx prisma generate && npm run db:indexes
npm run dev &  npm run mcp:http:dev &           # two processes — that IS the finding B4 taught
curl -s -o /dev/null -w '%{http_code}\n' --max-time 120 localhost:3000/api/health    # expect 200 (first hit compiles 15–20s — not a hang)
curl -s -o /dev/null -w '%{http_code}\n' --max-time 300 localhost:3000/login         # expect 200
curl -s localhost:8080/.well-known/oauth-authorization-server | grep -o '"issuer":"[^"]*"'   # expect the template's localhost, NOT paichart.app
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/mcp                           # expect 401 — auth posture intact with no token
```
Pitfalls that cost time on 2026-09-04: kill the **node child**, not the `npm` wrapper (the child keeps the port →
the next boot dies with EADDRINUSE and probes race two servers); `pgrep -f cold-start` matches your own shell;
the MCP server reads `.env` only if you `source` it or run via npm. Drop the DB and `rm -rf /tmp/cold-start` after.

## 🆕 2026-08-18 — build-guard + workflow-parse tripwires

```bash
# 2026-08-19: deploy logic EXTRACTED to scripts/deploy/blue-green-deploy.sh (the old inline
# heredoc sat AT the parse ceiling); the build-guard greps retarget to the script:
grep -c "MemoryMax=5G" scripts/deploy/blue-green-deploy.sh   # expect 1 — the SUM cap; 3G/4G reappearing re-opens the 2026-08-18 kills (4G sat AT the measured 4.06G sum)
grep -c '"\$rc" -eq 143' scripts/deploy/blue-green-deploy.sh # expect 1 — memcg CHILD kills surface as 143; dropping it un-diagnoses cap kills
# Workflow still PARSES (the silent-death tell — paths-ignore .github/** means a broken parse
# just stops push deploys from existing; guards the WHOLE file, not just the deploy step):
gh workflow list | grep -c "Production Deploy (Blue-Green)"      # expect 1 — the file PATH showing instead of the name = parse failure
```
The parse-ceiling class is REMOVED for the deploy step (its residual `run:` is small and the
script has no ceiling — rationale comments live inline there again). The ~21000
expression/scalar ceiling STILL applies to every other workflow scalar; `workflow-lint.yml`
(actionlint + 20K run-scalar tripwire, triggered ON `.github/**` — the exact trigger the deploy
workflow ignores) guards it at push time.

## 🆕 2026-06-25 — Harness output-guard feature flags (env-var + restart to toggle)

```bash
# The two flags + where they are documented; both default OFF (ships dark)
grep -rn "CONNECTED_OUTPUT_SANITIZE_ENABLED\|ARTIFACT_SECRET_REDACT_ENABLED" .env.example .env.production.template lib/ app/
```
`CONNECTED_OUTPUT_SANITIZE_ENABLED` (R9 sanitize) and `ARTIFACT_SECRET_REDACT_ENABLED` (R10 redact) are **env-var, default-OFF in code but ON in prod since 2026-06-29** (`f7398004` — durable literals in `production-deploy.yml` + the `ecosystem.config.js` passthrough, because `.env.production` is regenerated every deploy). No live toggle. To enable: set `=true` in `.env.production` + `pm2 restart <app>` (env is read at process start). To kill: `=false`/remove + restart. The `=false` in `.env.production.template` / `.env.example` is the safe CODE default and is NOT the prod state — check the deploy workflow or `pm2 jlist`, never the template. Full ref + enable-gates: `.claude/knowledge/domain/harness/harness-output-guards.md`.

## 🆕 2026-05-24 Session — Run These Greps FIRST (Perimeter + Monitoring)

This session shipped network/TLS lockdown + monitor-script fixes + workflow plumbing fixes. Surface via:

```bash
# infra/ — manual-deploy ops configs (new convention, mirror prod via SSH)
ls infra/{ufw,nginx,cron,fail2ban}/

# Perimeter: UFW :443 → CF CIDRs only (15 IPv4 + 7 IPv6)
cat infra/ufw/cf-only-443.sh
ssh <PROD_USER>@<PROD_HOST> 'ufw status numbered'   # 22 CF rules + SSH + :80 only

# nginx AOP mTLS (CF Authenticated Origin Pulls)
cat infra/nginx/cf-aop-snippet.conf
ssh <PROD_USER>@<PROD_HOST> 'grep -A2 ssl_verify_client /etc/nginx/sites-enabled/paichart.app'

# Cron 3-way fix (SHELL=bash + () wrapping + env source) — addresses 4-month silent failure
cat infra/cron/paichart-monitors.cron
ssh <PROD_USER>@<PROD_HOST> 'crontab -l'

# GH Actions workflows: --resolve CF-bypass removed (caused post-lockdown deploy fail)
grep -n "paichart.app" .github/workflows/deployment-status.yml .github/workflows/production-deploy.yml

# Lesson learned (cf-bypass reviews MUST enumerate CI/CD)
cat cline_docs/follow-ups/cf-bypass-review-must-enumerate-cicd-2026-05-24.md

# CF Bot Fight Mode (2026-05-26): DISABLED — was Managed-Challenging datacenter
# DCR POSTs (ChatGPT connector from Azure aiohttp) → "registration endpoint
# returned 403". Free-tier BFM is NOT WAF-skippable; fix is BFM OFF. KEEP the
# WAF Skip rule for /oauth + /mcp + /.well-known (Skip ALL components).
# nginx real-IP restoration (needed for per-client limit_req + clientIp()):
ssh <PROD_USER>@<PROD_HOST> 'grep -E "set_real_ip_from|real_ip_header" /etc/nginx/conf.d/cloudflare-realip.conf | head'
# Edge-block tell-tale: discovery GETs hit nginx access.log but blocked POSTs do
# NOT. Confirm exact mitigation in CF dashboard → Security → Events ("Bot fight mode").
# App-level DCR backstop: AuthManager.checkRegisterRateLimit (30/min/IP, commit 8f19afae)
grep -n "checkRegisterRateLimit" lib/auth/oauth/auth-manager.ts lib/mcp/server/routes/oauth-flow-routes.ts
```

**Pending HIGH ops follow-ups** (file inventory):
- `cf-ip-range-refresh-cron-2026-05-24.md` — automate quarterly CF range refresh
- `activity-retention-365d-soc2-2026-05-24.md` — extend compliance-monitor.js from 180→365d

---

## Investigation Scope
Comprehensive discovery of deployment architecture, multi-server configuration, production readiness patterns, deployment strategies, and disaster recovery capabilities for the pAIchart platform.

## Critical Production Information (2025-12-22)

### Current Production State
```bash
# Server Details
echo "Server IP: <PROD_HOST>"
echo "Domain: paichart.app"
echo "Node Version: v20.19.5"
echo "Admin Email: system@paichart.com"
echo "PM2 Services: paichart-web, paichart-mcp"

# Check current Node version
node --version  # Should show v20.19.5

# Check PM2 services
pm2 list

# Verify admin user
psql -U postgres -d copov15 -c "SELECT email, role FROM \"User\" WHERE role IN ('SUPER_ADMIN', 'ADMIN');"
```

### GitHub Actions Deployment
```bash
# Check GitHub Secrets configuration
echo "Required GitHub Secrets:"
echo "- PAICHART_GITHUB_CLIENT_ID_V2 (not GITHUB_CLIENT_ID - blocked by GitHub)"
echo "- PAICHART_GITHUB_CLIENT_SECRET_V2 (not GITHUB_CLIENT_SECRET - blocked)"
echo "- DATABASE_URL"
echo "- JWT_SECRET"
echo "- ARTIFACT_SIGNING_KEY"
echo "- PAICHART_API_KEY (JWT token for system@paichart.com)"
echo "- SERVER_HOST (<PROD_HOST>)"
echo "- SERVER_USER (root)"
echo "- SSH_PRIVATE_KEY"

# Check deployment workflow
cat .github/workflows/production-deploy.yml | head -50
```

## Phase 1: Multi-Server Architecture Analysis

### Server Discovery Commands
```bash
# Identify all server files
find . -name "*server*" -type f | grep -v node_modules | head -20

# Analyze main server configuration
head -50 server.js
head -50 ws-server.ts  
head -50 mcp-server-v5.js
head -50 dev-server.js

# Check server initialization order
grep -A 20 "initializeServer" lib/server-init.ts

# Find port configurations
grep -r "PORT\|port\|listen" --include="*.js" --include="*.ts" server*.* | head -10
```

### Multi-Server Dependencies
```bash
# Check WebSocket integration
grep -A 10 -B 5 "WebSocket" lib/server-init.ts

# MCP server integration
grep -A 10 -B 5 "MCP" lib/server-init.ts

# Service startup order
grep -n "initialize\|start\|init" lib/server-init.ts
```

## Phase 2: Blue-Green Deployment Architecture

### Blue-Green Deployment Structure
```bash
# Check deployment directory structure
ssh <PROD_USER>@<PROD_HOST> "ls -la /var/www/paichart-app/"

# View current and previous releases
ssh <PROD_USER>@<PROD_HOST> "ls -la /var/www/paichart-app/releases/ | head -10"

# Check active release symlink
ssh <PROD_USER>@<PROD_HOST> "readlink /var/www/paichart-app/current"
ssh <PROD_USER>@<PROD_HOST> "readlink /var/www/paichart-app/previous"

# PM2 process paths
ssh <PROD_USER>@<PROD_HOST> "pm2 describe paichart-mcp | grep 'exec cwd'"
ssh <PROD_USER>@<PROD_HOST> "pm2 describe paichart-web | grep 'exec cwd'"
```

### Deployment Workflow Analysis
```bash
# Check GitHub Actions deployment workflow
cat .github/workflows/production-deploy.yml | grep -A 20 "Blue-Green"

# Health check configuration
grep -A 15 "Health check" .github/workflows/production-deploy.yml

# Rollback procedure
grep -A 30 "Rollback" .github/workflows/production-deploy.yml

# PM2 reload strategy
grep -A 10 "pm2 delete\|pm2 start" .github/workflows/production-deploy.yml
```

### Zero-Downtime Verification
```bash
# Check health check retry logic
grep -A 10 "MAX_RETRIES" .github/workflows/production-deploy.yml

# Verify atomic symlink switching
grep "ln -sf" .github/workflows/production-deploy.yml

# Cleanup strategy for old releases
grep -A 5 "Cleaning up old releases" .github/workflows/production-deploy.yml
```

## Phase 3: Build Process & Scripts Analysis

### Package.json Investigation
```bash
# Analyze all npm scripts
grep -A 30 '"scripts"' package.json

# Find build-related files
find . -name "next.config*" -o -name "tsconfig*" -o -name "webpack*" | grep -v node_modules

# Check TypeScript server configuration
cat tsconfig.server.json

# Analyze Next.js production config
cat next.config.js
```

### Development vs Production Scripts
```bash
# Development server analysis
head -30 dev-server.js

# Production server differences  
head -30 server.js

# Build process investigation
grep -r "build\|compile" --include="package.json"
```

### Critical Build System Issues (From Implementation)
```bash
# CRITICAL: Webpack build system troubleshooting patterns discovered
echo "=== Webpack Build System Issues ==="

# Check for chunk resolution problems
echo "Webpack chunk path resolution:"
find .next/static/chunks -name "*.js" 2>/dev/null | wc -l || echo "❌ No chunks found"

# Module resolution configuration
echo "Next.js webpack module resolution:"
grep -r "webpack" next.config.js -A 10 -B 5

# TypeScript compilation in build process
echo "TypeScript compilation readiness:"
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "(error|Error)" | wc -l

# Build directory health check
echo "Build directory structure:"
ls -la .next/ 2>/dev/null | head -10 || echo "❌ .next directory missing"

echo "=== Clean Build Process ==="
# Clean build procedure for development issues
echo "Clean build commands sequence:"
echo "1. rm -rf .next/"
echo "2. rm -rf node_modules/.cache/"
echo "3. npm run build"
echo "4. npm run dev"

# Development server restart patterns
echo "Development server restart validation:"
ps aux | grep -E "(next|node.*dev)" | grep -v grep | wc -l

# CRITICAL: GitHub Actions OAuth Deployment Issues (2025-09-20)
echo "=== GitHub Actions OAuth Deployment Gotchas ==="
echo "GitHub secret naming restrictions:"
echo "  ❌ GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET blocked by GitHub security"
echo "  ✅ Use PAICHART_GITHUB_CLIENT_ID, PAICHART_GITHUB_CLIENT_SECRET instead"
echo ""
echo "YAML syntax with SSH blocks:"
echo "  ❌ cat << 'EOF' inside SSH execution blocks fails"
echo "  ✅ Use echo commands: echo 'VARIABLE=value' >> .env"
echo ""
echo "Variable escaping in deployment scripts:"
echo "  ❌ echo 'DB_PASSWORD=$DB_PASSWORD' (evaluated by runner)"
echo "  ✅ echo 'DB_PASSWORD=\$DB_PASSWORD' (evaluated on target)"
echo ""
echo "PM2 environment reload requirements:"
echo "  ✅ pm2 reload ecosystem.config.js --update-env"
echo "  Critical: --update-env flag required after .env changes"
echo ""
echo "Production git operations:"
echo "  Check uncommitted: git status --porcelain"
echo "  Handle conflicts: git stash && git pull && git stash pop"
echo "  Directory structure: /var/www/paichart-app/current"
```

## Phase 3: Environment Configuration Management

### Environment Variables Discovery
```bash
# Central configuration analysis
cat lib/config.ts

# Environment template
head -80 .env.example

# Find all process.env usages
grep -r "process\.env" --include="*.ts" --include="*.js" | wc -l
echo "Total environment variable references found"

# Critical environment variables
grep -n "NODE_ENV\|DATABASE_URL\|JWT_\|PORT" lib/config.ts

# OAuth 2.0 environment variables (Plan 9)
echo -e "\n=== OAuth 2.0 Configuration Variables ==="
grep -n "CLIENT_ID\|CLIENT_SECRET\|OAUTH\|APP_BASE_URL" .env.example || echo "OAuth variables not yet in .env.example"

# Rate limiting configuration
grep -A 5 -B 5 "RATE_LIMIT" .env.example
```

### Configuration Dependencies
```bash
# Find configuration imports
grep -r "config" --include="*.ts" lib/ | grep import | head -10

# Environment-specific behavior
grep -r "NODE_ENV.*production\|NODE_ENV.*development" --include="*.ts" --include="*.js" | head -10
```

### Critical Environment Configuration (From Implementation)
```bash
# CRITICAL: Environment configuration patterns discovered during implementation
echo "=== Environment Configuration Issues ==="

# .env.local requirements for MCP server
echo "MCP server environment requirements:"
grep -r "PAICHART_API_KEY\|JWT_SECRET\|MCP_" .env.example -A 2 -B 2

# Environment variable loading patterns
echo "Environment variable loading validation:"
grep -r "process\.env\." lib/config.ts -A 2 -B 2 | head -20

# Critical missing environment variables detection
echo "Missing environment variable patterns:"
grep -r "undefined.*process\.env\|process\.env.*undefined" --include="*.ts" --include="*.js" | head -10

echo "=== Environment-Specific Deployment Issues ==="
# Development vs production environment differences
echo "Development environment requirements:"
grep -r "development.*env\|env.*development" --include="*.ts" --include="*.js" | head -10

# Production environment hardening
echo "Production environment validation:"
grep -r "production.*env\|env.*production" --include="*.ts" --include="*.js" | head -10

# Browser automation environment integration
echo "Browser automation environment dependencies:"
grep -r "browser.*env\|automation.*env" --include="*.ts" --include="*.js" | head -10
```

## Phase 4: Database Migration Strategies

**Default**: `db push` everywhere (development + production) per the drift-elimination pattern. `prisma/migrations/` was deprecated on Dec 15, 2025 — all post-that-date schema work uses `db push` via CI.

**Sanctioned exception**: raw-SQL ops scripts at `scripts/create-*-index.sh` for partial unique indexes, JSONB expression indexes, or `CREATE INDEX CONCURRENTLY` on production-scale tables. Pattern doc: `.claude/knowledge/patterns/sanctioned-db-push-exception-ops-script-pattern.md`.

### Migration Commands Discovery
```bash
# Find migration scripts
ls -la scripts/ | grep -E "(migrate|seed|db)"

# Prisma migration strategy
grep -A 10 -B 5 "migrate" scripts/seed-database.ts

# Database seeding order
grep -n "db:" package.json

# Schema migrations (legacy — pre-Dec 2025)
find prisma/ -name "*.sql" -o -name "migration*" | head -10
```

### Sanctioned DB-Push Exception: Raw-SQL Ops Scripts (NEW — Apr 2026)
```bash
echo "=== DB-PUSH EXCEPTION: OPS-SCRIPT INVENTORY ==="
# These scripts apply schema changes that db push cannot express:
#   - Partial unique indexes
#   - JSONB expression indexes  
#   - CREATE INDEX CONCURRENTLY
# Pattern: .claude/knowledge/patterns/sanctioned-db-push-exception-ops-script-pattern.md

# NOTE: glob is create-*index*.sh (not create-*-index.sh) — the canonical Oct 2025
# P0 batch is create-production-ind*ices*.sh and the narrow glob silently misses it.
ls scripts/create-*index*.sh
echo "Canonical ops-script instances (3 as of 2026-06-15: create-production-indices.sh [Oct 2025 P0 batch, 12 CONCURRENTLY], create-agent-execution-active-unique-index.sh, create-tasks-pipeline-stage-jsonb-index.sh)"

echo "--- Hardening shape check (every script should have all four) ---"
for f in scripts/create-*index*.sh; do
  echo "-- $f --"
  grep -c 'ON_ERROR_STOP=1\|indisvalid\|DROP INDEX CONCURRENTLY\|ANALYZE' "$f" 2>/dev/null
  # Expected: >=4 matches per script (ON_ERROR_STOP + INVALID cleanup drop + indisvalid verify + ANALYZE)
done

echo "--- Prod-verified mechanism ---"
# idx_agent_executions_id_status created Aug 2025 via raw SQL has survived
# 200+ db push --accept-data-loss=false deploys since Dec 2025. Direct proof
# the exception is safe — db push does NOT drop out-of-band raw-SQL indexes.
grep -rn 'idx_agent_executions_id_status\|idx_task_pov_status_assignee' prisma/migrations/ scripts/
```

### Deploy Ordering: Code-First vs Index-First
```bash
echo "=== DEPLOY-ORDERING REFERENCES ==="
# Canonical sequence when shipping ops-script changes:
#   1. Push code (ops script travels with the commit)
#   2. CI deploys via standard db push (ignores raw-SQL indexes empirically)
#   3. SSH prod + run the script, which self-verifies
# See the L3/A6 commits for two recent examples.
grep -rn '§Phase 4\|SSH prod\|Two-phase deploy' cline_docs/reviews/ | head -10
```

### Database Production Patterns
```bash
# Connection pooling configuration
grep -i "pgbouncer\|pool" .env.example

# Database URL patterns
grep -A 5 -B 5 "DATABASE_URL" .env.example
```

### Rollback Window Guidance (CORRECTED — Apr 2026)
```bash
# IMPORTANT CORRECTION from prior guidance:
# The 22:00-00:00 AEST "backup window" often cited refers to local machine
# pg_dump pulls (documented in Phase 9 §AEST Timezone). Those pulls are
# READ-ONLY and DO NOT block DROP INDEX CONCURRENTLY. That window is not a
# blocker for index rollback on raw-SQL partial indexes.
#
# Real blockers for DROP INDEX CONCURRENTLY:
#   - Long-running transactions (wait them out; seconds-long harness execs
#     are typical)
#   - Analytics crons that lock the table (site-specific — check local cron)
grep -n 'backup\|pg_dump\|CONCURRENTLY' .claude/knowledge/discoveries/deployment-discovery.md
```

## Phase 5: Production Readiness & Monitoring

### Health Check Implementation
```bash
# Health endpoint analysis
cat app/api/health/route.ts

# Find monitoring endpoints
find app/api -name "*health*" -o -name "*status*" -o -name "*monitor*"

# Server monitoring patterns
grep -r "uptime\|memory\|health" --include="*.ts" app/api/ | head -5
```

### Error Handling & Recovery
```bash
# Graceful shutdown patterns
grep -r "SIGINT\|SIGTERM\|shutdown\|cleanup" --include="*.ts" | head -10

# Error boundaries
grep -A 5 -B 5 "error\|catch\|Error" lib/server-init.ts

# Service failure handling
grep -A 10 "Failed to initialize" lib/server-init.ts
```

## Phase 6: Server Monitoring & Health Checks

### Pino Structured Logging Discovery (NEW - Feb 2026)
```bash
echo "=== Pino Structured Logging Infrastructure ==="

# Check pino logger configuration
echo "Pino logger module:"
ls -la lib/logger.ts lib/logger.js 2>/dev/null
echo "Domain loggers exported:"
grep -n "export.*Logger" lib/logger.ts | head -10

# Find all domain logger usage across codebase
echo -e "\nDomain logger usage by module:"
for domain in authLogger mcpLogger povLogger taskLogger apiLogger dbLogger complianceLogger monitorLogger; do
  count=$(grep -rn "$domain\." lib/ app/ --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | wc -l)
  echo "  $domain: $count usages"
done

# Regression check for console.log (server-side migration complete Feb 2026)
echo -e "\nLegacy console.log regression check:"
grep -rn "console\.\(log\|warn\|error\)" lib/ app/ --include="*.ts" --include="*.js" | grep -v node_modules | grep -v '.next' | wc -l

# Verify pino output format in PM2
echo -e "\nPM2 log format check (should be JSON):"
# NOTE (2026-08-06): the process is `paichart-web` (and `paichart-mcp`), NOT `paichart`.
# `pm2 logs paichart` emits only a [TAILING] header and zero log lines, so every
# error/warn count below silently returned 0 and read as "clean". Verify names with
# `pm2 ls` before trusting any log-derived count here.
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-web --lines 5 --nostream 2>/dev/null" | head -5
```

**Questions to answer**:
- Is pino configured with all 8 domain loggers?
- Any console.log regressions? (Server-side migration complete — should be zero)
- Is PM2 outputting JSON-formatted pino logs?
- Which domains have the most logger usage?

### Production Pino Log Analysis
```bash
echo "=== Production Pino Log Health ==="

# ⚠️ TWO THINGS THESE COMMANDS GET WRONG IF YOU COPY AN OLDER VERSION (both fixed 2026-08-06,
# both produced an empty result that read as "no errors"):
#   (a) the process is `paichart-web` / `paichart-mcp`, never `paichart`;
#   (b) pm2 PREFIXES every line — `1|paichart | 2026-08-06T00:08:07: {"level":40,...}` — so jq
#       cannot parse it raw. `sed 's/^[^{]*//'` strips everything before the first `{`.
#       Do NOT put `2>/dev/null` on the ssh call: it swallows jq's parse error and turns a
#       broken pipeline into a silent, healthy-looking zero.
# Sanity-check the denominator FIRST — if this is 0, the rest is meaningless:
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-web --lines 500 --nostream 2>/dev/null | wc -l"

# Recent errors across all domains
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-web --lines 500 --nostream 2>/dev/null | grep '\"level\":50' | sed 's/^[^{]*//' | jq -r '[.time, .domain, .msg] | @tsv'" | tail -20

# Error count by domain (last 500 log lines)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-web --lines 500 --nostream 2>/dev/null | grep '\"level\":50' | sed 's/^[^{]*//' | jq -r '.domain' | sort | uniq -c | sort -rn"

# Warning count by domain
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-web --lines 500 --nostream 2>/dev/null | grep '\"level\":40' | sed 's/^[^{]*//' | jq -r '.domain' | sort | uniq -c | sort -rn"

# Repeat for the MCP process — it is a SEPARATE pm2 app with its own logs:
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-mcp --lines 500 --nostream 2>/dev/null | grep -c '\"level\":50'"

# BASELINE 2026-08-06 (paichart-web, 500-line window): 197 lines, 0 errors, 5 warnings
#   3 mcp  "Marked resources from disconnected server as unavailable"
#   2 auth "Team members loaded without userId field — falling back to member.user.id"
# Both are known-benign fallbacks, not faults. A NEW warning string, or any level-50, is the
# finding — compare against this list rather than against zero.

# OAuth audit log status (separate system)
ssh <PROD_USER>@<PROD_HOST> "ls -la /var/log/paichart/oauth-audit.log && wc -l /var/log/paichart/oauth-audit.log" 2>/dev/null
```

**Questions to answer**:
- Are pino JSON logs flowing in production?
- Which domains have the most errors/warnings?
- Is the OAuth audit log (separate from pino) still active?
- Are there any unexpected error patterns post-deployment?

### Production Monitoring
```bash
# Performance monitoring
grep -r "performance\|metrics\|monitor" --include="*.ts" lib/ | head -5

# Logging configuration
grep -A 5 -B 5 "logging\|LOG_" lib/config.ts

# Resource cleanup patterns
grep -r "cleanup\|destroy\|disconnect" --include="*.ts" lib/services/ | head -10
```

### Health Validation
```bash
# Connection health checks
grep -A 10 "checkDatabaseConnection" app/api/health/route.ts

# Service availability checks
grep -r "connected\|ready\|available" --include="*.ts" lib/services/ | head -5
```

### Three-Tier Monitoring Architecture Discovery (UPDATED - 2026-01-24)
```bash
# CRITICAL: Three separate monitoring systems with clean separation
echo "=== Tier 1: Claude Code Health Agent (Production AI Analysis) ==="
ssh <PROD_USER>@<PROD_HOST> "ls -la /opt/claude-code-mcp/scripts/"
ssh <PROD_USER>@<PROD_HOST> "crontab -u claude-ops -l | grep -v '^#'"
ssh <PROD_USER>@<PROD_HOST> "ls -lh /var/log/claude-code-mcp/*.md | tail -5"

# Phase A Enhanced Security Check (NEW - 2026-01-24)
ssh <PROD_USER>@<PROD_HOST> "cat /opt/claude-code-mcp/scripts/security-enhanced-check.sh | head -50"
ssh <PROD_USER>@<PROD_HOST> "cat /var/log/claude-code-mcp/security-enhanced-report-*.md | tail -1 | head -50"

echo -e "\n=== Tier 2: Enterprise Health Monitor (Production Real-Time) ==="
ssh <PROD_USER>@<PROD_HOST> "crontab -l | grep enterprise-health-monitor"
ssh <PROD_USER>@<PROD_HOST> "tail -20 /var/log/paichart-health.log"
# Verify email disabled for security (2026-01-24)
ssh <PROD_USER>@<PROD_HOST> "grep -c 'Email functionality removed' /var/www/paichart-app/current/scripts/enterprise-health-monitor.sh"

echo -e "\n=== Tier 3: Local Disaster Recovery (Daily Email) ==="
ls -la ~/disaster-recovery/scripts/daily-summary.sh
crontab -l | grep daily-summary
tail -20 ~/disaster-recovery/logs/daily-summary.log
# Verify BREVO_API_KEY only on local (not production)
grep -c BREVO_API_KEY ~/disaster-recovery/scripts/send-daily-summary.sh

# Database Health Monitoring (Added 2026-02-12)
echo "Database health monitoring in daily email:"
grep -n "get_db_size\|get_connection_metrics\|get_top_tables" ~/disaster-recovery/scripts/daily-summary.sh | head -5
echo "Metrics: DB size, connections (active/idle/util), top 5 tables, retention compliance"
echo "Thresholds: <1GB green, 1-5GB yellow, >5GB red | Connections <20 green, >50 red"
echo "Remediation: PRODUCTION-HEALTH-AGENT-GUIDE.md Part 9"

# Phase 2 Security Monitoring (Basic - Pre-Phase A)
ssh <PROD_USER>@<PROD_HOST> "ls -la /var/log/jwks-monitor.log /var/log/trust-denials.log"
ssh <PROD_USER>@<PROD_HOST> "crontab -l | grep 'monitor-jwks\|monitor-trust'"
```

### Log Rotation Health (Added 2026-08-06)

**Knowledge**: `infra/logrotate/README.md` — the three configs, their retention, and the two
traps below. `infra/logrotate/*` is the version-controlled source of truth; `/etc/logrotate.d/`
is where it is installed.

Rotation failure is **silent**: a misconfigured logrotate file exits 0 and writes nothing to
any log you would think to check. Two real defects hid here for months (both found 2026-08-06):
six monitor logs that had NEVER rotated since 2025-09-27 (`jwks-monitor.log` reached 108M),
and the OAuth **audit** log kept 14 days instead of its intended 30.

> ⚠️ **These five probes are NOT covered by `scripts/audit-discovery-greps.sh`.** That auditor
> executes local greps only, and every probe here is `ssh`-wrapped against prod — correctly out
> of its scope. So the stated counts are verified by hand (last: 2026-08-06, all five matched),
> not automatically. Re-run them at each quarterly health-run rather than assuming the auditor's
> green covers this section.

```bash
# 1. THE probe — system-wide, NOT per-file. A per-file dry run cannot surface a
#    duplicate-entry skip, because the file that gets skipped is a DIFFERENT file.
ssh <PROD_USER>@<PROD_HOST> "logrotate --debug /etc/logrotate.conf 2>&1 | grep -ci '^error'"
# expect 2 — both lines belong to nginx-mcp-api (a "duplicate log entry" line plus a
# "found error in file ..., skipping" line), which is KNOWN INERT BY CHOICE: it asks for
# rotate 7 and inherits nginx's 14, i.e. more history than intended. See the README.
# Any count above 2 is a finding; inspect with `| grep -i '^error'`.

# 2. THE invariant — no log claimed by two configs. This is the bug class itself: a
#    duplicate path makes logrotate discard the whole offending config, and it hides
#    because a broader glob keeps rotating the file under the wrong policy.
ssh <PROD_USER>@<PROD_HOST> "logrotate --debug /etc/logrotate.conf 2>&1 | \
  awk '/^considering log/{print \$3}' | sort | uniq -d"
# expect zero lines. Any output = two configs fighting over one file.

# 3. Coverage — every app log logrotate actually considers.
ssh <PROD_USER>@<PROD_HOST> "logrotate --debug /etc/logrotate.conf 2>&1 | \
  awk '/^considering log/{print \$3}' | grep -cE 'paichart|jwks|trust-denials|dead-mans|cleanup-demo'"
# expect 14 (6 pm2 + oauth-audit + its /tmp dev-path twin + 6 cron monitor logs).
# A DROP means a log silently lost coverage — the original bug. Re-list without -c to see which.

# 4. Unrotated growth — no app log should be large. The top entries should be OS logs
#    (auth/kern/ufw), not ours.
ssh <PROD_USER>@<PROD_HOST> "ls -lhS /var/log/*.log | head -4"

# 5. Dated daily-summary files are aged out by cron (find -mtime +90, 04:00), not logrotate.
ssh <PROD_USER>@<PROD_HOST> "ls /var/log/paichart-daily-summary-*.log | wc -l"   # expect <= ~95
ssh <PROD_USER>@<PROD_HOST> "crontab -l | grep -c 'daily-summary-.*delete'"      # expect 1
```

**Two traps that make a config look installed and correct while doing nothing** — both cost
real retention here, both written up in `infra/logrotate/README.md`:
- **Missing `su`**: `/var/log` is `root:syslog` 775, and logrotate refuses to rotate inside a
  group-writable directory without an `su` directive — while still exiting 0.
  `/etc/logrotate.d/paichart` never needed it because `/var/log/paichart/` is `root:root` 755.
- **Duplicate path**: probe 2 above. Never add a path already caught by another config's glob;
  narrow the glob instead (that is how the OAuth audit policy was restored).

## Phase 7: Deployment Dependencies & Order

### Service Dependencies
```bash
# Service initialization order
grep -n "await.*initialize\|await.*start" lib/server-init.ts

# Critical startup sequence
grep -A 20 "Initialize all server services" server.js

# Dependency failures
grep -A 10 "catch.*error\|Failed to" lib/server-init.ts
```

### External Dependencies
```bash
# Third-party service integrations
grep -r "API_KEY\|_URL\|_HOST" .env.example | grep -v DATABASE

# External service configurations
grep -A 5 -B 5 "ANTHROPIC\|GEMINI\|SMTP" .env.example
```

## Phase 8: Security & Production Hardening

### Security Configuration
```bash
# Rate limiting analysis
find middleware/ -name "*rate*" -o -name "*throttle*"

# Security headers and configuration
grep -r "secure\|httpOnly\|sameSite" lib/config.ts

# Authentication in production
grep -A 5 -B 5 "JWT.*production\|production.*auth" lib/config.ts
```

### Production Security Patterns
```bash
# Environment-based security
grep -A 10 "NODE_ENV.*production" middleware/ lib/

# CORS and security middleware
grep -r "cors\|security" --include="*.ts" middleware/ | head -5
```

## Phase 9: Disaster Recovery & Business Continuity Assessment (NEW - 2025-09-11)

### Disaster Recovery Infrastructure Discovery
```bash
# CRITICAL: Comprehensive Disaster Recovery System Assessment
echo "=== Disaster Recovery Infrastructure Status (2025-09-11) ==="
echo "DR System Location: /home/steve/disaster-recovery/"
echo "DR Implementation: Complete enterprise-grade disaster recovery toolkit"
echo "Recovery Capabilities: Full system rebuild, automated backups, configuration preservation"

# DR System Verification
echo -e "\n=== DR System Structure Verification ==="
ls -la /home/steve/disaster-recovery/ 2>/dev/null || echo "❌ DR system not found"

echo -e "\nDR Scripts Status:"
ls -la /home/steve/disaster-recovery/scripts/ 2>/dev/null && \
echo "✅ DR scripts directory found" || echo "❌ DR scripts missing"

echo -e "\nDR Documentation Status:"
ls -la /home/steve/disaster-recovery/docs/ 2>/dev/null && \
echo "✅ DR documentation found" || echo "❌ DR documentation missing"

echo -e "\nDR Backup Storage:"
ls -la /home/steve/disaster-recovery/backups/ 2>/dev/null && \
echo "✅ Backup storage configured" || echo "❌ Backup storage missing"
```

### System Inventory & Configuration Backup Discovery
```bash
# System Inventory Assessment
echo -e "\n=== System Inventory & Backup Assessment ==="

echo "System inventory documentation:"
test -f /home/steve/disaster-recovery/docs/system-inventory.md && \
echo "✅ Complete system inventory documented" || echo "❌ System inventory missing"

echo -e "\nConfiguration backup validation:"
test -x /home/steve/disaster-recovery/scripts/backup-configs.sh && \
echo "✅ Configuration backup script executable" || echo "❌ Config backup script issues"

echo -e "\nDatabase backup validation:"
test -x /home/steve/disaster-recovery/scripts/backup-database.sh && \
echo "✅ Database backup script ready" || echo "❌ Database backup script missing"

echo -e "\nAutomated backup system:"
test -x /home/steve/disaster-recovery/scripts/automated-backup.sh && \
echo "✅ Automated backup system configured" || echo "❌ Automated backup missing"
```

### Recovery Procedures & Validation Discovery
```bash
# Recovery Capabilities Assessment
echo -e "\n=== Recovery Procedures & Validation ==="

echo "Full system rebuild capability:"
test -x /home/steve/disaster-recovery/scripts/full-system-rebuild.sh && \
echo "✅ Complete disaster recovery script ready" || echo "❌ System rebuild script missing"

echo -e "\nRecovery validation framework:"
test -x /home/steve/disaster-recovery/scripts/validate-recovery.sh && \
echo "✅ Recovery validation script configured" || echo "❌ Validation script missing"

echo -e "\nAutomated DR setup:"
test -x /home/steve/disaster-recovery/scripts/setup-cron-automation.sh && \
echo "✅ Automated DR scheduling ready" || echo "❌ Automation setup missing"

echo -e "\nQuick-start capability:"
test -x /home/steve/disaster-recovery/quick-start.sh && \
echo "✅ One-click DR activation available" || echo "❌ Quick-start missing"
```

### DR Documentation & Master Recovery Guide Discovery
```bash
# DR Documentation Assessment
echo -e "\n=== DR Documentation & Recovery Procedures ==="

echo "Master recovery guide:"
test -f /home/steve/disaster-recovery/MASTER_RECOVERY_GUIDE.md && \
echo "✅ Master recovery guide available" || echo "❌ Master guide missing"

echo -e "\nDR summary documentation:"
test -f /home/steve/disaster-recovery/DISASTER_RECOVERY_SUMMARY.md && \
echo "✅ DR summary documentation found" || echo "❌ DR summary missing"

echo -e "\nSystem inventory detail:"
test -f /home/steve/disaster-recovery/docs/system-inventory.md && \
head -10 /home/steve/disaster-recovery/docs/system-inventory.md 2>/dev/null && \
echo "✅ Detailed system inventory available" || echo "❌ System inventory incomplete"
```

### Production DR Integration Discovery
```bash
# Production DR Integration Status
echo -e "\n=== Production DR Integration Status ==="

echo "Production server connectivity for DR:"
ssh -o ConnectTimeout=5 <PROD_USER>@<PROD_HOST> "echo '✅ Production server accessible for DR operations'" 2>/dev/null || \
echo "❌ Production server connectivity issues"

echo -e "\nCron automation status check:"
ssh -o ConnectTimeout=5 <PROD_USER>@<PROD_HOST> "crontab -l | grep -c backup" 2>/dev/null || \
echo "0 - No backup automation detected"

echo -e "\nDR validation on production:"
ssh -o ConnectTimeout=5 <PROD_USER>@<PROD_HOST> "test -d /opt/backups && echo '✅ Production backup directory exists' || echo '❌ No backup directory'" 2>/dev/null || \
echo "❌ Cannot verify production backup structure"
```

### DR System Health & Performance Discovery
```bash
# DR System Performance Assessment
echo -e "\n=== DR System Health & Performance ==="

echo "Backup retention policy validation:"
find /home/steve/disaster-recovery/backups/ -type f -name "*.tar.gz" 2>/dev/null | wc -l | \
awk '{print ($1 > 0) ? "✅ " $1 " backup archives found" : "❌ No backup archives"}'

echo -e "\nDR logs and monitoring:"
test -d /home/steve/disaster-recovery/logs/ && \
ls -la /home/steve/disaster-recovery/logs/ 2>/dev/null && \
echo "✅ DR logging system configured" || echo "❌ DR logging missing"

echo -e "\nRecovery time objective assessment:"
grep -r "RTO\|Recovery Time" /home/steve/disaster-recovery/docs/ 2>/dev/null | head -3 || \
echo "❌ RTO documentation needs review"

echo -e "\nBackup verification testing:"
grep -r "validation\|verify\|test" /home/steve/disaster-recovery/scripts/ 2>/dev/null | wc -l | \
awk '{print ($1 > 5) ? "✅ Comprehensive validation framework" : "⚠️ Limited validation - needs enhancement"}'
```

### DR Business Continuity Integration Discovery
```bash
# Business Continuity Framework Assessment
echo -e "\n=== Business Continuity Framework ==="

echo "Emergency response procedures:"
grep -r "emergency\|crisis\|incident" /home/steve/disaster-recovery/docs/ 2>/dev/null | wc -l | \
awk '{print ($1 > 0) ? "✅ Emergency procedures documented" : "❌ Emergency procedures missing"}'

echo -e "\nConfiguration preservation status:"
grep -r "config\|environment\|settings" /home/steve/disaster-recovery/scripts/backup-configs.sh 2>/dev/null | wc -l | \
awk '{print ($1 > 10) ? "✅ Comprehensive configuration backup" : "❌ Limited configuration coverage"}'

echo -e "\nAutomated recovery capabilities:"
grep -r "automated\|automatic\|cron" /home/steve/disaster-recovery/scripts/ 2>/dev/null | wc -l | \
awk '{print ($1 > 5) ? "✅ Extensive automation" : "⚠️ Manual procedures - automation needed"}'

echo -e "\nDR system activation status:"
test -f /home/steve/disaster-recovery/.activated && \
echo "✅ DR system activated and monitoring" || echo "⚠️ DR system ready but not activated"
```

## Phase 10: Docker MCP Services Architecture (NEW - 2026-01-06, Updated 2026-06-15: 7th service)

> **⚠️ COUNT: 7 services as of 2026-06-15** (was 6). Snowflake added at **:3106**
> (`mcp-snowflake`, `services/snowflake-service/`, External OAuth, internal `mcp-internal` network).
> Phase 10 prose below still narrates the original 6 (3100-3105); treat snowflake (:3106)
> as the 7th. Verify live: `grep -c 'container_name: mcp-' docker-compose.yml` → 7.


### CRITICAL: Docker Services Run on PRODUCTION, Not Local

**Docker MCP services are PRODUCTION infrastructure** running on <PROD_HOST>.
Local dev may also run containers for testing, but they are separate instances.

**When checking Docker container health, ALWAYS use SSH to production:**
```bash
# ✅ CORRECT: Check production containers
ssh <PROD_USER>@<PROD_HOST> "docker ps --filter 'name=mcp-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# ❌ WRONG: Checking local containers and reporting as deployment issues
docker ps --filter "name=mcp-"  # This is LOCAL dev only
```

**If containers appear down locally but are healthy on production — that is NOT a deployment issue.**

### Docker Services Discovery Commands
```bash
# CRITICAL: Docker MCP Services Infrastructure Assessment
echo "=== Docker MCP Services Architecture (2026-01-06, Updated 2026-03-10) ==="
echo "Browser Automation Service: Port 3100 (mcp-browser-automation)"
echo "Notification Service: Port 3101 (mcp-notification)"
echo "Weather Service: Port 3102 (mcp-weather)"
echo "EIA Service: Port 3103 (mcp-eia)"
echo "EODHD Service: Port 3104 (mcp-eodhd)"
echo "Test Auth Service: Port 3105 (mcp-test-auth)"
echo "Snowflake Service: Port 3106 (mcp-snowflake) — added 2026, External OAuth"
echo "Transport: MCP SDK 1.17.5 SSEServerTransport"

# Check Docker services directory structure
echo -e "\n=== Docker Services Directory Structure ==="
ls -la services/

# Docker Compose configuration
echo -e "\n=== Docker Compose Configuration ==="
cat docker-compose.yml

# GitHub Actions Docker deployment workflow
echo -e "\n=== Docker Services CI/CD Workflow ==="
cat .github/workflows/docker-services-deploy.yml | head -80
```

### Compliance Policy & Service Call Security Discovery
```bash
# Service call policy analysis
echo -e "\n=== Service Call Policy Configuration ==="
grep -A 20 "APPROVED_TOOLS" lib/mcp/server/config/service-call-policy.js | head -30

echo -e "\nTrusted internal services (bypass localhost restriction):"
grep -A 5 "TRUSTED_INTERNAL_SERVICES" lib/mcp/server/config/service-call-policy.js

echo -e "\nBlocked patterns:"
grep -A 15 "BLOCKED_PATTERNS" lib/mcp/server/config/service-call-policy.js

echo -e "\nBlocked URLs:"
grep -A 10 "BLOCKED_URLS" lib/mcp/server/config/service-call-policy.js

# Service call handler architecture
echo -e "\n=== Service Call Handler Architecture ==="
grep -A 10 "TRUSTED_INTERNAL_SERVICES" lib/mcp/server/tools/hub/service-call-handler.js 2>/dev/null || \
grep -A 20 "validateServiceCall" lib/mcp/server/tools/hub/service-call-handler.js | head -25

# Dynamic whitelisting from registered tools
echo -e "\nDynamic tool whitelisting:"
grep -A 10 "registeredTools" lib/mcp/server/tools/hub/service-call-handler.js

# Connection pooling
echo -e "\nService connection pool:"
grep -A 15 "ServiceConnectionPool" lib/mcp/server/tools/hub/service-call-handler.js | head -20
```

### SSE Transport Implementation Discovery
```bash
# Browser automation service SSE transport
echo -e "\n=== Browser Automation SSE Transport ==="
grep -A 30 "SSEServerTransport" services/browser-automation-service/src/index.ts | head -40

# SSE endpoint configuration
echo -e "\nSSE endpoint:"
grep -A 20 "app.get('/sse'" services/browser-automation-service/src/index.ts

# POST message handler
echo -e "\nMessage handler:"
grep -A 25 "app.post('/message'" services/browser-automation-service/src/index.ts

# Tool registry
echo -e "\nRegistered tools:"
grep -A 50 "const tools" services/browser-automation-service/src/index.ts | head -60

# Health check endpoint
echo -e "\nHealth endpoint:"
grep -A 10 "/health" services/browser-automation-service/src/index.ts
```

### Docker Container Status Discovery (PRODUCTION ONLY)
```bash
# IMPORTANT: Docker containers are production services on <PROD_HOST>
# Do NOT check local Docker status for deployment health — local is dev only

# Check Docker containers on PRODUCTION
echo -e "\n=== Production Docker Container Status (6 services) ==="
ssh <PROD_USER>@<PROD_HOST> "docker ps --filter 'name=mcp-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'" 2>/dev/null || \
echo "SSH to production required for container status"

# Expected: 6 containers, all healthy
# mcp-browser-automation :3100
# mcp-notification       :3101
# mcp-weather            :3102
# mcp-eia                :3103
# mcp-eodhd              :3104
# mcp-test-auth          :3105

# Health check endpoints (via SSH to production)
echo -e "\nService health checks:"
for port in 3100 3101 3102 3103 3104 3105; do
  ssh <PROD_USER>@<PROD_HOST> "curl -sf http://localhost:${port}/health | jq -c '{port: ${port}, status: .status}'" 2>/dev/null || \
  echo "{\"port\": ${port}, \"status\": \"unreachable\"}"
done

# Container logs (if investigating issues)
echo -e "\nRecent container logs (browser-automation example):"
ssh <PROD_USER>@<PROD_HOST> "docker logs mcp-browser-automation --tail 20" 2>/dev/null || \
echo "SSH required for container logs"
```

### MCP Hub Service Registration Discovery
```bash
# Find service seed scripts
echo -e "\n=== Service Registration Scripts ==="
ls -la scripts/seed-*-service.ts 2>/dev/null || echo "No seed scripts found"

# Check MCPTool model for registered services
echo -e "\nMCPTool model schema:"
grep -A 30 "model MCPTool" prisma/schema.prisma

# Service registration in database
echo -e "\nRegistered services query:"
echo "Run: psql -U postgres -d copov15 -c \"SELECT name, status, configuration FROM \\\"MCPTool\\\" WHERE category = 'automation';\""

# === SSRF Gate Discovery (Phase 3 C1, 2026-05-16) ===
# Both register and update paths of MCP `registry` tool now run
# `assertEndpointSafe()` — rejects localhost/RFC-1918/IPv6-loopback/AWS-metadata.
echo -e "\n=== SSRF Gate (assertEndpointSafe) ==="
grep -n "assertEndpointSafe\|SSRF_EXEMPT_SERVICES" \
  lib/mcp/server/tools/hub/hub-utilities.js \
  lib/mcp/server/tools/hub/service-registration-handler.js \
  lib/mcp/server/tools/hub/service-update-handler.js \
  lib/mcp/server/config/service-call-policy.js 2>/dev/null

# Verify seed scripts bypass the gate (use prisma.upsert directly)
echo -e "\nSeed scripts must call prisma.mCPTool.upsert directly (NOT registry.register handler):"
grep -l "prisma.mCPTool.upsert\|prisma.mCPTool.create" scripts/seed-*-service.ts scripts/register-internal-services.ts 2>/dev/null
```

**🚨 OPERATIONAL ESCAPE VALVE — re-registering first-party services**:

If a sysadmin deletes a first-party service and tries to re-register via MCP `registry(action: 'register')` with a localhost endpoint, the gate will **(correctly) reject** it. Use the seed script instead:

```bash
# CORRECT — direct Prisma upsert bypasses the SSRF gate
npx ts-node scripts/seed-snowflake-service.ts
npx ts-node scripts/seed-browser-automation-service.ts
npx ts-node scripts/register-internal-services.ts  # batch internal services

# WRONG — registry.register MCP tool will throw:
# "Endpoint register blocked: Blocked private IPv4: 127.0.0.1"
```

`SSRF_EXEMPT_SERVICES` (`lib/mcp/server/config/service-call-policy.js:161`) is a **seeded list**, not a user-facing self-service path. If a legitimate first-party self-registration use case emerges (e.g., runtime container provisioning), revisit `cline_docs/follow-ups/sec-ops-finding-b-ssrf-asymmetry.md` Decision 1 option (c).

### Expected Docker Services Outputs (PRODUCTION — 6 services)
```
# Docker Compose Services (all run on production <PROD_HOST>, NOT local):
- mcp-browser-automation:
  - Port: 3100
  - Health: /health endpoint
  - SSE: /sse endpoint (GET), /message endpoint (POST)
  - Tools: scrape_page, fill_form, click_element, take_screenshot, generate_pdf, run_script, trace_session

- mcp-notification:
  - Port: 3101
  - Health: /health endpoint
  - Tools: send, broadcast, escalate, schedule

- mcp-weather:
  - Port: 3102
  - Health: /health endpoint
  - Tools: current_weather, forecast, hourly_forecast, air_quality

- mcp-eia:
  - Port: 3103
  - Health: /health endpoint
  - Tools: EIA energy data queries

- mcp-eodhd:
  - Port: 3104
  - Health: /health endpoint
  - Tools: get_eod_data, get_live_quote
  - Note: Requires EODHD_API_TOKEN env var

- mcp-test-auth:
  - Port: 3105
  - Health: /health endpoint
  - Tools: verify_auth (external service auth testing)
  - Note: No API keys needed (reads public JWKS endpoint)

# Compliance Policy:
- TRUSTED_INTERNAL_SERVICES: ['browser-automation-service', 'notification-service', 'weather-service']
- Browser tools whitelisted: scrape_page, fill_form, click_element, take_screenshot, generate_pdf, run_script, trace_session
- Weather tools whitelisted: current_weather, forecast, hourly_forecast, air_quality
- Notification tools whitelisted: send, broadcast, escalate, schedule

# SSE Transport (MCP SDK 1.17.5):
- SSEServerTransport('/message', res)
- transport.start() - Initialize connection
- transport.sessionId - Unique session identifier
- transport.handlePostMessage(req, res) - Route messages to MCP server
```

## Expected Findings Summary

After running this discovery, you should have insights into:

1. **Multi-Server Architecture**: 3 server types (HTTP, WebSocket, MCP) with complex initialization
2. **Build Process**: Next.js with TypeScript, custom webpack configuration
3. **Environment Management**: 19+ critical environment variables, development vs production configs
4. **Database Strategy**: Prisma migrations with pgbouncer pooling and multi-step seeding
5. **Production Readiness**: Health checks, graceful shutdown, error recovery
6. **Deployment Complexity**: Service dependency order, non-blocking service initialization
7. **Monitoring**: Built-in health endpoint, performance metrics, resource cleanup
8. **Security**: Rate limiting, secure configurations, environment-based hardening
9. **Disaster Recovery**: Complete enterprise-grade DR system with automated backups, full system rebuild capabilities, and business continuity framework
10. **Docker MCP Services**: 6 production services (browser-automation, notification, weather, eia, eodhd, test-auth) on <PROD_HOST> — NOT local dev containers

## Discovery Completion Checklist

- [ ] All server files identified and analyzed
- [ ] Build scripts and configuration understood
- [ ] Environment variables catalogued and validated
- [ ] Database migration strategy documented
- [ ] Health check and monitoring patterns identified
- [ ] Production readiness patterns catalogued
- [ ] Service dependencies and startup order mapped
- [ ] Security and hardening configurations reviewed
- [ ] Error handling and recovery mechanisms documented
- [ ] Critical deployment gotchas and patterns identified
- [ ] Disaster recovery system architecture documented
- [ ] Backup strategies and automation scripts validated
- [ ] Recovery procedures and validation frameworks tested
- [ ] Business continuity capabilities assessed
- [ ] Production DR integration status verified
- [ ] Docker MCP services architecture understood (6 PRODUCTION services — check via SSH, not local Docker)
- [ ] Compliance policy and TRUSTED_INTERNAL_SERVICES reviewed
- [ ] SSE transport implementation verified
- [ ] GitHub Actions Docker deployment workflow analyzed

## Current Production Deployment State (2025-09-04)

### **ACTIVE PRODUCTION INFRASTRUCTURE** ✅

**Production Server Status:**
```bash
# SSH Connection Test
ssh <PROD_USER>@<PROD_HOST>
Password: wH3rea1!!M

# Infrastructure Verification
echo "Production server infrastructure status:"
systemctl status postgresql nginx --no-pager
node --version && npm --version
ls -la /var/www/paichart-app/
```

**Deployed Services:**
- ✅ **Ubuntu 24.04 LTS**: 8GB RAM, 50GB SSD at Digital Ocean SFO3
- ✅ **Node.js 18.19.1**: Installed and verified
- ✅ **PostgreSQL 16**: Database `paichart_production` configured  
- ✅ **nginx**: Reverse proxy configured for paichart.app
- ✅ **DNS**: paichart.app → <PROD_HOST> (reserved static IP)
- ✅ **GitHub Actions SSH**: Keys generated and authorized

**Critical Pre-Deployment Gaps:**
```bash
# Missing PM2 Configuration
ls ecosystem.config.js || echo "❌ PM2 ecosystem missing"

# Environment Alignment Check
diff .env.example /var/www/.env.production 2>/dev/null || echo "❌ Production env needs alignment"

# GitHub Actions Workflow Validation
grep -n "mcp-server-v5.js" .github/workflows/production-deploy.yml || echo "❌ Workflow needs server file updates"

# Database Name Alignment
grep -n "copov15" .github/workflows/production-deploy.yml || echo "❌ Database name needs correction"
```

### **GitHub Actions Deployment Requirements**

**Repository Secrets Needed** (⚠️ illustrative subset — the AUTHORITATIVE list is the
`${{ secrets.* }}` heredoc in `.github/workflows/production-deploy.yml`; grep it, don't trust this):
```bash
# Required in GitHub Repository → Settings → Secrets
SSH_PRIVATE_KEY: [From /root/.ssh/github_actions_deploy]
SERVER_HOST: <PROD_HOST>
SERVER_USER: root
DATABASE_URL: postgresql://paichart:ProdSecurePass2025!@localhost:5432/paichart_production
PAICHART_API_KEY: [legacy HS256 JWT — decode-only boot-context seed; does NOT authenticate /mcp since 2026-05-28]
PAICHART_MONITOR_TOKEN: [RS256 token for health monitor /mcp auth — mint via scripts/mint-monitor-token.ts]
JWT_REFRESH_SECRET: [Production security secret]
JWT_PRIVATE_KEY_BASE64 / JWT_PUBLIC_KEY_BASE64 / JWT_KEY_ID: [RS256 signing keys + kid — see JWT_KEY_ROTATION_RUNBOOK.md]
ANTHROPIC_API_KEY: [Production API key]
# RETIRED (do not re-add): JWT_SECRET (2026-06-04), JWT_ACCESS_SECRET (2026-06-06 — no symmetric JWT secret remains)
```

**Pre-Deployment File Creation:**
```bash
# Create PM2 ecosystem configuration
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'paichart-mcp',
      script: 'mcp-server-http-clean.js',
      env: { NODE_ENV: 'production', MCP_HTTP_PORT: 8080 }
    },
    {
      name: 'paichart-web', 
      script: 'server.js',
      env: { NODE_ENV: 'production', PORT: 3000 },
      instances: 2,
      exec_mode: 'cluster'
    }
  ]
};
EOF
```

## Phase 8: Production Security Hardening Assessment (NEW - 2025-09-06)

### Security Hardening Discovery Commands
```bash
# CRITICAL: Production Security Infrastructure Assessment
echo "=== Production Security Hardening Status (2025-09-06) ==="
echo "Production Server: <PROD_HOST> (paichart.app)"
echo "Security Implementation Date: 2025-09-06"
echo "Security Score: 95/100 (Enterprise-Grade)"

# System Security Status
echo -e "\n=== System Security Verification ==="
ssh <PROD_USER>@<PROD_HOST> "echo 'SSH Connection: ✅ Active' && uname -a" || echo "❌ SSH Connection Failed"

echo -e "\nSecurity packages installed:"
ssh <PROD_USER>@<PROD_HOST> "dpkg -l | grep -E '(fail2ban|certbot|unattended-upgrades)' | wc -l" || echo "❌ Cannot verify packages"

echo -e "\nKernel security status:"
ssh <PROD_USER>@<PROD_HOST> "uname -r && echo 'Reboot required:' && ls /var/run/reboot-required 2>/dev/null || echo 'No reboot required'" || echo "❌ Cannot check kernel"

# Network & Firewall Security
echo -e "\n=== Network Security Infrastructure ==="
echo "VPC Firewall Status: ✅ Digital Ocean VPC configured (SSH:22, HTTP:80, HTTPS:443)"

ssh <PROD_USER>@<PROD_HOST> "fail2ban-client status sshd | grep -E '(Currently banned|Total banned)'" || echo "❌ Cannot check fail2ban"

ssh <PROD_USER>@<PROD_HOST> "test -f /etc/fail2ban/jail.local && echo '✅ fail2ban custom config active' || echo '❌ No custom config'" || echo "❌ Cannot verify config"

# SSL/TLS Security
echo -e "\n=== SSL/TLS Certificate Security ==="
ssh <PROD_USER>@<PROD_HOST> "certbot certificates | grep -E '(Certificate Name|Expiry Date)' | head -4" || echo "❌ Cannot check SSL certificates"

curl -I -k -m 5 https://paichart.app/health 2>/dev/null | grep -E '(HTTP/|Strict-Transport|X-Frame)' | head -3 || echo "❌ HTTPS verification failed"

# Web Server Security
echo -e "\n=== Web Server Security Configuration ==="
ssh <PROD_USER>@<PROD_HOST> "nginx -t 2>&1 | grep -E '(ok|successful)'" || echo "❌ nginx config issues"

echo -e "\nSecurity headers implemented:"
curl -I -k -m 5 https://paichart.app/health 2>/dev/null | grep -cE '(Strict-Transport|X-Frame|Content-Security|X-Content-Type)' || echo "0"

ssh <PROD_USER>@<PROD_HOST> "grep -c -E '(server_tokens off|rate_limit|deny)' /etc/nginx/sites-available/paichart.app" || echo "❌ Cannot verify nginx security"

# Database Security
echo -e "\n=== Database Security Status ==="
ssh <PROD_USER>@<PROD_HOST> "systemctl is-active postgresql" || echo "❌ PostgreSQL status unknown"

ssh <PROD_USER>@<PROD_HOST> "PGPASSWORD='[REDACTED]' psql -U paichart -h localhost -d paichart_production -c 'SELECT current_user, version();' | head -2" || echo "❌ Database connection failed"

# Security Monitoring
echo -e "\n=== Security Monitoring Infrastructure ==="
ssh <PROD_USER>@<PROD_HOST> "test -x /usr/local/bin/security-monitor.sh && echo '✅ Security monitoring active' || echo '❌ Security monitor missing'" || echo "❌ Cannot verify monitoring"

ssh <PROD_USER>@<PROD_HOST> "crontab -l | grep -c security-monitor" || echo "❌ Cron job verification failed"

ssh <PROD_USER>@<PROD_HOST> "test -f /var/log/security-monitor.log && echo '✅ Security logs active' && tail -2 /var/log/security-monitor.log || echo '❌ No security logs'" || echo "❌ Cannot check logs"

# Application Security
echo -e "\n=== Application Security Status ==="
ssh <PROD_USER>@<PROD_HOST> "pm2 status | grep -c online" || echo "❌ Cannot check PM2"

ssh <PROD_USER>@<PROD_HOST> "systemctl is-enabled pm2-root 2>/dev/null && echo '✅ PM2 auto-startup enabled' || echo '❌ PM2 startup issue'" || echo "❌ Cannot verify PM2 service"

# Automated Security Updates
echo -e "\n=== Automated Security Maintenance ==="
ssh <PROD_USER>@<PROD_HOST> "systemctl is-active unattended-upgrades" || echo "❌ Auto-updates status unknown"

ssh <PROD_USER>@<PROD_HOST> "test -f /etc/apt/apt.conf.d/20auto-upgrades && echo '✅ Auto-updates configured' || echo '❌ Auto-update config missing'" || echo "❌ Cannot verify config"

# Security Assessment Summary
echo -e "\n=== Production Security Summary ==="
echo "✅ Security Implementation: Complete (2025-09-06)"
echo "✅ Security Score: 95/100 (Enterprise-Grade)"  
echo "✅ SSL Certificates: Active until 2025-12-05"
echo "✅ Intrusion Prevention: fail2ban + VPC firewall"
echo "✅ Security Monitoring: Every 15 minutes"
echo "✅ Automated Updates: Daily at 02:00 UTC"
echo ""
echo "Critical Security Files:"
echo "- /usr/local/bin/security-monitor.sh (monitoring script)"
echo "- /var/log/security-monitor.log (security events)"
echo "- /etc/fail2ban/jail.local (intrusion prevention)"
echo "- /etc/nginx/sites-available/paichart.app (web security)"
echo "- /etc/letsencrypt/live/paichart.app/ (SSL certificates)"
echo "- /root/security-checklist.txt (audit results)"
```

### Security Infrastructure Integration Status

**Production Security Hardening Complete** ✅
- **Implementation Date**: 2025-09-06
- **Security Score**: 95/100 (Enterprise-Grade)
- **Status**: All critical security measures implemented and active

**Security Components Deployed:**
- ✅ **System Security**: Ubuntu 24.04.3 LTS with latest patches, automatic updates
- ✅ **Network Security**: VPC firewall + fail2ban (9 malicious IPs banned)  
- ✅ **SSL/TLS Security**: Let's Encrypt certificates (expires 2025-12-05)
- ✅ **Web Server Security**: nginx hardened with security headers and rate limiting
- ✅ **Database Security**: Dedicated user with appropriate privileges
- ✅ **Application Security**: PM2 with auto-startup and process monitoring
- ✅ **Security Monitoring**: Automated monitoring every 15 minutes with alerting
- ✅ **Automated Maintenance**: Daily security updates with conditional reboot

**Security Integration with Deployment Pipeline:**
- **GitHub Actions**: SSH key-based authentication (ed25519)
- **Environment Security**: Production secrets properly isolated
- **Process Security**: PM2 systemd service with automatic restart
- **Network Security**: All services bound to localhost, nginx reverse proxy
- **Monitoring Integration**: Security events logged and rotated

## Integration Points for Other Specialists

**Handover to dev-ops-specialist with**:
- ✅ Production infrastructure deployed and configured
- ✅ **Security hardening complete (Enterprise-grade)**
- ✅ **SSL certificates automated (90-day lifecycle)**
- ✅ **Network intrusion prevention active**
- ✅ **Three-tier monitoring architecture operational (2026-01-24)**
  - ✅ **Claude Code Health Agent**: AI-powered analysis with Phase A enhanced security
  - ✅ **Enterprise Health Monitor**: Real-time monitoring, email disabled for security
  - ✅ **Local DR Email**: Daily comprehensive reports with 4 attachments
- ✅ **Disaster recovery system implemented (2025-09-11)**
- ✅ **Complete system rebuild automation ready**
- ✅ **Automated backup framework with validation**
- ✅ **Business continuity procedures documented**
- 🔄 GitHub Actions deployment pipeline needs completion
- Multi-server architecture complexity requiring orchestrated deployment
- Production configuration management needs
- Database migration coordination requirements
- Service monitoring and health check implementation
- Environment-specific deployment strategies
- Graceful shutdown and error recovery implementation

**Current Phase**: Security-hardened production infrastructure with enterprise disaster recovery + three-tier monitoring
**Infrastructure Status**: Enterprise-ready with 95/100 security score + comprehensive DR + AI-powered monitoring
**Security Status**: Comprehensive hardening implemented (2025-09-06), Phase A enhanced monitoring (2026-01-24)
**Monitoring Status**: Three-tier architecture (Claude Code AI + Enterprise real-time + Local daily email) - v3.0
**Disaster Recovery Status**: Complete enterprise-grade DR system implemented and enhanced (2025-09-30)
**Next Actions**: Complete GitHub secrets, create PM2 config, execute deployment with DR protection

## Disaster Recovery & Backup System (Updated 2025-09-30)

### DR System Architecture
```bash
# Backup architecture (LOCAL → PRODUCTION)
Local Machine: /home/steve/disaster-recovery/
  ├── backups/           - Stores backups pulled FROM production
  ├── scripts/           - Backup automation and restore scripts
  └── docs/              - Recovery procedures and documentation

Production Server: <PROD_HOST> (paichart.app)
  └── Backup Source      - Data pulled via SSH to local machine

Primary Recovery: DigitalOcean droplet snapshot + incremental DB restore
```

### Critical DR Documentation
```bash
# Emergency guides (start here in disaster)
/home/steve/disaster-recovery/README.md                      - Navigation guide
/home/steve/disaster-recovery/DROPLET_SNAPSHOT_RECOVERY.md   - PRIMARY (5 phases, 30-60 min)
/home/steve/disaster-recovery/QUICK_REFERENCE_CARD.md        - PRINT THIS (emergency commands)
/home/steve/disaster-recovery/RECOVERY_TESTING_CHECKLIST.md  - Quarterly testing

# Discovery prompt for DR system
.claude/knowledge/discoveries/daily-email-report-discovery.md - DR monitoring details
```

### Backup Schedule & Retention (AEST Timezone)
```bash
# Automated via crontab (Australia/Sydney timezone)
22:00 AEST - Configuration backup (30 day retention)
23:00 AEST - Database backup (7 day retention)
00:00 AEST - Application backup (14 day retention)
01:00 AEST - Backup verification
06:00 AEST - Daily summary email with security analysis

# Enhancements implemented (2025-09-30)
- Disk space pre-flight check (75% warn, 90% abort)
- Network retry logic (3 attempts, 30s timeout)
- Lock file mechanism (prevent overlapping backups)
```

### Recovery Time Objectives (RTO)
- Database restore only: 15-30 minutes
- Full droplet + database: 30-60 minutes
- Emergency rollback: 5-10 minutes

### Validation Commands
```bash
# Check backup system health
ls -lht /home/steve/disaster-recovery/backups/database/ | head -5
cd /home/steve/disaster-recovery && ./scripts/validate-recovery.sh

# Test backup integrity
LATEST=$(ls -t /home/steve/disaster-recovery/backups/database/ | head -1)
gunzip -t "/home/steve/disaster-recovery/backups/database/$LATEST/paichart_full_backup.sql.gz"

# Manual backup before risky operations
cd /home/steve/disaster-recovery/scripts
./backup-database.sh "manual_$(date +%Y%m%d_%H%M%S)"
```

### When Disaster Recovery is Needed
- Complete server failure → DROPLET_SNAPSHOT_RECOVERY.md (full guide)
- Database corruption → DROPLET_SNAPSHOT_RECOVERY.md Phase 3 only
- Quick commands → QUICK_REFERENCE_CARD.md
- Testing procedures → RECOVERY_TESTING_CHECKLIST.md

## Post-deploy prose-delivery checks (added 2026-08-04)

```bash
npm run verify:preamble-delivery      # expect: rows clean, code injects
npm run report:template-freshness    # expect 0 STALE
```

⚠️ **`0 STALE` is the expectation only once the manual template seed has been run.** The deploy seeds
**protocols only** (`npm run seed:protocols`, pre-flip so the MCP prompt cache picks it up); it never
writes `agent_templates`. **The seed scripts / ROLE_GUIDANCE_LIBRARY are the SOURCE OF TRUTH and the
template seed is a deliberate MANUAL step run AFTER the deploy lands** (policy, Steve 2026-08-26). So
on a deploy that changed agent guidance, STALE rows immediately afterwards are the PENDING HALF OF A
TWO-STEP DELIVERY, not an incident — remediate, do not escalate:

```bash
npm run report:template-freshness                       # names the STALE roles
grep -rln "defaultRole: '<role>'" scripts/seed-*.ts     # names the OWNING seed script(s) — MAY BE SEVERAL
npx ts-node -r tsconfig-paths/register scripts/<owner>.ts
```
`config_change_author` and `change_reviewer` each have THREE owners (network-provisioning,
terraform-iac, kubernetes-gitops); running one leaves the others stale. The owning script rebuilds the
whole row from source of truth — including `metadata`/`constraints`/`defaultRole`, which the freshness
report does NOT compare, so it is also the only thing that restores those. Never reach for the generic
`seed-agent-templates.ts` to fix a domain role. **`NOT COMPARABLE` rows are not clean — they are
unmeasured**, and counting them as clean is the exact mistake the report exists to prevent.
injection code (post-flip). Between them, agents receive no universal rules; a code rollback past
`05117149` without a re-seed makes that permanent and silent. ⚠️ The CI gate deliberately does **not** roll
back: rolling back is what CREATES the bad state. Do not "improve" it by adding one.
