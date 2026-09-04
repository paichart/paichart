# Permission Matrix

> **Version**: 1.4 | **Updated**: 2026-03-04 | **Session**: Hardening 10-11
> **Source**: 199-route audit + code review + adversarial smoke test (54/56 tests pass, 2 skip)
> **Smoke test**: `/.claude/knowledge/smoke-tests/adversarial-business-logic-smoke-test.md`

## Role Definitions

| Role | Description | Trust Level |
|------|-------------|-------------|
| `USER` | Standard authenticated user. Full access to own POVs and team POVs. | Normal |
| `DEMO_USER` | Read-only demo account. Can view demo POVs only, cannot create or modify real data. | Restricted |
| `ADMIN` | Organization admin. Can manage users, settings, roles, and all POVs. | Elevated |
| `SUPER_ADMIN` | System admin. Full access including system health, JWT management, LLM settings. | Maximum |

## Auth Middleware Summary

| Middleware | Purpose | Used By |
|-----------|---------|---------|
| `getAuthUser(req)` | Extracts + validates JWT. Returns user or null. | All authenticated endpoints |
| `withPOVAccess(handler)` | Wraps route handler. Validates auth + POV ownership/team membership. | All `/api/pov/[povId]/**` routes |
| `validatePOVAccess(user, pov)` | Checks user is POV owner or team member. | MCP handlers, task services, agent endpoints |
| `requireAdmin(user)` | Checks `role === 'ADMIN' \|\| 'SUPER_ADMIN'`. | All `/api/admin/**` routes |
| `requireSuperAdmin(user)` | Checks `role === 'SUPER_ADMIN'`. | JWT status, LLM settings |

## Endpoint Permission Matrix

Legend for **Tested** column:
- `S10` = Smoke-tested in Session 10 (adversarial test confirmed)
- `S11` = Smoke-tested in Session 11 (MCP Hub domain)
- `S11c` = Smoke-tested in Session 11 continuation (Workflow + cross-tenant curl)
- `CR` = Code review verified (guard exists in source)
- ` ` = Not yet tested

### Authentication (`/api/auth/**`)

| Endpoint | Method | USER | DEMO_USER | ADMIN | SUPER_ADMIN | Notes |
|----------|--------|------|-----------|-------|-------------|-------|
| `/auth/login` | POST | Public | Public | Public | Public | Rate limited |
| `/auth/register` | POST | Public | Public | Public | Public | Rate limited |
| `/auth/logout` | POST | Allow | Allow | Allow | Allow | |
| `/auth/refresh` | POST | Allow | Allow | Allow | Allow | |
| `/auth/me` | GET | Allow | Allow | Allow | Allow | Returns own profile |
| `/auth/profile` | PUT | Allow | Allow | Allow | Allow | Update own profile |
| `/auth/revoke` | POST | Allow | Allow | Allow | Allow | Revoke own tokens |
| `/auth/jwks` | GET | Public | Public | Public | Public | Public key endpoint |
| `/auth/verify/[token]` | GET | Public | Public | Public | Public | Email verification |
| `/auth/password-reset/*` | POST | Public | Public | Public | Public | Rate limited |
| `/auth/oauth/*` | GET/POST | Allow | Allow | Allow | Allow | OAuth flows |

### POV Domain (`/api/pov/**`)

| Endpoint | Method | USER | DEMO_USER | ADMIN | SUPER_ADMIN | Guard | Tested |
|----------|--------|------|-----------|-------|-------------|-------|--------|
| `/pov` | GET | Own/Team | Demo only | All | All | getAuthUser | S11c D1 |
| `/pov` | POST | Allow | **Deny** | Allow | Allow | getAuthUser + role check | S10 C1 |
| `/pov/[povId]` | GET | Own/Team | **Deny** | All | All | withPOVAccess | S10 D1, S11c |
| `/pov/[povId]` | PUT | Own/Team | **Deny** | All | All | withPOVAccess | S10 B1-B6, C2 |
| `/pov/[povId]` | DELETE | Owner | **Deny** | Allow | Allow | withPOVAccess | CR |
| `/pov/[povId]/progress` | GET | Own/Team | Demo only | All | All | withPOVAccess | |
| `/pov/[povId]/phase` | POST | Own/Team | **Deny** | All | All | withPOVAccess | CR |
| `/pov/[povId]/phase/[phaseId]` | GET | Own/Team | Demo only | All | All | withPOVAccess | |
| `/pov/[povId]/phase/[phaseId]` | PUT | Own/Team | **Deny** | All | All | withPOVAccess | CR |
| `/pov/[povId]/phase/[phaseId]` | DELETE | Own/Team | **Deny** | All | All | withPOVAccess + active task guard | S10 E1-E2 |
| `/pov/[povId]/phase/reorder` | PUT | Own/Team | **Deny** | All | All | withPOVAccess | CR |
| `/pov/[povId]/phase/[phaseId]/stage` | POST | Own/Team | **Deny** | All | All | withPOVAccess | CR |
| `/pov/[povId]/phase/[phaseId]/stages` | GET | Own/Team | Demo only | All | All | withPOVAccess | |
| `/pov/[povId]/phase/[phaseId]/task` | POST | Own/Team | **Deny** | All | All | withPOVAccess | S10 C4 |
| `/pov/[povId]/phase/[phaseId]/task/[taskId]` | GET | Own/Team | Demo only | All | All | withPOVAccess | |
| `/pov/[povId]/phase/[phaseId]/task/[taskId]` | PUT | Own/Team | **Deny** | All | All | withPOVAccess | CR |
| `/pov/[povId]/phase/[phaseId]/task/[taskId]` | DELETE | Own/Team | **Deny** | All | All | withPOVAccess | CR |
| `/pov/[povId]/phase/[phaseId]/task/reorder` | PUT | Own/Team | **Deny** | All | All | withPOVAccess | CR |
| `/pov/[povId]/team/members` | GET | Own/Team | Demo only | All | All | withPOVAccess | |
| `/pov/[povId]/team/members` | POST | Own/Team | **Deny** | All | All | withPOVAccess | S10 C3 |
| `/pov/[povId]/team/members/[memberId]` | DELETE | Own/Team | **Deny** | All | All | withPOVAccess + self-removal guard + owner guard | S10 F3 (CR) |

### Task Domain (`/api/tasks/**`)

| Endpoint | Method | USER | DEMO_USER | ADMIN | SUPER_ADMIN | Guard | Tested |
|----------|--------|------|-----------|-------|-------------|-------|--------|
| `/tasks` | GET | Own/Team | Demo only | All | All | getAuthUser | S11c |
| `/tasks` | POST | POV member | **Deny** | All | All | getAuthUser + validatePOVAccess | S10 C4b |
| `/tasks/[taskId]` | GET | POV member | Demo only | All | All | getAuthUser + POV check | |
| `/tasks/[taskId]` | PUT | POV member | **Deny** | All | All | getAuthUser + POV check | S10 D2b |
| `/tasks/[taskId]` | DELETE | POV member | **Deny** | All | All | getAuthUser + POV check | CR |
| `/tasks/[taskId]/status` | PATCH | POV member | **Deny** | All | All | validatePOVAccess + transition validation | S10 A1-A8, D2 |
| `/tasks/[taskId]/agent` | GET | POV member | **Deny** | All | All | validatePOVAccess (fixed S10) | S10 C5b |
| `/tasks/[taskId]/agent` | POST | POV member | **Deny** | All | All | validatePOVAccess (fixed S10) | S10 C5c |
| `/tasks/[taskId]/agent/execute` | POST | POV member | **Deny** | All | All | validatePOVAccess (fixed S10) | S10 C5 |
| `/tasks/[taskId]/dependencies` | GET/POST | POV member | Demo only/Deny | All | All | getAuthUser + POV check | CR |
| `/tasks/[taskId]/activities` | GET | POV member | Demo only | All | All | getAuthUser | |
| `/tasks/[taskId]/attachments` | GET/POST | POV member | Demo only/Deny | All | All | getAuthUser + POV check | CR |
| `/tasks/search` | GET | Own/Team | Demo only | All | All | getAuthUser | |
| `/tasks/bulk/*` | POST | POV member | **Deny** | All | All | getAuthUser + POV check | CR |

### Admin Domain (`/api/admin/**`)

| Endpoint | Method | USER | DEMO_USER | ADMIN | SUPER_ADMIN | Guard | Tested |
|----------|--------|------|-----------|-------|-------------|-------|--------|
| `/admin/users` | GET | **Deny** | **Deny** | Allow | Allow | requireAdmin | S10 C6, S11c |
| `/admin/roles` | GET/POST | **Deny** | **Deny** | Allow | Allow | requireAdmin | CR |
| `/admin/roles/[roleId]` | PUT/DELETE | **Deny** | **Deny** | Allow | Allow | requireAdmin | CR |
| `/admin/permissions` | GET | **Deny** | **Deny** | Allow | Allow | requireAdmin | CR |
| `/admin/settings` | GET/PUT | **Deny** | **Deny** | Allow | Allow | requireAdmin | CR |
| `/admin/settings/llm` | GET/PUT | **Deny** | **Deny** | **Deny** | Allow | requireSuperAdmin | CR |
| `/admin/jwt-status` | GET | **Deny** | **Deny** | **Deny** | Allow | requireSuperAdmin | CR |
| `/admin/audit` | GET | **Deny** | **Deny** | Allow | Allow | requireAdmin | CR |
| `/admin/crm/*` | GET/POST/PUT | **Deny** | **Deny** | Allow | Allow | requireAdmin | CR |
| `/admin/cleanup/artifacts` | POST | **Deny** | **Deny** | Allow | Allow | requireAdmin | CR |
| `/admin/event-system/status` | GET | **Deny** | **Deny** | Allow | Allow | requireAdmin | CR |

### Analytics & Dashboard (`/api/analytics/**`, `/api/dashboard/**`)

| Endpoint | Method | USER | DEMO_USER | ADMIN | SUPER_ADMIN | Guard | Tested |
|----------|--------|------|-----------|-------|-------------|-------|--------|
| `/analytics` | GET | Own/Team | Demo only | All | All | getAuthUser | S10 D5 |
| `/analytics/overview` | GET | Own/Team | Demo only | All | All | getAuthUser | |
| `/dashboard` | GET | Own/Team | Demo only | All | All | getAuthUser | |
| `/dashboard/pov-overview` | GET | Own/Team | Demo only | All | All | getAuthUser | |
| `/dashboard/team-activity` | GET | Own/Team | Demo only | All | All | getAuthUser | |
| `/dashboard/team-activity/export` | GET | Own/Team | **Deny** | All | All | getAuthUser + rate limited | CR |

### MCP Domain (`/api/mcp/**`)

| Endpoint | Method | USER | DEMO_USER | ADMIN | SUPER_ADMIN | Guard | Tested |
|----------|--------|------|-----------|-------|-------------|-------|--------|
| `/mcp/tasks/action` | POST | POV member | **Deny** | All | All | API key/JWT + validatePOVAccess | S10 A1-A8, F2 |
| `/mcp/tasks/context` | GET | POV member | Demo only | All | All | API key/JWT | |

### Agent & Templates

| Endpoint | Method | USER | DEMO_USER | ADMIN | SUPER_ADMIN | Guard | Tested |
|----------|--------|------|-----------|-------|-------------|-------|--------|
| `/agent-templates` | GET | Allow | Allow | Allow | Allow | getAuthUser | |
| `/agent-templates/[id]` | GET | Allow | Allow | Allow | Allow | getAuthUser | |
| `/agent-templates/[id]/apply` | POST | POV member | **Deny** | All | All | getAuthUser + POV check | CR |
| `/agent-executions` | GET | Own/Team | Demo only | All | All | getAuthUser | |
| `/artifacts/[id]/download` | GET | POV member | Demo only | All | All | getAuthUser + ownership check | |

### Infrastructure (Public)

| Endpoint | Method | Auth Required | Notes |
|----------|--------|---------------|-------|
| `/health` | GET | No | Health check |
| `/health/db` | GET | No | Database health |

## MCP Tool Permissions (MCP Server v5)

MCP tools route through `/api/mcp/tasks/action` with JWT/API key auth. Each tool has additional business logic guards:

| MCP Tool | POV Access | Role Check | Additional Guards |
|----------|-----------|------------|-------------------|
| `project(action: "task.list")` | Scoped to user's POVs | Any auth'd | |
| `project(action: "pov.list")` | Scoped to user's POVs | Any auth'd | |
| `project(action: "pov.details")` | validatePOVAccess | Any auth'd | |
| `project(action: "task.context")` | validatePOVAccess | Any auth'd | |
| `perform(action: "execute")` | | | Per-action (see below) |
| `search` | Scoped to user's POVs | Any auth'd | |

### MCP Action-Level Guards

| Action | POV Access | Additional Guards | Tested |
|--------|-----------|-------------------|--------|
| `task.create` | validatePOVAccess | povId required | S10 |
| `task.update` | validatePOVAccess | Status transition validation | S10 A1-A8 |
| `task.complete` | validatePOVAccess | Status transition validation | S10 F2 |
| `task.assign` | validatePOVAccess | Assignee existence check | CR |
| `task.comment` | validatePOVAccess | | CR |
| `stage.create` | validatePOVAccess | | CR |
| `pov.create` | N/A (new POV) | ADMIN role required | S10 |
| `agent.assign` | validatePOVAccess | Template existence check | CR |
| `agent.execute` | validatePOVAccess | Agent configured check | CR |
| `agent.configure` | validatePOVAccess | | CR |
| `agent.status` | validatePOVAccess | | CR |
| `agent.results` | validatePOVAccess | | CR |

## State Transition Rules

### Task Status Transitions (Enforced in code — Session 10, smoke-tested)

```
OPEN → IN_PROGRESS    ✅ (start work)           — tested A5
OPEN → BLOCKED        ✅ (blocked before start)  — tested (setup)
IN_PROGRESS → COMPLETED  ✅ (finish work)        — tested A6
IN_PROGRESS → BLOCKED    ✅ (encountered blocker) — tested A7
BLOCKED → IN_PROGRESS    ✅ (unblock)             — tested A8
COMPLETED → *            ❌ (terminal)            — tested A2, A3, F2
OPEN → COMPLETED         ❌ (must go via WIP)     — tested A1
BLOCKED → COMPLETED      ❌ (must unblock first)  — tested A4
COMPLETED → IN_PROGRESS  ❌ (no rollback)         — tested A2
```

### POV Status Transitions (Enforced in StatusTransitionService, smoke-tested)

```
PROJECTED → IN_PROGRESS   ✅ (requires ≥1 phase)         — tested B5
IN_PROGRESS → VALIDATION  ✅ (requires all tasks done)    — CR
IN_PROGRESS → STALLED     ✅ (requires ≥1 BLOCKED task)   — tested B6
VALIDATION → WON          ✅ (KPI check — placeholder)    — CR
VALIDATION → LOST         ✅ (business decision)           — CR
WON → *                   ❌ (terminal)                    — CR (no test data)
LOST → *                  ❌ (terminal)                    — CR (no test data)
PROJECTED → WON           ❌ (must go through stages)      — tested B1
IN_PROGRESS → WON         ❌ (must go through VALIDATION)  — tested B2
```

### Phase Deletion Rules (Enforced in route — Session 10, smoke-tested)

```
Phase with IN_PROGRESS tasks  → ❌ Blocked (400 error)  — tested E1
Phase with BLOCKED tasks       → ❌ Blocked (400 error)  — tested E1b
Phase with OPEN tasks only     → ✅ Allowed (cascade)    — CR
Phase with COMPLETED tasks     → ✅ Allowed (work done)  — CR
Phase with no tasks            → ✅ Allowed              — tested E2
```

## DEMO_USER Restrictions (All smoke-tested S10 C1-C6)

DEMO_USER accounts are restricted to:
- **Read-only** access to demo POVs (POVs marked with demo metadata)
- **No creation** of POVs, tasks, phases, or stages — tested C1, C4
- **No modification** of any data — tested C2, C3
- **No admin access** — tested C6
- **No agent execution** — tested C5 (bug found and fixed!)
- **No agent configuration read/write** — tested C5b, C5c
- **No export** operations

## Cross-POV Access Control (Smoke-tested S10 D1-D5)

All POV-scoped operations enforce:
1. **Ownership check**: User is the POV owner, OR
2. **Team membership**: User is a member of the POV's team, OR
3. **Admin override**: User has ADMIN or SUPER_ADMIN role

Violations return 403 Forbidden. No data leakage — denied requests return generic error messages.

**Tested**: DEMO_USER denied on POV read (D1), task modify (D2), task update (D2b), analytics (D5).
**Gap**: Not yet tested with regular USER (non-admin, non-demo) against another USER's POV.

## MCP Hub Service Permissions (Smoke-tested S11)

Hub tools route through MCP Server v5 with JWT/API key auth. Ownership stored in `configuration.ownerId`.

| MCP Hub Tool | Auth Required | Ownership Check | Additional Guards | Tested |
|-------------|--------------|-----------------|-------------------|--------|
| `registry(action: "register")` | Yes | N/A (creates new) | Rate limit (50/day), quota (10/user), Zod validation, approval policy | S11 H1-H7 |
| `services(action: "discover")` | Yes | N/A (read) | Pagination, `_canCall` hints | S11 |
| `services(action: "call")` | Yes | publicAccess OR owner OR admin | Compliance policy, SSRF check, rate limit | S11 I2-I4 |
| `registry(action: "update")` | Yes | Owner OR admin | Field-leakage prevention (strips ownerId/id), SSRF on endpoint | S11 G3-G5 |
| `registry(action: "delete")` | Yes | Owner OR admin | Confirmation required, cascade MCPInteraction/Recommendation | S11 (cleanup) |
| `registry(action: "list")` | Yes | Scoped to `ownerId == userId` | | S11 G7 |
| `services(action: "health")` | Yes | VIEW permission | SSRF check on health endpoint | S11 |
| `registry(action: "tools")` | No (public) | N/A | | S11 |

### Hub Approval Policy

| Risk Level | Action | Tested |
|-----------|--------|--------|
| No risks | AUTO_APPROVE → ACTIVE | S11 H6 |
| Medium risks | AUTO_APPROVE_WITH_MONITORING → ACTIVE + 7-day tracking | S11 H3 |
| High risks | MANUAL_REVIEW → INACTIVE + PENDING_APPROVAL | CR |
| Critical (localhost, metadata) | REJECT → INACTIVE + PENDING_APPROVAL | S11 H1, H2 |
| Trusted internal service | Bypass all checks → ACTIVE | CR |

## MCP Workflow Permissions (Smoke-tested S11c)

Workflow tools route through MCP Server v5. Per-step access re-validation prevents privilege escalation through service chaining.

| MCP Workflow Tool | Auth Required | Ownership Check | Additional Guards | Tested |
|------------------|--------------|-----------------|-------------------|--------|
| `services(action: "workflow.execute")` | Yes | Per-step service access (public/owner/admin) | Compliance policy per step, SSRF check, rate limit, max 20 steps, trust-level token exposure | S11c W4, W5 |
| `services(action: "workflow.cancel")` | Yes | userId match OR admin | CUID format validation on executionId | S11c W1, W2 |
| `services(action: "workflow.status")` | Yes | userId match OR admin | | |
| `services(action: "workflow.list")` | Yes | Non-admin: own only; Admin: all | Pagination (max 100) | S11c W3 |

**Key security property**: Each step in a workflow independently validates service access via `createServiceCaller()`. A workflow cannot chain calls to services the user cannot individually access.

## Audit Trail

### Bugs Found by Smoke Testing

| Test | Finding | Severity | Fix |
|------|---------|----------|-----|
| C5 | `/tasks/[taskId]/agent/execute` missing validatePOVAccess | **HIGH** | Fixed `dd88d2d1` — any auth'd user could trigger agent execution |
| C5b | `/tasks/[taskId]/agent` GET missing validatePOVAccess | **HIGH** | Fixed `dd88d2d1` — any auth'd user could read agent config |
| C5c | `/tasks/[taskId]/agent` POST missing validatePOVAccess | **HIGH** | Fixed `dd88d2d1` — any auth'd user could configure agents |
| G5 | `registry(action: "update")` response reported stripped `ownerId` in updatedFields | **LOW** | Fixed — use `safeUpdates` keys instead of raw `args.updates` |
| — | Zod validation import fallback silently passed all inputs | **MEDIUM** | Hardened — fallback now applies basic XSS/SSRF sanitization |

### Test Coverage Summary

**Session 10 (POV/Task/Phase domain):**
- 27 tests passed, 4 skipped, 1 FAIL→FIXED
- 1 HIGH severity bug class (3 agent endpoints)

**Session 11 (MCP Hub domain):**
- 12 tests passed, 6 skipped, 1 FAIL→FIXED
- 1 LOW severity bug (response info leak)
- 1 MEDIUM severity hardening (validation fallback)

**Session 11 continuation (Workflow + Cross-Tenant curl):**
- 11 tests passed, 0 failed, 4 N/A (Hub is MCP-only, not REST)
- Validated: withPOVAccess, admin role check, task scoping, workflow cancel/list, SQL injection prevention
- DEMO_USER confirmed isolated: empty POV list, 0 admin POV references in tasks

**Session 11 ChatGPT MCP tests (DEMO_USER via ChatGPT):**
- 4 tests passed (G1/G2/G6/H8), 0 failed
- Ownership boundary validated: `ownerFilter` returns NOT_FOUND for non-owned services
- DEMO_USER can register services (ownership correctly assigned)

**Combined:**
- **54 tests passed** out of 56 designed
- **2 tests skipped** (need private service + non-owner combo)
- **2 bugs found and fixed**, 1 hardening applied
- **0 regressions** introduced
