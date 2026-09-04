# Scripts Directory

**Last Updated**: November 4, 2025

---

## 🔧 Validation Toolkit Scripts (Claude)

Created Nov 3-4, 2025 as part of **endpoint-security-fix-toolkit**

**Core Toolkit Scripts**:
- **discover-validation-schemas.js** - Find existing validation schemas for any domain
  - Usage: `npm run discover:schemas [domain]`
  - Time: < 1 second
  - Finds all 78 schemas, suggests imports

- **validate-schema-prisma-parity.js** - Check Zod schemas match Prisma models
  - Usage: `npm run validate:schema-parity`
  - Time: ~5 seconds
  - Runs 7,510 automated checks
  - Catches enum drift, UUID/CUID mismatches

- **validate-id-formats.js** - Enforce CUID usage (no UUID)
  - Usage: `npm run validate:id-format`
  - Checks: All validation files for .uuid() usage
  - Prevents: UUID/CUID confusion bugs

- **test-form-field-patterns.js** - Test form field validation helpers
  - Usage: `npm run test:form-patterns`
  - Tests: 28 tests (null/undefined handling)
  - No Jest required (Node's built-in assert)

- **test-enum-parity.js** - Test Prisma enum alignment
  - Usage: `npm run test:enum-parity`
  - Tests: 25 tests (bidirectional parity)
  - Prevents: Enum drift bugs (URGENT, BLOCKED)

**Complete Test Suite**:
```bash
npm run test:all-validation
# Runs: 78 total tests (form + enum + ID + parity)
```

**See**: `.claude/knowledge/toolkits/endpoint-security-fix-toolkit.md`

---

## 🚀 Production Scripts

**Deployment**:
- **enterprise-deploy.sh** - Production deployment automation
- **pm2-zero-downtime-reload.sh** - Zero-downtime service restart
- **regenerate-prisma-production.sh** - Regenerate Prisma client in production

**Monitoring**:
- **enterprise-health-monitor.sh** - Health monitoring (runs every 15 min)
- **send-health-email.js** - Daily health report emails
- **monitor-email-delivery.sh** - Email delivery monitoring
- **monitor-oauth-logs.sh** - OAuth authentication monitoring

**Services**:
- **start-mcp-hub.sh** - Start MCP Hub service

---

## 🛠️ Development Scripts

**Code Quality**:
- **check-naming.mjs** - Component naming convention validation
- **validate-api-schemas.ts** - API response schema validation

**Testing**:
- **test-health-email.sh** - Test health monitoring emails
- **test-mcp-security-manual.sh** - Manual MCP security testing
- **test-mcp-security-production.sh** - Production MCP security testing
- **test-infrastructure-p1-production.sh** - Infrastructure testing
- **test-db-password-extraction.sh** - Database password validation
- **test-mcp-validations.ts** - MCP validation testing

---

## 🗄️ Database & Setup Scripts

**User Management**:
- **create-admin-user.ts** - Create admin user
- **create-super-admin.ts** - Create super admin (development)
- **create-super-admin-production.ts** - Create super admin (production)
- **seed-users.ts** - Seed initial user data

**Data Seeding**:
- **seed-database.ts** - General database seeding
- **seed-agent-templates.ts** - Seed agent template library
- **seed-geographical-data.js** - Seed geographical data (countries, regions)
- **populate-phase-templates-improved.ts** - Populate phase templates

**Setup**:
- **setup-demo-mode.ts** - Configure demo mode
- **setup-permissions.ts** - Setup RBAC permissions
- **create-vendor-povs.ts** - Create vendor POV data

**Utilities**:
- **generate-test-tokens.js** - Generate test tokens
- **mint-monitor-token.ts** - Mint long-lived RS256 first-party MCP token (replaces the deleted HS256 minters `generate-demo-jwt.js` / `generate-system-token.js`, removed 2026-06-11 after JWT_ACCESS_SECRET retirement)
- **init-llm-settings.js** - Initialize LLM settings
- **connect-browser-use-server.js** - Browser automation setup

---

## 📁 Archive Directory

**Location**: `scripts/archive/`

Contains organized subdirectories for older/deprecated scripts:
- `audit/` - Old audit scripts
- `auth-utils/` - Legacy auth utilities
- `demos/` - Demo scripts
- `docs/` - Documentation generation
- `mcp-tools/` - MCP tool utilities
- `migrations/` - Old migration scripts
- `setup/` - Legacy setup scripts
- `testing/` - Old test scripts

---

## 🎯 Quick Reference

**Validation Commands** (Nov 3-4 Toolkit):
```bash
npm run discover:schemas [domain]       # Find schemas
npm run validate:schema-parity          # Check Prisma alignment
npm run validate:id-format              # Check CUID usage
npm run test:form-patterns              # Test form helpers (28 tests)
npm run test:enum-parity                # Test enum alignment (25 tests)
npm run test:all-validation             # All tests (78 total)
```

**Production Commands**:
```bash
./scripts/enterprise-deploy.sh          # Deploy to production
./scripts/enterprise-health-monitor.sh  # Run health check
./scripts/pm2-zero-downtime-reload.sh   # Reload services
```

**Development Commands**:
```bash
npm run check-naming                    # Check component names
npm run validate:schemas                # Validate API schemas
```

**Database Commands** (via package.json):
```bash
npm run db:seed                         # Seed database
npm run db:admin                        # Create admin user
npm run db:users                        # Seed users
npm run db:templates                    # Populate templates
npm run db:agents                       # Seed agent templates
npm run db:permissions                  # Setup permissions
npm run setup-demo-mode                 # Configure demo
```

---

## 📚 Related Documentation

**Toolkit System**:
- Protocol: `.claude/knowledge/protocols/endpoint-security-audit-protocol.md`
- Discovery: `.claude/knowledge/discoveries/endpoint-security-audit.md`
- Toolkit: `.claude/knowledge/toolkits/endpoint-security-fix-toolkit.md`
- Batch Guide: `.claude/knowledge/patterns/batch-endpoint-remediation-guide.md`
- Checklist: `.claude/knowledge/templates/endpoint-security-fix-checklist.md`

**Main Documentation**: `CLAUDE.md` (4-layer system: Protocols/Discovery/Specialists/Toolkits)

---

**Directory Status**: ✅ Well-organized (25 active scripts, archive/ for old scripts)
**Validation Scripts**: ✅ Clearly identified (5 toolkit scripts)
**Documentation**: ✅ Complete (this README)
